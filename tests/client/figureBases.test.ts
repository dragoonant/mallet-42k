import { describe, expect, it } from 'vitest'
import { resolveBase } from '@/client/figures/data'
import squighog from '@/data/factions/orks/datasheets/squighog-boyz.json'

const ds = (squighog as unknown as unknown[])[0] as never

describe('per-model figure bases', () => {
  it('uses the matching composition entry base and per-model height', () => {
    const nob = resolveBase(ds, 'vehicle' as never, 'nob-smasha-squig')
    const boy = resolveBase(ds, 'vehicle' as never, 'squighog-boy')
    expect(nob.height).toBe(1.9)
    expect(boy.height).toBe(1.7)
    expect(nob.radiusZ).toBeGreaterThan(boy.radiusZ)
    expect(nob.radiusX).toBeLessThan(nob.radiusZ)
  })
  it('falls back to the first composition entry for unknown or missing model ids', () => {
    expect(resolveBase(ds, 'vehicle' as never, 'nope')).toEqual(resolveBase(ds, 'vehicle' as never))
  })
})
