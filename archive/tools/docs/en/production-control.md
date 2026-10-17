# Production Control — budgets, stop conditions, escalation

> The outer controller referenced by `SKILL.md` §Bounded autonomy.
> The six-step loop keeps *one card* reliable; this file keeps *the whole run* bounded.
> The budgets below are checked by `node tools/runstate.js` **every time that controller runs**, and on DSH a host
> gate (`n3-budget-gate`, on the `tools/pre-execute` waterfall) additionally blocks **dispatch-class** tool calls
> when the budget is exhausted. Enforcement is real but bounded: read §10 before describing any of it as
> "mechanically enforced".

## 1. Mission envelope

A run is admitted only with three written items:

- **Mission** — one sentence, one objective.
- **Definition of Done (DoD)** — objective, checkable criteria for the whole Mission.
- **Out of scope** — what this run will explicitly *not* do (writing it down is what prevents Mission creep).

The agent may reorder, split, or drop cards **inside** the workset. It may not add work that changes the DoD.
If new work looks necessary: resolve it with the blocker rule in §3; otherwise record it in `DEFERRED_BACKLOG` with a source tag and continue the current card.

## 2. Mode separation — a permanent hard rule

| Mode | May produce | May execute | Ends with |
|---|---|---|---|
| **Development** | cards from the admitted workset | yes | DoD met, or a stop condition |
| **Audit / Discovery** | findings only | **no** | `DEFERRED_BACKLOG` written, **stop** |

**Audit has no execution authority.** It may produce findings, write them to `DEFERRED_BACKLOG`, and stop — nothing else.
Only **Development** may change code, dispatch executors, or create cards. The chain `Audit → Finding → Task → Code` is forbidden: a finding becomes a card only when a *later Development run* admits it into that run's own workset under its own Mission.
A finding is never turned into a card *inside* the audit run, and the audit run must not "just fix it quickly" either.

## 3. Finite workset + blocker admission

At most `workset ≤ 8` cards are materialised per run, each tagged with its source:

- `planned` — derived from the Mission / SPEC before the run starts.
- `blocker` — a fix required to finish an already-admitted card.
- `human-requested` — explicitly asked for by the human.

Anything else is a finding, not a card → `DEFERRED_BACKLOG`.

**Blocker admission (the disambiguation).** For every new issue ask one question: *does it block the current Mission or a card already in the workset?*

- **Yes → `blocker`.** It **may enter the workset automatically — but it never enlarges the workset cap.** If the workset is full, **replace one card that has not started yet — the lowest priority one**; move the replaced card into `Deferred Backlog` and tag it there (`replaced by <card> — source: blocked-by`). No counter is incremented for the replaced card.
- **No → `Deferred Backlog` directly.** No card is created now, and no work starts on it.

The agent decides this by itself inside the current Mission (no human confirmation), and `workset ≤ 8` never grows.

## 4. Two-level budgets

Budgets have two levels, both written in `RUN_STATE.md`. Completing one card increments the **Run** counter and the **Mission** counter together; when **either** level is at its cap, `advance` refuses the whole operation and leaves the file byte-identical (never a partial write).

**Run Budget — `## Budget`.** Purpose: prevent context pollution, token blow-up and an over-long single session. It is *run hygiene*, not a scope limit.

`init` scaffolds the **8 counter lines** below; their labels map verbatim to the `advance` field aliases in `runstate.js`, and the limits actually written in the file win.

| Counter (label in `RUN_STATE.md`) | Default | Notes |
|---|---|---|
| `Epoch` | ≤ 2 | one epoch = one scheduling + execution round |
| `完成卡数` (cards completed) | ≤ 6 | more means the Run's scope was too broad |
| `已用 Repair` (repairs used) | ≤ 1 | second failure → `BLOCKED` |
| `已派子代理` (subagents spawned) | ≤ 8 | `advance <dir> subagents`; still bounded by `Worker 数` and `子代理嵌套` |
| `WorkSet 规模` (workset size) | ≤ 8 | cards materialised in this Run (a blocker replaces, never enlarges); alias `workset` |
| `Worker 数` (workers) | ≤ 3 | parallel workers (default 2, max 3); alias `workers` |
| `Research pass` | ≤ 1 | at most one research round per Run; alias `research` |
| `子代理嵌套` (subagent nesting) | ≤ 1 | subagents may nest one level only; alias `depth` |

On an old `RUN_STATE.md` (v0.5.1 and earlier) the last 4 lines are absent, or `已派子代理` / `Worker 数` are written in the legacy unlimited form (e.g. `- Worker 数: 2（上限 3）`, where "上限 3" is only a note): `check` still exits **0**, printing a warning that lists what is missing; `advance` / `new-run` / `gate` behave unchanged. Add the lines to gain the corresponding hard caps.

**Run Budget exhausted → mechanical continuation, not a human decision:** write `RUN_STATE.md`, then run `node tools/runstate.js new-run <project-root>`. That resets all **8 Run counters** to 0 (missing legacy lines are skipped) and increments Mission `Run`; work continues in a fresh context. Do not ask the human, and do not grind on in the old context.

**Mission Budget — `## Mission Budget`.** Purpose: the fuse for the whole Mission across all Runs. `new-run` never resets it.

| Counter (label in `RUN_STATE.md`) | Default | Notes |
|---|---|---|
| `Run` | ≤ 3 | how many Runs this Mission may burn |
| `总卡数` (total cards) | ≤ 12 | accumulates across Runs |
| `总 Repair` (total repairs) | ≤ 3 | accumulates across Runs |

**Mission Budget exhausted → the only budget case that escalates to the human** (raise the budget, cut scope, or wrap up). `new-run` is refused with exit 1 and the file is left unchanged; do not look for another way to keep going.

The numbers above are defaults: to override, write the new value into `RUN_STATE.md` first — the limits actually written in the file win (`init` scaffolds a sample; edit it per Mission). Update counters as work happens, not at the end.

## 5. The controller CLI — `node tools/runstate.js`

Zero-dependency. Keep `RUN_STATE.md` parseable and drive the counters through these commands.

| Command | When / what |
|---|---|
| `gate <project-root>` | **before every dispatch.** `{"allow":true}` with exit 0 authorizes the dispatch. Exit 1 (`{"allow":false,"reason":…}`) → stop, checkpoint, do not dispatch. On DSH this same command is what the host gate (`n3-budget-gate`) runs automatically before `subagent` / `subagent_fork` / `workflow` / `ralph` — see §10 |
| `advance <dir> <field>` | count work as it happens. Run fields (8): `epoch` / `cards` / `repairs` / `subagents` / `workset` / `workers` / `research` / `depth`. Mission fields (3): `runs` / `totalcards` / `totalrepairs`. `cards` and `repairs` increment both levels; when any limited counter is at its cap, **every** `advance` is refused as a whole and the file stays byte-identical |
| `status <dir> [--json]` | two-level summary; `--json` is the machine-readable form (`exhausted`, `allowNewRun`, per-level counters). Its exit code stays 0 even at a cap — use `gate` for the allow/deny decision |
| `resume <dir>` | prints the recovery plan (Resume From + next step + whether a new Run is still allowed); exits 1 only when the Mission budget is exhausted |
| `new-run <dir>` | opens a new Run (Run counters → 0, Mission `Run` +1); refused with exit 1 only when Mission `Run` is at its cap |
| `check <dir>` / `init <dir>` | strict validation (a malformed counter line is an error, reported with its line number) / scaffold the 12-section `RUN_STATE.md` |

Exit codes: `0` success · `1` state / validation / budget error (including a `gate` deny) · `2` usage error. On an old file without `## Mission Budget`, the Mission level is treated as unlimited **with a warning** (backward compatible), never as an error. The same holds for an old file missing the `WorkSet 规模` / `Worker 数` / `Research pass` / `子代理嵌套` lines (or writing them without a cap): a warning that lists what is missing, still exit 0 — only a label that is present with an invalid or duplicated value is an error.

## 6. Stop conditions — write `RUN_STATE.md`, then stop

1. DoD met → Mission done.
2. A budget is exhausted: **Run** → write the file, `new-run`, continue in a fresh context (automatic); **Mission** → stop and escalate to the human.
3. Workset empty but DoD unmet → `BLOCKED`.
4. A card failed after its one repair → `BLOCKED`, escalate.
5. Two consecutive epochs with acceptance rate < 50% → the process itself is the problem; stop and rethink.
6. Audit / discovery finished collecting findings → write the backlog and stop (never continue into execution).

Stopping is a normal outcome, not a failure: it hands a clean state file to the next run.

## 7. Human escalation — only these four

| Trigger | Why a human is needed |
|---|---|
| Product-semantics change | the DoD or the UX intent is at stake |
| Irreversible / high-risk operation | deploy, delete, publish, credentials, payments |
| Mission blocked | needs a decision the agent cannot make |
| **Mission** budget exhausted with work unfinished | decide: raise the budget, cut the scope, or stop |

Everything else — routine merges, choosing the next card, admitting a blocker, a Run-budget `new-run`, small refactors, test fixes — is automatic.

## 8. Resume protocol

In a new session or after a context reset:

1. Read `RUN_STATE.md`.
2. Re-verify the last verified commit and re-read the DoD.
3. Continue from `Resume From`. Do not re-plan the whole Mission from scratch.
4. Never reconstruct state from chat history.

## 9. Anti-patterns (how an unbounded run happens)

- An open-ended prompt ("keep improving the product") stacked on top of an auto-continuing goal.
- Audit findings auto-enqueued as executable cards (the forbidden `Audit → Finding → Task → Code` chain).
- Letting a blocker enlarge the workset instead of replacing a not-yet-started card.
- Asking the human to confirm a Run-budget restart — or mechanically restarting when the **Mission** budget is spent.
- "One more improvement" loops with no DoD and no counters.
- Treating backlog length as progress.
- Raising worker count to go faster instead of shrinking scope.
- Restarting from a long chat history instead of the state file.
- Claiming the budgets are "mechanically enforced" without the §10 boundary — the controller only constrains what it is asked to run, and the host gate only constrains dispatch-class calls.

## 10. Enforcement surface & fail-open/closed boundaries (state it honestly)

Two layers defend these budgets, with different strength — and neither covers everything:

| Layer | Covers | Strength |
|---|---|---|
| `node tools/runstate.js` (`gate` / `advance` / `new-run`) | the counters it is asked to touch | **checkable, not enforceable.** It refuses an over-budget increment on every invocation, leaving the file byte-identical; an agent that never invokes it is not constrained by it at all |
| DSH profile plugin `n3-budget-gate` (on `tools/pre-execute`) | **dispatch-class tools only** — `subagent` / `subagent_fork` / `workflow` / `ralph` | **hard block** — the dispatch is denied before it runs and the model receives the deny reason |

Three boundaries that are deliberate design, not gaps waiting to be patched:

- **Dispatch-class only.** `pwsh` / shell / `read` / `write` / `edit` and every other execution- or I/O-class tool are **not** gated. This is the anti-deadlock rule: with the budget exhausted the agent must still be able to run `runstate.js status|advance|new-run` and to repair the state file, or "exhausted" would mean "permanently locked out".
- **Unmanaged projects pass.** A project root with no `RUN_STATE.md` has no budget to enforce, so the gate allows the dispatch (with a one-time notice). The check is **exact-root** (no upward walk), so a subdirectory always counts as unmanaged. Only projects that opted in by creating a state file are gated.
- **Fail-open when the gate is absent.** If `n3-budget-gate` is missing, not loaded, overridden by another layer of the same profile, or throwing internally, the gate **silently disappears** and dispatches proceed ungated — the same failure class as `deny-risk-commands`. The **only fail-closed** case is a **managed project whose controller misbehaves**: crash, non-JSON output, timeout, or a missing controller script → the dispatch is denied with "controller 异常，请修状态文件或删除它".

Also true and worth saying: the host gate covers the **dispatch checkpoint only**. It cannot constrain work already running inside a dispatched worker, and it says nothing about consumption that never goes through a tool call. The real cost gate remains "one envelope per Mission + two-level budgets, updated as work happens".
