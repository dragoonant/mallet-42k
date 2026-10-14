// Small floating name + wounds tag over each on-board unit — the board otherwise has no way to tell
// units apart or see how hurt they are at a glance beyond opening the unit card for one at a time.
import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { applyOffset, clearOffset, easeOffset, labelRegistry, registerLabelPart, screenScale, StaggerSolver, type LayoutBlock } from './labelLayout'
import { useDisplayState } from '../presentation/presentedStore'
import { colors, fontStack } from '../ui/theme'

const SHOCK_COLOR = '#ffb84f'

const labelStyle = {
  fontFamily: fontStack,
  fontSize: 12,
  fontWeight: 700 as const,
  textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.9)',
  whiteSpace: 'nowrap' as const,
}

function unionRect(els: (Element | null | undefined)[]): { l: number; t: number; r: number; b: number } | null {
  let u: { l: number; t: number; r: number; b: number } | null = null
  for (const el of els) {
    if (!el) continue
    const q = el.getBoundingClientRect()
    if (q.width === 0 && q.height === 0) continue
    u = u ? { l: Math.min(u.l, q.left), t: Math.min(u.t, q.top), r: Math.max(u.r, q.right), b: Math.max(u.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom }
  }
  return u
}

// Measures every unit's tag + icon-row block on screen, resolves overlaps and eases each block's offset toward its
// target. Runs on the existing demand-frame loop; keeps invalidating while easing.
// Never-bounce rule: measurements must not depend on the offset we applied. Applied shifts are cleared before
// measuring (one forced layout per frame, no paint in between), so the solver's input is the true anchor position and
// the output cannot feed back into the next frame's input. Offsets are in screen px and converted per wrapper,
// because the tag lives in a distance-scaled Html and the icon row does not.
function LabelLayoutDriver() {
  const invalidate = useThree((s) => s.invalidate)
  const solver = useMemo(() => new StaggerSolver(), [])
  useFrame((_, delta) => {
    const entries = [...labelRegistry].filter(([id, e]) => {
      if (e.tagWrap?.isConnected || e.rowWrap?.isConnected) return true
      labelRegistry.delete(id)
      return false
    })
    for (const [, e] of entries) clearOffset(e)
    const blocks: LayoutBlock[] = []
    for (const [id, e] of entries) {
      e.tagScale = screenScale(e.tagWrap)
      e.rowScale = screenScale(e.rowWrap)
      const r = unionRect([e.tagWrap?.querySelector('[data-testid]'), e.rowWrap?.querySelector('[data-testid]')])
      if (!r) { e.offset = 0; continue }
      blocks.push({ id, x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t })
    }
    const targets = solver.update(blocks)
    let moving = false
    for (const [id, target] of targets) {
      const e = labelRegistry.get(id)!
      const next = easeOffset(e.offset, target, delta)
      if (next !== target) moving = true
      e.offset = next
    }
    for (const [, e] of entries) applyOffset(e)
    if (moving) invalidate()
  })
  return null
}

export function UnitLabels() {
  const state = useDisplayState()
  if (!state) return null
  const units = Object.values(state.units).filter((u) => u.location === 'board')

  return (
    <>
      <LabelLayoutDriver />
      {units.map((unit) => {
        const models = unit.models.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
        if (models.length === 0) return null
        const cx = models.reduce((sum, m) => sum + m.pos.x, 0) / models.length
        const cz = models.reduce((sum, m) => sum + m.pos.z, 0) / models.length
        const topY = Math.max(...models.map((m) => m.pos.y + m.height)) + 0.25
        const wounds = models.reduce((sum, m) => sum + m.woundsRemaining, 0)
        const color = unit.battleShocked ? SHOCK_COLOR : unit.player === 'A' ? colors.playerA : colors.playerB
        return (
          <Html key={unit.id} zIndexRange={[5, 0]} position={[cx, topY, cz]} center distanceFactor={18} style={{ pointerEvents: 'none' }} occlude={false}>
            <div style={{ transform: 'translateY(-100%)' }}>
              <div ref={(el) => registerLabelPart(unit.id, 'tagWrap', el)}>
              <div style={{ ...labelStyle, color }} data-testid={`unit-label-${unit.id}`}>
                {unit.name} · {wounds} {wounds === 1 ? 'wound' : 'wounds'}
              </div>
              </div>
            </div>
          </Html>
        )
      })}
    </>
  )
}
