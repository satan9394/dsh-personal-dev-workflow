# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
