// Chaos Daemons code hooks (docs/spec/factions/chaos-daemons.md §7): shadowOfChaos, warpLocus (name-only markers; the work is
// in shadow.ts), empyricPredators (stratagem), worthyOfferings / darkConjunction (secondaries scored from missions.ts customAmount).
// Blood-Maddened Banishment reuses the Chaos Space Marines `daemonicFervour` hook unchanged; A Gory Path reuses `getStuckInDistance`.
// code-hooks.ts registers them through `chaosDaemonsHooks`, a hoisted factory (the module graph is circular, so nothing here may run
// at import time).
import type { ScoringRule } from '../../data/types'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { shotThisTurn } from '../attack'
import { deploymentZone } from '../state'
import { pointInPolygon } from '../geometry'
import { leaderService } from '../leaders'
import { otherPlayer } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { objectiveInShadow } from '../shadow'
import { transportService } from '../transports'
import type { GameState, PlayerId } from '../types'
import { genestealerCultsHooks } from './genestealer-cults'

const noop = () => undefined

// ---------- Empyric Predators (DMN-5.2, 5.4) ----------
// check = GSC Return to the Shadows check (target on board, enemy mover just ended a Normal/Advance/Fall Back move within range,
// target not in Engagement Range) and the Hounds have not fired Overwatch this phase (shotThisTurn: in the opponent's Movement phase
// the only shooting a unit can have done is Fire Overwatch).
function empyricPredatorsCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const gsc = genestealerCultsHooks().returnToTheShadows
  if (!(gsc.check?.(env, t) ?? true)) return false
  return !shotThisTurn(env.state, t.ids[0])
}

const empyricPredators: EngineCodeHook = {
  name: 'empyricPredators', kind: 'stratagem', hook: 'onMove', run: noop,
  check: empyricPredatorsCheck,
  apply(ctx, env, t) {
    const s = ctx.state
    const id = leaderService.canonicalUnitId(s, t.ids[0])
    const params = env.stratagem.params ?? {}
    const distance = (params.distance as number | undefined) ?? 6
    ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: id, targetUnitId: env.trigger.unitId ?? null, summary: `Empyric Predators: ${s.units[id].name} moves up to ${distance}"`, player: env.player })
    // E3: the Hounds cannot be picked to Fire Overwatch for the rest of the phase
    ctx.services.effects.grant(ctx, id, [{ forbid: 'overwatch' }], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: id, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
    })
    startReactiveMove(ctx, id, distance, env.stratagem.id)
  },
}

// ---------- Worthy Offerings (DMN-4.1), called from missions.ts customAmount ----------
// Scored per player (the rule carries no `who`): pid is the Daemon player, the target is the opposing WARLORD unit.
export function worthyOfferingsAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const targetId = s.players[otherPlayer(pid)].warlordUnitId
  const target = targetId ? s.units[targetId] : undefined
  if (!target) return 0
  const unitPoints = (rule.params?.unitPoints as number | undefined) ?? 6
  const warlordPoints = (rule.params?.warlordPoints as number | undefined) ?? 10
  // R-5.16 [interp]: a WARLORD that never arrived from Reserves counts as destroyed with no killer (an embarked unit is alive)
  if (target.location === 'reserves' && transportService.transportOf(s, targetId) === null) return unitPoints
  if (target.location !== 'destroyed') return 0
  const by = target.destroyedBy
  if (!by) return unitPoints // stranded-Reserves cull credits no killer
  const ownWarlordId = s.players[pid].warlordUnitId
  // the killer is matched against every model of the own WARLORD unit, alive or already destroyed (removeModel moves a dead
  // model to destroyedModels), and the attacker's unitId may be the canonical unit of a Bloodletters squad he leads
  const ownWarlordUnit = ownWarlordId ? s.units[ownWarlordId] : undefined
  const warlordModelIds = ownWarlordUnit ? [...ownWarlordUnit.models, ...(ownWarlordUnit.destroyedModels ?? []).map((m) => m.id)] : []
  const byWarlord = by.kind !== 'other' && ((by.modelId !== null && warlordModelIds.includes(by.modelId)) || (!!ownWarlordId && by.unitId === ownWarlordId))
  return byWarlord ? warlordPoints : unitPoints
}

// ---------- Dark Conjunction (DMN-4.2), called from missions.ts customAmount ----------
export function darkConjunctionAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const own = deploymentZone(s, pid)
  let n = 0
  for (const o of Object.values(s.objectives)) {
    if (o.removed) continue
    if (pointInPolygon(o.pos, own)) continue
    if (objectiveInShadow(s, pid, o)) n++
  }
  return n * rule.pointsPer
}

function marker(name: string, hook: EngineCodeHook['hook']): EngineCodeHook {
  return { name, kind: 'ability', hook, run: noop }
}

export function chaosDaemonsHooks(): Record<string, EngineCodeHook> {
  return {
    shadowOfChaos: marker('shadowOfChaos', 'onPhaseStart'),
    warpLocus: marker('warpLocus', 'onPhaseStart'),
    empyricPredators,
    worthyOfferings: { name: 'worthyOfferings', kind: 'mission', hook: 'onTurnEnd', run: noop },
    darkConjunction: { name: 'darkConjunction', kind: 'mission', hook: 'onTurnEnd', run: noop },
  }
}
