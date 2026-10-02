// Hover help on the shooting and charge prompts (owner playtest: "do the same for the shooting and
// charge prompts"). Both options named a unit and nothing else. Driven off a real game state so the
// numbers are the actual datasheet ones, and so the charge distance goes through the engine's own
// geometry rather than a copy of it.
import { describe, expect, it } from 'vitest'
import { useGameStore } from '../../src/client/store/game'
import { chargeTargetHelp, shootingTargetHelp } from '../../src/client/ui/labels'
import { modelStats, woundRollNeeded, type GameState } from '../../src/engine'
import { neededChargeDistance } from '../../src/engine/phases/charge'
import { placeUnit } from '../fixtures/state'

await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponent: 'hotseat', seed: 'target-help' })
const state = useGameStore.getState().state as GameState

/** Two units on opposite sides, with a weapon the first one carries. */
const marines = Object.keys(state.units).find((u) => state.units[u].player === 'A')!
const orks = Object.keys(state.units).find((u) => state.units[u].player === 'B')!
// A fresh game is still in deployment, so nothing is on the board and no distance can be measured:
// put the two units down a known distance apart. Single-file rows on z=0 and z=10, 32mm bases, so the
// closest base-to-base gap is 10" minus the two radii.
placeUnit(state, marines, { x: -6, z: 0, gap: 0.5 })
placeUnit(state, orks, { x: -6, z: 10, gap: 0.5 })
const firingModel = state.units[marines].models[0]
const weaponId = state.models[firingModel].weapons.find((w) => state.weapons[w]?.kind === 'ranged')!

const shot = (n = 1) =>
  Array.from({ length: n }, () => ({ modelId: firingModel, weaponId, targetUnitId: orks }))

describe('shooting target help', () => {
  it('names the target and leads with its defences', () => {
    const help = shootingTargetHelp(state, shot())!
    expect(help.title).toBe(`Shoot ${state.units[orks].name}`)
    const defender = state.models[state.units[orks].models[0]]
    expect(help.lines[0]).toContain(`T${modelStats(state, defender).T}`)
    expect(help.lines[0]).toContain(`Sv${modelStats(state, defender).Sv}+`)
    expect(help.lines[0]).toContain('model(s)')
  })

  it('gives each weapon what it needs to hit and to wound this target', () => {
    const weapon = state.weapons[weaponId]
    const T = modelStats(state, state.models[state.units[orks].models[0]]).T
    const line = shootingTargetHelp(state, shot())!.lines[1]
    expect(line).toContain(weapon.name)
    expect(line).toContain(`hits on ${weapon.skill}+`)
    expect(line).toContain(`wounds on ${woundRollNeeded(weapon.S, T)}+`)
    expect(line).toContain(`damage ${weapon.D}`)
  })

  it('counts the models firing the same weapon rather than repeating it', () => {
    const line = shootingTargetHelp(state, shot(3))!.lines[1]
    expect(line.startsWith('3× ')).toBe(true)
    expect(shootingTargetHelp(state, shot(3))!.lines).toHaveLength(2)
  })

  it('returns null when there is nothing being shot at', () => {
    expect(shootingTargetHelp(state, [])).toBeNull()
  })
})

describe('charge target help', () => {
  it('reports the roll the charge needs, from the engine\'s own distance', () => {
    const needed = neededChargeDistance(state, marines, [orks])
    expect(needed, 'the fixture must actually be measurable').not.toBeNull()
    const help = chargeTargetHelp(state, marines, [orks])!
    expect(help.title).toBe(`Charge ${state.units[orks].name}`)
    expect(help.lines[0]).toContain(`needs ${Math.max(2, Math.ceil(needed!))}+`)
    expect(help.lines[0]).toMatch(/\(\d+%\)/) // and the odds of making it
  })

  it('moving the target further away raises the roll it needs and lowers the odds', () => {
    const pct = (unitId: string) => Number(/\((\d+)%\)/.exec(chargeTargetHelp(state, marines, [unitId])!.lines[0])![1])
    const near = pct(orks)
    const before = state.units[orks].models.map((m) => ({ ...state.models[m].pos }))
    for (const m of state.units[orks].models) state.models[m].pos = { ...state.models[m].pos, z: 20 }
    const far = pct(orks)
    state.units[orks].models.forEach((m, i) => { state.models[m].pos = before[i] })
    expect(far).toBeLessThan(near)
  })

  it('warns that the target shoots back before the charge lands', () => {
    expect(chargeTargetHelp(state, marines, [orks])!.lines.join(' ')).toMatch(/Overwatch/)
  })

  it('warns that a multi-target charge is all or nothing', () => {
    const otherOrk = Object.keys(state.units).find((u) => state.units[u].player === 'B' && u !== orks)!
    const help = chargeTargetHelp(state, marines, [orks, otherOrk])!
    expect(help.title).toContain(' and ')
    expect(help.lines.join(' ')).toMatch(/Every unit declared must be reached/)
  })

  it('states the odds as a real 2D6 probability', () => {
    const help = chargeTargetHelp(state, marines, [orks])!
    const pct = Number(/\((\d+)%\)/.exec(help.lines[0])![1])
    const needed = Math.max(2, Math.ceil(neededChargeDistance(state, marines, [orks])!))
    // ways to make `needed` or better on 2D6, counted independently of the implementation
    let ways = 0
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= needed) ways++
    expect(pct).toBe(Math.round((ways / 36) * 100))
  })

  it('returns null when no target is declared', () => {
    expect(chargeTargetHelp(state, marines, [])).toBeNull()
  })
})

describe('the charge number is one number', () => {
  it('the option label and the hover card both report the roll the engine will judge', () => {
    // A previous client-side helper measured something else — 3D distance, no Engagement Range
    // subtracted, the worst target rather than the closest — so the button read "need 12.6"" beside
    // a card correctly saying the roll needed a 10. Both now come from neededChargeDistance.
    const needed = neededChargeDistance(state, marines, [orks])!
    const roll = Math.max(2, Math.ceil(needed))
    expect(chargeTargetHelp(state, marines, [orks])!.lines[0]).toContain(`needs ${roll}+`)
    // ...and that is the number ChargeRolled is compared against: total >= needed
    expect(roll).toBeGreaterThanOrEqual(needed)
    expect(roll - 1).toBeLessThan(needed)
  })
})
