# framework — background & sources for the personal dev workflow (optional reading)

> This file is the footnote to SKILL.md: it explains *why* each rule exists and where the numbers come from.
> You don't need it to execute; read it only to understand the rationale or to question a rule.

## Agent = Model + Harness (five components)

The harness governs how an agent is armed for a single run: which tools, which actions, what counts as done, how mistakes are corrected.
Introduce the five components in order — **never all five at once**:

| Component | What it does | Typical implementation | Layer |
|---|---|---|---|
| Instructions | Tells the AI what to do | AGENTS.md / task cards | Input |
| Constraints | Stops the AI from doing wrong | Hooks / Linter / CI / Sandbox | Input |
| Feedback | Checks whether the AI did right | Tests / independent review / observability | During |
| Memory | Keeps the AI from repeating mistakes | AGENTS.md rules / docs/ | Cross-time |
| Orchestration | Makes several AIs collaborate | subagents / workflow | Cross-space |

Order: instructions + basic feedback first (make the AI able to run tests) → add constraints when it annoys you → build memory when you're tired of re-explaining → orchestration last.
(Source: community harness-engineering practice; LangChain data: with only the harness changed, Terminal Bench went 52.8% → 66.5%.)

## Key sources

- **The 100-line principle**: Boris Cherny (Claude Code's creator) keeps his CLAUDE.md around 100 lines; OpenAI's AGENTS.md is about 100 lines — a map and pointer, not a manual. A 500–1000-line instruction file is worse: bloat makes the AI ignore what matters.
- **Verification improves quality 2–3×**: Boris Cherny and Anthropic's official best practices ("Give Claude a way to verify its work").
- **The one who does the work doesn't grade it**: Anthropic recommends "engineering a strict independent evaluator is far easier than teaching a generator to self-criticize"; reviewer subagents get a fresh context and see only the diff and the criteria.
- **Advice vs constraint**: CLAUDE.md rules are advice (usually followed); Hooks/CI are constraints (programmatic, unavoidable). Constraints protect the bottom line, not preferences.
- **Rules grow from mistakes**: Mitchell Hashimoto's definition — "every time the agent makes a mistake, engineer a fix so it can never make that mistake again"; Ghostty's AGENTS.md lines each map to a real past error.
- **Reasoning sandwich**: plan with high reasoning, drop for implementation, go full for verification (66.5%); full-power everywhere is worst (53.9%, lots of timeouts) — allocation beats total budget.
- **Context is scarce**: more tokens degrade precise recall of any single item; three pollution strategies: compaction / context reset / a new session.
- **Cost numbers** (community loop-engineering practice): a memoryless loop burns 30k–50k tokens/round vs 5k–15k with memory; an acceptance rate < 50% means you're just producing more review garbage.
- **Circuit breaker**: if the same problem survives 3 fix attempts, clear the context and re-dispatch or switch executors (prevents Ralph-Wiggum spinning).
- **Three dispatch questions** (community agent-teams practice): who coordinates? is the subtask independent? will it touch the same files? Prefer single-agent when possible.

## Scale details (one-line versions from SKILL.md, expanded)

- Large / long-running: 3–5 parallel workers is the industry consensus (Anthropic's internal experience and OpenAI Symphony's official note agree: "most people could comfortably manage three to five sessions at a time").
- Production: Symphony's "escort the PR the last mile" (watch CI, rebase, resolve conflicts); GitHub's @Copilot is an active contributor in core repos.
- Weekly retros into AGENTS.md: Google counts AI usage in performance reviews, Meta has 55%/80% internal targets, OpenAI ships 3.5 PR/person/day — metrics are the norm at company scale; a personal setup only needs AGENTS.md accumulation.

## Mapping to top-company practice

| This skill's rule | Source |
|---|---|
| One conductor + isolated workers | Anthropic's parallel instances; OpenAI Symphony conductor/worker |
| File-based memory (AGENTS.md/tasks/docs) | Anthropic CLAUDE.md in git; OpenAI AGENTS.md as map; Codex notes/history |
| Task cards on disk (tasks/ as board) | OpenAI Symphony: the board is the control plane, one isolated workspace per issue |
| Verification loop + objective gates | Anthropic official best practices; Codex verifiability ("startup under 800ms" as an executable target) |
| Proof of work in handoff | OpenAI Symphony review packet (CI / PR review / demo video) |
| Human decides & accepts only | OpenAI: "Humans steer, agents execute."; Symphony: "manage work instead of supervising agents" |

## Why bounded autonomy (v0.5.1)

The six-step loop makes **one card** reliable. It says nothing about how many cards may exist, and that is exactly where an unbounded run comes from: an open-ended prompt ("keep improving the product") stacked on top of an auto-continuing goal, with audits feeding new cards back into execution forever.

- Anthropic's long-task guidance separates *structured handoff* from *one context doing everything*: state is written down, the context resets, the next run resumes from the file. `RUN_STATE.md` is that handoff.
- Anthropic's Planner → Generator → Evaluator split is about **separation of duties**, not about unlimited agent count — so the default here is 2 workers (max 3), not 3–5.
- OpenAI's delegation guidance is the same shape: delegate low-risk, repeatable work; keep ambiguous design and high-risk changes with a human. Hence *auto-accept by default, escalate by exception*.
- Audit/Discovery is deliberately a **separate mode with no execution authority**: it produces findings, writes them to the backlog, and stops. Backlog is memory, not a queue.
- Default budgets are **two-level** — both levels are counters in `RUN_STATE.md`, and the limits actually written in that file win over these defaults:
  - **Run budget — `## Budget`** (context hygiene for a single run): Epoch ≤ 2 · cards completed per Epoch ≤ 6 · WorkSet ≤ 8 · workers 2 (max 3) · repairs per card ≤ 1 · research pass ≤ 1 · subagent nesting ≤ 1.
  - **Mission budget — `## Mission Budget`** (the fuse across all Runs; `new-run` never resets it): Run ≤ 3 · total cards ≤ 12 · total repairs ≤ 3.
  - **Who handles exhaustion**: a spent **Run** budget is handled by the agent itself — write the state file, then `node tools/runstate.js new-run` to continue in a fresh context, and nobody is asked; only a spent **Mission** budget escalates to the human.
- Numbering them is what turns "be economical" into a value the agent can check rather than an intention it can ignore. Spending a budget is a normal outcome, not a failure.

| Also from | Source |
|---|---|
| Structured handoff + context reset for long tasks | Anthropic long-running-agent guidance (`/clear`, checkpoints, fresh-context verifiers) |
| Separate planner / generator / evaluator roles | Anthropic multi-agent research; the grader is never the doer |
| Delegate repeatable work, keep ambiguous work human | OpenAI's guidance for using coding agents in production |
| Board + isolated runs as the control plane | OpenAI Symphony (one isolated workspace per issue) |

Worked example: a three-run test on a real project (five cards auto-accepted, both stop conditions observed, audit findings held in the backlog, a run resumed from `RUN_STATE.md` alone) — `docs/case-study-bounded-autonomy.md`, runnable evidence in `docs/evidence/runstate-cli/`.
