// Hover help on the move-type prompt (owner playtest: "when the player hovers over the move type, pop
// up a window that talks about what each move means for that unit… 'Move up to the 5"' if the unit's
// move was 5""). The text has to carry the unit's own numbers and its own wargear, not the generic
// rule — so this drives it off a real game state rather than a hand-built stub.
import { describe, expect, it } from 'vitest'
import { useGameStore } from '../../src/client/store/game'
import { moveTypeHelp } from '../../src/client/ui/labels'
import { modelStats, type GameState } from '../../src/engine'

await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponent: 'hotseat', seed: 'move-help' })
const state = useGameStore.getState().state as GameState

/** A unit of the given faction, by datasheet id substring. */
function unitLike(match: string): string {
  const id = Object.keys(state.units).find((u) => state.units[u].datasheetId.includes(match))
  if (!id) throw new Error(`no unit matching ${match} — datasheets: ${Object.values(state.units).map((u) => u.datasheetId).join(', ')}`)
  return id
}

const moveOf = (unitId: string) => modelStats(state, state.models[state.units[unitId].models[0]]).M

describe('move type help', () => {
  it('a normal move quotes the unit\'s own Move characteristic', () => {
    const unitId = Object.keys(state.units)[0]
    const help = moveTypeHelp(state, unitId, 'normal')!
    expect(help.title).toBe('Normal move')
    expect(help.lines[0]).toContain(`up to ${moveOf(unitId)}"`)
    expect(help.lines.join(' ')).toMatch(/shoot and declare a charge/)
  })

  it('an Advance gives the range the D6 can put it in, from that unit\'s Move', () => {
    const unitId = Object.keys(state.units)[0]
    const M = moveOf(unitId)
    const help = moveTypeHelp(state, unitId, 'advance')!
    expect(help.title).toBe('Advance')
    expect(help.lines[0]).toContain(`${M + 1}" to ${M + 6}"`)
    // and it says what the Advance costs
    expect(help.lines.join(' ')).toMatch(/cannot shoot/)
    expect(help.lines.join(' ')).toMatch(/cannot declare a charge/)
  })

  it('mentions Assault weapons only for a unit that actually has one', () => {
    // Infernus Squad carries a pyreblaster (TORRENT, not ASSAULT); nothing in either Combat Patrol
    // roster has ASSAULT, so the line must read as the plain "cannot shoot" for every unit here.
    for (const unitId of Object.keys(state.units)) {
      const line = moveTypeHelp(state, unitId, 'advance')!.lines[1]
      const hasAssault = state.units[unitId].models.some((m) =>
        (state.models[m]?.weapons ?? []).some((w) => state.weapons[w]?.abilities.some((a) => a.ability === 'ASSAULT')),
      )
      expect(line.includes('Assault weapons')).toBe(hasAssault)
    }
  })

  it('Remain Stationary sells the Heavy bonus to units that have a Heavy weapon, and not to others', () => {
    for (const unitId of Object.keys(state.units)) {
      const help = moveTypeHelp(state, unitId, 'stationary')!
      expect(help.title).toBe('Remain Stationary')
      expect(help.lines[0]).toBe('No model moves.')
      const hasHeavy = state.units[unitId].models.some((m) =>
        (state.models[m]?.weapons ?? []).some((w) => state.weapons[w]?.abilities.some((a) => a.ability === 'HEAVY')),
      )
      expect(help.lines[1].includes('Heavy weapons get +1 to hit')).toBe(hasHeavy)
    }
  })

  it('Fall Back warns about Desperate Escape and the loss of shooting', () => {
    const unitId = Object.keys(state.units)[0]
    const help = moveTypeHelp(state, unitId, 'fallBack')!
    expect(help.title).toBe('Fall Back')
    expect(help.lines[0]).toContain(`up to ${moveOf(unitId)}"`)
    expect(help.lines.join(' ')).toMatch(/cannot shoot or declare a charge/)
    expect(help.lines.join(' ')).toMatch(/Desperate Escape/)
  })

  it('a battle-shocked unit is told every model tests, not just the ones that cross an enemy', () => {
    const unitId = Object.keys(state.units)[0]
    const shocked = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId], battleShocked: true } } } as GameState
    expect(moveTypeHelp(shocked, unitId, 'fallBack')!.lines[2]).toMatch(/^Battle-shocked: every model/)
  })

  it('returns null for a unit that is not in the state', () => {
    expect(moveTypeHelp(state, 'no-such-unit', 'normal')).toBeNull()
  })

  it('covers every move type the engine can offer', () => {
    const unitId = Object.keys(state.units)[0]
    for (const t of ['normal', 'advance', 'stationary', 'fallBack'] as const) {
      const help = moveTypeHelp(state, unitId, t)
      expect(help, t).not.toBeNull()
      expect(help!.lines.length, t).toBeGreaterThan(1)
    }
  })

  it('reports the slowest model of a mixed-speed unit, which is what the unit can keep up with', () => {
    const unitId = Object.keys(state.units).find((u) => state.units[u].models.length > 1)!
    const slow = { ...state, units: state.units, models: { ...state.models } } as GameState
    // nothing in the bundle has mixed M, so this builds the case rather than waiting for one
    const [first] = state.units[unitId].models
    const ds = state.datasheets[state.units[unitId].datasheetId]
    const slowProfile = { ...ds.models[0], modelId: 'slowpoke', stats: { ...ds.models[0].stats, M: 1 } }
    slow.datasheets = { ...state.datasheets, [ds.id]: { ...ds, models: [...ds.models, slowProfile] } }
    slow.models[first] = { ...state.models[first], datasheetModelId: 'slowpoke' }
    expect(moveTypeHelp(slow, unitId, 'normal')!.lines[0]).toContain('up to 1"')
  })
})
