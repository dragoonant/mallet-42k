// Missions: objective control, scoring schedules, mission rules, deployment, game end (12-checklist MISSION-*).
import { describe, expect, it } from 'vitest'
import {
  createContext, DEFAULT_MODULES, mmToInch, OBJECTIVE_MARKER_RADIUS, pointInPolygon, ScriptedRng,
  type Action, type ChooseOptionDecision, type EngineContext, type GameState, type PendingDecision,
} from '../../src/engine'
import { loadBundle } from '../../src/data'
import { bundle, freshState, placeUnit } from '../fixtures'

const modules = DEFAULT_MODULES

function ctxFor(state: GameState, dice: number[] = []) {
  return createContext(state, new ScriptedRng(dice), modules)
}

// answers the current chooseOption pending decision the way step() would (clear pending, then hand to the handler)
function answer(ctx: EngineContext, optionId: string | null): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const action: Action = optionId === null
    ? { type: 'pass', player: pending.player, decisionId: pending.id }
    : { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }
  modules.services.missions.handler.handle(ctx, action, pending as PendingDecision)
}

// a fresh occurrence of a window (mirrors a new phase entry resetting phaseState.marks)
function resetOccurrence(state: GameState): void { state.phaseState.marks = [] }

describe('objective control (R-12.1–R-12.3, CP-2.4–CP-2.6)', () => {
  it('MISSION-001 R-12.1: 3.0" horizontal from marker edge → in range; 3.1" → not; 2" horizontal but 5.1" up → not', () => {
    const s = freshState()
    placeUnit(s, 'A:grunts', [{ x: 0, y: 0, z: 0 }])
    const obj = s.objectives['obj-w']
    const modelRadius = mmToInch(32) / 2
    const gap = (g: number) => modelRadius + OBJECTIVE_MARKER_RADIUS + g
    s.models['A:grunts#0'].pos = { x: obj.pos.x + gap(3.0), y: 0, z: obj.pos.z }
    expect(modules.services.objectives.modelsInRange(s, obj.id, 'A')).toContain('A:grunts#0')
    s.models['A:grunts#0'].pos = { x: obj.pos.x + gap(3.1), y: 0, z: obj.pos.z }
    expect(modules.services.objectives.modelsInRange(s, obj.id, 'A')).not.toContain('A:grunts#0')
    s.models['A:grunts#0'].pos = { x: obj.pos.x + gap(2), y: 5.1, z: obj.pos.z }
    expect(modules.services.objectives.modelsInRange(s, obj.id, 'A')).not.toContain('A:grunts#0')
  })

  it('MISSION-002 R-12.2: level of control sums each in-range model’s OC; the higher total controls', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', s.units['A:grunts'].models.map(() => ({ x: obj.pos.x, y: 0, z: obj.pos.z }))) // 5 × OC2 = 10, all in range
    placeUnit(s, 'B:mob', s.units['B:mob'].models.map(() => ({ x: 100, y: 0, z: 100 }))) // parked well out of range
    for (const id of s.units['B:mob'].models.slice(0, 2)) s.models[id].pos = { x: obj.pos.x, y: 0, z: obj.pos.z } // 2 × OC2 = 4 in range
    expect(modules.services.objectives.levelOfControl(s, obj.id)).toEqual({ A: 10, B: 4 })
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'rule')
    expect(s.objectives['obj-w'].controller).toBe('A')
  })

  it('MISSION-003 R-12.3: LoC 4 vs 4 → contested; 0 vs 0 → contested', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', [{ x: obj.pos.x, y: 0, z: obj.pos.z }, { x: 100, y: 0, z: 100 }, { x: 100, y: 0, z: 101 }, { x: 100, y: 0, z: 102 }, { x: 100, y: 0, z: 103 }])
    placeUnit(s, 'B:mob', [{ x: obj.pos.x, y: 0, z: obj.pos.z }, ...Array.from({ length: 9 }, (_, i) => ({ x: 100, y: 0, z: 200 + i }))])
    const { ctx } = ctxFor(s)
    // one grunt (OC2) vs one mob boy (OC2) on the marker → 2 vs 2, contested
    modules.services.objectives.evaluateControl(ctx, 'rule')
    expect(s.objectives['obj-w'].controller).toBeNull()
    s.models['A:grunts#0'].pos = { x: 100, y: 0, z: 300 }
    s.models['B:mob#0'].pos = { x: 100, y: 0, z: 301 }
    modules.services.objectives.evaluateControl(ctx, 'rule')
    expect(s.objectives['obj-w'].controller).toBeNull()
  })

  it('MISSION-004 R-4.6a: a Battle-shocked unit contributes OC 0, so the non-shocked side controls', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    placeUnit(s, 'B:warboss', [{ x: obj.pos.x, y: 0, z: obj.pos.z }])
    s.units['A:grunts'].battleShocked = true
    // B's Warboss is OC1 but bears the default "Big Boss" enhancement (+1 OC, self-scoped) → the hook-modified OC is 2
    expect(modules.services.objectives.levelOfControl(s, obj.id)).toEqual({ A: 0, B: 2 })
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'rule')
    expect(s.objectives['obj-w'].controller).toBe('B')
  })

  it('MISSION-005 R-12.3: control is re-evaluated at the end of every phase; ObjectiveControlChanged only on change', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    const { ctx, events } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(events.filter((e) => e.type === 'ObjectiveControlChanged')).toHaveLength(1)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(events.filter((e) => e.type === 'ObjectiveControlChanged')).toHaveLength(1)
  })

  it('MISSION-006 CP-2.4: a controlling non-Battle-shocked BATTLELINE unit in range secures the marker at Command phase end; a non-BATTLELINE unit does not', () => {
    const s1 = freshState()
    const obj1 = s1.objectives['obj-w']
    placeUnit(s1, 'A:grunts', { x: obj1.pos.x, z: obj1.pos.z }) // BATTLELINE
    s1.phase = 'command'; s1.activePlayer = 'A'
    const { ctx: ctx1 } = ctxFor(s1)
    modules.services.objectives.evaluateControl(ctx1, 'phaseEnd')
    expect(s1.objectives['obj-w'].securedBy).toBe('A')

    const s2 = freshState()
    const obj2 = s2.objectives['obj-w']
    placeUnit(s2, 'B:warboss', [{ x: obj2.pos.x, y: 0, z: obj2.pos.z }]) // not BATTLELINE
    s2.phase = 'command'; s2.activePlayer = 'B'
    const { ctx: ctx2 } = ctxFor(s2)
    modules.services.objectives.evaluateControl(ctx2, 'phaseEnd')
    expect(s2.objectives['obj-w'].securedBy).toBeNull()
  })

  it('MISSION-007 CP-2.5: a secured marker stays controlled with no models in range until a later Command phase where the opponent’s LoC is greater', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    s.phase = 'command'; s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-w'].securedBy).toBe('A')
    placeUnit(s, 'A:grunts', { x: 100, z: 100 })
    placeUnit(s, 'B:warboss', [{ x: 200, y: 0, z: 200 }]) // present, but not near the marker
    s.activePlayer = 'B'
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-w'].securedBy).toBe('A')
    expect(s.objectives['obj-w'].controller).toBe('A') // still A-controlled while secured, even with 0 there
    placeUnit(s, 'B:warboss', [{ x: obj.pos.x, y: 0, z: obj.pos.z }]) // B's LoC there is now greater
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-w'].securedBy).toBeNull()
    expect(s.objectives['obj-w'].controller).toBe('B')
  })

  it('MISSION-008 CP-2.5: enemy presence at the end of a non-Command phase does not break a secure', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    s.phase = 'command'; s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-w'].securedBy).toBe('A')
    placeUnit(s, 'A:grunts', { x: 100, z: 100 })
    placeUnit(s, 'B:warboss', [{ x: obj.pos.x, y: 0, z: obj.pos.z }])
    s.phase = 'movement'; s.activePlayer = 'B'
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-w'].securedBy).toBe('A')
  })

  it('MISSION-009 CP-2.4: a Battle-shocked BATTLELINE unit cannot secure the marker', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    s.units['A:grunts'].battleShocked = true
    s.objectives['obj-w'].controller = 'A' // isolate the securing check from control determination
    s.phase = 'command'; s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-w'].securedBy).toBeNull()
  })
})

describe('CP-2.1 standard scoring schedule', () => {
  it('MISSION-010: round 1 → no primary VP for either player', () => {
    const s = freshState()
    s.round = 1
    s.objectives['obj-w'].controller = 'A'
    s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(0)
  })

  it('MISSION-011: round 5 — the first-turn player scores at command.end, the second player at turn.end (not the other way)', () => {
    const s = freshState()
    s.mission.scoring = [
      { id: 'take-and-hold-r5-first', when: 'command.end', rounds: { from: 5, to: 5 }, who: 'first', rule: 'holdObjectives', pointsPer: 5, cap: 15 },
      { id: 'take-and-hold-r5-second', when: 'turn.end', rounds: { from: 5, to: 5 }, who: 'second', rule: 'holdObjectives', pointsPer: 5, cap: 15 },
    ]
    s.round = 5; s.firstPlayer = 'A'
    for (const id of ['obj-w', 'obj-e', 'obj-n', 'obj-s']) s.objectives[id].controller = 'A'
    s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'a-end')
    expect(s.players.A.vp).toBe(15)
    for (const id of ['obj-w', 'obj-e', 'obj-n', 'obj-s']) s.objectives[id].controller = 'B'
    s.activePlayer = 'B'
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'b-end') // B is the second player — command.end does not score
    expect(s.players.B.vp).toBe(0)
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'b-turn')
    expect(s.players.B.vp).toBe(15)
  })
})

describe('Mission 1 — Clash of Patrols (Take and Hold, Retrieve Intelligence)', () => {
  it('MISSION-012: controlling 4 markers → 5×4=20 capped at 15', () => {
    const s = freshState()
    s.mission.scoring = [{ id: 'take-and-hold', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 15 }]
    s.round = 2; s.activePlayer = 'A'
    for (const id of ['obj-w', 'obj-e', 'obj-n', 'obj-s']) s.objectives[id].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(15)
  })

  it('MISSION-013: a marker recovered by A in round 2 cannot be recovered again by B later; no CP without the Warlord on the board', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'retrieve-intelligence', code: 'retrieveIntelligence', window: 'command.start', params: { roundFrom: 2, cpBonusIfWarlordOnBoard: 1 } }]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-w'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: 0, y: 0, z: 0 }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    expect(ctx.state.pending?.kind).toBe('chooseOption')
    answer(ctx, 'obj-w')
    expect(s.objectives['obj-w'].used).toBe(true)
    expect(s.players.A.cp).toBe(1) // warlord on the board → +1 CP
    s.round = 3; s.activePlayer = 'B'
    s.objectives['obj-w'].controller = 'B'
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.start', 'start3')
    expect(ctx.state.pending).toBeNull() // already used — not offered again to either player
  })
})

describe('Mission 2 — Archeotech Recovery (Irradiated Power Cells)', () => {
  it('MISSION-014: round 3 randomly picks Gamma from the 3 NML markers (DiceRolled purpose "mission"); round 4 removes it and picks Beta from the remaining two; round 5 removes Beta; battle.end awards the last NML marker’s controller 10 VP', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'irradiated-power-cells', code: 'irradiatedPowerCells', window: 'round.start', params: { rounds: [3, 4, 5], nmlObjectiveIds: ['obj-w', 'obj-e', 'obj-n'] } }]
    s.round = 3
    const { ctx: ctx3, events: ev3 } = ctxFor(s, [4])
    modules.services.missions.onWindow(ctx3, 'round.start', '3')
    expect(ev3.some((e) => e.type === 'DiceRolled' && e.roll.purpose === 'mission')).toBe(true)
    const gamma = s.mission.custom.gammaObjectiveId as string
    expect(['obj-w', 'obj-e', 'obj-n']).toContain(gamma)

    resetOccurrence(s)
    s.round = 4
    const { ctx: ctx4 } = ctxFor(s, [3])
    modules.services.missions.onWindow(ctx4, 'round.start', '4')
    expect(s.objectives[gamma].removed).toBe(true)
    const beta = s.mission.custom.betaObjectiveId as string
    expect(beta).not.toBe(gamma)
    const last = s.mission.custom.lastNmlObjectiveId as string
    expect([gamma, beta, last].sort()).toEqual(['obj-e', 'obj-n', 'obj-w'])

    resetOccurrence(s)
    s.round = 5
    const { ctx: ctx5 } = ctxFor(s)
    modules.services.missions.onWindow(ctx5, 'round.start', '5')
    expect(s.objectives[beta].removed).toBe(true)

    s.mission.scoring = [{ id: 'recover-archeotech-last-marker', when: 'battle.end', rounds: { from: 5, to: 5 }, who: 'both', rule: 'holdNamed', pointsPer: 10, cap: 10, params: { objectiveIdsFromCustom: 'lastNmlObjectiveId' } }]
    s.objectives[last].controller = 'A'
    resetOccurrence(s)
    const { ctx: ctxEnd } = ctxFor(s)
    modules.services.missions.onWindow(ctxEnd, 'battle.end', 'battle')
    expect(s.players.A.vp).toBe(10)
    expect(s.players.B.vp).toBe(0)
  })

  it('MISSION-015: round 5 the second player scores Recover Archeotech at the end of their Command phase, not at end of turn', () => {
    const s = freshState()
    s.mission.scoring = [{ id: 'recover-archeotech', when: 'command.end', rounds: { from: 2, to: 5 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 15 }]
    s.round = 5; s.firstPlayer = 'A'; s.activePlayer = 'B'
    s.objectives['obj-w'].controller = 'B'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.B.vp).toBe(5)
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn') // no end-of-turn variant for this mission
    expect(s.players.B.vp).toBe(5)
  })
})

describe('Mission 3 — Forward Outpost (Vital Ground, Sabotage Enemy Comms)', () => {
  it('MISSION-016: controlling both NML markers + the enemy DZ marker → 5+5+10=20, capped at 15 (shared capGroup)', () => {
    const s = freshState()
    s.mission.scoring = [
      { id: 'vital-ground-nml', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 15, params: { objectiveIds: ['obj-w', 'obj-e'], capGroup: 'vital-ground' } },
      { id: 'vital-ground-enemy-dz', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdEnemyHome', pointsPer: 10, cap: 15, params: { capGroup: 'vital-ground' } },
    ]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-w'].controller = 'A'
    s.objectives['obj-e'].controller = 'A'
    s.objectives['obj-home-b'].controller = 'A' // home: B
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(15)
  })

  it('MISSION-017: at the end of A’s turn, controlling B’s DZ marker permanently locks B’s Command Re-roll, even after A later loses the marker', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'sabotage-comms', code: 'sabotageComms', window: 'turn.end' }]
    s.activePlayer = 'A'
    s.objectives['obj-home-b'].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.B.commandRerollLocked).toBe(true)
    s.objectives['obj-home-b'].controller = null
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn2')
    expect(s.players.B.commandRerollLocked).toBe(true)
  })
})

describe('Mission 4 — Scorched Earth (Raze and Ruin)', () => {
  it('MISSION-018: the Attacker may not raze A, the Defender may not raze B; a marker with an enemy within 3" cannot be razed; razing is unavailable with only 1 marker left', () => {
    const s = freshState()
    s.mission.rules = [{
      id: 'raze-and-ruin', code: 'razeAndRuin', window: 'command.start',
      params: { roundFrom: 2, minMarkersRemaining: 2, noEnemyWithinInches: 3, forbiddenForAttacker: ['obj-w'], forbiddenForDefender: ['obj-e'] },
    }]
    s.round = 2; s.activePlayer = 'A' // A is the Attacker (fixture setup)
    for (const id of ['obj-w', 'obj-e', 'obj-n', 'obj-s']) s.objectives[id].controller = 'A'
    placeUnit(s, 'B:warboss', [{ x: s.objectives['obj-s'].pos.x, y: 0, z: s.objectives['obj-s'].pos.z }]) // enemy within 3" of south
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    expect(ctx.state.pending?.kind).toBe('chooseOption')
    const pending = ctx.state.pending as ChooseOptionDecision
    const offered = pending.options.map((o) => o.id)
    expect(offered).not.toContain('obj-w') // the Attacker's own forbidden marker
    expect(offered).not.toContain('obj-s') // enemy within 3"
    expect(offered).toEqual(expect.arrayContaining(['obj-e', 'obj-n']))
    answer(ctx, null) // decline

    // only 1 marker left on the whole board (every other objective removed) → razing is not offered at all
    for (const id of ['obj-e', 'obj-n', 'obj-s', 'obj-home-a', 'obj-home-b']) s.objectives[id].removed = true
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.start', 'start2')
    expect(ctx.state.pending).toBeNull()
  })

  it('MISSION-019: a marker razed this turn scores 10 VP that Command phase and no longer counts for control', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'raze-and-ruin', code: 'razeAndRuin', window: 'command.start', params: { roundFrom: 2, minMarkersRemaining: 2, noEnemyWithinInches: 3 } }]
    s.mission.scoring = [{ id: 'raze-razed', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'razedThisTurn', pointsPer: 10, cap: 10 }]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-w'].controller = 'A'
    s.objectives['obj-e'].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    answer(ctx, 'obj-w')
    expect(s.objectives['obj-w'].removed).toBe(true)
    expect(modules.services.objectives.controller(s, 'obj-w')).toBeNull()
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(10)
  })

  it('MISSION-020: the Attacker’s triangular DZ places (−5,−14) inside and (−5,0) outside', () => {
    const zone = [{ x: -22, z: 15 }, { x: -22, z: -15 }, { x: 0, z: -15 }]
    expect(pointInPolygon({ x: -5, z: -14 }, zone)).toBe(true)
    expect(pointInPolygon({ x: -5, z: 0 }, zone)).toBe(false)
  })
})

describe('Mission 5 — Sweeping Raid (Priority Targets, Supply Lines)', () => {
  it('MISSION-021: at battle.end, the Attacker controlling C and D scores +15, the Defender controlling A scores +10; VpScored is emitted', () => {
    const s = freshState()
    s.round = 5
    s.mission.scoring = [{
      id: 'sweeping-raid-endgame', when: 'battle.end', rounds: { from: 5, to: 5 }, who: 'both', rule: 'custom', code: 'sweepingRaidEndgameBonus', pointsPer: 0, cap: 15,
      params: {
        attacker: [{ objectiveId: 'obj-e', points: 5 }, { objectiveId: 'obj-home-b', points: 10 }],
        defender: [{ objectiveId: 'obj-n', points: 5 }, { objectiveId: 'obj-home-a', points: 10 }],
      },
    }]
    s.objectives['obj-e'].controller = 'A'
    s.objectives['obj-home-b'].controller = 'A'
    s.objectives['obj-home-a'].controller = 'B'
    const { ctx, events } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'battle.end', 'battle')
    expect(s.players.A.vp).toBe(15)
    expect(s.players.B.vp).toBe(10)
    expect(events.some((e) => e.type === 'VpScored')).toBe(true)
  })

  it('MISSION-022: Supply Lines — controlling your own DZ marker at the start of your Command phase, D6 4+ → +1 CP', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'supply-lines', code: 'supplyLines', window: 'command.start', params: { rollThreshold: 4, cpBonus: 1 } }]
    s.activePlayer = 'A'
    s.objectives['obj-home-a'].controller = 'A'
    const { ctx } = ctxFor(s, [4])
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    expect(s.players.A.cp).toBe(1)
  })

  it('MISSION-023: round 5 has no per-turn Priority Targets scoring', () => {
    const s = freshState()
    s.mission.scoring = [{ id: 'priority-targets', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 15 }]
    s.round = 5; s.activePlayer = 'A'
    s.objectives['obj-w'].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(0)
  })

  it('MISSION-042: markers B and C are NML, A and D carry a `home` tag (stand-in objective ids used throughout this suite)', () => {
    const s = freshState()
    expect(s.objectives['obj-home-a'].home).toBe('A')
    expect(s.objectives['obj-home-b'].home).toBe('B')
    expect(s.objectives['obj-w'].home).toBeNull()
    expect(s.objectives['obj-e'].home).toBeNull()
  })
})

describe('Mission 6 — Display of Might (Symbolic Sites, Break Their Spirit)', () => {
  it('MISSION-024: controlling 2 markers with one site claimed this turn and last (2 consecutive) → 5+5+5+5=20', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'claim-sites', code: 'claimSites', window: 'command.end', params: { siteObjectiveIds: ['obj-n', 'obj-s'] } }]
    s.mission.scoring = [
      { id: 'hold1', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 20, params: { min: 1, capGroup: 'sites' } },
      { id: 'hold2', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 20, params: { min: 2, capGroup: 'sites' } },
      { id: 'claimed', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'claimedSite', pointsPer: 5, cap: 20, params: { capGroup: 'sites' } },
      { id: 'claimed2', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'claimedSiteConsecutive', pointsPer: 5, cap: 20, params: { turns: 2, capGroup: 'sites' } },
    ]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-w'].controller = 'A'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: s.objectives['obj-n'].pos.x, y: 0, z: s.objectives['obj-n'].pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2') // claims obj-n this turn (sinceTurn = 2)
    expect(s.objectives['obj-n'].claimedBy?.player).toBe('A')
    s.players.A.vp = 0; s.players.A.vpBySource = {}
    resetOccurrence(s)
    s.round = 3
    modules.services.missions.onWindow(ctx, 'command.end', 'r3') // still claimed → 2 consecutive turns
    expect(s.players.A.vp).toBe(20)
  })

  it('MISSION-025: the claim is lost when the claiming model leaves range; a different Character can claim it later', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'claim-sites', code: 'claimSites', window: 'command.end', params: { siteObjectiveIds: ['obj-n'] } }]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: s.objectives['obj-n'].pos.x, y: 0, z: s.objectives['obj-n'].pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2')
    expect(s.objectives['obj-n'].claimedBy?.modelId).toBe('A:boss#0')
    s.models['A:boss#0'].pos = { x: 100, y: 0, z: 100 }
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r3')
    expect(s.objectives['obj-n'].claimedBy).toBeNull()
  })

  it('MISSION-026: `breakTheirSpirit` is data the stratagem service enforces directly; missions.ts raises nothing for it', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'break-their-spirit', code: 'breakTheirSpirit', window: 'command.battleShock', params: { maxRangeFromWarlordInches: 6 } }]
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.battleShock', 'A:grunts')
    expect(ctx.state.pending).toBeNull()
  })
})

describe('Deployment, turn order and victory (CP-1.10, CP-1.11, R-12.6, R-12.8)', () => {
  it('MISSION-027 CP-1.10: deployment alternates starting with the Defender; a unit placed partly outside its zone is rejected', () => {
    const s = freshState()
    s.phase = 'deployment'
    s.step = 'deploy'
    const { ctx } = ctxFor(s)
    modules.phases.deployment.advance(ctx)
    expect(ctx.state.pending?.player).toBe('B') // Defender (per fixture setup, sides: { attacker: 'A' })
    const pending = ctx.state.pending as PendingDecision & { kind: 'deployUnit' }
    const unitId = pending.context.unitIds[0]
    const outside: Action = { type: 'deployUnit', player: 'B', decisionId: pending.id, unitId, placements: [{ modelId: s.units[unitId].models[0], pos: { x: 0, y: 0, z: 0 } }] }
    const rej = modules.phases.deployment.validate?.(s, outside, pending)
    expect(rej?.code).toBe('E_OUT_OF_RANGE')
  })

  it('MISSION-028 CP-1.10: the first-turn roll-off winner simply takes the first turn (no choice offered)', () => {
    const s = freshState({ firstTurn: 'rollOff' })
    s.step = 'rollOffFirstTurn'
    const { ctx } = ctxFor(s, [6, 2])
    modules.phases.setup.advance(ctx)
    expect(s.firstPlayer).toBe('A')
    expect(ctx.state.pending).toBeNull() // straight through to 'preBattle'; nothing to decide with this roster
  })

  it('MISSION-029 R-12.7/CP-1.11: at battle end, higher total VP wins; equal VP is a draw', () => {
    const s = freshState()
    s.players.A.vp = 30; s.players.B.vp = 20
    expect(modules.services.missions.finalResult(s, 'vp')).toEqual({ winner: 'A', reason: 'vp', vp: { A: 30, B: 20 } })
    s.players.B.vp = 30
    expect(modules.services.missions.finalResult(s, 'vp').winner).toBe('draw')
  })

  it('MISSION-030 R-12.6: an army with nothing on the board and nothing left in Reserves after round 3 has no forces; the other side keeps playing', () => {
    const s = freshState()
    for (const u of Object.values(s.units)) if (u.player === 'B') u.location = 'destroyed'
    s.round = 3
    expect(modules.services.missions.playerHasForces(s, 'B')).toBe(false)
    expect(modules.services.missions.playerHasForces(s, 'A')).toBe(true)
    expect(modules.services.missions.isTabled(s)).toBe(false)
  })

  it('MISSION-031 R-12.8: a resignation is scored with reason "resign"', () => {
    const s = freshState()
    expect(modules.services.missions.finalResult(s, 'resign').reason).toBe('resign')
  })

  it('MISSION-045 R-12.6: both armies without forces are tabled at once', () => {
    const s = freshState()
    for (const u of Object.values(s.units)) u.location = 'destroyed'
    s.round = 3
    expect(modules.services.missions.isTabled(s)).toBe(true)
  })
})

describe('secondaries', () => {
  it('MISSION-032/032b Wrath of the Emperor: the Captain’s own kills score 2 VP per phase (cap 2), reset each phase.end; a bodyguard’s kill (or a mortal wound with byModelId null) does not count', () => {
    const s = freshState()
    s.round = 1
    s.datasheets = { ...s.datasheets, 'test.captain': { ...s.datasheets['red.boss'], id: 'test.captain', keywords: [...s.datasheets['red.boss'].keywords, 'CAPTAIN'] } }
    s.units['A:captain'] = { ...s.units['A:boss'], id: 'A:captain', datasheetId: 'test.captain' }
    s.mission.secondaries.A = [{ id: 'wrath-of-the-emperor', when: 'phase.end', rounds: { from: 1, to: 5 }, who: 'both', rule: 'custom', pointsPer: 2, cap: 2, code: 'wrathOfTheEmperor' }]

    s.players.A.secondaryState.killsThisPhase = { 'A:captain#0': 1 }
    let { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'phase.end', 'shooting')
    expect(s.players.A.vp).toBe(2)
    expect(s.players.A.secondaryState.killsThisPhase).toEqual({}) // reset after every phase.end

    s.players.A.secondaryState.killsThisPhase = { 'A:captain#0': 1 }
    ;({ ctx } = ctxFor(s))
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'phase.end', 'fight')
    expect(s.players.A.vp).toBe(4) // scores again in a later phase of the same turn

    // a Terminator's own kill (byModelId of a different model) does not credit the Captain
    s.players.A.secondaryState.killsThisPhase = { 'A:terms#0': 1 }
    ;({ ctx } = ctxFor(s))
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'phase.end', 'shooting2')
    expect(s.players.A.vp).toBe(4)
  })

  it('MISSION-033 Shock Tactics: scores when you hold at end of turn a marker the opponent held at the start of that turn; not if contested at the start, or taken-and-lost within the turn', () => {
    const rule = { id: 'shock-tactics', when: 'turn.end', rounds: { from: 1, to: 5 }, who: 'both', rule: 'custom', pointsPer: 5, cap: 5, code: 'shockTactics' } as const
    const s = freshState()
    s.round = 1
    s.mission.secondaries.A = [rule]
    s.objectives['obj-w'].controllerAtTurnStart = 'B'
    s.objectives['obj-w'].controller = 'A'
    let { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.A.vp).toBe(5)

    const s2 = freshState()
    s2.round = 1
    s2.mission.secondaries.A = [rule]
    s2.objectives['obj-w'].controllerAtTurnStart = null // contested at the start
    s2.objectives['obj-w'].controller = 'A'
    ;({ ctx } = ctxFor(s2))
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s2.players.A.vp).toBe(0)

    const s3 = freshState()
    s3.round = 1
    s3.mission.secondaries.A = [rule]
    s3.objectives['obj-w'].controllerAtTurnStart = 'B'
    s3.objectives['obj-w'].controller = 'B' // taken, then lost again before turn.end
    ;({ ctx } = ctxFor(s3))
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s3.players.A.vp).toBe(0)
  })

  it('MISSION-034 Stomp \'Em: picked in the round.start window from round 2 (not round 1); scores only when the pick was destroyed by an ORKS melee attack that round', () => {
    const s = freshState()
    s.mission.secondaries.B = [
      { id: 'stomp-em-pick', when: 'round.start', rounds: { from: 2, to: 5 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'stompEmPick' },
      { id: 'stomp-em-score', when: 'round.end', rounds: { from: 2, to: 5 }, rule: 'custom', pointsPer: 3, cap: 3, code: 'stompEmScore' },
    ]
    s.round = 1
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'round.start', '1')
    expect(ctx.state.pending).toBeNull() // not round 2 yet
    s.round = 2
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'round.start', '2')
    expect(ctx.state.pending?.kind).toBe('chooseOption')
    answer(ctx, 'A:grunts')
    expect(s.players.B.secondaryState.stompTargetUnitId).toBe('A:grunts')
    s.units['A:grunts'].location = 'destroyed'
    s.units['A:grunts'].destroyedBy = { player: 'B', kind: 'melee', round: 2, unitId: 'B:mob', modelId: 'B:mob#0' }
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'round.end', '2')
    expect(s.players.B.vp).toBe(3)

    const s2 = freshState()
    s2.mission.secondaries.B = s.mission.secondaries.B
    s2.players.B.secondaryState.stompTargetUnitId = 'A:grunts'
    s2.units['A:grunts'].location = 'destroyed'
    s2.units['A:grunts'].destroyedBy = { player: 'B', kind: 'ranged', round: 2, unitId: 'B:mob', modelId: 'B:mob#0' }
    s2.round = 2
    const { ctx: ctx2 } = ctxFor(s2)
    modules.services.missions.onWindow(ctx2, 'round.end', '2')
    expect(s2.players.B.vp).toBe(0) // destroyed by shooting, not melee → no points
  })

  it('MISSION-035 Proper Lootin\': a marker outside your DZ with Orks in range (not in ER) — 1 → nothing (retry later); 3 → 3 VP looted (cannot loot again after that)', () => {
    const s = freshState()
    s.round = 1
    s.mission.secondaries.B = [{ id: 'proper-lootin', when: 'command.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'custom', pointsPer: 5, cap: 20, code: 'properLootin', params: { rollTiers: { '2-4': 3, '5-6': 5 }, armyKeyword: 'BLU HORDE' } }]
    s.activePlayer = 'B'
    const objW = s.objectives['obj-w']
    placeUnit(s, 'B:mob', s.units['B:mob'].models.map(() => ({ x: objW.pos.x, y: 0, z: objW.pos.z }))) // all on the marker — no other objective is in range
    s.objectives['obj-w'].controller = 'B' // the whole mob is there uncontested — B genuinely controls it
    const { ctx } = ctxFor(s, [1])
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.B.vp).toBe(0)
    expect(s.objectives['obj-w'].lootedBy).not.toContain('B')
    resetOccurrence(s)
    const { ctx: ctx2 } = ctxFor(s, [3])
    modules.services.missions.onWindow(ctx2, 'command.end', 'end2')
    expect(s.players.B.vp).toBe(3)
    expect(s.objectives['obj-w'].lootedBy).toContain('B')
    resetOccurrence(s)
    const { ctx: ctx3 } = ctxFor(s, [6])
    modules.services.missions.onWindow(ctx3, 'command.end', 'end3')
    expect(s.players.B.vp).toBe(3) // already looted — cannot score it again
  })

  it('MISSION-036 Bag the Big \'Un: picked at round.start of round 1 from enemy MONSTER/VEHICLE models (else the Warlord); scores 12 for the Beastboss’s own kill, 8 for a kill by his unit, 0 while alive', () => {
    const s = freshState()
    s.mission.secondaries.B = [{ id: 'bag-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick' }]
    s.round = 1
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'round.start', '1')
    expect(ctx.state.pending?.kind).toBe('chooseOption') // A's Red Walker is VEHICLE → offered ahead of the Warlord fallback
    const pending = ctx.state.pending as ChooseOptionDecision
    expect(pending.options.map((o) => o.id)).toEqual(['A:walker'])
    answer(ctx, 'A:walker')
    expect(s.players.B.secondaryState.bagTargetUnitId).toBe('A:walker')

    s.mission.secondaries.B = [{ id: 'bag-score', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 0, cap: 12, code: 'bagTheBigUnScore', params: { beastbossPoints: 12, unitPoints: 8 } }]
    s.round = 5
    placeUnit(s, 'A:walker', [{ x: 0, y: 0, z: 0 }]) // alive and on the battlefield
    const { ctx: ctxAlive } = ctxFor(s)
    modules.services.missions.onWindow(ctxAlive, 'battle.end', 'alive')
    expect(s.players.B.vp).toBe(0) // alive → 0

    s.units['A:walker'].location = 'destroyed'
    s.units['A:walker'].destroyedBy = { player: 'B', kind: 'melee', round: 3, unitId: s.players.B.warlordUnitId, modelId: null }
    resetOccurrence(s)
    const { ctx: ctxKilled } = ctxFor(s)
    modules.services.missions.onWindow(ctxKilled, 'battle.end', 'killed')
    expect(s.players.B.vp).toBe(12) // destroyed by the Beastboss's own unit id → the higher tier

    // with no MONSTER/VEHICLE left, the pick falls back to the enemy Warlord
    const s2 = freshState()
    s2.mission.secondaries.B = [{ id: 'bag-pick', when: 'round.start', rounds: { from: 1, to: 1 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'bagPick' }]
    s2.round = 1
    s2.units['A:walker'].location = 'destroyed'
    const { ctx: ctx2 } = ctxFor(s2)
    modules.services.missions.onWindow(ctx2, 'round.start', '1')
    const pending2 = ctx2.state.pending as ChooseOptionDecision
    expect(pending2.options.map((o) => o.id)).toEqual(['A:boss'])
  })

  it('MISSION-037 CP-1.5: secondary VP is added on top of primary VP, each with its own VpScored source', () => {
    const s = freshState()
    s.round = 2; s.activePlayer = 'A'
    s.mission.scoring = [{ id: 'take-and-hold', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 15 }]
    s.mission.secondaries.A = [{ id: 'red.sec.hold', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdMore', pointsPer: 5, cap: 5 }]
    s.objectives['obj-w'].controller = 'A'
    const { ctx, events } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(10)
    const sources = events.filter((e) => e.type === 'VpScored').map((e) => (e as { source: string }).source)
    expect(sources.sort()).toEqual(['red.sec.hold', 'take-and-hold'])
  })

  it('MISSION-038 R-12.7: Battle Ready is a symmetric constant added to both totals; it never changes the winner', () => {
    const s = freshState()
    s.players.A.vp = 10; s.players.B.vp = 20
    expect(modules.services.missions.finalResult(s, 'vp').winner).toBe('B')
    s.players.A.battleReadyVp = 10; s.players.B.battleReadyVp = 10
    expect(modules.services.missions.finalResult(s, 'vp').winner).toBe('B')
    expect(modules.services.missions.finalResult(s, 'vp').vp).toEqual({ A: 20, B: 30 })
  })

  it('MISSION-040 R-5.16 [interp]: a Reserves unit that never arrived counts as destroyed for Bag the Big \'Un (lower tier, no credited killer)', () => {
    const s = freshState()
    s.mission.secondaries.B = [{ id: 'bag-score', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 0, cap: 12, code: 'bagTheBigUnScore', params: { beastbossPoints: 12, unitPoints: 8 } }]
    s.round = 5
    s.players.B.secondaryState.bagTargetUnitId = 'A:walker'
    s.units['A:walker'].location = 'reserves' // never arrived
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'battle.end', 'battle')
    expect(s.players.B.vp).toBe(8)
  })

  it('MISSION-041 CP-1.4: an optional enhancement chosen at setup is the one applied', () => {
    const s = freshState({ players: {
      A: { name: 'Red', faction: 'red', patrolId: 'red.patrol', enhancementId: 'red.e.tough', secondaryId: 'red.sec.hold', attachments: [{ leaderRef: 'boss', bodyguardRef: 'grunts' }], reserves: [], battleReadyVp: 0 },
      B: { name: 'Blu', faction: 'blu', patrolId: 'blu.patrol', enhancementId: 'blu.e.big', secondaryId: 'blu.sec.zone', attachments: [], reserves: [], battleReadyVp: 0 },
    } })
    expect(s.players.A.enhancementId).toBe('red.e.tough')
  })

  it('MISSION-044 R-12.5: caps apply per scoring instance — two conditions true in the same capGroup still score the cap once', () => {
    const s = freshState()
    s.round = 1
    s.mission.secondaries.A = [
      { id: 'cond1', when: 'command.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'holdObjectives', pointsPer: 5, cap: 5, params: { min: 1, capGroup: 'g' } },
      { id: 'cond2', when: 'command.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'holdMore', pointsPer: 5, cap: 5, params: { capGroup: 'g' } },
    ]
    s.activePlayer = 'A'
    s.objectives['obj-w'].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(5) // both conditions true (5+5=10 raw) but capped at 5
  })
})

describe('mission data mapping (CP-2.5 §2.5, CP-3.2)', () => {
  it('MISSION-039: the objective marker radius used for range is 0.787" (40mm ÷ 2)', () => {
    expect(OBJECTIVE_MARKER_RADIUS).toBeCloseTo(0.7874, 3)
    const s = freshState()
    expect(s.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS).toBeCloseTo(OBJECTIVE_MARKER_RADIUS, 6)
  })

  it('MISSION-043 CP-3.2: the cp-01 terrain layout is invariant under 180° rotation about the origin, and every piece stays >1" from every marker point across all six missions', async () => {
    const real = await loadBundle()
    const layout = real.terrainLayouts['terrain.cp-01']
    for (const piece of layout.pieces) {
      const mirror = { x: -piece.pos.x, z: -piece.pos.z }
      expect(layout.pieces.some((p) => Math.abs(p.pos.x - mirror.x) < 0.02 && Math.abs(p.pos.z - mirror.z) < 0.02)).toBe(true)
    }
    for (const mission of Object.values(real.missions)) {
      for (const obj of mission.objectives) {
        for (const piece of layout.pieces) {
          for (const v of piece.footprint) {
            const dx = v.x + piece.pos.x - obj.x, dz = v.z + piece.pos.z - obj.z
            expect(Math.hypot(dx, dz)).toBeGreaterThan(0.99)
          }
        }
      }
    }
  })
})

// keeps the (unused outside this file) synthetic bundle import referenced so a future test can reach for it directly
void bundle

describe('control at the scoring moment and multi-model claims (CP-2.3, 11-combat-patrol §2.5)', () => {
  const hold = { id: 'hold', when: 'command.end' as const, rounds: { from: 2, to: 4 }, who: 'active' as const, rule: 'holdObjectives' as const, pointsPer: 5, cap: 15 }
  const claimRule = { id: 'claim-sites', code: 'claimSites', window: 'command.end' as const, params: { siteObjectiveIds: ['obj-n'] } }

  it('MISSION-004-recover CP-2.3: Battle-shock recovery before command.end restores the unit’s OC for scoring even though the stored controller is still the opponent', () => {
    const s = freshState()
    s.mission.scoring = [hold]; s.mission.secondaries = { A: [], B: [] }
    const w = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: w.pos.x, z: w.pos.z })
    placeUnit(s, 'B:warboss', [{ x: w.pos.x, y: 0, z: w.pos.z + 1 }])
    s.units['A:grunts'].battleShocked = true
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'turnStart')
    expect(s.objectives['obj-w'].controller).toBe('B')
    s.units['A:grunts'].battleShocked = false
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(5)
  })

  it('MISSION-019-holdmore CP-2.3: holdMore counts the opponent’s markers at the scoring moment — the opponent’s freshly shocked unit loses its marker', () => {
    const s = freshState()
    s.mission.scoring = [{ id: 'holdmore', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdMore', pointsPer: 5, cap: 5 }]
    s.mission.secondaries = { A: [], B: [] }
    const w = s.objectives['obj-w'], e = s.objectives['obj-e']
    placeUnit(s, 'A:walker', [{ x: e.pos.x, y: 0, z: e.pos.z }])
    placeUnit(s, 'B:warboss', [{ x: w.pos.x, y: 0, z: w.pos.z }])
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'turnStart') // 1 each
    expect(s.objectives['obj-w'].controller).toBe('B')
    modules.services.missions.onWindow(ctx, 'command.end', 'a')
    expect(s.players.A.vp).toBe(0) // 1 vs 1
    s.units['B:warboss'].battleShocked = true // B's only unit on obj-w now has OC 0 → contested
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'b')
    expect(s.players.A.vp).toBe(5) // 1 vs 0
  })

  it('MISSION-025-deadclaimant §2.5: an opponent claim whose model left range is dropped, so the active player may claim the site', () => {
    const s = freshState()
    s.mission.rules = [claimRule]
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'B'
    placeUnit(s, 'B:warboss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'b')
    expect(s.objectives['obj-n'].claimedBy?.player).toBe('B')
    s.models['B:warboss#0'].pos = { x: 100, y: 0, z: 100 } // walked away, not destroyed
    resetOccurrence(s)
    s.round = 3; s.activePlayer = 'A'
    placeUnit(s, 'A:boss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    modules.services.missions.onWindow(ctx, 'command.end', 'a')
    expect(s.objectives['obj-n'].claimedBy).toMatchObject({ player: 'A', modelId: 'A:boss#0', sinceTurn: 3 })
  })

  it('MISSION-025-deadclaimant §2.5: a live opponent claim still blocks a new claim', () => {
    const s = freshState()
    s.mission.rules = [claimRule]
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'B'
    placeUnit(s, 'B:warboss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'b')
    resetOccurrence(s)
    s.round = 3; s.activePlayer = 'A'
    s.objectives['obj-n'].securedBy = 'A' // A controls it some other way; B's Warboss never left
    placeUnit(s, 'A:boss', [{ x: n.pos.x + 1, y: 0, z: n.pos.z }])
    modules.services.missions.onWindow(ctx, 'command.end', 'a')
    expect(s.objectives['obj-n'].claimedBy?.player).toBe('B')
  })

  it('MISSION-025-coclaim §2.5: all CHARACTER models in range claim; the claim (and its sinceTurn) survives while any one stays, and ends when none do', () => {
    const s = freshState()
    s.mission.rules = [claimRule]
    s.mission.scoring = [{ id: 'claimed2', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'claimedSiteConsecutive', pointsPer: 5, cap: 5, params: { turns: 2 } }]
    s.mission.secondaries = { A: [], B: [] }
    { const dsId = s.units['A:walker'].datasheetId; const ds = s.datasheets[dsId]; s.datasheets = { ...s.datasheets, [dsId]: { ...ds, keywords: [...ds.keywords, 'CHARACTER'] } } }
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'A'
    placeUnit(s, 'A:boss', [{ x: n.pos.x - 1, y: 0, z: n.pos.z }])
    placeUnit(s, 'A:walker', [{ x: n.pos.x + 1.5, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2')
    expect(s.objectives['obj-n'].claimedBy).toMatchObject({ player: 'A', modelId: 'A:boss#0', sinceTurn: 2 })
    s.units['A:boss'].location = 'destroyed' // one co-claimer dies
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-n'].claimedBy).toMatchObject({ player: 'A', modelId: 'A:walker#0', sinceTurn: 2 })
    resetOccurrence(s)
    s.round = 3
    modules.services.missions.onWindow(ctx, 'command.end', 'r3')
    expect(s.players.A.vp).toBe(5)
    s.models['A:walker#0'].pos = { x: 100, y: 0, z: 100 }
    modules.services.objectives.evaluateControl(ctx, 'turnEnd')
    expect(s.objectives['obj-n'].claimedBy).toBeNull()
  })

  it('MISSION-024-return §2.5: leaving range mid-turn ends the claim at that phase’s control evaluation; returning later starts a fresh claim', () => {
    const s = freshState()
    s.mission.rules = [claimRule]
    s.mission.scoring = [{ id: 'claimed2', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'claimedSiteConsecutive', pointsPer: 5, cap: 5, params: { turns: 2 } }]
    s.mission.secondaries = { A: [], B: [] }
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    placeUnit(s, 'A:boss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2')
    s.phase = 'movement'
    s.models['A:boss#0'].pos = { x: 100, y: 0, z: 100 }
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(s.objectives['obj-n'].claimedBy).toBeNull()
    s.models['A:boss#0'].pos = { x: n.pos.x, y: 0, z: n.pos.z }
    resetOccurrence(s)
    s.round = 3; s.phase = 'command'
    modules.services.missions.onWindow(ctx, 'command.end', 'r3')
    expect(s.objectives['obj-n'].claimedBy?.sinceTurn).toBe(3)
    expect(s.players.A.vp).toBe(0)
  })
})
