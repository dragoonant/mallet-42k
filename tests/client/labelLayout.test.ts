import { describe, expect, it } from 'vitest'
import { easeOffset, resolveStagger } from '../../src/client/interaction/labelLayout'

describe('resolveStagger', () => {
  it('leaves separated blocks alone', () => {
    const r = resolveStagger([{ id: 'a', x: 0, y: 100, w: 50, h: 20 }, { id: 'b', x: 0, y: 40, w: 50, h: 20 }])
    expect(r.get('a')).toBe(0)
    expect(r.get('b')).toBe(0)
  })
  it('lifts the higher block above the lower one with a gap', () => {
    const r = resolveStagger([{ id: 'a', x: 0, y: 100, w: 50, h: 40 }, { id: 'b', x: 10, y: 90, w: 50, h: 40 }])
    expect(r.get('a')).toBe(0) // a's bottom (140) is lower, so it keeps its spot
    expect(r.get('b')).toBe(90 + 40 + 4 - 100) // b bottom lands 4px above a's top
  })
  it('ignores blocks that do not overlap horizontally', () => {
    const r = resolveStagger([{ id: 'a', x: 0, y: 100, w: 50, h: 40 }, { id: 'b', x: 200, y: 100, w: 50, h: 40 }])
    expect([...r.values()]).toEqual([0, 0])
  })
  it('stacks three mutually overlapping blocks', () => {
    const r = resolveStagger([0, 1, 2].map((i) => ({ id: `u${i}`, x: 0, y: 100 - i * 5, w: 50, h: 30 })))
    const rects = [0, 1, 2].map((i) => ({ y: 100 - i * 5 - r.get(`u${i}`)!, h: 30 }))
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = rects[i]!, b = rects[j]!
      expect(a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
    }
  })
})

describe('easeOffset', () => {
  it('converges to the target', () => {
    let v = 0
    for (let i = 0; i < 20; i++) v = easeOffset(v, 50, 1 / 60)
    expect(v).toBe(50)
  })
})
