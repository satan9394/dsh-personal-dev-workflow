# Production Control — budgets, stop conditions, escalation

> The outer controller referenced by `SKILL.md` §Bounded autonomy.
> The six-step loop keeps *one card* reliable; this file keeps *the whole run* bounded.

## 1. Mission envelope

A run is admitted only with three written items:

- **Mission** — one sentence, one objective.
- **Definition of Done (DoD)** — objective, checkable criteria for the whole Mission.
- **Out of scope** — what this run will explicitly *not* do (writing it down is what prevents Mission creep).

The agent may reorder, split, or drop cards **inside** the workset. It may not add work that changes the DoD.
If new work looks necessary: record it in `DEFERRED_BACKLOG` with a source tag, then continue the current card.

## 2. Mode separation

| Mode | May produce | May execute | Ends with |
|---|---|---|---|
| **Development** | cards from the admitted workset | yes | DoD met, or a stop condition |
| **Audit / Discovery** | findings only | **no** | `DEFERRED_BACKLOG` written, **stop** |

Audit findings never auto-enter a workset. A later Development run admits only the findings relevant to *its* Mission.

## 3. Finite workset

At most `workset ≤ 8` cards are materialised per run, each tagged with its source:

- `planned` — derived from the Mission / SPEC before the run starts.
- `blocker` — a fix required to finish an already-admitted card.
- `human-requested` — explicitly asked for by the human.

Anything else is a finding, not a card → `DEFERRED_BACKLOG`.

## 4. Default budgets

| Budget | Default | Notes |
|---|---|---|
| Epochs per run | 3 | one epoch = one scheduling + execution round |
| Cards completed per epoch | 6 | completing more means the scope was too broad |
| Workset size | 8 | materialised up front, refilled only from the same Mission |
| Parallel workers | 2 (max 3) | personal subscription: concurrency multiplies cost |
| Repair attempts per card | 1 | second failure → `BLOCKED` |
| Evaluator agents | 1 | the grader is never the doer |
| Subagent nesting depth | 1 | no agent spawning agents spawning agents |
| Research passes | 1 | then decide with what you have |

Override per run only by writing the new value into `RUN_STATE.md` first. Update every counter as work happens.

## 5. Stop conditions — write `RUN_STATE.md`, then stop

1. DoD met → Mission done.
2. Any budget exhausted.
3. Workset empty but DoD unmet → `BLOCKED`.
4. A card failed after its one repair → `BLOCKED`, escalate.
5. Two consecutive epochs with acceptance rate < 50% → the process itself is the problem; stop and rethink.
6. Audit / discovery finished collecting findings → write the backlog and stop (never continue into execution).

Stopping is a normal outcome, not a failure: it hands a clean state file to the next run.

## 6. Human escalation — only these four

| Trigger | Why a human is needed |
|---|---|
| Product-semantics change | the DoD or the UX intent is at stake |
| Irreversible / high-risk operation | deploy, delete, publish, credentials, payments |
| Mission blocked | needs a decision the agent cannot make |
| Budget exhausted with work unfinished | decide: raise the budget, cut the scope, or stop |

Everything else — routine merges, choosing the next card, small refactors, test fixes — is automatic.

## 7. Resume protocol

In a new session or after a context reset:

1. Read `RUN_STATE.md`.
2. Re-verify the last verified commit and re-read the DoD.
3. Continue from `Resume From`. Do not re-plan the whole Mission from scratch.
4. Never reconstruct state from chat history.

## 8. Anti-patterns (how an unbounded run happens)

- An open-ended prompt ("keep improving the product") stacked on top of an auto-continuing goal.
- Audit findings auto-enqueued as executable cards.
- "One more improvement" loops with no DoD and no counters.
- Treating backlog length as progress.
- Raising worker count to go faster instead of shrinking scope.
- Restarting from a long chat history instead of the state file.
