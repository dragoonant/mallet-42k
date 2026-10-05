// Pre-battle sequence (10-rules §13): phase 'setup' (P4 sides) and phase 'deployment' (P6 deploy, P7 first turn, P8 Scouts).
// Owner: W1-F.
import { basesOverlap, checkPlacements, emptyMoveConstraints, horizontalGap, whollyWithinPolygon, type Footprint, type ResolvedPlacement } from './geometry'
import type { EngineContext, PhaseModule } from './modules'
import { otherPlayer } from './modules'
import { assignSides, boardModelsOf, deploymentZone, hasCoreAbility, unitModels, setModelPos } from './state'
import type { Action, DeployUnitAction, ModelPlacement } from './actions'
import type {
  DeployUnitDecision, GameState, Model, MoveConstraints, PendingDecision, PlayerId, Polygon, Rejection, Unit, UnitId, Vec3,
} from './types'

// R-1.4: each player rolls 1D6, higher wins, ties re-roll; never modified or re-rolled
export function rollOff(ctx: EngineContext, purpose: 'rollOff' | 'firstTurn' = 'rollOff'): PlayerId {
  for (let i = 0; i < 1000; i++) {
    const a = ctx.roll({ purpose, player: 'A', commandRerollable: false }).dice[0]
    const b = ctx.roll({ purpose, player: 'B', commandRerollable: false }).dice[0]
    if (a !== b) return a > b ? 'A' : 'B'
  }
  throw new Error('rollOff: no winner after 1000 rounds')
}

function sidesChosen(state: GameState): boolean { return state.players.A.side !== null }

// CP-1.9 / R-5.14: a unit set aside for Reserves at Declare Battle Formations never gets a deployUnit decision here —
// it stays `location: 'reserves'` and arrives later via the Movement phase's `reinforcements` window (movement.ts).
function canDeepStrike(state: GameState, unit: Unit): boolean {
  const ds = state.datasheets[unit.datasheetId]
  return ds.coreAbilities.some((c) => c.ability === 'DEEP_STRIKE') || unit.deepStrikeWith !== null
}

// MISSION-027-attached (R-10.1): an attached Leader has no drop of its own — it deploys as part of its bodyguard's
// single deployUnit answer. `combo*` below treats the bodyguard's decision as covering both units' models.
function comboUnits(state: GameState, unit: Unit): Unit[] {
  return unit.attachedLeaderId ? [unit, state.units[unit.attachedLeaderId]] : [unit]
}
function comboModels(state: GameState, unit: Unit): Model[] {
  return comboUnits(state, unit).flatMap((u) => unitModels(state, u.id))
}
function comboCanDeepStrike(state: GameState, unit: Unit): boolean {
  return comboUnits(state, unit).every((u) => canDeepStrike(state, u))
}

// ---------- Infiltrators (R-10.7) ----------
function comboInfiltrates(state: GameState, unit: Unit): boolean {
  return comboUnits(state, unit).every((u) => hasCoreAbility(state, u.id, 'INFILTRATORS'))
}

// an Infiltrators unit may instead be set up anywhere wholly on the battlefield more than 9" horizontally from the enemy
// deployment zone and from every enemy model (R-10.7). The zone is grown by 9" as a bounding rectangle (exact for the
// rectangular Combat Patrol zones); minDistanceFromEnemies covers the models.
function infiltratorConstraints(state: GameState, player: PlayerId): MoveConstraints {
  const dz = deploymentZone(state, otherPlayer(player))
  const r = 9 + 1e-3
  const xs = dz.map((p) => p.x), zs = dz.map((p) => p.z)
  const x0 = Math.min(...xs) - r, x1 = Math.max(...xs) + r, z0 = Math.min(...zs) - r, z1 = Math.max(...zs) + r
  return emptyMoveConstraints(1e9, {
    region: null, mustEndOutsideEngagement: false, minDistanceFromEnemies: 9,
    forbidden: [[{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]],
  })
}

// ---------- Patrol Squads (Tyranid Termagants) ----------
// keeps `unitId` for the first sizes[0] models and moves the rest into new units `${unitId}~a`, `~b`, … (sizes[i] models each);
// every unit gets startingStrength = its size. Only legal while the unit is still in Reserves-to-be-deployed (before setup).
// Returns the ids in order. A size list that does not add up to the unit's model count leaves the unit untouched ([unitId]).
export function splitPatrolSquad(state: GameState, unitId: UnitId, sizes: number[]): UnitId[] {
  const unit = state.units[unitId]
  if (!unit || sizes.length < 2 || sizes.some((n) => n < 1) || sizes.reduce((a, b) => a + b, 0) !== unit.models.length) return [unitId]
  const ids: UnitId[] = [unitId]
  const all = [...unit.models]
  unit.models = all.slice(0, sizes[0])
  unit.startingStrength = sizes[0]
  let at = sizes[0]
  for (let i = 1; i < sizes.length; i++) {
    const id: UnitId = `${unitId}~${String.fromCharCode(96 + i)}`
    const mine = all.slice(at, at + sizes[i])
    at += sizes[i]
    const copy: Unit = structuredClone(unit)
    copy.id = id
    copy.ref = `${unit.ref}~${String.fromCharCode(96 + i)}`
    copy.models = mine
    copy.startingStrength = sizes[i]
    copy.isWarlord = false
    copy.enhancementId = null
    copy.attachedLeaderId = null
    copy.bodyguardUnitId = null
    copy.destroyedModels = []
    copy.effects = []
    for (const mid of mine) state.models[mid].unitId = id
    state.units[id] = copy
    ids.push(id)
  }
  return ids
}

// units of the player with a patrolSquads ability that have not been offered the split yet
function squadCandidates(state: GameState, player: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => {
    if (u.player !== player || u.location !== 'reserves' || u.ref.includes('~')) return false
    if (state.phaseState.marks.includes(`squads:${u.id}`)) return false
    const ds = state.datasheets[u.datasheetId]
    return ds.abilities.some((a) => state.abilities[a]?.code === 'patrolSquads')
  })
}
function squadSizes(state: GameState, unit: Unit): number[] | null {
  const ds = state.datasheets[unit.datasheetId]
  for (const a of ds.abilities) {
    const ab = state.abilities[a]
    if (ab?.code === 'patrolSquads' && Array.isArray(ab.params?.sizes)) {
      const sizes = (ab.params!.sizes as unknown[]).map(Number)
      if (sizes.reduce((x, y) => x + y, 0) === unit.models.length) return sizes
    }
  }
  return null
}

// MISSION-027-reserves: mark that a unit's deployment decision (board placement or Reserves) has been resolved, so it
// is never offered again and always counts toward the alternation below — independent of its final `location`, which
// for a Reserves choice stays 'reserves' forever (or until the Movement phase's `reinforcements` window fills it in).
function dropMark(unitId: UnitId): string { return `deployDrop:${unitId}` }
function hasDropped(state: GameState, unitId: UnitId): boolean { return state.phaseState.marks.includes(dropMark(unitId)) }
function markDropped(state: GameState, unitId: UnitId): void {
  if (!hasDropped(state, unitId)) state.phaseState.marks.push(dropMark(unitId))
}
// unitId format is always "<player>:<ref>", so a prefix match also scopes the count to `player`
function dropsCount(state: GameState, player: PlayerId): number {
  const prefix = `deployDrop:${player}:`
  return state.phaseState.marks.filter((m) => m.startsWith(prefix)).length
}

function remainingToDeploy(state: GameState, player: PlayerId): UnitId[] {
  const reservedRefs = new Set(state.setup.players[player].reserves)
  return Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'reserves' && !reservedRefs.has(u.ref) && !u.bodyguardUnitId && !hasDropped(state, u.id))
    .map((u) => u.id)
}

// CP-1.10: alternate one drop at a time, Defender first; when one side runs out the other deploys the rest.
function deploymentTurnPlayer(state: GameState): PlayerId | null {
  const defender: PlayerId = state.players.A.side === 'defender' ? 'A' : 'B'
  const attacker = otherPlayer(defender)
  const remD = remainingToDeploy(state, defender).length
  const remA = remainingToDeploy(state, attacker).length
  if (remD === 0 && remA === 0) return null
  if (remD === 0) return attacker
  if (remA === 0) return defender
  const deployedD = dropsCount(state, defender)
  const deployedA = dropsCount(state, attacker)
  return deployedD <= deployedA ? defender : attacker
}

// shared by validate() and handle(): resolves + checks a deployUnit answer without mutating state
function resolveDeploy(
  state: GameState, action: DeployUnitAction, pending: DeployUnitDecision,
): { rejection: Rejection } | { rejection: null; toReserves: true } | { rejection: null; toReserves: false; resolved: ResolvedPlacement[] } {
  if (!pending.context.unitIds.includes(action.unitId)) {
    return { rejection: { code: 'E_INVALID_TARGET', reason: `it is not ${pending.player}'s turn to deploy ${action.unitId}`, details: { unitId: action.unitId } } }
  }
  const unit = state.units[action.unitId]
  if (!unit) return { rejection: { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` } }
  if (action.toReserves) {
    if (!comboCanDeepStrike(state, unit)) return { rejection: { code: 'E_INVALID_TARGET', reason: `${unit.ref} cannot go to Reserves (no Deep Strike)` } }
    return { rejection: null, toReserves: true }
  }
  const placements: ModelPlacement[] = action.placements
  const check = (constraints: MoveConstraints) => checkPlacements({
    unitModels: comboModels(state, unit),
    placements,
    constraints,
    otherFriendly: boardModelsOf(state, pending.player),
    enemies: boardModelsOf(state, otherPlayer(pending.player)),
    board: state.board,
  })
  let result = check(pending.constraints)
  // R-10.7 Infiltrators: a unit that cannot be set up in its own zone may use the wider infiltration area instead
  if (result.rejection && pending.context.infiltrators.includes(unit.id)) {
    const alt = check(infiltratorConstraints(state, pending.player))
    if (!alt.rejection) result = alt
  }
  if (result.rejection) return { rejection: result.rejection }
  return { rejection: null, toReserves: false, resolved: result.resolved }
}

// facing for a freshly deployed model: from the zone's centre toward the board centre (the origin), snapped to an axis,
// so a deployed unit looks across the board at the enemy rather than keeping the default facing 0
export function deployFacing(zone: Polygon): number {
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2
  if (Math.abs(cx) >= Math.abs(cz)) return cx > 0 ? Math.PI : 0
  return cz > 0 ? -Math.PI / 2 : Math.PI / 2
}

// a simple, always-legal placement for `unitId`'s models wholly within `zone` and clear of everything already placed —
// used by legalActions() so a generic Decider (AI, autoplay tests) can drive deployUnit without solving placement
// itself; returns null only if the zone genuinely has no room left (raster scan of its bounding box)
export function autoDeployPlacements(
  models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[],
  opts: { mustTouch?: MoveConstraints['mustTouch']; minDistanceFromEnemies?: number; canPlace?: (model: Model, pos: Vec3) => boolean } = {},
): ModelPlacement[] | null {
  if (opts.mustTouch) return touchingPlacements(models, zone, otherFriendly, enemies, opts.mustTouch, opts.minDistanceFromEnemies ?? 0, opts.canPlace)
  const facing = deployFacing(zone)
  // a small inward safety pad keeps candidates well clear of the zone/board edge, avoiding floating-point boundary
  // ambiguity in pointInPolygon (exact edge points are not reliably "inside" under ray-casting)
  const pad = 0.05
  const minX = Math.min(...zone.map((p) => p.x)) + pad, maxX = Math.max(...zone.map((p) => p.x)) - pad
  const minZ = Math.min(...zone.map((p) => p.z)) + pad, maxZ = Math.max(...zone.map((p) => p.z)) - pad
  const placedHere: Footprint[] = []
  const out: ModelPlacement[] = []
  for (const m of models) {
    const step = Math.max(0.5, m.base.radius * 2 + 0.1)
    let found: { x: number; z: number; facing: number } | null = null
    // an oval base is narrower than its long radius: scan with the short radius and also try it turned a quarter, whollyWithinPolygon
    // below decides the fit (a 150x90 mm Rockgrinder does not fit a 5" deep zone broadside but does lengthways)
    const rScan = Math.min(m.base.radius, m.base.radius2 ?? m.base.radius)
    const facings = m.base.radius2 !== undefined ? [facing, facing + Math.PI / 2] : [facing]
    const stepZ = m.base.radius2 !== undefined ? 0.5 : step // a coarse row step would skip the gap beside a packed row of smaller models
    for (const f of facings) {
      for (let z = minZ + rScan; z <= maxZ - rScan + 1e-9 && !found; z += stepZ) {
        for (let x = minX + rScan; x <= maxX - rScan + 1e-9 && !found; x += step) {
          const cand: Footprint = { pos: { x, y: 0, z }, facing: f, base: m.base }
          if (!whollyWithinPolygon(cand, zone)) continue
          if (placedHere.some((o) => basesOverlap(cand, o)) || otherFriendly.some((o) => basesOverlap(cand, o)) || enemies.some((o) => basesOverlap(cand, o))) continue
          found = { x, z, facing: f }
        }
      }
      if (found) break
    }
    if (!found) return null
    const footprint: Footprint = { pos: { x: found.x, y: 0, z: found.z }, facing: found.facing, base: m.base }
    placedHere.push(footprint)
    out.push({ modelId: m.id, pos: footprint.pos, facing: found.facing })
  }
  return out
}

// Cult Ambush (GEN-2.3) placement: the first model sits tangent to the marker (tried at 24 angles), the rest grow into a
// compact blob around it, nearest the marker first (so coherency holds); every spot is wholly in `zone`, clear of everything
// placed and more than `minEnemy`" from enemy models. null = no angle works.
function touchingPlacements(
  models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[], marker: NonNullable<MoveConstraints['mustTouch']>, minEnemy: number,
  canPlace?: (model: Model, pos: Vec3) => boolean,
): ModelPlacement[] | null {
  if (models.length === 0) return null
  const facing = deployFacing(zone)
  const blockers: Footprint[] = [...otherFriendly, ...enemies]
  const rOf = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? 0)
  const free = (c: Footprint, mine: Footprint[], m: Model): boolean =>
    whollyWithinPolygon(c, zone) && !mine.some((o) => basesOverlap(c, o)) && !blockers.some((o) => basesOverlap(c, o))
    && (!canPlace || canPlace(m, c.pos)) && (minEnemy <= 0 || !enemies.some((e) => horizontalGap(c, e) <= minEnemy + 1e-3))
  const dist2 = (a: { x: number; z: number }): number => Math.hypot(a.x - marker.pos.x, a.z - marker.pos.z)
  for (let k = 0; k < 24; k++) {
    const a0 = (k * 2 * Math.PI) / 24
    const d0 = marker.radius + rOf(models[0]) + 0.02
    const first: Footprint = { pos: { x: marker.pos.x + Math.cos(a0) * d0, y: 0, z: marker.pos.z + Math.sin(a0) * d0 }, facing, base: models[0].base }
    if (!free(first, [], models[0])) continue
    const mine: Footprint[] = [first]
    let ok = true
    for (let i = 1; i < models.length && ok; i++) {
      let best: Footprint | null = null
      let bestD = Infinity
      for (const anchor of mine) {
        const ar = Math.max(anchor.base.radius, anchor.base.radius2 ?? 0)
        const dd = ar + rOf(models[i]) + 0.05
        for (let a = 0; a < 24; a++) {
          const ang = (a * 2 * Math.PI) / 24
          const cand: Footprint = { pos: { x: anchor.pos.x + Math.cos(ang) * dd, y: 0, z: anchor.pos.z + Math.sin(ang) * dd }, facing, base: models[i].base }
          const d = dist2(cand.pos)
          if (d < bestD && free(cand, mine, models[i])) { best = cand; bestD = d }
        }
      }
      if (!best) ok = false
      else mine.push(best)
    }
    if (ok) return models.map((m, i) => ({ modelId: m.id, pos: mine[i].pos, facing }))
  }
  return null
}

// last-resort placement search for crowded or shallow zones: start each model chain at a fine grid spot, then grow the unit
// outward from already-placed models (rings of candidate spots a hair apart), so lines, zig-zags and diagonals are all reachable.
// Returns the first chain the caller's check accepts (the caller runs the real validation: coherency, overlaps, region).
export function chainDeployPlacements(
  models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[], accept: (p: ModelPlacement[]) => boolean,
): ModelPlacement[] | null {
  if (models.length === 0) return null
  const facing = deployFacing(zone)
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const blockers: Footprint[] = [...otherFriendly, ...enemies]
  const free = (c: Footprint, mine: Footprint[]): boolean =>
    whollyWithinPolygon(c, zone) && !mine.some((o) => basesOverlap(c, o)) && !blockers.some((o) => basesOverlap(c, o))
  const rOf = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? 0)
  const angles: number[] = []
  for (let a = 0; a < 360; a += 10) angles.push((a * Math.PI) / 180)
  for (let z = minZ; z <= maxZ + 1e-9; z += 0.5) {
    for (let x = minX; x <= maxX + 1e-9; x += 0.5) {
      const first: Footprint = { pos: { x, y: 0, z }, facing, base: models[0].base }
      if (!free(first, [])) continue
      const mine: Footprint[] = [first]
      let ok = true
      for (let i = 1; i < models.length && ok; i++) {
        let placed: Footprint | null = null
        // prefer the latest-placed models as anchors so the unit snakes along the zone
        for (let k = mine.length - 1; k >= 0 && !placed; k--) {
          const anchor = mine[k]
          const anchorR = Math.max(anchor.base.radius, anchor.base.radius2 ?? 0)
          for (const extra of [0.05, 0.5, 1.2]) {
            const dist = anchorR + rOf(models[i]) + extra
            for (const a of angles) {
              const cand: Footprint = { pos: { x: anchor.pos.x + Math.cos(a) * dist, y: 0, z: anchor.pos.z + Math.sin(a) * dist }, facing, base: models[i].base }
              if (free(cand, mine)) { placed = cand; break }
            }
            if (placed) break
          }
        }
        if (!placed) ok = false
        else mine.push(placed)
      }
      if (!ok) continue
      const out = mine.map((f, i) => ({ modelId: models[i].id, pos: f.pos, facing }))
      if (accept(out)) return out
    }
  }
  return null
}

export const setupModule: PhaseModule = {
  name: 'setup',

  enter(ctx) {
    ctx.state.step = ctx.state.phase === 'setup' ? 'rollOffSides' : 'deploy'
  },

  advance(ctx) {
    const s = ctx.state
    for (;;) {
      switch (s.step) {
        // ---- phase 'setup' ----
        case 'rollOffSides': {
          if (sidesChosen(s)) return 'done'
          const winner = rollOff(ctx)
          s.step = 'chooseSides'
          ctx.decide({
            kind: 'chooseOption', player: winner, window: 'deployment.unit', canPass: false,
            context: { topic: 'chooseSide', unitId: null, abilityId: null, data: { winner } },
            options: [
              { id: 'attacker', label: 'Attacker', action: { type: 'chooseOption', player: winner, decisionId: '', optionId: 'attacker' } },
              { id: 'defender', label: 'Defender', action: { type: 'chooseOption', player: winner, decisionId: '', optionId: 'defender' } },
            ],
          })
          return 'pending'
        }
        case 'chooseSides':
          return sidesChosen(s) ? 'done' : 'pending'
        // ---- phase 'deployment' ----
        case 'deploy': {
          // Declare Battle Formations (Tyranid Patrol Squads): before any unit is set up, offer each owner the split
          for (const owner of ['A', 'B'] as PlayerId[]) {
            const unit = squadCandidates(s, owner)[0]
            if (!unit) continue
            const sizes = squadSizes(s, unit)
            s.phaseState.marks.push(`squads:${unit.id}`)
            if (!sizes) continue
            ctx.decide({
              kind: 'chooseOption', player: owner, window: 'deployment.unit', canPass: false,
              context: { topic: 'other', unitId: unit.id, abilityId: null, data: { choice: 'patrolSquads', sizes } },
              options: [
                { id: 'keep', label: `Keep ${unit.name} as one unit of ${unit.models.length}`, action: { type: 'chooseOption', player: owner, decisionId: '', optionId: 'keep' } },
                { id: 'split', label: `Split ${unit.name} into units of ${sizes.join(' and ')}`, action: { type: 'chooseOption', player: owner, decisionId: '', optionId: 'split' } },
              ],
            })
            return 'pending'
          }
          const pid = deploymentTurnPlayer(s)
          if (pid === null) { s.step = 'rollOffFirstTurn'; continue }
          const unitIds = remainingToDeploy(s, pid)
          ctx.decide({
            kind: 'deployUnit', player: pid, window: 'deployment.unit', canPass: false,
            context: { unitIds, zone: deploymentZone(s, pid), infiltrators: unitIds.filter((id) => comboInfiltrates(s, s.units[id])), reservesAllowed: unitIds.filter((id) => comboCanDeepStrike(s, s.units[id])) },
            constraints: emptyMoveConstraints(1e9, { region: deploymentZone(s, pid), mustEndOutsideEngagement: false }),
          })
          return 'pending'
        }
        case 'rollOffFirstTurn': {
          if (s.setup.firstTurn !== 'rollOff') {
            s.firstPlayer = s.setup.firstTurn
          } else if (s.mission.data.firstTurn === 'attackerChoice') {
            const attacker: PlayerId = s.players.A.side === 'attacker' ? 'A' : 'B'
            const mark = s.phaseState.marks.find((m) => m.startsWith('firstTurnChoice:'))
            if (!mark) {
              ctx.decide({
                kind: 'chooseOption', player: attacker, window: 'deployment.unit', canPass: false,
                context: { topic: 'other', unitId: null, abilityId: null, data: { choice: 'firstTurn' } },
                options: [
                  { id: 'self', label: 'Take the first turn', action: { type: 'chooseOption', player: attacker, decisionId: '', optionId: 'self' } },
                  { id: 'opponent', label: 'Give the first turn to the opponent', action: { type: 'chooseOption', player: attacker, decisionId: '', optionId: 'opponent' } },
                ],
              })
              return 'pending'
            }
            const chosen = mark.slice('firstTurnChoice:'.length) as PlayerId
            s.firstPlayer = chosen
          } else {
            s.firstPlayer = rollOff(ctx, 'firstTurn')
          }
          s.activePlayer = s.firstPlayer
          ctx.emit({ type: 'FirstTurnChosen', first: s.firstPlayer, player: s.firstPlayer })
          s.step = 'preBattle'
          continue
        }
        case 'preBattle': {
          // R-10.8: units with Scouts may make a pre-battle Normal move (up to their Scouts value), alternating one
          // unit at a time from the first-turn player (CP-1.10-style alternation, MISSION-028-scouts) — not just all
          // of the first player's Scouts units before any of the second's. Not present in current Combat Patrol
          // rosters, so this path is exercised only by synthetic tests, but is implemented fully for spec fidelity.
          const scoutable = (pid: PlayerId): Unit[] => Object.values(s.units).filter((unit) => {
            if (unit.player !== pid || unit.location !== 'board') return false
            const ds = s.datasheets[unit.datasheetId]
            if (!ds.coreAbilities.some((c) => c.ability === 'SCOUTS')) return false
            return !s.phaseState.marks.includes(`scouted:${unit.id}`)
          })
          const first = s.firstPlayer
          const second = otherPlayer(first)
          const remFirst = scoutable(first)
          const remSecond = scoutable(second)
          if (remFirst.length === 0 && remSecond.length === 0) return 'done'
          const doneCount = (pid: PlayerId): number => s.phaseState.marks.filter((m) => m.startsWith(`scouted:${pid}:`)).length
          const pid = remFirst.length === 0 ? second : remSecond.length === 0 ? first : (doneCount(first) <= doneCount(second) ? first : second)
          const unit = (pid === first ? remFirst : remSecond)[0]
          const ds = s.datasheets[unit.datasheetId]
          const scouts = ds.coreAbilities.find((c) => c.ability === 'SCOUTS')!
          s.phaseState.marks.push(`scouted:${unit.id}`)
          const dist = typeof scouts.value === 'number' ? scouts.value : 9
          ctx.decide({
            kind: 'moveUnit', player: pid, window: 'deployment.unit', canPass: true,
            context: { unitId: unit.id, moveType: 'normal', advanceRoll: null },
            constraints: emptyMoveConstraints(dist, { mustEndOutsideEngagement: true }),
          })
          return 'pending'
        }
        default:
          return 'done'
      }
    }
  },

  validate(state, action, pending) {
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const r = resolveDeploy(state, action, pending)
      return r.rejection
    }
    if (pending.kind === 'moveUnit' && action.type === 'moveUnit') {
      const unit = state.units[action.unitId]
      if (!unit) return { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` }
      const result = checkPlacements({
        unitModels: unitModels(state, unit.id),
        placements: action.placements,
        constraints: pending.constraints,
        otherFriendly: boardModelsOf(state, pending.player),
        enemies: boardModelsOf(state, otherPlayer(pending.player)),
        board: state.board,
      })
      return result.rejection
    }
    return null
  },

  legalActions(state, pending) {
    if (pending.kind === 'deployUnit') {
      const unitId = pending.context.unitIds[0]
      if (!unitId) return []
      const models = comboModels(state, state.units[unitId])
      const zone = pending.constraints.region ?? deploymentZone(state, pending.player)
      const mk = (placements: ModelPlacement[]): DeployUnitAction => ({ type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId, placements })
      const placements = autoDeployPlacements(models, zone, boardModelsOf(state, pending.player), boardModelsOf(state, otherPlayer(pending.player)))
      if (placements) {
        const action = mk(placements)
        if (resolveDeploy(state, action, pending).rejection === null) return [action]
      }
      // W1-G: the raster scan can wrap a unit across a row gap left by earlier drops (out of coherency) — fall back to
      // a compact square block slid across the zone, accepting the first one the real validation accepts
      if (models.length === 0) return comboCanDeepStrike(state, state.units[unitId]) ? [{ ...mk([]), toReserves: true }] : []
      const rad = Math.max(...models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
      const spacing = 2 * rad + 0.2
      const minX = Math.min(...zone.map((p) => p.x)), maxX = Math.max(...zone.map((p) => p.x))
      const minZ = Math.min(...zone.map((p) => p.z)), maxZ = Math.max(...zone.map((p) => p.z))
      const facing = deployFacing(zone)
      // M10: a square block is too deep for a 5" zone once the unit is 11 models (Overlord + 10 Warriors); widen the block
      // (more columns, fewer rows) until the real validation accepts one
      for (let cols = Math.ceil(Math.sqrt(models.length)); cols <= models.length; cols++) {
        for (let z0 = minZ + rad + 0.1; z0 < maxZ; z0 += 1) {
          for (let x0 = minX + rad + 0.1; x0 < maxX; x0 += 1) {
            const action = mk(models.map((m, i) => ({ modelId: m.id, pos: { x: x0 + (i % cols) * spacing, y: 0, z: z0 + Math.floor(i / cols) * spacing }, facing })))
            if (resolveDeploy(state, action, pending).rejection === null) return [action]
          }
        }
      }
      // shallow or crowded zone: grow the unit model-by-model from fine-grid starts (lines, zig-zags, diagonals)
      const chained = chainDeployPlacements(models, zone, boardModelsOf(state, pending.player), boardModelsOf(state, otherPlayer(pending.player)),
        (p) => resolveDeploy(state, mk(p), pending).rejection === null)
      if (chained) return [mk(chained)]
      // truly no room on the board: a Deep Strike unit may be held in Reserves instead
      if (comboCanDeepStrike(state, state.units[unitId])) return [{ ...mk([]), toReserves: true }]
      return []
    }
    if (pending.kind === 'moveUnit') {
      // Scouts moves are optional and not exercised by current data; offer "stay put" so generic Deciders can pass
      return pending.canPass ? [{ type: 'pass', player: pending.player, decisionId: pending.id }] : []
    }
    // chooseSide / attackerChoice first-turn pick: same shape as the reducer's own default (finite `options`)
    if ('options' in pending && Array.isArray(pending.options)) {
      const out: Action[] = pending.options.map((o) => o.action)
      if (pending.canPass) out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
      return out
    }
    return null
  },

  handle(ctx, action, pending) {
    const s = ctx.state
    if (pending.kind === 'chooseOption' && pending.context.topic === 'chooseSide' && action.type === 'chooseOption') {
      const attacker = action.optionId === 'attacker' ? pending.player : otherPlayer(pending.player)
      assignSides(s, attacker)
      ctx.emit({ type: 'SidesChosen', attacker, defender: otherPlayer(attacker), player: pending.player })
      return
    }
    if (pending.kind === 'chooseOption' && pending.context.topic === 'other' && (pending.context.data as { choice?: string }).choice === 'firstTurn' && action.type === 'chooseOption') {
      const chosen: PlayerId = action.optionId === 'self' ? pending.player : otherPlayer(pending.player)
      s.phaseState.marks.push(`firstTurnChoice:${chosen}`)
      return
    }
    if (pending.kind === 'chooseOption' && pending.context.topic === 'other' && (pending.context.data as { choice?: string }).choice === 'patrolSquads' && action.type === 'chooseOption') {
      if (action.optionId === 'split' && pending.context.unitId) {
        const sizes = ((pending.context.data as { sizes?: number[] }).sizes ?? []).map(Number)
        const ids = splitPatrolSquad(s, pending.context.unitId, sizes)
        for (const id of ids) s.phaseState.marks.push(`squads:${id}`)
        ctx.emit({ type: 'AbilityTriggered', abilityId: 'tyr.a.patrol-squads', sourceUnitId: pending.context.unitId, targetUnitId: null, summary: `split into ${ids.join(', ')}`, player: pending.player })
      }
      return
    }
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const r = resolveDeploy(s, action, pending)
      if (r.rejection) return r.rejection
      const unit = s.units[action.unitId]
      markDropped(s, unit.id)
      if (r.toReserves) {
        ctx.emit({ type: 'UnitDeployed', unitId: unit.id, toReserves: true, player: pending.player })
        return
      }
      for (const p of r.resolved) setModelPos(p.model, p.to, p.facing)
      for (const u of comboUnits(s, unit)) u.location = 'board'
      ctx.emit({ type: 'UnitDeployed', unitId: unit.id, toReserves: false, player: pending.player })
      return
    }
    if (pending.kind === 'moveUnit' && action.type === 'moveUnit') {
      const unit = s.units[action.unitId]
      if (!unit) return { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` }
      const result = checkPlacements({
        unitModels: unitModels(s, unit.id),
        placements: action.placements,
        constraints: pending.constraints,
        otherFriendly: boardModelsOf(s, pending.player),
        enemies: boardModelsOf(s, otherPlayer(pending.player)),
        board: s.board,
      })
      if (result.rejection) return result.rejection
      const paths: Record<string, ResolvedPlacement['path']> = {}
      for (const p of result.resolved) { setModelPos(p.model, p.to, p.facing); paths[p.model.id] = p.path }
      ctx.emit({ type: 'UnitMoved', unitId: unit.id, moveType: 'scouts', paths })
      return
    }
    if (pending.kind === 'moveUnit' && action.type === 'pass') return
    return { code: 'E_NOT_AN_OPTION', reason: `setup: no handler for ${action.type} at step ${s.step}` }
  },
}
