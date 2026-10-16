// Space Wolves code hooks (docs/spec/factions/space-wolves.md section 7, SPA-*). Tireless Hunter (enhancement), Keen Senses and
// Pack Ambush (stratagems). Registered in code-hooks.ts as `...spaceWolvesHooks`.
//
// Like the other faction files this one reads the attack module's marks (`hitBy:...`) directly instead of importing attack.ts, since
// code-hooks.ts pulls this file in and an import of attack.ts would make module load order matter.
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import type { AttackContext } from '../hooks'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import type { EngineContext } from '../modules'
import type { GameState, PendingDecision, PlayerId, Rejection, UnitId } from '../types'

const noop = () => undefined

const HUNTER_KEY = 'tirelessHunter'
const TIRELESS_CODE = 'tirelessHunter'

const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

// ---------- Tireless Hunter (SPA-3.1) ----------
// The bearer of the enhancement (a live model of the player's army) names one enemy unit when the first battle round begins.
function hunterHolder(s: GameState, player: PlayerId): { abilityId: string; unitId: UnitId } | null {
  for (const a of Object.values(s.abilities)) {
    if (a.source !== 'enhancement' || a.code !== TIRELESS_CODE || !a.bearerModelId) continue
    const m = s.models[a.bearerModelId]
    const u = m ? s.units[m.unitId] : undefined
    if (u && u.player === player && u.location !== 'destroyed') return { abilityId: a.id, unitId: u.id }
  }
  return null
}

const tirelessHunter: EngineCodeHook = {
  name: 'tirelessHunter', kind: 'ability', hook: 'onWoundRoll', run: noop,
  pick: {
    window: 'round.start', topic: 'abilityChoice',
    offer(ctx, window, key) {
      const s = ctx.state
      if (s.round !== 1) return false
      for (const player of ['A', 'B'] as PlayerId[]) {
        const mark = `pick:${HUNTER_KEY}:${player}`
        if (s.phaseState.marks.includes(mark) || s.players[player].secondaryState[HUNTER_KEY]) continue
        const holder = hunterHolder(s, player)
        if (!holder) continue
        s.phaseState.marks.push(mark)
        // one option per enemy canonical unit, on the battlefield or in Reserves (any unit not yet destroyed)
        const options = Object.values(s.units)
          .filter((u) => u.player !== player && u.location !== 'destroyed' && !u.bodyguardUnitId)
          .map((u) => ({ id: u.id, label: `Tireless Hunter: ${u.name}`, action: optionAction(player, u.id), hint: { unitId: u.id } }))
        if (options.length === 0) continue
        ctx.decide({
          kind: 'chooseOption', player, window, canPass: false,
          context: { topic: 'abilityChoice', unitId: holder.unitId, abilityId: holder.abilityId, data: { window, key, code: TIRELESS_CODE } },
          options,
        })
        return true
      }
      return false
    },
    handle(ctx: EngineContext, action: Action, pending: PendingDecision) {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Tireless Hunter expects chooseOption')
      const s = ctx.state
      const target = s.units[action.optionId]
      if (!target || target.player === pending.player || target.location === 'destroyed') {
        return { code: 'E_INVALID_TARGET', reason: 'Tireless Hunter must name an enemy unit that is not destroyed' }
      }
      const canon = leaderService.canonicalUnitId(s, target.id)
      // both halves of an attached unit stay named even if they later separate
      s.players[pending.player].secondaryState[HUNTER_KEY] = { unitIds: leaderService.halves(s, canon) }
      ctx.emit({
        type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? 'sw.e.tireless-hunter', sourceUnitId: pending.context.unitId,
        targetUnitId: canon, summary: `Tireless Hunter: hunting ${s.units[canon]?.name ?? canon}`, player: pending.player,
      })
    },
  },
  // the +1 to wound is only live against the named unit, and only while the bearer is alive (scope 'bearer' limits it to his own attacks)
  gate(state, holder, entry, data) {
    const attack = data?.attack as AttackContext | undefined
    if (!attack || !entry.bearerModelId || !state.models[entry.bearerModelId]) return false
    const named = state.players[holder.player].secondaryState[HUNTER_KEY] as { unitIds?: UnitId[] } | undefined
    if (!named?.unitIds || named.unitIds.length === 0) return false
    return named.unitIds.includes(attack.targetUnitId) || named.unitIds.some((id) => leaderService.sameUnit(state, id, attack.targetUnitId))
  },
}

// ---------- Keen Senses (SPA-5.2) ----------
// The stratagem's re-roll only applies through a code's `hooks` list; onStatQuery stays listed so the IGNORES COVER grant still applies.
const keenSenses: EngineCodeHook = {
  name: 'keenSenses', kind: 'stratagem', hook: 'onHitRoll', run: noop, hooks: ['onHitRoll', 'onStatQuery'],
}

// ---------- Pack Ambush (SPA-5.3) ----------
// phase mark `hitBy:<attacker>:<weaponId>:<target>` (attack.ts C3)
function unitsHitByWeapon(s: GameState, attackerUnitId: UnitId, weaponDataId: string): UnitId[] {
  const prefix = `hitBy:${leaderService.canonicalUnitId(s, attackerUnitId)}:`
  const out: UnitId[] = []
  for (const m of s.phaseState.marks) {
    if (!m.startsWith(prefix)) continue
    const rest = m.slice(prefix.length)
    const cut = rest.indexOf(':')
    if (cut < 0) continue
    const wid = rest.slice(0, cut)
    const target = rest.slice(cut + 1) as UnitId
    const w = s.weapons[wid as keyof GameState['weapons']]
    if ((wid === weaponDataId || w?.profileGroup === weaponDataId || wid.replace('.w.', '.') === weaponDataId) && !out.includes(target)) out.push(target)
  }
  return out
}

function onBoard(s: GameState, canon: UnitId): boolean {
  return leaderService.halves(s, canon).some((id) => s.units[id]?.location === 'board' && s.units[id].models.length > 0)
}

export function packAmbushCheck(env: StratagemEnv, t: StratagemTuple): boolean {
  const s = env.state
  const trig = env.trigger.unitId
  if (!trig) return false
  const reiver = leaderService.canonicalUnitId(s, t.ids[0])
  if (reiver !== leaderService.canonicalUnitId(s, trig)) return false
  const ru = s.units[reiver]
  if (!ru || ru.player !== env.player || !onBoard(s, reiver)) return false
  const enemy = leaderService.canonicalUnitId(s, t.ids[1])
  const eu = s.units[enemy]
  if (!eu || eu.player === env.player || !onBoard(s, enemy)) return false
  const weaponId = (env.stratagem.params?.weaponId as string | undefined) ?? 'sw.w.special-issue-bolt-pistol'
  if (!unitsHitByWeapon(s, reiver, weaponId).includes(enemy)) return false
  // the enemy must not be within Engagement Range of the Reiver Squad (any half of either unit)
  for (const a of leaderService.halves(s, reiver)) {
    for (const b of leaderService.halves(s, enemy)) {
      if (s.units[a]?.location === 'board' && s.units[b]?.location === 'board' && leaderService.unitsInEngagement(s, a, b)) return false
    }
  }
  return true
}

export function packAmbushApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void {
  const s = ctx.state
  const reiver = leaderService.canonicalUnitId(s, t.ids[0])
  const enemy = leaderService.canonicalUnitId(s, t.ids[1])
  const modifier = (env.stratagem.params?.modifier as number | undefined) ?? -2
  ctx.emit({
    type: 'AbilityTriggered', abilityId: env.stratagem.id, sourceUnitId: reiver, targetUnitId: enemy,
    summary: `Battle-shock test (${modifier})`, player: env.player,
  })
  hookService.battleShockTest(ctx, enemy, env.stratagem.id, modifier)
}

const packAmbush: EngineCodeHook = {
  name: 'packAmbush', kind: 'stratagem', hook: 'onPhaseStart', run: noop,
  check: (e, t) => packAmbushCheck(e, t),
  apply: (c, e, t) => packAmbushApply(c, e, t),
}

export const spaceWolvesHooks: Record<string, EngineCodeHook> = { tirelessHunter, keenSenses, packAmbush }
