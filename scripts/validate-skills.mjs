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

const failures = [];
const checked = [];

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
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
    } else if (rawValue === '') {
      fail(skill, '"description" is empty');
    } else if (!/^["']/.test(rawValue) && rawValue.includes(': ')) {
      fail(skill, 'single-line "description" contains ": " and must be quoted');
    }
  }

  // 4. referenced files
  const refs = [...body.matchAll(/references\/[\w.-]+/g)].map((m) => m[0]);
  for (const ref of new Set(refs)) {
    if (!existsSync(join(skillsDir, skill, ref))) fail(skill, `body references a missing file: ${ref}`);
  }
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
for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const before = failures.length;
  checkSkill(entry.name);
  if (failures.length === before) checked.push(entry.name);
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
for (const skill of checked) console.log(`ok   canonical ${skill}`);
for (const problem of failures) console.error(`FAIL ${problem}`);

const failedScopes = new Set(failures.map((f) => f.split(':')[0]));
const total = checked.length + failedScopes.size;
if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) across ${total} scope(s).`);
  process.exit(1);
}
console.log(`\nAll ${checked.length} canonical skill(s) and ${copyTargets.length} packaged copy set(s) valid.`);
