# AI 사수

주니어 개발자 팀을 위한 **시니어 개발자 사수** 클로드 코드 플러그인입니다.

정답 코드를 대신 써 주지 않습니다. 이유를 먼저 설명하고, 힌트를 단계별로 줍니다.
모르는 건 지어내지 않고 질문 장부에 남깁니다. 팀이 답한 내용은 팀 지식으로 쌓여, 다음부터 사수가 그걸 근거로 답합니다.

## 할 수 있는 일

| 명령 | 이럴 때 | 하는 일 |
|---|---|---|
| `/sasu:onboard` | 저장소가 처음일 때 | 구조·요청 흐름·관례·용어집 안내서(`.sasu/onboarding.md`)와 첫 주 과제 3개 |
| `/sasu:review` | 코드를 봐 달라고 할 때 | 잘한 점 → 아쉬운 점 → 꼭 고칠 점(합쳐 최대 5개, 문제·왜·힌트·배울 것) → 머지 판정 → 익힐 개념 하나. [반드시]는 검증자(`review-checker`)가 코드를 다시 열어 확인한 것만 남김 |
| `/sasu:debug` | 버그가 안 잡힐 때 | 증상 정리 → 힌트 3단계(방향 → 위치 → 원인) → 재발 막는 테스트 |
| `/sasu:ask` | 어디 있는지, 왜 그런지 궁금할 때 | 팀 지식 → 코드 순서로 찾아 `파일:줄` 근거로 답. 모르면 질문 장부로 |
| `/sasu:design` | 만들기 전에 | 내 안 검토, 저장소 패턴 찾기, 대안 비교, 테스트부터 쓰는 단계로 쪼개기 |
| `/sasu:growth` | 한 주를 돌아볼 때 | 자주 지적받은 주제, 좋아진 점, 이번 주 연습 하나 |

명령을 외우지 않아도 됩니다. "이거 리뷰해 주세요", "왜 에러 나는지 모르겠어요"처럼 말하면 맞는 기능을 고릅니다.
급하면 "급해요" 또는 "정답 보여 주세요"라고 하세요. 그때는 바로 답을 줍니다.

## 설치

클로드 코드에서 아래를 입력합니다.

```
/plugin marketplace add zwo-n/ai-sasu
/plugin install sasu@ai-sasu
```

새 버전이 나오면 터미널에서 `claude plugin marketplace update ai-sasu` 다음에 `claude plugin update sasu@ai-sasu`를 실행합니다.

맥 화면에 사수 캐릭터를 띄워 내 PR을 자동으로 리뷰받으려면 데스크톱 앱도 설치합니다 → [desktop/README.md](desktop/README.md#처음-설치하기)

설치하지 않고 한 번 써 보려면 (저장소를 받은 폴더에서):

```bash
claude --plugin-dir .
```

사수를 기본 대화 상대로 띄우려면:

```bash
claude --agent sasu:senior-dev
```

필요한 것: 클로드 코드, `python3`, `git`. PR 리뷰는 `gh`도 필요합니다.

## 팀 데이터: `.sasu/`

사수는 작업하는 저장소의 `.sasu/` 폴더에 기록합니다.

| 파일 | 내용 | 공유 |
|---|---|---|
| `knowledge.md` | 팀 지식. 사수가 답하기 전에 먼저 찾아봅니다. 직접 고쳐도 됩니다 (`## 제목`으로 항목 구분) | 커밋 |
| `questions.jsonl` | 사수가 답하지 못한 질문 | 커밋 |
| `onboarding.md` | 온보딩 안내서 | 커밋 |
| `plans/` | 설계 상담 결과 | 커밋 |
| `growth.jsonl` | 리뷰·디버깅에서 나온 배울 점. 본인 것 | 올리지 않음 (`.sasu/.gitignore`) |

- 장부 변경은 기능 PR에 섞지 말고 따로 커밋하세요 (예: `chore: 사수 질문 장부`). 리뷰는 `.sasu/`를 빼고 봅니다.
- 질문 번호는 `Q-7f3a`처럼 임의 4자리라 브랜치마다 따로 기록해도 겹치지 않습니다. 병합하다 깨진 줄은 건너뛰고 경고만 합니다.

### 질문 장부 돌리기

1. 사수가 답을 못 하면 `Q-7f3a`처럼 장부에 남깁니다. 같은 질문이 열려 있으면 그 번호를 다시 씁니다.
2. 아는 사람이 답합니다: `/sasu:ask Q-7f3a 답: 결제 후 7일까지`
3. 그 답이 `knowledge.md`에 들어가고, 다음부터 사수가 바로 답합니다.

열린 질문 보기: `/sasu:ask 열린 질문`

스크립트를 직접 써도 됩니다.

```bash
python3 scripts/sasu.py open
python3 scripts/sasu.py answer Q-7f3a "결제 후 7일까지" --by 팀장
python3 scripts/sasu.py report --who 민지 --days 7
```

## 데스크톱 캐릭터 (맥)

화면 아래에 사수 캐릭터를 띄워 두고, 눌러서 대화하거나 내 PR이 올라오면 바로 리뷰를 받습니다. → [desktop/README.md](desktop/README.md)

## 사수의 원칙

`agents/senior-dev.md`에 있습니다. 모든 기능이 이 파일을 읽고 따르므로, 사수 성격을 바꾸려면 이 파일 하나만 고치면 됩니다.

1. 이유 먼저 2. 정답은 마지막에 3. 근거 없이 말하지 않기 4. 우선순위대로 적게 5. 한 번에 개념 하나
6. 질문은 짧게 7. 위험은 즉시 멈추기 8. 팀 관례 우선 9. 기록하기

## 개발

```bash
python3 -m unittest discover -s tests -v   # 장부 동작 + 플러그인 구조 테스트
claude plugin validate .
```

이 저장소의 `.claude/`에는 개발에 쓴 [ECC](https://github.com/affaan-m/ECC) 스킬과 에이전트가 들어 있습니다.
이 폴더에서 `claude`를 열면 `/plan`, `tdd-workflow`, `verification-loop`, `code-reviewer` 등을 쓸 수 있습니다. 출처는 `NOTICE.md`에 있습니다.
