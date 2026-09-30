// Decision prompts have to say what they are about (owner playtest: "I'm given a choice of keeping or
// re-rolling a dice, without even knowing what I'm re-rolling for"; "when choosing a save… I have no
// idea what weapon or AP the enemy is using, so I don't know which is better to choose"). Both answers
// are reconstructed from the event log in src/client/ui/labels.ts — this pins them.
import { describe, expect, it } from 'vitest'
import type { DiceRoll, GameEvent, GameState } from '../../src/engine'
import { rerollContext, saveChoiceContext, describeRoll } from '../../src/client/ui/labels'

// A GameState carries far more than these helpers read; this is the slice they actually touch.
const state = {
  units: {
    u1: { id: 'u1', name: 'Terminator Squad', player: 'A', datasheetId: 'sm_term', models: ['am1'] },
    u2: { id: 'u2', name: 'Boyz', player: 'B', datasheetId: 'ork_boyz', models: ['m1'] },
  },
  models: {
    m1: { id: 'm1', unitId: 'u2', datasheetModelId: 'boy', woundsRemaining: 1 },
    am1: { id: 'am1', unitId: 'u1', datasheetModelId: 'terminator', woundsRemaining: 3 },
  },
  players: { A: { name: 'Space Marines' }, B: { name: 'Orks' } },
  weapons: {
    'sm.w.storm-bolter': { id: 'sm.w.storm-bolter', name: 'Storm bolter', skill: 3, S: 4, AP: 0 },
    'sm.w.power-fist': { id: 'sm.w.power-fist', name: 'Power fist', skill: 4, S: 8, AP: -2 },
    'ork.w.big-shoota': { id: 'ork.w.big-shoota', name: 'Big shoota', skill: 5, S: 5, AP: 0 },
  },
  datasheets: {
    ork_boyz: { id: 'ork_boyz', invuln: null, models: [{ modelId: 'boy', stats: { Sv: 6, T: 5, W: 1 } }] },
    sm_term: { id: 'sm_term', invuln: 4, models: [{ modelId: 'terminator', stats: { Sv: 2, T: 5, W: 3 } }] },
  },
} as unknown as GameState

const base = { seq: 1, round: 1, turn: 'A', phase: 'shooting', player: 'A' } as const
const attack = { attackerUnitId: 'u1', attackerModelId: 'am1', weaponId: 'sm.w.storm-bolter', targetUnitId: 'u2' }

function roll(over: Partial<DiceRoll>): DiceRoll {
  return {
    id: 'r1', purpose: 'hit', sides: 6, dice: [2], rerolled: null, modifiers: [], final: [2],
    player: 'A', unitId: 'u1', modelId: null, weaponId: 'sm.w.storm-bolter', targetUnitId: 'u2',
    commandRerollable: true, ...over,
  } as DiceRoll
}

describe('command re-roll context', () => {
  it('names the roll, the weapon, the target and the number to beat', () => {
    const ctx = rerollContext(state, [], roll({}))
    expect(ctx.headline).toBe("To hit — Terminator Squad's Storm bolter vs Boyz")
    expect(ctx.detail).toBe('Rolled 2 — needs 3+.')
  })

  it('works the wound roll out of the weapon and the target, not out of a stale event', () => {
    // rollOnce opens the re-roll window BEFORE the caller emits WoundRolled, so the newest matching
    // event in the log is the PREVIOUS roll's — this one claims 2+, and must be ignored.
    const stale = [{ ...base, type: 'WoundRolled', attack, die: 6, final: 6, needed: 2, wounded: true, critical: false, auto: false }] as GameEvent[]
    const ctx = rerollContext(state, stale, roll({ purpose: 'wound', dice: [3], final: [3] }))
    expect(ctx.headline).toContain('To wound')
    expect(ctx.detail).toBe('Rolled 3 — S4 vs T5, needs 5+.') // S4 into T5 is a 5+, per the engine's own table
  })

  it('phrases a save from the defender\'s side, with the attacker\'s weapon', () => {
    // The roll is made by the model being hit, so "Boyz's Big shoota vs Boyz" would be nonsense.
    const events = [{ ...base, type: 'WoundRolled', attack: { ...attack, attackerUnitId: 'u2', weaponId: 'ork.w.big-shoota', targetUnitId: 'u1' }, die: 5, final: 5, needed: 4, wounded: true, critical: false, auto: false }] as GameEvent[]
    const ctx = rerollContext(state, events, roll({ purpose: 'save', unitId: 'u1', modelId: 'am1', weaponId: 'ork.w.big-shoota', targetUnitId: 'u1', dice: [2], final: [2] }))
    expect(ctx.headline).toBe("Save — Terminator Squad against Boyz's Big shoota")
    expect(ctx.detail).toBe('Rolled 2 — armour 2+ against AP 0 needs 2+.')
  })

  it('shows AP eating into the armour save on a save re-roll', () => {
    const events = [{ ...base, type: 'WoundRolled', attack: { ...attack, attackerUnitId: 'u2', weaponId: 'sm.w.power-fist', targetUnitId: 'u1' }, die: 5, final: 5, needed: 4, wounded: true, critical: false, auto: false }] as GameEvent[]
    const ctx = rerollContext(state, events, roll({ purpose: 'save', unitId: 'u1', modelId: 'am1', weaponId: 'sm.w.power-fist', targetUnitId: 'u1', dice: [3], final: [3] }))
    expect(ctx.detail).toBe('Rolled 3 — armour 2+ against AP -2 needs 4+.')
  })

  it('offers no target number for a charge, whose distance the client does not measure', () => {
    const ctx = rerollContext(state, [], roll({ purpose: 'charge', dice: [2, 3], final: [2, 3], weaponId: null, targetUnitId: null }))
    expect(ctx.headline).toBe('Charge — Terminator Squad')
    expect(ctx.detail).toBe('Rolled 2, 3.')
  })

  it('calls out a modified die, so a re-roll is judged on the number that counted', () => {
    const ctx = rerollContext(state, [], roll({ purpose: 'wound', dice: [4], final: [3] }))
    expect(ctx.detail).toContain('rolled 4, modified to 3')
  })

  it('describeRoll keeps the Dice Log line it was factored out of', () => {
    expect(describeRoll(roll({}), state)).toBe('Terminator Squad vs Boyz — To hit')
  })
})

describe('save choice context', () => {
  const wound = (weaponId: string) =>
    [{ ...base, type: 'WoundRolled', attack: { ...attack, weaponId }, die: 5, final: 5, needed: 4, wounded: true, critical: false, auto: false }] as GameEvent[]

  it('names the incoming weapon and its AP', () => {
    const ctx = saveChoiceContext(state, wound('sm.w.power-fist'), 'm1', 5)!
    expect(ctx.weaponName).toBe('Power fist')
    expect(ctx.ap).toBe(-2)
    expect(ctx.attackerName).toBe('Terminator Squad')
    expect(ctx.invulnNeeded).toBe(5)
  })

  it('applies AP to the armour save, which is the whole point of the choice', () => {
    // A 6+ Ork save against AP-2 needs an 8+ — impossible — so the 5+ invuln is the only real option.
    const ctx = saveChoiceContext(state, wound('sm.w.power-fist'), 'm1', 5)!
    expect(ctx.sv).toBe(6)
    expect(ctx.armourNeeded).toBe(8)
    expect(ctx.armourNeeded! > ctx.invulnNeeded).toBe(true)
  })

  it('leaves the armour save alone when the weapon has no AP', () => {
    const ctx = saveChoiceContext(state, wound('sm.w.storm-bolter'), 'm1', 5)!
    expect(ctx.ap).toBe(0)
    expect(ctx.armourNeeded).toBe(6)
    expect(ctx.armourNeeded! > ctx.invulnNeeded).toBe(true)
  })

  it('a 2+ terminator save is still the better roll against AP 0 than its own 4+ invuln', () => {
    const ctx = saveChoiceContext(state, wound('ork.w.big-shoota'), 'am1', 4)!
    expect(ctx.sv).toBe(2)
    expect(ctx.armourNeeded).toBe(2)
    expect(ctx.armourNeeded! < ctx.invulnNeeded).toBe(true)
  })

  it('returns null when no attack is in the log to describe', () => {
    expect(saveChoiceContext(state, [], 'm1', 4)).toBeNull()
  })

  it('reports an unknown save rather than throwing when the model can\'t be resolved', () => {
    const ctx = saveChoiceContext(state, wound('sm.w.power-fist'), 'no-such-model', 4)!
    expect(ctx.sv).toBeNull()
    expect(ctx.armourNeeded).toBeNull()
    expect(ctx.weaponName).toBe('Power fist')
  })
})
