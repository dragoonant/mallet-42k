// World Eaters engine rules (docs/spec/factions/world-eaters.md §7): the nine (b) code hooks.
// code-hooks.ts registers them through `worldEatersHooks`, a hoisted factory (the module graph is circular:
// hooks-impl <-> code-hooks <-> this file, so nothing here may run at import time).
//
//   blessingsOfKhorne      round.start 8D6 roll + pick (up to two Blessings) and the gate of Warp Blades
//   wrathfulDevotion       Feel No Pain 6+ (or +1 to the roll) while the Blessing is on (needs engine C1 adjustFeelNoPain)
//   totalCarnage           grants fight-on-death (C5 path) at the start of every Fight phase while the Blessing is on
//   skullsForKhorne        enhancement: bearer wipes out an enemy unit in melee -> D6, 2+ = 1 CP
//   ravageAndRansack       secondary amount (marker nearest the opponent's battlefield edge, end of the opponent's turn)
//   bloodOffering          secondary: phase-start snapshot of enemy units near markers + the UnitDestroyed award (missions.ts calls in)
//   rageUnchecked          stratagem check (declarative Sustained Hits 1 grant does the rest)
//   unstoppableFury        stratagem at fight.beforeConsolidate (C2); the 6" distance is read by hooks-impl getStuckIn (C3)
//   overwhelmingOnslaught  stratagem: Battle-shock test at -1 on an enemy unit in Engagement Range of the charger
//
// State: the chosen Blessings live in `players[p].secondaryState['we:blessings']` ({ round, dice, active }); Blood Offering's
// snapshot in `secondaryState.bloodNearby` (enemy unit ids, both halves); once-per-phase guards are phase marks
// `skulls:<unit>` / `blood:<unit>`.
import type { Action } from '../actions'
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { grantFightOnDeath } from '../fight-on-death'
import { playerBattlefieldEdge, withinEngagementRange, withinObjectiveRange } from '../geometry'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { boardUnitsOf, deploymentZone, hasKeyword, unitModels } from '../state'
import type { GameState, Model, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'

const noop = () => undefined

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

// ---------- Blessings of Khorne: dice sets ----------
export type BlessingId = 'wrathfulDevotion' | 'totalCarnage' | 'warpBlades'
export interface BlessingRequirement { pairMin: number; triple?: boolean }
export interface StoredBlessings { round: number; dice: number[]; active: BlessingId[] }
export const BLESSINGS_KEY = 'we:blessings'

const BLESSING_ABILITY = 'we.a.blessings-of-khorne'
const BLESSING_NAMES: Record<BlessingId, string> = { wrathfulDevotion: 'Wrathful Devotion', totalCarnage: 'Total Carnage', warpBlades: 'Warp Blades' }
const BLESSING_ORDER: BlessingId[] = ['wrathfulDevotion', 'totalCarnage', 'warpBlades']
// AI preference order (WOR-2 / the spec): TC+WB, WD+WB, WD+TC, WB, TC, WD, none
const PREFERENCE: BlessingId[][] = [
  ['totalCarnage', 'warpBlades'], ['wrathfulDevotion', 'warpBlades'], ['wrathfulDevotion', 'totalCarnage'],
  ['warpBlades'], ['totalCarnage'], ['wrathfulDevotion'], [],
]
const DEFAULT_REQUIREMENTS: Record<BlessingId, BlessingRequirement> = {
  wrathfulDevotion: { pairMin: 1 },
  totalCarnage: { pairMin: 4, triple: true },
  warpBlades: { pairMin: 5, triple: true },
}

const setKey = (set: BlessingId[]): string => [...set].sort().join('+')

// one way to pay for each Blessing of `set` from the dice, using disjoint dice; null when impossible
function assignDice(dice: number[], req: Record<BlessingId, BlessingRequirement>, set: BlessingId[]): Partial<Record<BlessingId, { value: number; n: number }>> | null {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) if (d >= 1 && d <= 6) counts[d]++
  const out: Partial<Record<BlessingId, { value: number; n: number }>> = {}
  const go = (i: number): boolean => {
    if (i >= set.length) return true
    const b = set[i]
    const r = req[b]
    for (let v = 1; v <= 6; v++) {
      const costs: number[] = []
      if (v >= r.pairMin) costs.push(2)
      if (r.triple) costs.push(3)
      for (const n of costs) {
        if (counts[v] < n) continue
        counts[v] -= n
        out[b] = { value: v, n }
        if (go(i + 1)) return true
        counts[v] += n
      }
    }
    return false
  }
  return go(0) ? out : null
}

// every set of 0..max distinct Blessings that can be paid for from `dice` with disjoint dice, best first (the AI preference
// order: both Blessings before one, Total Carnage / Warp Blades before Wrathful Devotion); the empty set (`none`) is last
export function feasibleBlessingSets(dice: number[], req: Record<BlessingId, BlessingRequirement>, max: number): BlessingId[][] {
  const out: BlessingId[][] = []
  const seen = new Set<string>()
  const consider = (set: BlessingId[]): void => {
    if (set.length > max || seen.has(setKey(set))) return
    if (assignDice(dice, req, set)) { seen.add(setKey(set)); out.push(set) }
  }
  for (const set of PREFERENCE) consider(set)
  // any other combination a data override of `max` / the requirements could allow (three Blessings need max >= 3)
  const all: BlessingId[][] = []
  for (let mask = 1; mask < 8; mask++) all.push(BLESSING_ORDER.filter((_, i) => mask & (1 << i)))
  all.sort((a, b) => b.length - a.length)
  for (const set of all) consider(set)
  if (!seen.has('')) out.push([])
  return out
}

export function activeBlessings(state: GameState, player: PlayerId): BlessingId[] {
  const stored = state.players[player].secondaryState[BLESSINGS_KEY] as StoredBlessings | undefined
  return stored && stored.round === state.round ? stored.active : []
}

export function blessingActive(state: GameState, player: PlayerId, id: BlessingId): boolean {
  return activeBlessings(state, player).includes(id)
}

function carriesBlessings(state: GameState, u: Unit): boolean {
  return u.location !== 'destroyed' && (state.datasheets[u.datasheetId]?.abilities ?? []).some((id) => state.abilities[id]?.code === 'blessingsOfKhorne' && state.abilities[id].params?.armyRule === true)
}

function hasBlessingUnit(state: GameState, player: PlayerId): boolean {
  return Object.values(state.units).some((u) => u.player === player && carriesBlessings(state, u))
}

function requirementsOf(state: GameState): { req: Record<BlessingId, BlessingRequirement>; dice: number; max: number } {
  const p = state.abilities[BLESSING_ABILITY]?.params as { requirements?: Record<BlessingId, BlessingRequirement>; dice?: number; max?: number } | undefined
  return { req: { ...DEFAULT_REQUIREMENTS, ...(p?.requirements ?? {}) }, dice: p?.dice ?? 8, max: p?.max ?? 2 }
}

function describeSet(dice: number[], req: Record<BlessingId, BlessingRequirement>, set: BlessingId[]): string {
  if (set.length === 0) return 'No Blessing'
  const used = assignDice(dice, req, set)
  return set.map((b) => {
    const a = used?.[b]
    return a ? `${BLESSING_NAMES[b]} (${Array(a.n).fill(a.value).join('-')})` : BLESSING_NAMES[b]
  }).join(' + ')
}

function blessingsOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  for (const player of [s.firstPlayer, other(s.firstPlayer)] as PlayerId[]) {
    const mark = `pick:blessings:${s.round}:${player}`
    if (s.phaseState.marks.includes(mark)) continue
    if (!hasBlessingUnit(s, player)) continue
    s.phaseState.marks.push(mark)
    const { req, dice: diceCount, max } = requirementsOf(s)
    const roll = ctx.roll({ purpose: 'ability', player, sides: 6, count: diceCount, mode: 'perDie', unitId: null, commandRerollable: false })
    const dice = [...roll.final]
    const sets = feasibleBlessingSets(dice, req, max)
    const options = sets.map((set, i) => {
      const id = set.length === 0 ? 'none' : setKey(set)
      return {
        id, label: describeSet(dice, req, set),
        action: { type: 'chooseOption' as const, player, decisionId: '', optionId: id },
        hint: { priority: (sets.length - i) * 0.1 },
      }
    })
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: null, abilityId: s.abilities[BLESSING_ABILITY] ? BLESSING_ABILITY : null, data: { window, key, code: 'blessingsOfKhorne', dice } },
      options,
    })
    return true
  }
  return false
}

function blessingsHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Blessings of Khorne expects chooseOption' }
  if (!pending.options.some((o) => o.id === action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: 'that Blessing set is not paid for by the dice rolled' }
  const s = ctx.state
  const active = (action.optionId === 'none' ? [] : action.optionId.split('+')) as BlessingId[]
  const dice = ((pending.context.data as { dice?: number[] } | undefined)?.dice ?? []) as number[]
  s.players[pending.player].secondaryState[BLESSINGS_KEY] = { round: s.round, dice, active } satisfies StoredBlessings
  ctx.emit({
    type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? BLESSING_ABILITY, sourceUnitId: null, targetUnitId: null, player: pending.player,
    summary: `Blessings of Khorne [${dice.join(' ')}]: ${active.length === 0 ? 'no Blessing' : active.map((b) => BLESSING_NAMES[b]).join(' + ')} this round`,
  })
}

// ---------- Skulls for Khorne ----------
function skullsRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void {
  const s = ctx.state
  const byModelId = data.byModelId as string | null | undefined
  if (!entry.bearerModelId || byModelId !== entry.bearerModelId || data.kind !== 'melee') return
  const holder = s.units[entry.holderUnitId]
  const destroyedId = data.destroyedUnitId as UnitId
  const destroyed = s.units[destroyedId]
  if (!holder || !destroyed || destroyed.player === holder.player) return
  // one roll per combined unit: the last board model of both halves must be gone
  if (leaderService.halves(s, destroyedId).some((id) => s.units[id]?.location === 'board' && unitModels(s, id).length > 0)) return
  const mark = `skulls:${leaderService.canonicalUnitId(s, destroyedId)}`
  if (s.phaseState.marks.includes(mark)) return
  s.phaseState.marks.push(mark)
  const total = ctx.rollExpr('D6', { purpose: 'ability', player: holder.player, unitId: holder.id, commandRerollable: false }).total
  const gained = total >= 2 ? hookService.gainCp(ctx, holder.player, 1, entry.source.id) : 0
  ctx.emit({
    type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: destroyed.id, player: holder.player,
    summary: `Skulls for Khorne: rolled ${total}${total >= 2 ? (gained > 0 ? ', +1 CP' : ', no CP gained (cap)') : ', no CP'}`,
  })
}

// ---------- Ravage and Ransack ----------
// 4 VP when pid controls the marker nearest the opponent's battlefield edge (tied markers: either one, still one award)
export function ravageAndRansackAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, holds: (id: string) => boolean): number {
  const s = ctx.state
  const edge = playerBattlefieldEdge(s.board, deploymentZone(s, other(pid)))
  const hw = s.board.w / 2, hh = s.board.h / 2
  const dist = (o: { pos: { x: number; z: number } }): number =>
    edge === 'L' ? o.pos.x + hw : edge === 'R' ? hw - o.pos.x : edge === 'T' ? o.pos.z + hh : hh - o.pos.z
  const live = Object.values(s.objectives).filter((o) => !o.removed)
  if (live.length === 0) return 0
  const min = Math.min(...live.map(dist))
  return live.filter((o) => dist(o) <= min + 0.01).some((o) => holds(o.id)) ? rule.pointsPer : 0
}

// ---------- Blood Offering ----------
export function bloodOfferingRule(s: GameState, pid: PlayerId): ScoringRule | null {
  const rules = [...s.mission.scoring, ...(s.mission.secondaries[pid] ?? [])]
  return rules.find((r) => r.rule === 'custom' && r.code === 'bloodOffering' && s.round >= r.rounds.from && s.round <= r.rounds.to) ?? null
}

// phase-start snapshot: every enemy unit (canonical + halves) with a model in objective range of ANY live marker right now
export function bloodOfferingSnapshot(s: GameState, range: number, radius: number): void {
  for (const pid of ['A', 'B'] as PlayerId[]) {
    if (!bloodOfferingRule(s, pid)) continue
    const markers = Object.values(s.objectives).filter((o) => !o.removed)
    const nearby = new Set<string>()
    for (const e of boardUnitsOf(s, other(pid))) {
      if (unitModels(s, e.id).some((m) => markers.some((o) => withinObjectiveRange(m, o, 0, range, radius)))) {
        for (const id of leaderService.halves(s, e.id)) nearby.add(id)
      }
    }
    s.players[pid].secondaryState.bloodNearby = [...nearby]
  }
}

interface DestroyedInfo { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: string | null; kind?: string }

// VP to award now for this destroyed unit (0 when nothing scores); the caller records it. Pure besides the once-per-unit phase mark.
export function bloodOfferingAward(s: GameState, info: DestroyedInfo): { pid: PlayerId; rule: ScoringRule; amount: number } | null {
  const pid = info.byPlayer
  if (!pid || info.kind !== 'melee' || !info.byModelId || !info.byUnitId) return null
  const killer = s.units[info.byUnitId]
  if (!killer || killer.player !== pid || !hasKeyword(s, killer.id, 'WORLD EATERS')) return null
  const rule = bloodOfferingRule(s, pid)
  if (!rule) return null
  const nearby = (s.players[pid].secondaryState.bloodNearby as string[] | undefined) ?? []
  if (!nearby.includes(info.unitId)) return null
  if (leaderService.halves(s, info.unitId).some((id) => s.units[id]?.location === 'board' && unitModels(s, id).length > 0)) return null
  const mark = `blood:${leaderService.canonicalUnitId(s, info.unitId)}`
  if (s.phaseState.marks.includes(mark)) return null
  s.phaseState.marks.push(mark)
  const amount = Math.min(rule.pointsPer, rule.cap - (s.players[pid].vpBySource[rule.id] ?? 0))
  return amount > 0 ? { pid, rule, amount } : null
}

// ---------- Rage Unchecked ----------
function rageUncheckedCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const { state } = env
  const unit = t.ids[0]
  if (!unit || !state.units[unit]) return false
  const halves = leaderService.halves(state, unit)
  if (!leaderService.isBelowHalfStrength(state, unit)) return false
  if (state.phase === 'shooting') {
    if (env.player !== state.activePlayer) return false
    return !halves.some((h) => state.phaseState.activated.includes(h) || state.units[h].turn.shotThisPhase)
  }
  if (state.phase === 'fight') {
    const fight = state.phaseState.fight
    return !halves.some((h) => state.units[h].turn.foughtThisPhase || fight?.fought.includes(h) || fight?.currentUnitId === h)
  }
  return false
}

// ---------- Unstoppable Fury ----------
function unstoppableFuryCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const { state } = env
  const unit = state.units[t.ids[0]]
  if (!unit || !env.trigger.unitId || !leaderService.sameUnit(state, t.ids[0], env.trigger.unitId)) return false
  return unit.player === env.player && leaderService.halves(state, unit.id).some((h) => state.units[h]?.location === 'board')
}

function unstoppableFuryApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  // an empty-effect grant, so hooks-impl getStuckIn finds the source (same as getStuckInDistance); the 6" comes from its params
  const unitId = t.ids[0]
  ctx.services.effects.grant(ctx, unitId, [], { sourceAbilityId: env.stratagem.id, sourceUnitId: unitId, scope: { who: 'self' }, duration: env.stratagem.duration ?? 'untilEndOfPhase' })
}

// ---------- Overwhelming Onslaught ----------
function boardModelsOf(state: GameState, unitId: UnitId): Model[] {
  return leaderService.halves(state, unitId).flatMap((id) => (state.units[id]?.location === 'board' ? unitModels(state, id) : []))
}

function overwhelmingOnslaughtCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const { state } = env
  const charger = state.units[t.ids[0]]
  if (!charger || charger.location !== 'board' || charger.player !== env.player) return false
  if (!env.trigger.unitId || !leaderService.sameUnit(state, t.ids[0], env.trigger.unitId)) return false
  const enemy = state.units[t.ids[1]]
  if (!enemy || enemy.player === env.player || enemy.location !== 'board') return false
  const mine = boardModelsOf(state, charger.id)
  const theirs = boardModelsOf(state, enemy.id)
  return mine.some((m) => theirs.some((e) => withinEngagementRange(m, e)))
}

function overwhelmingOnslaughtApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const enemy = leaderService.canonicalUnitId(ctx.state, t.ids[1])
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: t.ids[0], targetUnitId: enemy, summary: 'Battle-shock test (-1)', player: env.player })
  hookService.battleShockTest(ctx, enemy, env.stratagem.id, -1)
}

// hoisted factory (circular module graph): called by code-hooks.ts when it builds the registry
export function worldEatersHooks(): Record<string, EngineCodeHook> {
  const blessingsOfKhorne: EngineCodeHook = {
    name: 'blessingsOfKhorne', kind: 'ability', hook: 'onStatQuery', run: noop,
    // the army-rule marker has no effect of its own; Warp Blades carries params.blessing
    gate(state, holder, entry) {
      const blessing = entry.params.blessing as BlessingId | undefined
      return blessing !== undefined && blessingActive(state, holder.player, blessing)
    },
    pick: { window: 'round.start', topic: 'abilityChoice', offer: blessingsOffer, handle: blessingsHandle },
  }

  const wrathfulDevotion: EngineCodeHook = {
    name: 'wrathfulDevotion', kind: 'ability', hook: 'onFeelNoPainRoll', run: noop,
    adjustFeelNoPain(state, entry, modelId, current) {
      const holder = state.units[entry.holderUnitId]
      const model = state.models[modelId]
      if (!holder || !model || !blessingActive(state, holder.player, 'wrathfulDevotion')) return null
      if (!leaderService.sameUnit(state, model.unitId, holder.id)) return null
      const value = (entry.params.value as number | undefined) ?? 6
      const bonus = (entry.params.bonus as number | undefined) ?? 1
      return current === null ? { threshold: value, modifier: 0 } : { threshold: current, modifier: bonus }
    },
  }

  const totalCarnage: EngineCodeHook = {
    name: 'totalCarnage', kind: 'ability', hook: 'onPhaseStart', run: noop,
    runAt(ctx, entry) {
      const s = ctx.state
      if (s.phase !== 'fight') return
      const holder = s.units[entry.holderUnitId]
      if (!holder || holder.location !== 'board' || !blessingActive(s, holder.player, 'totalCarnage')) return
      grantFightOnDeath(s, holder.id, (entry.params.threshold as number | undefined) ?? 4)
    },
  }

  const skullsForKhorne: EngineCodeHook = { name: 'skullsForKhorne', kind: 'ability', hook: 'onUnitDestroyed', run: noop, runAt: skullsRun }

  const ravageAndRansack: EngineCodeHook = { name: 'ravageAndRansack', kind: 'mission', hook: 'onTurnEnd', run: noop }
  const bloodOffering: EngineCodeHook = { name: 'bloodOffering', kind: 'mission', hook: 'onUnitDestroyed', run: noop }

  const rageUnchecked: EngineCodeHook = { name: 'rageUnchecked', kind: 'stratagem', hook: 'onHitRoll', run: noop, check: rageUncheckedCheck }

  const unstoppableFury: EngineCodeHook = {
    name: 'unstoppableFury', kind: 'stratagem', hook: 'onMove', run: noop,
    check: unstoppableFuryCheck, apply: unstoppableFuryApply,
  }

  const overwhelmingOnslaught: EngineCodeHook = {
    name: 'overwhelmingOnslaught', kind: 'stratagem', hook: 'onPhaseStart', run: noop,
    check: overwhelmingOnslaughtCheck, apply: overwhelmingOnslaughtApply,
  }

  return { blessingsOfKhorne, wrathfulDevotion, totalCarnage, skullsForKhorne, ravageAndRansack, bloodOffering, rageUnchecked, unstoppableFury, overwhelmingOnslaught }
}
