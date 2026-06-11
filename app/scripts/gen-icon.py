#!/usr/bin/env python3
"""Generate Účtenkomat app icons (receipt + 'filed' check) into ../assets."""
import os
from PIL import Image, ImageDraw

S = 1024
BLUE = (37, 99, 235, 255)      # #2563eb
WHITE = (255, 255, 255, 255)
LINE = (203, 213, 225, 255)    # #cbd5e1
LINE_DK = (148, 163, 184, 255) # #94a3b8
GREEN = (22, 163, 74, 255)     # #16a34a
ASSETS = os.path.join(os.path.dirname(__file__), "..", "assets")


def draw_receipt(draw, cx, cy, w, h, detail=True, fill=WHITE):
    left, right = cx - w / 2, cx + w / 2
    top, bottom = cy - h / 2, cy + h / 2
    amp = w * 0.05
    n = 10
    step = (right - left) / n
    pts = [(left, top), (right, top), (right, bottom - amp)]
    for k in range(1, n + 1):
        x = right - step * k
        y = bottom if k % 2 == 1 else bottom - amp
        pts.append((x, y))
    pts.append((left, bottom - amp))
    draw.polygon(pts, fill=fill)
    if not detail:
        return
    # text rows
    mx = left + w * 0.16
    rw = w * 0.68
    y = top + h * 0.16
    draw.rounded_rectangle([mx, y, mx + rw * 0.7, y + h * 0.05], radius=h * 0.025, fill=LINE_DK)
    y += h * 0.16
    for frac in (1.0, 0.85, 0.6):
        draw.rounded_rectangle([mx, y, mx + rw * frac, y + h * 0.035], radius=h * 0.018, fill=LINE)
        y += h * 0.11


def check_badge(draw, cx, cy, r):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    draw.line([(cx - r * 0.42, cy + r * 0.02), (cx - r * 0.1, cy + r * 0.34), (cx + r * 0.46, cy - r * 0.34)],
              fill=WHITE, width=int(r * 0.22), joint="curve")


def save(img, name):
    img.save(os.path.join(ASSETS, name))
    print("wrote", name)


# 1) Universal icon: blue bg + receipt + check (full bleed, used by iOS & desktop)
img = Image.new("RGBA", (S, S), BLUE)
d = ImageDraw.Draw(img)
draw_receipt(d, S * 0.46, S * 0.47, S * 0.46, S * 0.58)
check_badge(d, S * 0.70, S * 0.72, S * 0.12)
save(img, "icon.png")

# 2) Android adaptive foreground: transparent, content in the central safe zone
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(fg)
draw_receipt(d, S * 0.47, S * 0.48, S * 0.34, S * 0.43)
check_badge(d, S * 0.63, S * 0.66, S * 0.09)
save(fg, "android-icon-foreground.png")

# 3) Android adaptive background: solid blue
save(Image.new("RGBA", (S, S), BLUE), "android-icon-background.png")

# 4) Monochrome (themed icons): white silhouette, no detail
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(mono)
draw_receipt(d, S * 0.5, S * 0.48, S * 0.36, S * 0.45, detail=False, fill=WHITE)
save(mono, "android-icon-monochrome.png")
