# 출처

AI 사수의 일부 절차는 ECC(Everything Claude Code)를 바탕으로 고쳐 썼습니다.

- 저장소: https://github.com/affaan-m/ECC
- 저작권: Copyright (c) 2026 Affaan Mustafa
- 라이선스: MIT (전문은 `.claude/ECC-LICENSE`)

| AI 사수 | 바탕이 된 ECC 파일 |
|---|---|
| `skills/review` | `agents/code-reviewer.md` (Pre-Report Gate, 확신 80% 규칙, 0건 리뷰 허용) |
| `skills/onboard` | `skills/codebase-onboarding` |
| `skills/design` | `commands/plan.md`, `skills/tdd-workflow`, `skills/search-first` |
| `skills/debug` 돌아보기 단계 | `skills/tdd-workflow` |

`.claude/skills`, `.claude/agents`, `.claude/commands`의 파일은 ECC 원본을 그대로 복사한 것입니다 (복사한 커밋은 `.claude/ECC-SOURCE`).
