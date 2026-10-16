// Penitent Host engine changes (docs/spec/factions/adepta-sororitas--the-penitent-host.md §7.1): E-PEN1 Saintly Relic
// Miracle die re-roll on gain, E-PEN2 Firing Deck on top of the existing transport system.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import type { DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createContext, createGameState, emptyPhaseState,
  type Action, type ChooseOptionDecision, type GameSetup, type GameState, type PlayerSetup,
} from '../../src/engine'
import { answerMiracleReroll, gainMiracleDie, miracleRerollOnGain, offerMiracleRerolls } from '../../src/engine/miracle'
import { buildShootingWeaponEntries, firingDeckWeapons } from '../../src/engine/phases/shooting'
import { shootingModule } from '../../src/engine/phases/shooting'
import { passengerHalves, transportService } from '../../src/engine/transports'
import { placeUnit } from '../fixtures'

let bundle: DataBundle
beforeAll(async () => { bundle = await loadBundle() })

const PEN = (o: Partial<PlayerSetup> = {}): PlayerSetup => ({
  name: 'Penitents', faction: 'adepta-sororitas', patrolId: 'ade.cp.the-penitent-host', enhancementId: 'ade.e.saintly-relic',
  secondaryId: 'ade.sec.divine-judgement', attachments: [{ leaderRef: 'canoness', bodyguardRef: 'sisters' }], reserves: [], battleReadyVp: 0, ...o,
})

function makeState(): GameState {
  const setup: GameSetup = {
    missionId: 'mission.cp-01', terrainLayoutId: 'terrain.cp-01', players: { A: PEN(), B: PEN({ enhancementId: 'ade.e.armour-of-faith' }) },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'test',
  }
  const s = createGameState(setup, bundle, 'pen-core', ENGINE_VERSION)
  s.round = 2
  s.activePlayer = 'A'
  s.phase = 'shooting'
  s.phaseState = emptyPhaseState()
  return s
}

const relicUnit = (s: GameState): string => {
  const a = Object.values(s.abilities).find((x) => x.code === 'saintlyRelic')
  if (!a?.bearerModelId) throw new Error('no Saintly Relic bearer')
  return s.models[a.bearerModelId].unitId
}
const BEARER_UNITS = (s: GameState) => relicUnit(s)

describe('E-PEN1 Saintly Relic: re-roll a Miracle die on gain', () => {
  it('PEN-008 E-PEN1: gaining a die queues it; keep leaves it, reroll replaces it without a MiracleDieSpent', () => {
    const s = makeState()
    placeUnit(s, BEARER_UNITS(s), { x: -20, z: -11, gap: 0.3 })
    expect(miracleRerollOnGain(s, 'A')).toBe(true)
    expect(miracleRerollOnGain(s, 'B')).toBe(false)
    const { ctx, events } = createContext(s, new ScriptedRng([2, 5, 4]), DEFAULT_MODULES)
    gainMiracleDie(ctx, 'A', 'test')
    expect(s.players.A.miracle.dice).toEqual([2])
    expect(offerMiracleRerolls(ctx, 'command.start', 'k')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.context.data).toMatchObject({ code: 'saintlyRelicReroll', value: 2 })
    s.pending = null
    expect(answerMiracleReroll(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: 'reroll' } as Action, p)).toBeUndefined()
    expect(s.players.A.miracle.dice).toEqual([5])
    expect(events.some((e) => e.type === 'MiracleDieSpent')).toBe(false)
    // the re-rolled die is never offered again
    expect(offerMiracleRerolls(ctx, 'command.start', 'k2')).toBe(false)
    // keep
    gainMiracleDie(ctx, 'A', 'test')
    expect(s.players.A.miracle.dice).toEqual([5, 4])
    expect(offerMiracleRerolls(ctx, 'command.start', 'k3')).toBe(true)
    const p2 = s.pending as unknown as ChooseOptionDecision
    s.pending = null
    answerMiracleReroll(ctx, { type: 'chooseOption', player: 'A', decisionId: p2.id, optionId: 'keep' } as Action, p2)
    expect(s.players.A.miracle.dice).toEqual([5, 4])
    expect(offerMiracleRerolls(ctx, 'command.start', 'k4')).toBe(false)
  })

  it('PEN-008 E-PEN1: a queued value whose die was spent is dropped; a dead bearer clears the queue', () => {
    const s = makeState()
    const { ctx } = createContext(s, new ScriptedRng([3, 6]), DEFAULT_MODULES)
    gainMiracleDie(ctx, 'A', 'test')
    s.players.A.miracle.dice = []
    expect(offerMiracleRerolls(ctx, 'command.start', 'k')).toBe(false)
    gainMiracleDie(ctx, 'A', 'test')
    const bearer = relicUnit(s)
    s.units[bearer].location = 'destroyed'
    expect(miracleRerollOnGain(s, 'A')).toBe(false)
    expect(offerMiracleRerolls(ctx, 'command.start', 'k')).toBe(false)
    expect(s.players.A.secondaryState.miracleRerollPending).toEqual([])
  })
})

describe('E-PEN2 Firing Deck 2 through the Sororitas Rhino', () => {
  function embarkedState(): { s: GameState; rhino: string; sisters: string } {
    const s = makeState()
    const rhino = 'A:rhino'
    const sisters = 'A:sisters'
    expect(s.units[rhino]).toBeTruthy()
    placeUnit(s, rhino, [[-10, 0]])
    placeUnit(s, 'B:arcos', { x: -2, z: 0, gap: 0.3 })
    s.units[sisters].location = 'board'
    transportService.embark(s, sisters, rhino)
    return { s, rhino, sisters }
  }

  it('PEN-025 E-PEN2: embarked models offer ranged weapons; at most 2 fire; their unit is spent afterwards', () => {
    const { s, rhino, sisters } = embarkedState()
    const deck = firingDeckWeapons(s, rhino)
    expect(deck.length).toBeGreaterThan(0)
    // E3: an attached pair embarks as one unit, so the deck lists the models of both halves
    const halves = passengerHalves(s, sisters)
    expect(deck.every((d) => halves.includes(s.models[d.modelId].unitId))).toBe(true)
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    const entries = buildShootingWeaponEntries(ctx, rhino)
    const pass = entries.filter((e) => halves.includes(s.models[e.modelId].unitId))
    expect(pass.length).toBeGreaterThan(0)
    const target = 'B:arcos'
    const models = [...new Set(pass.filter((e) => e.legalTargets.includes(target)).map((e) => e.modelId))]
    expect(models.length).toBeGreaterThanOrEqual(3)
    const pick = (ids: string[]) => ids.map((m) => {
      const e = pass.find((x) => x.modelId === m && x.legalTargets.includes(target))!
      return { modelId: m, weaponId: e.weaponId, targetUnitId: target }
    })
    const decl = (ids: string[]): Action => ({ type: 'declareTargets', player: 'A', decisionId: 'd:x', unitId: rhino, targets: pick(ids) }) as Action
    const pending = { kind: 'declareTargets', id: 'd:x', player: 'A', window: 'shooting.start', canPass: true, context: { unitId: rhino, attackKind: 'ranged', overwatch: false, weapons: entries, engagedWith: [] } } as never
    expect(shootingModule.validate?.(s, decl(models.slice(0, 3)), pending)).toMatchObject({ code: 'E_INVALID_TARGET' })
    expect(shootingModule.validate?.(s, decl(models.slice(0, 2)), pending)).toBeNull()
    s.pending = null
    s.step = 'declareTargets'
    s.phaseState.marks.push(`sh:cur=${rhino}`)
    const rej = shootingModule.handle(ctx, decl(models.slice(0, 2)), pending)
    expect(rej).toBeUndefined()
    expect(s.units[sisters].turn.shotThisPhase).toBe(true)
    expect(firingDeckWeapons(s, rhino)).toEqual([])
  })
})

describe('E-PEN2 Firing Deck leaves passengers untouched', () => {
  it('PEN-025 E-PEN2: building the Rhino\'s weapon entries never changes an embarked model\'s base, position or facing', () => {
    const s = makeState()
    placeUnit(s, 'A:rhino', [[-10, 0]])
    placeUnit(s, 'B:arcos', { x: -2, z: 0, gap: 0.3 })
    s.units['A:sisters'].location = 'board'
    transportService.embark(s, 'A:sisters', 'A:rhino')
    const snap = () => s.units['A:sisters'].models.map((id) => JSON.stringify([s.models[id].base, s.models[id].pos, s.models[id].facing]))
    const before = snap()
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    buildShootingWeaponEntries(ctx, 'A:rhino')
    buildShootingWeaponEntries(ctx, 'A:rhino')
    expect(snap()).toEqual(before)
  })
})
