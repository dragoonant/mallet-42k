// Deathwatch code hooks (docs/spec/factions/deathwatch.md section 7, DEA-*): Special-Issue Ammunition, Deathwatch Teleportarium,
// Narthecium, Hunters' Insight and Head-taker Doctrine. code-hooks.ts spreads `deathwatchHooks`; the two secondaries' scoring
// bodies are called from missions.ts (customAmount / modelDestroyed fan-out / runPick).
// Everything else on the datasheets (Target Priority, Close-quarters Firepower, Aegis Vigilate, Aliens' Bane, Veteran Instincts,
// Oath of Moment) is declarative data.
import type { ScoringRule, TimingWindowId } from '../../data/types'
import type { Action } from '../actions'
import type { EngineCodeHook } from '../code-hooks'
import { pointInPolygon } from '../geometry'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import { deploymentZone, hasKeyword, keywordsOf, modelStats } from '../state'
import { isTeleporting, removeUnitToReserves } from '../teleport'
import type { GameState, Model, ObjectiveId, PendingDecision, PlayerId, Rejection, Unit, UnitId } from '../types'
import { findReturnSpot, returnModel } from './necrons'

const noop = () => undefined
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })
const ASTARTES = 'ADEPTUS ASTARTES'

type Effect = Parameters<EngineContext['services']['effects']['grant']>[2]

function canon(s: GameState, id: UnitId): UnitId { return leaderService.canonicalUnitId(s, id) }

function boardHalves(s: GameState, id: UnitId): UnitId[] {
  return leaderService.halves(s, canon(s, id)).filter((h) => s.units[h]?.location === 'board' && s.units[h].models.length > 0)
}

// ---------- Special-Issue Ammunition (DEA-5.2) ----------
// The stratagem has no declarative effect: using it raises a choice between set A and set B, and the answer grants the set
// (params.sets[option]) to every half of the target unit until the end of the phase.
const SIA_CODE = 'specialIssueAmmunition'

function enemyBigVisible(s: GameState, player: PlayerId): boolean {
  return Object.values(s.units).some((u) => u.player !== player && u.location === 'board' && u.models.length > 0
    && (hasKeyword(s, u.id, 'MONSTER') || hasKeyword(s, u.id, 'VEHICLE')))
}

const specialIssueAmmunition: EngineCodeHook = {
  name: SIA_CODE, kind: 'stratagem', hook: 'onUnitSelectedToShoot', run: noop,
  check(env, t) {
    const u = env.state.units[t.ids[0]]
    return !!u && u.location === 'board' && u.models.length > 0
  },
  apply(ctx, env, t) {
    const s = ctx.state
    const unitId = canon(s, t.ids[0])
    const aBig = enemyBigVisible(s, env.player)
    ctx.decide({
      kind: 'chooseOption', player: env.player, window: env.window, canPass: false,
      context: { topic: 'abilityChoice', unitId, abilityId: env.stratagem.id, data: { code: SIA_CODE, stratagemId: env.stratagem.id, unitId } },
      options: [
        { id: 'A', label: 'Special-Issue Ammunition: Anti-Monster 5+, Anti-Vehicle 5+, Melta 2', action: optionAction(env.player, 'A'), hint: { priority: aBig ? 2 : 0, unitId } },
        { id: 'B', label: 'Special-Issue Ammunition: Assault, Ignores Cover, Sustained Hits 2', action: optionAction(env.player, 'B'), hint: { priority: aBig ? 0 : 2, unitId } },
      ],
    })
  },
  answer(ctx, action, pending): Rejection | void {
    if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Special-Issue Ammunition expects chooseOption')
    if (action.optionId !== 'A' && action.optionId !== 'B') return notAnOption('Special-Issue Ammunition: pick set A or B')
    const s = ctx.state
    const data = pending.context.data as { stratagemId?: string; unitId?: UnitId }
    const stratagemId = data.stratagemId ?? pending.context.abilityId ?? 'dw.s.special-issue-ammunition'
    const unitId = data.unitId
    if (!unitId || !s.units[unitId]) return notAnOption('Special-Issue Ammunition: the unit is missing')
    const sets = s.stratagems[stratagemId]?.params?.sets as Record<string, Effect> | undefined
    const set = sets?.[action.optionId]
    if (!set) return notAnOption(`Special-Issue Ammunition: set ${action.optionId} is not defined`)
    const halves = leaderService.halves(s, canon(s, unitId)).filter((h) => !!s.units[h] && s.units[h].location !== 'destroyed')
    for (const half of halves) {
      ctx.services.effects.grant(ctx, half, set, {
        sourceAbilityId: stratagemId, sourceUnitId: half, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
      })
    }
    ctx.emit({
      type: 'AbilityTriggered', abilityId: stratagemId, sourceUnitId: unitId, targetUnitId: unitId,
      summary: `Special-Issue Ammunition: ${action.optionId === 'A' ? 'Anti-Monster 5+, Anti-Vehicle 5+ and Melta 2' : 'Assault, Ignores Cover and Sustained Hits 2'} this phase`,
      player: pending.player,
    })
  },
}

// ---------- Deathwatch Teleportarium (DEA-5.3, 5.5) ----------
// Reuses the Teleport Assault removal / arrival path (teleport.ts); the arrival gap and the no-charge rider ride on the record.
const deathwatchTeleportarium: EngineCodeHook = {
  name: 'deathwatchTeleportarium', kind: 'stratagem', hook: 'onPhaseEnd', run: noop,
  check(env, t) {
    const s = env.state
    const id = t.ids[0]
    const u = s.units[id]
    if (!u || u.location !== 'board' || u.models.length === 0) return false
    if (isTeleporting(s, id)) return false
    return !leaderService.inEngagementWithEnemy(s, id)
  },
  apply(ctx, env, t) {
    const gap = (env.stratagem.params?.minEnemyGap as number | undefined) ?? 3
    const id = canon(ctx.state, t.ids[0])
    removeUnitToReserves(ctx, id, env.stratagem.id, { minEnemyGap: gap, forbidChargeOnArrival: true })
    ctx.emit({
      type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: id, targetUnitId: null,
      summary: `Deathwatch Teleportarium: ${ctx.state.units[id]?.name ?? id} is teleported out`, player: env.player,
    })
  },
}

// ---------- Narthecium (DEA-6.2) ----------
const NARTHECIUM_CODE = 'narthecium'

function carriesCode(s: GameState, u: Unit, code: string): string | null {
  const ds = s.datasheets[u.datasheetId]
  return ds?.abilities.find((id) => s.abilities[id]?.code === code) ?? null
}

// one entry per distinct kind of destroyed model (model type + wargear), most recently destroyed first (as Reanimation Protocols)
function returnCandidates(half: Unit): Model[] {
  const seen = new Set<string>()
  const out: Model[] = []
  for (const m of [...(half.destroyedModels ?? [])].reverse()) {
    const key = `${m.datasheetModelId}|${[...m.weapons].sort().join(',')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
  }
  return out
}

function nartheciumTarget(s: GameState, holder: Unit): Unit | null {
  if (!leaderService.isAttached(s, holder.id)) return null
  const bodyguard = holder.bodyguardUnitId ? s.units[holder.bodyguardUnitId] : undefined
  if (!bodyguard || bodyguard.location !== 'board' || bodyguard.models.length === 0) return null
  if (bodyguard.models.length >= bodyguard.startingStrength) return null
  if ((bodyguard.destroyedModels ?? []).length === 0) return null
  return bodyguard
}

const narthecium: EngineCodeHook = {
  name: NARTHECIUM_CODE, kind: 'ability', hook: 'onCommandPhase', run: noop,
  gate: () => false,
  pick: {
    window: 'command.start', topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      const player = s.activePlayer
      for (const holder of Object.values(s.units)) {
        if (holder.player !== player || holder.location !== 'board' || holder.models.length === 0) continue
        const abilityId = carriesCode(s, holder, NARTHECIUM_CODE)
        if (!abilityId) continue
        const mark = `pick:narthecium:${s.round}:${player}:${holder.id}`
        if (s.phaseState.marks.includes(mark)) continue
        const bodyguard = nartheciumTarget(s, holder)
        if (!bodyguard) continue
        const cands = returnCandidates(bodyguard) // only the bodyguard's destroyedModels are read, so a CHARACTER never qualifies
        if (cands.length === 0) continue
        s.phaseState.marks.push(mark)
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'abilityChoice', unitId: bodyguard.id, abilityId, data: { window, key, code: NARTHECIUM_CODE, holderId: holder.id, bodyguardId: bodyguard.id } },
          options: [
            ...cands.map((m) => {
              const guns = m.weapons.map((w) => s.weapons[w]?.name ?? w).join(' + ')
              return {
                id: m.id, label: `Narthecium: return a model armed with ${guns}`, action: optionAction(player, m.id),
                // the model with the most wargear is worth the most
                hint: { priority: 1 + m.weapons.length * 0.2 },
              }
            }),
            { id: 'decline', label: 'Decline', action: optionAction(player, 'decline') },
          ],
        })
        return true
      }
      return false
    },
    handle(ctx, action, pending): Rejection | void {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Narthecium expects chooseOption')
      if (action.optionId === 'decline') return
      const s = ctx.state
      const data = pending.context.data as { bodyguardId?: UnitId; holderId?: UnitId }
      const bodyguard = data.bodyguardId ? s.units[data.bodyguardId] : undefined
      const snapshot = bodyguard?.destroyedModels.find((m) => m.id === action.optionId)
      if (!bodyguard || !snapshot) return notAnOption('that model cannot return')
      const abilityId = pending.context.abilityId ?? 'dw.a.narthecium'
      const pos = bodyguard.location === 'board' ? findReturnSpot(s, bodyguard.id, snapshot) : null
      if (!pos) {
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: data.holderId ?? null, targetUnitId: bodyguard.id, summary: 'Narthecium: no room, nothing returns', player: pending.player })
        return
      }
      const m = returnModel(ctx, bodyguard, snapshot, pos, abilityId)
      m.woundsRemaining = modelStats(s, m).W // returns with its full Wounds (DEA-6.2 [interp])
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: data.holderId ?? null, targetUnitId: bodyguard.id, summary: `Narthecium: a model returns to ${bodyguard.name}`, player: pending.player })
    },
  },
}

// ---------- Hunters' Insight (DEA-4.1, 4.4) ----------
const HI_KEY = 'huntersInsight'

interface HuntersInsightPick { objectiveId: ObjectiveId; round: number }

export function huntersInsightOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string): void {
  const s = ctx.state
  const zone = deploymentZone(s, owner)
  const candidates = Object.values(s.objectives).filter((o) => !o.removed && !pointInPolygon({ x: o.pos.x, z: o.pos.z }, zone))
  if (candidates.length === 0) return
  ctx.decide({
    kind: 'chooseOption', player: owner, window, canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId: 'dw.sec.hunters-insight', data: { window, key, code: 'huntersInsightPick', owner } },
    options: candidates.map((o) => ({ id: o.id, label: `Hunters' Insight: ${o.id}`, action: optionAction(owner, o.id), hint: { objectiveId: o.id } })),
  })
}

function answerHuntersInsight(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption("Hunters' Insight expects chooseOption")
  const s = ctx.state
  const obj = s.objectives[action.optionId]
  if (!obj || obj.removed) return { code: 'E_NOT_AN_OPTION', reason: 'pick an objective marker that is still on the battlefield' }
  const owner = ((pending.context.data as { owner?: PlayerId }).owner ?? pending.player) as PlayerId
  const pick: HuntersInsightPick = { objectiveId: obj.id, round: s.round }
  s.players[owner].secondaryState[HI_KEY] = pick
  ctx.emit({ type: 'AbilityTriggered', abilityId: 'dw.sec.hunters-insight', sourceUnitId: null, targetUnitId: null, summary: `Hunters' Insight: ${obj.id} is marked`, player: owner })
  const w = pending.context.data.window as TimingWindowId | undefined
  const k = pending.context.data.key as string | undefined
  if (w && k !== undefined && !s.pending) ctx.services.missions.onWindow(ctx, w, k)
}

// at the end of the opponent's turn: read and consume the pick; 4 VP if the owner controls the marker and a non-shocked
// ADEPTUS ASTARTES unit of theirs is in range of it
export function huntersInsightAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, controls: (id: ObjectiveId) => boolean): number {
  const s = ctx.state
  const ss = s.players[pid].secondaryState
  const pick = ss[HI_KEY] as HuntersInsightPick | undefined
  if (!pick) return 0
  delete ss[HI_KEY]
  const obj = s.objectives[pick.objectiveId]
  if (!obj || obj.removed || !controls(obj.id)) return 0
  const inRange = ctx.services.objectives.modelsInRange(s, obj.id, pid)
  for (const mid of inRange) {
    const m = s.models[mid]
    const u = m && s.units[m.unitId]
    if (!u || u.player !== pid || u.location !== 'board') continue
    if (!keywordsOf(s, u.id).includes(ASTARTES)) continue
    if (leaderService.halves(s, canon(s, u.id)).some((h) => s.units[h]?.battleShocked)) continue
    return rule.pointsPer
  }
  return 0
}

const huntersInsightPick: EngineCodeHook = { name: 'huntersInsightPick', kind: 'mission', hook: 'onPhaseStart', run: noop, answer: answerHuntersInsight }
const huntersInsightScore: EngineCodeHook = { name: 'huntersInsightScore', kind: 'mission', hook: 'onTurnEnd', run: noop }

// ---------- Head-taker Doctrine (DEA-4.2, 4.3, 4.5) ----------
function rulesFor(s: GameState, pid: PlayerId): ScoringRule[] {
  return [...s.mission.scoring, ...(s.mission.secondaries[pid] ?? [])]
}

// an ADEPTUS ASTARTES unit of the scoring player destroyed an enemy CHARACTER model (kill attribution = the attack's attacker unit)
export function headTakerModelDestroyed(
  ctx: EngineContext,
  info: { unitId: UnitId; modelId: string; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: string | null },
): void {
  const s = ctx.state
  const pid = info.byPlayer
  if (!pid || !info.byUnitId) return
  const rule = rulesFor(s, pid).find((r) => r.rule === 'custom' && r.code === 'headTakerDoctrine' && s.round >= r.rounds.from && s.round <= r.rounds.to)
  if (!rule) return
  const victim = s.units[info.unitId]
  if (!victim || victim.player !== other(pid) || !keywordsOf(s, victim.id).includes('CHARACTER')) return
  if (!leaderService.halves(s, info.byUnitId).some((h) => !!s.units[h] && keywordsOf(s, h).includes(ASTARTES))) return
  const amount = Math.min(rule.pointsPer, rule.cap - (s.players[pid].vpBySource[rule.id] ?? 0))
  if (amount <= 0) return
  const p = s.players[pid]
  p.vp += amount
  p.vpBySource[rule.id] = (p.vpBySource[rule.id] ?? 0) + amount
  ctx.emit({ type: 'VpScored', source: rule.id, amount, total: p.vp, player: pid })
  s.mission.scored.push({ ruleId: rule.id, player: pid, round: s.round, turn: s.activePlayer, amount })
}

// battle end: a further pointsPer if the opponent fielded a CHARACTER and every one of them is destroyed
export function headTakerSweepAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number {
  const characters = Object.values(s.units).filter((u) => u.player === other(pid) && keywordsOf(s, u.id).includes('CHARACTER'))
  if (characters.length === 0) return 0
  return characters.every((u) => u.location === 'destroyed') ? rule.pointsPer : 0
}

const headTakerDoctrine: EngineCodeHook = { name: 'headTakerDoctrine', kind: 'mission', hook: 'onModelDestroyed', run: noop }
const headTakerSweep: EngineCodeHook = { name: 'headTakerSweep', kind: 'mission', hook: 'onPhaseEnd', run: noop }

export const deathwatchHooks: Record<string, EngineCodeHook> = {
  specialIssueAmmunition, deathwatchTeleportarium, narthecium,
  huntersInsightPick, huntersInsightScore, headTakerDoctrine, headTakerSweep,
}
