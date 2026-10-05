// Pure summariser behind the event feed: engine events + state + data bundle -> display lines.
// Attack events are folded into ONE line per (attacker unit, weapon, target unit) per attack sequence,
// with per-step numbers available as `detail`. Everything is derived from the events passed in, so
// feeding only the already-presented events keeps lines in sync with the animation (a group's totals
// simply grow as more of its dice are presented).
import type { DiceRoll, GameEvent, GameState, PlayerId } from '@/engine'
import type { DataBundle } from '@/data/types'
import { ROLL_PURPOSE_LABEL, objectiveLabel, sourceName } from './labels'

export type LineKind = 'header' | 'attack' | 'event'

export interface SummaryLine {
  key: string
  text: string
  /** Attack lines: above/below expectation for the attacker. */
  luck?: 'lucky' | 'unlucky' | 'average'
  /** Per-step numbers for an attack line (expandable in the UI). */
  detail?: string[]
  /** Acting player, for colouring. Null for neutral lines. */
  player: PlayerId | null
  kind: LineKind
  /** Ordering key: the seq of the first event contributing to the line. */
  sortKey: number
}

interface Group {
  key: string
  seq: number
  player: PlayerId
  attackerUnitId: string
  targetUnitId: string
  weaponId: string
  overwatch: boolean
  kind: 'ranged' | 'melee'
  shots: number
  hits: number
  critHits: number
  extraHits: number
  autoHits: number
  wounds: number
  critWounds: number
  autoWounds: number
  saved: number
  failed: number
  unsaved: number // failed with no save available
  cover: number
  fnpIgnored: number
  damage: number
  mortal: number
  slain: number
  expHits: number
  expWounds: number
  expSaved: number
  hitOdds: boolean
  hitDetail: string[]
  woundDetail: string[]
  saveDetail: string[]
}

/** Chance a d6 passes `needed`+ (natural 1 always fails, natural 6 always passes). */
function probOf(needed: number): number {
  return Math.min(5 / 6, Math.max(1 / 6, (7 - needed) / 6))
}
const pct = (p: number): string => `${Math.round(p * 100)}%`

const cap =(s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export function summariseEvents(events: readonly GameEvent[], state: GameState, bundle: DataBundle | null): SummaryLine[] {
  const unit = (id: string | null | undefined): string => (id ? state.units[id]?.name ?? id : '')
  const pname = (id: string | null | undefined): string => (id ? state.players[id as PlayerId]?.name ?? id : 'No one')
  const weaponName = (id: string): string => state.weapons[id]?.name ?? id
  const rolls = new Map<string, DiceRoll>()
  for (const e of events) if (e.type === 'DiceRolled') rolls.set(e.roll.id, e.roll)

  const lines: SummaryLine[] = []
  const push = (e: GameEvent, text: string, player: PlayerId | null = e.player, kind: LineKind = 'event'): void => {
    lines.push({ key: `e:${e.seq}:${lines.length}`, text, player, kind, sortKey: e.seq })
  }

  // attack sequence state, keyed by attacking unit (sequences do not interleave, but be safe)
  const overwatch = new Map<string, boolean>()
  const groups = new Map<string, Group>() // current sequence's groups by `${seqStart}|attacker|weapon|target`
  const seqStart = new Map<string, number>()
  const lastGroupForTarget = new Map<string, Group>() // `${attacker}|${target}` -> group that last dealt damage
  const groupOrder: Group[] = []

  const groupFor = (e: { seq: number; player: PlayerId }, a: { attackerUnitId: string; weaponId: string; targetUnitId: string }): Group => {
    const start = seqStart.get(a.attackerUnitId) ?? 0
    const k = `${start}|${a.attackerUnitId}|${a.weaponId}|${a.targetUnitId}`
    let g = groups.get(k)
    if (!g) {
      g = {
        key: `a:${k}`, seq: e.seq, player: e.player, attackerUnitId: a.attackerUnitId, targetUnitId: a.targetUnitId, weaponId: a.weaponId,
        overwatch: overwatch.get(a.attackerUnitId) ?? false, kind: 'ranged',
        shots: 0, hits: 0, critHits: 0, extraHits: 0, autoHits: 0, wounds: 0, critWounds: 0, autoWounds: 0,
        saved: 0, failed: 0, unsaved: 0, cover: 0, fnpIgnored: 0, damage: 0, mortal: 0, slain: 0,
        expHits: 0, expWounds: 0, expSaved: 0, hitOdds: true, hitDetail: [], woundDetail: [], saveDetail: [],
      }
      groups.set(k, g)
      groupOrder.push(g)
    }
    return g
  }
  const kindOfSeq = new Map<string, 'ranged' | 'melee'>()

  for (const e of events) {
    switch (e.type) {
      case 'RoundStarted':
        push(e, `Round ${e.round}`, null, 'header')
        break
      case 'PhaseStarted':
        push(e, `${cap(e.phase)} phase — ${pname(e.player)}`, e.player, 'header')
        break
      case 'UnitDeployed':
        push(e, `${unit(e.unitId)} ${e.toReserves ? 'held in reserve' : 'deployed'}`)
        break
      case 'ReinforcementsArrived':
        push(e, `${unit(e.unitId)} arrives from reserves`)
        break
      case 'MoveDeclared':
        push(e, `${unit(e.unitId)} makes a ${e.moveType} move`)
        break
      case 'UnitAdvanced':
        push(e, `${unit(e.unitId)} advances (rolled ${e.roll})`)
        break
      case 'UnitFellBack':
        push(e, `${unit(e.unitId)} falls back`)
        break
      case 'DesperateEscapeRolled':
        push(e, `${unit(e.unitId)} desperate escape: rolled ${e.dice.join(', ')} — ${plural(e.casualties, 'model lost', 'models lost')}`)
        break

      case 'AttackSequenceStarted':
        overwatch.set(e.unitId, e.overwatch)
        seqStart.set(e.unitId, e.seq)
        kindOfSeq.set(e.unitId, e.kind)
        break
      case 'HitRolled': {
        const g = groupFor(e, e.attack)
        g.kind = kindOfSeq.get(e.attack.attackerUnitId) ?? g.kind
        g.shots++
        if (e.hit) {
          g.hits++
          if (e.critical) g.critHits++
          if (e.auto) g.autoHits++
        }
        if (e.extraHits > 0) {
          g.extraHits += e.extraHits
          g.hits += e.extraHits
        }
        const skill = state.weapons[e.attack.weaponId]?.skill
        let hp: number | null = null
        if (e.auto) hp = 1
        else if (typeof skill === 'number') hp = probOf(skill - (e.final - e.die))
        if (hp === null) g.hitOdds = false
        else if (!e.auto) g.expHits += hp
        g.hitDetail.push(e.auto ? 'auto-hit' : `${e.die}${e.final !== e.die ? `→${e.final}` : ''}${e.hit ? (e.critical ? ' crit' : ' hit') : ' miss'}${e.extraHits ? ` +${e.extraHits}` : ''}${hp !== null ? ` (${pct(hp)})` : ''}`)
        break
      }
      case 'WoundRolled': {
        const g = groupFor(e, e.attack)
        if (e.wounded) {
          g.wounds++
          if (e.critical) g.critWounds++
          if (e.auto) g.autoWounds++
        }
        if (!e.auto) g.expWounds += probOf(e.needed)
        g.woundDetail.push(e.auto ? 'auto-wound' : `${e.die}${e.final !== e.die ? `→${e.final}` : ''} vs ${e.needed}+${e.wounded ? (e.critical ? ' crit' : ' wound') : ' fail'} (${pct(probOf(e.needed))})`)
        break
      }
      case 'AttackAllocated': {
        if (e.cover) groupFor(e, e.attack).cover++
        break
      }
      case 'SaveRolled': {
        const g = groupFor(e, e.attack)
        if (e.kind === 'none') {
          g.unsaved++
          g.saveDetail.push('no save')
        } else {
          g.expSaved += probOf(e.needed)
          if (e.saved) g.saved++
          else g.failed++
          g.saveDetail.push(`${e.kind === 'invuln' ? 'invuln' : 'armour'} ${e.die}${e.final !== e.die ? `→${e.final}` : ''} vs ${e.needed}+ ${e.saved ? 'saved' : 'failed'} (${pct(probOf(e.needed))})`)
        }
        break
      }
      case 'FeelNoPainRolled': {
        // belongs to whichever group last damaged this unit; fall back to the newest group
        const g = [...groupOrder].reverse().find((x) => x.targetUnitId === e.unitId)
        if (g && e.ignored) {
          g.fnpIgnored++
          g.saveDetail.push(`FNP ${e.die} vs ${e.needed}+ ignored`)
        } else if (g) {
          g.saveDetail.push(`FNP ${e.die} vs ${e.needed}+ failed`)
        }
        break
      }
      case 'DamageApplied': {
        const src = e.source
        if ('attackerUnitId' in src) {
          const g = groupFor(e, src)
          if (e.mortal) g.mortal += e.amount
          else g.damage += e.amount
          lastGroupForTarget.set(`${src.attackerUnitId}|${e.unitId}`, g)
        } else {
          const from = 'abilityId' in src ? ` from ${sourceName(state, bundle, src.abilityId)}` : 'stratagemId' in src ? ` from ${sourceName(state, bundle, src.stratagemId)}` : ''
          push(e, `${unit(e.unitId)} takes ${e.amount}${e.mortal ? ' mortal' : ''} damage${from}`, null)
        }
        break
      }
      case 'ModelDestroyed': {
        const g = e.byUnitId ? lastGroupForTarget.get(`${e.byUnitId}|${e.unitId}`) : undefined
        if (g && (e.kind === 'ranged' || e.kind === 'melee' || e.kind === 'mortal')) g.slain++
        else push(e, `A model of ${unit(e.unitId)} falls${e.byUnitId ? ` to ${unit(e.byUnitId)}` : ''}`, null)
        break
      }
      case 'UnitDestroyed':
        push(e, `${unit(e.unitId)} is wiped out${e.byUnitId ? ` by ${unit(e.byUnitId)}` : ''}`, e.byPlayer ?? null)
        break
      case 'ModelReturned':
        push(e, `A model of ${unit(e.unitId)} claws its way back`, null)
        break
      case 'WoundsRegained':
        push(e, `${unit(e.unitId)} regains ${plural(e.amount, 'wound', 'wounds')} — ${sourceName(state, bundle, e.source)}`, null)
        break
      case 'ModelRemovalDeferred':
        push(e, `A model of ${unit(e.unitId)} refuses to fall yet — it gets one last swing`, null)
        break
      case 'HazardousTested':
        push(e, `Hazardous: ${unit(e.unitId)}'s ${weaponName(e.weaponId)} rolled ${e.die} — ${e.failed ? 'fails, a model is hurt' : 'safe'}`)
        break
      case 'DeadlyDemiseRolled':
        push(e, `Deadly Demise: ${unit(e.unitId)} rolled ${e.die} — ${e.exploded ? `explodes${e.affected.length ? `, hitting ${e.affected.map(unit).join(', ')}` : ''}` : 'no blast'}`, null)
        break
      case 'LeaderDetached':
        push(e, `${unit(e.leaderId)} detaches from ${unit(e.bodyguardId)}`)
        break

      case 'ChargeDeclared':
        push(e, `${unit(e.unitId)} declares a charge against ${e.targetUnitIds.map(unit).join(', ')}`)
        break
      case 'ChargeRolled': {
        const need = e.needed === null ? '' : `, needed ${Math.ceil(e.needed)}`
        const ok = e.needed === null || e.total >= e.needed
        push(e, `${unit(e.unitId)} charge roll: ${e.dice[0]}+${e.dice[1]} = ${e.total}${need}${ok ? ' — success' : ''}`)
        break
      }
      case 'ChargeFailed':
        push(e, `${unit(e.unitId)}'s charge fails`)
        break
      case 'BattleShockTested':
        push(e, `${unit(e.unitId)} battle-shock test: rolled ${e.roll} vs Ld ${e.ld} — ${e.passed ? 'passes' : 'fails'}`)
        break
      case 'BattleShocked':
        push(e, `${unit(e.unitId)} is battle-shocked`)
        break
      case 'BattleShockRecovered':
        push(e, `${unit(e.unitId)} recovers from battle shock`)
        break

      case 'StratagemUsed': {
        const t = e.targets
        const tgt = [...t.unitIds.map(unit), ...(t.objectiveId ? [objectiveLabel(t.objectiveId)] : [])].filter(Boolean).join(', ')
        push(e, `${pname(e.player)} uses ${state.stratagems[e.stratagemId]?.name ?? e.stratagemId} (${e.cost} CP)${tgt ? ` on ${tgt}` : ''}`)
        break
      }
      case 'CpChanged':
        if (e.delta !== 0) push(e, `${pname(e.player)} ${e.delta > 0 ? 'gains' : 'spends'} ${Math.abs(e.delta)} CP — ${sourceName(state, bundle, e.source)} (now ${e.total})`)
        break
      case 'AbilityTriggered':
        push(e, `${e.summary || sourceName(state, bundle, e.abilityId)}`)
        break
      case 'MiracleDieSpent':
        push(e, `${pname(e.player)} spends a Miracle die (${e.value}) — ${e.mode === 'substitute' ? 'substituted' : 'discarded'}`)
        break
      case 'DiceRerolled': {
        const roll = rolls.get(e.rollId)
        const what = roll ? ROLL_PURPOSE_LABEL[roll.purpose] ?? roll.purpose : 'roll'
        const who = roll ? (unit(roll.unitId) || pname(roll.player)) : ''
        const via = e.source === 'commandReroll' ? 'Command Re-roll' : sourceName(state, bundle, e.source)
        push(e, `Re-roll (${via})${who ? ` — ${who}` : ''}, ${what.toLowerCase()}: ${e.before.join(', ')} → ${e.after.join(', ')}`, roll?.player ?? e.player)
        break
      }

      case 'ObjectiveControlChanged': {
        const o = objectiveLabel(e.objectiveId)
        if (e.to) push(e, `${pname(e.to)} takes the ${o}`, e.to)
        else push(e, `${cap(o)} is no longer held${e.from ? ` by ${pname(e.from)}` : ''}`, null)
        break
      }
      case 'ObjectiveSecured':
        push(e, `${pname(e.by)} secures ${objectiveLabel(e.objectiveId)}`, e.by)
        break
      case 'VpScored':
        push(e, `${pname(e.player)} +${e.amount} VP — ${sourceName(state, bundle, e.source)} (total ${e.total})`)
        break
      case 'GameEnded':
        push(e, `Battle ends — ${e.result.winner === 'draw' ? 'a draw' : `${pname(e.result.winner)} wins`}`, null, 'header')
        break
      default:
        break
    }
  }

  for (const g of groupOrder) lines.push(attackLine(g, unit, weaponName))
  lines.sort((a, b) => a.sortKey - b.sortKey)
  return lines
}

function attackLine(g: Group, unit: (id: string) => string, weaponName: (id: string) => string): SummaryLine {
  const shotWord = g.kind === 'melee' ? 'attacks' : 'shots'
  const parts: string[] = []
  parts.push(`${g.shots} ${g.shots === 1 ? shotWord.slice(0, -1) : shotWord}`)
  const hitBits = [g.critHits ? `${g.critHits} crit` : '', g.extraHits ? `${g.extraHits} extra` : '', g.autoHits ? `${g.autoHits} auto` : ''].filter(Boolean)
  const baseHits = g.hits - g.extraHits
  const expH = g.hitOdds && g.shots > 0 ? ` (exp ${g.expHits.toFixed(1)}${g.extraHits ? ' base' : ''})` : ''
  parts.push(`${g.hits} hit${expH}${hitBits.length ? ` (${hitBits.join(', ')})` : ''}`)
  if (g.hits > 0 || g.wounds > 0) {
    const wBits = [g.critWounds ? `${g.critWounds} crit` : '', g.autoWounds ? `${g.autoWounds} auto` : ''].filter(Boolean)
    const expW = g.woundDetail.length ? ` (exp ${g.expWounds.toFixed(1)})` : ''
    parts.push(`${g.wounds} wound${expW}${wBits.length ? ` (${wBits.join(', ')})` : ''}`)
  }
  if (g.saved + g.failed + g.unsaved > 0) {
    const cover = g.cover ? ` (${g.cover} in cover)` : ''
    parts.push(`${g.saved} saved (exp ${g.expSaved.toFixed(1)})${cover}`)
  }
  if (g.fnpIgnored) parts.push(`${g.fnpIgnored} ignored`)
  parts.push(`${g.damage + g.mortal} dmg${g.mortal ? ` (${g.mortal} mortal)` : ''}`)
  parts.push(`${g.slain} slain`)
  const detail: string[] = []
  const luckScore = (g.hitOdds ? baseHits - g.expHits : 0) + (g.woundDetail.length ? g.wounds - g.expWounds : 0) - (g.saved - g.expSaved)
  const luck = luckScore >= 0.75 ? 'lucky' : luckScore <= -0.75 ? 'unlucky' : 'average'
  detail.push(`Luck for the attacker: ${luck} (${luckScore >= 0 ? '+' : ''}${luckScore.toFixed(1)}); odds ignore re-rolls and sustained/lethal extras`)
  if (g.hitDetail.length) detail.push(`Hit: ${g.hitDetail.join(', ')}`)
  if (g.woundDetail.length) detail.push(`Wound: ${g.woundDetail.join(', ')}`)
  if (g.saveDetail.length) detail.push(`Save: ${g.saveDetail.join(', ')}`)
  const ow = g.overwatch ? ' [Overwatch]' : ''
  return {
    key: g.key,
    text: `${unit(g.attackerUnitId)} — ${weaponName(g.weaponId)} → ${unit(g.targetUnitId)}${ow}: ${parts.join(', ')}`,
    detail,
    player: g.player,
    luck,
    kind: 'attack',
    sortKey: g.seq,
  }
}

export interface TurnTotalRow { unitId: string; name: string; player: PlayerId; dealt: number; slain: number; taken: number }

/** Per-unit damage dealt / models slain / damage taken in the most recent turn present in `events`.
 *  Resets automatically because only the newest (round, turn) is counted. */
export function turnTotals(events: readonly GameEvent[], state: GameState): TurnTotalRow[] {
  const last = events[events.length - 1]
  if (!last) return []
  const rows = new Map<string, TurnTotalRow>()
  const row = (id: string): TurnTotalRow => {
    let r = rows.get(id)
    if (!r) {
      r = { unitId: id, name: state.units[id]?.name ?? id, player: (state.units[id]?.player ?? 'A') as PlayerId, dealt: 0, slain: 0, taken: 0 }
      rows.set(id, r)
    }
    return r
  }
  for (const e of events) {
    if (e.round !== last.round || e.turn !== last.turn) continue
    if (e.type === 'DamageApplied') {
      row(e.unitId).taken += e.amount
      if ('attackerUnitId' in e.source) row(e.source.attackerUnitId).dealt += e.amount
    } else if (e.type === 'ModelDestroyed' && e.byUnitId) {
      row(e.byUnitId).slain++
    }
  }
  return [...rows.values()].filter((r) => r.dealt || r.slain || r.taken)
}
