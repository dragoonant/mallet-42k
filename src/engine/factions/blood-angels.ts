// Blood Angels code hooks for Strike Force Marcellos (docs/spec/factions/blood-angels.md section 7, BLO-x):
// Multi-spectrum Array (BLO-6.2), Haywire Mine (BLO-6.4) and Rapid Strike (BLO-5.3). Everything else the patrol needs is declarative data or
// a reused hook (oathOfMomentPick, veteranInstincts, chitinousTide, bagPick / bagTheBigUnScore with params.fallbackKeyword).
// Registered in code-hooks.ts through `bloodAngelsHooks`. Like the other faction files this one reads no other engine module at load time
// except movement (startReactiveMove, used lazily): code-hooks.ts pulls it in, so nothing here may run at module evaluation.
import type { TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distance } from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { modelStats, mortalCredit, unitModels } from '../state'
import type { ChooseOptionDecision, GameState, Model, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined
const EPS = 1e-6

export const MULTI_SPECTRUM_CODE = 'multiSpectrumArray'
export const HAYWIRE_MINE_CODE = 'haywireMine'
export const RAPID_STRIKE_CODE = 'rapidStrike'

// ---------- helpers ----------
const otherOf = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })
const canon = (s: GameState, id: UnitId): UnitId => leaderService.canonicalUnitId(s, id)

function boardHalves(s: GameState, unitId: UnitId): Unit[] {
  return leaderService.halves(s, unitId).map((id) => s.units[id]).filter((u): u is Unit => !!u && u.location === 'board' && u.models.length > 0)
}

function boardModelsOfUnit(s: GameState, unitId: UnitId): Model[] {
  return boardHalves(s, unitId).flatMap((u) => unitModels(s, u.id))
}

function abilityIdWithCode(s: GameState, unit: Unit, code: string): string | null {
  for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

function halfWithAbility(s: GameState, canonical: UnitId, code: string): { unit: Unit; abilityId: string } | null {
  for (const h of boardHalves(s, canonical)) {
    const abilityId = abilityIdWithCode(s, h, code)
    if (abilityId) return { unit: h, abilityId }
  }
  return null
}

// `hitBy:<attackerCanon>:<weaponId>:<target>` phase marks (attack.ts), any weapon; read directly (import cycle).
// Only units still on the battlefield and owned by the opponent of the attacker are returned.
function unitsHitByUnit(s: GameState, attackerUnitId: UnitId): UnitId[] {
  const attacker = canon(s, attackerUnitId)
  const owner = s.units[attacker]?.player
  const prefix = `hitBy:${attacker}:`
  const out: UnitId[] = []
  for (const m of s.phaseState.marks) {
    if (!m.startsWith(prefix)) continue
    const rest = m.slice(prefix.length)
    const cut = rest.indexOf(':')
    if (cut < 0) continue
    const t = canon(s, rest.slice(cut + 1) as UnitId)
    if (s.units[t]?.player === owner) continue
    if (!out.includes(t) && boardHalves(s, t).length > 0) out.push(t)
  }
  return out
}

// ---------- Multi-spectrum Array (BLO-6.2) ----------
function applyMultiSpectrum(ctx: EngineContext, abilityId: string, sourceCanon: UnitId, targetId: UnitId, player: PlayerId): void {
  const s = ctx.state
  for (const half of boardHalves(s, targetId)) {
    ctx.services.effects.grant(ctx, half.id, [{ modifyRoll: { roll: 'hit', value: 1 } }], {
      sourceAbilityId: abilityId, sourceUnitId: sourceCanon, scope: { who: 'attacker' }, duration: 'untilEndOfPhase', when: { attackerKeyword: 'ADEPTUS ASTARTES' },
    })
  }
  ctx.emit({
    type: 'AbilityTriggered', abilityId, sourceUnitId: sourceCanon, targetUnitId: targetId, player,
    summary: `Multi-spectrum Array: ${s.units[targetId]?.name ?? targetId} is marked (+1 to Hit for Adeptus Astartes attacks this phase)`,
  })
}

function multiSpectrumOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (s.phase !== 'shooting') return false
  const unit = s.units[key]
  if (!unit || unit.location !== 'board') return false
  const cu = canon(s, unit.id)
  const canonUnit = s.units[cu]
  if (!canonUnit || canonUnit.player !== s.activePlayer) return false
  const holder = halfWithAbility(s, cu, MULTI_SPECTRUM_CODE)
  if (!holder) return false
  const mark = `pick:msa:${s.round}:${cu}`
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  const candidates = unitsHitByUnit(s, cu)
  if (candidates.length === 0) return false
  const player = canonUnit.player
  if (candidates.length === 1) { applyMultiSpectrum(ctx, holder.abilityId, cu, candidates[0], player); return false }
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: cu, abilityId: holder.abilityId, data: { window, key, code: MULTI_SPECTRUM_CODE } },
    options: candidates.map((id) => ({ id, label: `Mark ${s.units[id].name} (+1 to Hit)`, action: optionAction(player, id), hint: { unitId: id, priority: 1 } })),
  })
  return true
}

function multiSpectrumHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Multi-spectrum Array expects chooseOption')
  const s = ctx.state
  const cu = pending.context.unitId as UnitId
  const abilityId = pending.context.abilityId
  if (!abilityId || !cu) return notAnOption('Multi-spectrum Array: the unit is no longer on the battlefield')
  if (!unitsHitByUnit(s, cu).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit your unit hit this phase' }
  applyMultiSpectrum(ctx, abilityId, cu, action.optionId, pending.player)
}

const multiSpectrumArray: EngineCodeHook = {
  name: MULTI_SPECTRUM_CODE, kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
  pick: { window: 'shooting.attacksResolved', topic: 'abilityChoice', offer: multiSpectrumOffer, handle: multiSpectrumHandle },
}

// ---------- Haywire Mine (BLO-6.4) ----------
interface MineParams { modelId: string; range: number; roll: number; damage: string; vehicleDamage: string }

function mineParams(s: GameState, abilityId: string): MineParams {
  const p = (s.abilities[abilityId]?.params ?? {}) as Partial<MineParams>
  return { modelId: p.modelId ?? 'incursor-haywire', range: p.range ?? 3, roll: p.roll ?? 2, damage: p.damage ?? 'D3', vehicleDamage: p.vehicleDamage ?? '2D3' }
}

// the live bearer model of a mine-holding unit on the battlefield (null once it died or left the table)
function mineBearer(s: GameState, unit: Unit, modelId: string): Model | null {
  if (unit.location !== 'board') return null
  return unitModels(s, unit.id).find((m) => m.datasheetModelId === modelId) ?? null
}

function mineCandidates(s: GameState, bearer: Model, owner: PlayerId, range: number): UnitId[] {
  const out: UnitId[] = []
  for (const e of Object.values(s.units)) {
    if (e.player === owner || e.location !== 'board' || e.models.length === 0) continue
    const cu = canon(s, e.id)
    if (out.includes(cu)) continue
    if (boardModelsOfUnit(s, cu).some((m) => distance(m, bearer) <= range + EPS)) out.push(cu)
  }
  return out.sort()
}

function mineHolders(s: GameState, player: PlayerId): { unit: Unit; abilityId: string }[] {
  const out: { unit: Unit; abilityId: string }[] = []
  for (const u of Object.values(s.units)) {
    if (u.player !== player || u.location !== 'board' || u.models.length === 0) continue
    const abilityId = abilityIdWithCode(s, u, HAYWIRE_MINE_CODE)
    if (abilityId) out.push({ unit: u, abilityId })
  }
  return out
}

function haywireOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  for (const player of [s.activePlayer, otherOf(s.activePlayer)] as PlayerId[]) {
    const mark = `pick:haywire:${s.round}:${s.phase}:${player}`
    if (s.phaseState.marks.includes(mark)) continue
    for (const { unit, abilityId } of mineHolders(s, player)) {
      if (s.players[player].oncePerBattleUsed.includes(abilityId)) continue
      const p = mineParams(s, abilityId)
      const bearer = mineBearer(s, unit, p.modelId)
      if (!bearer) continue
      const candidates = mineCandidates(s, bearer, player, p.range)
      if (candidates.length === 0) continue
      s.phaseState.marks.push(mark)
      const options: ChooseOptionDecision['options'] = [
        ...candidates.map((id) => ({ id, label: `Haywire Mine: ${s.units[id].name}`, action: optionAction(player, id), hint: { unitId: id, priority: 1 } })),
        { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
      ]
      ctx.decide({
        kind: 'chooseOption', player, window, canPass: false,
        context: { topic: 'abilityChoice', unitId: unit.id, abilityId, data: { window, key, code: HAYWIRE_MINE_CODE, bearerModelId: bearer.id } },
        options,
      })
      return true
    }
  }
  return false
}

function haywireHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Haywire Mine expects chooseOption')
  if (action.optionId === 'decline') return
  const s = ctx.state
  const player = pending.player
  const holderId = pending.context.unitId as UnitId
  const abilityId = pending.context.abilityId
  const holder = holderId ? s.units[holderId] : undefined
  if (!holder || !abilityId) return notAnOption('Haywire Mine: the bearer unit is no longer on the battlefield')
  const p = mineParams(s, abilityId)
  const bearer = mineBearer(s, holder, p.modelId)
  if (!bearer) return notAnOption('Haywire Mine: the bearer is no longer on the battlefield')
  if (s.players[player].oncePerBattleUsed.includes(abilityId)) return { code: 'E_STRATAGEM_USED', reason: 'the Haywire Mine was already used this battle' }
  if (!mineCandidates(s, bearer, player, p.range).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: `pick an enemy unit within ${p.range}" of the mine bearer` }
  const target = action.optionId as UnitId
  s.players[player].oncePerBattleUsed.push(abilityId)
  const roll = ctx.roll({ purpose: 'ability', player, sides: 6, count: 1, mode: 'sum', unitId: holderId, targetUnitId: target, commandRerollable: false })
  const die = roll.final.reduce((a, b) => a + b, 0)
  const name = s.units[target].name
  if (die < p.roll) {
    ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holderId, targetUnitId: target, player, summary: `Haywire Mine: rolled ${die} against ${name}, the mine fizzles` })
    return
  }
  const isVehicle = boardHalves(s, target).some((h) => hookService.keywordsFor(s, h.id).includes('VEHICLE'))
  const n = ctx.rollExpr(isVehicle ? p.vehicleDamage : p.damage, { purpose: 'ability', player, unitId: holderId, targetUnitId: target }).total
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holderId, targetUnitId: target, player, summary: `Haywire Mine: rolled ${die}, ${name} suffers ${n} mortal wound${n === 1 ? '' : 's'}` })
  if (n <= 0) return
  ctx.services.attack.queueMortalWounds(ctx, target, n, abilityId, false, mortalCredit(s, holderId))
  // resolve at once when nothing else is in flight; otherwise the phase module keeps driving services.attack.advance
  if (!s.pending && s.phaseState.attack) ctx.services.attack.advance(ctx)
}

const haywireMine: EngineCodeHook = {
  name: HAYWIRE_MINE_CODE, kind: 'ability', hook: 'onPhaseStart', run: noop,
  pick: {
    window: 'command.start', windows: ['movement.start', 'shooting.start', 'charge.start', 'fight.start'], topic: 'abilityChoice',
    offer: haywireOffer, handle: haywireHandle,
  },
}

// ---------- Rapid Strike (BLO-5.3) ----------
function rapidStrikeKeywords(env: StratagemEnv): string[] {
  return (env.stratagem.params?.keywords as string[] | undefined) ?? ['INTERCESSOR SQUAD', 'INCURSOR SQUAD']
}

function rapidStrikeCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const s = env.state
  if (s.phase !== 'shooting') return false
  const id = t.ids[0]
  const u = s.units[id]
  if (!u || u.location !== 'board' || u.player !== env.player) return false
  const wanted = rapidStrikeKeywords(env)
  if (!leaderService.halves(s, id).some((h) => hookService.keywordsFor(s, h).some((k) => wanted.includes(k)))) return false
  return !leaderService.inEngagementWithEnemy(s, id)
}

function rapidStrikeApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const id = canon(s, t.ids[0])
  const models = boardModelsOfUnit(s, id)
  const distanceInches = models.length === 0
    ? 0
    : Math.min(...models.map((m) => hookService.statFor(s, { unitId: m.unitId, modelId: m.id, weapon: null, stat: 'M' }, modelStats(s, m).M)))
  ctx.emit({
    type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: id, targetUnitId: null, player: env.player,
    summary: `Rapid Strike: ${s.units[id].name} makes a Normal move of up to ${distanceInches}"`,
  })
  startReactiveMove(ctx, id, distanceInches, env.stratagem.id, 'phase.end')
}

const rapidStrike: EngineCodeHook = {
  name: RAPID_STRIKE_CODE, kind: 'stratagem', hook: 'onPhaseEnd', run: noop,
  check: rapidStrikeCheck,
  apply: rapidStrikeApply,
}

export const bloodAngelsHooks: Record<string, EngineCodeHook> = { multiSpectrumArray, haywireMine, rapidStrike }
