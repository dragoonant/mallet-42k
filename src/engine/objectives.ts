// Objective control (R-12.1–R-12.3, CP-2.4–CP-2.6). Owner: W1-F. The core calls evaluateControl at the start of every
// turn (snapshot controllerAtTurnStart), at the end of every phase and every turn; scoring rules call it when needed.
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, withinObjectiveRange } from './geometry'
import { hookService } from './hooks-impl'
import type { EngineContext } from './modules'
import { otherPlayer } from './modules'
import { boardUnitsOf, keywordsOf, modelStats, unitModels } from './state'
import type { GameState, ModelId, Objective, ObjectiveId, PlayerId } from './types'

export type ControlMoment = 'turnStart' | 'phaseEnd' | 'turnEnd' | 'rule'

export interface ObjectiveService {
  modelsInRange(state: GameState, objectiveId: ObjectiveId, player: PlayerId): ModelId[]
  // R-12.2: Σ OC of models within range (Battle-shocked → 0), OC modified by onStatQuery hooks, floored at 0 (R-1.9)
  levelOfControl(state: GameState, objectiveId: ObjectiveId): Record<PlayerId, number>
  // R-12.3 + secured/sticky flags; updates Objective.controller and emits ObjectiveControlChanged on change
  evaluateControl(ctx: EngineContext, moment: ControlMoment): void
  controller(state: GameState, objectiveId: ObjectiveId): PlayerId | null
}

function objectiveRangeParams(state: GameState): { range: number; radius: number } {
  return { range: state.mission.data.objectiveRange ?? OBJECTIVE_RANGE, radius: state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS }
}

// CP-2.4: ≥1 of the controlling player's non-Battle-shocked BATTLELINE units within range of the marker
function hasSecuringBattleline(state: GameState, objectiveId: ObjectiveId, player: PlayerId): boolean {
  const obj = state.objectives[objectiveId]
  if (!obj) return false
  const { range, radius } = objectiveRangeParams(state)
  for (const unit of boardUnitsOf(state, player)) {
    if (unit.battleShocked) continue
    if (!keywordsOf(state, unit.id).includes('BATTLELINE')) continue
    if (unitModels(state, unit.id).some((m) => withinObjectiveRange(m, obj, 0, range, radius))) return true
  }
  return false
}

// ---------- Claim Sites (11-combat-patrol §2.5, Display of Might) ----------
// Every CHARACTER model in range when a site is claimed claims it together; the claim lasts while ANY of them stays on
// the board within range. Objective.claimedBy (frozen type) records one representative model, so the full claimer set
// lives in mission.custom under `claimers:<objectiveId>`.
function claimersKey(objectiveId: ObjectiveId): string { return `claimers:${objectiveId}` }

export function recordClaim(state: GameState, obj: Objective, player: PlayerId, modelIds: ModelId[]): void {
  obj.claimedBy = { player, modelId: modelIds[0], sinceTurn: state.round }
  state.mission.custom[claimersKey(obj.id)] = [...modelIds]
}

function claimModelIds(state: GameState, obj: Objective): ModelId[] {
  const c = obj.claimedBy
  if (!c) return []
  const stored = state.mission.custom[claimersKey(obj.id)]
  // a stale list from an earlier claim (or none at all) falls back to the recorded representative
  return Array.isArray(stored) && stored.includes(c.modelId) ? (stored as ModelId[]) : [c.modelId]
}

// the claiming models that are still on the board and within range of the site right now
export function liveClaimers(state: GameState, obj: Objective): ModelId[] {
  const c = obj.claimedBy
  if (!c || obj.removed) return []
  const { range, radius } = objectiveRangeParams(state)
  return claimModelIds(state, obj).filter((mid) => {
    const model = state.models[mid]
    const unit = model && state.units[model.unitId]
    return !!unit && unit.player === c.player && unit.location === 'board' && withinObjectiveRange(model, obj, 0, range, radius)
  })
}

// drops a claim (of either player) none of whose claimers is still in range; otherwise keeps sinceTurn and rotates
// the representative modelId to a surviving claimer (MISSION-025-coclaim / -deadclaimant / MISSION-024-return)
export function pruneClaim(state: GameState, obj: Objective): void {
  if (obj.removed) return
  if (!obj.claimedBy) { delete state.mission.custom[claimersKey(obj.id)]; return }
  const live = liveClaimers(state, obj)
  if (live.length === 0) {
    obj.claimedBy = null
    delete state.mission.custom[claimersKey(obj.id)]
    return
  }
  if (!live.includes(obj.claimedBy.modelId)) obj.claimedBy = { ...obj.claimedBy, modelId: live[0] }
  state.mission.custom[claimersKey(obj.id)] = live
}

export const objectiveService: ObjectiveService = {
  modelsInRange(state, objectiveId, player) {
    const obj = state.objectives[objectiveId]
    if (!obj || obj.removed) return []
    const { range, radius } = objectiveRangeParams(state)
    const out: ModelId[] = []
    for (const unit of boardUnitsOf(state, player)) {
      for (const m of unitModels(state, unit.id)) if (withinObjectiveRange(m, obj, 0, range, radius)) out.push(m.id)
    }
    return out
  },
  levelOfControl(state, objectiveId) {
    const levels: Record<PlayerId, number> = { A: 0, B: 0 }
    for (const player of ['A', 'B'] as PlayerId[]) {
      for (const id of objectiveService.modelsInRange(state, objectiveId, player)) {
        const model = state.models[id]
        const unit = state.units[model.unitId]
        if (unit.battleShocked) continue
        const base = modelStats(state, model).OC
        levels[player] += hookService.statFor(state, { unitId: unit.id, modelId: model.id, weapon: null, stat: 'OC' }, base)
      }
    }
    return levels
  },
  evaluateControl(ctx, moment) {
    const s = ctx.state
    const levelsById = new Map<ObjectiveId, Record<PlayerId, number>>()
    const levelsFor = (obj: Objective): Record<PlayerId, number> => {
      let levels = levelsById.get(obj.id)
      if (!levels) { levels = objectiveService.levelOfControl(s, obj.id); levelsById.set(obj.id, levels) }
      return levels
    }

    // CP-2.4/2.5: the secured flag breaks only at the end of a Command phase (either player's) — checked FIRST, before
    // controller is recomputed below, so a marker mid-secured is never treated as lost just because LoC shifted at
    // some other moment (MISSION-008-control).
    if (moment === 'phaseEnd' && s.phase === 'command') {
      for (const obj of Object.values(s.objectives) as Objective[]) {
        if (obj.removed || !obj.securedBy) continue
        const levels = levelsFor(obj)
        const opp = otherPlayer(obj.securedBy)
        if (levels[opp] > levels[obj.securedBy]) obj.securedBy = null
      }
    }

    for (const obj of Object.values(s.objectives) as Objective[]) {
      if (obj.removed) continue
      const levels = levelsFor(obj)
      let to: PlayerId | null
      if (obj.securedBy) {
        // CP-2.5: while secured (and not just broken above), the securer counts as in control at EVERY evaluation,
        // regardless of the opponent's current LoC — the break check above is the only thing that can end this.
        to = obj.securedBy
      } else {
        to = levels.A > levels.B ? 'A' : levels.B > levels.A ? 'B' : null
        // CP-2.6: an empty or contested marker (no secured flag) stays with whoever stickied it
        if (to === null && obj.stickyBy) to = obj.stickyBy
      }
      if (obj.controller !== to) {
        const from = obj.controller
        obj.controller = to
        ctx.emit({ type: 'ObjectiveControlChanged', objectiveId: obj.id, from, to, levels, player: to ?? s.activePlayer })
      }
      if (moment === 'turnStart') obj.controllerAtTurnStart = obj.controller
    }

    // CP-2.4: new securing, evaluated only at the end of a Command phase, only for the active player.
    if (moment === 'phaseEnd' && s.phase === 'command') {
      const active = s.activePlayer
      for (const obj of Object.values(s.objectives) as Objective[]) {
        if (obj.removed) continue
        if (obj.controller === active && obj.securedBy !== active && hasSecuringBattleline(s, obj.id, active)) {
          obj.securedBy = active
          ctx.emit({ type: 'ObjectiveSecured', objectiveId: obj.id, by: active, flag: 'secured', player: active })
        }
      }
    }

    // CP-2.6: Duty and Honour's sticky flag breaks when the opponent controls the marker (higher LoC) at the start or
    // end of any turn.
    if (moment === 'turnStart' || moment === 'turnEnd') {
      for (const obj of Object.values(s.objectives) as Objective[]) {
        if (obj.removed || !obj.stickyBy) continue
        const levels = levelsById.get(obj.id) ?? objectiveService.levelOfControl(s, obj.id)
        const opp = otherPlayer(obj.stickyBy)
        if (levels[opp] > levels[obj.stickyBy]) obj.stickyBy = null
      }
    }

    // 11-combat-patrol §2.5: a claim ends the moment no claiming model is within range — checked at every control
    // evaluation so leaving mid-turn and coming back before the next Command phase does not keep it (MISSION-024-return)
    for (const obj of Object.values(s.objectives) as Objective[]) if (obj.claimedBy) pruneClaim(s, obj)
  },
  // a removed marker "no longer exists for any rule" (11-combat-patrol §2.5 notes) — never reports a stale controller
  controller: (state, objectiveId) => {
    const obj = state.objectives[objectiveId]
    return obj && !obj.removed ? obj.controller : null
  },
}
