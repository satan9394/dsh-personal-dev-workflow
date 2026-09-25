# Personal Dev Workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-1.0.0-informational)](CHANGELOG.md)
[![agents](https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20DSH%20%7C%20OpenCode-8a2be2)](#install)

> **One conductor + isolated workers + file-based memory + a verification loop + bounded autonomy.**
> The human raises requirements and handles exceptions; routine accept-and-continue decisions are automatic.
>
> 中文：**一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环 + 有限自治**；人负责提需求与处理例外。
> 核心是任务卡六步循环：拆卡 → 派活 → 交证 → 验证 → 验收 → 复盘。

Lean by design: the skill body is **86 lines**, every rule has a traceable source, and the rationale lives in optional `references/` instead of the main file. The six-step loop governs *how one card gets done*; the **bounded autonomy** layer governs *how many cards may exist and when the run must stop* — numeric budgets, explicit stop conditions, and machine-readable state so a long run can always stop cleanly and resume from a file.

## What v1.0.0 changes

v1.0.0 is a structural rework: not more rules, but restoring the Skill as an **on-demand workflow capability**, with runtime control, state, and platform adaptation split into layers.

1. **Autonomy is no longer on by default** — four modes: `quick` / `standard` / `bounded` / `audit`. `standard` stops after a card; only explicit `bounded` auto-continues.
2. **Skill / Harness layering** — the generic Skill no longer claims it can do a host hard gate; enforcement surfaces (e.g. DSH) live in adapters.
3. **Machine state split out of Markdown** — `.agent-state/run-state.json` is the source of truth; `RUN_STATE.md` is only a rendered view.
4. **Worker semantics fixed** — `workers.active` is a gauge (start/stop); `workersSpawned` is a counter (no more "historical total posing as concurrency").
5. **Verification chosen by task type** — docs, backend, frontend, infra and security tasks each use their most relevant evidence.
6. **Memory de-duplication** — AGENTS / ADR-docs / Task Card / machine state / changelog each have one job; small cards are no longer forced to write multiple prose files.
7. **Model decoupling** — the core only defines capability profiles (planner / executor / evaluator); specific model names go into optional presets.
8. **Behavioral evals** — trigger / workflow / autonomy / recovery cases, so behavior is verified, not only format.

## Install (30 seconds)

```sh
npx skills add satan9394/dsh-personal-dev-workflow
# English only:  --skill personal-dev-workflow
# Chinese only:  --skill personal-dev-workflow-zh
```

Works with Claude Code, Codex, Cursor, Gemini CLI, OpenCode, DSH and any agent that reads the standard `SKILL.md` layout.

Other ways:

| Way | Command / path |
|---|---|
| Manual copy (universal) | copy `skills/personal-dev-workflow/` into `<project>/.agents/skills/` — discovered by Codex, OpenCode, DSH and Antigravity |
| Manual copy (Claude Code) | copy `skills/personal-dev-workflow/` into `~/.claude/skills/` or `<project>/.claude/skills/` |
| DSH bundle plugin | `dsh plugin --profile web add link:<this repo>/plugin/dsh-personal-dev-workflow` |
| GitHub Packages (npm) | `npm install @satan9394/dsh-personal-dev-workflow --registry=https://npm.pkg.github.com` — requires a GitHub token with `read:packages` |

## The six-step loop

1. **Break down** — converge a fuzzy requirement to one page (Problem / assumptions / MVP / Not Doing); write a SPEC for big features; explore unfamiliar code first (3–5 focused searches, then stop).
2. **Dispatch** — one card → one isolated executor (subagent, or `codex exec`). Every card states constraints (what must NOT change) and the evidence expected. Three questions: who coordinates, is it independent, will it touch the same files?
3. **Proof of work** — change summary + diff + tests + screenshots, citing its source.
4. **Verify** — objective gates (executable criteria, not "feels done"); default suspicion; a fresh-context reviewer for large changes; one targeted repair, then `BLOCKED`.
5. **Accept** — gates pass + low risk → accept; `standard` stops here and shows evidence, `bounded` continues to the next card.
6. **Retro** — lessons into `AGENTS.md`, automate anything repeated 3×, garbage-collect stale rules.

## Modes

| Mode | Fits | Default behavior |
|---|---|---|
| `quick` | local, low-risk, small change | execute directly + minimal verification |
| `standard` | default multi-step development | one card, one closed loop, show evidence and **stop** |
| `bounded` | user explicitly authorizes continuous autonomy | continue within Mission and budget; requires the state controller |
| `audit` | read-only review / diagnosis | may read, search, test, lint; must not modify / commit / deploy |

**Entering `bounded` requires explicit opt-in.** Installing the Skill, having task cards, or having an `AGENTS.md` does **not** constitute authorization.

## Bounded autonomy

The loop above keeps one card reliable. This layer keeps the whole run bounded:

- **Mission envelope** — one run serves one Mission with an explicit Definition of Done; the agent picks the next card *inside* it and never enlarges it. **Backlog is memory, not a queue.**
- **Two-level budgets, enforced by a controller** — limits are counters in `.agent-state/run-state.json` that the controller refuses to cross *when it is asked*:
  - *Run Budget* (protects the context): `epoch ≤ 2` · `cards ≤ 6` · `repairs ≤ 1` · `workers spawned ≤ 8` · `active workers ≤ 3` · `research ≤ 1` · `workset ≤ 8` · `max subagent depth 1`.
  - *Mission Budget* (the total fuse): `runs ≤ 3` · `total cards ≤ 12` · `total repairs ≤ 3`.
- **Action-scoped refusal** — repairs at cap only reject new repairs; research at cap only rejects new research; a spent worker cap only rejects dispatching more workers. The main agent can still finish the current card. This avoids "research was used once, so the whole run got locked".
- **Run exhaustion is automatic, Mission exhaustion escalates** — a spent Run Budget means `new-run`: Run counters reset, Mission counters carry over, work continues in a fresh context *without asking a human*. Only a spent Mission Budget stops and hands over.
- **Audit / discovery has no execution authority** — findings go to the Deferred Backlog and the run stops there.
- **Stop ≠ failure** — budgets spent means checkpoint and stop; the next run resumes from the state file instead of re-reading history.

### Enforcement boundary — what is actually enforced

The budgets are defended by layers of different strength, and none covers everything:

| Layer | What it covers | Strength |
|---|---|---|
| `skills/*/scripts/runstate.js` (`gate` / `advance` / `worker-start` / `new-run`) | the counter it is asked to touch | **checkable, not enforceable** — it refuses an over-budget increment every time it runs, but an agent that never invokes it is not constrained at all |
| Host hook (e.g. DSH `tools/pre-execute`) | **dispatch-class tools** | **hard block** — but it is adapter-specific and **not shipped here** (see `references/adapter-dsh.md`) |

Three boundaries are design decisions, not gaps to paper over:

- **Dispatch-class only.** Shell / `read` / `write` / `edit` are deliberately not gated: once a budget is exhausted the agent must still be able to run the controller and fix the state file, otherwise "budget exhausted" would mean "permanently deadlocked".
- **Unmanaged projects are allowed through.** A project root with no `.agent-state/run-state.json` has no budget to enforce, so nothing is blocked. Only projects that opted in by creating a state file are gated.
- **The controller is cooperative.** It cannot force an agent to call it. A true pre-execute hard gate requires host integration; this repository does **not** ship plugin code presented as "ready to hard-enforce without verification".

The controller is zero-dependency CommonJS — no install step:

```sh
node .agents/skills/personal-dev-workflow/scripts/runstate.js init <root>
node .agents/skills/personal-dev-workflow/scripts/runstate.js check <root>
node .agents/skills/personal-dev-workflow/scripts/runstate.js gate <root>        # machine gate: exit 0 = go, exit 1 = stop (prints JSON)
node .agents/skills/personal-dev-workflow/scripts/runstate.js advance <root> card
node .agents/skills/personal-dev-workflow/scripts/runstate.js worker-start <root>
node .agents/skills/personal-dev-workflow/scripts/runstate.js worker-stop <root>
node .agents/skills/personal-dev-workflow/scripts/runstate.js new-run <root>
node .agents/skills/personal-dev-workflow/scripts/runstate.js status <root> --json
```

Full rules: `references/bounded-autonomy.md` · state format: `references/state-schema.md` · self-test: `node scripts/runstate.test.js`.

## Bilingual

- **English (default):** `skills/personal-dev-workflow/`
- **中文：** `skills/personal-dev-workflow-zh/`

Both ship the same structure: `SKILL.md`, 11 `references/`, three `assets/` templates (spec / task card / handoff), four behavioural `evals/`, and `scripts/` (state controller + validator).

## Repository layout

```
dsh-personal-dev-workflow/
├── skills/
│   ├── personal-dev-workflow/         # English, 86-line body + references/ + assets/ + evals/ + scripts/
│   └── personal-dev-workflow-zh/      # Chinese variant, same structure
├── taskcard-cli.js                    # zero-dependency CLI for tasks/ cards (copy to your project root)
├── plugin/dsh-personal-dev-workflow/  # DSH bundle plugin (bundles both skills)
├── plugin/dsh-budget-gate/            # DSH host gate for the v0.5.x Markdown state model — see "Legacy v0.5.x" below
├── dist/                              # publish packages for SkillHub (en / zh)
├── demos/                             # static visualizations (research / workflow / this skill)
├── tools/                             # v0.5.x controller + its 34-case black-box suite — see "Legacy v0.5.x" below
├── docs/                              # audit notes, case study, runnable evidence
├── scripts/validate-skills.mjs        # frontmatter + reference + copy + version-consistency checks
├── scripts/sync-copies.mjs            # regenerate plugin/dist copies from skills/
└── .github/workflows/                 # validate-skills.yml · publish-package.yml
```

### Legacy v0.5.x artifacts (kept deliberately)

v1.0.0 moved the state model from **Markdown (`RUN_STATE.md`)** to **JSON (`.agent-state/run-state.json`)**, so this repository now contains **two controllers**. They do not conflict — the v1.0.0 one ships *inside each skill*, the v0.5.x one sits in `tools/` — but do not mix them up:

| Artifact | Model | Status |
|---|---|---|
| `skills/*/scripts/runstate.js` | JSON `.agent-state/run-state.json` | **current (v1.0.0)** |
| `tools/runstate.js` + `tools/run-tests.mjs` | Markdown `RUN_STATE.md` | v0.5.x, kept for reference |
| `plugin/dsh-budget-gate/` | Markdown `RUN_STATE.md` | v0.5.x host gate, kept for reference |
| `docs/case-study-bounded-autonomy.md`, `docs/evidence/` | Markdown `RUN_STATE.md` | v0.5.x evidence, kept for reference |
| `taskcard-cli.js` | task cards | still useful, unchanged |

`plugin/dsh-budget-gate/index.mjs` is kept **byte-identical** to the host gate deployed in the author's DSH profile (SHA256 `E4AC33F9BA588C2D724EEF08540612818D894696F7964D64509A0090ACBBC790`), so any drift is a one-command check rather than a claim. It targets the v0.5.x Markdown model; a v1.0.0 host adapter is described in `references/adapter-dsh.md` but **not shipped as ready-to-use code**.

## Companion tools

`taskcard-cli.js` manages the `tasks/` board the workflow relies on:

```sh
node taskcard-cli.js init            # create tasks/ and its README
node taskcard-cli.js new "写文档"     # create tasks/004-写文档.md
node taskcard-cli.js list            # 编号 | 标题 | 状态
node taskcard-cli.js done 004        # flip status to 已合入
```

The CLI anchors to its own directory — copy it into your project root. `demos/*/index.html` are standalone pages you can open directly in a browser.

## Verification

This repo practices what the skill preaches:

- `node scripts/validate-skills.mjs` (also run in CI) checks that each skill's frontmatter is valid, that `name` matches its folder, that every `references/...` file mentioned in the body exists, that each packaged copy (plugin bundle, `dist/` packages) matches the canonical `skills/` source byte-for-byte, and that every canonical `SKILL.md` **`metadata.version` equals the root `package.json` version** — release number, npm package, plugin bundle and skill metadata can never drift apart.
- `node skills/personal-dev-workflow/scripts/runstate.test.js` exercises the v1.0.0 JSON state controller (smoke tests). Each skill also ships `scripts/validate-skill.py`, which validates structure, frontmatter and local references in isolation.
- `node tools/run-tests.mjs` exercises the **v0.5.x** Markdown controller black-box (34 cases). Conditionally skipped cases print `SKIP` and are **not** counted as passes; the suite ships two failure-injection switches (`RS_TEST_FORCE_FAIL=1` / `=2`) that prove a broken expectation really does fail with a non-zero exit.
- **Deletion-red-line exception, registered:** to clean up after itself the v0.5.x test suite (`tools/run-tests.mjs`) permanently deletes — with `fs.rmSync`, i.e. *not* to the recycle bin — exactly one directory it created itself under `os.tmpdir()`. This is an **approved exception** to the owner's "all deletions go to the recycle bin" rule (Node offers no zero-dependency recycle-bin API), confirmed by the repo owner on **2026-09-12**. The scope is locked by a double prefix check (`os.tmpdir()` + directory name starting with `runstate-v2-tests-`); if either check fails, cleanup is skipped instead.
- `node scripts/sync-copies.mjs` regenerates the packaged copies from `skills/` in one command — `skills/` is the single source of truth, and CI fails on any drift.
- `npx skills add satan9394/dsh-personal-dev-workflow --list` must discover both skills.
- The workflow itself was exercised end-to-end on real projects: a task-card CLI (cards → isolated executor → proof of work → verification → acceptance → retro), and a **three-run bounded-autonomy test** under the v0.5.x model — five cards auto-accepted with zero per-card sign-off, both stop conditions observed (budget exhausted, DoD met). Case study: [`docs/case-study-bounded-autonomy.md`](docs/case-study-bounded-autonomy.md) · runnable evidence: [`docs/evidence/runstate-cli/`](docs/evidence/runstate-cli/).

## Sources

Distilled from OpenAI Codex (harness engineering / Symphony), Anthropic (Claude Code best practices) and DeepSeek Harness field experience. Per-aspect rationale lives in the skill's `references/` (core loop, verification, memory policy, bounded autonomy, model profiles, adapters).

## License

MIT.

---

## 中文速览

个人开发工作流：一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环 + 有限自治。安装：

```sh
npx skills add satan9394/dsh-personal-dev-workflow --skill personal-dev-workflow-zh
```

或把 `skills/personal-dev-workflow-zh/` 复制到项目 `.agents/skills/`（Codex / OpenCode / DSH / Antigravity）或 `.claude/skills/`（Claude Code）。

对 agent 说"开工 / 拆任务卡 / 实现功能 / 修 bug"，即按六步循环推进；默认 `standard` 一卡一停，说"上预算 / 自主推进"才进入 `bounded` 连续自治。
