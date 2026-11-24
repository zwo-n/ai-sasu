// 내 캐릭터 그림 고르기: 고른 그림을 표정별로 나눈다. (복사·화면 반영은 main 에서)
const path = require('node:path');

const MOODS = ['idle', 'thinking', 'warn', 'happy', 'sleep'];
const IMAGE_TYPES = {
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};
const MAX_BYTES = 5 * 1024 * 1024; // 그림은 data URL 로 화면에 넘기니 너무 크면 안 된다
// 파일 이름에 이 낱말이 있으면 그 표정
const KEYWORDS = {
  idle: ['idle', '기본', '평소'],
  thinking: ['thinking', 'think', '생각', '공부', '읽기'],
  warn: ['warn', '놀람', '경고'],
  happy: ['happy', '신남', '칭찬', '웃음'],
  sleep: ['sleep', '졸림', '잠'],
};

function moodOf(file) {
  const name = path.basename(file, path.extname(file)).toLowerCase();
  return MOODS.find(m => KEYWORDS[m].some(k => name.includes(k))) || null;
}

// files: [{ path, size }] → { plan: { 표정: 원본 경로 } | null, skipped: [{ file, reason }] }
function planImport(files) {
  const plan = {};
  const skipped = [];
  let unnamed = null; // 표정을 모르는 첫 장
  for (const { path: file, size } of files) {
    if (!IMAGE_TYPES[path.extname(file).toLowerCase()]) { skipped.push({ file, reason: '그림 파일이 아니에요' }); continue; }
    if (size > MAX_BYTES) { skipped.push({ file, reason: '5MB가 넘어요' }); continue; }
    const mood = moodOf(file);
    if (mood && plan[mood]) skipped.push({ file, reason: '같은 표정 그림이 이미 있어요' });
    else if (mood) plan[mood] = file;
    else if (!unnamed) unnamed = file;
    else skipped.push({ file, reason: '어느 표정인지 몰라요 (파일 이름에 idle·happy 또는 기본·신남 같은 말을 넣어 주세요)' });
  }
  if (!plan.idle) plan.idle = unnamed || Object.values(plan)[0];
  else if (unnamed) skipped.push({ file: unnamed, reason: '어느 표정인지 몰라요 (평소 그림은 이미 있어요)' });
  return { plan: plan.idle ? plan : null, skipped };
}

module.exports = { MOODS, IMAGE_TYPES, planImport };
