// Placement markers draw at the model's true base size and shape, and a pointer drag previews the whole formation
// (deployUnit: setup and reserves arrival) without ever dispatching: lifting stages a draft, Confirm commits.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Object3D } from 'three'
import { baseEdgePoints, whollyOnBoard, whollyWithinPolygon, type ModelBase } from '../../src/engine'
import { useGameStore } from '../../src/client/store/game'
import { useUiStore } from '../../src/client/ui/uiStore'
import { baseSemiAxes, boundRadius, ellipseGeometry, grabRadius, markerYaw, ringOuter } from '../../src/client/interaction/baseMarker'
import { computeBoardClickDraft } from '../../src/client/interaction/boardClick'
import { combinedUnitModels } from '../../src/client/interaction/geometry'
import { cancelDeployPreview, canPreviewDeploy, isDeployDragging, beginDeployDrag, liftDeployDrag, updateDeployPreview } from '../../src/client/interaction/deployDrag'

const ROUND_25: ModelBase = { shape: 'round', radius: 25 / 25.4 / 2 }
const ROUND_90: ModelBase = { shape: 'round', radius: 90 / 25.4 / 2 }
const OVAL_170: ModelBase = { shape: 'oval', radius: 170 / 25.4 / 2, radius2: 109 / 25.4 / 2 }

describe('placement marker geometry', () => {
  it('PLACEBASE-001 a round base is a circle of its own radius, big bases are not drawn at the small fixed ring', () => {
    expect(baseSemiAxes(ROUND_25)).toEqual({ rx: ROUND_25.radius, rz: ROUND_25.radius })
    expect(boundRadius(ROUND_90)).toBeCloseTo(1.772, 2)
    expect(boundRadius(ROUND_90)).toBeGreaterThan(2 * boundRadius(ROUND_25) * 1.4)
    // an 'oval' with no second radius is the round base the engine treats it as
    expect(baseSemiAxes({ shape: 'oval', radius: 1 })).toEqual({ rx: 1, rz: 1 })
    expect(ringOuter(ROUND_90, 0.2).rx).toBeCloseTo(ROUND_90.radius + 0.2, 6)
  })

  it('PLACEBASE-002 an oval base keeps its long axis along the facing and its short axis across it', () => {
    const { rx, rz } = baseSemiAxes(OVAL_170)
    expect(rx).toBeCloseTo(OVAL_170.radius, 6)
    expect(rz).toBeCloseTo(OVAL_170.radius2!, 6)
    expect(rx).toBeGreaterThan(rz)
    expect(boundRadius(OVAL_170)).toBeCloseTo(rx, 6)
    const g = ellipseGeometry(rx, rz, 0)
    g.computeBoundingBox()
    // flat in XZ, extents are exactly the semi-axes (rx along local X = the facing, rz along local Z)
    expect(g.boundingBox!.max.x).toBeCloseTo(rx, 2)
    expect(g.boundingBox!.max.z).toBeCloseTo(rz, 2)
    expect(g.boundingBox!.max.y).toBeCloseTo(0, 6)
  })

  it('PLACEBASE-003 turning a marker with markerYaw(facing) lands its outline on the engine footprint outline', () => {
    for (const facing of [0, 0.7, Math.PI / 2, 2.4, -1.1, Math.PI]) {
      const marker = new Object3D()
      marker.position.set(5, 0, -3)
      marker.rotation.y = markerYaw(facing)
      marker.updateMatrixWorld(true)
      const { rx, rz } = baseSemiAxes(OVAL_170)
      const n = 64
      const engine = baseEdgePoints({ pos: { x: 5, y: 0, z: -3 }, facing, base: OVAL_170 }, n)
      // engine outline point i is the ellipse at parameter t = 2*pi*i/n: rx*cos(t) along the facing, rz*sin(t) across it
      for (const i of [0, n / 8, n / 4, n / 2, (3 * n) / 4]) {
        const t = (2 * Math.PI * i) / n
        const w = marker.localToWorld(new Object3D().position.set(rx * Math.cos(t), 0, rz * Math.sin(t)))
        expect(w.x).toBeCloseTo(engine[i].x, 4)
        expect(w.z).toBeCloseTo(engine[i].z, 4)
      }
    }
  })

  it('PLACEBASE-004 the grab target is never smaller than the base, and keeps the old floor for small ones', () => {
    expect(grabRadius(ROUND_25, false)).toBeCloseTo(0.85, 6)
    expect(grabRadius(ROUND_25, true)).toBeCloseTo(1.25, 6)
    for (const base of [ROUND_90, OVAL_170]) {
      for (const touch of [false, true]) expect(grabRadius(base, touch)).toBeGreaterThanOrEqual(boundRadius(base))
    }
    expect(grabRadius(ROUND_90, true)).toBeGreaterThan(grabRadius(ROUND_25, true))
  })
})

describe('deploy drag preview', () => {
  let unitId: string

  beforeAll(async () => {
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponent: 'hotseat', seed: 'place-bases' })
    // setup roll-offs and the like come first: take the first legal answer until a unit has to be placed
    for (let i = 0; i < 40 && useGameStore.getState().pending?.kind !== 'deployUnit'; i++) {
      const { legal } = useGameStore.getState()
      if (!legal?.length) break
      useGameStore.getState().dispatch(legal[0])
    }
  })

  beforeEach(() => {
    cancelDeployPreview()
    const { state, pending } = useGameStore.getState()
    expect(state).not.toBeNull()
    expect(pending?.kind).toBe('deployUnit')
    if (!state || pending?.kind !== 'deployUnit') return
    // the unit with the biggest base in the squad list: that is where a fixed 1.2" ring lies the most
    unitId = [...pending.context.unitIds].sort((a, b) => boundRadius(combinedUnitModels(state, b)[0].base) - boundRadius(combinedUnitModels(state, a)[0].base))[0]
    useUiStore.setState({ deployTargetUnitId: unitId, draft: null, deployPreview: null, nudge: null, measureOn: false })
  })

  const zoneCentre = () => {
    const p = useGameStore.getState().pending
    if (p?.kind !== 'deployUnit') throw new Error('no deployUnit pending')
    const z = p.context.zone
    return { x: z.reduce((a, v) => a + v.x, 0) / z.length, z: z.reduce((a, v) => a + v.z, 0) / z.length, zone: z }
  }

  it('PLACEBASE-005 dragging across and past the zone keeps every placement wholly inside the zone clamp', () => {
    const { state, pending } = useGameStore.getState()
    const c = zoneCentre()
    const models = combinedUnitModels(state!, unitId)
    const byId = new Map(models.map((m) => [m.id, m]))
    // from deep inside the zone, out over every edge, and well off the board
    const path = [[0, 0], [8, 0], [-8, 0], [0, 6], [0, -6], [30, 30], [-30, 30], [-40, -20], [c.x, c.z]].map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz }))
    for (const pt of path) {
      const draft = computeBoardClickDraft(state!, pending!, unitId, pt, { preview: true })
      expect(draft, `preview at ${pt.x},${pt.z}`).not.toBeNull()
      for (const p of draft!.placements) {
        const m = byId.get(p.modelId)!
        const fp = { pos: p.pos, facing: p.facing ?? 0, base: m.base }
        expect(whollyOnBoard(fp, state!.board)).toBe(true)
        expect(whollyWithinPolygon(fp, c.zone)).toBe(true)
      }
    }
    // the preview is the click: what the drag shows is what the lift stages
    const a = computeBoardClickDraft(state!, pending!, unitId, path[1], { preview: true })!
    const b = computeBoardClickDraft(state!, pending!, unitId, path[1])!
    expect(a.placements.map((p) => [p.modelId, +p.pos.x.toFixed(4), +p.pos.z.toFixed(4)])).toEqual(b.placements.map((p) => [p.modelId, +p.pos.x.toFixed(4), +p.pos.z.toFixed(4)]))
  })

  it('PLACEBASE-006 a drag shows a preview while it moves and lifting stages a draft without dispatching', () => {
    const dispatch = vi.fn()
    const realDispatch = useGameStore.getState().dispatch
    useGameStore.setState({ dispatch })
    try {
      const c = zoneCentre()
      expect(canPreviewDeploy()).toBe(true)
      beginDeployDrag()
      expect(isDeployDragging()).toBe(true)
      updateDeployPreview({ x: c.x, z: c.z })
      const mid = useUiStore.getState().deployPreview
      expect(mid?.unitId).toBe(unitId)
      expect(mid!.placements.length).toBeGreaterThan(0)
      expect(useUiStore.getState().draft).toBeNull()
      updateDeployPreview({ x: c.x + 3, z: c.z })
      expect(useUiStore.getState().deployPreview!.anchor.x).not.toBeCloseTo(mid!.anchor.x, 1)
      const stagedBefore = useGameStore.getState().state
      expect(liftDeployDrag({ x: c.x + 3, z: c.z })).toBe(true)
      const ui = useUiStore.getState()
      expect(ui.draft?.unitId).toBe(unitId)
      expect(ui.deployPreview).toBeNull()
      expect(isDeployDragging()).toBe(false)
      expect(dispatch).not.toHaveBeenCalled()
      expect(useGameStore.getState().state).toBe(stagedBefore) // nothing was deployed
    } finally {
      useGameStore.setState({ dispatch: realDispatch })
    }
  })

  it('PLACEBASE-007 hovering yields to a staged draft, but a drag still replaces it; a cancelled drag leaves the draft alone', () => {
    const c = zoneCentre()
    updateDeployPreview({ x: c.x, z: c.z })
    expect(useUiStore.getState().deployPreview).not.toBeNull() // plain hover shows the formation under the pointer
    liftDeployDrag({ x: c.x, z: c.z })
    const staged = useUiStore.getState().draft!
    updateDeployPreview({ x: c.x + 4, z: c.z })
    expect(useUiStore.getState().deployPreview).toBeNull() // hover steps aside for the staged draft
    beginDeployDrag()
    updateDeployPreview({ x: c.x + 4, z: c.z })
    expect(useUiStore.getState().deployPreview).not.toBeNull() // a drag overrides it
    cancelDeployPreview() // second finger lands
    expect(useUiStore.getState().deployPreview).toBeNull()
    expect(useUiStore.getState().draft).toBe(staged)
  })
})
