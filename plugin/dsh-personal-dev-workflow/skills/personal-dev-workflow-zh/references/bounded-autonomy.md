# Bounded Autonomy：有限自治

## 1. 启用条件

只有以下任一条件成立才进入 bounded：

- 用户明确说“上预算 / 自主推进 / 连续执行 / 不用逐卡确认”；
- 项目规则明确声明该 Mission 使用 bounded；
- 用户明确提供 Mission、DoD 与允许的副作用范围。

仅安装 Skill、存在任务卡、存在 AGENTS.md，都**不构成授权**。

## 2. Mission 信封

每轮自治必须固定：

- Mission：一句话目标；
- Definition of Done：客观门禁；
- Out of scope：明确不做；
- WorkSet：本 Mission 当前允许执行的卡；
- Escalation：哪些条件必须交给人。

Backlog 是记忆，不是执行队列。

## 3. 默认预算

默认值是启发式起点，不是工程常数，可在状态 JSON 中按 Mission 调整。

### Run 预算

| 项 | 默认 |
|---|---:|
| epochs | 2 |
| cards | 6 |
| repairs | 1 |
| workers spawned | 8 |
| active workers | 3 |
| research passes | 1 |
| workset size | 8 |
| max subagent depth | 1 |

### Mission 预算

| 项 | 默认 |
|---|---:|
| runs | 3 |
| total cards | 12 |
| total repairs | 3 |

Run 预算用于**上下文卫生**；Mission 预算用于**总保险丝**。不要把两者混为一谈。

## 4. 状态控制器

初始化仅在 opt-in 后执行：

```bash
node scripts/runstate.js init <project-root>
```

然后补全 `.agent-state/run-state.json` 的 mission goal、DoD、outOfScope、workset，并运行：

```bash
node scripts/runstate.js check <project-root>
node scripts/runstate.js gate <project-root>
```

### 计数规则

```bash
node scripts/runstate.js advance <root> epoch
node scripts/runstate.js advance <root> card
node scripts/runstate.js advance <root> repair
node scripts/runstate.js advance <root> research
```

`card` 同时增加 Run 与 Mission 卡数；`repair` 同时增加两级 repair。

预算是**按动作生效**，不是“任意一个计数器到顶就冻结整个 Run”：

- `gate` 判断是否还能开始**下一张卡**，因此主要看 Run/Mission 卡数；
- repair 到顶只拒绝新的 repair；research 到顶只拒绝新的 research；
- worker-spawn 到顶只拒绝再派 Worker，主 Agent 仍可完成当前工作；
- Mission `runs` 到顶只意味着不能再 `new-run`，当前最后一个 Run 仍可继续到其他预算边界。

这样避免“已经用过一次调研，所以整个 Run 被错误锁死”。

### Worker 不是一个数字

并发与累计必须分开：

```bash
node scripts/runstate.js worker-start <root>
node scripts/runstate.js worker-stop <root>
```

- `workers.active`：当前正在运行多少 Worker，是 gauge，可加可减；
- `run.workersSpawned.used`：本 Run 总共启动过多少 Worker，是 counter，只增不减。

这避免“已经结束的 Worker 永远占着并发额度”。

## 5. Run reset 与 Mission stop

Run 预算耗尽但 Mission 仍有预算：

1. 更新 resumeFrom / blocked / workset；
2. `node scripts/runstate.js new-run <root>`；
3. 新上下文读取状态继续。

Mission 预算耗尽：停止并升级给人。不要寻找旁路继续。

## 6. 自动行为边界

bounded 可以自动：选择下一张已批准卡、低风险局部修复、补测试、在项目规则允许时 commit。

仍必须升级：

- 产品语义/DoD 改变；
- merge/push/deploy/publish/delete；
- 凭据、资金、外部通信；
- Mission 阻塞；
- Mission 预算耗尽；
- 需要扩大 Mission/WorkSet 上限。

## 7. 强制性说明

`runstate.js` 能原子地拒绝**它收到的越界状态变更**，但无法强迫 Agent 必须调用它。因此它是控制器，不是 host enforcement。

真正 hard gate 需要宿主在工具派发前调用 controller，并把“哪些项目受管”记录在 Agent 无法随意绕过的 host 配置/registry 中。DSH 见 `adapter-dsh.md`。
