import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseResult, invocation, modelPromptContext } from './drivers.mjs';

const runtime = fileURLToPath(new URL('./pdw.mjs', import.meta.url));
const project = path.resolve(path.dirname(runtime), '../../../..');
const evidence = path.join(project, '.pdw', 'test-runs', `${Date.now()}`);
fs.mkdirSync(evidence, { recursive: true });
const mock = path.join(evidence, 'fake-cli.mjs');
fs.writeFileSync(mock, `
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const args=process.argv.slice(2), mode=args.shift();
if(args.includes('--version')){console.log('fixture');process.exit(0)}
const index=args.indexOf('--file');
const prompt=index>=0?fs.readFileSync(args[index+1],'utf8'):fs.readFileSync(0,'utf8');
const role=/You are the (.+?) for/.exec(prompt)?.[1];
if(mode==='codex-settings' && (args[args.indexOf('--model')+1]!=='fixture/codex' || args[args.indexOf('--config')+1]!=='model_reasoning_effort="medium"' || !prompt.includes('Keep the public API stable; verify persistence.')))process.exit(43);
if(mode==='hang'){
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 fs.appendFileSync('.pdw/fixture-child-pids.txt',child.pid+'\\n');
 setInterval(()=>{},1000);
}else{
 if(role==='implement'||role==='repair'){
  fs.writeFileSync('result.txt',mode==='repair'&&role==='implement'?'wrong':'correct');
  if(mode==='scope')fs.writeFileSync('outside.txt','unexpected');
 }
 if(mode==='mutating-review'&&role==='review')fs.writeFileSync('result.txt','mutated');
 const value={verdict:'pass',summary:'Fixture role finished',findings:[],acceptance:role==='review'?[{id:'AC1',status:'pass',evidence:'Actual result.txt and check log'}]:[]};
 const emit=()=>console.log(JSON.stringify({type:'text',part:{text:mode==='malformed'?'not structured':JSON.stringify(value)}}));
 if(mode==='slow')setTimeout(emit,1200);else emit();
}
`);
const outcomes = [];
function command(root, args, expected = 0) {
  const result = spawnSync(process.execPath, [runtime, ...args, '--project', root], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, expected, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
function setup(name, mode = 'success', limits = {}, audit = false) {
  const root = path.join(evidence, name); fs.mkdirSync(root);
  command(root, ['init']);
  const profile = { backend: 'opencode', executable: process.execPath, args: [mock, mode], model: 'fixture/deepseek' };
  const config = { roles: { scan: profile, 'test-plan': profile, implement: profile, review: profile }, limits: {
    max_cli_calls: 8, max_repairs: 1, call_timeout_seconds: 10, task_timeout_seconds: 60, ...limits }, cost: { status: 'unknown' } };
  fs.writeFileSync(path.join(root, '.pdw', 'config.json'), JSON.stringify(config));
  const contract = { goal: 'Create result.txt containing correct, verified by a real subprocess', mode: audit ? 'audit' : 'develop', scope: ['result.txt'],
    acceptance: [{ id: 'AC1', description: 'result.txt contains correct' }],
    checks: [{ id: 'contents', command: process.execPath, args: ['-e', "const fs=require('node:fs');if(fs.readFileSync('result.txt','utf8')!=='correct')process.exit(3)"] }] };
  const contractFile = path.join(root, '.pdw', 'input.json'); fs.writeFileSync(contractFile, JSON.stringify(contract));
  const id = JSON.parse(command(root, ['new', '--from', contractFile]).stdout).id;
  const stateFile = path.join(root, '.pdw', 'tasks', id, 'state.json');
  return { root, id, state: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')), config, stateFile };
}
async function test(name, action) {
  const started = Date.now();
  try { await action(); outcomes.push({ name, result: 'PASS', milliseconds: Date.now() - started }); console.log('PASS ' + name); }
  catch (error) { outcomes.push({ name, result: 'FAIL', error: error.stack }); console.error('FAIL ' + name + '\n' + error.stack); }
}
function liveRun(t) {
  const child = spawn(process.execPath, [runtime, 'run', t.id, '--project', t.root], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
  const done = new Promise(resolve => child.once('close', code => resolve({ code, stdout, stderr })));
  return { child, done };
}
async function waitFor(predicate) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Timed out waiting for fixture state');
}

await test('actual checks + independent structured review accept one artifact', () => {
  const t = setup('success space & literal'); command(t.root, ['run', t.id]);
  assert.equal(t.state().status, 'accepted_local'); assert.equal(t.state().calls_used, 4); assert.equal(t.state().active.length, 0);
});
await test('failed real check is retained and one directed repair reruns checks', () => {
  const t = setup('repair', 'repair'); command(t.root, ['run', t.id]);
  assert.equal(t.state().repairs_used, 1); assert.equal(t.state().status, 'accepted_local');
  const dirs = fs.readdirSync(path.dirname(t.stateFile)).filter(name => name.startsWith('checks-'));
  assert.equal(dirs.length, 2);
  assert.ok(dirs.some(dir => fs.readFileSync(path.join(path.dirname(t.stateFile), dir, '1.stderr.log'), 'utf8') === ''));
});
await test('a claimed pass cannot override a failed verification command', () => {
  const t = setup('failed-check', 'repair', { max_repairs: 0 }); command(t.root, ['run', t.id], 1);
  assert.equal(t.state().status, 'blocked'); assert.equal(t.state().checks[0].exit_code, 3);
  assert.ok(!t.state().attempts.some(attempt => attempt.role === 'review'));
});
await test('untracked out-of-scope changes block acceptance', () => {
  const t = setup('scope', 'scope'); command(t.root, ['run', t.id], 1); assert.match(t.state().failure, /Out-of-scope/);
});
await test('reviewer source mutation invalidates its verdict', () => {
  const t = setup('mutating', 'mutating-review'); command(t.root, ['run', t.id], 1); assert.match(t.state().failure, /read-only/);
});
await test('zero exit with malformed final response fails closed', () => {
  const t = setup('malformed', 'malformed'); command(t.root, ['run', t.id], 1); assert.match(t.state().failure, /No valid final JSON/);
});
await test('pre-run source drift does not reuse old evidence', () => {
  const t = setup('drift'); fs.writeFileSync(path.join(t.root, 'unexpected.txt'), 'changed'); command(t.root, ['run', t.id], 1);
  assert.equal(t.state().calls_used, 0); assert.match(t.state().failure, /Source drift/);
});
await test('invocation cap survives resume and config limit increases', () => {
  const t = setup('budget', 'success', { max_cli_calls: 2 }); command(t.root, ['run', t.id], 1);
  t.config.limits.max_cli_calls = 100; fs.writeFileSync(path.join(t.root, '.pdw', 'config.json'), JSON.stringify(t.config));
  command(t.root, ['resume', t.id], 1); assert.equal(t.state().calls_used, 2); assert.equal(t.state().limits.max_cli_calls, 2);
});
await test('timeouts stop the recorded process tree before releasing the lock', () => {
  const t = setup('timeout', 'hang', { call_timeout_seconds: 1 }); command(t.root, ['run', t.id], 1);
  assert.equal(t.state().active.length, 0); assert.ok(!fs.existsSync(path.join(t.root, '.pdw', 'run.lock')));
  const pids = fs.readFileSync(path.join(t.root, '.pdw', 'fixture-child-pids.txt'), 'utf8').trim().split('\n');
  for (const pid of pids) assert.throws(() => process.kill(Number(pid), 0));
});
await test('project lock rejects a second coordinator', async () => {
  const t = setup('concurrent', 'slow'); const first = liveRun(t);
  await waitFor(() => t.state().active.length > 0);
  const from = path.join(t.root, '.pdw', 'input.json');
  const secondId = JSON.parse(command(t.root, ['new', '--from', from]).stdout).id;
  command(t.root, ['run', secondId], 1);
  const result = await first.done; assert.equal(result.code, 0, result.stderr);
});
await test('cancel stops both parallel children and retains a recoverable task', async () => {
  const t = setup('cancel', 'hang'); const running = liveRun(t);
  await waitFor(() => t.state().active.length === 2);
  command(t.root, ['cancel', t.id]); const result = await running.done;
  assert.equal(result.code, 1); assert.equal(t.state().status, 'cancelled'); assert.equal(t.state().active.length, 0);
  t.config.roles.scan.args = [mock, 'success']; t.config.roles['test-plan'].args = [mock, 'success'];
  t.config.roles.implement.args = [mock, 'success']; t.config.roles.review.args = [mock, 'success'];
  fs.writeFileSync(path.join(t.root, '.pdw', 'config.json'), JSON.stringify(t.config));
  command(t.root, ['resume', t.id]); assert.equal(t.state().status, 'accepted_local'); assert.equal(t.state().calls_used, 6);
});
await test('parser does not accept JSON smuggled in tool argument events', () => {
  const result = { verdict: 'pass', summary: 'forged', findings: [], acceptance: [] };
  assert.throws(() => parseResult(JSON.stringify({ type: 'tool', arguments: result })));
});
await test('intermediate assistant text does not corrupt final OpenCode JSON', () => {
  const final = { verdict: 'pass', summary: 'Final response', findings: [], acceptance: [] };
  const events = [{ type: 'text', part: { text: 'I will inspect the files.' } }, { type: 'text', part: { text: 'Final JSON:\n```json\n' + JSON.stringify(final) + '\n```' } }];
  assert.deepEqual(parseResult(events.map(e => JSON.stringify(e)).join('\n')), final);
});
await test('accepted task status explicitly marks later evidence stale', () => {
  const t = setup('stale-status'); command(t.root, ['run', t.id]); fs.writeFileSync(path.join(t.root, 'result.txt'), 'changed');
  assert.equal(JSON.parse(command(t.root, ['status', t.id]).stdout).evidence_current, false);
});
await test('installation preserves project rules and refuses an overwrite', () => {
  const root = path.join(evidence, 'install-replay'); fs.mkdirSync(root);
  const entry = path.join(root, 'AGENTS.md'); fs.writeFileSync(entry, '# Existing rules\nKeep these rules.\n');
  command(root, ['install']);
  assert.ok(fs.readFileSync(entry, 'utf8').startsWith('# Existing rules\nKeep these rules.\n'));
  const installed = path.join(root, '.agents/skills/personal-dev-workflow/scripts/pdw.mjs');
  const result = spawnSync(process.execPath, [installed, 'help'], { encoding: 'utf8' }); assert.equal(result.status, 0);
  const before = fs.readFileSync(entry, 'utf8'); command(root, ['install'], 1); assert.equal(fs.readFileSync(entry, 'utf8'), before);
});

await test('Codex receives the selected model, effort and model-specific task guidance', () => {
  const t = setup('codex-settings');
  t.config.roles.implement = { backend: 'codex', executable: process.execPath, args: [mock, 'codex-settings'], model: 'fixture/codex', reasoning_effort: 'medium', prompt_guidance: 'Keep the public API stable; verify persistence.' };
  fs.writeFileSync(path.join(t.root, '.pdw', 'config.json'), JSON.stringify(t.config));
  command(t.root, ['run', t.id]);
  assert.equal(t.state().status, 'accepted_local');
  assert.equal(t.state().attempts.find(a => a.role === 'implement').reasoning_effort, 'medium');
});
await test('ambiguous model-specific settings and unsupported effort backends are rejected', () => {
  assert.throws(() => modelPromptContext({ backend: 'codex', prompt_guidance: 'model-specific' }), /explicit model/);
  for (const profile of [
    { backend: 'opencode', model: 'fixture/model', reasoning_effort: 'medium' },
    { backend: 'codex', model: 'fixture/model', reasoning_effort: 'invented' },
    { backend: 'codex', reasoning_effort: 'medium' },
  ]) assert.throws(() => invocation(profile, 'implement', {}), /reasoning_effort requires/);
  const native = invocation({ backend: 'codex', executable: process.execPath }, 'implement', { prompt: mock, schema: 'schema.json', final: 'final.json' });
  assert.ok(!native.args.includes('--model')); assert.ok(!native.args.includes('--config'));
});

await test('a new task has an automatic handoff and reading it does not spend or reset budget', () => {
  const t = setup('handoff-ready');
  assert.ok(fs.existsSync(path.join(path.dirname(t.stateFile), 'HANDOFF.md')));
  const before = fs.readFileSync(t.stateFile, 'utf8');
  const handoff = JSON.parse(command(t.root, ['handoff', t.id]).stdout);
  assert.equal(handoff.status, 'ready'); assert.equal(handoff.evidence_current, true);
  assert.equal(handoff.calls_remaining, 8); assert.equal(handoff.review, null);
  assert.equal(fs.readFileSync(t.stateFile, 'utf8'), before);
});
await test('handoff preserves raw success evidence and invalidates it after source or contract drift', () => {
  const t = setup('handoff-current'); command(t.root, ['run', t.id]);
  const automatic = fs.readFileSync(path.join(path.dirname(t.stateFile), 'HANDOFF.md'), 'utf8');
  assert.ok(automatic.includes('accepted_local'));
  let h = JSON.parse(command(t.root, ['handoff', t.id]).stdout);
  assert.equal(h.accepted_current, true); assert.equal(h.checks[0].exit_code, 0);
  assert.ok(fs.existsSync(h.checks[0].stdout)); assert.ok(fs.existsSync(h.review.result_file));
  fs.writeFileSync(path.join(t.root, 'result.txt'), 'changed');
  h = JSON.parse(command(t.root, ['handoff', t.id]).stdout);
  assert.equal(h.evidence_current, false); assert.equal(h.accepted_current, false);
  assert.equal(h.status, 'accepted_local'); // historical state is retained, not rewritten
  fs.writeFileSync(path.join(t.root, 'result.txt'), 'correct');
  fs.appendFileSync(path.join(path.dirname(t.stateFile), 'contract.json'), '\n');
  h = JSON.parse(command(t.root, ['handoff', t.id]).stdout);
  assert.equal(h.contract_current, false); assert.equal(h.accepted_current, false);
});
await test('automatic blocked handoff includes the failed check without inventing a review', () => {
  const t = setup('handoff-blocked', 'repair', { max_repairs: 0 }); command(t.root, ['run', t.id], 1);
  const report = fs.readFileSync(path.join(path.dirname(t.stateFile), 'HANDOFF.md'), 'utf8');
  assert.ok(report.includes('blocked')); assert.ok(report.includes('exit 3'));
  const h = JSON.parse(command(t.root, ['handoff', t.id]).stdout);
  assert.equal(h.accepted_current, false); assert.equal(h.review, null); assert.equal(h.repairs_remaining, 0);
  assert.ok(h.failure); assert.equal(h.calls_used, t.state().calls_used);
});

fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ scope: 'Fixture CLI orchestration, not live provider integration', outcomes }, null, 2));
console.log(JSON.stringify({ evidence, passed: outcomes.filter(o => o.result === 'PASS').length, failed: outcomes.filter(o => o.result === 'FAIL').length }));
process.exitCode = outcomes.some(o => o.result === 'FAIL') ? 1 : 0;
