# 生产控制 — 预算、停止条件、升级规则

> 这是 `SKILL.md`「有限自治」一节引用的外层控制器。
> 六步循环保证**一张卡可靠**；本文件保证**整轮有界**。
> 下面的预算在**每次调用 `node tools/runstate.js` 时**被校验；在 DSH 上另有一道 host 闸门
> （`n3-budget-gate`，挂在 `tools/pre-execute`）会在预算耗尽时拦下**派活类**工具调用。
> 强制是真的，但有边界：把任何一条说成"机械强制"之前，先读 §10。

## 1. Mission 信封

一轮开始前必须写下三样东西：

- **Mission** —— 一句话、一个目标。
- **Definition of Done（DoD）** —— 整个 Mission 的客观可检标准。
- **Out of scope** —— 本轮明确**不做**什么（写下来才能挡住 Mission 膨胀）。

Agent 可以在 WorkSet **内部**重排、拆分、丢弃卡片，但**不得增加会改变 DoD 的工作**。
如果发现确有必要的额外工作：先按 §3 的 blocker 规则判定；不阻塞的写进 `DEFERRED_BACKLOG` 并标注来源，然后继续当前卡。

## 2. 模式分离 —— 永久硬规则

| 模式 | 可以产出 | 可以执行 | 结束方式 |
|---|---|---|---|
| **Development** | 已批准 WorkSet 内的卡 | 可以 | DoD 达成，或触发停止条件 |
| **Audit / Discovery** | 仅发现项 | **不可以** | 写入 `DEFERRED_BACKLOG`，**停止** |

**Audit 没有执行权。** 它只能产出发现、把发现写进 `DEFERRED_BACKLOG`、然后停止，别的都不行。
只有 **Development** 可以改代码、派执行器、建卡。禁止 `Audit → Finding → Task → Code` 这条链：一条发现只有在**后续某一轮 Development** 把它挑进**那一轮自己的** WorkSet（服务那一轮的 Mission）时，才变成卡。
审计轮内**绝不**把发现变成卡，也不允许"顺手快速修一下"。

## 3. 有限 WorkSet + blocker 准入

每轮最多物化 `WorkSet ≤ 8` 张卡，且每张都标注来源：

- `planned` —— 开跑前从 Mission / SPEC 拆出来的。
- `blocker` —— 为完成已批准卡而必须修的。
- `human-requested` —— 人明确要求的。

其他一切属于"发现"，不是卡 → 进 `DEFERRED_BACKLOG`。

**blocker 准入（消歧）。** 每个新问题只问一句：*它阻塞当前 Mission 或已在 WorkSet 里的卡吗？*

- **阻塞 → 标 `blocker`。** 它**可以自动进入 WorkSet，但绝不扩大 WorkSet 上限**。WorkSet 已满时**替换一张尚未执行的最低优先级卡**，被替换者移入 `Deferred Backlog` 并在那里注明来源（`被 <卡号> 替换 — 来源：blocked-by`）；被替换的卡不递增任何计数器。
- **不阻塞 → 直接进 `Deferred Backlog`。** 现在不建卡，也不开工。

这个判断由 Agent 在当前 Mission 内自主完成（不需人工确认），且 `WorkSet ≤ 8` 永远不涨。

## 4. 两级预算

预算分两级，都写在 `RUN_STATE.md` 里。完成一张卡会**同时**递增 **Run** 计数器与 **Mission** 计数器；**任一级**触顶时 `advance` 整体拒绝，且文件字节不变（绝不部分写入）。

**Run 预算 —— `## Budget`。** 用途：防上下文污染、防 Token 膨胀、防单会话过长。它是**运行卫生**限制，不是范围限制。

| 计数器（`RUN_STATE.md` 里的标签） | 默认 | 说明 |
|---|---|---|
| `Epoch` | ≤ 2 | 一个 Epoch = 一轮调度 + 执行 |
| `完成卡数` | ≤ 6 | 超额说明这个 Run 的范围划得太大 |
| `已用 Repair` | ≤ 1 | 第二次失败即 `BLOCKED` |
| `已派子代理` | 无上限 | 仍受 Worker 2（上限 3）、子代理嵌套深度 1、Evaluator 1、Research pass 1 约束 |

**Run 预算耗尽 → 机械续跑，不找人：** 写 `RUN_STATE.md` → 跑 `node tools/runstate.js new-run <项目根>`。它把 Run 级四项归零、Mission 级 `Run` +1，然后在**新上下文**里继续。不要问人，也不要赖在旧上下文里硬扛。

**Mission 预算 —— `## Mission Budget`。** 用途：整个 Mission 的总保险丝，跨所有 Run 生效；`new-run` 永不重置它。

| 计数器（`RUN_STATE.md` 里的标签） | 默认 | 说明 |
|---|---|---|
| `Run` | ≤ 3 | 这个 Mission 最多烧掉几个 Run |
| `总卡数` | ≤ 12 | 跨 Run 累加 |
| `总 Repair` | ≤ 3 | 跨 Run 累加 |

**Mission 预算耗尽 → 这是唯一需要升级给人的预算情形**（加预算、缩范围、或收尾）。此时 `new-run` 被拒绝（exit 1）且文件不变；不要再找别的路子继续。

以上数字都是默认值。要覆盖默认值，必须先把新值写进 `RUN_STATE.md` —— **以文件里实际写的上限为准**（`init` 生成的只是示例骨架，按 Mission 改）。计数器边干边更新，不要攒到最后补。

## 5. 控制器 CLI —— `node tools/runstate.js`

零依赖。`RUN_STATE.md` 要保持可解析，计数器一律走这些子命令。

| 子命令 | 何时用 / 做什么 |
|---|---|
| `gate <项目根>` | **每次派活之前**。`{"allow":true}` 且 exit 0 才授权派活；exit 1（`{"allow":false,"reason":…}`）→ 停止、checkpoint、不派。在 DSH 上，host 闸门（`n3-budget-gate`）会在 `subagent` / `subagent_fork` / `workflow` / `ralph` 派发前自动跑这条同样的命令 —— 见 §10 |
| `advance <dir> <field>` | 边干边计数。Run 字段：`epoch` / `cards` / `repairs` / `subagents`；Mission 字段：`runs` / `totalcards` / `totalrepairs`。`cards` 与 `repairs` 同时递增两级 |
| `status <dir> [--json]` | 两级预算摘要；`--json` 供机器读取（含 `exhausted`、`allowNewRun`、各级计数器）。触顶时它的退出码仍是 0 —— 允许/拒绝的判断用 `gate` |
| `resume <dir>` | 打印恢复计划（Resume From + 下一步 + 是否还允许开新 Run）；只有 Mission 预算耗尽才 exit 1 |
| `new-run <dir>` | 开新 Run（Run 级归零、Mission 级 `Run` +1）；只有 Mission 级 `Run` 触顶才拒绝（exit 1） |
| `check <dir>` / `init <dir>` | 严格校验（计数行格式非法即报错并指行号）/ 生成 12 节 `RUN_STATE.md` 骨架 |

退出码：`0` 成功 · `1` 状态/校验/预算错误（含 `gate` 拒绝）· `2` 用法错误。旧文件缺 `## Mission Budget` 节 → 按「无上限 + 警告」处理（向后兼容），不算错误。

## 6. 停止条件 —— 先写 `RUN_STATE.md`，然后停止

1. DoD 达成 → Mission 完成。
2. 预算耗尽：**Run** 级 → 写文件、`new-run`、在新上下文继续（自动）；**Mission** 级 → 停止并升级给人。
3. WorkSet 空了但 DoD 未达成 → `BLOCKED`。
4. 某张卡在唯一一次 Repair 后仍失败 → `BLOCKED`，升级。
5. 连续两个 Epoch 通过率 < 50% → 是流程本身有问题，停下来重估。
6. Audit / Discovery 收集完发现 → 写入 backlog 后停止（**绝不**顺势进入执行）。

停止是正常结果，不是失败：它把一个干净的状态文件交给下一轮。

## 7. 升级给人 —— 只有这四种

| 触发条件 | 为什么需要人 |
|---|---|
| 产品语义变更 | 牵涉 DoD 或 UX 意图 |
| 不可逆 / 高风险操作 | 部署、删除、发布、凭据、资金 |
| Mission 被阻塞 | 需要 Agent 做不了的决策 |
| **Mission** 预算耗尽但没干完 | 由人决定：加预算、缩范围、还是停 |

其余一切——例行合入、选择下一张卡、准入一个 blocker、Run 预算耗尽后的 `new-run`、小重构、补测试——**自动完成**。

## 8. 恢复协议

新会话或上下文重置之后：

1. 读 `RUN_STATE.md`。
2. 复核"最后验证过的 commit"与 DoD。
3. 从 `Resume From` 继续；**不要**把整个 Mission 重新规划一遍。
4. 绝不从聊天历史里重建状态。

## 9. 反面模式（Token 失控是怎么发生的）

- 开放式 Prompt（"持续改进产品"）叠在自动续跑的 goal 之上。
- 审计发现被自动排进执行队列（就是那条被禁的 `Audit → Finding → Task → Code` 链）。
- 让 blocker 撑大 WorkSet，而不是替换一张尚未执行的卡。
- 开新 Run 还要找人确认——或者 Mission 预算已经烧光还在机械续跑。
- 没有 DoD、没有计数器的"再改一点"循环。
- 把 backlog 长度当进度。
- 用加 Worker 提速，而不是缩范围。
- 从超长聊天历史重启，而不是从状态文件恢复。
- 不讲 §10 的边界就说预算"被机械强制"——controller 只能约束它被要求执行的命令，host 闸门只能约束派活类调用。

## 10. 强制面与 fail-open / fail-closed 边界（如实写清）

守住这些预算的是两层，强度不同，而且**两层都没有全覆盖**：

| 层 | 覆盖范围 | 强度 |
|---|---|---|
| `node tools/runstate.js`（`gate` / `advance` / `new-run`） | 它被要求改动的计数器 | **可检查，但不可强制。** 每次被调用都会拒绝越界递增并把文件保持字节不变；但一个从不调用它的 agent 完全不受它约束 |
| DSH profile 插件 `n3-budget-gate`（挂 `tools/pre-execute`） | **只门禁派活类工具** —— `subagent` / `subagent_fork` / `workflow` / `ralph` | **硬拦截** —— 派发前即被拒绝，模型收到拒绝理由，工具体根本不执行 |

下面三条是有意为之的设计，不是等着被补上的漏洞：

- **只门禁派活类。** `pwsh` / shell / `read` / `write` / `edit` 等一切执行类或 I/O 类工具**不门禁**。这是防死锁铁律：预算触顶后 agent 必须还能跑 `runstate.js status|advance|new-run`、还能修状态文件，否则"预算耗尽"就等于"永久锁死"。
- **未管理项目放行。** 项目根没有 `RUN_STATE.md` 就没有预算可守，闸门放行该次派活（并打一条一次性提示）。判定是**精确根**（不向上遍历），子目录一律算未管理。只有主动建了状态文件的项目才被门禁。
- **闸门缺失时 fail-open。** 若 `n3-budget-gate` 缺失、未加载、被同 profile 的其它层覆盖，或自身抛错，闸门就**静默失效**，派活照常进行 —— 与 `deny-risk-commands` 同一类失效模式。**唯一 fail-closed** 的情形是**已管理项目 + controller 异常**：崩溃 / 输出非 JSON / 超时 / 脚本不存在 → 拒绝派活，理由写明"controller 异常，请修状态文件或删除它"。

还有一条也要说清：host 闸门只覆盖**派活这一个检查点**。它约束不了已经在运行的 worker 内部的消耗，也管不住根本不经过工具调用的消耗。真正的成本闸门仍然是"一个 Mission 一个信封 + 两级预算边干边更新"。
