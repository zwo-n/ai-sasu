# 사수 데스크톱 (맥)

화면 오른쪽 아래에 사수 캐릭터(기본: 엔젤이)가 떠 있습니다.

- **누르면 대화**: 코드 얘기를 물으면 사수(`sasu:senior-dev`)가 저장소를 읽고 `파일:줄` 근거로 답합니다. 대화는 저장소별로 이어집니다.
- **내 PR을 리뷰**: 지켜보는 저장소에 내 PR이 새로 열리거나 새 커밋이 푸시되면 `/sasu:review`를 돌립니다. 결과는 말풍선과 맥 알림으로 오고, 누르면 전체 리뷰를 봅니다.
- **표정**: 평소 · 생각 중(책 읽기) · 경고(판정 "막힘", 놀람) · 칭찬(판정 "머지 가능", 신남) · 잠(방해 금지)
- **끌어서 옮기기**: 캐릭터를 끌면 자리가 바뀌고, 그 자리를 기억합니다.

## 준비

- 사수 플러그인 설치: `/plugin marketplace add zwo-n/ai-sasu`, `/plugin install sasu@ai-sasu`
- `claude`(로그인된 상태), `gh`(`gh auth login`), Node 20 이상

## 실행

```bash
cd desktop
npm install
npm start
```

메뉴 막대의 **사수**를 눌러 **저장소 추가…**로 지켜볼 저장소 폴더를 고릅니다.
추가할 때 이미 열려 있던 PR은 리뷰하지 않고, 건너뛴 PR을 말풍선으로 알려 줍니다.
리뷰받으려면 **지켜보는 저장소 → (저장소) → 리뷰할 PR 고르기**에서 하나를 고르거나, **열린 내 PR 모두 리뷰**를 누릅니다. 둘 다 그 저장소만 보고, PR 하나에 AI 호출 한 번을 씁니다.

캐릭터 표정만 미리 보려면: `SASU_DEMO=1 npm start` (AI를 부르지 않음)

## AI를 쓰는 곳

두 곳뿐이고, 둘 다 `claude` 명령(구독)으로 돌아갑니다. API 키를 쓰지 않습니다.

| 언제 | 무엇 | 모델(기본) |
|---|---|---|
| 캐릭터를 눌러 대화할 때 | `claude -p --agent sasu:senior-dev` | `chatModel`: sonnet |
| 내 PR이 열리거나 푸시될 때 | `claude -p "/sasu:review <번호>"` | `reviewModel`: sonnet |

PR 확인(`gh pr list`), 리뷰 요약, 표정 바꾸기는 AI를 쓰지 않습니다.
하루 호출 수는 `dailyLimit`(기본 30)으로 막습니다. 넘으면 다음 날까지 쉬고, 말풍선으로 알려 줍니다.

사수는 **읽기만** 합니다 (`lib/claude.js`).
- 코드를 고치는 도구(Edit·Write)와 웹 도구는 막혀 있습니다.
- 허용한 명령은 git·gh 조회와, 설치된 사수 장부 `sasu.py`의 **정확한 경로**뿐입니다. PR 내용에 숨은 지시가 있어도 다른 코드를 실행하지 못합니다.
- 화면은 샌드박스에서 돌고, 답변의 HTML은 모두 이스케이프합니다. 링크는 github.com PR 주소만 엽니다.

## 설정

메뉴 막대 **사수 → 설정 파일 열기** (`~/Library/Application Support/sasu-buddy/config.json`). 고친 뒤 **설정 다시 읽기**.

| 키 | 기본 | 뜻 |
|---|---|---|
| `repos` | `[]` | 지켜볼 저장소 경로 |
| `pollSeconds` | 120 | 내 PR 확인 간격(초, 최소 60) |
| `reviewModel` / `chatModel` | `sonnet` | 리뷰·대화 모델 (`haiku`로 바꾸면 사용량이 줄어듦) |
| `dailyLimit` | 30 | 하루 AI 호출 한도 |
| `reviewDrafts` | `false` | 드래프트 PR도 리뷰할지 |
| `characterDir` | `null` | 내 캐릭터 그림 폴더. 비우면 엔젤이 → [characters/README.md](characters/README.md) |
| `claudePath` / `ghPath` / `sasuScript` | `null` | 명령·장부 위치를 직접 지정할 때 |

리뷰 원문은 `~/Library/Application Support/sasu-buddy/reviews/`에 남습니다.

## 개발

```bash
npm test   # 로직 테스트 (AI 안 부름)
```

| 파일 | 하는 일 |
|---|---|
| `main.js` | 창·메뉴 막대·PR 확인·리뷰 순서·대화 |
| `preload.js` | 화면에 열어 주는 기능 목록 |
| `renderer/` | 말풍선·대화창, 예비 캐릭터(SVG) |
| `characters/` | 기본 캐릭터 엔젤이와 자르는 스크립트 |
| `lib/prwatch.js` | 리뷰할 PR 고르기 (새 PR·새 푸시, 드래프트 제외) |
| `lib/summary.js` | 리뷰에서 판정·지적 수 뽑기 |
| `lib/claude.js` | `claude -p` 실행 |
| `lib/markdown.js` | 답변 표시 (모든 HTML 이스케이프, 링크 안 만듦) |
| `lib/usage.js` | 하루 한도 |
