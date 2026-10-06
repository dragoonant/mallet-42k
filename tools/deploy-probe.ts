// Deployment probe: every roster pairing × terrain layout × a few seeds, both sides driven by the AI through setup.
// Reports units that failed to deploy (stuck/thrown), and VEHICLE/MONSTER models set up overlapping a ruin footprint.
// `npx tsx tools/deploy-probe.ts [seeds]`
import { DATA_VERSION, loadBundle } from '../src/data/index'
import { createGame, legalActions, step, hasKeyword, type GameState, type PlayerId } from '../src/engine'
import { partlyWithinPolygon } from '../src/engine/geometry'
import { UtilityDecider } from '../src/ai/utility'
import { makeSimSetup } from './sim-core'

async function main(): Promise<void> {
  const seeds = Number(process.argv[2] ?? '3')
  const bundle = await loadBundle()
  const patrols = Object.keys(bundle.patrols).sort()
  const layouts = Object.keys(bundle.terrainLayouts ?? {}).sort()
  let games = 0, failures = 0, trapped = 0, reserved = 0
  for (const a of patrols) for (const b of patrols) {
    if (a === b) continue
    for (const layout of layouts) for (let k = 0; k < seeds; k++) {
      const setup = makeSimSetup(bundle, 0, DATA_VERSION)
      setup.terrainLayoutId = layout
      const base = makeSimSetup(bundle, 0, DATA_VERSION).players.A
      setup.players.A = { ...base, ...pl(bundle, a, 'A') }
      setup.players.B = { ...base, ...pl(bundle, b, 'B') }
      const tag = `${a} vs ${b} @ ${layout} #${k}`
      games++
      let r = createGame(setup, `probe-${k}`, bundle)
      const ai: Record<PlayerId, UtilityDecider> = { A: new UtilityDecider('normal', `p-${k}-A`), B: new UtilityDecider('normal', `p-${k}-B`) }
      let n = 0
      try {
        while (r.pending && (r.state.phase === 'setup' || r.state.phase === 'deployment') && n++ < 400) {
          const p = r.pending
          const legal = legalActions(r.state, p)
          const act = await ai[p.player].decide({ player: p.player, state: r.state, hidden: { opponentReserveCount: 0 }, lastRejection: null }, p, legal)
          const next = step(r.state, act)
          if (next.rejection) throw new Error(`rejected ${act.type}: ${next.rejection.reason}`)
          r = next
        }
      } catch (e) { failures++; const p = r.pending as any; console.log(`FAIL ${tag}: ${p?.player} ${p?.context?.unitIds?.join(",")} :: ${(e as Error).message.slice(0, 60)}`); continue }
      report(r.state, tag)
    }
  }
  console.log(`games ${games}, deploy failures ${failures}, trapped big models ${trapped}, units in reserves ${reserved}`)

  function report(s: GameState, tag: string): void {
    for (const u of Object.values(s.units)) {
      if (u.location === 'reserves') reserved++
      if (u.location !== 'board' && u.location !== 'reserves' && u.location !== 'embarked') { failures++; console.log(`UNDEPLOYED ${tag}: ${u.id} (${u.location})`) }
      if (u.location !== 'board') continue
      if (!hasKeyword(s, u.id, 'VEHICLE') && !hasKeyword(s, u.id, 'MONSTER')) continue
      if (hasKeyword(s, u.id, 'FLY')) continue
      for (const mid of u.models) {
        const m = s.models[mid]
        for (const pc of Object.values(s.board.pieces)) if (pc.kind === 'ruin' && partlyWithinPolygon({ pos: m.pos, facing: m.facing, base: m.base }, pc.footprint)) { trapped++; console.log(`TRAPPED ${tag}: ${mid} in ${pc.id}`) }
      }
    }
  }
}
function pl(bundle: Awaited<ReturnType<typeof loadBundle>>, patrolId: string, name: string) {
  const patrol = bundle.patrols[patrolId]
  return {
    name, faction: patrol.faction, patrolId,
    enhancementId: (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id,
    secondaryId: (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id,
    attachments: patrol.units.filter((u) => u.attachTo).map((u) => ({ leaderRef: u.ref, bodyguardRef: u.attachTo as string })),
  }
}
main().catch((e) => { console.error(e); process.exit(2) })
