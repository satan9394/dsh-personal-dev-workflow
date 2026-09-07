# personal-dev-workflow

个人开发工作流：**一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环**。
人只做提需求与拍板，搬运与转述全部自动化。

核心：任务卡六步循环（拆卡→派活→交证→验证→验收→复盘）。
v3 已去冗余：147 行 → **67 行**，每行规则都有出处。

## 特性

- **Skill 形态**：`SKILL.md`（67 行）+ 4 个可直接使用的模板（任务卡 / SPEC / 验证清单 / 背景出处），
  兼容 DSH（`.dsh/skills/` 或 `~/.dsh/skills/`）与 Claude Code（`~/.claude/skills/`）的 SKILL.md 约定。
- **插件形态**：`plugin/dsh-personal-dev-workflow/` 为 DSH bundle 插件（与 dsh-ppt-creator 同构），
  可 `dsh plugin add link:` 安装。
- **精瘦纪律**：规则文件遵循 100 行原则（地图不是手册）；解释性背景单独放 `references/framework.md`（可选阅读）。
- **依据扎实**：融合 OpenAI Codex（harness engineering / Symphony）、Anthropic（Claude Code 最佳实践）
  与 DeepSeek Harness 实测；对照表见 `references/framework.md`。

## 结构

```
dsh-personal-dev-workflow/
├── SKILL.md                       # v3 主文件（67 行）
├── references/
│   ├── framework.md               # 可选背景：五组件/出处/成本数字/公司做法对照
│   ├── task-card-template.md      # 任务卡模板
│   ├── spec-template.md           # SPEC 模板（Not Doing / 关键假设）
│   └── verify-checklist.md        # 验证清单（Review 五件事 / 熔断）
└── plugin/dsh-personal-dev-workflow/   # DSH bundle 插件（含同一份 skill）
```

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
