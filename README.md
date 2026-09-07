# personal-dev-workflow

个人开发工作流：**一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环**。
人只做提需求与拍板，搬运与转述全部自动化。

核心：任务卡六步循环（拆卡→派活→交证→验证→验收→复盘）。
v3 已去冗余：147 行 → **67 行**，每行规则都有出处。

## 特性

- **Skill 形态**：`SKILL.md`（正文 67 行）+ 4 个可直接使用的模板（任务卡 / SPEC / 验证清单 / 背景出处），
  兼容 DSH（`.dsh/skills/` 或 `~/.dsh/skills/`）与 Claude Code（`~/.claude/skills/`）的 SKILL.md 约定。
- **插件形态**：`plugin/dsh-personal-dev-workflow/` 为 DSH bundle 插件（与 dsh-ppt-creator 同构），
  可 `dsh plugin add link:` 安装。
- **精瘦纪律**：规则文件遵循 100 行原则（地图不是手册）；解释性背景单独放 `references/framework.md`（可选阅读）。
- **依据扎实**：融合 OpenAI Codex（harness engineering / Symphony）、Anthropic（Claude Code 最佳实践）
  与 DeepSeek Harness 实测；对照表见 `references/framework.md`。

## 中英文双版本

- **English（默认）**：`SKILL.md` + `references/` —— 市面默认语言。
- **中文版**：`SKILL.zh-CN.md` + `references.zh-CN/` —— 同名变体，正文与模板均为中文。
- 任选一版使用：把 `SKILL.md`（或 `SKILL.zh-CN.md` 改名为 `SKILL.md`）连同对应 `references/` 复制到
  目标工作区的 `.dsh/skills/personal-dev-workflow/`（DSH）或 `~/.claude/skills/personal-dev-workflow/`（Claude Code）。
- 插件形态内置两个 skill：`personal-dev-workflow`（英文）与 `personal-dev-workflow-zh`（中文），安装后自选。

## 结构

```
dsh-personal-dev-workflow/
├── SKILL.md                       # v3 英文主版（正文 67 行）
├── SKILL.zh-CN.md                 # 中文变体
├── references/                    # 英文模板（framework / task-card / spec / verify-checklist）
├── references.zh-CN/              # 中文模板
├── taskcard-cli.js                # 配套零依赖 CLI：管理 tasks/ 任务卡（复制到项目根目录使用）
├── plugin/dsh-personal-dev-workflow/   # DSH bundle 插件（含 en + zh 两个 skill）
├── dist/                          # skillhub 发布包（skillhub-pkg-en / skillhub-pkg-zh）
└── demos/                         # 可视化演示（行业调研 / 流程打法 / skill 本体）
```

## 配套工具与演示

- **taskcard-cli**：`node taskcard-cli.js init|new|list|done`，零依赖管理 `tasks/` 任务卡。
  注意：CLI 锚定自身所在目录，请把文件复制到项目根目录使用。
- **dist/**：`skillhub-pkg-en`（英文发布包）与 `skillhub-pkg-zh`（中文发布包），可直接用于
  `skillhub publish <目录>` 或对应平台上传。
- **demos/**：三个纯静态可视化页面，浏览器直接打开 `demos/*/index.html`：
  - `agent-workflow-visual` — 顶级 AI 公司内部 Agent 开发流程调研
  - `personal-workflow-visual` — 本工作流打法图解
  - `skill-visual` — skill 本体可视化（Three.js 3D + SVG 动画，离线回退 2D）

## 安装与使用

**Skill 形态（推荐，无需安装）**：把 `SKILL.md` 与 `references/` 复制到目标工作区的
`.dsh/skills/personal-dev-workflow/`（DSH）或 `~/.claude/skills/personal-dev-workflow/`（Claude Code）。

**插件形态（DSH）**：

```sh
dsh plugin --profile web add link:<本仓库路径>
# 重启 dsh web 生效
```

使用：对 agent 说"开工 / 拆任务卡 / 实现这个功能 / 修这个 bug"，即按六步循环推进。

## License

MIT。结构与思路参考 [dsh-ppt-creator](https://github.com/satan9394/dsh-ppt-creator)（同为 skill-bundle 插件形态）。
