#!/usr/bin/env python3
"""Procedural battle-scarred board textures. Deterministic. Run: python3 gen.py [variant numbers]"""
import sys, os, numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw, ImageFont

W, H = 2048, 1396
PPI = W / 44.0
OUT = os.path.dirname(os.path.abspath(__file__))
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
FX = np.fft.fftfreq(W)[None, :].astype(np.float32)
FY = np.fft.fftfreq(H)[:, None].astype(np.float32)
FR = np.sqrt(FX**2 + FY**2); FR[0, 0] = 1

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def norm(n):
    n = n - n.mean(); return (n / (n.std() + 1e-9)).astype(np.float32)

def fbm(seed, period=200, p=1.6, hi=None, aniso=None):
    """FFT noise, amplitude ~ f^-p above f0=1/period. aniso=(Lx,Ly,angle) stretches."""
    rng = np.random.default_rng(seed)
    spec = np.fft.fft2(rng.standard_normal((H, W)).astype(np.float32))
    f0 = 1.0 / max(period, 1)
    if aniso is None:
        amp = FR ** -p * (1 / (1 + (f0 / FR) ** 4))
    else:
        Lx, Ly, ang = aniso
        c, s = np.cos(ang), np.sin(ang)
        u = FX * c + FY * s; v = -FX * s + FY * c
        amp = np.exp(-((u * Lx) ** 2 + (v * Ly) ** 2)) * (FR ** -0.3)
    if hi: amp = amp * np.exp(-(FR * hi) ** 2)
    amp[0, 0] = 0
    return norm(np.fft.ifft2(spec * amp).real)

def warp(img, amp, period, seed):
    dx = fbm(seed, period, 2.0) * amp; dy = fbm(seed + 1, period, 2.0) * amp
    return ndi.map_coordinates(img, [YY + dy, XX + dx], order=1, mode='reflect')

def ramp(t, stops):
    t = np.clip(t, 0, 1); xs = [s[0] for s in stops]
    return np.stack([np.interp(t, xs, [s[1][c] for s in stops]) for c in range(3)], -1).astype(np.float32) / 255.0

def hsh(a, seed):
    return (np.sin(a * 127.1 + seed * 311.7) * 43758.5453) % 1.0

class Scene:
    def __init__(self, seed):
        self.seed = seed; self.rng = np.random.default_rng(seed)
        z = lambda: np.zeros((H, W), np.float32)
        self.h = z(); self.floor = z(); self.rim = z(); self.ej = z(); self.halo = z()
        self.water = z(); self.core = z(); self.outer = z(); self.glow = z(); self.depthm = z()
        self.WX = norm(ndi.gaussian_filter(fbm(seed + 11, 200, 2.0), 22)); self.WY = norm(ndi.gaussian_filter(fbm(seed + 12, 200, 2.0), 22))
        self.NF = norm(ndi.gaussian_filter(fbm(seed + 13, 60, 2.0), 5)); self.NM = norm(ndi.gaussian_filter(fbm(seed + 14, 60, 1.5), 3))
        self.craters = []

    def place(self, n, rmin, rmax, alpha=1.8, edge=0.0, center_avoid=0.0, minsep=0.6):
        pts = []
        tries = 0
        while len(pts) < n and tries < n * 200:
            tries += 1
            r = rmin * (1 - self.rng.random() * (1 - (rmin / rmax) ** alpha)) ** (-1 / alpha) * PPI
            x = self.rng.uniform(-edge, W + edge); y = self.rng.uniform(-edge, H + edge)
            if center_avoid:
                d = np.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
                if self.rng.random() < center_avoid * (1 - d) and r > 1.8 * PPI: continue
            ok = all(np.hypot(x - a, y - b) > (r + c) * minsep for a, b, c in pts)
            if ok: pts.append((x, y, r))
        return [(x, y, r) for x, y, r in pts]

    def crater(self, cx, cy, R, depth=0.28, rim=0.07, ejs=0.04, scorch=0.0, water=False, ejlen=1.6, fresh=0.5, level=0.55):
        rng = self.rng; ext = 4.2 if ejs > 0 else 2.2
        half = int(R * ext) + 4
        x0, x1 = max(0, int(cx) - half), min(W, int(cx) + half); y0, y1 = max(0, int(cy) - half), min(H, int(cy) + half)
        if x1 <= x0 or y1 <= y0: return
        sl = (slice(y0, y1), slice(x0, x1))
        px = XX[sl] - cx + self.WX[sl] * R * 0.09 + self.NF[sl] * R * 0.012
        py = YY[sl] - cy + self.WY[sl] * R * 0.09 + self.NF[sl][::-1, ::-1] * R * 0.012
        th = np.arctan2(py, px); d = np.hypot(px, py)
        ang = np.zeros_like(d)
        for k in range(2, 6):
            ang += rng.uniform(0.3, 1) / k**0.9 * 0.14 * np.cos(k * th + rng.uniform(0, 6.28))
        ang += 0.07 * rng.standard_normal()  # slight size jitter
        t = d / (R * (1 + ang))
        tt = np.clip(1 - t, 0, 1); bowl = ss(0, 1, tt) ** 1.15 * (0.55 + 0.45 * ss(0, 0.5, tt))
        # slightly flattened floor
        bowl = np.clip(bowl, 0, 1)
        fw = ss(1.04, 0.8, t)
        if water:
            bowl_h = np.minimum(bowl, level)
            wm = ss(level - 0.03, level + 0.0, bowl) * fw
            self.water[sl] = np.maximum(self.water[sl], wm)
        else: bowl_h = bowl
        rimp = np.exp(-((t - 1.08) / 0.3) ** 2) * (1 + 0.1 * self.NF[sl])
        rimp = rimp * np.where(t > 1.08, np.exp(-(t - 1.08) / 0.6), 1)
        # ejecta rays
        ray = np.zeros_like(d)
        for _ in range(14):
            k = rng.integers(5, 55); ray += rng.uniform(0.3, 1) * np.cos(k * th + rng.uniform(0, 6.28))
        ray = np.clip(0.5 + 0.55 * ray / 3.0, 0, 1) ** 2.2; ray = ndi.gaussian_filter(ray, 1.5)
        ejm = np.where(t > 1.0, np.exp(-(t - 1.0) / ejlen), 0) * (0.25 + ray) * ss(0.95, 1.15, t) * (1 + 0.5 * self.NM[sl])
        ejm = np.clip(ejm, 0, 1.5) * ss(4.2, 3.0, t)
        ejm_s = np.where(t > 1.0, np.exp(-(t - 1.0) / ejlen), 0) * ss(0.95, 1.15, t) * ss(4.2, 3.0, t)
        h = self.h[sl]
        h[:] = h * (1 - fw) + (-depth * R * bowl_h) * fw + R * rim * rimp * (1 - fw * 0.5) + R * ejs * 0.35 * ejm_s * (1 - fw)
        mx = np.maximum
        self.floor[sl] = mx(self.floor[sl], fw * bowl ** 0.6)
        self.depthm[sl] = mx(self.depthm[sl], fw * bowl)
        self.rim[sl] = mx(self.rim[sl], np.clip(rimp, 0, 1) * (1 - fw))
        self.ej[sl] = mx(self.ej[sl], np.clip(ejm, 0, 1) * (1 - fw))
        if scorch > 0:
            hm = ss(2.4 + 0.5 * ang.mean(), 0.6, t + 0.35 * self.NM[sl] * 0.7) * scorch
            self.halo[sl] = mx(self.halo[sl], hm)
        if fresh > 0:
            self.glow[sl] = mx(self.glow[sl], ss(0.7, 0.0, t) * fresh)

    def bloom(self, cx, cy, R, strength=1.0, seed=0):
        half = int(R * 1.8)
        x0, x1 = max(0, int(cx) - half), min(W, int(cx) + half); y0, y1 = max(0, int(cy) - half), min(H, int(cy) + half)
        if x1 <= x0 or y1 <= y0: return
        sl = (slice(y0, y1), slice(x0, x1)); rng = self.rng
        px = XX[sl] - cx + self.WX[sl] * R * 0.3; py = YY[sl] - cy + self.WY[sl] * R * 0.3
        th = np.arctan2(py, px); d = np.hypot(px, py)
        ang = sum(rng.uniform(0.3, 1) / k * 0.35 * np.cos(k * th + rng.uniform(0, 6.28)) for k in range(1, 8))
        t = d / (R * (1 + ang))
        N = self.NM[sl] * 0.09 + self.NF[sl] * 0.06
        core = ss(0.8, 0.35, t + N) * strength; outer = ss(1.15, 0.55, t + N * 1.4) * strength
        self.core[sl] = np.maximum(self.core[sl], core); self.outer[sl] = np.maximum(self.outer[sl], outer)

    def terrain(self, amp=1.0, fine=0.35):
        s = self.seed
        self.h += amp * (fbm(s + 21, 300, 2.4) * 2.5 + fbm(s + 22, 60, 2.6) * 0.9 + fbm(s + 23, 14, 2.8) * 0.1) + fine * 0.12 * fbm(s + 24, 3, 2.4)

# ---------------------------------------------------------------- finishing
def hillshade(diff, hgt, k=1.0):
    hs = ndi.gaussian_filter(hgt, 0.8)
    gy, gx = np.gradient(hs)
    nz = 1.0
    nx, ny = -gx * k, gy * k
    n = np.sqrt(nx**2 + ny**2 + nz**2); nx, ny, nzz = nx / n, ny / n, nz / n
    el = np.radians(35); L = np.array([-np.cos(el) * 0.707, np.cos(el) * 0.707, np.sin(el)])
    sh = nx * L[0] + ny * L[1] + nzz * L[2]
    sh = np.clip(sh / np.sin(el), 0, 1.7) ** 1.0
    return np.clip(diff * (sh[..., None] * 0.9 + 0.1), 0, 1)

def normalmap(hgt, k=1.0):
    hs = ndi.gaussian_filter(hgt, 0.7)
    gy, gx = np.gradient(hs)
    nx, ny, nz = -gx * k, gy * k, np.ones_like(hs)  # OpenGL: +Y up (image rows go down)
    n = np.sqrt(nx**2 + ny**2 + nz**2)
    return np.stack([nx / n, ny / n, nz / n], -1) * 0.5 + 0.5

def save(idx, slug, diff, hgt, rough, nk=1.0):
    p = f'{OUT}/{idx:02d}-{slug}'
    u8 = lambda a: (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(u8(diff)).save(p + '-diff.jpg', quality=90)
    hn = np.clip(0.5 + hgt / 100.0, 0, 1)
    Image.fromarray((hn * 65535).astype(np.uint16)).save(p + '-height.png')
    Image.fromarray(u8(normalmap(hgt, nk))).save(p + '-nor.jpg', quality=92)
    Image.fromarray(u8(rough)).save(p + '-rough.jpg', quality=90)
    Image.fromarray(u8(hillshade(diff, hgt))).save(p + '-preview.jpg', quality=90)
    print('saved', p)

def blend(base, col, m): return base * (1 - m[..., None]) + col * m[..., None]
def grain(s, amt=0.05): return fbm(s, 2, 0.3)[..., None] * amt

# ---------------------------------------------------------------- variants
def v1(seed=101):
    S = Scene(seed); rng = S.rng
    S.terrain(1.0)
    for x, y, r in S.place(14, 0.9, 2.6, edge=40, center_avoid=0.5): S.crater(x, y, r, depth=0.3, rim=0.1, ejs=0.04, scorch=0.7, fresh=0)
    for x, y, r in S.place(30, 1.2, 4.5, alpha=1.2, edge=60, minsep=0.4): S.bloom(x, y, r * 1.2, rng.uniform(0.8, 1.0))
    s = seed
    m = ss(-1.2, 1.2, fbm(s + 31, 260, 2.0) * 0.8 + fbm(s + 32, 50, 1.6) * 0.6 + fbm(s + 33, 10, 1.0) * 0.25)
    d = ramp(m, [(0, (80, 72, 46)), (0.4, (102, 92, 60)), (0.75, (122, 110, 72)), (1, (136, 122, 82))])
    # dead grass flecks (isotropic, tiny)
    fl = ss(0.9, 1.9, fbm(s + 34, 2.5, 0.2)) * ss(-0.5, 0.6, fbm(s + 35, 60, 1.6))
    d = blend(d, np.array([176, 158, 104]) / 255., fl * 0.25)
    dk = ss(0.9, 1.9, -fbm(s + 36, 2.5, 0.2)); d = d * (1 - dk[..., None] * 0.2)
    d = d * (1 + fbm(s + 37, 30, 1.4)[..., None] * 0.05)
    ash = np.array([108, 104, 94]) / 255.; char = np.array([30, 28, 26]) / 255.
    ringm = np.clip(S.outer - S.core * 0.9, 0, 1) * ss(-0.7, 0.8, fbm(s + 38, 8, 1.0))
    d = blend(d, ash * (0.85 + 0.15 * fbm(s + 39, 4, 1.0)[..., None]), ringm * 0.55)
    c = np.clip(S.core, 0, 1) * (0.78 + 0.22 * ss(-1, 1, fbm(s + 40, 6, 1.0)))
    d = blend(d, char, c * 0.92)
    d = blend(d, char * 1.4, S.halo * 0.45)
    cf = ss(0, 1, S.floor); d = blend(d, np.array([66, 56, 40]) / 255., cf * 0.75)
    d = blend(d, np.array([150, 130, 96]) / 255., S.rim * 0.35 + S.ej * 0.25)
    d += grain(s + 41, 0.025)
    r = 0.88 - 0.1 * fbm(s + 42, 40, 1.5) * 0.5 - 0.22 * c + 0.06 * ringm + 0.04 * cf
    save(1, 'scorched-plains', d, S.h, r)

def v2(seed=202):
    S = Scene(seed); rng = S.rng
    S.terrain(1.3)
    for x, y, r in S.place(95, 0.6, 3.0, alpha=1.5, edge=60, minsep=0.35, center_avoid=0.3):
        S.crater(x, y, r, depth=rng.uniform(0.2, 0.32), rim=rng.uniform(0.07, 0.12), ejs=0.05, scorch=0.35, ejlen=1.8, fresh=0)
    s = seed
    m = ss(-1.5, 1.5, fbm(s + 31, 200, 2.0) + fbm(s + 32, 40, 1.5) * 0.5)
    d = ramp(m, [(0, (100, 92, 80)), (0.5, (124, 114, 98)), (1, (146, 134, 114))])
    d = d * (1 + fbm(s + 33, 12, 1.2)[..., None] * 0.08 + grain(s + 34, 0.05))
    fl = ss(1.0, 2.0, fbm(s + 35, 3, 0.2)); d = blend(d, np.array([160, 150, 134]) / 255., fl * 0.35)
    d = blend(d, np.array([62, 55, 48]) / 255. * (1 + 0.25 * fbm(s + 36, 6, 1.0)[..., None]), S.floor * 0.85)
    d = blend(d, np.array([48, 44, 40]) / 255., S.halo * 0.5)
    d = blend(d, np.array([88, 80, 70]) / 255., S.ej * 0.45)
    d = blend(d, np.array([168, 156, 136]) / 255., S.rim * 0.5)
    d = d * (1 - 0.18 * ss(0.3, 1, S.depthm)[..., None])
    r = 0.9 - 0.2 * S.halo - 0.12 * S.floor + 0.05 * fbm(s + 37, 20, 1.2) + 0.05 * S.rim
    save(2, 'crater-field', d, S.h, r)

def voronoi(seed, n, warpamp=7):
    rng = np.random.default_rng(seed)
    pts = np.stack([rng.uniform(-60, W + 60, n), rng.uniform(-60, H + 60, n)], -1)
    wx = norm(ndi.gaussian_filter(fbm(seed + 1, 150, 2.0), 14)) * warpamp; wy = norm(ndi.gaussian_filter(fbm(seed + 2, 150, 2.0), 14)) * warpamp
    q = np.stack([(XX + wx).ravel(), (YY + wy).ravel()], -1)
    dd, ii = cKDTree(pts).query(q, k=2, workers=-1)
    return (dd[:, 1] - dd[:, 0]).reshape(H, W).astype(np.float32), ii[:, 0].reshape(H, W)

def v3(seed=303):
    S = Scene(seed); rng = S.rng; s = seed
    S.terrain(0.8, 0.25)
    cr = S.place(7, 1.2, 3.0, alpha=1.5, edge=40, center_avoid=0.3, minsep=0.9)
    for i, (x, y, r) in enumerate(cr):
        S.crater(x, y, r, depth=0.3, rim=0.08, ejs=0.04, scorch=0.8, fresh=0.9 if i < 2 else 0)
    for x, y, r in S.place(8, 0.5, 1.2, edge=40): S.crater(x, y, r, depth=0.25, rim=0.06, ejs=0.03, scorch=0.5, fresh=0)
    gap, idx = voronoi(s + 50, 240)
    gap2, idx2 = voronoi(s + 60, 120, 10)
    crack = ss(5.0, 1.0, ndi.gaussian_filter(gap, 0.8)) * (0.55 + 0.45 * ss(-1, 0.5, ndi.gaussian_filter(fbm(s + 51, 90, 1.4), 3)))
    crack2 = ss(3.0, 0.4, gap2) * 0.5
    crack = np.clip(crack + crack2 * 0.0, 0, 1)
    keep = 1 - np.clip(S.floor * 1.4 + S.halo * 0.4, 0, 1)  # no cracks in craters
    crack *= keep
    S.h += -crack * 2.5 + ss(0, 5, gap) * 0.8 * keep - (ss(0, 5, gap2) ** 1) * 0.0
    plate = hsh(idx.astype(np.float32), 3.0)
    m = ss(-1.5, 1.5, fbm(s + 31, 220, 2.0) + fbm(s + 32, 35, 1.5) * 0.5)
    d = ramp(m, [(0, (104, 102, 98)), (0.5, (132, 130, 124)), (1, (156, 154, 146))])
    d = d * (0.94 + 0.12 * plate[..., None]) * (1 + fbm(s + 33, 10, 1.2)[..., None] * 0.05)
    d = d + grain(s + 34, 0.03)
    d = blend(d, np.array([56, 53, 50]) / 255., crack * 0.6)
    cind = ss(1.6, 2.4, ndi.gaussian_filter(fbm(s + 35, 3, 0.2), 1.0) * 2.5) * ss(-1, 1, fbm(s + 36, 40, 1.4))
    d = blend(d, np.array([58, 54, 50]) / 255., cind * 0.5)
    d = blend(d, np.array([24, 22, 21]) / 255., np.clip(S.halo, 0, 1) * 0.7)
    d = blend(d, np.array([18, 16, 15]) / 255. * (1 + 0.5 * fbm(s + 37, 5, 1.0)[..., None]), ss(0, 1, S.floor) * 0.95)
    d = blend(d, np.array([170, 168, 160]) / 255., S.rim * 0.4 + S.ej * 0.2)
    ember = ss(0.15, 0.9, S.glow) * ss(-0.3, 1.0, ndi.gaussian_filter(fbm(s + 38, 10, 1.4) + fbm(s + 39, 4, 1.0) * 0.5, 1.5) * 1.6)
    ember = np.clip(ember, 0, 1)
    d = d + np.array([255, 110, 25]) / 255. * (ember[..., None] ** 1.3) * 0.75
    r = 0.92 - 0.25 * S.halo - 0.15 * S.floor + 0.04 * plate - 0.2 * crack * 0 + 0.05 * fbm(s + 40, 20, 1.2)
    save(3, 'ashen-wasteland', d, S.h, r)

def ruts(S, n, seed):
    rng = np.random.default_rng(seed); im = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(im)
    for _ in range(n):
        x, y = rng.uniform(-100, W + 100), rng.uniform(-100, H + 100); a = rng.uniform(0, 6.28); pts = [[(x, y)], [(x, y)]]
        curv = rng.uniform(-0.012, 0.012); gauge = rng.uniform(16, 22); L = int(rng.uniform(500, 1400))
        P = []
        for i in range(L):
            a += curv + rng.normal(0, 0.003); x += np.cos(a) * 2; y += np.sin(a) * 2; P.append((x, y, a))
        for sgn in (-1, 1):
            line = [(px + sgn * gauge * -np.sin(pa), py + sgn * gauge * np.cos(pa)) for px, py, pa in P]
            dr.line(line, fill=255, width=int(rng.uniform(16, 20)), joint='curve')
    m = np.asarray(im, np.float32) / 255
    return m

def v4(seed=404):
    S = Scene(seed); rng = S.rng; s = seed
    S.terrain(1.2, 0.3)
    for x, y, r in S.place(26, 0.8, 3.0, alpha=1.4, edge=50, minsep=0.5, center_avoid=0.35):
        S.crater(x, y, r, depth=0.3, rim=0.09, ejs=0.04, scorch=0.2, water=rng.random() < 0.7, fresh=0, level=rng.uniform(0.18, 0.3))
    rut = ruts(S, 7, s + 70)
    rut = ndi.gaussian_filter(rut, 5); rut = warp(rut, 5, 40, s + 71); rut = np.clip(rut * 1.6, 0, 1)
    rut *= 1 - np.clip(S.floor * 2, 0, 1)
    ridge = np.clip(ndi.gaussian_filter(rut, 12) - rut, 0, 1) * 0.6
    S.h += -rut * 6 + ridge * 4 + fbm(s + 72, 6, 1.4) * 0.5 * (rut + 0.3)
    # puddle in ruts: low spots
    puddle = ss(0.55, 0.9, rut) * ss(-0.1, 0.9, fbm(s + 73, 80, 1.6))
    S.h = np.where(S.water > 0.5, S.h, S.h)  # (water flattened in crater())
    m = ss(-1.5, 1.5, fbm(s + 31, 220, 2.0) + fbm(s + 32, 35, 1.5) * 0.6)
    d = ramp(m, [(0, (50, 38, 28)), (0.5, (72, 55, 38)), (1, (96, 74, 50))])
    d = d * (1 + fbm(s + 33, 9, 1.3)[..., None] * 0.1) + grain(s + 34, 0.03)
    wetm = ss(-0.5, 1.0, fbm(s + 35, 120, 1.8)); d = d * (1 - 0.18 * wetm[..., None])
    pb = ss(1.0, 2.0, fbm(s + 36, 3, 0.2)); d = blend(d, np.array([112, 90, 66]) / 255., pb * 0.25)
    d = blend(d, np.array([36, 28, 22]) / 255., S.halo * 0.4 + S.floor * 0.5)
    d = blend(d, np.array([40, 30, 22]) / 255., rut * 0.6)
    d = blend(d, np.array([104, 82, 58]) / 255., S.rim * 0.4 + S.ej * 0.2 + ridge * 0.25)
    wcol = ramp(0.5 + 0.3 * fbm(s + 37, 120, 2.0), [(0, (24, 30, 22)), (0.5, (36, 46, 32)), (1, (54, 64, 42))])
    wm = np.clip(S.water, 0, 1) * ss(0.0, 0.5, S.depthm * 5 - 1.0 + 1.0)
    wm = np.clip(S.water, 0, 1)
    d = blend(d, wcol, wm * 0.92)
    # sky reflection hint at water edges
    rim_w = wm * (1 - ndi.gaussian_filter(wm, 6)) * 3
    d = d + np.clip(rim_w, 0, 1)[..., None] * 0.04
    wm2 = np.clip(wm + puddle * 0.0, 0, 1)
    r = 0.62 - 0.18 * wetm + 0.1 * fbm(s + 38, 16, 1.3) * 0.5 + 0.12 * S.rim - 0.2 * rut
    r = r * (1 - wm2) + 0.05 * wm2
    save(4, 'muddy-trenches', d, S.h, r)

def v5(seed=505):
    S = Scene(seed); rng = S.rng; s = seed
    S.terrain(1.0)
    ang = np.radians(-14)
    for x, y, r in S.place(30, 0.8, 3.2, alpha=1.5, edge=50, center_avoid=0.4, minsep=0.5):
        S.crater(x, y, r, depth=0.24, rim=0.08, ejs=0.05, scorch=0.0, ejlen=2.0, fresh=0)
    streak = fbm(s + 41, 0, 0, aniso=(70, 2.2, ang)) * 0.6 + fbm(s + 42, 0, 0, aniso=(30, 1.2, ang)) * 0.4
    streak = norm(streak)
    S.h += streak * 0.25 + fbm(s + 43, 0, 0, aniso=(10, 0.9, ang)) * 0.06
    m = ss(-1.5, 1.5, fbm(s + 31, 240, 2.0) + fbm(s + 32, 40, 1.5) * 0.5 + streak * 0.45)
    d = ramp(m, [(0, (118, 56, 34)), (0.35, (150, 76, 44)), (0.7, (178, 102, 56)), (1, (200, 134, 78))])
    d = d * (1 + fbm(s + 33, 10, 1.2)[..., None] * 0.05) + grain(s + 34, 0.035)
    d = d * (1 + 0.045 * streak[..., None])
    pebble = ss(1.4, 2.4, fbm(s + 35, 3, 0.2)); d = blend(d, np.array([92, 52, 38]) / 255., pebble * 0.4)
    d = blend(d, np.array([204, 156, 108]) / 255., ss(0.5, 2.0, streak) * 0.2)
    scorch = np.clip(S.floor * 1.0, 0, 1)
    d = blend(d, np.array([50, 30, 26]) / 255. * (1 + 0.3 * fbm(s + 36, 6, 1.0)[..., None]), scorch * 0.8)
    d = blend(d, np.array([88, 52, 40]) / 255., ss(0.1, 0.8, S.floor) * 0.4)
    dust = np.clip(S.rim * 1.0 + S.ej * 0.6, 0, 1)
    d = blend(d, np.array([220, 168, 120]) / 255., dust * 0.5)
    r = 0.92 - 0.1 * scorch + 0.05 * streak - 0.05 * dust
    save(5, 'red-dust-warzone', d, S.h, r)

def v6(seed=606):
    S = Scene(seed); rng = S.rng; s = seed
    S.terrain(0.9)
    for x, y, r in S.place(7, 2.0, 4.2, alpha=1.0, edge=40, center_avoid=0.2, minsep=0.7): S.bloom(x, y, r * 1.0, 1.0)
    for x, y, r in S.place(5, 3.5, 6.0, alpha=1.0, edge=40, minsep=0.8): S.bloom(x, y, r, 1.0)
    for x, y, r in S.place(16, 0.9, 2.8, alpha=1.4, edge=50, center_avoid=0.4): S.crater(x, y, r, depth=0.22, rim=0.07, ejs=0.04, scorch=0.5, fresh=0)
    # grass patches
    patch = fbm(s + 31, 160, 1.9) * 0.9 + fbm(s + 32, 40, 1.5) * 0.55 + fbm(s + 33, 12, 1.1) * 0.25
    tuft = fbm(s + 34, 9, 1.0) + 0.6 * fbm(s + 35, 3.5, 0.5)
    soilm = ss(0.2, 1.0, -patch - 0.15)  # bare patches
    soilm = ndi.gaussian_filter(soilm, 1.2)
    soilm = np.clip(soilm + S.floor * 1.2 + S.ej * 0.5 + ss(0.3, 0.9, S.outer) * 0.7, 0, 1)
    gm = ss(-1.6, 1.4, fbm(s + 36, 140, 1.8) + fbm(s + 37, 30, 1.4) * 0.5)
    g = ramp(gm, [(0, (78, 92, 48)), (0.4, (98, 112, 56)), (0.75, (118, 128, 62)), (1, (138, 142, 74))])
    g = g * (1 + 0.16 * np.clip(tuft, -2, 2)[..., None] * 0.5) + grain(s + 38, 0.05)
    sd = ramp(ss(-1.5, 1.5, fbm(s + 39, 70, 1.6)), [(0, (78, 62, 42)), (1, (116, 94, 62))]) + grain(s + 40, 0.03)
    fringe = ss(0, 0.5, soilm) * ss(0.9, 0.3, soilm)  # dried transition band
    d = blend(g, sd, soilm)
    d = blend(d, np.array([150, 140, 80]) / 255., fringe * 0.3)
    d = blend(d, np.array([34, 31, 26]) / 255. * (1 + 0.4 * fbm(s + 45, 5, 1.0)[..., None]), ndi.gaussian_filter(np.clip(S.core, 0, 1), 2) * 0.92)
    ringm = np.clip(S.outer - S.core, 0, 1) * ss(-0.8, 0.8, fbm(s + 41, 8, 1.0))
    d = blend(d, np.array([70, 60, 42]) / 255., ringm * 0.55)
    d = blend(d, np.array([40, 34, 26]) / 255., S.halo * 0.4 + S.floor * 0.55)
    d = blend(d, np.array([140, 118, 82]) / 255., S.rim * 0.3)
    r = 0.9 - 0.1 * (1 - soilm) * ss(-1, 1, tuft) - 0.18 * S.core + 0.04 * soilm
    save(6, 'scorched-grassland', d, S.h, r)

# ---------------------------------------------------------------- sheets
NAMES = {1: 'scorched-plains', 2: 'crater-field', 3: 'ashen-wasteland', 4: 'muddy-trenches', 5: 'red-dust-warzone', 6: 'scorched-grassland'}
def sheets():
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
    except Exception: font = ImageFont.load_default()
    tw, bar = 900, 44; th = int(tw * H / W)
    sheet = Image.new('RGB', (tw * 3, (th + bar) * 2), (20, 20, 20)); dr = ImageDraw.Draw(sheet)
    clo = Image.new('RGB', (512 * 3, 512 * 2))
    for i in range(1, 7):
        im = Image.open(f'{OUT}/{i:02d}-{NAMES[i]}-preview.jpg')
        x, y = ((i - 1) % 3) * tw, ((i - 1) // 3) * (th + bar)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y)); dr.text((x + 12, y + th + 8), f'{i:02d}  {NAMES[i]}', fill=(235, 235, 235), font=font)
        hh = np.asarray(Image.open(f'{OUT}/{i:02d}-{NAMES[i]}-height.png'), np.float32)
        lo = ndi.gaussian_filter(hh, 6); dd = ndi.minimum_filter(lo, 51)  # find deepest big crater near centre-ish
        sc = lo.copy(); yy, xx = np.mgrid[0:H, 0:W]
        pen = ((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2
        sc = sc + pen * 6000; sc[:300] = 1e9; sc[-300:] = 1e9; sc[:, :300] = 1e9; sc[:, -300:] = 1e9
        cy, cx = np.unravel_index(np.argmin(sc), sc.shape)
        cx = int(np.clip(cx, 256, W - 256)); cy = int(np.clip(cy, 256, H - 256))
        clo.paste(im.crop((cx - 256, cy - 256, cx + 256, cy + 256)), (((i - 1) % 3) * 512, ((i - 1) // 3) * 512))
    sheet.save(f'{OUT}/contact-sheet.jpg', quality=88); clo.save(f'{OUT}/closeups.jpg', quality=90)

if __name__ == '__main__':
    fs = {1: v1, 2: v2, 3: v3, 4: v4, 5: v5, 6: v6}
    which = [int(a) for a in sys.argv[1:]] or list(fs)
    for i in which: fs[i]()
    sheets()
