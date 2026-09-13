// All JSON Schemas (2020-12) for ajv registration by $id; copied from docs/spec/schemas.
import common from './common.schema.json'
import ability from './ability.schema.json'
import weapon from './weapon.schema.json'
import datasheet from './datasheet.schema.json'
import stratagem from './stratagem.schema.json'
import enhancement from './enhancement.schema.json'
import faction from './faction.schema.json'
import combatPatrol from './combat-patrol.schema.json'
import mission from './mission.schema.json'
import terrainLayout from './terrain-layout.schema.json'

export const schemas = {
  common, ability, weapon, datasheet, stratagem, enhancement, faction, combatPatrol, mission, terrainLayout,
} as const

export type SchemaName = keyof typeof schemas
