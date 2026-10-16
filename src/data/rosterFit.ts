// Shared by the client mission picker and the headless sim: can every model of a Combat Patrol roster be set up wholly
// inside a mission's deployment zones? A base wider than the narrowest zone side (Onager Dunecrawler, 130 mm = 5.12",
// versus cp-01's 5" strips) leaves deployUnit with no legal placement, so such a mission must not be paired with that roster.
import type { DataBundle } from './types'

/** `missionId` is the bundle key (e.g. 'mission.cp-01'). Unknown mission or patrol -> true (nothing to check). */
export function rosterFitsMission(bundle: DataBundle, patrolId: string, missionId: string): boolean {
  const zones = bundle.missions[missionId]?.deploymentZones
  const patrol = bundle.patrols[patrolId]
  if (!zones || !patrol) return true
  const room = Math.min(...(Object.values(zones) as { x: number; z: number }[][]).map((poly) => {
    const xs = poly.map((v) => v.x), zs = poly.map((v) => v.z)
    return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  }))
  return patrol.units.every((u) => (bundle.datasheets[u.datasheet]?.composition ?? []).every((c) => {
    const b = c.base
    return !b || Math.min(b.mm, b.mm2 ?? b.mm) / 25.4 <= room + 1e-9
  }))
}
