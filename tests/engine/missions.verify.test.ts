// Adversarial verification of setup.ts / objectives.ts / missions.ts against 11-combat-patrol §1–2 and 10-rules §12.
import { describe, expect, it } from 'vitest'
import {
  createContext, DEFAULT_MODULES, ScriptedRng,
  type Action, type ChooseOptionDecision, type EngineContext, type GameState, type PendingDecision,
} from '../../src/engine'
import { freshState, placeUnit } from '../fixtures'

const modules = DEFAULT_MODULES

function ctxFor(state: GameState, dice: number[] = []) {
  return createContext(state, new ScriptedRng(dice), modules)
}

function answer(ctx: EngineContext, optionId: string | null): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const action: Action = optionId === null
    ? { type: 'pass', player: pending.player, decisionId: pending.id }
    : { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }
  modules.services.missions.handler.handle(ctx, action, pending as PendingDecision)
}

function resetOccurrence(state: GameState): void { state.phaseState.marks = [] }

describe('verify: objective control', () => {
  it('MISSION-004-scoring CP-2.3: a unit that failed Battle-shock earlier in this Command phase has OC 0 when the primary is scored at command.end', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'turnStart') // start of turn: A controls obj-w
    expect(s.objectives['obj-w'].controller).toBe('A')
    s.units['A:grunts'].battleShocked = true // failed its Battle-shock test in this Command phase
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(0) // CP-2.3: control evaluated at the scoring moment → LoC 0 vs 0 → nothing held
  })

  it('MISSION-008-control CP-2.5: while secured the marker counts as controlled by the securer at every evaluation, even when the opponent has higher LoC outside a Command phase end', () => {
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
    expect(s.objectives['obj-w'].controller).toBe('A')
  })
})

describe('verify: mission rules', () => {
  it('MISSION-014-uniform Irradiated Power Cells: Beta is picked uniformly among the two remaining NML markers', () => {
    const counts: Record<string, number> = {}
    for (let face = 1; face <= 6; face++) {
      const s = freshState()
      s.mission.rules = [{ id: 'ipc', code: 'irradiatedPowerCells', window: 'round.start', params: { rounds: [3, 4, 5], nmlObjectiveIds: ['obj-w', 'obj-e', 'obj-n'] } }]
      s.round = 4
      s.mission.custom.gammaObjectiveId = 'obj-w'
      const { ctx } = ctxFor(s, [face, face, face])
      modules.services.missions.onWindow(ctx, 'round.start', '4')
      const beta = s.mission.custom.betaObjectiveId as string
      counts[beta] = (counts[beta] ?? 0) + 1
    }
    expect(counts['obj-e']).toBe(3)
    expect(counts['obj-n']).toBe(3)
  })

  it('MISSION-025-persist Claim Sites: a claim stays while the claiming model stays within range, even if the site is not controlled at a later Command phase end', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'claim-sites', code: 'claimSites', window: 'command.end', params: { siteObjectiveIds: ['obj-n'] } }]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: s.objectives['obj-n'].pos.x, y: 0, z: s.objectives['obj-n'].pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2')
    expect(s.objectives['obj-n'].claimedBy?.modelId).toBe('A:boss#0')
    s.round = 3
    s.objectives['obj-n'].controller = null // contested now, the Boss never left
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r3')
    expect(s.objectives['obj-n'].claimedBy?.modelId).toBe('A:boss#0')
  })

  it('MISSION-025-leave Claim Sites: a claim whose model left range during the turn does not score at the round-5 second player end-of-turn scoring', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'claim-sites', code: 'claimSites', window: 'command.end', params: { siteObjectiveIds: ['obj-n'] } }]
    s.mission.scoring = [{ id: 'claimed-r5-second', when: 'turn.end', rounds: { from: 5, to: 5 }, who: 'second', rule: 'claimedSite', pointsPer: 5, cap: 20 }]
    s.mission.secondaries = { A: [], B: [] }
    s.round = 5; s.firstPlayer = 'B'; s.activePlayer = 'A'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: s.objectives['obj-n'].pos.x, y: 0, z: s.objectives['obj-n'].pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r5')
    expect(s.objectives['obj-n'].claimedBy?.player).toBe('A')
    s.models['A:boss#0'].pos = { x: 100, y: 0, z: 100 } // walks away in the Movement phase
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.A.vp).toBe(0)
  })
})

describe('verify: secondaries', () => {
  it("MISSION-035-control Proper Lootin': a marker the Orks do not control cannot be looted", () => {
    const s = freshState()
    s.round = 2
    s.mission.secondaries.B = [{ id: 'proper-lootin', when: 'command.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'custom', pointsPer: 5, cap: 20, code: 'properLootin', params: { rollTiers: { '2-4': 3, '5-6': 5 }, armyKeyword: 'BLU HORDE' } }]
    s.activePlayer = 'B'
    const objW = s.objectives['obj-w']
    placeUnit(s, 'B:mob', s.units['B:mob'].models.map(() => ({ x: objW.pos.x, y: 0, z: objW.pos.z })))
    s.objectives['obj-w'].controller = 'A' // held by the opponent (e.g. secured) — B does not control it
    s.objectives['obj-w'].securedBy = 'A' // CP-2.3/R-12.3: control is live at the scoring moment, so the hold must really be a secure
    const { ctx } = ctxFor(s, [5, 5, 5])
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.B.vp).toBe(0)
    expect(s.objectives['obj-w'].lootedBy).not.toContain('B')
  })

  it("MISSION-034-rescore Stomp 'Em: a target destroyed in round 2 does not score again at the end of round 3", () => {
    const s = freshState()
    s.mission.secondaries.B = [
      { id: 'stomp-em-pick', when: 'round.start', rounds: { from: 2, to: 5 }, rule: 'custom', pointsPer: 0, cap: 0, code: 'stompEmPick' },
      { id: 'stomp-em-score', when: 'round.end', rounds: { from: 2, to: 5 }, rule: 'custom', pointsPer: 3, cap: 3, code: 'stompEmScore' },
    ]
    s.mission.secondaries.A = []
    s.round = 2
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'round.start', '2')
    answer(ctx, 'A:grunts')
    s.units['A:grunts'].location = 'destroyed'
    s.units['A:grunts'].destroyedBy = { player: 'B', kind: 'melee', round: 2, unitId: 'B:mob', modelId: 'B:mob#0' }
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'round.end', '2')
    expect(s.players.B.vp).toBe(3)
    s.round = 3
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'round.start', '3')
    if (ctx.state.pending) answer(ctx, null) // B declines a new pick
    resetOccurrence(s)
    modules.services.missions.onWindow(ctx, 'round.end', '3')
    expect(s.players.B.vp).toBe(3)
  })

  it("MISSION-036-anykiller Bag the Big 'Un: 8 VP when the target is destroyed by any unit (12 only for the Beastboss)", () => {
    const s = freshState()
    s.mission.secondaries.B = [{ id: 'bag-score', when: 'battle.end', rounds: { from: 5, to: 5 }, rule: 'custom', pointsPer: 0, cap: 12, code: 'bagTheBigUnScore', params: { beastbossPoints: 12, unitPoints: 8 } }]
    s.mission.secondaries.A = []
    s.players.B.secondaryState.bagTargetUnitId = 'A:walker'
    s.round = 5
    s.units['A:walker'].location = 'destroyed'
    s.units['A:walker'].destroyedBy = { player: 'B', kind: 'ranged', round: 3, unitId: 'B:kopta', modelId: 'B:kopta#0' }
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'battle.end', 'battle')
    expect(s.players.B.vp).toBe(8)
  })
})

describe('verify: deployment (CP-1.10)', () => {
  function stepDeploy(ctx: EngineContext, action: Action): void {
    const s = ctx.state
    const pending = s.pending as PendingDecision
    s.pending = null
    const rej = modules.phases.deployment.handle(ctx, action, pending)
    expect(rej).toBeFalsy()
    modules.phases.deployment.advance(ctx)
  }

  it('MISSION-027-reserves: a unit set into Reserves during deployment is not offered again and the turn to deploy passes to the other player', () => {
    const s = freshState()
    s.phase = 'deployment'; s.step = 'deploy'
    const { ctx } = ctxFor(s)
    modules.phases.deployment.advance(ctx)
    const pending = ctx.state.pending as PendingDecision & { kind: 'deployUnit' }
    expect(pending.player).toBe('B')
    expect(pending.context.reservesAllowed).toContain('B:warboss')
    stepDeploy(ctx, { type: 'deployUnit', player: 'B', decisionId: pending.id, unitId: 'B:warboss', placements: [], toReserves: true } as Action)
    const next = ctx.state.pending as PendingDecision & { kind: 'deployUnit' }
    expect(next?.kind).toBe('deployUnit')
    expect(next.player).toBe('A')
    expect(Object.values(s.units).filter((u) => u.player === 'B').flatMap((u) => u.id === 'B:warboss' ? [] : [u.id])).not.toContain('B:warboss')
  })

  it('MISSION-027-attached R-10.1: a Leader attached to a bodyguard deploys with it as one unit (one deployment drop, both on the board)', () => {
    const s = freshState()
    s.phase = 'deployment'; s.step = 'deploy'
    const { ctx } = ctxFor(s)
    modules.phases.deployment.advance(ctx)
    const dropsA: string[] = []
    for (let i = 0; i < 20 && ctx.state.pending?.kind === 'deployUnit'; i++) {
      const p = ctx.state.pending
      const acts = modules.phases.deployment.legalActions?.(s, p) ?? []
      expect(acts.length).toBeGreaterThan(0)
      const act = acts[0] as Action & { unitId: string }
      if (p.player === 'A') dropsA.push(act.unitId)
      stepDeploy(ctx, act)
    }
    expect(s.units['A:boss'].location).toBe('board')
    expect(dropsA).toHaveLength(2) // Boss+Grunts as one unit, then the Walker
  })
})

// ---------------- adversarial round 2 ----------------
describe('verify r2: control at the scoring moment (CP-2.3)', () => {
  it('MISSION-004-recover CP-2.3/R-4.3: a unit that recovers from Battle-shock at the start of its Command phase counts its OC again when the primary is scored at command.end', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    placeUnit(s, 'B:warboss', [{ x: obj.pos.x, y: 0, z: obj.pos.z + 1 }]) // OC 1
    s.units['A:grunts'].battleShocked = true // shocked last round
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'turnStart') // A 0 vs B 1 → B
    expect(s.objectives['obj-w'].controller).toBe('B')
    s.units['A:grunts'].battleShocked = false // recoverExpiredShock at the start of A's Command phase
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(5) // at the scoring moment A's LoC ≥ 2 > 1
  })

  it('MISSION-019-holdmore CP-2.3: Raze and Ruin "control more markers" counts a marker the opponent controls at the scoring moment because the scorer was just Battle-shocked', () => {
    const s = freshState()
    s.mission.scoring = [{ id: 'holdmore', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'holdMore', pointsPer: 5, cap: 5 }]
    s.mission.secondaries = { A: [], B: [] }
    const w = s.objectives['obj-w'], e = s.objectives['obj-e']
    placeUnit(s, 'A:walker', [{ x: e.pos.x, y: 0, z: e.pos.z }])
    placeUnit(s, 'A:grunts', { x: w.pos.x, z: w.pos.z })
    placeUnit(s, 'B:warboss', [{ x: w.pos.x, y: 0, z: w.pos.z + 1 }])
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'turnStart') // A holds both
    s.units['A:grunts'].battleShocked = true // fails its test this Command phase → B controls obj-w now
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(0) // 1 vs 1 → not more
  })

  it('MISSION-011-secured-shock CP-2.5: a marker secured by A still scores for A while A’s only unit there is Battle-shocked', () => {
    const s = freshState()
    const obj = s.objectives['obj-w']
    placeUnit(s, 'A:grunts', { x: obj.pos.x, z: obj.pos.z })
    s.objectives['obj-w'].securedBy = 'A'; s.objectives['obj-w'].controller = 'A'
    s.units['A:grunts'].battleShocked = true
    s.round = 3; s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.A.vp).toBe(5)
  })
})

describe('verify r2: Claim Sites (Display of Might)', () => {
  const claimRule = { id: 'claim-sites', code: 'claimSites', window: 'command.start' as const, params: { siteObjectiveIds: ['obj-n'] } }
  it('MISSION-025-deadclaimant: an opponent claim whose claiming model was destroyed does not block the active player from claiming the site', () => {
    const s = freshState()
    s.mission.rules = [{ ...claimRule, window: 'command.end' }]
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'B'
    s.objectives['obj-n'].controller = 'B'
    placeUnit(s, 'B:warboss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'b')
    expect(s.objectives['obj-n'].claimedBy?.player).toBe('B')
    s.units['B:warboss'].location = 'destroyed'
    resetOccurrence(s)
    s.round = 3; s.activePlayer = 'A'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    modules.services.missions.onWindow(ctx, 'command.end', 'a')
    expect(s.objectives['obj-n'].claimedBy?.player).toBe('A')
  })

  it('MISSION-025-coclaim CP §2.5: when two CHARACTER models claim together and one leaves, the site stays claimed by the other (consecutive-turn bonus continues)', () => {
    const s = freshState()
    s.mission.rules = [{ ...claimRule, window: 'command.end' }]
    s.mission.scoring = [{ id: 'claimed2', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'claimedSiteConsecutive', pointsPer: 5, cap: 5, params: { turns: 2 } }]
    s.mission.secondaries = { A: [], B: [] }
    { const dsId = s.units['A:walker'].datasheetId; const ds = s.datasheets[dsId]; s.datasheets = { ...s.datasheets, [dsId]: { ...ds, keywords: [...ds.keywords, 'CHARACTER'] } } }
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: n.pos.x - 1, y: 0, z: n.pos.z }])
    placeUnit(s, 'A:walker', [{ x: n.pos.x + 1.5, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2')
    const claimant = s.objectives['obj-n'].claimedBy!.modelId
    s.models[claimant].pos = { x: 100, y: 0, z: 100 } // one claimer leaves; the other stays
    resetOccurrence(s)
    s.round = 3
    modules.services.missions.onWindow(ctx, 'command.end', 'r3')
    expect(s.players.A.vp).toBe(5)
  })

  it('MISSION-024-return CP §2.5: a claiming model that left range mid-turn and came back has lost the claim — no consecutive-turn bonus next Command phase', () => {
    const s = freshState()
    s.mission.rules = [{ ...claimRule, window: 'command.end' }]
    s.mission.scoring = [{ id: 'claimed2', when: 'command.end', rounds: { from: 2, to: 4 }, who: 'active', rule: 'claimedSiteConsecutive', pointsPer: 5, cap: 5, params: { turns: 2 } }]
    s.mission.secondaries = { A: [], B: [] }
    const n = s.objectives['obj-n']
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    s.objectives['obj-n'].controller = 'A'
    placeUnit(s, 'A:boss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'r2')
    s.phase = 'movement'
    s.models['A:boss#0'].pos = { x: 100, y: 0, z: 100 }
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    s.phase = 'command'; s.activePlayer = 'B'
    s.models['A:boss#0'].pos = { x: n.pos.x, y: 0, z: n.pos.z } // back by B's turn
    s.objectives['obj-n'].controller = 'A'
    resetOccurrence(s)
    s.round = 3; s.activePlayer = 'A'
    modules.services.missions.onWindow(ctx, 'command.end', 'r3')
    expect(s.players.A.vp).toBe(0)
  })
})

describe('verify r2: mission rules and secondaries', () => {
  it("MISSION-035-er Proper Lootin': no loot when the Ork unit in range is within Engagement Range of an enemy", () => {
    const s = freshState()
    s.round = 2; s.activePlayer = 'B'
    s.mission.secondaries.B = [{ id: 'proper-lootin', when: 'command.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'custom', pointsPer: 5, cap: 20, code: 'properLootin', params: { rollTiers: { '2-4': 3, '5-6': 5 }, armyKeyword: 'BLU HORDE' } }]
    const w = s.objectives['obj-w']
    placeUnit(s, 'B:mob', s.units['B:mob'].models.map(() => ({ x: w.pos.x, y: 0, z: w.pos.z })))
    placeUnit(s, 'A:grunts', s.units['A:grunts'].models.map(() => ({ x: w.pos.x + 1.5, y: 0, z: w.pos.z })))
    s.objectives['obj-w'].controller = 'B'
    s.mission.scoring = []; s.mission.secondaries.A = []
    const { ctx } = ctxFor(s, [6, 6, 6])
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.B.vp).toBe(0)
    expect(s.objectives['obj-w'].lootedBy).not.toContain('B')
  })

  it('MISSION-018-two Raze and Ruin: with exactly 2 markers remaining razing is still offered', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'raze', code: 'razeAndRuin', window: 'command.start', params: { roundFrom: 2, minMarkersRemaining: 2, noEnemyWithinInches: 3, forbiddenForAttacker: [], forbiddenForDefender: [] } }]
    for (const id of ['obj-n', 'obj-s', 'obj-home-a', 'obj-home-b']) s.objectives[id].removed = true
    s.objectives['obj-w'].controller = 'A'
    s.round = 2; s.activePlayer = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    expect((ctx.state.pending as ChooseOptionDecision | null)?.options.map((o) => o.id)).toEqual(['obj-w'])
  })

  it('MISSION-022-cap Supply Lines: the +1 CP is subject to the R-4.2 once-per-round cap', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'supply-lines', code: 'supplyLines', window: 'command.start', params: { rollThreshold: 4, cpBonus: 1 } }]
    s.round = 2; s.activePlayer = 'A'
    s.objectives['obj-home-a'].controller = 'A'
    s.players.A.cpGainedThisRound = 1
    const { ctx } = ctxFor(s, [6])
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    expect(s.players.A.cp).toBe(0)
  })

  it("MISSION-017-inactive Sabotage Comms: at the end of B's turn, A holding B's DZ marker locks nothing (only the active player's control counts)", () => {
    const s = freshState()
    s.mission.rules = [{ id: 'sabotage', code: 'sabotageComms', window: 'turn.end' }]
    s.activePlayer = 'B'
    s.objectives['obj-home-b'].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.A.commandRerollLocked).toBe(false)
    expect(s.players.B.commandRerollLocked).toBe(false)
  })

  it("MISSION-033-oppturn Shock Tactics: scores at the end of the opponent's turn for a marker the opponent held at the start of that turn", () => {
    const s = freshState()
    s.mission.secondaries.A = [{ id: 'shock-tactics', when: 'turn.end', rounds: { from: 1, to: 5 }, who: 'both', rule: 'custom', pointsPer: 5, cap: 5, code: 'shockTactics' }]
    s.mission.secondaries.B = []
    s.mission.scoring = []
    s.round = 2; s.activePlayer = 'B'
    s.objectives['obj-w'].controllerAtTurnStart = 'B'
    s.objectives['obj-w'].controller = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.A.vp).toBe(5)
  })

  it('MISSION-014-who Irradiated Power Cells: Gamma is rolled by the Defender (round 3), Beta by the Attacker (round 4)', () => {
    const s = freshState() // A attacker, B defender
    s.mission.rules = [{ id: 'ipc', code: 'irradiatedPowerCells', window: 'round.start', params: { rounds: [3, 4, 5], nmlObjectiveIds: ['obj-w', 'obj-e', 'obj-n'] } }]
    s.round = 3
    const { ctx, events } = ctxFor(s, [1, 1])
    modules.services.missions.onWindow(ctx, 'round.start', '3')
    const r3 = events.filter((e) => e.type === 'DiceRolled')
    expect(r3.map((e) => e.player)).toEqual(['B'])
    resetOccurrence(s)
    s.round = 4
    modules.services.missions.onWindow(ctx, 'round.start', '4')
    const all = events.filter((e) => e.type === 'DiceRolled')
    expect(all.map((e) => e.player)).toEqual(['B', 'A'])
    expect(s.objectives['obj-w'].removed).toBe(true)
    expect(s.mission.custom.lastNmlObjectiveId).toBe('obj-n')
  })

  it('MISSION-030-r3 R-12.6/CP-1.9: a player with only Reserves still has forces in round 3 but not in round 4', () => {
    const s = freshState()
    for (const u of Object.values(s.units)) if (u.player === 'B') u.location = 'reserves'
    s.round = 3
    expect(modules.services.missions.playerHasForces(s, 'B')).toBe(true)
    s.round = 4
    expect(modules.services.missions.playerHasForces(s, 'B')).toBe(false)
  })

  it('MISSION-028-sides R-1.4/P4: the Attacker/Defender roll-off re-rolls ties and the winner chooses a side', () => {
    const s = freshState({ sides: 'rollOff' } as never)
    s.players.A.side = null; s.players.B.side = null
    s.phase = 'setup'; s.step = 'rollOffSides'
    const { ctx } = ctxFor(s, [3, 3, 2, 5])
    modules.phases.setup.advance(ctx)
    const pending = ctx.state.pending as ChooseOptionDecision
    expect(pending.player).toBe('B')
    ctx.state.pending = null
    modules.phases.setup.handle(ctx, { type: 'chooseOption', player: 'B', decisionId: pending.id, optionId: 'defender' }, pending)
    expect(s.players.A.side).toBe('attacker')
    expect(s.players.B.side).toBe('defender')
  })
})

describe('verify r3: scoring moment vs control bookkeeping', () => {
  it('MISSION-007-scoring CP-2.3/CP-2.5: when the opponent out-LoCs a secured marker at the end of the active player’s Command phase, the secure breaks at that moment and the active player scores it', () => {
    const s = freshState()
    s.mission.secondaries.A = []; s.mission.secondaries.B = []
    const w = s.objectives['obj-w']
    w.controller = 'B'; w.securedBy = 'B' // secured by B in an earlier turn, B has since left
    placeUnit(s, 'A:grunts', { x: w.pos.x, z: w.pos.z }) // A LoC 10 vs B 0
    s.round = 3; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(w.securedBy).not.toBe('B')
    expect(w.controller).toBe('A')
    expect(s.players.A.vp).toBe(5) // same "end of Command phase" moment: A controls it when the primary is scored
  })

  it('MISSION-007-resecure CP-2.4/2.5: breaking the opponent’s secure and securing it yourself happen at the same Command phase end', () => {
    const s = freshState()
    const w = s.objectives['obj-w']
    w.controller = 'B'; w.securedBy = 'B'
    placeUnit(s, 'A:grunts', { x: w.pos.x, z: w.pos.z })
    s.round = 3; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(w.securedBy).toBe('A')
    expect(w.controller).toBe('A')
  })

  it('MISSION-011-stale R-12.3/CP-2.3: round-5 second player end-of-turn scoring does not credit a marker whose last in-range model was removed after the last control evaluation (0 vs 0 → contested)', () => {
    const s = freshState()
    s.mission.secondaries.A = []; s.mission.secondaries.B = []
    s.mission.scoring = [{ id: 'r5-second', when: 'turn.end', rounds: { from: 5, to: 5 }, who: 'second', rule: 'holdObjectives', pointsPer: 5, cap: 15 }]
    s.round = 5; s.firstPlayer = 'A'; s.activePlayer = 'B'
    // B held obj-w at the Fight phase end evaluation; its unit was then removed (R-2.6 cull) before turn.end — no models of either side in range
    s.objectives['obj-w'].controller = 'B'
    s.units['B:mob'].location = 'destroyed'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.B.vp).toBe(0)
  })

  it('MISSION-009-mixed CP-2.4: a Battle-shocked BATTLELINE unit plus a non-BATTLELINE controller does not secure', () => {
    const s = freshState()
    const e = s.objectives['obj-e']
    placeUnit(s, 'B:mob', { x: e.pos.x, z: e.pos.z })
    placeUnit(s, 'B:warboss', [{ x: e.pos.x, y: 0, z: e.pos.z }])
    s.units['B:mob'].battleShocked = true
    s.round = 2; s.activePlayer = 'B'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.objectives.evaluateControl(ctx, 'phaseEnd')
    expect(e.controller).toBe('B')
    expect(e.securedBy).toBeNull()
  })
})

describe('verify r3: mission rules and secondaries', () => {
  it("MISSION-035-shocked Proper Lootin': a Battle-shocked Ork unit alone on the marker (LoC 0 vs 0) does not control it at the end of the Command phase, so nothing is looted", () => {
    const s = freshState()
    s.round = 2; s.activePlayer = 'B'; s.phase = 'command'
    s.mission.scoring = []; s.mission.secondaries.A = []
    s.mission.secondaries.B = [{ id: 'proper-lootin', when: 'command.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'custom', pointsPer: 5, cap: 20, code: 'properLootin', params: { rollTiers: { '2-4': 3, '5-6': 5 }, armyKeyword: 'BLU HORDE' } }]
    const w = s.objectives['obj-w']
    placeUnit(s, 'B:mob', s.units['B:mob'].models.map(() => ({ x: w.pos.x, y: 0, z: w.pos.z })))
    w.controller = 'B' // snapshot from the start of the turn
    s.units['B:mob'].battleShocked = true // failed Battle-shock this Command phase
    const { ctx } = ctxFor(s, [6, 6, 6])
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(s.players.B.vp).toBe(0)
    expect(w.lootedBy).not.toContain('B')
  })

  it('MISSION-025-nocontrol Claim Sites: a CHARACTER in range cannot claim a site the opponent controls', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'claim', code: 'claimSites', window: 'command.end', params: { siteObjectiveIds: ['obj-n'] } }]
    s.mission.scoring = []; s.mission.secondaries.A = []; s.mission.secondaries.B = []
    const n = s.objectives['obj-n']
    placeUnit(s, 'A:boss', [{ x: n.pos.x, y: 0, z: n.pos.z }])
    placeUnit(s, 'B:mob', s.units['B:mob'].models.map(() => ({ x: n.pos.x + 1, y: 0, z: n.pos.z })))
    s.round = 2; s.activePlayer = 'A'; s.phase = 'command'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'command.end', 'end')
    expect(n.claimedBy).toBeNull()
  })

  it('MISSION-022-sides Supply Lines: with B as Attacker, the Attacker home marker (data home "A") belongs to player B and grants B the CP roll', () => {
    const s = freshState({ sides: { attacker: 'B' } })
    expect(s.objectives['obj-home-a'].home).toBe('B')
    expect(s.objectives['obj-home-b'].home).toBe('A')
    s.mission.rules = [{ id: 'supply-lines', code: 'supplyLines', window: 'command.start', params: { rollThreshold: 4, cpBonus: 1 } }]
    s.round = 2; s.activePlayer = 'B'
    s.objectives['obj-home-a'].controller = 'B'
    const cp0 = s.players.B.cp
    const { ctx } = ctxFor(s, [4])
    modules.services.missions.onWindow(ctx, 'command.start', 'start')
    expect(s.players.B.cp).toBe(cp0 + 1)
  })

  it('MISSION-017-secured Sabotage Comms: a secured enemy-DZ marker with no models in range still locks the opponent’s Command Re-roll', () => {
    const s = freshState()
    s.mission.rules = [{ id: 'sabotage', code: 'sabotageComms', window: 'turn.end' }]
    s.activePlayer = 'A'
    s.objectives['obj-home-b'].controller = 'A'; s.objectives['obj-home-b'].securedBy = 'A'
    const { ctx } = ctxFor(s)
    modules.services.missions.onWindow(ctx, 'turn.end', 'turn')
    expect(s.players.B.commandRerollLocked).toBe(true)
  })

  it('MISSION-045-reserves R-12.6: one side wiped while the other has only Reserves in round 2 is not tabled; in round 4 it is', () => {
    const s = freshState()
    for (const u of Object.values(s.units)) u.location = u.player === 'A' ? 'destroyed' : 'reserves'
    s.round = 2
    expect(modules.services.missions.isTabled(s)).toBe(false)
    s.round = 4
    expect(modules.services.missions.isTabled(s)).toBe(true)
  })
})

describe('verify r3: pre-battle sequence', () => {
  it('MISSION-027-defender CP-1.10/P6: with B as Attacker, player A (Defender) makes the first deployment drop', () => {
    const s = freshState({ sides: { attacker: 'B' } })
    s.phase = 'deployment'; s.step = 'deploy'
    const { ctx } = ctxFor(s)
    modules.phases.deployment.advance(ctx)
    expect((ctx.state.pending as PendingDecision).player).toBe('A')
  })

  it('MISSION-028-scouts P8: pre-battle Scouts moves alternate between players starting with the first-turn player', () => {
    const s = freshState()
    const sheets = { ...s.datasheets }
    for (const id of ['red.grunts', 'red.walker', 'blu.brute', 'blu.kopta']) {
      const ds = sheets[id]
      sheets[id] = { ...ds, coreAbilities: [...ds.coreAbilities, { ability: 'SCOUTS', value: 6 }] } as typeof ds
    }
    ;(s as { datasheets: typeof sheets }).datasheets = sheets
    placeUnit(s, 'A:grunts', { x: -15, z: -12 })
    placeUnit(s, 'A:walker', [{ x: 10, y: 0, z: -12 }])
    placeUnit(s, 'B:brute', [{ x: -10, y: 0, z: 12 }])
    placeUnit(s, 'B:kopta', [{ x: 10, y: 0, z: 12 }])
    s.phase = 'deployment'; s.step = 'preBattle'; s.firstPlayer = 'A'
    const { ctx } = ctxFor(s)
    const order: string[] = []
    for (let i = 0; i < 10; i++) {
      modules.phases.deployment.advance(ctx)
      const p = ctx.state.pending
      if (!p) break
      order.push(p.player)
      ctx.state.pending = null
      modules.phases.deployment.handle(ctx, { type: 'pass', player: p.player, decisionId: p.id }, p)
    }
    expect(order).toEqual(['A', 'B', 'A', 'B'])
  })
})
