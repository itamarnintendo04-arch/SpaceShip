# SpaceShip Dev: stamps a "DEV" ribbon on the app icon sources (assets/icon-*.png) before the icons are generated.
# Used only by the development build (.github/workflows/dev.yml), never committed back.
from PIL import Image, ImageDraw, ImageFont
import glob

def font(size):
    for f in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()

for path in ['assets/icon-only.png', 'assets/icon-foreground.png']:
    try: im = Image.open(path).convert('RGBA')
    except FileNotFoundError: continue
    w, h = im.size
    band = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(band)
    y0, y1 = int(h * 0.62), int(h * 0.80)          # inside the safe area of rounded / adaptive icons
    d.rectangle([0, y0, w, y1], fill=(234, 88, 12, 235))
    f = font(int((y1 - y0) * 0.72)); t = 'DEV'
    tw = d.textlength(t, font=f)
    d.text(((w - tw) / 2, y0 + (y1 - y0) * 0.1), t, font=f, fill=(255, 255, 255, 255))
    Image.alpha_composite(im, band).save(path)
    print('dev icon:', path)
