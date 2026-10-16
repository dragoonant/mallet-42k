// SDC-1.3 client side: the start screen can seat a unit in a Transport and the choice reaches PlayerSetup.embarked.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { buildPlayerSetup, embarkOptions, patrolsForFaction } from '../../src/client/store/game'

const bundle = await loadBundle()
const sdc = patrolsForFaction(bundle, 'tau-empire').find((p) => p.id.includes('sudden-dawn'))

describe('start-embarked option', () => {
  it('SDC-1.3 offers carriable units for the Devilfish and passes the pick as PlayerSetup.embarked', () => {
    expect(sdc).toBeTruthy()
    const opts = embarkOptions(bundle, 'tau-empire', sdc!.id)
    expect(opts.some((o) => o.unitRef === 'breachers' && o.transportRef === 'devilfish')).toBe(true)
    expect(opts.some((o) => o.unitRef === 'cloudspear')).toBe(false) // battlesuit
    expect(buildPlayerSetup(bundle, 'tau-empire', undefined, false, undefined, sdc!.id).embarked).toBeUndefined()
    const picked = buildPlayerSetup(bundle, 'tau-empire', undefined, false, undefined, sdc!.id, [{ unitRef: 'breachers', transportRef: 'devilfish' }])
    expect(picked.embarked).toEqual([{ unitRef: 'breachers', transportRef: 'devilfish' }])
  })
})
