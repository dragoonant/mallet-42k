// Tier-1 AI benchmark (owner: src/ai).
// `npm run bench:ai -- --games N --seed S [--difficulty easy|normal] [--faction space-marines|orks]`
// Plays UtilityDecider vs RandomDecider on the real Combat Patrol rosters through the public engine API
// (createGame/legalActions/step/view), alternating which faction and which seat the AI takes (or, with
// --faction, always playing that one roster), cycling missions cp-01..cp-06. Prints games, AI wins, draws,
// mean VP each side, per-faction win/VP breakdown, and mean/p95 ms per AI decision.
import { DATA_VERSION, loadBundle } from '../src/data/index'
import type { DataBundle } from '../src/data/types'
import {
  createGame, legalActions, step, view,
  type Action, type Decider, type GameSetup, type PlayerId, type StepResult,
} from '../src/engine'
import { RandomDecider } from '../src/ai/random'
import { UtilityDecider, type Difficulty } from '../src/ai/utility'

const MISSIONS = ['mission.cp-01', 'mission.cp-02', 'mission.cp-03', 'mission.cp-04', 'mission.cp-05', 'mission.cp-06']
const MAX_STEPS = 20_000

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

function otherPlayer(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

// --faction filters which patrol the AI plays (bench arg name matches the faction folders under src/data/factions;
// the data's own faction ids are the shorter 'sm'/'ork').
const FACTION_ARG_TO_DATA_ID: Record<string, string> = { 'space-marines': 'sm', orks: 'ork' }

function playerSetup(bundle: DataBundle, patrolId: string, name: string) {
  const patrol = bundle.patrols[patrolId]
  if (!patrol) throw new Error(`ai-bench: patrol ${patrolId} missing from data bundle`)
  const enhancementId = (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id
  const secondaryId = (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id
  return { name, faction: patrol.faction, patrolId, enhancementId, secondaryId, attachments: [], reserves: [] as string[], battleReadyVp: 0 }
}

// AI's roster alternates independently of which seat (A/B) it plays, so across an even run it sees both
// factions from both seats rather than always being (faction 0, seat A) / (faction 1, seat B). When
// `forcedAiFactionId` is set (--faction), the AI always plays that roster instead of alternating.
function makeSetup(bundle: DataBundle, gameIndex: number, aiSeat: PlayerId, dataVersion: string, forcedAiFactionId: string | null): GameSetup {
  const patrols = Object.keys(bundle.patrols).sort()
  if (patrols.length < 2) throw new Error('ai-bench: need two Combat Patrol rosters in the data bundle')
  // faction alternates on a different cadence than seat (see aiSeat below) so the four (faction × seat)
  // combinations all get covered across a run instead of faction and seat flipping together every game
  const aiPatrolIdx = forcedAiFactionId
    ? patrols.findIndex((p) => bundle.patrols[p].faction === forcedAiFactionId)
    : Math.floor(gameIndex / 2) % 2
  if (aiPatrolIdx < 0) throw new Error(`ai-bench: no patrol with faction ${forcedAiFactionId} in the data bundle`)
  const aiPatrol = patrols[aiPatrolIdx]
  const oppPatrol = patrols[(aiPatrolIdx + 1) % patrols.length]
  const ai = playerSetup(bundle, aiPatrol, 'UtilityAI')
  const opp = playerSetup(bundle, oppPatrol, 'Random')
  const players = aiSeat === 'A' ? { A: ai, B: opp } : { A: opp, B: ai }
  return {
    missionId: MISSIONS[gameIndex % MISSIONS.length],
    terrainLayoutId: Object.keys(bundle.terrainLayouts ?? {}).sort()[0] ?? 'terrain.cp-01',
    players, sides: 'rollOff', firstTurn: 'rollOff', dataVersion,
  }
}

interface GameOutcome {
  aiSeat: PlayerId; aiFaction: string; winner: PlayerId | 'draw' | null; vpAi: number; vpRandom: number
  decisionMs: number[]; rejections: number; unfinished: boolean
}

async function playOne(
  bundle: DataBundle, seed: string, gameIndex: number, dataVersion: string, difficulty: Difficulty,
  forcedAiFactionId: string | null,
): Promise<GameOutcome> {
  const aiSeat: PlayerId = gameIndex % 2 === 0 ? 'A' : 'B'
  const setup = makeSetup(bundle, gameIndex, aiSeat, dataVersion, forcedAiFactionId)
  const aiFaction = setup.players[aiSeat].faction
  const deciders: Partial<Record<PlayerId, Decider>> = {}
  deciders[aiSeat] = new UtilityDecider(difficulty, `ai-bench-${seed}-${gameIndex}-ai`)
  deciders[otherPlayer(aiSeat)] = new RandomDecider(`ai-bench-${seed}-${gameIndex}-rand`)

  let r: StepResult = createGame(setup, `ai-bench-${seed}-${gameIndex}`, bundle)
  const decisionMs: number[] = []
  let rejections = 0
  let steps = 0
  while (r.pending && steps < MAX_STEPS) {
    steps++
    const pending = r.pending
    const decider = deciders[pending.player] as Decider
    const v = view(r.state, pending.player)
    const legal = legalActions(r.state, pending)
    const t0 = performance.now()
    let action: Action
    try {
      action = await decider.decide(v, pending, legal)
    } catch (err) {
      rejections++
      if (!legal || legal.length === 0) break
      action = legal[0]
    }
    if (pending.player === aiSeat) decisionMs.push(performance.now() - t0)
    let next = step(r.state, action)
    if (next.rejection) {
      rejections++
      const fallback = legal && legal.length > 0 ? legal.find((a) => a !== action) ?? legal[0] : null
      if (!fallback) break
      next = step(r.state, fallback)
      if (next.rejection) break
    }
    r = next
  }
  const s = r.state
  return {
    aiSeat,
    aiFaction,
    winner: s.result?.winner ?? null,
    vpAi: s.players[aiSeat]?.vp ?? 0,
    vpRandom: s.players[otherPlayer(aiSeat)]?.vp ?? 0,
    decisionMs,
    rejections,
    unfinished: !s.result,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}

interface FactionTally { games: number; aiWins: number; randomWins: number; draws: number; vpAiTotal: number; vpRandomTotal: number }
function emptyTally(): FactionTally { return { games: 0, aiWins: 0, randomWins: 0, draws: 0, vpAiTotal: 0, vpRandomTotal: 0 } }

async function main(): Promise<void> {
  const games = Number(arg('games', '12'))
  const seed = arg('seed', '1')
  const difficulty = (arg('difficulty', 'normal') as Difficulty)
  const verbose = process.argv.includes('--verbose')
  const factionArg = arg('faction', '')
  if (factionArg && !(factionArg in FACTION_ARG_TO_DATA_ID)) {
    console.error(`ai-bench: --faction must be one of ${Object.keys(FACTION_ARG_TO_DATA_ID).join(', ')}`)
    process.exit(2)
  }
  const forcedAiFactionId = factionArg ? FACTION_ARG_TO_DATA_ID[factionArg] : null
  const bundle = await loadBundle()
  const started = Date.now()

  let aiWins = 0, draws = 0, randomWins = 0, rejections = 0, unfinished = 0
  let vpAiTotal = 0, vpRandomTotal = 0
  const allMs: number[] = []
  const byFaction = new Map<string, FactionTally>()

  for (let g = 0; g < games; g++) {
    const t0 = Date.now()
    const outcome = await playOne(bundle, seed, g, DATA_VERSION, difficulty, forcedAiFactionId)
    rejections += outcome.rejections
    if (outcome.unfinished) unfinished++
    vpAiTotal += outcome.vpAi
    vpRandomTotal += outcome.vpRandom
    allMs.push(...outcome.decisionMs)
    const tally = byFaction.get(outcome.aiFaction) ?? emptyTally()
    tally.games++
    tally.vpAiTotal += outcome.vpAi
    tally.vpRandomTotal += outcome.vpRandom
    if (outcome.winner === 'draw') { draws++; tally.draws++ }
    else if (outcome.winner === outcome.aiSeat) { aiWins++; tally.aiWins++ }
    else if (outcome.winner !== null) { randomWins++; tally.randomWins++ }
    byFaction.set(outcome.aiFaction, tally)
    if (verbose) {
      const meanMs = outcome.decisionMs.length ? outcome.decisionMs.reduce((a, b) => a + b, 0) / outcome.decisionMs.length : 0
      console.log(`game ${g} aiSeat=${outcome.aiSeat} aiFaction=${outcome.aiFaction}: ${outcome.winner ?? 'unfinished'} VP ai=${outcome.vpAi} random=${outcome.vpRandom}, mean ai decision ${meanMs.toFixed(1)}ms, ${Date.now() - t0}ms${outcome.rejections ? `, ${outcome.rejections} rejection(s)` : ''}`)
    }
  }

  const sorted = [...allMs].sort((a, b) => a - b)
  const meanMs = allMs.length ? allMs.reduce((a, b) => a + b, 0) / allMs.length : 0
  const p95Ms = percentile(sorted, 0.95)

  console.log(`ai-bench: ${games} games, seed ${seed}, difficulty ${difficulty}${factionArg ? `, faction ${factionArg}` : ''}, ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`AI wins: ${aiWins}; Random wins: ${randomWins}; draws: ${draws}${unfinished ? `; unfinished: ${unfinished}` : ''}`)
  console.log(`mean VP — AI: ${(vpAiTotal / Math.max(games, 1)).toFixed(1)}, Random: ${(vpRandomTotal / Math.max(games, 1)).toFixed(1)}`)
  for (const [faction, t] of [...byFaction].sort(([a], [b]) => a.localeCompare(b))) {
    const winRate = t.games > 0 ? ((t.aiWins / t.games) * 100).toFixed(0) : '0'
    console.log(`  faction ${faction}: ${t.games} games, AI wins ${t.aiWins} (${winRate}%), Random wins ${t.randomWins}, draws ${t.draws}, mean VP AI ${(t.vpAiTotal / Math.max(t.games, 1)).toFixed(1)} / Random ${(t.vpRandomTotal / Math.max(t.games, 1)).toFixed(1)}`)
  }
  console.log(`AI decision time — mean: ${meanMs.toFixed(1)}ms, p95: ${p95Ms.toFixed(1)}ms, n=${allMs.length}`)
  console.log(`rejections: ${rejections}`)
  process.exit(rejections > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
