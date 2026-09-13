# Personal Dev Workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![skills.sh](https://img.shields.io/badge/install-npx%20skills%20add%20satan9394%2Fdsh--personal--dev--workflow-2ea44f)](https://skills.sh)
[![version](https://img.shields.io/badge/version-0.5.2-informational)](CHANGELOG.md)
[![agents](https://img.shields.io/badge/agents-Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20DSH%20%7C%20OpenCode-8a2be2)](#install)

> **One conductor + isolated workers + file-based memory + a verification loop + bounded autonomy.**
> The human raises requirements and handles exceptions; routine accept-and-continue decisions are automatic.
>
> 中文：**一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环 + 有限自治**；人负责提需求与处理例外。
> 核心是任务卡六步循环：拆卡 → 派活 → 交证 → 验证 → 验收 → 复盘。

Lean by design: the skill body is **85 lines**, every rule has a traceable source, and the rationale lives in optional references instead of the main file. The six-step loop governs *how one card gets done*; the **bounded autonomy** section governs *how many cards may exist and when the run must stop* — numeric budgets, explicit stop conditions, and a `RUN_STATE.md` handoff so a long run can always stop cleanly and resume from a file.

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
| Manual copy (DSH) | copy `skills/personal-dev-workflow/` into `<workspace>/.dsh/skills/` or `~/.dsh/skills/` |
| Manual copy (Claude Code) | copy `skills/personal-dev-workflow/` into `~/.claude/skills/` |
| DSH bundle plugin | `dsh plugin --profile web add link:<this repo>/plugin/dsh-personal-dev-workflow` |
| Tencent SkillHub | `skillhub install personal-dev-workflow --namespace user_d684b111` (also `personal-dev-workflow-zh`) |
| GitHub Packages (npm) | `npm install @satan9394/dsh-personal-dev-workflow --registry=https://npm.pkg.github.com` — requires a GitHub token with `read:packages` (GitHub Packages authenticates even for public packages) |

## The six-step loop

1. **Break down** — converge a fuzzy requirement to one page (Problem / assumptions / MVP / Not Doing); write a SPEC for big features; explore unfamiliar code first (3–5 focused searches, then stop).
2. **Dispatch** — one card → one isolated executor (subagent, or `codex exec`). Every card states constraints (what must NOT change) and the evidence expected. Three questions: who coordinates, is it independent, will it touch the same files?
3. **Proof of work** — change summary + diff + tests + screenshots, citing its source.
4. **Verify** — objective gates (executable criteria, not "feels done"); default suspicion; Review five things; a fresh-context reviewer for large changes; inside a card the same problem is never retried more than 3 times.
5. **Accept** — gates pass + low risk → auto-accept and continue to the next card; FAIL → one repair; FAIL again → `BLOCKED`.
6. **Retro** — lessons into `AGENTS.md`, automate anything repeated 3×, garbage-collect stale rules.

## Bounded autonomy (v0.5.2)

The loop above keeps one card reliable. This layer keeps the whole run bounded, because that is where unbounded runs come from:

- **Mission envelope** — one run serves one Mission with an explicit Definition of Done; the agent picks the next card *inside* it and never enlarges it. **Backlog is memory, not a queue.**
- **Two-level budgets, enforced by a controller** — limits are not prose any more, they are counters in `RUN_STATE.md` that `tools/runstate.js` refuses to cross **when it is asked** (see the enforcement boundary below for what that does and does not cover):
  - *Run Budget* (protects the context — the counters the controller will not let the agent push past):
    `Epoch ≤ 2` · `完成卡数 ≤ 6` per epoch · `WorkSet ≤ 8` · workers `2` (max 3) · `已用 Repair ≤ 1` per card · research pass `1` · subagent depth `1`.
  - *Mission Budget* (the total fuse for the whole Mission):
    `Run ≤ 3` · `总卡数 ≤ 12` · `总 Repair ≤ 3`.
- **Run exhaustion is automatic, Mission exhaustion escalates** — a spent Run Budget means `new-run`: the four Run counters reset to zero, Mission counters carry over as memory, and the work continues in a fresh context *without asking a human*. Only a spent Mission Budget stops the run and hands it to a human.
- **Refusal is mechanical inside the controller** — any increment that would cross either limit is refused (`exit 1`) and the state file is left **byte-identical**; `gate` is the machine-readable form (`{"allow":true,…}` / `{"allow":false,"reason":…}`). This holds for every command the controller is asked to run; it does not constrain an agent that never calls the controller (see the enforcement boundary below).
- **Audit / discovery has no execution authority** — findings go to `DEFERRED_BACKLOG` and the run stops there.
- **Auto-accept, escalate by exception** — humans are asked only for product-semantics changes, irreversible/high-risk operations, a blocked Mission, or a budget exhausted with work unfinished.
- **Stop ≠ failure** — budgets spent means write `RUN_STATE.md` and stop; the next run resumes from that file instead of re-reading history.
- **One control policy per project** — this skill owns the development policy, `AGENTS.md` holds project-local rules, a goal is only an execution mechanism. Never stack a second open-ended "keep improving" prompt on top.

### Enforcement boundary — what is actually enforced (v0.5.1, measured)

The budgets are defended by two layers of different strength, and neither one covers everything:

| Layer | What it covers | Strength |
|---|---|---|
| `tools/runstate.js` (`gate` / `advance` / `new-run`) | the counter it is asked to touch | **checkable, not enforceable** — the CLI refuses an over-budget increment every time it runs, but an agent that never invokes it is not constrained by it at all |
| DSH host gate plugin `n3-budget-gate` (registered on `tools/pre-execute`) | **dispatch-class tools only**: `subagent` / `subagent_fork` / `workflow` / `ralph` | **hard block** — the model gets a deny error and the tool body never runs |

Three boundaries are design decisions, not gaps to paper over:

- **Dispatch-class only.** `pwsh` / shell / `read` / `write` / `edit` and every other execution- or I/O-class tool is **deliberately not gated**: once a budget is exhausted the agent must still be able to run `node tools/runstate.js status|advance|new-run` and to fix the state file, otherwise "budget exhausted" would mean "permanently deadlocked".
- **Unmanaged projects are allowed through.** A project root without `RUN_STATE.md` has no budget to enforce, so the gate passes the dispatch (with a one-time notice). Only projects that opted in by creating a state file are gated, and the check is exact-root (a subdirectory counts as unmanaged).
- **Fail-open when the gate is absent.** If `n3-budget-gate` is missing or not loaded — removed from the profile, overridden by a later layer, or failing inside itself — the gate **silently disappears** and dispatches proceed ungated. The only **fail-closed** case is a *managed project* whose controller misbehaves (crash / non-JSON / timeout / script missing), where the dispatch is denied with "controller 异常，请修状态文件或删除它".

The controller is zero-dependency CommonJS — no install step, just copy `tools/runstate.js` next to your project's `RUN_STATE.md`:

```sh
node tools/runstate.js init <dir>       # 12-section RUN_STATE.md skeleton
node tools/runstate.js gate <dir>       # machine gate: exit 0 = go, exit 1 = stop (prints JSON)
node tools/runstate.js new-run <dir>    # Run budget spent → reset Run counters, Mission Run +1 (no human)
node tools/runstate.js resume <dir>     # resume plan from the file; exit 1 only when the Mission is spent
node tools/runstate.js status <dir>     # two-level budget summary (--json for machines)
```

Full rules: `references/production-control.md` · state file: `references/run-state-template.md` · controller tests: `node tools/run-tests.mjs`.

**The host gate is opt-in and DSH-only.** It also ships in this repository — `plugin/dsh-budget-gate/index.mjs`, byte-identical (SHA256 `E4AC33F9BA588C2D724EEF08540612818D894696F7964D64509A0090ACBBC790`) to the plugin actually deployed on the author's machine — together with `plugin/dsh-budget-gate/README.md` (install snippet, the six decision rules, the fail-open/closed boundary, backup & rollback, audit path):

```sh
cp plugin/dsh-budget-gate/index.mjs ~/.dsh/profiles/<profile>/n3-budget-gate.mjs
# then append the documented `insert` block to <profile>/cordis.patch.yml (hot-reloaded)
```

Nothing in this repository loads it automatically, and no non-DSH agent is affected: the gate only exists once you add it to a DSH profile. Rollback = drop that `insert` block (or restore the backed-up patch file).

## Bilingual

- **English (default):** `skills/personal-dev-workflow/`
- **中文：** `skills/personal-dev-workflow-zh/`

Both ship with the same six references: task card, SPEC, verification checklist, production control, run-state template, and an optional `framework.md` (five-component model, sources, cost numbers, mapping to how top AI companies work).

## Repository layout

```
dsh-personal-dev-workflow/
├── skills/
│   ├── personal-dev-workflow/         # English, 85-line body + 6 references/
│   └── personal-dev-workflow-zh/      # Chinese variant
├── taskcard-cli.js                    # zero-dependency CLI for tasks/ cards (copy to your project root)
├── tools/runstate.js                  # bounded-autonomy controller: init/check/advance/new-run/status/resume/gate
├── tools/run-tests.mjs                # 34-case black-box suite for the controller (no dependencies)
├── plugin/dsh-personal-dev-workflow/  # DSH bundle plugin (bundles both skills)
├── plugin/dsh-budget-gate/            # DSH host gate plugin (tools/pre-execute) — index.mjs + install/rollback README
├── dist/                              # publish packages for SkillHub (en / zh)
├── demos/                             # static visualizations (research / workflow / this skill)
├── scripts/validate-skills.mjs        # frontmatter + reference + copy + version-consistency checks
├── scripts/sync-copies.mjs            # regenerate plugin/dist copies from skills/
└── .github/workflows/                 # validate-skills.yml · publish-package.yml
```

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

- `node scripts/validate-skills.mjs` (also run in CI) checks that each skill's frontmatter is valid, that `name` matches its folder, that every `references/...` file mentioned in the body exists, that each packaged copy (plugin bundle, `dist/` packages) matches the canonical `skills/` source byte-for-byte, and that every canonical `SKILL.md` **`version` equals the root `package.json` version** — release number, npm package, plugin bundle and skill metadata can never drift apart again.
- `node tools/run-tests.mjs` (also run in CI) exercises the bounded-autonomy controller black-box: two-level budget parsing, `gate` allow/deny, atomic refusal (state hash unchanged), `new-run` semantics and `resume` wording — 34 cases. Conditionally skipped cases print `SKIP` and are **not** counted as passes; the suite also ships two failure-injection switches (`RS_TEST_FORCE_FAIL=1` / `=2`) that prove a broken expectation really does fail with a non-zero exit.
- **Deletion-red-line exception, registered:** to clean up after itself the test suite (`tools/run-tests.mjs`) permanently deletes — with `fs.rmSync`, i.e. *not* to the recycle bin — exactly one directory it created itself under `os.tmpdir()`. This is an **approved exception** to the owner's "all deletions go to the recycle bin" rule (Node offers no zero-dependency recycle-bin API), confirmed by the repo owner on **2026-09-12**. The scope is locked by a double prefix check (`os.tmpdir()` + directory name starting with `runstate-v2-tests-`); if either check fails, cleanup is skipped instead. No repository, profile or user path can satisfy both prefixes.
- `docs/evidence/runstate-cli/` keeps the historical artefacts of the three-run test (task cards, run summaries, final state file). Its old copies of the CLI and of the 9-case test script were **removed** (stale duplicates) — the live code is `tools/runstate.js` and `tools/run-tests.mjs`, which the evidence README and the case study now point to.
- `plugin/dsh-budget-gate/index.mjs` is kept **byte-identical** to the host gate deployed in the author's DSH profile; the SHA256 is written down here and in `plugin/dsh-budget-gate/README.md`, so any drift is a one-command check (`Get-FileHash` / `shasum -a 256` on both sides) rather than a claim.
- `node scripts/sync-copies.mjs` regenerates those copies from `skills/` in one command — `skills/` is the single source of truth, and CI fails on any drift.
- `npx skills add satan9394/dsh-personal-dev-workflow --list` must discover both skills.
- The workflow itself was exercised end-to-end on real projects: a task-card CLI (cards → isolated executor → proof of work → verification → acceptance → retro), and a **three-run bounded-autonomy test** where the controller fired for real — five cards auto-accepted with zero per-card sign-off, both stop conditions observed (budget exhausted, DoD met), audit findings held in the backlog, and a resumed run continuing from `RUN_STATE.md` alone. Case study: [`docs/case-study-bounded-autonomy.md`](docs/case-study-bounded-autonomy.md) · runnable evidence: [`docs/evidence/runstate-cli/`](docs/evidence/runstate-cli/).

## Sources

Distilled from OpenAI Codex (harness engineering / Symphony), Anthropic (Claude Code best practices) and DeepSeek Harness field experience. The rule-by-rule mapping lives in `skills/personal-dev-workflow/references/framework.md`.

## License

MIT.

---

## 中文速览

个人开发工作流：一个指挥 + 隔离 Worker + 文件记忆 + 验证闭环。安装：

```sh
npx skills add satan9394/dsh-personal-dev-workflow --skill personal-dev-workflow-zh
```

或把 `skills/personal-dev-workflow-zh/` 复制到 `.dsh/skills/`（DSH）或 `~/.claude/skills/`（Claude Code）。
对 agent 说"开工 / 拆任务卡 / 实现功能 / 修 bug"，即按六步循环推进。
