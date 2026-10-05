// Necrons engine rules (docs/spec/factions/necrons.md §2, NEC-2.x): Reanimation Protocols. Owner: M10 necrons stage.
// Called by the Command phase module right before `command.end` (NEC-2.6) so returned models count for primary
// scoring. The code hook `reanimationProtocols` in code-hooks.ts only names the ability; this file does the work.
import {
  basesOverlap, coherencyNeighboursNeeded, inCoherencyRange, partlyWithinPolygon, roundVec3, whollyOnBoard, withinEngagementRange, type Footprint,
} from '../geometry'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { terrainService } from '../terrain'
import { modelStats, unitModels } from '../state'
import type { GameState, Model, Unit, UnitId, Vec3 } from '../types'

export const REANIMATION_CODE = 'reanimationProtocols'

// ability id carrying the code on this unit's datasheet, or null
export function reanimationAbilityId(state: GameState, unit: Unit): string | null {
  const ds = state.datasheets[unit.datasheetId]
  for (const id of ds?.abilities ?? []) if (state.abilities[id]?.code === REANIMATION_CODE) return id
  return null
}

function boardHalves(state: GameState, unitId: UnitId): Unit[] {
  return leaderService.halves(state, unitId).map((id) => state.units[id]).filter((u) => !!u && u.location === 'board')
}

// NEC-2.5: wounded model with the fewest wounds remaining; ties → CHARACTER first, then lowest index in the combined list
function pickWounded(state: GameState, halves: Unit[]): Model | null {
  const all = halves.flatMap((h) => unitModels(state, h.id))
  const wounded = all
    .map((m, index) => ({ m, index, character: state.datasheets[state.units[m.unitId].datasheetId].keywords.includes('CHARACTER') ? 0 : 1 }))
    .filter((x) => x.m.woundsRemaining < modelStats(state, x.m).W)
    .sort((a, b) => a.m.woundsRemaining - b.m.woundsRemaining || a.character - b.character || a.index - b.index)
  return wounded.length > 0 ? wounded[0].m : null
}

// candidate positions: rings around every living model of the unit, nearest-to-centroid first (deterministic)
function candidatePositions(models: Model[], base: Model['base']): Vec3[] {
  const out: Vec3[] = []
  const radius = Math.max(base.radius, base.radius2 ?? 0)
  for (const m of models) {
    const reach = Math.max(m.base.radius, m.base.radius2 ?? 0) + radius
    for (const gap of [0.05, 0.5, 1, 1.5]) {
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2
        out.push(roundVec3({ x: m.pos.x + Math.cos(ang) * (reach + gap), y: m.pos.y, z: m.pos.z + Math.sin(ang) * (reach + gap) }))
      }
    }
  }
  return out
}

// NEC-2.4 [interpretation]: wholly on the battlefield, no base overlap, in coherency, not newly in Engagement Range, not
// inside impassable terrain; the legal spot closest to the unit's centroid wins. Null when none exists.
export function findReturnSpot(state: GameState, unitId: UnitId, snapshot: Model): Vec3 | null {
  const halves = boardHalves(state, unitId)
  const mine = halves.flatMap((h) => unitModels(state, h.id))
  if (mine.length === 0) return null
  const centroid = { x: mine.reduce((a, m) => a + m.pos.x, 0) / mine.length, z: mine.reduce((a, m) => a + m.pos.z, 0) / mine.length }
  const player = state.units[unitId].player
  const everyone = Object.values(state.models)
  const enemyUnits = Object.values(state.units).filter((u) => u.player !== player && u.location === 'board')
  // enemy units the reanimating unit is already engaged with are exempt from the Engagement Range rule
  const alreadyEngaged = new Set(enemyUnits.filter((e) => leaderService.unitsInEngagement(state, unitId, e.id)).map((e) => e.id))
  const forbiddenTerrain = Object.values(state.board.pieces).filter((p) => p.traits.includes('impassable'))
  const needed = Math.min(coherencyNeighboursNeeded(mine.length + 1), mine.length)
  const ranked = candidatePositions(mine, snapshot.base)
    .map((pos, i) => ({ pos, i, d: Math.hypot(pos.x - centroid.x, pos.z - centroid.z) }))
    .sort((a, b) => (Math.abs(a.d - b.d) > 1e-6 ? a.d - b.d : a.i - b.i))
  for (const { pos: flat } of ranked) {
    // RC-102: try the neighbour's height, then the surface under the spot, then the ground; the first height where the
    // model may legally stand (not inside a wall/crate, not in mid-air, not on a barricade) with coherency intact wins
    const heights = [...new Set([flat.y, terrainService.heightAt(state, flat.x, flat.z), 0])]
    let pos: Vec3 | null = null
    for (const y of heights) {
      const cand = { ...flat, y }
      const cfp: Footprint = { pos: cand, facing: snapshot.facing, base: snapshot.base }
      if (!whollyOnBoard(cfp, state.board)) continue
      if (everyone.some((o) => basesOverlap(cfp, o))) continue
      if (forbiddenTerrain.some((p) => partlyWithinPolygon(cfp, p.footprint))) continue
      if (!terrainService.canEndAt(state, snapshot, cand).ok) continue
      if (mine.filter((m) => inCoherencyRange(cfp, m)).length < needed) continue
      pos = cand
      break
    }
    if (!pos) continue
    const fp: Footprint = { pos, facing: snapshot.facing, base: snapshot.base }
    let engaged = false
    for (const e of enemyUnits) {
      if (alreadyEngaged.has(e.id)) continue
      if (unitModels(state, e.id).some((em) => withinEngagementRange(fp, em))) { engaged = true; break }
    }
    if (!engaged) return pos
  }
  return null
}

// puts the snapshot back as a living model at `pos` (1 wound remaining); keeps id, loadout and one-shot usage
export function returnModel(ctx: EngineContext, unit: Unit, snapshot: Model, pos: Vec3, source: string): Model {
  const s = ctx.state
  const model: Model = {
    ...structuredClone(snapshot), pos, woundsRemaining: 1,
    flags: { allocatedThisPhase: false, inBaseContactWithEnemy: false, desperateEscapeTested: false },
  }
  s.models[model.id] = model
  unit.models = [...unit.models, model.id]
  unit.destroyedModels = unit.destroyedModels.filter((m) => m.id !== model.id)
  ctx.emit({ type: 'ModelReturned', unitId: unit.id, modelId: model.id, pos, source, player: unit.player })
  return model
}

// one Reanimation step for the (possibly attached) unit; false once nothing is left to do (NEC-2.2)
function reanimationStep(ctx: EngineContext, unitId: UnitId, source: string): boolean {
  const s = ctx.state
  const halves = boardHalves(s, unitId)
  const wounded = pickWounded(s, halves)
  if (wounded) {
    wounded.woundsRemaining += 1
    ctx.emit({ type: 'WoundsRegained', unitId: wounded.unitId, modelId: wounded.id, amount: 1, source, player: s.units[wounded.unitId].player })
    return true
  }
  for (const half of halves) {
    if (half.models.length >= half.startingStrength || (half.destroyedModels ?? []).length === 0) continue
    const snapshot = half.destroyedModels[half.destroyedModels.length - 1]
    const pos = findReturnSpot(s, unitId, snapshot)
    // no legal spot: the step is wasted, the model stays destroyed (NEC-2.4)
    if (pos) returnModel(ctx, half, snapshot, pos, source)
    return true
  }
  return false
}

// NEC-2.1 / NEC-2.3: once per own Command phase, one D3 per unit (attached pair rolled once under the bodyguard's id)
export function runReanimation(ctx: EngineContext): void {
  const s = ctx.state
  const player = s.activePlayer
  const units = Object.values(s.units)
    .filter((u) => u.player === player && u.location === 'board' && !u.bodyguardUnitId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const unit of units) {
    const source = boardHalves(s, unit.id).map((h) => reanimationAbilityId(s, h)).find((id) => id !== null) ?? null
    if (!source) continue
    const steps = ctx.rollExpr('D3', { purpose: 'ability', player, unitId: unit.id }).total
    ctx.emit({ type: 'AbilityTriggered', abilityId: source, sourceUnitId: unit.id, targetUnitId: unit.id, summary: `Reanimation Protocols: ${steps} step${steps === 1 ? '' : 's'}`, player })
    for (let i = 0; i < steps; i++) if (!reanimationStep(ctx, unit.id, source)) break
  }
}
