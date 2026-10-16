// A faction may field more than one Combat Patrol: lookups default to the first by id and honour a chosen patrolId.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { buildPlayerSetup, patrolsForFaction, resolvePatrol } from '../../src/client/store/game'

const real = await loadBundle()
const orkPatrols = patrolsForFaction(real, 'ork')
const first = orkPatrols[0]
// Fake second patrol: a clone of the first with a different id/name (sorts after it).
const fake = { ...first, id: `${first.id}-zz-second`, name: 'Second Test Patrol' }
const bundle = { ...real, patrols: { ...real.patrols, [fake.id]: fake } }

describe('multi-patrol factions', () => {
  it('default patrol is unchanged when none is chosen', () => {
    expect(orkPatrols.length).toBeGreaterThan(0)
    expect(resolvePatrol(bundle, 'ork')?.id).toBe(first.id)
    expect(buildPlayerSetup(bundle, 'orks').patrolId).toBe(first.id)
  })

  it('patrolsForFaction returns both, sorted by id', () => {
    const ids = patrolsForFaction(bundle, 'ork').map((p) => p.id)
    expect(ids).toEqual([...orkPatrols.map((p) => p.id), fake.id].sort())
    expect(patrolsForFaction(bundle, 'orks')).toHaveLength(orkPatrols.length + 1)
  })

  it('buildPlayerSetup uses the chosen patrolId, ignoring one from another faction', () => {
    expect(buildPlayerSetup(bundle, 'orks', undefined, false, undefined, fake.id).patrolId).toBe(fake.id)
    const otherId = patrolsForFaction(real, 'sm')[0].id
    expect(buildPlayerSetup(bundle, 'orks', undefined, false, undefined, otherId).patrolId).toBe(first.id)
  })
})
