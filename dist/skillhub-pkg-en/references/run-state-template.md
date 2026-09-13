# DEV RUN STATE

> One file per run. Written at the start, updated as work happens, and always written before a stop.
> A new session resumes by reading this file — never by re-reading chat history.
> Counter labels below are exactly the labels `tools/runstate.js` looks up (`advance <dir> <field>`).

## Mission
(one sentence: the objective of this run)

## Definition of Done
- [ ] (objective, checkable criterion 1)
- [ ] (objective, checkable criterion 2)

## Out of scope
- (what this run explicitly will not do)

## Mode
development | audit

## Active Workset
- [x] T001 — source: planned — (short title)
- [x] T002 — source: blocker — (short title)
- [ ] T003 — source: planned — (short title)
- [ ] T004 — source: human-requested — (short title)

## Blocked
- T00x — (what blocks it, what decision is needed)

## Deferred Backlog (memory, not a queue)
- (finding) — source: audit | blocker | human — logged 2026-09-12

## Budget (Run level: context pollution / token blow-up / one over-long session)
- Epoch: 1 / 2
- 完成卡数: 3 / 6
- 已用 Repair: 0 / 1
- 已派子代理: 2 / 8
- WorkSet 规模: 4 / 8
- Worker 数: 2 / 3
- Research pass: 0 / 1
- 子代理嵌套: 0 / 1

## Mission Budget (Mission fuse: run ≤ 3 · cards ≤ 12 · repairs ≤ 3)
- Run: 1 / 3
- 总卡数: 3 / 12
- 总 Repair: 0 / 3

> Run Budget exhausted → `node tools/runstate.js new-run <project-root>` and continue in a fresh context, no human confirmation.
> Mission Budget exhausted → stop and escalate to the human (raise the budget or wrap up).

## Last verified commit
`abc1234` (tests / build green at this commit)

## Resume From
T003 — (first action of the next run)

## Notes for the next run
- (anything the next context must know that is not derivable from the repo)
