# Case study: bounded autonomy, tested over three runs

This is the empirical evidence behind the skill's **bounded autonomy** section (`SKILL.md` §Bounded autonomy, `references/production-control.md`). It is not a description of what *should* happen — it is what *did* happen when the workflow ran a real (small) project with deliberately tiny budgets.

Runnable evidence lives in [`docs/evidence/runstate-cli/`](evidence/runstate-cli/): a zero-dependency CLI plus a 9-case black-box test suite.

## What was built

A zero-dependency Node CLI, `runstate` — creates, validates and advances `RUN_STATE.md` state files and **mechanically enforces their budgets**:

```sh
node runstate.js init <dir>              # write a RUN_STATE.md skeleton (11 sections)
node runstate.js check <dir>             # required sections + budget gate (non-zero when exhausted)
node runstate.js advance <dir> <field>   # increment a counter; refuse past the limit without touching the file
node tests/run-tests.mjs                 # 9 black-box cases; green exit 0, any failure non-zero
```

Choosing this project was deliberate: it makes the controller testable on itself.

## Setup (the limiter was set on purpose)

Before starting, the run wrote its three admission items: **Mission** (one sentence), **Definition of Done** (five executable criteria), **Out of scope**. WorkSet was fixed at three cards, each tagged with a source.

Budgets were intentionally small so the limiter would fire: **1 epoch, 2 cards per epoch**.

## The three runs

| Run | Entry | Cards | How it ended |
|---|---|---|---|
| #1 | fresh Mission | T001 (skeleton + init/check), T002 (advance + budget guard) | **stop condition #2: budget exhausted** (2/2) — T003 was *not* executed |
| #2 | resumed from `RUN_STATE.md` only | T003 (README + smoke) | **stop condition #1: DoD met** |
| #3 | new Mission, 2 items admitted from `Deferred Backlog` | T004 (malformed budget line must error), T005 (test suite + README) | **stop condition #1: DoD met** |

Five cards, five auto-accepts, zero per-card human sign-offs.

## What each mechanism actually did

| Mechanism | Observed |
|---|---|
| DoD before work | Every run wrote Mission / DoD / Out of scope before the first card; all five DoD criteria were met with executable evidence |
| Finite workset with sources | 2–3 cards per run (`planned` / `blocker` / `human-requested`), never auto-grown |
| Auto-accept | All five cards accepted automatically after the conductor's own gate verification; humans were never asked |
| Mechanical budget guard | Crossing a limit was refused and the file stayed **byte-identical** (SHA-256 compared before/after) |
| Stop #2 (budget) | Run #1 stopped at 2/2 with T003 untouched |
| Stop #1 (DoD) | Runs #2 and #3 ended as a normal completion, not a failure |
| Audit has no execution authority | Five findings were written to `Deferred Backlog` only — nothing was fixed on the spot, no cards were created |
| Backlog → Mission admission | Run #3 *chose* two backlog items and made them T004/T005 (the opposite of "findings auto-enqueue") |
| File-based resume | Run #2 continued from `RUN_STATE.md` alone, without re-reading any history |

## Honest notes

- The conductor's own verification was wrong once: a probe that checked "a prose line inside the Budget section is rejected" appended the line **outside** the Budget section, so `check` passed and proved nothing. Re-run inside the section, it failed as intended. A probe that misses its target produces the most misleading green.
- The worker found a worse defect than the card described: the old parser silently dropped the limit from `1 / xyz` and would have written `2 / xyz`, removing the guard entirely while looking healthy.
- Two lessons were written into the test project's `AGENTS.md` as "don't do this" rules: never write prose inside a Budget section (a typo `abc / 2` silently disabled a guard), and never write acceptance criteria as on-the-spot snapshot values (they collided with the template defaults).
- The test script cleans its own temp directories with `fs.rmSync` — technically a permanent delete, which sits against the repo owner's "deletions go to the recycle bin" rule. **Decision (2026-09-12): keep it.** Node has no zero-dependency recycle-bin API, and the scope is locked by a double guard to directories the script itself just created under `os.tmpdir()`; the script carries a comment saying exactly this.
- At rest, a finished run's state file fails its own `check` (budgets are consumed) — correct in spirit, but worth a README note so it is not mistaken for corruption.
- Red lines can be enforced by the harness, not just documented: in the owner's environment a pre-execute gate blocked a command merely *containing* the permanent-delete API name (it appeared in a commit message). The command was rewritten without the literal, and the guard never had to trust the agent's good intentions. This is the "advice vs constraint" rule from the skill working as designed.

## Why this matters

An unbounded run comes from the loop being the only governing layer: an open-ended prompt stacked on an auto-continuing goal, with audits feeding new work back in forever. The three runs above show the missing layer doing its job — the run **stopped on its own**, wrote a state file, and a later run continued from that file instead of from a very long conversation.
