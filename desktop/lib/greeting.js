// 대화창 첫 인사. 이름은 처음 켤 때 묻고(displayName), 건너뛰면 GitHub 계정명을 쓴다. 화면에는 글자로만 넣는다.
// 부를 이름: 앞뒤 공백과 줄바꿈 등 제어문자, 큰따옴표·역슬래시를 빼고 20자까지.
// AI 지시문의 "…" 안에 들어가니 그 따옴표를 깨는 글자만 뺀다 (O'Brien 의 작은따옴표는 남긴다).
function callName(me) {
  return typeof me === 'string' ? me.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim().slice(0, 20) : '';
}

// 이름을 아직 묻지 않았나. displayName: null = 안 물어봄, "" = 건너뜀(GitHub 계정명), "지원" = 입력함
// 판단은 여기 한 곳에서만 한다 (!displayName 으로 보면 건너뛴 사람에게 또 묻게 된다)
const needsName = config => config.displayName === null || config.displayName === undefined;

// askName: 아직 이름을 묻지 않았다 (처음 켬)
function greeting({ me, hasRepos, askName = false }) {
  if (askName) return '처음 뵙겠습니다. 사수입니다. 성함이 어떻게 되십니까?';
  if (!hasRepos) return '안녕하십니까, 사수입니다. 메뉴 막대의 사수 → 저장소 추가…로 지켜볼 저장소를 알려 주십시오.';
  const name = callName(me);
  const whose = name ? `${name}님의 PR이 올라오면` : 'PR을 올리시면';
  return `안녕하십니까, 사수입니다. 코드 얘기면 뭐든 물어보십시오. ${whose} 제가 먼저 보겠습니다.`;
}

// 이름을 받은 뒤 사수의 답. typed: 직접 입력했나 (아니면 건너뜀 → GitHub 계정명)
const CHANGE = '바꾸고 싶으시면 메뉴 막대의 사수 → 부를 이름 바꾸기…를 누르십시오.';
function nameReply(name, typed) {
  if (typed && name) return `${name}님, 앞으로 잘 부탁드립니다. 궁금한 점 있으면 편하게 물어보십시오.`;
  if (name) return `알겠습니다. GitHub 계정 이름대로 ${name}님이라고 부르겠습니다. ${CHANGE}`;
  return `알겠습니다. 이름 없이 말씀드리겠습니다. ${CHANGE}`;
}

module.exports = { greeting, callName, nameReply, needsName };
