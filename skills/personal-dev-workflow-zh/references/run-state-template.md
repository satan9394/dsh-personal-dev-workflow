# DEV RUN STATE（运行状态）

> 一轮一个文件。开跑时写入，执行中更新，**任何停止之前必须写**。
> 新会话靠读这个文件恢复——绝不靠重读聊天历史。
> 下面的计数器标签与 `tools/runstate.js` 完全一致（`advance <dir> <field>` 按标签查行）。

## Mission
（一句话：本轮目标）

## Definition of Done
- [ ] （客观可检标准 1）
- [ ] （客观可检标准 2）

## Out of scope
- （本轮明确不做的事）

## Mode
development | audit

## Active Workset
- [x] T001 — 来源: planned — （简短标题）
- [x] T002 — 来源: blocker — （简短标题）
- [ ] T003 — 来源: planned — （简短标题）
- [ ] T004 — 来源: human-requested — （简短标题）

## Blocked
- T00x — （卡在哪、需要什么决策）

## Deferred Backlog（是记忆，不是队列）
- （发现项）— 来源: audit | blocker | human — 记录于 2026-09-12

## Budget（Run 级：防上下文污染 / Token 膨胀 / 单会话过长）
- Epoch: 1 / 2
- 完成卡数: 3 / 6
- 已用 Repair: 0 / 1
- 已派子代理: 2
- WorkSet 规模: 4 / 8
- Worker 数: 2（上限 3）

## Mission Budget（Mission 总保险丝：Run ≤ 3 · 总卡数 ≤ 12 · 总 Repair ≤ 3）
- Run: 1 / 3
- 总卡数: 3 / 12
- 总 Repair: 0 / 3

> Run 预算耗尽 → `node tools/runstate.js new-run <项目根>`，在新上下文继续，无需人工确认。
> Mission 预算耗尽 → 停止并升级给人（加预算或收尾）。

## Last verified commit
`abc1234`（该 commit 上测试/构建为绿）

## Resume From
T003 — （下一轮的第一个动作）

## Notes for the next run
- （下个上下文必须知道、但无法从仓库推导的信息）
