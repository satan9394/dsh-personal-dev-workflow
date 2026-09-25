---
name: personal-dev-workflow-zh
description: 个人开发工作流：把多步骤开发变成可验证、可恢复、可停止的执行闭环——任务卡、明确范围、独立验证、跨会话恢复与有限自治。适用于多步功能开发、重构、连续修 bug、跨文件实现与长期项目。简单问答、单行修改、纯解释或只读审查不要加载（只读审查仅在用户要求时进入 audit 模式）。
license: MIT
compatibility: 面向标准 SKILL.md 的通用 skill（Claude Code / Codex / Cursor / DSH / OpenCode）。可选的有限自治状态控制器需 Node.js 18+；宿主级硬拦截属 adapter 范畴，不在通用 skill 内提供。
metadata:
  version: "1.0.0"
  language: "zh-CN"
  architecture: "progressive-disclosure"
---

# Personal Dev Workflow

把复杂开发任务变成**可验证、可恢复、可停止**的执行闭环。默认不无限续跑，不把 Skill 当 Harness。

## 何时启用

- 多步骤功能、重构、连续修 bug、跨文件实现、长期项目。
- 需要任务卡、独立验证、跨会话恢复或有限自治。
- 用户明确说“开工 / 拆卡 / 按任务卡开发 / 上预算 / 自主推进”。

不要为以下场景加载：简单问答、单行/单文件微调、纯解释、无需状态的临时脚本。纯审查仅在用户要求时进入 `audit`。

## 先选模式

| 模式 | 适用 | 默认行为 |
|---|---|---|
| `quick` | 局部、低风险、小改 | 直接执行 + 最小验证，不建任务体系 |
| `standard` | 默认的多步骤开发 | 一张卡一闭环；完成后交证并停，不自动 commit/下一卡 |
| `bounded` | 用户明确授权连续自治 | 在 Mission 与预算内自动继续；必须使用状态控制器 |
| `audit` | 只读审查/诊断 | 可读、搜索、测试、lint、沙箱复现；禁止修改/提交/部署 |

**只有显式 opt-in 才能进入 `bounded`。** “用了这个 Skill”不等于“授权自动续跑”。详见 `references/bounded-autonomy.md`。

## 核心闭环

1. **收敛范围**：确认目标、Not Doing、风险、验收标准；一句话能说清的小任务不写 SPEC。
2. **建立任务卡**：只给需要独立交付的工作建卡。模板见 `assets/task-card.md`。
3. **执行**：优先单 Agent；只有可独立并行、跨模块或需要独立视角时才派 Worker。
4. **验证**：按任务类型选择证据，不机械要求所有测试/构建/截图。见 `references/verification.md`。
5. **记录/交接**：记录真正需要跨会话保留的事实；避免日志、CHANGELOG、状态文件重复记同一事实。见 `references/memory-policy.md`。
6. **停或继续**：`quick/standard` 默认停并交证；`bounded` 仅在预算、Mission、风险边界内继续。

完整执行细则见 `references/core-loop.md`。

## 权限边界

- 默认不自动 `commit / merge / push / deploy / publish / delete`。
- `bounded` 可在项目规则明确允许时自动 `commit`；`merge/push/deploy/publish/delete/凭据/资金`仍需单独授权。
- Audit 是**无修改权限**，不是“不能运行任何命令”。安全测试、lint、构建、只读查询可以执行。
- 发现的新问题默认进 backlog；只有**阻塞当前 Mission**的 blocker 才能进入当前 WorkSet。

## 状态与恢复

`bounded` 使用机器状态 `.agent-state/run-state.json`；根目录 `RUN_STATE.md`只是脚本生成的人类视图，**不是机器真相源**。

常用命令：

```bash
node scripts/runstate.js init <project-root>
node scripts/runstate.js check <project-root>
node scripts/runstate.js status <project-root> --json
node scripts/runstate.js gate <project-root>
node scripts/runstate.js advance <project-root> card
node scripts/runstate.js worker-start <project-root>
node scripts/runstate.js worker-stop <project-root>
node scripts/runstate.js new-run <project-root>
node scripts/runstate.js resume <project-root>
```

脚本是**状态控制器，不是宿主硬拦截器**。DSH 等宿主要做到真正的 pre-execute hard gate，按 `references/adapter-dsh.md` 接入。

## 按需读取

- 开发闭环：`references/core-loop.md`
- 验证证据：`references/verification.md`
- 记忆与文件职责：`references/memory-policy.md`
- 有限自治/预算/恢复：`references/bounded-autonomy.md`
- 状态格式：`references/state-schema.md`
- 模型能力选型：`references/model-profiles.md`
- DSH：`references/adapter-dsh.md`；Codex：`references/adapter-codex.md`；Claude Code：`references/adapter-claude-code.md`
- 个人 AGY → Codex 示例：`references/preset-agy-codex.md`

## 结束判定

只有当验收证据成立，才能说“完成”。若失败、预算耗尽或需要人类决策，明确输出当前状态、证据、阻塞原因与下一步；不要用“继续优化”制造无限循环。
