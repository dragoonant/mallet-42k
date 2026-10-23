// Plays a brief death pose for a model the instant it disappears from state.models (or is marked fallen
// by the director as the shot that killed it lands — cueStore.ts), then drops it — diffing model ids
// across renders (rather than the event ring buffer, which truncates) so this never misattributes a stale
// position. Removed models never linger in GameState past this animation window.
import { useEffect, useRef, useState } from 'react'
import { Figure } from '../figures'
import { useDisplayState } from '../presentation/presentedStore'
import { useCueStore } from '../presentation/cueStore'

const DEATH_MS = 650

interface Ghost {
  modelId: string
  datasheetId: string
  modelType: string
  faction: string
  seat: 'A' | 'B'
  pos: readonly [number, number, number]
  rotationY: number
  until: number
}

interface LastKnown {
  unitId: string
  modelType: string
  pos: readonly [number, number, number]
  rot: number
}

export function DeathGhosts() {
  const state = useDisplayState()
  const fallen = useCueStore((s) => s.fallen)
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
      if (state.models[modelId] && !fallen[modelId]) continue
      const unit = state.units[last.unitId]
      const faction = unit ? state.players[unit.player]?.faction : undefined
      if (!unit || !faction) continue
      spawned.push({ modelId, datasheetId: unit.datasheetId, modelType: last.modelType, faction, seat: unit.player, pos: last.pos, rotationY: last.rot, until: Date.now() + DEATH_MS })
    }
    // A fallen model counts as gone already, so it doesn't fall a second time when the state drops it.
    const next: Record<string, LastKnown> = {}
    for (const m of Object.values(state.models)) {
      if (!fallen[m.id]) next[m.id] = { unitId: m.unitId, modelType: m.datasheetModelId, pos: [m.pos.x, m.pos.y, m.pos.z], rot: m.facing }
    }
    prevRef.current = next

    if (spawned.length > 0) {
      setGhosts((g) => [...g.filter((gh) => !spawned.some((s) => s.modelId === gh.modelId)), ...spawned])
      // Not cleared on re-run: deaths can land a few frames apart, and each batch must still be dropped.
      setTimeout(() => {
        const now = Date.now()
        setGhosts((g) => g.filter((gh) => gh.until > now))
      }, DEATH_MS + 60)
    }
  }, [state, fallen])

  return (
    <group>
      {ghosts.map((g) => (
        <Figure key={g.modelId} datasheetId={g.datasheetId} modelId={g.modelType} faction={g.faction} seat={g.seat} pose="death" position={g.pos} rotationY={g.rotationY} />
      ))}
    </group>
  )
}
