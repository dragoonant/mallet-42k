// Cult Ambush markers (GEN-2.3): 32 mm discs on the board, coloured by owner, read from
// state.mission.custom.cultAmbush.markers. Both players see every marker (the opponent may want to remove them, GEN-2.2).
import { create } from 'zustand'
import { useGameStore } from '../store/game'
import { colors } from '../ui/theme'
import { getFormFactor } from '../ui/formFactor'

const MARKER_RADIUS = 0.63
/** Tap-target radius around a candidate spot on touch screens (inches). */
const TOUCH_TARGET_RADIUS = 1.3
/** Pointer type of the latest press on a candidate spot (a click event does not carry it reliably). */
let lastPointerType = 'mouse'

interface MarkerView { id: string; player: 'A' | 'B'; pos: { x: number; z: number } }

export function cultAmbushMarkers(state: { mission?: { custom?: Record<string, unknown> } } | null | undefined): MarkerView[] {
  const ca = state?.mission?.custom?.cultAmbush as { markers?: MarkerView[] } | undefined
  return ca?.markers ?? []
}

/** Option id the player is pointing at in the prompt ('pt:x,z' for a marker spot), so the board can light it. */
export const useAmbushHover = create<{ optionId: string | null; set(id: string | null): void }>((set) => ({
  optionId: null,
  set: (id) => set({ optionId: id }),
}))

interface Candidate { id: string; x: number; z: number; action: never }

/** Candidate marker spots of a pending Cult Ambush marker choice ('pt:x,z' option ids). */
export function markerCandidates(pending: unknown): Candidate[] {
  const p = pending as { kind?: string; context?: { data?: { code?: string; step?: string } }; options?: { id: string; action: never }[] } | null
  if (!p || p.kind !== 'chooseOption' || p.context?.data?.code !== 'cultAmbush' || p.context.data.step !== 'marker') return []
  const out: Candidate[] = []
  for (const o of p.options ?? []) {
    const m = /^pt:(-?[0-9.]+),(-?[0-9.]+)$/.exec(o.id)
    if (m) out.push({ id: o.id, x: Number(m[1]), z: Number(m[2]), action: o.action })
  }
  return out
}

/** The marker being offered in a pending Cult Ambush return choice, if any. */
export function offeredAmbushMarker(pending: unknown, state: Parameters<typeof cultAmbushMarkers>[0]): MarkerView | null {
  const p = pending as { kind?: string; context?: { data?: { code?: string; step?: string; markerId?: string } } } | null
  if (!p || p.kind !== 'chooseOption' || p.context?.data?.code !== 'cultAmbush' || p.context.data.step !== 'return') return null
  return cultAmbushMarkers(state).find((m) => m.id === p.context?.data?.markerId) ?? null
}

export function CultAmbushMarkers() {
  const state = useGameStore((s) => s.state)
  const dispatch = useGameStore((s) => s.dispatch)
  const botSeat = useGameStore((s) => s.botSeat)
  const hovered = useAmbushHover((s) => s.optionId)
  const touch = getFormFactor().touch
  const markers = cultAmbushMarkers(state as never)
  const pending = (state as { pending?: { player?: string } | null } | null)?.pending ?? null
  const mine = !!pending && pending.player !== botSeat
  const candidates = mine ? markerCandidates(pending) : []
  const offered = mine ? offeredAmbushMarker(pending, state as never) : null
  if (markers.length === 0 && candidates.length === 0) return null
  return (
    <group>
      {candidates.map((c) => {
        const on = hovered === c.id
        return (
          <group
            key={c.id}
            position={[c.x, 0.09, c.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerDown={(e) => { lastPointerType = e.pointerType }}
            onPointerOver={(e) => { if (e.pointerType === 'touch') return; e.stopPropagation(); useAmbushHover.getState().set(c.id) }}
            onPointerOut={(e) => { if (e.pointerType !== 'touch') useAmbushHover.getState().set(null) }}
            onClick={(e) => {
              e.stopPropagation()
              const hover = useAmbushHover.getState()
              // Touch has no hover and the discs are tiny: the first tap lights the spot up (same highlight as a
              // mouse hover), a second tap on the lit spot chooses it.
              if (lastPointerType === 'touch' && hover.optionId !== c.id) {
                hover.set(c.id)
                return
              }
              hover.set(null)
              dispatch(c.action)
            }}
          >
            {touch && (
              // a roomier invisible tap target around the 32 mm disc
              <mesh>
                <circleGeometry args={[TOUCH_TARGET_RADIUS, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            <mesh>
              <circleGeometry args={[on ? MARKER_RADIUS * 1.5 : MARKER_RADIUS, 24]} />
              <meshBasicMaterial color={on ? '#ffe066' : '#9ad1ff'} transparent opacity={on ? 0.9 : 0.4} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
      {offered && (
        <mesh position={[offered.pos.x, 0.1, offered.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[MARKER_RADIUS + 0.3, MARKER_RADIUS + 0.7, 32]} />
          <meshBasicMaterial color="#ffe066" depthWrite={false} />
        </mesh>
      )}
      {markers.map((m) => {
        const c = m.player === 'A' ? colors.playerA : colors.playerB
        return (
          <group key={m.id} position={[m.pos.x, 0.07, m.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <circleGeometry args={[MARKER_RADIUS, 24]} />
              <meshBasicMaterial color={c} transparent opacity={0.85} />
            </mesh>
            <mesh position={[0, 0, 0.01]}>
              <ringGeometry args={[MARKER_RADIUS, MARKER_RADIUS + 0.12, 24]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
