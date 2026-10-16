// Drukhari code hooks (docs/spec/factions/drukhari.md section 7, DRU-xxx tests). Registered in code-hooks.ts via `drukhariHooks`.
// Power from Pain (Empower spend pick + re-rolls), There and Gone (stratagem embark), Murderous Monster scoring.
// The Pain token pool itself (gain / spend / Empowered record) lives in ../pain.ts; Shadowfield is attack.ts (E2).
//
// Like adeptus-custodes.ts this file avoids importing the phase modules at load time (code-hooks.ts pulls it in).
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import type { AttackContext, RollContext } from '../hooks'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { championOfTheDarkGodsAmount } from './chaos-space-marines'
import { hasPowerFromPain, isEmpowered, painTokens, POWER_FROM_PAIN_CODE, spendPainToken } from '../pain'
import { boardUnitsOf, keywordsOf, unitModels } from '../state'
import { transportService } from '../transports'
import type { GameState, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined

export const POWER_FROM_PAIN_SPEND_CODE = 'powerFromPainSpend'
const PFP_ABILITY_ID = 'drk.a.power-from-pain'
const CHARGE_REACH = 12

function otherOf(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

// ---------- Power from Pain: the re-roll gate (DRU-2.3 / 2.4) ----------
// The ability descriptor itself grants nothing; only the Empower ActiveEffect ({reroll:'all'}, scope self) does, and this
// gate decides at which rolls of the Empowered phase it may be used.
export function powerFromPainGate(state: GameState, holder: Unit, data?: Record<string, unknown>): boolean {
  const roll = data?.roll as RollContext | undefined
  if (!roll) return false
  switch (state.phase) {
    case 'movement': case 'charge':
      // Overwatch hit rolls in the opponent's Movement / Charge phase get nothing (DRU-2.5 d)
      return roll.purpose === 'advance' || roll.purpose === 'charge'
    case 'shooting': case 'fight': {
      if (roll.purpose !== 'hit') return false
      const attack = data?.attack as AttackContext | undefined
      return !!attack && leaderService.sameUnit(state, attack.attackerUnitId, holder.id)
    }
    default: return false
  }
}

const powerFromPain: EngineCodeHook = {
  name: POWER_FROM_PAIN_CODE, kind: 'ability', hook: 'onHitRoll', run: noop,
  hooks: ['onHitRoll', 'onAdvanceRoll', 'onChargeRoll'], rerollHooks: ['onHitRoll', 'onAdvanceRoll', 'onChargeRoll'],
  gate: () => false,
  gateEffect: (state, holder, _entry, data) => powerFromPainGate(state, holder, data),
}

// ---------- Power from Pain: the spend / Empower pick (DRU-2.2, 2.5) ----------
function boardHalves(s: GameState, canonical: UnitId): Unit[] {
  return leaderService.halves(s, canonical).map((id) => s.units[id]).filter((u): u is Unit => !!u && u.location === 'board' && unitModels(s, u.id).length > 0)
}

function hasPfpAbility(s: GameState, unit: Unit): boolean {
  return (s.datasheets[unit.datasheetId]?.abilities ?? []).some((id) => s.abilities[id]?.code === POWER_FROM_PAIN_CODE)
}

// canonical on-board units of `player` with Power from Pain on either half that are not already Empowered this phase
export function empowerCandidates(s: GameState, player: PlayerId): UnitId[] {
  const out: UnitId[] = []
  for (const u of boardUnitsOf(s, player)) {
    if (u.bodyguardUnitId) continue
    const halves = boardHalves(s, u.id)
    if (halves.length === 0 || !halves.some((h) => hasPfpAbility(s, h))) continue
    if (isEmpowered(s, u.id)) continue
    out.push(u.id)
  }
  return out.sort()
}

function engagedWithEnemy(s: GameState, id: UnitId): boolean {
  return leaderService.inEngagementWithEnemy(s, id)
}

// would Empowering `unitId` do something useful right now (ordering hint for the generic AI)?
function empowerIsUseful(ctx: EngineContext, player: PlayerId, unitId: UnitId): boolean {
  const s = ctx.state
  const own = s.activePlayer === player
  const halves = boardHalves(s, unitId)
  const enemies = boardUnitsOf(s, otherOf(player)).filter((e) => unitModels(s, e.id).length > 0)
  if (halves.length === 0 || enemies.length === 0) return false
  if (s.phase === 'fight') return engagedWithEnemy(s, unitId)
  if (!own) return false
  if (s.phase === 'shooting') {
    for (const h of halves) {
      for (const m of unitModels(s, h.id)) {
        for (const wid of m.weapons) {
          const w = s.weapons[wid]
          if (!w || w.kind !== 'ranged') continue
          for (const e of enemies) {
            const near = unitModels(s, e.id).some((em) => Math.hypot(em.pos.x - m.pos.x, em.pos.z - m.pos.z) - em.base.radius - m.base.radius <= w.range)
            if (near && ctx.services.los.unitVisible(s, m.id, e.id)) return true
          }
        }
      }
    }
    return false
  }
  if (s.phase === 'charge') {
    if (engagedWithEnemy(s, unitId)) return false
    if (halves.some((h) => h.turn?.moveType === 'advance' || h.turn?.moveType === 'fallBack')) return false
    return enemies.some((e) => leaderService.unitDistance(s, unitId, e.id) <= CHARGE_REACH)
  }
  return false
}

export function painOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (window.split('.')[0] !== s.phase) return false
  const marks = s.phaseState.marks
  for (const player of [s.activePlayer, otherOf(s.activePlayer)] as PlayerId[]) {
    const doneMark = `pain:done:${player}`
    if (marks.includes(doneMark)) continue
    if (!hasPowerFromPain(s, player) || painTokens(s, player) === 0) { marks.push(doneMark); continue }
    const candidates = empowerCandidates(s, player)
    if (candidates.length === 0) { marks.push(doneMark); continue }
    const tokens = painTokens(s, player)
    const ranked = candidates.map((id) => ({ id, useful: empowerIsUseful(ctx, player, id) }))
    ranked.sort((a, b) => Number(b.useful) - Number(a.useful))
    const anyUseful = ranked.some((r) => r.useful)
    const empowerOptions = ranked.map((r) => ({
      id: `empower:${r.id}`,
      label: `Empower ${s.units[r.id].name} (${tokens} token${tokens === 1 ? '' : 's'})`,
      // no unitId in the hint: the AI would add the unit's value to every Empower option, useful or not
      hint: { value: r.useful ? 3 : -10 },
      action: { type: 'chooseOption' as const, player, decisionId: '', optionId: `empower:${r.id}` },
    }))
    const doneOption = {
      id: 'done', label: 'Keep tokens', hint: { value: 0 },
      action: { type: 'chooseOption' as const, player, decisionId: '', optionId: 'done' },
    }
    // the generic AI takes the first option: Empower only comes first when it is worth a token
    const options = anyUseful ? [...empowerOptions, doneOption] : [doneOption, ...empowerOptions]
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: candidates[0], abilityId: PFP_ABILITY_ID, data: { window, key, code: POWER_FROM_PAIN_SPEND_CODE } },
      options,
    })
    return true
  }
  return false
}

export function painHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Power from Pain expects chooseOption' }
  const s = ctx.state
  const player = pending.player
  if (action.optionId === 'done') { s.phaseState.marks.push(`pain:done:${player}`); return }
  if (!action.optionId.startsWith('empower:')) return { code: 'E_NOT_AN_OPTION', reason: 'Power from Pain: empower:<unit> or done' }
  const unitId = action.optionId.slice('empower:'.length)
  if (!empowerCandidates(s, player).includes(unitId)) return { code: 'E_INVALID_TARGET', reason: 'that unit cannot be Empowered' }
  if (!spendPainToken(ctx, player, unitId)) return { code: 'E_NOT_AN_OPTION', reason: 'no Pain tokens left' }
  const abilityId = pending.context.abilityId ?? PFP_ABILITY_ID
  ctx.services.effects.grant(ctx, unitId, [{ reroll: 'all' }], {
    sourceAbilityId: PFP_ABILITY_ID, sourceUnitId: unitId, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
  })
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unitId, targetUnitId: null, summary: `Power from Pain: ${s.units[unitId].name} Empowered`, player })
}

const powerFromPainSpend: EngineCodeHook = {
  name: POWER_FROM_PAIN_SPEND_CODE, kind: 'ability', hook: 'onPhaseStart', run: noop,
  pick: {
    window: 'movement.start', windows: ['shooting.start', 'charge.start', 'fight.start'], topic: 'abilityChoice',
    offer: (ctx, w, k) => painOffer(ctx, w, k),
    handle: (ctx, a, p) => painHandle(ctx, a, p),
  },
}

// ---------- There and Gone (DRU-5.3) ----------
export function thereAndGoneCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const s = env.state
  if (s.phase !== 'fight' || s.activePlayer === env.player) return false
  const [passengerId, transportId] = t.ids
  const passenger = s.units[passengerId]
  const transport = s.units[transportId]
  if (!passenger || !transport || passenger.player !== env.player || transport.player !== env.player) return false
  if (passenger.location !== 'board' || transport.location !== 'board') return false
  if (!keywordsOf(s, passengerId).includes('DRUKHARI')) return false
  if (leaderService.halves(s, passengerId).some((id) => engagedWithEnemy(s, id))) return false
  if (engagedWithEnemy(s, passengerId)) return false
  return transportService.canEmbarkOutOfMove(s, passengerId, transportId)
}

export function thereAndGoneApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const [passengerId, transportId] = t.ids
  transportService.embark(s, passengerId, transportId)
  ctx.emit({
    type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: passengerId, targetUnitId: transportId,
    summary: `There and Gone: ${s.units[passengerId].name} embarks in ${s.units[transportId].name}`, player: env.player,
  })
}

const thereAndGone: EngineCodeHook = {
  name: 'thereAndGone', kind: 'stratagem', hook: 'onPhaseEnd', run: noop,
  check: (env, t) => thereAndGoneCheck(env, t),
  apply: (ctx, env, t) => thereAndGoneApply(ctx, env, t),
}

// ---------- Murderous Monster (DRU-4.2), called from missions.ts customAmount ----------
// runs at the end of every phase so `killsThisPhase` is reset each time and a Shooting-phase kill never leaks into the Fight phase
export function murderousMonsterAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const v = championOfTheDarkGodsAmount(s, rule, pid)
  return s.phase === 'fight' ? v : 0
}

function missionHook(name: string, hook: EngineCodeHook['hook'] = 'onTurnEnd'): EngineCodeHook {
  return { name, kind: 'mission', hook, run: noop }
}

export const drukhariHooks: Record<string, EngineCodeHook> = {
  powerFromPain,
  powerFromPainSpend,
  thereAndGone,
  murderousMonster: missionHook('murderousMonster', 'onPhaseEnd'),
}
