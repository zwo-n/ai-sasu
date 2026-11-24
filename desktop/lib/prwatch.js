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

module.exports = { diffPRs };
