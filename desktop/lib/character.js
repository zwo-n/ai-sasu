// 내 캐릭터 그림 고르기: 고른 그림을 표정별로 나눈다. (복사·화면 반영은 main 에서)
const path = require('node:path');

const MOODS = ['idle', 'thinking', 'warn', 'happy', 'sleep'];
const IMAGE_TYPES = {
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};
// png·jpg·webp 는 화면 크기(높이 528px)로 줄여 저장하니 원본이 커도 된다.
// gif·svg 는 그대로 data URL 로 화면에 넘기니 작아야 한다 (표정 바뀔 때마다 통째로 오간다).
const SHRINKABLE = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_SHRINKABLE = 50 * 1024 * 1024;
const MAX_AS_IS = 5 * 1024 * 1024;
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
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_TYPES[ext]) { skipped.push({ file, reason: '그림 파일이 아닙니다' }); continue; }
    if (SHRINKABLE.has(ext) && size > MAX_SHRINKABLE) { skipped.push({ file, reason: '50MB가 넘습니다' }); continue; }
    if (!SHRINKABLE.has(ext) && size > MAX_AS_IS) { skipped.push({ file, reason: 'gif·svg는 그대로 쓰니 5MB까지입니다' }); continue; }
    const mood = moodOf(file);
    if (mood && plan[mood]) skipped.push({ file, reason: '같은 표정 그림이 이미 있습니다' });
    else if (mood) plan[mood] = file;
    else if (!unnamed) unnamed = file;
    else skipped.push({ file, reason: '어느 표정인지 모르겠습니다 (파일 이름에 idle·happy 또는 기본·신남 같은 말을 넣어 주십시오)' });
  }
  if (!plan.idle) plan.idle = unnamed || Object.values(plan)[0];
  else if (unnamed) skipped.push({ file: unnamed, reason: '어느 표정인지 모르겠습니다 (평소 그림은 이미 있습니다)' });
  return { plan: plan.idle ? plan : null, skipped };
}

module.exports = { MOODS, IMAGE_TYPES, planImport };
