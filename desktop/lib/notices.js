// 지나간 알림(말풍선) 기록. 놓친 리뷰·머지 소식을 대화창에서 다시 본다. 화면·파일과 상관없는 순수 함수만.
const KEEP_DAYS = 7;
const MAX = 60;
const DAY = 24 * 60 * 60 * 1000;

const localDay = t => new Date(t).toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)

// 새 알림을 맨 앞에 넣고, 7일 지난 것과 60개 넘는 것은 버린다
function addNotice(list, item, now = Date.now()) {
  return [{ ...item, at: now, read: false }, ...(list || [])]
    .filter(n => now - n.at < KEEP_DAYS * DAY)
    .slice(0, MAX);
}

const unreadCount = list => (list || []).filter(n => !n.read).length;

// 날짜별로 묶는다: 오늘 / 어제 / 11월 22일
function groupByDay(list, now = Date.now()) {
  const today = localDay(now);
  const yesterday = localDay(now - DAY);
  const groups = [];
  for (const n of list || []) {
    const d = localDay(n.at);
    const label = d === today ? '오늘' : d === yesterday ? '어제' : `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1).items.push(n);
  }
  return groups;
}

// 지난번엔 열려 있었는데 지금 목록에 없는 PR (머지됐거나 닫힘). 드래프트로 바뀐 PR 은 아직 열려 있으니 빼지 않는다.
function closedPRs(prevSeen, openPrs) {
  if (!prevSeen) return [];
  const open = new Set(openPrs.map(p => p.number));
  return Object.keys(prevSeen).map(Number).filter(n => !open.has(n));
}

// gh pr view 결과로 알릴 말. 아직 열려 있으면(다시 열림 등) 알리지 않는다.
function closedText(name, number, pr) {
  const title = String(pr?.title || '').slice(0, 50);
  if (pr?.state === 'MERGED') return `${name} PR #${number} 머지됐어요.${title ? `\n${title}` : ''}`;
  if (pr?.state === 'CLOSED') return `${name} PR #${number}은 머지 없이 닫혔어요.${title ? `\n${title}` : ''}`;
  return null;
}

// 알림 기록이 생기기 전에 끝난 리뷰도 목록에 보이게, 처음 한 번 리뷰 기록(state.reviews)으로 채운다. 이미 지난 일이니 읽음으로.
function seedFromReviews(reviews, cardFor, now = Date.now()) {
  return (reviews || [])
    .map(r => ({ id: `seed-${r.id}`, at: Date.parse(r.date), text: `PR #${r.number} ${r.title}\n${r.line}`, reviewId: r.id, card: cardFor(r), read: true }))
    .filter(n => now - n.at < KEEP_DAYS * DAY)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX);
}

module.exports = { addNotice, unreadCount, groupByDay, closedPRs, closedText, seedFromReviews, KEEP_DAYS, MAX };
