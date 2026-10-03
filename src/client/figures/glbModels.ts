// Which model types may render from a pre-made GLB (public/assets/models/<slug>.glb) instead of the
// procedural figure. Key = `<datasheet id>/<datasheet modelId>` (Model.datasheetModelId in the engine
// state, composition[].modelId in the datasheet JSON). Value = slug = GLB file name without ".glb".
//
// TO ENABLE A MODEL: drop <slug>.glb into public/assets/models/ and add the slug to ENABLED_GLB_SLUGS.
// Nothing else changes. Slugs not listed there are never requested and keep the procedural figure.
export const ENABLED_GLB_SLUGS: readonly string[] = [
  'captain-octavius',
  'librarian-tantus',
  'infernus-sergeant',
  'infernus-marine',
  'terminator-sergeant',
  'terminator',
  'warboss-gordrang',
  'boss-nob',
  'boy',
  'deff-dread',
  'deffkopta',
]

export const GLB_SLUG_BY_MODEL: Readonly<Record<string, string>> = {
  'sm.captain-octavius/captain': 'captain-octavius',
  'sm.librarian-tantus/librarian': 'librarian-tantus',
  'sm.infernus-squad/sergeant': 'infernus-sergeant',
  'sm.infernus-squad/marine': 'infernus-marine',
  'sm.terminator-squad/sergeant': 'terminator-sergeant',
  'sm.terminator-squad/gunner': 'terminator',
  'sm.terminator-squad/terminator': 'terminator',
  'ork.warboss-gordrang/gordrang': 'warboss-gordrang',
  'ork.boyz/boss-nob': 'boss-nob',
  'ork.boyz/boy-choppa': 'boy',
  'ork.boyz/boy-shoota': 'boy',
  'ork.boyz/boy-heavy': 'boy',
  'ork.deff-dread/deff-dread': 'deff-dread',
  'ork.deffkoptas/kopta-blasta': 'deffkopta',
  'ork.deffkoptas/kopta-rokkits': 'deffkopta',
  // Necrons: no GLBs yet. Listed so enabling one is just dropping the file in and adding its slug above;
  // until then glbSlugFor() returns undefined and the procedural kit (kitConfigs.ts) draws the model.
  'nec.necron-warriors/warrior-flayer': 'necron-warrior',
  'nec.necron-warriors/warrior-reaper': 'necron-warrior',
  'nec.overlord-amonhotekh/overlord': 'necron-overlord',
  'nec.skorpekh-destroyers/destroyer': 'skorpekh-destroyer',
  'nec.canoptek-doomstalker/doomstalker': 'canoptek-doomstalker',
  'nec.canoptek-scarab-swarms/swarm': 'canoptek-scarab',
}

/** The enabled GLB slug for a model type, or undefined (use the procedural figure). */
export function glbSlugFor(datasheetId: string, modelId: string | undefined): string | undefined {
  if (!modelId) return undefined
  const slug = GLB_SLUG_BY_MODEL[`${datasheetId}/${modelId}`]
  return slug && ENABLED_GLB_SLUGS.includes(slug) ? slug : undefined
}
