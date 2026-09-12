#!/usr/bin/env node
/**
 * runstate — 零依赖 RUN_STATE.md 状态机 CLI
 *
 * 卡 001 范围：子命令分派骨架 + init + check + --help。
 * 卡 002 范围：advance 落地（Budget 计数 +1 写回）+ 预算守卫 + check 预算门禁。
 * 卡 004 范围：Budget 计数行严格校验——当前值/上限不是合法整数即报错（不再静默跳过）。
 * 只使用 node:fs / node:path / process.argv，无任何 npm 依赖。
 *
 * 退出码约定：
 *   0 = 成功
 *   1 = 状态/校验错误（文件缺失、必需节缺失等）
 *   2 = 用法错误（未知子命令、缺参数）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = 'RUN_STATE.md';

/** init 生成的骨架里必须出现的二级标题节（顺序即模板顺序）。 */
const REQUIRED_SECTIONS = [
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
];

/** check 至少要求存在的节（卡 001 验收门禁）。 */
const CHECK_SECTIONS = [
  'Mission',
  'Definition of Done',
  'Active Workset',
  'Budget',
  'Resume From',
];

const EXIT_OK = 0;
const EXIT_STATE = 1;
const EXIT_USAGE = 2;

const USAGE = `runstate — 零依赖 RUN_STATE.md 状态机 CLI

用法:
  node runstate.js --help              显示本帮助
  node runstate.js init <dir>          在 <dir> 生成/覆盖 ${STATE_FILE} 骨架
  node runstate.js check <dir>         校验 <dir>/${STATE_FILE} 必需节并汇总预算
  node runstate.js advance <dir> <field>
                                       推进 <dir>/${STATE_FILE} 中的计数字段

子命令:
  init     生成 RUN_STATE.md 骨架（含 Mission / Definition of Done / Out of scope /
           Mode / Active Workset / Blocked / Deferred Backlog / Budget /
           Last verified commit / Resume From / Notes for the next run）
  check    读取 RUN_STATE.md，校验必需节（Mission / Definition of Done /
           Active Workset / Budget / Resume From）并打印 Budget 计数行汇总
  advance  递增 Budget 计数器并强制预算上限；加一后超过上限则拒绝且不改文件。
           字段别名: epoch（Epoch） / cards（完成卡数） /
                     repairs（已用 Repair） / subagents（已派子代理）

退出码:
  0  成功
  1  状态或校验错误（文件缺失、必需节缺失等）
  2  用法错误（未知子命令、缺少参数）
`;

/** 写到 stderr 并返回状态码（统一错误出口，绝不静默通过）。 */
function fail(message, code) {
  process.stderr.write(`runstate: 错误: ${message}\n`);
  return code;
}

function warn(message) {
  process.stderr.write(`runstate: 提示: ${message}\n`);
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

/** RUN_STATE.md 模板；占位符只在 init 时替换。 */
function renderTemplate() {
  return `# DEV RUN STATE

## Mission
（待填写：本轮要交付的一句话目标）

## Definition of Done
- [ ] （待填写：可客观验证的完成标准）

## Out of scope
- （待填写：本轮明确不做的事）

## Mode
development

## Active Workset
- （空）

## Blocked
- （空）

## Deferred Backlog（是记忆，不是队列）
- （空）

## Budget
- Epoch: 0 / 3
- 完成卡数: 0 / 6
- 已用 Repair: 0 / 1
- 已派子代理: 0

## Last verified commit
（尚未提交）

## Resume From
（待填写：下一个要执行的卡号）

## Notes for the next run
- （待填写：交接备注）
`;
}

/**
 * 解析 markdown 的二级标题节。
 * 返回 Map<节名全称, {title, lines}>，按出现顺序。
 * 标题带括号后缀（如 "Deferred Backlog（是记忆，不是队列）"）时另存 base 名便于前缀匹配。
 */
function parseSections(text) {
  const sections = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^##\s+(.*\S)\s*$/.exec(raw);
    if (m) {
      const title = m[1];
      // base：去掉全角/半角括号及其后面的说明，只留小节本体名
      const base = title.split(/[（(]/)[0].trim();
      current = { title, base, lines: [] };
      sections.set(title, current);
      continue;
    }
    if (current) current.lines.push(raw);
  }
  return sections;
}

/** 以「去括号前缀 + 大小写不敏感」匹配节，兼容 "Deferred Backlog（…）" 这类变体。 */
function findSection(sections, wanted) {
  const target = wanted.toLowerCase();
  for (const section of sections.values()) {
    if (section.base.toLowerCase() === target) return section;
  }
  return null;
}

/**
 * advance 的字段别名 → Budget 行标签全称。
 * 别名只做入口糖，落盘时始终沿用文件里原本的标签写法。
 */
const FIELD_ALIASES = new Map([
  ['epoch', 'Epoch'],
  ['cards', '完成卡数'],
  ['repairs', '已用 Repair'],
  ['subagents', '已派子代理'],
]);

/** 可用字段提示（非法字段时打印，方便纠错）。 */
function fieldList() {
  return [...FIELD_ALIASES.entries()].map(([alias, label]) => `${alias}（${label}）`).join(' / ');
}

/** 按「含行尾符」切行：未改动的行原样拼接回去，保证字节级不变。 */
function splitLines(text) {
  return text.split(/(?<=\n)/);
}

/**
 * 计数行的项目符号形式：`- 标签: 值`（`*` 与全角冒号同样接受）。
 * 分组：1=项目符号前导 2=标签 3=冒号与空白 4=值（保留原始写法，便于原样回写）
 */
const BUDGET_LINE_RE = /^(\s*[-*]\s*)([^:：]+?)(\s*[:：]\s*)(.*)$/;

/**
 * 严格解析计数值：`当前整数 [ / 上限整数 ] [行内备注]`。
 *
 * 合法 → { current, limit, note, digits }；当前值或上限不是合法整数 → null。
 * 区分「合法但无上限」与「格式非法」的界线：
 *   - 没有 "/" 分隔符 → 合法，limit = null（如 `- 已派子代理: 0`）；
 *     但值以 "/" 或全角 "／" 开头（如 `0 /`、`0 ／ 3`）→ 非法：本想写上限，
 *     少写/写错了上限，绝不能当作「无上限」放行。
 *   - 有 "/" → 斜杠两侧都必须是纯整数；任一侧不是（`abc / 2`、`1 / xyz`）→ 非法。
 *   - 数字之后的备注允许以空白、括号、箭头或非 ASCII 字符开头
 *     （`- 已派子代理: 3（累计…）`、`- Epoch: 0 / 3  ← 说明` 都合法），
 *     紧贴 ASCII 字母/标点的写法（`0abc`、`1.5`、`2x`）视为格式非法。
 * 备注内部不再做限制：`/` 只在前两层出现时才有「上限」含义。
 */
function parseCounterValue(rawValue) {
  const value = rawValue.trim();
  const cur = /^(\d+)/.exec(value);
  if (!cur) return null; // 当前值不是整数（如 "abc / 2"）
  const digits = cur[1];
  let rest = value.slice(digits.length);
  let limit = null;

  const slash = /^\s*\/\s*/.exec(rest);
  if (slash) {
    rest = rest.slice(slash[0].length);
    const lim = /^(\d+)/.exec(rest);
    if (!lim) return null; // 有 "/" 却取不出上限整数（如 "1 / xyz"、"1 /"）
    limit = Number(lim[1]);
    rest = rest.slice(lim[1].length);
  } else if (/^[／/]/.test(rest.trim())) {
    return null; // 斜杠没走成 "当前 / 上限"（全角 ／ 等）：按格式非法处理
  }

  // 剩余部分只能是空串，或「分隔符 + 备注」；否则就是 "0abc" 这类写坏的值
  if (rest !== '' && !/^(\s|[（(←]|[^\x00-\x7F])/.test(rest)) return null;

  return { current: Number(digits), limit, note: rest, digits };
}

/**
 * 扫描 Budget 节内的计数行（`- 标签: 值`），带 1 基行号与原地回写所需的 prefix/tail。
 * 值部分由 parseCounterValue 严格解析：parsed === null 即「该行格式非法」。
 * 只认严格整数值，避免把 "0 张"、"abc / 2" 之类写坏（写坏了要报错，不能当没看见）。
 */
function scanBudgetLines(text) {
  const lines = splitLines(text);
  const found = [];
  let inBudget = false;
  for (let i = 0; i < lines.length; i++) {
    const eol = (/\r?\n$/.exec(lines[i]) || [''])[0];
    const body = lines[i].slice(0, lines[i].length - eol.length);
    const heading = /^##\s+(.*\S)\s*$/.exec(body);
    if (heading) {
      inBudget = heading[1].split(/[（(]/)[0].trim().toLowerCase() === 'budget';
      continue;
    }
    if (!inBudget) continue;
    const m = BUDGET_LINE_RE.exec(body);
    if (!m) continue;
    const rawValue = m[4];
    const parsed = parseCounterValue(rawValue);
    const entry = {
      index: i,
      lineNo: i + 1,
      eol,
      body,
      label: m[2].trim(),
      rawValue: rawValue.trim(),
      parsed,
    };
    if (parsed) {
      // 只替换当前整数的数字位，其余字节原样保留（前缀 + tail 直接拼回）
      const head = m[1] + m[2] + m[3];
      const start = head.length + (rawValue.length - rawValue.replace(/^\s+/, '').length);
      entry.prefix = body.slice(0, start);
      entry.tail = body.slice(start + parsed.digits.length);
      entry.current = parsed.current;
      entry.limit = parsed.limit;
    }
    found.push(entry);
  }
  return found;
}

/** 「格式非法」的统一说明：指出行号 + 原行内容（便于定位笔误）。 */
function malformedMessage(entry) {
  return (
    `Budget 第 ${entry.lineNo} 行格式非法（计数行须形如 "- 标签: 当前整数 / 上限整数"，` +
    `斜杠用 ASCII "/"）: "${entry.body}"`
  );
}

function resolveStatePath(dir) {
  return path.join(dir, STATE_FILE);
}

/** 读取状态文件；失败时返回 {error} 而不是抛异常。 */
function readState(statePath) {
  if (!fs.existsSync(statePath)) {
    return { error: `${statePath} 不存在（该目录内没有 ${STATE_FILE}，请先运行 init）` };
  }
  try {
    return { text: fs.readFileSync(statePath, 'utf8') };
  } catch (err) {
    return { error: `无法读取 ${statePath}：${err.message}` };
  }
}

/** init <dir>：生成或覆盖 RUN_STATE.md 骨架。 */
function cmdInit(argv) {
  const dir = argv[0];
  if (!dir) return fail('init 需要一个参数：目标目录（用法：node runstate.js init <dir>）', EXIT_USAGE);

  const target = path.resolve(dir);
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    return fail(`无法创建目录 ${target}：${err.message}`, EXIT_STATE);
  }

  const statePath = resolveStatePath(target);
  const existed = fs.existsSync(statePath);
  try {
    fs.writeFileSync(statePath, renderTemplate(), 'utf8');
  } catch (err) {
    return fail(`无法写入 ${statePath}：${err.message}`, EXIT_STATE);
  }

  if (existed) warn(`已覆盖已存在的 ${statePath}`);
  info(`已写入 ${statePath}`);
  info(`包含节: ${REQUIRED_SECTIONS.join(' / ')}`);
  return EXIT_OK;
}

/** check <dir>：校验必需节 + 汇总 Budget 计数行。 */
function cmdCheck(argv) {
  const dir = argv[0];
  if (!dir) return fail('check 需要一个参数：目标目录（用法：node runstate.js check <dir>）', EXIT_USAGE);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);

  if (!fs.existsSync(statePath)) {
    return fail(`${statePath} 不存在（该目录内没有 ${STATE_FILE}，请先运行 init ${dir}）`, EXIT_STATE);
  }

  let text;
  try {
    text = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    return fail(`无法读取 ${statePath}：${err.message}`, EXIT_STATE);
  }

  const sections = parseSections(text);
  const missing = CHECK_SECTIONS.filter((name) => !findSection(sections, name));

  info(`检查 ${statePath}`);
  info(`发现章节 (${sections.size}): ${[...sections.values()].map((s) => s.base).join(' / ')}`);

  if (missing.length > 0) {
    process.stderr.write(`runstate: 错误: 缺少必需节: ${missing.join(' / ')}\n`);
    info(`检查结果: 失败（缺少 ${missing.length} 个必需节）`);
    return EXIT_STATE;
  }

  info(`必需节: ${CHECK_SECTIONS.join(' / ')} — 全部存在`);

  // 严格门禁：Budget 节内每个「标签: 值」行都必须是合法计数行。
  // 容错解析会让笔误（"- 完成卡数: abc / 2"）被静默跳过，等于关掉该计数器的守卫。
  const budgetLines = scanBudgetLines(text);
  const malformed = budgetLines.filter((line) => line.parsed === null);
  if (malformed.length > 0) {
    for (const line of malformed) {
      process.stderr.write(`runstate: 错误: ${malformedMessage(line)}\n`);
    }
    info(`检查结果: 失败（${malformed.length} 条 Budget 计数行格式非法）`);
    return EXIT_STATE;
  }

  const entries = budgetLines;
  if (entries.length === 0) {
    process.stderr.write('runstate: 错误: Budget 节内没有可识别的计数行（形如 "- Epoch: 0 / 3"）\n');
    info('检查结果: 失败（Budget 无计数行）');
    return EXIT_STATE;
  }

  info('Budget 汇总:');
  for (const entry of entries) {
    // 原样回显值（含行内备注），与卡 004 之前的汇总输出逐字一致
    info(`  - ${entry.label}: ${entry.rawValue}`);
  }

  // 预算门禁：任一有限额计数器达到或超过上限即失败（指明是哪个计数器）。
  const exhausted = [];
  for (const entry of entries) {
    if (entry.limit === null) continue;
    if (entry.current >= entry.limit) exhausted.push(`${entry.label} ${entry.current} / ${entry.limit}`);
  }
  if (exhausted.length > 0) {
    process.stderr.write(`runstate: 错误: 预算已达上限: ${exhausted.join('，')}\n`);
    info(`检查结果: 失败（预算已达上限: ${exhausted.join('，')}）`);
    return EXIT_STATE;
  }

  info(`检查结果: 通过（${entries.length} 条预算计数行，均在限额内）`);
  return EXIT_OK;
}

/**
 * advance <dir> <field>：把 Budget 计数器 +1 并写回。
 *
 * 原子性：先做全部校验与预算判断，只有确定可以写入时才落盘；
 * 任何拒绝路径都直接返回，绝不触碰文件（拒绝后文件字节不变）。
 */
function cmdAdvance(argv) {
  const dir = argv[0];
  const field = argv[1];
  if (!dir || !field) {
    process.stderr.write('runstate: 错误: advance 需要两个参数：<dir> <field>\n');
    process.stderr.write('用法: node runstate.js advance <dir> <field>\n');
    process.stderr.write(`可用字段: ${fieldList()}\n`);
    return EXIT_USAGE;
  }

  const alias = field.toLowerCase();
  if (!FIELD_ALIASES.has(alias)) {
    process.stderr.write(`runstate: 错误: 未知字段 "${field}"\n`);
    process.stderr.write(`可用字段: ${fieldList()}\n`);
    return EXIT_USAGE;
  }
  const wantedLabel = FIELD_ALIASES.get(alias);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);

  const read = readState(statePath);
  if (read.error) return fail(read.error, EXIT_STATE);
  const text = read.text;

  const budgetLines = scanBudgetLines(text);
  if (budgetLines.length === 0) {
    return fail(`Budget 节内没有可识别的计数行（形如 "- Epoch: 0 / 3"）`, EXIT_STATE);
  }

  const sameLabel = (line) => line.label.toLowerCase() === wantedLabel.toLowerCase();

  // 目标计数器所在行格式非法 → 拒绝；拒绝路径在写文件之前返回，文件字节不变。
  const broken = budgetLines.find((line) => sameLabel(line) && line.parsed === null);
  if (broken) {
    return fail(`${malformedMessage(broken)}；文件未做任何修改`, EXIT_STATE);
  }

  const entry = budgetLines.find(sameLabel);
  if (!entry) {
    const labels = budgetLines.map((e) => e.label).join(' / ');
    return fail(`${statePath} 的 Budget 节里没有 "${wantedLabel}"（字段 ${alias}）；现有计数行: ${labels}`, EXIT_STATE);
  }

  // 预算守卫：加一后会超过上限就拒绝，且不写文件。
  const next = entry.current + 1;
  if (entry.limit !== null && next > entry.limit) {
    process.stderr.write(
      `runstate: 错误: 预算守卫拒绝递增：${entry.label} 已达上限 ${entry.current} / ${entry.limit}` +
        `（再 +1 会变成 ${next} / ${entry.limit}）\n`,
    );
    process.stderr.write('文件未做任何修改。\n');
    return EXIT_STATE;
  }

  const lines = splitLines(text);
  lines[entry.index] = entry.prefix + String(next) + entry.tail + entry.eol;
  const updated = lines.join('');

  try {
    fs.writeFileSync(statePath, updated, 'utf8');
  } catch (err) {
    return fail(`无法写入 ${statePath}：${err.message}`, EXIT_STATE);
  }

  info(`字段 ${alias} → ${entry.label}`);
  info(
    `已推进 ${entry.label}: ${entry.current} → ${next}` +
      (entry.limit === null ? '（无上限）' : ` / ${entry.limit}`),
  );
  info(`已写回 ${statePath}`);
  return EXIT_OK;
}

function main(argv) {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }
  if (command === 'init') return cmdInit(rest);
  if (command === 'check') return cmdCheck(rest);
  if (command === 'advance') return cmdAdvance(rest);

  const code = fail(`未知子命令 "${command}"（可用: init / check / advance / --help）`, EXIT_USAGE);
  process.stderr.write(USAGE);
  return code;
}

process.exitCode = main(process.argv.slice(2));
