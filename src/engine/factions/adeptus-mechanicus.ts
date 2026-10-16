// Adeptus Mechanicus engine rules (docs/spec/factions/adeptus-mechanicus.md §7): the seven (b) code hooks.
// code-hooks.ts registers them through `adeptusMechanicusHooks`, a hoisted factory (the module graph is circular:
// hooks-impl <-> code-hooks <-> this file, so nothing here may run at import time).
//
//   doctrinaImperatives  round.start pick (Protector / Conqueror) + the gate of the four effect abilities
//   radSaturation        Rad-saturation aura gate (not on VEHICLE)
//   lineBreakers         Sulphurhounds' mortal wounds at the end of a Charge move (needs the start snapshot)
//   justFellBack         Optimised Efficiency target check
//   targetedPurgePick/Score, prescribedExcoriation   the two secondaries
//
// State: the chosen imperative lives in `players[p].secondaryState['adm:imperative']` ({ round, choice }); the Line-breakers
// start snapshot is a phase mark `lb:start:<unitId>:<json [[modelId,x,y,z]...]>` (the charger's model positions when the Charge
// move began), its once-per-charge guard `lb:done:<unitId>`. The "started within 6\" of BATTLELINE" test (ADM-6.5) is evaluated
// at charge.moveEnded from the models that SURVIVED Fire Overwatch, placed back on their start positions.
import type { Action } from '../actions'
import type { Effect, ScoringRule } from '../../data/types'
import { consumeDeathReaction, pendingDeathReaction } from '../attack'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distance, growConvexPolygon, partlyWithinPolygon, withinEngagementRange } from '../geometry'
import { friendlyKeywordWithin, hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { deploymentZone, keywordsOf, modelStats, mortalCredit, unitModels } from '../state'
import type { GameState, Model, PendingDecision, PlayerId, Rejection, RuntimeAbility, TimingWindowId, Unit, UnitId } from '../types'
import { answerEdict } from './tau-empire'

const noop = () => undefined

export const IMPERATIVE_KEY = 'adm:imperative'
export type Imperative = 'protector' | 'conqueror'
const DOCTRINA_ABILITY = 'adm.a.doctrina-imperatives'

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

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

// abilities carrying `code` on any half of the unit's datasheets
function abilitiesWithCode(state: GameState, unitId: UnitId, code: string): RuntimeAbility[] {
  const out: RuntimeAbility[] = []
  for (const half of leaderService.halves(state, unitId)) {
    const ds = state.datasheets[state.units[half]?.datasheetId]
    for (const id of ds?.abilities ?? []) if (state.abilities[id]?.code === code) out.push(state.abilities[id])
  }
  return out
}

function anyHalfHasKeyword(state: GameState, unitId: UnitId, keyword: string): boolean {
  return leaderService.halves(state, unitId).some((id) => keywordsOf(state, id).includes(keyword))
}

// ---------- Doctrina Imperatives ----------
interface StoredImperative { round: number; choice: Imperative }

// the imperative `player` chose for the current battle round (null before the pick, or when the stored one is from an earlier round)
export function activeImperative(state: GameState, player: PlayerId): Imperative | null {
  const stored = state.players[player].secondaryState[IMPERATIVE_KEY] as StoredImperative | undefined
  return stored && stored.round === state.round ? stored.choice : null
}

// the unit's OWN datasheet carries the Doctrina abilities (Skand's does not, even while he leads a Vanguard squad)
function hasDoctrinaUnit(state: GameState, player: PlayerId): boolean {
  return Object.values(state.units).some((u) => u.player === player && u.location !== 'destroyed'
    && (state.datasheets[u.datasheetId]?.abilities ?? []).some((id) => state.abilities[id]?.code === 'doctrinaImperatives'))
}

// ADM-2.4: at least one model of the unit (attached halves included) is at least partly inside the player's deployment zone
function unitInZone(state: GameState, unitId: UnitId, zonePlayer: PlayerId): boolean {
  const zone = deploymentZone(state, zonePlayer)
  return boardModelsOfUnit(state, unitId).some((m) => partlyWithinPolygon(m, zone))
}

function doctrinaGate(state: GameState, holder: Unit, entry: HookSourceEntry, data?: Record<string, unknown>): boolean {
  const imperative = entry.params.imperative as Imperative | undefined
  if (!imperative) return false // the army-rule marker has no effect of its own
  if (activeImperative(state, holder.player) !== imperative) return false
  const zone = entry.params.zone as string | undefined
  if (!zone) return true
  const attack = data?.attack as { targetUnitId: UnitId } | null | undefined
  if (!attack) return false // no attack context (a plain weapon-profile preview): never modified
  if (zone === 'holderInOwnZone') {
    return leaderService.sameUnit(state, attack.targetUnitId, holder.id) && unitInZone(state, holder.id, holder.player)
  }
  if (zone === 'targetInEnemyZone') return unitInZone(state, attack.targetUnitId, other(holder.player))
  return false
}

function doctrinaOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  for (const player of [s.firstPlayer, other(s.firstPlayer)] as PlayerId[]) {
    const mark = `pick:doctrina:${s.round}:${player}`
    if (s.phaseState.marks.includes(mark)) continue
    if (!hasDoctrinaUnit(s, player)) continue
    s.phaseState.marks.push(mark)
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: false,
      context: { topic: 'abilityChoice', unitId: null, abilityId: s.abilities[DOCTRINA_ABILITY] ? DOCTRINA_ABILITY : null, data: { window, key, code: 'doctrinaImperatives' } },
      options: [
        { id: 'protector', label: 'Protector Imperative', action: { type: 'chooseOption', player, decisionId: '', optionId: 'protector' } },
        { id: 'conqueror', label: 'Conqueror Imperative', action: { type: 'chooseOption', player, decisionId: '', optionId: 'conqueror' } },
      ],
    })
    return true
  }
  return false
}

function doctrinaHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Doctrina Imperatives expects chooseOption' }
  if (action.optionId !== 'protector' && action.optionId !== 'conqueror') return { code: 'E_NOT_AN_OPTION', reason: 'pick the Protector or the Conqueror imperative' }
  const s = ctx.state
  const choice: Imperative = action.optionId
  s.players[pending.player].secondaryState[IMPERATIVE_KEY] = { round: s.round, choice } satisfies StoredImperative
  ctx.emit({
    type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? DOCTRINA_ABILITY, sourceUnitId: null, targetUnitId: null, player: pending.player,
    summary: `Doctrina Imperatives: ${choice === 'protector' ? 'Protector' : 'Conqueror'} this round`,
  })
}

// ---------- Line-breakers (ADM-6.3, 6.5) ----------
const LB_START = 'lb:start:'
const LB_DONE = 'lb:done:'

function lineBreakersParams(state: GameState, unitId: UnitId): { keyword: string; within: number; bonus: number; threshold: number } | null {
  const a = abilitiesWithCode(state, unitId, 'lineBreakers')[0]
  if (!a) return null
  const p = a.params ?? {}
  return {
    keyword: (p.keyword as string | undefined) ?? 'BATTLELINE', within: (p.within as number | undefined) ?? 6,
    bonus: (p.bonus as number | undefined) ?? 2, threshold: (p.threshold as number | undefined) ?? 4,
  }
}

function enemiesInEngagement(state: GameState, unitId: UnitId): UnitId[] {
  const out: UnitId[] = []
  for (const e of canonicalBoardUnits(state, other(state.units[unitId].player))) {
    if (leaderService.unitsInEngagement(state, unitId, e.id)) out.push(e.id)
  }
  return out
}

// ADM-6.5: was some surviving model of the charging unit, standing where it started the Charge move, within `within` of another
// friendly `keyword` unit? No recorded start (a Heroic Intervention charge) means no bonus.
function startedNearBattleline(state: GameState, unitId: UnitId): boolean {
  const mark = state.phaseState.marks.find((m) => m.startsWith(`${LB_START}${unitId}:`))
  const p = lineBreakersParams(state, unitId)
  if (!mark || !p) return false
  let starts: Record<string, [number, number, number]>
  try { starts = Object.fromEntries((JSON.parse(mark.slice(`${LB_START}${unitId}:`.length)) as [string, number, number, number][]).map(([id, x, y, z]) => [id, [x, y, z]])) } catch { return false }
  const mine = boardModelsOfUnit(state, unitId).filter((m) => starts[m.id]).map((m) => ({ ...m, pos: { x: starts[m.id][0], y: starts[m.id][1], z: starts[m.id][2] } }))
  if (mine.length === 0) return false
  const player = state.units[unitId].player
  for (const o of canonicalBoardUnits(state, player)) {
    if (leaderService.sameUnit(state, o.id, unitId)) continue
    if (!leaderService.halves(state, o.id).some((h) => keywordsOf(state, h).includes(p.keyword))) continue
    if (!leaderService.halves(state, o.id).some((h) => state.datasheets[state.units[h]?.datasheetId]?.factionKeywords.includes('ADEPTUS MECHANICUS'))) continue
    for (const a of mine) for (const b of boardModelsOfUnit(state, o.id)) if (distance(a, b) <= p.within + 1e-6) return true
  }
  return false
}

function resolveLineBreakers(ctx: EngineContext, holderId: UnitId, enemyId: UnitId): void {
  const s = ctx.state
  const params = lineBreakersParams(s, holderId)
  const holder = s.units[holderId]
  if (!params || !holder) return
  const near = startedNearBattleline(s, holderId)
  const enemyModels = boardModelsOfUnit(s, enemyId)
  const n = boardModelsOfUnit(s, holderId).filter((m) => enemyModels.some((t) => withinEngagementRange(m, t))).length
  if (n === 0) return
  const roll = ctx.roll({ purpose: 'ability', player: holder.player, count: n, sides: 6, mode: 'perDie', unitId: holderId, targetUnitId: enemyId, commandRerollable: false })
  const bonus = near ? params.bonus : 0
  const hits = roll.final.filter((d) => d + bonus >= params.threshold).length
  const abilityId = abilitiesWithCode(s, holderId, 'lineBreakers')[0].id
  ctx.emit({
    type: 'AbilityTriggered', abilityId, sourceUnitId: holderId, targetUnitId: enemyId, player: holder.player,
    summary: `Line-breakers: ${n} dice${near ? ' (+2)' : ''}, ${hits} mortal wound${hits === 1 ? '' : 's'} on ${s.units[enemyId].name}`,
  })
  if (hits > 0) ctx.services.attack.queueMortalWounds(ctx, enemyId, hits, abilityId, false, mortalCredit(s, holderId))
}

function lineBreakersOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const unit = s.units[key]
  if (!unit || unit.location !== 'board') return false
  if (!abilitiesWithCode(s, unit.id, 'lineBreakers').length) return false
  const id = canon(s, unit.id)
  const marks = s.phaseState.marks
  if (window === 'charge.moveStarted') {
    // record where every model stands before the Charge move (and before Fire Overwatch); the BATTLELINE test itself runs at
    // charge.moveEnded over the survivors (ADM-6.5)
    if (!marks.some((m) => m.startsWith(`${LB_START}${id}:`))) {
      const snap = boardModelsOfUnit(s, id).map((m) => [m.id, m.pos.x, m.pos.y, m.pos.z])
      marks.push(`${LB_START}${id}:${JSON.stringify(snap)}`)
    }
    return false
  }
  if (marks.includes(`${LB_DONE}${id}`)) return false
  marks.push(`${LB_DONE}${id}`)
  const candidates = enemiesInEngagement(s, id)
  if (candidates.length === 0) return false
  if (candidates.length === 1) { resolveLineBreakers(ctx, id, candidates[0]); return false }
  const player = unit.player
  const abilityId = abilitiesWithCode(s, id, 'lineBreakers')[0].id
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: id, abilityId, data: { window, key, code: 'lineBreakers' } },
    options: candidates.map((e) => ({
      id: e, label: s.units[e].name, action: { type: 'chooseOption' as const, player, decisionId: '', optionId: e }, hint: { unitId: e },
    })),
  })
  return true
}

function lineBreakersHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Line-breakers expects chooseOption' }
  const holderId = pending.context.unitId
  if (!holderId || !ctx.state.units[holderId]) return { code: 'E_INVALID_TARGET', reason: 'Line-breakers: the charging unit is gone' }
  if (!enemiesInEngagement(ctx.state, holderId).includes(action.optionId)) return { code: 'E_INVALID_TARGET', reason: 'pick an enemy unit within Engagement Range' }
  resolveLineBreakers(ctx, holderId, action.optionId)
}

// ---------- Prescribed Excoriation (ADM-4.2) ----------
// 5 VP when no enemy unit is within 6" of the owner's deployment zone, else 3 VP when none is inside it, else 0
// (Battle-shocked enemy units ignored; battlefield units only).
export function prescribedExcoriationAmount(state: GameState, rule: ScoringRule, pid: PlayerId): number {
  const zone = deploymentZone(state, pid)
  const nearInches = (rule.params?.nearInches as number | undefined) ?? 6
  const nearPoints = (rule.params?.nearPoints as number | undefined) ?? 5
  const grown = growConvexPolygon(zone, nearInches)
  let near = false
  for (const u of canonicalBoardUnits(state, other(pid))) {
    if (leaderService.halves(state, u.id).some((h) => state.units[h]?.battleShocked)) continue
    const models = boardModelsOfUnit(state, u.id)
    if (models.some((m) => partlyWithinPolygon(m, zone))) return 0
    if (models.some((m) => partlyWithinPolygon(m, grown))) near = true
  }
  return near ? rule.pointsPer : nearPoints
}

// ---------- Maniple Verask-Alpha (docs/spec/factions/adeptus-mechanicus--maniple-verask-alpha.md §7) ----------
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

// "not destroyed" = on the battlefield (embarked units stay 'board') with a live model; Reserves count as destroyed at the end
function standing(state: GameState, unitId: UnitId | undefined): boolean {
  const u = unitId ? state.units[unitId] : undefined
  return !!u && u.location === 'board' && u.models.length > 0
}

// ---- Explorator Acquisition (MVA-4.1): from round 2, end of own Command phase, D6 + controlled markers >= 7 scores 4 VP (cap 12) ----
export function exploratorAcquisitionAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, holds: (id: string) => boolean): number {
  const s = ctx.state
  if ((s.players[pid].vpBySource[rule.id] ?? 0) >= rule.cap) return 0 // no meaningless dice once the secondary is maxed
  const n = Object.values(s.objectives).filter((o) => !o.removed && holds(o.id)).length
  const roll = ctx.roll({ purpose: 'mission', player: pid, sides: 6, count: 1, mode: 'sum', commandRerollable: false })
  const total = roll.final.reduce((a, b) => a + b, 0) + n
  return total >= ((rule.params?.threshold as number | undefined) ?? 7) ? rule.pointsPer : 0
}

// ---- Holy Apparatus (MVA-4.2): at battle end 4 VP for a live WARLORD, 4 / 2 VP for a live (Below Half-strength) Dunecrawler ----
export function mvaHolyApparatusAmount(state: GameState, rule: ScoringRule, pid: PlayerId): number {
  const params = rule.params ?? {}
  let total = 0
  if (standing(state, state.players[pid].warlordUnitId)) total += (params.warlordPoints as number | undefined) ?? 4
  const keyword = (params.keyword as string | undefined) ?? 'ONAGER DUNECRAWLER'
  const crawler = Object.values(state.units).find((u) => u.player === pid && keywordsOf(state, u.id).includes(keyword))
  if (crawler && standing(state, crawler.id)) {
    total += leaderService.isBelowHalfStrength(state, crawler.id) ? ((params.belowHalfPoints as number | undefined) ?? 2) : ((params.fullPoints as number | undefined) ?? 4)
  }
  return total
}

// ---- Imperative Surge-wafer (MVA-3.2): once per battle, when the bearer's unit is selected to shoot (or to fire Overwatch) ----
const SURGE_CODE = 'imperativeSurgeWafer'

function surgeAbility(state: GameState, canonicalId: UnitId): RuntimeAbility | undefined {
  const halves = leaderService.halves(state, canonicalId)
  return Object.values(state.abilities).find((a) => a.source === 'enhancement' && a.code === SURGE_CODE && !!a.bearerModelId
    && halves.some((h) => state.units[h]?.models.includes(a.bearerModelId as string)))
}

export function imperativeSurgeOffer(ctx: EngineContext, window: TimingWindowId, key: string, overwatch = false): boolean {
  const s = ctx.state
  const canonicalId = canon(s, key)
  const unit = s.units[canonicalId]
  if (!unit || unit.location !== 'board') return false
  if (overwatch) {
    if (unit.player === s.activePlayer) return false
  } else if (window !== 'shooting.unitSelected' || s.phase !== 'shooting' || unit.player !== s.activePlayer) return false
  const ability = surgeAbility(s, canonicalId)
  if (!ability) return false
  const player = unit.player
  if (s.players[player].oncePerBattleUsed.includes(ability.id)) return false
  const mark = `pick:surge:${canonicalId}`
  if (s.phaseState.marks.includes(mark)) return false
  s.phaseState.marks.push(mark)
  ctx.decide({
    kind: 'chooseOption', player, window, canPass: false,
    // an Overwatch offer carries no window/key: answering it must not re-run the Shooting-phase pick offers
    context: { topic: 'abilityChoice', unitId: canonicalId, abilityId: ability.id, data: overwatch ? { code: SURGE_CODE, overwatch: true } : { window, key, code: SURGE_CODE } },
    options: [
      { id: 'use', label: 'Activate the Imperative Surge-wafer (Precision this phase)', action: optionAction(player, 'use'), hint: { unitId: canonicalId, priority: 1 } },
      { id: 'decline', label: 'Keep it for later', action: optionAction(player, 'decline') },
    ],
  })
  return true
}

function imperativeSurgeHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Imperative Surge-wafer expects chooseOption')
  if (action.optionId === 'decline') return
  if (action.optionId !== 'use') return notAnOption('Imperative Surge-wafer: use or decline')
  const s = ctx.state
  const unitId = pending.context.unitId
  const abilityId = pending.context.abilityId
  const unit = unitId ? s.units[unitId] : undefined
  const ability = abilityId ? s.abilities[abilityId] : undefined
  if (!unit || !abilityId || !ability) return notAnOption('Imperative Surge-wafer: the bearer or the enhancement is missing')
  const used = s.players[unit.player].oncePerBattleUsed
  if (used.includes(abilityId)) return { code: 'E_STRATAGEM_USED', reason: 'the Imperative Surge-wafer was already used this battle' }
  used.push(abilityId)
  const grant = (ability.params?.grant ?? { when: { weaponType: 'ranged' }, grantWeaponAbility: { ability: 'PRECISION' } }) as Effect
  ctx.services.effects.grant(ctx, unit.id, [grant], { sourceAbilityId: abilityId, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null })
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: unit.id, targetUnitId: null, summary: 'Imperative Surge-wafer: ranged weapons gain Precision this phase', player: unit.player })
}

// Called by the Movement / Charge Overwatch drains while an Overwatch sequence is running, before its attacks are resolved (the
// Psionic Phantoms step pattern). 'pending' while the use / decline decision is open. The per-phase `pick:surge:` mark keeps it to one offer.
export function surgeOverwatchStep(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  const attack = s.phaseState.attack
  if (s.pending || !attack || !attack.overwatch) return 'done'
  return imperativeSurgeOffer(ctx, 'shooting.unitSelected', attack.attackerUnitId, true) ? 'pending' : 'done'
}

// ---- Omnissiah's Blessing (MVA-6.2): own Command phase, heal D3 on a wounded friendly ADEPTUS MECHANICUS model within 3" ----
const BLESSING_CODE = 'omnissiahsBlessing'

function blessingCandidates(state: GameState, holder: Unit, factionKeyword: string, within: number): Model[] {
  const bearer = unitModels(state, holder.id)[0]
  if (!bearer) return []
  const out: Model[] = []
  for (const u of canonicalBoardUnits(state, holder.player)) {
    for (const h of boardHalves(state, u.id)) {
      if (!state.datasheets[state.units[h].datasheetId]?.factionKeywords.includes(factionKeyword)) continue
      for (const m of unitModels(state, h)) {
        if (m.woundsRemaining >= modelStats(state, m).W) continue
        if (m.id === bearer.id || distance(bearer, m) <= within + 1e-6) out.push(m)
      }
    }
  }
  return out.sort((a, b) => (modelStats(state, b).W - b.woundsRemaining) - (modelStats(state, a).W - a.woundsRemaining)
    || modelStats(state, b).W - modelStats(state, a).W || (a.id < b.id ? -1 : 1))
}

function blessingOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean {
  const s = ctx.state
  const player = s.activePlayer
  for (const holder of Object.values(s.units).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (holder.player !== player || holder.location !== 'board' || holder.models.length === 0) continue
    const ability = (s.datasheets[holder.datasheetId]?.abilities ?? []).map((id) => s.abilities[id]).find((a) => a?.code === BLESSING_CODE)
    if (!ability) continue
    const mark = `pick:blessing:${holder.id}`
    if (s.phaseState.marks.includes(mark)) continue
    const params = ability.params ?? {}
    const candidates = blessingCandidates(s, holder, (params.factionKeyword as string | undefined) ?? 'ADEPTUS MECHANICUS', (params.within as number | undefined) ?? 3)
    if (candidates.length === 0) continue
    s.phaseState.marks.push(mark)
    ctx.decide({
      kind: 'chooseOption', player, window, canPass: true,
      context: { topic: 'abilityChoice', unitId: holder.id, abilityId: ability.id, data: { window, key, code: BLESSING_CODE } },
      options: [
        ...candidates.map((m) => ({
          id: m.id, label: `${s.units[m.unitId].name} - ${m.datasheetModelId} (${m.woundsRemaining}/${modelStats(s, m).W})`,
          action: optionAction(player, m.id), hint: { unitId: m.unitId },
        })),
        { id: 'decline', label: 'Decline the blessing', action: optionAction(player, 'decline') },
      ],
    })
    return true
  }
  return false
}

function blessingHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type === 'pass') return // canPass offers 'pass' as a legal action: it is the same as declining (tyranids.ts does likewise)
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption("Omnissiah's Blessing expects chooseOption")
  if (action.optionId === 'decline') return
  const s = ctx.state
  const holder = s.units[pending.context.unitId ?? '']
  const abilityId = pending.context.abilityId
  const ability = abilityId ? s.abilities[abilityId] : undefined
  if (!holder || holder.location !== 'board' || !abilityId || !ability) return notAnOption("Omnissiah's Blessing: the Enginseer is no longer on the battlefield")
  const params = ability.params ?? {}
  const candidates = blessingCandidates(s, holder, (params.factionKeyword as string | undefined) ?? 'ADEPTUS MECHANICUS', (params.within as number | undefined) ?? 3)
  const model = candidates.find((m) => m.id === action.optionId)
  if (!model) return { code: 'E_INVALID_TARGET', reason: 'pick a wounded friendly ADEPTUS MECHANICUS model within 3" of the Enginseer' }
  const blessedMark = `blessed:${model.id}`
  if (s.phaseState.marks.includes(blessedMark)) return { code: 'E_STRATAGEM_USED', reason: 'that model was already blessed this Command phase' }
  const rolled = ctx.rollExpr('D3', { purpose: 'ability', player: holder.player, unitId: holder.id }).total
  const gain = Math.max(0, Math.min(rolled, modelStats(s, model).W - model.woundsRemaining))
  model.woundsRemaining += gain
  s.phaseState.marks.push(blessedMark)
  ctx.emit({ type: 'WoundsRegained', unitId: model.unitId, modelId: model.id, amount: gain, source: abilityId, player: holder.player })
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holder.id, targetUnitId: model.unitId, summary: `Omnissiah's Blessing: ${s.units[model.unitId].name} regains ${gain} wound${gain === 1 ? '' : 's'}`, player: holder.player })
}

// ---- Retribution Codes (MVA-5.1): Payment in Kind's death-reaction shape, keyword ADEPTUS MECHANICUS ----
export function retributionCodesCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const req = pendingDeathReaction(env.state)
  if (!req || req.unitId !== t.ids[0] || req.player !== env.player) return false
  // The target filter keeps every destroyed half of an attached pair, so a dead Verask would let a dying Ranger through. Check the dead
  // model's own unit (that half only, never the attached pair) for the stratagem's filter keyword.
  const kw = (env.stratagem.targets?.[0]?.filter as { keyword?: string } | undefined)?.keyword ?? 'TECH-PRIEST'
  return !!env.state.units[req.unitId] && keywordsOf(env.state, req.unitId).includes(kw)
}

export function retributionCodesApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const req = pendingDeathReaction(s)
  if (!req || req.unitId !== t.ids[0]) return
  const attacker = leaderService.canonicalUnitId(s, req.attackerUnitId)
  for (const h of leaderService.halves(s, attacker)) {
    if (!s.units[h] || s.units[h].location === 'destroyed') continue
    ctx.services.effects.grant(ctx, h, [{ reroll: 'ones' }], {
      sourceAbilityId: env.stratagem.id, sourceUnitId: null, scope: { who: 'attacker' }, duration: 'battle', when: { attackerKeyword: 'ADEPTUS MECHANICUS' },
    })
  }
  ctx.emit({ type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: req.unitId, targetUnitId: attacker, summary: 'Retribution Codes: the killer is marked, ADEPTUS MECHANICUS hit rolls of 1 against it are re-rolled', player: env.player })
  consumeDeathReaction(s, req.modelId)
}

// ---------- registry ----------
export function adeptusMechanicusHooks(): Record<string, EngineCodeHook> {
  const doctrinaImperatives: EngineCodeHook = {
    name: 'doctrinaImperatives', kind: 'ability', hook: 'onStatQuery', run: noop,
    gate: doctrinaGate,
    pick: { window: 'round.start', topic: 'abilityChoice', offer: doctrinaOffer, handle: doctrinaHandle },
  }

  // Rad-saturation: the declarative -1 OC (scope enemy within 3") must not touch VEHICLE units. Static keywords on purpose:
  // hookService.keywordsFor runs an onStatQuery pass itself and would re-enter this gate.
  const radSaturation: EngineCodeHook = {
    name: 'radSaturation', kind: 'ability', hook: 'onStatQuery', run: noop,
    gate(state, holder, entry, data) {
      if (holder.location !== 'board' || !data || data.stat !== 'OC') return false
      const queryUnitId = data.queryUnitId as UnitId | undefined
      if (!queryUnitId) return false
      const excluded = (entry.params.excludeKeyword as string | undefined) ?? 'VEHICLE'
      return !anyHalfHasKeyword(state, queryUnitId, excluded)
    },
  }

  const lineBreakers: EngineCodeHook = {
    name: 'lineBreakers', kind: 'ability', hook: 'onCharge', run: noop,
    pick: { window: 'charge.moveStarted', windows: ['charge.moveEnded'], topic: 'abilityChoice', offer: lineBreakersOffer, handle: lineBreakersHandle },
  }

  // Optimised Efficiency: only the unit that has just ended a Fall Back move (the effect itself is declarative)
  const justFellBack: EngineCodeHook = {
    name: 'justFellBack', kind: 'stratagem', hook: 'onMove', run: noop,
    check(env: StratagemEnv, t: StratagemTuple) {
      const { state } = env
      const triggerUnit = env.trigger.unitId
      if (!triggerUnit || !state.units[t.ids[0]] || !leaderService.sameUnit(state, t.ids[0], triggerUnit)) return false
      return leaderService.halves(state, t.ids[0]).some((h) => state.units[h]?.turn.moveType === 'fallBack')
    },
  }

  // Targeted Purge: Ethereal Edict's machinery with an exclusion list; the picks and the 12 VP share secondaryState['tau:edict']
  const targetedPurgePick: EngineCodeHook = { name: 'targetedPurgePick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerEdict }
  const targetedPurgeScore: EngineCodeHook = { name: 'targetedPurgeScore', kind: 'mission', hook: 'onPhaseEnd', run: noop }
  const prescribedExcoriation: EngineCodeHook = { name: 'prescribedExcoriation', kind: 'mission', hook: 'onTurnEnd', run: noop }

  // ---- Maniple Verask-Alpha ----
  const imperativeSurgeWafer: EngineCodeHook = {
    name: 'imperativeSurgeWafer', kind: 'ability', hook: 'onUnitSelectedToShoot', run: noop,
    pick: { window: 'shooting.unitSelected', topic: 'abilityChoice', offer: (ctx, w, k) => imperativeSurgeOffer(ctx, w, k, false), handle: imperativeSurgeHandle },
  }
  const exploratorAcquisition: EngineCodeHook = { name: 'exploratorAcquisition', kind: 'mission', hook: 'onPhaseEnd', run: noop }
  const mvaHolyApparatus: EngineCodeHook = { name: 'mvaHolyApparatus', kind: 'mission', hook: 'onPhaseEnd', run: noop }
  const retributionCodes: EngineCodeHook = {
    name: 'retributionCodes', kind: 'stratagem', hook: 'onModelDestroyed', hooks: ['onHitRoll'], run: noop,
    // the re-roll is granted to the killer's unit by `apply`, not to the destroyed target
    grantsItself: true, check: retributionCodesCheck, apply: retributionCodesApply,
  }
  // generic "X or Y unit" target gate: the TargetSpec filter takes one keyword, params.keywords lists the accepted ones
  const keywordAnyOf: EngineCodeHook = {
    name: 'keywordAnyOf', kind: 'stratagem', hook: 'onTargetsDeclared', run: noop,
    check(env, t) {
      const kws = (env.stratagem.params?.keywords as string[] | undefined) ?? []
      return leaderService.halves(env.state, t.ids[0]).some((h) => !!env.state.units[h] && hookService.keywordsFor(env.state, h).some((k) => kws.includes(k)))
    },
  }
  // Enginseer: Lone Operative while not leading a unit and within 3" of a friendly ADEPTUS MECHANICUS VEHICLE (checked live)
  const enginseerLoneOperative: EngineCodeHook = {
    name: 'enginseerLoneOperative', kind: 'ability', hook: 'onStatQuery', run: noop,
    grantsCoreAbility(state, entry, unitId) {
      if (unitId !== entry.holderUnitId || state.units[unitId]?.location !== 'board' || leaderService.isAttached(state, unitId)) return []
      const p = entry.params
      return friendlyKeywordWithin(state, unitId, (p.keyword as string | undefined) ?? 'VEHICLE', (p.within as number | undefined) ?? 3, p.factionKeyword as string | undefined) ? ['LONE_OPERATIVE'] : []
    },
  }
  const omnissiahsBlessing: EngineCodeHook = {
    name: 'omnissiahsBlessing', kind: 'ability', hook: 'onCommandPhase', run: noop,
    pick: { window: 'command.start', topic: 'abilityChoice', offer: blessingOffer, handle: blessingHandle },
  }

  return {
    doctrinaImperatives, radSaturation, lineBreakers, justFellBack, targetedPurgePick, targetedPurgeScore, prescribedExcoriation,
    imperativeSurgeWafer, exploratorAcquisition, mvaHolyApparatus, retributionCodes, keywordAnyOf, enginseerLoneOperative, omnissiahsBlessing,
  }
}
