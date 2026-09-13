import { describe, expect, it } from 'vitest'

// Trivial placeholder so `npm test` has something to run before the real
// engine test suites land alongside src/engine.
describe('smoke', () => {
  it('test runner is wired up', () => {
    expect(1 + 1).toBe(2)
  })
})
