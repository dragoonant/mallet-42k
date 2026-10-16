// Blood Angels: Strike Force Marcellos (docs/spec/factions/blood-angels.md, BLO- checklist ids), real Combat Patrol data.
// Code hooks: Multi-spectrum Array, Haywire Mine, Rapid Strike (src/engine/factions/blood-angels.ts), plus the declarative rules that ride on
// the engine (Angelic Wrath, Controlled Ferocity, Harness the Flaw, Mental Fortress). The bagPick fallbackKeyword seam (BLO-008/009) is covered
// in blood-angels-core.test.ts; static data (BLO-001..003, 014, 023..025) in tests/data/blood-angels.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup, type UseStratagemAction,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { bloodAngelsHooks } from '../../src/engine/factions/blood-angels'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { stratagemService } from '../../src/engine/stratagems'
import { buildShootingWeaponEntries, firingDeckWeapons, shootingModule, validateDeclareTargets } from '../../src/engine/phases/shooting'
import { transportService } from '../../src/engine/transports'
import { runGame } from '../../tools/sim-core'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const BA = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Blood Angels', faction: 'blood-angels', patrolId: 'ba.cp.strike-force-marcellos', enhancementId: 'ba.e.baalite-bladesman', secondaryId: 'ba.sec.angelic-wrath',
  attachments: [{ leaderRef: 'librarian-marcellos', bodyguardRef: 'intercessor-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const MAR = 'A:librarian-marcellos', INT = 'A:intercessor-squad', INC = 'A:incursor-squad', AGG = 'A:aggressor-squad', IMP = 'A:impulsor'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b', DREAD = 'B:deff-dread'
const SERGEANT_CHAINSWORD = 'ba.w.astartes-chainsword'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: BA(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'ba', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}
const ctxOf = (s: GameState, dice: number[] = []) => createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const SIX = Array(80).fill(6)

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


// runs an attack to the end, passing every stratagem / re-roll window and taking the first eligible model on an allocation offer
function driveAttack(ctx: EngineContext): void {
  let r = attackService.advance(ctx)
  for (let guard = 0; r === 'pending'; guard++) {
    if (guard > 500) throw new Error('driveAttack: too many decisions')
    const pending = ctx.state.pending
    if (!pending) throw new Error('pending without a decision')
    const action: Action = pending.kind === 'allocateAttack'
      ? { type: 'allocateAttack', player: pending.player, decisionId: pending.id, modelId: pending.context.eligibleModels[0] }
      : { type: 'pass', player: pending.player, decisionId: pending.id }
    ctx.state.pending = null
    const owner = pending.kind === 'stratagemWindow' || pending.kind === 'reactionWindow' || pending.kind === 'commandReroll' ? ctx.services.stratagems : attackService.handler
    const rej = owner.handle(ctx, action, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    r = attackService.advance(ctx)
  }
}


// answers the allocation decisions of a mortal-wound sequence queued by a hook (first eligible model each time) until it is resolved
function settle(ctx: EngineContext): void {
  for (let guard = 0; ctx.state.pending && guard < 50; guard++) {
    const pending = ctx.state.pending
    if (pending.kind !== 'allocateAttack') throw new Error(`settle: unexpected ${pending.kind}`)
    ctx.state.pending = null
    const rej = attackService.handler.handle(ctx, { type: 'allocateAttack', player: pending.player, decisionId: pending.id, modelId: pending.context.eligibleModels[0] }, pending)
    if (rej) throw new Error(`rejected: ${rej.code} ${rej.reason}`)
    if (!ctx.state.pending && ctx.state.phaseState.attack) attackService.advance(ctx)
  }
}

// one attack by a single model's weapon, driven to the end; returns every event
function runAttack(s: GameState, modelId: string, weaponId: string, targetUnitId: string, dice: number[], kind: 'melee' | 'ranged'): GameEvent[] {
  const made = createContext(s, new ScriptedRng([...dice, ...Array(60).fill(2)]), DEFAULT_MODULES)
  attackService.begin(made.ctx, { kind, attackerUnitId: s.models[modelId].unitId, overwatch: false, targets: [{ modelId, weaponId, targetUnitId, profileGroup: null, attacks: 1 }] })
  driveAttack(made.ctx)
  return made.events
}
const modelWith = (s: GameState, unitId: string, weaponId: string): string => s.units[unitId].models.find((m) => s.models[m].weapons.includes(weaponId)) as string

const totalWounds =(s: GameState, unitId: string): number => s.units[unitId].models.reduce((n, id) => n + s.models[id].woundsRemaining, 0)

// ---------- registry ----------
describe('hook registry', () => {
  it('BLO-001 every Blood Angels code is registered and every code the patrol data references resolves', () => {
    for (const name of ['multiSpectrumArray', 'haywireMine', 'rapidStrike']) expect(bloodAngelsHooks[name], name).toBeTruthy()
    for (const name of ['multiSpectrumArray', 'haywireMine', 'rapidStrike', 'oathOfMomentPick', 'veteranInstincts', 'chitinousTide', 'bagPick', 'bagTheBigUnScore']) expect(codeHooks[name], name).toBeTruthy()
    const used = new Set<string>()
    for (const a of Object.values(bundle.abilities)) if (a.id.startsWith('ba.') && a.code) used.add(a.code)
    for (const st of Object.values(bundle.stratagems)) if (st.id.startsWith('ba.') && st.code) used.add(st.code)
    for (const c of used) expect(codeHooks[c], c).toBeTruthy()
  })
})

// ---------- Angelic Wrath (BLO-007) ----------
describe('Angelic Wrath', () => {
  function scoreAt(s: GameState): number {
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }
  const clearControl = (s: GameState): void => { for (const o of Object.values(s.objectives)) o.controller = null }
  it('BLO-007 opponent turn end: a controlled marker near the enemy zone scores 4 (cap 4 for several), a marker 7" away 0, own turn end 0', () => {
    // cp-01 markers: west/east at z=0, north (0,6) and south (0,-6); the enemy (B) zone's near edge is z=10
    const place = (s: GameState, id: string, z: number): void => { s.objectives[id].pos = { ...s.objectives[id].pos, z }; s.objectives[id].controller = 'A' }
    const state = (active: 'A' | 'B') => { const s = makeState({ phase: 'fight', active }); clearControl(s); return s }
    let s = state('B')
    place(s, 'north', 5)
    expect(scoreAt(s)).toBe(4)

    // 7" from the zone edge: out of reach
    s = state('B')
    place(s, 'north', 3)
    expect(scoreAt(s)).toBe(0)

    // two qualifying markers still score 4
    s = state('B')
    place(s, 'north', 5)
    place(s, 'east', 8)
    expect(scoreAt(s)).toBe(4)

    // the end of our own turn scores nothing
    s = state('A')
    place(s, 'north', 5)
    expect(scoreAt(s)).toBe(0)
  })
})

// ---------- Controlled Ferocity / Harness the Flaw ----------
describe('Fight stratagems', () => {
  const asOptions = (s: GameState, player: 'A' | 'B', window: Parameters<typeof stratagemService.options>[2], id: string, trigger = {}) =>
    stratagemService.options(s, player, window, trigger).filter((x) => x.stratagemId === id).map((x) => x.targets.unitIds?.[0])
  function ready(active: 'A' | 'B' = 'A') {
    const s = makeState({ phase: 'fight', active })
    s.players.A.cp = 5
    placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, MAR, [[0, 3]])
    placeUnit(s, AGG, { x: 0, z: 10, gap: 0.3 })
    placeUnit(s, IMP, [[0, 20]])
    placeUnit(s, BOYZ, { x: 0, z: 1.5, gap: 0.3 })
    return s
  }
  it('BLO-010 Controlled Ferocity: offered for the Intercessors once an enemy unit picked them; the Impulsor is never a target; -1 to hit against them', () => {
    const s = ready()
    // the Boyz declared an attack on the Intercessors
    const model = s.units[BOYZ].models[0]
    const weaponId = s.models[model].weapons.find((w) => s.weapons[w].kind === 'melee') as string
    const c = ctxOf(s, SIX)
    attackService.begin(c.ctx, { kind: 'melee', attackerUnitId: BOYZ, overwatch: false, targets: [{ modelId: model, weaponId, targetUnitId: INT, profileGroup: null, attacks: 1 }] })
    const ids = asOptions(s, 'A', 'fight.targetsDeclared', 'ba.s.controlled-ferocity', { unitId: BOYZ, targetUnitId: INT })
    expect(ids.some((id) => id === INT || id === MAR)).toBe(true)
    expect(ids).not.toContain(IMP)
    expect(ids).not.toContain(AGG)
    const action = stratagemService.options(s, 'A', 'fight.targetsDeclared', { unitId: BOYZ, targetUnitId: INT }).find((x) => x.stratagemId === 'ba.s.controlled-ferocity')!
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window: 'fight.targetsDeclared', canPass: true, context: { trigger: { unitId: BOYZ, targetUnitId: INT } }, options: [] } as unknown as PendingDecision
    expect(stratagemService.handle(c.ctx, { ...action, decisionId: 'd:1' } as UseStratagemAction, pending)).toBeUndefined()
    const eff = [...s.units[INT].effects, ...s.units[MAR].effects].find((e) => e.sourceAbilityId === 'ba.s.controlled-ferocity')
    expect(eff).toBeTruthy()
    expect(JSON.stringify(eff!.effect)).toContain('"value":-1')
  })
  // an Ork melee attack on the Intercessors after Controlled Ferocity was used: returns the first hit roll (unmodified die 4)
  function ferocityHit(active: 'A' | 'B', use: boolean): { die: number; final: number; cp: number } {
    const s = ready(active)
    const model = s.units[BOYZ].models[0]
    const weaponId = s.models[model].weapons.find((w) => s.weapons[w].kind === 'melee') as string
    const c = ctxOf(s, [4, ...SIX])
    attackService.begin(c.ctx, { kind: 'melee', attackerUnitId: BOYZ, overwatch: false, targets: [{ modelId: model, weaponId, targetUnitId: INT, profileGroup: null, attacks: 1 }] })
    if (use) {
      const action = stratagemService.options(s, 'A', 'fight.targetsDeclared', { unitId: BOYZ, targetUnitId: INT }).find((x) => x.stratagemId === 'ba.s.controlled-ferocity')
      if (!action) throw new Error('Controlled Ferocity not offered')
      const pending = { id: 'd:9', kind: 'stratagemWindow', player: 'A', window: 'fight.targetsDeclared', canPass: true, context: { trigger: { unitId: BOYZ, targetUnitId: INT } }, options: [] } as unknown as PendingDecision
      expect(stratagemService.handle(c.ctx, { ...action, decisionId: 'd:9' } as UseStratagemAction, pending)).toBeUndefined()
    }
    driveAttack(c.ctx)
    const hr = of(c.events, 'HitRolled')[0]
    return { die: hr.die, final: hr.final, cp: s.players.A.cp }
  }
  it('BLO-010 Controlled Ferocity applied: the Ork melee hit roll against the Intercessors is -1 in the Blood Angels turn and in the opponent turn; without it, unmodified', () => {
    const clean = ferocityHit('A', false)
    expect(clean.final).toBe(clean.die)
    for (const active of ['A', 'B'] as const) {
      const used = ferocityHit(active, true)
      expect(used.die, `active ${active}`).toBe(4)
      expect(used.final, `active ${active}`).toBe(3)
      expect(used.cp, `active ${active}`).toBe(4)
    }
  })
  it('BLO-011 Harness the Flaw: not-yet-fought infantry offered (Aggressors yes, Impulsor never); a unit that already fought is not', () => {
    const s = ready()
    const ids = asOptions(s, 'A', 'fight.start', 'ba.s.harness-the-flaw')
    expect(ids).toContain(AGG)
    expect(ids).not.toContain(IMP)
    s.units[AGG].turn.foughtThisPhase = true
    expect(asOptions(s, 'A', 'fight.start', 'ba.s.harness-the-flaw')).not.toContain(AGG)
    s.units[AGG].turn.foughtThisPhase = false
    // used on the Aggressors: two reroll entries (any wound roll vs MONSTER/VEHICLE, ones otherwise)
    const c = ctxOf(s)
    const action = stratagemService.options(s, 'A', 'fight.start', {}).find((x) => x.stratagemId === 'ba.s.harness-the-flaw' && x.targets.unitIds?.[0] === AGG)!
    const pending = { id: 'd:2', kind: 'stratagemWindow', player: 'A', window: 'fight.start', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    expect(stratagemService.handle(c.ctx, { ...action, decisionId: 'd:2' } as UseStratagemAction, pending)).toBeUndefined()
    const eff = s.units[AGG].effects.find((e) => e.sourceAbilityId === 'ba.s.harness-the-flaw')
    expect(eff).toBeTruthy()
    expect(JSON.stringify(eff!.effect)).toContain('"reroll":"ones"')
    expect(JSON.stringify(eff!.effect)).toContain('"reroll":"all"')
  })
})

// ---------- Rapid Strike (BLO-012 / BLO-013) ----------
describe('Rapid Strike', () => {
  const targetsOf = (s: GameState): (string | undefined)[] =>
    stratagemService.options(s, 'A', 'phase.end', {}).filter((x) => x.stratagemId === 'ba.s.rapid-strike').map((x) => x.targets.unitIds?.[0])
  function ready() {
    const s = makeState({ phase: 'shooting' })
    s.players.A.cp = 3
    placeUnit(s, INT, { x: -10, z: 0, gap: 0.3 })
    placeUnit(s, MAR, [[-10, 3]])
    placeUnit(s, INC, { x: 0, z: -8, gap: 0.3 })
    placeUnit(s, AGG, { x: 0, z: 8, gap: 0.3 })
    placeUnit(s, IMP, [[10, 8]])
    placeUnit(s, BOYZ, { x: 25, z: 0, gap: 0.3 })
    return s
  }
  it('BLO-012 end of own Shooting: Incursors and the Intercessors (with Marcellos) are offered, Aggressors and the Impulsor are not; engaged units are not; the move is up to M', () => {
    const s = ready()
    const targets = targetsOf(s)
    expect(targets).toContain(INC)
    expect(targets.some((id) => id === INT || id === MAR)).toBe(true)
    expect(targets).not.toContain(AGG)
    expect(targets).not.toContain(IMP)

    // an Incursor squad in Engagement Range of the Boyz is not offered
    const engaged = ready()
    placeUnit(engaged, BOYZ, { x: 0, z: -9.5, gap: 0.3 })
    expect(targetsOf(engaged)).not.toContain(INC)

    // opponent's turn: not offered to the Blood Angels
    const theirs = ready()
    theirs.activePlayer = 'B'
    expect(targetsOf(theirs)).not.toContain(INC)

    // using it opens a Normal move of up to 6"
    const c = ctxOf(s)
    const action = stratagemService.options(s, 'A', 'phase.end', {}).find((x) => x.stratagemId === 'ba.s.rapid-strike' && x.targets.unitIds?.[0] === INC)!
    const pending = { id: 'd:3', kind: 'stratagemWindow', player: 'A', window: 'phase.end', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    expect(stratagemService.validate!(s, { ...action, decisionId: 'd:3' } as UseStratagemAction, pending)).toBeNull()
    expect(stratagemService.handle(c.ctx, { ...action, decisionId: 'd:3' } as UseStratagemAction, pending)).toBeUndefined()
    expect(s.pending?.kind).toBe('moveUnit')
    expect((s.pending as { constraints: { maxDistance: number } }).constraints.maxDistance).toBe(6)
    expect(s.players.A.cp).toBe(2)
  })
  it('BLO-013 the moved unit cannot declare a charge for the rest of the turn, and the move never offers embarkation', () => {
    const s = ready()
    const c = ctxOf(s)
    expect(hookService.chargeForbidden(s, INC)).toBe(false)
    const action = stratagemService.options(s, 'A', 'phase.end', {}).find((x) => x.stratagemId === 'ba.s.rapid-strike' && x.targets.unitIds?.[0] === INC)!
    const pending = { id: 'd:4', kind: 'stratagemWindow', player: 'A', window: 'phase.end', canPass: true, context: { trigger: {} }, options: [] } as unknown as PendingDecision
    expect(stratagemService.handle(c.ctx, { ...action, decisionId: 'd:4' } as UseStratagemAction, pending)).toBeUndefined()
    expect(hookService.chargeForbidden(s, INC)).toBe(true)
    // the reactive move is a plain Normal move: no embark choice among the move options
    const mv = s.pending as { kind: string; context: { moveType: string } }
    expect(mv.kind).toBe('moveUnit')
    expect(mv.context.moveType).toBe('normal')
    // the restriction ends with the turn
    effectService.expire(c.ctx, 'turnEnd', null)
    expect(hookService.chargeForbidden(s, INC)).toBe(false)
  })
})

// ---------- Multi-spectrum Array (BLO-016 / BLO-017) ----------
describe('Multi-spectrum Array', () => {
  const incWeapon = (s: GameState): string => s.models[s.units[INC].models[0]].weapons.find((w) => s.weapons[w].kind === 'ranged') as string
  const hitMark = (s: GameState, target: string): void => { s.phaseState.marks.push(`hitBy:${INC}:${incWeapon(s)}:${target}`) }
  // one ranged attack by `unit` on `target`; returns its first hit roll
  function hitDie(s: GameState, unit: string, target: string): { die: number; final: number } {
    const usable = (w: string) => s.weapons[w]?.kind === 'ranged' && s.weapons[w].range >= 12
    const model = s.units[unit].models.find((id) => s.models[id].weapons.some(usable))!
    const weaponId = s.models[model].weapons.find(usable)!
    const made = createContext(s, new ScriptedRng([4, ...SIX]), DEFAULT_MODULES)
    attackService.begin(made.ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [{ modelId: model, weaponId, targetUnitId: target, profileGroup: null, attacks: 1 }] })
    driveAttack(made.ctx)
    const hr = of(made.events, 'HitRolled')[0]
    return { die: hr.die, final: hr.final }
  }
  function ready() {
    const s = makeState({ phase: 'shooting' })
    placeUnit(s, INC, { x: -10, z: 0, gap: 0.3 })
    placeUnit(s, INT, { x: -10, z: 5, gap: 0.3 })
    placeUnit(s, MAR, [[-10, 8]])
    placeUnit(s, AGG, { x: -10, z: -5, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 8, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: 8, z: 6, gap: 0.3 })
    return s
  }
  it('BLO-016 one enemy unit hit: it is marked at once; later Adeptus Astartes attacks on it get +1 to hit this phase; gone next phase', () => {
    const s = ready()
    const clean = hitDie(ready(), INT, BOYZ)
    expect(clean.final).toBe(clean.die)
    hitMark(s, BOYZ)
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', INC)).toBe(false)
    expect(s.pending).toBeNull()
    const eff = s.units[BOYZ].effects.find((e) => e.sourceAbilityId === 'ba.a.multi-spectrum-array')
    expect(eff).toBeTruthy()
    const marked = hitDie(s, INT, BOYZ)
    expect(marked.final).toBe(marked.die + 1)
    const aggr = hitDie(s, IMP, BOYZ)
    expect(aggr.final).toBe(aggr.die + 1)
    // an unmarked enemy unit is unaffected
    const other = hitDie(s, INT, BOYZ2)
    expect(other.final).toBe(other.die)
    // offered once per unit per phase
    hitMark(s, BOYZ2)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', INC)).toBe(false)
    expect(s.units[BOYZ2].effects.some((e) => e.sourceAbilityId === 'ba.a.multi-spectrum-array')).toBe(false)
    // the effect ends with the phase
    effectService.expire(c.ctx, 'phaseEnd', null)
    const later = hitDie(s, INT, BOYZ)
    expect(later.final).toBe(later.die)
  })
  it('BLO-017 two hit units raise a choice; an unhit unit is never a candidate; a -1 to hit on the target nets out; not in the opponent\'s turn or outside Shooting', () => {
    const s = ready()
    hitMark(s, BOYZ)
    hitMark(s, BOYZ2)
    s.phaseState.marks.push(`hitBy:${INC}:${incWeapon(s)}:${DREAD}`)
    placeUnit(s, DREAD, [[8, -8]])
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', INC)).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id).sort()).toEqual([BOYZ, BOYZ2, DREAD].sort())
    answerOption(c.ctx, BOYZ2)
    expect(s.units[BOYZ2].effects.some((e) => e.sourceAbilityId === 'ba.a.multi-spectrum-array')).toBe(true)
    expect(s.units[BOYZ].effects.some((e) => e.sourceAbilityId === 'ba.a.multi-spectrum-array')).toBe(false)

    // an unhit unit is not offered
    const t = ready()
    hitMark(t, BOYZ)
    t.phaseState.marks.push(`hitBy:${INC}:${incWeapon(t)}:${BOYZ2}`)
    t.phaseState.marks = t.phaseState.marks.filter((m) => !m.endsWith(`:${BOYZ2}`))
    expect(hookService.offerPicks(ctxOf(t).ctx, 'shooting.attacksResolved', INC)).toBe(false)
    expect(t.units[BOYZ].effects.length).toBe(1)
    expect(t.units[BOYZ2].effects.length).toBe(0)

    // net of a -1 to hit on the target
    const u = ready()
    hitMark(u, BOYZ)
    hookService.offerPicks(ctxOf(u).ctx, 'shooting.attacksResolved', INC)
    effectService.grant(ctxOf(u).ctx, BOYZ, [{ modifyRoll: { roll: 'hit', value: -1 } }], { sourceAbilityId: 'test.minus', sourceUnitId: BOYZ, scope: { who: 'attacker' }, duration: 'untilEndOfPhase', when: null })
    const net = hitDie(u, INT, BOYZ)
    expect(net.final).toBe(net.die)

    // not the owner's Shooting phase
    const v = ready()
    v.phase = 'movement'
    hitMark(v, BOYZ)
    expect(hookService.offerPicks(ctxOf(v).ctx, 'shooting.attacksResolved', INC)).toBe(false)
    const w = ready()
    w.activePlayer = 'B'
    hitMark(w, BOYZ)
    expect(hookService.offerPicks(ctxOf(w).ctx, 'shooting.attacksResolved', INC)).toBe(false)
  })
})

// ---------- Haywire Mine (BLO-021 / BLO-022) ----------
describe('Haywire Mine', () => {
  const bearerOf = (s: GameState): string => s.units[INC].models.find((id) => s.models[id].datasheetModelId === 'incursor-haywire') as string
  // the Incursors stacked at the origin; `unit`'s models stacked `gap` inches (edge to edge) from the bearer
  function ready(gap: number, enemy: string = BOYZ, phase: GameState['phase'] = 'movement') {
    const s = makeState({ phase })
    placeUnit(s, INC, [[0, 0]])
    placeUnit(s, enemy, [[0, 0]])
    const b = s.models[bearerOf(s)]
    for (const id of s.units[enemy].models) {
      const m = s.models[id]
      m.pos = { x: 0, y: 0, z: b.base.radius + m.base.radius + gap }
    }
    // everyone else stays out of the way
    for (const other of [INT, MAR, AGG, IMP]) placeUnit(s, other, [[-30, 0]])
    return s
  }
  const window = (s: GameState): 'movement.start' | 'shooting.start' | 'charge.start' | 'fight.start' | 'command.start' => `${s.phase}.start` as 'movement.start'
  it('BLO-021 enemy within 3" at the start of a phase: offered; 2+ deals D3 mortal wounds; 1 deals nothing; once per battle', () => {
    const s = ready(2)
    expect(s.units[INC].models.some((id) => s.models[id].datasheetModelId === 'incursor-haywire')).toBe(true)
    const c = ctxOf(s, [4, 4])
    const before = totalWounds(s, BOYZ)
    expect(hookService.offerPicks(c.ctx, window(s), 'start')).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id).sort()).toEqual([BOYZ, 'decline'])
    answerOption(c.ctx, BOYZ)
    settle(c.ctx)
    expect(before - totalWounds(s, BOYZ)).toBe(2)
    expect(s.players.A.oncePerBattleUsed).toContain('ba.a.haywire-mine')
    expect(of(c.events, 'AbilityTriggered').some((e) => e.abilityId === 'ba.a.haywire-mine')).toBe(true)
    // never offered again, in any later phase
    s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.start', 'start')).toBe(false)

    // a roll of 1 deals nothing and still spends the mine
    const f = ready(2)
    const c2 = ctxOf(f, [1])
    expect(hookService.offerPicks(c2.ctx, window(f), 'start')).toBe(true)
    const w0 = totalWounds(f, BOYZ)
    answerOption(c2.ctx, BOYZ)
    settle(c2.ctx)
    expect(totalWounds(f, BOYZ)).toBe(w0)
    expect(f.players.A.oncePerBattleUsed).toContain('ba.a.haywire-mine')

    // a VEHICLE suffers 2D3
    const v = ready(2, DREAD)
    const c3 = ctxOf(v, [5, 6, 3])
    expect(hookService.offerPicks(c3.ctx, window(v), 'start')).toBe(true)
    const v0 = totalWounds(v, DREAD)
    answerOption(c3.ctx, DREAD)
    settle(c3.ctx)
    expect(v0 - totalWounds(v, DREAD)).toBe(5)
  })
  it('BLO-021 the opponent\'s phase start also offers it, and every phase of the turn is a window', () => {
    for (const phase of ['movement', 'shooting', 'charge', 'fight'] as const) {
      const s = ready(2, BOYZ, phase)
      s.activePlayer = 'B'
      expect(hookService.offerPicks(ctxOf(s).ctx, window(s), 'start'), phase).toBe(true)
      expect(pendingOption(s).player).toBe('A')
    }
  })
  it('BLO-022 decline keeps the mine for the next phase; a dead bearer or an enemy 4" away is never offered', () => {
    const s = ready(2)
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, window(s), 'start')).toBe(true)
    answerOption(c.ctx, 'decline')
    expect(s.pending).toBeNull()
    expect(s.players.A.oncePerBattleUsed).not.toContain('ba.a.haywire-mine')
    // the same phase does not ask twice
    expect(hookService.offerPicks(c.ctx, window(s), 'start')).toBe(false)
    // the next phase asks again
    s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    expect(hookService.offerPicks(ctxOf(s).ctx, 'shooting.start', 'start')).toBe(true)

    // bearer dead, other Incursors alive
    const d = ready(2)
    const bearer = bearerOf(d)
    d.units[INC].models = d.units[INC].models.filter((id) => id !== bearer)
    d.units[INC].destroyedModels.push(d.models[bearer])
    expect(d.units[INC].models.length).toBeGreaterThan(0)
    expect(hookService.offerPicks(ctxOf(d).ctx, window(d), 'start')).toBe(false)

    // 4" away
    const far = ready(4)
    expect(hookService.offerPicks(ctxOf(far).ctx, window(far), 'start')).toBe(false)
    // exactly 3" away is still in range
    const edge = ready(3)
    expect(hookService.offerPicks(ctxOf(edge).ctx, window(edge), 'start')).toBe(true)
  })
})

// ---------- Mental Fortress (BLO-015) ----------
describe('Mental Fortress', () => {
  it('BLO-015 attached Intercessors and Marcellos get a 4+ invulnerable save; an unattached Marcellos has none', () => {
    const invulnOf = (s: GameState, unitId: string): number[] => {
      const c = ctxOf(s)
      const attackerModel = s.units[BOYZ].models[0]
      const weaponId = s.models[attackerModel].weapons.find((w) => s.weapons[w].kind === 'ranged') as string
      const targetModelId = s.units[unitId].models[0]
      const m = s.models[attackerModel]
      const attack = {
        kind: 'ranged', overwatch: false, attackerUnitId: m.unitId, attackerModelId: attackerModel, weapon: s.weapons[weaponId], targetUnitId: unitId, targetModelId,
        range: 6, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: false,
      } as never
      const roll = { purpose: 'save', unmodified: 3, dieIndex: 0, rerolled: false, roll: { id: 'r:x', purpose: 'save', sides: 6, dice: [3], rerolled: null, modifiers: [], final: [3], player: 'A', unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: true } } as never
      return hookService.collect(c.ctx, 'onSaveRoll', { attack, roll }).map((r) => r.result).flatMap((r) => (r.kind === 'roll' && r.invuln !== undefined ? [r.invuln as number] : []))
    }
    const s = makeState({ phase: 'shooting' })
    placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, MAR, [[0, 3]])
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    expect(leaderService.isAttached(s, MAR)).toBe(true)
    // the granted invulnerable save is exactly 4+
    expect(Math.min(...invulnOf(s, INT))).toBe(4)
    expect(Math.min(...invulnOf(s, MAR))).toBe(4)

    // resolved against an AP -3 shot: Sv 3+ becomes 6+, so a save die of 4 only passes on the 4+ invulnerable
    const shootAt = (st: GameState, target: string): { kind: string; needed: number; saved: boolean } => {
      // the Ork shoota with its AP raised to -3, as a test-only profile on the first Boy
      const wid = 'test.w.shoota-ap3'
      st.weapons = { ...st.weapons, [wid]: { ...st.weapons['ork.w.shoota'], id: wid, AP: -3 } }
      const shooter = st.units[BOYZ].models[0]
      st.models[shooter].weapons.push(wid)
      // hit 6, wound 6, save 4
      const sv = of(runAttack(st, shooter, wid, target, [6, 6, 4], 'ranged'), 'SaveRolled')[0]
      return { kind: sv.kind, needed: sv.needed, saved: sv.saved }
    }
    expect(shootAt(s, INT)).toMatchObject({ kind: 'invuln', needed: 4, saved: true })
    const u0 = makeState({ phase: 'shooting', a: { attachments: [] } })
    placeUnit(u0, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(u0, MAR, [[0, 3]])
    placeUnit(u0, BOYZ, { x: 10, z: 0, gap: 0.3 })
    expect(shootAt(u0, MAR)).toMatchObject({ kind: 'armour', saved: false })

    const u = makeState({ phase: 'shooting', a: { attachments: [] } })
    placeUnit(u, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(u, MAR, [[0, 3]])
    placeUnit(u, BOYZ, { x: 10, z: 0, gap: 0.3 })
    expect(invulnOf(u, MAR)).toEqual([])
    expect(invulnOf(u, INT)).toEqual([])
  })
})

// ---------- Oath of Moment on the Impulsor (BLO-004) ----------
describe('Oath of Moment', () => {
  it('BLO-004 the Blood Angels player picks an Oath target at the start of own Command phase; an Impulsor storm bolter attack on it re-rolls a failed hit, an attack on another unit does not', () => {
    const s = makeState({ phase: 'command' })
    placeUnit(s, IMP, [[0, 0]])
    placeUnit(s, BOYZ, { x: -3, z: 12, gap: 0.3 })
    placeUnit(s, BOYZ2, { x: -3, z: 18, gap: 0.3 })
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'command.start', 'start')).toBe(true)
    expect(pendingOption(s).context.topic).toBe('oathTarget')
    expect(pendingOption(s).player).toBe('A')
    expect(pendingOption(s).options.map((o) => o.id)).toEqual(expect.arrayContaining([BOYZ, BOYZ2]))
    answerOption(c.ctx, BOYZ)
    expect(s.players.A.oathTargetUnitId).toBe(BOYZ)

    s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    const gun = modelWith(s, IMP, 'ba.w.impulsor-storm-bolter')
    expect(gun).toBeTruthy()
    // hit die 1 (a fail), then the re-roll comes up 6 and the attack goes on
    const oath = runAttack(s, gun, 'ba.w.impulsor-storm-bolter', BOYZ, [1, 6, 6], 'ranged')
    expect(of(oath, 'DiceRerolled').length).toBeGreaterThan(0)
    expect(of(oath, 'HitRolled')[0]).toMatchObject({ die: 6, hit: true })
    // the same die against a unit that is not the Oath target stays a miss
    const other = runAttack(s, gun, 'ba.w.impulsor-storm-bolter', BOYZ2, [1, 6, 6], 'ranged')
    expect(of(other, 'DiceRerolled')).toHaveLength(0)
    expect(of(other, 'HitRolled')[0]).toMatchObject({ die: 1, hit: false })
  })
})

// ---------- Baalite Bladesman / Radiant Wrath (BLO-005 / BLO-006) ----------
describe('Marcellos enhancements', () => {
  const statOf = (s: GameState, modelId: string, weaponId: string): number =>
    hookService.statFor(s, { unitId: s.models[modelId].unitId, modelId, weapon: s.weapons[weaponId], stat: 'AP' }, s.weapons[weaponId].AP)
  const apOf = (s: GameState, unitId: string, weaponId: string): number => statOf(s, modelWith(s, unitId, weaponId), weaponId)

  it('BLO-005 Baalite Bladesman: while Marcellos leads the Intercessors their chainsword goes AP -1 to -2, the close combat weapon 0 to -1 and his force weapon -1 to -2; ranged AP is unchanged', () => {
    const s = makeState({ phase: 'fight' })
    placeUnit(s, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, MAR, [[0, 3]])
    expect(leaderService.isAttached(s, MAR)).toBe(true)
    expect(s.weapons[SERGEANT_CHAINSWORD].AP).toBe(-1)
    expect(s.weapons['sm.w.close-combat-weapon'].AP).toBe(0)
    expect(s.weapons['sm.w.force-weapon'].AP).toBe(-1)
    expect(apOf(s, INT, SERGEANT_CHAINSWORD)).toBe(-2)
    expect(apOf(s, INT, 'sm.w.close-combat-weapon')).toBe(-1)
    expect(apOf(s, MAR, 'sm.w.force-weapon')).toBe(-2)
    // ranged weapons keep their own AP
    expect(apOf(s, INT, 'ba.w.bolt-rifle')).toBe(s.weapons['ba.w.bolt-rifle'].AP)
    expect(apOf(s, INT, 'sm.w.bolt-pistol')).toBe(s.weapons['sm.w.bolt-pistol'].AP)
    expect(apOf(s, MAR, 'sm.w.smite')).toBe(s.weapons['sm.w.smite'].AP)

    // without Marcellos attached the Intercessors are untouched; his own force weapon keeps the bearer bonus
    const u = makeState({ phase: 'fight', a: { attachments: [] } })
    placeUnit(u, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(u, MAR, [[0, 3]])
    expect(leaderService.isAttached(u, MAR)).toBe(false)
    expect(apOf(u, INT, SERGEANT_CHAINSWORD)).toBe(-1)
    expect(apOf(u, INT, 'sm.w.close-combat-weapon')).toBe(0)
    expect(apOf(u, MAR, 'sm.w.force-weapon')).toBe(-2)
  })

  it('BLO-006 Radiant Wrath: both Smite profiles gain Anti-Monster 5+ and Anti-Vehicle 5+, the force weapon gains nothing; a 5 to wound critically wounds a Vehicle but not Infantry', () => {
    const rw = makeState({ phase: 'shooting', a: { enhancementId: 'ba.e.radiant-wrath' } })
    placeUnit(rw, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(rw, MAR, [[0, 3]])
    placeUnit(rw, DREAD, [[0, 12]])
    placeUnit(rw, BOYZ, { x: 10, z: 12, gap: 0.3 })
    const mar = modelWith(rw, MAR, 'sm.w.smite')
    const grants = (s: GameState, weaponId: string) => hookService.weaponAbilitiesFor(s, mar, s.weapons[weaponId]).filter((a) => a.ability === 'ANTI').map((a) => `${a.keyword}:${a.value}`).sort()
    expect(grants(rw, 'sm.w.smite')).toEqual(['MONSTER:5', 'VEHICLE:5'])
    expect(grants(rw, 'sm.w.smite-focused')).toEqual(['MONSTER:5', 'VEHICLE:5'])
    expect(grants(rw, 'sm.w.force-weapon')).toEqual([])
    // the default Baalite Bladesman gives Smite nothing
    const bb = makeState({ phase: 'shooting' })
    placeUnit(bb, INT, { x: 0, z: 0, gap: 0.3 })
    placeUnit(bb, MAR, [[0, 3]])
    expect(grants(bb, 'sm.w.smite')).toEqual([])

    // a 5 to wound: critical against the Vehicle (Anti-Vehicle 5+), not against Infantry, and not at all without the enhancement
    const woundOf = (s: GameState, target: string, die: number) => of(runAttack(s, modelWith(s, MAR, 'sm.w.smite'), 'sm.w.smite', target, [6, die], 'ranged'), 'WoundRolled')[0]
    expect(woundOf(rw, DREAD, 5)).toMatchObject({ die: 5, wounded: true, critical: true })
    expect(woundOf(rw, BOYZ, 5)).toMatchObject({ die: 5, critical: false })
    placeUnit(bb, DREAD, [[0, 12]])
    expect(woundOf(bb, DREAD, 5)).toMatchObject({ die: 5, critical: false })
  })
})

// ---------- Impulsor transport, Firing Deck, Deadly Demise (BLO-018 / 019 / 020) ----------
describe('Impulsor', () => {
  const emb = (...refs: string[]): Partial<PlayerSetup> => ({ embarked: refs.map((unitRef) => ({ unitRef, transportRef: 'impulsor' })) })

  it('BLO-018 Impulsor carries 6 models: Intercessors (with Marcellos) and Incursors may embark, Aggressors (GRAVIS) are refused, and the two squads together are refused', () => {
    const s = makeState()
    expect(transportService.capacity(s, IMP)).toBe(6)
    expect(transportService.canCarry(s, INT, IMP)).toBe(true) // 5 Intercessors + Marcellos = 6
    expect(transportService.canCarry(s, MAR, IMP)).toBe(true) // either id names the same attached unit
    expect(transportService.canCarry(s, INC, IMP)).toBe(true)
    expect(transportService.canCarry(s, AGG, IMP)).toBe(false) // GRAVIS
    expect(s.units[INT].models.length + s.units[MAR].models.length).toBe(6)
    expect(s.units[INC].models.length).toBe(5)

    // 11 models in all: once the Incursors are aboard the Intercessors cannot join
    transportService.embark(s, INC, IMP)
    expect(transportService.canCarry(s, INT, IMP)).toBe(false)
    expect(transportService.canCarry(s, INC, IMP)).toBe(true) // re-evaluating a passenger excludes itself

    // the unattached squad: 5 + 5 = 10 models is refused, 5 + the lone Librarian = 6 fits
    const u = makeState({ a: { attachments: [] } })
    transportService.embark(u, INT, IMP)
    expect(transportService.canCarry(u, INC, IMP)).toBe(false)
    expect(transportService.canCarry(u, MAR, IMP)).toBe(true)
    transportService.embark(u, MAR, IMP)
    expect(transportService.canCarry(u, INC, IMP)).toBe(false)

    // setup embarkation applies the same gate
    expect(() => makeState({ a: emb('intercessor-squad', 'incursor-squad') })).toThrow(/cannot be carried/)
    expect(() => makeState({ a: emb('aggressor-squad') })).toThrow(/cannot be carried/)
    const ok = makeState({ a: emb('incursor-squad') })
    expect(transportService.transportOf(ok, INC)).toBe(IMP)
  })

  function loaded() {
    const s = makeState({ phase: 'shooting' })
    placeUnit(s, BOYZ, { x: -4, z: 14, gap: 0.3 })
    placeUnit(s, IMP, [[0, 0]])
    transportService.embark(s, INT, IMP)
    transportService.embark(s, INC, IMP) // bookkeeping only: a second passenger unit so the Firing Deck cap bites
    const { ctx } = ctxOf(s)
    const entries = buildShootingWeaponEntries(ctx, IMP)
    const pending = { kind: 'declareTargets', id: 'd:fd', player: 'A', window: 'shooting.start', canPass: true, context: { unitId: IMP, attackKind: 'ranged', overwatch: false, weapons: entries, engagedWith: [] } } as unknown as Extract<PendingDecision, { kind: 'declareTargets' }>
    return { s, ctx, entries, pending }
  }
  const isPistol = (s: GameState, weaponId: string): boolean => s.weapons[weaponId].abilities.some((a) => a.ability === 'PISTOL')

  it('BLO-019 Firing Deck 6: at most 6 embarked models fire one ranged weapon each through the Impulsor; the units they belong to cannot shoot again', () => {
    const { s, ctx, entries, pending } = loaded()
    // one weapon per passenger: its first non-Pistol, else its Pistol (the Sergeant only has a pistol in range)
    const usable = (modelId: string) => entries.filter((e) => e.modelId === modelId && e.legalTargets.includes(BOYZ))
    const pick = (modelId: string) => usable(modelId).find((e) => !isPistol(s, e.weaponId)) ?? usable(modelId)[0]
    const declare = (modelIds: string[]) => {
      const targets = modelIds.flatMap((m) => { const e = pick(m); return e ? [{ modelId: e.modelId, weaponId: e.weaponId, targetUnitId: BOYZ }] : [] })
      const own = entries.find((e) => s.models[e.modelId].unitId === IMP && e.legalTargets.includes(BOYZ))!
      targets.push({ modelId: own.modelId, weaponId: own.weaponId, targetUnitId: BOYZ })
      return { type: 'declareTargets', player: 'A', decisionId: 'd:fd', unitId: IMP, targets } as Extract<Action, { type: 'declareTargets' }>
    }
    expect(firingDeckWeapons(s, IMP).map((d) => s.models[d.modelId].unitId).filter((u) => u === INT || u === MAR || u === INC)).toHaveLength(11)

    // the Intercessors + Marcellos are exactly 6 models; adding a seventh passenger is refused
    const six = [...s.units[INT].models, ...s.units[MAR].models]
    expect(six).toHaveLength(6)
    const seven = [...six, s.units[INC].models[0]]
    const tooMany = validateDeclareTargets(s, declare(seven), pending)
    expect(tooMany).not.toBeNull()
    expect(tooMany!.reason).toMatch(/Firing Deck allows at most 6/)
    expect(validateDeclareTargets(s, declare(six), pending)).toBeNull()

    // firing: the Impulsor, the Intercessors and Marcellos are spent; the unused Incursors still offer their guns
    expect(s.units[INT].turn.shotThisPhase).toBeFalsy()
    expect(shootingModule.handle(ctx, declare(six), pending)).toBeUndefined()
    for (const u of [IMP, INT, MAR]) expect(s.units[u].turn.shotThisPhase, u).toBe(true)
    expect(s.units[INC].turn.shotThisPhase).toBeFalsy()
    const left = firingDeckWeapons(s, IMP)
    expect(left.length).toBeGreaterThan(0)
    expect(left.every((d) => s.models[d.modelId].unitId === INC)).toBe(true)
    expect(left.some((d) => six.includes(d.modelId))).toBe(false)
  })

  it('BLO-020 Impulsor Deadly Demise D3: destroyed, a 6 deals D3 mortal wounds to units within 6", a 5 deals none; the passengers emergency-disembark either way', () => {
    const boom = (trigger: number, d3: number) => {
      const s = makeState({ phase: 'shooting', active: 'B', a: emb('intercessor-squad') })
      placeUnit(s, IMP, [[0, 0]])
      placeUnit(s, BOYZ, { x: 6, z: 0, gap: 0.3 })
      placeUnit(s, BOYZ2, { x: 0, z: 40, gap: 0.3 })
      expect(transportService.transportOf(s, INT)).toBe(IMP)
      expect(s.datasheets[s.units[IMP].datasheetId].coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE')?.value).toBe('D3')
      // trigger die, the D3, then one D6 per disembarking model (6 = unharmed)
      const { ctx, events } = ctxOf(s, [trigger, d3, 6, 6, 6, 6, 6, 6, 6, 6])
      attackService.destroyModel(ctx, s.units[IMP].models[0], { player: 'B', unitId: BOYZ, modelId: s.units[BOYZ].models[0], kind: 'ranged' })
      return { s, events }
    }
    const big = boom(6, 5) // D3 of a 5 is 3
    expect(of(big.events, 'DeadlyDemiseRolled')[0]).toMatchObject({ exploded: true })
    expect(of(big.events, 'DeadlyDemiseRolled')[0].affected).toContain(BOYZ)
    expect(of(big.events, 'DeadlyDemiseRolled')[0].affected).not.toContain(BOYZ2)
    expect(big.s.phaseState.attack?.mortalQueue.some((q) => q.targetUnitId === BOYZ && q.count === 3)).toBe(true)
    const small = boom(6, 1) // D3 of a 1 is 1
    expect(small.s.phaseState.attack?.mortalQueue.some((q) => q.targetUnitId === BOYZ && q.count === 1)).toBe(true)
    const dud = boom(5, 5)
    expect(of(dud.events, 'DeadlyDemiseRolled')[0]).toMatchObject({ exploded: false, affected: [] })
    expect(dud.s.phaseState.attack?.mortalQueue?.some((q) => q.targetUnitId === BOYZ) ?? false).toBe(false)

    for (const r of [big, small, dud]) {
      expect(r.s.units[IMP].location).toBe('destroyed')
      for (const id of [INT, MAR]) {
        expect(r.s.units[id].location, id).toBe('board')
        expect(transportService.transportOf(r.s, id), id).toBeNull()
        expect(r.s.units[id].battleShocked, id).toBe(true)
        expect(transportService.cannotChargeThisTurn(r.s, id), id).toBe(true)
      }
      expect(r.s.units[INT].models).toHaveLength(5)
      expect(of(r.events, 'AbilityTriggered').filter((e) => e.abilityId === 'transport.emergencyDisembark')).toHaveLength(1)
    }
  })
})

// ---------- Sim (BLO-026) ----------
describe('Simulation', () => {
  it('BLO-026 Blood Angels play full games to the battle end against Space Marines and Orks with no invariant violations', () => {
    const prev = { f: process.env.SIM_FACTION, v: process.env.SIM_VS }
    try {
      process.env.SIM_FACTION = 'blood-angels'
      for (const vs of ['sm', 'ork']) {
        process.env.SIM_VS = vs
        for (let g = 0; g < 2; g++) {
          const run = runGame(bundle, 11, g, 'test')
          expect(run.violations, `${vs} game ${g}`).toEqual([])
          expect(run.final.phase).toBe('ended')
          expect(Object.values(run.factions)).toContain('blood-angels')
          expect(Object.values(run.factions)).toContain(vs)
        }
      }
    } finally {
      if (prev.f === undefined) delete process.env.SIM_FACTION; else process.env.SIM_FACTION = prev.f
      if (prev.v === undefined) delete process.env.SIM_VS; else process.env.SIM_VS = prev.v
    }
  }, 120_000)
})
