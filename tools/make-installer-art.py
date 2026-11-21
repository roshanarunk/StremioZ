"""Draws the installer's welcome and header bitmaps (installer/*.bmp) from images/stremioz.png."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
root = sys.argv[1]
logo = Image.open(os.path.join(root, "images", "stremioz.png")).convert("RGBA")

def grad(w, h, c1, c2):
    g = Image.new("RGB", (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x * 0.3 + y * 0.7) / (w * 0.3 + h * 0.7)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return g

def font(size):
    for f in ("segoeuib.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", f), size)
        except OSError:
            pass
    return ImageFont.load_default()

# Welcome / finish page: 164x314
w = grad(164, 314, (40, 22, 92), (14, 10, 30))
l = logo.resize((96, 96), Image.LANCZOS)
w.paste(l, (34, 70), l)
d = ImageDraw.Draw(w)
d.text((82, 190), "StremioZ", font=font(22), fill=(255, 255, 255), anchor="mm")
d.text((82, 216), "for the couch", font=font(12), fill=(185, 166, 255), anchor="mm")
w.save(os.path.join(root, "installer", "welcome.bmp"))

# Header: 150x57, white background like the default MUI header
h = Image.new("RGB", (150, 57), (255, 255, 255))
l = logo.resize((44, 44), Image.LANCZOS)
h.paste(l, (100, 6), l)
h.save(os.path.join(root, "installer", "header.bmp"))
