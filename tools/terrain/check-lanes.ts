// Report for the WTC terrain layouts: lane rule (CP-3.4), objective clearance (R-3.10), reachability, symmetry.
// Run: npx tsx tools/terrain/check-lanes.ts            (exit 1 when anything fails)
import { loadBundle } from '../../src/data'
import { CLOSED_GAP, chokepoints, laneViolations, largestBase, missionsUsing, objectiveClearances, reachability, symmetryErrors } from './lanes'

const LAYOUTS = ['terrain.cp-long-edges', 'terrain.cp-short-edges', 'terrain.cp-diagonal']
const bundle = await loadBundle()
const lb = largestBase(bundle)
console.log(`largest base: ${lb.id} ${lb.mm}x${lb.mm2}mm ${lb.shape} -> lane width L = ${lb.laneWidth.toFixed(3)}" (closed < ${CLOSED_GAP}")`)
let bad = 0
for (const id of LAYOUTS) {
  const layout = bundle.terrainLayouts[id]
  const missions = missionsUsing(bundle, id)
  console.log(`\n${id}  missions: ${missions.map((m) => m.id).join(', ')}`)
  for (const c of chokepoints(layout, lb.laneWidth)) { bad++; console.log(`  CHOKE open area at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) reachable only through a ${c.bottleneck.toFixed(2)}" lane`) }
  const pairs = laneViolations(layout, lb.laneWidth)
  console.log(`  (info) ${pairs.length} piece pairs/edges sit ${CLOSED_GAP}"-${lb.laneWidth.toFixed(2)}" apart; narrowest: ${pairs.slice(0, 3).map((v) => `${v.a}/${v.b} ${v.gap.toFixed(2)}"`).join(', ')}`)
  for (const e of symmetryErrors(layout)) { bad++; console.log(`  SYM   ${e}`) }
  for (const m of missions) {
    for (const c of objectiveClearances(layout, m)) if (c.gap <= 1) { bad++; console.log(`  CLEAR ${m.id}/${c.objective} <-> ${c.piece}: ${c.gap.toFixed(2)}" (edge)`) }
    const r = reachability(layout, m, lb.radius)
    for (const [z, n] of Object.entries(r.startCells)) if (n === 0) { bad++; console.log(`  START ${m.id} zone ${z}: no legal start cell`) }
    for (const x of r.reach) if (!x.ok) { bad++; console.log(`  REACH ${m.id}: zone ${x.zone} cannot reach ${x.objective}`) }
  }
}
console.log(bad ? `\n${bad} problem(s)` : '\nall clear')
process.exit(bad ? 1 : 0)
