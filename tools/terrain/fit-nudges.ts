// Offline search that finds the smallest symmetric nudges (tools/terrain/wtc-to-cp.mjs LAYOUTS[].nudges) which satisfy the
// lane rule, objective clearance and reachability for a layout. Prints the nudges to paste into wtc-to-cp.mjs.
// Run: npx tsx tools/terrain/fit-nudges.ts <layoutId> [--rot] [--seed n] [--iters n] [--restarts n] [--why]   (annealing search from zero nudges)
//      npx tsx tools/terrain/fit-nudges.ts <layoutId> --repair   (hill-climb the layout's current nudges until the strict check passes, then shrink them)
//      npx tsx tools/terrain/fit-nudges.ts <layoutId> --shrink   (only pull current nudges toward zero while the strict check keeps passing)
import { loadBundle } from '../../src/data'
import { LAYOUTS, build } from './wtc-to-cp.mjs'
import { chokepoints, clearanceField, largestBase, missionsUsing, objectiveClearances, reachability, shapeBounds, obstacles } from './lanes'
import type { TerrainLayoutData } from '../../src/data/types'

const args = process.argv.slice(2)
const layoutId = args.find((a) => a.startsWith('terrain.')) ?? 'terrain.cp-long-edges'
const allowRot = args.includes('--rot')
let seedN = Number(args[args.indexOf('--seed') + 1]) || 1
const rand = () => { seedN = (seedN * 1664525 + 1013904223) >>> 0; return seedN / 4294967296 }

const bundle = await loadBundle()
const lb = largestBase(bundle)
const def = (LAYOUTS as any[]).find((l) => l.id === layoutId)
const missions = missionsUsing(bundle, layoutId)
const MARGIN = 0.06
const LANE_SLACK = 0.3
const FINAL_SLACK = 0.2
const STEP = 0.25
type N = { dx: number; dz: number; drot: number }
const n = 6

function layoutFor(ns: N[]): TerrainLayoutData {
  const nudges: Record<number, N> = {}
  ns.forEach((v, i) => { nudges[i] = v })
  return build({ ...def, nudges }) as TerrainLayoutData
}

function penalty(ns: N[], withReach = false, slack = LANE_SLACK): number {
  const layout = layoutFor(ns)
  let pen = 0
  // pieces stay on the board
  const w2 = 22, h2 = 15
  for (const s of obstacles(layout)) {
    const b = shapeBounds(s)
    pen += 3 * (Math.max(0, -w2 - b.minX) + Math.max(0, b.maxX - w2) + Math.max(0, -h2 - b.minZ) + Math.max(0, b.maxZ - h2))
  }
  for (const p of layout.pieces) for (const v of p.footprint) pen += 3 * (Math.max(0, Math.abs(v.x) - w2) + Math.max(0, Math.abs(v.z) - h2))
  for (const c of chokepoints(layout, lb.laneWidth + slack, STEP, 0.15)) pen += 1 + (lb.laneWidth + slack - c.bottleneck) + Math.min(5, c.cells / 200)
  // pockets where a base fits with less than the slack to spare are invisible above, so test the true lane width too
  for (const c of chokepoints(layout, lb.laneWidth, STEP, 0.15)) pen += 1 + (lb.laneWidth - c.bottleneck) + Math.min(5, c.cells / 200)
  // also the closing side must be clearly closed, not hovering at 0.25
  for (const m of missions) for (const c of objectiveClearances(layout, m)) if (c.gap < 1 + MARGIN) pen += 1 + (1 + MARGIN - c.gap)
  if (withReach) for (const m of missions) {
    const r = reachability(layout, m, lb.radius)
    for (const [, k] of Object.entries(r.startCells)) if (k === 0) pen += 5
    for (const x of r.reach) if (!x.ok) pen += 2
  }
  return pen
}
const cost = (ns: N[]) => ns.reduce((a, v) => a + v.dx * v.dx + v.dz * v.dz + 0.01 * v.drot * v.drot, 0)
const total = (ns: N[]) => penalty(ns) * 40 + cost(ns)

// --shrink: greedily pull every nudge component of the layout's CURRENT nudges toward zero while the strict check (fine grid,
// 0.1" lane slack, objectives clear by 1.05", reachability) keeps passing.
if (args.includes('--shrink') || args.includes('--repair')) {
  const cur: N[] = Array.from({ length: n }, (_, i) => ({ dx: def.nudges[i]?.dx ?? 0, dz: def.nudges[i]?.dz ?? 0, drot: def.nudges[i]?.drot ?? 0 }))
  // strict check on the fine grid, at the true lane width AND with 0.1" to spare (a pocket that only just fits a base is
  // invisible to the wider test), objectives clear by 1.05", every zone reaches every marker
  const strict = (ns: N[]): number => {
    const L = layoutFor(ns)
    let pen = 0
    for (const w of [lb.laneWidth, lb.laneWidth + 0.1]) for (const c of chokepoints(L, w, 0.1)) pen += 1 + (w - c.bottleneck) + Math.min(5, c.cells / 200)
    for (const m of missions) {
      for (const c of objectiveClearances(L, m)) if (c.gap < 1.05) pen += 1 + (1.05 - c.gap)
      const r = reachability(L, m, lb.radius)
      for (const k of Object.values(r.startCells)) if (k === 0) pen += 5
      for (const x of r.reach) if (!x.ok) pen += 2
    }
    return pen
  }
  let pen = strict(cur)
  if (args.includes('--repair')) {
    for (let it = 0; pen > 0 && it < 400; it++) {
      const cand = cur.map((v) => ({ ...v }))
      const i = Math.floor(rand() * n)
      cand[i].dx = Math.round((cand[i].dx + (rand() - 0.5) * 1.2) * 20) / 20
      cand[i].dz = Math.round((cand[i].dz + (rand() - 0.5) * 1.2) * 20) / 20
      const e = strict(cand)
      if (e < pen || (e === pen && cost(cand) < cost(cur))) { cur.splice(0, n, ...cand); pen = e; console.log(`it ${it}: penalty ${pen.toFixed(2)} cost ${cost(cur).toFixed(1)}`) }
    }
    if (pen > 0) { console.log('repair failed'); process.exit(1) }
  } else if (pen > 0) { console.log('current nudges do not pass the strict check; run --repair first'); process.exit(1) }
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) for (const k of ['dx', 'dz'] as const) {
    while (Math.abs(cur[i][k]) > 1e-9) {
      const old = cur[i][k]
      cur[i][k] = Math.abs(old) < 0.1 ? 0 : Math.round((old - Math.sign(old) * 0.1) * 100) / 100
      if (strict(cur) > 0) { cur[i][k] = old; break }
    }
  }
  console.log(JSON.stringify(Object.fromEntries(cur.map((v, i) => [i, { dx: v.dx, dz: v.dz }]))))
  process.exit(0)
}

let best: N[] | null = null, bestCost = Infinity
for (let restart = 0; restart < (Number(args[args.indexOf("--restarts") + 1]) || 12); restart++) {
  let cur: N[] = Array.from({ length: n }, () => ({ dx: 0, dz: 0, drot: 0 }))
  let curE = total(cur)
  const iters = Number(args[args.indexOf("--iters") + 1]) || 6000
  for (let it = 0; it < iters; it++) {
    const T = 3 * (1 - it / iters) + 0.02
    const cand = cur.map((v) => ({ ...v }))
    const i = Math.floor(rand() * n)
    const step = 0.2 + 2.5 * (1 - it / iters)
    cand[i].dx = Math.max(-7, Math.min(7, cand[i].dx + (rand() - 0.5) * 2 * step))
    cand[i].dz = Math.max(-7, Math.min(7, cand[i].dz + (rand() - 0.5) * 2 * step))
    if (allowRot && rand() < 0.3) cand[i].drot = Math.max(-25, Math.min(25, cand[i].drot + (rand() - 0.5) * 2 * 8 * step / 2.7))
    const e = total(cand)
    if (e < curE || rand() < Math.exp((curE - e) / T)) { cur = cand; curE = e }
  }
  // snap to 0.05" and re-evaluate
  const snapped = cur.map((v) => ({ dx: Math.round(v.dx * 20) / 20, dz: Math.round(v.dz * 20) / 20, drot: Math.round(v.drot) }))
  const p = penalty(snapped, true, FINAL_SLACK)
  const c = cost(snapped)
  console.log(`restart ${restart}: penalty ${p.toFixed(2)} cost ${c.toFixed(1)}`)
  if (p > 0 && args.includes('--why')) { const L = layoutFor(snapped); for (const v of chokepoints(L, lb.laneWidth + LANE_SLACK, STEP, 0.15)) console.log(`   choke ${v.x.toFixed(1)},${v.z.toFixed(1)} cells ${v.cells} width ${v.bottleneck.toFixed(2)}`); for (const m of missions) for (const q of objectiveClearances(L, m)) if (q.gap < 1 + MARGIN) console.log(`   clear ${m.id} ${q.objective} ${q.piece} ${q.gap.toFixed(2)}`) }
  if (p === 0 && c < bestCost) { best = snapped; bestCost = c }
}
console.log(best ? `BEST cost ${bestCost.toFixed(1)}:\n${JSON.stringify(Object.fromEntries(best.map((v, i) => [i, v])))}` : 'NO FEASIBLE SOLUTION FOUND')
