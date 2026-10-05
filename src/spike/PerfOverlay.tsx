import { useEffect, useState, type CSSProperties } from 'react'
import type { SpikePerf } from './PerfProbe'

const box: CSSProperties = {
  position: 'absolute', top: 8, right: 8, zIndex: 1000, padding: '6px 8px', font: '12px/1.35 monospace', color: '#cfe',
  background: 'rgba(0,0,0,0.65)', borderRadius: 4, pointerEvents: 'none', whiteSpace: 'pre',
}

export function PerfOverlay() {
  const [p, setP] = useState<SpikePerf | null>(null)
  useEffect(() => {
    const t = setInterval(() => setP((window as unknown as { __spikePerf?: SpikePerf }).__spikePerf ?? null), 500)
    return () => clearInterval(t)
  }, [])
  return (
    <div data-testid="perf" style={box}>
      {p ? `FPS ${p.fps}\ncalls ${p.calls}\ntris ${p.triangles}\ngeoms ${p.geometries}\ntex ${p.textures}\nmodels ${p.models}` : 'perf: waiting'}
    </div>
  )
}
