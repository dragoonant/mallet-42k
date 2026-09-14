import { useMemo } from 'react'
import * as THREE from 'three'
import type { FloorData, TerrainPieceData, WallData } from '@/data/types'
import { extrudedPolygonGeometry, seededUnit, segmentTransform } from './geometry'

// Chunky stylised-SD palette per terrain kind. Purely presentational — LoS/cover come from the engine.
const PALETTE: Record<TerrainPieceData['kind'], { base: string; accent: string }> = {
  ruin: { base: '#8d8271', accent: '#6a6152' },
  crate: { base: '#5f6b4a', accent: '#454f34' },
  barricade: { base: '#7d8087', accent: '#5c5f66' },
  crater: { base: '#6f4f34', accent: '#523a26' },
  wall: { base: '#767a86', accent: '#585b64' },
  forest: { base: '#3f6b45', accent: '#2c4d32' },
}

// Ruins render as low, broken walls rather than the full data height — a stylistic choice so the
// board reads clearly at table-top camera angles; the engine's own terrain heights govern LoS/cover.
const RUIN_WALL_VISUAL_CAP = 3
const RUIN_WALL_VISUAL_SCALE = 0.55
const WALL_THICKNESS = 0.35

export interface TerrainProps {
  pieces: TerrainPieceData[]
}

/** Terrain meshes generated from a terrain layout's pieces (src/data/terrain). */
export function Terrain({ pieces }: TerrainProps) {
  return (
    <group>
      {pieces.map((piece) => (
        <TerrainPiece key={piece.id} piece={piece} />
      ))}
    </group>
  )
}

function TerrainPiece({ piece }: { piece: TerrainPieceData }) {
  const colors = PALETTE[piece.kind] ?? PALETTE.wall

  switch (piece.kind) {
    case 'ruin':
      return <RuinPiece piece={piece} colors={colors} />
    case 'barricade':
      return <BarricadePiece piece={piece} colors={colors} />
    case 'crate':
      return <BlockPiece piece={piece} colors={colors} lid />
    case 'crater':
      return <BlockPiece piece={piece} colors={colors} />
    default:
      return <BlockPiece piece={piece} colors={colors} />
  }
}

function RuinPiece({ piece, colors }: { piece: TerrainPieceData; colors: { base: string; accent: string } }) {
  const floors = piece.floors ?? []
  return (
    <group>
      {(piece.walls ?? []).map((wall, i) => (
        <RuinWall key={i} seed={`${piece.id}-${i}`} wall={wall} color={colors.base} accent={colors.accent} />
      ))}
      {floors.map((floor, i) => (
        <UpperFloor key={i} floor={floor} color={colors.accent} />
      ))}
    </group>
  )
}

function RuinWall({ seed, wall, color, accent }: { seed: string; wall: WallData; color: string; accent: string }) {
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

  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, wallHeight / 2, 0]}>
        <boxGeometry args={[length, wallHeight, WALL_THICKNESS]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      {rubble.map((r, i) => (
        <mesh key={i} position={[r.offset, r.height / 2, 0]}>
          <boxGeometry args={[r.width, r.height, WALL_THICKNESS * 1.05]} />
          <meshStandardMaterial color={accent} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function UpperFloor({ floor, color }: { floor: FloorData; color: string }) {
  const thickness = 0.4
  const geometry = useMemo(() => extrudedPolygonGeometry(floor.polygon, thickness), [floor.polygon])
  return (
    <mesh position={[0, floor.height - thickness, 0]} geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  )
}

function BarricadePiece({ piece, colors }: { piece: TerrainPieceData; colors: { base: string; accent: string } }) {
  const walls = piece.walls
  if (!walls || walls.length === 0) {
    return <BlockPiece piece={piece} colors={colors} />
  }
  return (
    <group>
      {walls.map((wall, i) => {
        const { mid, length, rotationY } = segmentTransform(wall.a, wall.b)
        return (
          <mesh key={i} position={[mid.x, wall.height / 2, mid.z]} rotation={[0, rotationY, 0]}>
            <boxGeometry args={[length, wall.height, WALL_THICKNESS * 0.8]} />
            <meshStandardMaterial color={colors.base} roughness={0.85} />
          </mesh>
        )
      })}
    </group>
  )
}

function BlockPiece({ piece, colors, lid }: { piece: TerrainPieceData; colors: { base: string; accent: string }; lid?: boolean }) {
  const geometry = useMemo(() => extrudedPolygonGeometry(piece.footprint, piece.height), [piece.footprint, piece.height])
  const lidGeometry = useMemo(
    () => (lid ? extrudedPolygonGeometry(insetPolygon(piece.footprint, 0.4), piece.height * 0.18) : null),
    [lid, piece.footprint, piece.height],
  )
  return (
    <group>
      <mesh position={[0, 0, 0]} geometry={geometry}>
        <meshStandardMaterial color={colors.base} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {lidGeometry && (
        <mesh position={[0, piece.height, 0]} geometry={lidGeometry}>
          <meshStandardMaterial color={colors.accent} roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
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
