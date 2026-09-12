---
slug: personal-dev-workflow-zh
name: personal-dev-workflow-zh
displayName: 个人开发工作流（Personal Dev Workflow）
description: 个人开发工作流：一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环，外挂有限自治；任务卡六步循环，带数字预算与明确停止条件。用于项目开发、拆任务卡、实现功能、修 bug。
metadata:
  type: instruction
  tags: [development, workflow, task-card, dsh, bounded-autonomy]
version: "0.4.0"
---

# Personal Dev Workflow v4（personal-dev-workflow）

> 一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环 **+ 有限自治**。
> 人负责提需求与处理例外；"合入并继续下一张卡"这类例行决策由流程自动完成。
> 依据与出处：`references/framework.md`；预算/停止条件/运行状态文件：`references/production-control.md`。

## 何时用

- 开始开发项目 / 说"开工" / 拆任务 / 实现功能 / 修 bug
- 大需求要分解成可执行任务并自主推进（不需要人逐卡盯梢）
- 长期项目：必须在预算内、且能从文件恢复继续

## 核心原则（每条一句）

1. 一个项目 = 一个工作区 + 一个指挥会话（主会话只留「目标 + 文件指针 + 摘要」）。
2. 任务卡落盘 `tasks/`（一张卡一个文件；执行者只认卡，不靠聊天记录）。
3. 每张卡一个隔离执行器，干完交工作证明（diff + 测试 + 截图）。
4. 干活的不打分：验证/评审用全新上下文，只见 diff 与验收标准。
5. 记忆全在文件里（AGENTS.md / docs/ / tasks/）；对话会忘，文件不会。
6. **Backlog 是记忆，不是执行队列。** Agent 可以自主决定当前 Mission 内下一步做什么，但不能自主扩大 Mission。

## 六步循环

1. **拆卡**：模糊需求先收敛一页纸（Problem / 关键假设 / MVP / Not Doing）；大功能写 SPEC（一句话能说清就跳过）；陌生代码库先探索（聚焦检索 3-5 次收手，查影响面：调用者/测试/接口）。
2. **派活**：一张卡 → 一个隔离执行器（子代理优先；想用 Codex 就 codex exec）。卡必含**限制条件（不能改什么）**与预期证据。派活三问：谁来协调？子任务独立吗？会改同一批文件吗？能单不多；外部副作用（发送/发布/删除）不默认授权。
3. **交证**：改动摘要（说不清改了什么，代码不要直接信）+ diff + 测试 + 截图，并引用依据来源。
4. **验证**：客观门禁（可执行标准，不是"觉得行"）；默认怀疑（假设代码是坏的，除非被证明能跑）；Review 五件事（超范围 / 改错文件 / 接口兼容 / 异常处理 / 可维护性）；大改动派评审子代理反向挑错。
5. **验收**：门禁通过且低风险 → 自动合入、提交、继续下一张；FAIL → 修复 1 次 → 再 FAIL → 置为 `BLOCKED`。只有下面"有限自治"列出的例外才升级给人。
6. **复盘**：教训写进 AGENTS.md（对应真实犯过的错）；重复 3 遍的事停下来自动化；定期垃圾回收失效规则。

## 有限自治（外层控制器）

六步循环管的是「**一张卡怎么被可靠做完**」；本节管的是「**卡最多能有多少、整轮什么时候必须停**」。完整规则见 `references/production-control.md`。

1. **Mission 信封**：一轮只服务一个 Mission，且有明确的 Definition of Done。可以在 Mission 内自主选择下一张卡，**不得扩大 Mission**；Mission 完成即停止。
2. **有限 WorkSet + 数字预算**（默认可按轮覆盖，并记入 `RUN_STATE.md`）：Epoch ≤ 3 · 每 Epoch 完成卡 ≤ 6 · WorkSet ≤ 8 · Worker 默认 2（上限 3）· 单卡 Repair 1 次 · Evaluator 1 个 · 子代理嵌套深度 1 · Research pass 1 次。
3. **审查/发现模式没有执行权**：审计（代码/UX/架构/竞品）只把发现写进 `DEFERRED_BACKLOG`，然后**停止**；后续某轮只能挑选与本轮 Mission 相关的条目进入 WorkSet。
4. **自动验收，例外才升级**：客观门禁通过且低风险 → 自动合入并继续。只有这四类升级给人：产品语义变更 · 不可逆/高风险操作（部署/删除/发布/凭据/资金）· Mission 被阻塞 · 预算耗尽但活没干完。
5. **预算耗尽 ≠ 失败**：写 `RUN_STATE.md`（Mission、DoD、WorkSet、Blocked、Deferred Backlog、计数器、最后验证过的 commit、Resume From）后停止；下一轮从该文件续跑，绝不靠重读超长历史。
6. **一个项目只允许一套控制策略**：本 skill 负责开发策略；`AGENTS.md` 只放项目本地规则；goal 只是执行机制。**不要再叠一个开放式"持续改进产品"的 Prompt**——那正是 Token 失控的起点。

## 规则文件纪律（AGENTS.md / CLAUDE.md）

1. **100 行原则，地图不是手册**：只写 agent 猜不到的；每行问"删掉会导致犯错吗？不会就删"。
2. **犯错驱动生长**：空文件开始，每次犯错加一条规则（复利）；护栏用排除式不变量（「本项目不用 X」）。
3. **建议 vs 约束**：规则文件是建议；红线（删除/副作用/危险命令）用 DSH pre-execute 门禁硬拦并实测（黑/白名单各测一次）。

## 上下文与成本

- 仓库是唯一真相来源；对话只留指针。
- 污染三策略：compaction（连续性重要时）/ context reset（修正 2 次还错就清空重来）/ 开新会话（不相关任务）。
- 预算是数字，不是态度（见"有限自治"）；通过率 <50% 就停下复盘流程本身。
- 每 2-3 周做一次全局对抗式审查（恶意用户视角）——在 Audit Mode 下只报告不执行。

## 规模适配

- **小（几天）**：一个会话 + 子代理按需 + 5-10 张卡；验证靠测试与自测。
- **大/长期（周-月）**：tasks/ 当看板 + 有限 Epoch + `RUN_STATE.md` 恢复 + Worker 2（上限 3）；goal 只用于续跑**已定义**的 Mission；每周复盘进 AGENTS.md。
- **生产级**：验证进 CI；worktree 隔离；评审 agent 把关；PR 走最后一公里。

## 模板与参考

- 任务卡 `references/task-card-template.md` · SPEC `references/spec-template.md` · 验证清单 `references/verify-checklist.md`
- 控制层：`references/production-control.md`（预算/停止条件/升级规则）· `references/run-state-template.md`
- 可选背景：`references/framework.md`（五组件/出处/成本数字/规模细节）

## 自查清单（每张卡收尾核对）

- [ ] 卡含：Mission / 来源 / 目标 / 验收标准 / 涉及文件 / 限制条件 / 预期证据
- [ ] 交证含改动摘要 + diff + 测试 + 截图
- [ ] 客观门禁通过（自动合入）或修复一次后置 `BLOCKED`
- [ ] 只有在列出的例外情形才升级给人（语义/不可逆/阻塞/预算）
- [ ] 教训已进 AGENTS.md；`RUN_STATE.md` 计数已更新；重复 3 遍的已自动化
