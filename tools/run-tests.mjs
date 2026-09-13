#!/usr/bin/env node
/**
 * runstate v2 自动化测试（卡 C1 + 补卡 C1b，零依赖；由 docs/evidence/runstate-cli/tests/run-tests.mjs 升格）
 *
 * 覆盖：两级预算（Run / Mission）、advance 组合语义与原子拒绝、check/status/resume/gate、
 *       new-run（Run 边界机械续跑：Run 级四项归零 + Mission Run +1，Mission Run 触顶则拒绝）、
 *       F1 状态完整性加固（整文件写前校验：触顶后一律拒写 / 非法文件拒写 / 重复标签 / 必需项缺失 /
 *       数值越界；new-run 的 == 允许 vs > 拒绝 vs Mission >= 拒绝；向后兼容边界）、
 *       F2 机械见证（## Budget 8 条 Run 级计数行；workset/workers/research/depth 四个新别名；
 *       5 条上限任一触顶即整体拒绝；缺新行的旧文件 check exit 0 + 警告；gate 在 WorkSet 触顶时 DENY；
 *       中英文档与 CLI 标签的逐字对照）。
 *
 * 设计要点：
 *   - 只用 node: 内置模块；通过 child_process 调本仓 tools/runstate.js（只看黑盒行为，不依赖内部实现）。
 *   - 全部用例在系统临时目录（os.tmpdir() 下新建目录）内运行，结束自行清理；
 *     绝不读写项目根 / docs 下的任何文件（用例 ⑬ 与附加守卫专门比对它们前后哈希）。
 *   - 逐条打印 PASS/FAIL/SKIP，结束打印用例总数、通过数、跳过数与失败数；全绿 exit 0，任一失败 exit 1。
 *   - 条件跳过：前置条件不成立（如"项目根若存在 RUN_STATE.md"）的用例打印 SKIP，
 *     **不计入通过数**（现状修正：以前是静默算 PASS）。通过 + 跳过 + 失败必须等于用例总数。
 *   - 失败路径自检（两个独立注入点，落在不同用例上）：
 *       RS_TEST_FORCE_FAIL=1  注入用例 ②（合法骨架 check 的退出码）
 *       RS_TEST_FORCE_FAIL=2  注入用例 ⑨（gate 拒绝时的 JSON.allow）
 *     用来证明"失败会被如实上报、退出码非 0"。
 *
 * 用法：
 *   node tools/run-tests.mjs                        正常跑，期望全绿 exit 0（跳过项打印 SKIP）
 *   RS_TEST_FORCE_FAIL=1 node tools/run-tests.mjs   失败注入点 1（用例 ②），期望 FAIL 且 exit 1
 *   RS_TEST_FORCE_FAIL=2 node tools/run-tests.mjs   失败注入点 2（用例 ⑨），期望 FAIL 且 exit 1
 */
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PROJECT_ROOT, 'tools', 'runstate.js');
const STATE_FILE = 'RUN_STATE.md';

/**
 * 失败注入开关（两个独立注入点，落在不同用例上）：
 *   '1' → 用例 ②：把「合法骨架 check」的期望退出码写成 1（与真实行为 0 不符）；
 *   '2' → 用例 ⑨：把「gate 拒绝时」的期望 JSON.allow 写成 true（与真实行为 false 不符）。
 */
const FORCE_FAIL = process.env.RS_TEST_FORCE_FAIL === '1';
const FORCE_FAIL_GATE = process.env.RS_TEST_FORCE_FAIL === '2';

/** 项目根状态文件（存在时只读一次哈希做基线，全程不该被本脚本改动）。 */
const ROOT_STATE = path.join(PROJECT_ROOT, STATE_FILE);
const rootHashBefore = fs.existsSync(ROOT_STATE) ? sha256(ROOT_STATE) : null;

/** 样板文件基线：docs/** 属禁改区，测试只能读、不能写。 */
const EVIDENCE_STATE = path.join(PROJECT_ROOT, 'docs', 'evidence', 'runstate-cli', STATE_FILE);
const evidenceHashBefore = fs.existsSync(EVIDENCE_STATE) ? sha256(EVIDENCE_STATE) : null;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

const tmpBase = fs.realpathSync(os.tmpdir());
const tmpRoot = fs.mkdtempSync(path.join(tmpBase, 'runstate-v2-tests-'));

/** 调本仓 CLI；cwd 固定为临时目录，避免任何相对路径落到项目根。 */
function runCli(args) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpRoot, encoding: 'utf8' });
  if (res.error) throw new Error(`无法启动 CLI（${process.execPath}）：${res.error.message}`);
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}：期望 ${expected}，实际 ${actual}`);
}

let dirSeq = 0;
/** 每次调用建一个独立子目录，用例之间互不干扰。 */
function newDir(label) {
  dirSeq += 1;
  const dir = path.join(tmpRoot, `${String(dirSeq).padStart(2, '0')}-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statePath(dir) {
  return path.join(dir, STATE_FILE);
}

function readState(dir) {
  return fs.readFileSync(statePath(dir), 'utf8');
}

function writeState(dir, text) {
  fs.writeFileSync(statePath(dir), text, 'utf8');
}

/** init 出一个可用目录。 */
function initDir(label) {
  const dir = newDir(label);
  assertEq(runCli(['init', dir]).status, 0, 'init 退出码');
  return dir;
}

/** 取某节里某计数行的原文（找不到即视为断言失败）。 */
function counterLine(dir, label) {
  const line = readState(dir)
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`- ${label}:`));
  if (line === undefined) throw new Error(`状态文件里找不到计数行 "- ${label}: …"`);
  return line.trim();
}

/** 把某节里某计数行的「上限」直接改成给定整数字面量（测试专用，模拟额度被调小）。 */
function setLimit(dir, label, value) {
  const text = readState(dir);
  const re = new RegExp(`^(-\\s*${label}:\\s*\\d+\\s*/\\s*)\\d+`, 'm');
  if (!re.test(text)) throw new Error(`状态文件里找不到带上限的计数行 "- ${label}: <n> / <m>"`);
  writeState(dir, text.replace(re, `$1${value}`));
}

/** 取某个二级标题节的正文（不含标题行）；用于数「## Budget 里有几条计数行」。 */
function sectionBody(dir, title) {
  const target = title.toLowerCase();
  const out = [];
  let inside = false;
  for (const line of readState(dir).split(/\r?\n/)) {
    const heading = /^##\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      inside = heading[1].split(/[（(]/)[0].trim().toLowerCase() === target;
      continue;
    }
    if (inside) out.push(line);
  }
  return out.join('\n');
}

/** 摘掉整个 ## Mission Budget 节（模拟 v1 旧文件，测向后兼容）。 */
function stripMissionBudget(dir) {
  const lines = readState(dir).split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const heading = /^##\s+(.*\S)\s*$/.exec(line);
    if (heading) skipping = heading[1].split(/[（(]/)[0].trim().toLowerCase() === 'mission budget';
    if (!skipping) out.push(line);
  }
  writeState(dir, out.join('\n'));
}

/** 把某计数行整行替换为给定文本（测试专用，模拟手工改坏 / 超限）。 */
function replaceLine(dir, from, to) {
  const text = readState(dir);
  if (!text.includes(from)) throw new Error(`状态文件里找不到要替换的行 "${from}"`);
  writeState(dir, text.replace(from, to));
}

/** 在某计数行之后复制一份同样的行（模拟同一节内重复标签，P1-4）。 */
function duplicateLine(dir, line) {
  const text = readState(dir);
  if (!text.includes(line)) throw new Error(`状态文件里找不到要复制的行 "${line}"`);
  writeState(dir, text.replace(line, `${line}\n${line}`));
}

/** 删除某计数行（连同行尾换行；模拟必需计数行缺失，P1-9）。 */
function deleteLine(dir, line) {
  const text = readState(dir);
  if (!text.includes(line)) throw new Error(`状态文件里找不到要删除的行 "${line}"`);
  writeState(dir, text.replace(`${line}\n`, ''));
}

/* ───────────────────────────────── 用例 ───────────────────────────────── */

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

/**
 * 用例主动跳过（前置条件不成立）：运行器打印 SKIP 并把它排除在**通过数**之外。
 * 与"静默 return 算 PASS"的区别就在这里：跳过必须可见，且不能冒充通过。
 */
class SkipCase extends Error {}

function skipCase(reason) {
  throw new SkipCase(reason);
}

// ① init 生成 12 个 "## " 节（原 11 节 + Mission Budget）
test('① init 生成 12 节（含 ## Mission Budget）', () => {
  const dir = newDir('init');
  const r = runCli(['init', dir]);
  assertEq(r.status, 0, 'init 退出码');
  const headings = readState(dir).split(/\r?\n/).filter((l) => /^##\s+\S/.test(l));
  assertEq(headings.length, 12, '"## " 节数量');
  for (const name of [
    'Mission',
    'Definition of Done',
    'Out of scope',
    'Mode',
    'Active Workset',
    'Blocked',
    'Deferred Backlog',
    'Budget',
    'Mission Budget',
    'Last verified commit',
    'Resume From',
    'Notes for the next run',
  ]) {
    assert(readState(dir).includes(`## ${name}`), `骨架缺少节 "## ${name}"`);
  }
  assert(/^- Run: 0 \/ 3$/m.test(readState(dir)), 'Mission Budget 骨架缺 "- Run: 0 / 3"');
  assert(/^- 总卡数: 0 \/ 12$/m.test(readState(dir)), 'Mission Budget 骨架缺 "- 总卡数: 0 / 12"');
  assert(/^- 总 Repair: 0 \/ 3$/m.test(readState(dir)), 'Mission Budget 骨架缺 "- 总 Repair: 0 / 3"');
  // F2：## Budget 由 4 条增为 8 条（计数行条数由用例 ㉞ 细查）
  const runLines = sectionBody(dir, 'Budget')
    .split(/\r?\n/)
    .filter((l) => /^\s*[-*]\s+\S/.test(l));
  assertEq(runLines.length, 8, '## Budget 计数行数（F2 后应为 8）');
});

// ② 合法骨架 check → exit 0
test('② 合法骨架 check → exit 0', () => {
  const dir = initDir('check-ok');
  const r = runCli(['check', dir]);
  // FORCE_FAIL 注入点：故意与真实行为（0）不符，用于实测失败路径。
  const expected = FORCE_FAIL ? 1 : 0;
  assertEq(r.status, expected, 'check 退出码' + (FORCE_FAIL ? '（RS_TEST_FORCE_FAIL 注入的期望值）' : ''));
  assert(r.stdout.includes('检查结果: 通过'), 'check 未打印 "检查结果: 通过"');
});

// ③ advance cards 同时递增 Run 级「完成卡数」与 Mission 级「总卡数」
//    顺序说明（F1 新语义，非回归）：任一级任一有限额计数器 current >= limit 之后，**任何** advance 都被整体拒绝，
//    因此「已用 Repair: 1 / 1」这一步必须放在最后，否则后续 advance 会被预算守卫拦下。
test('③ advance cards 递增 Run+Mission 两处', () => {
  const dir = initDir('advance-cards');
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 0, 'advance cards 退出码');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', 'Run 级完成卡数行');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 1 / 12', 'Mission 级总卡数行');
  // 其它计数器不动
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'Epoch 不该被 cards 改动');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 0 / 1', 'Run 级 Repair 不该被 cards 改动');
  assertEq(counterLine(dir, '总 Repair'), '- 总 Repair: 0 / 3', 'Mission 级 Repair 不该被 cards 改动');
  // runs 的组合语义（Mission 级单独 +1）
  const runs = runCli(['advance', dir, 'runs']);
  assertEq(runs.status, 0, 'advance runs 退出码');
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 3', 'Mission 级 Run 行');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'runs 不该动 Run 级 Epoch');
  // repairs 的组合语义放最后（它会把 Run 级「已用 Repair」推到 1 / 1 触顶）
  assertEq(runCli(['advance', dir, 'repairs']).status, 0, 'advance repairs 退出码');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 1 / 1', 'Run 级已用 Repair 行');
  assertEq(counterLine(dir, '总 Repair'), '- 总 Repair: 1 / 3', 'Mission 级总 Repair 行');
});

// ④ Run 级越界拒绝且文件 SHA256 不变（原子性）
test('④ run 越界拒绝且文件哈希不变', () => {
  const dir = initDir('run-overflow');
  for (let i = 1; i <= 6; i++) {
    assertEq(runCli(['advance', dir, 'cards']).status, 0, `第 ${i} 次 advance 退出码`);
  }
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 6 / 6', '推满后的 Run 级完成卡数');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 6 / 12', '同步推进后的 Mission 级总卡数');

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 1, '越界 advance 退出码');
  assert(/预算守卫/.test(r.stderr), `越界后 stderr 未提到预算守卫：${r.stderr.trim()}`);
  assert(/文件未做任何修改/.test(r.stderr), `越界后未声明文件未修改：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, '越界后文件 SHA256（原子性）');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 6 / 12', '拒绝时 Mission 级不得被部分写入');
});

// ⑤ Mission 级越界也拒绝（Run 仍有余量）且哈希不变
test('⑤ mission 越界也拒绝（run 有余量时同样拒绝）且哈希不变', () => {
  const dir = initDir('mission-overflow');
  setLimit(dir, '总卡数', 1); // Mission 级上限压到 1，Run 级上限仍为 6
  assertEq(runCli(['advance', dir, 'cards']).status, 0, '第一次 advance（刚好到 Mission 上限）退出码');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 1 / 1', 'Mission 级刚好到上限');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', 'Run 级仍有余量');

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 1, 'Mission 级越界退出码');
  assert(/预算守卫/.test(r.stderr), `stderr 未提到预算守卫：${r.stderr.trim()}`);
  assert(/Mission/.test(r.stderr), `stderr 未点名 Mission 级：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, '拒绝后文件 SHA256（原子性）');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', '拒绝时 Run 级不得被部分写入');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 1 / 1', '拒绝时 Mission 级不得被写入');

  // mission 级别名单独越界同样拒绝
  const before2 = sha256(statePath(dir));
  const r2 = runCli(['advance', dir, 'totalcards']);
  assertEq(r2.status, 1, 'advance totalcards 越界退出码');
  assertEq(sha256(statePath(dir)), before2, 'totalcards 拒绝后文件 SHA256');
});

// ⑥ 非法计数行 "- 完成卡数: abc / 2" → check 非零（指行号 + 原行）
test('⑥ 非法计数行 abc / 2 → check 非零（行号+原行）', () => {
  const dir = initDir('bad-current');
  writeState(dir, readState(dir).replace('- 完成卡数: 0 / 6', '- 完成卡数: abc / 2'));
  const r = runCli(['check', dir]);
  assert(r.status !== 0, `check 退出码应非 0，实际 ${r.status}`);
  assert(/格式非法/.test(r.stderr), `stderr 未指出格式非法：${r.stderr.trim()}`);
  assert(/第 \d+ 行/.test(r.stderr), `stderr 未指出行号：${r.stderr.trim()}`);
  assert(r.stderr.includes('- 完成卡数: abc / 2'), `stderr 未回显原行：${r.stderr.trim()}`);
});

// ⑥b Mission 节内的非法行同样被 check 抓到（并点名该节）
test('⑥b Mission 节内非法行 → check 非零且点名 ## Mission Budget', () => {
  const dir = initDir('bad-mission-current');
  writeState(dir, readState(dir).replace('- 总卡数: 0 / 12', '- 总卡数: abc / 12'));
  const r = runCli(['check', dir]);
  assert(r.status !== 0, `check 退出码应非 0，实际 ${r.status}`);
  assert(/Mission Budget/.test(r.stderr), `stderr 未点名 Mission Budget 节：${r.stderr.trim()}`);
  assert(/第 \d+ 行/.test(r.stderr), `stderr 未指出行号：${r.stderr.trim()}`);
});

// ⑦ 非法上限 "- 完成卡数: 1 / xyz" → check 非零
test('⑦ 非法上限 1 / xyz → check 非零', () => {
  const dir = initDir('bad-limit');
  writeState(dir, readState(dir).replace('- 完成卡数: 0 / 6', '- 完成卡数: 1 / xyz'));
  const r = runCli(['check', dir]);
  assert(r.status !== 0, `check 退出码应非 0，实际 ${r.status}`);
  assert(/格式非法/.test(r.stderr), `stderr 未指出格式非法：${r.stderr.trim()}`);
  assert(/第 \d+ 行/.test(r.stderr), `stderr 未指出行号：${r.stderr.trim()}`);
});

// ⑧ gate：预算内 → exit 0 且 JSON.allow=true
test('⑧ gate 允许时 exit 0 且 JSON.allow=true', () => {
  const dir = initDir('gate-allow');
  const r = runCli(['gate', dir]);
  assertEq(r.status, 0, 'gate 允许时退出码');
  const parsed = JSON.parse(r.stdout);
  assertEq(parsed.allow, true, 'JSON.allow');
  assert(typeof parsed.reason === 'string' && parsed.reason.length > 0, 'reason 应非空');
  assert(parsed.run && Array.isArray(parsed.run.counters), 'JSON.run.counters 应为数组');
  assert(parsed.mission && Array.isArray(parsed.mission.counters), 'JSON.mission.counters 应为数组');
  assertEq(parsed.run.counters.length, 8, 'Run 级计数器条数（F2 后为 8）');
  assertEq(parsed.mission.counters.length, 3, 'Mission 级计数器条数');
  // 推进一格后仍允许
  assertEq(runCli(['advance', dir, 'cards']).status, 0, 'advance 退出码');
  const r2 = runCli(['gate', dir]);
  assertEq(r2.status, 0, '推进后 gate 退出码');
  assertEq(JSON.parse(r2.stdout).allow, true, '推进后 JSON.allow');
});

// ⑨ gate：某级触顶 → exit 1 且 allow=false、reason 非空
test('⑨ gate 某级触顶时 exit 1 且 allow=false、reason 非空', () => {
  const dir = initDir('gate-deny');
  setLimit(dir, '总卡数', 1); // Mission 触顶（Run 还有余量）
  assertEq(runCli(['advance', dir, 'cards']).status, 0, '推到 Mission 上限');
  const r = runCli(['gate', dir]);
  assertEq(r.status, 1, 'gate 拒绝时退出码');
  const parsed = JSON.parse(r.stdout);
  // FORCE_FAIL_GATE 注入点（用例 ⑨）：故意与真实行为（false）不符，用于实测第二处失败路径。
  assertEq(
    parsed.allow,
    FORCE_FAIL_GATE ? true : false,
    'JSON.allow' + (FORCE_FAIL_GATE ? '（RS_TEST_FORCE_FAIL=2 注入的期望值）' : ''),
  );
  assert(typeof parsed.reason === 'string' && parsed.reason.trim().length > 0, 'reason 应非空');
  assert(/Mission/.test(parsed.reason), `reason 应点名 Mission 级：${parsed.reason}`);
  assertEq(parsed.mission.exhausted, true, 'JSON.mission.exhausted');
  assertEq(parsed.run.exhausted, false, 'JSON.run.exhausted（Run 仍有余量）');
});

// ⑩ resume：Mission 耗尽 → 非零；仅 Run 耗尽 → exit 0 且提示新 Run
test('⑩ resume 语义（Mission 耗尽非零 / 仅 Run 耗尽 exit 0 并提示新 Run）', () => {
  // ⑩a Mission 耗尽
  const a = initDir('resume-mission-dead');
  setLimit(a, '总卡数', 1);
  assertEq(runCli(['advance', a, 'cards']).status, 0, '推到 Mission 上限');
  const ra = runCli(['resume', a]);
  assertEq(ra.status, 1, 'Mission 耗尽时 resume 退出码');
  assert(/Mission 预算耗尽/.test(ra.stderr), `stderr 未说明 Mission 预算耗尽：${ra.stderr.trim()}`);
  assert(/升级给人/.test(ra.stderr), `stderr 未说明应升级给人：${ra.stderr.trim()}`);
  assert(/Resume From/.test(ra.stdout), 'stdout 应打印 Resume From');

  // ⑩b 仅 Run 耗尽（Mission 仍有余额）→ exit 0 + 提示新 Run
  const b = initDir('resume-run-dead');
  for (let i = 1; i <= 6; i++) {
    assertEq(runCli(['advance', b, 'cards']).status, 0, `第 ${i} 次 advance`);
  }
  const rb = runCli(['resume', b]);
  assertEq(rb.status, 0, '仅 Run 耗尽时 resume 退出码');
  assert(/应开新 Run/.test(rb.stdout), `stdout 未提示"应开新 Run"：${rb.stdout.trim()}`);
  assert(/新上下文/.test(rb.stdout), `stdout 未提示"新上下文"：${rb.stdout.trim()}`);
  assert(/还允许开新 Run: 是/.test(rb.stdout), `stdout 未说明仍可开新 Run：${rb.stdout.trim()}`);
});

// ⑪ --help → exit 0
test('⑪ --help exit 0 且列出全部子命令', () => {
  const r = runCli(['--help']);
  assertEq(r.status, 0, '--help 退出码');
  assert(r.stdout.includes('用法'), '--help 未打印 "用法"');
  assert(r.stdout.includes('退出码'), '--help 未打印退出码约定');
  for (const cmd of ['init', 'check', 'advance', 'status', 'resume', 'gate']) {
    assert(r.stdout.includes(cmd), `--help 未提到子命令 ${cmd}`);
  }
});

// ⑫ 未知子命令 → exit 2
test('⑫ 未知子命令 exit 2', () => {
  const r = runCli(['frobnicate']);
  assertEq(r.status, 2, '未知子命令退出码');
  assert(/未知子命令/.test(r.stderr), `stderr 未指出未知子命令：${r.stderr.trim()}`);
  const r2 = runCli(['advance', '.', 'nosuchfield']);
  assertEq(r2.status, 2, '未知字段退出码（用法错误）');
});

// ⑬ 项目根 RUN_STATE.md（若存在）不被测试改动
test('⑬ 项目根 RUN_STATE.md 未被本脚本触碰（基线哈希自检）', () => {
  if (rootHashBefore === null) {
    // 任务卡写的是"若存在"：本仓根目录当前没有 RUN_STATE.md，条件用例按跳过处理（打印 SKIP，不计入通过数）。
    skipCase('项目根无 RUN_STATE.md（条件：若存在）—— 本用例本次跳过，未计入通过数');
  }
  assert(fs.existsSync(ROOT_STATE), '项目根 RUN_STATE.md 消失了');
  assertEq(sha256(ROOT_STATE), rootHashBefore, '项目根 RUN_STATE.md SHA256');
});

// ⑭ 附加守卫：docs/** 属禁改区，证据目录下的 RUN_STATE.md 也不能被动
test('⑭ docs/evidence 下的 RUN_STATE.md 未被触碰（禁改区守卫）', () => {
  assert(evidenceHashBefore !== null, '证据目录缺少 RUN_STATE.md（基线哈希为空）');
  assertEq(sha256(EVIDENCE_STATE), evidenceHashBefore, 'docs/evidence/runstate-cli/RUN_STATE.md SHA256');
});

// ⑮ 向后兼容：缺 ## Mission Budget 的旧文件 → check exit 0 + 警告
test('⑮ 向后兼容：缺 Mission Budget 的旧文件 check exit 0 且给警告', () => {
  const dir = initDir('compat-check');
  stripMissionBudget(dir);
  assert(!readState(dir).includes('## Mission Budget'), 'stripMissionBudget 未生效');
  const r = runCli(['check', dir]);
  assertEq(r.status, 0, '旧文件 check 退出码（应为 0）');
  assert(/Mission Budget/.test(r.stderr), `stderr 未给出兼容警告：${r.stderr.trim()}`);
  assert(/向后兼容/.test(r.stderr), `stderr 未说明向后兼容：${r.stderr.trim()}`);
  // advance 仍可用：Run 级照常 +1，Mission 级跳过并警告
  const ra = runCli(['advance', dir, 'cards']);
  assertEq(ra.status, 0, '旧文件 advance cards 退出码');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', 'Run 级仍应递增');
  assertEq(sha256(statePath(dir)).length, 64, '文件仍可读');
  // gate 在兼容模式下仍允许
  const rg = runCli(['gate', dir]);
  assertEq(rg.status, 0, '旧文件 gate 退出码');
  assertEq(JSON.parse(rg.stdout).allow, true, '旧文件 JSON.allow');
  assertEq(JSON.parse(rg.stdout).mission.present, false, '旧文件 mission.present 应为 false');
});

// ⑯ status：两级摘要 + --json 机器可读
test('⑯ status 打印两级摘要，--json 可解析', () => {
  const dir = initDir('status');
  assertEq(runCli(['advance', dir, 'cards']).status, 0, 'advance cards');
  const human = runCli(['status', dir]);
  assertEq(human.status, 0, 'status 退出码');
  assert(/Run 级预算/.test(human.stdout), 'status 未打印 Run 级摘要');
  assert(/Mission 级预算/.test(human.stdout), 'status 未打印 Mission 级摘要');

  const json = runCli(['status', dir, '--json']);
  assertEq(json.status, 0, 'status --json 退出码');
  const parsed = JSON.parse(json.stdout);
  assertEq(parsed.run.counters.length, 8, 'JSON run 计数器条数（F2 后为 8）');
  assertEq(parsed.mission.counters.length, 3, 'JSON mission 计数器条数');
  const cards = parsed.run.counters.find((c) => c.label === '完成卡数');
  assertEq(cards.current, 1, 'JSON run 完成卡数当前值');
  const totalCards = parsed.mission.counters.find((c) => c.label === '总卡数');
  assertEq(totalCards.current, 1, 'JSON mission 总卡数当前值');
  assertEq(totalCards.remaining, 11, 'JSON mission 总卡数剩余');
  assertEq(parsed.exhausted, false, 'JSON.exhausted');
});

// ⑰ check 在 Mission 触顶时同样非零点名
test('⑰ check 在 Mission 触顶时非零并点名', () => {
  const dir = initDir('check-mission-exhausted');
  setLimit(dir, '总卡数', 1);
  assertEq(runCli(['advance', dir, 'cards']).status, 0, '推到 Mission 上限');
  const r = runCli(['check', dir]);
  assertEq(r.status, 1, 'check 退出码');
  assert(/预算已达上限/.test(r.stderr), `stderr 未指出预算已达上限：${r.stderr.trim()}`);
  assert(/Mission\/总卡数/.test(r.stderr), `stderr 未点名 Mission/总卡数：${r.stderr.trim()}`);
});

// ⑱ new-run：Run 级四项归零 + Mission Run +1（Mission 总量保留；--help 列出该子命令）
test('⑱ new-run 后 Run 级四项归零且 Mission Run +1', () => {
  const dir = initDir('new-run');
  assertEq(runCli(['advance', dir, 'epoch']).status, 0, 'advance epoch');
  assertEq(runCli(['advance', dir, 'cards']).status, 0, 'advance cards');
  assertEq(runCli(['advance', dir, 'subagents']).status, 0, 'advance subagents');
  // repairs 放最后：它把 Run 级「已用 Repair」推到 1 / 1 触顶，之后任何 advance 都会被整体拒绝（新语义）
  assertEq(runCli(['advance', dir, 'repairs']).status, 0, 'advance repairs');
  // 前置：Run 级四项都被推到非零，Mission 级总量也各自 +1
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 1 / 2', '推进后 Epoch');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', '推进后 完成卡数');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 1 / 1', '推进后 已用 Repair');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 1 / 8', '推进后 已派子代理');
  assertEq(counterLine(dir, 'Run'), '- Run: 0 / 3', 'new-run 前 Mission Run');

  const r = runCli(['new-run', dir]);
  assertEq(r.status, 0, 'new-run 退出码');
  // Run 级 8 项归零（不改上限、不动其它节）
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'new-run 后 Epoch');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', 'new-run 后 完成卡数');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 0 / 1', 'new-run 后 已用 Repair');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 0 / 8', 'new-run 后 已派子代理');
  // Mission Run +1，Mission 总量是记忆、不得被重置
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 3', 'new-run 后 Mission Run');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 1 / 12', 'Mission 总卡数不该被重置');
  assertEq(counterLine(dir, '总 Repair'), '- 总 Repair: 1 / 3', 'Mission 总 Repair 不该被重置');
  // 成功确认：新 Run 编号 + 重置了哪几项
  assert(/新 Run 编号: 1/.test(r.stdout), `stdout 未打印新 Run 编号：${r.stdout.trim()}`);
  assert(/Run 0 → 1/.test(r.stdout), `stdout 未打印 Mission Run 增量：${r.stdout.trim()}`);
  for (const label of ['Epoch', '完成卡数', '已用 Repair', '已派子代理']) {
    assert(r.stdout.includes(`${label} 1 → 0`), `stdout 未列出被重置的 ${label}：${r.stdout.trim()}`);
  }
  // --help 必须列出新子命令
  const help = runCli(['--help']);
  assertEq(help.status, 0, '--help 退出码');
  assert(help.stdout.includes('new-run'), '--help 未列出 new-run 子命令');
  // 连续开新 Run：Mission Run 继续 +1，Run 级仍为 0
  assertEq(runCli(['new-run', dir]).status, 0, '第二次 new-run 退出码');
  assertEq(counterLine(dir, 'Run'), '- Run: 2 / 3', '第二次 new-run 后 Mission Run');
});

// ⑲ Mission Run 触顶 → new-run 拒绝、exit 1、SHA256 不变（不做部分重置）
test('⑲ Mission Run 触顶时 new-run 拒绝、exit 1、SHA256 不变', () => {
  const dir = initDir('new-run-denied');
  setLimit(dir, 'Run', 1); // Mission Run 上限压到 1
  // 顺序说明（F1 新语义）：先把 Run 级推一格，再推 Mission Run 触顶——触顶后任何 advance 都会被拒。
  assertEq(runCli(['advance', dir, 'cards']).status, 0, 'advance cards');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', 'new-run 前的 Run 级完成卡数');
  assertEq(runCli(['advance', dir, 'runs']).status, 0, '推到 Mission Run 上限');
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 1', 'Mission Run 已在上限');

  const before = sha256(statePath(dir));
  const r = runCli(['new-run', dir]);
  assertEq(r.status, 1, 'Mission Run 触顶时 new-run 退出码');
  assert(/Mission/.test(r.stderr), `stderr 未点名 Mission：${r.stderr.trim()}`);
  assert(/Run/.test(r.stderr), `stderr 未点名 Run：${r.stderr.trim()}`);
  assert(/已达上限/.test(r.stderr), `stderr 未说明已达上限：${r.stderr.trim()}`);
  assert(/文件未做任何修改/.test(r.stderr), `stderr 未声明文件未修改：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, '拒绝后文件 SHA256（原子性）');
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 1', '拒绝时 Mission Run 不得变化');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', '拒绝时 Run 级不得被部分重置');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', '拒绝时 Epoch 不得被重置');
});

// ⑳ new-run 后 gate 从「Run 触顶拒绝」恢复为 allow:true / exit 0
test('⑳ new-run 后 gate 恢复 allow:true 且 exit 0', () => {
  const dir = initDir('new-run-gate');
  setLimit(dir, '完成卡数', 1); // 只把 Run 级压到 1，Mission 级仍有余量
  assertEq(runCli(['advance', dir, 'cards']).status, 0, '推到 Run 级上限');
  const denied = runCli(['gate', dir]);
  assertEq(denied.status, 1, 'Run 触顶时 gate 退出码');
  assertEq(JSON.parse(denied.stdout).allow, false, 'Run 触顶时 JSON.allow');
  assertEq(JSON.parse(denied.stdout).run.exhausted, true, 'Run 触顶时 JSON.run.exhausted');

  const r = runCli(['new-run', dir]);
  assertEq(r.status, 0, 'new-run 退出码');
  const ok = runCli(['gate', dir]);
  assertEq(ok.status, 0, 'new-run 后 gate 退出码');
  assertEq(JSON.parse(ok.stdout).allow, true, 'new-run 后 JSON.allow');
  assertEq(JSON.parse(ok.stdout).run.exhausted, false, 'new-run 后 Run 不再触顶');
  // check 也应随之恢复通过
  assertEq(runCli(['check', dir]).status, 0, 'new-run 后 check 退出码');
});

// ㉑ resume 仅 Run 耗尽 → exit 0 且输出含"无需人工确认"（不再要求人工确认新预算）
test('㉑ resume 仅在 Run 耗尽时含"无需人工确认"且 exit 0', () => {
  const dir = initDir('resume-no-human');
  for (let i = 1; i <= 6; i++) {
    assertEq(runCli(['advance', dir, 'cards']).status, 0, `第 ${i} 次 advance`);
  }
  const r = runCli(['resume', dir]);
  assertEq(r.status, 0, '仅 Run 耗尽时 resume 退出码');
  assert(/无需人工确认/.test(r.stdout), `stdout 未声明"无需人工确认"：${r.stdout.trim()}`);
  assert(/new-run/.test(r.stdout), `stdout 未点名 new-run：${r.stdout.trim()}`);
  assert(/应开新 Run/.test(r.stdout), `stdout 未提示"应开新 Run"：${r.stdout.trim()}`);
  assert(!/先由人确认/.test(r.stdout), `stdout 仍残留旧措辞"先由人确认"：${r.stdout.trim()}`);
  assert(!/^runstate: 错误/m.test(r.stderr), `仅 Run 耗尽时不该报错误：${r.stderr.trim()}`);

  // 对照：Mission 耗尽仍必须升级给人（措辞不变、exit 1）
  const dead = initDir('resume-mission-dead-c1b');
  setLimit(dead, '总卡数', 1);
  assertEq(runCli(['advance', dead, 'cards']).status, 0, '推到 Mission 上限');
  const rd = runCli(['resume', dead]);
  assertEq(rd.status, 1, 'Mission 耗尽时 resume 退出码');
  assert(/升级给人/.test(rd.stderr), `Mission 耗尽时 stderr 未说明升级给人：${rd.stderr.trim()}`);
  assert(!/无需人工确认/.test(rd.stdout), `Mission 耗尽时不该说"无需人工确认"：${rd.stdout.trim()}`);
});

/* ───────────── F1 状态完整性加固（P0-2 / P0-3 / P1-4 / P1-5 / P1-6 / P1-8 / P1-9） ───────────── */

// ㉒ P0-2：Epoch 2 / 2 触顶后 gate 已 DENY，advance cards 仍必须整体拒绝且文件字节不变
test('㉒ P0-2 Epoch 触顶后 advance 一律拒绝且 SHA256 不变', () => {
  const dir = initDir('p0-2-epoch-exhausted');
  assertEq(runCli(['advance', dir, 'epoch']).status, 0, '第 1 次 advance epoch');
  assertEq(runCli(['advance', dir, 'epoch']).status, 0, '第 2 次 advance epoch（恰好到上限）');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 2 / 2', 'Epoch 已触顶');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', 'Run 级完成卡数仍有余量');

  const denied = runCli(['gate', dir]);
  assertEq(denied.status, 1, 'gate 在 Epoch 触顶时应 DENY');
  assertEq(JSON.parse(denied.stdout).allow, false, 'gate JSON.allow');
  assertEq(JSON.parse(denied.stdout).run.exhausted, true, 'gate JSON.run.exhausted');

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 1, 'P0-2：Epoch 触顶后 advance cards 退出码');
  assert(/预算守卫/.test(r.stderr), `stderr 未提到预算守卫：${r.stderr.trim()}`);
  assert(/Epoch/.test(r.stderr), `stderr 未点名 Epoch：${r.stderr.trim()}`);
  assert(/文件未做任何修改/.test(r.stderr), `stderr 未声明文件未修改：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, 'P0-2 拒绝后文件 SHA256（字节不变）');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', '拒绝时 Run 级完成卡数不得被改');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 0 / 12', '拒绝时 Mission 级总卡数不得被改');
});

// ㉓ P0-3：文件已非法（完成卡数 abc / 6）时 advance / new-run 都不得写盘
test('㉓ P0-3 文件已非法时 advance 拒绝写盘且 SHA256 不变', () => {
  const dir = initDir('p0-3-malformed');
  replaceLine(dir, '- 完成卡数: 0 / 6', '- 完成卡数: abc / 6');
  assertEq(runCli(['check', dir]).status, 1, '非法文件 check 退出码');
  assertEq(runCli(['gate', dir]).status, 1, '非法文件 gate 退出码');

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'repairs']);
  assertEq(r.status, 1, 'P0-3：非法文件下 advance repairs 退出码');
  assert(/格式非法/.test(r.stderr), `stderr 未指出格式非法：${r.stderr.trim()}`);
  assert(/文件未做任何修改/.test(r.stderr), `stderr 未声明文件未修改：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, 'P0-3 拒绝后文件 SHA256（字节不变）');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 0 / 1', 'Run 级已用 Repair 不得被改');
  assertEq(counterLine(dir, '总 Repair'), '- 总 Repair: 0 / 3', 'Mission 级总 Repair 不得被改');

  assertEq(runCli(['new-run', dir]).status, 1, 'P0-3：非法文件下 new-run 退出码');
  assertEq(sha256(statePath(dir)), before, 'P0-3 new-run 拒绝后 SHA256 不变');
});

// ㉔ 任一有限额计数器触顶 → 所有 advance 一律整体拒绝（不再只校验被推进的那一行）
test('㉔ 任一计数器触顶后 advance 一律整体拒绝（不看推进的是哪一行）', () => {
  const dir = initDir('any-exhausted-blocks-all');
  assertEq(runCli(['advance', dir, 'repairs']).status, 0, 'advance repairs');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 1 / 1', '已用 Repair 触顶');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', '完成卡数仍有余量');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'Epoch 仍有余量');

  const before = sha256(statePath(dir));
  for (const field of ['cards', 'epoch', 'subagents', 'totalcards', 'totalrepairs', 'runs']) {
    const r = runCli(['advance', dir, field]);
    assertEq(r.status, 1, `触顶后 advance ${field} 退出码`);
    assert(/文件未做任何修改/.test(r.stderr), `advance ${field} 未声明文件未修改：${r.stderr.trim()}`);
    assertEq(sha256(statePath(dir)), before, `触顶后 advance ${field} 拒绝时 SHA256 不变`);
  }
});

// ㉕ P1-4：同一节内重复标签 → check / gate 非零，advance / new-run 拒写
test('㉕ P1-4 重复标签 → check/gate 非零且写命令拒写', () => {
  const dir = initDir('duplicate-label');
  duplicateLine(dir, '- 已用 Repair: 0 / 1');
  assertEq((readState(dir).match(/- 已用 Repair: 0 \/ 1/g) || []).length, 2, '重复行插入失败');

  const c = runCli(['check', dir]);
  assertEq(c.status, 1, '重复标签 check 退出码');
  assert(/重复/.test(c.stderr), `check stderr 未指出重复标签：${c.stderr.trim()}`);

  const g = runCli(['gate', dir]);
  assertEq(g.status, 1, '重复标签 gate 退出码');
  assertEq(JSON.parse(g.stdout).allow, false, '重复标签 JSON.allow');
  assert(/重复/.test(JSON.parse(g.stdout).reason), `gate reason 未指出重复标签：${JSON.parse(g.stdout).reason}`);

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 1, '重复标签下 advance 退出码');
  assert(/重复/.test(r.stderr), `advance stderr 未指出重复标签：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, '重复标签下 advance 拒绝时 SHA256 不变');

  assertEq(runCli(['new-run', dir]).status, 1, '重复标签下 new-run 退出码');
  assertEq(sha256(statePath(dir)), before, '重复标签下 new-run 拒绝时 SHA256 不变');
});

// ㉖ P1-5：完成卡数 99 / 6（current > limit）不能被 new-run 洗白
test('㉖ P1-5 完成卡数 99 / 6 不能被 new-run 洗白', () => {
  const dir = initDir('p1-5-whitewash');
  replaceLine(dir, '- 完成卡数: 0 / 6', '- 完成卡数: 99 / 6');
  const denied = runCli(['gate', dir]);
  assertEq(denied.status, 1, 'gate 应先 DENY');
  assertEq(JSON.parse(denied.stdout).allow, false, 'gate JSON.allow');

  const before = sha256(statePath(dir));
  const r = runCli(['new-run', dir]);
  assertEq(r.status, 1, 'P1-5：超限状态下 new-run 退出码');
  assert(/非法超限/.test(r.stderr), `stderr 未指出非法超限：${r.stderr.trim()}`);
  assert(/文件未做任何修改/.test(r.stderr), `stderr 未声明文件未修改：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, 'P1-5 拒绝后文件 SHA256（字节不变）');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 99 / 6', '超限值不得被重置');

  const after = runCli(['gate', dir]);
  assertEq(after.status, 1, '洗白尝试后 gate 仍应 DENY');
  assertEq(JSON.parse(after.stdout).allow, false, '洗白尝试后 JSON.allow 仍为 false');
});

// ㉗ P1-6：Mission 级耗尽时反复 new-run 一律拒绝，且不烧 Run 配额
test('㉗ P1-6 Mission 总卡数 12 / 12 耗尽时 new-run 一律拒绝且不烧 Run 配额', () => {
  const dir = initDir('p1-6-mission-spent');
  replaceLine(dir, '- 总卡数: 0 / 12', '- 总卡数: 12 / 12');
  const before = sha256(statePath(dir));
  for (let i = 1; i <= 3; i++) {
    const r = runCli(['new-run', dir]);
    assertEq(r.status, 1, `P1-6：第 ${i} 次 new-run 退出码`);
    assert(/Mission/.test(r.stderr), `stderr 未点名 Mission：${r.stderr.trim()}`);
    assert(/已达上限/.test(r.stderr), `stderr 未说明已达上限：${r.stderr.trim()}`);
    assert(/升级给人/.test(r.stderr), `stderr 未提示升级给人：${r.stderr.trim()}`);
    assertEq(sha256(statePath(dir)), before, `P1-6：第 ${i} 次拒绝后 SHA256 不变`);
  }
  assertEq(counterLine(dir, 'Run'), '- Run: 0 / 3', 'Run 配额不得被烧');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 12 / 12', 'Mission 记忆不得被改');
  assertEq(runCli(['gate', dir]).status, 1, 'Mission 耗尽时 gate 仍 DENY');
});

// ㉘ P1-8：数值超 Number.MAX_SAFE_INTEGER → 状态错误，不再"静默 no-op 却 exit 0"
test('㉘ P1-8 数值超 Number.MAX_SAFE_INTEGER → check 非零且 advance 拒写', () => {
  const dir = initDir('p1-8-unsafe-int');
  replaceLine(dir, '- Epoch: 0 / 2', '- Epoch: 9007199254740993 / 10000000000000000');
  const c = runCli(['check', dir]);
  assertEq(c.status, 1, 'P1-8：check 退出码');
  assert(/安全整数/.test(c.stderr), `check stderr 未指出数值越界：${c.stderr.trim()}`);
  assertEq(runCli(['gate', dir]).status, 1, 'P1-8：gate 退出码');

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'epoch']);
  assertEq(r.status, 1, 'P1-8：advance epoch 退出码（旧行为是静默 no-op + exit 0）');
  assert(/安全整数/.test(r.stderr), `advance stderr 未指出数值越界：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, 'P1-8 拒绝后文件 SHA256（字节不变）');
  assertEq(runCli(['new-run', dir]).status, 1, 'P1-8：new-run 也应拒绝');
  assertEq(sha256(statePath(dir)), before, 'P1-8 new-run 拒绝后 SHA256 不变');

  // 边界不误杀：恰好等于 MAX_SAFE_INTEGER（9007199254740991）且无上限 → 仍合法
  const edge = initDir('p1-8-boundary');
  replaceLine(edge, '- 已派子代理: 0 / 8', '- 已派子代理: 9007199254740991');
  const ec = runCli(['check', edge]);
  assertEq(ec.status, 0, '边界值（== MAX_SAFE_INTEGER，无上限）check 应通过');
  assert(!/安全整数/.test(ec.stderr), `边界值不该被判为数值越界：${ec.stderr.trim()}`);
});

// ㉙ P1-9：删除必需计数行「已用 Repair」→ check / gate 非零且写命令拒写
test('㉙ P1-9 删除必需计数行「已用 Repair」→ check 非零且写命令拒写', () => {
  const dir = initDir('p1-9-missing-run-item');
  deleteLine(dir, '- 已用 Repair: 0 / 1');
  assert(!readState(dir).includes('- 已用 Repair:'), '删除行未生效');

  const c = runCli(['check', dir]);
  assertEq(c.status, 1, 'P1-9：check 退出码');
  assert(/缺少必需计数行/.test(c.stderr), `check stderr 未指出必需项缺失：${c.stderr.trim()}`);
  assert(/已用 Repair/.test(c.stderr), `check stderr 未点名缺失项：${c.stderr.trim()}`);
  assertEq(runCli(['gate', dir]).status, 1, 'P1-9：gate 退出码');

  const before = sha256(statePath(dir));
  assertEq(runCli(['advance', dir, 'cards']).status, 1, 'P1-9：缺必需项时 advance 退出码');
  assertEq(sha256(statePath(dir)), before, 'P1-9 advance 拒绝后 SHA256 不变');
  assertEq(runCli(['new-run', dir]).status, 1, 'P1-9：缺必需项时 new-run 退出码');
  assertEq(sha256(statePath(dir)), before, 'P1-9 new-run 拒绝后 SHA256 不变');
});

// ㉚ Mission 节存在但计数行不全 → 判错（只有"整节缺失"才豁免，向后兼容边界）
test('㉚ Mission 节存在但缺「总 Repair」→ 判错；整节缺失才豁免', () => {
  const dir = initDir('mission-incomplete');
  deleteLine(dir, '- 总 Repair: 0 / 3');
  const c = runCli(['check', dir]);
  assertEq(c.status, 1, '节存在而计数行不全 → check 必须非零');
  assert(/缺少必需计数行/.test(c.stderr), `check stderr 未指出必需项缺失：${c.stderr.trim()}`);
  assert(/总 Repair/.test(c.stderr), `check stderr 未点名缺失项：${c.stderr.trim()}`);

  const legacy = initDir('mission-section-absent');
  stripMissionBudget(legacy);
  const lc = runCli(['check', legacy]);
  assertEq(lc.status, 0, '整节缺失 → 向后兼容 check exit 0');
  assert(/向后兼容/.test(lc.stderr), `stderr 未给出兼容警告：${lc.stderr.trim()}`);
});

// ㉛ 不许误杀：Run 级 current == limit（正常耗尽）时 new-run 仍合法
test('㉛ 不误杀：Epoch 2 / 2 下 new-run 仍允许并归零', () => {
  const dir = initDir('new-run-at-limit-allowed');
  assertEq(runCli(['advance', dir, 'epoch']).status, 0, 'advance epoch #1');
  assertEq(runCli(['advance', dir, 'epoch']).status, 0, 'advance epoch #2');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 2 / 2', 'Epoch 恰好到上限');
  assertEq(runCli(['gate', dir]).status, 1, '触顶时 gate 应 DENY');

  const r = runCli(['new-run', dir]);
  assertEq(r.status, 0, 'Run 级 == 上限时 new-run 应允许（exit 0，不被误杀）');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'new-run 后 Epoch 归零');
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 3', 'new-run 后 Mission Run +1');
  assertEq(runCli(['gate', dir]).status, 0, 'new-run 后 gate 应恢复 ALLOW');
});

// ㉜ 旧文件（缺 Mission Budget 节）advance / new-run 仍可用，且给向后兼容警告
test('㉜ 旧文件（缺 Mission Budget 节）advance 与 new-run 仍可用并带警告', () => {
  const dir = initDir('legacy-writes');
  stripMissionBudget(dir);
  const a = runCli(['advance', dir, 'cards']);
  assertEq(a.status, 0, '旧文件 advance cards 退出码');
  assert(/向后兼容/.test(a.stderr), `advance 未给出兼容警告：${a.stderr.trim()}`);
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', 'Run 级照常递增');

  const n = runCli(['new-run', dir]);
  assertEq(n.status, 0, '旧文件 new-run 退出码');
  assert(/向后兼容/.test(n.stderr), `new-run 未给出兼容警告：${n.stderr.trim()}`);
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', '旧文件 new-run 仍重置 Run 级');
});

// ㉝ 一致性：Run 级非法超限时，status/resume 与 new-run 的判定必须一致（都说"不能开新 Run"）
test('㉝ Run 级超限时 status --json / resume 也判定不允许开新 Run', () => {
  const dir = initDir('consistency-over-limit');
  replaceLine(dir, '- 完成卡数: 0 / 6', '- 完成卡数: 99 / 6');

  const s = runCli(['status', dir, '--json']);
  assertEq(s.status, 0, 'status --json 退出码');
  assertEq(JSON.parse(s.stdout).allowNewRun, false, '超限时 allowNewRun 应为 false');

  const r = runCli(['resume', dir]);
  assertEq(r.status, 1, '超限时 resume 应非零（不得建议机械续跑）');
  assert(/非法超限/.test(r.stderr), `resume stderr 未指出非法超限：${r.stderr.trim()}`);
  assert(!/应开新 Run/.test(r.stdout), `超限时不该建议"应开新 Run"：${r.stdout.trim()}`);
});

/* ─────────── F2 机械见证：WorkSet 规模 / Worker 数 / Research pass / 子代理嵌套 ─────────── */

// ㉞ F2：init 骨架的 ## Budget 恰有 8 条计数行，且 5 条带上默认上限
test('㉞ F2 骨架 ## Budget 8 条计数行、5 条带上限', () => {
  const dir = initDir('f2-skeleton');
  const body = sectionBody(dir, 'Budget');
  const lines = body.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l));
  assertEq(lines.length, 8, `## Budget 计数行数（实际: ${lines.join(' | ')}）`);
  // 新 4 行 + 改造过的 已派子代理 行
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 0 / 8', '已派子代理 行（本次改造为带上限）');
  assertEq(counterLine(dir, 'WorkSet 规模'), '- WorkSet 规模: 0 / 8', 'WorkSet 规模 行');
  assertEq(counterLine(dir, 'Worker 数'), '- Worker 数: 0 / 3', 'Worker 数 行');
  assertEq(counterLine(dir, 'Research pass'), '- Research pass: 0 / 1', 'Research pass 行');
  assertEq(counterLine(dir, '子代理嵌套'), '- 子代理嵌套: 0 / 1', '子代理嵌套 行');
  // 原有 4 行不被顺手改坏
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'Epoch 行');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', '完成卡数 行');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 0 / 1', '已用 Repair 行');
  // 8 条都必须落在 ## Budget 节内（不在 Mission Budget 里）
  assert(body.includes('WorkSet 规模: 0 / 8'), 'WorkSet 规模 不在 ## Budget 节内');
  assert(!sectionBody(dir, 'Mission Budget').includes('WorkSet 规模'), 'WorkSet 规模 不该出现在 Mission Budget');
  // 合法骨架 check 通过
  assertEq(runCli(['check', dir]).status, 0, 'F2 骨架 check 退出码');
});

// ㉟ F2：四个新别名 workset / workers / research / depth 均可用并改对应行
test('㉟ F2 四个新别名 workset/workers/research/depth 可用', () => {
  const dir = initDir('f2-aliases');
  assertEq(runCli(['advance', dir, 'workset']).status, 0, 'advance workset 退出码');
  assertEq(counterLine(dir, 'WorkSet 规模'), '- WorkSet 规模: 1 / 8', 'Workset 规模 行被推进');
  assertEq(counterLine(dir, 'Worker 数'), '- Worker 数: 0 / 3', 'workset 不该动 Worker 数');
  assertEq(runCli(['advance', dir, 'workers']).status, 0, 'advance workers 退出码');
  assertEq(counterLine(dir, 'Worker 数'), '- Worker 数: 1 / 3', 'Worker 数 行被推进');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', 'workset/workers 不该动 完成卡数');
  // research / depth 默认上限是 1，推一次即触顶 → 先把上限抬到 2 再验证别名本身
  setLimit(dir, 'Research pass', 2);
  setLimit(dir, '子代理嵌套', 2);
  assertEq(runCli(['advance', dir, 'research']).status, 0, 'advance research 退出码');
  assertEq(counterLine(dir, 'Research pass'), '- Research pass: 1 / 2', 'Research pass 行被推进');
  assertEq(runCli(['advance', dir, 'depth']).status, 0, 'advance depth 退出码');
  assertEq(counterLine(dir, '子代理嵌套'), '- 子代理嵌套: 1 / 2', '子代理嵌套 行被推进');
  // 旧别名 subagents 保持可用
  assertEq(runCli(['advance', dir, 'subagents']).status, 0, 'advance subagents 退出码');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 1 / 8', '已派子代理 行被推进');
  // --help 必须列出全部别名
  const help = runCli(['--help']);
  assertEq(help.status, 0, '--help 退出码');
  for (const alias of ['workset', 'workers', 'research', 'depth', 'subagents']) {
    assert(help.stdout.includes(alias), `--help 未列出别名 ${alias}`);
  }
});

// ㊱ F2：WorkSet 规模 8 / 8 触顶 → 任何 advance 整体拒绝且 SHA256 不变
test('㊱ F2 WorkSet 规模触顶后任何 advance 整体拒绝且 SHA256 不变', () => {
  const dir = initDir('f2-workset-exhausted');
  for (let i = 1; i <= 8; i++) {
    assertEq(runCli(['advance', dir, 'workset']).status, 0, `第 ${i} 次 advance workset 退出码`);
  }
  assertEq(counterLine(dir, 'WorkSet 规模'), '- WorkSet 规模: 8 / 8', 'WorkSet 规模 已触顶');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'Epoch 仍有余量（证明是"触顶即整体拒绝"，不是"只拦自己那行"）');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', '完成卡数 仍有余量');

  const denied = runCli(['gate', dir]);
  assertEq(denied.status, 1, 'WorkSet 触顶时 gate 退出码');
  assertEq(JSON.parse(denied.stdout).allow, false, 'WorkSet 触顶时 JSON.allow');
  assertEq(JSON.parse(denied.stdout).run.exhausted, true, 'JSON.run.exhausted');
  assertEq(runCli(['check', dir]).status, 1, 'WorkSet 触顶时 check 退出码');

  const before = sha256(statePath(dir));
  for (const field of ['cards', 'epoch', 'workset', 'workers', 'research', 'depth', 'subagents', 'totalcards']) {
    const r = runCli(['advance', dir, field]);
    assertEq(r.status, 1, `触顶后 advance ${field} 退出码`);
    assert(/预算守卫/.test(r.stderr), `advance ${field} stderr 未提到预算守卫：${r.stderr.trim()}`);
    assert(/WorkSet 规模/.test(r.stderr), `advance ${field} stderr 未点名 WorkSet 规模：${r.stderr.trim()}`);
    assert(/文件未做任何修改/.test(r.stderr), `advance ${field} 未声明文件未修改：${r.stderr.trim()}`);
    assertEq(sha256(statePath(dir)), before, `触顶后 advance ${field} 拒绝时 SHA256 不变`);
  }
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', '拒绝时 Run 级不得被部分写入');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 0 / 12', '拒绝时 Mission 级不得被部分写入');
});

// ㊲ F2：Worker 数 3 / 3 与 已派子代理 8 / 8 触顶 → 同样整体拒绝
test('㊲ F2 Worker 数 / 已派子代理 触顶后同样整体拒绝', () => {
  const w = initDir('f2-workers-exhausted');
  for (let i = 1; i <= 3; i++) {
    assertEq(runCli(['advance', w, 'workers']).status, 0, `第 ${i} 次 advance workers 退出码`);
  }
  assertEq(counterLine(w, 'Worker 数'), '- Worker 数: 3 / 3', 'Worker 数 已触顶');
  const beforeW = sha256(statePath(w));
  const rw = runCli(['advance', w, 'cards']);
  assertEq(rw.status, 1, 'Worker 数 触顶后 advance cards 退出码');
  assert(/Worker 数/.test(rw.stderr), `stderr 未点名 Worker 数：${rw.stderr.trim()}`);
  assertEq(sha256(statePath(w)), beforeW, 'Worker 数 触顶拒绝时 SHA256 不变');
  assertEq(JSON.parse(runCli(['gate', w]).stdout).allow, false, 'Worker 数 触顶时 gate 应 DENY');

  const s = initDir('f2-subagents-exhausted');
  for (let i = 1; i <= 8; i++) {
    assertEq(runCli(['advance', s, 'subagents']).status, 0, `第 ${i} 次 advance subagents 退出码`);
  }
  assertEq(counterLine(s, '已派子代理'), '- 已派子代理: 8 / 8', '已派子代理 已触顶（旧行为是无上限）');
  const beforeS = sha256(statePath(s));
  const rs = runCli(['advance', s, 'cards']);
  assertEq(rs.status, 1, '已派子代理 触顶后 advance cards 退出码');
  assert(/已派子代理/.test(rs.stderr), `stderr 未点名 已派子代理：${rs.stderr.trim()}`);
  assertEq(sha256(statePath(s)), beforeS, '已派子代理 触顶拒绝时 SHA256 不变');
  assertEq(JSON.parse(runCli(['gate', s]).stdout).allow, false, '已派子代理 触顶时 gate 应 DENY');
});

// ㊳ F2：Research pass 1 / 1 与 子代理嵌套 1 / 1 触顶 → 同样整体拒绝
test('㊳ F2 Research pass / 子代理嵌套 触顶后同样整体拒绝', () => {
  const a = initDir('f2-research-exhausted');
  assertEq(runCli(['advance', a, 'research']).status, 0, 'advance research 退出码');
  assertEq(counterLine(a, 'Research pass'), '- Research pass: 1 / 1', 'Research pass 已触顶');
  const beforeA = sha256(statePath(a));
  const ra = runCli(['advance', a, 'depth']);
  assertEq(ra.status, 1, 'Research pass 触顶后 advance depth 退出码');
  assert(/Research pass/.test(ra.stderr), `stderr 未点名 Research pass：${ra.stderr.trim()}`);
  assertEq(sha256(statePath(a)), beforeA, 'Research pass 触顶拒绝时 SHA256 不变');
  assertEq(JSON.parse(runCli(['gate', a]).stdout).allow, false, 'Research pass 触顶时 gate 应 DENY');

  const b = initDir('f2-depth-exhausted');
  assertEq(runCli(['advance', b, 'depth']).status, 0, 'advance depth 退出码');
  assertEq(counterLine(b, '子代理嵌套'), '- 子代理嵌套: 1 / 1', '子代理嵌套 已触顶');
  const beforeB = sha256(statePath(b));
  const rb = runCli(['advance', b, 'research']);
  assertEq(rb.status, 1, '子代理嵌套 触顶后 advance research 退出码');
  assert(/子代理嵌套/.test(rb.stderr), `stderr 未点名 子代理嵌套：${rb.stderr.trim()}`);
  assertEq(sha256(statePath(b)), beforeB, '子代理嵌套 触顶拒绝时 SHA256 不变');
  assertEq(JSON.parse(runCli(['gate', b]).stdout).allow, false, '子代理嵌套 触顶时 gate 应 DENY');
});

// ㊴ F2 向后兼容：缺新行的旧文件 → check exit 0 + 警告（列出缺失项），advance/gate 行为不变
test('㊴ F2 向后兼容：缺新行的旧文件 check exit 0 + 警告且 advance 可用', () => {
  const dir = initDir('f2-legacy-budget');
  // 还原成 v0.5.x 旧文件：删掉 4 条新行 + 把 已派子代理 写回无上限旧写法
  deleteLine(dir, '- WorkSet 规模: 0 / 8');
  deleteLine(dir, '- Worker 数: 0 / 3');
  deleteLine(dir, '- Research pass: 0 / 1');
  deleteLine(dir, '- 子代理嵌套: 0 / 1');
  replaceLine(dir, '- 已派子代理: 0 / 8', '- 已派子代理: 0');
  assert(!readState(dir).includes('WorkSet 规模'), '构造旧文件失败（WorkSet 规模 仍在）');

  const c = runCli(['check', dir]);
  assertEq(c.status, 0, '旧文件 check 退出码（缺失只警告，必须为 0）');
  assert(/缺少机械见证计数行/.test(c.stderr), `check 未给出缺失警告：${c.stderr.trim()}`);
  for (const label of ['WorkSet 规模', 'Worker 数', 'Research pass', '子代理嵌套']) {
    assert(c.stderr.includes(label), `check 警告未列出缺失项 ${label}：${c.stderr.trim()}`);
  }
  assert(/已派子代理/.test(c.stderr) && /未写上限/.test(c.stderr), `check 未警告 已派子代理 无上限：${c.stderr.trim()}`);
  assert(!/^runstate: 错误/m.test(c.stderr), `旧文件 check 不该报错误：${c.stderr.trim()}`);

  // advance 行为不变：原有字段照常推进（并带同样的兼容警告）
  const a = runCli(['advance', dir, 'cards']);
  assertEq(a.status, 0, '旧文件 advance cards 退出码');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', '旧文件 Run 级照常递增');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 1 / 12', '旧文件 Mission 级照常递增');
  // gate 行为不变：预算未触顶 → allow:true
  const g = runCli(['gate', dir]);
  assertEq(g.status, 0, '旧文件 gate 退出码');
  assertEq(JSON.parse(g.stdout).allow, true, '旧文件 JSON.allow');
  // 新别名在旧文件上没有对应行 → 明确 exit 1（不得静默 exit 0），且文件不变
  const before = sha256(statePath(dir));
  const missing = runCli(['advance', dir, 'workset']);
  assertEq(missing.status, 1, '旧文件缺 WorkSet 规模 行时 advance workset 退出码');
  assert(/WorkSet 规模/.test(missing.stderr), `stderr 未点名缺失的 WorkSet 规模：${missing.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, '缺行时 advance 拒绝后 SHA256 不变');
});

// ㊵ F2：gate 在 WorkSet 规模触顶时 DENY（allow:false / exit 1 / reason 点名）
test('㊵ F2 gate 在 WorkSet 触顶时 DENY', () => {
  const dir = initDir('f2-gate-workset');
  for (let i = 1; i <= 8; i++) {
    assertEq(runCli(['advance', dir, 'workset']).status, 0, `第 ${i} 次 advance workset`);
  }
  const r = runCli(['gate', dir]);
  assertEq(r.status, 1, 'WorkSet 触顶时 gate 退出码');
  const parsed = JSON.parse(r.stdout);
  assertEq(parsed.allow, false, 'gate JSON.allow');
  assert(/WorkSet 规模/.test(parsed.reason), `gate reason 未点名 WorkSet 规模：${parsed.reason}`);
  assertEq(parsed.run.exhausted, true, 'gate JSON.run.exhausted');
  assertEq(parsed.mission.exhausted, false, 'gate JSON.mission.exhausted（Mission 仍有余量）');
  // status 仍 exit 0（允许/拒绝的判断只认 gate）
  assertEq(runCli(['status', dir, '--json']).status, 0, 'status --json 退出码');
  assertEq(JSON.parse(runCli(['status', dir, '--json']).stdout).exhausted, true, 'status JSON.exhausted');
});

// ㊶ F2：new-run 把 Run 级 8 项全部归零；旧文件缺新行时跳过缺失项仍可用
test('㊶ F2 new-run 重置 Run 级 8 项，旧文件缺新行时仍可用', () => {
  const dir = initDir('f2-new-run-8');
  // Research pass / 子代理嵌套 默认上限都是 1，先各自抬到 2，才能把 8 项同时推成非零
  setLimit(dir, 'Research pass', 2);
  setLimit(dir, '子代理嵌套', 2);
  for (const field of ['epoch', 'cards', 'workset', 'workers', 'subagents', 'depth', 'research']) {
    assertEq(runCli(['advance', dir, field]).status, 0, `advance ${field} 退出码`);
  }
  // 再把 Research pass 推到 2 / 2 触顶：Run 级耗尽时 new-run 仍必须可机械续跑
  assertEq(runCli(['advance', dir, 'research']).status, 0, 'advance research #2 退出码');
  assertEq(counterLine(dir, 'Research pass'), '- Research pass: 2 / 2', 'Research pass 恰好耗尽');
  assertEq(runCli(['gate', dir]).status, 1, '耗尽后 gate 应 DENY');

  const n = runCli(['new-run', dir]);
  assertEq(n.status, 0, 'new-run 退出码（Run 级耗尽必须可机械续跑）');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'new-run 后 Epoch');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 0 / 1', 'new-run 后 已用 Repair');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 0 / 8', 'new-run 后 已派子代理');
  assertEq(counterLine(dir, 'WorkSet 规模'), '- WorkSet 规模: 0 / 8', 'new-run 后 WorkSet 规模');
  assertEq(counterLine(dir, 'Worker 数'), '- Worker 数: 0 / 3', 'new-run 后 Worker 数');
  // 只归零、不改上限：本用例把两个上限抬到了 2，重置后上限仍是 2
  assertEq(counterLine(dir, 'Research pass'), '- Research pass: 0 / 2', 'new-run 后 Research pass（上限保持 2）');
  assertEq(counterLine(dir, '子代理嵌套'), '- 子代理嵌套: 0 / 2', 'new-run 后 子代理嵌套（上限保持 2）');
  assert(/已重置 Run 级 8 项/.test(n.stdout), `stdout 未说明重置 8 项：${n.stdout.trim()}`);
  assertEq(runCli(['gate', dir]).status, 0, 'new-run 后 gate 应恢复 ALLOW');
  // Mission 级记忆不被重置
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 3', 'new-run 后 Mission Run +1');
  assertEq(counterLine(dir, '总卡数'), '- 总卡数: 1 / 12', 'Mission 记忆不该被重置');

  // 旧文件缺 4 条新行 → new-run 仍 exit 0，只重置存在的 4 项并说明跳过
  const legacy = initDir('f2-new-run-legacy');
  deleteLine(legacy, '- WorkSet 规模: 0 / 8');
  deleteLine(legacy, '- Worker 数: 0 / 3');
  deleteLine(legacy, '- Research pass: 0 / 1');
  deleteLine(legacy, '- 子代理嵌套: 0 / 1');
  assertEq(runCli(['advance', legacy, 'cards']).status, 0, '旧文件 advance cards');
  const nl = runCli(['new-run', legacy]);
  assertEq(nl.status, 0, '旧文件 new-run 退出码');
  assertEq(counterLine(legacy, '完成卡数'), '- 完成卡数: 0 / 6', '旧文件 new-run 仍重置必需项');
  assert(/已重置 Run 级 4 项/.test(nl.stdout), `stdout 未说明只重置 4 项：${nl.stdout.trim()}`);
  assert(/跳过旧文件缺失的 Run 级计数行/.test(nl.stdout), `stdout 未说明跳过缺失行：${nl.stdout.trim()}`);
});

// ㊷ F2：文档与 CLI 标签逐字一致（8 个标签 + 4 个新别名），防止文档再次跑偏
test('㊷ F2 中英文档与 CLI 标签逐字一致（8 标签 + 4 别名）', () => {
  const labels = [
    'Epoch',
    '完成卡数',
    '已用 Repair',
    '已派子代理',
    'WorkSet 规模',
    'Worker 数',
    'Research pass',
    '子代理嵌套',
  ];
  const aliases = ['subagents', 'workset', 'workers', 'research', 'depth'];
  // 四类文档 × 中英：SKILL.md / production-control / framework / run-state-template
  const docs = [
    'skills/personal-dev-workflow/SKILL.md',
    'skills/personal-dev-workflow-zh/SKILL.md',
    'skills/personal-dev-workflow/references/production-control.md',
    'skills/personal-dev-workflow-zh/references/production-control.md',
    'skills/personal-dev-workflow/references/framework.md',
    'skills/personal-dev-workflow-zh/references/framework.md',
    'skills/personal-dev-workflow/references/run-state-template.md',
    'skills/personal-dev-workflow-zh/references/run-state-template.md',
  ];
  for (const rel of docs) {
    const file = path.join(PROJECT_ROOT, rel);
    assert(fs.existsSync(file), `文档缺失: ${rel}`);
    const text = fs.readFileSync(file, 'utf8');
    for (const label of labels) {
      assert(text.includes(label), `${rel} 未提到 CLI 标签 "${label}"（文档与 CLI 已跑偏）`);
    }
    if (rel.includes('production-control')) {
      for (const alias of aliases) {
        assert(text.includes(alias), `${rel} 未提到 advance 别名 "${alias}"`);
      }
    }
  }
  // 示例状态文件（run-state-template.md）：## Budget 节必须是 8 条 "x / y" 带上限的计数行，
  // 且示例值自洽（不得出现超过上限的示例值）——否则用户照抄就会生成"无见证"的状态文件。
  for (const rel of docs.filter((d) => d.includes('run-state-template'))) {
    const text = fs.readFileSync(path.join(PROJECT_ROOT, rel), 'utf8');
    const body = [];
    let inside = false;
    for (const line of text.split(/\r?\n/)) {
      const heading = /^##\s+(.*\S)\s*$/.exec(line);
      if (heading) {
        inside = heading[1].split(/[（(]/)[0].trim().toLowerCase() === 'budget';
        continue;
      }
      if (inside) body.push(line);
    }
    const counters = body.filter((l) => /^\s*[-*]\s+\S/.test(l));
    assertEq(counters.length, 8, `${rel} 的 ## Budget 示例计数行数`);
    for (const line of counters) {
      const m = /^\s*[-*]\s+([^:：]+)[:：]\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(line);
      assert(m !== null, `${rel} 的示例计数行不是 "标签: 当前 / 上限" 写法: "${line.trim()}"`);
      assert(
        Number(m[2]) <= Number(m[3]),
        `${rel} 的示例值超过上限: "${line.trim()}"`,
      );
    }
  }
  // 生产控制文档里的默认值与 init 骨架必须一致（逐条对照上限）
  const zh = fs.readFileSync(path.join(PROJECT_ROOT, docs[3]), 'utf8');
  for (const [label, limit] of [
    ['已派子代理', 8],
    ['WorkSet 规模', 8],
    ['Worker 数', 3],
    ['Research pass', 1],
    ['子代理嵌套', 1],
  ]) {
    assert(
      new RegExp(`\`${label}\`[^|]*\\|\\s*≤\\s*${limit}`).test(zh) ||
        new RegExp(`\`${label}\`[^|]*≤ ${limit}`).test(zh),
      `zh production-control.md 里 "${label}" 的默认上限不是 ${limit}`,
    );
  }
  // CLI 侧同源：骨架确实写的就是这些上限（用例 ㉞ 已逐行断言，这里做一次交叉核对）
  const dir = initDir('f2-doc-crosscheck');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 0 / 8', 'CLI 骨架 已派子代理 上限');
  assertEq(counterLine(dir, 'WorkSet 规模'), '- WorkSet 规模: 0 / 8', 'CLI 骨架 WorkSet 规模 上限');
  assertEq(counterLine(dir, 'Worker 数'), '- Worker 数: 0 / 3', 'CLI 骨架 Worker 数 上限');
  assertEq(counterLine(dir, 'Research pass'), '- Research pass: 0 / 1', 'CLI 骨架 Research pass 上限');
  assertEq(counterLine(dir, '子代理嵌套'), '- 子代理嵌套: 0 / 1', 'CLI 骨架 子代理嵌套 上限');
});

/* ──────────────────────────────── 运行器 ──────────────────────────────── */

const failures = [];
let passed = 0;
let skipped = 0;

process.stdout.write(
  `runstate v2 测试 · CLI=${CLI} · Node ${process.version}\n` +
    `临时工作目录：${tmpRoot}（跑完自动清理）\n` +
    (FORCE_FAIL
      ? '⚠ RS_TEST_FORCE_FAIL=1：已注入用例 ② 的失败期望（check 退出码），本次结果应为 FAIL 且退出码非 0\n'
      : FORCE_FAIL_GATE
        ? '⚠ RS_TEST_FORCE_FAIL=2：已注入用例 ⑨ 的失败期望（gate JSON.allow），本次结果应为 FAIL 且退出码非 0\n'
        : '') +
    '\n',
);

try {
  for (const [i, c] of cases.entries()) {
    const tag = `[${i + 1}/${cases.length}]`;
    try {
      c.fn();
      passed += 1;
      process.stdout.write(`PASS ${tag} ${c.name}\n`);
    } catch (err) {
      if (err instanceof SkipCase) {
        // 条件跳过：可见地打印 SKIP，且**不**递增 passed（跳过 ≠ 通过）。
        skipped += 1;
        process.stdout.write(`SKIP ${tag} ${c.name}\n`);
        process.stdout.write(`      ↳ ${err.message}\n`);
      } else {
        failures.push(c.name);
        process.stdout.write(`FAIL ${tag} ${c.name}\n`);
        process.stdout.write(`      ↳ ${err && err.message ? err.message : String(err)}\n`);
      }
    }
  }
} finally {
  // 只删本脚本在系统临时目录下自建的根目录，绝不触碰仓库。
  // 已知例外（同原型，仓储所有者 2026-09-12 已确认）：这里用 fs.rmSync 是**彻底删除**（不进回收站），
  // 与"删除进回收站"铁律有张力 —— Node 零依赖没有"送进回收站"的内置 API。
  // 作用域由下一行双重校验锁死为「os.tmpdir() 下、以 runstate-v2-tests- 开头」的目录，
  // 即本脚本运行开始时刚刚自己创建的目录；两重前缀任一不满足就整体跳过清理。
  if (tmpRoot.startsWith(tmpBase + path.sep) && path.basename(tmpRoot).startsWith('runstate-v2-tests-')) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`⚠ 临时目录路径未通过双重前缀校验，跳过清理：${tmpRoot}\n`);
  }
}

// 计数自洽：通过 + 跳过 + 失败 必须恰好覆盖全部用例（跳过绝不能被算进通过数）。
if (passed + skipped + failures.length !== cases.length) {
  process.stdout.write(
    `FAIL 计数自洽性：通过 ${passed} + 跳过 ${skipped} + 失败 ${failures.length} ≠ 用例总数 ${cases.length}\n`,
  );
  failures.push('计数自洽性');
}

process.stdout.write(
  `\n用例总数 ${cases.length}，通过 ${passed}，跳过 ${skipped}，失败 ${failures.length}\n` +
    (failures.length > 0
      ? `失败用例：${failures.join('；')}\n`
      : skipped > 0
        ? `无失败 ✔（另有 ${skipped} 条条件跳过，未计入通过数）\n`
        : '全部通过 ✔（无跳过）\n'),
);

process.exitCode = failures.length === 0 ? 0 : 1;
