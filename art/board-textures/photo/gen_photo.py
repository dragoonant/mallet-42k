#!/usr/bin/env python3
"""Seeded deterministic generator: battle-scarred photo-PBR board textures (P1..P6).
Usage: python3 gen_photo.py [P1 P2 ...]   (default all)"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = os.path.dirname(os.path.abspath(__file__)) + '/'
# Poly Haven (CC0) 2k source photos, fetched on first run; .cache/ is gitignored.
PH = OUT + '.cache/'
W, H = 2048, 1396
PPI = W / 44.0

# slug, asset, target mean rgb, tile inches, crater count, damage strength, contrast
VARIANTS = {
 1: ('aerialrock', 'aerial_ground_rock',  (0.43, 0.37, 0.30), 12.0, 14, 1.0, 1.0),
 2: ('dirt',       'dirt_aerial_02',      (0.36, 0.29, 0.21), 12.5, 15, 1.0, 1.0),
 3: ('dryrocks',   'dry_ground_rocks',    (0.46, 0.41, 0.34), 11.5, 13, 1.0, 1.0),
 4: ('rocks08',    'rocks_ground_08',     (0.40, 0.375, 0.34), 12.0, 14, 1.0, 1.0),
 5: ('crackmud',   'mud_cracked_dry_03',  (0.52, 0.45, 0.31), 13.0, 12, 1.0, 1.0),
 6: ('laterite',   'red_laterite_soil_stones', (0.46, 0.25, 0.17), 12.0, 14, 1.0, 1.0),
}

def noise(rng, sigma, shape=(H, W)):
    n = gaussian_filter(rng.standard_normal(shape).astype(np.float32), sigma, mode='wrap')
    return n / (n.std() + 1e-8)

def fbm(rng, sigmas, weights=None, shape=(H, W)):
    weights = weights or [1.0 / (i + 1) for i in range(len(sigmas))]
    out = sum(w * noise(rng, s, shape) for s, w in zip(sigmas, weights))
    return out / (np.sqrt(sum(w * w for w in weights)))

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def fetch_photo(asset):
    import json, urllib.request
    os.makedirs(PH, exist_ok=True)
    files = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{asset}'))
    for k, key in [('diff', 'Diffuse'), ('nor', 'nor_gl'), ('rough', 'Rough'), ('disp', 'Displacement')]:
        if key in files and '2k' in files[key]:
            f = files[key]['2k']; urllib.request.urlretrieve((f.get('jpg') or f.get('png'))['url'], f'{PH}2k_{asset}_{k}.jpg')

def load_photo(asset, tile_in):
    S = int(round(tile_in * PPI))
    def ld(k):
        path = f'{PH}2k_{asset}_{k}.jpg'
        if not os.path.exists(path):
            fetch_photo(asset)
        return Image.open(path)
    d = np.asarray(ld('diff').convert('RGB').resize((S, S), Image.LANCZOS), np.float32) / 255
    d = d / np.maximum(gaussian_filter(d, (S / 9, S / 9, 0), mode='wrap') / d.mean((0, 1)), 0.2) ** 0.85
    n = np.asarray(ld('nor').convert('RGB').resize((S, S), Image.LANCZOS), np.float32) / 255 * 2 - 1
    for i in (0, 1):
        n[..., i] -= gaussian_filter(n[..., i], 40, mode='wrap')
    n[..., 2] = np.maximum(n[..., 2], 0.05)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    r = np.asarray(ld('rough').convert('L').resize((S, S), Image.LANCZOS), np.float32) / 255
    return d, n, r

def sample_layer(d, n, r, angle, off):
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    c, s = math.cos(angle), math.sin(angle)
    u = c * xs - s * ys + off[0]
    v = s * xs + c * ys + off[1]
    coords = np.stack([v, u])
    def smp(a):
        return map_coordinates(a, coords, order=1, mode='grid-wrap')
    D = np.stack([smp(d[..., i]) for i in range(3)], -1)
    N = np.stack([smp(n[..., i]) for i in range(3)], -1)
    R = smp(r)
    # rotate normal xy (image-space vec = (nx,-ny)) by R^T
    vx, vy = N[..., 0], -N[..., 1]
    wx = c * vx + s * vy
    wy = -s * vx + c * vy
    N = np.stack([wx, -wy, N[..., 2]], -1)
    return D, N, R

def base_board(rng, asset, tile_in, target, contrast):
    d, n, r = load_photo(asset, tile_in)
    mean = d.mean((0, 1))
    gain = np.array(target, np.float32) / mean
    # layer A: slight rotation; layer B: second scale, rotated, offset
    DA, NA, RA = sample_layer(d, n, r, math.radians(rng.uniform(-4, 4)), rng.uniform(0, d.shape[0], 2))
    d2, n2, r2 = load_photo(asset, tile_in * 1.27)
    DB, NB, RB = sample_layer(d2, n2, r2, math.radians(rng.uniform(25, 55)), rng.uniform(0, d2.shape[0], 2))
    m = smooth(-0.35, 0.35, fbm(rng, [60, 140, 300], [1, 1, 1]))[..., None]
    m = m * 0.85  # layer A dominant
    D = DA * (1 - m) + DB * m
    N = NA * (1 - m) + NB * m
    N /= np.linalg.norm(N, axis=2, keepdims=True)
    R = RA * (1 - m[..., 0]) + RB * m[..., 0]
    # tone: per-channel gain toward target, contrast around the mean
    D = D * gain
    mu = D.mean((0, 1))
    D = mu + (D - mu) * contrast
    # low-frequency colour/brightness variation (breaks repetition)
    lf1 = fbm(rng, [220, 90], [1, 0.7])
    lf2 = fbm(rng, [160, 60], [1, 0.6])
    lf3 = fbm(rng, [180], [1])
    D = D * (1 + 0.10 * lf1)[..., None]
    D = D * np.stack([1 + 0.05 * lf2, 1 + 0.0 * lf2, 1 - 0.06 * lf2 + 0.02 * lf3], -1)
    return np.clip(D, 0, 1), N, np.clip(R, 0, 1)

# ---------------------------------------------------------------- damage
def ang_noise(rng, kmin=2, kmax=9, amp=0.09):
    ks = np.arange(kmin, kmax + 1)
    a = amp * rng.uniform(0.4, 1, len(ks)) / np.sqrt(ks - kmin + 1)
    ph = rng.uniform(0, 2 * np.pi, len(ks))
    return lambda th: sum(ai * np.cos(k * th + p) for ai, k, p in zip(a, ks, ph))

def streak_fn(rng, n=160, sharp=2.2):
    arr = gaussian_filter(rng.standard_normal(n), 1.6, mode='wrap')
    arr = (arr - arr.min()) / (arr.max() - arr.min())
    arr = arr ** sharp
    arr /= arr.max()
    def f(th):
        t = (th / (2 * np.pi) % 1.0) * n
        i0 = np.floor(t).astype(int) % n
        fr = t - np.floor(t)
        return arr[i0] * (1 - fr) + arr[(i0 + 1) % n] * fr
    return f

def place_craters(rng, count):
    cs = []
    tries = 0
    while len(cs) < count and tries < 5000:
        tries += 1
        diam = 1.0 + 5.0 * rng.random() ** 1.4
        r = diam / 2
        x = rng.uniform(-22, 22); y = rng.uniform(-15, 15)
        # keep the centre readable: no big craters in the central zone
        if abs(x) < 8 and abs(y) < 5.5 and r > 0.9:
            continue
        if any(math.hypot(x - c[0], y - c[1]) < (r + c[2]) * 1.9 for c in cs):
            continue
        cs.append((x, y, r))
    return cs

def build_damage(rng, strength, count):
    Hf = np.zeros((H, W), np.float32)      # height (inches)
    S = np.zeros((H, W), np.float32)       # scorch mask
    Fm = np.zeros((H, W), np.float32)      # crater floor mask (churned)
    E = np.zeros((H, W), np.float32)       # fresh ejecta mask
    Nz = fbm(rng, [5, 12, 28], [0.5, 1, 1])
    Ner = fbm(rng, [5, 12, 30], [1, 1, 0.8])
    craters = place_craters(rng, count)
    info = []

    def crater(cx_in, cy_in, r_in, with_bowl=True, sev=1.0, bloom=1.0):
        R = r_in * PPI
        cx = W / 2 + cx_in * PPI; cy = H / 2 + cy_in * PPI
        ext = int(R * 3.6) + 6
        x0, x1 = max(0, int(cx - ext)), min(W, int(cx + ext))
        y0, y1 = max(0, int(cy - ext)), min(H, int(cy + ext))
        if x1 <= x0 or y1 <= y0:
            return
        ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dx, dy = xs - cx, ys - cy
        # ellipse stretch
        a = rng.uniform(0, np.pi); st = rng.uniform(0.0, 0.16)
        ca, sa = math.cos(a), math.sin(a)
        px = (ca * dx + sa * dy) * (1 + st); py = (-sa * dx + ca * dy) / (1 + st)
        dist = np.hypot(px, py)
        th = np.arctan2(py, px)
        reff = R * (1 + ang_noise(rng)(th))
        nz = Nz[y0:y1, x0:x1]; ne = Ner[y0:y1, x0:x1]
        d = dist / reff + 0.035 * nz
        d = np.clip(d, 0, None)
        streak = streak_fn(rng)(th)
        streak2 = streak_fn(rng, 90, 1.6)(th)
        rimvar = 0.65 + 0.7 * (0.5 + 0.5 * ang_noise(rng, 1, 4, 0.6)(th))
        h = np.zeros_like(d)
        if with_bowl:
            D = 0.16 * r_in * strength
            bowl = -D * np.clip(1 - d ** 2, 0, 1) ** 0.85
            rim = 0.12 * r_in * np.exp(-((d - 1.0) / 0.24) ** 2) * rimvar
            ej = 0.06 * r_in * streak * np.exp(-(d - 1.0) / 0.8) * smooth(0.95, 1.2, d) * (d < 3.4)
            h = bowl + rim + ej + 0.0025 * nz * smooth(1.0, 0.5, d)
            fl = smooth(1.08, 0.55, d) * (0.85 + 0.15 * np.clip(ne, -1, 1))
            Fm[y0:y1, x0:x1] = np.maximum(Fm[y0:y1, x0:x1], np.clip(fl, 0, 1))
            en = streak * (0.5 + 0.5 * streak2) * np.exp(-(d - 1.0) / 0.9) * smooth(0.9, 1.25, d) * (d < 3.4) * (0.6 + 0.4 * (ne > -0.6))
            E[y0:y1, x0:x1] = np.maximum(E[y0:y1, x0:x1], np.clip(en, 0, 1))
            Hf[y0:y1, x0:x1] += h
        # scorch bloom (also used standalone)
        bs = (0.8 + 0.4 * streak2) * bloom
        sc = np.exp(-(d / bs) ** 1.7) * 1.0 * sev
        sc = sc - 0.5 * (0.5 + 0.5 * np.clip(ne, -2, 2) * 0.7) * smooth(0.2, 1.4, d)
        sc = smooth(0.0, 0.6, sc)
        S[y0:y1, x0:x1] = 1 - (1 - S[y0:y1, x0:x1]) * (1 - sc)

    for (x, y, r) in craters:
        crater(x, y, r, True, sev=rng.uniform(0.6, 1.1), bloom=rng.uniform(0.8, 1.3))
        info.append((x, y, r))
    # standalone scorch blooms
    for _ in range(int(rng.integers(3, 6))):
        for _t in range(50):
            x = rng.uniform(-21, 21); y = rng.uniform(-14, 14)
            if abs(x) < 7 and abs(y) < 5: continue
            if all(math.hypot(x - c[0], y - c[1]) > c[2] * 2.5 + 3 for c in craters): break
        crater(x, y, rng.uniform(0.9, 2.0), False, sev=rng.uniform(0.6, 0.9), bloom=rng.uniform(1.0, 1.5))
    # tracks: 1-2 subtle double ruts along wobbly paths
    tr = np.zeros((H, W), np.float32)
    for _ in range(int(rng.integers(1, 3))):
        p0 = np.array([rng.uniform(-22, 22), rng.uniform(-15, 15)])
        ang = rng.uniform(0, 2 * np.pi)
        L = rng.uniform(25, 45)
        t = np.linspace(0, L, 700)
        wob = np.cumsum(gaussian_filter(rng.standard_normal(700), 25)) * 0.06
        wob = wob - wob.mean() * 0
        dirv = np.stack([np.cos(ang + wob / 6), np.sin(ang + wob / 6)], 1)
        pts = p0 + np.cumsum(dirv, 0) * (L / 700)
        im = Image.new('F', (W, H), 0.0); dr = ImageDraw.Draw(im)
        nrm = np.stack([-dirv[:, 1], dirv[:, 0]], 1)
        for side in (-1, 1):
            q = pts + nrm * side * 0.85
            xy = [(W / 2 + a_ * PPI, H / 2 + b_ * PPI) for a_, b_ in q]
            dr.line(xy, fill=1.0, width=max(2, int(0.55 * PPI)))
        m = gaussian_filter(np.asarray(im), 2.5)
        m *= 0.55 + 0.45 * smooth(-0.8, 0.6, fbm(rng, [10, 30]))
        tr = np.maximum(tr, m)
    Hf -= 0.035 * tr
    S = np.clip(S + 0.18 * tr * (1 - S), 0, 1)
    Fm = np.maximum(Fm, 0.35 * tr)
    # shrapnel scatter: tiny pits + dark specks clustered around some craters
    sh = np.zeros((H, W), np.float32)
    for (x, y, r) in info:
        if rng.random() < 0.6:
            n = int(rng.integers(10, 40))
            for _ in range(n):
                a = rng.uniform(0, 2 * np.pi); rr = r * rng.uniform(1.2, 3.2)
                px = int(W / 2 + (x + rr * math.cos(a)) * PPI); py = int(H / 2 + (y + rr * math.sin(a)) * PPI)
                if 2 <= px < W - 2 and 2 <= py < H - 2:
                    sh[py, px] = rng.uniform(0.5, 1.0)
    sh = np.clip(gaussian_filter(sh, 1.1) * 14, 0, 1)
    Hf -= 0.01 * sh
    return Hf, np.clip(S, 0, 1), np.clip(Fm, 0, 1), np.clip(E, 0, 1), np.clip(sh, 0, 1), info

def height_to_normal(Hf, k=1.0):
    gy, gx = np.gradient(Hf * PPI)   # inches per inch (slope)
    n = np.stack([-gx * k, gy * k, np.ones_like(Hf)], -1)   # image rows down -> green up = +d/drow
    return n / np.linalg.norm(n, axis=2, keepdims=True)

def whiteout(n1, n2):
    xy = n1[..., :2] + n2[..., :2]
    z = n1[..., 2] * n2[..., 2]
    n = np.dstack([xy, z])
    return n / np.linalg.norm(n, axis=2, keepdims=True)

def lum(c):
    return (c * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1)

def build(n):
    slug, asset, target, tile, count, strength, contrast = VARIANTS[n]
    rng = np.random.default_rng(4200 + n)
    cf = f'{PH}base{n}.npz'
    if os.path.exists(cf) and os.environ.get('CACHE'):
        z = np.load(cf); D, N, R = z['D'], z['N'], z['R']
        base_board_rng_skip = True
    else:
        D, N, R = base_board(rng, asset, tile, target, contrast)
        np.savez(cf, D=D, N=N, R=R)
    rng = np.random.default_rng(9100 + n)
    Hf, S, Fm, E, sh, info = build_damage(rng, strength, count)

    # cavity / AO from the height field
    cav = gaussian_filter(Hf, 5) - Hf
    ao = np.clip(1 - 9 * np.clip(cav, 0, None), 0.55, 1) + np.clip(-cav, 0, None) * 4
    ao = np.clip(ao, 0.55, 1.12)

    L = lum(D)[..., None]
    col = D.copy()
    # churned floor: darker, cooler-brown, desaturated, photo detail kept
    churn = L * np.array([0.78, 0.68, 0.58], np.float32) * 0.9
    col = col * (1 - 0.55 * Fm[..., None]) + churn * (0.55 * Fm[..., None]) * 0.85
    col = col * (1 - 0.25 * Fm[..., None])
    # fresh ejecta: slightly lighter, warmer, dry
    col = col * (1 + 0.45 * E[..., None] * np.array([1.0, 0.95, 0.85], np.float32))
    # scorch: charcoal retaining photo detail, ash fringe at its edge
    Ls = lum(col)[..., None]
    char = (0.085 + 0.42 * Ls) * np.array([1.0, 0.97, 0.94], np.float32)
    ash = (0.12 + 0.55 * Ls) * np.array([0.95, 0.95, 0.93], np.float32)
    band = (S * (1 - S) * 4)[..., None]
    col = col * (1 - 0.28 * band) + ash * (0.28 * band)
    col = col * (1 - 0.8 * S[..., None]) + char * (0.8 * S[..., None])
    col = col * (1 - 0.7 * sh[..., None])
    col = np.clip(col * ao[..., None], 0, 1)

    # normal
    nd = height_to_normal(Hf, 1.0)
    # add small-scale churn bump on floors/scorch from noise
    Nout = whiteout(N, nd)

    # roughness
    Rr = R - 0.12 * S * (1 - E) + 0.13 * E + 0.05 * Fm
    Rr = np.clip(Rr, 0.05, 1)

    # hillshade preview
    el = math.radians(35); az = math.radians(135)  # light from upper-left: -x, +y(up)
    Ld = np.array([-math.cos(el) * math.cos(math.radians(45)), math.cos(el) * math.sin(math.radians(45)), math.sin(el)], np.float32)
    shade = (Nout * Ld).sum(-1) / Ld[2]
    shade = np.clip(shade, 0.15, 1.9)
    prev = np.clip(col * (0.25 + 0.75 * np.clip(shade, 0, 2))[..., None] * 1.0, 0, 1)

    tag = f'P{n}-{slug}'
    def sv(a, name, q=90):
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(OUT + name, quality=q, subsampling=0)
    sv(col, f'{tag}-diff.jpg'); sv((Nout * 0.5 + 0.5), f'{tag}-nor.jpg'); sv(Rr, f'{tag}-rough.jpg'); sv(prev, f'{tag}-preview.jpg', 92)
    print(tag, 'craters', len(info), 'mean', col.mean((0, 1)).round(3), flush=True)
    big = max(info, key=lambda c: c[2])
    return tag, big

def sheets(results):
    font = ImageFont.load_default(size=22) if hasattr(ImageFont, 'load_default') else None
    tw = 900; th = int(tw * H / W); lab = 32
    sheet = Image.new('RGB', (tw * 3, (th + lab) * 2), (20, 20, 20))
    cw = 512
    clo = Image.new('RGB', (cw * 3, (cw + lab) * 2), (20, 20, 20))
    for i, (tag, big) in enumerate(results):
        r, c = divmod(i, 3)
        pv = Image.open(OUT + tag + '-preview.jpg')
        sheet.paste(pv.resize((tw, th), Image.LANCZOS), (c * tw, r * (th + lab) + lab))
        ImageDraw.Draw(sheet).text((c * tw + 8, r * (th + lab) + 4), tag, fill=(255, 255, 255), font=font)
        cx = int(W / 2 + big[0] * PPI); cy = int(H / 2 + big[1] * PPI)
        x0 = int(np.clip(cx - cw // 2, 0, W - cw)); y0 = int(np.clip(cy - cw // 2, 0, H - cw))
        clo.paste(pv.crop((x0, y0, x0 + cw, y0 + cw)), (c * cw, r * (cw + lab) + lab))
        ImageDraw.Draw(clo).text((c * cw + 8, r * (cw + lab) + 4), f'{tag} (crater d={2*big[2]:.1f}")', fill=(255, 255, 255), font=font)
    sheet.save(OUT + 'contact-sheet.jpg', quality=90)
    clo.save(OUT + 'closeups.jpg', quality=92)

if __name__ == '__main__':
    ids = [int(a.lstrip('Pp')) for a in sys.argv[1:]] or list(VARIANTS)
    res = [build(n) for n in ids]
    if len(ids) == 6:
        sheets(res)
