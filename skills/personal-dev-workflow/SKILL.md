---
slug: personal-dev-workflow
name: personal-dev-workflow
displayName: Personal Dev Workflow
description: "A lean personal development workflow: one conductor + isolated workers + file-based memory + a verification loop; a six-step task-card cycle; the human only raises requirements and signs off. Use it for project development, task breakdown, feature work, and bug fixes."
metadata:
  type: instruction
  tags: [development, workflow, task-card, dsh]
version: "0.3.0"
---

# Personal Dev Workflow v3 (personal-dev-workflow)

> One conductor + isolated Workers + file-based memory + a verification loop.
> The human only raises requirements and signs off; all hauling and relaying is automated.
> Rationale & sources: `references/framework.md` (optional reading).

## When to use

- Starting a dev project / saying "let's build" / breaking work down / implementing a feature / fixing a bug
- Turning a large requirement into executable tasks that keep moving
- Long-running projects that need a steady rhythm and traceable progress

## Core principles (one line each)

1. One project = one workspace + one conductor session (the main session keeps only "goal + file pointers + summaries").
2. Task cards live on disk in `tasks/` (one card per file; executors read the card, not the chat log).
3. One isolated executor per card; it hands back proof of work (diff + tests + screenshots).
4. The one who does the work doesn't grade it: review in a fresh context that sees only the diff and the acceptance criteria.
5. All memory lives in files (AGENTS.md / docs/ / tasks/); conversations forget, files don't.

## The six-step loop

1. **Break down**: converge a fuzzy requirement to one page (Problem / key assumptions / MVP / Not Doing); write a SPEC for big features (skip the plan if it fits in one sentence); explore unfamiliar codebases first (focused 3–5 searches, then stop; check the blast radius: callers / tests / interfaces).
2. **Dispatch**: one card → one isolated executor (subagents by default; use `codex exec` if you prefer Codex). Every card MUST include constraints (what must NOT be changed) and expected evidence. Three dispatch questions: who coordinates? is the subtask truly independent? will it touch the same files? Prefer a single agent when possible; external side effects (send / publish / delete) are not authorized by default.
3. **Proof of work**: a change summary (if it can't explain what changed, don't trust the code) + diff + tests + screenshots, citing its source (spec / card items).
4. **Verify**: objective gates (executable criteria, not "feels done"); default suspicion (assume the code is broken until proven to run); Review five things (out-of-scope changes / wrong files / interface compatibility / error handling / maintainability); dispatch a reviewer subagent with a fresh context for large changes; hard stop after 3 failed fixes (circuit breaker) and start over.
5. **Accept**: the user picks one of three — merge / rework / redirect.
6. **Retro**: write lessons into AGENTS.md (mapped to real mistakes); automate anything repeated 3+ times; garbage-collect stale rules periodically.

## Rule-file discipline (AGENTS.md / CLAUDE.md)

1. The 100-line principle: a map, not a manual. Write only what the agent can't guess; for every line ask "would deleting it cause a mistake? If not, delete it."
2. Grows from mistakes: start empty; add one rule per real mistake (compounding); use exclusion invariants ("this project does not use X") instead of enumerating options.
3. Advice vs constraint: rule files are advice; red lines (deletion / side effects / dangerous commands) need machine-level enforcement (DSH pre-execute gates) plus testing (blacklist AND whitelist, each once).

## Context & cost

- The repo is the single source of truth; conversations keep only pointers.
- Three pollution strategies: compaction (when continuity matters) / context reset (after 2 failed fixes, clear and restart) / a new session (for unrelated work).
- Cap budgets on long loops; if the acceptance rate < 50%, stop and rethink the process itself; loops > 2 rounds must have on-disk memory.
- Run a global adversarial review (malicious-user view) every 2–3 weeks.

## Scale

- Small (days): one session + subagents on demand + 5–10 cards; verify with tests and self-checks.
- Large / long-running (weeks–months): tasks/ as the board + goal continuation + 3–5 parallel workers + weekly retro into AGENTS.md.
- Production: verification in CI; worktree isolation; reviewer agents; escort the PR the last mile.

## Templates & references

- Task card `references/task-card-template.md` · SPEC `references/spec-template.md` · Verify checklist `references/verify-checklist.md`
- Optional background: `references/framework.md`
- 中文版见 `SKILL.zh-CN.md`（同名变体，正文中文，模板在 `references.zh-CN/`）。

## Checklist (before closing each card)

- [ ] Card has: goal / acceptance criteria / files / constraints / expected evidence
- [ ] Proof of work includes a change summary + diff + tests + screenshots
- [ ] Objective gates pass; large changes got a review (Review five things)
- [ ] User signed off (merge / rework / redirect)
- [ ] Lessons are in AGENTS.md; anything repeated 3× is automated; long loops are budgeted
