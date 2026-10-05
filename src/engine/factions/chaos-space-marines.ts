// Chaos Space Marines code hooks (docs/spec/factions/chaos-space-marines.md section 7, CHA-001..CHA-032). Registered in code-hooks.ts.
// Dark Pacts, Foul Zealotry, Prey on the Weak, Sacrificial Dagger, Vindictive Strategy, Violent Unbinding, Daemonic Fervour. Marked for
// Execution (secondary) is scored in missions.ts (`markedForExecutionDestroyed`, hooked into the unitDestroyed callback).
//
// Mortal wounds raised from a pick (Dark Pact, Sacrificial Dagger) are queued on a fresh attack sequence but not advanced: the Shooting /
// Fight module drains it right after the `*.unitSelected` window closes (so a later pick, e.g. the Dagger after the Pact, is still offered
// before any allocation decision). The granted effects are granted eagerly - a unit or bearer wiped out by the mortal wounds simply has
// no weapons left to carry them.
import type { Effect } from '../../data/types'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distance } from '../geometry'
import type { AttackContext, RollContext } from '../hooks'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { unitModels } from '../state'
import type { ChooseOptionDecision, GameState, Model, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'
import type { Action } from '../actions'
import type { TimingWindowId } from '../../data/types'

const noop = () => undefined

// Engine contracts shared with attack.ts / fight-on-death.ts, read through their phase-scoped marks rather than imported: this module is
// pulled in by code-hooks.ts, and importing attack.ts here would make module load order matter (attack -> ... -> code-hooks -> here).
//   deathReaction:<json DeathReactionRequest>      (attack.ts C4)   hitBy:<attacker>:<weaponId>:<target>   (attack.ts C3)
//   fightOnDeath:<canonicalUnitId>:<threshold>     (fight-on-death.ts C5)
interface DeathRequest { modelId: string; unitId: UnitId; player: PlayerId; attackerUnitId: UnitId; pos: { x: number; y: number; z: number }; phase: string }
const DEATH_PREFIX = 'deathReaction:'
function pendingDeathReaction(s: GameState): DeathRequest | null {
  const m = s.phaseState.marks.find((x) => x.startsWith(DEATH_PREFIX))
  return m ? (JSON.parse(m.slice(DEATH_PREFIX.length)) as DeathRequest) : null
}
function consumeDeathReaction(s: GameState, modelId: string): void {
  s.phaseState.marks = s.phaseState.marks.filter((m) => !(m.startsWith(DEATH_PREFIX) && (JSON.parse(m.slice(DEATH_PREFIX.length)) as DeathRequest).modelId === modelId))
}
function unitsHitByWeapon(s: GameState, attackerUnitId: UnitId, weaponDataId: string): UnitId[] {
  const prefix = `hitBy:${leaderService.canonicalUnitId(s, attackerUnitId)}:`
  const out: UnitId[] = []
  for (const m of s.phaseState.marks) {
    if (!m.startsWith(prefix)) continue
    const rest = m.slice(prefix.length)
    const cut = rest.indexOf(':')
    if (cut < 0) continue
    const wid = rest.slice(0, cut)
    const w = s.weapons[wid]
    const hit = wid === weaponDataId || w?.profileGroup === weaponDataId || wid.replace('.w.', '.') === weaponDataId
    const t = rest.slice(cut + 1) as UnitId
    if (hit && !out.includes(t)) out.push(t)
  }
  return out
}
function grantFightOnDeath(s: GameState, unitId: UnitId, threshold: number): void {
  const mark = `fightOnDeath:${leaderService.canonicalUnitId(s, unitId)}:${threshold}`
  if (!s.phaseState.marks.includes(mark)) s.phaseState.marks.push(mark)
}

// ---------- helpers ----------
function boardHalves(s: GameState, canonical: UnitId): Unit[] {
  return leaderService.halves(s, canonical).map((id) => s.units[id]).filter((u): u is Unit => !!u && u.location === 'board' && unitModels(s, u.id).length > 0)
}

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  const ds = s.datasheets[unit.datasheetId]
  for (const id of ds?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

// an enhancement with this code whose bearer is alive and in one of the halves
function enhancementWithCode(s: GameState, halves: Unit[], code: string): string | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== code || !a.bearerModelId) continue
    if (s.models[a.bearerModelId] && halves.some((h) => h.models.includes(a.bearerModelId as string))) return a.id
  }
  return null
}

function optionAction(player: PlayerId, optionId: string): Action {
  return { type: 'chooseOption', player, decisionId: '', optionId }
}

function queueMortalsLazy(ctx: EngineContext, targetUnitId: UnitId, count: number, source: string): void {
  if (count <= 0) return
  ctx.services.attack.queueMortalWounds(ctx, targetUnitId, count, source, false)
}

function rejectNotOption(why: string): Rejection { return { code: 'E_NOT_AN_OPTION', reason: why } }

// ---------- Dark Pacts (CHA-2.x) ----------
const PACT_MARK = (unit: UnitId, phase: string) => `pick:darkPact:${unit}:${phase}`

function darkPactOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (window === 'shooting.unitSelected' ? s.phase !== 'shooting' : s.phase !== 'fight') return false
  const canon = leaderService.canonicalUnitId(s, key)
  const halves = boardHalves(s, canon)
  if (halves.length === 0) return false
  let abilityId: string | null = null
  for (const h of halves) abilityId = abilityId ?? abilityIdWithCode(s, h, 'darkPact')
  if (!abilityId) return false
  const mark = PACT_MARK(canon, s.phase)
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  const player = s.units[canon].player
  const both = enhancementWithCode(s, halves, 'foulZealotry') !== null
  const options: ChooseOptionDecision['options'] = both
    ? [
      { id: 'both', label: 'Dark Pact: Lethal Hits and Sustained Hits 1', action: optionAction(player, 'both'), hint: { unitId: canon, priority: 2 } },
      { id: 'decline', label: 'Decline the pact', action: optionAction(player, 'decline') },
    ]
    : [
      { id: 'sustained', label: 'Dark Pact: Sustained Hits 1', action: optionAction(player, 'sustained'), hint: { unitId: canon, priority: 1.2 } },
      { id: 'lethal', label: 'Dark Pact: Lethal Hits', action: optionAction(player, 'lethal'), hint: { unitId: canon, priority: 1 } },
      { id: 'decline', label: 'Decline the pact', action: optionAction(player, 'decline') },
    ]
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: canon, abilityId, data: { window, key, code: 'darkPact' } },
    options,
  })
  return true
}

function darkPactHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return rejectNotOption('dark pact expects chooseOption')
  if (action.optionId === 'decline') return
  if (!['lethal', 'sustained', 'both'].includes(action.optionId)) return rejectNotOption('dark pact: lethal, sustained, both or decline')
  const s = ctx.state
  const unitId = pending.context.unitId as UnitId
  const abilityId = pending.context.abilityId ?? 'csm.a.dark-pacts'
  const unit = s.units[unitId]
  if (!unit) return rejectNotOption('dark pact: unit missing')
  // CHA-2.2: Leadership test (not a Battle-shock test); a failure costs D3 mortal wounds, the pact is made either way
  const passed = ctx.services.hooks.leadershipTest ? ctx.services.hooks.leadershipTest(ctx, unitId, abilityId) : true
  const choices = (s.abilities[abilityId]?.params?.choices as Effect[] | undefined) ?? [{ grantWeaponAbility: { ability: 'LETHAL_HITS' } }, { grantWeaponAbility: { ability: 'SUSTAINED_HITS', value: 1 } }]
  const granted: Effect[] = action.optionId === 'both' ? choices : [action.optionId === 'lethal' ? choices[0] : choices[1]]
  ctx.services.effects.grant(ctx, unitId, granted, { sourceAbilityId: abilityId, sourceUnitId: unitId, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null })
  const names = action.optionId === 'both' ? 'Lethal Hits and Sustained Hits 1' : action.optionId === 'lethal' ? 'Lethal Hits' : 'Sustained Hits 1'
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unitId, targetUnitId: unitId, summary: `Dark Pact: weapons gain ${names} this phase`, player: unit.player })
  if (!passed) {
    const n = ctx.rollExpr('D3', { purpose: 'ability', player: unit.player, unitId }).total
    queueMortalsLazy(ctx, unitId, n, abilityId)
  }
}

const darkPact: EngineCodeHook = {
  name: 'darkPact', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
  pick: { window: 'shooting.unitSelected', windows: ['shooting.unitSelected', 'fight.unitSelected'], topic: 'abilityChoice', offer: darkPactOffer, handle: darkPactHandle },
}

// ---------- Foul Zealotry: marker, read by darkPact ----------
const foulZealotry: EngineCodeHook = { name: 'foulZealotry', kind: 'ability', hook: 'onStatQuery', run: noop, gate: () => false }

// ---------- Sacrificial Dagger (CHA-6) ----------
function daggerOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (window === 'shooting.unitSelected' ? s.phase !== 'shooting' : s.phase !== 'fight') return false
  const canon = leaderService.canonicalUnitId(s, key)
  for (const half of boardHalves(s, canon)) {
    const abilityId = abilityIdWithCode(s, half, 'sacrificialDagger')
    const bearer = unitModels(s, half.id)[0]
    if (!abilityId || !bearer) continue
    const mark = `pick:dagger:${bearer.id}:${s.phase}`
    if (s.phaseState.marks.includes(mark)) return false
    s.phaseState.marks.push(mark)
    const player = half.player
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: canon, abilityId, data: { window, key, code: 'sacrificialDagger', bearerModelId: bearer.id } },
      options: [
        { id: 'use', label: 'Sacrificial Dagger: 1 mortal wound for +1 to hit and wound with Psychic weapons', action: optionAction(player, 'use'), hint: { unitId: canon, priority: 0.6 } },
        { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
      ],
    })
    return true
  }
  return false
}

function daggerHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return rejectNotOption('dagger expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return rejectNotOption('dagger: use or decline')
  const s = ctx.state
  const canon = pending.context.unitId as UnitId
  const bearerId = pending.context.data.bearerModelId as string | undefined
  const abilityId = pending.context.abilityId ?? 'csm.a.sacrificial-dagger'
  const bearer = bearerId ? s.models[bearerId] : undefined
  if (!bearer) return rejectNotOption('dagger: bearer missing')
  const params = s.abilities[abilityId]?.params ?? {}
  const effect = (params.effect as Effect[] | undefined) ?? [
    { when: { weaponAbility: 'PSYCHIC' }, modifyRoll: { roll: 'hit', value: 1 } },
    { when: { weaponAbility: 'PSYCHIC' }, modifyRoll: { roll: 'wound', value: 1 } },
  ]
  // the effect is held by the bearer's own unit half so `bearer` scope resolves to this model
  ctx.services.effects.grant(ctx, bearer.unitId, effect, { sourceAbilityId: abilityId, sourceUnitId: bearer.unitId, scope: { who: 'bearer' }, duration: 'untilEndOfPhase', when: null })
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: bearer.unitId, targetUnitId: canon, summary: 'Sacrificial Dagger: 1 mortal wound, Psychic weapons +1 to hit and wound this phase', player: pending.player })
  queueMortalsLazy(ctx, canon, (params.mortalWounds as number | undefined) ?? 1, abilityId)
}

const sacrificialDagger: EngineCodeHook = {
  name: 'sacrificialDagger', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
  pick: { window: 'shooting.unitSelected', windows: ['shooting.unitSelected', 'fight.unitSelected'], topic: 'abilityChoice', offer: daggerOffer, handle: daggerHandle },
}

// ---------- Prey on the Weak (enhancement) ----------
function preyOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (s.phase !== 'shooting') return false
  const canon = leaderService.canonicalUnitId(s, key)
  const unit = s.units[canon]
  if (!unit || unit.player !== s.activePlayer) return false
  const abilityId = enhancementWithCode(s, boardHalves(s, canon), 'preyOnTheWeak')
  if (!abilityId) return false
  const mark = `pick:prey:${canon}`
  if (s.phaseState.marks.includes(mark)) return false
  const params = s.abilities[abilityId].params ?? {}
  const weaponId = (params.weaponId as string | undefined) ?? 'csm.w.rite-of-possession'
  const candidates = unitsHitByWeapon(s, canon, weaponId).filter((id) => leaderService.halves(s, id).some((h) => s.units[h]?.location === 'board'))
  s.phaseState.marks.push(mark)
  if (candidates.length === 0) return false
  const player = unit.player
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: canon, abilityId, data: { window, key, code: 'preyOnTheWeak' } },
    options: candidates.map((id) => ({ id, label: `Battle-shock test (-1): ${s.units[id].name}`, action: optionAction(player, id), hint: { unitId: id } })),
  })
  return true
}

function preyHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return rejectNotOption('prey on the weak expects chooseOption')
  const s = ctx.state
  const target = s.units[action.optionId]
  if (!target || target.player === pending.player || target.location !== 'board') return { code: 'E_INVALID_TARGET', reason: 'prey on the weak must target an enemy unit on the battlefield' }
  const abilityId = pending.context.abilityId ?? 'csm.e.prey-on-the-weak'
  const modifier = (s.abilities[abilityId]?.params?.battleShockModifier as number | undefined) ?? -1
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: pending.context.unitId, targetUnitId: target.id, summary: `Prey on the Weak: ${target.name} takes a Battle-shock test at ${modifier}`, player: pending.player })
  ctx.services.hooks.battleShockTest?.(ctx, leaderService.canonicalUnitId(s, target.id), abilityId, modifier)
}

const preyOnTheWeak: EngineCodeHook = {
  name: 'preyOnTheWeak', kind: 'ability', hook: 'onPhaseEnd', run: noop,
  pick: { window: 'shooting.attacksResolved', topic: 'abilityChoice', offer: preyOffer, handle: preyHandle },
}

// ---------- Vindictive Strategy (stratagem) ----------
const vindictiveStrategy: EngineCodeHook = {
  name: 'vindictiveStrategy', kind: 'stratagem', hook: 'onHitRoll', run: noop, hooks: ['onHitRoll', 'onWoundRoll'],
  // the re-roll lives on the granted ActiveEffect; it only applies against a target that is below Starting Strength (hit rolls) or
  // below half-strength (wound rolls)
  gateEffect(state, _holder, _entry, data) {
    const attack = data?.attack as AttackContext | undefined
    const roll = data?.roll as RollContext | undefined
    if (!attack || !roll) return false
    const t = leaderService.canonicalUnitId(state, attack.targetUnitId)
    // below half-strength implies below Starting Strength (a 1-model unit is judged on wounds left, so its model count never drops)
    if (roll.purpose === 'hit') return leaderService.isBelowStartingStrength(state, t) || leaderService.isBelowHalfStrength(state, t)
    if (roll.purpose === 'wound') return leaderService.isBelowHalfStrength(state, t)
    return false
  },
  check(env: StratagemEnv, t: StratagemTuple) {
    const { state } = env
    const unit = t.ids[0]
    if (!unit || !state.units[unit]) return false
    const halves = leaderService.halves(state, unit)
    if (state.phase === 'shooting') {
      if (env.player !== state.activePlayer) return false
      return !halves.some((h) => state.phaseState.activated.includes(h) || state.units[h].turn.shotThisPhase)
    }
    if (state.phase === 'fight') {
      const fight = state.phaseState.fight
      return !halves.some((h) => state.units[h].turn.foughtThisPhase || fight?.fought.includes(h) || fight?.currentUnitId === h)
    }
    return false
  },
}

// ---------- Violent Unbinding (stratagem, window attack.modelDestroyed) ----------
function destroyedFootprint(s: GameState, unitId: UnitId, modelId: string): Model | null {
  const live = s.models[modelId]
  if (live) return live
  return s.units[unitId]?.destroyedModels?.find((m) => m.id === modelId) ?? null
}

const violentUnbinding: EngineCodeHook = {
  name: 'violentUnbinding', kind: 'stratagem', hook: 'onModelDestroyed', run: noop,
  check(env, t) {
    const { state } = env
    const req = pendingDeathReaction(state)
    if (!req || req.unitId !== t.ids[0] || req.player !== env.player) return false
    const range = (env.stratagem.params?.range as number | undefined) ?? 6
    const snapshot = destroyedFootprint(state, req.unitId, req.modelId)
    if (!snapshot) return false
    const at = { ...snapshot, pos: req.pos }
    return leaderService.halves(state, req.attackerUnitId).some((id) => state.units[id]?.location === 'board'
      && unitModels(state, id).some((m) => distance(at, m) <= range + 1e-6))
  },
  apply(ctx, env, t) {
    const s = ctx.state
    const req = pendingDeathReaction(s)
    if (!req || req.unitId !== t.ids[0]) return
    const attacker = leaderService.canonicalUnitId(s, req.attackerUnitId)
    const roll = ctx.roll({ purpose: 'ability', player: env.player, sides: 6, count: 1, mode: 'perDie', unitId: req.unitId, commandRerollable: false })
    const die = roll.dice[0]
    let n = 0
    if (die === 6) n = 3
    else if (die >= 2) n = ctx.rollExpr('D3', { purpose: 'ability', player: env.player, unitId: req.unitId }).total
    ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: req.unitId, targetUnitId: attacker, summary: n > 0 ? `Violent Unbinding: rolled ${die}, ${n} mortal wound(s)` : `Violent Unbinding: rolled ${die}, nothing happens`, player: env.player })
    // the attack sequence in flight drains the queue; the request is spent so the window is not offered again
    queueMortalsLazy(ctx, attacker, n, env.stratagem.id)
    consumeDeathReaction(s, req.modelId)
  },
}

// ---------- Daemonic Fervour (stratagem; the deferral itself is engine work in attack.ts / fight-on-death.ts) ----------
const daemonicFervour: EngineCodeHook = {
  name: 'daemonicFervour', kind: 'stratagem', hook: 'onTargetsDeclared', run: noop,
  check(env, t) {
    const { state } = env
    if (state.phase !== 'fight' || !t.ids[0]) return false
    const fight = state.phaseState.fight
    return !leaderService.halves(state, t.ids[0]).some((h) => state.units[h].turn.foughtThisPhase || fight?.fought.includes(h) || fight?.currentUnitId === h)
  },
  apply(ctx, env, t) {
    const threshold = (env.stratagem.params?.threshold as number | undefined) ?? 4
    grantFightOnDeath(ctx.state, leaderService.canonicalUnitId(ctx.state, t.ids[0]), threshold)
  },
}

export const chaosSpaceMarinesHooks = { darkPact, foulZealotry, preyOnTheWeak, sacrificialDagger, vindictiveStrategy, violentUnbinding, daemonicFervour }
