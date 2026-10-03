#!/usr/bin/env python3
"""Draws the app icons: a ridge with one flag on it, on the game's navy.

No letters and no aircraft (art direction, wiki 아트-디렉션 7장): the name is
카르다 전선, a front line across a valley, and the icon is that line. Drawn at
1024px and reduced, so every size is the same picture. The maskable icon keeps
the drawing inside the central 80% safe zone.

  python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

NAVY = (11, 19, 32, 255)
RIDGE_FAR = (36, 52, 70, 255)
RIDGE = (62, 84, 74, 255)
POLE = (230, 232, 236, 255)
FLAG = (255, 207, 92, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def draw(size: int, inset: float) -> Image.Image:
    big = 1024
    img = Image.new("RGBA", (big, big), NAVY)
    d = ImageDraw.Draw(img)
    s = big * (1 - 2 * inset)
    o = big * inset

    def p(x: float, y: float) -> tuple[float, float]:
        return (o + x * s, o + y * s)

    d.polygon([p(0, 0.78), p(0.22, 0.6), p(0.38, 0.7), p(0.62, 0.5), p(0.82, 0.62), p(1, 0.55), p(1, 1), p(0, 1)], fill=RIDGE_FAR)
    d.polygon([p(0, 0.9), p(0.18, 0.74), p(0.34, 0.8), p(0.56, 0.52), p(0.74, 0.7), p(1, 0.78), p(1, 1), p(0, 1)], fill=RIDGE)
    d.rectangle([p(0.545, 0.18), p(0.575, 0.53)], fill=POLE)
    d.polygon([p(0.575, 0.18), p(0.82, 0.25), p(0.575, 0.32)], fill=FLAG)
    return img.resize((size, size), Image.LANCZOS)


for name, size, inset in [
    ("icon-512.png", 512, 0.0),
    ("icon-192.png", 192, 0.0),
    ("apple-touch-icon.png", 180, 0.0),
    ("favicon-64.png", 64, 0.0),
    ("icon-maskable-512.png", 512, 0.1),
]:
    draw(size, inset).save(OUT / name, optimize=True)
    print(name, size)
