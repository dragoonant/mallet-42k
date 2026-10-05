// Spike-only: renders inside the r3f Canvas, samples FPS (rolling 1 s) and renderer.info each frame into window.__spikePerf.
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { useGameStore } from '../client/store/game'

export interface SpikePerf { fps: number; calls: number; triangles: number; geometries: number; textures: number; models: number; frames: number }

export function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const stamps = useRef<number[]>([])
  const frames = useRef(0)
  useFrame(() => {
    const now = performance.now()
    const st = stamps.current
    st.push(now)
    while (st.length && now - st[0] > 1000) st.shift()
    frames.current++
    const info = gl.info
    ;(window as unknown as { __spikePerf?: SpikePerf }).__spikePerf = {
      fps: st.length,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      models: Object.keys(useGameStore.getState().state?.models ?? {}).length,
      frames: frames.current,
    }
  })
  return null
}
