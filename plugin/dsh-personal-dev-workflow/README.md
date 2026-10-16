# dsh-personal-dev-workflow

个人开发工作流 skill 的 DSH 插件形态（bundle）：把 v2 版 `personal-dev-workflow` skill 打包，
可通过 `dsh plugin add` 安装到任意 DSH profile。

核心：**唯一协调者**把目标编译成任务契约，跨 OpenCode / Codex / AGY 分派隔离角色会话，
跑真实检查、独立复核，并按已记录证据恢复；人只提需求与拍板。

## 安装

```sh
# 本地安装（源码即本目录）
dsh plugin --profile web add link:<本仓库路径>
# 重启 dsh web 生效
```

> 只想在单个工作区试用？把 `skills/personal-dev-workflow/` 直接放入该工作区的 `.dsh/skills/` 即可（自动发现，无需安装）。

## 使用

对 agent 说"用 PDW 在 <项目> 完成 <目标>"，或"开工 / 实现这个功能 / 修这个 bug"，
`personal-dev-workflow` 会按 契约 → 分派 → 检查 → 独立复核 → 交接 推进；
默认结果简报四行：结论 / 改动 / 验证 / 下一步。

插件内置一个 skill：`personal-dev-workflow`（正文 zh-CN，description 用英文触发词）。

## 结构

```
dsh-personal-dev-workflow/
├── index.js           # 注册 skills/ 到 ctx.skills
├── cordis.patch.yml   # bundle patch 层
├── package.json       # dsh.bundle manifest
└── skills/personal-dev-workflow/
    ├── SKILL.md                  # v2.0.0 主文件（73 行）
    ├── references/runtime.md     # 契约字段、CLI 用法、扩展边界
    ├── agents/openai.yaml        # Codex 侧展示信息
    ├── assets/audit-task.json    # 只读审查契约样例
    └── scripts/                  # pdw.mjs（CLI 接力）+ drivers.mjs + pdw.test.mjs
```

v1.0.0 时代的 skill（六步任务卡循环 + `runstate.js` 控制器 + evals + 适配器文档）不再随 skill
发布；仓库 `tools/`、`plugin/dsh-budget-gate/`、`docs/` 与 tag `v1.0.0` 仍保留那条线。

## License

MIT。结构参考 dsh-ppt-creator（同为 skill-bundle 插件形态）。
