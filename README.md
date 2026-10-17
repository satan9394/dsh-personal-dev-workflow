# Personal Dev Workflow

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![version](https://img.shields.io/badge/version-2.0.1-informational)](CHANGELOG.md)
[![agents](https://img.shields.io/badge/agents-OpenCode%20%7C%20Codex%20%7C%20AGY-8a2be2)](#install)

> **One coordinator compiles your goal into a task contract; isolated role sessions do the work.**
> Real checks decide, an independent review signs off, and everything resumes from recorded evidence.
>
> 中文：**唯一协调者把你的目标编译成任务契约，隔离的角色会话干活**；真实检查定成败，独立复核签字，
> 全过程按落盘证据恢复。人只提需求与拍板。

v2.0.0 is an **executable relay**, not a rule document. The skill ships a dependency-free Node CLI
(`scripts/pdw.mjs`): it freezes a contract, dispatches `scan → test-plan → implement → review`
(plus an optional `planner`) to CLI agents, runs the acceptance commands itself, allows **at most one**
targeted repair, and keeps every raw log. Cost routing is explicit: OpenCode + DeepSeek for low-cost
scanning and verification prep, Codex for implementation, an independent session for review, AGY for
planning when a task needs it.

## Current version: 2.0.1

This working tree prepares 2.0.1 locally; remote installation still follows the published Git state.

The distribution now imports research Skill **1.3.2-local**, retaining the committed role-JSON recovery
fix from `0e06aea`. Distribution versions (`package.json` and the plugin manifest) remain on the 2.x
line; `pdwSkillVersion` records the research/runtime version without adding fields to Skill frontmatter.

This update fixes ignored-root and explicit ignored-scope snapshots, truthful doctor model flags,
Windows npm Codex native discovery, unsafe CLI prefixes and failed-coverage finalization. Coverage
is visible in status/handoff; it remains post-run detection, not a filesystem sandbox. Doctor checks
binary/configuration readiness; authentication and provider routing require a small real task.
Upgrades and old-state migration remain manual; retain task evidence and used budgets.

Research and original experiments live in the separate research project. This repository is the
Skill maintenance/distribution home; see [the import record](docs/evidence/research-1.3.2-import.json).

## What v2.0.0 changes

1. **The skill becomes executable.** The program — not the prose — freezes the contract, dispatches
   roles, runs checks and records evidence. `SKILL.md` (zh-CN) only tells the coordinator how
   to drive it.
2. **One skill instead of the en/zh pair.** v1.0.0 shipped `personal-dev-workflow` (English) *and*
   `personal-dev-workflow-zh`; v2.0.0 ships a single skill named `personal-dev-workflow` whose body is
   Chinese, with an English `description` so English-language agents still trigger it.
3. **Budgets are per task and honest.** The program caps CLI launches, elapsed time, process timeout and
   repair count. Money/token ceilings are recorded as **`unknown`** — there is no provider evidence for
   them, so the skill does not claim a hard currency limit.
4. **Machine checks beat agent claims.** A non-zero check exit cannot be overwritten by an agent saying
   "pass"; the reviewer must list every acceptance ID with its evidence. After a repair the checks and
   the review run again — once.
5. **Host discipline, not host hijacking.** Permissions stay with the host (Codex sandbox, OpenCode
   plan/build, AGY plan/accept-edits). The relay never passes a permission-bypass flag, never commits /
   pushes / deploys on its own, and never nests a scheduler inside a role session.
6. **The v1.0.0 enforcement layer leaves the skill.** The JSON state controller, the eval cases and the
   v0.5.x host gate are no longer bundled with the skill. The v1.x line stays available in this
   repository and at tag `v1.0.0` (see *Legacy lines* below).

## Install

```sh
npx skills add satan9394/dsh-personal-dev-workflow
```

| Way | Command / path |
|---|---|
| Manual copy (universal) | copy `skills/personal-dev-workflow/` into `<project>/.agents/skills/` — discovered by Codex, OpenCode, DSH and Antigravity |
| Manual copy (Claude Code) | copy `skills/personal-dev-workflow/` into `~/.claude/skills/` or `<project>/.claude/skills/` |
| DSH bundle plugin | `dsh plugin --profile web add link:<this repo>/plugin/dsh-personal-dev-workflow` |
| GitHub Packages (npm) | `npm install @satan9394/dsh-personal-dev-workflow --registry=https://npm.pkg.github.com` — requires a GitHub token with `read:packages` |
| Into an existing project | `node <skill>/scripts/pdw.mjs install --project <path>` — refuses to overwrite an existing skill of the same name |

## Driving it

Say **"用 PDW 在 \<project\> 完成 \<goal\>"** (or "start work / implement this / fix this bug") and the
coordinator writes the contract for you. You never hand-write JSON.

```sh
node <skill>/scripts/pdw.mjs init     --project <project>   # .pdw/config.json + .gitignore entry
node <skill>/scripts/pdw.mjs doctor   --project <project>   # executables, versions, configuration; not authentication
node <skill>/scripts/pdw.mjs new      --from contract.json --project <project>
node <skill>/scripts/pdw.mjs plan     <id>                  # roles, models, checks, limits — no model call
node <skill>/scripts/pdw.mjs run      <id>                  # two read-only scans in parallel, then serial
node <skill>/scripts/pdw.mjs status   [id]                  # evidence freshness (evidence_current=false ⇒ drift)
node <skill>/scripts/pdw.mjs handoff  <id>                  # refresh HANDOFF.md, spend nothing
node <skill>/scripts/pdw.mjs cancel   <id> | resume <id>     # stop the process tree / continue from stage facts
```

The contract lives in `.pdw/tasks/<id>/contract.json`; `baseline.json` freezes the starting file hashes;
`state.json` is the only run state; each stage writes `HANDOFF.md`, and `REPORT.md` carries the outcome.
`status` / `handoff` re-hash the sources, so evidence accepted before a source change is reported as
stale — an old acceptance can never approve new code. Default final answer is four lines: 结论 / 改动 /
验证 / 下一步.

Minimal contract (fields are documented in [`references/runtime.md`](skills/personal-dev-workflow/references/runtime.md)):

```json
{
  "goal": "修复配置保存失败，保持既有接口兼容",
  "mode": "develop",
  "scope": ["src/settings", "tests/settings.test.mjs"],
  "acceptance": [{ "id": "AC1", "description": "有效配置保存并能重新加载，非法输入被拒绝" }],
  "checks": [{ "id": "settings", "command": "node", "args": ["--test", "tests/settings.test.mjs"] }]
}
```

## Boundaries

- **One writer per path**; scans and reviews are read-only. Checks are commands that really exist in the
  project — a fabricated check that always exits 0 is a defect, not a pass.
- **No self-approval**: the reviewer's context is separate from the implementer's, and it reports per
  acceptance ID. `develop` cannot be accepted with an open high/blocker finding; an `audit` run reports
  findings *about* its subject and its own completion is judged by coverage and evidence.
- **Source fingerprints** cover Git tracked/untracked files plus explicit ignored scope; ignored roots or empty Git lists use filesystem snapshots. They detect drift and out-of-scope edits within reported coverage.
  They are a detector, **not** a sandbox, a content signature or a defence against a hostile same-user
  process.
- **Unknown stays unknown**: unverifiable coverage (browser, real provider settings, server-side billing
  after a local cancel) is disclosed instead of asserted.
- **Nothing is auto-committed**: no commit / push / merge / send / deploy / publish / permanent deletion.
  Task records are kept; the lock history is kept.

## Repository layout

```
dsh-personal-dev-workflow/
├── skills/personal-dev-workflow/      # THE skill (research 1.3.2-local): SKILL.md + references/runtime.md
│                                      #   + agents/openai.yaml + assets/audit-task.json
│                                      #   + scripts/{pdw.mjs, drivers.mjs, pdw.test.mjs, drivers.test.mjs}
├── plugin/dsh-personal-dev-workflow/  # DSH bundle plugin — bundles the skill above (generated copy)
├── dist/skillhub-pkg/                 # flat publish package for SkillHub (generated copy)
├── scripts/validate-skills.mjs        # frontmatter + reference + copy + version-consistency checks
├── scripts/sync-copies.mjs            # regenerate plugin/dist copies from skills/
├── .github/workflows/                 # validate-skills.yml · publish-package.yml
├── docs/ demos/ tools/ taskcard-cli.js  # v1.x / v0.5.x line, kept deliberately (see below)
└── plugin/dsh-budget-gate/            # v0.5.x host gate, kept deliberately (see below)
```

`skills/` is the single source of truth; the plugin bundle and the `dist/` package are **generated
copies** and a CI check fails on any byte difference. Run `node scripts/sync-copies.mjs` after editing the skill.

## Legacy lines (kept deliberately)

| Artifact | Line | Status |
|---|---|---|
| tag `v1.0.0`, `skills/personal-dev-workflow-zh` at that tag | 1.0.0 | the retired en+zh twin, six-step task-card loop, JSON state controller (`scripts/runstate.js`), 4 eval suites, adapters |
| `tools/runstate.js` + `tools/run-tests.mjs` | 0.5.x | Markdown `RUN_STATE.md` controller and its 43-case suite; still exercised by CI |
| `plugin/dsh-budget-gate/` | 0.5.x | host-level budget gate, kept byte-identical to the deployed copy for drift checking |
| `docs/`, `demos/` | 0.5.x – 1.0.0 | audit notes, case study, runnable evidence, static visualizations |
| `taskcard-cli.js` | 1.x | zero-dependency task-card CLI for a `tasks/` board — still usable on its own |

None of these are loaded by the v2.0.0 skill. They are kept so the previous designs stay verifiable
rather than described from memory.

## Verification

This repo practices what the skill preaches:

- `node scripts/validate-skills.mjs` — name/description-only frontmatter, existing references,
  research version mapping, matching distribution manifests, and byte-identical generated copies.
- `node --test scripts/validate-skills.test.mjs` — real validator fixtures for valid packaging,
  rejected metadata/version drift, fragment links and stale copies.
- `node --test skills/personal-dev-workflow/scripts/drivers.test.mjs` — native discovery, profile
  policies and the retained role-JSON recovery patch, including malformed-output rejection.
- `node skills/personal-dev-workflow/scripts/pdw.test.mjs` — 32 fixture orchestration cases,
  including ignored Git roots/scope, evidence freshness, budgets, locks, cancellation and failure
  reporting. Evidence stays in this checkout's `.pdw/test-runs/` (or the installed project's `.pdw/`).
  These are real local fixture processes, not live provider verification.
- `node tools/run-tests.mjs` — the retained v0.5.x controller suite; skipped cases remain explicit.
- CI additionally runs the **official Agent Skills validator** (`skills-ref validate`) pinned to an
  immutable commit, on a runner with `PYTHONUTF8=1` because that validator reads files with the platform
  default encoding.
- `npx skills add satan9394/dsh-personal-dev-workflow --list` must discover the skill.
- v1.0.0 was exercised end-to-end on real projects (a task-card CLI, and a three-run bounded-autonomy
  test under the v0.5.x model): [`docs/case-study-bounded-autonomy.md`](docs/case-study-bounded-autonomy.md)
  · runnable evidence: [`docs/evidence/runstate-cli/`](docs/evidence/runstate-cli/).

## Releasing

Roughly **every 15 days**, or skipped when nothing substantial changed. Every release summarises the
changes since the previous tag; see [`RELEASING.md`](RELEASING.md).

## Sources

Distilled from OpenAI Codex (harness engineering / Symphony), Anthropic (Claude Code best practices) and
DeepSeek Harness field experience, then rebuilt as an executable relay inside the author's PDW research
project. Per-aspect rationale lives in the skill's `references/runtime.md`; the v1.0.0 rationale stays
readable at tag `v1.0.0`.

## License

MIT.

---

## 中文速览

个人开发工作流 v2：**唯一协调者**把目标编译成任务契约，跨 OpenCode / Codex / AGY 分派隔离角色会话，
跑真实检查、独立复核，并按落盘证据恢复。安装：

```sh
npx skills add satan9394/dsh-personal-dev-workflow
```

或把 `skills/personal-dev-workflow/` 复制到项目 `.agents/skills/`（Codex / OpenCode / DSH / Antigravity）
或 `.claude/skills/`（Claude Code）。

对 agent 说"用 PDW 在 \<项目\> 完成 \<目标\>"（或"开工 / 实现这个功能 / 修这个 bug"）即可，你不必写 JSON。
程序入口 `node <本Skill>/scripts/pdw.mjs <命令>`，命令与契约字段见
[`references/runtime.md`](skills/personal-dev-workflow/references/runtime.md)。

与 v1.0.0 的差别：单 skill（不再有 `personal-dev-workflow-zh` 双份）、skill 自带可执行程序、
金额/Token 上限一律记 `unknown`（没有提供方证据就不宣称硬限制）、旧的 JSON 状态控制器与宿主预算闸门
不再随 skill 发布（v1.x 那条线在仓库与 tag `v1.0.0` 里保留）。
