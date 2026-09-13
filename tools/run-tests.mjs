#!/usr/bin/env node
/**
 * runstate v2 自动化测试（卡 C1 + 补卡 C1b，零依赖；由 docs/evidence/runstate-cli/tests/run-tests.mjs 升格）
 *
 * 覆盖：两级预算（Run / Mission）、advance 组合语义与原子拒绝、check/status/resume/gate、
 *       new-run（Run 边界机械续跑：Run 级四项归零 + Mission Run +1，Mission Run 触顶则拒绝）。
 *
 * 设计要点：
 *   - 只用 node: 内置模块；通过 child_process 调本仓 tools/runstate.js（只看黑盒行为，不依赖内部实现）。
 *   - 全部用例在系统临时目录（os.tmpdir() 下新建目录）内运行，结束自行清理；
 *     绝不读写项目根 / docs 下的任何文件（用例 ⑬ 与附加守卫专门比对它们前后哈希）。
 *   - 逐条打印 PASS/FAIL，结束打印用例总数与失败数；全绿 exit 0，任一失败 exit 1。
 *   - 失败路径自检：设置 RS_TEST_FORCE_FAIL=1 会把一处期望值写反，
 *     用来证明"失败会被如实上报、退出码非 0"。
 *
 * 用法：
 *   node tools/run-tests.mjs                        正常跑，期望全绿 exit 0
 *   RS_TEST_FORCE_FAIL=1 node tools/run-tests.mjs   失败注入，期望 FAIL 且 exit 1
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

/** 失败注入开关：为 true 时把「合法骨架 check」的期望退出码写成 1 与真实行为不符。 */
const FORCE_FAIL = process.env.RS_TEST_FORCE_FAIL === '1';

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

/* ───────────────────────────────── 用例 ───────────────────────────────── */

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
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
  // repairs / runs 的组合语义
  assertEq(runCli(['advance', dir, 'repairs']).status, 0, 'advance repairs 退出码');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 1 / 1', 'Run 级已用 Repair 行');
  assertEq(counterLine(dir, '总 Repair'), '- 总 Repair: 1 / 3', 'Mission 级总 Repair 行');
  const runs = runCli(['advance', dir, 'runs']);
  assertEq(runs.status, 0, 'advance runs 退出码');
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 3', 'Mission 级 Run 行');
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'runs 不该动 Run 级 Epoch');
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
  assertEq(parsed.run.counters.length, 4, 'Run 级计数器条数');
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
  assertEq(parsed.allow, false, 'JSON.allow');
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
    // 任务卡写的是"若存在"：本仓根目录当前没有 RUN_STATE.md，条件用例按跳过处理（不算失败）。
    process.stdout.write('      ↳ 项目根无 RUN_STATE.md：条件用例跳过（条件：若存在）\n');
    return;
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
  assertEq(parsed.run.counters.length, 4, 'JSON run 计数器条数');
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
  assertEq(runCli(['advance', dir, 'repairs']).status, 0, 'advance repairs');
  assertEq(runCli(['advance', dir, 'subagents']).status, 0, 'advance subagents');
  // 前置：Run 级四项都被推到非零，Mission 级总量也各自 +1
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 1 / 2', '推进后 Epoch');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', '推进后 完成卡数');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 1 / 1', '推进后 已用 Repair');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 1', '推进后 已派子代理');
  assertEq(counterLine(dir, 'Run'), '- Run: 0 / 3', 'new-run 前 Mission Run');

  const r = runCli(['new-run', dir]);
  assertEq(r.status, 0, 'new-run 退出码');
  // Run 级四项归零（不改上限、不动其它节）
  assertEq(counterLine(dir, 'Epoch'), '- Epoch: 0 / 2', 'new-run 后 Epoch');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 0 / 6', 'new-run 后 完成卡数');
  assertEq(counterLine(dir, '已用 Repair'), '- 已用 Repair: 0 / 1', 'new-run 后 已用 Repair');
  assertEq(counterLine(dir, '已派子代理'), '- 已派子代理: 0', 'new-run 后 已派子代理');
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
  assertEq(runCli(['advance', dir, 'runs']).status, 0, '推到 Mission Run 上限');
  assertEq(counterLine(dir, 'Run'), '- Run: 1 / 1', 'Mission Run 已在上限');
  // 顺便把 Run 级推一格，用来证明拒绝时不会被部分重置
  assertEq(runCli(['advance', dir, 'cards']).status, 0, 'advance cards');
  assertEq(counterLine(dir, '完成卡数'), '- 完成卡数: 1 / 6', 'new-run 前的 Run 级完成卡数');

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

/* ──────────────────────────────── 运行器 ──────────────────────────────── */

const failures = [];
let passed = 0;

process.stdout.write(
  `runstate v2 测试 · CLI=${CLI} · Node ${process.version}\n` +
    `临时工作目录：${tmpRoot}（跑完自动清理）\n` +
    (FORCE_FAIL ? '⚠ RS_TEST_FORCE_FAIL=1：已注入一处失败期望，本次结果应为 FAIL 且退出码非 0\n' : '') +
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
      failures.push(c.name);
      process.stdout.write(`FAIL ${tag} ${c.name}\n`);
      process.stdout.write(`      ↳ ${err && err.message ? err.message : String(err)}\n`);
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

process.stdout.write(
  `\n用例总数 ${cases.length}，通过 ${passed}，失败 ${failures.length}\n` +
    (failures.length > 0 ? `失败用例：${failures.join('；')}\n` : '全部通过 ✔\n'),
);

process.exitCode = failures.length === 0 ? 0 : 1;
