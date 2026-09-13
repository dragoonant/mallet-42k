import type { CSSProperties } from 'react'
import { Scene } from './Scene'

const overlayStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 16,
  color: '#e8e8f2',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 18,
  fontWeight: 600,
  letterSpacing: 0.4,
  pointerEvents: 'none',
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
}

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <Scene />
      <div data-testid="title" style={overlayStyle}>
        Mallet 42k — M0
      </div>
    </div>
  )
}
