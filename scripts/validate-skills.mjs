#!/usr/bin/env node
/** Validate the skill-creator layout and the declared source version.
 * The distribution follows SemVer in package.json; pdwSkillVersion names
 * the imported research runtime. Skill frontmatter contains name/description only.
 * This repository ships the Skill only — no plugin bundle and no generated copies.
 * This local check supplements the official Agent Skills validator in CI.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'skills');
const rootPackageFile = join(repoRoot, 'package.json');

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

/**
 * Strip quoted strings (single/double, with escapes) before scanning for YAML flow
 * collections: a `[` or `{` inside a description is prose, not a flow collection.
 */
function stripQuotedSpans(text) {
  return text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^']|'')*'/g, "''");
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
    const clean = decodeURIComponent(target.split('#', 1)[0]).replace(/[.,;:]+$/, '');
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

  // Version belongs in the body, outside the trigger metadata.
  const version = /^版本：([^；\s]+)；/m.exec(body)?.[1];
  if (!version) fail(skill, 'body is missing the declared version');
  return version ?? null;
}

/** Apply the current skill-creator frontmatter convention. */
function checkFrontmatterFields(skill, frontmatter) {
  const allowed = new Set(['name', 'description']);
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

// --- A. canonical skills ---
const rootVersion = readRootVersion();
const sourceVersion = JSON.parse(readFileSync(rootPackageFile, 'utf8')).pdwSkillVersion;
if (typeof sourceVersion !== 'string' || !sourceVersion.trim()) fail('package.json', 'pdwSkillVersion must identify the research runtime');


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

// --- A2. source version consistency (body/runtime == pdwSkillVersion) ---
if (rootVersion !== null) {
  for (const [skill, version] of skillVersions) {
    if (version !== sourceVersion) {
      fail(
        skill,
        `body version (${version}) must equal package.json pdwSkillVersion (${sourceVersion})`,
      );
    }
    for (const [relativePath, pattern, expected, label] of [
      ['references/runtime.md', /^# PDW ([^\s]+)/m, typeof sourceVersion === 'string' ? sourceVersion.replace(/-local$/, '') : null, 'runtime heading'],
      ['scripts/pdw.mjs', /^const version = '([^']+)';/m, sourceVersion, 'runtime executable'],
    ]) {
      const file = join(skillsDir, skill, relativePath);
      const declared = existsSync(file) ? pattern.exec(readFileSync(file, 'utf8'))?.[1] : null;
      if (!declared || declared !== expected) fail(skill, `${label} version (${declared ?? 'missing'}) must match pdwSkillVersion (${sourceVersion})`);
    }
  }
}

// --- report ---
for (const [skill, version] of skillVersions) {
  const matches = version === sourceVersion;
  console.log(
    `${matches ? 'ok  ' : 'warn'} canonical ${skill} (version ${version} vs pdwSkillVersion ${sourceVersion ?? '?'})`,
  );
}
for (const problem of failures) console.error(`FAIL ${problem}`);

const failedScopes = new Set(failures.map((f) => f.split(':')[0]));
const total = checked.length + failedScopes.size;
if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) across ${total} scope(s).`);
  process.exit(1);
}
console.log(`\nAll ${checked.length} canonical skill(s) valid.`);
if (rootVersion !== null) {
  console.log(`Source version: every canonical SKILL.md declares ${sourceVersion}, matching pdwSkillVersion.`);
  console.log(`Distribution version: package.json declares ${rootVersion}.`);
}
