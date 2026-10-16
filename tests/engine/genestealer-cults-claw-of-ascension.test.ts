// Genestealer Cults: Claw of Ascension (docs/spec/factions/genestealer-cults--claw-of-ascension.md, checklist CLA-*), the (b) code hooks:
// Priority Kill Order, Master of Suppression, Master Outrider, Crossfire, Swarm the Oppressors and the two secondaries. Real Combat Patrol data.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type AttackContext, type ChooseOptionDecision, type DiceRoll, type EngineContext, type GameEvent, type GameSetup, type GameState,
  type PendingDecision, type PlayerSetup, type RollContext, type UseStratagemAction,
} from '../../src/engine'
import { hookService } from '../../src/engine/hooks-impl'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { attackService } from '../../src/engine/attack'
import { fightOnDeathThreshold } from '../../src/engine/fight-on-death'
import { isDeferredDead, unitModelsForCoherency } from '../../src/engine/state'
import { infiltrationAgendaAmount, safeguardTheSanctuaryAmount } from '../../src/engine/factions/genestealer-cults'
import { handleReactiveMove } from '../../src/engine/phases/movement'
import { translatePlacements } from '../../src/engine/phases/legal'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const CLAW = 'gsc.cp.claw-of-ascension'
const GSC = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Cult', faction: 'genestealer-cults', patrolId: CLAW, enhancementId: 'gsc.e.priority-kill-order', secondaryId: 'gsc.sec.infiltration-agenda',
  attachments: [{ leaderRef: 'shanus', bodyguardRef: 'jackals' }], reserves: [], battleReadyVp: 0, ...o,
})
const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: 'sm.e.champion-duellist', secondaryId: 'sm.sec.shock-tactics',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const SHANUS = 'A:shanus', JACKALS = 'A:jackals', META = 'A:metamorphs-a', RIDGE = 'A:ridgerunner'
const ENEMY = 'B:terminator-squad', ENEMY2 = 'B:infernus-squad'

interface Opts { a?: Partial<PlayerSetup>; mission?: string; terrain?: string; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' }
function makeState(o: Opts = {}): GameState {
  const m = o.mission ?? 'cp-01'
  const setup: GameSetup = {
    missionId: `mission.${m}`, terrainLayoutId: `terrain.${o.terrain ?? 'cp-01'}`, players: { A: GSC(o.a), B: SM() },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'cla', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  s.players.A.cp = 5
  s.players.B.cp = 5
  return s
}
const ctxOf = (s: GameState, dice: number[] = []) => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

function pendingOption(s: GameState): ChooseOptionDecision {
  if (s.pending?.kind !== 'chooseOption') throw new Error(`expected a chooseOption, got ${s.pending?.kind}`)
  return s.pending
}
function answerOption(ctx: EngineContext, optionId: string): void {
  const pending = pendingOption(ctx.state)
  ctx.state.pending = null
  const rej = hookService.handler.handle(ctx, { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId } as Action, pending as PendingDecision)
  if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
}

// the shooting group (Shanus attached to the Jackals) is shown as one unit
function deployShooters(s: GameState): void {
  placeUnit(s, JACKALS, { x: -10, z: 3, gap: 0.3 })
  placeUnit(s, SHANUS, [[-10, 0]])
  placeUnit(s, RIDGE, [[-10, -8]])
}
const canonOf = (s: GameState, id: string): string => s.units[id].bodyguardUnitId ?? id

function attackOf(s: GameState, attackerUnit: string, targetUnit: string, kind: 'ranged' | 'melee'): AttackContext {
  const am = s.models[s.units[attackerUnit].models[0]]
  const wid = am.weapons.find((w) => s.weapons[w].kind === kind)!
  return {
    kind, overwatch: false, attackerUnitId: am.unitId, attackerModelId: am.id, weapon: weaponService.effectiveWeapon(s, am.id, wid),
    targetUnitId: targetUnit, targetModelId: s.units[targetUnit].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget: false,
    attackerInEngagement: kind === 'melee',
  }
}
const rollCtx = (purpose: 'hit' | 'wound' | 'save', unmodified = 1): RollContext => {
  const roll: DiceRoll = { id: 'r:x', purpose, sides: 6, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true }
  return { purpose, roll, dieIndex: 0, unmodified, rerolled: false }
}
function hitMods(ctx: EngineContext, attack: AttackContext): { modifier: number; reroll?: string } {
  const out = hookService.collect(ctx, 'onHitRoll', { attack, roll: rollCtx('hit') } as never)
  let modifier = 0
  let reroll: string | undefined
  for (const { result } of out) {
    if (result.kind !== 'roll') continue
    modifier += result.modifier ?? 0
    if (result.reroll) reroll = result.reroll
  }
  return { modifier, reroll }
}
function apOf(s: GameState, attack: AttackContext): number {
  return weaponService.effectiveWeapon(s, attack.attackerModelId, attack.weapon.id, attack).AP
}
// raises the picks of a window and declines every other Claw pick until the one with `code` shows up; false when it never does
function raise(c: ReturnType<typeof ctxOf>, window: Parameters<typeof hookService.offerPicks>[1], key: string, code: string): boolean {
  hookService.offerPicks(c.ctx, window, key)
  while (c.ctx.state.pending) {
    if (pendingOption(c.ctx.state).context.data.code === code) return true
    const opts = pendingOption(c.ctx.state).options.map((o) => o.id)
    answerOption(c.ctx, opts.includes('decline') ? 'decline' : opts[0])
  }
  return false
}
const hitMark = (s: GameState, attacker: string, target: string): void => {
  const w = s.models[s.units[attacker].models[0]].weapons.find((x) => s.weapons[x].kind === 'ranged') as string
  s.phaseState.marks.push(`hitBy:${canonOf(s, attacker)}:${w}:${target}`)
}

describe('Priority Kill Order', () => {
  it('CLA-013 offered at the start of the own Shooting phase; a GSC attack on the picked unit may re-roll hit rolls, another target may not; gone at phase end', () => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    placeUnit(s, ENEMY2, { x: 10, z: 12, gap: 0.3 })
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.start', 'start')).toBe(true)
    const ids = pendingOption(s).options.map((o) => o.id)
    expect(ids).toContain(ENEMY)
    expect(ids).toContain('decline')
    answerOption(c.ctx, ENEMY)
    expect(hitMods(c.ctx, attackOf(s, RIDGE, ENEMY, 'ranged')).reroll).toBe('all')
    expect(hitMods(c.ctx, attackOf(s, RIDGE, ENEMY2, 'ranged')).reroll).toBeUndefined()
    // an enemy attacking the picked unit's owner side gets nothing from it
    expect(hitMods(c.ctx, attackOf(s, ENEMY, RIDGE, 'ranged')).reroll).toBeUndefined()
    DEFAULT_MODULES.services.effects.expire(c.ctx, 'phaseEnd', null)
    expect(hitMods(c.ctx, attackOf(s, RIDGE, ENEMY, 'ranged')).reroll).toBeUndefined()
  })
  it('CLA-014 not offered in the opponent\'s Shooting phase, and not offered when no enemy is on the battlefield', () => {
    const theirs = makeState({ active: 'B' })
    deployShooters(theirs)
    placeUnit(theirs, ENEMY, { x: 10, z: 0, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(theirs).ctx, 'shooting.start', 'start')).toBe(false)
    const empty = makeState()
    deployShooters(empty)
    expect(hookService.offerPicks(ctxOf(empty).ctx, 'shooting.start', 'start')).toBe(false)
  })
  it('CLA-013 the enhancement\'s own inert effect gives no re-roll to enemies attacking Shanus\'s unit', () => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    const c = ctxOf(s)
    expect(hitMods(c.ctx, attackOf(s, ENEMY, JACKALS, 'ranged')).reroll).toBeUndefined()
  })
})

describe('Master of Suppression', () => {
  const mos = { a: { enhancementId: 'gsc.e.master-of-suppression' } }
  it('CLA-015 after Shanus\'s unit shot: only units it hit are offered; the pick takes -1 to hit until the owner\'s next Shooting phase', () => {
    const s = makeState(mos)
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    placeUnit(s, ENEMY2, { x: 10, z: 12, gap: 0.3 })
    hitMark(s, JACKALS, ENEMY)
    const c = ctxOf(s)
    expect(raise(c, 'shooting.attacksResolved', JACKALS, 'masterOfSuppression')).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id).sort()).toEqual([ENEMY, 'decline'].sort())
    answerOption(c.ctx, ENEMY)
    expect(hitMods(c.ctx, attackOf(s, ENEMY, RIDGE, 'ranged')).modifier).toBe(-1)
    expect(hitMods(c.ctx, attackOf(s, ENEMY2, RIDGE, 'ranged')).modifier).toBe(0)
    // opponent's turn this round and the next round's movement/command of the owner: still on
    s.activePlayer = 'B'
    expect(hitMods(c.ctx, attackOf(s, ENEMY, RIDGE, 'ranged')).modifier).toBe(-1)
    s.round = 3; s.activePlayer = 'A'; s.phase = 'movement'
    expect(hitMods(c.ctx, attackOf(s, ENEMY, RIDGE, 'ranged')).modifier).toBe(-1)
    // gone at the start of the owner's next Shooting phase, and stays gone
    s.phase = 'shooting'
    expect(hitMods(c.ctx, attackOf(s, ENEMY, RIDGE, 'ranged')).modifier).toBe(0)
    s.activePlayer = 'B'; s.phase = 'movement'
    expect(hitMods(c.ctx, attackOf(s, ENEMY, RIDGE, 'ranged')).modifier).toBe(0)
  })
  it('CLA-015 nothing hit: no decision; not offered for another unit or in the opponent\'s turn', () => {
    const s = makeState(mos)
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    expect(raise(ctxOf(s), 'shooting.attacksResolved', JACKALS, 'masterOfSuppression')).toBe(false)
    const other = makeState(mos)
    deployShooters(other)
    placeUnit(other, ENEMY, { x: 10, z: 0, gap: 0.3 })
    hitMark(other, RIDGE, ENEMY)
    expect(raise(ctxOf(other), 'shooting.attacksResolved', RIDGE, 'masterOfSuppression')).toBe(false)
    const theirs = makeState({ ...mos, active: 'B' })
    deployShooters(theirs)
    placeUnit(theirs, ENEMY, { x: 10, z: 0, gap: 0.3 })
    hitMark(theirs, JACKALS, ENEMY)
    expect(raise(ctxOf(theirs), 'shooting.attacksResolved', JACKALS, 'masterOfSuppression')).toBe(false)
  })
})

describe('Secondaries', () => {
  const rule = (id: string, pointsPer: number) => ({ id, when: 'turn.end', who: 'active', rounds: { from: 1, to: 5 }, rule: 'custom', code: id, pointsPer, cap: 99 }) as never
  it('CLA-017 Infiltration Agenda: a non-shocked GSC model overlapping the enemy zone scores a flat 4; Battle-shocked scores nothing', () => {
    const s = makeState({ phase: 'command' })
    const zone = s.mission.data.deploymentZones.B
    const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
    const inside = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
    placeUnit(s, META, [[inside.x, inside.z]])
    placeUnit(s, 'A:metamorphs-b', [[inside.x + 2, inside.z]])
    placeUnit(s, JACKALS, { x: 0, z: 0, gap: 0.3 })
    expect(infiltrationAgendaAmount(s, rule('infiltrationAgenda', 4), 'A')).toBe(4)
    s.units[META].battleShocked = true
    expect(infiltrationAgendaAmount(s, rule('infiltrationAgenda', 4), 'A')).toBe(4)
    s.units['A:metamorphs-b'].battleShocked = true
    expect(infiltrationAgendaAmount(s, rule('infiltrationAgenda', 4), 'A')).toBe(0)
    // the opponent's evaluation looks at the other zone
    expect(infiltrationAgendaAmount(s, rule('infiltrationAgenda', 4), 'B')).toBe(0)
  })
  const controlsOnly = (ids: string[]) => (id: string) => ids.includes(id)
  it('CLA-018 Safeguard the Sanctuary: controlling the marker closest to the own battlefield edge scores 10', () => {
    const s = makeState({ phase: 'command' })
    const ctx = ctxOf(s).ctx
    const near = Object.values(s.objectives).filter((o) => !o.removed)
    const sideA = s.mission.data.deploymentZones.A
    const cz = sideA.reduce((n, p) => n + p.z, 0) / sideA.length
    const cx = sideA.reduce((n, p) => n + p.x, 0) / sideA.length
    const horizontal = Math.abs(cz) > Math.abs(cx)
    const dist = (o: { pos: { x: number; z: number } }) => (horizontal ? Math.abs(o.pos.z - cz) : Math.abs(o.pos.x - cx))
    const closest = [...near].sort((a, b) => dist(a) - dist(b))[0]
    const farthest = [...near].sort((a, b) => dist(b) - dist(a))[0]
    expect(safeguardTheSanctuaryAmount(ctx, rule('safeguardTheSanctuary', 10), 'A', controlsOnly([closest.id]))).toBe(10)
    expect(safeguardTheSanctuaryAmount(ctx, rule('safeguardTheSanctuary', 10), 'A', controlsOnly([farthest.id]))).toBe(0)
    expect(safeguardTheSanctuaryAmount(ctx, rule('safeguardTheSanctuary', 10), 'A', controlsOnly([]))).toBe(0)
  })
  it('CLA-019 Safeguard the Sanctuary on the cp-04 triangle: the marker nearest the west edge scores', () => {
    const s = makeState({ phase: 'command', mission: 'cp-04' })
    const ctx = ctxOf(s).ctx
    const live = Object.values(s.objectives).filter((o) => !o.removed)
    const west = [...live].sort((a, b) => a.pos.x - b.pos.x)[0]
    const other = live.find((o) => o.id !== west.id)!
    expect(safeguardTheSanctuaryAmount(ctx, rule('safeguardTheSanctuary', 10), 'A', controlsOnly([west.id]))).toBe(10)
    expect(safeguardTheSanctuaryAmount(ctx, rule('safeguardTheSanctuary', 10), 'A', controlsOnly([other.id]))).toBe(0)
  })
})

describe('Swarm the Oppressors', () => {
  function chargeBonus(c: ReturnType<typeof ctxOf>, unit: string, targets: string[]): number {
    let total = 0
    for (const r of hookService.collect(c.ctx, 'onChargeRoll', {
      chargingUnitId: unit, targetUnitIds: targets,
      roll: { purpose: 'charge', roll: { id: 'r', dice: [3, 3], final: [3, 3], rerolled: [] } as never, dieIndex: 0, unmodified: 6, rerolled: false },
    })) if (r.result.kind === 'roll') total += r.result.modifier ?? 0
    return total
  }
  it('CLA-024 own Charge phase: the chosen enemy gets +1 to the charge roll of every GSC charge that includes it; others none; gone after the phase', () => {
    const s = makeState({ phase: 'charge' })
    deployShooters(s)
    placeUnit(s, META, [[-12, 10]])
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    placeUnit(s, ENEMY2, { x: 10, z: 12, gap: 0.3 })
    const c = ctxOf(s)
    const act = stratagemService.options(s, 'A', 'charge.start', {}).find((x) => x.stratagemId === 'gsc.s.swarm-the-oppressors' && x.targets.unitIds?.[0] === ENEMY)
    expect(act).toBeTruthy()
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'charge.start', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    const use = { ...act!, decisionId: 'd:1' } as UseStratagemAction
    expect(stratagemService.validate!(s, use, pending)).toBeNull()
    expect(stratagemService.handle(c.ctx, use, pending)).toBeUndefined()
    expect(chargeBonus(c, RIDGE, [ENEMY])).toBe(1)
    expect(chargeBonus(c, META, [ENEMY2, ENEMY])).toBe(1)
    expect(chargeBonus(c, META, [ENEMY2])).toBe(0)
    DEFAULT_MODULES.services.effects.expire(c.ctx, 'phaseEnd', null)
    expect(chargeBonus(c, RIDGE, [ENEMY])).toBe(0)
  })
})

describe('Master Outrider', () => {
  it('CLA-025 after the unit shot and outside Engagement Range: a 6" Normal move may be taken, and no charge is allowed afterwards; declining keeps charging legal', () => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', JACKALS)).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id)).toEqual(['move', 'decline'])
    answerOption(c.ctx, 'move')
    expect(s.pending?.kind).toBe('moveUnit')
    expect((s.pending as { constraints: { maxDistance: number } }).constraints.maxDistance).toBe(6)
    expect(hookService.chargeForbidden(s, JACKALS)).toBe(false)

    const d = makeState()
    deployShooters(d)
    placeUnit(d, ENEMY, { x: 10, z: 0, gap: 0.3 })
    const dc = ctxOf(d)
    expect(hookService.offerPicks(dc.ctx, 'shooting.attacksResolved', JACKALS)).toBe(true)
    answerOption(dc.ctx, 'decline')
    expect(d.pending).toBeNull()
    expect(hookService.chargeForbidden(d, JACKALS)).toBe(false)
  })
  it('CLA-025 the charge is lost only if the Outrider actually moves: pass keeps it, a real move forfeits it', () => {
    const run = (move: boolean) => {
      const s = makeState()
      s.board = { ...s.board, pieces: {} }
      deployShooters(s)
      placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
      const c = ctxOf(s)
      hookService.offerPicks(c.ctx, 'shooting.attacksResolved', JACKALS)
      answerOption(c.ctx, 'move')
      const pending = s.pending as PendingDecision
      expect(pending.kind).toBe('moveUnit')
      expect(hookService.chargeForbidden(s, JACKALS)).toBe(false)
      const unitId = (pending as { context: { unitId: string } }).context.unitId
      s.pending = null
      const pass = { type: 'pass', player: pending.player, decisionId: pending.id } as Action
      if (!move) expect(handleReactiveMove(c.ctx, pass, pending)).toBeUndefined()
      else {
        expect(handleReactiveMove(c.ctx, {
          type: 'moveUnit', player: pending.player, decisionId: pending.id, unitId, placements: translatePlacements(unitModelsForCoherency(s, unitId), 0, 4),
        } as Action, pending)).toBeUndefined()
      }
      return hookService.chargeForbidden(s, JACKALS)
    }
    expect(run(false)).toBe(false)
    expect(run(true)).toBe(true)
  })
  it('CLA-026 not offered while within Engagement Range, in the opponent\'s turn, or for a unit without the ability', () => {
    const engaged = makeState()
    deployShooters(engaged)
    placeUnit(engaged, ENEMY, { x: -10, z: 4.4, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(engaged).ctx, 'shooting.attacksResolved', JACKALS)).toBe(false)
    const theirs = makeState({ active: 'B' })
    deployShooters(theirs)
    placeUnit(theirs, ENEMY, { x: 10, z: 0, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(theirs).ctx, 'shooting.attacksResolved', JACKALS)).toBe(false)
    const meta = makeState()
    deployShooters(meta)
    placeUnit(meta, META, [[-12, 10]])
    placeUnit(meta, ENEMY, { x: 10, z: 0, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(meta).ctx, 'shooting.attacksResolved', META)).toBe(false)
  })
})

describe('Crossfire', () => {
  it('CLA-027 after the Ridgerunner hit enemy X: GSC attacks on X improve AP by 1 for the turn (other targets unaffected, enemy attackers unaffected); gone at turn end', () => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    placeUnit(s, ENEMY2, { x: 10, z: 12, gap: 0.3 })
    hitMark(s, RIDGE, ENEMY)
    const c = ctxOf(s)
    const before = apOf(s, attackOf(s, JACKALS, ENEMY, 'ranged'))
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', RIDGE)).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id)).toEqual([ENEMY])
    answerOption(c.ctx, ENEMY)
    expect(apOf(s, attackOf(s, JACKALS, ENEMY, 'ranged'))).toBe(before - 1)
    expect(apOf(s, attackOf(s, SHANUS, ENEMY, 'ranged'))).toBe(weaponService.effectiveWeapon(s, s.units[SHANUS].models[0], attackOf(s, SHANUS, ENEMY, 'ranged').weapon.id).AP - 1)
    expect(apOf(s, attackOf(s, JACKALS, ENEMY2, 'ranged'))).toBe(before)
    const enemyShot = attackOf(s, ENEMY, RIDGE, 'ranged')
    expect(apOf(s, enemyShot)).toBe(enemyShot.weapon.AP)
    DEFAULT_MODULES.services.effects.expire(c.ctx, 'turnEnd', 'A')
    expect(apOf(s, attackOf(s, JACKALS, ENEMY, 'ranged'))).toBe(before)
  })
  it('CLA-028 no decision when the Ridgerunner hit nothing; an enemy already picked this turn is not offered again', () => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.attacksResolved', RIDGE)).toBe(false)
    s.phaseState = emptyPhaseState()
    hitMark(s, RIDGE, ENEMY)
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', RIDGE)).toBe(true)
    answerOption(c.ctx, ENEMY)
    // a new phase (marks reset) in the same turn: ENEMY was already picked
    s.phaseState = emptyPhaseState()
    hitMark(s, RIDGE, ENEMY)
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.attacksResolved', RIDGE)).toBe(false)
  })
})

// ---------- real-attack helpers (CLA-016, CLA-020..023) ----------
function driveAttack(h: { ctx: EngineContext; events: GameEvent[] }): GameEvent[] {
  const { ctx, events } = h
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending as PendingDecision & { options?: { action: Action }[] }
    const windowKind = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll'
    if (!windowKind && !pending.options) throw new Error(`pending ${pending.kind} ${JSON.stringify(pending).slice(0, 400)}`)
    const action = (windowKind ? { type: 'pass', player: pending.player, decisionId: pending.id } : pending.options![0].action) as Action
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    let rej = owner.handle(ctx, action, pending)
    if (rej && pending.kind === 'chooseOption') { ctx.state.pending = null; rej = hookService.handler.handle(ctx, action, pending) }
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
  return events
}
function beginAttack(ctx: EngineContext, kind: 'ranged' | 'melee', attackerUnit: string, targetUnit: string): void {
  const s = ctx.state
  const am = s.models[s.units[attackerUnit].models[0]]
  const wid = am.weapons.find((w) => s.weapons[w].kind === kind) as string
  attackService.begin(ctx, { kind, attackerUnitId: am.unitId, overwatch: false, targets: [{ modelId: am.id, weaponId: wid, targetUnitId: targetUnit, profileGroup: null, attacks: 1 }] })
}
function useStrat(s: GameState, ctx: EngineContext, player: 'A' | 'B', stratagemId: string, window: Parameters<typeof stratagemService.options>[2], trigger: { unitId?: string; targetUnitId?: string }, target: string): void {
  const action = stratagemService.options(s, player, window, trigger).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === target)
  if (!action) throw new Error(`${stratagemId} on ${target} not offered`)
  const pending = { id: 'd:1', kind: 'stratagemWindow', player, window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
  const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
  expect(stratagemService.validate!(s, act, pending)).toBeNull()
  expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
}
const offered = (s: GameState, player: 'A' | 'B', window: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}): string[] =>
  stratagemService.options(s, player, window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds?.[0] as string).sort()

describe('Master of Suppression and Stealth', () => {
  it('CLA-016 the suppressed unit shooting at a Stealth unit still takes only -1 to hit, not -2', () => {
    const s = makeState({ a: { enhancementId: 'gsc.e.master-of-suppression' } })
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 10, z: 0, gap: 0.3 })
    hitMark(s, JACKALS, ENEMY)
    const c = ctxOf(s)
    expect(raise(c, 'shooting.attacksResolved', JACKALS, 'masterOfSuppression')).toBe(true)
    answerOption(c.ctx, ENEMY)
    while (s.pending) answerOption(c.ctx, 'decline')
    s.activePlayer = 'B'
    s.phaseState = emptyPhaseState()
    // BS3+: an unmodified 4 with a single -1 is a 3 and hits; an uncapped -2 would make it a 2 and miss
    const run = ctxOf(s, [4, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    beginAttack(run.ctx, 'ranged', ENEMY, JACKALS)
    const hit = of(driveAttack(run), 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 4, final: 3, hit: true })
  })
})

describe('Metamorphic Spasm', () => {
  const MS = 'gsc.s.metamorphic-spasm'
  const fightState = () => {
    const s = makeState({ phase: 'fight', active: 'B' })
    deployShooters(s)
    placeUnit(s, META, [[-12, 10]])
    placeUnit(s, ENEMY, { x: -12, z: 12, gap: 0.3 })
    return s
  }
  it('CLA-020 offered when the enemy picks Metamorphs in the Fight phase; using it grants a 4+ fight-on-death', () => {
    const s = fightState()
    const trigger = { unitId: ENEMY, targetUnitId: META }
    expect(offered(s, 'A', 'fight.targetsDeclared', MS, trigger)).toEqual([META])
    const c = ctxOf(s)
    useStrat(s, c.ctx, 'A', MS, 'fight.targetsDeclared', trigger, META)
    expect(fightOnDeathThreshold(s, META)).toBe(4)
  })
  it('CLA-020 a Metamorph destroyed before the unit fought stays on a 4+ (deferred, still on the board) and goes at once on a 3', () => {
    const killed = (deathRoll: number) => {
      const s = fightState()
      const c = ctxOf(s, [])
      useStrat(s, c.ctx, 'A', MS, 'fight.targetsDeclared', { unitId: ENEMY, targetUnitId: META }, META)
      const victim = s.units[META].models.find((m) => s.models[m].woundsRemaining > 0) as string
      s.models[victim].woundsRemaining = 1
      const run = ctxOf(s, [6, 6, 1, deathRoll, 1, 1, 1, 1, 1, 1])
      beginAttack(run.ctx, 'melee', ENEMY, META)
      driveAttack(run)
      return { s, victim }
    }
    const kept = killed(4)
    expect(isDeferredDead(kept.s, kept.victim)).toBe(true)
    const gone = killed(3)
    expect(isDeferredDead(gone.s, gone.victim)).toBe(false)
  })
  it('CLA-021 not offered for the Jackals (with Shanus) or the Ridgerunner', () => {
    const s = fightState()
    placeUnit(s, RIDGE, [[-20, 10]])
    expect(offered(s, 'A', 'fight.targetsDeclared', MS, { unitId: ENEMY, targetUnitId: JACKALS })).toEqual([])
    expect(offered(s, 'A', 'fight.targetsDeclared', MS, { unitId: ENEMY, targetUnitId: SHANUS })).toEqual([])
    expect(offered(s, 'A', 'fight.targetsDeclared', MS, { unitId: ENEMY, targetUnitId: RIDGE })).toEqual([])
  })
})

describe('Point-Blank Ambush', () => {
  const PBA = 'gsc.s.point-blank-ambush'
  const woundRollsAt = (x: number): number => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x, z: 3, gap: 0.3 })
    const c = ctxOf(s)
    useStrat(s, c.ctx, 'A', PBA, 'shooting.start', {}, canonOf(s, JACKALS))
    // a critical hit (unmodified 6): Lethal Hits wounds automatically in range, otherwise a wound roll follows
    const run = ctxOf(s, [6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    beginAttack(run.ctx, 'ranged', JACKALS, ENEMY)
    const evs = driveAttack(run)
    return of(evs, 'WoundRolled').filter((e) => !e.auto).length
  }
  it('CLA-022 Lethal Hits applies to targets within 12" (critical hit auto-wounds) and not at 14"', () => {
    expect(woundRollsAt(0)).toBe(0)
    expect(woundRollsAt(6)).toBe(1)
  })
  it('CLA-022 usable in either player\'s Fight phase on a unit that has not fought', () => {
    for (const active of ['A', 'B'] as const) {
      const s = makeState({ phase: 'fight', active })
      deployShooters(s)
      placeUnit(s, ENEMY, { x: -10, z: 4.4, gap: 0.3 })
      expect(offered(s, 'A', 'fight.start', PBA)).toContain(canonOf(s, JACKALS))
      s.phaseState.fight = { ...(s.phaseState.fight as object), fought: [canonOf(s, JACKALS)] } as never
      expect(offered(s, 'A', 'fight.start', PBA)).not.toContain(canonOf(s, JACKALS))
    }
  })
  it('CLA-023 not offered for a unit that already shot, nor in the opponent\'s Shooting phase', () => {
    const s = makeState()
    deployShooters(s)
    placeUnit(s, ENEMY, { x: 0, z: 3, gap: 0.3 })
    expect(offered(s, 'A', 'shooting.start', PBA)).toContain(canonOf(s, JACKALS))
    s.units[canonOf(s, JACKALS)].turn.shotThisPhase = true
    expect(offered(s, 'A', 'shooting.start', PBA)).not.toContain(canonOf(s, JACKALS))
    const theirs = makeState({ active: 'B' })
    deployShooters(theirs)
    placeUnit(theirs, ENEMY, { x: 0, z: 3, gap: 0.3 })
    expect(offered(theirs, 'A', 'shooting.start', PBA)).toEqual([])
  })
})
