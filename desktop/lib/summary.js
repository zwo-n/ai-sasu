// 사수 리뷰(마크다운)에서 말풍선용 요약을 뽑는다. AI 를 다시 부르지 않는다.
const VERDICTS = ['고친 뒤 머지', '머지 가능', '막힘'];

function summarize(md) {
  const counts = { 반드시: 0, 권장: 0, 참고: 0 };
  let top = null;
  for (const m of md.matchAll(/^###\s*\d+\.\s*\[(반드시|권장|참고)\]\s*(.+)$/gm)) {
    counts[m[1]] += 1;
    if (!top) top = m[2].replace(/\s+—\s+`[^`]*`\s*$/, '').trim();
  }
  let verdict = '알 수 없음';
  const sec = md.split(/^##\s*판정\s*$/m)[1];
  if (sec !== undefined) {
    const firstLine = sec.split('\n').find(l => l.trim()) || '';
    verdict = VERDICTS.find(v => firstLine.includes(v)) || verdict;
  }
  const mood = verdict === '막힘' ? 'warn' : verdict === '머지 가능' ? 'happy' : 'idle';
  const line = [verdict, ...Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`)].join(' · ');
  return { verdict, counts, top, mood, line };
}

module.exports = { summarize };
