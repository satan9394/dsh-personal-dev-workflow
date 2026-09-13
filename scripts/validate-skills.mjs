#!/usr/bin/env node
/**
 * Dependency-free validator for this repository.
 *
 * A. For every directory under skills/ (the single source of truth):
 *   1. SKILL.md exists and opens with a YAML frontmatter block.
 *   2. `name` is present and matches the folder name.
 *   3. `description` is present and non-empty; a single-line value containing
 *      ": " must be quoted (unquoted scalars break strict YAML parsers).
 *   4. Every `references/<file>` mentioned in the body exists on disk.
 *   5. The frontmatter `metadata.version` equals the repository root
 *      `package.json` version, keeping the release number the skill declares one
 *      number for the whole repository: the skill, the plugin bundle, the dist
 *      packages and the npm package never drift. A2/A3 below check the same
 *      number in the other manifests.
 *
 * A.6 Agent Skills specification checks — a **supplement to, not an equivalent
 *     of,** the official `skills-ref validate`, which CI runs as well. The two
 *     gates disagree in three measured places: a `compatibility` value over 500
 *     characters and a quoted empty `description: ""` pass here but are rejected
 *     by the official validator (false negatives), while an unquoted `description`
 *     containing prose `[` / `{` (e.g. `Use [this] notation`) is rejected here but
 *     accepted there (false positive). The official validator in CI is the
 *     backstop for these differences. Each specification-check failure below carries
 *     a stable machine-readable `[spec:<id>]` tag so a fixture can prove which
 *     check fired (the pre-existing rules A.1-A.5 and the copy checks in B keep
 *     their original untagged messages):
 *       spec:frontmatter-fields      frontmatter top-level keys must be a subset
 *                                    of name/description/license/compatibility/
 *                                    metadata/allowed-tools.
 *       spec:no-flow-collections     no YAML flow collections (`[a, b]` / `{k: v}`)
 *                                    anywhere in the frontmatter — the official
 *                                    parser rejects them outright.
 *       spec:name-format             `name` is 1-64 chars, only [a-z0-9-], no
 *                                    leading/trailing hyphen, no `--`.
 *       spec:description-length      `description` is at most 1024 characters.
 *       spec:reference-target        every relative path referenced from the body
 *                                    (bare `references/x`, `references.<x>/`,
 *                                    and markdown `[text](target)`) resolves.
 *       spec:metadata-values         every `metadata` value is a string scalar
 *                                    (no arrays, no nested mappings).
 *
 * A2. Release-number consistency: every canonical `SKILL.md` frontmatter
 *     `metadata.version` **and** `plugin/dsh-personal-dev-workflow/package.json`
 *     `version` must equal the root `package.json` version. A mismatch is a
 *     FAIL and exits non-zero, naming the manifest that drifted.
 *
 * B. Every packaged copy (plugin bundle, dist publish packages) must match the
 *    canonical skill byte-for-byte: no missing files, no modified files, no
 *    extra files. Run `node scripts/sync-copies.mjs` to regenerate copies.
 *
 * Exit code 0 = all good, 1 = at least one problem (printed).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'skills');
const rootPackageFile = join(repoRoot, 'package.json');
/** The DSH bundle plugin's manifest — a second place the release number is written. */
const pluginPackageFile = join(repoRoot, 'plugin', 'dsh-personal-dev-workflow', 'package.json');
const pluginPackageScope = 'plugin/dsh-personal-dev-workflow/package.json';

const failures = [];
const checked = [];
const skillVersions = new Map();

/** Spec check ids, the measurable judgement behind each `[spec:*]` failure tag. */
const SPEC_CHECKS = {
  frontmatterFields: 'spec:frontmatter-fields',
  noFlowCollections: 'spec:no-flow-collections',
  nameFormat: 'spec:name-format',
  descriptionLength: 'spec:description-length',
  referenceTarget: 'spec:reference-target',
  metadataValues: 'spec:metadata-values',
};

/** Read a package.json `version`; any problem is recorded against `scope` and returns null. */
function readPackageVersion(file, scope, label) {
  if (!existsSync(file)) {
    fail(scope, `${label} is missing`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(scope, `${label} is not valid JSON: ${error.message}`);
    return null;
  }
  if (typeof parsed.version !== 'string' || parsed.version.trim() === '') {
    fail(scope, `${label} has no non-empty "version"`);
    return null;
  }
  return parsed.version.trim();
}

/** Version declared by the repository root package.json (the release number). */
function readRootVersion() {
  return readPackageVersion(rootPackageFile, 'package.json', 'repository root package.json');
}

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

/** Record a spec violation; the `[<id>]` tag is what names the rule in the output. */
function specFail(id, scope, message) {
  failures.push(`${scope}: [${id}] ${message}`);
}

/**
 * Split a frontmatter line into `name`, raw `value` and indentation depth.
 * A `- ` list item keeps its dash as part of the key, so a top-level sequence
 * reads as an unexpected field exactly as the official validator reports it.
 */
function parseEntry(line) {
  const match = /^([ \t]*)(.*)$/.exec(line);
  const indent = match[1].replace(/\t/g, '  ').length;
  const content = match[2].replace(/\s+$/, '');
  if (content === '') return null;
  const colon = content.indexOf(':');
  if (colon < 0) return { indent, key: content, rawValue: '', topLevel: indent === 0 };
  return {
    indent,
    key: content.slice(0, colon).replace(/\s+$/, ''),
    rawValue: content.slice(colon + 1).trim(),
    topLevel: indent === 0,
  };
}

/** A value is a single-line YAML string scalar (quoted, or a plain scalar on one line). */
function isInlineStringValue(rawValue) {
  if (rawValue === '') return false;
  if (/^"/.test(rawValue)) return /^"(?:[^"\\]|\\.)*"\s*(?:#.*)?$/.test(rawValue);
  if (/^'/.test(rawValue)) return /^'(?:[^']|'')*'\s*(?:#.*)?$/.test(rawValue);
  return /^[^"'[\]{}|>&*!%@`,#]+$/.test(rawValue);
}

/**
 * Strip quoted strings (single/double, with escapes) before scanning for YAML flow
 * collections: a `[` or `{` inside a description is prose, not a flow collection.
 */
function stripQuotedSpans(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Entries of the top-level `metadata:` block (nested keys included, so a nested
 * mapping can be told apart from a string value).
 */
function collectMetadataEntries(frontmatter) {
  const start = frontmatter.findIndex((line) => /^metadata:\s*$/.test(line));
  if (start < 0) return [];
  const entries = [];
  for (let i = start + 1; i < frontmatter.length; i += 1) {
    if (frontmatter[i].trim() === '') continue;
    const entry = parseEntry(frontmatter[i]);
    if (!entry) break;
    if (entry.indent === 0) break;
    entries.push(entry);
  }
  return entries;
}

/** 6. `metadata` values: the spec mandates a string -> string mapping. */
function checkMetadataValues(skill, metadataEntries) {
  for (let i = 0; i < metadataEntries.length; i += 1) {
    const entry = metadataEntries[i];
    const next = metadataEntries[i + 1];
    if (entry.rawValue === '' && next && next.indent > entry.indent) {
      specFail(
        SPEC_CHECKS.metadataValues,
        skill,
        `metadata value "${entry.key}" is a nested mapping; metadata values must be string scalars`,
      );
    } else if (!isInlineStringValue(entry.rawValue)) {
      specFail(
        SPEC_CHECKS.metadataValues,
        skill,
        `metadata value "${entry.key}" is not a string scalar; metadata values must be string scalars`,
      );
    }
  }
}

/**
 * 5. Body references: bare `references/x`, `references.<x>/`, and markdown links.
 *    This extends the historical rule 4 — whose `references/<file>` targets still
 *    fail with the same message body, `body references a missing file: <target>`,
 *    now prefixed by the `[spec:reference-target]` tag — with markdown
 *    `[text](target)` and `references.<x>/` directory targets. The extended check is
 *    identified in the output by that tag.
 */
function checkBodyReferences(skill, body) {
  const targets = new Set();
  for (const match of body.matchAll(/references(?=[./\s`'")\]])[\w.:/-]*/g)) targets.add(match[0]);
  for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    targets.add(target);
  }
  for (const target of targets) {
    const clean = target.replace(/[.,;:]+$/, '');
    if (existsSync(join(skillsDir, skill, clean))) continue;
    if (!clean.endsWith('/') && existsSync(join(skillsDir, skill, clean, '.'))) continue;
    specFail(
      SPEC_CHECKS.referenceTarget,
      skill,
      `body references a missing file: ${clean}`,
    );
  }
}

/** 3. `name` rules from the specification. */
function checkNameFormat(skill, name) {
  if (name.length < 1 || name.length > 64) {
    specFail(SPEC_CHECKS.nameFormat, skill, `"name" must be 1-64 characters (found ${name.length})`);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    specFail(SPEC_CHECKS.nameFormat, skill, `"name" (${name}) may only contain [a-z0-9-]`);
  }
  if (/^-/.test(name) || /-$/.test(name)) {
    specFail(SPEC_CHECKS.nameFormat, skill, `"name" (${name}) must not start or end with "-"`);
  }
  if (/--/.test(name)) {
    specFail(SPEC_CHECKS.nameFormat, skill, `"name" (${name}) must not contain consecutive "-"`);
  }
}

function checkSkill(skill) {
  const skillFile = join(skillsDir, skill, 'SKILL.md');

  if (!existsSync(skillFile)) {
    fail(skill, 'SKILL.md is missing');
    return;
  }

  const lines = readFileSync(skillFile, 'utf8').split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    fail(skill, 'frontmatter must start on line 1 with "---"');
    return;
  }

  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      close = i;
      break;
    }
  }
  if (close < 0) {
    fail(skill, 'frontmatter block is not terminated');
    return;
  }

  const frontmatter = lines.slice(1, close);
  const body = lines.slice(close + 1).join('\n');

  // 2. name
  const nameLine = frontmatter.find((l) => /^name:\s*\S/.test(l));
  if (!nameLine) {
    fail(skill, 'frontmatter is missing a non-empty "name"');
  } else {
    const name = nameLine.replace(/^name:\s*/, '').trim().replace(/^["']|["']$/g, '');
    if (name !== skill) fail(skill, `"name" (${name}) must match the folder name (${skill})`);
    checkNameFormat(skill, name);
  }

  // 3. description
  const descIndex = frontmatter.findIndex((l) => /^description:/.test(l));
  if (descIndex < 0) {
    fail(skill, 'frontmatter is missing "description"');
  } else {
    const rawValue = frontmatter[descIndex].replace(/^description:\s*/, '').trim();
    if (rawValue === '|' || rawValue === '>' || rawValue === '|-' || rawValue === '>-') {
      const hasContent = frontmatter.slice(descIndex + 1).some((l) => l.trim() !== '');
      if (!hasContent) fail(skill, 'block description has no content');
      const blockText = frontmatter
        .slice(descIndex + 1)
        .map((l) => l.replace(/^\s+/, ''))
        .join(' ')
        .trim();
      if (blockText.length > 1024) {
        specFail(
          SPEC_CHECKS.descriptionLength,
          skill,
          `block "description" must be at most 1024 characters (found ${blockText.length})`,
        );
      }
    } else if (rawValue === '') {
      fail(skill, '"description" is empty');
    } else {
      if (!/^["']/.test(rawValue) && rawValue.includes(': ')) {
        fail(skill, 'single-line "description" contains ": " and must be quoted');
      }
      const description = rawValue.replace(/^["']|["']$/g, '');
      if (description.length > 1024) {
        specFail(
          SPEC_CHECKS.descriptionLength,
          skill,
          `"description" must be at most 1024 characters (found ${description.length})`,
        );
      }
    }
  }

  // 4. referenced files
  checkBodyReferences(skill, body);

  // 5. version (metadata.version; compared against the root package.json by the caller)
  const metadataEntries = collectMetadataEntries(frontmatter);
  checkMetadataValues(skill, metadataEntries);

  const metadataIndex = frontmatter.findIndex((l) => /^metadata:\s*$/.test(l));
  const metadataBlock = [];
  if (metadataIndex >= 0) {
    for (let i = metadataIndex + 1; i < frontmatter.length; i += 1) {
      if (!/^\s+\S/.test(frontmatter[i])) break;
      metadataBlock.push(frontmatter[i]);
    }
  }
  const versionLine = metadataBlock.find((l) => /^\s+version:\s*\S/.test(l));
  if (!versionLine) {
    fail(skill, 'frontmatter "metadata" is missing a non-empty "version"');
    return null;
  }
  return versionLine.replace(/^\s*version:\s*/, '').trim().replace(/^["']|["']$/g, '');
}

/** Whitelist the frontmatter's top-level keys exactly as the official validator does. */
function checkFrontmatterFields(skill, frontmatter) {
  const allowed = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
  const present = [...new Set(frontmatter.map(parseEntry).filter(Boolean).filter((e) => e.topLevel).map((e) => e.key))];
  const unexpected = present.filter((key) => !allowed.has(key)).sort();
  if (unexpected.length > 0) {
    specFail(
      SPEC_CHECKS.frontmatterFields,
      skill,
      `unexpected frontmatter field(s): ${unexpected.join(', ')}; only ${[...allowed].join(', ')} are allowed`,
    );
  }
}

/**
 * Reject YAML flow collections anywhere in the frontmatter: the official parser
 * refuses `[a, b]` / `{k: v}` outright (the root cause of audit finding F-1).
 */
function checkNoFlowCollections(skill, frontmatterText) {
  const stripped = stripQuotedSpans(frontmatterText);
  const offending = stripped
    .split(/\r?\n/)
    .filter((line) => /[[\]{}]/.test(line))
    .map((line) => line.trim());
  if (offending.length > 0) {
    specFail(
      SPEC_CHECKS.noFlowCollections,
      skill,
      `frontmatter must not use YAML flow collections ([...] or {...}); offending line(s): ${offending.join(' | ')}`,
    );
  }
}

function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

function checkCopy(label, copyDir, skill) {
  const canonicalDir = join(skillsDir, skill);
  const scope = `${label}:${skill}`;
  for (const rel of listFiles(canonicalDir)) {
    const copyFile = join(copyDir, rel);
    if (!existsSync(copyFile)) {
      fail(scope, `copy is missing ${rel} (run scripts/sync-copies.mjs)`);
      continue;
    }
    if (!readFileSync(join(canonicalDir, rel)).equals(readFileSync(copyFile))) {
      fail(scope, `copy differs from canonical: ${rel} (run scripts/sync-copies.mjs)`);
    }
  }

  for (const rel of listFiles(copyDir)) {
    if (!existsSync(join(canonicalDir, rel))) {
      fail(scope, `copy has an extra file: ${rel}`);
    }
  }
}

// --- A. canonical skills ---
const rootVersion = readRootVersion();

for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const before = failures.length;
  const skill = entry.name;
  const skillFile = join(skillsDir, skill, 'SKILL.md');
  if (existsSync(skillFile)) {
    const raw = readFileSync(skillFile, 'utf8').split(/\r?\n/);
    if (raw[0].trim() === '---') {
      let close = -1;
      for (let i = 1; i < raw.length; i += 1) {
        if (raw[i].trim() === '---') {
          close = i;
          break;
        }
      }
      if (close > 0) {
        const frontmatter = raw.slice(1, close);
        checkFrontmatterFields(skill, frontmatter);
        checkNoFlowCollections(skill, frontmatter.join('\n'));
      }
    }
  }
  const version = checkSkill(skill);
  if (failures.length === before) {
    checked.push(skill);
    skillVersions.set(skill, version);
  }
}

// --- A2. version consistency (skill frontmatter == root package.json) ---
if (rootVersion !== null) {
  for (const [skill, version] of skillVersions) {
    if (version !== rootVersion) {
      fail(
        skill,
        `frontmatter "metadata.version" (${version}) must equal the root package.json version (${rootVersion})`,
      );
    }
  }
}

// --- A3. version consistency (plugin package.json == root package.json) ---
// The DSH bundle plugin carries its own manifest; without this check it could
// keep advertising an old release number while every skill file is correct.
const pluginVersion = readPackageVersion(
  pluginPackageFile,
  pluginPackageScope,
  'plugin package.json',
);
if (rootVersion !== null && pluginVersion !== null && pluginVersion !== rootVersion) {
  fail(
    pluginPackageScope,
    `"version" (${pluginVersion}) must equal the root package.json version (${rootVersion})`,
  );
}

// --- B. packaged copies ---
const copyTargets = [
  {
    label: 'plugin',
    dir: join(repoRoot, 'plugin', 'dsh-personal-dev-workflow', 'skills'),
    skills: ['personal-dev-workflow', 'personal-dev-workflow-zh'],
    nested: true,
  },
  { label: 'dist-en', dir: join(repoRoot, 'dist', 'skillhub-pkg-en'), skills: ['personal-dev-workflow'], nested: false },
  { label: 'dist-zh', dir: join(repoRoot, 'dist', 'skillhub-pkg-zh'), skills: ['personal-dev-workflow-zh'], nested: false },
];

for (const target of copyTargets) {
  for (const skill of target.skills) {
    const copyDir = target.nested ? join(target.dir, skill) : target.dir;
    if (!existsSync(copyDir)) {
      fail(`${target.label}:${skill}`, 'packaged copy directory is missing');
      continue;
    }
    checkCopy(target.label, copyDir, skill);
  }
}

// --- report ---
for (const [skill, version] of skillVersions) {
  const matches = rootVersion !== null && version === rootVersion;
  console.log(
    `${matches ? 'ok  ' : 'warn'} canonical ${skill} (version ${version} vs package.json ${rootVersion ?? '?'})`,
  );
}
for (const problem of failures) console.error(`FAIL ${problem}`);

const failedScopes = new Set(failures.map((f) => f.split(':')[0]));
const total = checked.length + failedScopes.size;
if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) across ${total} scope(s).`);
  process.exit(1);
}
console.log(`\nAll ${checked.length} canonical skill(s) and ${copyTargets.length} packaged copy set(s) valid.`);
if (rootVersion !== null) {
  console.log(`Version consistency: every canonical SKILL.md declares ${rootVersion}, matching the root package.json.`);
  if (pluginVersion !== null && pluginVersion === rootVersion) {
    console.log(`Version consistency: ${pluginPackageScope} declares ${pluginVersion}, matching the root package.json.`);
  }
}
