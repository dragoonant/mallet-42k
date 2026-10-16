// Thousand Sons: The Coven Temporus (docs/spec/factions/thousand-sons.md section 7). Code hooks: Cabal of Sorcerers pool +
// Rituals, Weaver of Fates, Temporal Sorceries / Arch-Diabolist (Deep Strike + Lone Operative), Relic Hunters, Glimpse of
// Eternity, Malign Entanglement and the two custom secondaries. Registered in code-hooks.ts via thousandSonsHooks().
//
// Like the other faction files this one is pulled in by code-hooks.ts, so engine services are imported lazily at call time
// (functions only) and the hook table is built inside a function.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import { psychicKillThisPhase } from '../attack'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distance, pointInPolygon, withinObjectiveRange, OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE } from '../geometry'
import type { AttackContext } from '../hooks'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import { liveController } from '../missions'
import type { EngineContext } from '../modules'
import { boardUnitsOf, deploymentZone, modelKeywordsOf, unitModels } from '../state'
import { grantPhaseCostOverride } from '../stratagems'
import type { DiceRoll, GameState, ModelId, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'
import { tgbOverawingCheck } from './adeptus-custodes'

const noop = () => undefined

export const THS_FACTION = 'thousand-sons'
export const CABAL_KEY = 'cabalPoints'
export const WEAVER_ID = 'ths.a.weaver-of-fates'
const ARMY_RULE_ID = 'ths.a.cabal-of-sorcerers'
const ECHOES_ID = 'ths.a.echoes-from-the-warp'
const WEAVER_RANGE = 18
const WEAVER_COST = 2
const ECHOES_COST = 6

function otherOf(p: PlayerId): PlayerId { return p === 'A' ? 'B' : 'A' }

// ---------- the Cabal pool (THO-2.1, 2.2) ----------
export function cabalPoints(state: GameState, player: PlayerId): number {
  const v = state.players[player]?.secondaryState[CABAL_KEY]
  return typeof v === 'number' && v > 0 ? v : 0
}

export function gainCabal(ctx: EngineContext, player: PlayerId, n: number, source: string): void {
  if (n <= 0) return
  const total = cabalPoints(ctx.state, player) + n
  ctx.state.players[player].secondaryState[CABAL_KEY] = total
  ctx.emit({ type: 'AbilityTriggered', abilityId: source, sourceUnitId: null, targetUnitId: null, summary: `Cabal pool +${n} (${total})`, player })
}

export function spendCabal(ctx: EngineContext, player: PlayerId, n: number, source: string): boolean {
  const have = cabalPoints(ctx.state, player)
  if (n <= 0 || have < n) return false
  ctx.state.players[player].secondaryState[CABAL_KEY] = have - n
  ctx.emit({ type: 'AbilityTriggered', abilityId: source, sourceUnitId: null, targetUnitId: null, summary: `Cabal pool -${n} (${have - n})`, player })
  return true
}

function isThousandSons(s: GameState, player: PlayerId): boolean { return s.players[player]?.faction === THS_FACTION }

function abilityWithCode(s: GameState, unit: Unit, code: string): string | null {
  for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

// does the unit still hold a living model whose datasheet model id is `modelId` (composition ids may be namespaced `<datasheet>/<id>`)
function unitHasModelId(s: GameState, unitId: UnitId, modelId: string): boolean {
  return unitModels(s, unitId).some((m) => m.datasheetModelId === modelId || m.datasheetModelId.endsWith(`/${modelId}`))
}

function resetPool(ctx: EngineContext): void {
  const s = ctx.state
  const player = s.activePlayer
  const mark = `ths:reset:${s.round}:${player}`
  if (s.phaseState.marks.includes(mark)) return
  s.phaseState.marks.push(mark)
  if (cabalPoints(s, player) > 0) s.players[player].secondaryState[CABAL_KEY] = 0
}

// the end-of-Command-phase income: Ahrak 2, the Sorcerer 1 (neither while Battle-shocked), Temporal Sorceries D3, Relic Hunters
function generatePool(ctx: EngineContext): void {
  const s = ctx.state
  const player = s.activePlayer
  const mark = `ths:gen:${s.round}:${player}`
  if (s.phaseState.marks.includes(mark)) return
  s.phaseState.marks.push(mark)
  if (!isThousandSons(s, player)) return
  for (const unit of boardUnitsOf(s, player)) {
    if (unit.battleShocked) continue
    for (const id of s.datasheets[unit.datasheetId]?.abilities ?? []) {
      const a = s.abilities[id]
      if (a?.code !== 'cabalOfSorcerers') continue
      const modelId = a.params?.modelId as string | undefined
      if (modelId ? !unitHasModelId(s, unit.id, modelId) : unitModels(s, unit.id).length === 0) continue
      gainCabal(ctx, player, Number(a.params?.value ?? 0), id)
    }
  }
  // Temporal Sorceries: the bearer only has to be on the battlefield (Battle-shock does not matter)
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== 'temporalSorceries' || !a.bearerModelId) continue
    const bearer = s.models[a.bearerModelId]
    const unit = bearer ? s.units[bearer.unitId] : undefined
    if (!unit || unit.player !== player || unit.location !== 'board' || !unitModels(s, unit.id).some((m) => m.id === bearer.id)) continue
    const d3 = ctx.rollExpr('D3', { purpose: 'ability', player, unitId: unit.id }).total
    gainCabal(ctx, player, d3, a.id)
  }
  relicHunters(ctx, player)
}

// Relic Hunters (THO-6.3): one D6 per controlled marker with at least one Relic Hunters model in range, 4+ adds 1
function relicHunters(ctx: EngineContext, player: PlayerId): void {
  const s = ctx.state
  const hunters = boardUnitsOf(s, player).filter((u) => abilityWithCode(s, u, 'relicHunters'))
  if (hunters.length === 0) return
  const range = s.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  for (const obj of Object.values(s.objectives)) {
    if (obj.removed || liveController(ctx, obj.id) !== player) continue
    const present = hunters.find((u) => unitModels(s, u.id).some((m) => withinObjectiveRange(m, obj, 0, range, radius)))
    if (!present) continue
    const die = ctx.roll({ purpose: 'ability', player, sides: 6, count: 1, mode: 'perDie', unitId: present.id, commandRerollable: false }).final[0] ?? 1
    if (die >= 4) gainCabal(ctx, player, 1, abilityWithCode(s, present, 'relicHunters') ?? 'ths.a.relic-hunters')
  }
}

const cabalOfSorcerers: EngineCodeHook = {
  name: 'cabalOfSorcerers', kind: 'ability', hook: 'onPhaseEnd', run: noop,
  // pure bookkeeping: the pool is reset at the start of your Command phase and filled at its end; never raises a decision
  pick: {
    window: 'command.start', windows: ['command.end'], topic: 'abilityChoice',
    offer(ctx, window) {
      if (window === 'command.start') resetPool(ctx)
      else if (window === 'command.end') generatePool(ctx)
      return false
    },
    handle: () => undefined,
  },
}

// ---------- Rituals (THO-2.3 - 2.6) ----------
interface Psyker { modelId: ModelId; unitId: UnitId; onBoard: boolean }

export function psykersOf(s: GameState, player: PlayerId): Psyker[] {
  const out: Psyker[] = []
  for (const unit of Object.values(s.units)) {
    if (unit.player !== player || unit.location === 'destroyed') continue
    for (const m of unitModels(s, unit.id)) {
      if (modelKeywordsOf(s, m.id).includes('PSYKER')) out.push({ modelId: m.id, unitId: unit.id, onBoard: unit.location === 'board' })
    }
  }
  return out
}

const weaverPrefix = (player: PlayerId): string => `ths:weaver:${player}:`
const echoesMark = (player: PlayerId): string => `ths:echoes:${player}`

function weaverChoice(s: GameState, player: PlayerId): ModelId | null {
  const prefix = weaverPrefix(player)
  const m = s.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}

// friendly THOUSAND SONS board units that have a model within the Weaver's range of the chosen Psyker model
function weaverReach(s: GameState, psykerModelId: ModelId, player: PlayerId): number {
  const psyker = s.models[psykerModelId]
  if (!psyker) return 0
  let n = 0
  for (const unit of boardUnitsOf(s, player)) {
    if (unit.id === psyker.unitId) { n++; continue }
    if (unitModels(s, unit.id).some((m) => distance(psyker, m) <= WEAVER_RANGE + 1e-6)) n++
  }
  return n
}

function ritualOptions(s: GameState, player: PlayerId): { weaver: Psyker[]; echoes: Psyker[] } {
  const pool = cabalPoints(s, player)
  const marks = s.phaseState.marks
  const psykers = psykersOf(s, player)
  const weaver = pool >= WEAVER_COST && weaverChoice(s, player) === null ? psykers.filter((p) => p.onBoard) : []
  const echoes = pool >= ECHOES_COST && !marks.includes(echoesMark(player)) ? psykers : []
  return { weaver, echoes }
}

// the opponent attacks (their Shooting phase) or both sides do (Fight phase): that is when a re-roll of a failed save pays
function weaverIsTimely(s: GameState, player: PlayerId): boolean {
  return s.phase === 'fight' || (s.phase === 'shooting' && s.activePlayer !== player)
}

function ritualOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  if (window.split('.')[0] !== s.phase) return false
  // the pool reset comes before anything else at command.start, whichever hook is asked first
  if (window === 'command.start') resetPool(ctx)
  const marks = s.phaseState.marks
  for (const player of [s.activePlayer, otherOf(s.activePlayer)] as PlayerId[]) {
    const doneMark = `ths:rit:done:${player}`
    if (marks.includes(doneMark)) continue
    if (!isThousandSons(s, player)) { marks.push(doneMark); continue }
    const { weaver, echoes } = ritualOptions(s, player)
    if (weaver.length === 0 && echoes.length === 0) { marks.push(doneMark); continue }
    const pool = cabalPoints(s, player)
    const timely = weaverIsTimely(s, player)
    const options = [
      ...weaver.map((p) => {
        const reach = weaverReach(s, p.modelId, player)
        return {
          id: `weaver:${p.modelId}`,
          label: `Weaver of Fates via ${s.units[p.unitId].name} (${WEAVER_COST} of ${pool})`,
          hint: { value: timely && reach > 0 ? 3 + reach * 0.1 : -10 },
          action: { type: 'chooseOption' as const, player, decisionId: '', optionId: `weaver:${p.modelId}` },
        }
      }),
      ...echoes.map((p) => ({
        id: `echoes:${p.modelId}`,
        label: `Echoes from the Warp via ${s.units[p.unitId].name} (${ECHOES_COST} of ${pool})`,
        hint: { value: -5 },
        action: { type: 'chooseOption' as const, player, decisionId: '', optionId: `echoes:${p.modelId}` },
      })),
    ]
    const doneOption = { id: 'done', label: 'Keep the Cabal points', hint: { value: 0 }, action: { type: 'chooseOption' as const, player, decisionId: '', optionId: 'done' } }
    const anyUseful = options.some((o) => (o.hint.value as number) > 0)
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: (weaver[0] ?? echoes[0]).unitId, abilityId: ARMY_RULE_ID, data: { window, key, code: 'cabalRituals' } },
      options: anyUseful ? [...options, doneOption] : [doneOption, ...options],
    })
    return true
  }
  return false
}

function ritualHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Rituals expect chooseOption' }
  const s = ctx.state
  const player = pending.player
  const id = action.optionId
  if (id === 'done') { s.phaseState.marks.push(`ths:rit:done:${player}`); return }
  const sep = id.indexOf(':')
  const kind = sep < 0 ? id : id.slice(0, sep)
  const modelId = sep < 0 ? '' : id.slice(sep + 1) // model ids contain colons (A:ahrak#0)
  const { weaver, echoes } = ritualOptions(s, player)
  if (kind === 'weaver' && weaver.some((p) => p.modelId === modelId)) {
    if (!spendCabal(ctx, player, WEAVER_COST, WEAVER_ID)) return { code: 'E_NOT_AN_OPTION', reason: 'not enough Cabal points' }
    s.phaseState.marks.push(`${weaverPrefix(player)}${modelId}`)
    const unitId = s.models[modelId].unitId
    ctx.emit({ type: 'AbilityTriggered', abilityId: WEAVER_ID, sourceUnitId: unitId, targetUnitId: null, summary: `Weaver of Fates: ${s.units[unitId].name} watches over friendly Thousand Sons within ${WEAVER_RANGE}"`, player })
    return
  }
  if (kind === 'echoes' && echoes.some((p) => p.modelId === modelId)) {
    if (!spendCabal(ctx, player, ECHOES_COST, ECHOES_ID)) return { code: 'E_NOT_AN_OPTION', reason: 'not enough Cabal points' }
    s.phaseState.marks.push(echoesMark(player))
    const unitId = leaderService.canonicalUnitId(s, s.models[modelId].unitId)
    grantPhaseCostOverride(s, { player, unitId, cost: 0, ignoreLimit: true, source: ECHOES_ID })
    ctx.emit({ type: 'AbilityTriggered', abilityId: ECHOES_ID, sourceUnitId: unitId, targetUnitId: null, summary: `Echoes from the Warp: one Stratagem on ${s.units[unitId].name} costs 0 CP this phase`, player })
    return
  }
  return { code: 'E_NOT_AN_OPTION', reason: `Ritual ${id} is not available` }
}

const cabalRituals: EngineCodeHook = {
  name: 'cabalRituals', kind: 'ability', hook: 'onPhaseStart', run: noop,
  // the army rule has no declarative effects of its own
  gate: () => false,
  pick: {
    window: 'command.start', windows: ['movement.start', 'shooting.start', 'charge.start', 'fight.start'], topic: 'abilityChoice',
    offer: (ctx, w, k) => ritualOffer(ctx, w, k),
    handle: (ctx, a, p) => ritualHandle(ctx, a, p),
  },
}

// ---------- Weaver of Fates (THO-2.4) ----------
// The ability carries `effect: {reroll: 'oneDie'}`; this gate decides when it is live: the defending unit is a friendly THOUSAND SONS
// unit, a Weaver Ritual was paid for this phase, the chosen Psyker model is on the battlefield within 18" of a model of the defending
// unit (measured from that model, never from its whole unit), and the once-per-phase re-roll has not been used.
const weaverOfFates: EngineCodeHook = {
  name: 'weaverOfFates', kind: 'ability', hook: 'onSaveRoll', run: noop,
  forceScope: { who: 'friendly' },
  gateEffect(state, holder, entry, data) {
    const attack = data?.attack as AttackContext | undefined
    if (!attack) return false
    const player = holder.player
    const defender = state.units[attack.targetUnitId]
    if (!defender || defender.player !== player) return false
    if (!leaderService.halves(state, defender.id).some((id) => state.units[id]?.player === player && modelKeywordsOfUnit(state, id).includes('THOUSAND SONS'))) return false
    if (state.phaseState.marks.includes(`oneDie:${entry.source.id}:save:${player}`)) return false
    const psykerId = weaverChoice(state, player)
    const psyker = psykerId ? state.models[psykerId] : undefined
    const psykerUnit = psyker ? state.units[psyker.unitId] : undefined
    if (!psyker || !psykerUnit || psykerUnit.location !== 'board' || !unitModels(state, psykerUnit.id).some((m) => m.id === psyker.id)) return false
    const models = leaderService.halves(state, defender.id).flatMap((id) => state.units[id]?.location === 'board' ? unitModels(state, id) : [])
    return models.some((m) => distance(psyker, m) <= WEAVER_RANGE + 1e-6)
  },
}

function modelKeywordsOfUnit(s: GameState, unitId: UnitId): string[] {
  const ds = s.datasheets[s.units[unitId]?.datasheetId]
  return ds ? [...ds.keywords, ...ds.factionKeywords] : []
}

// ---------- Temporal Sorceries / Arch-Diabolist (THO-3) ----------
// Deep Strike + Lone Operative for the bearer's unit; the D3 income is rolled in generatePool
function grantsDeepStrikeAndLoneOperative(state: GameState, entry: HookSourceEntry, unitId: UnitId): ('DEEP_STRIKE' | 'LONE_OPERATIVE')[] {
  const bearer = entry.bearerModelId ? state.models[entry.bearerModelId] : undefined
  return bearer && bearer.unitId === unitId ? ['DEEP_STRIKE', 'LONE_OPERATIVE'] : []
}
const temporalSorceries: EngineCodeHook = { name: 'temporalSorceries', kind: 'ability', hook: 'onStatQuery', run: noop, grantsCoreAbility: grantsDeepStrikeAndLoneOperative }
const archDiabolist: EngineCodeHook = { name: 'archDiabolist', kind: 'ability', hook: 'onStatQuery', run: noop, grantsCoreAbility: grantsDeepStrikeAndLoneOperative }

// ---------- Relic Hunters (THO-6.3): marker, executed inside generatePool ----------
const relicHuntersHook: EngineCodeHook = { name: 'relicHunters', kind: 'ability', hook: 'onPhaseEnd', run: noop, gate: () => false }

// ---------- Glimpse of Eternity (THO-6.1) ----------
const glimpseOfEternity: EngineCodeHook = {
  name: 'glimpseOfEternity', kind: 'ability', hook: 'onStatQuery', run: noop,
  fixRoll(state: GameState, entry: HookSourceEntry, roll: DiceRoll) {
    const unit = state.units[entry.holderUnitId]
    if (!unit || unit.location !== 'board' || roll.unitId !== unit.id) return null
    if (roll.purpose !== 'hit' && roll.purpose !== 'wound' && roll.purpose !== 'damage' && roll.purpose !== 'save') return null
    const model = unitModels(state, unit.id)[0]
    if (!model) return null
    const usedKey = `ths:glimpse:${model.id}`
    if (state.players[unit.player].secondaryState[usedKey] === `${state.round}:${state.activePlayer}`) return null
    return { value: 6, usedKey }
  },
}

// ---------- Malign Entanglement (THO-5.3) ----------
const malignEntanglement: EngineCodeHook = {
  name: 'malignEntanglement', kind: 'stratagem', hook: 'onCharge', run: noop,
  check: (env: StratagemEnv, t: StratagemTuple) => tgbOverawingCheck(env, t),
  apply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple) {
    const s = ctx.state
    const canon = leaderService.canonicalUnitId(s, t.ids[0])
    ctx.services.effects.grant(ctx, canon, [{ modifyRoll: { roll: 'charge', value: -2 } }], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: t.ids[1], scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
    })
    ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: t.ids[1], targetUnitId: canon, summary: 'Malign Entanglement: the charging unit subtracts 2 from its Charge rolls', player: env.player })
  },
}

// ---------- Sorcerous Ritual (THO-4.1) and Bringer of Change (THO-4.2) amounts, called from missions.ts ----------
export function sorcerousRitualAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, controls: (objectiveId: string) => boolean): number {
  const s = ctx.state
  if (s.phase !== 'fight') return 0
  const range = s.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const zone = deploymentZone(s, pid)
  const psykers = psykersOf(s, pid).filter((p) => p.onBoard).map((p) => s.models[p.modelId])
  const onMarker = psykers.some((m) => Object.values(s.objectives).some((o) =>
    !o.removed && !pointInPolygon({ x: o.pos.x, z: o.pos.z }, zone) && controls(o.id) && withinObjectiveRange(m, o, 0, range, radius)))
  if (!onMarker) return 0
  const needed = (rule.params?.needed as number | undefined) ?? 5
  const maxBonus = (rule.params?.maxBonus as number | undefined) ?? 3
  const die = ctx.roll({ purpose: 'mission', player: pid, sides: 6, count: 1, mode: 'sum', commandRerollable: false }).final[0] ?? 1
  return die + Math.min(maxBonus, cabalPoints(s, pid)) >= needed ? rule.pointsPer : 0
}

export function bringerOfChangeAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number {
  const s = ctx.state
  if (!psychicKillThisPhase(s, pid)) return 0
  const room = rule.cap - (s.players[pid].vpBySource[rule.id] ?? 0)
  if (room <= 0) return 0
  return Math.min(ctx.rollExpr('D3', { purpose: 'mission', player: pid }).total, room)
}

function missionHook(name: string, hook: EngineCodeHook['hook'] = 'onTurnEnd'): EngineCodeHook {
  return { name, kind: 'mission', hook, run: noop }
}

export function thousandSonsHooks(): Record<string, EngineCodeHook> {
  return {
    cabalOfSorcerers, cabalRituals, weaverOfFates, temporalSorceries, archDiabolist, relicHunters: relicHuntersHook,
    glimpseOfEternity, malignEntanglement,
    sorcerousRitual: missionHook('sorcerousRitual', 'onPhaseEnd'),
    bringerOfChange: missionHook('bringerOfChange', 'onPhaseEnd'),
  }
}
