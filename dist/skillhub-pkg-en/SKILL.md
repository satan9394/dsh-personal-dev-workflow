---
slug: personal-dev-workflow
name: personal-dev-workflow
displayName: Personal Dev Workflow
description: "A lean personal development workflow: one conductor + isolated workers + file-based memory + a verification loop, inside bounded autonomy; a six-step task-card cycle with numeric budgets and explicit stop conditions. Use it for project development, task breakdown, feature work, and bug fixes."
metadata:
  type: instruction
  tags: [development, workflow, task-card, dsh, bounded-autonomy]
version: "0.5.0"
---

# Personal Dev Workflow v4 (personal-dev-workflow)

> One conductor + isolated Workers + file-based memory + a verification loop **+ bounded autonomy**.
> The human raises requirements and owns exceptions; routine accept/next-card decisions are automatic.
> Rationale & sources: `references/framework.md`. Budgets, stop conditions and the run-state file: `references/production-control.md`.

## When to use

- Starting a dev project / saying "let's build" / breaking work down / implementing a feature / fixing a bug
- Turning a large requirement into executable tasks that keep moving without human babysitting
- Long-running projects that must stay inside a budget and be resumable from files

## Core principles (one line each)

1. One project = one workspace + one conductor session (the main session keeps only "goal + file pointers + summaries").
2. Task cards live on disk in `tasks/` (one card per file; executors read the card, not the chat log).
3. One isolated executor per card; it hands back proof of work (diff + tests + screenshots).
4. The one who does the work doesn't grade it: review in a fresh context that sees only the diff and the acceptance criteria.
5. All memory lives in files (AGENTS.md / docs/ / tasks/); conversations forget, files don't.
6. **Backlog is memory, not a queue.** The agent may choose the next card inside the current Mission, but may not enlarge the Mission.

## The six-step loop

1. **Break down**: converge a fuzzy requirement to one page (Problem / key assumptions / MVP / Not Doing); write a SPEC for big features (skip the plan if it fits in one sentence); explore unfamiliar codebases first (focused 3–5 searches, then stop; check the blast radius: callers / tests / interfaces).
2. **Dispatch**: one card → one isolated executor (subagents by default; use `codex exec` if you prefer Codex). Every card MUST include constraints (what must NOT be changed) and expected evidence. Three dispatch questions: who coordinates? is the subtask truly independent? will it touch the same files? Prefer a single agent when possible; external side effects (send / publish / delete) are not authorized by default.
3. **Proof of work**: a change summary (if it can't explain what changed, don't trust the code) + diff + tests + screenshots, citing its source (spec / card items).
4. **Verify**: objective gates (executable criteria, not "feels done"); default suspicion (assume the code is broken until proven to run); Review five things (out-of-scope changes / wrong files / interface compatibility / error handling / maintainability); dispatch a reviewer subagent with a fresh context for large changes.
5. **Accept**: gates pass + low risk → auto-accept, commit, next card. FAIL → one repair → FAIL again → `BLOCKED`. Escalate to the human only on the exceptions listed under bounded autonomy.
6. **Retro**: write lessons into AGENTS.md (mapped to real mistakes); automate anything repeated 3+ times; garbage-collect stale rules periodically.

## Bounded autonomy (the outer controller)

The six-step loop governs **how one card gets done**; this section governs **how many cards may exist and when the run must stop**. Full rules: `references/production-control.md`.

1. **Mission envelope**: one run serves one Mission with an explicit Definition of Done. Choose the next card inside it; never enlarge it. Mission done → stop.
2. **Two-level budget** (defaults; override per run/Mission and record it in `RUN_STATE.md`). **Run Budget** (`## Budget`) guards context pollution, token blow-up and over-long sessions: Epoch ≤ 2 · 完成卡数 ≤ 6 · 已用 Repair ≤ 1 · 已派子代理 as needed — exhausted → write `RUN_STATE.md`, run `new-run` (fresh context) and continue, **no human confirmation**.
   **Mission Budget** (`## Mission Budget`) is the fuse for the whole Mission: Run ≤ 3 · 总卡数 ≤ 12 · 总 Repair ≤ 3 (example values, overridable per Mission) — exhausted → **escalate to the human** (raise the budget or wrap up). Completing one card increments the Run counter **and** the Mission counter; either level at its cap → `advance` is refused.
3. **Audit / discovery has no execution authority (hard rule)**: findings go to `DEFERRED_BACKLOG` and the run stops there; only Development may change code, so the chain `Audit → Finding → Task → Code` is forbidden. A later Development run admits only the items relevant to its own Mission.
4. **Blocker admission (disambiguated)**: a new issue that blocks the current Mission or card → source `blocker`, and it **may enter the workset automatically but never grows the workset cap**; if the workset is full, replace the lowest-priority not-yet-started card and move it to `Deferred Backlog` (noting its source). Does not block → `Deferred Backlog` directly.
5. **Auto-accept, escalate by exception**: objective gates pass + low risk → auto-accept and continue. Escalate to the human only for product-semantics changes · irreversible or high-risk operations (deploy / delete / publish / credentials / money) · a blocked Mission · **Mission** budget exhausted with work unfinished.
6. **Budget exhausted ≠ failure**: write `RUN_STATE.md` (mission, DoD, workset, blocked, deferred backlog, counters, last verified commit, resume point) and stop. The next run resumes from that file — never by re-reading a long history.
7. **Dispatch through the gate (controller)**: before dispatching any card run `node tools/runstate.js gate <project-root>` — only `{"allow":true}` with exit 0 authorizes the dispatch; exit 1 → stop and checkpoint. `resume` prints the recovery plan, `new-run` opens a fresh Run, `status --json` is machine-readable.
8. **One control policy per project**: this skill owns the development policy; `AGENTS.md` holds project-local rules; a goal is only an execution mechanism. Never stack a second open-ended "keep improving the product" prompt on top — that is how token runaway starts.

## Rule-file discipline (AGENTS.md / CLAUDE.md)

1. The 100-line principle: a map, not a manual. Write only what the agent can't guess; for every line ask "would deleting it cause a mistake? If not, delete it."
2. Grows from mistakes: start empty; add one rule per real mistake (compounding); use exclusion invariants ("this project does not use X") instead of enumerating options.
3. Advice vs constraint: rule files are advice; red lines (deletion / side effects / dangerous commands) need machine-level enforcement (DSH pre-execute gates) plus testing (blacklist AND whitelist, each once).

## Context & cost

- The repo is the single source of truth; conversations keep only pointers.
- Three pollution strategies: compaction (when continuity matters) / context reset (after 2 failed fixes, clear and restart) / a new session (for unrelated work).
- Budgets are numbers, not intentions (see bounded autonomy); if the acceptance rate < 50%, stop and rethink the process itself.
- Run a global adversarial review (malicious-user view) every 2–3 weeks — in Audit Mode, which reports and stops.

## Scale

- Small (days): one session + subagents on demand + 5–10 cards; verify with tests and self-checks.
- Large / long-running (weeks–months): tasks/ as the board + finite epochs + `RUN_STATE.md` resume + workers 2 (max 3); goal only continues an already-defined Mission; weekly retro into AGENTS.md.
- Production: verification in CI; worktree isolation; reviewer agents; escort the PR the last mile.

## Templates & references

- Task card `references/task-card-template.md` · SPEC `references/spec-template.md` · Verify checklist `references/verify-checklist.md`
- Control layer: `references/production-control.md` (budgets, stop conditions, escalation) · `references/run-state-template.md`
- Optional background: `references/framework.md`
- 中文版见 `SKILL.zh-CN.md`（同名变体，正文中文，模板在 `references.zh-CN/`）。

## Checklist (before closing each card)

- [ ] Card has: Mission / source / goal / acceptance criteria / files / constraints / expected evidence
- [ ] Proof of work includes a change summary + diff + tests + screenshots
- [ ] Objective gates pass (auto-accept) or the card is `BLOCKED` after one repair
- [ ] Human escalation only for a listed exception (semantics / irreversible / blocked / budget)
- [ ] Lessons are in AGENTS.md; `RUN_STATE.md` counters updated; anything repeated 3× is automated
