// Headless simulator core (W1-G, PLAN.md module G): two random-legal-move bots play full Combat Patrol games through
// the public engine API (createGame / legalActions / step) on the real data bundle, checking invariants after every
// step. Shared by the CLI (tools/sim.ts) and tests/engine/fullgame.test.ts.
import type { DataBundle } from '../src/data/types'
import {
  createGame, legalActions, modelStats, step, EngineInvariantError,
  type Action, type GameSetup, type GameState, type PendingDecision, type PlayerId, type StepResult,
} from '../src/engine'

export interface Violation { seed: string; actionIndex: number; message: string }
export interface GameRun {
  seed: string
  setup: GameSetup
  actions: Action[]
  finalHash: string
  rounds: number
  winner: PlayerId | 'draw' | null
  reason: string | null
  vp: Record<string, number>
  factions: Record<PlayerId, string>
  violations: Violation[]
  final: GameState
}

const MISSIONS = ['mission.cp-01', 'mission.cp-02', 'mission.cp-03', 'mission.cp-04', 'mission.cp-05', 'mission.cp-06']
const BATTLE_PHASES = ['command', 'movement', 'shooting', 'charge', 'fight']
const MAX_ACTIONS = 5_000 // a normal game is ~500 decisions; hitting this reports the game as stalled

// mulberry32 — the bots' own choice RNG (the engine's dice RNG lives in state.rng)
function botRng(seedText: string): () => number {
  let h = 1779033703 ^ seedText.length
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// the patrol data's own `attachTo` hints (a Leader joining its bodyguard unit); other rosters attach in the client only
function attachmentsOf(patrol: { units: { ref: string; attachTo?: string }[] }) {
  return patrol.units.filter((u) => u.attachTo).map((u) => ({ leaderRef: u.ref, bodyguardRef: u.attachTo as string }))
}

// SIM_VARIANTS: Deathwatch's second Leader (Apothecary Krenn, Narthecium) normally stays unattached because a bodyguard takes one Leader;
// on variant games he leads the Intercessors in place of the default Leader so the Narthecium pick is exercised
function variantAttachments(bundle: DataBundle, patrol: { faction: string; units: { ref: string; datasheet: string; attachTo?: string }[] }, base: { leaderRef: string; bodyguardRef: string }[]) {
  if (patrol.faction !== 'deathwatch') return base
  const out = [...base]
  for (const u of patrol.units) {
    if (u.attachTo || out.some((a) => a.leaderRef === u.ref)) continue
    const attachTo = bundle.datasheets[u.datasheet]?.leader?.attachTo ?? []
    const i = out.findIndex((a) => attachTo.includes(patrol.units.find((x) => x.ref === a.bodyguardRef)?.datasheet ?? ''))
    if (i >= 0) out[i] = { leaderRef: u.ref, bodyguardRef: out[i].bodyguardRef }
  }
  return out
}

// Transport rosters (SDC E1): when `embark` is set, the first eligible non-Leader unit starts embarked in the patrol's
// Transport, so the sim/bench exercise setup embarkation and disembark (otherwise nothing ever sets PlayerSetup.embarked).
function embarkedOf(bundle: DataBundle, patrol: { units: { ref: string; datasheet: string; size?: number; attachTo?: string }[] }) {
  const transport = patrol.units.find((u) => bundle.datasheets[u.datasheet]?.transport)
  if (!transport) return undefined
  const spec = bundle.datasheets[transport.datasheet].transport!
  const pick = patrol.units.find((u) => {
    if (u === transport || u.attachTo || patrol.units.some((o) => o.attachTo === u.ref)) return false
    const ds = bundle.datasheets[u.datasheet]
    const kw = [...ds.keywords, ...ds.factionKeywords]
    return (u.size ?? 1) <= spec.capacity && (spec.keywords ?? []).every((k) => kw.includes(k)) && !(spec.excludeKeywords ?? []).some((k) => kw.includes(k))
  })
  return pick ? [{ unitRef: pick.ref, transportRef: transport.ref }] : undefined
}

function playerSetup(bundle: DataBundle, patrolId: string, name: string, embark = false, variant = false) {
  const patrol = bundle.patrols[patrolId]
  if (!patrol) throw new Error(`sim: patrol ${patrolId} missing from data bundle`)
  // SIM_VARIANTS=1: on variant games take the last enhancement and the last secondary instead of the defaults
  const enhancementId = (variant ? patrol.enhancements[patrol.enhancements.length - 1] : (patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0])).id
  const secondaryId = (variant ? patrol.secondaries[patrol.secondaries.length - 1] : (patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0])).id
  return { name, faction: patrol.faction, patrolId, enhancementId, secondaryId, attachments: variant ? variantAttachments(bundle, patrol, attachmentsOf(patrol)) : attachmentsOf(patrol), reserves: [], battleReadyVp: 0, ...(embark ? { embarked: embarkedOf(bundle, patrol) } : {}) }
}

export function makeSimSetup(bundle: DataBundle, gameIndex: number, dataVersion: string): GameSetup {
  const patrols = Object.keys(bundle.patrols).sort()
  if (patrols.length < 2) throw new Error('sim: need two Combat Patrol rosters in the data bundle')
  // every ordered pair of distinct rosters in turn (two rosters: A/B alternate as before); with 3+ rosters the mission
  // index also steps once per full pairing cycle so a pairing does not always meet the same mission
  const pairs: [string, string][] = []
  for (const x of patrols) for (const y of patrols) if (x !== y) pairs.push([x, y])
  // SIM_FACTION=tyranids: only pairings that include that faction's roster (every game then exercises it)
  const only = process.env.SIM_FACTION
  const variants = process.env.SIM_VARIANTS === '1'
  // SIM_PATROL=<patrol id>: only pairings that include that exact patrol (a faction may have several)
  const onlyPatrol = process.env.SIM_PATROL
  let wanted = only ? pairs.filter(([x, y]) => bundle.patrols[x].faction === only || bundle.patrols[y].faction === only) : pairs
  if (onlyPatrol) wanted = wanted.filter(([x, y]) => x === onlyPatrol || y === onlyPatrol)
  // SIM_VS=orks (with SIM_FACTION): only pairings where the other roster belongs to that faction (a fixed matchup, both seats)
  const vs = process.env.SIM_VS
  if (only && vs) wanted = wanted.filter(([x, y]) => (bundle.patrols[x].faction === only && bundle.patrols[y].faction === vs) || (bundle.patrols[y].faction === only && bundle.patrols[x].faction === vs))
  // SIM_OPPONENT=orks (with SIM_FACTION=thousand-sons): the other roster of every pairing must belong to that faction
  const opponent = process.env.SIM_OPPONENT
  if (opponent) wanted = wanted.filter(([x, y]) => bundle.patrols[x].faction === opponent || bundle.patrols[y].faction === opponent)
  if (wanted.length === 0) throw new Error(`sim: no roster pairing includes faction ${only ?? '*'} patrol ${onlyPatrol ?? '*'}`)
  // plain run with 3+ rosters: the first roster walks the sorted list from the front and the opponent from the back, so a
  // short run (e.g. 6 games) touches rosters at both ends instead of only the alphabetically first ones
  const n = patrols.length
  const rotate = n > 2 && !only && !onlyPatrol
  const cycle = Math.floor(gameIndex / n)
  const ra = gameIndex % n
  let rb = (n - 1 - ra + cycle) % n
  if (rb === ra) rb = (rb + 1) % n
  const [p0, p1] = rotate ? [patrols[ra], patrols[rb]] : patrols.length === 2 && !onlyPatrol ? (gameIndex % 2 === 0 ? [patrols[0], patrols[1]] : [patrols[1], patrols[0]]) : wanted[gameIndex % wanted.length]
  const missionIndex = patrols.length === 2 && !onlyPatrol ? gameIndex : gameIndex + Math.floor(gameIndex / wanted.length)
  const missionId = MISSIONS[missionIndex % MISSIONS.length]
  return {
    missionId,
    terrainLayoutId: bundle.missions[missionId]?.terrainLayouts[0] ?? 'terrain.cp-01',
    players: { A: playerSetup(bundle, p0, 'Bot A', gameIndex % 2 === 0, variants && gameIndex % 2 === 1), B: playerSetup(bundle, p1, 'Bot B', gameIndex % 3 !== 1, variants && gameIndex % 2 === 1) },
    sides: 'rollOff',
    firstTurn: 'rollOff',
    dataVersion,
  }
}

function checkState(s: GameState, prev: { ordinal: number; phaseIdx: number; round: number }, fail: (m: string) => void): void {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
  for (const m of Object.values(s.models)) {
    if (!finite(m.pos.x) || !finite(m.pos.y) || !finite(m.pos.z) || !finite(m.facing)) fail(`model ${m.id} has non-finite position/facing`)
    if (!finite(m.woundsRemaining)) { fail(`model ${m.id} has non-finite wounds`); continue }
    const unit = s.units[m.unitId]
    if (!unit) { fail(`model ${m.id} belongs to missing unit ${m.unitId}`); continue }
    const W = modelStats(s, m).W
    if (m.woundsRemaining > W) fail(`model ${m.id} wounds ${m.woundsRemaining} > W ${W}`)
    // a Death Blow model awaiting its fight sits at 0 wounds with pendingRemoval set (removed right after it fights); a model kept on
    // the table by A Martyr's Death (E4) is at 0 W on purpose until its last stand has been resolved
    const deferredFightOnDeath = s.phaseState.marks.some((x) => x.startsWith("deferredDeath:") && x.includes(`"modelId":"${m.id}"`))
    if (m.woundsRemaining <= 0 && !m.pendingRemoval && !m.removalDeferred && !deferredFightOnDeath) fail(`model ${m.id} at ${m.woundsRemaining} wounds but not destroyed`)
  }
  for (const u of Object.values(s.units)) {
    if (u.location === 'destroyed' && u.models.length > 0) fail(`unit ${u.id} destroyed but still has models`)
    if (u.location !== 'destroyed' && u.models.length === 0) fail(`unit ${u.id} has no models but is ${u.location}`)
  }
  for (const p of Object.values(s.players)) {
    if (!finite(p.cp) || p.cp < 0) fail(`player ${p.id} CP ${p.cp}`)
    if (!finite(p.vp) || p.vp < 0) fail(`player ${p.id} VP ${p.vp}`)
  }
  if (s.round > 5) fail(`round ${s.round} > 5`)
  const idx = BATTLE_PHASES.indexOf(s.phase)
  // round.start/round.end/turn.end/battle.end windows run between turns: the round counter has already advanced (or
  // the phase is still the last one) while activePlayer is not yet switched, so turn order is only judged elsewhere
  const between = s.pending !== null && /^(round|turn|battle)\./.test(s.pending.window)
  if (idx >= 0 && !between) {
    const ordinal = (s.round - 1) * 2 + (s.activePlayer === s.firstPlayer ? 0 : 1)
    if (s.round < prev.round) fail(`round went backwards ${prev.round} → ${s.round}`)
    if (ordinal < prev.ordinal) fail(`turn order went backwards (turn ordinal ${prev.ordinal} → ${ordinal})`)
    else if (ordinal === prev.ordinal && idx < prev.phaseIdx) fail(`phase went backwards ${BATTLE_PHASES[prev.phaseIdx]} → ${s.phase}`)
    prev.ordinal = ordinal; prev.phaseIdx = idx; prev.round = s.round
  } else if (idx < 0 && s.phase !== 'ended' && prev.ordinal >= 0) {
    fail(`returned to ${s.phase} after the battle started`)
  }
}

function choose(rand: () => number, pending: PendingDecision, legal: Action[]): Action {
  // passing out of a whole phase's unit selection is legal but makes games dull; take it only occasionally
  if (pending.kind === 'chooseUnitToActivate' && legal.length > 1 && rand() > 0.1) {
    const nonPass = legal.filter((a) => a.type !== 'pass')
    return nonPass[Math.floor(rand() * nonPass.length)]
  }
  return legal[Math.floor(rand() * legal.length)]
}

export function runGame(bundle: DataBundle, baseSeed: string | number, gameIndex: number, dataVersion: string): GameRun {
  const seed = `sim-${baseSeed}-${gameIndex}`
  const setup = makeSimSetup(bundle, gameIndex, dataVersion)
  const factions = { A: setup.players.A.faction, B: setup.players.B.faction } as Record<PlayerId, string>
  const rand = botRng(seed)
  const violations: Violation[] = []
  const actions: Action[] = []
  let actionIndex = -1
  const fail = (message: string) => { if (violations.length < 20) violations.push({ seed, actionIndex, message }) }
  const prev = { ordinal: -1, phaseIdx: -1, round: 0 }

  let r: StepResult
  try {
    r = createGame(setup, seed, bundle)
  } catch (err) {
    fail(`createGame threw: ${(err as Error).message}`)
    throw Object.assign(new Error(violations[0].message), { violations })
  }
  checkState(r.state, prev, fail)
  while (r.pending && actions.length < MAX_ACTIONS) {
    actionIndex = actions.length
    let legal: Action[] | null
    try {
      legal = legalActions(r.state, r.pending)
    } catch (err) {
      fail(`legalActions threw for ${r.pending.kind}: ${(err as Error).message}`)
      break
    }
    if (!legal || legal.length === 0) {
      fail(`no legal action for pending ${r.pending.kind} (window ${r.pending.window}, phase ${r.state.phase}, round ${r.state.round})`)
      break
    }
    const action = choose(rand, r.pending, legal)
    let next: StepResult
    try {
      next = step(r.state, action)
    } catch (err) {
      const kind = err instanceof EngineInvariantError ? 'EngineInvariantError' : 'exception'
      fail(`step threw ${kind} on ${action.type} (${r.pending.kind}, phase ${r.state.phase}, round ${r.state.round}): ${(err as Error).message}`)
      break
    }
    if (next.rejection) {
      fail(`legal action ${action.type} rejected: ${next.rejection.code} ${next.rejection.reason}`)
      break
    }
    actions.push(action)
    r = next
    if (r.pending === null && r.state.phase !== 'ended') fail('no pending decision but the game has not ended')
    checkState(r.state, prev, fail)
  }
  const s = r.state
  if (violations.length === 0) {
    if (actions.length >= MAX_ACTIONS) fail(`game stalled: did not finish within ${MAX_ACTIONS} actions`)
    else if (s.phase !== 'ended' || !s.result) fail(`game stopped without a GameResult (phase ${s.phase})`)
  }
  return {
    seed, setup, actions, finalHash: s.hash, rounds: s.round,
    winner: s.result?.winner ?? null, reason: s.result?.reason ?? null,
    vp: { A: s.players.A.vp, B: s.players.B.vp }, factions, violations, final: s,
  }
}
