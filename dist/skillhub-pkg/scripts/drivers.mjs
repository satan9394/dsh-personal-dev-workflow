import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export const resultSchema = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'summary', 'findings', 'acceptance'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'severity', 'description', 'evidence'], properties: {
        id: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high', 'blocker'] },
        description: { type: 'string' }, evidence: { type: 'string' },
      } } },
    acceptance: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'status', 'evidence'], properties: {
        id: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'not_run'] }, evidence: { type: 'string' },
      } } },
  },
};

function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

function npmCodexExecutable(candidate) {
  const target = { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' }[process.arch];
  if (!target) return null;
  const root = path.join(path.dirname(candidate), 'node_modules', '@openai', 'codex');
  if (!isFile(path.join(root, 'package.json'))) return null;
  const vendors = [];
  try {
    // Match the official launcher: optional platform package, then legacy vendor layout.
    const require = createRequire(path.join(fs.realpathSync(root), 'bin', 'codex.js'));
    vendors.push(path.join(path.dirname(require.resolve(`@openai/codex-win32-${process.arch}/package.json`)), 'vendor'));
  } catch { /* Legacy packages bundled vendor directly; missing binaries stay unavailable. */ }
  vendors.push(path.join(root, 'vendor'));
  return vendors.map(vendor => path.join(vendor, target, 'bin', 'codex.exe')).find(isFile) ?? null;
}

export function findExecutable(name) {
  // Reading PATH directly avoids where.exe's locale-dependent encoding of Unicode paths.
  const candidates = process.platform === 'win32'
    ? [process.cwd(), ...(process.env.PATH ?? '').split(path.delimiter)].filter(Boolean).flatMap(directory =>
      ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')].map(extension => path.resolve(directory.replace(/^"|"$/g, ''), name + extension))).filter(isFile)
    : (spawnSync('which', [name], { encoding: 'utf8' }).stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (process.platform === 'win32') {
    const native = candidates.find(candidate => /\.exe$/i.test(candidate));
    if (native) return native;
  }
  for (const candidate of candidates) {
    if (process.platform !== 'win32') return candidate;
    if (name === 'codex') {
      const native = npmCodexExecutable(candidate);
      if (native) return native;
    }
    if (name === 'opencode') {
      const native = path.join(path.dirname(candidate), 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
      if (isFile(native)) return native;
    }
  }
  return null;
}

function validateModelSettings(profile) {
  if (profile?.model != null && (typeof profile.model !== 'string' || !profile.model.trim())) throw new Error('model must be a nonempty string when supplied');
  if (profile?.prompt_guidance !== undefined && (typeof profile.prompt_guidance !== 'string' || !profile.prompt_guidance.trim() || !profile.model)) throw new Error('prompt_guidance requires nonempty text and an explicit model');
  if (profile?.reasoning_effort !== undefined && (profile.backend !== 'codex' || !profile.model || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(profile.reasoning_effort))) throw new Error('reasoning_effort requires Codex, an explicit model and a recognized effort; verify model support separately');
}

export function validateProfile(profile) {
  if (!profile || !['codex', 'opencode', 'agy'].includes(profile.backend)) throw new Error(`Unsupported backend: ${profile?.backend}`);
  validateModelSettings(profile);
  if (profile.args !== undefined && (!Array.isArray(profile.args) || Array.from(profile.args).some(arg => typeof arg !== 'string'))) throw new Error('profile.args must be an array of strings');
  for (const arg of profile.args ?? []) {
    if (/^--(?:add-dir|cd|dir|directory|cwd|working-directory|project|new-project|worktree|sandbox|config|profile|enable|disable|ask-for-approval|permissions?|permission-mode|mode|model|reasoning-effort|effort|oss|local-provider|full-auto|auto|yolo|approve-for-me)(?:=|$)/.test(arg)
      || /^--dangerously(?:-|=|$)/.test(arg) || /^-[Ccsapm]/.test(arg) || arg === '--') {
      const option = arg.startsWith('--') ? arg.split('=')[0] : arg.slice(0, 2);
      throw new Error(`profile.args contains a reserved root, policy, config or model override/bypass option: ${option}`);
    }
  }
}

export function modelPromptContext(profile) {
  validateModelSettings(profile);
  return `Requested execution settings (not proof of provider routing): ${JSON.stringify({ backend: profile.backend, model: profile.model ?? 'host-default; exact model unknown', reasoning_effort: profile.reasoning_effort ?? 'host-default' })}\nModel-specific guidance (subordinate to project rules, task scope and acceptance):\n${profile.prompt_guidance ?? 'No verified model-specific guidance supplied. Use the task contract; do not invent model traits.'}\nPrior plans are proposals: verify assumptions against the repository; adjust implementation within the contract rather than blindly following stale steps. Report a blocker if the goal or acceptance needs to change.\n`;
}

export function invocation(profile, role, files) {
  validateProfile(profile);
  if (!profile?.executable || !fs.existsSync(profile.executable)) throw new Error(`Missing executable for ${role}; run doctor and configure this role`);
  const prefix = profile.args ?? [];
  if (profile.backend === 'opencode') return { executable: profile.executable, args: [
    ...prefix, 'run', ...(profile.standalone ? ['--standalone'] : []), '--format', 'json', '--agent', role === 'implement' || role === 'repair' ? 'build' : 'plan',
    ...(profile.model ? ['--model', profile.model] : []), '--file', files.prompt,
    'Read the attached task instructions. Return the required final JSON.',
  ] };
  if (profile.backend === 'codex') return { executable: profile.executable, args: [
    ...prefix, 'exec', '--skip-git-repo-check', '--json', '--color', 'never',
    '--sandbox', role === 'implement' || role === 'repair' ? 'workspace-write' : 'read-only',
    ...(profile.model ? ['--model', profile.model] : []),
    ...(profile.reasoning_effort !== undefined ? ['--config', `model_reasoning_effort=${JSON.stringify(profile.reasoning_effort)}`] : []),
    '--output-schema', files.schema, '--output-last-message', files.final, '-',
  ], stdin: fs.readFileSync(files.prompt, 'utf8') };
  if (profile.backend === 'agy') return { executable: profile.executable, args: [
    ...prefix, '--print', fs.readFileSync(files.prompt, 'utf8'), '--output-format', 'json',
    '--mode', role === 'implement' || role === 'repair' ? 'accept-edits' : 'plan',
    ...(profile.model ? ['--model', profile.model] : []), '--json-schema', files.schema,
  ] };
  throw new Error(`Unsupported backend: ${profile.backend}`);
}

// A role often writes prose around its JSON, wraps it in a fenced block, and
// sometimes emits more than one fenced block (the last one is not always the
// answer). Extract every plausible JSON value; validation below is unchanged, so
// a value still has to look exactly like a role result to be accepted.
function jsonValues(candidate) {
  if (candidate && typeof candidate === 'object') return [candidate];
  if (typeof candidate !== 'string') return [];
  const text = candidate.trim();
  if (!text) return [];
  // A payload that is already JSON is taken at face value. Digging into it would
  // resurrect unrelated nested objects (for example a tool-call argument that
  // happens to look like a role result), which the stream must never accept.
  try { return [JSON.parse(text)]; } catch { /* prose around the JSON */ }
  const bodies = [];
  for (const block of [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].reverse()) bodies.push(block[1]);
  bodies.push(text);
  for (const span of balancedSpans(text)) bodies.push(text.slice(span[0], span[1]));
  const values = [];
  for (const body of bodies) {
    try { values.push(JSON.parse(body.trim())); } catch { /* not JSON on its own */ }
  }
  return values;
}

// Only outermost JSON containers are candidates; nested tool arguments stay data.
function balancedSpans(text) {
  const spans = [];
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start < 0) {
      if (ch === '{' || ch === '[') { start = i; depth = 1; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) { spans.push([start, i + 1]); start = -1; }
    }
  }
  return spans.reverse();
}

export function parseResult(stdout, finalFile) {
  let candidates = [];
  let hasLogRecords = false;
  // Only final/text response fields are candidates, never arbitrary tool arguments.
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object') continue;
      hasLogRecords = true;
      if (!event.type && event.verdict) candidates = [event];
      if (event.type === 'result') {
        candidates = [event.structured_output ?? event.result];
      }
      if (event.type === 'text') {
        candidates = [event.part?.text];
      }
    } catch { /* Other log lines stay in the original log. */ }
  }
  // Text events must contain complete responses; delta streams need a separate
  // protocol adapter, never guesses that join unrelated assistant messages.
  // Structured logs are envelopes: scan only their supported final/text fields.
  // Scanning the raw transcript could promote a tool argument into a verdict.
  if (!hasLogRecords) candidates.push(stdout.trim());
  if (finalFile && fs.existsSync(finalFile)) candidates = [fs.readFileSync(finalFile, 'utf8')];
  for (let candidate of candidates.reverse()) {
    for (const value of jsonValues(candidate)) {
      try {
        if (!value || !['pass', 'fail', 'blocked'].includes(value.verdict) || typeof value.summary !== 'string' || !value.summary.trim()) continue;
        if (!Array.isArray(value.findings) || !Array.isArray(value.acceptance)) continue;
        for (const finding of value.findings) {
          if (!finding.id || !['low', 'medium', 'high', 'blocker'].includes(finding.severity) || !finding.description || !finding.evidence) throw new Error('Malformed finding');
        }
        for (const item of value.acceptance) {
          if (!item.id || !['pass', 'fail', 'not_run'].includes(item.status) || typeof item.evidence !== 'string') throw new Error('Malformed acceptance result');
        }
        return value;
      } catch { /* Missing/invalid structured output must fail closed below. */ }
    }
  }
  throw new Error('No valid final JSON response; inspect stdout.log/stderr.log. A zero CLI exit is not an acceptance pass.');
}
