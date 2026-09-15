// A single chunky d6: two stacked pip faces (original/front, final/back) inside a 3D card that
// tumbles then either stays put (no re-roll) or flips to reveal the back face (re-rolled). Pure
// CSS transforms/transitions — no animation library, keeps the bundle light.
import { useEffect, useState, type CSSProperties } from 'react'
import type { DieResult } from './types'

// Standard pip layout on a 3x3 grid, cell indices 0-8 (row-major).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function seededSpin(seed: number): { x: number; y: number } {
  // Cheap deterministic pseudo-random spin per die so re-renders don't jitter the animation.
  const a = Math.sin(seed * 12.9898) * 43758.5453
  const b = Math.sin(seed * 78.233) * 12345.678
  const frac = (n: number) => n - Math.floor(n)
  return {
    x: 720 + Math.round(frac(a) * 360),
    y: 540 + Math.round(frac(b) * 360),
  }
}

function Face({ value, style }: { value: number; style: CSSProperties }) {
  return (
    <div style={style}>
      <div
        style={{
          position: 'absolute',
          inset: '12%',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {PIPS[value]?.includes(i) && (
              <div
                style={{
                  width: '68%',
                  height: '68%',
                  borderRadius: '50%',
                  background: 'currentColor',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface DieProps {
  result: DieResult
  phase: 'tumbling' | 'settled'
  size: number
  index: number
  rollId: string
  tumbleMs: number
  flipMs: number
}

export function Die({ result, phase, size, index, rollId, tumbleMs, flipMs }: DieProps) {
  const [spinDone, setSpinDone] = useState(tumbleMs === 0)
  useEffect(() => {
    setSpinDone(tumbleMs === 0)
    if (tumbleMs === 0) return
    const t = setTimeout(() => setSpinDone(true), tumbleMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId, index, tumbleMs])

  const spin = seededSpin(index + 1 + (rollId.length % 7))
  const settled = phase === 'settled' && spinDone
  const showBack = settled && result.wasRerolled

  const outlineColor =
    result.outcome === 'success'
      ? '#5be27a'
      : result.outcome === 'fail'
        ? '#6b6f82'
        : 'rgba(255,255,255,0.35)'
  const glow =
    settled && result.outcome === 'success'
      ? `0 0 ${Math.round(size * 0.35)}px rgba(91,226,122,0.75), 0 2px 6px rgba(0,0,0,0.5)`
      : '0 2px 6px rgba(0,0,0,0.5)'
  const opacity = settled && result.outcome === 'fail' ? 0.55 : 1
  const critPop = settled && result.isCritical

  const outerCube: CSSProperties = {
    width: size,
    height: size,
    perspective: size * 6,
  }

  const spinnerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    transformStyle: 'preserve-3d',
    transform: settled
      ? 'rotateX(0deg) rotateY(0deg)'
      : `rotateX(${spin.x}deg) rotateY(${spin.y}deg)`,
    transition: settled
      ? `transform ${Math.max(tumbleMs, 1)}ms cubic-bezier(.22,.85,.4,1.15)`
      : `transform ${Math.max(tumbleMs, 1)}ms cubic-bezier(.5,-0.2,.5,1)`,
  }

  const scale = critPop ? 1.14 : settled ? 1 : 0.94
  const flipStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    transformStyle: 'preserve-3d',
    transform: `${showBack ? 'rotateY(180deg)' : 'rotateY(0deg)'} scale(${scale})`,
    transition: `transform ${Math.max(flipMs, 1)}ms ease-in-out, opacity 150ms linear`,
    transformOrigin: '50% 50%',
    opacity,
  }

  const faceBase: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: Math.max(4, size * 0.16),
    background: 'linear-gradient(145deg, #34384a, #1c1e28)',
    border: `2px solid ${outlineColor}`,
    boxShadow: glow,
    color: result.outcome === 'fail' ? '#8a8fa3' : '#f2f3fb',
    backfaceVisibility: 'hidden',
    transition: 'box-shadow 180ms ease-out, border-color 180ms ease-out, color 180ms ease-out',
  }

  return (
    <div style={outerCube} data-testid="dice-die" data-value={result.value} data-outcome={result.outcome}>
      <div style={spinnerStyle}>
        <div style={flipStyle}>
          <Face value={result.original} style={{ ...faceBase, transform: 'rotateY(0deg)' }} />
          <Face
            value={result.value}
            style={{ ...faceBase, transform: 'rotateY(180deg)', position: 'absolute', inset: 0 }}
          />
        </div>
      </div>
    </div>
  )
}
