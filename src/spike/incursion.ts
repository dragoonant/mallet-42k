// Measurement spike: build an "Incursion-scale" game (roughly 2x the Combat Patrol model count on a 44"x60" board)
// from the normal Combat Patrol inputs, without touching the engine or the data files. Everything is derived in memory:
// every patrol roster is doubled, mission cp-01 is cloned onto the bigger board and the cp-01 terrain is copied twice.
import type { CombatPatrolData, DataBundle, MissionData, TerrainLayoutData, PatrolUnitData } from '../data/types'
import type { GameSetup } from '../engine'

export const INCURSION_BOARD = { w: 44, h: 60 } as const
export const INCURSION_MISSION_ID = 'mission.incursion-spike'
export const INCURSION_TERRAIN_ID = 'terrain.incursion-spike'
const COPY_SUFFIX = ' II'
const REF_SUFFIX = '-ii'
const SCALE_Z = INCURSION_BOARD.h / 30

/** Duplicate every unit with a unique ref. The copy's attachTo follows its own copy; its enhancement is dropped (one bearer only). */
export function doublePatrol(patrol: CombatPatrolData): CombatPatrolData {
  const copy = (u: PatrolUnitData): PatrolUnitData => {
    const { enhancement: _drop, ...rest } = u
    return {
      ...rest,
      ref: u.ref + REF_SUFFIX,
      ...(u.attachTo ? { attachTo: u.attachTo + REF_SUFFIX } : {}),
      ...(u.patrolSquads ? { patrolSquads: u.patrolSquads.map((p) => ({ ...p, ref: p.ref + REF_SUFFIX })) } : {}),
    }
  }
  return { ...patrol, name: patrol.name + COPY_SUFFIX, units: [...patrol.units, ...patrol.units.map(copy)] }
}

function incursionMission(base: MissionData): MissionData {
  const sz = (p: { x: number; z: number }) => ({ x: p.x, z: p.z * SCALE_Z })
  return {
    ...base,
    id: INCURSION_MISSION_ID,
    name: base.name + ' (Incursion spike)',
    format: 'incursion',
    board: { ...INCURSION_BOARD },
    deploymentZones: { A: base.deploymentZones.A.map(sz), B: base.deploymentZones.B.map(sz) },
    objectives: base.objectives.map((o) => ({ ...o, z: o.z * SCALE_Z })),
    terrainLayouts: [INCURSION_TERRAIN_ID],
  }
}

/** Two copies of the layout: one shifted -15" and one +15" in z, so the 44x30 footprint tiles the 44x60 board. */
function incursionTerrain(base: TerrainLayoutData): TerrainLayoutData {
  const half = INCURSION_BOARD.h / 4
  const shifted = (dz: number, tag: string) => base.pieces.map((p) => ({ ...p, id: p.id + tag, pos: { x: p.pos.x, z: p.pos.z + dz } }))
  return { ...base, id: INCURSION_TERRAIN_ID, board: { ...INCURSION_BOARD }, pieces: [...shifted(-half, '-s'), ...shifted(half, '-n')] }
}

function attachmentsOf(patrol: CombatPatrolData) {
  return patrol.units.filter((u) => u.attachTo).map((u) => ({ leaderRef: u.ref, bodyguardRef: u.attachTo as string }))
}

/** Returns a derived bundle and setup; the inputs are not mutated. `setup.players.*.patrolId` keeps its id (the doubled roster replaces it in the derived bundle). */
export function toIncursion(bundle: DataBundle, setup: GameSetup): { bundle: DataBundle; setup: GameSetup } {
  const baseMission = bundle.missions['mission.cp-01']
  const baseTerrain = bundle.terrainLayouts['terrain.cp-01']
  if (!baseMission || !baseTerrain) throw new Error('incursion spike: mission.cp-01 / terrain.cp-01 missing')
  const patrols = { ...bundle.patrols }
  const players = { ...setup.players }
  for (const seat of ['A', 'B'] as const) {
    const id = setup.players[seat].patrolId
    patrols[id] = doublePatrol(bundle.patrols[id])
    // split squads / reserves name original refs only; attachments cover both copies
    players[seat] = { ...setup.players[seat], attachments: attachmentsOf(patrols[id]), splitUnits: undefined }
  }
  return {
    bundle: {
      ...bundle,
      patrols,
      missions: { ...bundle.missions, [INCURSION_MISSION_ID]: incursionMission(baseMission) },
      terrainLayouts: { ...bundle.terrainLayouts, [INCURSION_TERRAIN_ID]: incursionTerrain(baseTerrain) },
    },
    setup: { ...setup, missionId: INCURSION_MISSION_ID, terrainLayoutId: INCURSION_TERRAIN_ID, players },
  }
}
