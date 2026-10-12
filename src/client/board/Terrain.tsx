import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { FloorData, TerrainPieceData, WallData } from '@/data/types'
import { extrudedPolygonGeometry, polygonBoundingRadius, polygonCentroid, seededUnit, segmentTransform } from './geometry'
import { fitScaleXZ, idVariant, planRuin, planTurns, polygonBounds, simpleTurns, wallsCoverPerimeter, type Bounds } from './ruinFit'
import { useRuinCatalog, useRuinModel, type RuinModel } from './ruinModels'
import { DECAL_MARGIN, floorSlabGeometry, ruinDecalTexture, rubbleGeometry, rubbleMaterial, scatterRubble, slabConcreteTexture } from './ruinDressing'
import {
  BARRIER_MODEL_URL,
  CONCRETE_URLS,
  ROCK_MODEL_URLS,
  cloneRepeat,
  polygonFootprintSize,
  useTiledPBR,
} from './terrainAssets'

// Chunky stylised-SD palette per terrain kind. Purely presentational — LoS/cover come from the engine.
// Kinds without their own texture (barricade uses a glTF model, crater is built from rock models,
// 'wall'/'forest' are untextured fallbacks) keep a flat tint; textured kinds use a near-white tint
// below (BRICK_TINT etc.) so the PBR map's own color shows through instead of being multiplied dark.
const PALETTE: Record<TerrainPieceData['kind'], { base: string; accent: string }> = {
  ruin: { base: '#8a8a86', accent: '#66665f' },
  crate: { base: '#5f6b4a', accent: '#454f34' },
  barricade: { base: '#7d8087', accent: '#5c5f66' },
  crater: { base: '#6f4f34', accent: '#523a26' },
  wall: { base: '#767a86', accent: '#585b64' },
  forest: { base: '#3f6b45', accent: '#2c4d32' },
}

// Near-white tints for textured materials — a meshStandardMaterial's `color` multiplies its `map`,
// so a dark tint here (the old PALETTE values) crushes the PBR texture toward black regardless of
// the texture's own detail. These let the brick/concrete/metal photos read as intended.
// Weathered grey concrete (procedural ruin walls). Flat grey + the concrete normal/roughness maps: the concrete albedo
// is a dark rust brown that renders near-black on a 6in wall under the scene lighting.
const RUIN_WALL_TINT = '#b4b4ae'
const RUBBLE_TINT = '#8c8c87'
const CONCRETE_TINT = '#ffffff' // upper-floor slabs, matched to the grey ruins
// Pulls the floor slab in from the footprint edge when a ruin GLB is drawn, so its sides never
// z-fight the model's own outer walls.
const GLB_FLOOR_INSET = 0.12

// Walls are drawn at true data height/thickness (no cap) so a figure on an upper floor visibly stands on it;
// see-through enough to read units inside.
const ENGINE_DEFAULT_WALL_THICKNESS = 0.25 // matches engine wallOccupiesPoint default
// Ruins are opaque; a tall one fades to this when it sits between the camera and the board centre.
const RUIN_FADE_OPACITY = 0.35
const RUIN_FADE_MIN_HEIGHT = 3
// Solid terrain is capped and semi-transparent so it never fully hides units or a deployment zone
// behind it at table-top camera angles (LoS/cover still come from the engine's real terrain heights).
const BLOCK_VISUAL_CAP = 6 // crates (3") and barricades (1.5") draw at true height; cap only guards oversize data
const TERRAIN_OPACITY = 0.85

// Texture-repeat scale: one full tile per this many inches of surface (bricks/concrete/metal read
// clearly at tabletop scale without looking either smeared or over-tiled).
const WALL_REPEAT_INCHES = 8
const CONCRETE_REPEAT_INCHES = 8

// A crater is standable ground (the engine lets bases end anywhere inside it), so nothing inside the footprint may
// poke above CRATER_FLOOR_MAX_HEIGHT (the terrain-fit e2e counts mesh above 0.3in as "inside"): the blast-crater
// model is flattened to that height, loose debris stays under it, and the tall rocks sit only on the rim.
const CRATER_SCORCH_HEIGHT = 0.05
const CRATER_FLOOR_MAX_HEIGHT = 0.28
const CRATER_DEBRIS_COUNT = 5
const CRATER_RIM_ROCK_MIN = 8
const CRATER_RIM_ROCK_MAX = 10
const CRATER_RIM_THICKNESS = 0.3 // radial depth of a rim rock
const CRATER_RIM_OFFSET = 0.1 // its centre sits this far outside the footprint edge (so it reaches 0.25in outside, 0.05in inside)
const CRATER_RIM_MIN_HEIGHT = 0.5
const CRATER_RIM_MAX_HEIGHT = 1.3

export interface TerrainProps {
  pieces: TerrainPieceData[]
}

/** Terrain meshes generated from a terrain layout's pieces (src/data/terrain). Wrapped in Suspense
 *  so streaming in textures/models (see terrainAssets.ts) never blanks the rest of the scene. */
export function Terrain({ pieces }: TerrainProps) {
  return (
    <Suspense fallback={null}>
      <group>
        {pieces.map((piece) => (
          <group key={piece.id} userData={{ terrainId: piece.id }}><TerrainPiece piece={piece} /></group>
        ))}
      </group>
    </Suspense>
  )
}

function TerrainPiece({ piece }: { piece: TerrainPieceData }) {
  const colors = PALETTE[piece.kind] ?? PALETTE.wall

  switch (piece.kind) {
    case 'ruin':
      return <RuinPiece piece={piece} />
    case 'barricade':
      return <BarricadePiece piece={piece} colors={colors} />
    case 'crate':
      return <CratePiece piece={piece} />
    case 'crater':
      return <CraterPiece piece={piece} />
    default:
      return <BlockPiece piece={piece} colors={colors} />
  }
}

/** Draws a loaded terrain GLB rotated `turns` quarter-turns about Y and scaled to cover `bounds`. With
 *  `uniform` the X/Z scales follow whirr's rule (if they differ by >15% both use the smaller, centred, so
 *  the model is never stretched); otherwise each axis fits exactly. Height always fits `height`. */
function FittedModel({ model, bounds, height, turns, uniform = false }: { model: RuinModel; bounds: Bounds; height: number; turns: number; uniform?: boolean }) {
  const [sx, sy, sz] = model.size
  const swap = turns % 2 === 1
  const rx = swap ? sz : sx
  const rz = swap ? sx : sz
  const [kx, kz] = uniform ? fitScaleXZ(rx, rz, bounds) : [bounds.w / rx, bounds.d / rz]
  return (
    <group userData={{ fittedModel: true }} position={[bounds.cx, 0, bounds.cz]} scale={[kx, height / sy, kz]}>
      <group rotation={[0, (turns * Math.PI) / 2, 0]}>
        <primitive object={model.object} />
      </group>
    </group>
  )
}

/** Fades the group's materials to RUIN_FADE_OPACITY while a tall piece sits between the camera and the
 *  ground point being looked at, smoothly. Materials are cloned per mesh the first time they fade, so shared GLB
 *  materials are never touched. Cheap: one segment-distance test per frame, work only while easing. */
function useOccluderFade(group: React.RefObject<THREE.Group | null>, centre: { x: number; z: number }, radius: number, height: number) {
  const invalidate = useThree((s) => s.invalidate)
  const cur = useRef(1)
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }, dt) => {
    const g = group.current
    if (!g) return
    let target = 1
    if (height >= RUIN_FADE_MIN_HEIGHT) {
      // Where the camera is looking: its view ray meets the ground plane (y = 0).
      camera.getWorldDirection(dir)
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z
      if (dir.y < -0.02) {
        const k = cy / -dir.y
        const tx = cx + dir.x * k, tz = cz + dir.z * k
        const sx = tx - cx, sz = tz - cz
        const l2 = sx * sx + sz * sz
        // Only a piece the looked-at ground point is NOT inside can occlude it.
        if (l2 > 1e-6 && Math.hypot(tx - centre.x, tz - centre.z) > radius * 0.9) {
          const t = ((centre.x - cx) * sx + (centre.z - cz) * sz) / l2 // closest approach along camera -> target
          if (t > 0 && t < 1) {
            const dist = Math.hypot(centre.x - (cx + sx * t), centre.z - (cz + sz * t))
            const rayY = cy * (1 - t) // sight line height above the piece centre
            // faded only when the sight line really passes through the piece's volume (never from above)
            if (dist < Math.max(radius * 0.8, 2.5) && rayY < height) target = RUIN_FADE_OPACITY
          }
        }
      }
    }
    if (Math.abs(cur.current - target) < 0.004) {
      if (cur.current === target) return
      cur.current = target
    } else {
      cur.current += (target - cur.current) * Math.min(1, dt * 9)
      invalidate()
    }
    const op = cur.current
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || mesh.userData.noFade) return
      if (!mesh.userData.fadeOwned) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone()
        mesh.userData.fadeOwned = true
      }
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const want = op < 0.999
        if (m.transparent !== want) {
          m.transparent = want
          m.depthWrite = !want
          m.needsUpdate = true
        }
        m.opacity = op
      }
    })
  })
}

function RuinPiece({ piece }: { piece: TerrainPieceData }) {
  const floors = piece.floors ?? []
  const walls = piece.walls ?? []
  const catalog = useRuinCatalog()
  const plan = useMemo(
    () => (catalog ? planRuin(piece.id, piece.footprint, piece.height, catalog, wallsCoverPerimeter(piece.footprint, walls)) : null),
    [catalog, piece.id, piece.footprint, piece.height, walls],
  )
  const bounds = useMemo(() => polygonBounds(piece.footprint), [piece.footprint])
  const glb = useRuinModel(plan?.slug)
  const group = useRef<THREE.Group>(null)
  const centre = useMemo(() => ({ x: bounds.cx, z: bounds.cz }), [bounds])
  useOccluderFade(group, centre, Math.hypot(bounds.w, bounds.d) / 2, piece.height)
  // Nothing is drawn for the instant the manifest/GLB streams in (no flash of the fallback);
  // 'failed' (missing file / manifest / disabled slug / no plan) draws the procedural ruin.
  const waiting = catalog === null || (plan !== null && glb.status === 'pending')
  return (
    <group>
      <RuinGround id={piece.id} footprint={piece.footprint} bounds={bounds} walls={walls} floors={floors} />
      <group ref={group} userData={waiting ? undefined : { fittedModel: true }}>
        {glb.status === 'ready' && plan ? (
          <FittedModel model={glb.model} bounds={bounds} height={piece.height} turns={planTurns(plan, glb.model.size, bounds)} />
        ) : !waiting ? (
          walls.map((wall, i) => <RuinWall key={i} seed={`${piece.id}-${i}`} wall={wall} />)
        ) : null}
        {/* Upper floors are gameplay (models stand on them), so they are always drawn, in grey concrete. */}
        {floors.map((floor, i) => (
          <UpperFloor key={i} id={`${piece.id}-f${i}`} floor={floor} inset={glb.status === 'ready' ? GLB_FLOOR_INSET : 0} />
        ))}
      </group>
    </group>
  )
}

/** Dust/stain decal under and around the footprint plus scattered low rubble, so the ruin sits on the
 *  mat instead of floating on it. Decal never writes depth; rubble stays under 0.4" and off the walls. */
function RuinGround({ id, footprint, bounds, walls, floors }: { id: string; footprint: TerrainPieceData['footprint']; bounds: Bounds; walls: WallData[]; floors: FloorData[] }) {
  const tex = useMemo(() => ruinDecalTexture(id, bounds.w, bounds.d), [id, bounds.w, bounds.d])
  const chunks = useMemo(() => scatterRubble(id, footprint, bounds, walls, floors), [id, footprint, bounds, walls, floors])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new THREE.Object3D()
    const c = new THREE.Color()
    chunks.forEach((k, i) => {
      dummy.position.set(k.x, 0, k.z)
      dummy.rotation.set(0, k.rot, 0)
      dummy.scale.set(k.sx, k.sy, k.sz)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      c.setHSL(0.1, 0.04, 0.5 + k.tone * 0.3)
      m.setColorAt(i, c)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    invalidate()
  }, [chunks, invalidate])
  return (
    <group>
      <mesh position={[bounds.cx, 0.02, bounds.cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} userData={{ noFade: true }}>
        <planeGeometry args={[bounds.w + DECAL_MARGIN * 2, bounds.d + DECAL_MARGIN * 2]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} toneMapped={false} />
      </mesh>
      <instancedMesh key={chunks.length} ref={mesh} args={[rubbleGeometry(), rubbleMaterial(), chunks.length]} castShadow receiveShadow frustumCulled={false} />
    </group>
  )
}

/** Splits a wall into solid boxes (u = 0..1 along a->b, y range) honouring the engine's gaps, so the drawn
 *  panel is solid exactly where the engine says it is (wallOccupiesPoint / wallCrosses3D). */
function wallBoxes(wall: WallData): { u0: number; u1: number; y0: number; y1: number }[] {
  const gaps = [...(wall.gaps ?? [])].sort((p, q) => p.from - q.from)
  const out: { u0: number; u1: number; y0: number; y1: number }[] = []
  let u = 0
  for (const g of gaps) {
    const from = Math.max(g.from, u), to = Math.min(g.to, 1)
    if (to <= from) continue
    if (from > u) out.push({ u0: u, u1: from, y0: 0, y1: wall.height })
    const bottom = g.bottom ?? 0, top = g.top ?? wall.height
    if (bottom > 0) out.push({ u0: from, u1: to, y0: 0, y1: Math.min(bottom, wall.height) })
    if (top < wall.height) out.push({ u0: from, u1: to, y0: Math.max(top, 0), y1: wall.height })
    u = to
  }
  if (u < 1) out.push({ u0: u, u1: 1, y0: 0, y1: wall.height })
  return out
}

/** A ruin wall at its TRUE data height, thickness and gaps (what the engine uses for LoS and for where a
 *  base may stand). Semi-transparent so models inside the ruin stay visible. */
function RuinWall({ wall }: { seed: string; wall: WallData }) {
  const { mid, length, rotationY } = segmentTransform(wall.a, wall.b)
  const thickness = wall.thickness ?? ENGINE_DEFAULT_WALL_THICKNESS
  const boxes = useMemo(() => wallBoxes(wall), [wall])
  const concrete = useTiledPBR(CONCRETE_URLS)
  const textures = useMemo(
    () => boxes.map((bx) => cloneRepeat(concrete, ((bx.u1 - bx.u0) * length) / WALL_REPEAT_INCHES, (bx.y1 - bx.y0) / WALL_REPEAT_INCHES)),
    [concrete, boxes, length],
  )
  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, rotationY, 0]}>
      {boxes.map((bx, i) => (
        <mesh key={i} position={[((bx.u0 + bx.u1) / 2 - 0.5) * length, (bx.y0 + bx.y1) / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[(bx.u1 - bx.u0) * length, bx.y1 - bx.y0, thickness]} />
          <meshStandardMaterial normalMap={textures[i].normalMap} roughnessMap={textures[i].roughnessMap} color={RUIN_WALL_TINT} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function UpperFloor({ id, floor, inset = 0 }: { id: string; floor: FloorData; inset?: number }) {
  const thickness = 0.4
  // Broken rockcrete slab: top face exactly at floor.height, footprint polygon unchanged (only inset
  // under a drawn GLB), chipped rim band and jagged underside via vertex colours.
  const geometry = useMemo(
    () => floorSlabGeometry(id, inset > 0 ? insetPolygon(floor.polygon, inset) : floor.polygon, thickness),
    [id, floor.polygon, inset],
  )
  const slabMap = useMemo(() => slabConcreteTexture(), [])
  return (
    <mesh position={[0, floor.height, 0]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial map={slabMap} vertexColors color={CONCRETE_TINT} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  )
}

function BarricadePiece({ piece, colors }: { piece: TerrainPieceData; colors: { base: string; accent: string } }) {
  const glb = useRuinModel('barricade')
  const bounds = useMemo(() => polygonBounds(piece.footprint), [piece.footprint])
  const walls = piece.walls
  if (glb.status === 'pending') return null
  if (glb.status === 'ready') {
    return <FittedModel model={glb.model} bounds={bounds} height={piece.height} turns={simpleTurns(glb.model.size, bounds)} />
  }
  if (!walls || walls.length === 0) {
    return <BlockPiece piece={piece} colors={colors} />
  }
  return (
    <group>
      {walls.map((wall, i) => (
        <BarrierSegment key={i} wall={wall} />
      ))}
    </group>
  )
}

/** Tiles copies of the concrete-road-barrier model along a wall segment, uniformly scaled so the
 *  model's own height matches the segment's visual-capped height, oriented along the segment. */
function BarrierSegment({ wall }: { wall: WallData }) {
  const { mid, length, rotationY } = segmentTransform(wall.a, wall.b)
  const visualHeight = Math.min(wall.height, BLOCK_VISUAL_CAP)
  const { scene } = useGLTF(BARRIER_MODEL_URL)

  const layout = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    box.getSize(size)
    const scale = size.x > 0 ? visualHeight / size.y : 1
    const modelLength = Math.max(size.x * scale, 0.01)
    const count = Math.max(1, Math.round(length / modelLength))
    const spacing = length / count
    const yOffset = -box.min.y * scale
    const instances = Array.from({ length: count }, (_, i) => {
      const clone = scene.clone(true)
      clone.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      return { object: clone, x: (i + 0.5) * spacing - length / 2 }
    })
    return { instances, scale, yOffset }
  }, [scene, visualHeight, length])

  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, rotationY, 0]}>
      {layout.instances.map((inst, i) => (
        <primitive key={i} object={inst.object} position={[inst.x, layout.yOffset, 0]} scale={layout.scale} />
      ))}
    </group>
  )
}

/** Crates are low concrete bunkers (bunker-a / bunker-b by id parity). The GLB's flat roof tops out
 *  at piece.height, which is the standable floor height, so NO separate roof slab is drawn for it
 *  (nothing to z-fight or poke through). Missing/failed GLB -> procedural grey crate with its lid. */
function CratePiece({ piece }: { piece: TerrainPieceData }) {
  const slug = idVariant(piece.id) % 2 === 0 ? 'bunker-a' : 'bunker-b'
  const glb = useRuinModel(slug)
  const bounds = useMemo(() => polygonBounds(piece.footprint), [piece.footprint])
  if (glb.status === 'pending') return null
  if (glb.status === 'ready') {
    return <FittedModel model={glb.model} bounds={bounds} height={piece.height} turns={simpleTurns(glb.model.size, bounds)} />
  }
  return <ProceduralCrate piece={piece} />
}

function ProceduralCrate({ piece }: { piece: TerrainPieceData }) {
  // Visual height only — cover/LoS still read the data's real `piece.height` via the engine's own
  // terrain service, never this capped value.
  const visualHeight = Math.min(piece.height, BLOCK_VISUAL_CAP)
  const geometry = useMemo(() => extrudedPolygonGeometry(piece.footprint, visualHeight), [piece.footprint, visualHeight])
  const lidPolygon = useMemo(() => insetPolygon(piece.footprint, 0.4), [piece.footprint])
  const lidThickness = visualHeight * 0.18
  const lidGeometry = useMemo(() => extrudedPolygonGeometry(lidPolygon, lidThickness), [lidPolygon, lidThickness])

  const { width, depth } = useMemo(() => polygonFootprintSize(piece.footprint), [piece.footprint])
  const lidSize = useMemo(() => polygonFootprintSize(lidPolygon), [lidPolygon])
  const concrete = useTiledPBR(CONCRETE_URLS)
  const textures = useMemo(
    () => cloneRepeat(concrete, Math.max(width, depth) / CONCRETE_REPEAT_INCHES, visualHeight / CONCRETE_REPEAT_INCHES),
    [concrete, width, depth, visualHeight],
  )
  // Same concrete texture as the body, tinted darker so the lid still reads as a separate slab.
  const lidTextures = useMemo(
    () => cloneRepeat(concrete, Math.max(lidSize.width, lidSize.depth) / CONCRETE_REPEAT_INCHES, lidThickness / CONCRETE_REPEAT_INCHES),
    [concrete, lidSize, lidThickness],
  )

  return (
    <group>
      <mesh position={[0, 0, 0]} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          {...textures}
          color={RUIN_WALL_TINT}
          roughness={0.9}
          metalness={0}
          side={THREE.DoubleSide}
          transparent
          opacity={TERRAIN_OPACITY}
        />
      </mesh>
      <mesh position={[0, visualHeight, 0]} geometry={lidGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          {...lidTextures}
          color={RUBBLE_TINT}
          roughness={0.9}
          metalness={0}
          side={THREE.DoubleSide}
          transparent
          opacity={TERRAIN_OPACITY}
        />
      </mesh>
    </group>
  )
}

interface CraterRock { object: THREE.Object3D; x: number; z: number; rotY: number; scale: [number, number, number]; offset: [number, number, number] }

/** A crater: the flat blast-crater model (flattened under CRATER_FLOOR_MAX_HEIGHT) with a few low stones scattered on
 *  its floor, ringed by taller rocks sitting on the footprint edge (long side along the rim, only ~0.4in deep) so the
 *  pile reads as a raised lip without covering ground a base may stand on. Visual only — cover/LoS read the data's
 *  own height via the engine's terrain service. */
function CraterPiece({ piece }: { piece: TerrainPieceData }) {
  const center = useMemo(() => polygonCentroid(piece.footprint), [piece.footprint])
  const radius = useMemo(() => polygonBoundingRadius(piece.footprint, center), [piece.footprint, center])
  const scorchGeometry = useMemo(() => extrudedPolygonGeometry(piece.footprint, CRATER_SCORCH_HEIGHT), [piece.footprint])
  // The decorative scorch decal is replaced by the flat blast-crater GLB when it is available.
  const craterGlb = useRuinModel('crater')
  const craterBounds = useMemo(() => polygonBounds(piece.footprint), [piece.footprint])

  // Fixed-length tuple (ROCK_MODEL_URLS never changes at runtime), so calling useGLTF once per
  // entry keeps a stable hook-call order across renders.
  const rockGltfs = [useGLTF(ROCK_MODEL_URLS[0]), useGLTF(ROCK_MODEL_URLS[1])]
  const rockScenes = rockGltfs.map((g) => g.scene)

  const rocks = useMemo(() => {
    const out: CraterRock[] = []
    const add = (seed: string, x: number, z: number, rotY: number, width: number, depth: number, maxHeight: number) => {
      const scene = rockScenes[Math.floor(seededUnit(`${seed}-m`) * rockScenes.length) % rockScenes.length]
      const box = new THREE.Box3().setFromObject(scene)
      const size = box.getSize(new THREE.Vector3())
      const c = box.getCenter(new THREE.Vector3())
      const sx = width / (size.x || 1)
      const sz = depth / (size.z || 1)
      // Never stretch taller than the rock's own proportions; flatten to the cap instead.
      const sy = Math.min(maxHeight / (size.y || 1), Math.max(sx, sz))
      const object = scene.clone(true)
      object.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        // The moon-rock glTFs pack an ARM (AO/roughness/metalness) texture; without an environment map, any
        // nonzero metalness reads as flat black, so force it off.
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (mat instanceof THREE.MeshStandardMaterial) mat.metalness = 0
        }
      })
      out.push({ object, x, z, rotY, scale: [sx, sy, sz], offset: [-c.x * sx, -box.min.y * sy, -c.z * sz] })
    }
    // Loose stones on the crater floor.
    for (let i = 0; i < CRATER_DEBRIS_COUNT; i++) {
      const seed = `${piece.id}-debris-${i}`
      const a = (i / CRATER_DEBRIS_COUNT) * Math.PI * 2 + seededUnit(`${seed}-a`) * 0.9
      const d = radius * (0.2 + 0.5 * seededUnit(`${seed}-d`))
      const w = 0.35 + 0.25 * seededUnit(`${seed}-w`)
      add(seed, center.x + Math.cos(a) * d, center.z + Math.sin(a) * d, seededUnit(`${seed}-r`) * Math.PI * 2, w, w * (0.7 + 0.3 * seededUnit(`${seed}-q`)), CRATER_FLOOR_MAX_HEIGHT - 0.02)
    }
    // Rim rocks: long side tangent to the edge, shallow in the radial direction.
    const count = CRATER_RIM_ROCK_MIN + Math.floor(seededUnit(`${piece.id}-count`) * (CRATER_RIM_ROCK_MAX - CRATER_RIM_ROCK_MIN + 1))
    const rimR = radius + CRATER_RIM_OFFSET
    const start = seededUnit(`${piece.id}-rim-start`) * Math.PI * 2
    for (let i = 0; i < count; i++) {
      const seed = `${piece.id}-rim-${i}`
      const a = start + (i / count) * Math.PI * 2 + (seededUnit(`${seed}-a`) - 0.5) * 0.12
      const length = ((2 * Math.PI * rimR) / count) * (1.0 + 0.2 * seededUnit(`${seed}-l`))
      const height = CRATER_RIM_MIN_HEIGHT + (CRATER_RIM_MAX_HEIGHT - CRATER_RIM_MIN_HEIGHT) * seededUnit(`${seed}-h`)
      const tangentYaw = Math.atan2(-Math.cos(a), -Math.sin(a)) // turns the model's +X along the rim tangent
      add(seed, center.x + Math.cos(a) * rimR, center.z + Math.sin(a) * rimR, tangentYaw + (seededUnit(`${seed}-f`) < 0.5 ? 0 : Math.PI), length, CRATER_RIM_THICKNESS, height)
    }
    return out
  }, [piece.id, center, radius, rockScenes])

  return (
    <group>
      {craterGlb.status === 'ready' ? (
        <FittedModel
          model={craterGlb.model}
          bounds={craterBounds}
          height={Math.min(Math.max(piece.height, 0.05), CRATER_FLOOR_MAX_HEIGHT)}
          turns={simpleTurns(craterGlb.model.size, craterBounds)}
        />
      ) : (
        <mesh position={[0, 0.001, 0]} geometry={scorchGeometry}>
          <meshStandardMaterial color="#3a2a1e" roughness={1} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
      {rocks.map((r, i) => (
        <group key={i} position={[r.x, 0, r.z]} rotation={[0, r.rotY, 0]}>
          <primitive object={r.object} position={r.offset} scale={r.scale} />
        </group>
      ))}
    </group>
  )
}

function BlockPiece({ piece, colors }: { piece: TerrainPieceData; colors: { base: string; accent: string } }) {
  // Visual height only — cover/LoS still read the data's real `piece.height` via the engine's own
  // terrain service, never this capped value.
  const visualHeight = Math.min(piece.height, BLOCK_VISUAL_CAP)
  const geometry = useMemo(() => extrudedPolygonGeometry(piece.footprint, visualHeight), [piece.footprint, visualHeight])
  return (
    <mesh position={[0, 0, 0]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={colors.base} roughness={0.9} side={THREE.DoubleSide} transparent opacity={TERRAIN_OPACITY} />
    </mesh>
  )
}

function insetPolygon(polygon: TerrainPieceData['footprint'], amount: number) {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length
  const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length
  return polygon.map((p) => {
    const dx = p.x - cx
    const dz = p.z - cz
    const d = Math.hypot(dx, dz) || 1
    const shrink = Math.min(amount, d * 0.4)
    return { x: p.x - (dx / d) * shrink, z: p.z - (dz / d) * shrink }
  })
}
