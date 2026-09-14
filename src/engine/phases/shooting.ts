// Shooting phase module (10-rules §6, R-6.1-R-6.10). Owner: W1-D. Steps: 'selectUnit' -> 'declareTargets' -> 'resolve'.
//
// Everything below R-6.10 (the actual hit/wound/allocate/save/damage machinery, Hazardous, Feel No Pain, Deadly
// Demise, Devastating Wounds, Big Guns Never Tire's -1 to hit, Stealth's -1 to hit, Indirect Fire's roll penalty,
// Overwatch's hits-only-on-6) already lives in the shared attack sequence (attack.ts) and is exercised directly by
// tests/engine/attack*.test.ts. This module's job is everything ABOVE that: which unit may be selected (R-6.1-R-6.3
// eligibility, Engagement Range / Big Guns Never Tire / Pistol exceptions), which (model, weapon, target) tuples are
// legal to declare (R-6.4 range+LoS, Lone Operative's 12" cap, Indirect Fire waiving visibility, the target-side
// Engagement Range restriction and Blast's "never at a unit within Engagement Range of ANY unit in the firing
// player's army" — not just the firing unit itself: SHOOT-005-blast-friendly), R-6.7's per-model Pistol-xor-other-
// weapons rule and R-6.11's "one profile per activation", and driving services.attack through to
// `shooting.targetsDeclared` / `shooting.attacksResolved`.
//
// Fire Overwatch is a reaction resolved entirely by the phase module that owns the triggering window (movement.ts /
// charge.ts): it calls services.attack directly with `overwatch: true` and never raises a declareTargets decision
// here (see movement.ts's `drainOverwatch`) — 00-arch §4 / phases/README §4 "Overwatch reuses this sequence".
//
// R-6.7 "a unit in ER may shoot only Pistols and only at one unit it is in ER of": each Pistol's legal targets are the
// engaged enemy units (targetLegality), and `validateDeclareTargets` also requires that the whole declaration names a
// single one of them (SHOOT-003-one-unit). This does not apply to MONSTER/VEHICLE units (Big Guns Never Tire).
//
// R-6.3's Big Guns Never Tire -1 to hit ("if the unit was in ER when targets were selected") is a snapshot taken by
// `attack.begin` the instant this module calls it from `handle`'s `declareTargets` case — see attack.ts's module
// header — so it survives the engaging enemy dying or moving away mid-volley (SHOOT-005-timing).
import { distance, EPS } from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import { losService } from '../los'
import { attackService } from '../attack'
import { weaponService } from '../weapons'
import { notImplementedHandle, otherPlayer, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import { boardUnitsOf, datasheetOf, hasKeyword, unitModels } from '../state'
import type { Action } from '../actions'
import {
  EngineInvariantError,
  type DeclaredTarget, type GameState, type Id, type ModelId, type PendingDecision, type PlayerId,
  type Rejection, type RuntimeWeapon, type UnitId, type WeaponId,
} from '../types'

// ---------- single-value progress markers (phaseState.marks; reset every time the phase is entered) ----------
function readMark(state: GameState, key: string): string | null {
  const prefix = `${key}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}
function writeMark(state: GameState, key: string, value: string | null): void {
  const prefix = `${key}=`
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  if (value !== null) state.phaseState.marks.push(prefix + value)
}

// same generic option-membership check movement.ts uses (see its comment): needed because a custom `validate` for
// one pending.kind opts the whole module out of the reducer's own default check for every other kind too.
function actionKey(a: Action): string {
  const { seq: _s, decisionId: _d, player: _p, ...rest } = a as Action & { seq?: number }
  return JSON.stringify(rest, Object.keys(rest).sort())
}
function optionCheck(pending: PendingDecision, action: Action): Rejection | null {
  if (action.type === 'pass') return null
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  if (action.type === 'chooseOption') {
    return pending.options.some((o) => o.id === action.optionId) ? null : { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  }
  const key = actionKey(action)
  return pending.options.some((o) => actionKey(o.action) === key) ? null : { code: 'E_NOT_AN_OPTION', reason: 'answer is not one of the offered options' }
}

// ---------- keyword / engagement helpers (attached-unit aware via leaderService) ----------
function isBigGunsUnit(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => hasKeyword(state, id, 'MONSTER') || hasKeyword(state, id, 'VEHICLE'))
}
function hasPistolWeapon(state: GameState, unitId: UnitId): boolean {
  return leaderService.combinedModels(state, unitId).some((m) => m.weapons.some((wid) => {
    const w = weaponService.effectiveWeapon(state, m.id, wid)
    return !!w && w.kind === 'ranged' && weaponService.hasAbility(w, 'PISTOL')
  }))
}
function enemyCanonicalUnits(state: GameState, firingPlayer: PlayerId): UnitId[] {
  const seen = new Set<UnitId>()
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, otherPlayer(firingPlayer))) {
    const canon = leaderService.canonicalUnitId(state, u.id)
    if (seen.has(canon)) continue
    seen.add(canon)
    out.push(canon)
  }
  return out
}
function isLoneOperative(state: GameState, unitId: UnitId): boolean {
  if (leaderService.isAttached(state, unitId)) return false
  return datasheetOf(state, unitId).coreAbilities.some((c) => c.ability === 'LONE_OPERATIVE')
}

// ---------- R-6.4/R-6.2/R-6.3/R-6.9 target legality for one (firing model, weapon, candidate target) ----------
function targetLegality(state: GameState, firingUnitId: UnitId, firingModelId: ModelId, weapon: RuntimeWeapon, targetUnitId: UnitId): Rejection | null {
  const attackerModel = state.models[firingModelId]
  const targetModels = leaderService.halves(state, targetUnitId).flatMap((id) => (state.units[id]?.location === 'board' ? unitModels(state, id) : []))
  if (!attackerModel || targetModels.length === 0) return { code: 'E_INVALID_TARGET', reason: `${targetUnitId} is not on the board`, details: { modelId: firingModelId, weaponId: weapon.id, targetUnitId } }
  // R-6.9 Lone Operative: unattached, only within 12" (whichever is smaller than the weapon's own range)
  const effRange = isLoneOperative(state, targetUnitId) ? Math.min(weapon.range, 12) : weapon.range
  // [INDIRECT FIRE] waives visibility — but never for a Torrent weapon (SHOOT-041-torrent)
  const indirect = weaponService.hasAbility(weapon, 'INDIRECT_FIRE') && !weaponService.hasAbility(weapon, 'TORRENT')
  const inRange = (tm: typeof targetModels[number]) => distance(attackerModel, tm) <= effRange + EPS
  // R-6.4: the SAME model must be both within range and visible (Indirect Fire waives visibility) — a target unit
  // is not legal merely because *some* model is in range and a *different* model happens to be visible.
  const hasLegalModel = targetModels.some((tm) => inRange(tm) && (indirect || losService.visible(state, firingModelId, tm.id)))
  if (!hasLegalModel) {
    if (!targetModels.some(inRange)) return { code: 'E_NOT_IN_RANGE', reason: `${targetUnitId} is out of ${weapon.id}'s range`, details: { modelId: firingModelId, weaponId: weapon.id, targetUnitId } }
    return { code: 'E_NO_LOS', reason: `${firingModelId} has no line of sight to ${targetUnitId}`, details: { modelId: firingModelId, weaponId: weapon.id, targetUnitId } }
  }
  const bigGuns = isBigGunsUnit(state, firingUnitId)
  const isPistol = weaponService.hasAbility(weapon, 'PISTOL')
  const selfEngagedWithTarget = leaderService.unitsInEngagement(state, firingUnitId, targetUnitId)
  // R-6.2/R-6.7: a non-Big-Guns unit in Engagement Range may only shoot (Pistols, filtered upstream) at a unit it is
  // itself engaged with — not merely a nearby unengaged target.
  if (!bigGuns && leaderService.inEngagementWithEnemy(state, firingUnitId) && !selfEngagedWithTarget) {
    return { code: 'E_INVALID_TARGET', reason: 'a unit in Engagement Range may only shoot the unit(s) it is engaged with', details: { modelId: firingModelId, weaponId: weapon.id, targetUnitId } }
  }
  // any unit in the FIRING PLAYER'S army (the firing unit included) that is engaged with the target — computed
  // regardless of the target's own keywords since [BLAST] below needs it even for a MONSTER/VEHICLE target.
  const engagedWithSomeFriendly = boardUnitsOf(state, state.units[firingUnitId].player).some((fu) => leaderService.unitsInEngagement(state, fu.id, targetUnitId))
  // R-6.2/R-6.3: an enemy unit in Engagement Range of ANY friendly unit cannot be targeted, unless it is itself
  // MONSTER/VEHICLE, or the shooter is engaged with it AND (uses a Pistol, or is itself MONSTER/VEHICLE — R-6.3).
  const targetBig = leaderService.halves(state, targetUnitId).some((id) => hasKeyword(state, id, 'MONSTER') || hasKeyword(state, id, 'VEHICLE'))
  if (!targetBig) {
    const exempt = selfEngagedWithTarget && (isPistol || bigGuns)
    if (engagedWithSomeFriendly && !exempt) {
      return { code: 'E_INVALID_TARGET', reason: `${targetUnitId} is in Engagement Range of a friendly unit and cannot be targeted`, details: { modelId: firingModelId, weaponId: weapon.id, targetUnitId } }
    }
  }
  // [BLAST]: never at a unit within Engagement Range of ANY unit in the attacker's army (not just the firing unit
  // itself), Big Guns Never Tire notwithstanding — this must still catch an unengaged Big-Guns unit's Blast weapon
  // targeting an enemy MONSTER/VEHICLE that is engaged with a different friendly unit (SHOOT-005-blast-friendly).
  if (weaponService.hasAbility(weapon, 'BLAST') && engagedWithSomeFriendly) {
    return { code: 'E_INVALID_TARGET', reason: 'Blast weapons cannot target a unit within Engagement Range of a unit in the firing player\'s army', details: { modelId: firingModelId, weaponId: weapon.id, targetUnitId } }
  }
  return null
}

// ---------- R-6.1/R-6.4/R-6.5/R-6.7 the weapons (and their legal targets) this unit may declare right now ----------
export interface ShootingWeaponEntry { modelId: ModelId; weaponId: WeaponId; profileGroup: Id | null; legalTargets: UnitId[]; attacks: number | null }

function weaponUsableThisActivation(state: GameState, firingUnitId: UnitId, weapon: RuntimeWeapon): boolean {
  const advancedOverride = hookService.eligibilityFor(state, firingUnitId, 'shoot')
  const advanced = leaderService.halves(state, firingUnitId).some((id) => state.units[id].turn.moveType === 'advance') && !advancedOverride
  if (advanced && !weaponService.hasAbility(weapon, 'ASSAULT')) return false
  const bigGuns = isBigGunsUnit(state, firingUnitId)
  // R-6.2/R-6.7: an engaged, non-Big-Guns unit may fire Pistols only.
  if (!bigGuns && leaderService.inEngagementWithEnemy(state, firingUnitId) && !weaponService.hasAbility(weapon, 'PISTOL')) return false
  return true
}

export function buildShootingWeaponEntries(ctx: EngineContext, firingUnitId: UnitId): ShootingWeaponEntry[] {
  const s = ctx.state
  const candidates = enemyCanonicalUnits(s, s.units[firingUnitId].player)
  const out: ShootingWeaponEntry[] = []
  for (const m of leaderService.combinedModels(s, firingUnitId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(s, m.id, wid)
      if (!w || w.kind !== 'ranged') continue
      if (!weaponUsableThisActivation(s, firingUnitId, w)) continue
      const legalTargets = candidates.filter((t) => targetLegality(s, firingUnitId, m.id, w, t) === null)
      out.push({ modelId: m.id, weaponId: wid, profileGroup: w.profileGroup, legalTargets, attacks: null })
    }
  }
  return out
}

// ---------- R-6.1-R-6.3 eligibility to be selected to shoot ----------
function unitEligibleToShoot(ctx: EngineContext, unitId: UnitId): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u || u.location !== 'board') return false
  const halves = leaderService.halves(s, unitId).map((id) => s.units[id])
  const fellBack = halves.some((h) => h.turn.moveType === 'fallBack')
  if (fellBack && !hookService.eligibilityFor(s, unitId, 'shoot')) return false
  const bigGuns = isBigGunsUnit(s, unitId)
  if (leaderService.inEngagementWithEnemy(s, unitId) && !bigGuns && !hasPistolWeapon(s, unitId)) return false
  return buildShootingWeaponEntries(ctx, unitId).some((e) => e.legalTargets.length > 0)
}

// ---------- select ----------
function doSelectUnit(ctx: EngineContext): 'pending' | 'declareTargets' | 'done' {
  const s = ctx.state
  if (readMark(s, 'sh:cur') !== null) return 'declareTargets'
  if (readMark(s, 'sh:ended') !== null) return 'done'
  const active = s.activePlayer
  const activated = new Set(s.phaseState.activated)
  const eligible: UnitId[] = []
  for (const u of boardUnitsOf(s, active)) {
    if (u.bodyguardUnitId) continue
    // R-6.1 (SHOOT-046-detach): a unit already selected or shot this phase — including a Leader that shot as part of an
    // attached unit and was detached mid-attack when its bodyguard was wiped out — is never offered again
    const halves = leaderService.halves(s, u.id)
    if (halves.some((id) => activated.has(id) || s.units[id]?.turn.shotThisPhase)) continue
    if (!unitEligibleToShoot(ctx, u.id)) continue
    eligible.push(u.id)
  }
  if (eligible.length === 0) return 'done'
  ctx.decide({
    kind: 'chooseUnitToActivate', player: active, window: 'shooting.start', canPass: true,
    context: { phase: 'shooting', eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseUnitToActivate', player: active, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

// ---------- declare targets ----------
function doOpenDeclareTargets(ctx: EngineContext): void {
  const s = ctx.state
  const unitId = readMark(s, 'sh:cur')
  if (!unitId) throw new EngineInvariantError('shooting: declareTargets step with no current unit')
  const weapons = buildShootingWeaponEntries(ctx, unitId)
  const engagedWith = enemyCanonicalUnits(s, s.units[unitId].player).filter((t) => leaderService.unitsInEngagement(s, unitId, t))
  ctx.decide({
    kind: 'declareTargets', player: s.units[unitId].player, window: 'shooting.start', canPass: true,
    context: { unitId, attackKind: 'ranged', overwatch: false, weapons, engagedWith },
  })
}

function validateDeclareTargets(state: GameState, action: Action, pending: PendingDecision & { kind: 'declareTargets' }): Rejection | null {
  if (action.type === 'pass') return pending.canPass ? null : { code: 'E_PASS_NOT_ALLOWED', reason: 'this unit must declare targets or none' }
  if (action.type !== 'declareTargets') return { code: 'E_NOT_AN_OPTION', reason: 'expected declareTargets' }
  if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'targets are for the wrong unit', details: { expected: pending.context.unitId } }
  const weapons = pending.context.weapons
  const seen = new Set<string>()
  const pistolUsed = new Set<ModelId>()
  const nonPistolUsed = new Set<ModelId>()
  const profileChosen = new Map<string, WeaponId>()
  for (const t of action.targets) {
    if (t.attacks != null) return { code: 'E_SCHEMA', reason: 'attacks may only be set for melee (Fight-phase) targets', details: { modelId: t.modelId, weaponId: t.weaponId } }
    const dupKey = `${t.modelId}::${t.weaponId}`
    // SHOOT-010: one ranged weapon may not be listed twice (no split-target ranged attacks)
    if (seen.has(dupKey)) return { code: 'E_SCHEMA', reason: `${t.weaponId} on ${t.modelId} is listed more than once`, details: { modelId: t.modelId, weaponId: t.weaponId } }
    seen.add(dupKey)
    const entry = weapons.find((w) => w.modelId === t.modelId && w.weaponId === t.weaponId)
    if (!entry) return { code: 'E_INVALID_TARGET', reason: `${t.weaponId} on ${t.modelId} is not available this activation`, details: { modelId: t.modelId, weaponId: t.weaponId } }
    if (!entry.legalTargets.includes(t.targetUnitId)) {
      const w = weaponService.effectiveWeapon(state, t.modelId, t.weaponId)
      return targetLegality(state, action.unitId, t.modelId, w, t.targetUnitId) ?? { code: 'E_INVALID_TARGET', reason: `${t.targetUnitId} is not a legal target for ${t.weaponId}`, details: { modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId } }
    }
    // SHOOT-011: only one profile of a shared profileGroup may be fired per model per activation (Smite/focused Smite)
    if (entry.profileGroup) {
      const pgKey = `${t.modelId}::${entry.profileGroup}`
      const chosen = profileChosen.get(pgKey)
      if (chosen && chosen !== t.weaponId) return { code: 'E_INVALID_TARGET', reason: `only one profile of ${entry.profileGroup} may be fired per activation`, details: { modelId: t.modelId, profileGroup: entry.profileGroup } }
      profileChosen.set(pgKey, t.weaponId)
    }
    const w = weaponService.effectiveWeapon(state, t.modelId, t.weaponId)
    if (weaponService.hasAbility(w, 'PISTOL')) pistolUsed.add(t.modelId)
    else nonPistolUsed.add(t.modelId)
  }
  // SHOOT-003-one-unit (R-6.7): an engaged, non-MONSTER/VEHICLE unit's Pistols may all fire at only ONE of the
  // enemy units it is in Engagement Range of
  if (!isBigGunsUnit(state, action.unitId) && leaderService.inEngagementWithEnemy(state, action.unitId)) {
    const distinct = new Set(action.targets.map((t) => t.targetUnitId))
    if (distinct.size > 1) return { code: 'E_INVALID_TARGET', reason: 'a unit in Engagement Range may shoot at only one of the enemy units it is engaged with', details: { targetUnitIds: [...distinct] } }
  }
  // SHOOT-012/013 (R-6.7): a model fires either its Pistols or all its other weapons, never both — MONSTER/VEHICLE excepted
  for (const modelId of pistolUsed) {
    if (!nonPistolUsed.has(modelId)) continue
    const unitId = state.models[modelId]?.unitId
    if (unitId && isBigGunsUnit(state, unitId)) continue
    return { code: 'E_INVALID_TARGET', reason: `${modelId} must fire its Pistols or its other weapons this activation, not both`, details: { modelId } }
  }
  return null
}

// ---------- resolve (drives the shared attack sequence) ----------
// the acting unit id is kept in a mark (not read off `phaseState.attack`) because that sequence is cleared the
// instant it finishes — and `shooting.attacksResolved` (opened AFTER it finishes) must still know which unit this
// was across however many re-entrant decisions that window itself raises.
function doResolve(ctx: EngineContext): 'pending' | 'selectUnit' {
  const s = ctx.state
  const unitId = readMark(s, 'sh:resolveUnit')
  if (!unitId) return 'selectUnit'
  const opponent = otherPlayer(s.units[unitId].player)
  // R-11.5: `shooting.targetsDeclared` opens before any hit is rolled, defensive (targeted player) first
  if (ctx.window('shooting.targetsDeclared', unitId, ctx.order.defensive(opponent), { unitId })) return 'pending'
  if (s.phaseState.attack && attackService.advance(ctx) === 'pending') return 'pending'
  if (ctx.window('shooting.attacksResolved', unitId, ctx.order.active(), { unitId })) return 'pending'
  writeMark(s, 'sh:resolveUnit', null)
  return 'selectUnit'
}

const ATTACK_CHOOSE_TOPICS = new Set(['saveType', 'hazardousCasualty', 'rerollOffer'])

export const shootingModule: PhaseModule = {
  name: 'shooting',
  enter(ctx) {
    ctx.state.step = 'selectUnit'
    ctx.state.phaseState.activated = []
    ctx.state.phaseState.attack = null
  },
  advance(ctx): AdvanceResult {
    const s = ctx.state
    for (;;) {
      if (s.step === 'selectUnit') {
        const r = doSelectUnit(ctx)
        if (r === 'pending') return 'pending'
        if (r === 'done') return 'done'
        s.step = r
        continue
      }
      if (s.step === 'declareTargets') {
        doOpenDeclareTargets(ctx)
        return 'pending'
      }
      if (s.step === 'resolve' || s.step === 'hazardous') {
        const r = doResolve(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      throw new EngineInvariantError(`shooting: unexpected step ${s.step}`)
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'declareTargets') return validateDeclareTargets(state, action, pending)
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') {
      if (pending.kind === 'chooseUnitToActivate') { writeMark(s, 'sh:ended', '1'); return }
      if (pending.kind === 'declareTargets') { writeMark(s, 'sh:cur', null); s.step = 'selectUnit'; return }
      return { code: 'E_NOT_AN_OPTION', reason: `shooting: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseUnitToActivate' && action.type === 'chooseUnitToActivate') {
      for (const id of leaderService.halves(s, action.unitId)) {
        if (!s.phaseState.activated.includes(id)) s.phaseState.activated.push(id)
      }
      writeMark(s, 'sh:cur', action.unitId)
      return
    }
    if (pending.kind === 'declareTargets' && action.type === 'declareTargets') {
      writeMark(s, 'sh:cur', null)
      if (action.targets.length === 0) { s.step = 'selectUnit'; return }
      // R-6.1: each unit shoots at most once per phase
      for (const id of leaderService.halves(s, action.unitId)) s.units[id].turn.shotThisPhase = true
      const targets: DeclaredTarget[] = action.targets.map((t) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId, profileGroup: t.profileGroup ?? null, attacks: null }))
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: action.unitId, overwatch: false, targets })
      writeMark(s, 'sh:resolveUnit', action.unitId)
      s.step = 'resolve'
      return
    }
    if (s.phaseState.attack && (pending.kind === 'allocateAttack' || (pending.kind === 'chooseOption' && ATTACK_CHOOSE_TOPICS.has(pending.context.topic)))) {
      return attackService.handler.handle(ctx, action, pending)
    }
    return notImplementedHandle('shooting')(ctx, action, pending)
  },
}
