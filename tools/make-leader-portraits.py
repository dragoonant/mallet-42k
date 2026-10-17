"""Builds 256x256 leader portraits for the start-screen army pickers.

Usage: python tools/make-leader-portraits.py
Crops each concept to the figure (non-near-white bbox), keeps the upper ~70% (head + torso),
pads to a white square and saves public/assets/ui/leaders/<faction-id>.webp.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "unit-concepts"
OUT = ROOT / "public" / "assets" / "ui" / "leaders"
KEEP = 0.70
THRESH = 235   # a figure pixel must be darker than near-white in some channel
DIFF = 30      # ...and differ from the border colour by this much

LEADERS = {
    "space-marines": "captain-octavius.png",
    "orks": "warboss-gordrang.png",
    "necrons": "necron-overlord.jpeg",
    "adepta-sororitas": "canoness-adalya.png",
    "adeptus-custodes": "shield-captain-tyvan.png",
    "astra-militarum": "lord-marshal-karsk.png",
    "genestealer-cults": "magus-veridielle.png",
    "grey-knights": "librarian-aurellios.png",
    "chaos-space-marines": "terror-of-vardenghast.png",
    "tau-empire": "shasnel-dtano.png",
    # Stand-in until a Winged Prime concept exists.
    "tyranids": "psychophage.png",
    "adeptus-mechanicus": "enginseer-verask.png",
    "aeldari": "farseer-iraneth.png",
    "black-templars": "marshal-siguard.png",
    "blood-angels": "librarian-marcellos.png",
    "chaos-daemons": "khharret.png",
    "dark-angels": "chaplain-mordekai.png",
    "death-guard": "typhus.png",
    "deathwatch": "lieutenant-alphion.png",
    "drukhari": "archon.png",
    "leagues-of-votann": "kahl-warspeke.png",
    "space-wolves": "battle-leader-thoryk.png",
    "thousand-sons": "ahrak-the-time-weaver.png",
    "world-eaters": "karagar-the-blooded.png",
}

# Per-faction tweaks: (keep fraction of height, (left, right) fraction of the figure width to keep).
# The Terror of Vardenghast has a huge wingspan, so only its central body is kept.
# Wide weapons/staves would shrink these figures, so crop to the body.
TWEAKS = {
    "chaos-space-marines": (0.95, (0.30, 0.70)),
    "blood-angels": (0.75, (0.30, 1.0)),
    "aeldari": (0.75, (0.20, 0.85)),
    "drukhari": (0.75, (0.25, 1.0)),
    "death-guard": (0.75, (0.20, 1.0)),
}

OUT.mkdir(parents=True, exist_ok=True)
for fid, name in LEADERS.items():
    im = Image.open(SRC / name)
    if im.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    im = im.convert("RGB")
    a = np.asarray(im)
    # Background = median of the border pixels; figure = pixels clearly different from it.
    edge = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bgc = np.median(edge, axis=0)
    mask = (np.abs(a.astype(int) - bgc).max(axis=2) > DIFF) & (a < THRESH).any(axis=2)
    m = int(min(a.shape[:2]) * 0.01)
    mask[:m] = mask[-m:] = False
    mask[:, :m] = mask[:, -m:] = False
    ys, xs = np.where(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    keep, (xl, xr) = TWEAKS.get(fid, (KEEP, (0.0, 1.0)))
    x0, x1 = x0 + int((x1 - x0) * xl), x0 + int((x1 - x0) * xr)
    y1 = y0 + int((y1 - y0) * keep)
    crop = im.crop((x0, y0, x1, y1))
    w, h = crop.size
    pad = int(max(w, h) * 0.06)
    s = max(w, h) + 2 * pad
    sq = Image.new("RGB", (s, s), tuple(int(v) for v in bgc))
    sq.paste(crop, ((s - w) // 2, (s - h) // 2))
    sq = sq.resize((256, 256), Image.LANCZOS)
    p = OUT / f"{fid}.webp"
    sq.save(p, "WEBP", quality=80)
    print(fid, p.stat().st_size)
