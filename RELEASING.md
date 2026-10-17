# Release process

How this repository publishes a version. Policy adopted 2026-10-04.

## Cadence

- Publish a new version roughly **every 15 days** since the previous tag.
- The window may be **skipped** when there has been no substantive change; it may be **shortened** for a security or breaking change.

## Release notes

Every release must summarise **the changes since the previous tag** (the whole ~15-day window):

- user-visible changes, grouped by type (Added / Fixed / Changed …);
- breaking changes and the upgrade / migration steps;
- the window covered, e.g. `v0.5.3 → v1.0.0`.

The source of truth is the matching entry in `CHANGELOG.md`. `gh release create --generate-notes`
(optionally with `--notes-start-tag <previous-tag>`) can seed the notes by grouping merged PRs and
commits, but the text must be **reviewed and finished by hand** — generated notes do not explain
impact or migration.

## Versioning

- Follow [SemVer](https://semver.org/).
- Keep root and plugin `package.json.version` in sync. Record the imported research version in root `pdwSkillVersion`; it must match the Skill body/runtime. Frontmatter contains only name/description.
- `scripts/validate-skills.mjs` enforces that consistency; its failure blocks the release.

## Steps

```sh
# 0. pick the new version, e.g. VERSION=1.0.1
# 1. update distribution manifests; update pdwSkillVersion only when importing a new research runtime
node scripts/sync-copies.mjs          # scripts/sync-copies.mjs
# 2. add the CHANGELOG.md entry
# 3. verify locally
node scripts/validate-skills.mjs
node --test scripts/validate-skills.test.mjs
node --test skills/personal-dev-workflow/scripts/drivers.test.mjs
node skills/personal-dev-workflow/scripts/pdw.test.mjs
node tools/run-tests.mjs
# 4. commit, then tag and push
git commit -am "release: v1.0.1"
git tag v1.0.1
git push origin main --tags
# 5. create the Release; notes summarise the previous tag..this tag window
gh release create v1.0.1 --generate-notes --notes-start-tag v1.0.0 --title "v1.0.1 — <headline>"
```

## Scope and current limitations

- **A release here means a GitHub tag + Release** (and the install path `npx skills add satan9394/dsh-personal-dev-workflow`).
- **npm / GitHub Packages publishing is currently unavailable.** `publish-package.yml` is `workflow_dispatch`-only
  because publishing fails with `npm error 403 … permission_denied: write_package` — the package
  `@satan9394/dsh-personal-dev-workflow` appears to still be linked to a previously deleted repository.
  Restore it by relinking / deleting that package (needs package admin), then run the workflow manually.
- Do the release from a machine whose git identity is `satan9394 <satan9394@users.noreply.github.com>`
  so no personal email lands in commit metadata.
