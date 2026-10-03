import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { FloorData, TerrainPieceData, WallData } from '@/data/types'
import { extrudedPolygonGeometry, polygonBoundingRadius, polygonCentroid, seededUnit, segmentTransform } from './geometry'
import { idVariant, planRuin, planTurns, polygonBounds, simpleTurns, type Bounds } from './ruinFit'
import { useRuinModel, type RuinModel } from './ruinModels'
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
const RUIN_WALL_TINT = '#a4a4a0' // weathered grey concrete (procedural ruin fallback)
const RUBBLE_TINT = '#8c8c87'
const CONCRETE_TINT = '#a9a9a4' // upper-floor slabs, matched to the grey ruins
// Pulls the floor slab in from the footprint edge when a ruin GLB is drawn, so its sides never
// z-fight the model's own outer walls.
const GLB_FLOOR_INSET = 0.12

// Ruins render as low, broken walls rather than the full data height — a stylistic choice so the
// board reads clearly at table-top camera angles; the engine's own terrain heights govern LoS/cover.
const RUIN_WALL_VISUAL_CAP = 3
const RUIN_WALL_VISUAL_SCALE = 0.55
const WALL_THICKNESS = 0.35
// Solid terrain is capped and semi-transparent so it never fully hides units or a deployment zone
// behind it at table-top camera angles (LoS/cover still come from the engine's real terrain heights).
const BLOCK_VISUAL_CAP = 3.2
const TERRAIN_OPACITY = 0.85

// Texture-repeat scale: one full tile per this many inches of surface (bricks/concrete/metal read
// clearly at tabletop scale without looking either smeared or over-tiled).
const WALL_REPEAT_INCHES = 8
const CONCRETE_REPEAT_INCHES = 8

const CRATER_MAX_HEIGHT = 1.5
const CRATER_SCORCH_HEIGHT = 0.05
const CRATER_ROCK_MIN = 8
const CRATER_ROCK_MAX = 10
// Per-tier height caps (as a fraction of CRATER_MAX_HEIGHT) so the central rock is reliably the
// tallest regardless of which model/shape gets picked for the mid/outer rings.
const CRATER_CENTRAL_HEIGHT_FRACTION = 1
const CRATER_MID_HEIGHT_FRACTION = 0.65
const CRATER_OUTER_HEIGHT_FRACTION = 0.45
// Adjacent same-ring rocks are sized so their footprints overlap by roughly this fraction.
const CRATER_RING_OVERLAP = 0.25

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
          <TerrainPiece key={piece.id} piece={piece} />
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

/** Draws a loaded terrain GLB scaled (non-uniformly) so its bounding box exactly covers `bounds` in
 *  X/Z and `height` in Y, rotated `turns` quarter-turns about Y before the scale is applied. */
function FittedModel({ model, bounds, height, turns }: { model: RuinModel; bounds: Bounds; height: number; turns: number }) {
  const [sx, sy, sz] = model.size
  const swap = turns % 2 === 1
  const rx = swap ? sz : sx
  const rz = swap ? sx : sz
  return (
    <group position={[bounds.cx, 0, bounds.cz]} scale={[bounds.w / rx, height / sy, bounds.d / rz]}>
      <group rotation={[0, (turns * Math.PI) / 2, 0]}>
        <primitive object={model.object} />
      </group>
    </group>
  )
}

function RuinPiece({ piece }: { piece: TerrainPieceData }) {
  const floors = piece.floors ?? []
  const plan = useMemo(() => planRuin(piece.id, piece.footprint, piece.height), [piece.id, piece.footprint, piece.height])
  const bounds = useMemo(() => polygonBounds(piece.footprint), [piece.footprint])
  const glb = useRuinModel(plan?.slug)
  // 'pending' draws nothing for the instant the GLB streams in (no flash of the fallback);
  // 'failed' (missing file / manifest / disabled slug) draws the procedural ruin.
  return (
    <group>
      {glb.status === 'ready' && plan ? (
        <FittedModel model={glb.model} bounds={bounds} height={piece.height} turns={planTurns(plan, glb.model.size, bounds)} />
      ) : glb.status === 'failed' ? (
        (piece.walls ?? []).map((wall, i) => <RuinWall key={i} seed={`${piece.id}-${i}`} wall={wall} />)
      ) : null}
      {/* Upper floors are gameplay (models stand on them), so they are always drawn, in grey concrete. */}
      {floors.map((floor, i) => (
        <UpperFloor key={i} floor={floor} inset={glb.status === 'ready' ? GLB_FLOOR_INSET : 0} />
      ))}
    </group>
  )
}

function RuinWall({ seed, wall }: { seed: string; wall: WallData }) {
  const { mid, length, rotationY } = segmentTransform(wall.a, wall.b)
  const wallHeight = Math.min(wall.height * RUIN_WALL_VISUAL_SCALE, RUIN_WALL_VISUAL_CAP)

  const rubble = useMemo(() => {
    // A couple of deterministically-placed jagged chunks along the run so the broken-wall
    // silhouette is stable across re-renders instead of flickering with fresh randomness.
    return [0.22, 0.62].map((t, i) => {
      const bumpSeed = `${seed}-${i}`
      const width = length * (0.16 + 0.1 * seededUnit(bumpSeed))
      const extra = 0.3 + 1.1 * seededUnit(`${bumpSeed}-h`)
      const offset = (t - 0.5) * length
      return { offset, width, height: wallHeight + extra }
    })
  }, [seed, length, wallHeight])

  const concrete = useTiledPBR(CONCRETE_URLS)
  const wallTextures = useMemo(
    () => cloneRepeat(concrete, length / WALL_REPEAT_INCHES, wallHeight / WALL_REPEAT_INCHES),
    [concrete, length, wallHeight],
  )
  const rubbleTextures = useMemo(
    () => rubble.map((r) => cloneRepeat(concrete, r.width / WALL_REPEAT_INCHES, r.height / WALL_REPEAT_INCHES)),
    [concrete, rubble],
  )

  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, wallHeight, WALL_THICKNESS]} />
        <meshStandardMaterial {...wallTextures} color={RUIN_WALL_TINT} roughness={1} transparent opacity={TERRAIN_OPACITY} />
      </mesh>
      {rubble.map((r, i) => (
        <mesh key={i} position={[r.offset, r.height / 2, 0]}>
          <boxGeometry args={[r.width, r.height, WALL_THICKNESS * 1.05]} />
          <meshStandardMaterial {...rubbleTextures[i]} color={RUBBLE_TINT} roughness={1} transparent opacity={TERRAIN_OPACITY} />
        </mesh>
      ))}
    </group>
  )
}

function UpperFloor({ floor, inset = 0 }: { floor: FloorData; inset?: number }) {
  const thickness = 0.4
  const geometry = useMemo(
    () => extrudedPolygonGeometry(inset > 0 ? insetPolygon(floor.polygon, inset) : floor.polygon, thickness),
    [floor.polygon, inset],
  )
  const { width, depth } = useMemo(() => polygonFootprintSize(floor.polygon), [floor.polygon])
  const concrete = useTiledPBR(CONCRETE_URLS)
  const textures = useMemo(
    () => cloneRepeat(concrete, width / CONCRETE_REPEAT_INCHES, depth / CONCRETE_REPEAT_INCHES),
    [concrete, width, depth],
  )
  return (
    <mesh position={[0, floor.height - thickness, 0]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial {...textures} color={CONCRETE_TINT} roughness={0.9} side={THREE.DoubleSide} />
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

type CraterRockTier = 'central' | 'mid' | 'outer'

/** A low rocky mound: 8-10 deterministically seeded rock instances in three tiers — one central
 *  peak, a mid ring, and an outer ring — overlapping enough to read as a solid pile rather than
 *  loose scattered pebbles, over a dark scorched disc. Visual only — cover/LoS read the data's own
 *  height via the engine's own terrain service, never this cluster's shape. */
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
    const count = CRATER_ROCK_MIN + Math.floor(seededUnit(`${piece.id}-count`) * (CRATER_ROCK_MAX - CRATER_ROCK_MIN + 1))
    const midCount = Math.max(2, Math.round((count - 1) * 0.45))
    const outerCount = Math.max(2, count - 1 - midCount)

    // A small fixed jitter applied to the whole mid/outer ring (scaled down for the outer ring) so
    // the two rings don't read as perfectly concentric circles around the same center.
    const jitterAngle = seededUnit(`${piece.id}-ring-jitter-a`) * Math.PI * 2
    const jitterDist = radius * 0.06 * seededUnit(`${piece.id}-ring-jitter-d`)
    const jitterX = Math.cos(jitterAngle) * jitterDist
    const jitterZ = Math.sin(jitterAngle) * jitterDist

    const specs: { tier: CraterRockTier; ringIndex: number; ringCount: number }[] = [{ tier: 'central', ringIndex: 0, ringCount: 1 }]
    for (let i = 0; i < midCount; i++) specs.push({ tier: 'mid', ringIndex: i, ringCount: midCount })
    for (let i = 0; i < outerCount; i++) specs.push({ tier: 'outer', ringIndex: i, ringCount: outerCount })

    return specs.map((spec, i) => {
      const seed = `${piece.id}-rock-${i}`
      const modelIndex = Math.floor(seededUnit(`${seed}-m`) * rockScenes.length) % rockScenes.length
      const scene = rockScenes[modelIndex]

      let angle: number
      let dist: number
      let targetHorizontal: number
      let heightFraction: number
      let offsetX = 0
      let offsetZ = 0

      if (spec.tier === 'central') {
        // Footprint covers ~70% of the crater radius and is capped at the full crater height, so
        // it reads as the peak of the mound regardless of which mid/outer rocks get picked.
        angle = seededUnit(`${seed}-a`) * Math.PI * 2
        dist = radius * 0.08 * seededUnit(`${seed}-d`) // near-centered, slight jitter
        targetHorizontal = radius * 0.7
        heightFraction = CRATER_CENTRAL_HEIGHT_FRACTION
      } else {
        const isMid = spec.tier === 'mid'
        const sector = (spec.ringIndex / spec.ringCount) * Math.PI * 2
        angle = sector + (seededUnit(`${seed}-a`) - 0.5) * ((Math.PI / spec.ringCount) * 0.6)
        dist = isMid
          ? radius * (0.42 + 0.06 * seededUnit(`${seed}-d`)) // mid ring ~45% of radius
          : radius * (0.75 + 0.1 * seededUnit(`${seed}-d`)) // outer ring ~75-85% of radius
        // Size each ring rock from the chord between its neighbors so adjacent footprints overlap
        // by roughly CRATER_RING_OVERLAP instead of leaving gaps or being wildly oversized.
        const chord = 2 * dist * Math.sin(Math.PI / spec.ringCount)
        const overlapFraction = CRATER_RING_OVERLAP + 0.1 * seededUnit(`${seed}-o`)
        targetHorizontal = Math.min(Math.max(chord / (1 - overlapFraction), radius * 0.18), radius * 0.55)
        heightFraction = isMid ? CRATER_MID_HEIGHT_FRACTION : CRATER_OUTER_HEIGHT_FRACTION
        offsetX = isMid ? jitterX : jitterX * 0.6
        offsetZ = isMid ? jitterZ : jitterZ * 0.6
      }

      // Scale from the model's own measured Box3 — never a fixed constant — so different rock
      // models (and their differing native sizes) land at a consistent footprint size.
      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      box.getSize(size)
      const horizontalExtent = Math.max(size.x, size.z) || 1
      const scaleXZ = targetHorizontal / horizontalExtent
      const rawHeight = size.y * scaleXZ
      // Flatten (never stretch) so no rock exceeds its tier's height cap — central stays tallest.
      const tierMaxHeight = CRATER_MAX_HEIGHT * heightFraction
      const yFactor = rawHeight > 0 ? Math.min(1, tierMaxHeight / rawHeight) : 1
      const scaleY = scaleXZ * yFactor

      const clone = scene.clone(true)
      clone.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
          // The moon-rock glTFs pack an ARM (AO/roughness/metalness) texture; without an
          // environment map, any nonzero metalness reads as flat black, so force it off.
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const mat of materials) {
            if (mat instanceof THREE.MeshStandardMaterial) mat.metalness = 0
          }
        }
      })
      return {
        object: clone,
        x: center.x + offsetX + Math.cos(angle) * dist,
        z: center.z + offsetZ + Math.sin(angle) * dist,
        y: -box.min.y * scaleY,
        scaleXZ,
        scaleY,
        rotY: seededUnit(`${seed}-r`) * Math.PI * 2, // randomised yaw per rock
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id, piece.footprint, center, radius, rockScenes])

  return (
    <group>
      {craterGlb.status === 'ready' ? (
        <FittedModel
          model={craterGlb.model}
          bounds={craterBounds}
          height={Math.max(piece.height, 0.05)}
          turns={simpleTurns(craterGlb.model.size, craterBounds)}
        />
      ) : (
        <mesh position={[0, 0.001, 0]} geometry={scorchGeometry}>
          <meshStandardMaterial color="#3a2a1e" roughness={1} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
      {rocks.map((r, i) => (
        <primitive
          key={i}
          object={r.object}
          position={[r.x, r.y, r.z]}
          scale={[r.scaleXZ, r.scaleY, r.scaleXZ]}
          rotation={[0, r.rotY, 0]}
        />
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
