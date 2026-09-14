// Pre-battle sequence (10-rules §13): phase 'setup' (P4 sides) and phase 'deployment' (P6 deploy, P7 first turn, P8 Scouts).
// Owner: W1-F.
import { basesOverlap, checkPlacements, emptyMoveConstraints, whollyWithinPolygon, type Footprint, type ResolvedPlacement } from './geometry'
import type { EngineContext, PhaseModule } from './modules'
import { otherPlayer } from './modules'
import { assignSides, boardModelsOf, deploymentZone, unitModels, setModelPos } from './state'
import type { Action, DeployUnitAction, ModelPlacement } from './actions'
import type {
  DeployUnitDecision, GameState, Model, PendingDecision, PlayerId, Polygon, Rejection, Unit, UnitId,
} from './types'

// R-1.4: each player rolls 1D6, higher wins, ties re-roll; never modified or re-rolled
export function rollOff(ctx: EngineContext, purpose: 'rollOff' | 'firstTurn' = 'rollOff'): PlayerId {
  for (let i = 0; i < 1000; i++) {
    const a = ctx.roll({ purpose, player: 'A', commandRerollable: false }).dice[0]
    const b = ctx.roll({ purpose, player: 'B', commandRerollable: false }).dice[0]
    if (a !== b) return a > b ? 'A' : 'B'
  }
  throw new Error('rollOff: no winner after 1000 rounds')
}

function sidesChosen(state: GameState): boolean { return state.players.A.side !== null }

// CP-1.9 / R-5.14: a unit set aside for Reserves at Declare Battle Formations never gets a deployUnit decision here —
// it stays `location: 'reserves'` and arrives later via the Movement phase's `reinforcements` window (movement.ts).
function canDeepStrike(state: GameState, unit: Unit): boolean {
  const ds = state.datasheets[unit.datasheetId]
  return ds.coreAbilities.some((c) => c.ability === 'DEEP_STRIKE') || unit.deepStrikeWith !== null
}

// MISSION-027-attached (R-10.1): an attached Leader has no drop of its own — it deploys as part of its bodyguard's
// single deployUnit answer. `combo*` below treats the bodyguard's decision as covering both units' models.
function comboUnits(state: GameState, unit: Unit): Unit[] {
  return unit.attachedLeaderId ? [unit, state.units[unit.attachedLeaderId]] : [unit]
}
function comboModels(state: GameState, unit: Unit): Model[] {
  return comboUnits(state, unit).flatMap((u) => unitModels(state, u.id))
}
function comboCanDeepStrike(state: GameState, unit: Unit): boolean {
  return comboUnits(state, unit).every((u) => canDeepStrike(state, u))
}

// MISSION-027-reserves: mark that a unit's deployment decision (board placement or Reserves) has been resolved, so it
// is never offered again and always counts toward the alternation below — independent of its final `location`, which
// for a Reserves choice stays 'reserves' forever (or until the Movement phase's `reinforcements` window fills it in).
function dropMark(unitId: UnitId): string { return `deployDrop:${unitId}` }
function hasDropped(state: GameState, unitId: UnitId): boolean { return state.phaseState.marks.includes(dropMark(unitId)) }
function markDropped(state: GameState, unitId: UnitId): void {
  if (!hasDropped(state, unitId)) state.phaseState.marks.push(dropMark(unitId))
}
// unitId format is always "<player>:<ref>", so a prefix match also scopes the count to `player`
function dropsCount(state: GameState, player: PlayerId): number {
  const prefix = `deployDrop:${player}:`
  return state.phaseState.marks.filter((m) => m.startsWith(prefix)).length
}

function remainingToDeploy(state: GameState, player: PlayerId): UnitId[] {
  const reservedRefs = new Set(state.setup.players[player].reserves)
  return Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'reserves' && !reservedRefs.has(u.ref) && !u.bodyguardUnitId && !hasDropped(state, u.id))
    .map((u) => u.id)
}

// CP-1.10: alternate one drop at a time, Defender first; when one side runs out the other deploys the rest.
function deploymentTurnPlayer(state: GameState): PlayerId | null {
  const defender: PlayerId = state.players.A.side === 'defender' ? 'A' : 'B'
  const attacker = otherPlayer(defender)
  const remD = remainingToDeploy(state, defender).length
  const remA = remainingToDeploy(state, attacker).length
  if (remD === 0 && remA === 0) return null
  if (remD === 0) return attacker
  if (remA === 0) return defender
  const deployedD = dropsCount(state, defender)
  const deployedA = dropsCount(state, attacker)
  return deployedD <= deployedA ? defender : attacker
}

// shared by validate() and handle(): resolves + checks a deployUnit answer without mutating state
function resolveDeploy(
  state: GameState, action: DeployUnitAction, pending: DeployUnitDecision,
): { rejection: Rejection } | { rejection: null; toReserves: true } | { rejection: null; toReserves: false; resolved: ResolvedPlacement[] } {
  if (!pending.context.unitIds.includes(action.unitId)) {
    return { rejection: { code: 'E_INVALID_TARGET', reason: `it is not ${pending.player}'s turn to deploy ${action.unitId}`, details: { unitId: action.unitId } } }
  }
  const unit = state.units[action.unitId]
  if (!unit) return { rejection: { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` } }
  if (action.toReserves) {
    if (!comboCanDeepStrike(state, unit)) return { rejection: { code: 'E_INVALID_TARGET', reason: `${unit.ref} cannot go to Reserves (no Deep Strike)` } }
    return { rejection: null, toReserves: true }
  }
  const placements: ModelPlacement[] = action.placements
  const result = checkPlacements({
    unitModels: comboModels(state, unit),
    placements,
    constraints: pending.constraints,
    otherFriendly: boardModelsOf(state, pending.player),
    enemies: boardModelsOf(state, otherPlayer(pending.player)),
    board: state.board,
  })
  if (result.rejection) return { rejection: result.rejection }
  return { rejection: null, toReserves: false, resolved: result.resolved }
}

// a simple, always-legal placement for `unitId`'s models wholly within `zone` and clear of everything already placed —
// used by legalActions() so a generic Decider (AI, autoplay tests) can drive deployUnit without solving placement
// itself; returns null only if the zone genuinely has no room left (raster scan of its bounding box)
function autoDeployPlacements(models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[]): ModelPlacement[] | null {
  // a small inward safety pad keeps candidates well clear of the zone/board edge, avoiding floating-point boundary
  // ambiguity in pointInPolygon (exact edge points are not reliably "inside" under ray-casting)
  const pad = 0.05
  const minX = Math.min(...zone.map((p) => p.x)) + pad, maxX = Math.max(...zone.map((p) => p.x)) - pad
  const minZ = Math.min(...zone.map((p) => p.z)) + pad, maxZ = Math.max(...zone.map((p) => p.z)) - pad
  const placedHere: Footprint[] = []
  const out: ModelPlacement[] = []
  for (const m of models) {
    const step = Math.max(0.5, m.base.radius * 2 + 0.1)
    let found: { x: number; z: number } | null = null
    for (let z = minZ + m.base.radius; z <= maxZ - m.base.radius + 1e-9 && !found; z += step) {
      for (let x = minX + m.base.radius; x <= maxX - m.base.radius + 1e-9 && !found; x += step) {
        const cand: Footprint = { pos: { x, y: 0, z }, facing: 0, base: m.base }
        if (!whollyWithinPolygon(cand, zone)) continue
        if (placedHere.some((o) => basesOverlap(cand, o)) || otherFriendly.some((o) => basesOverlap(cand, o)) || enemies.some((o) => basesOverlap(cand, o))) continue
        found = { x, z }
      }
    }
    if (!found) return null
    const footprint: Footprint = { pos: { x: found.x, y: 0, z: found.z }, facing: 0, base: m.base }
    placedHere.push(footprint)
    out.push({ modelId: m.id, pos: footprint.pos })
  }
  return out
}

export const setupModule: PhaseModule = {
  name: 'setup',

  enter(ctx) {
    ctx.state.step = ctx.state.phase === 'setup' ? 'rollOffSides' : 'deploy'
  },

  advance(ctx) {
    const s = ctx.state
    for (;;) {
      switch (s.step) {
        // ---- phase 'setup' ----
        case 'rollOffSides': {
          if (sidesChosen(s)) return 'done'
          const winner = rollOff(ctx)
          s.step = 'chooseSides'
          ctx.decide({
            kind: 'chooseOption', player: winner, window: 'deployment.unit', canPass: false,
            context: { topic: 'chooseSide', unitId: null, abilityId: null, data: { winner } },
            options: [
              { id: 'attacker', label: 'Attacker', action: { type: 'chooseOption', player: winner, decisionId: '', optionId: 'attacker' } },
              { id: 'defender', label: 'Defender', action: { type: 'chooseOption', player: winner, decisionId: '', optionId: 'defender' } },
            ],
          })
          return 'pending'
        }
        case 'chooseSides':
          return sidesChosen(s) ? 'done' : 'pending'
        // ---- phase 'deployment' ----
        case 'deploy': {
          const pid = deploymentTurnPlayer(s)
          if (pid === null) { s.step = 'rollOffFirstTurn'; continue }
          const unitIds = remainingToDeploy(s, pid)
          ctx.decide({
            kind: 'deployUnit', player: pid, window: 'deployment.unit', canPass: false,
            context: { unitIds, zone: deploymentZone(s, pid), infiltrators: [], reservesAllowed: unitIds.filter((id) => comboCanDeepStrike(s, s.units[id])) },
            constraints: emptyMoveConstraints(1e9, { region: deploymentZone(s, pid), mustEndOutsideEngagement: false }),
          })
          return 'pending'
        }
        case 'rollOffFirstTurn': {
          if (s.setup.firstTurn !== 'rollOff') {
            s.firstPlayer = s.setup.firstTurn
          } else if (s.mission.data.firstTurn === 'attackerChoice') {
            const attacker: PlayerId = s.players.A.side === 'attacker' ? 'A' : 'B'
            const mark = s.phaseState.marks.find((m) => m.startsWith('firstTurnChoice:'))
            if (!mark) {
              ctx.decide({
                kind: 'chooseOption', player: attacker, window: 'deployment.unit', canPass: false,
                context: { topic: 'other', unitId: null, abilityId: null, data: { choice: 'firstTurn' } },
                options: [
                  { id: 'self', label: 'Take the first turn', action: { type: 'chooseOption', player: attacker, decisionId: '', optionId: 'self' } },
                  { id: 'opponent', label: 'Give the first turn to the opponent', action: { type: 'chooseOption', player: attacker, decisionId: '', optionId: 'opponent' } },
                ],
              })
              return 'pending'
            }
            const chosen = mark.slice('firstTurnChoice:'.length) as PlayerId
            s.firstPlayer = chosen
          } else {
            s.firstPlayer = rollOff(ctx, 'firstTurn')
          }
          s.activePlayer = s.firstPlayer
          ctx.emit({ type: 'FirstTurnChosen', first: s.firstPlayer, player: s.firstPlayer })
          s.step = 'preBattle'
          continue
        }
        case 'preBattle': {
          // R-10.8: units with Scouts may make a pre-battle Normal move (up to their Scouts value), alternating one
          // unit at a time from the first-turn player (CP-1.10-style alternation, MISSION-028-scouts) — not just all
          // of the first player's Scouts units before any of the second's. Not present in current Combat Patrol
          // rosters, so this path is exercised only by synthetic tests, but is implemented fully for spec fidelity.
          const scoutable = (pid: PlayerId): Unit[] => Object.values(s.units).filter((unit) => {
            if (unit.player !== pid || unit.location !== 'board') return false
            const ds = s.datasheets[unit.datasheetId]
            if (!ds.coreAbilities.some((c) => c.ability === 'SCOUTS')) return false
            return !s.phaseState.marks.includes(`scouted:${unit.id}`)
          })
          const first = s.firstPlayer
          const second = otherPlayer(first)
          const remFirst = scoutable(first)
          const remSecond = scoutable(second)
          if (remFirst.length === 0 && remSecond.length === 0) return 'done'
          const doneCount = (pid: PlayerId): number => s.phaseState.marks.filter((m) => m.startsWith(`scouted:${pid}:`)).length
          const pid = remFirst.length === 0 ? second : remSecond.length === 0 ? first : (doneCount(first) <= doneCount(second) ? first : second)
          const unit = (pid === first ? remFirst : remSecond)[0]
          const ds = s.datasheets[unit.datasheetId]
          const scouts = ds.coreAbilities.find((c) => c.ability === 'SCOUTS')!
          s.phaseState.marks.push(`scouted:${unit.id}`)
          const dist = typeof scouts.value === 'number' ? scouts.value : 9
          ctx.decide({
            kind: 'moveUnit', player: pid, window: 'deployment.unit', canPass: true,
            context: { unitId: unit.id, moveType: 'normal', advanceRoll: null },
            constraints: emptyMoveConstraints(dist, { mustEndOutsideEngagement: true }),
          })
          return 'pending'
        }
        default:
          return 'done'
      }
    }
  },

  validate(state, action, pending) {
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const r = resolveDeploy(state, action, pending)
      return r.rejection
    }
    if (pending.kind === 'moveUnit' && action.type === 'moveUnit') {
      const unit = state.units[action.unitId]
      if (!unit) return { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` }
      const result = checkPlacements({
        unitModels: unitModels(state, unit.id),
        placements: action.placements,
        constraints: pending.constraints,
        otherFriendly: boardModelsOf(state, pending.player),
        enemies: boardModelsOf(state, otherPlayer(pending.player)),
        board: state.board,
      })
      return result.rejection
    }
    return null
  },

  legalActions(state, pending) {
    if (pending.kind === 'deployUnit') {
      const unitId = pending.context.unitIds[0]
      if (!unitId) return []
      const models = comboModels(state, state.units[unitId])
      const placements = autoDeployPlacements(models, pending.constraints.region ?? deploymentZone(state, pending.player), boardModelsOf(state, pending.player), boardModelsOf(state, otherPlayer(pending.player)))
      if (!placements) return []
      const action: Action = { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId, placements }
      return [action]
    }
    if (pending.kind === 'moveUnit') {
      // Scouts moves are optional and not exercised by current data; offer "stay put" so generic Deciders can pass
      return pending.canPass ? [{ type: 'pass', player: pending.player, decisionId: pending.id }] : []
    }
    // chooseSide / attackerChoice first-turn pick: same shape as the reducer's own default (finite `options`)
    if ('options' in pending && Array.isArray(pending.options)) {
      const out: Action[] = pending.options.map((o) => o.action)
      if (pending.canPass) out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
      return out
    }
    return null
  },

  handle(ctx, action, pending) {
    const s = ctx.state
    if (pending.kind === 'chooseOption' && pending.context.topic === 'chooseSide' && action.type === 'chooseOption') {
      const attacker = action.optionId === 'attacker' ? pending.player : otherPlayer(pending.player)
      assignSides(s, attacker)
      ctx.emit({ type: 'SidesChosen', attacker, defender: otherPlayer(attacker), player: pending.player })
      return
    }
    if (pending.kind === 'chooseOption' && pending.context.topic === 'other' && (pending.context.data as { choice?: string }).choice === 'firstTurn' && action.type === 'chooseOption') {
      const chosen: PlayerId = action.optionId === 'self' ? pending.player : otherPlayer(pending.player)
      s.phaseState.marks.push(`firstTurnChoice:${chosen}`)
      return
    }
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const r = resolveDeploy(s, action, pending)
      if (r.rejection) return r.rejection
      const unit = s.units[action.unitId]
      markDropped(s, unit.id)
      if (r.toReserves) {
        ctx.emit({ type: 'UnitDeployed', unitId: unit.id, toReserves: true, player: pending.player })
        return
      }
      for (const p of r.resolved) setModelPos(p.model, p.to, p.facing)
      for (const u of comboUnits(s, unit)) u.location = 'board'
      ctx.emit({ type: 'UnitDeployed', unitId: unit.id, toReserves: false, player: pending.player })
      return
    }
    if (pending.kind === 'moveUnit' && action.type === 'moveUnit') {
      const unit = s.units[action.unitId]
      if (!unit) return { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` }
      const result = checkPlacements({
        unitModels: unitModels(s, unit.id),
        placements: action.placements,
        constraints: pending.constraints,
        otherFriendly: boardModelsOf(s, pending.player),
        enemies: boardModelsOf(s, otherPlayer(pending.player)),
        board: s.board,
      })
      if (result.rejection) return result.rejection
      const paths: Record<string, ResolvedPlacement['path']> = {}
      for (const p of result.resolved) { setModelPos(p.model, p.to, p.facing); paths[p.model.id] = p.path }
      ctx.emit({ type: 'UnitMoved', unitId: unit.id, moveType: 'scouts', paths })
      return
    }
    if (pending.kind === 'moveUnit' && action.type === 'pass') return
    return { code: 'E_NOT_AN_OPTION', reason: `setup: no handler for ${action.type} at step ${s.step}` }
  },
}
