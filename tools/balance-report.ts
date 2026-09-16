// Faction balance report (owner: tools/balance-report.ts — see STATUS.md ownership notes).
// `npx tsx tools/balance-report.ts [--pairing A|B|C|D] [--reps N] [--seed S] [--out PATH]`
// `npx tsx tools/balance-report.ts --merge --parts p1.json,p2.json,... [--out e2e-out/balance-report.json]`
//
// Plays headless Combat Patrol games through the public engine API (createGame/legalActions/step/view) to answer:
// how balanced are the two Combat Patrol rosters (Space Marines "Strike Force Octavius" vs Orks "Gordrang's
// Gitstompas"), and how much of the Space Marine weakness (per tools/sim.ts's random-vs-random baseline: ork wins
// ~4x sm) is the AI (src/ai/utility.ts's UtilityDecider) rather than the matchup itself?
//
// Four pairings, each covering all 6 missions (cp-01..cp-06) with both seat assignments:
//   A) Random vs Random               — skill-free baseline
//   B) UtilityDecider vs UtilityDecider — equal skill
//   C) UtilityDecider (sm) vs Random (ork)
//   D) UtilityDecider (ork) vs Random (sm)
//
// Because a full run (4 pairings x 6 missions x 2 seats x N reps) can exceed a single command's timeout, this tool
// can be run one pairing at a time (--pairing, writing a partial JSON via --out) and then merged (--merge) into the
// final e2e-out/balance-report.json + compact stdout tables. With no --pairing/--merge flag it runs everything in
// one process (fine for a quick smoke run with a small --reps).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DATA_VERSION, loadBundle } from '../src/data/index'
import type { DataBundle } from '../src/data/types'
import {
  createGame, legalActions, step, view,
  type Action, type Decider, type GameSetup, type GameState, type PlayerId, type StepResult,
} from '../src/engine'
import { RandomDecider } from '../src/ai/random'
import { UtilityDecider } from '../src/ai/utility'

const MISSIONS = ['mission.cp-01', 'mission.cp-02', 'mission.cp-03', 'mission.cp-04', 'mission.cp-05', 'mission.cp-06']
const MAX_STEPS = 20_000
const FACTIONS = ['sm', 'ork'] as const
type FactionId = (typeof FACTIONS)[number]
function otherFaction(f: FactionId): FactionId { return f === 'sm' ? 'ork' : 'sm' }
function otherPlayer(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

type PairingId = 'A' | 'B' | 'C' | 'D'
interface PairingSpec { id: PairingId; label: string; makeDecider: (faction: FactionId, seed: string) => Decider }
const PAIRINGS: PairingSpec[] = [
  { id: 'A', label: 'Random vs Random', makeDecider: (_f, seed) => new RandomDecider(seed) },
  { id: 'B', label: 'Utility vs Utility', makeDecider: (_f, seed) => new UtilityDecider('normal', seed) },
  {
    id: 'C', label: 'Utility(SM) vs Random(Ork)',
    makeDecider: (f, seed) => (f === 'sm' ? new UtilityDecider('normal', seed) : new RandomDecider(seed)),
  },
  {
    id: 'D', label: 'Utility(Ork) vs Random(SM)',
    makeDecider: (f, seed) => (f === 'ork' ? new UtilityDecider('normal', seed) : new RandomDecider(seed)),
  },
]

function arg(name: string, fallback: string | null): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

// ---------- setup ----------
function playerSetup(bundle: DataBundle, patrolId: string, name: string) {
  const patrol = bundle.patrols[patrolId]
  if (!patrol) throw new Error(`balance-report: patrol ${patrolId} missing from data bundle`)
  const enhancementId = (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]).id
  const secondaryId = (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]).id
  return { name, faction: patrol.faction, patrolId, enhancementId, secondaryId, attachments: [], reserves: [] as string[], battleReadyVp: 0 }
}

function patrolIdFor(bundle: DataBundle, factionId: FactionId): string {
  const id = Object.keys(bundle.patrols).find((p) => bundle.patrols[p].faction === factionId)
  if (!id) throw new Error(`balance-report: no patrol for faction ${factionId}`)
  return id
}

function makeSetup(
  bundle: DataBundle, missionId: string, dataVersion: string, smSeat: PlayerId,
): GameSetup {
  const orkSeat = otherPlayer(smSeat)
  const players = {} as GameSetup['players']
  players[smSeat] = playerSetup(bundle, patrolIdFor(bundle, 'sm'), 'Space Marines')
  players[orkSeat] = playerSetup(bundle, patrolIdFor(bundle, 'ork'), 'Orks')
  return {
    missionId,
    terrainLayoutId: Object.keys(bundle.terrainLayouts ?? {}).sort()[0] ?? 'terrain.cp-01',
    players, sides: 'rollOff', firstTurn: 'rollOff', dataVersion,
  }
}

// ---------- per-game stats ----------
function countObjectives(s: GameState): Record<PlayerId, number> {
  let a = 0, b = 0
  for (const obj of Object.values(s.objectives)) {
    if (obj.removed) continue
    if (obj.controller === 'A') a++
    else if (obj.controller === 'B') b++
  }
  return { A: a, B: b }
}

function liveModelCounts(s: GameState): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = { A: 0, B: 0 }
  for (const m of Object.values(s.models)) {
    const unit = s.units[m.unitId]
    if (unit) counts[unit.player]++
  }
  return counts
}

interface GameRecord {
  pairing: PairingId
  missionId: string
  smSeat: PlayerId
  rep: number
  seed: string
  winner: 'sm' | 'ork' | 'draw' | null
  reason: string | null
  round: number
  vp: Record<FactionId, number>
  modelsLost: Record<FactionId, number>
  firstTurnFaction: FactionId
  firstTurnWon: boolean | null // null when the game drew
  objectivesHeldMore: Record<number, FactionId | 'tied'> // round -> who held strictly more objectives at round-end
  unfinished: boolean
  rejections: number
}

async function playOne(
  bundle: DataBundle, pairing: PairingSpec, missionId: string, smSeat: PlayerId, rep: number, baseSeed: string, dataVersion: string,
): Promise<GameRecord> {
  const seed = `balance-${pairing.id}-${missionId}-${smSeat}-${rep}-${baseSeed}`
  const setup = makeSetup(bundle, missionId, dataVersion, smSeat)
  const orkSeat = otherPlayer(smSeat)
  const seatFaction: Record<PlayerId, FactionId> = { [smSeat]: 'sm', [orkSeat]: 'ork' } as Record<PlayerId, FactionId>

  const deciders: Record<PlayerId, Decider> = {
    [smSeat]: pairing.makeDecider('sm', `${seed}-sm`),
    [orkSeat]: pairing.makeDecider('ork', `${seed}-ork`),
  } as Record<PlayerId, Decider>

  let r: StepResult = createGame(setup, seed, bundle)
  const startCounts = liveModelCounts(r.state)
  const objByRound: Record<number, Record<PlayerId, number>> = {}
  let rejections = 0
  let steps = 0

  const snapshotRound = (s: GameState) => { if (s.round >= 1 && s.round <= 5) objByRound[s.round] = countObjectives(s) }
  snapshotRound(r.state)

  while (r.pending && steps < MAX_STEPS) {
    steps++
    const pending = r.pending
    const decider = deciders[pending.player]
    const v = view(r.state, pending.player)
    const legal = legalActions(r.state, pending)
    let action: Action
    try {
      action = await decider.decide(v, pending, legal)
    } catch {
      rejections++
      if (!legal || legal.length === 0) break
      action = legal[0]
    }
    let next = step(r.state, action)
    if (next.rejection) {
      rejections++
      const fallback = legal && legal.length > 0 ? legal.find((a) => a !== action) ?? legal[0] : null
      if (!fallback) break
      next = step(r.state, fallback)
      if (next.rejection) break
    }
    r = next
    snapshotRound(r.state)
  }

  const s = r.state
  const endCounts = liveModelCounts(s)
  const modelsLost: Record<FactionId, number> = {
    sm: Math.max(0, startCounts[smSeat] - endCounts[smSeat]),
    ork: Math.max(0, startCounts[orkSeat] - endCounts[orkSeat]),
  }
  const vp: Record<FactionId, number> = { sm: s.players[smSeat]?.vp ?? 0, ork: s.players[orkSeat]?.vp ?? 0 }
  const winnerSeat = s.result?.winner ?? null
  const winner: 'sm' | 'ork' | 'draw' | null = winnerSeat === 'draw' ? 'draw' : winnerSeat ? seatFaction[winnerSeat] : null
  const firstTurnFaction = seatFaction[s.firstPlayer]
  const firstTurnWon = winner === null ? null : winner === 'draw' ? null : winner === firstTurnFaction

  const objectivesHeldMore: Record<number, FactionId | 'tied'> = {}
  for (const rnd of [2, 3, 4, 5]) {
    const counts = objByRound[rnd]
    if (!counts) continue
    const smCount = counts[smSeat], orkCount = counts[orkSeat]
    objectivesHeldMore[rnd] = smCount === orkCount ? 'tied' : smCount > orkCount ? 'sm' : 'ork'
  }

  return {
    pairing: pairing.id, missionId, smSeat, rep, seed,
    winner, reason: s.result?.reason ?? null, round: s.round, vp, modelsLost,
    firstTurnFaction, firstTurnWon, objectivesHeldMore, unfinished: !s.result, rejections,
  }
}

// ---------- aggregation ----------
interface Agg {
  games: number
  wins: Record<FactionId, number>
  draws: number
  vpTotal: Record<FactionId, number>
  roundTotal: number
  modelsLostTotal: Record<FactionId, number>
  objMore: Record<FactionId | 'tied', number> // count over round-samples (rounds 2-5, one sample per game per round reached)
  objSamples: number
  firstTurnDecisive: number
  firstTurnWins: number
  unfinished: number
  rejections: number
}
function emptyAgg(): Agg {
  return {
    games: 0, wins: { sm: 0, ork: 0 }, draws: 0, vpTotal: { sm: 0, ork: 0 }, roundTotal: 0,
    modelsLostTotal: { sm: 0, ork: 0 }, objMore: { sm: 0, ork: 0, tied: 0 }, objSamples: 0,
    firstTurnDecisive: 0, firstTurnWins: 0, unfinished: 0, rejections: 0,
  }
}
function fold(agg: Agg, g: GameRecord): void {
  agg.games++
  if (g.winner === 'draw') agg.draws++
  else if (g.winner) agg.wins[g.winner]++
  agg.vpTotal.sm += g.vp.sm; agg.vpTotal.ork += g.vp.ork
  agg.roundTotal += g.round
  agg.modelsLostTotal.sm += g.modelsLost.sm; agg.modelsLostTotal.ork += g.modelsLost.ork
  for (const who of Object.values(g.objectivesHeldMore)) { agg.objMore[who]++; agg.objSamples++ }
  if (g.firstTurnWon !== null) { agg.firstTurnDecisive++; if (g.firstTurnWon) agg.firstTurnWins++ }
  if (g.unfinished) agg.unfinished++
  agg.rejections += g.rejections
}
function pct(n: number, d: number): string { return d > 0 ? `${((n / d) * 100).toFixed(0)}%` : 'n/a' }
function mean(n: number, d: number): string { return d > 0 ? (n / d).toFixed(2) : 'n/a' }

function aggRow(label: string, agg: Agg): string {
  return [
    label.padEnd(28),
    String(agg.games).padStart(5),
    pct(agg.wins.sm, agg.games).padStart(6),
    pct(agg.wins.ork, agg.games).padStart(6),
    pct(agg.draws, agg.games).padStart(6),
    mean(agg.vpTotal.sm, agg.games).padStart(6),
    mean(agg.vpTotal.ork, agg.games).padStart(6),
    mean(agg.roundTotal, agg.games).padStart(6),
    mean(agg.modelsLostTotal.sm, agg.games).padStart(6),
    mean(agg.modelsLostTotal.ork, agg.games).padStart(6),
    pct(agg.objMore.sm, agg.objSamples).padStart(7),
    pct(agg.objMore.ork, agg.objSamples).padStart(7),
    pct(agg.objMore.tied, agg.objSamples).padStart(6),
    pct(agg.firstTurnWins, agg.firstTurnDecisive).padStart(6),
  ].join(' ')
}

function printSummaryTable(title: string, rows: [string, Agg][]): void {
  console.log(`\n${title}`)
  console.log(
    [
      'pairing'.padEnd(28), 'games'.padStart(5), 'sm%'.padStart(6), 'ork%'.padStart(6), 'draw%'.padStart(6),
      'vpSM'.padStart(6), 'vpOrk'.padStart(6), 'rnd'.padStart(6), 'lostSM'.padStart(6), 'lostOrk'.padStart(6),
      'objSM'.padStart(7), 'objOrk'.padStart(7), 'objTie'.padStart(6), '1stWin%'.padStart(6),
    ].join(' '),
  )
  for (const [label, agg] of rows) console.log(aggRow(label, agg))
}

// ---------- run modes ----------
interface PartialResult { pairingId: PairingId; label: string; reps: number; baseSeed: string; games: GameRecord[] }

async function runPairing(pairingId: PairingId, reps: number, baseSeed: string): Promise<PartialResult> {
  const pairing = PAIRINGS.find((p) => p.id === pairingId)
  if (!pairing) throw new Error(`balance-report: unknown pairing ${pairingId}`)
  const bundle = await loadBundle()
  const games: GameRecord[] = []
  const started = Date.now()
  let n = 0
  const total = MISSIONS.length * 2 * reps
  for (const missionId of MISSIONS) {
    for (const smSeat of ['A', 'B'] as PlayerId[]) {
      for (let rep = 0; rep < reps; rep++) {
        const t0 = Date.now()
        const g = await playOne(bundle, pairing, missionId, smSeat, rep, baseSeed, DATA_VERSION)
        games.push(g)
        n++
        console.log(
          `[${pairing.id}] ${n}/${total} ${missionId} smSeat=${smSeat} rep=${rep}: ` +
            `${g.winner ?? 'unfinished'} (${g.reason}) VP sm=${g.vp.sm}/ork=${g.vp.ork}, round ${g.round}, ` +
            `${Date.now() - t0}ms${g.rejections ? `, ${g.rejections} rejection(s)` : ''}`,
        )
      }
    }
  }
  console.log(`[${pairing.id}] done: ${games.length} games in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return { pairingId, label: pairing.label, reps, baseSeed, games }
}

function ensureDir(path: string): void { mkdirSync(dirname(path), { recursive: true }) }

function missionMatrix(games: GameRecord[]): void {
  const byPairingMission = new Map<string, Agg>()
  for (const g of games) {
    const key = `${g.pairing}|${g.missionId}`
    const agg = byPairingMission.get(key) ?? emptyAgg()
    fold(agg, g)
    byPairingMission.set(key, agg)
  }
  console.log('\nSpace Marine win rate by mission x pairing (lopsidedness check)')
  console.log(['mission'.padEnd(14), ...PAIRINGS.map((p) => p.id.padStart(6))].join(' '))
  for (const missionId of MISSIONS) {
    const row = [missionId.replace('mission.', '').padEnd(14)]
    for (const p of PAIRINGS) {
      const agg = byPairingMission.get(`${p.id}|${missionId}`)
      row.push((agg ? pct(agg.wins.sm, agg.games) : 'n/a').padStart(6))
    }
    console.log(row.join(' '))
  }
}

function finalize(parts: PartialResult[], outPath: string): void {
  const games = parts.flatMap((p) => p.games)
  const byPairing = new Map<PairingId, Agg>()
  for (const p of PAIRINGS) byPairing.set(p.id, emptyAgg())
  const overall = emptyAgg()
  for (const g of games) {
    fold(byPairing.get(g.pairing)!, g)
    fold(overall, g)
  }
  printSummaryTable(
    'Per-pairing summary (both seat assignments, all 6 missions pooled)',
    PAIRINGS.map((p) => [`${p.id}) ${p.label}`, byPairing.get(p.id)!] as [string, Agg]),
  )
  printSummaryTable('Overall', [['ALL pairings pooled', overall]])
  missionMatrix(games)

  const report = {
    generatedAt: new Date().toISOString(),
    dataVersion: DATA_VERSION,
    missions: MISSIONS,
    pairings: PAIRINGS.map((p) => ({ id: p.id, label: p.label })),
    perPairing: Object.fromEntries(PAIRINGS.map((p) => [p.id, byPairing.get(p.id)!])),
    overall,
    games,
  }
  ensureDir(outPath)
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\nwrote ${outPath} (${games.length} games)`)
}

async function main(): Promise<void> {
  const merge = process.argv.includes('--merge')
  const outPath = arg('out', 'e2e-out/balance-report.json') as string
  if (merge) {
    const partsArg = arg('parts', null)
    if (!partsArg) throw new Error('balance-report --merge requires --parts p1.json,p2.json,...')
    const parts = partsArg.split(',').map((p) => JSON.parse(readFileSync(p.trim(), 'utf8')) as PartialResult)
    finalize(parts, outPath)
    return
  }
  const pairingArg = arg('pairing', null) as PairingId | null
  const reps = Number(arg('reps', '5'))
  const baseSeed = arg('seed', 'balance') as string
  if (pairingArg) {
    const part = await runPairing(pairingArg, reps, baseSeed)
    const partPath = outPath.replace(/\.json$/, `-${pairingArg}.json`)
    ensureDir(partPath)
    writeFileSync(partPath, JSON.stringify(part, null, 2))
    console.log(`wrote ${partPath}`)
    return
  }
  // no --pairing/--merge: run everything in one process (fine for a quick smoke run with a small --reps)
  const parts: PartialResult[] = []
  for (const p of PAIRINGS) parts.push(await runPairing(p.id, reps, baseSeed))
  finalize(parts, outPath)
}

main().catch((err) => { console.error(err); process.exit(2) })
