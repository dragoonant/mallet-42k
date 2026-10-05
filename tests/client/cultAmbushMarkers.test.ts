import { describe, expect, it } from 'vitest'
import { markerCandidates } from '../../src/client/interaction/CultAmbushMarkers'

describe('Cult Ambush marker candidates', () => {
  it('parses pt:x,z option ids (negative and decimal) of a marker-step decision into board points', () => {
    const opt = (id: string) => ({ id, label: id, action: {} })
    const pending = { kind: 'chooseOption', context: { data: { code: 'cultAmbush', step: 'marker' } }, options: [opt('pt:-18,-10'), opt('pt:3.5,12'), opt('decline')] }
    expect(markerCandidates(pending).map((c) => [c.x, c.z])).toEqual([[-18, -10], [3.5, 12]])
    expect(markerCandidates({ ...pending, context: { data: { code: 'cultAmbush', step: 'return' } } })).toEqual([])
  })
})
