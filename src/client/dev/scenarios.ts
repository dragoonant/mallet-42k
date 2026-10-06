// Dev/QA scenario loader: `/?scenario=<name>` opens a game straight into a test position instead of the start screen.
// Each builder takes a freshly created (pre-deployment) GameState, patches model positions / turn flags, then
// `enterAt` puts the engine into the wanted phase and lets it raise the first pending decision. Add a scenario by
// adding an entry to SCENARIOS. Harmless in production builds (only runs when the URL asks for it).
import {
  DEFAULT_MODULES, ENGINE_VERSION, SeededRng, step, advanceGame, createContext, createGameState, hashState, removeModel, setModelPos,
  type GameSetup, type GameState, type PendingDecision, type UnitId,
} from '../../engine'
import type { DataBundle } from '../../data/types'
import { loadBundle } from '../../data'
import { registerDataBundle } from '../../engine'
import { useGameStore, type NewGameOptions } from '../store/game'

const MM = 25.4
const SCENARIO_FACTION = 'necrons'

export interface ScenarioInit {
  bundle: DataBundle
  setup: GameSetup
  state: GameState
  pending: PendingDecision | null
}

type ScenarioBuilder = (state: GameState) => void

/** Round-based base diameter in inches. */
const dia = (mm: number): number => mm / MM

function setBase(state: GameState, unitId: UnitId, mm: number): void {
  for (const id of state.units[unitId].models) state.models[id].base = { shape: 'round', radius: dia(mm) / 2 }
}

/** Keep only the first `n` models of a unit (removes the rest from play). */
function keepModels(state: GameState, unitId: UnitId, n: number): void {
  for (const id of [...state.units[unitId].models].slice(n)) removeModel(state, id)
}

function place(state: GameState, unitId: UnitId, pts: { x: number; z: number }[]): void {
  const u = state.units[unitId]
  u.location = 'board'
  u.models.forEach((id, i) => {
    const p = pts[i] ?? pts[pts.length - 1]
    setModelPos(state.models[id], { x: p.x, y: 0, z: p.z })
  })
}

/** An enemy line of `n` models of one base size along x at z = 0. */
function enemyLine(state: GameState, unitId: UnitId, n: number, mm: number, gap = 0.2): number {
  keepModels(state, unitId, n)
  setBase(state, unitId, mm)
  const d = dia(mm)
  const pts = Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * (d + gap), z: 0 }))
  place(state, unitId, pts)
  return d / 2
}

/** Pile-in scenarios are about pure base geometry: no terrain on the board (ruin walls would block the contact spots). */
function clearTerrain(state: GameState): void {
  state.board = { ...state.board, pieces: {} }
}

function chargeReady(state: GameState, unitId: UnitId): void {
  state.units[unitId].turn.chargedThisTurn = true
  state.units[unitId].turn.fightsFirst = true
}

// Human (A) 10 models in two ranks of 5: front 0.9" from the enemy line (inside Engagement Range, not touching), back 0.6" behind.
const pileIn: ScenarioBuilder = (state) => {
  clearTerrain(state)
  const me: UnitId = 'A:warriors'
  const foe: UnitId = 'B:warriors'
  const er = enemyLine(state, foe, 6, 32)
  const mm = 32
  const d = dia(mm)
  // models past the first 10 (if the roster has more) are dropped; fewer is fine, the last rank just shortens
  keepModels(state, me, 10)
  setBase(state, me, mm)
  const frontZ = er + 0.9 + d / 2
  const backZ = frontZ + d + 0.6
  const xs = [0, 1, 2, 3, 4].map((i) => (i - 2) * (d + 0.15))
  place(state, me, [...xs.map((x) => ({ x, z: frontZ })), ...xs.map((x) => ({ x, z: backZ }))])
  chargeReady(state, me)
}

// Human (A) 4 models each on 25/32/40mm bases (12 total) staggered 1-2" behind the front, facing a 6-model line.
const pileInMixed: ScenarioBuilder = (state) => {
  clearTerrain(state)
  const me: UnitId = 'A:warriors'
  const foe: UnitId = 'B:warriors'
  const er = enemyLine(state, foe, 6, 32)
  keepModels(state, me, 12)
  const ids = state.units[me].models
  const sizes = [25, 32, 40]
  ids.forEach((id, i) => {
    const mm = sizes[Math.floor(i / 4) % sizes.length]
    state.models[id].base = { shape: 'round', radius: dia(mm) / 2 }
  })
  // three groups of 4 (25/32/40mm), each a row spaced by its own base size; columns sit 0/1/1.5/2" further back
  const stagger = [0, 1, 1.5, 2]
  const pts = ids.map((id, i) => {
    const col = i % 4
    const group = Math.floor(i / 4)
    const mm = sizes[group % sizes.length]
    const pitch = dia(mm) + 0.2
    const widths = sizes.map((m) => 4 * (dia(m) + 0.2))
    const total = widths.reduce((a, b) => a + b, 0)
    const start = -total / 2 + widths.slice(0, group).reduce((a, b) => a + b, 0)
    return { x: start + (col + 0.5) * pitch, z: er + 0.9 + dia(mm) / 2 + stagger[col] }
  })
  place(state, me, pts)
  chargeReady(state, me)
}

export const SCENARIOS: Record<string, ScenarioBuilder> = {
  'pile-in': pileIn,
  'pile-in-mixed': pileInMixed,
}

/** Builds the scenario's game state positioned in the human's Fight phase, ready for the first decision. */
export async function buildScenario(name: string, seed = 'scenario'): Promise<ScenarioInit> {
  const build = SCENARIOS[name]
  if (!build) throw new Error(`unknown scenario "${name}" (known: ${Object.keys(SCENARIOS).join(', ')})`)
  const bundle = await loadBundle()
  registerDataBundle(bundle)
  const patrol = Object.values(bundle.patrols).find((p) => p.faction === `faction.${SCENARIO_FACTION}` || p.faction === SCENARIO_FACTION)
  if (!patrol) throw new Error(`scenario: no patrol for ${SCENARIO_FACTION}`)
  const mission = Object.values(bundle.missions)[0]
  const player = (): GameSetup['players']['A'] => {
    const enh = patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]
    const sec = patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]
    return {
      name: 'Necrons', faction: patrol.faction, patrolId: patrol.id, enhancementId: enh?.id ?? '', secondaryId: sec?.id ?? '',
      attachments: [], reserves: [], battleReadyVp: 0,
    }
  }
  const setup: GameSetup = {
    missionId: mission.id, terrainLayoutId: mission.terrainLayouts[0], players: { A: player(), B: player() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: bundle.version,
  }
  const state = createGameState(setup, bundle, seed, ENGINE_VERSION)
  build(state)
  state.round = 1
  state.activePlayer = 'A'
  state.firstPlayer = 'A'
  state.phase = 'fight'
  state.pending = null
  const rng = new SeededRng(`${seed}:scenario`)
  const { ctx } = createContext(state, rng, DEFAULT_MODULES)
  DEFAULT_MODULES.phases.fight.enter(ctx)
  advanceGame(ctx, DEFAULT_MODULES)
  state.rng = rng.serialize()
  state.hash = ''
  state.hash = hashState(state)
  // Fight selection offers our unit first: take it so the first prompt is its Pile in.
  let result = { state, pending: state.pending as PendingDecision | null }
  const sel = result.pending
  if (sel?.kind === 'chooseFightUnit' && sel.player === 'A') {
    const unitId = sel.context.eligible.includes('A:warriors') ? 'A:warriors' : sel.context.eligible[0]
    const r = step(state, { type: 'chooseFightUnit', player: 'A', decisionId: sel.id, unitId })
    if (!r.rejection) result = { state: r.state, pending: r.pending }
  }
  return { bundle, setup, state: result.state, pending: result.pending }
}

/** Reads `?scenario=<name>` from the URL; null when absent. */
export function scenarioFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('scenario')
}

/** Starts the named scenario against the bot (human = A). Resolves once the store holds the game. */
export async function startScenario(name: string, opts: Partial<Pick<NewGameOptions, 'difficulty' | 'seed'>> = {}): Promise<void> {
  const init = await buildScenario(name, opts.seed ?? 'scenario')
  useGameStore.getState().startFromState(init, { opponent: 'bot', seed: opts.seed ?? 'scenario', difficulty: opts.difficulty })
}
