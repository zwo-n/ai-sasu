// 대화창 첫 인사. 이름은 설정의 displayName → GitHub 계정명 순서로 main 이 넘긴다. 화면에는 글자로만 넣는다.
function greeting({ me, hasRepos }) {
  if (!hasRepos) return '안녕하세요, 사수예요. 메뉴 막대의 사수 → 저장소 추가…로 지켜볼 저장소를 알려 주세요.';
  const name = typeof me === 'string' ? me.trim().slice(0, 20) : '';
  const whose = name ? `${name}님의 PR이 올라오면` : 'PR을 올리시면';
  return `안녕하세요, 사수예요. 코드 얘기면 뭐든 물어보세요. ${whose} 제가 먼저 볼게요.`;
}

module.exports = { greeting };
