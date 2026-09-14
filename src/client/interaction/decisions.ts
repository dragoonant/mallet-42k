// Maps a PendingDecision to interaction behaviour: which units are clickable right now, which
// pre-validated `legal` Action a click on one resolves to, and which decisions are answered by
// dragging/clicking a destination on the board (src/client/interaction/PlacementLayer.tsx).
// Bespoke UI lives here + PlacementLayer/DeploymentLayer/UnitsLayer; everything else falls back to
// GenericOptionsPrompt (src/client/ui/DecisionPrompt.tsx) so no decision kind can ever get stuck.
import type { Action, MoveConstraints, PendingDecision, UnitId } from '@/engine'

export type PlacementActionType = 'moveUnit' | 'chargeMove' | 'pileIn' | 'consolidate'

export interface PlacementInfo {
  unitId: UnitId
  constraints: MoveConstraints
  actionType: PlacementActionType
}

/** moveUnit / chargeMove / pileIn / consolidate all answer with `{unitId, placements}` against a
 *  MoveConstraints — one shared click-a-destination controller handles all four. */
export function placementInfo(pending: PendingDecision): PlacementInfo | null {
  switch (pending.kind) {
    case 'moveUnit':
      return { unitId: pending.context.unitId, constraints: pending.constraints, actionType: 'moveUnit' }
    case 'chargeMove':
      return { unitId: pending.context.unitId, constraints: pending.constraints, actionType: 'chargeMove' }
    case 'pileIn':
      return { unitId: pending.context.unitId, constraints: pending.constraints, actionType: 'pileIn' }
    case 'consolidate':
      return { unitId: pending.context.unitId, constraints: pending.constraints, actionType: 'consolidate' }
    default:
      return null
  }
}

/** Units a click should react to for the current decision (friendly units to activate/pick, or
 *  enemy units to target) — everything else in the scene is inert for this decision. */
export function clickableUnitIds(pending: PendingDecision): Set<UnitId> {
  switch (pending.kind) {
    case 'chooseUnitToActivate':
      return new Set(pending.context.eligible)
    case 'chooseFightUnit':
      return new Set(pending.context.eligible)
    case 'declareTargets': {
      const s = new Set<UnitId>()
      for (const w of pending.context.weapons) for (const t of w.legalTargets) s.add(t)
      return s
    }
    case 'declareCharge':
      return new Set(pending.context.candidateTargets)
    default:
      return new Set()
  }
}

/** The pre-validated `legal` action a click on `unitId` resolves to, or null if that unit isn't a
 *  legal click for this decision right now (legalActions() always returns one concrete candidate
 *  per target unit for declareTargets/declareCharge — see engine/phases/legal.ts). */
export function unitClickAction(pending: PendingDecision, legal: Action[] | null, unitId: UnitId): Action | null {
  if (!legal) return null
  switch (pending.kind) {
    case 'chooseUnitToActivate':
      return legal.find((a) => a.type === 'chooseUnitToActivate' && a.unitId === unitId) ?? null
    case 'chooseFightUnit':
      return legal.find((a) => a.type === 'chooseFightUnit' && a.unitId === unitId) ?? null
    case 'declareTargets':
      return (
        legal.find((a) => a.type === 'declareTargets' && a.targets.length > 0 && a.targets.every((t) => t.targetUnitId === unitId)) ??
        null
      )
    case 'declareCharge':
      return legal.find((a) => a.type === 'declareCharge' && a.targetUnitIds.length === 1 && a.targetUnitIds[0] === unitId) ?? null
    default:
      return null
  }
}

/** True while the human should be picking a destination on the mat (range ring + ruler UI). */
export function isPlacementDecision(pending: PendingDecision | null): boolean {
  return !!pending && placementInfo(pending) !== null
}
