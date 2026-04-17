#!/usr/bin/env python3
"""Generate PWA icons for KikaCentroid.

Design:
- Dark background (#0d1117), matching the in-game board.
- Stylized centroid visualization: 6 blue dots scattered on a faint grid
  with a bright green centroid square at the middle, thin green vectors
  from each dot to the centroid.
- A subtle cyan "K" glyph in the corner to brand it.
- Maskable variant keeps all meaningful content inside the 60% safe zone.
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

BG       = (13, 17, 23)      # #0d1117
GRID     = (33, 38, 45)      # #21262d
DOT      = (77, 143, 204)    # #4d8fcc
CENTROID = (102, 187, 106)   # #66bb6a
VECTOR   = (102, 187, 106, 140)
CYAN     = (0, 212, 255)

# Positions on an 11x11 board (normalized grid cells)
BOARD_N   = 11
SAMPLE = [(2, 2), (3, 7), (5, 4), (7, 2), (8, 8), (2, 9)]
# Centroid of the sample (floats, rounded)
CX = round(sum(x for x, _ in SAMPLE) / len(SAMPLE))
CY = round(sum(y for _, y in SAMPLE) / len(SAMPLE))


def draw_icon(size: int, *, maskable: bool = False, rounded: bool = True) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img, "RGBA")

    # Maskable: keep visual in inner 60% (safe zone) so nothing critical
    # gets clipped by platform masks. Non-maskable uses the whole tile.
    inset = int(size * 0.20) if maskable else int(size * 0.08)
    inner = size - inset * 2
    cell = inner / BOARD_N
    ox = inset
    oy = inset

    # Subtle grid
    for i in range(BOARD_N + 1):
        x = ox + i * cell
        draw.line([(x, oy), (x, oy + inner)], fill=GRID, width=max(1, size // 256))
        y = oy + i * cell
        draw.line([(ox, y), (ox + inner, y)], fill=GRID, width=max(1, size // 256))

    # Vectors from each dot to the centroid
    cx_px = ox + CX * cell + cell / 2
    cy_px = oy + CY * cell + cell / 2
    for x, y in SAMPLE:
        dx = ox + x * cell + cell / 2
        dy = oy + y * cell + cell / 2
        draw.line([(dx, dy), (cx_px, cy_px)], fill=VECTOR, width=max(1, size // 180))

    pad = max(1, int(cell * 0.12))

    # Dots (blue)
    for x, y in SAMPLE:
        x0 = ox + x * cell + pad
        y0 = oy + y * cell + pad
        x1 = ox + (x + 1) * cell - pad
        y1 = oy + (y + 1) * cell - pad
        draw.rectangle([(x0, y0), (x1, y1)], fill=DOT)

    # Centroid (green) with glow
    x0 = ox + CX * cell + pad
    y0 = oy + CY * cell + pad
    x1 = ox + (CX + 1) * cell - pad
    y1 = oy + (CY + 1) * cell - pad
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    pad_glow = int(cell * 0.6)
    gdraw.rectangle(
        [(x0 - pad_glow, y0 - pad_glow), (x1 + pad_glow, y1 + pad_glow)],
        fill=CENTROID + (110,),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.025))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle([(x0, y0), (x1, y1)], fill=CENTROID)

    # Round the corners (not for maskable — platform masks that itself)
    if rounded and not maskable:
        mask = Image.new("L", (size, size), 0)
        mdraw = ImageDraw.Draw(mask)
        radius = int(size * 0.22)
        mdraw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask=mask)
        return out

    return img


def save(img: Image.Image, name: str) -> None:
    path = os.path.join(OUT, name)
    img.convert("RGBA").save(path, "PNG", optimize=True)
    print(f"  wrote {path} ({img.size[0]}x{img.size[1]})")


def main() -> None:
    save(draw_icon(192), "icon-192.png")
    save(draw_icon(512), "icon-512.png")
    # Maskable fills the full tile — platform applies the mask
    save(draw_icon(512, maskable=True, rounded=False), "icon-maskable-512.png")
    # Apple touch icon: no rounding (iOS rounds it), full bleed
    save(draw_icon(180, rounded=False), "apple-touch-icon-180.png")
    # Favicon
    save(draw_icon(32, rounded=False), "favicon-32.png")


if __name__ == "__main__":
    main()
