// Genestealer Cults code hooks (docs/spec/factions/genestealer-cults.md §7): cultAmbush (registration; the lifecycle lives in
// factions/genestealer-cults.ts), defendTheMagus, returnToTheShadows, riseUp, willOfThePatriarch.
// code-hooks.ts registers them through `genestealerCultsHooks`, a hoisted factory (the module graph is circular, so nothing
// here may run at import time).
import type { ScoringRule } from '../../data/types'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distanceToPoint, partlyWithinPolygon, playerBattlefieldEdge, unitsWithinEngagementRange, withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { boardModelsOf, deploymentZone, unitModels } from '../state'
import type { GameState, Model, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'
import type { Action } from '../actions'
import type { ActiveEffect } from '../types'
import type { HookSourceEntry } from '../hooks-impl'
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


// ---------- Claw of Ascension helpers (docs/spec/factions/genestealer-cults--claw-of-ascension.md section 7) ----------
const otherOf = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

function halfWithAbility(s: GameState, canonical: UnitId, code: string): { unit: Unit; abilityId: string } | null {
  for (const id of boardHalves(s, canonical)) {
    const unit = s.units[id]
    const abilityId = unit ? abilityIdWithCode(s, unit, code) : null
    if (unit && abilityId) return { unit, abilityId }
  }
  return null
}

// an enhancement ability with this code whose bearer is alive; returns the ability id and the bearer's model
function enhancementBearer(s: GameState, code: string, player: PlayerId): { abilityId: string; model: Model; canon: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== code || !a.bearerModelId) continue
    const model = s.models[a.bearerModelId]
    if (!model) continue
    const unit = s.units[model.unitId]
    if (!unit || unit.location !== 'board' || unit.player !== player) continue
    return { abilityId: a.id, model, canon: canon(s, unit.id) }
  }
  return null
}

// `hitBy:<attackerCanon>:<weaponId>:<target>` phase marks (attack.ts), any weapon; read directly (import cycle)
function unitsHitByUnit(s: GameState, attackerUnitId: UnitId): UnitId[] {
  const prefix = `hitBy:${canon(s, attackerUnitId)}:`
  const out: UnitId[] = []
  for (const m of s.phaseState.marks) {
    if (!m.startsWith(prefix)) continue
    const rest = m.slice(prefix.length)
    const cut = rest.indexOf(':')
    if (cut < 0) continue
    const t = canon(s, rest.slice(cut + 1) as UnitId)
    if (!out.includes(t) && boardHalves(s, t).length > 0) out.push(t)
  }
  return out
}

function ownerOfSource(state: GameState, entry: HookSourceEntry): PlayerId | null {
  const id = entry.active?.sourceUnitId
  return id && state.units[id] ? state.units[id].player : null
}

// gate for target-held effects: only attackers of the source's army
function attackerIsSourceOwner(state: GameState, entry: HookSourceEntry, data?: Record<string, unknown>): boolean {
  const attack = data?.attack as { attackerUnitId?: UnitId } | null | undefined
  if (!attack?.attackerUnitId) return true
  const attacker = state.units[attack.attackerUnitId]
  const owner = ownerOfSource(state, entry)
  return !!attacker && owner !== null && attacker.player === owner
}

const PHASE_AT_OR_AFTER_SHOOTING = ['shooting', 'charge', 'fight', 'ended']
// Master of Suppression lasts until the start of the owner's next Shooting phase. The effect is granted with duration 'battle' and
// expires = { round: grant round, player: owner }; this reads the turn order off them instead of storing extra state.
function suppressionExpired(state: GameState, active: ActiveEffect): boolean {
  const owner = active.expires.player
  if (!owner) return false
  const idx = (round: number, p: PlayerId): number => round * 2 + (p === state.firstPlayer ? 0 : 1)
  const next = idx(active.expires.round + 1, owner)
  const cur = idx(state.round, state.activePlayer)
  return cur > next || (cur === next && PHASE_AT_OR_AFTER_SHOOTING.includes(state.phase))
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

  // ---------- Claw of Ascension ----------
  // Priority Kill Order (CLA-3.1): start of the owner's Shooting phase, the bearer picks an enemy unit visible to them; GSC attacks
  // against it may re-roll the hit roll until the end of the phase. The enhancement's own declarative effect is inert (`gate`): the
  // re-roll is granted onto the picked enemy unit.
  const priorityKillOrder: EngineCodeHook = {
    name: 'priorityKillOrder', kind: 'ability', hook: 'onPhaseStart', run: noop, hooks: ['onHitRoll'],
    gate: () => false,
    gateActive: attackerIsSourceOwner,
    pick: {
      window: 'shooting.start', topic: 'abilityChoice',
      offer(ctx, window, key) {
        const s = ctx.state
        if (s.phase !== 'shooting') return false
        const player = s.activePlayer
        const bearer = enhancementBearer(s, 'priorityKillOrder', player)
        if (!bearer) return false
        const mark = `pick:pko:${s.round}:${player}`
        if (s.phaseState.marks.includes(mark)) return false
        s.phaseState.marks.push(mark)
        const candidates = canonicalBoardUnits(s, otherOf(player)).filter((u) =>
          boardModelsOfUnit(s, u.id).some((m) => ctx.services.los.visible(s, bearer.model.id, m.id)))
        if (candidates.length === 0) return false
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'abilityChoice', unitId: bearer.canon, abilityId: bearer.abilityId, data: { window, key, code: 'priorityKillOrder' } },
          options: [
            ...candidates.map((u) => ({ id: u.id, label: `Priority Kill Order: ${u.name}`, action: optionAction(player, u.id), hint: { unitId: u.id, priority: 1 } })),
            { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
          ],
        })
        return true
      },
      handle(ctx, action, pending) {
        if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Priority Kill Order expects chooseOption')
        if (action.optionId === 'decline') return
        const s = ctx.state
        const target = s.units[action.optionId]
        const abilityId = pending.context.abilityId
        if (!target || target.player === pending.player || target.location !== 'board' || !abilityId) return { code: 'E_INVALID_TARGET', reason: 'Priority Kill Order must target an enemy unit on the battlefield' }
        const enemy = canon(s, target.id)
        const sourceUnitId = pending.context.unitId as UnitId
        for (const half of boardHalves(s, enemy)) {
          ctx.services.effects.grant(ctx, half, [{ reroll: 'all' }], {
            sourceAbilityId: abilityId, sourceUnitId, scope: { who: 'attacker' }, duration: 'untilEndOfPhase', when: { attackerKeyword: 'GENESTEALER CULTS' },
          })
        }
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId, targetUnitId: enemy, summary: `Priority Kill Order: attacks against ${s.units[enemy].name} may re-roll hit rolls`, player: pending.player })
      },
    },
  }

  // Master of Suppression (CLA-3.2): after the bearer's unit shot, one enemy unit it hit takes -1 to hit with every attack until the
  // start of the owner's next Shooting phase
  const masterOfSuppression: EngineCodeHook = {
    name: 'masterOfSuppression', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
    gateActive: (state, entry) => !entry.active || !suppressionExpired(state, entry.active),
    pick: {
      window: 'shooting.attacksResolved', topic: 'abilityChoice',
      offer(ctx, window, key) {
        const s = ctx.state
        if (s.phase !== 'shooting') return false
        const unit = s.units[key]
        if (!unit || unit.location !== 'board') return false
        const cu = canon(s, unit.id)
        const player = s.units[cu]?.player
        if (!player || player !== s.activePlayer) return false
        const bearer = enhancementBearer(s, 'masterOfSuppression', player)
        if (!bearer || bearer.canon !== cu) return false
        const mark = `pick:mos:${s.round}:${cu}`
        if (s.phaseState.marks.includes(mark)) return false
        s.phaseState.marks.push(mark)
        const candidates = unitsHitByUnit(s, cu)
        if (candidates.length === 0) return false
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'abilityChoice', unitId: cu, abilityId: bearer.abilityId, data: { window, key, code: 'masterOfSuppression' } },
          options: [
            ...candidates.map((id) => ({ id, label: `Suppress ${s.units[id].name} (-1 to Hit)`, action: optionAction(player, id), hint: { unitId: id, priority: 1 } })),
            { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
          ],
        })
        return true
      },
      handle(ctx, action, pending) {
        if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Master of Suppression expects chooseOption')
        if (action.optionId === 'decline') return
        const s = ctx.state
        const cu = pending.context.unitId as UnitId
        const abilityId = pending.context.abilityId
        if (!abilityId || !unitsHitByUnit(s, cu).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit your unit hit this phase' }
        for (const half of boardHalves(s, action.optionId)) {
          const active = ctx.services.effects.grant(ctx, half, [{ modifyRoll: { roll: 'hit', value: -1 } }], {
            sourceAbilityId: abilityId, sourceUnitId: cu, scope: { who: 'self' }, duration: 'battle', when: null,
          })
          active.expires = { kind: 'battle', round: s.round, player: pending.player }
        }
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: cu, targetUnitId: action.optionId, summary: `Master of Suppression: ${s.units[action.optionId].name} takes -1 to Hit until your next Shooting phase`, player: pending.player })
      },
    },
  }

  // Master Outrider (CLA-6.1): after the unit shot, outside Engagement Range, a Normal move of up to 6"; no charge that turn
  const masterOutrider: EngineCodeHook = {
    name: 'masterOutrider', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
    pick: {
      window: 'shooting.attacksResolved', topic: 'abilityChoice',
      offer(ctx, window, key) {
        const s = ctx.state
        if (s.phase !== 'shooting') return false
        const unit = s.units[key]
        if (!unit || unit.location !== 'board') return false
        const cu = canon(s, unit.id)
        const cUnit = s.units[cu]
        if (!cUnit || cUnit.player !== s.activePlayer) return false
        const holder = halfWithAbility(s, cu, 'masterOutrider')
        if (!holder) return false
        const mark = `pick:outrider:${cu}`
        if (s.phaseState.marks.includes(mark)) return false
        s.phaseState.marks.push(mark)
        if (leaderService.inEngagementWithEnemy(s, cu)) return false
        const player = cUnit.player
        const distance = (s.abilities[holder.abilityId]?.params?.distance as number | undefined) ?? 6
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'abilityChoice', unitId: cu, abilityId: holder.abilityId, data: { window, key, code: 'masterOutrider' } },
          options: [
            { id: 'move', label: `Master Outrider: Normal move of up to ${distance}" (no charge this turn)`, action: optionAction(player, 'move'), hint: { priority: 1 } },
            { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
          ],
        })
        return true
      },
      handle(ctx, action, pending) {
        if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Master Outrider expects chooseOption')
        if (action.optionId === 'decline') return
        if (action.optionId !== 'move') return notAnOption('Master Outrider: move or decline')
        const s = ctx.state
        const cu = pending.context.unitId as UnitId
        const abilityId = pending.context.abilityId
        if (!abilityId || !s.units[cu] || boardHalves(s, cu).length === 0) return notAnOption('Master Outrider: the unit is no longer on the battlefield')
        if (leaderService.inEngagementWithEnemy(s, cu)) return { code: 'E_ENGAGEMENT', reason: 'Master Outrider cannot be used while within Engagement Range of an enemy unit' }
        const distance = (s.abilities[abilityId]?.params?.distance as number | undefined) ?? 6
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: cu, targetUnitId: null, summary: `Master Outrider: ${s.units[cu].name} moves up to ${distance}"`, player: pending.player })
        startReactiveMove(ctx, cu, distance, abilityId, 'shooting.attacksResolved')
        // CLA-6.1: the no-charge cost is applied by the reactive move's resolution (params.forfeitCharge), so passing keeps the charge
      },
    },
  }

  // Crossfire (CLA-6.2): after the Ridgerunner shot, one enemy unit it hit (not picked yet this turn) takes AP-1 from GSC attacks this turn
  const crossfire: EngineCodeHook = {
    name: 'crossfire', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
    gateActive: attackerIsSourceOwner,
    pick: {
      window: 'shooting.attacksResolved', topic: 'abilityChoice',
      offer(ctx, window, key) {
        const s = ctx.state
        if (s.phase !== 'shooting') return false
        const unit = s.units[key]
        if (!unit || unit.location !== 'board') return false
        const cu = canon(s, unit.id)
        const cUnit = s.units[cu]
        if (!cUnit || cUnit.player !== s.activePlayer) return false
        const holder = halfWithAbility(s, cu, 'crossfire')
        if (!holder) return false
        const mark = `pick:crossfire:${cu}`
        if (s.phaseState.marks.includes(mark)) return false
        s.phaseState.marks.push(mark)
        const prefix = `${s.round}:${s.activePlayer}:`
        const picked = ((s.mission.custom.crossfireMarked as string[] | undefined) ?? []).filter((m) => m.startsWith(prefix))
        const candidates = unitsHitByUnit(s, cu).filter((id) => !picked.includes(prefix + id))
        if (candidates.length === 0) return false
        const player = cUnit.player
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'abilityChoice', unitId: cu, abilityId: holder.abilityId, data: { window, key, code: 'crossfire' } },
          options: candidates.map((id) => ({ id, label: `Crossfire: ${s.units[id].name} (AP improves by 1 vs your Genestealer Cults)`, action: optionAction(player, id), hint: { unitId: id, priority: 1 } })),
        })
        return true
      },
      handle(ctx, action, pending) {
        if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Crossfire expects chooseOption')
        const s = ctx.state
        const cu = pending.context.unitId as UnitId
        const abilityId = pending.context.abilityId
        if (!abilityId || !unitsHitByUnit(s, cu).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit this unit hit this phase' }
        const key = `${s.round}:${s.activePlayer}:${action.optionId}`
        const list = ((s.mission.custom.crossfireMarked as string[] | undefined) ?? []).filter((m) => m.startsWith(`${s.round}:${s.activePlayer}:`))
        if (list.includes(key)) return { code: 'E_INVALID_TARGET', reason: 'that unit was already picked by Crossfire this turn' }
        list.push(key)
        s.mission.custom.crossfireMarked = list
        for (const half of boardHalves(s, action.optionId)) {
          ctx.services.effects.grant(ctx, half, [{ modifyStat: { stat: 'AP', value: -1 } }], {
            sourceAbilityId: abilityId, sourceUnitId: cu, scope: { who: 'attacker' }, duration: 'untilEndOfTurn', when: { attackerKeyword: 'GENESTEALER CULTS' },
          })
        }
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: cu, targetUnitId: action.optionId, summary: `Crossfire: attacks against ${s.units[action.optionId].name} improve their AP by 1 this turn`, player: pending.player })
      },
    },
  }

  // Swarm the Oppressors (CLA-5.3): every own GSC unit gets +1 to Charge rolls for charges that include the chosen enemy unit
  const swarmTheOppressors: EngineCodeHook = {
    name: 'swarmTheOppressors', kind: 'stratagem', hook: 'onChargeRoll', hooks: ['onChargeRoll'], run: noop, grantsItself: true,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      const enemy = state.units[t.ids[0]]
      if (!enemy || enemy.location !== 'board' || enemy.player === env.player) return false
      return canonicalBoardUnits(state, env.player).some((u) => anyHalfHasKeyword(state, u.id, 'GENESTEALER CULTS'))
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const enemyId = canon(s, t.ids[0])
      s.phaseState.marks.push(`swarm:${env.player}:${enemyId}`)
      const strat = env.stratagem
      const effect = Array.isArray(strat.effect) ? strat.effect : strat.effect ? [strat.effect] : [{ modifyRoll: { roll: 'charge' as const, value: 1 } }]
      let first: UnitId | null = null
      for (const u of canonicalBoardUnits(s, env.player)) {
        if (!anyHalfHasKeyword(s, u.id, 'GENESTEALER CULTS')) continue
        first ??= u.id
        for (const half of boardHalves(s, u.id)) {
          ctx.services.effects.grant(ctx, half, effect, { sourceAbilityId: strat.id, sourceUnitId: u.id, scope: { who: 'self' }, duration: strat.duration ?? 'untilEndOfPhase', when: strat.when ?? null })
        }
      }
      ctx.emit({ type: 'AbilityTriggered', abilityId: strat.id, sourceUnitId: first ?? enemyId, targetUnitId: enemyId, summary: `Swarm the Oppressors: charges against ${s.units[enemyId].name} get +1 to the Charge roll`, player: env.player })
    },
    gateActive(state, entry, data) {
      const targets = (data?.targetUnitIds as UnitId[] | undefined) ?? []
      const holder = state.units[entry.holderUnitId]
      if (!holder) return false
      return state.phaseState.marks.some((m) => {
        const parts = m.split(':')
        return parts[0] === 'swarm' && parts[1] === holder.player && targets.some((t) => leaderService.sameUnit(state, t, parts.slice(2).join(':')))
      })
    },
  }

  const infiltrationAgenda: EngineCodeHook = { name: 'infiltrationAgenda', kind: 'mission', hook: 'onTurnEnd', run: noop }
  const safeguardTheSanctuary: EngineCodeHook = { name: 'safeguardTheSanctuary', kind: 'mission', hook: 'onPhaseEnd', run: noop }

  return { cultAmbush, defendTheMagus, returnToTheShadows, riseUp, willOfThePatriarch, priorityKillOrder, masterOfSuppression, masterOutrider, crossfire, swarmTheOppressors, infiltrationAgenda, safeguardTheSanctuary }
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

// Infiltration Agenda (CLA-4.1): flat pointsPer when a non-Battle-shocked GENESTEALER CULTS unit has a model whose base overlaps
// the opponent's deployment zone ("within" = any part)
export function infiltrationAgendaAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const zone = deploymentZone(s, otherOf(pid))
  for (const u of canonicalBoardUnits(s, pid)) {
    for (const id of boardHalves(s, u.id)) {
      if (s.units[id].battleShocked || !hookService.keywordsFor(s, id).includes('GENESTEALER CULTS')) continue
      if (unitModels(s, id).some((m) => partlyWithinPolygon(m, zone))) return rule.pointsPer
    }
  }
  return 0
}

// Safeguard the Sanctuary (CLA-4.2): pointsPer when the player controls the marker(s) closest to their battlefield edge
export function safeguardTheSanctuaryAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, controls: (objectiveId: string) => boolean): number {
  const s = ctx.state
  const edge = playerBattlefieldEdge(s.board, deploymentZone(s, pid))
  const hw = s.board.w / 2, hh = s.board.h / 2
  const dist = (p: { x: number; z: number }): number => (edge === 'L' ? p.x + hw : edge === 'R' ? hw - p.x : edge === 'T' ? p.z + hh : hh - p.z)
  const live = Object.values(s.objectives).filter((o) => !o.removed)
  if (live.length === 0) return 0
  const best = Math.min(...live.map((o) => dist(o.pos)))
  return live.filter((o) => dist(o.pos) <= best + 0.01).some((o) => controls(o.id)) ? rule.pointsPer : 0
}
