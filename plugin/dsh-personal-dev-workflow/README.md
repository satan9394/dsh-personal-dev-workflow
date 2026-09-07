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

## 结构

```
dsh-personal-dev-workflow/
├── index.js           # 注册 skills/ 到 ctx.skills
├── cordis.patch.yml   # bundle patch 层
├── package.json       # dsh.bundle manifest
└── skills/personal-dev-workflow/
    ├── SKILL.md                       # v3 主文件（正文 67 行，去冗余）
    └── references/
        ├── framework.md               # 可选背景：五组件/出处/成本数字/与顶级公司对照
        ├── task-card-template.md      # 任务卡模板
        ├── spec-template.md           # SPEC 模板（含 Not Doing / 关键假设）
        └── verify-checklist.md        # 验证清单（Review 五件事 / 熔断）
```

## License

MIT。结构参考 dsh-ppt-creator（同为 skill-bundle 插件形态）。
