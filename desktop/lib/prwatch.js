// 내 PR 목록을 이전 상태와 비교해 리뷰할 PR 을 고른다. (gh 호출은 main 에서)
// seen: { [PR번호]: 마지막으로 본 head 커밋 }. null 이면 첫 확인 → 기준만 잡는다.
function diffPRs(seen, prs, { reviewDrafts = false } = {}) {
  const next = {};
  const toReview = [];
  for (const pr of prs) {
    if (pr.isDraft && !reviewDrafts) continue; // 준비되면 그때 새 PR 처럼 본다
    next[pr.number] = pr.headRefOid;
    if (seen === null) continue;
    const before = seen[pr.number];
    if (before === undefined) toReview.push({ pr, reason: 'new' });
    else if (before !== pr.headRefOid) toReview.push({ pr, reason: 'updated' });
  }
  return { toReview, seen: next };
}

// 저장소를 처음 볼 때 건너뛴 PR 을 알려 줄 말. seen 은 diffPRs 가 돌려준 것 (드래프트 빠짐)
function baselineNote(name, seen) {
  const nums = Object.keys(seen).map(Number).sort((a, b) => b - a);
  if (!nums.length) return `${name} 지켜볼게요. 새 PR을 올리면 리뷰할게요.`;
  const list = nums.slice(0, 3).map(n => `#${n}`).join(', ') + (nums.length > 3 ? ` 외 ${nums.length - 3}개` : '');
  return `${name} 지켜볼게요. 이미 열려 있던 PR ${nums.length}개(${list})는 건너뛰었어요. `
    + '메뉴 막대 사수 → 지켜보는 저장소에서 골라 리뷰할 수 있어요.';
}

// 메뉴에 보일 PR 이름
function prLabel(pr, max = 50) {
  const draft = pr.isDraft ? ' (드래프트)' : '';
  const text = `#${pr.number} ${pr.title}`;
  const room = max - draft.length;
  return (text.length > room ? text.slice(0, room - 1) + '…' : text) + draft;
}

// '모두 리뷰'가 실제로 리뷰할 개수
function readyCount(prs, { reviewDrafts = false } = {}) {
  return prs.filter(pr => reviewDrafts || !pr.isDraft).length;
}

// 메뉴에서 PR 하나를 골라 리뷰할 때의 새 seen.
// 기준이 없던 저장소면 열린 PR 전체로 기준을 잡아, 나머지가 다음 확인에서 '새 PR'로 리뷰되지 않게 한다.
function seenAfterPick(prev, prs, picked, opts = {}) {
  const base = prev ?? diffPRs(null, prs, opts).seen;
  return { ...base, [picked.number]: picked.headRefOid };
}

module.exports = { diffPRs, baselineNote, prLabel, readyCount, seenAfterPick };
