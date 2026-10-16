// Genestealer Cults Cult Ambush lifecycle (docs/spec/factions/genestealer-cults.md 7.1, GEN-2.1 to GEN-2.7): the engine part (c) of
// the faction. Lives next to the reducer (not under factions/) because reducer.ts and the phase modules call it for every game,
// as for deathblow.ts. The faction file re-exports it; the (b) code hook `cultAmbush` only needs `answerCultAmbush` + a no-op
// `onUnitDestroyed` marker.
// State lives in state.mission.custom.cultAmbush so the frozen GameState type is unchanged.
import type { ModelPlacement } from './actions'
import type { Action } from './actions'
import { pendingReactions, pushReaction, type ReactionRequest } from './code-hooks'
import { rollSum } from './dice'
import { EPS, horizontalGap, whollyOnBoard, type Footprint } from './geometry'
import type { EngineContext } from './modules'
import { otherPlayer } from './modules'
import { autoDeployPlacements } from './setup'
import { boardModelsOf, enemyModelsOnBoard, hasKeyword, spawnDestroyedUnitCopy } from './state'
import { terrainService } from './terrain'
import type { GameState, Model, PendingDecision, PlayerId, Polygon, Rejection, Unit, UnitId, Vec3 } from './types'

export const CULT_AMBUSH_CODE = 'cultAmbush'
export const CULT_AMBUSH_MARKER_RADIUS = 0.63 // 32 mm marker
export interface CultAmbushMarker { id: string; player: PlayerId; pos: Vec3; placedRound: number; sourceUnitId: UnitId }
export interface CultAmbushState {
  markers: CultAmbushMarker[]
  pool: Record<PlayerId, UnitId[]> // destroyed (original) unit ids waiting in Cult Ambush
  pendingMarkers: { player: PlayerId; unitId: UnitId }[] // successful rolls awaiting a placement decision
  seq: number // marker id counter -> `ca:<seq>`
  noRoll?: UnitId[] // CLA-2.5b: pool copies culled at the R-5.14 moment; their destruction does not roll Cult Ambush again
}

// the reaction kind is not in code-hooks' ReactionRequest union (that file belongs to the faction code-hook stage); the runtime
// does not care, so it is cast here
const CA_KIND = CULT_AMBUSH_CODE as ReactionRequest['kind']
const OFFERED_PREFIX = 'ca:offered:'
const RETURN_DONE = 'ca:returnDone'
export interface CultAmbushParams {
  battlelineBonus: number // Hand 3, Claw 0
  earlyRoundBonus: number // Hand 0, Claw 1: added while state.round <= earlyRoundsTo
  earlyRoundsTo: number // Claw 2
  success: number // Hand 4, Claw 5
  markerGap: number // 9
  firstRound: number // Hand 1, Claw 2: no return before this round (CLA-2.5a)
  lastRound: number // 3 for both
  whollyWithin: number | null // Claw 3: every placed model wholly within this many inches of the marker edge
  resetOneShot: boolean // Claw true: returned models start with oneShotUsed = [] (CLA-2.4)
  poolIsReserves: boolean // Claw true: culled at the R-5.14 moment (CLA-2.5b)
}
export const DEFAULT_CULT_AMBUSH_PARAMS: CultAmbushParams = {
  battlelineBonus: 3, earlyRoundBonus: 0, earlyRoundsTo: 2, success: 4, markerGap: 9, firstRound: 1, lastRound: 3,
  whollyWithin: null, resetOneShot: false, poolIsReserves: false,
}
const DEFAULT_PARAMS = DEFAULT_CULT_AMBUSH_PARAMS

const emptyState = (): CultAmbushState => ({ markers: [], pool: { A: [], B: [] }, pendingMarkers: [], seq: 0 })

// lazily creates state.mission.custom.cultAmbush (draft state only; read-only callers use peek)
export function cultAmbushState(state: GameState): CultAmbushState {
  const custom = state.mission.custom as Record<string, unknown>
  if (!custom[CULT_AMBUSH_CODE]) custom[CULT_AMBUSH_CODE] = emptyState()
  return custom[CULT_AMBUSH_CODE] as CultAmbushState
}
function peek(state: GameState): CultAmbushState {
  return ((state.mission.custom as Record<string, unknown>)[CULT_AMBUSH_CODE] as CultAmbushState | undefined) ?? emptyState()
}

export function cultAmbushAbilityId(state: GameState, unit: Unit): string | null {
  const ds = state.datasheets[unit.datasheetId]
  if (!ds) return null
  return ds.abilities.find((id) => state.abilities[id]?.code === CULT_AMBUSH_CODE) ?? null
}

// per-datasheet-ability parameters (the Claw variant is a patrol-scoped ability on the Metamorphs datasheet, not the army rule)
export function cultAmbushParams(state: GameState, unit: Unit): CultAmbushParams {
  const id = cultAmbushAbilityId(state, unit)
  const p = (id ? state.abilities[id]?.params : undefined) as Partial<CultAmbushParams> | undefined
  return { ...DEFAULT_PARAMS, ...(p ?? {}) }
}
const paramsOf = cultAmbushParams

const roundTo = (n: number): number => Math.round(n * 1000) / 1000
const markerFootprint = (pos: Vec3): Footprint => ({ pos, facing: 0, base: { shape: 'round', radius: CULT_AMBUSH_MARKER_RADIUS } })
function boardPolygonOf(state: GameState): Polygon {
  const hw = state.board.w / 2, hh = state.board.h / 2
  return [{ x: -hw, z: -hh }, { x: hw, z: -hh }, { x: hw, z: hh }, { x: -hw, z: hh }]
}

const PHASES_AFTER_MOVEMENT = new Set(['shooting', 'charge', 'fight'])

// GEN-2.6: can a unit destroyed now still come back? False once the last possible return has passed (round >= 4, or round 3
// after the opponent's Reinforcements step).
function returnStillPossible(state: GameState, owner: PlayerId, lastRound: number): boolean {
  if (state.round > lastRound) return false
  if (state.round < lastRound) return true
  const opp = otherPlayer(owner)
  if (state.activePlayer === owner) return opp !== state.firstPlayer // opponent's turn this round is still to come only when it is second
  if (PHASES_AFTER_MOVEMENT.has(state.phase)) return false
  if (state.phase === 'movement') return !state.phaseState.marks.includes(RETURN_DONE)
  return true
}

// ---------- GEN-2.1: the roll ----------
export function onCultAmbushUnitDestroyed(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit) return
  const abilityId = cultAmbushAbilityId(s, unit)
  if (!abilityId) return
  // CLA-2.5b: a unit culled while waiting in Reserves never reached the battlefield, so it does not roll again
  if (unit.location === 'reserves' || peek(s).noRoll?.includes(unitId)) return
  const params = paramsOf(s, unit)
  const battleline = hasKeyword(s, unitId, 'BATTLELINE')
  // the roll must not clobber the attack sequence's phaseState.lastRoll (rollOnce keeps checking it across windows)
  const prev = s.phaseState.lastRoll
  const roll = ctx.roll({
    purpose: 'ability', player: unit.player, sides: 6, count: 1, mode: 'sum', unitId, commandRerollable: false,
    modifiers: [
      ...(battleline && params.battlelineBonus !== 0 ? [{ source: 'BATTLELINE', value: params.battlelineBonus }] : []),
      ...(params.earlyRoundBonus !== 0 && s.round <= params.earlyRoundsTo ? [{ source: 'early rounds', value: params.earlyRoundBonus }] : []),
    ],
  })
  s.phaseState.lastRoll = prev
  const total = rollSum(roll)
  if (total < params.success) {
    ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unitId, targetUnitId: null, summary: `Cult Ambush: rolled ${total}, the unit is lost for good`, player: unit.player })
    return
  }
  const ca = cultAmbushState(s)
  if (!ca.pool[unit.player].includes(unitId)) ca.pool[unit.player].push(unitId)
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unitId, targetUnitId: null, summary: `Cult Ambush: rolled ${total}, the unit enters the ambush pool`, player: unit.player })
  if (returnStillPossible(s, unit.player, params.lastRound)) ca.pendingMarkers.push({ player: unit.player, unitId })
}

// ---------- GEN-2.7: marker candidates ----------
export function cultAmbushMarkerCandidates(state: GameState, player: PlayerId, sourceUnitId: UnitId): Vec3[] {
  const raw: { x: number; z: number }[] = []
  for (let x = -20; x <= 20; x += 4) for (let z = -12; z <= 12; z += 4) raw.push({ x, z })
  const src = state.units[sourceUnitId]
  const lastModels = [...(src?.destroyedModels ?? []), ...(src?.models ?? []).map((id) => state.models[id]).filter(Boolean)]
  if (lastModels.length > 0) {
    raw.push({ x: roundTo(lastModels.reduce((a, m) => a + m.pos.x, 0) / lastModels.length), z: roundTo(lastModels.reduce((a, m) => a + m.pos.z, 0) / lastModels.length) })
  }
  const enemies = enemyModelsOnBoard(state, player)
  const stub = { base: { shape: 'round', radius: CULT_AMBUSH_MARKER_RADIUS }, facing: 0 } as Model
  const gap = DEFAULT_PARAMS.markerGap
  const seen = new Set<string>()
  const out: Vec3[] = []
  for (const p of raw) {
    const key = `${p.x},${p.z}`
    if (seen.has(key)) continue
    seen.add(key)
    const pos: Vec3 = { x: p.x, y: 0, z: p.z }
    const fp = markerFootprint(pos)
    if (!whollyOnBoard(fp, state.board)) continue
    if (enemies.some((e) => horizontalGap(fp, e) <= gap + EPS)) continue
    if (!terrainService.canEndAt(state, stub, pos).ok) continue
    out.push(pos)
  }
  // AI convenience: the first candidate is the one nearest the closest objective the owner does not control
  const targets = Object.values(state.objectives).filter((o) => !o.removed && o.controller !== player)
  const nearest = (v: Vec3): number => (targets.length === 0 ? 0 : Math.min(...targets.map((o) => Math.hypot(o.pos.x - v.x, o.pos.z - v.z))))
  return out.sort((a, b) => nearest(a) - nearest(b) || a.x - b.x || a.z - b.z)
}

const ptId = (v: Vec3): string => `pt:${roundTo(v.x)},${roundTo(v.z)}`

// true = a decision was raised (the reducer returns instead of asking the phase module)
export function raisePendingCultAmbushMarker(ctx: EngineContext): boolean {
  const s = ctx.state
  if (s.pending || s.phase === 'ended') return false
  const ca = peek(s)
  if (ca.pendingMarkers.length === 0) return false
  const st = cultAmbushState(s)
  while (st.pendingMarkers.length > 0) {
    const head = st.pendingMarkers[0]
    const candidates = cultAmbushMarkerCandidates(s, head.player, head.unitId)
    if (candidates.length === 0) { st.pendingMarkers.shift(); continue } // no legal spot: no marker (the unit stays in the pool)
    const unit = s.units[head.unitId]
    ctx.decide({
      kind: 'chooseOption', player: head.player, window: 'any.unitDestroyed', canPass: false,
      context: { topic: 'abilityChoice', unitId: head.unitId, abilityId: unit ? cultAmbushAbilityId(s, unit) : null, data: { code: CULT_AMBUSH_CODE, step: 'marker', sourceUnitId: head.unitId } },
      options: [
        ...candidates.map((c) => ({ id: ptId(c), label: `marker at ${roundTo(c.x)}, ${roundTo(c.z)}`, action: { type: 'chooseOption', player: head.player, decisionId: '', optionId: ptId(c) } as Action })),
        { id: 'decline', label: 'no marker', action: { type: 'chooseOption', player: head.player, decisionId: '', optionId: 'decline' } as Action },
      ],
    })
    return true
  }
  return false
}

// ---------- GEN-2.2: removal ----------
export function cultAmbushOnMoveEnded(ctx: EngineContext, movedUnitId: UnitId): void {
  const s = ctx.state
  const ca = peek(s)
  if (ca.markers.length === 0) return
  const unit = s.units[movedUnitId]
  if (!unit) return
  const ids = [movedUnitId, unit.attachedLeaderId, unit.bodyguardUnitId].filter((id): id is UnitId => !!id && !!s.units[id])
  const models: Model[] = ids.flatMap((id) => (s.units[id].location === 'board' ? s.units[id].models.map((m) => s.models[m]).filter(Boolean) : []))
    .filter((m) => !hasKeyword(s, m.unitId, 'AIRCRAFT'))
  if (models.length === 0) return
  const st = cultAmbushState(s)
  for (const marker of [...st.markers]) {
    if (marker.player === unit.player) continue
    const fp = markerFootprint(marker.pos)
    if (!models.some((m) => horizontalGap(m, fp) <= DEFAULT_PARAMS.markerGap + EPS)) continue
    st.markers = st.markers.filter((m) => m.id !== marker.id)
    const src = s.units[marker.sourceUnitId]
    ctx.emit({
      type: 'AbilityTriggered', abilityId: (src && cultAmbushAbilityId(s, src)) ?? CULT_AMBUSH_CODE, sourceUnitId: marker.sourceUnitId, targetUnitId: movedUnitId,
      summary: 'Cult Ambush marker removed by an enemy move', player: marker.player,
    })
  }
}

// ---------- GEN-2.3 to 2.5: the return ----------
// the models a returning copy of `poolUnitId` would have (same ordering as spawnDestroyedUnitCopy), at full wounds
function copyModelsOf(state: GameState, poolUnitId: UnitId): Model[] {
  const src = state.units[poolUnitId]
  if (!src) return []
  const indexOf = (id: string): number => Number(id.slice(id.lastIndexOf('#') + 1))
  const byId = new Map<string, Model>()
  for (const m of src.destroyedModels ?? []) byId.set(m.id, m)
  for (const id of src.models) if (state.models[id]) byId.set(id, state.models[id])
  return [...byId.values()].sort((a, b) => indexOf(a.id) - indexOf(b.id))
}

// the one placement search both the AI candidate list and the "is a return possible" test use
// circle of radius (whollyWithin + marker radius) as an inscribed 32-gon, clipped to the board rectangle (CLA-2.3)
export function cultAmbushReturnRegion(state: GameState, markerPos: Vec3, whollyWithin: number): Polygon {
  const N = 32, r = whollyWithin + CULT_AMBUSH_MARKER_RADIUS
  type P = { x: number; z: number }
  let poly: Polygon = Array.from({ length: N }, (_, i) => ({ x: markerPos.x + r * Math.cos((2 * Math.PI * i) / N), z: markerPos.z + r * Math.sin((2 * Math.PI * i) / N) }))
  const hw = state.board.w / 2, hh = state.board.h / 2
  // Sutherland-Hodgman against the four board half-planes (the polygon is convex)
  const clip = (inside: (p: P) => boolean, cut: (a: P, b: P) => P): void => {
    const out: Polygon = []
    poly.forEach((cur, i) => {
      const prev = poly[(i + poly.length - 1) % poly.length]
      if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur) } else if (inside(prev)) out.push(cut(prev, cur))
    })
    poly = out
  }
  const atX = (x: number) => (a: P, b: P): P => ({ x, z: a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x) })
  const atZ = (z: number) => (a: P, b: P): P => ({ x: a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z), z })
  clip((p) => p.x >= -hw, atX(-hw)); clip((p) => p.x <= hw, atX(hw)); clip((p) => p.z >= -hh, atZ(-hh)); clip((p) => p.z <= hh, atZ(hh))
  return poly
}

export function cultAmbushArrivalPlacements(state: GameState, models: Model[], player: PlayerId, markerPos: Vec3,
  params: Pick<CultAmbushParams, 'markerGap' | 'whollyWithin'> = DEFAULT_PARAMS): ModelPlacement[] | null {
  const zone = params.whollyWithin === null ? boardPolygonOf(state) : cultAmbushReturnRegion(state, markerPos, params.whollyWithin)
  const placements = autoDeployPlacements(models, zone, boardModelsOf(state, player), enemyModelsOnBoard(state, player), {
    mustTouch: { pos: markerPos, radius: CULT_AMBUSH_MARKER_RADIUS }, minDistanceFromEnemies: params.markerGap,
    canPlace: (m, pos) => terrainService.canEndAt(state, m, pos).ok,
  })
  return placements
}

export function cultAmbushPlacementPossible(state: GameState, poolUnitId: UnitId, marker: CultAmbushMarker): boolean {
  const models = copyModelsOf(state, poolUnitId).map((m) => ({ ...m, pos: { x: 0, y: 0, z: 0 } }))
  if (models.length === 0) return false
  const src = state.units[poolUnitId]
  return cultAmbushArrivalPlacements(state, models, marker.player, marker.pos, src ? paramsOf(state, src) : DEFAULT_PARAMS) !== null
}

// encode / decode the marker position carried by a `cultAmbush` ReactionRequest (stratagemId) so the arrival decision knows what to touch
const reactionMarkerId = (pos: Vec3): string => `${CULT_AMBUSH_CODE}@${pos.x},${pos.z}`
export function cultAmbushReactionMarker(req: ReactionRequest): Vec3 | null {
  const m = /@(-?[\d.]+),(-?[\d.]+)$/.exec(req.stratagemId)
  return m ? { x: Number(m[1]), y: 0, z: Number(m[2]) } : null
}
export function pendingCultAmbushReactions(state: GameState): ReactionRequest[] { return pendingReactions(state, CA_KIND) }
export { CA_KIND as CULT_AMBUSH_REACTION_KIND }

// called at the end of the active player's Reinforcements step for the NON-active player's markers; re-entrant (offered
// markers are remembered in phase marks). 'pending' = a decision was raised.
export function cultAmbushReturnStep(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  const marks = s.phaseState.marks
  if (marks.includes(RETURN_DONE)) return 'done'
  const owner = otherPlayer(s.activePlayer)
  const ca = peek(s)
  const lastRound = DEFAULT_PARAMS.lastRound
  const finish = (): 'done' => { marks.push(RETURN_DONE); return 'done' }
  if (s.round > lastRound) return finish()
  for (;;) {
    const marker = peek(s).markers.find((m) => m.player === owner && !marks.includes(OFFERED_PREFIX + m.id))
    if (!marker) return finish()
    marks.push(OFFERED_PREFIX + marker.id)
    const options = ca.pool[owner].filter((u) => {
      if (!peek(s).pool[owner].includes(u)) return false
      const src = s.units[u]
      const p = src ? paramsOf(s, src) : DEFAULT_PARAMS
      return s.round >= p.firstRound && s.round <= p.lastRound && cultAmbushPlacementPossible(s, u, marker)
    })
    if (options.length === 0) continue
    ctx.decide({
      kind: 'chooseOption', player: owner, window: 'movement.reinforcements', canPass: false,
      context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { code: CULT_AMBUSH_CODE, step: 'return', markerId: marker.id } },
      options: [
        ...options.map((u) => ({ id: `unit:${u}`, label: `return ${s.units[u]?.name ?? u}`, action: { type: 'chooseOption', player: owner, decisionId: '', optionId: `unit:${u}` } as Action })),
        { id: 'decline', label: 'stay hidden', action: { type: 'chooseOption', player: owner, decisionId: '', optionId: 'decline' } as Action },
      ],
    })
    return 'pending'
  }
}

// answers the two chooseOption decisions (data.code 'cultAmbush'); the (b) hook's `answer` calls this
export function answerCultAmbush(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'cult ambush: chooseOption expected' }
  const s = ctx.state
  const step = pending.context.data.step
  const optionId = action.type === 'chooseOption' ? action.optionId : 'decline'
  const st = cultAmbushState(s)
  if (step === 'marker') {
    const sourceUnitId = pending.context.data.sourceUnitId as UnitId
    const idx = st.pendingMarkers.findIndex((p) => p.unitId === sourceUnitId && p.player === pending.player)
    if (idx >= 0) st.pendingMarkers.splice(idx, 1)
    const m = /^pt:(-?[\d.]+),(-?[\d.]+)$/.exec(optionId)
    if (!m) return
    const pos: Vec3 = { x: Number(m[1]), y: 0, z: Number(m[2]) }
    const marker: CultAmbushMarker = { id: `ca:${++st.seq}`, player: pending.player, pos, placedRound: s.round, sourceUnitId }
    st.markers.push(marker)
    const src = s.units[sourceUnitId]
    ctx.emit({ type: 'AbilityTriggered', abilityId: (src && cultAmbushAbilityId(s, src)) ?? CULT_AMBUSH_CODE, sourceUnitId, targetUnitId: null, summary: `Cult Ambush marker placed at ${pos.x}, ${pos.z}`, player: pending.player })
    return
  }
  if (step === 'return') {
    if (!optionId.startsWith('unit:')) return
    const unitId = optionId.slice(5)
    const markerId = pending.context.data.markerId as string
    const marker = st.markers.find((x) => x.id === markerId)
    const pool = st.pool[pending.player]
    if (!marker || !pool.includes(unitId)) return { code: 'E_NOT_AN_OPTION', reason: 'that unit cannot return at this marker' }
    const sources = copyModelsOf(s, unitId)
    const copy = spawnDestroyedUnitCopy(ctx, unitId)
    // GEN-2.5: the same unit returns, so spent One Shot weapons stay spent
    // CLA-2.4: the Claw variant returns a new identical unit with every One Shot weapon unspent
    const keepOneShot = !(s.units[unitId] && paramsOf(s, s.units[unitId]).resetOneShot)
    if (keepOneShot) copy.models.forEach((mid, i) => { const mm = s.models[mid]; if (mm && sources[i]) mm.oneShotUsed = [...sources[i].oneShotUsed] })
    st.pool[pending.player] = pool.filter((u) => u !== unitId)
    st.markers = st.markers.filter((x) => x.id !== markerId)
    pushReaction(ctx, { kind: CA_KIND, stratagemId: reactionMarkerId(marker.pos), player: pending.player, unitId: copy.id, enemyUnitId: null, window: 'movement.reinforcements', distance: null })
    const src = s.units[unitId]
    ctx.emit({ type: 'AbilityTriggered', abilityId: (src && cultAmbushAbilityId(s, src)) ?? CULT_AMBUSH_CODE, sourceUnitId: unitId, targetUnitId: copy.id, summary: 'Cult Ambush: the unit bursts from hiding', player: pending.player })
  }
}

// CLA-2.5b, R-5.14 moment: every pool unit that counts as being in Reserves is announced lost and counted as destroyed once more.
// Each is replaced by a spawned copy in Reserves (flagged so its destruction does not roll Cult Ambush again); cullStrandedReserves
// then destroys the copies through its normal path (UnitLostInReserves + UnitDestroyed). Call exactly once, at endOfRound3.
export function cultAmbushCullPool(ctx: EngineContext): void {
  const s = ctx.state
  if (peek(s).pool.A.length + peek(s).pool.B.length === 0) return
  const st = cultAmbushState(s)
  for (const pid of ['A', 'B'] as PlayerId[]) {
    for (const uid of [...st.pool[pid]]) {
      const src = s.units[uid]
      if (!src || !paramsOf(s, src).poolIsReserves) continue
      st.pool[pid] = st.pool[pid].filter((u) => u !== uid)
      st.markers = st.markers.filter((m) => m.sourceUnitId !== uid)
      st.pendingMarkers = st.pendingMarkers.filter((p) => p.unitId !== uid)
      const copy = spawnDestroyedUnitCopy(ctx, uid)
      copy.location = 'reserves'
      ;(st.noRoll ??= []).push(copy.id)
    }
  }
}
