#!/usr/bin/env python3
"""Mallet 42k ground mats: baked 2048x1396 albedo/normal/roughness per battlefield (grimdark ruined city).
Technique ported from the whirr-machine board generator: Poly Haven CC0 photos de-tiled (two scales blended
by a noise mask through an fBm domain warp, Lanczos prefilter), big colour blotches flattened, then FFT-noise
features (rubble dust, scorch, flagstone/rockcrete patches with Voronoi cracks, puddles, crater ash) edit
albedo / height / roughness. Deterministic. Run fetch.py first.
Usage: python gen_mats.py [slug ...]   -> public/assets/terrain/battlefield/<slug>/{diff,nor,rough}.jpg + preview.jpg"""
import sys, os, io, numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from PIL import Image, ImageFile
ImageFile.MAXBLOCK = 1 << 26

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'terrain', 'battlefield')
PH = os.environ.get('PH_DIR', os.path.join(HERE, '.cache'))
W, H = 2048, 1396          # 44" x 30" at ~46.5 px/in, square texels
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
FX = np.fft.fftfreq(W)[None, :].astype(np.float32)
FY = np.fft.fftfreq(H)[:, None].astype(np.float32) * (W / H)   # isotropic in pixels
FR = np.sqrt(FX**2 + FY**2); FR[0, 0] = 1


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def norm(n):
    n = n - n.mean(); return (n / (n.std() + 1e-9)).astype(np.float32)


def fbm(seed, period=200, p=1.6):
    spec = np.fft.fft2(np.random.default_rng(seed).standard_normal((H, W)).astype(np.float32))
    amp = FR ** -p * (1 / (1 + (1.0 / period / FR) ** 4)); amp[0, 0] = 0
    return norm(np.fft.ifft2(spec * amp).real)


def blobs(seed, period, thresh, soft=0.35):
    return ss(thresh - soft, thresh + soft, fbm(seed, period * 1.7, 3.2))


def gblur(a, s): return ndi.gaussian_filter(a, s)
def col(r, g, b): return np.array([r, g, b], np.float32)


def mix(a, b, m):
    if a.ndim == 3 and m.ndim == 2: m = m[..., None]
    return a * (1 - m) + b * m


def tint(D, mul, sat=1.0, gain=1.0):
    g = D.mean(-1, keepdims=True); D = g + (D - g) * sat
    return np.clip(D * np.array(mul, np.float32) * gain, 0, 1)


def soften(D, k):
    m = D.mean((0, 1), keepdims=True); return m + (D - m) * (1 - k)


def load(name):
    d = lambda k: np.asarray(Image.open(os.path.join(PH, f'{name}_{k}.jpg')).convert('RGB'), np.float32) / 255
    return d('diff'), d('nor'), d('rough')[..., 0]


def shrink(a, m):
    if a.ndim == 2: return shrink(a[..., None].repeat(3, -1), m)[..., 0]
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((m, m), Image.LANCZOS), np.float32) / 255


def layer(name, seed, scale=1.0, warpamp=8):
    """Photo repeated `scale` times across the 44" width, sampled at two scales, noise-blended, domain-warped."""
    full = load(name); out = []
    for i, s in enumerate((scale, scale * 1.37)):
        m = max(64, int(round(W / s)))
        diff, nor, rough = (shrink(a, m) for a in full) if m < full[0].shape[0] else full
        m = diff.shape[0]
        rng = np.random.default_rng(seed + i); oy, ox = rng.uniform(0, m, 2)
        wx = fbm(seed + 20 + i, 260, 2.0) * warpamp; wy = fbm(seed + 30 + i, 260, 2.0) * warpamp
        c = [((YY + wy) * (s * m / W) + oy) % m, ((XX + wx) * (s * m / W) + ox) % m]
        smp = lambda a: ndi.map_coordinates(a, c, order=1, mode='grid-wrap')
        out.append((np.stack([smp(diff[..., k]) for k in range(3)], -1),
                    np.stack([smp(nor[..., k]) for k in range(2)], -1) - 0.5, smp(rough)))
    m = blobs(seed + 50, 380, 0.0, 0.6)
    D = mix(out[0][0], out[1][0], m); Nn = mix(out[0][1], out[1][1], m); R = out[0][2] * (1 - m) + out[1][2] * m
    lum = D.mean(-1); D = D * (lum.mean() / (gblur(lum, 80) + 1e-3))[..., None] ** 0.9
    return np.clip(D, 0, 1), Nn, R


def voronoi_edges(seed, n, warp=0.0, wper=150):
    pts = np.random.default_rng(seed).uniform(0, 1, (n, 2)) * [W, H]
    qx, qy = XX, YY
    if warp: qx = XX + fbm(seed + 1, wper, 2.0) * warp; qy = YY + fbm(seed + 2, wper, 2.0) * warp
    d, _ = cKDTree(pts).query(np.stack([qx.ravel(), qy.ravel()], 1), k=2, workers=-1)
    return (d[:, 1] - d[:, 0]).reshape(H, W).astype(np.float32)


def craters(seed, n, rmin, rmax):
    """Blast craters: returns (bowl, rim, ash) masks; radii in px."""
    rng = np.random.default_rng(seed)
    bowl = np.zeros((H, W), np.float32); rim = bowl.copy(); ash = bowl.copy()
    wob = fbm(seed + 1, 40, 1.5)
    for _ in range(n):
        cx, cy = rng.uniform(80, W - 80), rng.uniform(80, H - 80); r = rng.uniform(rmin, rmax)
        x0, x1 = int(max(cx - r * 3, 0)), int(min(cx + r * 3, W)); y0, y1 = int(max(cy - r * 3, 0)), int(min(cy + r * 3, H))
        d = np.hypot(XX[y0:y1, x0:x1] - cx, YY[y0:y1, x0:x1] - cy) / r + 0.12 * wob[y0:y1, x0:x1]
        bowl[y0:y1, x0:x1] = np.maximum(bowl[y0:y1, x0:x1], 1 - ss(0.5, 1.0, d))
        rim[y0:y1, x0:x1] = np.maximum(rim[y0:y1, x0:x1], np.exp(-((d - 1.05) / 0.2) ** 2))
        ash[y0:y1, x0:x1] = np.maximum(ash[y0:y1, x0:x1], (1 - ss(0.9, 3.0, d)) * 0.9)
    return bowl, rim, ash


def save(a, path, limit=880, gray=False):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    if gray: im = im.convert('L')
    for q in (92, 88, 84, 80, 76, 72, 68, 62, 56, 50, 44):
        b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, subsampling=0 if q > 85 else 2)
        if b.tell() <= limit * 1000: break
    open(path, 'wb').write(b.getvalue()); print(path, b.tell() // 1000, 'KB q', q, flush=True)


def finish(alb, Nn, rough, h, strength, slug, vig=0.10):
    r = np.hypot(XX / W - .5, (YY / H - .5) * 0.68) * 2
    alb = alb * (1 - vig * ss(0.55, 1.2, r))[..., None]
    gx = np.gradient(h, axis=1); gy = np.gradient(h, axis=0)
    k = (strength / 120) / (np.percentile(np.hypot(gx, gy), 95) + 1e-6)   # fixed 95th-percentile tilt (no flat-normal camo)
    nx = gblur(1.4 * Nn[..., 0] - gx * k, 1.0); ny = gblur(1.4 * Nn[..., 1] + gy * k, 1.0)
    nz = np.sqrt(np.clip(1 - nx ** 2 - ny ** 2, 0.05, 1))
    n3 = np.stack([nx, ny, nz], -1); n3 /= np.linalg.norm(n3, axis=-1, keepdims=True)
    d = os.path.join(OUT, slug); os.makedirs(d, exist_ok=True)
    save(alb, os.path.join(d, 'diff.jpg')); save(n3 * 0.5 + 0.5, os.path.join(d, 'nor.jpg'), 900)
    save(np.clip(rough, 0, 1), os.path.join(d, 'rough.jpg'), 800, gray=True)


def slab_pattern(seed, cell=74, ang=0.12):
    """Rectilinear paving: per-slab ids rotated by `ang`. Returns (gap line mask, slab id hash, slab-local 0..1 u,v)."""
    c, sn = np.cos(ang), np.sin(ang)
    u = (XX * c + YY * sn) / cell; v = (-XX * sn + YY * c) / cell
    iu, iv = np.floor(u), np.floor(v); fu, fv = u - iu, v - iv
    hsh = ((np.sin(iu * 127.1 + iv * 311.7 + seed) * 43758.5453) % 1.0).astype(np.float32)
    jit = 0.02 * fbm(seed, 30, 1.5)
    gap = 1 - ss(0.01, 0.11, np.minimum.reduce([fu, 1 - fu, fv, 1 - fv]) + jit)
    return gap, hsh


def ruined(slug, seed, base, base2, scale, base_tint, fl):
    """Shared grimdark ruined-city recipe; `fl` tunes the features per battlefield. Large-scale variation stays gentle."""
    s = seed
    A = layer(base, s, scale); B = layer(base2, s + 100, scale * 0.8)
    F = layer('cobblestone_floor_08', s + 200, 2.4)          # slab grain
    AP = layer('burned_ground_01', s + 300, 4.0)
    mixm = blobs(s + 3, 300, 0.1, 0.6)
    D = mix(tint(soften(A[0], 0.1), *base_tint), tint(soften(B[0], 0.15), *base_tint), mixm * 0.5)
    Nn = mix(A[1], B[1], mixm[..., None] * 0.5); R = mix(A[2], B[2], mixm * 0.5)
    h = gblur(fbm(s + 4, 90, 2.0), 3) * 0.4
    lowfreq = 1 + 0.07 * fbm(s + 6, 400, 2.0)               # gentle +-10% large-scale value drift
    D = D * lowfreq[..., None]
    # paved patches: few, large, eroded borders, tinted toward the ground colour
    big = fbm(s + 5, 520, 3.0) + 0.35 * fbm(s + 7, 60, 1.6)
    reg = ss(fl['slab'], fl['slab'] + 0.5, big + 0.0)
    gap, hs = slab_pattern(s + 8)
    present = ss(0.14, 0.2, hs)                              # ~15% of slabs missing -> broken up
    pav = reg * present
    gv = ss(0.0, 1.0, gblur(F[0].mean(-1), 1.2) / (F[0].mean() + 1e-3) * 0.5)
    base_mean = D.mean((0, 1))
    gm = base_mean.mean(); slab_col = ((base_mean * 0.6 + gm * 0.4) * np.array(fl['slab_tint'], np.float32) * 1.0)[None, None] * (0.85 + 0.3 * (F[0].mean(-1, keepdims=True) / (F[0].mean() + 1e-3)) * 0.5 + 0.3 * (hs - 0.5)[..., None])
    D = mix(D, slab_col, pav * 0.92); Nn = mix(Nn, F[1], (pav * 0.7)[..., None]); R = mix(R, F[2] * 0.9 + 0.06, pav * 0.8)
    h = h + pav * 0.35 - gap * reg * 0.5
    D = D * (1 - gap * reg * present * 0.4)[..., None]
    e1 = voronoi_edges(s + 10, 220, 25, 140)
    crack = np.exp(-(np.clip(e1 - 1, 0, None) / 1.8) ** 2) * pav * blobs(s + 12, 160, 0.0, 0.5)
    D = D * (1 - crack * 0.5)[..., None]; h = h - crack * 0.5
    # rubble dust
    dust = blobs(s + 20, 150, fl['dust'], 0.5) * (0.45 + 0.55 * ss(-0.5, 1.2, fbm(s + 21, 24, 1.4)))
    D = mix(D, tint(D, fl['dust_tint'], 0.6, 1.1), dust * 0.4); R = mix(R, np.full_like(R, 0.96), dust * 0.5)
    h = h + dust * 0.12
    # a few blast marks: soft radial falloff, lighter ash ring, <=35% darker than base
    bowl, rim, ash = craters(s + 30, fl['craters'], 45, 95)
    ring = gblur(rim, 6)
    D = D * (1 - 0.35 * ash * (1 - 0.5 * ring))[..., None]
    D = mix(D, tint(D, (1.0, 1.0, 1.0), 0.4, 1.15), ring * 0.5)
    D = D * (1 - 0.25 * bowl)[..., None]
    Nn = mix(Nn, AP[1], (ash * 0.4)[..., None]); R = mix(R, np.full_like(R, 0.92), ash * 0.5)
    h = h - bowl * 0.9 + rim * 0.4
    # puddles in low spots: satin, subtle (roughness >= 0.34 so it never glitters)
    low = norm(gblur(fbm(s + 40, 220, 2.2), 6)) + 0.15 * fbm(s + 41, 60, 1.6)
    wet = np.clip(ss(fl['wet'] + 0.5, fl['wet'] + 1.3, low) + bowl * fl['bowl_wet'] * 0.6, 0, 1)
    sheen = 0.5 + 0.5 * fbm(s + 42, 120, 2.0)
    water = D * 0.55 * (0.9 + 0.2 * sheen)[..., None]
    D = mix(D, water, wet * 0.8); R = mix(R, np.full_like(R, 0.34), wet * 0.95); Nn = Nn * (1 - wet[..., None] * 0.95)
    h = h * (1 - wet) - wet * 0.6
    # pebble / shell-casing speckle
    sp = ss(0.05, 0.2, gblur((np.random.default_rng(s).random((H, W)) > 0.998).astype(np.float32), 1.6))
    D = mix(D, col(0.5, 0.47, 0.42), sp * 0.6 * (1 - wet)); h = h + sp * 0.4
    finish(D, Nn, R, h, fl['normal'], slug, 0.12)


# slug: (seed, base photo, 2nd photo, photo repeats across 44", (mul, sat, gain), flavour)
BOARDS = {
    'aerialrock': (1100, 'aerial_ground_rock', 'rocks_ground_08', 3.6, ((0.95, 0.92, 0.88), 0.85, 0.95),
                   dict(slab=0.5, slab_tint=(1.0, 1.0, 1.0), dust=0.3, dust_tint=(1.0, 0.98, 0.94), craters=4, scorch=0.5, wet=1.15, bowl_wet=0.25, normal=55)),
    'dirt': (1200, 'dirt_aerial_02', 'burned_ground_01', 4.0, ((1.0, 0.92, 0.82), 0.9, 1.0),
             dict(slab=0.8, slab_tint=(1.0, 1.0, 1.0), dust=0.5, dust_tint=(1.0, 0.94, 0.85), craters=4, scorch=0.2, wet=1.05, bowl_wet=0.4, normal=55)),
    'dryrocks': (1300, 'dry_ground_rocks', 'dirt_aerial_02', 3.2, ((0.95, 0.9, 0.84), 0.85, 0.95),
                 dict(slab=0.9, slab_tint=(1.0, 1.0, 1.0), dust=0.05, dust_tint=(1.0, 0.97, 0.9), craters=4, scorch=0.35, wet=1.3, bowl_wet=0.15, normal=60)),
    'rocks08': (1400, 'rocks_ground_08', 'aerial_ground_rock', 3.4, ((0.9, 0.9, 0.9), 0.7, 0.92),
                dict(slab=1.3, slab_tint=(1.0, 1.0, 1.0), dust=0.25, dust_tint=(0.98, 0.98, 1.0), craters=4, scorch=0.3, wet=0.95, bowl_wet=0.35, normal=55)),
    'crackmud': (1500, 'mud_cracked_dry_03', 'dirt_aerial_02', 2.6, ((1.0, 0.93, 0.8), 0.9, 0.95),
                 dict(slab=0.7, slab_tint=(1.0, 1.0, 1.0), dust=0.4, dust_tint=(1.0, 0.95, 0.85), craters=4, scorch=0.35, wet=1.0, bowl_wet=0.5, normal=50)),
    'laterite': (1600, 'red_laterite_soil_stones', 'dirt_aerial_02', 3.4, ((1.0, 0.88, 0.8), 0.95, 0.98),
                 dict(slab=0.9, slab_tint=(1.0, 1.0, 1.0), dust=0.35, dust_tint=(1.0, 0.9, 0.82), craters=4, scorch=0.1, wet=1.05, bowl_wet=0.35, normal=55)),
}


def preview():
    sheet = Image.new('RGB', (683 * 3, 465 * 2))
    for i, slug in enumerate(BOARDS):
        im = Image.open(os.path.join(OUT, slug, 'diff.jpg')).resize((683, 465), Image.LANCZOS)
        sheet.paste(im, ((i % 3) * 683, (i // 3) * 465))
    sheet.save(os.path.join(HERE, 'preview.jpg'), quality=85); print('preview.jpg')


if __name__ == '__main__':
    todo = sys.argv[1:] or list(BOARDS)
    for b in todo:
        print('==', b, flush=True); ruined(b, *BOARDS[b])
    if not sys.argv[1:]: preview()
