// T'au Empire engine rules (docs/spec/factions/tau-empire.md §7): the nine (b) code hooks.
// code-hooks.ts registers them through `tauEmpireHooks`, a hoisted factory (the module graph is circular: hooks-impl <->
// code-hooks <-> this file, so nothing here may run at import time). Mission amounts (Kauyon Lure, Leadership Caste) are
// plain functions called from missions.ts.
//
// For the Greater Good state lives in phase marks (they expire with the phase), canonical unit ids throughout:
//   `ftgg:guided:<guidedId>=<observerId>@<spottedId>`   the shooting unit, its Observer and the Spotted enemy
//   `ftgg:obs:<observerId>`                              the unit has acted as an Observer this phase
//   `pick:ftgg:<unitId>`                                 the pick was already raised for this unit this phase
import type { Action } from '../actions'
import { shotThisTurn } from '../attack'
import { pushReaction, eligibleToShootNow, type EngineCodeHook, type StratagemEnv, type StratagemTuple } from '../code-hooks'
import { partlyWithinPolygon, pointInPolygon, withinObjectiveRange } from '../geometry'
import { coverMarkKey, hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import { transportService } from '../transports'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { unitEligibleToShoot } from '../phases/shooting'
import { boardModelsOf, deploymentZone, keywordsOf, unitModels } from '../state'
import type {
  ChooseOptionDecision, GameState, Model, PendingDecision, PlayerId, Rejection, RuntimeAbility, TimingWindowId, Unit, UnitId,
} from '../types'

const noop = () => undefined
const GUIDED = 'ftgg:guided:'
const OBS = 'ftgg:obs:'

function canon(state: GameState, id: UnitId): UnitId { return leaderService.canonicalUnitId(state, id) }

function boardHalves(state: GameState, unitId: UnitId): UnitId[] {
  return leaderService.halves(state, unitId).filter((id) => state.units[id]?.location === 'board')
}

function boardModelsOfUnit(state: GameState, unitId: UnitId): Model[] {
  return boardHalves(state, unitId).flatMap((id) => unitModels(state, id))
}

function canonicalBoardUnits(state: GameState, player: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.player === player && u.location === 'board' && !u.bodyguardUnitId)
}

function anyHalfHasKeyword(state: GameState, unitId: UnitId, keyword: string): boolean {
  return leaderService.halves(state, unitId).some((id) => hookService.keywordsFor(state, id).includes(keyword))
}

// abilities carrying `code` on any half of the unit's datasheets
function abilitiesWithCode(state: GameState, unitId: UnitId, code: string): RuntimeAbility[] {
  const out: RuntimeAbility[] = []
  for (const half of leaderService.halves(state, unitId)) {
    const ds = state.datasheets[state.units[half]?.datasheetId]
    for (const id of ds?.abilities ?? []) if (state.abilities[id]?.code === code) out.push(state.abilities[id])
  }
  return out
}

function optionAction(player: PlayerId, optionId: string): Action {
  return { type: 'chooseOption', player, decisionId: '', optionId }
}

// ---------- For the Greater Good: marks ----------
interface Guided { guided: UnitId; observer: UnitId; spotted: UnitId }

function guidedMarks(state: GameState): Guided[] {
  const out: Guided[] = []
  for (const m of state.phaseState.marks) {
    if (!m.startsWith(GUIDED)) continue
    const [g, rest] = m.slice(GUIDED.length).split('=')
    const [observer, spotted] = (rest ?? '').split('@')
    if (g && observer && spotted) out.push({ guided: g, observer, spotted })
  }
  return out
}

function guidedOf(state: GameState, guidedCanon: UnitId): Guided | null {
  return guidedMarks(state).find((g) => g.guided === guidedCanon) ?? null
}

// Observer marker drone (Stealth Battlesuits): may observe after Advancing while the named model lives
function hasObserverAfterAdvance(state: GameState, unitId: UnitId): boolean {
  for (const a of abilitiesWithCode(state, unitId, 'wargearBearerAlive')) {
    if (!a.params?.observerAfterAdvance) continue
    const modelId = a.params.modelId as string | undefined
    if (!modelId) continue
    const holder = leaderService.halves(state, unitId).map((h) => state.units[h]).find((u) => u && u.location === 'board' && state.datasheets[u.datasheetId]?.abilities.includes(a.id))
    if (holder && holder.models.some((id) => state.models[id]?.datasheetModelId === modelId)) return true
  }
  return false
}

// C5: can this unit serve as the Observer right now (it must itself be able to shoot this phase, and not already have acted)?
export function ftggObserverEligible(ctx: EngineContext, unitId: UnitId): boolean {
  const s = ctx.state
  const id = canon(s, unitId)
  const u = s.units[id]
  if (!u || u.location !== 'board') return false
  const halves = boardHalves(s, id)
  if (halves.length === 0) return false
  if (halves.some((h) => s.units[h].battleShocked || s.units[h].turn.shotThisPhase || s.phaseState.activated.includes(h))) return false
  if (s.phaseState.marks.includes(OBS + id)) return false
  return unitEligibleToShoot(ctx, id, { ignoreAdvance: hasObserverAfterAdvance(s, id) })
}

function ftggOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (s.phase !== 'shooting' || window !== 'shooting.unitSelected') return false
  const sel = canon(s, key)
  const unit = s.units[sel]
  if (!unit || unit.location !== 'board' || unit.player !== s.activePlayer) return false
  const abilities = abilitiesWithCode(s, sel, 'forTheGreaterGood')
  if (abilities.length === 0) return false
  const mark = `pick:ftgg:${sel}`
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  // a unit that already acted as an Observer is not offered the pick again (TAU-008)
  if (s.phaseState.marks.includes(OBS + sel)) return false
  const player = unit.player
  const selModels = boardModelsOfUnit(s, sel)
  const enemies = canonicalBoardUnits(s, player === 'A' ? 'B' : 'A')
  const options: ChooseOptionDecision['options'] = []
  for (const obs of canonicalBoardUnits(s, player)) {
    if (obs.id === sel || abilitiesWithCode(s, obs.id, 'forTheGreaterGood').length === 0) continue
    if (!ftggObserverEligible(ctx, obs.id)) continue
    const obsModels = boardModelsOfUnit(s, obs.id)
    const markerlight = anyHalfHasKeyword(s, obs.id, 'MARKERLIGHT')
    for (const e of enemies) {
      const seen = (models: Model[]) => models.some((m) => ctx.services.los.unitVisible(s, m.id, e.id))
      if (!seen(selModels) || !seen(obsModels)) continue
      options.push({
        id: `${obs.id}@${e.id}`,
        label: `${s.units[obs.id].name} observes ${e.name}`,
        action: optionAction(player, `${obs.id}@${e.id}`),
        hint: { unitId: e.id, priority: markerlight ? 3 : 2 },
      })
    }
  }
  if (options.length === 0) return false
  options.push({ id: 'decline', label: 'No Observer this activation', action: optionAction(player, 'decline') })
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: sel, abilityId: abilities[0].id, data: { window, key, code: 'forTheGreaterGood' } },
    options,
  })
  return true
}

function ftggHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'For the Greater Good expects chooseOption' }
  if (action.optionId === 'decline') return
  const [observer, spotted] = action.optionId.split('@')
  const s = ctx.state
  const guided = pending.context.unitId
  if (!guided || !observer || !spotted || !s.units[observer] || !s.units[spotted]) return { code: 'E_NOT_AN_OPTION', reason: 'For the Greater Good: pick an Observer and a Spotted unit' }
  s.phaseState.marks.push(`${GUIDED}${guided}=${observer}@${spotted}`, OBS + observer)
  ctx.emit({
    type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? 'tau.a.for-the-greater-good', sourceUnitId: guided, targetUnitId: spotted,
    summary: `For the Greater Good: ${s.units[observer].name} observes ${s.units[spotted].name}`, player: pending.player,
  })
}

// does `data.attack` describe a guided, ranged, non-Overwatch attack by `holder` against its Spotted unit?
function guidedRangedAttack(state: GameState, holder: Unit, data: Record<string, unknown>): Guided | null {
  const atk = data.attack as { attackerUnitId: UnitId; targetUnitId: UnitId; kind: string; overwatch: boolean } | undefined
  if (!atk || atk.overwatch || atk.kind !== 'ranged') return null
  const g = guidedOf(state, canon(state, holder.id))
  if (!g || canon(state, atk.attackerUnitId) !== g.guided || canon(state, atk.targetUnitId) !== g.spotted) return null
  return g
}

export function tauEmpireHooks(): Record<string, EngineCodeHook> {
  const forTheGreaterGood: EngineCodeHook = {
    name: 'forTheGreaterGood', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop, hooks: ['onSaveRoll'],
    pick: { window: 'shooting.unitSelected', topic: 'abilityChoice', offer: ftggOffer, handle: ftggHandle },
    // ignores cover only against the Spotted unit, and only when the Observer carries MARKERLIGHT
    gate(state, holder, _entry, data) {
      if (!data) return true
      const g = guidedRangedAttack(state, holder, data)
      if (!g) return false
      const observer = state.units[g.observer]
      return !!observer && observer.location === 'board' && anyHalfHasKeyword(state, g.observer, 'MARKERLIGHT')
    },
    // one entry per half of a led unit carries the ability: only the canonical holder answers
    skillDeltaVsTarget(state, entry, attackerModelId, _weapon, targetUnitId, info) {
      if (info.kind !== 'ranged' || info.overwatch) return null
      const m = state.models[attackerModelId]
      if (!m) return null
      const attackerCanon = canon(state, m.unitId)
      if (entry.holderUnitId !== attackerCanon) return null
      const g = guidedOf(state, attackerCanon)
      if (!g) return null
      return canon(state, targetUnitId) === g.spotted ? -1 : 1
    },
  }

  const forwardObservers: EngineCodeHook = {
    name: 'forwardObservers', kind: 'ability', hook: 'onWoundRoll', run: noop, hooks: ['onWoundRoll'], forceScope: { who: 'friendly' },
    gate(state, holder, _entry, data) {
      if (!data) return true
      const atk = data.attack as { attackerUnitId: UnitId; targetUnitId: UnitId; kind: string; overwatch: boolean } | undefined
      if (!atk || atk.overwatch || atk.kind !== 'ranged') return false
      const me = canon(state, holder.id)
      return guidedMarks(state).some((g) => g.observer === me && g.guided === canon(state, atk.attackerUnitId) && g.spotted === canon(state, atk.targetUnitId))
    },
  }

  const coordinatedLeadership: EngineCodeHook = {
    name: 'coordinatedLeadership', kind: 'ability', hook: 'onPhaseEnd', run: noop,
    runAt(ctx, entry) {
      const s = ctx.state
      const holder = s.units[entry.holderUnitId]
      if (!holder || holder.location !== 'board') return
      const on = (entry.params.on as number | undefined) ?? 4
      const cp = (entry.params.cp as number | undefined) ?? 1
      const roll = ctx.roll({ purpose: 'ability', player: holder.player, count: 1, sides: 6, mode: 'perDie', unitId: holder.id })
      const passed = (roll.final[0] ?? 0) >= on
      const gained = passed ? hookService.gainCp(ctx, holder.player, cp, entry.source.id) : 0
      ctx.emit({
        type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: null, player: holder.player,
        summary: passed ? `Coordinated Leadership: rolled ${roll.final[0]}, ${gained > 0 ? `+${gained} CP` : 'no CP gained (cap)'}` : `Coordinated Leadership: rolled ${roll.final[0]}, no CP`,
      })
    },
  }

  // Cover Fire: Fire Overwatch only (never Laser-Marked Targets) hits on `hitOn`+ while the shooter is in range of an objective its player controls
  const coverFire: EngineCodeHook = {
    name: 'coverFire', kind: 'ability', hook: 'onStatQuery', run: noop,
    overwatchHitOn(state, entry, shooterUnitId, stratagemId) {
      if (stratagemId !== ((entry.params.stratagemId as string | undefined) ?? 'core.s.fire-overwatch')) return null
      if (!leaderService.sameUnit(state, entry.holderUnitId, shooterUnitId)) return null
      const owner = state.units[entry.holderUnitId]?.player
      const models = boardModelsOfUnit(state, shooterUnitId)
      const onControlled = Object.values(state.objectives).some((o) => !o.removed && o.controller === owner && models.some((m) => withinObjectiveRange(m, o)))
      return onControlled ? ((entry.params.hitOn as number | undefined) ?? 4) : null
    },
  }

  // DS8 Support Turret: the key is rewritten at every own Movement end, so it covers each shooting opportunity until the next one
  const ds8Key = (holderId: UnitId) => `tau:ds8:${holderId}`
  const ds8SupportTurret: EngineCodeHook = {
    name: 'ds8SupportTurret', kind: 'ability', hook: 'onPhaseEnd', run: noop,
    runAt(ctx, entry) {
      const s = ctx.state
      const holder = s.units[entry.holderUnitId]
      if (!holder) return
      const ss = s.players[holder.player].secondaryState
      // a unit never selected to move keeps moveType null: it Remained Stationary unless it arrived this turn
      const stationary = holder.turn.moveType === 'stationary' || (holder.turn.moveType === null && !holder.turn.arrivedThisTurn)
      if (holder.location === 'board' && stationary) ss[ds8Key(holder.id)] = true
      else delete ss[ds8Key(holder.id)]
    },
    weaponAvailable(state, entry, modelId, weaponId) {
      if (weaponId !== (entry.params.weaponId as string | undefined)) return null
      const m = state.models[modelId]
      if (!m || m.unitId !== entry.holderUnitId) return null
      const holder = state.units[entry.holderUnitId]
      return state.players[holder.player].secondaryState[ds8Key(holder.id)] === true
    },
  }

  const kauyonLure: EngineCodeHook = { name: 'kauyonLure', kind: 'mission', hook: 'onPhaseEnd', run: noop }
  const leadershipCaste: EngineCodeHook = { name: 'leadershipCaste', kind: 'mission', hook: 'onPhaseEnd', run: noop }

  const rapidRepositioning: EngineCodeHook = {
    name: 'rapidRepositioning', kind: 'stratagem', hook: 'onPhaseEnd', run: noop,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      if (state.phase !== 'shooting') return false
      const id = t.ids[0]
      const u = state.units[id]
      if (!u || u.location !== 'board' || u.player !== env.player) return false
      return !leaderService.inEngagementWithEnemy(state, id)
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const id = canon(s, t.ids[0])
      const params = env.stratagem.params ?? {}
      let distance = (params.battlesuitDistance as number | undefined) ?? 6
      if (!anyHalfHasKeyword(s, id, 'BATTLESUIT')) {
        const roll = ctx.roll({ purpose: 'stratagem', player: env.player, count: 1, sides: 6, mode: 'perDie', unitId: id })
        distance = roll.final[0] ?? 1
      }
      startReactiveMove(ctx, id, distance, env.stratagem.id, 'phase.end')
    },
  }

  const laserMarkedTargets: EngineCodeHook = {
    name: 'laserMarkedTargets', kind: 'stratagem', hook: 'onCharge', run: noop,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      const [chargerId, mineId] = t.ids
      const charger = state.units[chargerId]
      if (!charger || charger.location !== 'board' || !leaderService.sameUnit(state, chargerId, env.trigger.unitId)) return false
      const mine = state.units[mineId]
      if (!mine || mine.location !== 'board' || mine.player !== env.player) return false
      const targets = state.phaseState.charge?.targetUnitIds ?? []
      if (!targets.some((id) => leaderService.sameUnit(state, id, mineId))) return false
      if (leaderService.inEngagementWithEnemy(state, mineId)) return false
      if (!eligibleToShootNow(state, mineId)) return false
      if (shotThisTurn(state, mineId)) return false
      const models = boardModelsOfUnit(state, mineId)
      return models.some((m) => env.services.los.unitVisible(state, m.id, chargerId))
    },
    apply(ctx, env, t) {
      pushReaction(ctx, { kind: 'overwatch', stratagemId: env.stratagem.id, player: env.player, unitId: t.ids[1], enemyUnitId: t.ids[0], window: 'charge.declared', distance: null })
    },
  }

  // ---------- Sudden Dawn Cadre (docs/spec/factions/tau-empire--sudden-dawn-cadre.md §7) ----------
  // Electro-static Flares aura (SDC-3): enemies cannot Fire Overwatch at a friendly non-DEVILFISH T'AU EMPIRE unit within 6" of
  // the bearer (the bearer's own unit always counts). The -1 to hit is the descriptor's own `stealth` effect.
  const electrostaticFlares: EngineCodeHook = {
    name: 'electrostaticFlares', kind: 'ability', hook: 'onStatQuery', run: noop, forceScope: { who: 'friendly', within: 6 },
    forbidsOverwatchAgainst(state, entry, targetUnitId) {
      const holder = state.units[entry.holderUnitId]
      if (!holder || holder.location !== 'board') return false
      const target = canon(state, targetUnitId)
      const tu = state.units[target]
      if (!tu || tu.location !== 'board' || tu.player !== holder.player) return false
      if (anyHalfHasKeyword(state, target, 'DEVILFISH')) return false
      return leaderService.sameUnit(state, target, holder.id) || leaderService.unitDistance(state, target, holder.id) <= 6 + 1e-6
    },
  }

  // Prototype Systems (SDC-3): the bearer may re-roll the dice that set the Attacks of the named weapon
  const prototypeSystems: EngineCodeHook = {
    name: 'prototypeSystems', kind: 'ability', hook: 'onStatQuery', run: noop,
    rerollsAttackCount(_state, entry, attackerModelId, weapon) {
      return attackerModelId === entry.bearerModelId && weapon.id === (entry.params.weaponId as string | undefined)
    },
  }

  // Grav-inhibitor Drone (SDC-6.3): only while the carrying model lives, and only for charges that target the holder's unit
  const gravInhibitorDrone: EngineCodeHook = {
    name: 'gravInhibitorDrone', kind: 'ability', hook: 'onChargeRoll', run: noop, hooks: ['onChargeRoll'], forceScope: { who: 'enemy' },
    gate(state, holder, entry, data) {
      const modelId = entry.params.modelId as string | undefined
      if (!modelId || !holder.models.some((id) => state.models[id]?.datasheetModelId === modelId)) return false
      if (!data) return true
      const targets = (data.targetUnitIds as UnitId[] | undefined) ?? []
      return targets.some((t) => leaderService.sameUnit(state, t, holder.id))
    },
  }

  // Lives Before Territory (SDC-5): Benefit of Cover for the rest of the phase (phase mark read by hasBenefitOfCover), then a D6" move
  const livesBeforeTerritory: EngineCodeHook = {
    name: 'livesBeforeTerritory', kind: 'stratagem', hook: 'onTargetsDeclared', run: noop,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      if (state.phase !== 'shooting') return false
      const id = t.ids[0]
      const u = state.units[id]
      if (!u || u.location !== 'board' || u.player !== env.player) return false
      const kws = (env.stratagem.params?.keywords as string[] | undefined) ?? ['INFANTRY', 'BATTLESUIT']
      if (!kws.some((k) => anyHalfHasKeyword(state, id, k))) return false
      return !leaderService.inEngagementWithEnemy(state, id)
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const id = canon(s, t.ids[0])
      s.phaseState.marks.push(coverMarkKey(id))
      const roll = ctx.roll({ purpose: 'stratagem', player: env.player, count: 1, sides: 6, mode: 'perDie', unitId: id })
      const distance = roll.final[0] ?? 1
      ctx.emit({
        type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: id, targetUnitId: null, player: env.player,
        summary: `Lives Before Territory: ${s.units[id].name} moves up to ${distance}" and gains the Benefit of Cover`,
      })
      startReactiveMove(ctx, id, distance, env.stratagem.id, 'shooting.targetsDeclared')
    },
  }

  const surpriseAttack: EngineCodeHook = { name: 'surpriseAttack', kind: 'mission', hook: 'onTurnEnd', run: noop }
  const etherealEdictPick: EngineCodeHook = { name: 'etherealEdictPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerEdict }
  const etherealEdictScore: EngineCodeHook = { name: 'etherealEdictScore', kind: 'mission', hook: 'onPhaseEnd', run: noop }

  return {
    forTheGreaterGood, forwardObservers, coordinatedLeadership, coverFire, ds8SupportTurret, kauyonLure, leadershipCaste, rapidRepositioning, laserMarkedTargets,
    electrostaticFlares, prototypeSystems, gravInhibitorDrone, livesBeforeTerritory, surpriseAttack, etherealEdictPick, etherealEdictScore,
  }
}

// ---------- mission amounts (called from missions.ts) ----------
// Kauyon Lure: pointsPer when a non-Battle-shocked T'AU EMPIRE unit is at least partly in its owner's deployment zone
export function kauyonLureAmount(state: GameState, rule: { pointsPer: number }, pid: PlayerId): number {
  const zone = deploymentZone(state, pid)
  for (const u of canonicalBoardUnits(state, pid)) {
    if (!keywordsOfEither(state, u.id, "T'AU EMPIRE")) continue
    if (leaderService.halves(state, u.id).some((h) => state.units[h]?.battleShocked)) continue
    if (boardModelsOfUnit(state, u.id).some((m) => partlyWithinPolygon(m, zone))) return rule.pointsPer
  }
  return 0
}

// Leadership Caste: pointsPer when the owner still has a model of an ETHEREAL unit on the battlefield
export function leadershipCasteAmount(state: GameState, rule: { pointsPer: number }, pid: PlayerId): number {
  return boardModelsOf(state, pid).some((m) => keywordsOf(state, m.unitId).includes('ETHEREAL')) ? rule.pointsPer : 0
}

// Surprise Attack (SDC-4): pointsPer for every live marker in No Man's Land (centre inside neither deployment zone) the player controls
export function surpriseAttackAmount(state: GameState, rule: { pointsPer: number }, pid: PlayerId, holds: (objectiveId: string) => boolean): number {
  const zones = state.mission.data.deploymentZones
  let n = 0
  for (const o of Object.values(state.objectives)) {
    if (o.removed || pointInPolygon(o.pos, zones.A) || pointInPolygon(o.pos, zones.B)) continue
    if (holds(o.id)) n += 1
  }
  return n * rule.pointsPer
}

// ---------- Ethereal Edict (SDC-4.3) ----------
// The OPPONENT of the secondary's owner picks one canonical unit of their own army at the start of round 1.
const EDICT = 'tau:edict'
export interface CondemnPickOptions {
  code: string              // decision data.code, e.g. 'targetedPurgePick' (default 'etherealEdictPick')
  abilityId: string         // AbilityTriggered id (default 'tau.sec.ethereal-edict')
  label: string             // log summary prefix (default 'Ethereal Edict')
  excludeKeywords?: string[] // a candidate is skipped (and rejected in answerEdict) if any half has one of these
}
const EDICT_DEFAULTS: CondemnPickOptions = { code: 'etherealEdictPick', abilityId: 'tau.sec.ethereal-edict', label: 'Ethereal Edict' }

function excludedByKeyword(s: GameState, unitId: UnitId, exclude: string[] | undefined): boolean {
  return !!exclude && exclude.length > 0 && exclude.some((k) => anyHalfHasKeyword(s, unitId, k))
}

export function etherealEdictOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string, opts?: CondemnPickOptions): void {
  const s = ctx.state
  const o = opts ?? EDICT_DEFAULTS
  const picker: PlayerId = owner === 'A' ? 'B' : 'A'
  const seen = new Set<UnitId>()
  const candidates: Unit[] = []
  for (const u of Object.values(s.units)) {
    if (u.player !== picker || u.location === 'destroyed') continue
    const c = canon(s, u.id)
    if (seen.has(c) || !s.units[c] || s.units[c].location === 'destroyed') continue
    seen.add(c)
    if (excludedByKeyword(s, c, o.excludeKeywords)) continue
    candidates.push(s.units[c])
  }
  if (candidates.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: picker, window, canPass: false,
    context: {
      topic: 'abilityChoice', unitId: null, abilityId: null,
      data: { window, key, code: o.code, owner, abilityId: o.abilityId, label: o.label, excludeKeywords: o.excludeKeywords ?? [] },
    },
    options: candidates.map((u) => ({
      id: u.id, label: u.name, action: { type: 'chooseOption' as const, player: picker, decisionId: '', optionId: u.id }, hint: { unitId: u.id },
    })),
  })
}

export function answerEdict(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Ethereal Edict expects chooseOption' }
  const s = ctx.state
  const unit = s.units[action.optionId]
  if (!unit || unit.player !== pending.player || unit.location === 'destroyed') return { code: 'E_INVALID_TARGET', reason: 'pick one of your own units that is not destroyed' }
  const data = pending.context.data as { owner?: PlayerId; abilityId?: string; label?: string; excludeKeywords?: string[] }
  if (excludedByKeyword(s, canon(s, unit.id), data.excludeKeywords)) return { code: 'E_INVALID_TARGET', reason: 'that unit is not an eligible pick' }
  const owner = (data.owner ?? (pending.player === 'A' ? 'B' : 'A')) as PlayerId
  s.players[owner].secondaryState[EDICT] = { halves: leaderService.halves(s, canon(s, unit.id)) }
  ctx.emit({
    type: 'AbilityTriggered', abilityId: data.abilityId ?? EDICT_DEFAULTS.abilityId, sourceUnitId: null, targetUnitId: unit.id,
    summary: `${data.label ?? EDICT_DEFAULTS.label}: ${unit.name} is condemned`, player: owner,
  })
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// 12 VP iff the chosen unit is destroyed (a unit still in Reserves at the end of the battle counts as destroyed, R-5.16)
export function etherealEdictAmount(state: GameState, rule: { pointsPer: number }, pid: PlayerId): number {
  const stored = state.players[pid].secondaryState[EDICT] as { halves: UnitId[] } | undefined
  if (!stored || stored.halves.length === 0) return 0
  return stored.halves.every((id) => { const l = state.units[id]?.location; return l === 'destroyed' || (l === 'reserves' && transportService.transportOf(state, id) === null) }) ? rule.pointsPer : 0
}

function keywordsOfEither(state: GameState, unitId: UnitId, kw: string): boolean {
  return leaderService.halves(state, unitId).some((h) => keywordsOf(state, h).includes(kw))
}

export type { HookSourceEntry }
