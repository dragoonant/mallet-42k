// Dark Zealots engine changes beyond code hooks (docs/spec/factions/chaos-space-marines--dark-zealots.md section 7.1).
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, createGameState } from '../../src/engine'
import { bundle, withBundle, makeSetup } from '../fixtures'

describe('C2 patrol-level armyRule override', () => {
  it('DZE-C2 a patrol armyRule replaces the faction army rule for registration', () => {
    const b = withBundle((x) => {
      x.abilities['red.a.rule-alt'] = { id: 'red.a.rule-alt', name: 'Alt Doctrine', text: 'Alternate army rule.', trigger: 'always' }
      x.patrols['red.patrol'].armyRule = 'red.a.rule-alt'
    })
    const s = createGameState(makeSetup(), b, 'fixture', ENGINE_VERSION)
    expect(Object.keys(s.abilities)).toContain('red.a.rule-alt')
  })
  it('DZE-C2 without a patrol armyRule the faction rule is used', () => {
    const s = createGameState(makeSetup(), bundle, 'fixture', ENGINE_VERSION)
    expect(Object.keys(s.abilities)).toContain('red.a.rule')
  })
})

// DZE-C1 (the fight/shooting phases apply Pact mortal wounds queued at attacksResolved) is covered by real activations in chaos-space-marines-dark-zealots.test.ts.
