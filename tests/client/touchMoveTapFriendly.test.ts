import { describe, expect, it } from 'vitest'
import { friendly } from '../../src/client/interaction/touchMoveTap'

describe('touch move refusal wording', () => {
  it('replaces model ids and rounds distances', () => {
    expect(friendly(`Can't move there: A:terminator-squad#0 would move 6.549" > 5".`)).toBe(`Can't move there: A model would need 6.5" (max 5").`)
  })
  it('leaves plain reasons alone', () => {
    expect(friendly('Out of range: staged at the 6" limit.')).toBe('Out of range: staged at the 6" limit.')
  })
})
