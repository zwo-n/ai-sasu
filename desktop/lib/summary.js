// 사수 리뷰(마크다운)에서 말풍선용 요약을 뽑는다. AI 를 다시 부르지 않는다.
// 리뷰 칸: 잘한 점 / 아쉬운 점([권장]·[참고]) / 꼭 고칠 점([반드시]) / 판정
const VERDICTS = ['고친 뒤 머지', '머지 가능', '막힘'];
const LEVELS = ['반드시', '권장', '참고']; // 심각한 순서

function section(md, name) {
  const m = md.match(new RegExp(`^##\\s*${name}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

function summarize(md) {
  const counts = { 반드시: 0, 권장: 0, 참고: 0 };
  const firstOf = {};
  for (const m of md.matchAll(/^###\s*\d+\.\s*\[(반드시|권장|참고)\]\s*(.+)$/gm)) {
    counts[m[1]] += 1;
    if (!firstOf[m[1]]) firstOf[m[1]] = m[2].replace(/\s+—\s+`[^`]*`\s*$/, '').trim();
  }
  const topLevel = LEVELS.find(l => firstOf[l]) || null; // 칸 순서와 상관없이 가장 심각한 것
  const top = topLevel ? firstOf[topLevel] : null;
  const good = (section(md, '잘한 점').match(/^\s*-\s+\S/gm) || []).length;

  let verdict = '알 수 없음';
  const sec = md.split(/^##\s*판정\s*$/m)[1];
  if (sec !== undefined) {
    const firstLine = sec.split('\n').find(l => l.trim()) || '';
    verdict = VERDICTS.find(v => firstLine.includes(v)) || verdict;
  }
  const mood = verdict === '막힘' ? 'warn' : verdict === '머지 가능' ? 'happy' : 'idle';
  const must = counts.반드시;
  const soft = counts.권장 + counts.참고;
  const line = [verdict, must && `꼭 고칠 점 ${must}`, soft && `아쉬운 점 ${soft}`].filter(Boolean).join(' · ');
  return { verdict, counts, good, top, topLevel, mood, line };
}

// 리뷰 말풍선 카드에 들어갈 것. 화면은 textContent 로만 넣는다.
const TONE = { 막힘: 'block', '고친 뒤 머지': 'fix', '머지 가능': 'ok' };

function bubbleCard({ repo, number, title }, s) {
  return {
    where: `${repo} · PR #${number}`,
    title,
    verdict: s.verdict,
    tone: TONE[s.verdict] || 'unknown',
    stats: [
      { label: '잘한 점', n: s.good, kind: 'good' },
      { label: '아쉬운 점', n: s.counts.권장 + s.counts.참고, kind: 'soft' },
      { label: '꼭 고칠 점', n: s.counts.반드시, kind: 'must' },
    ],
    top: s.top,
    topLabel: s.topLevel === '반드시' ? '꼭 고칠 점부터' : '아쉬운 점',
  };
}

module.exports = { summarize, bubbleCard };
