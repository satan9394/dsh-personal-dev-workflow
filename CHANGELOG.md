# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.5.2] — 2026-09-13 — Mechanical witnesses for the Run-level caps the documents already promised (P1-7)

v0.5.1 was published while the adversarial review's **P1-7** was still open: the finding was never turned into a task
card, so it was silently left out of that release's scope. The conductor's own post-release self-check caught the
omission, and this release closes the finding rather than re-describing it. It was cheap to reproduce and entirely
real — `init` wrote **4** counter lines in `## Budget`, `advance workset` / `advance workers` exited **2** ("unknown
field"), and `advance subagents` had **no cap at all** (20 pushes reached `已派子代理: 21`). Meanwhile the documents
promised `WorkSet 规模 ≤ 8`, `Worker 数 ≤ 3` and `已派子代理 ≤ 8`: three commitments with no mechanical witness.

### Fixed
- **P1-7 — the promised Run-level caps now have witnesses in the file.** `init` scaffolds **8** Run-level counter
  lines instead of 4: `Epoch` / `完成卡数` / `已用 Repair` / `已派子代理` (promoted from an uncapped note to
  `0 / 8`) / `WorkSet 规模: 0 / 8` / `Worker 数: 0 / 3` / `Research pass: 0 / 1` / `子代理嵌套: 0 / 1`.
  `framework.md` also promises `Research pass ≤ 1` and `子代理嵌套 ≤ 1` — the same "commitment without a witness"
  shape — so the ruling on the card was to close the whole class at once, which is why the final count is 8.
- The five new caps are folded into **F1's whole-file validation and refuse-as-a-unit semantics**: once any limited
  counter is at its cap, **any** `advance` exits 1 with the state file left **byte-identical**, and `gate` reports
  `{"allow":false,…}` on the same condition.
- **Backward compatibility (required).** A legacy `RUN_STATE.md` that is missing the four new lines, or that writes
  `已派子代理` / `Worker 数` in the old cap-less note form (e.g. `- Worker 数: 2（上限 3）`, where 上限 3 is only a
  remark), still passes `check` with **exit 0** plus a warning listing what is missing; `advance` / `new-run` / `gate`
  behave unchanged. Only a label that is *present* with an invalid or duplicated value is a state error.

### Added
- Four `advance` field aliases: `workset` → `WorkSet 规模`, `workers` → `Worker 数`, `research` → `Research pass`,
  `depth` → `子代理嵌套` (case-insensitive; `epoch` / `cards` / `repairs` / `subagents` unchanged). `new-run` now
  resets **all 8** Run-level counters, skipping legacy lines that are absent instead of failing on them.
- `tools/run-tests.mjs`: **9 new cases, 34 → 43** — the 8-line skeleton and its 5 caps, the four aliases, cap-refusal
  with an unchanged SHA256 on each new counter, `gate` DENY at the `WorkSet 规模` cap, `new-run` on both a current and
  a legacy file, and a cross-document assertion that the EN/ZH `SKILL.md` / `production-control.md` / `framework.md` /
  `run-state-template.md` spell the 8 labels and 4 aliases exactly as the CLI does.

### Changed
- Both `references/production-control.md`, both `SKILL.md`, both `references/framework.md` and both
  `references/run-state-template.md` (EN/ZH) now carry the same 8 counter labels and 4 aliases as the CLI; the sample
  `RUN_STATE.md` a reader copies was the most visible drift, since it had shown only 6 counter lines.
- Release number aligned to `0.5.2` in the root `package.json`, `plugin/dsh-personal-dev-workflow/package.json`, both
  canonical `SKILL.md` frontmatter blocks, the README badge, both `references/framework.md` headings and the README's
  "Bounded autonomy" heading, with the packaged copies regenerated from `skills/` so the validator is byte-clean.

### Notes
- **Card-face erratum (7 → 8).** The F2 card first said the `## Budget` section grows to "7" counter lines while
  enumerating only 6 — a typo on the card, not a design decision. The ruling recorded on that card was to close the
  whole class of witness-less promises, so the delivered total is **8**; the card was annotated rather than the
  number being silently reinterpreted.
- **Honest process note.** P1-7 should have been carded when the review landed; it was not, and v0.5.1 shipped
  without it. This release exists because the conductor's own post-release self-check found that gap — it is recorded
  here rather than quietly backfilled into the 0.5.1 entry.
- Historical version references are intentionally left alone: "v0.5.1 and earlier" in `production-control.md`, "Since
  v0.5.1" in `SKILL.md`, and the README's "measured" enforcement-boundary heading all describe *when* something was
  introduced or measured, so bumping them would falsify the record.

## [0.5.1] — 2026-09-13 — Honesty and coverage: whole-file validation in the controller, and the host gate written down

v0.5.1 has two themes, and neither is cosmetic. First, `advance` / `new-run` only validated *the single line they
were about to touch*, which left four reproducible ways to step over a budget (or to launder an already-illegal
state file) — all fixed, with the suite grown from 22 to 34 cases. Second, honesty and coverage: v0.5.0 described
the controller's enforcement in absolute terms ("the limit cannot be talked around"), which overstates what a CLI
can do, and the host-level gate that actually adds hard enforcement was not written down anywhere. Both are
corrected here, without inflating the new facts either.

### Added
- **Host-level hard gate, documented for the first time (DSH only).** The profile plugin `n3-budget-gate`, registered
  on the DSH `tools/pre-execute` waterfall, consults `node tools/runstate.js gate <project-root>` before dispatching.
  Its enforcement surface is deliberately narrow, and all three limits below are part of the design:
  - **Dispatch-class tools only** — `subagent` / `subagent_fork` / `workflow` / `ralph`. `pwsh` / shell / `read` /
    `write` / `edit` and every other execution- or I/O-class tool are **not** gated, on purpose: an exhausted budget
    must not lock the agent out of `runstate.js` itself, which would deadlock the session.
  - **Unmanaged projects pass** — no `RUN_STATE.md` in the project root (exact-root, no upward walk) means there is
    no budget to enforce, so the dispatch goes through with a one-time notice.
  - **Fail-open when the gate is absent** — if the plugin is missing, unloaded, overridden or throwing internally,
    the gate silently disappears and dispatch proceeds ungated. The **only fail-closed** case is a *managed project*
    whose controller misbehaves (crash / non-JSON / timeout / script missing).
  - `tools/runstate.js` itself remains **checkable but not enforceable**: it refuses an over-budget increment every
    time it is invoked, and constrains nothing if it is never invoked. The host gate is the only hard layer, and it
    covers the dispatch checkpoint only.
- **The gate now ships in the repository**, not just in one profile: `plugin/dsh-budget-gate/index.mjs` is
  byte-identical (SHA256 `E4AC33F9BA588C2D724EEF08540612818D894696F7964D64509A0090ACBBC790`) to the plugin actually
  running on the author's machine, with `plugin/dsh-budget-gate/README.md` covering the install snippet (profile-side
  `.mjs` + the `cordis.patch.yml` `insert` block), the six decision rules, the fail-open/closed boundary, backup and
  rollback, and the audit path. Reproducibility was the gap: v0.5's only hard layer could not be rebuilt from the
  repository at all.
- `README.md` §**Enforcement boundary** and both `references/production-control.md` (EN/ZH) now carry the same three
  statements (dispatch-class only · unmanaged projects pass · fail-open when the plugin is absent), so no document
  claims an unbounded "mechanically enforced".
- Local git tags **`v0.4.0` / `v0.4.1` / `v0.5.0`** now exist on the matching commits and agree with the remote refs
  (the remote already carried `v0.5.0`), so `git log v0.5.0..v0.5.1` actually walks the release history.

### Changed
- The v0.5.0 entry below is kept for the record but its unconditional wording is qualified: enforcement is
  mechanical **for every command that goes through the controller**, not for the agent as a whole.
- `scripts/validate-skills.mjs` version consistency now also covers
  `plugin/dsh-personal-dev-workflow/package.json` (must equal the root `package.json`), closing the last place a
  release number could drift unnoticed.
- `.github/workflows/publish-package.yml` runs `node tools/run-tests.mjs` **before** `npm publish`, so a controller
  regression cannot be published (the push/PR workflow already had the step).

### Fixed
- **`advance` / `new-run` validated only the counter they were changing — seven reproducible findings, all closed.**
  Both commands now run a **whole-file state validation before any write**, and refuse as one unit (exit 1, reason on
  stderr, **file left byte-identical**) whenever any level holds a state error (illegal counter line, duplicate label
  inside one section, missing required counter, value above `Number.MAX_SAFE_INTEGER`) or any limited counter is at
  `current >= limit`. Concretely:
  - **P0-2** — with `Epoch 2 / 2` already at the cap, `advance cards` exited 0 and rewrote the file anyway.
  - **P0-3** — with an illegal line such as `完成卡数: abc / 6` present, `advance repairs` still exited 0 and wrote.
  - **P1-4** — a duplicated counter label inside a budget section was silently accepted.
  - **P1-9** — deleting a required counter line (`已用 Repair`) still let `check` / `gate` pass.
  - **P1-8** — a value beyond `Number.MAX_SAFE_INTEGER` produced a silent no-op with exit 0 instead of an error.
  - **P1-5** — `new-run` **laundered** a hand-edited over-cap value (`完成卡数 99 / 6`) into a legal state. The legal
    exception is now distinguished precisely: Run-level `current == limit` (normal exhaustion) is **allowed** — that
    is what `new-run` is for — while Run-level `current > limit` is a state error and is **refused**.
  - **P1-6** — `new-run` with a Mission counter at its cap (`总卡数 12 / 12` or `Run 3 / 3`) is now **refused** and
    escalates to a human instead of burning Run quota.
  - `status --json`'s `allowNewRun` and `resume` were made to give the same answer as `new-run` for the Run-level
    over-cap case, so the three surfaces can no longer disagree. Backward compatibility is preserved: a legacy file
    with no `## Mission Budget` section still passes `check` (with a warning) and still works with `advance` — a
    wholly absent section is exempt, only a present-but-incomplete one is an error.
- **Stale evidence copies removed.** `docs/evidence/runstate-cli/runstate.js` and
  `docs/evidence/runstate-cli/tests/run-tests.mjs` were frozen snapshots of the v0.4 CLI and its 9-case suite,
  superseded by `tools/runstate.js` and the 34-case `tools/run-tests.mjs`. They were removed (to the recycle bin)
  and replaced by pointers in `docs/evidence/runstate-cli/README.md` and `docs/case-study-bounded-autonomy.md`;
  the run archive (task cards, run summaries, `RUN_STATE.md`, `AGENTS.md`, README) is kept.
- **Conditional test skips are no longer silent passes.** A case skipped because its precondition does not hold
  (e.g. "the project root has no `RUN_STATE.md`") now prints `SKIP` and is excluded from the pass count, instead of
  being counted as a pass. The suite also asserts that passed + skipped + failed equals the total.
- `tools/run-tests.mjs` gained a **second failure-injection point on a different case**
  (`RS_TEST_FORCE_FAIL=2` → the `gate` deny case; `=1` keeps the original `check` case), so the failure path is
  demonstrated on more than one assertion.
- `README.md` §Verification now registers the test suite's temp-directory cleanup as an **approved exception** to
  the "deletions go to the recycle bin" rule (scope locked by a double prefix check; owner-confirmed 2026-09-12),
  and the stale "22 cases" counts were corrected to 34.

## [0.5.0] — 2026-09-12 — Bounded autonomy, mechanically enforced by the controller

v0.4 bounded autonomy was a *methodology*: the budgets and stop conditions were written in prose, and an agent that
ignored them was only disobeying a document. v0.5 moves the check **into the controller** — every increment routed
through `tools/runstate.js` is validated first, an over-budget one is refused, and the state file is left
byte-identical. That is a real constraint on the commands the controller runs, and **only** on those: it is not a
claim that no controller-free path exists. See `references/production-control.md` §10 and the README's
"Enforcement boundary" for what the host gate does and does not cover.

### Added
- `tools/runstate.js` — the zero-dependency controller for `RUN_STATE.md`, promoted from the archived evidence CLI
  into a shipped component. Subcommands: `init` (12-section skeleton) · `check` (strict two-level budget parsing,
  illegal counter lines reported with their line number) · `advance` (counter guards: run-level `epoch` / `cards` /
  `repairs` / `subagents`, mission-level `runs` / `totalcards` / `totalrepairs`) · `status` (`--json` for machines) ·
  `resume` (resume plan: Resume From + next step + whether a new Run is still allowed) · `gate` (the machine gate:
  `{"allow":true,…}` with exit 0, or `{"allow":false,"reason":…}` with exit 1) · `new-run` (Run-level reset with
  mission-level carry-over).
- **Two-level budgets, both enforced mechanically by the controller.** Run Budget (`Epoch` · `完成卡数` · `已用 Repair` ·
  `已派子代理`) protects the context; Mission Budget (`Run` · `总卡数` · `总 Repair`) is the total fuse. A Run-level
  exhaustion is automatic — `new-run` resets the four Run counters, increments Mission `Run`, and keeps the Mission
  totals as memory, so the agent continues in a fresh context without asking a human. Only a Mission-level
  exhaustion escalates to a human. Any increment that would cross either limit is refused with exit 1 and **the
  state file is left byte-identical** (atomic refusal, asserted by hash in the test suite) — for commands that go
  through the controller; the CLI has no power over an agent that never calls it (see the 0.5.1 section and
  the README's "Enforcement boundary").
- `tools/run-tests.mjs` — black-box suite for the controller (22 cases: budget parsing, gate allow/deny, atomic
  refusal by SHA-256, `new-run` semantics, `resume` wording, plus a failure-injection path).
- `package.json` script `test:runstate`, and a CI step running `node tools/run-tests.mjs` alongside the skill
  validator, so the controller cannot regress unnoticed.
- `files` whitelist: `tools/` now ships in the npm package — the controller is the core of v0.5 and has to travel
  with the skill.

### Fixed
- **`new-run` was missing as an entry point.** v0.4 documented "Run exhausted → resume in a new context" but the
  CLI had no way to open that new Run, and `resume` told the user to get human confirmation at every Run boundary —
  which contradicts the two-level design (Run boundaries are automatic, only Mission boundaries ask a human).
  `new-run` now exists, and `resume` at a Run boundary says explicitly that a human is *not* needed.
- **`init` skeleton default `Epoch: 0 / 3` → `0 / 2`.** Documented and recommended default (and the value in
  `production-control.md`) is Run `Epoch ≤ 2`; the generated skeleton contradicted it.

### Changed
- `references/framework.md` (both languages): the default budget block now states the two-level numbers instead of
  the stale single-level "Epoch 3" — Run: epoch ≤ 2 · cards per epoch ≤ 6 · workset ≤ 8 · workers 2 (max 3) ·
  repairs per card ≤ 1 · research pass ≤ 1 · subagent depth ≤ 1; Mission: runs ≤ 3 · total cards ≤ 12 · total
  repairs ≤ 3 — plus the one-line "who handles it" rule (Run exhaustion → automatic `new-run`; Mission exhaustion →
  escalate to a human).
- Both `SKILL.md` frontmatter `version` fields now track the repository release number: they were still `0.4.0`
  while the published package was already `0.4.1`, which is exactly the drift the new validator check prevents.

### Validator
- `scripts/validate-skills.mjs` gains a **version-consistency check**: every canonical `skills/*/SKILL.md`
  frontmatter `version` must equal the repository root `package.json` `version`. A mismatch is a FAIL and exits
  non-zero, so GitHub release number, npm package, plugin bundle and skill metadata can no longer diverge.

## [0.4.1] — 2026-09-12

### Fixed
- Root `package.json` declared `"type": "module"`, which made every `.js` file in the repository ESM and broke the
  CommonJS entry points: `node taskcard-cli.js …` failed with `require is not defined`, and so did the archived
  evidence CLI. The field is now `"commonjs"`, matching what the `.js` files actually are; the repository's ESM
  tooling (`scripts/*.mjs`, CI) is unaffected because `.mjs` is always ESM.

### Added
- `docs/case-study-bounded-autonomy.md` — a three-run worked example on a real project: five cards auto-accepted
  with no per-card sign-off, both stop conditions observed (budget exhausted, DoD met), audit findings held in the
  backlog and later admitted by a new Mission, and a resumed run continuing from `RUN_STATE.md` alone.
- `docs/evidence/runstate-cli/` — the runnable evidence behind that case study: the zero-dependency `runstate` CLI
  (init / check / advance with a mechanical budget guard), its 9-case black-box test suite, the five accepted task
  cards, both run summaries, and the final state file.

## [0.4.0] — 2026-09-12 — Bounded Autonomy

Closes the gap that let an unbounded run happen: the loop governed *one card*, nothing governed *how many cards*.

### Added
- `SKILL.md` §**Bounded autonomy** (the outer controller): Mission envelope · finite workset · numeric budgets ·
  audit/discovery has no execution authority · auto-accept with escalation by exception · stop-and-handoff ·
  one control policy per project.
- `references/production-control.md` — Mission envelope, mode separation (development vs audit), finite workset,
  default budgets, stop conditions, the four human-escalation triggers, resume protocol, anti-patterns.
- `references/run-state-template.md` — the handoff file written at start-of-run and before every stop, so a new
  context resumes by reading it instead of re-reading history.
- Core principle #6: **backlog is memory, not a queue**.

### Changed
- Step 5 (Accept) is now: gates pass + low risk → auto-accept and continue; FAIL → one repair; FAIL again → `BLOCKED`.
  The per-card human sign-off is gone; humans handle the four listed exceptions only.
- Context & cost: budgets are numbers (not "be economical"); the periodic adversarial review runs in Audit Mode,
  which reports and stops.
- Scale: long-running projects use finite epochs + `RUN_STATE.md` resume + 2 workers (max 3); a goal only continues
  an already-defined Mission and must not be used to keep discovering new Missions.
- Task-card template: adds `Mission` and `Source` (planned / blocker / human-requested); acceptance section now
  PASS → auto-merge, FAIL → 1 repair, FAIL again → BLOCKED, plus the escalation triggers.
- Verify checklist: adds budget/stop-state checks and the conductor-side repair budget; wrap-up no longer requires
  per-card human acceptance.

## [0.3.1] — 2026-09-07

### Changed
- Restructured the repository to the standard `skills/<name>/SKILL.md` layout so the open ecosystem discovers both skills:
  `npx skills add satan9394/dsh-personal-dev-workflow` now lists `personal-dev-workflow` and `personal-dev-workflow-zh`.
- Shortened both descriptions to single-line quoted values (strict YAML parsers reject unquoted `": "` inside a scalar).
- `personal-dev-workflow-zh` now has its own skill name matching its folder (previously shared the English name).

### Added
- `scripts/validate-skills.mjs` + GitHub Actions workflow validating frontmatter, referenced files, and
  byte-identical packaged copies (plugin bundle and `dist/` packages) on every push.
- `scripts/sync-copies.mjs` — regenerates every packaged copy from `skills/`, which is the single source of truth.
- `CHANGELOG.md`, `.gitattributes`.
- Repository topics and description for discoverability.
- GitHub Packages publishing: `@satan9394/dsh-personal-dev-workflow` via `.github/workflows/publish-package.yml`
  (runs on release published, or manually via workflow dispatch; validates skills before `npm publish`).

## [0.3.0] — 2026-09-07

### Added
- Bilingual release: English (default) and Chinese variants, each with four templates
  (task card, SPEC, verification checklist, framework background).
- `plugin/dsh-personal-dev-workflow` — DSH bundle plugin shipping both skills.
- `dist/skillhub-pkg-en` / `dist/skillhub-pkg-zh` — publish packages.
- `demos/` — three static visualizations (industry research, workflow, skill itself).
- Published to Tencent SkillHub (`personal-dev-workflow` v0.3.1, `personal-dev-workflow-zh` v0.3.0).

### Changed
- Lean pass: skill body reduced from 147 to 67 lines by removing cross-section duplication and moving explanatory
  material into `references/framework.md`.

## [0.1.0] — 2026-09-06

### Added
- Initial `personal-dev-workflow` skill: five principles, six-step task-card loop, rule-file discipline,
  context & cost rules, scale guidance, and a self-check list.
- `taskcard-cli.js` — zero-dependency CLI for managing the `tasks/` board.
