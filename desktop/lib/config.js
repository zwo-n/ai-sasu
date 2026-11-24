// 설정 파일 (~/Library/Application Support/sasu-buddy/config.json) 읽고 쓰기.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  repos: [],             // 지켜볼 저장소의 로컬 경로
  pollSeconds: 120,      // 내 PR 확인 간격 (gh 호출, AI 아님)
  reviewModel: 'sonnet', // PR 리뷰 모델
  chatModel: 'sonnet',   // 대화 모델
  dailyLimit: 30,        // 하루 AI 호출 한도 (대화 + 리뷰)
  reviewDrafts: false,   // 드래프트 PR 도 리뷰할지
  displayName: null,     // 인사말에 쓸 내 이름 (예: "지원"). 비우면 GitHub 계정명
  characterDir: null,    // 내 캐릭터 그림 폴더 (idle/thinking/warn/happy/sleep .png|.gif|.svg). 비우면 기본 엔젤이
  claudePath: null,      // 비우면 PATH 에서 찾음
  ghPath: null,          // 비우면 PATH 에서 찾음
  sasuScript: null,      // 비우면 설치된 sasu 플러그인의 scripts/sasu.py
};

function withDefaults(raw = {}) {
  const c = { ...DEFAULTS, ...raw };
  if (!Array.isArray(c.repos)) c.repos = [];
  if (!(Number.isFinite(c.dailyLimit) && c.dailyLimit > 0)) c.dailyLimit = DEFAULTS.dailyLimit;
  if (!(Number.isFinite(c.pollSeconds))) c.pollSeconds = DEFAULTS.pollSeconds;
  c.pollSeconds = Math.max(60, c.pollSeconds);
  return c;
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { DEFAULTS, withDefaults, loadJson, saveJson };
