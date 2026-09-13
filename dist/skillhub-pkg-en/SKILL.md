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
7. **Dispatch through the gate (controller)**: before dispatching any card run `node tools/runstate.js gate <project-root>` — only `{"allow":true}` with exit 0 authorizes the dispatch; exit 1 → stop and checkpoint. `resume` prints the recovery plan, `new-run` opens a fresh Run, `status --json` is machine-readable. **Since v0.5.1 this discipline also has a host-level hard backstop — see "Enforcement surface & fail-open/closed boundaries" below.**
8. **One control policy per project**: this skill owns the development policy; `AGENTS.md` holds project-local rules; a goal is only an execution mechanism. Never stack a second open-ended "keep improving the product" prompt on top — that is how token runaway starts.

## Enforcement surface & fail-open/closed boundaries

Item 7 above is **discipline** (it depends on the agent obeying). Since v0.5.1 DSH has a **host-level hard gate** (`tools/pre-execute` plugin `n3-budget-gate`) that turns "check the budget before dispatching" into harness behavior. **Every number and boundary in this section is measured on a real machine, not design intent.**

**Enforced surface (what it can block)**: only **dispatch-class** tools — `subagent` / `subagent_fork` / `workflow` / `ralph`. The block happens **before** the tool is dispatched (and before argument validation): the model receives `Error: 预算闸门: <reason>` and the tool body never runs.

**Non-enforced surface (what it deliberately does NOT block)**: `pwsh` / `bash` / `read` / `write` / `edit` and every other execution- or I/O-class tool. This is the anti-deadlock design: once the budget is exhausted the agent can still run `node tools/runstate.js status|advance|new-run` to extend the budget, and can still edit or delete the state file. Otherwise "budget exhausted" would mean "permanently locked out".

**Decision table (each row measured)**:

| Situation | Behavior | Fail direction |
|---|---|---|
| Project root has **no** `RUN_STATE.md` (unmanaged project) | **allow** (+ a one-time notice) | **fail-open** — most directories have no state file; denying would lock down the whole harness |
| Has `RUN_STATE.md`, gate prints valid JSON `{"allow":true}` | allow | — |
| Has `RUN_STATE.md`, gate prints valid JSON `{"allow":false}` | **deny**, reason is the controller's verbatim text (with the exhausted counter and its current value) | — |
| Has `RUN_STATE.md`, but the controller crashes / prints non-JSON / times out / is missing | **deny** | **fail-closed — for managed projects only**; the reason says "controller 异常，请修状态文件或删除它" |
| Tool outside the whitelist (including `pwsh`) | allow, and the **controller is never even spawned** | fail-open |
| An internal plugin error (bug / fs failure) | allow | **fail-open** — only a controller anomaly is fail-closed; one plugin exception must not brick the harness |

**How the project root is resolved**: `exec.agent.session.header.cwd` (the session workspace), falling back to `process.cwd()`; config `projectRoot` can override it explicitly. The check is **exact-root** (no upward walk) — a subdirectory always counts as "unmanaged" and is allowed. Missing a block is preferable to locking something out.

**Performance & caching**: one decision including spawning node costs about **79–117 ms** (measured; the target is < 200 ms). The same project root is cached for a **1.5 s TTL with in-flight coalescing** (a burst on one root spawns the controller once). **Do not lengthen the TTL** — budgets change.

**Audit**: every decision appends one JSONL line to `~/.dsh/logs/n3-budget-gate.jsonl` (`ts` / `tool` / `root` / `exitCode` / `gateJson` / `decision` / `reason`), so you can later confirm whether a dispatch passed the gate and why.

**Residual risk (stated honestly — do not treat this as the only line of defense)**:

1. **The loading surface is fail-open**: if the plugin is missing, not loaded, or overridden by another layer of the same profile, the gate **silently disappears** — the same class of risk as `deny-risk-commands`. Confirm via doctor/health checks or a live test that the entry really is in the tree.
2. **A broken patch file → dsh will not start** (fail-loud). Before touching a profile: back up `cordis.patch.yml`, really boot once in an isolated `DSH_HOME` (`--dump-config` is **not** enough to catch a duplicate loader entry id), send a harmless tool call right after the change, and roll back immediately on any anomaly.
3. **It only covers the dispatch checkpoint**: it cannot constrain the work already running inside a dispatched worker, nor consumption that never goes through a tool call. The real cost gate is still "one envelope per Mission + two-level budgets".

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
