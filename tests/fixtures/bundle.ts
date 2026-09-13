// Synthetic test faction data (60-testing §1): minimal datasheets so rules tests never depend on real Combat Patrol data.
// Two factions — "red" (elite, T4/Sv3+, leader + walker) and "blu" (horde, 10-model mob, 60 mm brute, FLY kopta).
// Deep-frozen; build a modified copy with `withBundle(patch)` when a test needs a variation.
import type { CombatPatrolData, DataBundle, DatasheetData, MissionData, StratagemData, WeaponData } from '../../src/data/types'

const scoring = { id: 'primary', when: 'command.end' as const, rounds: { from: 2, to: 4 }, who: 'active' as const, rule: 'holdObjectives' as const, pointsPer: 5, cap: 15 }

const weapons: WeaponData[] = [
  { id: 'red.w.gun', name: 'Gun', type: 'ranged', range: 24, A: 2, skill: 3, S: 4, AP: 0, D: 1, abilities: [{ ability: 'RAPID_FIRE', value: 1 }] },
  { id: 'red.w.pistol', name: 'Pistol', type: 'ranged', range: 12, A: 1, skill: 3, S: 4, AP: 0, D: 1, abilities: [{ ability: 'PISTOL' }] },
  { id: 'red.w.cannon', name: 'Cannon', type: 'ranged', range: 36, A: 'D6', skill: 4, S: 8, AP: -2, D: 'D3', abilities: [{ ability: 'HEAVY' }, { ability: 'BLAST' }] },
  { id: 'red.w.blade', name: 'Blade', type: 'melee', range: 0, A: 3, skill: 3, S: 4, AP: -1, D: 1, abilities: [] },
  { id: 'red.w.relic', name: 'Relic blade', type: 'melee', range: 0, A: 5, skill: 2, S: 6, AP: -2, D: 2, abilities: [] },
  { id: 'red.w.fist', name: 'Walker fist', type: 'melee', range: 0, A: 4, skill: 3, S: 10, AP: -2, D: 'D6', abilities: [] },
  { id: 'blu.w.slugga', name: 'Slugga', type: 'ranged', range: 12, A: 1, skill: 5, S: 4, AP: 0, D: 1, abilities: [{ ability: 'PISTOL' }] },
  { id: 'blu.w.choppa', name: 'Choppa', type: 'melee', range: 0, A: 3, skill: 3, S: 4, AP: -1, D: 1, abilities: [] },
  { id: 'blu.w.big-choppa', name: 'Big choppa', type: 'melee', range: 0, A: 4, skill: 2, S: 8, AP: -1, D: 2, abilities: [] },
  { id: 'blu.w.rokkit', name: 'Rokkit', type: 'ranged', range: 24, A: 'D3', skill: 5, S: 9, AP: -2, D: 3, abilities: [{ ability: 'TWIN_LINKED' }] },
  { id: 'blu.w.claws', name: 'Claws', type: 'melee', range: 0, A: 5, skill: 3, S: 7, AP: -1, D: 2, abilities: [] },
  { id: 'blu.w.spinnin-blades', name: 'Spinnin’ blades', type: 'melee', range: 0, A: 4, skill: 3, S: 5, AP: 0, D: 1, abilities: [] },
]

const datasheets: DatasheetData[] = [
  {
    id: 'red.grunts', faction: 'red', name: 'Grunt Squad', keywords: ['INFANTRY', 'BATTLELINE', 'GRUNTS'], factionKeywords: ['RED LEGION'],
    stats: { M: 6, T: 4, Sv: 3, W: 2, Ld: 6, OC: 2 },
    composition: [
      { modelId: 'sergeant', name: 'Grunt Sergeant', min: 1, max: 1, default: 1, champion: true, base: { shape: 'round', mm: 32 }, weapons: { default: ['red.w.pistol', 'red.w.gun', 'red.w.blade'] } },
      { modelId: 'grunt', name: 'Grunt', min: 4, max: 9, default: 4, base: { shape: 'round', mm: 32 }, weapons: { default: ['red.w.gun', 'red.w.blade'], options: [{ replace: ['red.w.gun'], with: ['red.w.cannon'], max: 1 }] } },
    ],
    abilities: ['red.a.grit'], coreAbilities: [], points: [{ models: 5, points: 0 }, { models: 10, points: 0 }], figure: { archetype: 'infantry', kit: 'test' },
  },
  {
    id: 'red.boss', faction: 'red', name: 'Red Boss', keywords: ['INFANTRY', 'CHARACTER', 'BOSS'], factionKeywords: ['RED LEGION'],
    stats: { M: 6, T: 4, Sv: 3, W: 5, Ld: 6, OC: 1 }, invuln: 4,
    composition: [{ modelId: 'boss', name: 'Red Boss', min: 1, max: 1, default: 1, base: { shape: 'round', mm: 40 }, weapons: { default: ['red.w.pistol', 'red.w.relic'] } }],
    abilities: ['red.a.grit', { id: 'red.a.valour', name: 'Valour', text: 'May re-roll charge rolls.', trigger: 'chargeRoll', effect: { reroll: 'all' } }],
    coreAbilities: [{ ability: 'DEEP_STRIKE' }, { ability: 'LEADER' }],
    leader: { attachTo: ['red.grunts'], effects: [{ id: 'red.a.lead', name: 'Lead', text: '+1 to hit while leading.', trigger: 'hitRoll', effect: { modifyRoll: { roll: 'hit', value: 1 } } }] },
    points: [{ models: 1, points: 0 }], figure: { archetype: 'infantry', kit: 'test' },
  },
  {
    id: 'red.walker', faction: 'red', name: 'Red Walker', keywords: ['VEHICLE', 'WALKER', 'RED WALKER'], factionKeywords: ['RED LEGION'],
    stats: { M: 8, T: 9, Sv: 2, W: 8, Ld: 6, OC: 3 }, invuln: 6,
    composition: [{ modelId: 'walker', name: 'Red Walker', min: 1, max: 1, default: 1, base: { shape: 'oval', mm: 100, mm2: 60 }, weapons: { default: ['red.w.cannon', 'red.w.fist'] } }],
    abilities: [], coreAbilities: [{ ability: 'DEADLY_DEMISE', value: 'D3' }], damaged: { threshold: 3, effect: { modifyRoll: { roll: 'hit', value: -1 } } },
    points: [{ models: 1, points: 0 }], figure: { archetype: 'vehicle', kit: 'test' },
  },
  {
    id: 'blu.mob', faction: 'blu', name: 'Blu Mob', keywords: ['INFANTRY', 'BATTLELINE', 'MOB'], factionKeywords: ['BLU HORDE'],
    stats: { M: 6, T: 5, Sv: 5, W: 1, Ld: 7, OC: 2 },
    composition: [
      { modelId: 'nob', name: 'Nob', min: 1, max: 1, default: 1, champion: true, base: { shape: 'round', mm: 32 }, statsOverride: { W: 2 }, weapons: { default: ['blu.w.slugga', 'blu.w.big-choppa'] } },
      { modelId: 'boy', name: 'Boy', min: 4, max: 19, default: 9, base: { shape: 'round', mm: 32 }, weapons: { default: ['blu.w.slugga', 'blu.w.choppa'] } },
    ],
    abilities: ['blu.a.rage'], coreAbilities: [], points: [{ models: 10, points: 0 }], figure: { archetype: 'infantry', kit: 'test' },
  },
  {
    id: 'blu.warboss', faction: 'blu', name: 'Blu Warboss', keywords: ['INFANTRY', 'CHARACTER', 'WARBOSS'], factionKeywords: ['BLU HORDE'],
    stats: { M: 6, T: 5, Sv: 4, W: 6, Ld: 6, OC: 1 },
    composition: [{ modelId: 'warboss', name: 'Blu Warboss', min: 1, max: 1, default: 1, base: { shape: 'round', mm: 40 }, weapons: { default: ['blu.w.slugga', 'blu.w.big-choppa'] } }],
    abilities: ['blu.a.rage'], coreAbilities: [{ ability: 'LEADER' }, { ability: 'DEEP_STRIKE' }],
    leader: { attachTo: ['blu.mob'], effects: [] }, points: [{ models: 1, points: 0 }], figure: { archetype: 'infantry', kit: 'test' },
  },
  {
    id: 'blu.brute', faction: 'blu', name: 'Blu Brute', keywords: ['MONSTER', 'BRUTE'], factionKeywords: ['BLU HORDE'],
    stats: { M: 8, T: 6, Sv: 4, W: 6, Ld: 7, OC: 2 },
    composition: [{ modelId: 'brute', name: 'Blu Brute', min: 1, max: 1, default: 1, base: { shape: 'round', mm: 60 }, weapons: { default: ['blu.w.claws'] } }],
    abilities: [], coreAbilities: [{ ability: 'FEEL_NO_PAIN', value: 6 }], points: [{ models: 1, points: 0 }], figure: { archetype: 'monster', kit: 'test' },
  },
  {
    id: 'blu.kopta', faction: 'blu', name: 'Blu Kopta', keywords: ['VEHICLE', 'FLY', 'KOPTA'], factionKeywords: ['BLU HORDE'],
    stats: { M: 12, T: 6, Sv: 4, W: 4, Ld: 7, OC: 0 },
    composition: [{ modelId: 'kopta', name: 'Blu Kopta', min: 1, max: 3, default: 1, base: { shape: 'oval', mm: 60, mm2: 35 }, weapons: { default: ['blu.w.rokkit', 'blu.w.spinnin-blades'] } }],
    abilities: [], coreAbilities: [], points: [{ models: 1, points: 0 }], figure: { archetype: 'vehicle', kit: 'test' },
  },
]

const stratagems: StratagemData[] = [
  { id: 'core.s.command-reroll', faction: 'core', name: 'Command Re-roll', text: 'Re-roll one roll.', cost: 1, category: 'battleTactic', phases: ['any'], window: 'any.rollMade', who: 'either', targets: [], limit: 'oncePerPhase', code: 'commandReroll' },
  { id: 'core.s.fire-overwatch', faction: 'core', name: 'Fire Overwatch', text: 'Shoot at a moving enemy; hits on 6s.', cost: 1, category: 'strategicPloy', phases: ['movement', 'charge'], window: ['movement.moveStarted', 'movement.unitMoved', 'movement.reinforcements', 'charge.moveStarted', 'charge.moveEnded'], who: 'reactive', targets: [{ role: 'unit', owner: 'friendly', count: 1 }], limit: 'oncePerTurn', code: 'fireOverwatch' },
  { id: 'red.s.hold', faction: 'red', name: 'Hold Fast', text: 'A unit on a marker keeps it.', cost: 1, category: 'strategicPloy', phases: ['command'], window: 'command.end', who: 'active', targets: [{ role: 'unit', owner: 'friendly', count: 1 }], code: 'holdFast' },
  { id: 'blu.s.smash', faction: 'blu', name: 'Smash', text: '+1 to wound in melee this phase.', cost: 1, category: 'battleTactic', phases: ['fight'], window: 'fight.targetsDeclared', who: 'either', targets: [{ role: 'unit', owner: 'friendly', state: 'selectedToFight', count: 1 }], effect: { modifyRoll: { roll: 'wound', value: 1 } }, duration: 'untilEndOfPhase' },
]

const patrols: CombatPatrolData[] = [
  {
    id: 'red.patrol', faction: 'red', name: 'Red Patrol', warlord: 'boss',
    units: [
      { ref: 'boss', datasheet: 'red.boss', size: 1, attachTo: 'grunts' },
      { ref: 'grunts', datasheet: 'red.grunts', size: 5, wargear: [{ modelId: 'grunt', count: 1, weapons: ['red.w.cannon', 'red.w.blade'] }] },
      { ref: 'walker', datasheet: 'red.walker', size: 1 },
    ],
    stratagems: ['red.s.hold'],
    enhancements: [{ id: 'red.e.sharp', default: true }, { id: 'red.e.tough', default: false }],
    secondaries: [
      { id: 'red.sec.hold', name: 'Hold the Line', text: 'Hold more markers.', default: true, scoring: [{ id: 'red.sec.hold', when: 'turn.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'holdMore', pointsPer: 5, cap: 5 }] },
      { id: 'red.sec.kill', name: 'Kill Count', text: 'Destroy units.', default: false, scoring: [{ id: 'red.sec.kill', when: 'turn.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'destroyedUnits', pointsPer: 2, cap: 6 }] },
    ],
  },
  {
    id: 'blu.patrol', faction: 'blu', name: 'Blu Patrol', warlord: 'warboss',
    units: [
      { ref: 'warboss', datasheet: 'blu.warboss', size: 1 },
      { ref: 'mob', datasheet: 'blu.mob', size: 10 },
      { ref: 'brute', datasheet: 'blu.brute', size: 1 },
      { ref: 'kopta', datasheet: 'blu.kopta', size: 1 },
    ],
    stratagems: ['blu.s.smash'],
    enhancements: [{ id: 'blu.e.big', default: true }, { id: 'blu.e.port', default: false }],
    secondaries: [
      { id: 'blu.sec.zone', name: 'Push Forward', text: 'Units in the enemy zone.', default: true, scoring: [{ id: 'blu.sec.zone', when: 'turn.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'unitsInEnemyZone', pointsPer: 3, cap: 6 }] },
      { id: 'blu.sec.kill', name: 'Krump', text: 'Destroy units.', default: false, scoring: [{ id: 'blu.sec.kill', when: 'turn.end', rounds: { from: 1, to: 5 }, who: 'active', rule: 'destroyedUnits', pointsPer: 2, cap: 6 }] },
    ],
  },
]

const mission: MissionData = {
  id: 'mission.test', name: 'Test Clash', format: 'combatPatrol', board: { w: 44, h: 30 },
  deploymentZones: {
    A: [{ x: -22, z: -15 }, { x: 22, z: -15 }, { x: 22, z: -10 }, { x: -22, z: -10 }],
    B: [{ x: -22, z: 10 }, { x: 22, z: 10 }, { x: 22, z: 15 }, { x: -22, z: 15 }],
  },
  objectives: [{ id: 'obj-w', x: -10, z: 0 }, { id: 'obj-e', x: 10, z: 0 }, { id: 'obj-n', x: 0, z: 6 }, { id: 'obj-s', x: 0, z: -6 }, { id: 'obj-home-a', x: 0, z: -12, home: 'A' }, { id: 'obj-home-b', x: 0, z: 12, home: 'B' }],
  rounds: 5, firstTurn: 'roll', scoring: [scoring], rules: [], victory: { tie: 'draw' }, terrainLayouts: ['terrain.test'],
}

export function makeBundle(): DataBundle {
  return structuredClone(build())
}

function build(): DataBundle {
  return {
    version: 'test-1',
    factions: {
      red: { id: 'red', name: 'Red Legion', factionKeyword: 'RED LEGION', armyRule: 'red.a.rule', detachments: [{ id: 'red.det', name: 'Red', rule: 'red.a.rule', stratagems: ['red.s.hold'], enhancements: ['red.e.sharp', 'red.e.tough'] }], paintScheme: { primary: '#aa0000', secondary: '#222222', trim: '#dddddd', metal: '#888888', decal: '#ffffff' }, combatPatrols: ['red.patrol'] },
      blu: { id: 'blu', name: 'Blu Horde', factionKeyword: 'BLU HORDE', armyRule: 'blu.a.rule', detachments: [{ id: 'blu.det', name: 'Blu', rule: 'blu.a.rule', stratagems: ['blu.s.smash'], enhancements: ['blu.e.big', 'blu.e.port'] }], paintScheme: { primary: '#0000aa', secondary: '#222222', trim: '#dddddd', metal: '#888888', decal: '#ffffff' }, combatPatrols: ['blu.patrol'] },
    },
    datasheets: Object.fromEntries(datasheets.map((d) => [d.id, d])),
    weapons: Object.fromEntries(weapons.map((w) => [w.id, w])),
    abilities: {
      'red.a.rule': { id: 'red.a.rule', name: 'Red Doctrine', text: 'Army rule placeholder.', trigger: 'always' },
      'blu.a.rule': { id: 'blu.a.rule', name: 'Blu Frenzy', text: 'Army rule placeholder.', trigger: 'always' },
      'red.a.grit': { id: 'red.a.grit', name: 'Grit', text: 'Re-roll hit rolls of 1.', trigger: 'hitRoll', effect: { reroll: 'ones' } },
      'blu.a.rage': { id: 'blu.a.rage', name: 'Rage', text: 'Re-roll charge rolls.', trigger: 'chargeRoll', effect: { reroll: 'all' } },
      'red.e.sharp.effect': { id: 'red.e.sharp.effect', name: 'Sharp Eye', text: '+1 to hit for the bearer.', trigger: 'hitRoll', effect: { modifyRoll: { roll: 'hit', value: 1 } }, scope: { who: 'bearer' } },
      'blu.e.port.effect': { id: 'blu.e.port.effect', name: 'Portal', text: 'A MOB unit deep strikes with the bearer.', trigger: 'deployment' },
    },
    stratagems: Object.fromEntries(stratagems.map((s) => [s.id, s])),
    enhancements: {
      'red.e.sharp': { id: 'red.e.sharp', faction: 'red', name: 'Sharp Eye', text: '+1 to hit.', cost: 0, restriction: { keyword: ['CHARACTER'] }, effect: 'red.e.sharp.effect' },
      'red.e.tough': { id: 'red.e.tough', faction: 'red', name: 'Tough Hide', text: 'Feel No Pain 6+.', cost: 0, restriction: { keyword: ['CHARACTER'] }, effect: { id: 'red.e.tough.effect', name: 'Tough Hide', text: 'FNP 6+.', trigger: 'always', effect: { feelNoPain: 6 } } },
      'blu.e.big': { id: 'blu.e.big', faction: 'blu', name: 'Big Boss', text: '+1 OC to the unit.', cost: 0, restriction: { keyword: ['CHARACTER'] }, effect: { id: 'blu.e.big.effect', name: 'Big Boss', text: '+1 OC.', trigger: 'always', effect: { modifyStat: { stat: 'OC', value: 1 } }, scope: { who: 'self' } } },
      'blu.e.port': { id: 'blu.e.port', faction: 'blu', name: 'Portal', text: 'Deep strike with a MOB.', cost: 0, restriction: { keyword: ['CHARACTER'] }, effect: 'blu.e.port.effect', choice: { unitKeyword: 'MOB' } },
    },
    patrols: Object.fromEntries(patrols.map((p) => [p.id, p])),
    missions: { 'mission.test': mission },
    terrainLayouts: {
      'terrain.test': {
        id: 'terrain.test', name: 'Test layout', board: { w: 44, h: 30 },
        pieces: [
          { id: 'ruin-1', kind: 'ruin', pos: { x: -6, z: 4 }, rot: 0, footprint: [{ x: -3, z: -3 }, { x: 3, z: -3 }, { x: 3, z: 3 }, { x: -3, z: 3 }], height: 6, traits: ['obscuring', 'cover', 'breachable'], walls: [{ a: { x: -3, z: -3 }, b: { x: 3, z: -3 }, height: 6 }], floors: [{ polygon: [{ x: -3, z: -3 }, { x: 3, z: -3 }, { x: 3, z: 3 }, { x: -3, z: 3 }], height: 3 }] },
          { id: 'crate-1', kind: 'crate', pos: { x: 5, z: -10.5 }, rot: 0, footprint: [{ x: -3, z: -1.5 }, { x: 3, z: -1.5 }, { x: 3, z: 1.5 }, { x: -3, z: 1.5 }], height: 3, traits: ['cover', 'scalable'] },
          { id: 'crater-1', kind: 'crater', pos: { x: 10, z: 4 }, rot: 0, footprint: [{ x: -2.5, z: -2.5 }, { x: 2.5, z: -2.5 }, { x: 2.5, z: 2.5 }, { x: -2.5, z: 2.5 }], height: 0.5, traits: ['cover'] },
        ],
      },
    },
  }
}

export const bundle: DataBundle = makeBundle()

// a bundle with a patch applied (deep-cloned; safe to mutate inside `patch`)
export function withBundle(patch: (b: DataBundle) => void): DataBundle {
  const b = makeBundle()
  patch(b)
  return b
}
