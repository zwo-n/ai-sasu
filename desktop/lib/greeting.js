// 대화창 첫 인사. 이름은 설정의 displayName → GitHub 계정명 순서로 main 이 넘긴다. 화면에는 글자로만 넣는다.
// 부를 이름: 앞뒤 공백·줄바꿈·따옴표를 빼고 20자까지. AI 지시문에도 들어가니 글자만 남긴다.
function callName(me) {
  return typeof me === 'string' ? me.replace(/[\u0000-\u001f\u007f"'`\\]/g, '').trim().slice(0, 20) : '';
}

function greeting({ me, hasRepos }) {
  if (!hasRepos) return '안녕하십니까, 사수입니다. 메뉴 막대의 사수 → 저장소 추가…로 지켜볼 저장소를 알려 주십시오.';
  const name = callName(me);
  const whose = name ? `${name}님의 PR이 올라오면` : 'PR을 올리시면';
  return `안녕하십니까, 사수입니다. 코드 얘기면 뭐든 물어보십시오. ${whose} 제가 먼저 보겠습니다.`;
}

module.exports = { greeting, callName };
