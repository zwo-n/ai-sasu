// 화면과 상관없는 로직 테스트. AI 는 부르지 않는다 (가짜 spawn 사용).
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { summarize, bubbleCard } = require('../lib/summary');
const { diffPRs, baselineNote, prLabel, readyCount, seenAfterPick } = require('../lib/prwatch');
const { Usage } = require('../lib/usage');
const { buildArgs, runClaude, READ_ONLY_TOOLS, findSasuScript } = require('../lib/claude');
const { renderMarkdown } = require('../lib/markdown');
const { withDefaults } = require('../lib/config');

// ---------- 리뷰 요약 ----------
const REVIEW = `## 잘한 점
- 파라미터 바인딩을 썼어요
- 함수 이름이 하는 일을 잘 말해요

## 아쉬운 점
### 1. [권장] 환불 테스트가 없어요 — \`tests/\`
### 2. [참고] 연결을 닫지 않아요 — \`shop/refund.py:5\`

## 꼭 고칠 점
### 1. [반드시] 환불이 실패해도 "환불됨"으로 처리돼요 — \`shop/refund.py:11-14\`
- 문제: ...
### 2. [반드시] SQL을 문자열로 이어 붙였어요 — \`shop/refund.py:7\`

## 판정
**막힘** — 환불 실패를 숨겨요.
`;

test('요약: 판정, 등급별 개수, 잘한 점 개수', () => {
  const s = summarize(REVIEW);
  assert.equal(s.verdict, '막힘');
  assert.deepEqual(s.counts, { 반드시: 2, 권장: 1, 참고: 1 });
  assert.equal(s.good, 2);
  assert.equal(s.mood, 'warn');
});

test('요약: 먼저 볼 것은 순서와 상관없이 가장 심각한 지적', () => {
  const s = summarize(REVIEW);
  assert.match(s.top, /환불이 실패해도/);
  assert.equal(s.topLevel, '반드시');
  const t = summarize('### 1. [참고] 이름\n### 2. [권장] 테스트 없음 — `t/`\n## 판정\n고친 뒤 머지');
  assert.equal(t.top, '테스트 없음');
  assert.equal(t.topLevel, '권장');
});

test('요약: 지적 없음 + 머지 가능이면 happy', () => {
  const s = summarize('## 판정\n머지 가능 — 깔끔해요\n');
  assert.equal(s.verdict, '머지 가능');
  assert.deepEqual(s.counts, { 반드시: 0, 권장: 0, 참고: 0 });
  assert.equal(s.good, 0);
  assert.equal(s.top, null);
  assert.equal(s.mood, 'happy');
});

test('요약: 고친 뒤 머지는 warn 아님(idle)', () => {
  assert.equal(summarize('### 1. [권장] 테스트 없음\n## 판정\n고친 뒤 머지\n').mood, 'idle');
});

test('요약: 판정을 못 찾으면 알 수 없음', () => {
  const s = summarize('그냥 아무 말');
  assert.equal(s.verdict, '알 수 없음');
  assert.equal(s.mood, 'idle');
});

test('요약: 한 줄 문구는 판정 · 꼭 고칠 점 · 아쉬운 점 (메뉴·알림용)', () => {
  assert.equal(summarize(REVIEW).line, '막힘 · 꼭 고칠 점 2 · 아쉬운 점 2');
  assert.equal(summarize('### 1. [참고] x\n## 판정\n머지 가능').line, '머지 가능 · 아쉬운 점 1');
});

test('요약: 예전 형식(## 고칠 점)도 읽는다', () => {
  const s = summarize('## 고칠 점\n### 1. [반드시] 버그 — `a.js:1`\n## 판정\n막힘');
  assert.deepEqual(s.counts, { 반드시: 1, 권장: 0, 참고: 0 });
});

// ---------- PR 감지 ----------
const pr = (number, sha, extra = {}) => ({ number, headRefOid: sha, title: `PR ${number}`, url: `u/${number}`, isDraft: false, ...extra });

test('PR: 첫 확인은 기준만 잡고 리뷰하지 않음', () => {
  const r = diffPRs(null, [pr(1, 'a'), pr(2, 'b')]);
  assert.deepEqual(r.toReview, []);
  assert.deepEqual(r.seen, { 1: 'a', 2: 'b' });
});

test('PR: 새 PR과 새 푸시만 리뷰', () => {
  const r = diffPRs({ 1: 'a', 2: 'b' }, [pr(1, 'a'), pr(2, 'c'), pr(3, 'd')]);
  assert.deepEqual(r.toReview.map(x => [x.pr.number, x.reason]), [[2, 'updated'], [3, 'new']]);
  assert.deepEqual(r.seen, { 1: 'a', 2: 'c', 3: 'd' });
});

test('PR: 드래프트는 기본으로 건너뛰고, 준비되면 리뷰', () => {
  let r = diffPRs({}, [pr(4, 'x', { isDraft: true })]);
  assert.deepEqual(r.toReview, []);
  assert.deepEqual(r.seen, {});
  r = diffPRs(r.seen, [pr(4, 'x', { isDraft: false })]);
  assert.deepEqual(r.toReview.map(x => x.pr.number), [4]);
});

test('PR: reviewDrafts 켜면 드래프트도 리뷰', () => {
  const r = diffPRs({}, [pr(4, 'x', { isDraft: true })], { reviewDrafts: true });
  assert.equal(r.toReview.length, 1);
});

test('PR: 닫힌 PR은 기록에서 빠짐', () => {
  const r = diffPRs({ 1: 'a', 2: 'b' }, [pr(2, 'b')]);
  assert.deepEqual(r.seen, { 2: 'b' });
});

// ---------- 하루 한도 ----------
test('한도: 날짜별로 세고 넘으면 거절', () => {
  const store = {};
  const u = new Usage(store, 2);
  assert.equal(u.take('2026-11-24'), true);
  assert.equal(u.take('2026-11-24'), true);
  assert.equal(u.take('2026-11-24'), false);
  assert.equal(u.left('2026-11-24'), 0);
  assert.equal(u.take('2026-11-25'), true);
  assert.deepEqual(Object.keys(store.days), ['2026-11-25']); // 지난 날은 지움
});

// ---------- claude 명령 ----------
test('claude 인자: 읽기 전용 도구만 허용, 고치기 도구는 금지', () => {
  const a = buildArgs({ prompt: '/sasu:review 12', model: 'sonnet' });
  assert.equal(a[0], '-p');
  assert.equal(a[1], '/sasu:review 12');
  assert.ok(a.includes('--output-format') && a.includes('json'));
  const allowed = a.slice(a.indexOf('--allowedTools') + 1, a.indexOf('--disallowedTools'));
  assert.deepEqual(allowed, READ_ONLY_TOOLS);
  assert.ok(!allowed.some(t => /^(Edit|Write)/.test(t)));
  const disallowed = a.slice(a.indexOf('--disallowedTools') + 1, a.indexOf('--model'));
  for (const t of ['Edit', 'Write', 'NotebookEdit']) assert.ok(disallowed.includes(t));
  assert.ok(!a.includes('--resume'));
  assert.ok(!a.some(t => t.startsWith('Bash(python3')), '넓은 python3 허용 금지');
});

test('claude 인자: 사수 장부는 설치된 정확한 경로만 허용', () => {
  const a = buildArgs({ prompt: 'x', model: 'sonnet', sasuScript: '/p/sasu/0.1.0/scripts/sasu.py' });
  const py = a.filter(t => t.startsWith('Bash(python3'));
  assert.deepEqual(py, ['Bash(python3 "/p/sasu/0.1.0/scripts/sasu.py":*)', 'Bash(python3 /p/sasu/0.1.0/scripts/sasu.py:*)']);
});

test('사수 장부 경로: 설치 기록에서 찾고, 파일이 없으면 null', () => {
  const installed = { plugins: { 'sasu@ai-sasu': [{ installPath: '/c/sasu/0.1.0' }], 'x@y': [{ installPath: '/c/x' }] } };
  assert.equal(findSasuScript(installed, () => true), '/c/sasu/0.1.0/scripts/sasu.py');
  assert.equal(findSasuScript(installed, () => false), null);
  assert.equal(findSasuScript({}, () => true), null);
  assert.equal(findSasuScript(null, () => true), null);
});

test('claude 인자: 대화는 사수 에이전트로, 이어서', () => {
  const a = buildArgs({ prompt: '안녕', model: 'sonnet', agent: 'sasu:senior-dev', resume: 'abc' });
  assert.equal(a[a.indexOf('--agent') + 1], 'sasu:senior-dev');
  assert.equal(a[a.indexOf('--resume') + 1], 'abc');
});

test('claude 인자: 프롬프트가 -로 시작해도 옵션으로 안 읽힘', () => {
  const a = buildArgs({ prompt: '--help 이거 뭐예요', model: 'sonnet' });
  assert.equal(a[1], ' --help 이거 뭐예요');
});

function fakeSpawn(stdout, code = 0, stderr = '') {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.kill = () => {};
    setImmediate(() => {
      p.stdout.emit('data', Buffer.from(stdout));
      if (stderr) p.stderr.emit('data', Buffer.from(stderr));
      p.emit('close', code);
    });
    return p;
  };
  return { spawn, calls };
}

test('claude 실행: 결과·세션·비용을 읽음', async () => {
  const f = fakeSpawn(JSON.stringify({ type: 'result', is_error: false, result: '안녕하세요', session_id: 's1', total_cost_usd: 0.012 }));
  const r = await runClaude({ prompt: 'hi', model: 'haiku', cwd: '/repo', claudePath: '/bin/claude', env: { PATH: '/x' } }, f.spawn);
  assert.deepEqual(r, { text: '안녕하세요', sessionId: 's1', costUsd: 0.012, isError: false });
  assert.equal(f.calls[0].cmd, '/bin/claude');
  assert.equal(f.calls[0].opts.cwd, '/repo');
});

test('claude 실행: 실패하면 오류로 돌려줌 (앱이 죽지 않음)', async () => {
  const f = fakeSpawn('not json', 1, 'boom');
  const r = await runClaude({ prompt: 'hi', model: 'haiku', cwd: '/r' }, f.spawn);
  assert.equal(r.isError, true);
  assert.match(r.text, /boom|not json/);
});

// ---------- 마크다운 ----------
test('마크다운: HTML은 이스케이프', () => {
  const h = renderMarkdown('<img src=x onerror=alert(1)> **굵게** `<b>`');
  assert.ok(!h.includes('<img'));
  assert.ok(h.includes('&lt;img'));
  assert.ok(h.includes('<strong>굵게</strong>'));
  assert.ok(h.includes('<code>&lt;b&gt;</code>'));
});

test('마크다운: 제목·목록·코드 블록', () => {
  const h = renderMarkdown('## 판정\n- 하나\n- 둘\n```\n<x>\n```\n');
  assert.match(h, /<h2>판정<\/h2>/);
  assert.match(h, /<ul><li>하나<\/li><li>둘<\/li><\/ul>/);
  assert.match(h, /<pre><code>&lt;x&gt;\n<\/code><\/pre>/);
});

test('마크다운: 링크는 만들지 않음 (javascript: 차단)', () => {
  const h = renderMarkdown('[누르기](javascript:alert(1))');
  assert.ok(!h.includes('<a'));
});

// ---------- 설정 ----------
test('설정: 빠진 값은 기본값, 잘못된 값은 바로잡음', () => {
  const c = withDefaults({ repos: ['/a'], dailyLimit: -3, pollSeconds: 5 });
  assert.deepEqual(c.repos, ['/a']);
  assert.equal(c.dailyLimit, 30);
  assert.equal(c.pollSeconds, 60);
  assert.equal(c.reviewModel, 'sonnet');
  assert.equal(c.reviewDrafts, false);
});

// ---------- 저장소 추가 알림 · PR 고르기 ----------
test('처음 볼 때 열린 PR 이 없으면 새 PR 부터 본다고 알린다', () => {
  assert.equal(baselineNote('kpop-news', {}), 'kpop-news 지켜볼게요. 새 PR을 올리면 리뷰할게요.');
});

test('처음 볼 때 건너뛴 PR 을 최근 번호부터 알리고 고르는 곳을 알려 준다', () => {
  const t = baselineNote('kpop-news', { 487: 'a', 651: 'b' });
  assert.match(t, /이미 열려 있던 PR 2개\(#651, #487\)는 건너뛰었어요/);
  assert.match(t, /지켜보는 저장소/);
});

test('건너뛴 PR 이 많으면 세 개만 적고 나머지는 개수로', () => {
  const t = baselineNote('r', { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' });
  assert.match(t, /PR 5개\(#5, #4, #3 외 2개\)/);
});

test('메뉴의 PR 이름은 번호와 제목, 길면 자르고 드래프트는 표시', () => {
  assert.equal(prLabel({ number: 651, title: 'fix: 짧은 제목', isDraft: false }), '#651 fix: 짧은 제목');
  const long = prLabel({ number: 1, title: 'x'.repeat(80), isDraft: false });
  assert.ok(long.length <= 50 && long.endsWith('…'));
  assert.equal(prLabel({ number: 2, title: 't', isDraft: true }), '#2 t (드래프트)');
});

test('모두 리뷰할 개수는 드래프트를 뺀다 (드래프트 리뷰를 켜면 센다)', () => {
  const prs = [pr(1, 'a'), pr(2, 'b', { isDraft: true })];
  assert.equal(readyCount(prs), 1);
  assert.equal(readyCount(prs, { reviewDrafts: true }), 2);
});

test('PR 하나를 골라 리뷰하면 그 PR 은 최신 커밋으로 본 것이 되고 나머지 기록은 그대로', () => {
  const next = seenAfterPick({ 1: 'a', 2: 'old' }, [pr(1, 'a'), pr(2, 'new')], pr(2, 'new'));
  assert.deepEqual(next, { 1: 'a', 2: 'new' });
});

test('기준이 없는 저장소에서 골라도 열린 PR 전체로 기준을 잡는다 (나머지를 새 PR 로 리뷰하지 않게)', () => {
  const prs = [pr(1, 'a'), pr(2, 'b'), pr(3, 'c', { isDraft: true })];
  const next = seenAfterPick(undefined, prs, prs[1]);
  assert.deepEqual(next, { 1: 'a', 2: 'b' });
  assert.deepEqual(diffPRs(next, prs).toReview, []);
});

// ---------- 리뷰 말풍선 카드 ----------
test('리뷰 말풍선 카드: 어디·제목·판정 색·세 칸 개수·먼저 볼 것', () => {
  const card = bubbleCard({ repo: 'ai-sasu', number: 3, title: 'feat: 메뉴' }, summarize(REVIEW));
  assert.equal(card.where, 'ai-sasu · PR #3');
  assert.equal(card.title, 'feat: 메뉴');
  assert.equal(card.verdict, '막힘');
  assert.equal(card.tone, 'block');
  assert.deepEqual(card.stats, [
    { label: '잘한 점', n: 2, kind: 'good' },
    { label: '아쉬운 점', n: 2, kind: 'soft' },
    { label: '꼭 고칠 점', n: 2, kind: 'must' },
  ]);
  assert.equal(card.topLabel, '꼭 고칠 점부터');
  assert.ok(card.top && !card.top.includes('`'));
});

test('판정마다 색이 다르고, 먼저 볼 것 제목은 등급을 따른다', () => {
  const ok = bubbleCard({ repo: 'r', number: 1, title: 't' }, summarize('## 판정\n머지 가능 — 좋아요'));
  assert.equal(ok.tone, 'ok');
  assert.equal(ok.top, null);
  const fix = bubbleCard({ repo: 'r', number: 1, title: 't' }, summarize('### 1. [권장] 테스트 없음\n## 판정\n고친 뒤 머지'));
  assert.equal(fix.tone, 'fix');
  assert.equal(fix.topLabel, '아쉬운 점');
  assert.equal(bubbleCard({ repo: 'r', number: 1, title: 't' }, summarize('엉망')).tone, 'unknown');
});
