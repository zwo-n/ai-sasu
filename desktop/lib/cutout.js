// 캐릭터 그림 배경 지우기(누끼). 라이브러리 없이 BGRA 비트맵(Electron nativeImage.toBitmap)을 다룬다.
// 가장자리에서 배경색을 정하고, 가장자리와 이어진 비슷한 색만 지운다 → 캐릭터 안쪽의 흰 눈 같은 건 남는다.

const dist = (d, i, c) => Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]));
const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];

function borderIndexes(w, h) {
  const out = [];
  for (let x = 0; x < w; x++) out.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) out.push(y * w, y * w + w - 1);
  return out;
}

// 그대로 두는 경우: 이미 투명한 그림, 가장자리가 고르지 않은 사진, 거의 다 지워지거나 거의 안 지워지는 그림
function removeBackground({ width: w, height: h, data }, { tol = 48, soft = 28 } = {}) {
  const same = { width: w, height: h, data, changed: false };
  const border = borderIndexes(w, h);
  const opaque = border.filter(p => data[p * 4 + 3] >= 16);
  if (opaque.length < border.length / 2) return same;

  const bg = [0, 1, 2].map(c => median(opaque.map(p => data[p * 4 + c])));
  const seeds = opaque.filter(p => dist(data, p * 4, bg) <= tol);
  if (seeds.length < border.length * 0.6) return same;

  // 가장자리에서 시작해 배경색과 가까운 칸을 넓혀 간다
  const gone = new Uint8Array(w * h);
  const stack = [];
  for (const p of seeds) if (!gone[p]) { gone[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= w * h || gone[q]) continue;
      if (data[q * 4 + 3] >= 16 && dist(data, q * 4, bg) > tol) continue;
      gone[q] = 1;
      stack.push(q);
    }
  }
  const removed = gone.reduce((n, v) => n + v, 0) / (w * h);
  if (removed > 0.97 || removed < 0.005) return same;

  const out = Buffer.from(data);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (gone[p]) { out[i + 3] = 0; continue; }
    const x = p % w;
    const y = (p / w) | 0;
    // 지운 칸 옆인데 배경색과 꽤 비슷하면 반쯤 투명하게 (가장자리 흰 테두리 줄이기)
    const nearGone = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
    const d = dist(data, i, bg);
    if (nearGone && d < tol + soft) out[i + 3] = Math.round(out[i + 3] * (0.35 + 0.65 * (d - tol) / soft));
    if (out[i + 3] > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return same; // 보이는 칸이 하나도 안 남으면 빈 그림을 만들지 않는다

  // 빈 여백을 잘라 캐릭터가 칸을 꽉 채우게
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const crop = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.copy(crop, y * cw * 4, ((minY + y) * w + minX) * 4, ((minY + y) * w + maxX + 1) * 4);
  return { width: cw, height: ch, data: crop, changed: true };
}

module.exports = { removeBackground };
