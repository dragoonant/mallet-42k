// Aeldari: The Fatebreakers code hooks (docs/spec/factions/aeldari.md §7, AEL-*). Owner: M10 aeldari hooks stage.
// code-hooks.ts registers them through `aeldariHooks`, a hoisted factory (the module graph is circular: hooks-impl <->
// code-hooks <-> this file, so nothing here may run at import time). Mission amounts (Ineffable Agenda) are plain
// functions called from missions.ts.
//
// The Fate dice pool is the Sororitas Miracle pool (miracle.ts, generalised by E1): Strands of Fate creates it at the
// start of round 1 (pick hook below), Defenders of Fate adds to it (the reused simulacrumImperialis hook), and the
// substitution machinery (miracleGate / miracleHandler) spends it.
import type { Action } from '../actions'
import type { EngineCodeHook, StratagemEnv, StratagemTuple } from '../code-hooks'
import { distance, pointInPolygon, withinObjectiveRange } from '../geometry'
import { hookService, type HookSourceEntry } from '../hooks-impl'
import { leaderService } from '../leaders'
import { setFatePool } from '../miracle'
import type { EngineContext } from '../modules'
import { startReactiveMove } from '../phases/movement'
import { boardUnitsOf, deploymentZone, keywordsOf, unitModels } from '../state'
import { attackService } from '../attack'
import type { GameState, PlayerId, Rejection, TimingWindowId, Unit, UnitId } from '../types'

const noop = () => undefined
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })
const notAnOption = (reason: string): Rejection => ({ code: 'E_NOT_AN_OPTION', reason })

export const AELDARI_KEYWORD = 'AELDARI'
const FATE_DONE = 'ael:fateDone'
const FATE_DRAFT = 'ael:fateDraft'

// ---------- helpers ----------
function canon(s: GameState, id: UnitId): UnitId { return leaderService.canonicalUnitId(s, id) }

function boardHalves(s: GameState, unitId: UnitId): UnitId[] {
  return leaderService.halves(s, unitId).filter((id) => s.units[id]?.location === 'board')
}

function boardModelsOfUnit(s: GameState, unitId: UnitId) {
  return boardHalves(s, unitId).flatMap((id) => unitModels(s, id))
}

function anyHalfHasKeyword(s: GameState, unitId: UnitId, keyword: string): boolean {
  return leaderService.halves(s, unitId).some((id) => hookService.keywordsFor(s, id).includes(keyword))
}

// the id of the first datasheet ability of the unit carrying `code`
function abilityWithCode(s: GameState, unit: Unit, code: string): string | null {
  const ds = s.datasheets[unit.datasheetId]
  for (const id of ds?.abilities ?? []) if (s.abilities[id]?.code === code) return id
  return null
}

// the (canonical) board units of the player, one entry per attached pair
function canonicalBoardUnits(s: GameState, player: PlayerId): Unit[] {
  return boardUnitsOf(s, player).filter((u) => !u.bodyguardUnitId)
}

// the unit's halves have neither shot nor been selected to shoot this phase (the `notYetShot` target state)
function notYetShot(s: GameState, unitId: UnitId): boolean {
  const activated = new Set(s.phaseState.activated)
  const shooter = s.phaseState.attack?.attackerUnitId
  return leaderService.halves(s, unitId).every((h) => !s.units[h].turn.shotThisPhase && !activated.has(h) && h !== shooter)
}

// AELDARI INFANTRY or AELDARI MOUNTED (either half of an attached unit; the Wraithlord is neither)
function infantryOrMounted(s: GameState, unitId: UnitId): boolean {
  return anyHalfHasKeyword(s, unitId, 'INFANTRY') || anyHalfHasKeyword(s, unitId, 'MOUNTED')
}

// ---------- Strands of Fate (AEL-2.1): pool creation at the start of round 1 ----------
function armyHasStrands(s: GameState, player: PlayerId): boolean {
  return Object.values(s.units).some((u) => u.player === player && abilityWithCode(s, u, 'strandsOfFate') !== null)
}

function strandsAbilityId(s: GameState, player: PlayerId): string | null {
  for (const u of Object.values(s.units)) {
    if (u.player !== player) continue
    const id = abilityWithCode(s, u, 'strandsOfFate')
    if (id) return id
  }
  return null
}

// rolls `count` D6 without clobbering phaseState.lastRoll (same care as gainMiracleDie)
function rollFateDice(ctx: EngineContext, player: PlayerId, count: number): number[] {
  const s = ctx.state
  const saved = s.phaseState.lastRoll
  const roll = ctx.roll({ purpose: 'ability', player, sides: 6, count, mode: 'perDie', commandRerollable: false })
  s.phaseState.lastRoll = saved
  return [...roll.final]
}

function finishFatePool(ctx: EngineContext, player: PlayerId, dice: number[]): void {
  const ss = ctx.state.players[player].secondaryState
  const abilityId = strandsAbilityId(ctx.state, player) ?? 'ael.a.strands-of-fate'
  setFatePool(ctx, player, dice, abilityId)
  ss[FATE_DONE] = true
  delete ss[FATE_DRAFT]
  ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: null, summary: `Strands of Fate: ${dice.length} Fate dice (${[...dice].sort((a, b) => b - a).join(' ')})`, player })
}

// ---------- Crewed Platform (AEL-6.4) ----------
function crewedPlatformRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void {
  const s = ctx.state
  const destroyedUnitId = data.destroyedUnitId as UnitId | undefined
  const holder = s.units[entry.holderUnitId]
  if (!holder || !destroyedUnitId || destroyedUnitId !== holder.id) return
  const crew = (entry.params.crewModelId as string | undefined) ?? 'guardian-defender'
  const platform = (entry.params.platformModelId as string | undefined) ?? 'heavy-weapon-platform'
  const models = unitModels(s, holder.id)
  const isKind = (datasheetModelId: string, key: string) => datasheetModelId === key || datasheetModelId.endsWith(`/${key}`)
  if (models.some((m) => isKind(m.datasheetModelId, crew))) return
  const platforms = models.filter((m) => isKind(m.datasheetModelId, platform))
  if (platforms.length === 0) return
  const byUnitId = (data.byUnitId as UnitId | null | undefined) ?? null
  const byModelId = (data.byModelId as string | null | undefined) ?? null
  const player = byUnitId ? (s.units[byUnitId]?.player ?? null) : null
  ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: holder.id, targetUnitId: null, summary: 'Crewed Platform: the last Guardian has fallen, the platform is lost', player: holder.player })
  for (const m of platforms) {
    if (!s.models[m.id]) continue
    attackService.destroyModel(ctx, m.id, { player, unitId: byUnitId, modelId: byModelId, kind: 'other' })
  }
}

// ---------- secondaries (called from missions.ts) ----------
// AEL-4 Ineffable Agenda: pointsPer (flat, once per turn) when the player controls at least one objective marker outside its own
// deployment zone that it did not control when the turn began
export function ineffableAgendaAmount(
  ctx: EngineContext, rule: { pointsPer: number }, pid: PlayerId, holds: (objectiveId: string) => boolean,
): number {
  const s = ctx.state
  const zone = deploymentZone(s, pid)
  const hit = Object.values(s.objectives).some((o) => !o.removed && !pointInPolygon(o.pos, zone) && holds(o.id) && o.controllerAtTurnStart !== pid)
  return hit ? rule.pointsPer : 0
}

// ---------- hook factory ----------
export function aeldariHooks(): Record<string, EngineCodeHook> {
  // marker + pool creation. The marker ability itself is read by miracle.ts (E1); the pick rolls and re-rolls the opening set
  const strandsOfFate: EngineCodeHook = {
    name: 'strandsOfFate', kind: 'ability', hook: 'onTurnStart', run: noop,
    pick: {
      window: 'round.start', topic: 'abilityChoice',
      offer(ctx, window, key) {
        const s = ctx.state
        if (s.round !== 1) return false
        const first = s.firstPlayer
        const order: PlayerId[] = [first, first === 'A' ? 'B' : 'A']
        for (const player of order) {
          if (!armyHasStrands(s, player)) continue
          const ss = s.players[player].secondaryState
          if (ss[FATE_DONE]) continue
          let draft = ss[FATE_DRAFT] as number[] | undefined
          if (!draft) {
            draft = rollFateDice(ctx, player, 12)
            ss[FATE_DRAFT] = draft
          }
          if (draft.length <= 1) {
            finishFatePool(ctx, player, draft)
            continue
          }
          ctx.decide({
            kind: 'chooseOption', player, window, canPass: false,
            context: { topic: 'abilityChoice', unitId: null, abilityId: strandsAbilityId(s, player), data: { window, key, code: 'strandsOfFate', draft: [...draft] } },
            options: [
              { id: 'keep', label: `Keep these ${draft.length} Fate dice (${draft.join(' ')})`, action: optionAction(player, 'keep') },
              { id: 'reroll', label: `Re-roll all as ${draft.length - 1} dice`, action: optionAction(player, 'reroll') },
            ],
          })
          return true
        }
        return false
      },
      handle(ctx, action, pending) {
        if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Strands of Fate expects chooseOption')
        const s = ctx.state
        const player = pending.player
        const ss = s.players[player].secondaryState
        const draft = ss[FATE_DRAFT] as number[] | undefined
        if (!draft || ss[FATE_DONE]) return notAnOption('there is no Fate dice draft to answer')
        if (action.optionId === 'keep') { finishFatePool(ctx, player, draft); return }
        if (action.optionId !== 'reroll') return notAnOption('Strands of Fate: keep or reroll')
        if (draft.length <= 1) return notAnOption('only one die is left, it cannot be re-rolled')
        ss[FATE_DRAFT] = rollFateDice(ctx, player, draft.length - 1)
      },
    },
  }

  // Fortune (AEL-6.1): Command phase D6; 2+ → one friendly AELDARI unit within 12" gets -1 to the wound rolls of attacks against it
  const fortune: EngineCodeHook = {
    name: 'fortune', kind: 'ability', hook: 'onCommandPhase', run: noop,
    pick: {
      window: 'command.start', topic: 'abilityChoice',
      offer(ctx, window, key) {
        const s = ctx.state
        const player = s.activePlayer
        for (const holder of boardUnitsOf(s, player)) {
          const abilityId = abilityWithCode(s, holder, 'fortune')
          if (!abilityId) continue
          const mark = `ael:fortune:${holder.id}:${s.round}`
          if (s.phaseState.marks.includes(mark)) continue
          s.phaseState.marks.push(mark)
          const params = s.abilities[abilityId]?.params ?? {}
          const range = (params.range as number | undefined) ?? 12
          const on = (params.on as number | undefined) ?? 2
          const farseer = unitModels(s, holder.id)[0]
          if (!farseer) continue
          const saved = s.phaseState.lastRoll
          const die = ctx.roll({ purpose: 'ability', player, sides: 6, count: 1, mode: 'perDie', unitId: holder.id, commandRerollable: false }).final[0]
          s.phaseState.lastRoll = saved
          if (die < on) {
            ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: holder.id, targetUnitId: null, summary: `Fortune: rolled ${die}, the threads slip away`, player })
            continue
          }
          const options = canonicalBoardUnits(s, player)
            .filter((u) => leaderService.halves(s, u.id).some((h) => keywordsOf(s, h).includes(AELDARI_KEYWORD)))
            .filter((u) => boardModelsOfUnit(s, u.id).some((m) => distance(farseer, m) <= range + 1e-6))
            .map((u) => ({
              id: u.id, label: `Fortune: ${u.name} (-1 to wound rolls against it)`, action: optionAction(player, u.id), hint: { unitId: u.id },
            }))
          if (options.length === 0) continue
          ctx.decide({
            kind: 'chooseOption', player, window, canPass: false,
            context: { topic: 'abilityChoice', unitId: holder.id, abilityId, data: { window, key, code: 'fortune', roll: die } },
            options,
          })
          return true
        }
        return false
      },
      handle(ctx, action, pending) {
        if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Fortune expects chooseOption')
        const s = ctx.state
        const target = s.units[action.optionId]
        const farseerId = pending.context.unitId
        const abilityId = pending.context.abilityId
        if (!target || target.player !== pending.player || target.location !== 'board' || !farseerId || !abilityId) return { code: 'E_INVALID_TARGET', reason: 'Fortune needs one of your units on the battlefield' }
        ctx.services.effects.grant(ctx, target.id, { modifyRoll: { roll: 'wound', value: -1 } }, {
          sourceAbilityId: abilityId, sourceUnitId: farseerId, scope: { who: 'attacker' }, duration: 'untilNextTurn', when: null,
        })
        ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: farseerId, targetUnitId: target.id, summary: `Fortune: attacks against ${target.name} get -1 to wound until your next Command phase`, player: pending.player })
      },
    },
  }

  const crewedPlatform: EngineCodeHook = {
    name: 'crewedPlatform', kind: 'ability', hook: 'onModelDestroyed', run: noop,
    runAt: (ctx, entry, data) => crewedPlatformRun(ctx, entry, data),
  }

  // Foresight (enhancement): Fire Overwatch by the bearer's unit hits on an unmodified 4+ on a controlled marker, else 5+
  const foresight: EngineCodeHook = {
    name: 'foresight', kind: 'ability', hook: 'onStatQuery', run: noop,
    overwatchHitOn(state, entry, shooterUnitId, stratagemId) {
      if (stratagemId !== ((entry.params.stratagemId as string | undefined) ?? 'core.s.fire-overwatch')) return null
      if (!leaderService.sameUnit(state, entry.holderUnitId, shooterUnitId)) return null
      const owner = state.units[entry.holderUnitId]?.player
      const models = boardModelsOfUnit(state, shooterUnitId)
      const onControlled = Object.values(state.objectives).some((o) => !o.removed && o.controller === owner && models.some((m) => withinObjectiveRange(m, o)))
      return onControlled ? ((entry.params.onObjective as number | undefined) ?? 4) : ((entry.params.otherwise as number | undefined) ?? 5)
    },
  }

  const ineffableAgenda: EngineCodeHook = { name: 'ineffableAgenda', kind: 'mission', hook: 'onTurnEnd', run: noop }

  // Whip-fast Reactions: the data carries the whole effect; the hook only restricts the target to INFANTRY / MOUNTED
  const infantryOrMountedHook: EngineCodeHook = {
    name: 'infantryOrMounted', kind: 'stratagem', hook: 'onTargetsDeclared', run: noop,
    check(env: StratagemEnv, t: StratagemTuple) {
      const u = env.state.units[t.ids[0]]
      return !!u && u.location === 'board' && infantryOrMounted(env.state, u.id)
    },
  }

  // own AELDARI MOUNTED units on the battlefield, other than `firstId`, that satisfy `ok`
  const otherMounted = (s: GameState, player: PlayerId, firstId: UnitId, ok: (id: UnitId) => boolean): Unit[] =>
    canonicalBoardUnits(s, player).filter((u) => !leaderService.sameUnit(s, u.id, firstId)
      && !leaderService.halves(s, u.id).some((h) => s.units[h].battleShocked)
      && anyHalfHasKeyword(s, u.id, 'MOUNTED') && anyHalfHasKeyword(s, u.id, AELDARI_KEYWORD) && ok(u.id))

  const secondPick = (ctx: EngineContext, env: StratagemEnv, firstId: UnitId, code: string, candidates: Unit[], label: (u: Unit) => string): void => {
    ctx.decide({
      kind: 'chooseOption', player: env.player, window: env.window, canPass: false,
      context: { topic: 'abilityChoice', unitId: firstId, abilityId: env.stratagem.id, data: { code, stratagemId: env.stratagem.id, first: firstId, stratagemWindow: env.window } },
      options: [
        ...candidates.map((u) => ({ id: u.id, label: label(u), action: optionAction(env.player, u.id), hint: { unitId: u.id, priority: 1 } })),
        { id: 'decline', label: 'Only the first unit', action: optionAction(env.player, 'decline') },
      ],
    })
  }

  // Storm of Shots: INFANTRY alone, or up to two MOUNTED units
  const stormOfShots: EngineCodeHook = {
    name: 'stormOfShots', kind: 'stratagem', hook: 'onUnitSelectedToShoot', run: noop,
    check(env, t) {
      const u = env.state.units[t.ids[0]]
      return !!u && u.location === 'board' && infantryOrMounted(env.state, u.id)
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const first = t.ids[0]
      if (!anyHalfHasKeyword(s, first, 'MOUNTED')) return
      const candidates = otherMounted(s, env.player, first, (id) => notYetShot(s, id))
      if (candidates.length === 0) return
      secondPick(ctx, env, first, 'stormOfShots', candidates, (u) => `Storm of Shots: also ${u.name} (+1 to hit)`)
    },
    answer(ctx, action, pending): Rejection | void {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Storm of Shots expects chooseOption')
      if (action.optionId === 'decline') return
      const s = ctx.state
      const data = pending.context.data as { stratagemId?: string; first?: UnitId }
      const target = s.units[action.optionId]
      if (!target || target.player !== pending.player || target.location !== 'board' || !data.first || !data.stratagemId) return { code: 'E_INVALID_TARGET', reason: 'pick one of your MOUNTED units on the battlefield' }
      if (!pending.options.some((o) => o.id === action.optionId)) return notAnOption('that unit is not offered')
      ctx.services.effects.grant(ctx, target.id, { modifyRoll: { roll: 'hit', value: 1 } }, {
        sourceAbilityId: data.stratagemId, sourceUnitId: target.id, scope: { who: 'self' }, duration: 'untilEndOfPhase', when: null,
      })
      ctx.emit({ type: 'AbilityTriggered', abilityId: data.stratagemId, sourceUnitId: target.id, targetUnitId: null, summary: `Storm of Shots: ${target.name} adds 1 to its Hit rolls this phase`, player: pending.player })
    },
  }

  // Zephyr-swift: a Normal move of up to 6" for one INFANTRY unit or up to two MOUNTED units (one after the other), no charge after
  const zephyrSwift: EngineCodeHook = {
    name: 'zephyrSwift', kind: 'stratagem', hook: 'onUnitSelectedToShoot', run: noop,
    check(env, t) {
      const u = env.state.units[t.ids[0]]
      return !!u && u.location === 'board' && infantryOrMounted(env.state, u.id) && !leaderService.inEngagementWithEnemy(env.state, u.id)
    },
    apply(ctx, env, t) {
      const s = ctx.state
      const first = canon(s, t.ids[0])
      const distanceInches = (env.stratagem.params?.distance as number | undefined) ?? 6
      if (anyHalfHasKeyword(s, first, 'MOUNTED')) {
        const candidates = otherMounted(s, env.player, first, (id) => !leaderService.inEngagementWithEnemy(s, id))
        if (candidates.length > 0) {
          secondPick(ctx, env, first, 'zephyrSwift', candidates, (u) => `Zephyr-swift: also move ${u.name} (up to ${distanceInches}")`)
          return
        }
      }
      startReactiveMove(ctx, first, distanceInches, env.stratagem.id, env.window)
    },
    answer(ctx, action, pending): Rejection | void {
      if (action.type !== 'chooseOption' || pending.kind !== 'chooseOption') return notAnOption('Zephyr-swift expects chooseOption')
      const s = ctx.state
      const data = pending.context.data as { stratagemId?: string; first?: UnitId; stratagemWindow?: TimingWindowId }
      const first = data.first
      const stratagemId = data.stratagemId
      if (!first || !stratagemId || !s.units[first]) return notAnOption('Zephyr-swift: the first unit is missing')
      const window = data.stratagemWindow ?? 'shooting.attacksResolved'
      const dist = (s.stratagems[stratagemId]?.params?.distance as number | undefined) ?? 6
      const then: { unitId: UnitId; distance: number }[] = []
      if (action.optionId !== 'decline') {
        const second = s.units[action.optionId]
        if (!second || second.player !== pending.player || second.location !== 'board') return { code: 'E_INVALID_TARGET', reason: 'pick one of your MOUNTED units on the battlefield' }
        if (!pending.options.some((o) => o.id === action.optionId)) return notAnOption('that unit is not offered')
        for (const half of boardHalves(s, second.id)) {
          ctx.services.effects.grant(ctx, half, { forbid: 'charge' }, { sourceAbilityId: stratagemId, sourceUnitId: second.id, scope: { who: 'self' }, duration: 'untilEndOfTurn', when: null })
        }
        then.push({ unitId: canon(s, second.id), distance: dist })
      }
      startReactiveMove(ctx, first, dist, stratagemId, window, then)
    },
  }

  return { strandsOfFate, fortune, crewedPlatform, foresight, ineffableAgenda, infantryOrMounted: infantryOrMountedHook, stormOfShots, zephyrSwift }
}
