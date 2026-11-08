"""Makes the PNG figures of the official papers (jee/, jee-adv/, neet/) smaller without changing a single pixel.

Run from the site folder after adding a paper's figures:  py tools/optimise_figures.py
(needs Pillow:  py -m pip install pillow)

Each figure is re-compressed at the highest PNG level; an image with 256 colours or fewer is also tried as an exact palette
image. The smaller file is kept only if it decodes to exactly the same pixels as the original and saves at least 10% (and 2 KB);
otherwise the original stays. (Re-encoding a figure that is already done can still find small gains each time, so the
10% keeps figures already done from being rewritten on every run.)
"""
import io
from pathlib import Path
from PIL import Image, ImageChops

site = Path(__file__).resolve().parent.parent

def pixels(im):
    return im.convert('RGBA')

def candidates(im):
    """PNG encodings of im to try, as bytes."""
    out = []
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True, compress_level=9); out.append(b.getvalue())
    rgba = pixels(im)
    colours = rgba.getcolors(256)
    if colours:
        pal = rgba.quantize(colors=len(colours), method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        b = io.BytesIO(); pal.save(b, 'PNG', optimize=True); out.append(b.getvalue())
    return out

before = after = changed = 0
for p in sorted(q for d in ('jee', 'jee-adv', 'neet') for q in (site / d).rglob('*.png')):
    raw = p.read_bytes()
    im = Image.open(io.BytesIO(raw)); im.load()
    ref = pixels(im)
    best = raw
    for data in candidates(im):
        if len(data) < len(best) and len(data) <= 0.9 * len(raw) and len(raw) - len(data) >= 2048:
            new = Image.open(io.BytesIO(data)); new.load()
            if new.size == ref.size and ImageChops.difference(pixels(new), ref).getbbox() is None:
                best = data
    before += len(raw); after += len(best)
    if best is not raw:
        p.write_bytes(best); changed += 1
print(f'{changed} figures made smaller: {before / 1024:.0f} KB -> {after / 1024:.0f} KB')
