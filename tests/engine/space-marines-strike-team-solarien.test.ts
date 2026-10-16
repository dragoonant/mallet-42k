// Space Marines: Strike Team Solarien (docs/spec/factions/space-marines--strike-team-solarien.md, SOL- checklist ids), real Combat Patrol data.
// Code hooks: Auto-choral Resonators, Stealthy Hunter, Shrouding, Omni-scramblers, Strategic Dispersal, Suppression Fire, Rapid Repositioning and
// the Reconnaissance in Force / Pinpoint Purge secondaries. The engine seams they use (E1-E4) are covered in
// space-marines-strike-team-solarien-core.test.ts.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type ChooseOptionDecision, type UseStratagemAction, type EngineContext, type GameEvent, type GameSetup, type GameState, type PendingDecision, type PlayerSetup,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { hookService } from '../../src/engine/hooks-impl'
import { leaderService } from '../../src/engine/leaders'
import { setupModule } from '../../src/engine/setup'
import { stratagemService } from '../../src/engine/stratagems'
import { weaponService } from '../../src/engine/weapons'
import { smRapidRepositioningApply, smRapidRepositioningCheck } from '../../src/engine/factions/space-marines'
import { targetLegality } from '../../src/engine/phases/shooting'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const SM = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Marines', faction: 'sm', patrolId: 'sm.cp.strike-team-solarien', enhancementId: 'sm.e.auto-choral-resonators', secondaryId: 'sm.sec.reconnaissance-in-force',
  attachments: [{ leaderRef: 'lieutenant-solarien', bodyguardRef: 'infiltrator-squad' }], reserves: [], battleReadyVp: 0, ...o,
})
const ORK = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Orks', faction: 'ork', patrolId: 'ork.cp.gordrangs-gitstompas', enhancementId: 'ork.e.grizzled-skarboy', secondaryId: 'ork.sec.stomp-em',
  attachments: [], reserves: [], battleReadyVp: 0, ...o,
})

const SOL = 'A:lieutenant-solarien', XAR = 'A:librarian-xarius', INF = 'A:infiltrator-squad', SUP = 'A:suppressor-squad'
const BOYZ = 'B:boyz-a', BOYZ2 = 'B:boyz-b'

interface Opts { a?: Partial<PlayerSetup>; b?: Partial<PlayerSetup>; round?: number; phase?: GameState['phase']; active?: 'A' | 'B' }

function makeState(o: Opts = {}): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM(o.a), B: ORK(o.b) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'sol', ENGINE_VERSION)
  s.round = o.round ?? 2
  s.activePlayer = o.active ?? 'A'
  s.phase = o.phase ?? 'shooting'
  s.phaseState = emptyPhaseState()
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

// first no-man's-land marker, with the whole unit parked on it
function neutralMarkers(s: GameState) { return Object.values(s.objectives).filter((o) => !o.removed && o.home === null) }
function parkOn(s: GameState, unitId: string, obj: { pos: { x: number; z: number } }): void {
  placeUnit(s, unitId, s.units[unitId].models.map((): [number, number] => [obj.pos.x, obj.pos.z]))
}

// ---------- SOL-008 / SOL-009 Auto-choral Resonators ----------
describe('Auto-choral Resonators', () => {
  function endCommand(s: GameState) {
    const c = ctxOf(s)
    hookService.run(c.ctx, 'onPhaseEnd', {})
    return c.events
  }
  it('SOL-008 a controlled marker in range of the bearer unit (attached unit included) becomes sticky at the end of the own Command phase', () => {
    const s = makeState({ phase: 'command' })
    const obj = neutralMarkers(s)[0]
    // the bearer is the Lieutenant, attached; the marker is in range of the bodyguard half too
    parkOn(s, INF, obj)
    placeUnit(s, SOL, [[obj.pos.x + 30, obj.pos.z]])
    obj.controller = 'A'
    const events = endCommand(s)
    expect(obj.stickyBy).toBe('A')
    expect(of(events, 'ObjectiveSecured').some((e) => e.flag === 'sticky' && e.objectiveId === obj.id)).toBe(true)
    // models leave: it stays controlled (CP-2.6)
    placeUnit(s, INF, s.units[INF].models.map((): [number, number] => [obj.pos.x + 30, obj.pos.z + 5]))
    DEFAULT_MODULES.services.objectives.evaluateControl(ctxOf(s).ctx, 'turnEnd')
    expect(obj.controller).toBe('A')
  })
  it('SOL-009 no sticky when out of range, when the marker is not controlled, or in the opponent\'s Command phase', () => {
    let s = makeState({ phase: 'command' })
    let obj = neutralMarkers(s)[0]
    placeUnit(s, INF, s.units[INF].models.map((): [number, number] => [obj.pos.x + 30, obj.pos.z]))
    placeUnit(s, SOL, [[obj.pos.x + 30, obj.pos.z]])
    obj.controller = 'A'
    endCommand(s)
    expect(obj.stickyBy).toBeNull()

    s = makeState({ phase: 'command' })
    obj = neutralMarkers(s)[0]
    parkOn(s, INF, obj)
    obj.controller = null
    endCommand(s)
    expect(obj.stickyBy).toBeNull()

    s = makeState({ phase: 'command', active: 'B' })
    obj = neutralMarkers(s)[0]
    parkOn(s, INF, obj)
    obj.controller = 'A'
    endCommand(s)
    expect(obj.stickyBy).toBeNull()
  })
})

// ---------- Stealthy Hunter / Shrouding ----------
function rangedShooter(s: GameState, unitId: string): { model: string; weaponId: string } {
  for (const id of s.units[unitId].models) {
    const w = s.models[id].weapons.find((x) => s.weapons[x]?.kind === 'ranged' && s.weapons[x].range >= 18)
    if (w) return { model: id, weaponId: w }
  }
  throw new Error('no long-range weapon')
}
// puts the shooter's first model exactly `gap` inches (edge to edge) from the target's first model
function gapTo(s: GameState, shooterUnit: string, targetUnit: string, gap: number): { model: string; weaponId: string } {
  placeUnit(s, shooterUnit, s.units[shooterUnit].models.map((): [number, number] => [-20, 0]))
  placeUnit(s, targetUnit, s.units[targetUnit].models.map((): [number, number] => [-20, 0]))
  const sh = rangedShooter(s, shooterUnit)
  const from = s.models[sh.model]
  const tm = s.models[s.units[targetUnit].models[0]]
  tm.pos = { x: from.pos.x + gap + from.base.radius + tm.base.radius, y: 0, z: from.pos.z }
  for (const id of s.units[targetUnit].models.slice(1)) s.models[id].pos = { ...tm.pos, x: tm.pos.x + 0.1 * Number(id.length) }
  return sh
}
const legal = (s: GameState, shooterUnit: string, sh: { model: string; weaponId: string }, targetUnit: string) => targetLegality(s, shooterUnit, sh.model, s.weapons[sh.weaponId], targetUnit)

describe('Stealthy Hunter', () => {
  const SH = { enhancementId: 'sm.e.stealthy-hunter', attachments: [] }
  it('SOL-010 unattached bearer has Lone Operative (12" target cap) and Stealth', () => {
    const s = makeState({ a: SH })
    expect(hookService.hasCoreAbility(s, SOL, 'STEALTH')).toBe(true)
    expect(hookService.hasCoreAbility(s, SOL, 'LONE_OPERATIVE')).toBe(true)
    expect(hookService.hasCoreAbility(s, XAR, 'STEALTH')).toBe(false)
    const sh = gapTo(s, BOYZ, SOL, 13)
    expect(legal(s, BOYZ, sh, SOL)?.code).toBe('E_NOT_IN_RANGE')
    const sh2 = gapTo(s, BOYZ, SOL, 12)
    expect(legal(s, BOYZ, sh2, SOL)).toBeNull()
  })
  it('SOL-011 attached to Infiltrators: no Lone Operative range cap, and the unit as a whole has no Stealth', () => {
    const s = makeState({ a: { enhancementId: 'sm.e.stealthy-hunter' } })
    expect(leaderService.isAttached(s, SOL)).toBe(true)
    const sh = gapTo(s, BOYZ, INF, 14)
    placeUnit(s, SOL, [[s.models[s.units[INF].models[0]].pos.x, s.models[s.units[INF].models[0]].pos.z]])
    expect(legal(s, BOYZ, sh, INF)).toBeNull()
    // the bodyguard half lacks Stealth, so the attached unit is not Stealthy as a whole
    expect(hookService.hasCoreAbility(s, INF, 'STEALTH')).toBe(false)
  })
  it('SOL-012 the scoped carbine gains Anti-Infantry 4+, Devastating Wounds and Precision; other weapons do not', () => {
    const s = makeState({ a: SH })
    const model = s.units[SOL].models[0]
    const byData = (id: string) => s.models[model].weapons.find((w) => w === id || s.weapons[w]?.id === id) as string
    const carbine = byData('sm.w.master-crafted-scoped-bolt-carbine')
    const pistol = byData('sm.w.bolt-pistol-solarien')
    const abs = hookService.weaponAbilitiesFor!(s, model, s.weapons[carbine]).map((a) => a.ability)
    expect(abs).toEqual(expect.arrayContaining(['ANTI', 'DEVASTATING_WOUNDS', 'PRECISION']))
    const pAbs = hookService.weaponAbilitiesFor!(s, model, s.weapons[pistol]).map((a) => a.ability)
    expect(pAbs).not.toContain('PRECISION')
    expect(pAbs).not.toContain('DEVASTATING_WOUNDS')
  })
})

describe('Shrouding', () => {
  const attachedXarius = { attachments: [{ leaderRef: 'librarian-xarius', bodyguardRef: 'infiltrator-squad' }] }
  it('SOL-022 Xarius leading Infiltrators: the unit has Stealth and cannot be shot from beyond 12"', () => {
    const s = makeState({ a: attachedXarius })
    placeUnit(s, INF, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, XAR, [[0, 3]])
    expect(leaderService.isAttached(s, XAR)).toBe(true)
    expect(hookService.hasCoreAbility(s, INF, 'STEALTH')).toBe(true)
    expect(hookService.hasCoreAbility(s, XAR, 'STEALTH')).toBe(true)
    const far = gapTo(s, BOYZ, INF, 13)
    placeUnit(s, XAR, [[s.models[s.units[INF].models[0]].pos.x, s.models[s.units[INF].models[0]].pos.z]])
    expect(legal(s, BOYZ, far, INF)?.code).toBe('E_NOT_IN_RANGE')
    const near = gapTo(s, BOYZ, INF, 12)
    placeUnit(s, XAR, [[s.models[s.units[INF].models[0]].pos.x, s.models[s.units[INF].models[0]].pos.z]])
    expect(legal(s, BOYZ, near, INF)).toBeNull()
  })
  it('SOL-023 unattached Xarius and Infiltrators alone get neither Stealth nor a range cap', () => {
    const s = makeState({ a: { attachments: [] } })
    expect(hookService.hasCoreAbility(s, XAR, 'STEALTH')).toBe(false)
    expect(hookService.hasCoreAbility(s, INF, 'STEALTH')).toBe(false)
    const sh = gapTo(s, BOYZ, XAR, 14)
    expect(hookService.targetRangeCapFor(s, XAR, sh.model)).toBeNull()
    expect(legal(s, BOYZ, sh, XAR)).toBeNull()
  })
})

describe('Omni-scramblers', () => {
  it('SOL-024 SOL-025 enemy arrivals are excluded within 12" of the Infiltrators (attached unit included); the owner is not restricted', () => {
    const s = makeState()
    placeUnit(s, INF, [[0, 0]])
    placeUnit(s, SOL, [[0, 1]])
    const zonesB = hookService.reserveExclusionZones(s, 'B')
    expect(zonesB.length).toBe(1)
    expect(zonesB[0].distance).toBe(12)
    expect(zonesB[0].unitIds).toEqual(expect.arrayContaining([INF, SOL]))
    expect(hookService.reserveExclusionZones(s, 'A')).toEqual([])
    // off the table, no zone
    s.units[INF].location = 'reserves'
    s.units[SOL].location = 'reserves'
    expect(hookService.reserveExclusionZones(s, 'B')).toEqual([])
  })
})

// ---------- Strategic Dispersal ----------
describe('Strategic Dispersal', () => {
  const key = (s: GameState) => s.units[SOL].bodyguardUnitId ?? SOL
  function ready(extra: Partial<Opts> = {}) {
    const s = makeState({ ...extra })
    placeUnit(s, INF, { x: -10, z: 0, gap: 0.3 })
    placeUnit(s, SOL, [[-10, 3]])
    placeUnit(s, BOYZ, { x: 20, z: 0, gap: 0.3 })
    return s
  }
  it('SOL-021 after the unit shot and is not engaged: use or decline; use rolls a D6 and opens a Normal move of that length', () => {
    const s = ready()
    const c = ctxOf(s, [4])
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', key(s))).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id)).toEqual(['use', 'decline'])
    answerOption(c.ctx, 'use')
    expect(s.pending?.kind).toBe('moveUnit')
    expect((s.pending as { constraints: { maxDistance: number } }).constraints.maxDistance).toBe(4)
    expect(of(c.events, 'AbilityTriggered').some((e) => e.abilityId === 'sm.a.strategic-dispersal')).toBe(true)
  })
  it('SOL-021 declining ends it; engaged, opponent\'s turn and a second offer in the same phase are not offered', () => {
    const s = ready()
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', key(s))).toBe(true)
    answerOption(c.ctx, 'decline')
    expect(s.pending).toBeNull()
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', key(s))).toBe(false)

    const engaged = ready()
    placeUnit(engaged, BOYZ, { x: -10, z: 1.4, gap: 0.3 })
    expect(hookService.offerPicks(ctxOf(engaged).ctx, 'shooting.attacksResolved', key(engaged))).toBe(false)

    const theirs = ready({ active: 'B' })
    expect(hookService.offerPicks(ctxOf(theirs).ctx, 'shooting.attacksResolved', key(theirs))).toBe(false)
  })
})

// ---------- Suppression Fire ----------
describe('Suppression Fire', () => {
  function hitMark(s: GameState, target: string): void {
    const w = s.models[s.units[SUP].models[0]].weapons.find((x) => x.includes('accelerator-autocannon')) as string
    s.phaseState.marks.push(`hitBy:${SUP}:${w}:${target}`)
  }
  // one attack by `unit` (default BOYZ) on SUP; returns the first hit roll. The Suppressors are only placed when `place` is not false,
  // so a caller can mark them destroyed first without the helper resurrecting them.
  function hitDie(s: GameState, o: { unit?: string; kind?: 'ranged' | 'melee'; overwatch?: boolean; place?: boolean } = {}): { die: number; final: number } {
    const unit = o.unit ?? BOYZ
    const kind = o.kind ?? 'ranged'
    if (o.place !== false) placeUnit(s, SUP, { x: -10, z: 0, gap: 0.3 })
    const usable = (w: string) => s.weapons[w]?.kind === kind && (kind === 'melee' || s.weapons[w].range >= 18)
    const model = s.units[unit].models.find((id) => s.models[id].weapons.some(usable))!
    const weaponId = s.models[model].weapons.find(usable)!
    const made = createContext(s, new ScriptedRng([4, ...Array(60).fill(1)]), DEFAULT_MODULES)
    attackService.begin(made.ctx, { kind, attackerUnitId: unit, overwatch: o.overwatch ?? false, targets: [{ modelId: model, weaponId, targetUnitId: SUP, profileGroup: null, attacks: null }] })
    attackService.advance(made.ctx)
    const hr = of(made.events, 'HitRolled')[0]
    return { die: hr.die, final: hr.final }
  }
  it('SOL-026 a single unit hit by the autocannon is suppressed at once: its ranged, melee and Overwatch attacks get -1 to hit until the Marine player\'s next turn', () => {
    const s = makeState()
    placeUnit(s, BOYZ, [[0, 0]])
    placeUnit(s, SUP, { x: -10, z: 0, gap: 0.3 })
    const before = hitDie(makeState())
    expect(before.final).toBe(before.die)
    hitMark(s, BOYZ)
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', SUP)).toBe(false)
    expect(s.pending).toBeNull()
    const eff = s.units[BOYZ].effects.find((e) => e.sourceAbilityId === 'sm.a.suppression-fire')
    expect(eff?.expires).toMatchObject({ kind: 'nextOwnTurn', player: 'A' })
    const ranged = hitDie(s)
    expect(ranged.final).toBe(ranged.die - 1)
    const ow = hitDie(s, { overwatch: true })
    expect(ow.final).toBe(ow.die - 1)
    // melee: BOYZ in Engagement Range of the Suppressors, suppressed vs not
    placeUnit(s, BOYZ, { x: -10, z: 1.4, gap: 0.3 })
    const melee = hitDie(s, { kind: 'melee' })
    expect(melee.final).toBe(melee.die - 1)
    const clean = makeState()
    placeUnit(clean, BOYZ, { x: -10, z: 1.4, gap: 0.3 })
    const unaffected = hitDie(clean, { kind: 'melee' })
    expect(unaffected.final).toBe(unaffected.die)
  })
  it('SOL-027 two candidates raise a choice; a unit only hit by other weapons is no candidate; the penalty ends when the Suppressors are gone', () => {
    const s = makeState()
    placeUnit(s, BOYZ, [[0, 0]])
    placeUnit(s, BOYZ2, [[0, 6]])
    placeUnit(s, SUP, { x: -10, z: 0, gap: 0.3 })
    hitMark(s, BOYZ)
    hitMark(s, BOYZ2)
    const pistol = s.models[s.units[SUP].models[0]].weapons.find((x) => x.includes('bolt-pistol')) as string
    s.phaseState.marks.push(`hitBy:${SUP}:${pistol}:B:warboss`)
    const c = ctxOf(s)
    expect(hookService.offerPicks(c.ctx, 'shooting.attacksResolved', SUP)).toBe(true)
    expect(pendingOption(s).options.map((o) => o.id).sort()).toEqual([BOYZ, BOYZ2])
    answerOption(c.ctx, BOYZ2)
    expect(s.units[BOYZ2].effects.some((e) => e.sourceAbilityId === 'sm.a.suppression-fire')).toBe(true)
    expect(s.units[BOYZ].effects.some((e) => e.sourceAbilityId === 'sm.a.suppression-fire')).toBe(false)
    // the suppressed unit is penalised while the Suppressors live; the other one is not
    const live = hitDie(s, { unit: BOYZ2 })
    expect(live.final).toBe(live.die - 1)
    const other = hitDie(s, { unit: BOYZ })
    expect(other.final).toBe(other.die)
    // the Suppressors are destroyed (and not re-placed): the penalty ends at once
    s.units[SUP].location = 'destroyed'
    const gone = hitDie(s, { unit: BOYZ2, place: false })
    expect(gone.final).toBe(gone.die)
  })
})

// ---------- Rapid Repositioning ----------
describe('Rapid Repositioning', () => {
  function env(s: GameState, moverId: string) {
    return { state: s, services: DEFAULT_MODULES.services, player: 'A', stratagem: s.stratagems['sm.s.rapid-repositioning'], window: 'movement.unitMoved', trigger: { unitId: moverId } } as never
  }
  const tuple = (unit: string) => ({ ids: [unit], objectiveId: null })
  function ready() {
    const s = makeState({ phase: 'movement', active: 'B', a: { attachments: [] } })
    placeUnit(s, INF, { x: 0, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 0, z: 8, gap: 0.3 })
    s.units[BOYZ].turn.moveType = 'normal'
    return s
  }
  it('SOL-019 offered within 9" after an enemy Normal/Advance/Fall Back move; applying opens a 3" Normal move', () => {
    for (const t of ['normal', 'advance', 'fallBack'] as const) {
      const s = ready()
      s.units[BOYZ].turn.moveType = t
      expect(smRapidRepositioningCheck(env(s, BOYZ), tuple(INF))).toBe(true)
    }
    const s = ready()
    const c = ctxOf(s)
    smRapidRepositioningApply(c.ctx, env(s, BOYZ), tuple(INF))
    expect(s.pending?.kind).toBe('moveUnit')
    expect((s.pending as { constraints: { maxDistance: number } }).constraints.maxDistance).toBe(3)
  })
  it('SOL-020 not offered when 9.5" away, engaged, for a reinforcement arrival, or by the mover\'s own side', () => {
    let s = ready()
    placeUnit(s, BOYZ, { x: 0, z: 9.5 + 1.3, gap: 0.3 })
    placeUnit(s, INF, { x: 0, z: 0, gap: 0.3 })
    expect(smRapidRepositioningCheck(env(s, BOYZ), tuple(INF))).toBe(false)

    s = ready()
    placeUnit(s, BOYZ, { x: 0, z: 1.4, gap: 0.3 })
    expect(smRapidRepositioningCheck(env(s, BOYZ), tuple(INF))).toBe(false)

    s = ready()
    s.units[BOYZ].turn.moveType = 'reinforcements' as never
    expect(smRapidRepositioningCheck(env(s, BOYZ), tuple(INF))).toBe(false)

    s = ready()
    expect(smRapidRepositioningCheck({ ...(env(s, BOYZ) as object), player: 'B' } as never, tuple(INF))).toBe(false)
  })
})

// ---------- secondaries ----------
describe('Reconnaissance in Force', () => {
  function score(s: GameState): number {
    const before = s.players.A.vp
    DEFAULT_MODULES.services.missions.onWindow(ctxOf(s).ctx, 'turn.end', 'turn')
    return s.players.A.vp - before
  }
  function control(s: GameState, a: number, b: number): void {
    const markers = neutralMarkers(s)
    markers.forEach((o, i) => { o.controller = i < a ? 'A' : i < a + b ? 'B' : null })
  }
  it('SOL-013 round 2, own turn end: 1 v 1 scores 2, 2 v 1 scores 4, 0 v 0 scores 0; home markers are ignored', () => {
    for (const [a, b, vp] of [[1, 1, 2], [2, 1, 4], [0, 0, 0], [0, 1, 0]] as const) {
      const s = makeState({ phase: 'fight' })
      expect(neutralMarkers(s).length).toBeGreaterThanOrEqual(3)
      control(s, a, b)
      for (const o of Object.values(s.objectives)) if (o.home) o.controller = o.home === 'A' ? 'B' : 'A'
      expect(score(s)).toBe(vp)
    }
  })
  it('SOL-014 round 1 and the opponent\'s turn end score nothing', () => {
    let s = makeState({ phase: 'fight', round: 1 })
    control(s, 2, 0)
    expect(score(s)).toBe(0)
    s = makeState({ phase: 'fight', active: 'B' })
    control(s, 2, 0)
    expect(score(s)).toBe(0)
  })
})

describe('Pinpoint Purge', () => {
  const PP = { secondaryId: 'sm.sec.pinpoint-purge' }
  function kill(s: GameState, unitId: string, o: { kind?: 'ranged' | 'melee' | 'mortal'; rangedAttack?: boolean; byPlayer?: 'A' | 'B' } = {}): number {
    const before = s.players.A.vp
    s.units[unitId].location = 'destroyed'
    DEFAULT_MODULES.services.missions.unitDestroyed!(ctxOf(s).ctx, {
      unitId, byPlayer: o.byPlayer ?? 'A', byUnitId: SUP, byModelId: null, kind: o.kind ?? 'ranged', rangedAttack: o.rangedAttack ?? (o.kind ?? 'ranged') === 'ranged',
    })
    return s.players.A.vp - before
  }
  it('SOL-015 a ranged kill scores 2, the Oath target 3; melee and the opponent\'s own kill score nothing', () => {
    let s = makeState({ a: PP })
    expect(kill(s, BOYZ)).toBe(2)
    s = makeState({ a: PP })
    s.players.A.oathTargetUnitId = BOYZ
    expect(kill(s, BOYZ)).toBe(3)
    s = makeState({ a: PP })
    expect(kill(s, BOYZ, { kind: 'melee' })).toBe(0)
    s = makeState({ a: PP })
    expect(kill(s, BOYZ, { byPlayer: 'B', kind: 'ranged' })).toBe(0)
  })
  it('SOL-016 the opponent\'s turn counts (Overwatch), a ranged attack\'s mortal wounds count, and an attached unit scores once when its last half dies', () => {
    let s = makeState({ a: PP, active: 'B' })
    expect(kill(s, BOYZ)).toBe(2)
    s = makeState({ a: PP })
    expect(kill(s, BOYZ, { kind: 'mortal', rangedAttack: true })).toBe(2)
    // mirror match: B (Pinpoint Purge) kills A's attached Lieutenant + Infiltrators
    const setup: GameSetup = {
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM(), B: SM({ secondaryId: 'sm.sec.pinpoint-purge', attachments: [] }) },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }
    s = createGameState(setup, bundle, 'sol-mirror', ENGINE_VERSION)
    s.round = 2; s.activePlayer = 'B'; s.phase = 'shooting'; s.phaseState = emptyPhaseState()
    const leader = s.units[INF].attachedLeaderId as string
    expect(leader).toBe(SOL)
    const killB = (unitId: string): number => {
      const before = s.players.B.vp
      s.units[unitId].location = 'destroyed'
      DEFAULT_MODULES.services.missions.unitDestroyed!(ctxOf(s).ctx, { unitId, byPlayer: 'B', byUnitId: 'B:suppressor-squad', byModelId: null, kind: 'ranged', rangedAttack: true })
      return s.players.B.vp - before
    }
    expect(killB(leader)).toBe(0)
    expect(killB(INF)).toBe(2)
  })
})

// ---------- Oath of Moment, deployment abilities ----------
describe('Datasheet abilities', () => {
  const onHit = (s: GameState, unit: string, target: string, oathTarget: boolean) => {
    const am = s.models[s.units[unit].models[0]]
    const wid = am.weapons.find((w) => s.weapons[w].kind === 'ranged')!
    const attack = {
      kind: 'ranged', overwatch: false, attackerUnitId: unit, attackerModelId: am.id, weapon: s.weapons[wid], targetUnitId: target,
      targetModelId: s.units[target].models[0], range: 5, halfRange: false, inCover: false, charged: false, oathTarget, attackerInEngagement: false,
    }
    const out = hookService.collect(ctxOf(s).ctx, 'onHitRoll', { attack, roll: { purpose: 'hit', roll: null, dieIndex: 0, unmodified: 2, rerolled: false } } as never)
    return out.some(({ result }) => result.kind === 'roll' && (result as { reroll?: string }).reroll === 'all')
  }
  it('SOL-004 Oath of Moment: an Infiltrator carbine attack against the Oath target may re-roll the hit roll, against another unit it may not', () => {
    const s = makeState()
    placeUnit(s, INF, { x: -10, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    expect(onHit(s, INF, BOYZ, true)).toBe(true)
    expect(onHit(s, INF, BOYZ, false)).toBe(false)
  })

  it('SOL-005 Infiltrators: Solarien, Infiltrators and Xarius have it (so the attached combination may deploy 9" out); Suppressors do not', () => {
    const s = makeState()
    for (const id of [SOL, INF, XAR]) expect(hookService.hasCoreAbility(s, id, 'INFILTRATORS')).toBe(true)
    expect(hookService.hasCoreAbility(s, SUP, 'INFILTRATORS')).toBe(false)
    expect(leaderService.isAttached(s, SOL)).toBe(true)
  })

  function preBattle(a: Partial<PlayerSetup>): GameState {
    const s = makeState({ phase: 'deployment', a })
    s.step = 'preBattle'; s.firstPlayer = 'A'
    for (const id of Object.keys(s.units)) placeUnit(s, id, [[s.units[id].player === 'A' ? -12 : 12, 0]])
    setupModule.advance(ctxOf(s).ctx)
    return s
  }
  it('SOL-006 Scouts 6": the unattached Solarien is offered a pre-battle Scouts move; the attached combination is not', () => {
    const un = preBattle({ attachments: [] })
    expect(un.pending?.kind).toBe('moveUnit')
    expect((un.pending as unknown as { context: { unitId: string } }).context.unitId).toBe(SOL)
    expect((un.pending as unknown as { constraints: { maxDistance: number } }).constraints.maxDistance).toBe(6)
    // attached: the Leader travels with its bodyguard, which has no Scouts, so no Scouts move is offered
    const at = preBattle({})
    expect(at.pending).toBeNull()
  })

  it('SOL-007 Deep Strike: the unattached Solarien may start in Reserves; Infiltrators, Xarius and Suppressors may not', () => {
    const build = (ref: string) => createGameState(
      { missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: SM({ attachments: [], reserves: [ref] }), B: ORK() }, sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test' },
      bundle, 'sol-ds', ENGINE_VERSION,
    )
    expect(build('lieutenant-solarien').units[SOL].location).toBe('reserves')
    for (const ref of ['infiltrator-squad', 'librarian-xarius', 'suppressor-squad']) expect(() => build(ref)).toThrow(/Deep Strike/)
  })
})

// ---------- stratagems ----------
describe('Stratagems', () => {
  function useStratagem(s: GameState, ctx: EngineContext, stratagemId: string, window: Parameters<typeof stratagemService.options>[2], target: string, trigger: { unitId?: string } = {}): void {
    const action = stratagemService.options(s, 'A', window, trigger).find((x) => x.stratagemId === stratagemId && x.targets.unitIds?.[0] === target)
    if (!action) throw new Error(`${stratagemId} on ${target} not offered`)
    const pending = { id: 'd:1', kind: 'stratagemWindow', player: 'A', window, canPass: true, context: { trigger }, options: [] } as unknown as PendingDecision
    const act = { ...action, decisionId: 'd:1' } as UseStratagemAction
    expect(stratagemService.validate!(s, act, pending)).toBeNull()
    expect(stratagemService.handle(ctx, act, pending)).toBeUndefined()
  }
  const offered = (s: GameState, player: 'A' | 'B', window: Parameters<typeof stratagemService.options>[2], id: string): boolean =>
    stratagemService.options(s, player, window, {}).some((x) => x.stratagemId === id)
  const ocOf = (s: GameState, unitId: string): number => hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'OC' }, 1)

  it('SOL-017 Vanguard Strike: Infiltrators OC 1 -> 2 through the opponent\'s turn; gone when the next own Command phase starts', () => {
    const s = makeState({ phase: 'command' })
    s.players.A.cp = 3
    placeUnit(s, INF, { x: -10, z: 0, gap: 0.3 })
    const { ctx } = ctxOf(s)
    expect(ocOf(s, INF)).toBe(1)
    useStratagem(s, ctx, 'sm.s.vanguard-strike', 'command.start', INF)
    expect(s.players.A.cp).toBe(2)
    expect(ocOf(s, INF)).toBe(2)
    const eff = s.units[INF].effects.find((e) => e.sourceAbilityId === 'sm.s.vanguard-strike' || e.sourceAbilityId?.includes('vanguard'))
    expect(eff?.expires).toMatchObject({ kind: 'nextOwnTurn', player: 'A' })
    // end of phase, end of own turn and the opponent's turn start do not remove it
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    ctx.services.effects.expire(ctx, 'turnEnd', 'A')
    ctx.services.effects.expire(ctx, 'nextOwnTurn', 'B')
    expect(ocOf(s, INF)).toBe(2)
    // the start of A's next Command phase ends it
    ctx.services.effects.expire(ctx, 'nextOwnTurn', 'A')
    expect(ocOf(s, INF)).toBe(1)
  })

  it('SOL-018 Giantslayer Doctrine: Suppressor autocannon AP -1 -> -2 and Anti-Monster/Vehicle 4+; not offered after the unit shot; ends with the phase', () => {
    const s = makeState()
    s.players.A.cp = 3
    placeUnit(s, SUP, { x: -10, z: 0, gap: 0.3 })
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    const model = s.units[SUP].models[0]
    const gun = s.models[model].weapons.find((w) => w.includes('accelerator-autocannon'))!
    const stats = () => ({ ap: weaponService.effectiveWeapon(s, model, gun).AP, anti: hookService.weaponAbilitiesFor!(s, model, s.weapons[gun]).filter((a) => a.ability === 'ANTI').map((a) => `${a.keyword}${a.value}`).sort() })
    const base = stats()
    expect(base.anti).toEqual([])
    const { ctx } = ctxOf(s)
    useStratagem(s, ctx, 'sm.s.giantslayer-doctrine', 'shooting.start', SUP)
    const boosted = stats()
    expect(boosted.ap).toBe(base.ap - 1)
    expect(boosted.anti).toEqual(['MONSTER4', 'VEHICLE4'])
    ctx.services.effects.expire(ctx, 'phaseEnd', null)
    expect(stats()).toEqual(base)
    // not offered once the unit has shot this phase
    const t = makeState()
    t.players.A.cp = 3
    placeUnit(t, SUP, { x: -10, z: 0, gap: 0.3 })
    expect(offered(t, 'A', 'shooting.start', 'sm.s.giantslayer-doctrine')).toBe(true)
    t.units[SUP].turn.shotThisPhase = true
    expect(offered(t, 'A', 'shooting.start', 'sm.s.giantslayer-doctrine')).toBe(false)
  })

  it('SOL-032 stratagem ownership is patrol-scoped: in an Octavius v Solarien mirror neither side is offered the other patrol\'s stratagems', () => {
    const mirror = createGameState({
      missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01',
      players: {
        A: SM(),
        B: { name: 'Octavius', faction: 'sm', patrolId: 'sm.cp.strike-force-octavius', enhancementId: bundle.patrols['sm.cp.strike-force-octavius'].enhancements[0].id, secondaryId: bundle.patrols['sm.cp.strike-force-octavius'].secondaries[0].id, attachments: [], reserves: [], battleReadyVp: 0 },
      },
      sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
    }, bundle, 'sol-own', ENGINE_VERSION)
    const own = (pid: 'A' | 'B') => new Set(bundle.patrols[mirror.players[pid].patrolId].stratagems)
    const smIds = Object.values(mirror.stratagems).filter((x) => x.faction === 'sm').map((x) => x.id)
    expect(smIds.length).toBeGreaterThan(own('A').size)
    const mineOnly = (pid: 'A' | 'B') => smIds.filter((id) => own(pid).has(id) && !own(pid === 'A' ? 'B' : 'A').has(id))
    expect(mineOnly('A').length).toBeGreaterThan(0)
    expect(mineOnly('B').length).toBeGreaterThan(0)
    for (const pid of ['A', 'B'] as const) {
      const other = pid === 'A' ? 'B' : 'A'
      const usable = new Set<string>()
      for (const w of ['command.start', 'shooting.start', 'shooting.attacksResolved', 'movement.unitMoved', 'fight.unitSelected', 'charge.start'] as const) {
        mirror.players[pid].cp = 5
        mirror.activePlayer = pid
        mirror.phase = w.split('.')[0] === 'charge' ? 'charge' : (w.split('.')[0] as GameState['phase'])
        for (const id of stratagemService.usable(mirror, pid, w, {})) usable.add(id)
      }
      for (const id of mineOnly(other)) expect(usable.has(id)).toBe(false)
    }
  })
})

// ---------- weapon rules ----------
describe('Weapon rules', () => {
  function fire(s: GameState, unit: string, model: string, weaponId: string, target: string): GameEvent[] {
    s.phase = 'shooting'; s.activePlayer = 'A'
    const made = createContext(s, new ScriptedRng([3, ...Array(80).fill(1)]), DEFAULT_MODULES)
    attackService.begin(made.ctx, { kind: 'ranged', attackerUnitId: unit, overwatch: false, targets: [{ modelId: model, weaponId, targetUnitId: target, profileGroup: null, attacks: null }] })
    let r = attackService.advance(made.ctx)
    for (let g = 0; r === 'pending' && g < 200; g++) {
      const p = made.ctx.state.pending
      if (!p) break
      const action = ('options' in p && p.options.length > 0 ? p.options[0].action : { type: 'pass', player: p.player, decisionId: p.id }) as Action
      made.ctx.state.pending = null
      const owner = p.kind === 'stratagemWindow' || p.kind === 'reactionWindow' || p.kind === 'commandReroll' ? made.ctx.services.stratagems : attackService.handler
      owner.handle(made.ctx, action, p)
      r = attackService.advance(made.ctx)
    }
    return made.events
  }
  it('SOL-028 Heavy: stationary Suppressors add 1 to the hit roll, ones that moved do not', () => {
    for (const [moveType, bonus] of [['stationary', 1], ['normal', 0]] as const) {
      const s = makeState()
      placeUnit(s, SUP, { x: -10, z: 0, gap: 0.3 })
      placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
      s.units[SUP].turn.moveType = moveType
      const model = s.units[SUP].models[0]
      const gun = s.models[model].weapons.find((w) => w.includes('accelerator-autocannon'))!
      expect(hookService.weaponAbilitiesFor!(s, model, s.weapons[gun]).map((a) => a.ability).concat(s.weapons[gun].abilities.map((a) => a.ability))).toContain('HEAVY')
      const hr = of(fire(s, SUP, model, gun, BOYZ), 'HitRolled')[0]
      expect(hr.final).toBe(hr.die + bonus)
    }
  })

  it('SOL-029 Smite (focused witchfire) is Hazardous: a failed test on Xarius (CHARACTER) costs 3 mortal wounds, not the model', () => {
    const s = makeState({ a: { attachments: [] } })
    placeUnit(s, XAR, [[-10, 0]])
    placeUnit(s, BOYZ, { x: 10, z: 0, gap: 0.3 })
    const model = s.units[XAR].models[0]
    const focused = s.models[model].weapons.find((w) => w.includes('smite-focused'))!
    const plain = s.models[model].weapons.find((w) => w === 'sm.w.smite')!
    expect(s.models[model].woundsRemaining).toBe(4)
    expect(of(fire(s, XAR, model, plain, BOYZ), 'HazardousTested')).toHaveLength(0)
    const ev = of(fire(s, XAR, model, focused, BOYZ), 'HazardousTested')
    expect(ev.some((e) => e.failed && e.die === 1)).toBe(true)
    expect(s.units[XAR].location).toBe('board')
    expect(s.models[model].woundsRemaining).toBe(1)
  })
})
