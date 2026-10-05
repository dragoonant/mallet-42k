// Game state construction and bookkeeping (W1-A): createGameState resolves Runtime* from the DataBundle, builds board,
// objectives, players, units and models; helpers for hashing, cloning and common lookups.
import type {
  AbilityDescriptor, AbilityRef, CombatPatrolData, DataBundle, DatasheetData, MissionData, PatrolUnitData, Stats, WeaponData,
} from '../data/types'
import type { CoreAbilityName } from '../data/types'
import { parseDiceExpr } from './dice'
import { mmToInch, transformPolygon } from './geometry'
import { hookService } from './hooks-impl'
import { otherPlayer, type EngineContext } from './modules'
import { createRng } from './rng'
import {
  EngineInvariantError,
  type Board, type GameSetup, type GameState, type Model, type ModelId, type Objective, type PhaseState, type Player,
  type PlayerId, type Polygon, type RuntimeAbility, type RuntimeDatasheet, type RuntimeModelProfile, type RuntimeWeapon,
  type TerrainPiece, type Unit, type UnitId, type UnitTurnState, type Vec3,
} from './types'

export const DEFAULT_HEIGHT_BY_ARCHETYPE: Record<string, number> = { infantry: 1.6, heavy: 2.0, monster: 3.5, vehicle: 3.0 }

export function emptyPhaseState(): PhaseState {
  return { activated: [], windowsOpened: [], marks: [], attack: null, charge: null, fight: null, battleShockQueue: [], lastRoll: null, deferredRemovals: [] }
}

export function emptyTurnState(): UnitTurnState {
  return {
    moveType: null, advanceRoll: null, chargedThisTurn: false, chargeRoll: null, shotThisPhase: false, foughtThisPhase: false,
    surgeMovedThisPhase: false, arrivedThisTurn: false, fightsFirst: false, fightsLast: false,
  }
}

export function unitIdFor(player: PlayerId, ref: string): UnitId { return `${player}:${ref}` }
export function modelIdFor(unitId: UnitId, index: number): ModelId { return `${unitId}#${index}` }

// ---------- hashing ----------
// canonical JSON: object keys sorted, arrays in order, no whitespace; undefined properties dropped
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

export function fnv1a(text: string, basis = 0x811c9dc5): number {
  let h = basis >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// state.hash covers everything except `log`, `hash` and the tables fully determined by (setup, dataVersion):
// datasheets, weapons, abilities, stratagems, board, setup, mission.data
export function hashState(state: GameState): string {
  const { log: _log, hash: _hash, datasheets: _d, weapons: _w, abilities: _a, stratagems: _s, board: _b, setup: _su, mission, ...rest } = state
  const { data: _md, ...missionRest } = mission
  const text = canonicalJson({ ...rest, mission: missionRest })
  return fnv1a(text).toString(16).padStart(8, '0') + fnv1a(text, 0x050c5d1f).toString(16).padStart(8, '0')
}

// ---------- cloning ----------
// a draft for one step: mutable copies of everything that changes; static tables and the log are shared
export function cloneForStep(state: GameState): GameState {
  return {
    ...state,
    players: structuredClone(state.players),
    units: structuredClone(state.units),
    models: structuredClone(state.models),
    objectives: structuredClone(state.objectives),
    mission: { ...state.mission, scored: [...state.mission.scored], custom: structuredClone(state.mission.custom) },
    phaseState: structuredClone(state.phaseState),
    pending: state.pending ? structuredClone(state.pending) : null,
    result: state.result ? { ...state.result, vp: { ...state.result.vp } } : null,
    log: state.log,
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

// ---------- lookups ----------
// C5 (Daemonic Fervour): a model destroyed in the Fight phase whose removal is deferred until it has fought stays in `unit.models` at 0
// wounds, tracked by a phase-scoped `deferredDeath:<json>` mark. It is "dead" for every purpose except its own last attack, so
// `unitModels` (the one place allocation pools, OC, coherency, targeting and visibility all read a unit's models from) skips it.
// Only a model at 0 wounds can be one, so the mark scan runs only for those.
export function isDeferredDead(state: GameState, modelId: ModelId): boolean {
  const needle = `"modelId":"${modelId}"`
  return state.phaseState.marks.some((m) => m.startsWith('deferredDeath:') && m.includes(needle))
}

// every model record of the unit, including E4 deferred-removal models (0 W, awaiting their last activation) but not C5 marked ones
export function unitModelsAll(state: GameState, unitId: UnitId): Model[] {
  const unit = state.units[unitId]
  if (!unit) throw new EngineInvariantError(`unknown unit ${unitId}`)
  const out: Model[] = []
  for (const id of unit.models) {
    const m = state.models[id]
    if (!m) throw new EngineInvariantError(`unit ${unitId} references missing model ${id}`)
    if (m.woundsRemaining <= 0 && isDeferredDead(state, id)) continue
    out.push(m)
  }
  return out
}

// the unit's living models: models whose removal is deferred (A Martyr's Death) are excluded everywhere — they cannot be
// targeted or allocated attacks, have no OC and do not count for coherency
export function unitModels(state: GameState, unitId: UnitId): Model[] {
  return unitModelsAll(state, unitId).filter((m) => !m.removalDeferred)
}

// attached units are one unit for coherency (R-10.1, LEAD-004): includes the attached leader / bodyguard models
export function unitModelsForCoherency(state: GameState, unitId: UnitId): Model[] {
  const unit = state.units[unitId]
  if (!unit) throw new EngineInvariantError(`unknown unit ${unitId}`)
  const models = unitModels(state, unitId)
  const partner = unit.attachedLeaderId ?? unit.bodyguardUnitId
  if (partner && state.units[partner] && state.units[partner].location === 'board') models.push(...unitModels(state, partner))
  return models
}

export function unitsOf(state: GameState, player: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.player === player)
}

export function boardUnitsOf(state: GameState, player: PlayerId): Unit[] {
  return unitsOf(state, player).filter((u) => u.location === 'board')
}

export function boardModelsOf(state: GameState, player: PlayerId): Model[] {
  const out: Model[] = []
  for (const u of boardUnitsOf(state, player)) out.push(...unitModels(state, u.id))
  return out
}

export function enemyModelsOnBoard(state: GameState, player: PlayerId): Model[] { return boardModelsOf(state, otherPlayer(player)) }

export function datasheetOf(state: GameState, unitId: UnitId): RuntimeDatasheet {
  const ds = state.datasheets[state.units[unitId]?.datasheetId]
  if (!ds) throw new EngineInvariantError(`unit ${unitId} has no datasheet`)
  return ds
}

export function modelProfile(state: GameState, model: Model): RuntimeModelProfile {
  const ds = datasheetOf(state, model.unitId)
  const p = ds.models.find((m) => m.modelId === model.datasheetModelId)
  if (!p) throw new EngineInvariantError(`model ${model.id}: profile ${model.datasheetModelId} missing on ${ds.id}`)
  return p
}

export function modelStats(state: GameState, model: Model): Stats { return modelProfile(state, model).stats }

// C1: keywords of one model = datasheet keywords + faction keywords + the model's own composition keywords
export function modelKeywordsOf(state: GameState, modelId: ModelId): string[] {
  const model = state.models[modelId]
  if (!model) throw new EngineInvariantError(`modelKeywordsOf: unknown model ${modelId}`)
  const ds = datasheetOf(state, model.unitId)
  const own = ds.models.find((m) => m.modelId === model.datasheetModelId)?.keywords
  return own && own.length > 0 ? [...new Set([...ds.keywords, ...ds.factionKeywords, ...own])] : [...ds.keywords, ...ds.factionKeywords]
}

// a unit's keywords: the union over its living models' keywords (datasheet-wide union when it has no models)
export function keywordsOf(state: GameState, unitId: UnitId): string[] {
  const ds = datasheetOf(state, unitId)
  const base = [...ds.keywords, ...ds.factionKeywords]
  if (!ds.models.some((m) => m.keywords && m.keywords.length > 0)) return base
  const unit = state.units[unitId]
  const out = new Set(base)
  if (unit && unit.models.length > 0) {
    for (const id of unit.models) {
      const model = state.models[id]
      const k = model ? ds.models.find((m) => m.modelId === model.datasheetModelId)?.keywords : undefined
      if (k) for (const w of k) out.add(w)
    }
  } else {
    for (const m of ds.models) for (const w of m.keywords ?? []) out.add(w)
  }
  return [...out]
}

export function hasKeyword(state: GameState, unitId: UnitId, keyword: string): boolean { return keywordsOf(state, unitId).includes(keyword) }

// core ability on the datasheet, or granted by an active grantKeyword effect whose text equals the ability name (space and
// underscore forms are the same name: Psychostatic Veil grants 'LONE OPERATIVE', the datasheet says LONE_OPERATIVE)
export function hasCoreAbility(state: GameState, unitId: UnitId, ability: CoreAbilityName): boolean {
  const ds = state.datasheets[state.units[unitId]?.datasheetId]
  if (ds?.coreAbilities.some((c) => c.ability === ability)) return true
  const norm = (s: string) => s.toUpperCase().replace(/[\s_]+/g, '_')
  const want = norm(ability)
  return (hookService.keywordsFor?.(state, unitId) ?? keywordsOf(state, unitId)).some((k) => norm(k) === want)
}

// ---------- mutation helpers (draft state only) ----------
export function setModelPos(model: Model, pos: Vec3, facing?: number): void {
  model.pos = { x: Math.round(pos.x * 1000) / 1000, y: Math.round(pos.y * 1000) / 1000, z: Math.round(pos.z * 1000) / 1000 }
  if (facing !== undefined) model.facing = facing
}

// remove a model from the game (no events, no hooks — callers emit ModelDestroyed/UnitDestroyed); returns true when the
// unit has no models left (its location becomes 'destroyed')
export function removeModel(state: GameState, modelId: ModelId): boolean {
  const model = state.models[modelId]
  if (!model) throw new EngineInvariantError(`removeModel: unknown model ${modelId}`)
  const unit = state.units[model.unitId]
  unit.destroyedModels = [...(unit.destroyedModels ?? []), structuredClone(model)]
  unit.models = unit.models.filter((id) => id !== modelId)
  delete state.models[modelId]
  if (unit.models.length === 0) {
    unit.location = 'destroyed'
    return true
  }
  return false
}

// Teeming Broods (Tyranids): a brand-new unit `${sourceUnitId}~${n}` (n = 1 + copies made so far) of the same datasheet and wargear as
// the source's first model (a destroyed source keeps its models in destroyedModels), modelCount models at full wounds,
// location 'reserves', startingStrength = modelCount, no effects / enhancement / leader. The source unit is left untouched.
export function spawnUnitCopy(state: GameState, sourceUnitId: UnitId, modelCount: number): Unit {
  const src = state.units[sourceUnitId]
  if (!src) throw new EngineInvariantError(`spawnUnitCopy: unknown unit ${sourceUnitId}`)
  const template = (src.models.length > 0 ? state.models[src.models[0]] : undefined) ?? src.destroyedModels?.[0]
  if (!template) throw new EngineInvariantError(`spawnUnitCopy: unit ${sourceUnitId} has no model to copy`)
  const prefix = `${sourceUnitId}~`
  const made = Object.keys(state.units).filter((id) => id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))).length
  const id: UnitId = `${prefix}${made + 1}`
  const profile = state.datasheets[src.datasheetId].models.find((m) => m.modelId === template.datasheetModelId)
  const W = profile?.stats.W ?? template.woundsRemaining
  const modelIds: ModelId[] = []
  for (let i = 0; i < modelCount; i++) {
    const mid = modelIdFor(id, i)
    state.models[mid] = {
      id: mid, unitId: id, datasheetModelId: template.datasheetModelId, pos: { x: 0, y: 0, z: 0 }, facing: 0, base: { ...template.base },
      height: template.height, woundsRemaining: W, weapons: [...template.weapons], oneShotUsed: [],
      flags: { allocatedThisPhase: false, inBaseContactWithEnemy: false, desperateEscapeTested: false },
    }
    modelIds.push(mid)
  }
  const unit: Unit = {
    id, player: src.player, ref: `${src.ref}~${made + 1}`, datasheetId: src.datasheetId, name: src.name, models: modelIds, startingStrength: modelCount,
    location: 'reserves', attachedLeaderId: null, bodyguardUnitId: null, battleShocked: false, battleShockExpiresRound: null,
    turn: emptyTurnState(), effects: [], enhancementId: null, isWarlord: false, deepStrikeWith: null, destroyedBy: null, destroyedModels: [],
  }
  state.units[id] = unit
  return unit
}

// C3 (Send in the Next Wave): a fresh copy of a destroyed unit, at full strength, set aside in Reserves. The new unit has id
// `${source}~${n}`; its models are rebuilt from the source's living and destroyed models (same datasheet model, weapons,
// base and height, full Wounds, no one-shot weapons used). No leader link, enhancement or warlord flag.
export function spawnDestroyedUnitCopy(ctx: EngineContext, sourceUnitId: UnitId): Unit {
  const s = ctx.state
  const src = s.units[sourceUnitId]
  if (!src) throw new EngineInvariantError(`spawnDestroyedUnitCopy: unknown unit ${sourceUnitId}`)
  const prefix = `${sourceUnitId}~`
  const n = 1 + Object.keys(s.units).filter((id) => id.startsWith(prefix)).length
  const newId = `${prefix}${n}`
  const indexOf = (id: string): number => Number(id.slice(id.lastIndexOf('#') + 1))
  const byId = new Map<string, Model>()
  for (const m of src.destroyedModels ?? []) byId.set(m.id, m)
  for (const id of src.models) if (s.models[id]) byId.set(id, s.models[id])
  const sources = [...byId.values()].sort((a, b) => indexOf(a.id) - indexOf(b.id))
  const ds = datasheetOf(s, sourceUnitId)
  const modelIds: ModelId[] = []
  sources.forEach((m, i) => {
    const id = modelIdFor(newId, i)
    const profile = ds.models.find((p) => p.modelId === m.datasheetModelId)
    s.models[id] = {
      id, unitId: newId, datasheetModelId: m.datasheetModelId, pos: { x: 0, y: 0, z: 0 }, facing: 0, base: { ...m.base }, height: m.height,
      woundsRemaining: profile ? profile.stats.W : m.woundsRemaining, weapons: [...m.weapons], oneShotUsed: [],
      flags: { allocatedThisPhase: false, inBaseContactWithEnemy: false, desperateEscapeTested: false },
    }
    modelIds.push(id)
  })
  const unit: Unit = {
    id: newId, player: src.player, ref: `${src.ref}~${n}`, datasheetId: src.datasheetId, name: src.name, models: modelIds,
    startingStrength: src.startingStrength, location: 'reserves', attachedLeaderId: null, bodyguardUnitId: null, battleShocked: false,
    battleShockExpiresRound: null, turn: emptyTurnState(), effects: [], enhancementId: null, isWarlord: false, deepStrikeWith: null,
    destroyedBy: null, destroyedModels: [],
  }
  s.units[newId] = unit
  ctx.emit({ type: 'UnitDeployed', unitId: newId, toReserves: true, player: src.player })
  return unit
}

// C5: which models have made at least one attack this battle (Gunnery Officer's Lone Operative lapses once a model has
// attacked); kept in mission.custom so the frozen GameState type is unchanged
export function recordModelAttacked(state: GameState, modelId: ModelId): void {
  const list = (state.mission.custom.attackedModelIds as ModelId[] | undefined) ?? []
  if (!list.includes(modelId)) state.mission.custom.attackedModelIds = [...list, modelId]
}
export function modelHasAttacked(state: GameState, modelId: ModelId): boolean {
  return ((state.mission.custom.attackedModelIds as ModelId[] | undefined) ?? []).includes(modelId)
}

// P4: sides chosen → player.side, objective homes (mission 'A' = attacker, 'B' = defender)
export function assignSides(state: GameState, attacker: PlayerId): void {
  const defender = otherPlayer(attacker)
  state.players[attacker].side = 'attacker'
  state.players[defender].side = 'defender'
  for (const o of state.mission.data.objectives) {
    const obj = state.objectives[o.id]
    if (obj) obj.home = o.home === 'A' ? attacker : o.home === 'B' ? defender : null
  }
}

export function deploymentZone(state: GameState, player: PlayerId): Polygon {
  const side = state.players[player].side
  if (!side) throw new EngineInvariantError('deploymentZone: sides not chosen yet')
  return side === 'attacker' ? state.mission.data.deploymentZones.A : state.mission.data.deploymentZones.B
}

// ---------- createGameState ----------
function req<T>(table: Record<string, T> | undefined, id: string, what: string): T {
  const v = table?.[id]
  if (v === undefined) throw new EngineInvariantError(`${what} '${id}' not found in data bundle`, { id, what })
  return v
}

function resolveAbility(bundle: DataBundle, ref: AbilityRef): AbilityDescriptor {
  return typeof ref === 'string' ? req(bundle.abilities, ref, 'ability') : ref
}

function validateDescriptorDice(d: AbilityDescriptor): void {
  const effects = d.effect === undefined ? [] : Array.isArray(d.effect) ? d.effect : [d.effect]
  for (const e of effects) {
    if (e.extraAttacks !== undefined) parseDiceExpr(e.extraAttacks)
    if (e.mortalWounds) parseDiceExpr(e.mortalWounds.count)
    if (e.move) parseDiceExpr(e.move.distance)
    if (e.setStat) parseDiceExpr(e.setStat.value)
  }
}

function toRuntimeWeapon(w: WeaponData): RuntimeWeapon {
  parseDiceExpr(w.A)
  parseDiceExpr(w.D)
  for (const a of w.abilities) if (a.value !== undefined) parseDiceExpr(a.value)
  if (typeof w.S !== 'number') {
    throw new EngineInvariantError(`weapon ${w.id}: S '${w.S}' is not supported (10th edition has no user Strength characteristic)`, { code: 'E_SCHEMA', id: w.id })
  }
  return { id: w.id, name: w.name, kind: w.type, range: w.range, A: w.A, skill: w.skill, S: w.S, AP: w.AP, D: w.D, abilities: w.abilities, profileGroup: w.profileGroup ?? null }
}

function toRuntimeDatasheet(ds: DatasheetData, abilityIds: string[], leaderEffectIds: string[]): RuntimeDatasheet {
  const models: RuntimeModelProfile[] = ds.composition.map((c) => ({
    modelId: c.modelId,
    name: c.name,
    champion: c.champion ?? false,
    base: { shape: c.base.shape, radius: mmToInch(c.base.mm) / 2, ...(c.base.mm2 !== undefined ? { radius2: mmToInch(c.base.mm2) / 2 } : {}) },
    height: DEFAULT_HEIGHT_BY_ARCHETYPE[c.figure?.archetype ?? ds.figure.archetype] ?? 1.6,
    stats: { ...ds.stats, ...(c.statsOverride ?? {}) },
    weapons: [...c.weapons.default],
    ...(c.keywords && c.keywords.length > 0 ? { keywords: [...c.keywords] } : {}),
  }))
  return {
    id: ds.id, name: ds.name, faction: ds.faction, keywords: ds.keywords, factionKeywords: ds.factionKeywords, stats: ds.stats,
    invuln: ds.invuln ?? null, models, abilities: abilityIds, coreAbilities: ds.coreAbilities,
    leader: ds.leader ? { attachTo: ds.leader.attachTo, effects: leaderEffectIds } : null,
    damaged: ds.damaged ?? null,
  }
}

function buildBoard(bundle: DataBundle, layoutId: string, mission: MissionData): Board {
  const layout = req(bundle.terrainLayouts, layoutId, 'terrain layout')
  const pieces: Record<string, TerrainPiece> = {}
  for (const p of layout.pieces) {
    const tf = (poly: Polygon) => transformPolygon(poly, p.pos, p.rot)
    pieces[p.id] = {
      id: p.id, kind: p.kind, pos: p.pos, rot: p.rot, footprint: tf(p.footprint), height: p.height, traits: p.traits,
      walls: (p.walls ?? []).map((w) => ({ ...w, a: tf([w.a])[0], b: tf([w.b])[0] })),
      floors: (p.floors ?? []).map((f) => ({ polygon: tf(f.polygon), height: f.height })),
    }
  }
  return { w: mission.board.w, h: mission.board.h, pieces, layoutId }
}

// C1: the enhancement bearer is the first model with the CHARACTER keyword, else the unit's first model
function enhancementBearer(unit: Unit, ds: RuntimeDatasheet, models: Record<ModelId, Model>): ModelId {
  const hasChar = (id: ModelId): boolean => ds.keywords.includes('CHARACTER') || ds.factionKeywords.includes('CHARACTER')
    || (ds.models.find((m) => m.modelId === models[id].datasheetModelId)?.keywords ?? []).includes('CHARACTER')
  return unit.models.find(hasChar) ?? unit.models[0]
}

export function createGameState(setup: GameSetup, bundle: DataBundle, seed: string, engineVersion: string): GameState {
  if (!bundle || typeof bundle !== 'object') throw new EngineInvariantError('createGame: data bundle required')
  const mission = req(bundle.missions, setup.missionId, 'mission')
  if (mission.terrainLayouts.length > 0 && !mission.terrainLayouts.includes(setup.terrainLayoutId)) {
    throw new EngineInvariantError(`terrain layout '${setup.terrainLayoutId}' is not allowed by mission '${mission.id}'`)
  }
  const board = buildBoard(bundle, setup.terrainLayoutId, mission)

  const datasheets: Record<string, RuntimeDatasheet> = {}
  const weapons: Record<string, RuntimeWeapon> = {}
  const abilities: Record<string, RuntimeAbility> = {}
  const stratagems: GameState['stratagems'] = {}
  const players = {} as Record<PlayerId, Player>
  const units: Record<UnitId, Unit> = {}
  const models: Record<ModelId, Model> = {}
  const secondaries = {} as GameState['mission']['secondaries']

  const addAbility = (ref: AbilityRef, source: RuntimeAbility['source'], bearerModelId: ModelId | null = null): string => {
    const d = resolveAbility(bundle, ref)
    validateDescriptorDice(d)
    let id = d.id
    if (abilities[id] && bearerModelId !== null && abilities[id].bearerModelId !== bearerModelId) id = `${d.id}@${bearerModelId}`
    if (!abilities[id]) {
      abilities[id] = { ...d, id, source, bearerModelId }
      // abilities that hand out other abilities as granted effects (Orders) register those too, so their params are readable
      const orderIds = d.params?.orderIds
      if (Array.isArray(orderIds)) for (const oid of orderIds) if (typeof oid === 'string') addAbility(oid, 'core')
    }
    return id
  }
  const addWeapon = (id: string): void => {
    if (!weapons[id]) weapons[id] = toRuntimeWeapon(req(bundle.weapons, id, 'weapon'))
  }
  const addDatasheet = (id: string): RuntimeDatasheet => {
    if (datasheets[id]) return datasheets[id]
    const ds = req(bundle.datasheets, id, 'datasheet')
    const abilityIds = ds.abilities.map((r) => addAbility(r, 'datasheet'))
    const leaderIds = (ds.leader?.effects ?? []).map((r) => addAbility(r, 'leader'))
    for (const c of ds.composition) {
      for (const w of c.weapons.default) addWeapon(w)
      for (const o of c.weapons.options ?? []) for (const w of o.with) addWeapon(w)
    }
    datasheets[id] = toRuntimeDatasheet(ds, abilityIds, leaderIds)
    return datasheets[id]
  }

  for (const s of Object.values(bundle.stratagems)) if (s.faction === 'core') stratagems[s.id] = s

  for (const pid of ['A', 'B'] as PlayerId[]) {
    const ps = setup.players[pid]
    if (!ps) throw new EngineInvariantError(`setup.players.${pid} missing`)
    const faction = req(bundle.factions, ps.faction, 'faction')
    const patrol: CombatPatrolData = req(bundle.patrols, ps.patrolId, 'combat patrol')
    if (patrol.faction !== faction.id) throw new EngineInvariantError(`patrol '${patrol.id}' does not belong to faction '${faction.id}'`)
    if (!faction.combatPatrols.includes(patrol.id)) throw new EngineInvariantError(`faction '${faction.id}' does not list patrol '${patrol.id}'`)
    if (!patrol.enhancements.some((e) => e.id === ps.enhancementId)) throw new EngineInvariantError(`enhancement '${ps.enhancementId}' is not offered by patrol '${patrol.id}'`)
    const secondary = patrol.secondaries.find((s) => s.id === ps.secondaryId)
    if (!secondary) throw new EngineInvariantError(`secondary '${ps.secondaryId}' is not offered by patrol '${patrol.id}'`)
    secondaries[pid] = secondary.scoring
    for (const sid of patrol.stratagems) stratagems[sid] = req(bundle.stratagems, sid, 'stratagem')
    const armyRuleId = addAbility(faction.armyRule, 'core')
    // Orders (Astra Militarum Voice of Command) are ability records that sit on no datasheet and are only granted as ActiveEffects
    for (const orderId of (abilities[armyRuleId].params?.orderIds as string[] | undefined) ?? []) addAbility(orderId, 'core')

    const refs = new Set<string>()
    let warlordUnitId: UnitId | null = null
    // E5 Patrol Squads: units named in splitUnits are replaced by their listed parts (each its own unit)
    const split = new Set(ps.splitUnits ?? [])
    for (const ref of split) {
      const base = patrol.units.find((u) => u.ref === ref)
      if (!base?.patrolSquads?.length) throw new EngineInvariantError(`splitUnits: '${ref}' is not a Patrol Squads unit of patrol '${patrol.id}'`)
    }
    // E1 unit choice: every group fields exactly one of its refs; the others are never created
    const skippedRefs = new Set<string>()
    const choices = ps.unitChoices ?? {}
    for (const gid of Object.keys(choices)) {
      const g = (patrol.unitChoices ?? []).find((c) => c.id === gid)
      if (!g) throw new EngineInvariantError(`unitChoices: unknown group '${gid}' for patrol '${patrol.id}'`)
      if (!g.refs.includes(choices[gid])) throw new EngineInvariantError(`unitChoices: '${choices[gid]}' is not in group '${gid}'`)
    }
    for (const g of patrol.unitChoices ?? []) {
      const picked = choices[g.id] ?? g.default
      for (const r of g.refs) if (r !== picked) skippedRefs.add(r)
    }
    const patrolUnits: (PatrolUnitData & { fromSplit: boolean })[] = patrol.units.filter((pu) => !skippedRefs.has(pu.ref)).flatMap((pu): (PatrolUnitData & { fromSplit: boolean })[] => (split.has(pu.ref) && pu.patrolSquads
      ? pu.patrolSquads.map((part) => ({ ref: part.ref, datasheet: pu.datasheet, size: part.size, wargear: part.wargear, fromSplit: true, ...(pu.enhancement ? { enhancement: pu.enhancement } : {}) }))
      : [{ ...pu, fromSplit: false }]))
    for (const pu of patrolUnits) {
      if (refs.has(pu.ref)) throw new EngineInvariantError(`patrol '${patrol.id}': duplicate unit ref '${pu.ref}'`)
      refs.add(pu.ref)
      const ds = addDatasheet(pu.datasheet)
      const data = bundle.datasheets[pu.datasheet]
      const unitId = unitIdFor(pid, pu.ref)
      // composition counts: defaults, with the difference absorbed by the last non-champion entry
      // (a Patrol Squads part takes its model counts from its own wargear list, outside the datasheet's min/max)
      const counts = pu.fromSplit
        ? data.composition.map((c) => (pu.wargear ?? []).filter((w) => w.modelId === c.modelId).reduce((n, w) => n + w.count, 0))
        : data.composition.map((c) => c.default)
      let diff = pu.size - counts.reduce((a, b) => a + b, 0)
      for (let i = data.composition.length - 1; i >= 0 && diff !== 0 && !pu.fromSplit; i--) {
        const c = data.composition[i]
        if (c.champion) continue
        const target = Math.max(c.min, Math.min(c.max, counts[i] + diff))
        diff -= target - counts[i]
        counts[i] = target
      }
      if (diff !== 0) throw new EngineInvariantError(`unit '${pu.ref}': size ${pu.size} cannot be met by datasheet '${ds.id}' composition`)
      const modelIds: ModelId[] = []
      const wargearLeft = (pu.wargear ?? []).map((w) => ({ ...w, count: w.count }))
      let index = 0
      data.composition.forEach((c, ci) => {
        const profile = ds.models[ci]
        for (let n = 0; n < counts[ci]; n++) {
          const id = modelIdFor(unitId, index++)
          let weaponList = [...profile.weapons]
          const wg = wargearLeft.find((w) => w.modelId === c.modelId && w.count > 0)
          if (wg) {
            wg.count--
            weaponList = [...wg.weapons]
            for (const w of weaponList) addWeapon(w)
          }
          models[id] = {
            id, unitId, datasheetModelId: c.modelId, pos: { x: 0, y: 0, z: 0 }, facing: 0, base: { ...profile.base }, height: profile.height,
            woundsRemaining: profile.stats.W, weapons: weaponList, oneShotUsed: [],
            flags: { allocatedThisPhase: false, inBaseContactWithEnemy: false, desperateEscapeTested: false },
          }
          modelIds.push(id)
        }
      })
      const isWarlord = pu.ref === patrol.warlord
      if (isWarlord) warlordUnitId = unitId
      units[unitId] = {
        id: unitId, player: pid, ref: pu.ref, datasheetId: ds.id, name: ds.name, models: modelIds, startingStrength: modelIds.length,
        location: 'reserves', attachedLeaderId: null, bodyguardUnitId: null, battleShocked: false, battleShockExpiresRound: null,
        turn: emptyTurnState(), effects: [], enhancementId: null, isWarlord, deepStrikeWith: null, destroyedBy: null, destroyedModels: [],
      }
    }
    if (!warlordUnitId) throw new EngineInvariantError(`patrol '${patrol.id}': warlord ref '${patrol.warlord}' not found`)

    // enhancement on the warlord (CP-1.4)
    const enh = req(bundle.enhancements, ps.enhancementId, 'enhancement')
    const wl = units[warlordUnitId]
    const wlDs = datasheets[wl.datasheetId]
    const wlKeywords = [...wlDs.keywords, ...wlDs.factionKeywords, ...wl.models.flatMap((id) => wlDs.models.find((m) => m.modelId === models[id].datasheetModelId)?.keywords ?? [])]
    for (const k of enh.restriction.keyword ?? []) if (!wlKeywords.includes(k)) throw new EngineInvariantError(`enhancement '${enh.id}' requires keyword ${k} on the warlord`)
    for (const k of enh.restriction.notKeyword ?? []) if (wlKeywords.includes(k)) throw new EngineInvariantError(`enhancement '${enh.id}' cannot be taken by a ${k} warlord`)
    if (enh.choice) {
      if (!ps.enhancementChoice) throw new EngineInvariantError(`enhancement '${enh.id}' requires enhancementChoice.unitRef`)
      const chosen = units[unitIdFor(pid, ps.enhancementChoice.unitRef)]
      if (!chosen) throw new EngineInvariantError(`enhancementChoice unit '${ps.enhancementChoice.unitRef}' not found for player ${pid}`)
      const ck = [...datasheets[chosen.datasheetId].keywords, ...datasheets[chosen.datasheetId].factionKeywords]
      if (!ck.includes(enh.choice.unitKeyword)) throw new EngineInvariantError(`enhancementChoice unit must have keyword ${enh.choice.unitKeyword}`)
      chosen.deepStrikeWith = wl.id
      wl.deepStrikeWith = chosen.id
    } else if (ps.enhancementChoice) {
      throw new EngineInvariantError(`enhancement '${enh.id}' takes no enhancementChoice`)
    }
    wl.enhancementId = enh.id
    const enhDescriptor = resolveAbility(bundle, enh.effect)
    const enhAbilityId = addAbility({ ...enhDescriptor, scope: enhDescriptor.scope ?? { who: 'bearer' } }, 'enhancement', enhancementBearer(wl, wlDs, models))
    void enhAbilityId

    // leader attachments (R-10.1)
    for (const att of ps.attachments) {
      if (skippedRefs.has(att.leaderRef) || skippedRefs.has(att.bodyguardRef)) continue
      const leader = units[unitIdFor(pid, att.leaderRef)]
      const bodyguard = units[unitIdFor(pid, att.bodyguardRef)]
      if (!leader || !bodyguard) throw new EngineInvariantError(`attachment ${att.leaderRef} → ${att.bodyguardRef}: unit not found for player ${pid}`)
      const lds = datasheets[leader.datasheetId]
      if (!lds.leader || !lds.leader.attachTo.includes(bodyguard.datasheetId)) throw new EngineInvariantError(`'${leader.ref}' cannot lead '${bodyguard.ref}'`)
      if (bodyguard.attachedLeaderId) throw new EngineInvariantError(`'${bodyguard.ref}' already has a leader`)
      if (leader.bodyguardUnitId) throw new EngineInvariantError(`'${leader.ref}' is already attached`)
      leader.bodyguardUnitId = bodyguard.id
      bodyguard.attachedLeaderId = leader.id
    }

    // reserves (CP-1.9: Deep Strike is the only route, or a Tellyporta pairing)
    for (const ref of ps.reserves) {
      if (skippedRefs.has(ref)) continue
      const u = units[unitIdFor(pid, ref)]
      if (!u) throw new EngineInvariantError(`reserves unit '${ref}' not found for player ${pid}`)
      const ds = datasheets[u.datasheetId]
      const canDeepStrike = ds.coreAbilities.some((c) => c.ability === 'DEEP_STRIKE') || u.deepStrikeWith !== null
      if (!canDeepStrike) throw new EngineInvariantError(`unit '${ref}' cannot start in Reserves (no Deep Strike)`)
    }

    players[pid] = {
      id: pid, name: ps.name, faction: faction.id, patrolId: patrol.id, side: null, cp: 0, vp: 0, vpBySource: {}, cpGainedThisRound: 0,
      stratagemUses: [], oncePerBattleUsed: [], enhancementId: enh.id, secondaryId: secondary.id, warlordUnitId, oathTargetUnitId: null,
      waaagh: { used: false, activeRound: null }, commandRerollLocked: false, battleReadyVp: ps.battleReadyVp ?? 0, secondaryState: {},
      miracle: { dice: [], spentThisPhase: [] },
    }
  }

  const objectives: Record<string, Objective> = {}
  for (const o of mission.objectives) {
    objectives[o.id] = {
      id: o.id, pos: { x: o.x, z: o.z }, home: null, controller: null, securedBy: null, stickyBy: null, claimedBy: null,
      controllerAtTurnStart: null, removed: false, used: false, lootedBy: [], tag: null,
    }
  }

  deepFreeze(datasheets); deepFreeze(weapons); deepFreeze(abilities); deepFreeze(stratagems); deepFreeze(board)

  const state: GameState = {
    engineVersion,
    dataVersion: setup.dataVersion,
    seed,
    rng: createRng(seed).serialize(),
    setup,
    round: 0,
    activePlayer: 'A',
    firstPlayer: 'A',
    phase: 'setup',
    step: 'none',
    players,
    units,
    models,
    datasheets,
    weapons,
    abilities,
    stratagems,
    board,
    objectives,
    mission: { id: mission.id, data: mission, scoring: mission.scoring, rules: mission.rules ?? [], secondaries, scored: [], custom: {} },
    phaseState: emptyPhaseState(),
    pending: null,
    decisionCounter: 0,
    rollCounter: 0,
    log: [],
    hash: '',
    result: null,
  }
  if (setup.sides !== 'rollOff') assignSides(state, setup.sides.attacker)
  return state
}
