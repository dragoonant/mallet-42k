// Adepta Sororitas code hooks (docs/spec/factions/adepta-sororitas.md §7, ADE-*). Owner: M10 adepta-sororitas hooks stage.
// The Miracle dice engine itself (gain / substitution / spentThisPhase, E1) lives in ../miracle.ts and the deferred
// removal engine (A Martyr's Death, E4) in ../deferred.ts; they are re-exported here under the names the spec lists so
// every faction rule reads from one module. This file adds the registered hooks (code-hooks.ts spreads `adeptaSororitasHooks`).
//
// Hook mechanics follow the shapes the engine already has (code-hooks.ts header): `pick` hooks raise chooseOption
// decisions at a timing window, `runAt` hooks do side effects at their trigger, `produce` hooks answer collect() for
// stratagem effects that have no declarative form (A Martyr's Death).
import type { Effect } from '../../data/types'
import { signedDistanceToBase, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, withinObjectiveRange } from '../geometry'
import type { EngineCodeHook } from '../code-hooks'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { boardUnitsOf, hasKeyword, keywordsOf, unitModels } from '../state'
import type { ChooseOptionDecision, GameState, ModelId, PlayerId, Rejection, UnitId } from '../types'
import type { Action } from '../actions'
import type { StratagemEnv, StratagemTuple } from '../code-hooks'
import { discardMiracleDie, gainMiracleDie } from '../miracle'

export {
  ACTS_OF_FAITH_CODE, clearActsOfFaithPhase, discardMiracleDie, gainMiracleDie, hasActsOfFaith, onOwnUnitDestroyed,
  runActsOfFaithTurnStart, substitutionEligible,
} from '../miracle'
export { deferModelRemoval, resolveDeferredActivations } from '../deferred'

export const ADEPTA_KEYWORD = 'ADEPTA SORORITAS'

const noop = () => undefined
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })

// ---------- helpers ----------
function pool(s: GameState, player: PlayerId): number[] { return s.players[player].miracle?.dice ?? [] }

// the enhancement ability (with `code`) whose bearer is alive on the battlefield for this player
function enhancementBearer(s: GameState, player: PlayerId, code: string): { abilityId: string; modelId: ModelId; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== code || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    const unit = model ? s.units[model.unitId] : undefined
    if (unit && unit.player === player && unit.location === 'board') return { abilityId: a.id, modelId: a.bearerModelId, unitId: unit.id }
  }
  return null
}

function abilityWithCode(s: GameState, unitId: UnitId, code: string): string | null {
  const ds = s.datasheets[s.units[unitId]?.datasheetId]
  for (const id of ds?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

function boardHalves(s: GameState, unitId: UnitId): UnitId[] {
  return leaderService.halves(s, unitId).filter((id) => s.units[id]?.location === 'board')
}

// ---------- Defender of the Faith (OC) / Righteous Fury (charge re-roll): Command-phase Miracle die discards ----------
interface DiscardPickSpec {
  code: string
  markKey: string
  // runs after the die was discarded; `bearer.unitId` is the bearer's own unit record
  onDiscard(ctx: EngineContext, player: PlayerId, bearer: { abilityId: string; unitId: UnitId }, value: number): void
  summary: string
}

function discardPick(spec: DiscardPickSpec, enhancementCode: string): NonNullable<EngineCodeHook['pick']> {
  return {
    window: 'command.start',
    topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      const player = s.activePlayer
      const mark = `pick:${spec.markKey}:${s.round}:${player}`
      if (s.phaseState.marks.includes(mark)) return false
      const bearer = enhancementBearer(s, player, enhancementCode)
      if (!bearer) return false
      const dice = pool(s, player)
      if (dice.length === 0) return false
      s.phaseState.marks.push(mark)
      const values = [...new Set(dice)].sort((a, b) => a - b)
      ctx.decide({
        kind: 'chooseOption', player, window, canPass: false,
        context: { topic: 'abilityChoice', unitId: bearer.unitId, abilityId: bearer.abilityId, data: { window, key, code: spec.code } },
        options: [
          ...values.map((v) => ({ id: `discard:${v}`, label: `Discard a Miracle die (${v}): ${spec.summary}`, action: optionAction(player, `discard:${v}`), hint: { value: 3.5 - v } })),
          { id: 'decline', label: 'Keep the Miracle dice', action: optionAction(player, 'decline') },
        ],
      })
      return true
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: `${spec.code} expects chooseOption` }
      if (action.optionId === 'decline') return
      const m = /^discard:([1-6])$/.exec(action.optionId)
      if (!m) return { code: 'E_NOT_AN_OPTION', reason: `${spec.code}: discard a die or decline` }
      const s = ctx.state
      const dice = pool(s, pending.player)
      const index = dice.indexOf(Number(m[1]))
      if (index < 0) return { code: 'E_NOT_AN_OPTION', reason: 'no such Miracle die in the pool' }
      const unitId = pending.context.unitId
      const abilityId = pending.context.abilityId
      if (!unitId || !abilityId) return { code: 'E_NOT_AN_OPTION', reason: `${spec.code}: bearer missing` }
      const value = discardMiracleDie(ctx, pending.player, index, unitId, abilityId)
      spec.onDiscard(ctx, pending.player, { abilityId, unitId }, value)
    },
  }
}

// ADE-3 Defender of the Faith: +1 OC to the bearer's unit until the owner's next Command phase [interp: whole unit]
const defenderOfTheFaithOc: EngineCodeHook = {
  name: 'defenderOfTheFaithOc', kind: 'ability', hook: 'onCommandPhase', run: noop,
  pick: discardPick({
    code: 'defenderOfTheFaithOc', markKey: 'defender', summary: '+1 Objective Control until your next Command phase',
    onDiscard(ctx, player, bearer, value) {
      ctx.services.effects.grant(ctx, bearer.unitId, [{ modifyStat: { stat: 'OC', value: 1 } }], {
        sourceAbilityId: bearer.abilityId, sourceUnitId: bearer.unitId, scope: { who: 'self' }, duration: 'untilNextTurn',
      })
      ctx.emit({ type: 'AbilityTriggered', abilityId: bearer.abilityId, sourceUnitId: bearer.unitId, targetUnitId: bearer.unitId, summary: `Defender of the Faith: discarded a ${value}, +1 OC`, player })
    },
  }, 'defenderOfTheFaithOc'),
}

// ADE-3 Righteous Fury: the pick (Command phase) grants a charge re-roll to the bearer's unit until the end of the turn;
// the enhancement's own descriptor carries the shoot / charge after Advance / Fall Back eligibility keys.
const righteousFuryPick: EngineCodeHook = {
  name: 'righteousFuryPick', kind: 'ability', hook: 'onCommandPhase', run: noop,
  pick: discardPick({
    code: 'righteousFuryPick', markKey: 'righteous', summary: 're-roll charge rolls this turn',
    onDiscard(ctx, player, bearer, value) {
      const s = ctx.state
      ctx.services.effects.grant(ctx, bearer.unitId, [{ reroll: 'all' }], {
        sourceAbilityId: bearer.abilityId, sourceUnitId: bearer.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn',
      })
      s.players[player].secondaryState[`righteousFury:${s.round}`] = leaderService.canonicalUnitId(s, bearer.unitId)
      ctx.emit({ type: 'AbilityTriggered', abilityId: bearer.abilityId, sourceUnitId: bearer.unitId, targetUnitId: bearer.unitId, summary: `Righteous Fury: discarded a ${value}, charge rolls may be re-rolled`, player })
    },
  }, 'righteousFuryReroll'),
}

// the enhancement ability's own entry: eligibility keys stay active; the granted re-roll (an ActiveEffect with no trigger
// of its own) is only read at charge rolls (hooks-impl keyApplies lets hooks-restricted active effects carry `reroll`)
const righteousFuryReroll: EngineCodeHook = {
  name: 'righteousFuryReroll', kind: 'ability', hook: 'onChargeRoll', run: noop, hooks: ['onChargeRoll', 'onEligibility'],
}

// ADE-2 marker ability: the engine (miracle.ts) does the work; the name only has to be registered
const actsOfFaith: EngineCodeHook = { name: 'actsOfFaith', kind: 'ability', hook: 'onTurnStart', run: noop }

// ---------- Simulacrum Imperialis ----------
// does `player` control the marker right now (secured, or higher live level of control, ties to the sticky flag)
function controlsNow(ctx: EngineContext, objectiveId: string, player: PlayerId): boolean {
  const s = ctx.state
  const obj = s.objectives[objectiveId]
  if (!obj || obj.removed) return false
  if (obj.securedBy) return obj.securedBy === player
  const levels = ctx.services.objectives.levelOfControl(s, objectiveId)
  const other: PlayerId = player === 'A' ? 'B' : 'A'
  if (levels[player] !== levels[other]) return levels[player] > levels[other]
  return obj.stickyBy === player
}

const simulacrumImperialis: EngineCodeHook = {
  name: 'simulacrumImperialis', kind: 'ability', hook: 'onPhaseEnd', run: noop,
  runAt(ctx, entry) {
    const s = ctx.state
    const holder = s.units[entry.holderUnitId]
    if (!holder || holder.location !== 'board') return
    const modelKey = (entry.params.modelId as string | undefined) ?? 'sister-simulacrum'
    const models = unitModels(s, holder.id)
    const bearer = models.find((m) => m.datasheetModelId === modelKey || m.datasheetModelId.endsWith(`/${modelKey}`))
    if (!bearer) return
    // an attached unit is one unit: the attached Leader's models count for objective range too
    const rangeModels = leaderService.halves(s, holder.id).flatMap((id) => (s.units[id].location === 'board' ? unitModels(s, id) : []))
    const threshold = (entry.params.dieThreshold as number | undefined) ?? 4
    const range = s.mission.data.objectiveRange ?? OBJECTIVE_RANGE
    const radius = s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
    const player = holder.player
    for (const obj of Object.values(s.objectives)) {
      if (obj.removed || !controlsNow(ctx, obj.id, player)) continue
      if (!rangeModels.some((m) => withinObjectiveRange(m, obj, 0, range, radius))) continue
      const total = ctx.rollExpr('D6', { purpose: 'ability', player, unitId: holder.id, commandRerollable: false }).total
      ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: holder.id, summary: `Simulacrum Imperialis: rolled ${total} at ${obj.id}`, player })
      if (total >= threshold) gainMiracleDie(ctx, player, entry.source.id, total)
    }
  },
}

// ---------- Extremis Trigger Word ----------
const extremisTriggerWord: EngineCodeHook = {
  name: 'extremisTriggerWord', kind: 'ability', hook: 'onUnitSelectedToFight', run: noop,
  pick: {
    window: 'fight.unitSelected',
    topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      const unit = s.units[key]
      if (!unit || unit.location !== 'board') return false
      const abilityId = abilityWithCode(s, unit.id, 'extremisTriggerWord')
      if (!abilityId) return false
      const mark = `pick:extremis:${unit.id}`
      if (s.phaseState.marks.includes(mark)) return false
      s.phaseState.marks.push(mark)
      ctx.decide({
        kind: 'chooseOption', player: unit.player, window, canPass: false,
        context: { topic: 'abilityChoice', unitId: unit.id, abilityId, data: { window, key, code: 'extremisTriggerWord' } },
        options: [
          { id: 'use', label: 'Speak the trigger word (6 Attacks, Hazardous)', action: optionAction(unit.player, 'use'), hint: { unitId: unit.id, priority: 1 } },
          { id: 'decline', label: 'Decline', action: optionAction(unit.player, 'decline') },
        ],
      })
      return true
    },
    handle(ctx, action, pending) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'extremis expects chooseOption' }
      if (action.optionId === 'decline') return
      if (action.optionId !== 'use') return { code: 'E_NOT_AN_OPTION', reason: 'extremis: use or decline' }
      const s = ctx.state
      const unit = s.units[pending.context.unitId ?? '']
      const abilityId = pending.context.abilityId
      const ability = abilityId ? s.abilities[abilityId] : undefined
      if (!unit || !abilityId || !ability) return { code: 'E_NOT_AN_OPTION', reason: 'extremis: unit or ability missing' }
      const params = ability.params ?? {}
      const grant = (params.grant ?? [
        { when: { weaponId: 'ade.w.arco-flails' }, setStat: { stat: 'A', value: 6 } },
        { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'HAZARDOUS' } },
      ]) as Effect[]
      ctx.services.effects.grant(ctx, unit.id, grant, {
        sourceAbilityId: abilityId, sourceUnitId: unit.id, scope: { who: 'self' }, duration: (params.duration as 'untilEndOfPhase' | undefined) ?? 'untilEndOfPhase', when: null,
      })
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unit.id, targetUnitId: unit.id, summary: 'Extremis trigger word spoken: arco-flails have 6 Attacks and Hazardous this phase', player: unit.player })
    },
  },
}

// ---------- A Martyr's Death ----------
const martyrBonusMark = (unitId: UnitId) => `martyrBonus:${unitId}`
const martyrRollMark = (modelId: ModelId) => `martyrRoll:${modelId}`

// per-model gate: the destroyed model's unit has not yet shot (Shooting) / fought (Fight) this phase
function modelNotYetActed(s: GameState, unitId: UnitId): boolean {
  const fight = s.phaseState.fight
  return leaderService.halves(s, unitId).every((h) => {
    const u = s.units[h]
    return !!u && !u.turn.shotThisPhase && !u.turn.foughtThisPhase && !s.phaseState.activated.includes(h) && !fight?.fought.includes(h) && fight?.currentUnitId !== h
  })
}

const aMartyrsDeath: EngineCodeHook = {
  name: 'aMartyrsDeath', kind: 'stratagem', hook: 'onModelDestroyed', run: noop,
  producesAt: ['onModelDestroyed'],
  // the stratagem carries no declarative effect: an empty ActiveEffect on the target unit marks "Martyr's Death is live"
  // for this phase, and `produce` rolls for every model of that unit that is destroyed before it has acted
  apply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple) {
    const s = ctx.state
    const unitId = t.ids[0]
    ctx.services.effects.grant(ctx, unitId, [], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: unitId, scope: { who: 'self' }, duration: env.stratagem.duration ?? 'untilEndOfPhase',
    })
    const dice = pool(s, env.player)
    if (dice.length === 0) return
    const values = [...new Set(dice)].sort((a, b) => a - b)
    ctx.decide({
      kind: 'chooseOption', player: env.player, window: env.window, canPass: false,
      context: { topic: 'abilityChoice', unitId, abilityId: env.stratagem.id, data: { code: 'aMartyrsDeath', stratagemId: env.stratagem.id } },
      options: [
        { id: 'keep', label: 'Keep the Miracle dice', action: optionAction(env.player, 'keep') },
        ...values.map((v) => ({ id: `discard:${v}`, label: `Discard a Miracle die (${v}): +1 to each last-stand roll`, action: optionAction(env.player, `discard:${v}`), hint: { value: 3.5 - v } })),
      ],
    })
  },
  answer(ctx, action, pending): Rejection | void {
    if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: "A Martyr's Death expects chooseOption" }
    if (action.optionId === 'keep') return
    const m = /^discard:([1-6])$/.exec(action.optionId)
    if (!m) return { code: 'E_NOT_AN_OPTION', reason: "A Martyr's Death: discard a die or keep" }
    const s = ctx.state
    const index = pool(s, pending.player).indexOf(Number(m[1]))
    if (index < 0) return { code: 'E_NOT_AN_OPTION', reason: 'no such Miracle die in the pool' }
    const unitId = pending.context.unitId
    const abilityId = pending.context.abilityId ?? 'ade.s.a-martyrs-death'
    discardMiracleDie(ctx, pending.player, index, unitId, abilityId)
    if (unitId) s.phaseState.marks.push(martyrBonusMark(unitId))
  },
  // collect('onModelDestroyed') producer: D6 (+1 if a die was discarded) for a destroyed, not-yet-acted model of the target
  // unit; 4+ asks the engine to keep the model until the destroying unit has finished (deferRemoval, E4). The result is
  // marked per model so a second collect for the same destruction (hooks.run after the removal) never re-rolls.
  produce(ctx, entry, data) {
    const s = ctx.state
    const unitId = data.destroyedUnitId as UnitId | undefined
    const modelId = data.destroyedModelId as ModelId | null | undefined
    const byUnitId = data.byUnitId as UnitId | null | undefined
    if (!unitId || !modelId || !byUnitId) return null
    const holder = s.units[entry.holderUnitId]
    if (!holder || !leaderService.sameUnit(s, unitId, holder.id)) return null
    const markKey = martyrRollMark(modelId)
    const stored = s.phaseState.marks.find((x) => x.startsWith(`${markKey}=`))
    let success: boolean
    if (stored) {
      success = stored.endsWith('=1')
    } else {
      if (!modelNotYetActed(s, unitId)) return null
      const params = entry.params
      const threshold = (params.threshold as number | undefined) ?? 4
      const bonus = s.phaseState.marks.includes(martyrBonusMark(holder.id)) || s.phaseState.marks.includes(martyrBonusMark(leaderService.canonicalUnitId(s, holder.id)))
        ? ((params.discardBonus as number | undefined) ?? 1) : 0
      const player = holder.player
      const roll = ctx.rollExpr('D6', { purpose: 'ability', player, unitId: holder.id, commandRerollable: false }).total
      success = roll + bonus >= threshold
      s.phaseState.marks.push(`${markKey}=${success ? 1 : 0}`)
      ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: byUnitId, summary: `A Martyr's Death: rolled ${roll}${bonus ? ` +${bonus}` : ''} for ${modelId}: ${success ? 'fights on' : 'falls'}`, player })
    }
    if (!success) return null
    return { kind: 'request', deferRemoval: { kind: s.phase === 'shooting' ? 'ranged' : 'melee', afterUnitId: byUnitId } }
  },
}

// ---------- secondaries (called from missions.ts) ----------
// ADE-4 Hallowed Retribution: a kill credited to an own ADEPTA SORORITAS unit scores 3 VP, 4 if that unit performed an
// Act of Faith earlier in the same phase. Returns the amount to award to `byPlayer`, 0 when it does not apply.
export function hallowedRetributionAmount(s: GameState, info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null }, base: number): number {
  const pid = info.byPlayer
  if (!pid || !info.byUnitId) return 0
  const killer = s.units[info.byUnitId]
  const victim = s.units[info.unitId]
  if (!killer || !victim || killer.player !== pid || victim.player === pid) return 0
  const halves = leaderService.halves(s, info.byUnitId)
  if (!halves.some((id) => hasKeyword(s, id, ADEPTA_KEYWORD))) return 0
  const spent = s.players[pid].miracle?.spentThisPhase ?? []
  const performed = halves.some((id) => spent.includes(id)) || spent.includes(leaderService.canonicalUnitId(s, info.byUnitId))
  return performed ? base + 1 : base
}

// ADE-4 Consecrated Ground: flat award at the end of an own turn from round 2 (the rule's `rounds` gate does that);
// 4 when the qualifying unit contains the WARLORD. Battle-shocked units do not count [unconfirmed].
export function consecratedGroundAmount(s: GameState, pid: PlayerId, base: number): number {
  // horizontal base-edge distance to the centre (a model on an elevated level is still "within 6\"" of (0,0,0))
  const centre = { x: 0, z: 0 }
  const warlordId = s.players[pid].warlordUnitId
  let best = 0
  for (const u of boardUnitsOf(s, pid)) {
    if (u.bodyguardUnitId) continue
    const halves = boardHalves(s, u.id)
    if (halves.length === 0 || !halves.some((h) => keywordsOf(s, h).includes(ADEPTA_KEYWORD))) continue
    if (halves.some((h) => s.units[h].battleShocked)) continue
    const models = halves.flatMap((h) => unitModels(s, h))
    if (!models.some((m) => Math.max(0, signedDistanceToBase(centre, m)) <= 6 + 1e-6)) continue
    best = Math.max(best, halves.includes(warlordId) ? base + 1 : base)
  }
  return best
}

export const adeptaSororitasHooks: Record<string, EngineCodeHook> = {
  actsOfFaith, defenderOfTheFaithOc, righteousFuryPick, righteousFuryReroll, simulacrumImperialis, extremisTriggerWord, aMartyrsDeath,
}

export type { ChooseOptionDecision }
