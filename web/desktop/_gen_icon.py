"""Skills Manager 앱 아이콘 생성기.
브랜드(로딩 로고)와 동일: 둥근 사각형(#2f6bed→#1d4fd0 미세 그라데이션) + 흰색 'S'.
'S'는 시스템 폰트 없이 Catmull-Rom 스플라인을 굵은 라운드캡 스트로크로 그려 만든다.
1024px 마스터에서 그린 뒤 다운샘플(LANCZOS)로 안티앨리어싱 → multi-size .ico + .png 출력.
"""
import os
from PIL import Image, ImageDraw

SS = 1024  # 마스터 해상도
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")
os.makedirs(DEST, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


top, bot = hex2rgb("#2f6bed"), hex2rgb("#1d4fd0")

# 1) 세로 그라데이션 배경
grad = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
for y in range(SS):
    t = y / (SS - 1)
    c = tuple(round(lerp(top[i], bot[i], t)) for i in range(3))
    gd.line([(0, y), (SS, y)], fill=c + (255,))

# 2) 둥근 사각형 마스크
m = 64
x0, y0, x1, y1 = m, m, SS - m, SS - m
rad = round((x1 - x0) * 0.26)
mask = Image.new("L", (SS, SS), 0)
ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=255)

icon = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
icon.paste(grad, (0, 0), mask)

# 3) 'S' 글자 — 스플라인 스트로크
cx, cy = SS / 2, SS / 2
gw = 0.21 * (x1 - x0)   # 글리프 반너비
gh = 0.30 * (y1 - y0)   # 글리프 반높이
xL, yT = cx - gw, cy - gh


def uv(u, v):
    return (xL + u * 2 * gw, yT + v * 2 * gh)


P = [uv(*p) for p in [
    (0.92, 0.16), (0.50, 0.04), (0.10, 0.22),
    (0.50, 0.50), (0.90, 0.78), (0.50, 0.96), (0.08, 0.84),
]]


def catmull(pts, n=28):
    out = [pts[0]]
    Q = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for j in range(1, n + 1):
            t = j / n
            t2, t3 = t * t, t * t * t
            x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


spine = catmull(P)
W = round(0.34 * gw * 2 / 2 * 2)  # 스트로크 폭 ≈ 0.34*반너비*... → 약 64px
W = round(0.34 * gw)
dr = ImageDraw.Draw(icon)
dr.line(spine, fill=(255, 255, 255, 255), width=W, joint="curve")
for (ex, ey) in (spine[0], spine[-1]):
    r = W / 2
    dr.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(255, 255, 255, 255))

# 4) 출력: 256 베이스 → multi-size ICO + 512 PNG
base = icon.resize((256, 256), Image.LANCZOS)
ico_path = os.path.join(DEST, "icon.ico")
base.save(ico_path, format="ICO",
          sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
png_path = os.path.join(DEST, "icon.png")
icon.resize((512, 512), Image.LANCZOS).save(png_path)

print("ICO:", ico_path, os.path.getsize(ico_path), "bytes")
print("PNG:", png_path, os.path.getsize(png_path), "bytes")
print("stroke width W =", W)
