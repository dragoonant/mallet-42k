// Shared prop/view types for src/client/board/**. Read-only imports from data/engine — this
// module never mutates GameState and never edits src/data or src/engine.
import type { PlayerId } from '@/engine'
import type { Vec2, Polygon } from '@/data/types'

export type { Vec2, Polygon, PlayerId }

/** One entry per player's home colour, used consistently for zones, rings, and markers. */
export const SIDE_COLOR: Record<PlayerId, string> = {
  A: '#4fb0ff',
  B: '#ff6a4f',
}

export const NEUTRAL_COLOR = '#9aa0b0'

export interface ObjectiveView {
  id: string
  pos: Vec2
  /** Marker/control ring radius in inches; defaults to 3" (Combat Patrol default) when omitted. */
  radius?: number
}

/** Looks up which player currently controls an objective, or null if contested/uncontrolled. */
export type ObjectiveController = (objectiveId: string) => PlayerId | null

export interface DeploymentZones {
  A: Polygon
  B: Polygon
}
