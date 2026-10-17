// Shared by the engine's geometry, the client deploy panel and the tests: does a base fit inside a mission's deployment zones?
// A base wider than the narrowest zone side (Onager Dunecrawler, 130 mm = 5.12", versus cp-01's 5" strips) cannot be set up wholly
// within the zone, so by the Rules Commentary "Deploying Units" it is set up touching its player's battlefield edge instead
// (see `oversizeEdgePlacementOk` in src/engine/geometry.ts). This file only does the geometry; it imports nothing at runtime.
type Pt = { x: number; z: number }

/** The narrowest side (inches) of the bounding box of any deployment zone: the most room a single base can count on. */
export function deploymentRoom(zones: { A: Pt[]; B: Pt[] }): number {
  return Math.min(...[zones.A, zones.B].map((poly) => {
    const xs = poly.map((v) => v.x), zs = poly.map((v) => v.z)
    return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  }))
}

/** `radius`/`radius2` are the base's semi-axes in inches (round bases have no radius2). Fits when its narrow side fits `room`. */
export function baseFitsRoom(base: { radius: number; radius2?: number }, room: number): boolean {
  return 2 * Math.min(base.radius, base.radius2 ?? base.radius) <= room + 1e-9
}
