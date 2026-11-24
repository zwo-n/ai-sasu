import sys
from collections import deque
from pathlib import Path
from PIL import Image

SRC, OUT = sys.argv[1], Path(sys.argv[2])
BOXES = {
    "idle":     (443, 391, 614, 534),
    "happy":    (796, 386, 970, 534),
    "warn":     (1328, 386, 1500, 534),
    "sleep":    (620, 584, 792, 742),
    "thinking": (1196, 842, 1356, 962),
}
W, H = 240, 264  # 화면 120x132 의 2배 (레티나)
TOL, SOFT, FADE = 34, 58, 14

def dist(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))

def cut(img):
    w, h = img.size
    px = img.load()
    bg = px[2, 2]
    seen = [[False] * h for _ in range(w)]
    q = deque()
    seeds = [(x, 0) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]  # 아래 가장자리는 빼고
    for s in seeds:
        if dist(px[s], bg) < TOL:
            q.append(s); seen[s[0]][s[1]] = True
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny]:
                seen[nx][ny] = True
                d = dist(px[nx, ny], bg)
                if d < TOL:
                    q.append((nx, ny))
                elif d < SOFT:  # 경계 부드럽게
                    r, g, b, a = px[nx, ny]
                    px[nx, ny] = (r, g, b, int(a * (d - TOL) / (SOFT - TOL)))
    for y in range(h - FADE, h):  # 잘린 아래쪽 흐리게
        k = (h - y) / FADE
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, int(a * k))
    return img.crop(img.getbbox())

OUT.mkdir(parents=True, exist_ok=True)
sheet = Image.open(SRC).convert("RGBA")
prev = Image.new("RGBA", (5 * W, H), (60, 70, 90, 255))
cuts = {k: cut(sheet.crop(box)) for k, box in BOXES.items()}
# 표정 칸은 모두 같은 배율 (표정이 바뀌어도 크기가 그대로). 공부/읽기는 시트에서 작게 그려져 있어 1.3배.
base = min(min((W - 8) / c.width, (H - 6) / c.height) for k, c in cuts.items() if k != "thinking")
for i, (k, c) in enumerate(cuts.items()):
    s = base * 1.3 if k == "thinking" else base
    s = min(s, (W - 8) / c.width, (H - 6) / c.height)
    c = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(c, ((W - c.width) // 2, H - c.height - 2), c)
    canvas.save(OUT / f"{k}.png", optimize=True)
    prev.alpha_composite(canvas, (i * W, 0))
prev.convert("RGB").resize((5 * W // 2, H // 2)).save(OUT.parent / "angel-check.png")  # 확인용, 캐릭터 폴더 밖에
