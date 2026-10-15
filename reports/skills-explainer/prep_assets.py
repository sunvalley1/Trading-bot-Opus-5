"""Turn the official seer.pm logo files into the PNGs the skills deck uses.

Usage: python prep_assets.py <folder with logo.svg, star.svg, logo-alt.png from seer.pm/assets/body> <output folder>

Single-colour art (the lockup, the sparkle star) is rendered white-on-black in headless Edge and the
brightness is used as the alpha channel, so each colour variant has clean anti-aliased edges.
The two-tone raven mark (logo-alt.png) is recoloured pixel by pixel for dark backgrounds.
"""
import pathlib
import re
import subprocess
import sys
import tempfile

from PIL import Image

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
SRC, OUT = (pathlib.Path(a) for a in sys.argv[1:3])
OUT.mkdir(parents=True, exist_ok=True)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def coverage(svg_file, width, height):
    """Render every painted shape white on black; return the greyscale coverage mask, trimmed."""
    svg = svg_file.read_text(encoding="utf-8")
    svg = re.sub(r'fill="(?!none)[^"]*"', 'fill="white"', svg)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="seer-render-"))
    (tmp / "art.svg").write_text(svg, encoding="utf-8")
    (tmp / "page.html").write_text(
        '<html><body style="margin:0;background:#000;overflow:hidden">'
        f'<img src="art.svg" style="display:block;width:{width}px;height:{height}px"></body></html>',
        encoding="utf-8",
    )
    png = tmp / "shot.png"
    subprocess.run(
        [EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
         f"--user-data-dir={tmp / 'profile'}", "--force-device-scale-factor=1",
         f"--window-size={width},{height}", f"--screenshot={png}", (tmp / "page.html").as_uri()],
        check=True, timeout=120, capture_output=True,
    )
    mask = Image.open(png).convert("L")
    return mask.crop(mask.getbbox())


def tinted(mask, hex_color):
    im = Image.new("RGBA", mask.size, hex_rgb(hex_color) + (255,))
    im.putalpha(mask)
    return im


lockup = coverage(SRC / "logo.svg", 2070, 960)          # viewBox 138 x 64
tinted(lockup, "FFFFFF").save(OUT / "seer-lockup-white.png")
tinted(lockup, "59097E").save(OUT / "seer-lockup-deep.png")

star = coverage(SRC / "star.svg", 640, 580)             # viewBox 32 x 29
for name, col in {"white": "FFFFFF", "lav": "B38FFF", "lavlight": "DCC2FF", "primary": "9747FF", "pink": "CD61FF",
                  "mint": "2BD4A8", "cyan": "65CDE8"}.items():
    tinted(star, col).save(OUT / f"star-{name}.png")

# Raven mark: dark-purple bird and star, #8B52F6 ring, transparent ground.
raven = Image.open(SRC / "logo-alt.png").convert("RGBA")
raven = raven.crop(raven.getbbox())
raven.save(OUT / "raven-on-light.png")
px = raven.load()
for y in range(raven.height):
    for x in range(raven.width):
        r, g, b, a = px[x, y]
        if a and (r + g + b) / 3 < 115:   # the bird and its star: white on dark grounds, like the app icon
            px[x, y] = (255, 255, 255, a)
raven.save(OUT / "raven-on-dark.png")

for f in sorted(OUT.glob("*.png")):
    with Image.open(f) as im:
        print(f.name, im.size)
