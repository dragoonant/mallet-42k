// Genestealer Cults code hooks (docs/spec/factions/genestealer-cults.md §7): cultAmbush (registration; the lifecycle lives in
// factions/genestealer-cults.ts), defendTheMagus, returnToTheShadows, riseUp, willOfThePatriarch.
// code-hooks.ts registers them through `genestealerCultsHooks`, a hoisted factory (the module graph is circular, so nothing
// here may run at import time).
import type { ScoringRule } from '../../data/types'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distanceToPoint, unitsWithinEngagementRange, withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { boardModelsOf, unitModels } from '../state'
import type { GameState, Model, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'
import type { Action } from '../actions'
import { answerCultAmbush } from '../cult-ambush'

// the Cult Ambush lifecycle (engine part, next to the reducer) is re-exported so the faction has one entry point
export * from '../cult-ambush'

const noop = () => undefined

function canon(state: GameState, id: UnitId): UnitId { return leaderService.canonicalUnitId(state, id) }

function boardHalves(state: GameState, unitId: UnitId): UnitId[] {
  return leaderService.halves(state, unitId).filter((id) => state.units[id]?.location === 'board')
}

function boardModelsOfUnit(state: GameState, unitId: UnitId): Model[] {
  return boardHalves(state, unitId).flatMap((id) => unitModels(state, id))
}

function anyHalfHasKeyword(state: GameState, unitId: UnitId, keyword: string): boolean {
  return leaderService.halves(state, unitId).some((id) => hookService.keywordsFor(state, id).includes(keyword))
}

function canonicalBoardUnits(state: GameState, player: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.player === player && u.location === 'board' && !u.bodyguardUnitId)
}

export function genestealerCultsHooks(): Record<string, EngineCodeHook> {
  // Cult Ambush: marker ability, the engine lifecycle (reducer interceptor, movement phase) does the work; this entry answers
  // the marker / return chooseOption decisions
  const cultAmbush: EngineCodeHook = {
    name: 'cultAmbush', kind: 'ability', hook: 'onUnitDestroyed', run: noop,
    answer: (ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void => answerCultAmbush(ctx, action, pending),
  }

  // Defend the Magus (GEN-5): the declarative re-roll goes onto the ENEMY unit (scope 'attacker'), so every GSC attacker that
  // targets it re-rolls hit and wound rolls of 1. The Magus dying later does not remove it.
  const defendTheMagus: EngineCodeHook = {
    name: 'defendTheMagus', kind: 'stratagem', hook: 'onHitRoll', hooks: ['onHitRoll', 'onWoundRoll'], run: noop, grantsItself: true,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      const [magusId, enemyId] = t.ids
      const magus = state.units[magusId], enemy = state.units[enemyId]
      if (!magus || !enemy || magus.location !== 'board' || enemy.location !== 'board' || enemy.player === env.player) return false
      if (!anyHalfHasKeyword(state, magusId, 'MAGUS')) return false
      return unitsWithinEngagementRange(boardModelsOfUnit(state, magusId), boardModelsOfUnit(state, enemyId))
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const enemyId = canon(s, t.ids[1])
      const strat = env.stratagem
      const effect = (Array.isArray(strat.effect) ? strat.effect : strat.effect ? [strat.effect] : [{ reroll: 'ones' as const }])
      for (const half of leaderService.halves(s, enemyId)) {
        if (!s.units[half]) continue
        ctx.services.effects.grant(ctx, half, effect, {
          sourceAbilityId: strat.id, sourceUnitId: canon(s, t.ids[0]), scope: strat.scope ?? { who: 'attacker' },
          duration: strat.duration ?? 'untilEndOfPhase', when: strat.when ?? null,
        })
      }
      ctx.emit({ type: 'AbilityTriggered', abilityId: strat.id, sourceUnitId: canon(s, t.ids[0]), targetUnitId: enemyId, summary: 'Defend the Magus: attacks against the enemy unit re-roll hit and wound rolls of 1', player: env.player })
    },
    // only attackers of the stratagem user's army (the effect sits on an enemy unit)
    gateActive(state, entry, data) {
      const attack = data?.attack as { attackerUnitId?: UnitId } | null | undefined
      if (!attack?.attackerUnitId) return true
      const holder = state.units[entry.holderUnitId]
      const attacker = state.units[attack.attackerUnitId]
      return !!holder && !!attacker && attacker.player !== holder.player
    },
  }

  // Return to the Shadows (GEN-5): a Normal move in the opponent's Movement phase, 6" for a MAGUS unit, else D6"
  const returnToTheShadows: EngineCodeHook = {
    name: 'returnToTheShadows', kind: 'stratagem', hook: 'onMove', run: noop,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      const targetId = t.ids[0]
      const target = state.units[targetId]
      const moverId = env.trigger.unitId
      if (!target || target.location !== 'board' || !moverId) return false
      const mover = state.units[moverId]
      if (!mover || mover.location !== 'board' || mover.player === env.player) return false
      const type = leaderService.halves(state, moverId).map((id) => state.units[id]?.turn.moveType).find((m) => m !== null && m !== undefined) ?? null
      if (type !== 'normal' && type !== 'advance' && type !== 'fallBack') return false
      const range = (env.stratagem.params?.range as number | undefined) ?? 9
      if (leaderService.unitDistance(state, targetId, moverId) > range + 1e-6) return false
      return !leaderService.inEngagementWithEnemy(state, targetId)
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const id = canon(s, t.ids[0])
      const params = env.stratagem.params ?? {}
      let distance = (params.magusDistance as number | undefined) ?? 6
      if (!anyHalfHasKeyword(s, id, (params.magusKeyword as string | undefined) ?? 'MAGUS')) {
        const roll = ctx.roll({ purpose: 'stratagem', player: env.player, count: 1, sides: 6, mode: 'sum', unitId: id, commandRerollable: false })
        distance = roll.final.reduce((a, b) => a + b, 0)
      }
      ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: id, targetUnitId: env.trigger.unitId ?? null, summary: `Return to the Shadows: ${s.units[id].name} moves up to ${distance}"`, player: env.player })
      startReactiveMove(ctx, id, distance, env.stratagem.id)
    },
  }

  const riseUp: EngineCodeHook = { name: 'riseUp', kind: 'mission', hook: 'onTurnEnd', run: noop }
  const willOfThePatriarch: EngineCodeHook = { name: 'willOfThePatriarch', kind: 'mission', hook: 'onPhaseEnd', run: noop }

  return { cultAmbush, defendTheMagus, returnToTheShadows, riseUp, willOfThePatriarch }
}

// ---------- secondary scoring (called from missions.ts customAmount) ----------

// Rise Up (GEN-4): per controlled marker with a non-Battle-shocked NEOPHYTE HYBRIDS unit in range, D6: 1-3 -> 1 VP, 4+ -> 3 VP
export function riseUpAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, controls: (objectiveId: string) => boolean): number {
  const s = ctx.state
  const range = s.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const holders = canonicalBoardUnits(s, pid).filter((u) => anyHalfHasKeyword(s, u.id, 'NEOPHYTE HYBRIDS') && !leaderService.halves(s, u.id).some((h) => s.units[h]?.battleShocked))
  let total = 0
  for (const o of Object.values(s.objectives).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (o.removed || !controls(o.id)) continue
    const near = holders.some((u) => boardModelsOfUnit(s, u.id).some((m) => withinObjectiveRange(m, o, 0, range, radius)))
    if (!near) continue
    const roll = ctx.roll({ purpose: 'mission', player: pid, count: 1, sides: 6, mode: 'sum', commandRerollable: false })
    total += (roll.final.reduce((a, b) => a + b, 0) >= 4 ? 3 : 1) * (rule.pointsPer ?? 1)
  }
  return total
}

// Will of the Patriarch (GEN-4): pointsPer when an own MAGUS model's base edge is within 3" of the board centre
export function willOfThePatriarchAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const centre = { x: 0, y: 0, z: 0 }
  const ok = boardModelsOf(s, pid).some((m) => hookService.keywordsFor(s, m.unitId).includes('MAGUS') && distanceToPoint({ ...m, pos: { ...m.pos, y: 0 } }, centre) <= 3 + 1e-6)
  return ok ? rule.pointsPer : 0
}
