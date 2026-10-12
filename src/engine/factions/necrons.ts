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
import type { Action } from '../actions'
import type { GameState, Model, PendingDecision, Rejection, Unit, UnitId, Vec3 } from '../types'

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

const LEFT_PREFIX = 'rean:left:'
const DONE_PREFIX = 'rean:done:'

function stepsLeft(s: GameState, unitId: UnitId): number | null {
  const m = s.phaseState.marks.find((x) => x.startsWith(`${LEFT_PREFIX}${unitId}:`))
  return m ? Number(m.slice(m.lastIndexOf(':') + 1)) : null
}
function setStepsLeft(s: GameState, unitId: UnitId, n: number): void {
  const marks = s.phaseState.marks
  const i = marks.findIndex((x) => x.startsWith(`${LEFT_PREFIX}${unitId}:`))
  if (i >= 0) marks.splice(i, 1)
  marks.push(`${LEFT_PREFIX}${unitId}:${n}`)
}

// RC-066: the owner picks which destroyed model returns. One entry per distinct kind of model (model type + wargear),
// most recently destroyed first, so the first option is the default the bot and the timeout take.
function returnCandidates(half: Unit): Model[] {
  const seen = new Set<string>()
  const out: Model[] = []
  for (const m of [...(half.destroyedModels ?? [])].reverse()) {
    const key = `${m.datasheetModelId}|${[...m.weapons].sort().join(',')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
  }
  return out
}

type StepResult = 'done' | 'none' | 'pending'

// one Reanimation step for the (possibly attached) unit (NEC-2.2); 'none' once nothing is left to do, 'pending' when the
// owner has to choose which destroyed model returns (the answer finishes the step)
function reanimationStep(ctx: EngineContext, unitId: UnitId, source: string): StepResult {
  const s = ctx.state
  const halves = boardHalves(s, unitId)
  const wounded = pickWounded(s, halves)
  if (wounded) {
    wounded.woundsRemaining += 1
    ctx.emit({ type: 'WoundsRegained', unitId: wounded.unitId, modelId: wounded.id, amount: 1, source, player: s.units[wounded.unitId].player })
    return 'done'
  }
  for (const half of halves) {
    if (half.models.length >= half.startingStrength || (half.destroyedModels ?? []).length === 0) continue
    const cands = returnCandidates(half)
    if (cands.length > 1) {
      const player = s.units[unitId].player
      ctx.decide({
        kind: 'chooseOption', player, window: 'command.end', canPass: false,
        context: { topic: 'abilityChoice', unitId: half.id, abilityId: source, data: { code: REANIMATION_CODE, unitId, halfId: half.id } },
        options: cands.map((m) => {
          const guns = m.weapons.map((w) => s.weapons[w]?.name ?? w).join(' + ')
          return { id: m.id, label: `Return a ${half.name} model armed with ${guns}`, action: { type: 'chooseOption', player, decisionId: '', optionId: m.id } }
        }),
      })
      return 'pending'
    }
    placeReturned(ctx, unitId, half, cands[0], source)
    return 'done'
  }
  return 'none'
}

// no legal spot: the step is wasted, the model stays destroyed (NEC-2.4)
function placeReturned(ctx: EngineContext, unitId: UnitId, half: Unit, snapshot: Model, source: string): void {
  const pos = findReturnSpot(ctx.state, unitId, snapshot)
  if (pos) returnModel(ctx, half, snapshot, pos, source)
}

// answers the "which model returns" decision (data.code 'reanimationProtocols'); the engine then resumes the Command phase
export function answerReanimation(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (pending.kind !== 'chooseOption' || action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'reanimation: chooseOption expected' }
  const s = ctx.state
  const unitId = pending.context.data.unitId as UnitId
  const half = s.units[pending.context.data.halfId as UnitId]
  const snapshot = half?.destroyedModels.find((m) => m.id === action.optionId)
  if (!half || !snapshot) return { code: 'E_NOT_AN_OPTION', reason: 'that model cannot return' }
  placeReturned(ctx, unitId, half, snapshot, pending.context.abilityId ?? REANIMATION_CODE)
  setStepsLeft(s, unitId, Math.max(0, (stepsLeft(s, unitId) ?? 1) - 1))
}

// NEC-2.1 / NEC-2.3: once per own Command phase, one D3 per unit (attached pair rolled once under the bodyguard's id).
// Re-entrant: progress lives in phase marks so a pending choice resumes where it stopped.
export function runReanimation(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  const player = s.activePlayer
  const units = Object.values(s.units)
    .filter((u) => u.player === player && u.location === 'board' && !u.bodyguardUnitId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const unit of units) {
    if (s.phaseState.marks.includes(DONE_PREFIX + unit.id)) continue
    const source = boardHalves(s, unit.id).map((h) => reanimationAbilityId(s, h)).find((id) => id !== null) ?? null
    if (!source) continue
    if (stepsLeft(s, unit.id) === null) {
      const steps = ctx.rollExpr('D3', { purpose: 'ability', player, unitId: unit.id }).total
      ctx.emit({ type: 'AbilityTriggered', abilityId: source, sourceUnitId: unit.id, targetUnitId: unit.id, summary: `Reanimation Protocols: ${steps} step${steps === 1 ? '' : 's'}`, player })
      setStepsLeft(s, unit.id, steps)
    }
    for (;;) {
      const left = stepsLeft(s, unit.id) ?? 0
      if (left <= 0) break
      const r = reanimationStep(ctx, unit.id, source)
      if (r === 'pending') return 'pending'
      setStepsLeft(s, unit.id, r === 'none' ? 0 : left - 1)
    }
    s.phaseState.marks.push(DONE_PREFIX + unit.id)
  }
  return 'done'
}
