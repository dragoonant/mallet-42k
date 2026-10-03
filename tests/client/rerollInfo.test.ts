// The two re-roll prompts must describe the roll being decided — not the one before it.
//
// Hit/wound/save dice are fast-rolled in batches and the re-roll decision is raised before the batch's
// per-die SaveRolled/WoundRolled/HitRolled events exist, so the newest matching event in the log belongs
// to the PREVIOUS roll. The threshold therefore comes from the roll itself (DiceRoll.needed, set by the
// engine) — these fixtures put a stale event in the log and check it is ignored.
import { describe, expect, it } from 'vitest'
import { rerollSummary } from '../../src/client/ui/rerollInfo'
import type { DiceRoll, GameEvent, GameState } from '../../src/engine'

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

describe("re-roll summaries ignore the previous roll's event", () => {
  it('a save reads the target the engine put on the roll', () => {
    const s = rerollSummary(stateWith(), staleSave, roll({ purpose: 'save', dice: [3], final: [3], needed: 4 }))
    expect(s.line).toBe('Rolled 3 — needs 4+ to save.') // not the stale event's 2+
    expect(s.failed).toBe(true)
    expect(s.title).toBe('Re-roll the save?')
  })

  it('a batch of saves counts its failures', () => {
    const s = rerollSummary(stateWith(), staleSave, roll({ purpose: 'save', dice: [5, 3, 4, 1], final: [5, 3, 4, 1], needed: 4 }))
    expect(s.line).toBe('Rolled 4 dice — needs 4+ to save. 2 of 4 failed.')
    expect(s.title).toBe('Re-roll saves?')
    expect(s.failed).toBe(true)
  })

  it('a wound reads the roll, not a stale WoundRolled', () => {
    const stale = [{ ...base, type: 'WoundRolled', attack, die: 6, final: 6, needed: 2, wounded: true, critical: false, auto: false }] as GameEvent[]
    const s = rerollSummary(stateWith(), stale, roll({ purpose: 'wound', dice: [3], final: [3], needed: 5 }))
    expect(s.line).toBe('Rolled 3 — needs 5+ to wound Boyz.')
    expect(s.failed).toBe(true)
  })

  it('a hit falls back to the weapon skill, and judges the die against it', () => {
    expect(rerollSummary(stateWith(), [], roll({ dice: [2], final: [2] })).line).toBe('Rolled 2 — needs 3+ to hit.')
    expect(rerollSummary(stateWith(), [], roll({ dice: [2], final: [2] })).failed).toBe(true)
    expect(rerollSummary(stateWith(), [], roll({ dice: [4], final: [4] })).failed).toBe(false)
  })

  it('an unmodified 6 always hits and an unmodified 1 always fails', () => {
    expect(rerollSummary(stateWith(), [], roll({ dice: [6], final: [6], needed: 7 })).failed).toBe(false)
    expect(rerollSummary(stateWith(), [], roll({ dice: [1], final: [1], needed: 2 })).failed).toBe(true)
  })

  it('falls back to a bare "Rolled n" rather than inventing a target it cannot know', () => {
    const s = rerollSummary(stateWith(), [], roll({ purpose: 'save', dice: [3], final: [3] }))
    expect(s.line).toBe('Rolled 3 to save.')
  })
})
