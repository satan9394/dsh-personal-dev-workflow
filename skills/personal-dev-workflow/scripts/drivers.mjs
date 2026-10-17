import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

export function findExecutable(name) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })
    : spawnSync('which', [name], { encoding: 'utf8' });
  const candidates = (probe.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  for (const candidate of candidates) {
    if (process.platform !== 'win32' || /\.exe$/i.test(candidate)) return candidate;
    if (name === 'opencode') {
      const native = path.join(path.dirname(candidate), 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
      if (fs.existsSync(native)) return native;
    }
  }
  return null;
}

function validateModelSettings(profile) {
  if (profile?.prompt_guidance !== undefined && (typeof profile.prompt_guidance !== 'string' || !profile.prompt_guidance.trim() || !profile.model)) throw new Error('prompt_guidance requires nonempty text and an explicit model');
  if (profile?.reasoning_effort !== undefined && (profile.backend !== 'codex' || !profile.model || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(profile.reasoning_effort))) throw new Error('reasoning_effort requires Codex, an explicit model and a recognized effort; verify model support separately');
}

export function modelPromptContext(profile) {
  validateModelSettings(profile);
  return `Requested execution settings (not proof of provider routing): ${JSON.stringify({ backend: profile.backend, model: profile.model ?? 'host-default; exact model unknown', reasoning_effort: profile.reasoning_effort ?? 'host-default' })}\nModel-specific guidance (subordinate to project rules, task scope and acceptance):\n${profile.prompt_guidance ?? 'No verified model-specific guidance supplied. Use the task contract; do not invent model traits.'}\nPrior plans are proposals: verify assumptions against the repository; adjust implementation within the contract rather than blindly following stale steps. Report a blocker if the goal or acceptance needs to change.\n`;
}

export function invocation(profile, role, files) {
  validateModelSettings(profile);
  if (!profile?.executable || !fs.existsSync(profile.executable)) throw new Error(`Missing executable for ${role}; run doctor and configure this role`);
  const prefix = profile.args ?? [];
  if (prefix.some(arg => /--(?:dangerously|auto(?:$|=)|yolo|approve-for-me)/.test(arg))) throw new Error('PDW does not add approval/sandbox bypass flags');
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

// Offsets of balanced {...} objects, later objects first, ignoring braces inside strings.
function balancedSpans(text) {
  const spans = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue;
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { spans.push([start, i + 1]); break; } }
    }
  }
  return spans.reverse();
}

export function parseResult(stdout, finalFile) {
  const candidates = [];
  if (finalFile && fs.existsSync(finalFile)) candidates.push(fs.readFileSync(finalFile, 'utf8'));
  const fragments = [];
  // Only final/text response fields are candidates, never arbitrary tool arguments.
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event.verdict) candidates.push(event);
      if (event.structured_output) candidates.push(event.structured_output);
      if (event.result) candidates.push(event.result);
      if (event.type === 'text' && typeof event.part?.text === 'string') fragments.push(event.part.text);
    } catch { /* Other log lines stay in the original log. */ }
  }
  // OpenCode emits intermediate assistant text as well as a final response.
  // Try individual completed text parts, plus a joined candidate for split JSON.
  if (fragments.length) candidates.push(...fragments, fragments.join(''));
  candidates.push(stdout.trim());
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
