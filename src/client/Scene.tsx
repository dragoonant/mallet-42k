// 3D scene (docs/spec/50-client.md §2). Pure readout of useGameStore + useUiStore — board clicks are
// translated into a placement draft (src/client/interaction/boardClick.ts) that the DOM decision
// prompt confirms; unit clicks are handled inside <UnitsLayer/>.
import { Canvas } from '@react-three/fiber'
import type { TerrainPieceData } from '@/data/types'
import { Board, CameraRig, Lighting, Objectives, Ruler, Terrain } from './board'
import { ShadowSync } from './board/Lighting'
import { BattlefieldAmbience } from './board/BattlefieldAmbience'
import { usePresentationSettings } from './presentation/settings'
import { useDisplayState } from './presentation/presentedStore'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { computeBoardClickDraft, CultAmbushMarkers, DeathGhosts, PlacementOverlay, resolveMeasureLine, UnitLabels, UnitsLayer, useBoardClick } from './interaction'
import { VfxLayer } from './vfx'
import { spikeMode } from '../spike/flag'
import { PerfProbe } from '../spike/PerfProbe'

/** Area centroid of a simple polygon (shoelace). */
function zoneCentroid(poly: { x: number; z: number }[]): { x: number; z: number } {
  let a = 0, x = 0, z = 0
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]
    const cross = p.x * q.z - q.x * p.z
    a += cross
    x += (p.x + q.x) * cross
    z += (p.z + q.z) * cross
  })
  return a === 0 ? { x: 0, z: 0 } : { x: x / (3 * a), z: z / (3 * a) }
}

export function Scene() {
  const spike = spikeMode()
  const state = useGameStore((s) => s.state)
  const displayState = useDisplayState()
  const lowGraphics = usePresentationSettings((s) => s.lowGraphics)
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const topDown = useUiStore((s) => s.topDown)
  const focusTarget = useUiStore((s) => s.focusTarget)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDraft = useUiStore((s) => s.setDraft)
  const selectUnit = useUiStore((s) => s.selectUnit)
  const measureOn = useUiStore((s) => s.measureOn)
  const measureLine = useUiStore((s) => s.measureLine)

  const onBoardClick = useBoardClick((point) => {
    // A click on a Figure also resolves here (the board plane sits behind every figure) — the unit
    // card is only left open by this when UnitsLayer's own handler re-selects it right after, so an
    // actual empty-board click is what ends up clearing the card.
    selectUnit(null)
    if (!state || !pending || pending.player === botSeat) return
    const draft = computeBoardClickDraft(state, pending, deployTargetUnitId, point)
    if (draft) setDraft(draft)
  })

  // Measure tool (M2, key M): while active, board pointer events drive a live ruler instead of the
  // normal click-to-place/select flow — down starts (or restarts) a drag, move updates the resolved
  // line (base-edge-to-base-edge when it started on a model and lands on an enemy one), up just ends
  // the drag and leaves the last measurement on screen until Esc or the next drag.
  //
  // Reads uiStore/gameStore via `.getState()` rather than the reactive values above: once a pointer
  // "down" lands on a mesh, react-three-fiber captures that pointer and keeps invoking the exact
  // handler closure attached at capture time for every following move/up — it does NOT swap in the
  // fresher closure a later Scene re-render would otherwise pass down — so anything this handler
  // reads has to be fetched live on each call instead of trusted from the render it was created in.
  const onBoardPointer = (point: { x: number; z: number }, kind: 'move' | 'down' | 'up') => {
    const ui = useUiStore.getState()
    if (ui.measureOn) {
      const liveState = useGameStore.getState().state
      if (!liveState) return
      if (kind === 'down') {
        ui.setMeasureAnchor(point)
        ui.setMeasureLine(resolveMeasureLine(liveState, point, point))
      } else if (kind === 'move' && ui.measureAnchor) {
        ui.setMeasureLine(resolveMeasureLine(liveState, ui.measureAnchor, point))
      } else if (kind === 'up') {
        ui.setMeasureAnchor(null)
      }
      return
    }
    onBoardClick(point, kind)
  }

  if (!state) return null

  const terrainPieces = Object.values(state.board.pieces) as TerrainPieceData[]
  const zones = state.mission.data.deploymentZones
  const attacker = state.players.B.side === 'attacker' ? 'B' : 'A'
  // Seat the camera on the local player's side (the human vs the bot; seat A in hot-seat): behind their
  // zone when zones face each other across the long edges, otherwise with their zone on the left.
  const viewer = botSeat === 'A' ? 'B' : 'A'
  const viewerSide = state.players[viewer].side
  const c = viewerSide ? zoneCentroid(zones[viewerSide === 'attacker' ? 'A' : 'B']) : null
  const viewFromFar = !!c && (Math.abs(c.z) > Math.abs(c.x) ? c.z < 0 : c.x > 0)

  return (
    // ~30% closer than the previous [0, 40, 34] start (figures were only ~15px tall at default zoom).
    // frameloop="demand": nothing renders unless something asks: React prop/state commits, camera controls
    // (OrbitControls change events), and every per-frame animator (figures/anim.ts requestFrame, ModelFigure,
    // CameraRig, VfxLayer) calls invalidate() while it is still moving. Keyed on lowGraphics so the renderer's
    // shadow setting and dpr rebuild cleanly when the setting flips.
    <Canvas
      key={lowGraphics ? 'low' : 'hi'}
      frameloop={spike ? 'always' : 'demand'}
      dpr={lowGraphics ? 1 : [1, 1.5]}
      shadows={!lowGraphics}
      camera={{ position: [0, 28, 23.8], fov: 45, near: 0.1, far: 500 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0a0a10']} />
      <Lighting />
      {spike && <PerfProbe />}
      <BattlefieldAmbience />
      {!lowGraphics && <ShadowSync deps={[displayState?.models, terrainPieces]} />}
      <CameraRig topDown={topDown} focusTarget={focusTarget} viewFromFar={viewFromFar} />

      <Board deploymentZones={zones} attacker={attacker} onBoardPointer={onBoardPointer} />
      <Terrain pieces={terrainPieces} />
      <Objectives />

      <CultAmbushMarkers />
      <UnitsLayer />
      <UnitLabels />
      <PlacementOverlay />
      <DeathGhosts />
      <VfxLayer />
      {measureOn && measureLine && <Ruler a={measureLine.a} b={measureLine.b} />}
    </Canvas>
  )
}
