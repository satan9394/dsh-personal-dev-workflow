#!/usr/bin/env node
/**
 * Regenerate the packaged copies from the canonical skills/ source.
 *
 *   canonical: skills/<name>/...                          (single source of truth)
 *   plugin:    plugin/dsh-personal-dev-workflow/skills/<name>/...
 *   dist:      dist/skillhub-pkg-en|zh/...                (flat: files directly inside)
 *
 * Overwrites files in the copies. Extra files found in a copy that no longer
 * exist in the canonical skill are REPORTED (not deleted) so they can be
 * removed deliberately. Run `node scripts/validate-skills.mjs` afterwards.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'skills');

const targets = [
  {
    dir: join(repoRoot, 'plugin', 'dsh-personal-dev-workflow', 'skills'),
    skills: ['personal-dev-workflow', 'personal-dev-workflow-zh'],
    nested: true,
  },
  { dir: join(repoRoot, 'dist', 'skillhub-pkg-en'), skills: ['personal-dev-workflow'], nested: false },
  { dir: join(repoRoot, 'dist', 'skillhub-pkg-zh'), skills: ['personal-dev-workflow-zh'], nested: false },
];

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

let copied = 0;
const extras = [];

for (const target of targets) {
  for (const skill of target.skills) {
    const canonicalDir = join(skillsDir, skill);
    const copyDir = target.nested ? join(target.dir, skill) : target.dir;

    for (const rel of listFiles(canonicalDir)) {
      const dest = join(copyDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(join(canonicalDir, rel)));
      copied += 1;
    }

    for (const rel of listFiles(copyDir)) {
      if (!existsSync(join(canonicalDir, rel))) extras.push(relative(repoRoot, join(copyDir, rel)).replace(/\\/g, '/'));
    }
  }
}

console.log(`synced ${copied} file(s) into ${targets.length} target(s).`);
if (extras.length > 0) {
  console.log('\nExtra files in copies (no longer in canonical; review and remove deliberately):');
  for (const extra of extras) console.log(`  ${extra}`);
}
