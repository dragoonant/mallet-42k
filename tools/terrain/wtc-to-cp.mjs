// Converts the WTC 2025 map pack layouts (60x44 board, SVG coords) into our 44x30 terrain layouts.
// Source numbers: tools/terrain/wtc2025-source.json (WTC 2025 map pack v2.3, digitised at labrador.dev/40k-layouts).
// Run:  node tools/terrain/wtc-to-cp.mjs        (rewrites src/data/terrain/cp-{long-edges,short-edges,diagonal}.json)
// Then: npx tsx tools/terrain/check-lanes.ts    (lane rule + objective clearance report; the vitest file enforces it)
//
// Transform (docs/spec/11-combat-patrol.md CP-3.2):
//  * placement point P (SVG) -> x' = (x-30)*44/60, z' = zSign*(y-22)*30/44   (per-axis scale)
//  * piece geometry scales UNIFORMLY by GEOM_SCALE about its own placement point (shapes keep their angles)
//  * the other table half is the 180-degree rotation about the centre, so every layout is rotationally symmetric
//  * NUDGES (below) are the post-scale fix-ups: each moves a half piece and its mirror together (mirror gets -dx,-dz)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '..', 'src', 'data', 'terrain')
const src = JSON.parse(readFileSync(join(here, 'wtc2025-source.json'), 'utf8'))

const GEOM_SCALE = 0.7
// Upper-floor L arms are widened (walls stay put) so a 40 mm base (1.57") fits wholly on a floor, clear of the wall panel
// (0.25" thick, base kept 0.125" + radius clear): the source arms scale to ~0.9-1.4". Width is measured from the wall-side edge of the floor, inward. 2.25" leaves ~0.2" of slack each side.
const FLOOR_ARM_IN = 2.25
const FLOOR_ARM_LOCAL = FLOOR_ARM_IN / GEOM_SCALE
const SX = 44 / 60
const SZ = 30 / 44
const r3 = (n) => Math.round(n * 1000) / 1000 + 0 // +0 turns -0 into 0

// Our piece kinds per WTC feature.
const KINDS = {
  container: { kind: 'crate', height: 3, traits: ['cover', 'scalable'] },
  ruin3: { kind: 'ruin', height: 6, floorHeight: 3, traits: ['obscuring', 'cover', 'scalable'] },
  ruin2: { kind: 'ruin', height: 4, floorHeight: 2, traits: ['obscuring', 'cover', 'scalable'] },
}

// zSign: +1 keeps the SVG picture orientation (SVG y down = +z); -1 flips it. Deployment zones are symmetric for the
// long/short-edge missions, so the sign there only decides how the layout sits against the mission markers; for the
// diagonal mission it must be -1 so the WTC "attacker" triangle (0,0)(30,44)(0,44) lands on our zone A
// (-22,15)(-22,-15)(0,-15).
// nudges[i] = { dx, dz, drot } on half-list piece i (our inches / degrees), applied to the piece and mirrored.
const LAYOUTS = [
  { id: 'terrain.cp-long-edges', name: 'WTC 2025 Dawn 1 (long edges)', file: 'cp-long-edges.json', from: 'wtc-2025-dawn-1', zSign: 1, nudges: { 3: { dz: -0.45 }, 4: { dx: 0.7, dz: 1.7 }, 5: { dx: -0.65, dz: -0.2 } } },
  { id: 'terrain.cp-short-edges', name: 'WTC 2025 Hammer 1 (short edges)', file: 'cp-short-edges.json', from: 'wtc-2025-hammer-1', zSign: 1, nudges: { 1: { dx: 1, dz: 3.25 }, 2: { dx: 0.9, dz: -0.9 }, 3: { dx: -1.8, dz: 2.05 }, 4: { dx: 1.25 }, 5: { dx: -0.1, dz: 0.6 } } },
  { id: 'terrain.cp-diagonal', name: 'WTC 2025 Crucible 1 (diagonal)', file: 'cp-diagonal.json', from: 'wtc-2025-crucible-1', zSign: -1, nudges: { 0: { dz: 2.05 }, 1: { dx: 0.1, dz: 0.35 }, 2: { dx: -0.1, dz: -2.7 }, 3: { dx: 0.9, dz: 0.25 }, 4: { dx: -0.2 }, 5: { dx: 0.55, dz: 1.05 } } },
]
export { LAYOUTS, build }

function localToOurs(piece, half, nudge, zSign, lx, ly) {
  // half 0 = listed piece, half 1 = its 180-degree mirror
  const rot = (piece.rot + (nudge.drot ?? 0) - (half ? 180 : 0)) * Math.PI / 180
  const c = Math.cos(rot), s = Math.sin(rot)
  const dx = lx * c - ly * s, dy = lx * s + ly * c
  const ox = piece.flip ? -dx : dx, oy = dy // SVG offset
  const px = (piece.x - 30) * SX + (nudge.dx ?? 0), pz = zSign * (piece.y - 22) * SZ + (nudge.dz ?? 0)
  const sgn = half ? -1 : 1
  return { x: r3(sgn * px + GEOM_SCALE * ox), z: r3(sgn * pz + GEOM_SCALE * zSign * oy) }
}

const area = (poly) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p.x * q.z - q.x * p.z }, 0)
const ccw = (poly) => (area(poly) < 0 ? [...poly].reverse() : poly)

// L-shaped floor [[x0,y0],[xa,y0],[xa,t],[t,t],[t,yb],[x0,yb]]: keep the outer edges and arm lengths, push the inner
// edges (t) out so both arms are FLOOR_ARM_LOCAL wide. The floor stays inside the footprint (checked in the CP-3.5 test).
function widenFloor(f) {
  const t = f[0][0] + FLOOR_ARM_LOCAL
  return [f[0], f[1], [f[1][0], f[0][1] + FLOOR_ARM_LOCAL], [t, f[0][1] + FLOOR_ARM_LOCAL], [t, f[4][1]], f[5]]
}

function build(layout) {
  const half = src.layouts_half[layout.from]
  const pieces = []
  half.forEach((pc, i) => {
    const feat = src.features[pc.f]
    const kd = KINDS[pc.f]
    const nudge = layout.nudges[i] ?? {}
    for (const h of [0, 1]) {
      const map = (pts) => pts.map(([lx, ly]) => localToOurs(pc, h, nudge, layout.zSign, lx, ly))
      const footprint = ccw(map(feat.outline ?? feat.footprint))
      const piece = {
        id: `${pc.f}-${i + 1}${h ? 'b' : 'a'}`,
        kind: kd.kind,
        pos: { x: 0, z: 0 },
        rot: 0,
        footprint,
        height: kd.height,
        traits: kd.traits,
      }
      if (kd.kind === 'ruin') {
        // L wall: the two arms' centre lines (arm thickness is ignored; the engine default wall thickness applies)
        const w = feat.wall
        const c0 = (w[1][1] + w[2][1]) / 2 // horizontal arm centre line (local y)
        const c1 = (w[0][0] + w[3][0]) / 2 // vertical arm centre line (local x)
        const chain = map([[c1, w[4][1]], [c1, c0], [w[1][0], c0]])
        piece.walls = [
          { a: chain[0], b: chain[1], height: kd.height },
          { a: chain[1], b: chain[2], height: kd.height },
        ]
        piece.floors = [{ polygon: ccw(map(widenFloor(feat.floor))), height: kd.floorHeight }]
      } else {
        piece.floors = [{ polygon: footprint, height: kd.height }]
      }
      pieces.push(piece)
    }
  })
  return { id: layout.id, name: layout.name, board: { w: 44, h: 30 }, pieces }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) for (const l of LAYOUTS) {
  writeFileSync(join(outDir, l.file), JSON.stringify(build(l), null, 2) + '\n')
  console.log(`wrote ${l.file} (${l.from}, zSign ${l.zSign})`)
}
