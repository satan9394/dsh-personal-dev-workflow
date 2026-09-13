#!/usr/bin/env node
/**
 * runstate — 零依赖 RUN_STATE.md 状态机 CLI（v2：Run / Mission 两级预算 + 机器闸门）
 *
 * 来源：由 docs/evidence/runstate-cli/runstate.js（v1，含 init/check/advance）升格而来。
 * v2 新增：
 *   - `## Mission Budget` 节（第二个二级标题节），与 `## Budget` 组成两级预算：
 *       Run 级（一次 run / 一个上下文内）  = Budget 节
 *       Mission 级（跨 run 的总量）        = Mission Budget 节
 *   - `advance` 支持 mission 级别名（runs / totalcards / totalrepairs）；
 *     `cards` / `repairs` 同时递增两级，任一级触顶即整体拒绝（原子：文件字节不变）。
 *   - `status`（两级预算摘要，--json 机器可读）、`resume`（恢复计划）、`gate`（机器闸门 JSON）。
 *   - `new-run`（开新 Run）：Run 级四项计数归零、Mission 级 `Run` +1；Mission `Run` 触顶则拒绝
 *     （退出 1、文件字节不变）。**仅 Run 预算耗尽时走这条路，不需要人工确认**；
 *     只有 Mission 预算耗尽才升级给人。
 *   - 向后兼容：旧文件缺 `## Mission Budget` 节时按「无上限 + 警告」处理。
 *
 * 只使用 node:fs / node:path / process，无任何 npm 依赖；CommonJS（仓库根 package.json 为 "type": "commonjs"）。
 *
 * 退出码约定（与 v1 一致）：
 *   0 = 成功
 *   1 = 状态/校验/预算错误（文件缺失、必需节缺失、计数行格式非法、预算触顶等）
 *   2 = 用法错误（未知子命令、缺参数、未知字段别名）
 *
 * 删除相关：本文件不包含任何删除 API（无 unlink / rm / rmdir），只做读写。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = 'RUN_STATE.md';

/** init 生成的骨架里必须出现的二级标题节（顺序即模板顺序）：原 11 节 + Mission Budget。 */
const REQUIRED_SECTIONS = [
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
];

/** check 至少要求存在的节（Run 级门禁，与 v1 相同；Mission Budget 只在存在时才校验）。 */
const CHECK_SECTIONS = [
  'Mission',
  'Definition of Done',
  'Active Workset',
  'Budget',
  'Resume From',
];

/** 两级预算各自的节名。 */
const RUN_SECTION = 'Budget';
const MISSION_SECTION = 'Mission Budget';

const EXIT_OK = 0;
const EXIT_STATE = 1;
const EXIT_USAGE = 2;

const USAGE = `runstate — 零依赖 RUN_STATE.md 状态机 CLI（Run / Mission 两级预算）

用法:
  node runstate.js --help               显示本帮助
  node runstate.js init <dir>           在 <dir> 生成/覆盖 ${STATE_FILE} 骨架（12 节）
  node runstate.js check <dir>          严格校验必需节 + 两级预算（计数行格式非法即报错）
  node runstate.js advance <dir> <field>
                                        推进计数器；任一级触顶即拒绝且文件字节不变
  node runstate.js new-run <dir>        开新 Run：Run 级四项归零 + Mission 级 Run +1
                                        （Mission Run 触顶则拒绝、exit 1、文件字节不变）
  node runstate.js status <dir> [--json]
                                        打印两级预算摘要（--json 输出机器可读 JSON）
  node runstate.js resume <dir>         打印恢复计划（Resume From + 下一步 + 是否还允许开新 Run）
  node runstate.js gate <dir>           机器闸门：stdout 打印 JSON {"allow":…,"reason":…,"run":…,"mission":…}

两级预算:
  Run 级（## ${RUN_SECTION}）        Epoch / 完成卡数 / 已用 Repair / 已派子代理
  Mission 级（## ${MISSION_SECTION}）Run / 总卡数 / 总 Repair
  旧版文件缺少 ## ${MISSION_SECTION} 节时按「无上限 + 警告」处理（向后兼容）。

advance 字段别名（大小写不敏感）:
  run 级  epoch（Epoch） / cards（完成卡数） / repairs（已用 Repair） / subagents（已派子代理）
  mission 级  runs（Run） / totalcards（总卡数） / totalrepairs（总 Repair）

  组合语义:
    cards      → Run 级「完成卡数」与 Mission 级「总卡数」各 +1
    repairs    → Run 级「已用 Repair」与 Mission 级「总 Repair」各 +1
    epoch      → 只递增 Run 级「Epoch」
    subagents  → 只递增 Run 级「已派子代理」（模板中无上限）
    runs / totalcards / totalrepairs → 只递增对应的 Mission 级计数器
  任一级的上限会被突破（当前 + 1 > 上限）→ 整体拒绝、退出 1、文件字节不变。

new-run 语义（Run 边界：机械续跑，不找人）:
  把 Run 级计数器（Epoch / 完成卡数 / 已用 Repair / 已派子代理）重置为 0；
  把 Mission 级「Run」+1（新 Run 编号 = 递增后的 Mission Run 当前值）；
  Mission 级总量（总卡数 / 总 Repair）是记忆，不重置。
  适用场景: Run 预算耗尽而 Mission 仍有余额 → 在新上下文里续跑，无需人工确认。
  拒绝条件: Mission 级「Run」已达上限（当前 >= 上限）→ 拒绝、退出 1、文件字节不变，
            此时才升级给人（加预算或收尾）。
  旧版文件缺 ## Mission Budget 节 → 按「无上限 + 警告」处理：仍重置 Run 级，跳过 Mission Run 递增。

退出码:
  0  成功
  1  状态 / 校验 / 预算错误（含：check 发现任一有限额计数器已达上限、gate 禁止、
     resume 时 Mission 预算耗尽、new-run 时 Mission Run 已达上限）
  2  用法错误（未知子命令、缺少参数、未知字段别名）

gate 语义: allow=true → exit 0；allow=false → exit 1（stdout 恒为一行合法 JSON，便于机器解析）。
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
- Epoch: 0 / 2
- 完成卡数: 0 / 6
- 已用 Repair: 0 / 1
- 已派子代理: 0

## Mission Budget
- Run: 0 / 3
- 总卡数: 0 / 12
- 总 Repair: 0 / 3

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
 * 返回 Map<节名全称, {title, base, lines}>，按出现顺序。
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

/** 取某节正文（去掉首尾空白行）；节不存在返回 null。 */
function sectionText(sections, wanted) {
  const section = findSection(sections, wanted);
  if (!section) return null;
  return section.lines.join('\n').trim();
}

/**
 * 两级预算的字段别名与推进计划。
 * 别名只做入口糖，落盘时始终沿用文件里原本的标签写法。
 */
const RUN_ALIASES = new Map([
  ['epoch', 'Epoch'],
  ['cards', '完成卡数'],
  ['repairs', '已用 Repair'],
  ['subagents', '已派子代理'],
]);

const MISSION_ALIASES = new Map([
  ['runs', 'Run'],
  ['totalcards', '总卡数'],
  ['totalrepairs', '总 Repair'],
]);

/**
 * 一次 advance 要递增的全部 (层级, 标签)。
 * 组合语义的落点：cards / repairs 同时跨两级，其余只动一级。
 */
const ADVANCE_PLAN = new Map([
  ['epoch', [{ level: 'run', label: 'Epoch' }]],
  ['cards', [{ level: 'run', label: '完成卡数' }, { level: 'mission', label: '总卡数' }]],
  ['repairs', [{ level: 'run', label: '已用 Repair' }, { level: 'mission', label: '总 Repair' }]],
  ['subagents', [{ level: 'run', label: '已派子代理' }]],
  ['runs', [{ level: 'mission', label: 'Run' }]],
  ['totalcards', [{ level: 'mission', label: '总卡数' }]],
  ['totalrepairs', [{ level: 'mission', label: '总 Repair' }]],
]);

/** 可用字段提示（非法字段时打印，方便纠错）。 */
function fieldList() {
  const run = [...RUN_ALIASES.entries()].map(([alias, label]) => `${alias}（Run 级 ${label}）`);
  const mission = [...MISSION_ALIASES.entries()].map(([alias, label]) => `${alias}（Mission 级 ${label}）`);
  return [...run, ...mission].join(' / ');
}

/**
 * new-run 重置的 Run 级计数器标签（模板顺序，与 USAGE 中列的四项一致）。
 * Mission 级「Run」由 new-run 单独 +1；Mission 级总量（总卡数 / 总 Repair）不在此列表，保留为记忆。
 */
const NEW_RUN_RESET_LABELS = ['Epoch', '完成卡数', '已用 Repair', '已派子代理'];

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
 *     （`- 已派子代理: 3（累计…）`、`- Epoch: 0 / 2  ← 说明` 都合法），
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
 * 扫描**某个**二级标题节内的计数行（`- 标签: 值`），带 1 基行号与原地回写所需的 prefix/tail。
 * 值部分由 parseCounterValue 严格解析：parsed === null 即「该行格式非法」。
 * 只认严格整数值，避免把 "0 张"、"abc / 2" 之类写坏（写坏了要报错，不能当没看见）。
 */
function scanCounterLines(text, sectionBase) {
  const lines = splitLines(text);
  const found = [];
  const target = sectionBase.toLowerCase();
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const eol = (/\r?\n$/.exec(lines[i]) || [''])[0];
    const body = lines[i].slice(0, lines[i].length - eol.length);
    const heading = /^##\s+(.*\S)\s*$/.exec(body);
    if (heading) {
      inSection = heading[1].split(/[（(]/)[0].trim().toLowerCase() === target;
      continue;
    }
    if (!inSection) continue;
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

/**
 * 读取两级预算的原始行（不做任何判定）。
 * 返回 { run, mission }，每个层级带 { name, section, present, lines }。
 */
function readLevels(text) {
  const sections = parseSections(text);
  const build = (name, section) => ({
    name,
    section,
    present: !!findSection(sections, section),
    lines: scanCounterLines(text, section),
  });
  return { run: build('run', RUN_SECTION), mission: build('mission', MISSION_SECTION) };
}

/** 层级的中文显示名（错误信息里点名用）。 */
function levelTitle(level) {
  return level.name === 'mission' ? 'Mission 预算' : 'Run 预算';
}

/** 「格式非法」的统一说明：指出节名 + 行号 + 原行内容（便于定位笔误）。 */
function malformedMessage(level, entry) {
  return (
    `## ${level.section} 第 ${entry.lineNo} 行格式非法（计数行须形如 "- 标签: 当前整数 / 上限整数"，` +
    `斜杠用 ASCII "/"）: "${entry.body}"`
  );
}

/** 计数行的机器可读形态（status --json / gate 共用）。 */
function counterJson(entry) {
  return {
    label: entry.label,
    current: entry.current,
    limit: entry.limit,
    remaining: entry.limit === null ? null : Math.max(entry.limit - entry.current, 0),
    note: entry.parsed ? entry.parsed.note.trim() : '',
  };
}

/**
 * 统一的两级预算分析：严格校验 + 触顶判定（check / status / gate / resume 共用）。
 *
 * 返回 {
 *   run, mission,     // 每级 { name, section, present, lines, counters, exhausted }
 *   errors: string[], // 状态错误（格式非法、有节但无计数行）
 *   warnings: string[],// 向后兼容警告（缺 ## Mission Budget 等）
 *   exhausted: [{ level, label, current, limit }],
 * }
 * 触顶判定：有限额且 当前 >= 上限（与 v1 一致；到达上限不拦截，再 +1 才拦截）。
 */
function analyzeLevels(text) {
  const levels = readLevels(text);
  const errors = [];
  const warnings = [];
  const exhausted = [];

  for (const level of [levels.run, levels.mission]) {
    const malformed = level.lines.filter((line) => line.parsed === null);
    for (const line of malformed) errors.push(malformedMessage(level, line));

    if (!level.present) {
      // 向后兼容：旧文件没有 ## Mission Budget → 按「无上限 + 警告」处理，不算错误。
      if (level.name === 'mission') {
        level.warning =
          `缺少 ## ${level.section} 节：按「无上限 + 警告」处理（向后兼容旧版 RUN_STATE.md）；` +
          `建议补上该节以启用 Mission 级预算`;
        warnings.push(level.warning);
      } else {
        errors.push(`缺少 ## ${level.section} 节`);
      }
    } else if (malformed.length === 0 && level.lines.length === 0) {
      errors.push(`## ${level.section} 节内没有可识别的计数行（形如 "- Epoch: 0 / 2"）`);
    }

    level.counters = level.lines.filter((line) => line.parsed !== null).map(counterJson);
    level.exhausted = false;
    for (const line of level.lines) {
      if (line.parsed === null || line.limit === null) continue;
      if (line.current >= line.limit) {
        level.exhausted = true;
        exhausted.push({
          level: level.name,
          label: line.label,
          current: line.current,
          limit: line.limit,
        });
      }
    }
  }

  return { run: levels.run, mission: levels.mission, errors, warnings, exhausted };
}

/** 触顶项 → 人话（点名是 Run 级还是 Mission 级）。 */
function exhaustedText(item) {
  const title = item.level === 'mission' ? 'Mission' : 'Run';
  return `${title}/${item.label} ${item.current} / ${item.limit}`;
}

/** 层级 → JSON（gate / status --json 共用）。 */
function levelJson(level) {
  const out = {
    section: level.section,
    present: level.present,
    exhausted: level.exhausted,
    counters: level.counters,
  };
  if (level.warning) out.warning = level.warning;
  return out;
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

/** 把向后兼容警告打一遍（stderr），供 check / status / gate / resume 复用。 */
function emitWarnings(warnings) {
  for (const w of warnings) warn(w);
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
  info(`包含 ${REQUIRED_SECTIONS.length} 个节: ${REQUIRED_SECTIONS.join(' / ')}`);
  return EXIT_OK;
}

/** check <dir>：严格校验必需节 + 两级预算（格式非法报行号；任一有限额计数器触顶即失败）。 */
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

  const analysis = analyzeLevels(text);
  emitWarnings(analysis.warnings);

  // 严格门禁：两级 Budget 节内每个「标签: 值」行都必须是合法计数行。
  // 容错解析会让笔误（"- 完成卡数: abc / 2"）被静默跳过，等于关掉该计数器的守卫。
  if (analysis.errors.length > 0) {
    for (const message of analysis.errors) process.stderr.write(`runstate: 错误: ${message}\n`);
    info(`检查结果: 失败（${analysis.errors.length} 处状态错误）`);
    return EXIT_STATE;
  }

  info(`Run 级预算（## ${RUN_SECTION}）汇总:`);
  for (const entry of analysis.run.lines) info(`  - ${entry.label}: ${entry.rawValue}`);
  info(`Mission 级预算（## ${MISSION_SECTION}）汇总:`);
  if (!analysis.mission.present) {
    info('  （缺少 ## Mission Budget 节：按无上限处理，向后兼容模式）');
  } else {
    for (const entry of analysis.mission.lines) info(`  - ${entry.label}: ${entry.rawValue}`);
  }

  // 预算门禁：任一级的任一有限额计数器达到或超过上限即失败（点名层级 + 计数器）。
  if (analysis.exhausted.length > 0) {
    const text2 = analysis.exhausted.map(exhaustedText).join('，');
    process.stderr.write(`runstate: 错误: 预算已达上限: ${text2}\n`);
    info(`检查结果: 失败（预算已达上限: ${text2}）`);
    return EXIT_STATE;
  }

  const total = analysis.run.counters.length + analysis.mission.counters.length;
  info(`检查结果: 通过（Run 级 ${analysis.run.counters.length} 条 + Mission 级 ${analysis.mission.counters.length} 条 = ${total} 条预算计数行，均在限额内）`);
  return EXIT_OK;
}

/**
 * advance <dir> <field>：按 ADVANCE_PLAN 推进计数器并写回。
 *
 * 原子性：先做全部校验与两级预算判断，只有确定可以写入时才落盘；
 * 任何拒绝路径都直接返回，绝不触碰文件（拒绝后文件字节不变）。
 * 任一级触顶（即使另一级还有余量）→ 整体拒绝，不做部分写入。
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
  if (!ADVANCE_PLAN.has(alias)) {
    process.stderr.write(`runstate: 错误: 未知字段 "${field}"\n`);
    process.stderr.write(`可用字段: ${fieldList()}\n`);
    return EXIT_USAGE;
  }
  const plan = ADVANCE_PLAN.get(alias);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);

  const read = readState(statePath);
  if (read.error) return fail(read.error, EXIT_STATE);
  const text = read.text;

  const levels = readLevels(text);
  const lines = splitLines(text);
  const advanced = [];
  const blocked = [];

  for (const wanted of plan) {
    const level = levels[wanted.level];
    const sameLabel = (line) => line.label.toLowerCase() === wanted.label.toLowerCase();

    if (!level.present) {
      // 向后兼容：旧文件缺 ## Mission Budget → 该级按「无上限」处理，本次跳过并警告。
      warn(
        `缺少 ## ${level.section} 节：按「无上限 + 警告」处理（向后兼容），` +
          `本次不递增 ${levelTitle(level)} 的 ${wanted.label}`,
      );
      continue;
    }

    // 目标计数器所在行格式非法 → 拒绝；拒绝路径在写文件之前返回，文件字节不变。
    const broken = level.lines.find((line) => sameLabel(line) && line.parsed === null);
    if (broken) {
      return fail(`${malformedMessage(level, broken)}；文件未做任何修改`, EXIT_STATE);
    }

    const entry = level.lines.find(sameLabel);
    if (!entry) {
      const labels = level.lines.map((e) => e.label).join(' / ') || '（无）';
      return fail(
        `${statePath} 的 ## ${level.section} 节里没有 "${wanted.label}"（字段 ${alias}）；现有计数行: ${labels}`,
        EXIT_STATE,
      );
    }

    const next = entry.current + 1;
    if (entry.limit !== null && next > entry.limit) {
      blocked.push({ level, entry, next });
      continue;
    }
    advanced.push({ level, entry, next });
  }

  // 任一级触顶 → 整体拒绝（不做部分写入），文件字节不变。
  if (blocked.length > 0) {
    const detail = blocked
      .map(
        (b) =>
          `${levelTitle(b.level)}「${b.entry.label}」已达上限 ${b.entry.current} / ${b.entry.limit}` +
          `（再 +1 会变成 ${b.next} / ${b.entry.limit}）`,
      )
      .join('；');
    process.stderr.write(`runstate: 错误: 预算守卫拒绝递增：${detail}\n`);
    if (advanced.length > 0) {
      process.stderr.write(
        `（另一级仍有余量: ${advanced.map((a) => `${a.entry.label} ${a.entry.current} / ${a.entry.limit ?? '∞'}`).join('，')}，` +
          '但任一级触顶即整体拒绝）\n',
      );
    }
    process.stderr.write('文件未做任何修改。\n');
    return EXIT_STATE;
  }

  if (advanced.length === 0) {
    return fail(
      `字段 ${alias} 没有可推进的计数器（两级预算节都不存在或不可用）：${statePath}`,
      EXIT_STATE,
    );
  }

  for (const item of advanced) {
    lines[item.entry.index] = item.entry.prefix + String(item.next) + item.entry.tail + item.entry.eol;
  }
  const updated = lines.join('');

  try {
    fs.writeFileSync(statePath, updated, 'utf8');
  } catch (err) {
    return fail(`无法写入 ${statePath}：${err.message}`, EXIT_STATE);
  }

  info(`字段 ${alias} → ${replanText(alias)}`);
  for (const item of advanced) {
    info(
      `已推进 ${levelTitle(item.level)}「${item.entry.label}」: ${item.entry.current} → ${item.next}` +
        (item.entry.limit === null ? '（无上限）' : ` / ${item.entry.limit}`),
    );
  }
  info(`已写回 ${statePath}`);
  return EXIT_OK;
}

/** advance 成功时的落点说明。 */
function replanText(alias) {
  return ADVANCE_PLAN.get(alias)
    .map((item) => `${item.level === 'mission' ? 'Mission' : 'Run'} 级 ${item.label}`)
    .join(' + ');
}

/**
 * new-run <dir>：开新 Run（Run 边界 = 机械续跑，不找人）。
 *
 * 语义（任务卡 C1b）：
 *   - Run 级四项（Epoch / 完成卡数 / 已用 Repair / 已派子代理）重置为 0；
 *   - Mission 级「Run」+1（新 Run 编号 = 递增后的当前值）；Mission 级总量作为记忆保留；
 *   - Mission 级「Run」已达上限（当前 >= 上限）→ 拒绝、退出 1、文件字节不变；
 *     这是唯一需要升级给人的分支（Mission 预算耗尽才找人）。
 *
 * 原子性：先完成全部校验与「触顶拒绝」判定，只有确定可以写入时才落盘；
 * 任何拒绝路径都在写文件之前返回，绝不触碰文件（拒绝后文件字节不变）。
 * 拒绝时不做部分重置：Mission Run 拒绝 → Run 级四项一格都不动。
 *
 * 向后兼容：旧文件缺 ## Mission Budget 节 → 按「无上限 + 警告」处理
 * （与 advance 一致）：仍重置 Run 级四项，跳过 Mission Run 递增并警告。
 */
function cmdNewRun(argv) {
  const dir = argv[0];
  if (!dir) return fail('new-run 需要一个参数：目标目录（用法：node runstate.js new-run <dir>）', EXIT_USAGE);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);
  const read = readState(statePath);
  if (read.error) return fail(read.error, EXIT_STATE);
  const text = read.text;

  const levels = readLevels(text);

  // ── 第一步：Mission 级「Run」判定（触顶即拒绝，此刻文件仍未被触碰）──
  let missionRun = null;
  let missionRunNext = null;
  if (!levels.mission.present) {
    // 向后兼容：缺节 → 按无上限处理，只警告，仍允许重置 Run 级。
    warn(
      `缺少 ## ${MISSION_SECTION} 节：按「无上限 + 警告」处理（向后兼容），` +
        `本次不递增 Mission 级 Run`,
    );
  } else {
    const broken = levels.mission.lines.find(
      (line) => line.label.toLowerCase() === 'run' && line.parsed === null,
    );
    if (broken) return fail(`${malformedMessage(levels.mission, broken)}；文件未做任何修改`, EXIT_STATE);

    missionRun = levels.mission.lines.find((line) => line.label.toLowerCase() === 'run') || null;
    if (!missionRun) {
      const labels = levels.mission.lines.map((e) => e.label).join(' / ') || '（无）';
      return fail(
        `${statePath} 的 ## ${MISSION_SECTION} 节里没有 "Run"；现有计数行: ${labels}`,
        EXIT_STATE,
      );
    }

    // 触顶判定：当前 >= 上限 即视为已用尽（与 analyzeLevels 的触顶语义一致）。
    if (missionRun.limit !== null && missionRun.current >= missionRun.limit) {
      process.stderr.write(
        `runstate: 错误: Mission 预算守卫拒绝开新 Run：Mission 级「Run」已达上限 ` +
          `${missionRun.current} / ${missionRun.limit}（再开一个 Run 会变成 ` +
          `${missionRun.current + 1} / ${missionRun.limit}）；` +
          'Mission 预算已耗尽，必须升级给人（加预算或收尾），不要再机械续跑。\n',
      );
      process.stderr.write('文件未做任何修改。\n');
      info(
        `新 Run 拒绝：Mission 级 Run 已用尽（${missionRun.current} / ${missionRun.limit}），` +
          '需人工决定加预算或收尾。',
      );
      return EXIT_STATE;
    }
    missionRunNext = missionRun.current + 1;
  }

  // ── 第二步：Run 级四项的重置计划（逐项核对，任一项不可用即整体拒绝）──
  const resets = [];
  for (const label of NEW_RUN_RESET_LABELS) {
    const sameLabel = (line) => line.label.toLowerCase() === label.toLowerCase();

    const broken = levels.run.lines.find((line) => sameLabel(line) && line.parsed === null);
    if (broken) return fail(`${malformedMessage(levels.run, broken)}；文件未做任何修改`, EXIT_STATE);

    const entry = levels.run.lines.find(sameLabel);
    if (!entry) {
      const labels = levels.run.lines.map((e) => e.label).join(' / ') || '（无）';
      return fail(
        `${statePath} 的 ## ${RUN_SECTION} 节里没有 "${label}"（new-run 需重置该项）；现有计数行: ${labels}`,
        EXIT_STATE,
      );
    }
    resets.push({ entry, from: entry.current });
  }

  // ── 第三步：全部校验通过后才落盘（只替换数字位，其余字节原样保留）──
  const lines = splitLines(text);
  for (const item of resets) {
    lines[item.entry.index] = item.entry.prefix + '0' + item.entry.tail + item.entry.eol;
  }
  if (missionRun) {
    lines[missionRun.index] =
      missionRun.prefix + String(missionRunNext) + missionRun.tail + missionRun.eol;
  }
  const updated = lines.join('');

  try {
    fs.writeFileSync(statePath, updated, 'utf8');
  } catch (err) {
    return fail(`无法写入 ${statePath}：${err.message}`, EXIT_STATE);
  }

  // ── 成功确认：新 Run 编号 + 重置了哪几项 ──
  if (missionRun) {
    info(
      `已开新 Run: Mission 级 Run ${missionRun.current} → ${missionRunNext}` +
        (missionRun.limit === null ? '（无上限）' : ` / ${missionRun.limit}`),
    );
  } else {
    info('已开新 Run: Mission 级 Run 未启用（缺 ## Mission Budget 节，向后兼容模式，跳过递增）');
  }
  info(`新 Run 编号: ${missionRunNext === null ? '（Mission Run 未启用）' : missionRunNext}`);
  info(
    `已重置 Run 级 ${resets.length} 项: ` +
      resets.map((item) => `${item.entry.label} ${item.from} → 0`).join('，'),
  );
  info(`已写回 ${statePath}`);
  info('下一步: 在新的上下文（新 Run）内继续，无需人工确认（仅 Mission 预算耗尽才需升级给人）。');
  return EXIT_OK;
}

/** status <dir> [--json]：打印两级预算摘要。 */
function cmdStatus(argv) {
  const flags = argv.filter((a) => a.startsWith('-'));
  const positional = argv.filter((a) => !a.startsWith('-'));
  const json = flags.includes('--json');

  if (flags.some((f) => f !== '--json')) {
    return fail(`status 不认识的参数: ${flags.filter((f) => f !== '--json').join(' ')}（可用: --json）`, EXIT_USAGE);
  }
  const dir = positional[0];
  if (!dir) return fail('status 需要一个参数：目标目录（用法：node runstate.js status <dir> [--json]）', EXIT_USAGE);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);
  const read = readState(statePath);
  if (read.error) return fail(read.error, EXIT_STATE);

  const analysis = analyzeLevels(read.text);
  // 状态错误（格式非法等）先报错：机器可读模式下也保持同样退出码，避免"坏状态看起来正常"。
  if (analysis.errors.length > 0) {
    if (json) {
      info(
        JSON.stringify(
          {
            path: statePath,
            error: analysis.errors,
            run: levelJson(analysis.run),
            mission: levelJson(analysis.mission),
          },
          null,
          2,
        ),
      );
    }
    for (const message of analysis.errors) process.stderr.write(`runstate: 错误: ${message}\n`);
    return EXIT_STATE;
  }
  if (!json) emitWarnings(analysis.warnings);

  const allowNewRun = computeAllowNewRun(analysis);

  if (json) {
    info(
      JSON.stringify(
        {
          path: statePath,
          run: levelJson(analysis.run),
          mission: levelJson(analysis.mission),
          exhausted: analysis.exhausted.length > 0,
          exhaustedCounters: analysis.exhausted.map(exhaustedText),
          allowNewRun,
          warnings: analysis.warnings,
        },
        null,
        2,
      ),
    );
    return EXIT_OK;
  }

  info(`状态 ${statePath}`);
  info(`Run 级预算（## ${RUN_SECTION}）:`);
  printLevel(analysis.run);
  info(`Mission 级预算（## ${MISSION_SECTION}）:`);
  printLevel(analysis.mission);
  if (analysis.exhausted.length > 0) {
    info(`已达上限: ${analysis.exhausted.map(exhaustedText).join('，')}`);
  } else {
    info('两级预算均在限额内。');
  }
  info(`还允许开新 Run: ${allowNewRun ? '是' : '否'}`);
  return EXIT_OK;
}

/** status 的层级打印。 */
function printLevel(level) {
  if (!level.present) {
    info('  （缺少该节：按无上限处理，向后兼容模式）');
    return;
  }
  for (const entry of level.lines) {
    if (entry.parsed === null) {
      info(`  - ${entry.label}: ${entry.rawValue}  ← 格式非法`);
      continue;
    }
    const remain = entry.limit === null ? '无上限' : `剩余 ${Math.max(entry.limit - entry.current, 0)}`;
    const flag = entry.limit !== null && entry.current >= entry.limit ? '  ← 已达上限' : '';
    info(`  - ${entry.label}: ${entry.rawValue}（${remain}）${flag}`);
  }
}

/**
 * 是否还允许开新 Run：
 *   1) Mission 级任一有限额计数器未触顶；
 *   2) Mission 级的 Run 配额未用尽（无上限视为未用尽）；
 *   3) 缺 ## Mission Budget 节（旧文件）→ 按无上限，视为允许（并已在 warnings 里警告）。
 */
function computeAllowNewRun(analysis) {
  if (analysis.mission.exhausted) return false;
  if (!analysis.mission.present) return true;
  const runCounter = analysis.mission.counters.find((c) => c.label.toLowerCase() === 'run');
  if (!runCounter) return true;
  if (runCounter.limit === null) return true;
  return runCounter.current < runCounter.limit;
}

/**
 * resume <dir>：打印恢复计划（Resume From 内容 + 下一步 + 是否还允许开新 Run）。
 *
 * 语义（任务卡 C1 / C1b）：
 *   - Mission 预算耗尽 → 非零退出（表示必须升级给人，不能再开新 Run）；
 *   - Run 预算耗尽但 Mission 还有余额 → exit 0，并明确提示"执行 new-run 开新 Run（新上下文），
 *     **无需人工确认**"（Run 边界是机械续跑，不是人工干预点）；
 *   - 两级都还有余额 → exit 0，正常继续。
 */
function cmdResume(argv) {
  const dir = argv[0];
  if (!dir) return fail('resume 需要一个参数：目标目录（用法：node runstate.js resume <dir>）', EXIT_USAGE);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);
  const read = readState(statePath);
  if (read.error) return fail(read.error, EXIT_STATE);

  const analysis = analyzeLevels(read.text);
  emitWarnings(analysis.warnings);
  if (analysis.errors.length > 0) {
    for (const message of analysis.errors) process.stderr.write(`runstate: 错误: ${message}\n`);
    info('恢复计划: 不可用（状态文件有错误，先修好再恢复）');
    return EXIT_STATE;
  }

  const sections = parseSections(read.text);
  const resumeFrom = sectionText(sections, 'Resume From');
  const missionExhausted = analysis.mission.exhausted;
  const runExhausted = analysis.run.exhausted;
  const allowNewRun = computeAllowNewRun(analysis);

  const nextStep =
    resumeFrom === null
      ? '（缺少 ## Resume From 节：无法确定下一步）'
      : resumeFrom === '' || /^（?\s*(无|空|待填写)/.test(resumeFrom)
        ? `无明确下一步（原文: ${resumeFrom || '（空）'}）`
        : resumeFrom.split(/\r?\n/)[0].trim();

  info(`恢复计划 ${statePath}`);
  info(`Resume From: ${resumeFrom === null ? '（缺少该节）' : resumeFrom || '（空）'}`);
  info(`下一步: ${nextStep}`);
  info(`还允许开新 Run: ${allowNewRun ? '是' : '否'}`);
  info(
    `预算状态: Run 级 ${runExhausted ? '已耗尽' : '有余额'}` +
      `；Mission 级 ${analysis.mission.present ? (missionExhausted ? '已耗尽' : '有余额') : '未启用（向后兼容，按无上限）'}`,
  );
  if (analysis.exhausted.length > 0) {
    info(`已达上限: ${analysis.exhausted.map(exhaustedText).join('，')}`);
  }

  if (missionExhausted) {
    process.stderr.write(
      'runstate: 错误: Mission 预算耗尽 —— 必须升级给人（停止自治；不要再开新 Run，请人决定加预算或收尾）\n',
    );
    info('恢复计划: 停止（Mission 预算耗尽，需人工决策）');
    return EXIT_STATE;
  }

  if (runExhausted) {
    info(
      '恢复计划: 应开新 Run（新上下文）—— 本 Run 预算已耗尽，Mission 仍有余额；' +
        '请执行 `new-run <dir>` 开新 Run 并在新上下文内续跑，无需人工确认（仅 Mission 预算耗尽才升级给人）。',
    );
    return EXIT_OK;
  }

  info('恢复计划: 可在当前 Run 内继续（两级预算均有余额）。');
  return EXIT_OK;
}

/**
 * gate <dir>：机器闸门。
 * stdout 恒为一行合法 JSON: {"allow":bool,"reason":str,"run":{…},"mission":{…}}；
 * allow=true → exit 0，allow=false → exit 1（含文件缺失 / 格式非法 / 任一预算触顶）。
 */
function cmdGate(argv) {
  const dir = argv[0];
  if (!dir) return fail('gate 需要一个参数：目标目录（用法：node runstate.js gate <dir>）', EXIT_USAGE);

  const target = path.resolve(dir);
  const statePath = resolveStatePath(target);

  const emit = (payload, code) => {
    info(JSON.stringify(payload));
    return code;
  };

  const read = readState(statePath);
  if (read.error) {
    return emit(
      {
        allow: false,
        reason: read.error,
        run: { section: RUN_SECTION, present: false, exhausted: false, counters: [] },
        mission: { section: MISSION_SECTION, present: false, exhausted: false, counters: [] },
      },
      EXIT_STATE,
    );
  }

  const analysis = analyzeLevels(read.text);
  emitWarnings(analysis.warnings);

  if (analysis.errors.length > 0) {
    return emit(
      {
        allow: false,
        reason: `状态错误: ${analysis.errors.join('；')}`,
        run: levelJson(analysis.run),
        mission: levelJson(analysis.mission),
      },
      EXIT_STATE,
    );
  }

  if (analysis.exhausted.length > 0) {
    return emit(
      {
        allow: false,
        reason: `预算触顶: ${analysis.exhausted.map(exhaustedText).join('，')}`,
        run: levelJson(analysis.run),
        mission: levelJson(analysis.mission),
      },
      EXIT_STATE,
    );
  }

  const warning = analysis.warnings.length > 0 ? `（注意: ${analysis.warnings.join('；')}）` : '';
  return emit(
    {
      allow: true,
      reason:
        `两级预算均在限额内：Run 级 ${analysis.run.counters.length} 条计数行` +
        `，Mission 级 ${analysis.mission.counters.length} 条计数行${warning}`,
      run: levelJson(analysis.run),
      mission: levelJson(analysis.mission),
    },
    EXIT_OK,
  );
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
  if (command === 'new-run') return cmdNewRun(rest);
  if (command === 'status') return cmdStatus(rest);
  if (command === 'resume') return cmdResume(rest);
  if (command === 'gate') return cmdGate(rest);

  const code = fail(
    `未知子命令 "${command}"（可用: init / check / advance / new-run / status / resume / gate / --help）`,
    EXIT_USAGE,
  );
  process.stderr.write(USAGE);
  return code;
}

process.exitCode = main(process.argv.slice(2));
