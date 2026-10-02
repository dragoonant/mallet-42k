// The two re-roll prompts must describe the roll being decided — not the one before it.
//
// ctx.rollOnce (engine/reducer.ts) opens the `any.rollMade` window immediately after rolling and
// BEFORE returning to the caller that emits SaveRolled/WoundRolled/HitRolled, and attack.ts's
// rerollOffer decides inside the roll-resolution helper, before the same emit. So when either
// decision is raised, the newest matching event in the log belongs to the PREVIOUS roll. Reading
// `.needed` off it is silently wrong whenever one exists — these fixtures put exactly such a stale
// event in the log and check it is ignored.
import { describe, expect, it } from 'vitest'
import { rerollSummary } from '../../src/client/ui/rerollInfo'
import { woundRollNeeded, type DiceRoll, type GameEvent, type GameState } from '../../src/engine'

const base = { seq: 1, round: 1, turn: 'A', phase: 'shooting', player: 'A' } as const
const attack = { attackerUnitId: 'u1', attackerModelId: 'am1', weaponId: 'sm.w.storm-bolter', targetUnitId: 'u2' }

function stateWith(over: Record<string, unknown> = {}): GameState {
  return {
    units: {
      u1: { id: 'u1', name: 'Terminator Squad', player: 'A', datasheetId: 'sm_term', models: ['am1'] },
      u2: { id: 'u2', name: 'Boyz', player: 'B', datasheetId: 'ork_boyz', models: ['m1'] },
    },
    models: {
      m1: { id: 'm1', unitId: 'u2', datasheetModelId: 'boy' },
      am1: { id: 'am1', unitId: 'u1', datasheetModelId: 'terminator' },
    },
    players: { A: { name: 'Space Marines' }, B: { name: 'Orks' } },
    weapons: {
      'sm.w.storm-bolter': { id: 'sm.w.storm-bolter', name: 'Storm bolter', skill: 3, S: 4, AP: 0 },
      'ork.w.big-shoota': { id: 'ork.w.big-shoota', name: 'Big shoota', skill: 5, S: 5, AP: 0 },
    },
    datasheets: {
      ork_boyz: { id: 'ork_boyz', invuln: null, models: [{ modelId: 'boy', stats: { Sv: 6, T: 5, W: 1 } }] },
      sm_term: { id: 'sm_term', invuln: 4, models: [{ modelId: 'terminator', stats: { Sv: 2, T: 5, W: 3 } }] },
    },
    phaseState: { attack: null, charge: null, lastRoll: null },
    ...over,
  } as unknown as GameState
}

function roll(over: Partial<DiceRoll>): DiceRoll {
  return {
    id: 'r1', purpose: 'hit', sides: 6, dice: [2], rerolled: null, modifiers: [], final: [2],
    player: 'A', unitId: 'u1', modelId: 'am1', weaponId: 'sm.w.storm-bolter', targetUnitId: 'u2',
    commandRerollable: true, ...over,
  } as DiceRoll
}

/** A log whose newest SaveRolled/WoundRolled is from the PREVIOUS roll, claiming a 2+. */
const staleSave = [
  { ...base, type: 'WoundRolled', attack, die: 5, final: 5, needed: 4, wounded: true, critical: false, auto: false },
  { ...base, type: 'SaveRolled', attack, modelId: 'am1', kind: 'armour', die: 6, final: 6, needed: 2, saved: true },
] as GameEvent[]

describe('re-roll summaries ignore the previous roll\'s event', () => {
  it('a save reads the target the engine published for the save in flight', () => {
    const state = stateWith({
      phaseState: {
        attack: { current: { save: { kind: 'armour' }, saveTargets: { sv: 2, ap: -2, cover: false, armour: 4, invuln: 4 } } },
        charge: null, lastRoll: null,
      },
    })
    const s = rerollSummary(state, staleSave, roll({ purpose: 'save', dice: [3], final: [3] }))
    expect(s.line).toBe('Rolled 3 — needs 4+ to save.') // not the stale event's 2+
    expect(s.failed).toBe(true) // and a 3 against a 4+ is a failure, whatever the stale event said
    expect(s.title).toBe('Re-roll the armour save?')
    expect(s.context).toContain('hit by Terminator Squad') // naming still comes from the wound, which is real
  })

  it('a save in cover says so, because the engine already counted it', () => {
    const state = stateWith({
      phaseState: {
        attack: { current: { save: { kind: 'armour' }, saveTargets: { sv: 2, ap: -2, cover: true, armour: 3, invuln: 4 } } },
        charge: null, lastRoll: null,
      },
    })
    expect(rerollSummary(state, staleSave, roll({ purpose: 'save', dice: [3], final: [3] })).line)
      .toBe('Rolled 3 — needs 3+ to save (cover counted).')
  })

  it('an invulnerable save reads the invulnerable target, not the armour one', () => {
    const state = stateWith({
      phaseState: {
        attack: { current: { save: { kind: 'invuln' }, saveTargets: { sv: 2, ap: -2, cover: false, armour: 8, invuln: 4 } } },
        charge: null, lastRoll: null,
      },
    })
    const s = rerollSummary(state, staleSave, roll({ purpose: 'save', dice: [5], final: [5] }))
    expect(s.title).toBe('Re-roll the invulnerable save?')
    expect(s.line).toBe('Rolled 5 — needs 4+ to save.')
    expect(s.failed).toBe(false)
  })

  it('a wound reads the weapon against the target, not a stale WoundRolled', () => {
    const stale = [{ ...base, type: 'WoundRolled', attack, die: 6, final: 6, needed: 2, wounded: true, critical: false, auto: false }] as GameEvent[]
    const s = rerollSummary(stateWith(), stale, roll({ purpose: 'wound', dice: [3], final: [3] }))
    expect(woundRollNeeded(4, 5)).toBe(5) // S4 into T5
    expect(s.line).toBe('Rolled 3 — needs 5+ to wound Boyz.')
    expect(s.failed).toBe(true)
  })

  it('a hit reads the weapon skill, and judges the die against it', () => {
    expect(rerollSummary(stateWith(), [], roll({ dice: [2], final: [2] })).line).toBe('Rolled 2 — needs 3+ to hit.')
    expect(rerollSummary(stateWith(), [], roll({ dice: [2], final: [2] })).failed).toBe(true)
    expect(rerollSummary(stateWith(), [], roll({ dice: [4], final: [4] })).failed).toBe(false)
  })

  it('an unmodified 6 always passes and an unmodified 1 always fails', () => {
    expect(rerollSummary(stateWith(), [], roll({ dice: [6], final: [1] })).failed).toBe(false)
    expect(rerollSummary(stateWith(), [], roll({ dice: [1], final: [6] })).failed).toBe(true)
  })

  it('falls back to a bare "Rolled n" rather than inventing a target it cannot know', () => {
    const s = rerollSummary(stateWith(), [], roll({ purpose: 'save', dice: [3], final: [3] }))
    expect(s.line).toBe('Rolled 3 on a save.')
  })
})
