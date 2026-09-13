// Line of sight and Benefit of Cover (10-rules §3.1, §3.3). Owner: W1-B. Pure queries over state; the shooting module
// asks `unitVisible` when targets are declared and `benefitOfCover` when an attack is allocated.
//
// [interp] `fullyVisible`: "every part of B facing A is visible" (R-3.3) is modelled, per 00-arch §7, as "every one of
// B's LoS sample points is visible from at least one of A's sample points" (models of the observed unit never block
// each other, R-3.4).
// [interp] Benefit of Cover's "not fully visible to every attacking model because of it [a terrain piece]" (§3.2) is
// evaluated per piece: `pieceObstructs` re-runs the full/any-visibility test using only that one piece's geometry
// (its walls, ruin footprint or crate volume) so cover is attributed to the specific piece that blocks the view, not
// to "some terrain exists on the board" — an unrelated piece elsewhere never grants cover on its own.
// [interp] Woods "a model that must look through/over the woods never sees the target fully visible": approximated as
// "the straight line between the two models' base centres crosses a woods footprint" rather than a full search over
// every possible sightline; only the "wholly within" half of the rule (LOS-027) is exercised by the checklist.
import { baseEdgePoints, dist2D, EPS, pointInPolygon, whollyWithinPolygon } from './geometry'
import { crateBlocks, ruinFootprintBlocks, segmentIntersectsPolygon2D, wallCrosses3D } from './terrain'
import { weaponService } from './weapons'
import { leaderService } from './leaders'
import { boardModelsOf, hasKeyword, modelStats, unitModels } from './state'
import type { GameState, Model, ModelId, RuntimeWeapon, TerrainPiece, UnitId, Vec3 } from './types'

const PLUNGING_FIRE_HEIGHT = 6

// a model (any unit but the observer's own) as a vertical cylinder (elliptical footprint for oval bases) from its
// ground contact height to pos.y + height. R-3.1/R-3.3: the ray blocks whenever ANY point of the 3D segment falls
// inside that volume — not just the point closest (in 2D) to the base centre, since height varies along the segment
// and the horizontal-distance-within-radius test is satisfied over a whole t-interval, not a single point (LOS-004).
function modelBlocks(blocker: Model, p1: Vec3, p2: Vec3): boolean {
  const r1 = blocker.base.radius, r2 = blocker.base.radius2 ?? r1
  const c = Math.cos(-blocker.facing), s = Math.sin(-blocker.facing)
  const toLocal = (x: number, z: number) => {
    const dx = x - blocker.pos.x, dz = z - blocker.pos.z
    return { lx: dx * c - dz * s, lz: dx * s + dz * c }
  }
  const P1 = toLocal(p1.x, p1.z), P2 = toLocal(p2.x, p2.z)
  const dlx = P2.lx - P1.lx, dlz = P2.lz - P1.lz
  const r1sq = r1 * r1, r2sq = r2 * r2
  const a = (dlx * dlx) / r1sq + (dlz * dlz) / r2sq
  const b = 2 * ((P1.lx * dlx) / r1sq + (P1.lz * dlz) / r2sq)
  const c2 = (P1.lx * P1.lx) / r1sq + (P1.lz * P1.lz) / r2sq - 1
  let t0: number, t1: number
  if (a < 1e-12) {
    if (c2 > EPS) return false // segment does not move in xz (relative to the ellipse scale) and sits outside it
    t0 = 0; t1 = 1
  } else {
    const disc = b * b - 4 * a * c2
    if (disc < 0) return false
    const sq = Math.sqrt(disc)
    t0 = (-b - sq) / (2 * a)
    t1 = (-b + sq) / (2 * a)
  }
  t0 = Math.max(0, t0); t1 = Math.min(1, t1)
  if (t0 > t1 + EPS) return false
  const y0 = p1.y + (p2.y - p1.y) * t0, y1 = p1.y + (p2.y - p1.y) * t1
  const yLo = Math.min(y0, y1), yHi = Math.max(y0, y1)
  return yHi >= blocker.pos.y - EPS && yLo <= blocker.pos.y + blocker.height + EPS
}

function allBoardModels(state: GameState): Model[] { return [...boardModelsOf(state, 'A'), ...boardModelsOf(state, 'B')] }

// R-3.1/R-3.7: is the 3D segment p1(observer)->p2(observed) blocked by terrain, or by a model whose unit is not in
// `excludeUnitIds` (and is not `toModelId` itself)? `excludeUnitIds` always covers the observer's own (possibly
// attached) unit (LOS-003/LOS-003b: an attached leader is part of its bodyguard's unit and never blocks it, and vice
// versa); callers computing full-visibility (R-3.4) also add the observed unit's own (possibly attached) halves so
// the observed unit's models never block each other (LOS-031/LOS-031b).
function segmentBlocked(
  state: GameState, p1: Vec3, p2: Vec3, from: Model, toModelId: ModelId, excludeUnitIds: ReadonlySet<UnitId>,
): boolean {
  const targetAircraft = hasKeyword(state, state.models[toModelId]?.unitId, 'AIRCRAFT')
  for (const p of Object.values(state.board.pieces)) {
    for (const w of p.walls) if (wallCrosses3D(w, p1, p2)) return true
    if (p.kind === 'ruin' && !targetAircraft && ruinFootprintBlocks(p, p1, p2, whollyWithinPolygon(from, p.footprint))) return true
    if (p.kind === 'crate' && crateBlocks(p, p1, p2)) return true
  }
  for (const blocker of allBoardModels(state)) {
    if (excludeUnitIds.has(blocker.unitId) || blocker.id === toModelId) continue
    if (modelBlocks(blocker, p1, p2)) return true
  }
  return false
}

// `extraExcludeUnitIds`: additional unit ids whose models never block (fullyVisible also excludes the observed
// unit's own (possibly attached) halves per R-3.4/LOS-031b; plain visible() passes none, per LOS-031's "visible()
// keeps the current behaviour").
function anyClearPair(state: GameState, from: Model, to: Model, extraExcludeUnitIds: Iterable<UnitId> = []): boolean {
  const exclude = new Set([...leaderService.halves(state, from.unitId), ...extraExcludeUnitIds])
  const fromPts = losService.samplePoints(from), toPts = losService.samplePoints(to)
  return fromPts.some((fp) => toPts.some((tp) => !segmentBlocked(state, fp, tp, from, to.id, exclude)))
}

// every one of `to`'s sample points is visible from at least one of `from`'s ([interp] above); R-3.4: neither the
// observer's nor the observed unit's own (possibly attached) models may block this.
function everyPointFullyVisible(state: GameState, from: Model, to: Model): boolean {
  const exclude = new Set([...leaderService.halves(state, from.unitId), ...leaderService.halves(state, to.unitId)])
  const fromPts = losService.samplePoints(from), toPts = losService.samplePoints(to)
  return toPts.every((tp) => fromPts.some((fp) => !segmentBlocked(state, fp, tp, from, to.id, exclude)))
}

function inForest(state: GameState, m: Model): boolean {
  return Object.values(state.board.pieces).some((p) => p.kind === 'forest' && whollyWithinPolygon(m, p.footprint))
}

function crossesForest(state: GameState, from: Model, to: Model): boolean {
  return Object.values(state.board.pieces).some((p) => p.kind === 'forest' && segmentIntersectsPolygon2D(from.pos, to.pos, p.footprint))
}

// R-3.2 "not fully visible... because of it [this piece]": does terrain piece `p`, considered on its own (ignoring
// every other piece on the board and every model), block full visibility from `a` to `target`? This is what lets
// Benefit of Cover attribute the obstruction to the one piece actually responsible (LOS-021-attrib/LOS-022-attrib/
// LOS-023-attrib) instead of granting it because *some* terrain exists anywhere on the board.
function pieceObstructs(state: GameState, p: TerrainPiece, a: Model, target: Model): boolean {
  const targetAircraft = hasKeyword(state, target.unitId, 'AIRCRAFT')
  const fromWhollyWithin = p.kind === 'ruin' && whollyWithinPolygon(a, p.footprint)
  const blocks = (p1: Vec3, p2: Vec3): boolean => {
    for (const w of p.walls) if (wallCrosses3D(w, p1, p2)) return true
    if (p.kind === 'ruin' && !targetAircraft && ruinFootprintBlocks(p, p1, p2, fromWhollyWithin)) return true
    if (p.kind === 'crate' && crateBlocks(p, p1, p2)) return true
    return false
  }
  const fromPts = losService.samplePoints(a), toPts = losService.samplePoints(target)
  const everyPtVisible = toPts.every((tp) => fromPts.some((fp) => !blocks(fp, tp)))
  const someClear = fromPts.some((fp) => toPts.some((tp) => !blocks(fp, tp)))
  return !everyPtVisible || !someClear
}

function wholeBaseWithinDistanceOfPolygon(m: Model, poly: { x: number; z: number }[], n: number): boolean {
  const pointDist = (p: { x: number; z: number }) => {
    if (pointInPolygon(p, poly)) return 0
    let best = Infinity
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      const abx = b.x - a.x, abz = b.z - a.z
      const l2 = abx * abx + abz * abz
      let t = l2 === 0 ? 0 : ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2
      t = Math.max(0, Math.min(1, t))
      best = Math.min(best, dist2D(p, { x: a.x + t * abx, z: a.z + t * abz }))
    }
    return best
  }
  if (pointDist(m.pos) > n + EPS) return false
  for (const e of baseEdgePoints(m)) if (pointDist(e) > n + EPS) return false
  return true
}

// every on-board model of the (possibly attached) target unit: both halves when a leader is attached (LEAD-004)
function targetBoardModels(state: GameState, targetUnitId: UnitId): Model[] {
  return leaderService.halves(state, targetUnitId)
    .flatMap((id) => state.units[id]?.location === 'board' ? unitModels(state, id) : [])
}

export interface LosService {
  // 00-arch §7: base centre at heights {0.2, height/2, height} plus 4 base-edge points at height/2
  samplePoints(model: Model): Vec3[]
  // R-3.1: any sample point of `to` visible from any sample point of `from`
  visible(state: GameState, fromModelId: ModelId, toModelId: ModelId): boolean
  // R-3.3
  fullyVisible(state: GameState, fromModelId: ModelId, toModelId: ModelId): boolean
  // R-3.2 / R-3.4
  unitVisible(state: GameState, fromModelId: ModelId, targetUnitId: UnitId): boolean
  unitFullyVisible(state: GameState, fromModelId: ModelId, targetUnitId: UnitId): boolean
  // R-3.11–R-3.14 for one allocated ranged attack (IGNORES COVER, Sv 3+ vs AP0 exception, cover-granting effects)
  benefitOfCover(state: GameState, targetModelId: ModelId, attackerUnitId: UnitId, weapon: RuntimeWeapon): boolean
  // R-3.8: Plunging Fire — attacker wholly within a ruin ≥6" up, target unit entirely at ground level
  plungingFire(state: GameState, attackerModelId: ModelId, targetUnitId: UnitId): boolean
}

export const losService: LosService = {
  samplePoints(model) {
    const { x, y, z } = model.pos
    const h = model.height
    const pts: Vec3[] = [{ x, y: y + 0.2, z }, { x, y: y + h / 2, z }, { x, y: y + h, z }]
    for (const e of baseEdgePoints(model, 4)) pts.push({ x: e.x, y: y + h / 2, z: e.z })
    return pts
  },
  visible(state, fromModelId, toModelId) {
    const from = state.models[fromModelId], to = state.models[toModelId]
    if (!from || !to) return false
    return anyClearPair(state, from, to)
  },
  fullyVisible(state, fromModelId, toModelId) {
    const from = state.models[fromModelId], to = state.models[toModelId]
    if (!from || !to) return false
    if (!anyClearPair(state, from, to, leaderService.halves(state, to.unitId))) return false
    if (!everyPointFullyVisible(state, from, to)) return false
    const targetImmune = hasKeyword(state, to.unitId, 'AIRCRAFT') || hasKeyword(state, to.unitId, 'TOWERING')
    if (!targetImmune && (inForest(state, to) || crossesForest(state, from, to))) return false
    return true
  },
  // R-3.2 / LEAD-004: an attached unit is one unit — a model of either half being visible makes the unit visible
  unitVisible(state, fromModelId, targetUnitId) {
    const models = targetBoardModels(state, targetUnitId)
    return models.some((m) => losService.visible(state, fromModelId, m.id))
  },
  // R-3.4 / LEAD-004: every model of both halves must be fully visible
  unitFullyVisible(state, fromModelId, targetUnitId) {
    const models = targetBoardModels(state, targetUnitId)
    return models.length > 0 && models.every((m) => losService.fullyVisible(state, fromModelId, m.id))
  },
  benefitOfCover(state, targetModelId, attackerUnitId, weapon) {
    if (weapon.kind === 'melee') return false // R-3.11: never in melee
    if (weaponService.hasAbility(weapon, 'IGNORES_COVER')) return false
    const target = state.models[targetModelId]
    if (!target) return false
    // LEAD-004/LOS-023b: an attached leader is one unit with its bodyguard — every model of both halves is an
    // "attacking model" for R-3.14's "every model of the attacking unit must fail full visibility".
    const attackers = leaderService.halves(state, attackerUnitId)
      .flatMap((id) => state.units[id]?.location === 'board' ? unitModels(state, id) : [])
    if (attackers.length === 0) return false
    const infantry = hasKeyword(state, target.unitId, 'INFANTRY')
    let cover = false
    for (const p of Object.values(state.board.pieces)) {
      // cover is granted only if THIS piece blocks the view from every attacking model (attribution, see above)
      const obstructsForEveryAttacker = () => attackers.every((a) => pieceObstructs(state, p, a, target))
      if (p.kind === 'crater') { if (infantry && whollyWithinPolygon(target, p.footprint)) cover = true }
      else if (p.kind === 'barricade') { if (infantry && wholeBaseWithinDistanceOfPolygon(target, p.footprint, 3) && obstructsForEveryAttacker()) cover = true }
      else if (p.kind === 'crate' || p.kind === 'wall') { if (obstructsForEveryAttacker()) cover = true }
      else if (p.kind === 'ruin') { if (whollyWithinPolygon(target, p.footprint) || obstructsForEveryAttacker()) cover = true }
      else if (p.kind === 'forest') {
        // LOS-027c: AIRCRAFT/TOWERING targets are never "not fully visible" merely by being seen through woods;
        // the wholly-within half of the rule still applies to them.
        const lookThroughApplies = !hasKeyword(state, target.unitId, 'AIRCRAFT') && !hasKeyword(state, target.unitId, 'TOWERING')
        if (whollyWithinPolygon(target, p.footprint)
          || (lookThroughApplies && attackers.every((a) => segmentIntersectsPolygon2D(a.pos, target.pos, p.footprint)))) cover = true
      }
    }
    if (!cover) return false
    const sv = modelStats(state, target).Sv
    if (weapon.AP === 0 && sv <= 3) return false // R-3.12
    return true
  },
  plungingFire(state, attackerModelId, targetUnitId) {
    const attacker = state.models[attackerModelId]
    if (!attacker) return false
    const whollyInRuin = Object.values(state.board.pieces).some((p) => p.kind === 'ruin' && whollyWithinPolygon(attacker, p.footprint))
    if (!whollyInRuin || attacker.pos.y < PLUNGING_FIRE_HEIGHT - EPS) return false
    // LOS-026c: "target unit entirely at ground level" covers an attached leader's models too
    const models = targetBoardModels(state, targetUnitId)
    return models.length > 0 && models.every((m) => Math.abs(m.pos.y) <= EPS)
  },
}
