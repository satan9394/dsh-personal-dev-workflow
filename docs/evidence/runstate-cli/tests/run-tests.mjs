#!/usr/bin/env node
/**
 * runstate 最小自动化测试（卡 005，零依赖）
 *
 * 设计要点：
 *   - 只用 node: 内置模块；通过 child_process 调本仓 runstate.js（不看内部实现，只测黑盒行为）。
 *   - 全部用例在系统临时目录（os.tmpdir() 下新建目录）内运行，结束自行清理，
 *     绝不读写项目根的 RUN_STATE.md（最后一条用例专门比对它前后哈希）。
 *   - 逐条打印 PASS/FAIL，结束打印用例总数与失败数；全绿 exit 0，任一失败 exit 1。
 *   - 失败路径自检：设置 RS_TEST_FORCE_FAIL=1 会故意把一处期望值写反，
 *     用来证明"失败会被如实上报、退出码非 0"（详见 README/任务卡 005）。
 *
 * 用法：
 *   node tests/run-tests.mjs                      正常跑，期望全绿 exit 0
 *   RS_TEST_FORCE_FAIL=1 node tests/run-tests.mjs 失败注入，期望 exit 1
 */
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PROJECT_ROOT, 'runstate.js');
const STATE_FILE = 'RUN_STATE.md';

/** 失败注入开关：为 true 时把「合法骨架 check」的期望退出码写成 1 与真实行为不符。 */
const FORCE_FAIL = process.env.RS_TEST_FORCE_FAIL === '1';

/** 项目根状态文件（只读一次哈希做基线，全程不该被本脚本改动）。 */
const ROOT_STATE = path.join(PROJECT_ROOT, STATE_FILE);
const rootHashBefore = fs.existsSync(ROOT_STATE) ? sha256(ROOT_STATE) : null;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

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

/* ───────────────────────── 临时目录与状态文件工具 ───────────────────────── */

const tmpBase = fs.realpathSync(os.tmpdir());
const tmpRoot = fs.mkdtempSync(path.join(tmpBase, 'runstate-tests-'));

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

/** 取 Budget 里的某一行原文（找不到即视为断言失败）。 */
function budgetLine(dir, label) {
  const line = readState(dir)
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`- ${label}:`));
  if (line === undefined) throw new Error(`状态文件里找不到计数行 "- ${label}: …"`);
  return line.trim();
}

/* ───────────────────────────────── 用例 ───────────────────────────────── */

const cases = [];
function test(name, fn) {
  cases.push({ name, fn });
}

// ① init 生成 11 个 "## " 节
test('init 生成 11 个 "## " 节', () => {
  const dir = newDir('init');
  const r = runCli(['init', dir]);
  assertEq(r.status, 0, 'init 退出码');
  const headings = readState(dir).split(/\r?\n/).filter((l) => /^##\s+\S/.test(l));
  assertEq(headings.length, 11, '"## " 节数量');
  for (const name of [
    'Mission',
    'Definition of Done',
    'Out of scope',
    'Mode',
    'Active Workset',
    'Blocked',
    'Deferred Backlog',
    'Budget',
    'Last verified commit',
    'Resume From',
    'Notes for the next run',
  ]) {
    assert(readState(dir).includes(`## ${name}`), `骨架缺少节 "## ${name}"`);
  }
});

// ② 合法骨架 check → exit 0
test('合法骨架 check → exit 0', () => {
  const dir = newDir('check-ok');
  assertEq(runCli(['init', dir]).status, 0, 'init 退出码');
  const r = runCli(['check', dir]);
  // FORCE_FAIL 注入点：故意与真实行为（0）不符，用于实测失败路径。
  const expected = FORCE_FAIL ? 1 : 0;
  assertEq(r.status, expected, 'check 退出码' + (FORCE_FAIL ? '（RS_TEST_FORCE_FAIL 注入的期望值）' : ''));
  assert(r.stdout.includes('检查结果: 通过'), 'check 未打印 "检查结果: 通过"');
});

// ③ 正常 advance cards → exit 0 且文件内该行变为 1 / N
test('advance cards 正常 → exit 0 且该行变为 "1 / N"', () => {
  const dir = newDir('advance-ok');
  assertEq(runCli(['init', dir]).status, 0, 'init 退出码');
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 0, 'advance 退出码');
  const line = budgetLine(dir, '完成卡数');
  assert(/^-\s*完成卡数:\s*1\s*\/\s*\d+\s*$/.test(line), `该行应为 "- 完成卡数: 1 / N"，实际 "${line}"`);
  assertEq(line, '- 完成卡数: 1 / 6', '该行内容（骨架默认上限 6）');
});

// ④ 越界 advance → exit 1 且文件 SHA256 前后一致（原子性）
test('越界 advance → exit 1 且文件 SHA256 前后一致（原子性）', () => {
  const dir = newDir('advance-overflow');
  assertEq(runCli(['init', dir]).status, 0, 'init 退出码');
  for (let i = 1; i <= 6; i++) {
    assertEq(runCli(['advance', dir, 'cards']).status, 0, `第 ${i} 次 advance 退出码`);
  }
  assertEq(budgetLine(dir, '完成卡数'), '- 完成卡数: 6 / 6', '推满上限后的行');

  const before = sha256(statePath(dir));
  const r = runCli(['advance', dir, 'cards']);
  assertEq(r.status, 1, '越界 advance 退出码');
  assert(/预算守卫/.test(r.stderr), `越界后 stderr 未提到预算守卫：${r.stderr.trim()}`);
  assertEq(sha256(statePath(dir)), before, '越界后文件 SHA256（原子性）');
});

// ⑤ 非法当前值 "- 完成卡数: abc / 2" → check exit ≠ 0
test('非法当前值 "- 完成卡数: abc / 2" → check exit ≠ 0', () => {
  const dir = newDir('bad-current');
  assertEq(runCli(['init', dir]).status, 0, 'init 退出码');
  writeState(dir, readState(dir).replace('- 完成卡数: 0 / 6', '- 完成卡数: abc / 2'));
  const r = runCli(['check', dir]);
  assert(r.status !== 0, `check 退出码应非 0，实际 ${r.status}`);
  assert(/格式非法/.test(r.stderr), `stderr 未指出格式非法：${r.stderr.trim()}`);
  assert(/第 \d+ 行/.test(r.stderr), `stderr 未指出行号：${r.stderr.trim()}`);
});

// ⑥ 非法上限 "- 完成卡数: 1 / xyz" → check exit ≠ 0
test('非法上限 "- 完成卡数: 1 / xyz" → check exit ≠ 0', () => {
  const dir = newDir('bad-limit');
  assertEq(runCli(['init', dir]).status, 0, 'init 退出码');
  writeState(dir, readState(dir).replace('- 完成卡数: 0 / 6', '- 完成卡数: 1 / xyz'));
  const r = runCli(['check', dir]);
  assert(r.status !== 0, `check 退出码应非 0，实际 ${r.status}`);
  assert(/格式非法/.test(r.stderr), `stderr 未指出格式非法：${r.stderr.trim()}`);
});

// ⑦ --help → exit 0
test('--help → exit 0 且打印用法', () => {
  const r = runCli(['--help']);
  assertEq(r.status, 0, '--help 退出码');
  assert(r.stdout.includes('用法'), '--help 未打印 "用法"');
  assert(r.stdout.includes('退出码'), '--help 未打印退出码约定');
});

// ⑧ 未知子命令 → exit 2
test('未知子命令 → exit 2', () => {
  const r = runCli(['frobnicate']);
  assertEq(r.status, 2, '未知子命令退出码');
  assert(/未知子命令/.test(r.stderr), `stderr 未指出未知子命令：${r.stderr.trim()}`);
});

// ⑨ 附带守卫：项目根 RUN_STATE.md 全程未被本脚本触碰
test('项目根 RUN_STATE.md 未被本脚本触碰', () => {
  assert(rootHashBefore !== null, '项目根缺少 RUN_STATE.md（基线哈希为空）');
  assert(fs.existsSync(ROOT_STATE), '项目根 RUN_STATE.md 消失了');
  assertEq(sha256(ROOT_STATE), rootHashBefore, '项目根 RUN_STATE.md SHA256');
});

/* ──────────────────────────────── 运行器 ──────────────────────────────── */

const failures = [];
let passed = 0;

process.stdout.write(
  `runstate 最小测试 · CLI=${CLI} · Node ${process.version}\n` +
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
  // 只删本脚本在系统临时目录下自建的根目录，绝不触碰项目根。
  if (tmpRoot.startsWith(tmpBase + path.sep) && path.basename(tmpRoot).startsWith('runstate-tests-')) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

process.stdout.write(
  `\n用例总数 ${cases.length}，通过 ${passed}，失败 ${failures.length}\n` +
    (failures.length > 0 ? `失败用例：${failures.join('；')}\n` : '全部通过 ✔\n'),
);

process.exitCode = failures.length === 0 ? 0 : 1;
