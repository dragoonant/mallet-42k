// Measurement spike: UtilityDecider vs UtilityDecider, N seeded full games at Combat Patrol scale and at Incursion scale
// (src/spike/incursion.ts). `npm run spike:incursion -- [--games 6] [--seed 1]` prints one JSON object with a block per scale.
import { DATA_VERSION, loadBundle } from '../src/data/index'
import type { DataBundle } from '../src/data/types'
import { createGame, legalActions, step, view, type Action, type Decider, type GameSetup, type PlayerId, type StepResult } from '../src/engine'
import { UtilityDecider } from '../src/ai/utility'
import { toIncursion } from '../src/spike/incursion'

const MAX_STEPS = 40_000
const CAP_MS = Number(process.argv.includes('--cap-ms') ? process.argv[process.argv.indexOf('--cap-ms') + 1] : 60_000) // per-game wall-clock cap; a capped game counts as unfinished
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

function playerSetup(bundle: DataBundle, patrolId: string, name: string) {
  const patrol = bundle.patrols[patrolId]
  const enhancementId = (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id
  const secondaryId = (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id
  const attachments = patrol.units.filter((u) => u.attachTo).map((u) => ({ leaderRef: u.ref, bodyguardRef: u.attachTo as string }))
  return { name, faction: patrol.faction, patrolId, enhancementId, secondaryId, attachments, reserves: [] as string[], battleReadyVp: 0 }
}

function baseSetup(bundle: DataBundle, g: number): GameSetup {
  const patrols = Object.keys(bundle.patrols).sort()
  const a = g % patrols.length
  const b = (a + 1 + Math.floor(g / patrols.length)) % patrols.length === a ? (a + 1) % patrols.length : (a + 1 + Math.floor(g / patrols.length)) % patrols.length
  return {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
    players: { A: playerSetup(bundle, patrols[a], 'Bot A'), B: playerSetup(bundle, patrols[b], 'Bot B') },
    sides: 'rollOff', firstTurn: 'rollOff', dataVersion: DATA_VERSION,
  }
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const r1 = (n: number) => Math.round(n * 10) / 10

async function main() {
  const games = Number(arg('games', '6'))
  const seed = arg('seed', '1')
  const bundle0 = await loadBundle()
  const out: Record<string, unknown> = { games, seed }
  const only = process.argv.includes('--only') ? Number(arg('only', '0')) : null
  for (const scale of (process.argv.includes('--scale') ? [arg('scale', 'cp') as 'cp' | 'incursion'] : ['cp', 'incursion'] as const)) {
    const perGame: { models: [number, number]; decisions: number; ai: number[]; engineMs: number; totalMs: number; rejections: number; finished: boolean; rounds: number }[] = []
    for (let g = 0; g < games; g++) {
      if (only !== null && g !== only) continue
      let bundle = bundle0
      let setup = baseSetup(bundle0, g)
      if (scale === 'incursion') ({ bundle, setup } = toIncursion(bundle0, setup))
      const gameSeed = `spike-${seed}-${g}`
      const deciders: Record<PlayerId, Decider> = { A: new UtilityDecider('normal', `${gameSeed}-A`), B: new UtilityDecider('normal', `${gameSeed}-B`) }
      const t0 = performance.now()
      let r: StepResult = createGame(setup, gameSeed, bundle)
      let engineMs = performance.now() - t0
      const count = (p: PlayerId) => Object.values(r.state.models).filter((m) => r.state.units[m.unitId].player === p).length
      const models: [number, number] = [count('A'), count('B')]
      const ai: number[] = []
      let rejections = 0, steps = 0
      while (r.pending && steps < MAX_STEPS && performance.now() - t0 < CAP_MS) {
        steps++
        const pending = r.pending
        const te = performance.now()
        const v = view(r.state, pending.player)
        const legal = legalActions(r.state, pending)
        engineMs += performance.now() - te
        const ta = performance.now()
        let action: Action
        try { action = await deciders[pending.player].decide(v, pending, legal) } catch { rejections++; if (!legal?.length) break; action = legal[0] }
        ai.push(performance.now() - ta)
        const ts = performance.now()
        let next = step(r.state, action)
        if (next.rejection) {
          rejections++
          const fb = legal?.find((a) => a !== action) ?? legal?.[0]
          if (!fb) break
          next = step(r.state, fb)
          if (next.rejection) break
        }
        engineMs += performance.now() - ts
        r = next
      }
      perGame.push({ models, decisions: steps, ai, engineMs, totalMs: performance.now() - t0, rejections, finished: !!r.state.result, rounds: r.state.round })
      console.error(`${scale} game ${g}: ${steps} decisions, ${r1(performance.now() - t0)}ms, models ${models}, finished=${!!r.state.result}`)
    }
    const all = [...perGame]
    perGame.splice(0, perGame.length, ...(all.some((p) => p.finished) ? all.filter((p) => p.finished) : all)) // aggregate over finished games only; capped ones are counted below
    const allAi = perGame.flatMap((p) => p.ai).sort((a, b) => a - b)
    const perSide = perGame.flatMap((p) => p.models)
    out[scale] = {
      modelsPerSide: { mean: r1(mean(perSide)), max: Math.max(...perSide) },
      decisionsPerGame: { mean: Math.round(mean(perGame.map((p) => p.decisions))), max: Math.max(...perGame.map((p) => p.decisions)) },
      aiDecisionMs: { mean: r1(mean(allAi)), p95: r1(pct(allAi, 0.95)), max: r1(allAi[allAi.length - 1] ?? 0), n: allAi.length },
      engineMsPerGame: Math.round(mean(perGame.map((p) => p.engineMs))),
      aiMsPerGame: Math.round(mean(perGame.map((p) => p.ai.reduce((a, b) => a + b, 0)))),
      wallClockMsPerGame: { mean: Math.round(mean(perGame.map((p) => p.totalMs))), max: Math.round(Math.max(...perGame.map((p) => p.totalMs))) },
      rejections: perGame.reduce((a, p) => a + p.rejections, 0),
      gamesFinished: perGame.filter((p) => p.finished).length,
      gamesCapped: all.length - perGame.filter((p) => p.finished).length,
    }
  }
  console.log(JSON.stringify(out, null, 2))
}
main().catch((e) => { console.error(e); process.exit(2) })
