# dsh-personal-dev-workflow

个人开发工作流 skill 的 DSH 插件形态（bundle）：把 v3 版 `personal-dev-workflow` skill 及其模板打包，
可通过 `dsh plugin add` 安装到任意 DSH profile。

核心：**一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环**；任务卡六步循环（拆卡→派活→交证→验证→验收→复盘）；
人只做提需求与拍板。

## 安装

```sh
# 本地安装（源码即本目录）
dsh plugin --profile web add link:<本仓库路径>
# 重启 dsh web 生效
```

> 只想在单个工作区试用？把 `skills/personal-dev-workflow/` 直接放入该工作区的 `.dsh/skills/` 即可（自动发现，无需安装）。

## 使用

对 agent 说"开工 / 拆任务卡 / 实现这个功能 / 修这个 bug"，`personal-dev-workflow` 技能会按
六步循环推进：拆卡落盘 `tasks/` → 每张卡一个隔离执行器 → 交证 → 验证 → 你拍板 → 复盘。

插件内置两个 skill：
- `personal-dev-workflow` —— 英文版（默认）
- `personal-dev-workflow-zh` —— 中文版（正文与模板为中文，description 用中文触发词）

## 结构

```
dsh-personal-dev-workflow/
├── index.js           # 注册 skills/ 到 ctx.skills
├── cordis.patch.yml   # bundle patch 层
├── package.json       # dsh.bundle manifest
└── skills/personal-dev-workflow/
    ├── SKILL.md                       # v1.0.0 主文件（正文 86 行，路由 + 核心契约）
    ├── references/                    # 11 份按需加载文档
    │   ├── core-loop.md               # 六步闭环的完整执行细节
    │   ├── verification.md            # 按任务类型的证据画像
    │   ├── memory-policy.md           # 一个事实只存一处
    │   ├── bounded-autonomy.md        # Mission 信封 / 两级预算 / 恢复
    │   ├── state-schema.md            # .agent-state/run-state.json 格式
    │   ├── model-profiles.md          # planner/executor/evaluator 能力画像
    │   ├── adapter-{dsh,codex,claude-code}.md
    │   ├── preset-agy-codex.md        # 可选：规划→执行流水线预设
    │   └── migration-v0.5.3.md        # 从 v0.5.x 迁移
    ├── assets/                        # task-card / spec / handoff 模板
    ├── evals/                         # 行为用例：trigger / workflow / autonomy / recovery
    └── scripts/                       # runstate.js 状态控制器 + validate-skill.py
```

## License

MIT。结构参考 dsh-ppt-creator（同为 skill-bundle 插件形态）。
