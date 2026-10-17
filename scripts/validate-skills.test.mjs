import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.join(repo, '.pdw', 'test-runs', `packaging-${Date.now()}-${process.pid}`);
fs.mkdirSync(evidence, { recursive: true });
console.log(`Preserved packaging fixtures: ${evidence}`);

function fixture(name, mutate = () => {}) {
  const root = path.join(evidence, name);
  const skill = path.join(root, 'skills/personal-dev-workflow');
  const copies = [path.join(root, 'plugin/dsh-personal-dev-workflow/skills/personal-dev-workflow'), path.join(root, 'dist/skillhub-pkg')];
  const write = (relative, body) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
  write('scripts/validate-skills.mjs', fs.readFileSync(path.join(repo, 'scripts/validate-skills.mjs')));
  write('package.json', JSON.stringify({ version: '2.0.1', pdwSkillVersion: '1.3.2-local' }));
  write('plugin/dsh-personal-dev-workflow/package.json', JSON.stringify({ version: '2.0.1' }));
  write('skills/personal-dev-workflow/SKILL.md', '---\nname: personal-dev-workflow\ndescription: "Run project workflows"\n---\n版本：1.3.2-local；\n[Runtime](references/runtime.md#commands)\n');
  write('skills/personal-dev-workflow/references/runtime.md', '# PDW 1.3.2 本地运行工具\n');
  write('skills/personal-dev-workflow/scripts/pdw.mjs', "const version = '1.3.2-local';\n");
  for (const copy of copies) fs.cpSync(skill, copy, { recursive: true });
  mutate({ write, root });
  const result = spawnSync(process.execPath, ['scripts/validate-skills.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ status: result.status, stdout: result.stdout, stderr: result.stderr }, null, 2));
  return result;
}

test('valid creator layout with fragment references and separate distribution version passes', () => {
  const result = fixture('valid');
  assert.equal(result.status, 0, result.stderr);
});
test('frontmatter metadata version is rejected under current creator convention', () => {
  const result = fixture('metadata', ({ write, root }) => {
    const body = fs.readFileSync(path.join(root, 'skills/personal-dev-workflow/SKILL.md'), 'utf8').replace('description:', 'metadata:\n  version: "2.0.1"\ndescription:');
    write('skills/personal-dev-workflow/SKILL.md', body);
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spec:frontmatter-fields/);
});
test('research version drift is rejected', () => {
  const result = fixture('source-drift', ({ write }) => write('package.json', JSON.stringify({ version: '2.0.1', pdwSkillVersion: '1.3.1-local' })));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /body version.*pdwSkillVersion/);
});
test('plugin distribution version drift is rejected', () => {
  const result = fixture('plugin-drift', ({ write }) => write('plugin/dsh-personal-dev-workflow/package.json', JSON.stringify({ version: '2.0.0' })));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must equal the root package.json version/);
});
test('runtime heading version drift is rejected', () => {
  const result = fixture('runtime-heading-drift', ({ write }) => write('skills/personal-dev-workflow/references/runtime.md', '# PDW 1.3.1 本地运行工具\n'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime heading version/);
});
test('executable runtime version drift is rejected', () => {
  const result = fixture('runtime-code-drift', ({ write }) => write('skills/personal-dev-workflow/scripts/pdw.mjs', "const version = '1.3.1-local';\n"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime executable version/);
});
test('modified generated copy is rejected', () => {
  const result = fixture('stale-copy', ({ write }) => write('dist/skillhub-pkg/references/runtime.md', '# Stale\n'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /copy differs from canonical/);
});
test('missing local reference is rejected', () => {
  const result = fixture('missing-reference', ({ write }) => write('skills/personal-dev-workflow/SKILL.md', '---\nname: personal-dev-workflow\ndescription: "Run workflows"\n---\n版本：1.3.2-local；\n[Missing](references/missing.md#commands)\n'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spec:reference-target/);
});
