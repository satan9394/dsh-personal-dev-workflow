/* ============================================================
 * data.js — personal-dev-workflow v3 内容数据
 * 与仓库根 SKILL.md 一致（正文 67 行）
 * ============================================================ */

window.DATA = {

  principles: [
    { num: "1", title: "一个项目 = 一个工作区 + 一个指挥会话", desc: "主会话只留「目标 + 文件指针 + 摘要」；长期项目用 goal 自动续跑。" },
    { num: "2", title: "任务卡落盘 tasks/", desc: "一张卡一个文件；执行者只认卡，不靠聊天记录。" },
    { num: "3", title: "每张卡一个隔离执行器", desc: "干完交工作证明：diff + 测试 + 截图。" },
    { num: "4", title: "干活的不打分", desc: "验证/评审用全新上下文，只见 diff 与验收标准。" },
    { num: "5", title: "记忆全在文件里", desc: "AGENTS.md / docs/ / tasks/；对话会忘，文件不会。" }
  ],

  lifecycle: [
    { name: "拆卡", src: "Anthropic Explore→Plan；idea-refine；explore-codebase", body: "模糊需求先收敛一页纸（Problem / 关键假设 / MVP / Not Doing）；大功能写 SPEC（一句话能说清就跳过）；陌生代码库先探索（聚焦检索 3-5 次收手，查影响面：调用者/测试/接口）。", key: "产出：一张任务卡（目标/验收标准/涉及文件/限制条件/预期证据）" },
    { name: "派活", src: "OpenAI Humans steer, agents execute；agent-teams 三问", body: "一张卡 → 一个隔离执行器（子代理优先；想用 Codex 就 codex exec）。卡必含限制条件（不能改什么）与预期证据。派活三问：谁来协调？子任务独立吗？会改同一批文件吗？能单不多；外部副作用不默认授权。", key: "产出：执行器开始干活，主会话不等待" },
    { name: "交证", src: "OpenAI Symphony review packet；vibecoding", body: "改动摘要（说不清改了什么，代码不要直接信）+ diff + 测试 + 截图，并引用依据来源。信息一手，不靠用户转述。", key: "产出：工作证明（改动摘要 + diff + 测试输出 + 截图）" },
    { name: "验证", src: "Anthropic 验证能力 = 质量 2-3×；harness-engineering", body: "客观门禁（可执行标准，不是'觉得行'）；默认怀疑（假设代码是坏的，除非被证明能跑）；Review 五件事（超范围/改错文件/接口兼容/异常处理/可维护性）；大改动派评审子代理反向挑错；同一问题修复 3 次即熔断重来。", key: "产出：验证结论（通过 / 问题清单）" },
    { name: "验收", src: "Symphony 人管理工作不监督 agent", body: "用户拍板三选一：合入 / 打回 / 调整方向。", key: "产出：一个明确决策" },
    { name: "复盘", src: "Anthropic 纠错复利；ai-native 三遍原则", body: "教训写进 AGENTS.md（对应真实犯过的错）；重复 3 遍的事停下来自动化；定期垃圾回收失效规则。", key: "产出：AGENTS.md 新增一条规则 / 一个自动化" }
  ],

  rules: [
    { num: "01", title: "100 行原则，地图不是手册", desc: "只写 agent 猜不到的（命令、非默认风格、项目特有决策、常见陷阱、禁区）；每行问「删掉会导致犯错吗？不会就删」。" },
    { num: "02", title: "犯错驱动生长", desc: "空文件开始，每次犯错加一条规则（复利）；护栏用排除式不变量（「本项目不用 X」），比枚举选项省上下文。" },
    { num: "03", title: "建议 vs 约束", desc: "规则文件是建议；红线（删除/副作用/危险命令）用 DSH pre-execute 门禁硬拦并实测（黑/白名单各测一次）。" }
  ],

  context: [
    { icon: "📦", title: "仓库是唯一真相来源", desc: "规划、决策、进度全部落盘；对话只留指针。" },
    { icon: "🧻", title: "污染三策略", desc: "compaction（连续性重要时）/ context reset（修正 2 次还错就清空重来）/ 开新会话（不相关任务）。" },
    { icon: "💰", title: "成本门禁", desc: "长循环设预算上限；通过率 <50% 停下复盘流程本身；>2 轮循环必须有落盘记忆。" },
    { icon: "🔍", title: "定期对抗式审查", desc: "每 2-3 周做一次全局审查（恶意用户视角：超范围/越权/安全隐患）。" }
  ],

  scales: [
    { tag: "小", title: "几天", points: ["一个会话 + 子代理按需", "5-10 张卡", "验证靠测试与自测"] },
    { tag: "大/长期", title: "周-月", points: ["tasks/ 当看板 + goal 续跑", "并行 3-5 Worker", "每周复盘进 AGENTS.md"] },
    { tag: "生产级", title: "上线与维护", points: ["验证进 CI", "worktree 隔离", "评审 agent 把关", "PR 走最后一公里"] }
  ],

  templates: [
    { icon: "🎫", title: "任务卡模板", desc: "目标/限制条件/客观门禁/涉及文件/预期证据", path: "../../references/task-card-template.md" },
    { icon: "📐", title: "SPEC 模板", desc: "Not Doing + 关键假设（含验证法）+ 验收标准", path: "../../references/spec-template.md" },
    { icon: "✅", title: "验证清单", desc: "Review 五件事 + 对抗性评审 + 熔断检查", path: "../../references/verify-checklist.md" },
    { icon: "📖", title: "背景与出处（可选）", desc: "五组件/100 行原则/成本数字/公司做法对照", path: "../../references/framework.md" }
  ],

  checklist: [
    "卡含：目标 / 验收标准 / 涉及文件 / 限制条件 / 预期证据",
    "交证含改动摘要 + diff + 测试 + 截图",
    "客观门禁验证通过；大改动有评审（Review 五件事）",
    "用户已拍板（合入 / 打回 / 改向）",
    "教训已进 AGENTS.md；重复 3 遍的已自动化；长循环有预算上限"
  ]
};
