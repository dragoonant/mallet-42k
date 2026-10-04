// Astra Militarum engine rules (docs/spec/factions/astra-militarum.md §7): the eleven (b) code hooks.
// Owner: M10 astra-militarum stage. code-hooks.ts registers them through `astraMilitarumHooks`, a hoisted factory (the
// module graph is circular: hooks-impl <-> code-hooks <-> this file, so nothing here may run at import time).
// Mission amounts (Hold the Line, Methodical Destruction) are plain functions called from missions.ts.
import type { Effect } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { pushReaction } from '../code-hooks'
import { anyWithinEngagementRange, battlefieldEdgeStrip, distance, whollyWithinOfPolygon, whollyWithinPolygon, type Footprint } from '../geometry'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { autoDeployPlacements } from '../setup'
import {
  boardModelsOf, deploymentZone, modelHasAttacked, modelKeywordsOf, spawnDestroyedUnitCopy, unitModels,
} from '../state'
import type { GameState, Model, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const asList = (e: Effect | Effect[] | undefined): Effect[] => (e === undefined ? [] : Array.isArray(e) ? e : [e])
const otherOf = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

function boardModelsOfUnit(state: GameState, unitId: UnitId): Model[] {
  return leaderService.halves(state, unitId).flatMap((id) => (state.units[id]?.location === 'board' ? unitModels(state, id) : []))
}

function canonicalBoardUnits(state: GameState, player: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.player === player && u.location === 'board' && !u.bodyguardUnitId)
}

function anyHalfHasKeyword(state: GameState, unitId: UnitId, keyword: string): boolean {
  return leaderService.halves(state, unitId).some((id) => hookService.keywordsFor(state, id).includes(keyword))
}

function anyHalfShocked(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => state.units[id]?.battleShocked)
}

// ---------- Voice of Command (AST-2) ----------
const VOICE = 'voiceOfCommand'

interface VoiceParams { range: number; eligibleKeyword: string; ordersPerOfficer: number; orderIds: string[]; officerKeyword: string }

function voiceAbilityOf(state: GameState, unitId: UnitId): { id: string; params: VoiceParams } | null {
  for (const half of leaderService.halves(state, unitId)) {
    const ds = state.datasheets[state.units[half]?.datasheetId]
    for (const id of ds?.abilities ?? []) {
      const a = state.abilities[id]
      if (a?.code === VOICE) {
        const p = (a.params ?? {}) as Partial<VoiceParams>
        return {
          id,
          params: {
            range: p.range ?? 6, eligibleKeyword: p.eligibleKeyword ?? 'REGIMENT', ordersPerOfficer: p.ordersPerOfficer ?? 1,
            orderIds: p.orderIds ?? [], officerKeyword: p.officerKeyword ?? 'OFFICER',
          },
        }
      }
    }
  }
  return null
}

function laurelsOf(state: GameState, modelId: string): { id: string; allKeyword: string } | null {
  for (const a of Object.values(state.abilities)) {
    if (a.source === 'enhancement' && a.code === 'commandLaurels' && a.bearerModelId === modelId) {
      return { id: a.id, allKeyword: ((a.params?.allKeyword as string | undefined) ?? 'ASTRA MILITARUM') }
    }
  }
  return null
}

const orderMark = (round: number, modelId: string) => `order:${round}:${modelId}:`

function ordersUsed(state: GameState, modelId: string): { used: number; declined: boolean } {
  const prefix = orderMark(state.round, modelId)
  const marks = state.phaseState.marks.filter((m) => m.startsWith(prefix))
  return { used: marks.filter((m) => m !== `${prefix}done`).length, declined: marks.includes(`${prefix}done`) }
}

// every canonical friendly board unit the officer may order (AST-2.2), optionally widened by Command Laurels
function orderTargets(state: GameState, officer: Model, params: VoiceParams, allKeyword: string | null): UnitId[] {
  const player = state.units[officer.unitId].player
  const out: UnitId[] = []
  for (const u of canonicalBoardUnits(state, player)) {
    if (allKeyword) {
      if (anyHalfHasKeyword(state, u.id, allKeyword)) out.push(u.id)
      continue
    }
    if (!anyHalfHasKeyword(state, u.id, params.eligibleKeyword)) continue
    if (boardModelsOfUnit(state, u.id).some((m) => distance(officer, m) <= params.range + 1e-6)) out.push(u.id)
  }
  return out
}

function officerModels(state: GameState, player: PlayerId): { model: Model; ability: { id: string; params: VoiceParams } }[] {
  const out: { model: Model; ability: { id: string; params: VoiceParams } }[] = []
  for (const u of Object.values(state.units)) {
    if (u.player !== player || u.location !== 'board') continue
    const ability = voiceAbilityOf(state, u.id)
    if (!ability) continue
    for (const m of unitModels(state, u.id)) if (modelKeywordsOf(state, m.id).includes(ability.params.officerKeyword)) out.push({ model: m, ability })
  }
  return out
}

function orderName(state: GameState, orderId: string): string { return state.abilities[orderId]?.name ?? orderId }

function removeOrders(ctx: EngineContext, canonical: UnitId, orderIds: string[]): void {
  const s = ctx.state
  for (const half of leaderService.halves(s, canonical)) {
    const unit = s.units[half]
    if (!unit) continue
    const keep = unit.effects.filter((e) => {
      if (!orderIds.includes(e.sourceAbilityId)) return true
      ctx.emit({ type: 'EffectExpired', effectId: e.id, unitId: unit.id, player: unit.player })
      return false
    })
    if (keep.length !== unit.effects.length) unit.effects = keep
  }
}

function offerOrder(ctx: EngineContext, window: Parameters<NonNullable<EngineCodeHook['pick']>['offer']>[1], key: string): boolean {
  const s = ctx.state
  const player = s.activePlayer
  for (const { model, ability } of officerModels(s, player)) {
    const { used, declined } = ordersUsed(s, model.id)
    if (declined || used >= ability.params.ordersPerOfficer) continue
    const laurels = laurelsOf(s, model.id)
    const options: { id: string; label: string; unitId: UnitId | null; order: string }[] = []
    if (laurels) {
      for (const orderId of ability.params.orderIds) options.push({ id: `${orderId}@all`, label: `${orderName(s, orderId)} -> every ${laurels.allKeyword} unit`, unitId: null, order: orderId })
    } else {
      for (const unitId of orderTargets(s, model, ability.params, null)) {
        for (const orderId of ability.params.orderIds) options.push({ id: `${orderId}@${unitId}`, label: `${orderName(s, orderId)} -> ${s.units[unitId].name}`, unitId, order: orderId })
      }
    }
    if (options.length === 0) continue
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: model.unitId, abilityId: ability.id, data: { window, key, code: VOICE, modelId: model.id } },
      options: [
        ...options.map((o) => ({
          id: o.id, label: o.label, action: { type: 'chooseOption' as const, player, decisionId: '', optionId: o.id },
          hint: { ...(o.unitId ? { unitId: o.unitId } : {}), order: o.order },
        })),
        { id: 'decline', label: 'Decline (no Order)', action: { type: 'chooseOption' as const, player, decisionId: '', optionId: 'decline' } },
      ],
    })
    return true
  }
  return false
}

function handleOrder(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Voice of Command expects chooseOption' }
  const s = ctx.state
  const modelId = pending.context.data.modelId as string
  const officer = s.models[modelId]
  if (!officer) return { code: 'E_INVALID_TARGET', reason: 'the officer model is gone' }
  const prefix = orderMark(s.round, modelId)
  if (action.optionId === 'decline') { s.phaseState.marks.push(`${prefix}done`); return }
  const [orderId, target] = action.optionId.split('@')
  const ability = voiceAbilityOf(s, officer.unitId)
  const order = s.abilities[orderId]
  if (!ability || !order || !ability.params.orderIds.includes(orderId) || !target) return { code: 'E_NOT_AN_OPTION', reason: 'unknown Order' }
  const laurels = laurelsOf(s, modelId)
  const targets = target === 'all'
    ? (laurels ? orderTargets(s, officer, ability.params, laurels.allKeyword) : [])
    : orderTargets(s, officer, ability.params, null).filter((u) => u === target)
  if (targets.length === 0) return { code: 'E_INVALID_TARGET', reason: 'no eligible unit for that Order' }
  const officerUnit = s.units[officer.unitId]
  for (const unitId of targets) {
    removeOrders(ctx, unitId, ability.params.orderIds)
    ctx.services.effects.grant(ctx, unitId, asList(order.effect), {
      sourceAbilityId: orderId, sourceUnitId: officerUnit.id, scope: { who: 'self' }, duration: 'untilNextTurn', when: null,
    })
    ctx.emit({ type: 'AbilityTriggered', abilityId: orderId, sourceUnitId: officerUnit.id, targetUnitId: unitId, summary: `${order.name} -> ${s.units[unitId].name}`, player: pending.player })
  }
  s.phaseState.marks.push(`${prefix}${ordersUsed(s, modelId).used}`)
}

// ---------- gates ----------
// the unit (or its attached partner) is under an Order: an ActiveEffect from an ability with params.order
function hasActiveOrder(state: GameState, unitId: UnitId): boolean {
  return leaderService.halves(state, unitId).some((id) => state.units[id]?.effects.some((e) => state.abilities[e.sourceAbilityId]?.params?.order === true))
}

// ---------- Gunnery Officer (AST-3.2) ----------
function auraHolds(state: GameState, entry: HookSourceEntry, unitId: UnitId): boolean {
  if (!entry.bearerModelId) return false
  const bearer = state.models[entry.bearerModelId]
  const bearerUnit = bearer ? state.units[bearer.unitId] : undefined
  if (!bearer || !bearerUnit || bearerUnit.location !== 'board' || !bearerUnit.models.includes(bearer.id)) return false
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board' || unit.player !== bearerUnit.player) return false
  const keyword = (entry.params.auraKeyword as string | undefined) ?? 'ARTILLERY'
  if (!anyHalfHasKeyword(state, unitId, keyword)) return false
  const range = (entry.params.auraRange as number | undefined) ?? 6
  const mine = boardModelsOfUnit(state, unitId)
  const theirs = boardModelsOfUnit(state, bearerUnit.id)
  return mine.some((m) => theirs.some((t) => distance(m, t) <= range + 1e-6))
}

// ---------- Hold the Line (AST-4.1) ----------
export function holdTheLineAmount(state: GameState, rule: { pointsPer: number; params?: Record<string, unknown> }, pid: PlayerId): number {
  const full = (rule.params?.fullPoints as number | undefined) ?? 5
  const buffer = (rule.params?.buffer as number | undefined) ?? 6
  const zone = deploymentZone(state, pid)
  let nearZone = false
  let inZone = false
  for (const e of canonicalBoardUnits(state, otherOf(pid))) {
    if (anyHalfShocked(state, e.id)) continue
    const models = boardModelsOfUnit(state, e.id)
    if (models.length === 0) continue
    if (models.every((m) => whollyWithinOfPolygon(m, zone, buffer))) nearZone = true
    if (models.every((m) => whollyWithinPolygon(m, zone))) inZone = true
  }
  if (!nearZone) return full
  return inZone ? 0 : rule.pointsPer
}

// ---------- Methodical Destruction (AST-4.2) ----------
interface MethodicalTarget { halves: UnitId[]; round: number }

export function methodicalDestructionOffer(ctx: EngineContext, pid: PlayerId, window: Parameters<NonNullable<EngineCodeHook['pick']>['offer']>[1], key: string): void {
  const s = ctx.state
  const seen = new Set<UnitId>()
  const candidates: Unit[] = []
  for (const u of Object.values(s.units)) {
    if (u.player === pid || u.location === 'destroyed') continue
    const canonical = leaderService.canonicalUnitId(s, u.id)
    if (seen.has(canonical)) continue
    seen.add(canonical)
    candidates.push(s.units[canonical])
  }
  if (candidates.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: pid, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: null, data: { window, key, code: 'methodicalDestructionPick' } },
    options: candidates.map((u) => ({
      id: u.id, label: u.name, action: { type: 'chooseOption' as const, player: pid, decisionId: '', optionId: u.id }, hint: { unitId: u.id },
    })),
  })
}

function answerMethodical(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Methodical Destruction expects chooseOption' }
  const s = ctx.state
  const unit = s.units[action.optionId]
  if (!unit || unit.player === pending.player || unit.location === 'destroyed') return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit that is not destroyed' }
  const target: MethodicalTarget = { halves: leaderService.halves(s, leaderService.canonicalUnitId(s, unit.id)), round: s.round }
  s.players[pending.player].secondaryState.methodicalTarget = target
  ctx.emit({ type: 'AbilityTriggered', abilityId: 'am.sec.methodical-destruction', sourceUnitId: null, targetUnitId: unit.id, summary: `Methodical Destruction: ${unit.name} marked`, player: pending.player })
  // the mission window that raised this pick resumes here (the shared abilityChoice handler does not know about it)
  const w = pending.context.data.window as Parameters<typeof ctx.services.missions.onWindow>[1] | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

export function methodicalDestructionAmount(state: GameState, rule: { pointsPer: number }, pid: PlayerId): number {
  const p = state.players[pid]
  const target = p.secondaryState.methodicalTarget as MethodicalTarget | undefined
  p.secondaryState.methodicalTarget = undefined
  if (!target || target.round !== state.round) return 0
  return target.halves.every((id) => state.units[id]?.location === 'destroyed') ? rule.pointsPer : 0
}

// ---------- Send in the Next Wave (AST-5.1) ----------
function cloneModelsFor(state: GameState, sourceId: UnitId): Model[] {
  const src = state.units[sourceId]
  const living = src.models.map((id) => state.models[id]).filter((m): m is Model => !!m)
  const gone = (src.destroyedModels ?? []).filter((m) => !living.some((l) => l.id === m.id))
  return [...living, ...gone]
}

function nextWavePlacement(state: GameState, player: PlayerId, sourceId: UnitId, depth: number): boolean {
  const models = cloneModelsFor(state, sourceId)
  if (models.length === 0) return false
  const strip = battlefieldEdgeStrip(state.board, deploymentZone(state, player), depth)
  const enemies = boardModelsOf(state, otherOf(player))
  const placements = autoDeployPlacements(models, strip, boardModelsOf(state, player), enemies)
  if (!placements) return false
  return placements.every((p, i) => {
    const fp: Footprint = { pos: p.pos, facing: p.facing ?? 0, base: models[i].base }
    return !anyWithinEngagementRange(fp, enemies)
  })
}

export function astraMilitarumHooks(): Record<string, EngineCodeHook> {
  const noop = () => undefined

  const voiceOfCommand: EngineCodeHook = {
    name: 'voiceOfCommand', kind: 'ability', hook: 'onCommandPhase', run: noop,
    pick: { window: 'command.end', topic: 'abilityChoice', offer: offerOrder, handle: handleOrder },
  }

  // marker hook: read by voiceOfCommand to widen an Order to every friendly ASTRA MILITARUM unit
  const commandLaurels: EngineCodeHook = { name: 'commandLaurels', kind: 'ability', hook: 'onCommandPhase', run: noop }

  const gunneryOfficer: EngineCodeHook = {
    name: 'gunneryOfficer', kind: 'ability', hook: 'onCommandPhase', run: noop,
    rerollsAttackCount(state, entry, attackerModelId) {
      const m = state.models[attackerModelId]
      return !!m && auraHolds(state, entry, m.unitId)
    },
    grantsCoreAbility(state, entry, unitId) {
      if (!auraHolds(state, entry, unitId)) return []
      const models = boardModelsOfUnit(state, unitId)
      return models.length > 0 && models.every((m) => !modelHasAttacked(state, m.id)) ? ['LONE_OPERATIVE'] : []
    },
  }

  const requireActiveOrder: EngineCodeHook = {
    name: 'requireActiveOrder', kind: 'ability', hook: 'onStatQuery', run: noop,
    // Overwatch happens in the opponent's turn: the Sustained Hits only exist in the owner's own turn [interp, AST-028]
    gate: (state, holder) => state.activePlayer === holder.player && hasActiveOrder(state, holder.id),
  }

  const wargearBearerAlive: EngineCodeHook = {
    name: 'wargearBearerAlive', kind: 'ability', hook: 'onStatQuery', run: noop,
    gate(state, holder, entry) {
      const modelId = entry.params.modelId as string | undefined
      return !!modelId && holder.models.some((id) => state.models[id]?.datasheetModelId === modelId)
    },
  }

  const holdTheLine: EngineCodeHook = { name: 'holdTheLine', kind: 'mission', hook: 'onTurnEnd', run: noop }

  const methodicalDestructionPick: EngineCodeHook = { name: 'methodicalDestructionPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerMethodical }
  const methodicalDestructionScore: EngineCodeHook = { name: 'methodicalDestructionScore', kind: 'mission', hook: 'onPhaseEnd', run: noop }

  const sendInTheNextWave: EngineCodeHook = {
    name: 'sendInTheNextWave', kind: 'stratagem', hook: 'onReinforcements', run: noop, destroyedTargets: true,
    check(env: StratagemEnv, t: StratagemTuple) {
      const u = env.state.units[t.ids[0]]
      if (!u || u.location !== 'destroyed') return false
      return nextWavePlacement(env.state, env.player, u.id, (env.stratagem.params?.depth as number | undefined) ?? 9)
    },
    apply(ctx, env, t) {
      const copy = spawnDestroyedUnitCopy(ctx, t.ids[0])
      pushReaction(ctx, { kind: 'nextWave', stratagemId: env.stratagem.id, player: env.player, unitId: copy.id, enemyUnitId: null, window: env.window, distance: null })
    },
  }

  // the declarative re-roll lives on the enemy target (scope 'attacker'); this gate limits it to the attackers that were
  // not Battle-shocked when the Stratagem was used (AST-5.2 snapshot in the user's secondaryState)
  const bringItDown: EngineCodeHook = {
    name: 'bringItDown', kind: 'stratagem', hook: 'onHitRoll', hooks: ['onHitRoll'], run: noop,
    check(env) {
      return canonicalBoardUnits(env.state, env.player).some((u) => anyHalfHasKeyword(env.state, u.id, 'ASTRA MILITARUM') && !anyHalfShocked(env.state, u.id))
    },
    apply(ctx, env) {
      const s = ctx.state
      const ids = canonicalBoardUnits(s, env.player).filter((u) => anyHalfHasKeyword(s, u.id, 'ASTRA MILITARUM') && !anyHalfShocked(s, u.id)).flatMap((u) => leaderService.halves(s, u.id))
      // every half's id is stored, so the re-roll survives a leader/bodyguard detach later in the phase
      s.players[env.player].secondaryState.bringItDown = { round: s.round, eligibleUnitIds: ids }
    },
    gateActive(state, entry, data) {
      const attack = data?.attack as { attackerUnitId?: UnitId } | null | undefined
      if (!attack?.attackerUnitId) return false
      const holder = state.units[entry.holderUnitId]
      if (!holder) return false
      const snap = state.players[otherOf(holder.player)].secondaryState.bringItDown as { round: number; eligibleUnitIds: UnitId[] } | undefined
      if (!snap || snap.round !== state.round) return false
      return leaderService.halves(state, attack.attackerUnitId).some((id) => snap.eligibleUnitIds.includes(id))
    },
  }

  const artilleryStrike: EngineCodeHook = {
    name: 'artilleryStrike', kind: 'stratagem', hook: 'onStatQuery', run: noop, grantsItself: true,
    apply(ctx, env, t) {
      const s = ctx.state
      const officer = s.models[t.ids[0]]
      const effects = [
        { when: { weaponType: 'ranged' }, modifyRoll: { roll: 'hit', value: -1 } },
        { halveStat: 'M' },
        { halveRoll: 'advance' },
        { forbid: 'charge' },
      ] as unknown as Effect[]
      for (const u of Object.values(s.units)) {
        if (u.player === env.player || (u.location !== 'board' && u.location !== 'reserves')) continue
        ctx.services.effects.grant(ctx, u.id, effects, {
          sourceAbilityId: env.stratagem.id, sourceUnitId: officer?.unitId ?? null, scope: { who: 'self' }, duration: 'untilEndOfTurn', when: null,
        })
      }
      ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: officer?.unitId ?? null, targetUnitId: null, summary: 'Artillery Strike: enemy movement and fire hampered until the end of the turn', player: env.player })
    },
  }

  return {
    voiceOfCommand, commandLaurels, gunneryOfficer, requireActiveOrder, wargearBearerAlive, holdTheLine,
    methodicalDestructionPick, methodicalDestructionScore, sendInTheNextWave, bringItDown, artilleryStrike,
  }
}
