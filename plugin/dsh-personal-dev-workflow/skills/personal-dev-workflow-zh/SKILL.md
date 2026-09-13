---
slug: personal-dev-workflow-zh
name: personal-dev-workflow-zh
displayName: 个人开发工作流（Personal Dev Workflow）
description: 个人开发工作流：一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环，外挂有限自治；任务卡六步循环，带数字预算与明确停止条件。用于项目开发、拆任务卡、实现功能、修 bug。
metadata:
  type: instruction
  tags: [development, workflow, task-card, dsh, bounded-autonomy]
version: "0.5.1"
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
2. **两级预算**（默认可按轮/Mission 覆盖，并记入 `RUN_STATE.md`）。**Run 预算**（`## Budget`，8 条计数行，标签与 `init` 骨架、`advance` 别名逐字对齐）防上下文污染 / Token 膨胀 / 单会话过长：`Epoch` ≤ 2 · `完成卡数` ≤ 6 · `已用 Repair` ≤ 1 · `已派子代理` ≤ 8 · `WorkSet 规模` ≤ 8 · `Worker 数` ≤ 3 · `Research pass` ≤ 1 · `子代理嵌套` ≤ 1——耗尽 → 写 `RUN_STATE.md` → `new-run`（新上下文）→ 继续，**无需人工确认**。
   **Mission 预算**（`## Mission Budget`）是整个 Mission 的总保险丝：Run ≤ 3 · 总卡数 ≤ 12 · 总 Repair ≤ 3（示例值，可按 Mission 覆盖）——耗尽 → **才升级给人**（加预算或收尾）。完成一张卡会同时递增 Run 的完成卡数与 Mission 的总卡数；任一级触顶 `advance` 都拒绝。
3. **Audit / Discovery 没有执行权（硬规则）**：发现只写进 `DEFERRED_BACKLOG`，然后**停止**；只有 Development 能改代码，禁止 `Audit → Finding → Task → Code` 这条链。后续某轮 Development 只能挑选与**它自己的 Mission** 相关的条目。
4. **blocker 准入（消歧）**：新问题若阻塞当前 Mission / 当前卡 → 来源标 `blocker`，**可自动进入 WorkSet，但不得扩大 WorkSet 上限**；WorkSet 已满时替换一张尚未执行的最低优先级卡，被替换者移入 `Deferred Backlog`（并注明来源）。不阻塞 → 直接进 `Deferred Backlog`。
5. **自动验收，例外才升级**：客观门禁通过且低风险 → 自动合入并继续。只有这四类升级给人：产品语义变更 · 不可逆/高风险操作（部署/删除/发布/凭据/资金）· Mission 被阻塞 · **Mission** 预算耗尽但活没干完。
6. **预算耗尽 ≠ 失败**：写 `RUN_STATE.md`（Mission、DoD、WorkSet、Blocked、Deferred Backlog、计数器、最后验证过的 commit、Resume From）后停止；下一轮从该文件续跑，绝不靠重读超长历史。
7. **派活前过机器闸门（控制器）**：派任何卡之前先跑 `node tools/runstate.js gate <项目根>`——只有 `{"allow":true}` 且 exit 0 才可派；exit 1 必须停止并 checkpoint。`resume` 打印恢复计划，`new-run` 开新 Run，`status --json` 供机器读取。**v0.5.1 起这条纪律另有 host 级硬拦截兜底，见下节「强制面与 fail-open/closed 边界」。**
8. **一个项目只允许一套控制策略**：本 skill 负责开发策略；`AGENTS.md` 只放项目本地规则；goal 只是执行机制。**不要再叠一个开放式"持续改进产品"的 Prompt**——那正是 Token 失控的起点。

## 强制面与 fail-open/closed 边界

上面第 7 条是**纪律**（靠 agent 自觉）；v0.5.1 起 DSH 里另有一层 **host 级硬拦截**（`tools/pre-execute` 门禁插件 `n3-budget-gate`），把"派活前查预算"变成 harness 行为。**这一节的数字与边界全部是本机实测值，不是设计意图。**

**强制面（能拦什么）**：只拦**派活类**工具 —— `subagent` / `subagent_fork` / `workflow` / `ralph`。拦截发生在工具派发**之前**（参数校验之前），模型收到 `Error: 预算闸门: <reason>`，工具体根本没跑。

**非强制面（不拦什么，故意如此）**：`pwsh` / `bash` / `read` / `write` / `edit` 等执行类与读写类**一律不拦**。这是防死锁的关键设计：预算触顶后 agent 仍能跑 `node tools/runstate.js status|advance|new-run` 自救续预算，也能改/删状态文件；否则触顶 = 永久锁死。

**判定表（逐条实测）**：

| 情形 | 行为 | fail 方向 |
|---|---|---|
| 项目根**没有** `RUN_STATE.md`（未管理项目） | **放行**（+ 一次性提示） | **fail-open** —— 绝大多数目录没有状态文件，若拒绝等于锁死整个 harness |
| 有 `RUN_STATE.md`，gate 输出合法 JSON `{"allow":true}` | 放行 | — |
| 有 `RUN_STATE.md`，gate 输出合法 JSON `{"allow":false}` | **拒绝**，reason 用 controller 原文（含触顶计数器与当前值） | — |
| 有 `RUN_STATE.md`，但 controller 崩溃 / 非 JSON / 超时 / 脚本缺失 | **拒绝** | **fail-closed —— 但只对已管理项目**；理由写明"controller 异常，请修状态文件或删除它" |
| 白名单外工具（含 `pwsh`） | 放行，**连 controller 都不跑** | fail-open |
| 插件自身内部错误（bug / fs 异常） | 放行 | **fail-open** —— controller 异常才 fail-closed，插件的一个异常不该锁死 harness |

**项目根怎么定**：`exec.agent.session.header.cwd`（会话工作区），退化到 `process.cwd()`；可用配置 `projectRoot` 显式覆盖。判定是**精确根**（不向上遍历）——子目录一律按"未管理"放行，宁可漏拦也不误锁。

**性能与缓存**：单次判定含 spawn node 约 **79–117ms**（本机实测，目标 < 200ms）；同一项目根 **1.5s TTL 缓存 + 并发合并**（同根风暴只跑一次 controller）。**不要把 TTL 调长**——预算是会变的。

**审计**：每次判定追加一行 JSONL 到 `~/.dsh/logs/n3-budget-gate.jsonl`（`ts` / `tool` / `root` / `exitCode` / `gateJson` / `decision` / `reason`），可事后核对"这次派活到底过没过闸门、理由是什么"。

**残余风险（如实声明，别把它当唯一防线）**：

1. **加载面是 fail-open**：插件缺失、未加载、或被同 profile 其它层覆盖时**静默失效**，没有任何拦截 —— 与 `deny-risk-commands` 同一类风险。须靠 doctor/体检或实测确认条目真的在树里。
2. **patch 文件本身坏 → dsh 起不来**（fail-loud）。改 profile 前必须先备份 `cordis.patch.yml`、先在隔离 `DSH_HOME` 真 boot 一次（`--dump-config` **不足以**发现 duplicate loader entry id），改后立刻发一次无害工具调用冒烟，异常即刻回滚。
3. **只覆盖"派活"这个关口**：它管不住已经被派出去、正在跑的 worker 内部的工作量；也管不住不经过工具调用的消耗。真正的成本闸门仍是"一个 Mission 一个信封 + 两级预算"。

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
