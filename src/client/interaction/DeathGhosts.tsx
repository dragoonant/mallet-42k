// Plays a brief death pose for a model the instant it disappears from state.models, then drops it —
// diffing model ids across renders (rather than the event ring buffer, which truncates) so this never
// misattributes a stale position. Removed models never linger in GameState past this animation window.
import { useEffect, useRef, useState } from 'react'
import { Figure } from '../figures'
import { useGameStore } from '../store/game'

const DEATH_MS = 650

interface Ghost {
  modelId: string
  datasheetId: string
  faction: string
  pos: readonly [number, number, number]
  rotationY: number
  until: number
}

interface LastKnown {
  unitId: string
  pos: readonly [number, number, number]
  rot: number
}

export function DeathGhosts() {
  const state = useGameStore((s) => s.state)
  const prevRef = useRef<Record<string, LastKnown>>({})
  const [ghosts, setGhosts] = useState<Ghost[]>([])

  useEffect(() => {
    if (!state) {
      prevRef.current = {}
      setGhosts([])
      return
    }
    const prev = prevRef.current
    const spawned: Ghost[] = []
    for (const [modelId, last] of Object.entries(prev)) {
      if (state.models[modelId]) continue
      const unit = state.units[last.unitId]
      const faction = unit ? state.players[unit.player]?.faction : undefined
      if (!unit || !faction) continue
      spawned.push({ modelId, datasheetId: unit.datasheetId, faction, pos: last.pos, rotationY: last.rot, until: Date.now() + DEATH_MS })
    }
    const next: Record<string, LastKnown> = {}
    for (const m of Object.values(state.models)) next[m.id] = { unitId: m.unitId, pos: [m.pos.x, m.pos.y, m.pos.z], rot: m.facing }
    prevRef.current = next

    if (spawned.length > 0) {
      setGhosts((g) => [...g, ...spawned])
      const t = setTimeout(() => {
        const now = Date.now()
        setGhosts((g) => g.filter((gh) => gh.until > now))
      }, DEATH_MS + 60)
      return () => clearTimeout(t)
    }
  }, [state])

  return (
    <group>
      {ghosts.map((g) => (
        <Figure key={g.modelId} datasheetId={g.datasheetId} faction={g.faction} pose="death" position={g.pos} rotationY={g.rotationY} />
      ))}
    </group>
  )
}
