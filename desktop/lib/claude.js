// claude CLI 를 -p 로 불러 구독으로 답을 받는다. API 키를 쓰지 않는다.
const { spawn: nodeSpawn } = require('node:child_process');
const path = require('node:path');
const { callName } = require('./greeting');

// 사수는 읽기만 한다. 코드는 팀원이 고친다.
const READ_ONLY_TOOLS = [
  'Read', 'Grep', 'Glob',
  'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git status:*)',
  'Bash(git fetch:*)', 'Bash(git symbolic-ref:*)', 'Bash(git config user.name)',
  'Bash(gh pr view:*)', 'Bash(gh pr diff:*)', 'Bash(gh pr list:*)', 'Bash(gh repo view:*)',
];
// python3 는 설치된 사수 장부(sasu.py)의 정확한 경로만 허용한다.
// PR 내용에 숨은 지시로 다른 파이썬 코드를 돌리지 못하게 (와일드카드 규칙은 인자를 끼워 넣어 뚫을 수 있다).

// ~/.claude/plugins/installed_plugins.json 에서 sasu 플러그인 경로를 찾는다.
function findSasuScript(installed, exists) {
  const entries = installed?.plugins?.['sasu@ai-sasu'];
  if (!Array.isArray(entries)) return null;
  for (const e of entries) {
    const f = e?.installPath && path.join(e.installPath, 'scripts', 'sasu.py');
    if (f && exists(f)) return f;
  }
  return null;
}
const BLOCKED_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch'];

function buildArgs({ prompt, model, agent, resume, sasuScript, name }) {
  const safePrompt = prompt.startsWith('-') ? ' ' + prompt : prompt;
  const ledger = sasuScript ? [`Bash(python3 "${sasuScript}":*)`, `Bash(python3 ${sasuScript}:*)`] : [];
  const args = ['-p', safePrompt, '--output-format', 'json',
    '--allowedTools', ...READ_ONLY_TOOLS, ...ledger,
    '--disallowedTools', ...BLOCKED_TOOLS,
    '--model', model];
  if (agent) args.push('--agent', agent);
  if (resume) args.push('--resume', resume);
  const who = callName(name); // 사수가 답에서 부를 이름 (말투 규칙은 agents/senior-dev.md)
  if (who) args.push('--append-system-prompt', `팀원의 이름은 "${who}"입니다. 부를 때는 "${who}님"이라고 부릅니다.`);
  return args;
}

function runClaude(opts, spawn = nodeSpawn) {
  const { cwd, claudePath = 'claude', env = process.env, timeoutMs = 10 * 60 * 1000 } = opts;
  return new Promise(resolve => {
    let out = '';
    let err = '';
    let p;
    try {
      p = spawn(claudePath, buildArgs(opts), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ text: `claude 를 실행하지 못했습니다: ${e.message}`, sessionId: null, costUsd: 0, isError: true });
    }
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => { err += e.message; });
    p.on('close', code => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        resolve({ text: j.result ?? '', sessionId: j.session_id ?? null, costUsd: j.total_cost_usd ?? 0, isError: Boolean(j.is_error) || code !== 0 });
      } catch {
        resolve({ text: (err || out || `종료 코드 ${code}`).trim().slice(0, 2000), sessionId: null, costUsd: 0, isError: true });
      }
    });
  });
}

module.exports = { buildArgs, runClaude, findSasuScript, READ_ONLY_TOOLS, BLOCKED_TOOLS };
