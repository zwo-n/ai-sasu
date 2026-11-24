# 캐릭터

기본 캐릭터는 **엔젤이**(`angel/`)입니다. 그림이 하나도 없으면 `renderer/index.html` 안의 SVG 캐릭터가 대신 나옵니다.

## 표정

| 파일 | 언제 | 엔젤이 |
|---|---|---|
| `idle` | 평소 (꼭 있어야 함) | 기본 |
| `thinking` | 대화·리뷰 중 | 공부/읽기 |
| `warn` | 리뷰 판정 "막힘" | 놀람 |
| `happy` | 리뷰 판정 "머지 가능" | 신남/활짝 |
| `sleep` | 방해 금지 | 졸림 |

확장자는 `.png` `.gif` `.svg` `.webp` 중 하나. 없는 표정은 `idle`로 보입니다.
크기는 240×264(화면 120×132의 2배), 배경 투명, 캐릭터는 아래쪽에 붙입니다. 움직이는 그림은 `.gif`로.

## 엔젤이 다시 뽑기

캐릭터 시트를 고쳤으면 `cut_angel.py`로 다시 자릅니다. 표정 칸 위치는 스크립트 위쪽 `BOXES`에 있습니다 (1536×1024 시트 기준).

```bash
python3 -m venv /tmp/pil && /tmp/pil/bin/pip install pillow==12.0.0
/tmp/pil/bin/python characters/cut_angel.py "<시트.png>" characters/angel
```

## 다른 캐릭터로 바꾸기

1. 폴더 하나에 위 표 이름대로 그림을 넣습니다.
2. 메뉴 막대 **사수 → 설정 파일 열기**에서 `characterDir`에 그 폴더 경로를 적습니다.
3. **사수 → 설정 다시 읽기**.
