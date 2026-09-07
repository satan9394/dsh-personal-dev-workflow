#!/usr/bin/env node
'use strict';

// taskcard-cli —— 零依赖任务卡管理工具（CommonJS，仅 node:fs / node:path / process.argv）
// 已完成 init / new / list / done 四个子命令（003 卡完成 done）。

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE_ROOT = __dirname;
const TASKS_DIR = path.join(WORKSPACE_ROOT, 'tasks');
const TASKS_README = path.join(TASKS_DIR, 'README.md');

// 四个子命令一览（--help 与无参数用法里展示）
const COMMANDS = [
  { name: 'init', desc: '确保 tasks/ 目录存在并生成 tasks/README.md' },
  { name: 'new', desc: '按自增编号生成任务卡 NNN-标题.md' },
  { name: 'list', desc: '列出任务卡与状态' },
  { name: 'done', desc: '将任务卡状态流转为已合入' },
];

function printUsage() {
  console.log('taskcard-cli —— 零依赖任务卡管理工具');
  console.log('');
  console.log('用法: node cli.js <子命令> [参数]');
  console.log('');
  console.log('子命令:');
  for (const c of COMMANDS) {
    console.log('  ' + c.name + ' '.repeat(Math.max(1, 6 - c.name.length)) + c.desc);
  }
  console.log('');
  console.log('选项:');
  console.log('  --help   打印本帮助并退出');
}

// init：确保 tasks/ 存在；tasks/README.md 不存在才生成（不改动 tasks/ 下其他文件）
function cmdInit() {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
    console.log('已创建目录: tasks/');
  } else {
    console.log('目录已存在: tasks/');
  }

  if (fs.existsSync(TASKS_README)) {
    console.log('已存在，跳过生成: tasks/README.md');
    return 0;
  }

  const content = [
    '# tasks —— 任务卡目录',
    '',
    '本目录存放任务卡，由 taskcard-cli 管理（零依赖 Node CLI）。',
    '',
    '## 命名约定',
    '',
    '- 文件名格式：`NNN-标题.md`（三位数字编号 + 短横线 + 标题）',
    '- 编号从 001 开始自增，如 `001-写文档.md`',
    '',
    '## 状态行约定',
    '',
    '- 任务卡内状态行格式为 `- 状态：待执行`',
    '- 状态取值：待执行 / 执行中 / 待验收 / 已合入 / 打回',
    '- 脚本按该行读写状态，请勿改动格式',
    '',
    '## 可用命令',
    '',
    '| 命令 | 说明 |',
    '| --- | --- |',
    '| `node cli.js init` | 确保 tasks/ 目录存在并生成本文件 |',
    '| `node cli.js new "标题"` | 按自增编号生成任务卡 |',
    '| `node cli.js list` | 列出任务卡与状态 |',
    '| `node cli.js done 001` | 将任务卡状态流转为已合入 |',
    '',
  ].join('\n');

  fs.writeFileSync(TASKS_README, content, 'utf8');
  console.log('已生成: tasks/README.md');
  return 0;
}

// ---------- 任务卡扫描与解析 ----------

// NNN-*.md 文件名正则：三位数字 + 短横线；README.md 等非 NNN- 前缀文件必须跳过
const CARD_FILE_RE = /^(\d{3})-.*\.md$/;

// 扫描 tasks/ 返回 [{ number, file }]，按编号升序；目录不存在或空则返回 []
function scanTaskCards() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  const cards = [];
  for (const name of fs.readdirSync(TASKS_DIR)) {
    const m = CARD_FILE_RE.exec(name);
    if (!m) continue; // 非 NNN- 前缀文件容错跳过
    cards.push({ number: parseInt(m[1], 10), file: path.join(TASKS_DIR, name) });
  }
  cards.sort((a, b) => a.number - b.number);
  return cards;
}

// 解析单张卡：标题取第一个 "# " 首行，状态取 "- 状态：xxx"（截到全角括号前）；
// 解析不到时回退：标题用文件名主干，状态显示"未知"。读取失败也容错为"未知"。
function parseCard(card) {
  let title = path.basename(card.file).replace(/\.md$/, '');
  let status = '未知';
  try {
    const lines = fs.readFileSync(card.file, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('# ') && title === path.basename(card.file).replace(/\.md$/, '')) {
        title = line.slice(2).trim();
      } else if (line.startsWith('- 状态：')) {
        status = line.slice('- 状态：'.length).trim();
        const idx = status.indexOf('（');
        if (idx !== -1) status = status.slice(0, idx).trim();
        if (!status) status = '未知';
      }
    }
  } catch (err) {
    status = '未知';
  }
  return { number: card.number, title: title || '未知', status };
}

// 终端显示宽度：CJK 字符按 2 列计（仅用于表格对齐，不影响内容）
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6\uAC00-\uD7A3]/.test(ch) ? 2 : 1;
  }
  return w;
}

function padCell(s, w) {
  return s + ' '.repeat(Math.max(0, w - displayWidth(s)));
}

// new <标题>：扫描现有编号取最大值 +1，生成 tasks/NNN-标题.md
function cmdNew(title) {
  const clean = title.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
  if (!clean) {
    console.error('错误: 标题为空或去除非法字符后为空（如 / \\ : * ? " < > |）。');
    return 1;
  }

  const cards = scanTaskCards();
  let next = 1;
  if (cards.length > 0) next = cards[cards.length - 1].number + 1;
  if (next > 999) {
    console.error('错误: 编号已达上限 999，无法继续自增。');
    return 1;
  }

  const num = String(next).padStart(3, '0');
  const file = path.join(TASKS_DIR, `${num}-${clean}.md`);
  if (fs.existsSync(file)) {
    console.error(`错误: 任务卡已存在: tasks/${num}-${clean}.md`);
    return 1;
  }

  fs.writeFileSync(file, buildCardContent(num, clean), 'utf8');
  console.log(`已生成: tasks/${num}-${clean}.md（编号 ${num}）`);
  return 0;
}

// 新卡内容模板：首行 # 标题 + 状态行 + 目标/验收标准/限制条件 精简骨架
function buildCardContent(num, title) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `# ${title}`,
    '',
    '- 状态：待执行',
    `- 优先级：P2`,
    `- 创建日期：${today}`,
    '',
    '## 目标',
    '<!-- 待填写：本卡要完成的客观目标 -->',
    '',
    '## 验收标准',
    '- [ ] <!-- 客观门禁，可验证 -->',
    '',
    '## 限制条件',
    '- <!-- 边界、禁止事项与依赖 -->',
    '',
  ].join('\n');
}

// list：读取全部 NNN-*.md，表格输出 编号 | 标题 | 状态
function cmdList() {
  const rows = scanTaskCards().map(parseCard);
  if (rows.length === 0) {
    console.log('（tasks/ 下暂无任务卡）');
    return 0;
  }

  const numW = Math.max(4, ...rows.map((r) => displayWidth(String(r.number).padStart(3, '0'))));
  const titleW = Math.max(4, ...rows.map((r) => displayWidth(r.title)));
  const statusW = Math.max(4, ...rows.map((r) => displayWidth(r.status)));
  const fmt = (n, t, s) => '| ' + padCell(n, numW) + ' | ' + padCell(t, titleW) + ' | ' + padCell(s, statusW) + ' |';

  console.log(fmt('编号', '标题', '状态'));
  console.log('|' + '-'.repeat(numW + 2) + '|' + '-'.repeat(titleW + 2) + '|' + '-'.repeat(statusW + 2) + '|');
  for (const r of rows) {
    console.log(fmt(String(r.number).padStart(3, '0'), r.title, r.status));
  }
  return 0;
}

// done <编号>：把对应任务卡的状态行改为 已合入；找不到编号报错退出码 1；已是 已合入 则幂等提示
function cmdDone(numStr) {
  const num = String(numStr).trim();
  if (!/^\d{1,3}$/.test(num)) {
    console.error(`错误: 无效编号 "${numStr}"（应为数字，如 001）。`);
    return 1;
  }

  const cards = scanTaskCards();
  const padded = num.padStart(3, '0');
  const target = cards.find((c) => String(c.number).padStart(3, '0') === padded);
  if (!target) {
    console.error(`错误: 未找到编号 ${padded} 的任务卡。`);
    return 1;
  }

  const file = target.file;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^- 状态：/.test(lines[i])) {
      const current = lines[i].replace(/^- 状态：/, '').trim().split('（')[0].trim();
      if (current === '已合入') {
        console.log(`提示: tasks/${path.basename(file)} 已是 已合入，无需变更。`);
        return 0;
      }
      lines[i] = lines[i].replace(/^- 状态：.*/, '- 状态：已合入');
      changed = true;
      break;
    }
  }
  if (!changed) {
    console.error(`错误: tasks/${path.basename(file)} 未找到状态行，无法流转。`);
    return 1;
  }

  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`已更新: tasks/${path.basename(file)} → 已合入`);
  return 0;
}

function main(argv) {
  const args = argv.slice(2);

  // 无参数或 --help：打印用法，退出码 0
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return 0;
  }

  const cmd = args[0];
  switch (cmd) {
    case 'init':
      return cmdInit();
    case 'new':
      if (args.length < 2) {
        console.error('用法: node cli.js new "<标题>"');
        return 1;
      }
      return cmdNew(args.slice(1).join(' '));
    case 'list':
      return cmdList();
    case 'done':
      if (args.length < 2) {
        console.error('用法: node cli.js done "<编号>"');
        return 1;
      }
      return cmdDone(args[1]);
    default:
      console.error(`未知子命令: "${cmd}"`);
      console.error('运行 "node cli.js --help" 查看用法。');
      return 1;
  }
}

process.exitCode = main(process.argv);
