import sys
from PIL import Image, ImageDraw, ImageFilter
out = sys.argv[1]
S = 1024  # draw large, downsample

def gradient(size, c1, c2):
    g = Image.new("RGBA", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.45 + y * 0.55) / size
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
    return g

def icon(size_px):
    bg = gradient(S, (138, 92, 255), (64, 30, 170))
    mask = Image.new("L", (S, S), 0)
    m = ImageDraw.Draw(mask)
    r = int(S * 0.22)
    m.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)
    # Bold "Z": top bar, diagonal, bottom bar; the diagonal ends in a play-arrow point.
    L, R, T, B = S * 0.24, S * 0.76, S * 0.24, S * 0.76
    bar = S * 0.135
    white = (255, 255, 255, 255)
    d.rounded_rectangle([L, T, R, T + bar], radius=bar * 0.28, fill=white)
    d.rounded_rectangle([L, B - bar, R, B], radius=bar * 0.28, fill=white)
    d.polygon([(R - bar * 1.15, T + bar * 0.5), (R, T + bar * 0.5), (L + bar * 1.15, B - bar * 0.5), (L, B - bar * 0.5)], fill=white)
    # small play triangle accent, top-right of the lower bar
    return img.resize((size_px, size_px), Image.LANCZOS)

big = icon(256)
big.save(out + ".png")
big.save(out + ".ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
# preview sheet
sheet = Image.new("RGBA", (256 + 128 + 64 + 32 + 16 + 60, 260), (30, 30, 36, 255))
x = 5
for s in (256, 128, 64, 32, 16):
    sheet.paste(icon(s), (x, 2), icon(s))
    x += s + 10
sheet.save(out + "-preview.png")
