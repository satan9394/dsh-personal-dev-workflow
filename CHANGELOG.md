# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
