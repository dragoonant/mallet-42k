// Dev/QA scenario loader: `/?scenario=<name>` opens a game straight into a test position instead of the start screen.
// Each builder takes a freshly created (pre-deployment) GameState, patches model positions / turn flags, then
// `enterAt` puts the engine into the wanted phase and lets it raise the first pending decision. Add a scenario by
// adding an entry to SCENARIOS. Harmless in production builds (only runs when the URL asks for it).
import {
  DEFAULT_MODULES, ENGINE_VERSION, SeededRng, step, advanceGame, createContext, createGameState, hashState, removeModel, setModelPos,
  type GameSetup, type GameState, type PendingDecision, type UnitId,
} from '../../engine'
import type { DataBundle } from '../../data/types'
import { terrainService } from '../../engine/terrain'
import { loadBundle } from '../../data'
import { registerDataBundle } from '../../engine'
import { useGameStore, type NewGameOptions } from '../store/game'

const MM = 25.4
const SCENARIO_FACTION = 'necrons'
/** Scenarios that start in another faction / phase than the default (Necrons, Fight). */
const SCENARIO_FACTIONS: Record<string, string> = { 'floor-picker': 'sm', 'floor-climb': 'sm', 'weapon-select': 'sm', 'weapon-select-mixed': 'sm', 'weapon-select-split': 'sm', 'weapon-select-psyker': 'sm' }
/** Shooting-phase scenarios: scenario name -> the human (A) unit ref that is activated, so the first prompt is its declareTargets. */
const SHOOTING_SCENARIOS: Record<string, string> = { 'weapon-select': 'terminator-squad', 'weapon-select-mixed': 'infernus-squad', 'weapon-select-split': 'infernus-squad', 'weapon-select-psyker': 'librarian-tantus' }
const MOVEMENT_SCENARIOS = new Set(['floor-picker', 'floor-climb'])

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

/** Facts a scenario worked out (e.g. where it put a unit on a ruin floor), for e2e specs: `window.__malletScenario`. */
export const scenarioNotes: Record<string, unknown> = {}

type V2 = { x: number; z: number }

/** Every upper floor on the board, tallest first (the three-storey ruins' 3" floors before the two-storey ones), then board order. */
function upperFloors(state: GameState): { ruinId: string; polygon: V2[]; height: number }[] {
  const out: { ruinId: string; polygon: V2[]; height: number }[] = []
  for (const p of Object.values(state.board.pieces)) {
    if (p.kind !== 'ruin') continue
    for (const f of p.floors.filter((q) => q.height > 0)) out.push({ ruinId: p.id, polygon: f.polygon, height: f.height })
  }
  return out.sort((a, b) => b.height - a.height)
}

/** Finds `n` bases of `unitId`'s size in a row (`spacing` apart centre to centre) that all pass the engine's own
 *  canEndAt on `floor`, as far from the floor's edges and the ruin's walls as the scan can manage (the row is tried at
 *  every 15 degrees). Returns the row's centre, its unit axis and the n positions, or null if no row fits. */
function floorRow(state: GameState, unitId: UnitId, floor: { polygon: V2[]; height: number }, n: number, spacing: number): { centre: V2; axis: V2; points: V2[] } | null {
  const model = state.models[state.units[unitId].models[0]]
  const xs = floor.polygon.map((q) => q.x), zs = floor.polygon.map((q) => q.z)
  const fits = (pos: V2, r: number): boolean => terrainService.canEndAt(state, { ...model, base: { shape: 'round', radius: model.base.radius + r } as typeof model.base }, { x: pos.x, y: floor.height, z: pos.z }).ok
  let best = null as { centre: V2; axis: V2; points: V2[]; slack: number } | null
  for (let a = 0; a < 180; a += 15) {
    const axis = { x: Math.cos((a * Math.PI) / 180), z: Math.sin((a * Math.PI) / 180) }
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.1) {
        const points = Array.from({ length: n }, (_, i) => ({ x: x + (i - (n - 1) / 2) * spacing * axis.x, z: z + (i - (n - 1) / 2) * spacing * axis.z }))
        if (!points.every((q) => fits(q, 0))) continue
        // slack = how much bigger every base could grow and still fit (coarse, 0.05" steps up to 0.3")
        let slack = 0
        while (slack < 0.3 && points.every((q) => fits(q, slack + 0.05))) slack += 0.05
        if (!best || slack > best.slack) best = { centre: { x, z }, axis, points, slack }
      }
    }
    if (best && best.slack >= 0.3) break
  }
  return best && { centre: best.centre, axis: best.axis, points: best.points }
}

/** Share of probe points (two rings round `c`, 24 directions each) that are open ground for `unitId`'s base. */
function opennessAround(state: GameState, unitId: UnitId, c: V2): number {
  const model = state.models[state.units[unitId].models[0]]
  let free = 0, total = 0
  for (const r of [1.5, 2.5, 3.5]) {
    for (let i = 0; i < 24; i++) {
      const q = { x: c.x + Math.cos((i / 24) * Math.PI * 2) * r, z: c.z + Math.sin((i / 24) * Math.PI * 2) * r }
      total++
      if (Math.abs(q.x) < 21 && Math.abs(q.z) < 14 && terrainService.canEndAt(state, model, { x: q.x, y: 0, z: q.z }).ok) free++
    }
  }
  return free / total
}

/** Ground rows parallel to `axis`, each `offsets` entry inches from `centre` along the axis' normal, whose bases all pass canEndAt; the one with the most open ground around it wins (a unit boxed in by walls
 *  cannot be dragged anywhere in the e2e specs). */
function groundRowBeside(state: GameState, unitId: UnitId, centre: V2, axis: V2, n: number, spacing: number, offsets: number[]): { centre: V2; points: V2[]; open: number } {
  const model = state.models[state.units[unitId].models[0]]
  const normal = { x: -axis.z, z: axis.x }
  let best: { centre: V2; points: V2[]; open: number } | null = null as { centre: V2; points: V2[]; open: number } | null
  for (const d of offsets) {
    const c = { x: centre.x + normal.x * d, z: centre.z + normal.z * d }
    const points = Array.from({ length: n }, (_, i) => ({ x: c.x + (i - (n - 1) / 2) * spacing * axis.x, z: c.z + (i - (n - 1) / 2) * spacing * axis.z }))
    if (!points.every((q) => terrainService.canEndAt(state, model, { x: q.x, y: 0, z: q.z }).ok && Math.abs(q.x) < 21 && Math.abs(q.z) < 14)) continue
    const open = opennessAround(state, unitId, c)
    if (!best || open > best.open) best = { centre: c, points, open }
  }
  if (!best) throw new Error('scenario: no open ground beside the ruin floor')
  return best
}

/** The floor row (tallest floors first) with the most open ground beside it, with that ground row. */
function findFloorRowWithGround(state: GameState, floorUnit: UnitId, groundUnit: UnitId, n: number, spacing: number, offsets: number[]) {
  let best: { floor: { polygon: V2[]; height: number }; centre: V2; axis: V2; points: V2[]; ground: { centre: V2; points: V2[]; open: number } } | null = null
  for (const floor of upperFloors(state)) {
    const row = floorRow(state, floorUnit, floor, n, spacing)
    if (!row) continue
    let ground
    try { ground = groundRowBeside(state, groundUnit, row.centre, row.axis, n, spacing, offsets) } catch { continue }
    if (!best || ground.open > best.ground.open) best = { floor, ...row, ground }
    if (ground.open >= 0.85) break
  }
  if (!best) throw new Error('scenario: no ruin upper floor has room for ' + n + ' bases in a row with open ground beside it')
  return best
}

// Terrain-height: an INFANTRY unit stands on a ruin's upper floor and an enemy unit stands on the ground just
// beside it. Uses the first ruin on the board that has an upper floor.
const terrainHeight: ScenarioBuilder = (state) => {
  const me: UnitId = 'A:warriors'
  const foe: UnitId = 'B:warriors'
  keepModels(state, me, 3)
  keepModels(state, foe, 3)
  for (const id of [...state.units[me].models, ...state.units[foe].models]) state.models[id].base = { shape: 'round', radius: dia(32) / 2 }
  const spacing = 1.4
  const { ground, ...row } = findFloorRowWithGround(state, me, foe, 3, spacing, [3.5, -3.5, 3, -3, 4, -4])
  state.units[me].location = 'board'
  state.units[me].models.forEach((id, i) => setModelPos(state.models[id], { x: row.points[i].x, y: row.floor.height, z: row.points[i].z }))
  state.units[foe].location = 'board'
  state.units[foe].models.forEach((id, i) => setModelPos(state.models[id], { x: ground.points[i].x, y: 0, z: ground.points[i].z }))
  scenarioNotes.floorTarget = row.centre
}

// Space Marines in the Movement phase: 3 models of A's first unit stand on open ground just outside the ruin's upper floor,
// ready to move in (floor-picker + nudge e2e).
const floorPicker: ScenarioBuilder = (state) => {
  const ruin = Object.values(state.board.pieces).find((p) => p.kind === 'ruin' && p.floors.some((f) => f.height > 0))
  if (!ruin) throw new Error('floor-picker scenario: no ruin with an upper floor on the board')
  const xs = ruin.footprint.map((q) => q.x)
  const zs = ruin.footprint.map((q) => q.z)
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2
  const south = Math.min(...zs) - 0.78
  const me = Object.values(state.units).find((u) => u.player === 'A' && u.models.length >= 3 && !u.bodyguardUnitId)
  if (!me) throw new Error('floor-picker scenario: no A unit with 3+ models')
  keepModels(state, me.id, 3)
  for (const id of state.units[me.id].models) state.models[id].base = { shape: 'round', radius: dia(32) / 2 }
  // a single rank along x, already facing +z (into the ruin), tight against the wall: a floor climb eats 3" of the move
  state.units[me.id].location = 'board'
  state.units[me.id].models.forEach((id, i) => setModelPos(state.models[id], { x: midX + (i - 1) * 1.4, y: 0, z: south }, Math.PI / 2))
}

// Like floor-picker, but laid out for the WTC ruins (rotated, with L-shaped floors): finds a floor row where three bases fit
// (engine canEndAt), puts the unit in the same rank on open ground ~1.6" beside it and publishes the row's centre as
// window.__malletScenario.floorTarget (terrain-height e2e).
const floorClimb: ScenarioBuilder = (state) => {
  const me = Object.values(state.units).find((u) => u.player === 'A' && u.models.length >= 3 && !u.bodyguardUnitId)
  if (!me) throw new Error('floor-picker scenario: no A unit with 3+ models')
  keepModels(state, me.id, 3)
  for (const id of state.units[me.id].models) state.models[id].base = { shape: 'round', radius: dia(32) / 2 }
  const spacing = 1.4
  // a rank parallel to the floor row on open ground ~1.6" beside it (a floor climb eats 3" of the move), facing the row
  const { ground, ...row } = findFloorRowWithGround(state, me.id, me.id, 3, spacing, [1.6, -1.6, 1.3, -1.3, 1.8, -1.8])
  const facing = Math.atan2(row.centre.z - ground.centre.z, row.centre.x - ground.centre.x)
  state.units[me.id].location = 'board'
  state.units[me.id].models.forEach((id, i) => setModelPos(state.models[id], { x: ground.points[i].x, y: 0, z: ground.points[i].z }, facing))
  scenarioNotes.floorTarget = row.centre
  scenarioNotes.floorAxis = row.axis
}

// Space Marines in the Shooting phase: one A unit (see SHOOTING_SCENARIOS) 8" from two B units on open ground, side by
// side, so weapon-selection can aim different guns at different targets. Infernus (bolt pistol + pyreblaster) shows the
// Pistol rule; the Librarian (Smite / focused Smite profiles, storm bolter) shows profile groups and Hazardous.
const weaponSelect = (ref: string): ScenarioBuilder => (state) => {
  clearTerrain(state)
  const me = `A:${ref}`
  const foes: UnitId[] = ['B:terminator-squad', 'B:infernus-squad']
  for (const id of Object.keys(state.units)) {
    if (state.units[id].player === 'A' && id !== me) state.units[id].location = 'reserves'
  }
  for (const id of foes) keepModels(state, id, 3)
  for (const id of [me, ...foes]) setBase(state, id, 40)
  const line = (n: number, cx: number, z: number) => Array.from({ length: n }, (_, i) => ({ x: cx + (i - (n - 1) / 2) * 1.6, z }))
  place(state, me, line(state.units[me].models.length, 0, -8))
  place(state, foes[0], line(3, -5, 0))
  place(state, foes[1], line(3, 5, 0))
  for (const id of state.units[me].models) state.models[id].facing = Math.PI / 2
}

// Infernus with a mixed loadout: the sergeant swaps the pyreblaster for a storm bolter, so the sergeant and the four
// marines each need their own Pistol-or-other choice.
const weaponSelectSplit: ScenarioBuilder = (state) => {
  weaponSelect('infernus-squad')(state)
  const sergeant = state.models[state.units['A:infernus-squad'].models[0]]
  sergeant.weapons = sergeant.weapons.map((w) => (w === 'sm.w.pyreblaster' ? 'sm.w.storm-bolter' : w))
}

export const SCENARIOS: Record<string, ScenarioBuilder> = {
  'weapon-select-split': weaponSelectSplit,
  'weapon-select': weaponSelect('terminator-squad'),
  'weapon-select-mixed': weaponSelect('infernus-squad'),
  'weapon-select-psyker': weaponSelect('librarian-tantus'),
  'floor-picker': floorPicker,
  'floor-climb': floorClimb,
  'pile-in': pileIn,
  'pile-in-mixed': pileInMixed,
  'terrain-height': terrainHeight,
  // layout photo: units stay wherever setup left them (nothing is placed); pair with `?mission=<id>` to see each mission's terrain
  'layout-view': () => {},
}

/** Builds the scenario's game state positioned in the human's Fight phase, ready for the first decision. */
export async function buildScenario(name: string, seed = 'scenario', patrolId: string | null = patrolFromUrl()): Promise<ScenarioInit> {
  const build = SCENARIOS[name]
  if (!build) throw new Error(`unknown scenario "${name}" (known: ${Object.keys(SCENARIOS).join(', ')})`)
  const bundle = await loadBundle()
  registerDataBundle(bundle)
  const factionKey = SCENARIO_FACTIONS[name] ?? SCENARIO_FACTION
  const factionPatrols = Object.values(bundle.patrols).filter((p) => p.faction === `faction.${factionKey}` || p.faction === factionKey).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const patrol = (patrolId && factionPatrols.find((p) => p.id === patrolId)) || factionPatrols[0]
  if (!patrol) throw new Error(`scenario: no patrol for ${factionKey}`)
  const wanted = missionFromUrl()
  const mission = (wanted && (bundle.missions[wanted] ?? bundle.missions[`mission.${wanted}`])) || Object.values(bundle.missions)[0]
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
  if (typeof window !== 'undefined') (window as unknown as { __malletScenario?: unknown }).__malletScenario = { ...scenarioNotes }
  state.round = 1
  state.activePlayer = 'A'
  state.firstPlayer = 'A'
  const movement = MOVEMENT_SCENARIOS.has(name)
  const shootRef = SHOOTING_SCENARIOS[name]
  state.phase = movement ? 'movement' : shootRef ? 'shooting' : 'fight'
  state.pending = null
  const rng = new SeededRng(`${seed}:scenario`)
  const { ctx } = createContext(state, rng, DEFAULT_MODULES)
  DEFAULT_MODULES.phases[movement ? 'movement' : shootRef ? 'shooting' : 'fight'].enter(ctx)
  advanceGame(ctx, DEFAULT_MODULES)
  state.rng = rng.serialize()
  state.hash = ''
  state.hash = hashState(state)
  if (movement) {
    // pick A's scenario unit and declare a Normal move so the first prompt is its move destination
    let r = { state, pending: state.pending as PendingDecision | null }
    const pick = r.pending
    if (pick?.kind === 'chooseUnitToActivate' && pick.player === 'A') {
      const unitId = pick.context.eligible.find((id) => state.units[id].models.length === 3 && state.units[id].location === 'board') ?? pick.context.eligible[0]
      const s1 = step(state, { type: 'chooseUnitToActivate', player: 'A', decisionId: pick.id, unitId })
      if (!s1.rejection) {
        r = { state: s1.state, pending: s1.pending }
        if (r.pending?.kind === 'declareMove') {
          const s2 = step(r.state, { type: 'declareMove', player: 'A', decisionId: r.pending.id, unitId, moveType: 'normal' })
          if (!s2.rejection) r = { state: s2.state, pending: s2.pending }
        }
      }
    }
    return { bundle, setup, state: r.state, pending: r.pending }
  }
  if (shootRef) {
    // Shooting selection: take the scenario's unit so the first prompt is its declareTargets.
    let r = { state, pending: state.pending as PendingDecision | null }
    const pick = r.pending
    const unitId = `A:${shootRef}`
    if (pick?.kind === 'chooseUnitToActivate' && pick.player === 'A' && pick.context.eligible.includes(unitId)) {
      const s1 = step(state, { type: 'chooseUnitToActivate', player: 'A', decisionId: pick.id, unitId })
      if (!s1.rejection) r = { state: s1.state, pending: s1.pending }
    }
    return { bundle, setup, state: r.state, pending: r.pending }
  }
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

/** Reads the optional `?mission=<mission id>` (with or without the `mission.` prefix) that picks a scenario's mission; null when absent. */
export function missionFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('mission')
}

/** Reads the optional `?patrol=<patrol id>` from the URL; null when absent. */
export function patrolFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('patrol')
}

/** Starts the named scenario against the bot (human = A). Resolves once the store holds the game. */
export async function startScenario(name: string, opts: Partial<Pick<NewGameOptions, 'difficulty' | 'seed'>> = {}): Promise<void> {
  const init = await buildScenario(name, opts.seed ?? 'scenario')
  useGameStore.getState().startFromState(init, { opponent: 'bot', seed: opts.seed ?? 'scenario', difficulty: opts.difficulty })
}
