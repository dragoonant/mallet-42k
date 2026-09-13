# 20 — Data schema

All game content is JSON under `src/data/`, validated at build by `tools/validate-data.ts` against
`docs/spec/schemas/*.schema.json` (JSON Schema 2020-12). Every schema `$id` is `https://mallet42k.dev/schemas/<name>.schema.json`; cross-refs use `common.schema.json#/$defs/…`.
All prose fields (`text`, `name` of abilities) are original wording — never copied from any published book.

## 1. Files

| Path | Schema | Content |
|---|---|---|
| `src/data/core/abilities.json` | `ability[]` | shared abilities (cover, leader mechanics, core rules named abilities) |
| `src/data/core/stratagems.json` | `stratagem[]` | core stratagems (faction `core`) |
| `src/data/<faction>/faction.json` | `faction` | keywords, army rule, detachments, paint scheme |
| `src/data/<faction>/datasheets.json` | `datasheet[]` | |
| `src/data/<faction>/weapons.json` | `weapon[]` | |
| `src/data/<faction>/abilities.json` | `ability[]` | |
| `src/data/<faction>/stratagems.json` | `stratagem[]` | |
| `src/data/<faction>/enhancements.json` | `enhancement[]` | |
| `src/data/<faction>/patrols/*.json` | `combat-patrol` | one fixed force each |
| `src/data/missions/*.json` | `mission` | |
| `src/data/terrain/*.json` | `terrain-layout` | |
| `src/data/index.ts` | — | assembles `DataBundle { byId: Record<Id, …>, version }`, throws on duplicate id or dangling ref |

Ids: lowercase kebab, namespaced by dot: `sm.intercessor-squad`, `sm.w.bolt-rifle`, `core.s.command-reroll`,
`ork.a.waaagh`, `mission.cp-01`, `terrain.cp-01`. Pattern in `common.schema.json#/$defs/Id`.

## 2. Shared primitives (`common.schema.json`)

| Def | Shape | Notes |
|---|---|---|
| `Id` | `^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*$` | |
| `Keyword` | `^[A-Z0-9][A-Z0-9 '\-]*$` | e.g. `INFANTRY`, `ADEPTUS ASTARTES` |
| `DiceExpr` | integer ≥ 0 **or** `^(\d+)?(D3\|D6)?([+-]\d+)?$` | `"D6"`, `"2D6+1"`, `"D3+3"`, `3` |
| `RollTarget` | integer 2..7 | `3` = needs 3+; `7` = never (no save) |
| `Vec2` | `{x, z}` inches | board plane |
| `Polygon` | `Vec2[]` (≥3, CCW) | |
| `Phase` | `command \| movement \| shooting \| charge \| fight \| any` | |
| `TimingWindowId` | enum, same list as 00-architecture §4 | includes `round.start`, `round.end`, `battle.end` (outside any turn), `movement.moveStarted`, `charge.moveStarted`, `fight.targetsDeclared` |
| `MissionRule` | `{id, code, window, params?}` | §9; `code` must exist in the hook registry |
| `Stats` | `{M, T, Sv, W, Ld, OC}` | `M` inches int, `Sv`/`Ld` RollTarget, others int |
| `Base` | `{shape: round\|oval, mm, mm2?}` | mm2 = minor axis for oval |
| `Condition` | see §3 | |
| `Effect` | see §3 | |
| `AbilityDescriptor` | see §3 | |
| `WeaponAbility` | `{ability, value?, keyword?, ref?}` | §4 |
| `TargetSpec` | `{role, owner, filter?, state?, count?}` | §6 |

## 3. Abilities — declarative descriptors

An ability is `trigger` + `when` + `effect`, optionally limited and scoped. The engine evaluates every
active descriptor at the matching hook; the hook system is defined in 10-rules. `code` is the escape hatch:
bespoke logic lives in `src/engine/hooks/<hookName>.ts` and is registered in a hook registry; `trigger`/`when`
still gate it so bespoke hooks stay cheap. A descriptor with `code` may omit `effect`.

```json
{ "id":"sm.a.example", "name":"…", "text":"own-words summary",
  "trigger":"hitRoll", "when":{"targetKeyword":"VEHICLE"}, "effect":{"reroll":"ones"} }
```

| Field | Type | Notes |
|---|---|---|
| `trigger` | enum | `always phaseStart phaseEnd turnStart turnEnd commandPhase battleShockTest advanceRoll chargeRoll unitMoved unitSelectedToShoot unitSelectedToFight targetsDeclared attacksAllocated hitRoll woundRoll saveRoll damageRoll feelNoPainRoll damageApplied modelDestroyed unitDestroyed deployment reinforcements objectiveControl` |
| `when` | Condition | all keys AND-ed; `any: Condition[]`, `not: Condition` |
| `effect` | Effect \| Effect[] | applied in array order; each entry may carry its own `when` (AND-ed with the descriptor's), e.g. Veteran Instincts = `[{when:{targetKeyword:["MONSTER","VEHICLE"]}, reroll:"all"}, {reroll:"ones"}]` — the first matching entry wins for the same key |
| `scope` | `{who: self\|bearer\|target\|attacker\|friendly\|enemy, within?, keyword?}` | who the effect applies to; `self` = the whole unit (attached unit included); `bearer` = only the model carrying the ability (engine `RuntimeAbility.bearerModelId`); default `self` for abilities, `bearer` for enhancements |
| `duration` | `instant \| untilEndOfPhase \| untilEndOfTurn \| untilNextTurn \| untilEndOfRound \| battle` | default `instant` for roll effects, `battle` for `always`; `untilEndOfRound` = until the start of the next battle round (engine `expires.kind: roundEnd`; Waaagh!, Dead 'ard, Stomp 'Em) |
| `limit` | `oncePerBattle \| oncePerRound \| oncePerTurn \| oncePerPhase` | |
| `code` | string | hook name; must exist in registry or validation fails |
| `params` | object | free-form parameters for `code` |

Condition keys (all optional): `phase`, `ownTurn`, `attackerKeyword`, `attackerNotKeyword`, `targetKeyword` (Keyword or Keyword[] = any of),
`targetNotKeyword`, `weaponType (ranged|melee)`, `weaponAbility`, `weaponId`, `range ({within:n} | "half")`,
`targetInCover`, `targetOnObjective`, `unitOnObjective`, `unitBelowHalf`, `unitStationary`, `unitAdvanced`,
`unitFellBack`, `unitCharged`, `unitBattleShocked`, `leaderAttached`, `roll ({gte,lte, unmodified?})`,
`round ({gte,lte})`, `oathTarget` (target is the marked unit), `strengthVsToughness (gt|gte|eq|lte|lt|double|half — attack S vs target T)`, `any`, `not`.

Effect keys (any subset; unknown keys rejected):

| Key | Value | Meaning |
|---|---|---|
| `when` | Condition | per-entry gate (see `effect` above); not an effect on its own |
| `reroll` | `ones \| fails \| all \| oneDie` | re-roll for the triggering roll; `all` = optional re-roll of successes via `rerollOffer` (10-rules R-6.24), fails auto-re-rolled |
| `modifyRoll` | `{roll, value}` | roll ∈ hit wound save charge advance battleShock damage; engine applies ±1 cap for hit/wound |
| `modifyStat` | `{stat, value}` | stat ∈ A S AP D M T Sv W Ld OC BS WS range |
| `setStat` | `{stat, value}` | |
| `invuln` | RollTarget | |
| `feelNoPain` | RollTarget | |
| `ignoreCover` | true | |
| `ignoreModifiers` | `hit \| wound \| all` | |
| `autoResult` | `{roll, outcome: pass\|fail}` | e.g. auto-pass battle-shock |
| `grantWeaponAbility` | WeaponAbility | to the weapons of the models in `scope` (`bearer` → only that model's weapons) matching `when.weaponType` |
| `grantKeyword` | Keyword | |
| `extraAttacks` | DiceExpr | |
| `mortalWounds` | `{count: DiceExpr, on?: unmodified6}` | |
| `damageReduction` | int | subtract from each damage instance, min 1 |
| `halveDamage` | true | round up |
| `cp` | int | gain/refund |
| `vp` | int | |
| `move` | `{distance: DiceExpr, kind: normal\|consolidate\|advance\|surge}` | out-of-sequence move; `surge` applies R-5.9 limits and `params.asCloseAsPossibleTo: target` |
| `fightsFirst` / `fightsLast` | true | |
| `shootAfterAdvance` / `shootAfterFallBack` / `chargeAfterAdvance` / `chargeAfterFallBack` | true | |
| `stealth` | true | −1 to hit for ranged attacks targeting the unit |
| `lethalOn` | `5+` etc | override ability threshold |

Core abilities that are flags rather than rules text go on the datasheet as `coreAbilities:[{ability, value?}]` with
enum `DEEP_STRIKE SCOUTS INFILTRATORS LONE_OPERATIVE LEADER STEALTH DEADLY_DEMISE FIRING_DECK FEEL_NO_PAIN FIGHTS_FIRST`.
The engine implements those natively; data never redefines them.

## 4. Weapons

One entry per profile. Multi-profile weapons share `profileGroup`; a model picks one profile each time it shoots/fights.

| Field | Type | Notes |
|---|---|---|
| `id`, `name` | Id, string | |
| `type` | `ranged \| melee` | |
| `range` | int inches | 0 for melee |
| `A` | DiceExpr | attacks |
| `skill` | RollTarget \| null | BS/WS; null = auto-hit (TORRENT) |
| `S`, `AP`, `D` | int, int ≤ 0, DiceExpr | |
| `abilities` | WeaponAbility[] | enum `ASSAULT HEAVY RAPID_FIRE TORRENT BLAST SUSTAINED_HITS LETHAL_HITS DEVASTATING_WOUNDS ANTI TWIN_LINKED LANCE MELTA IGNORES_COVER INDIRECT_FIRE PISTOL HAZARDOUS PRECISION EXTRA_ATTACKS ONE_SHOT PSYCHIC CUSTOM`; `value` for RAPID_FIRE/SUSTAINED_HITS/MELTA (DiceExpr), `keyword`+`value` for ANTI, `ref` (ability id) for CUSTOM |
| `profileGroup` | Id | optional |
| `figure` | `{part: Id}` | which weapon part to mount (30-figures) |

## 5. Datasheets

| Field | Type | Notes |
|---|---|---|
| `id`, `faction`, `name` | | |
| `keywords`, `factionKeywords` | Keyword[] | `INFANTRY`, `CHARACTER`, … / `ADEPTUS ASTARTES`, `ORKS` |
| `stats` | Stats | unit default |
| `invuln` | RollTarget | optional |
| `composition` | Composition[] | per model type: `{modelId, name, min, max, default, champion?, base, statsOverride?, weapons:{default: Id[], options: WargearOption[]}, figure}` |
| `WargearOption` | `{replace: Id[], with: Id[], max?: int \| "any", perModels?: int}` | `perModels: 5` = one option per 5 models |
| `abilities` | (Id \| AbilityDescriptor)[] | |
| `coreAbilities` | `{ability, value?}[]` | §3 |
| `leader` | `{attachTo: Id[], effects: (Id\|AbilityDescriptor)[]}` | CHARACTER only |
| `damaged` | `{threshold: int, effect: Effect}` | vehicles/monsters |
| `points` | `{models, points}[]` | |
| `figure` | `{archetype, kit, parts?: Record<Slot, Id>}` | see 30-figures; composition entries may override |

Unit-level state in the engine (`wounds`, `battleShocked`, `moved`, `advanced`) is not data and is not in the schema.

## 6. Stratagems

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `text` | | |
| `faction` | Id \| `core` | |
| `detachment` | Id | optional |
| `cost` | int CP | |
| `category` | `battleTactic \| strategicPloy \| wargear \| epicDeed` | |
| `phases` | Phase[] | informational filter for UI |
| `window` | TimingWindowId | when it may be used; the engine offers it only in this window |
| `who` | `active \| reactive \| either` | whose turn it may be used in |
| `condition` | Condition | use-time gating (e.g. the target unit must have been selected as a target) |
| `when` | Condition | application-time gating per triggered attack/roll, same semantics as `AbilityDescriptor.when` |
| `targets` | TargetSpec[] | `{role: unit\|model, owner: friendly\|enemy, filter:{keyword?, notKeyword?, within?:{of: previousTarget\|self\|objective\|controlledObjective, inches}}, state?: selectedToShoot\|targetedByAttack\|chargedThisTurn\|justDestroyed\|inEngagement\|belowHalf\|notYetFought, count?:int}`; `within.of: controlledObjective` restricts to a marker the active player currently controls (vs. `objective` = any marker in range) |
| `effect` | Effect \| Effect[] | applied to `targets[0]` unless `scope` says otherwise |
| `scope`, `duration`, `limit` | as abilities | default `limit: oncePerPhase` (core: one use per stratagem per phase) |
| `code` | hook name | escape hatch |

## 7. Enhancements

`{id, faction, detachment?, name, text, cost (pts), restriction:{keyword?: Keyword[], notKeyword?: Keyword[]}, effect: AbilityDescriptor | Id, choice?: {unitKeyword}}` — always attaches to one CHARACTER model; `effect.scope` defaults to `{who: bearer}`. `choice` means the player names one friendly unit with that keyword at setup (`PlayerSetup.enhancementChoice.unitRef`; Tellyporta → BOYZ); `createGame` rejects a missing or mismatched ref.

## 8. Factions and combat patrols

`faction`: `{id, name, factionKeyword, armyRule: Id, detachments:[{id, name, rule: Id, stratagems: Id[], enhancements: Id[]}], paintScheme:{primary, secondary, trim, metal, decal} (hex), combatPatrols: Id[]}`.

`combat-patrol`: `{id, faction, name, detachment?, warlord: ref, units:[{ref, datasheet, size, wargear?: [{modelId, count, weapons: Id[]}], attachTo?: ref, enhancement?: Id}], stratagems: Id[], enhancements: [{id, default}], secondaries: [{id, name, text, default, scoring: ScoringRule[]}]}`. `ref` is unique inside the patrol and becomes the engine `unitId` prefix. `attachTo` references another unit's `ref` (leader attachment chosen at setup; the setup UI may change it within `leader.attachTo`). Exactly one enhancement and one secondary have `default: true`; the player may swap to the optional one at setup (11-combat-patrol CP-1.4/1.5).

## 9. Missions

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `format` | | `format: combatPatrol \| incursion \| strikeForce` |
| `board` | `{w, h}` | 44 × 30 for Combat Patrol |
| `deploymentZones` | `{A: Polygon, B: Polygon}` | inches, board coords |
| `objectives` | `{id, x, z}[]` | marker centre; control radius from `objectiveRange` (3" from marker edge, marker radius 0.79") |
| `rounds` | int | 5 |
| `firstTurn` | `roll \| attackerChoice` | |
| `scoring` | ScoringRule[] | `{id, when: TimingWindowId, rounds:{from,to}, who?: active\|opponent\|both\|first\|second, rule, pointsPer, cap, params?, code?}` (`common#/$defs/ScoringRule`, shared with patrol secondaries). `when` may be any window incl. `round.start`/`round.end`/`battle.end`; `who: first/second` = the player who took the first/second turn of the round (round-5 split: `{command.end, 5–5, first}` + `{turn.end, 5–5, second}`, 11-combat-patrol CP-2.1). `rule`: `holdObjectives` (per marker; `params.objectiveIds` restricts, `params.min` = threshold form "≥ n markers"), `holdMore`, `holdHome`, `holdEnemyHome`, `holdNamed` (`params.objectiveIds`, all must be held), `unitsInEnemyZone`, `destroyedUnits`, `razedThisTurn`, `claimedSite`, `claimedSiteConsecutive` (`params.turns`), `custom` (`code`). `params.capGroup` lets several rules share one per-instance cap. |
| `rules` | MissionRule[] | `{id, code, window, params?}` — non-scoring mission rules (Retrieve Intelligence, Irradiated Power Cells, Sabotage Comms, Raze and Ruin, Supply Lines, Break Their Spirit, Claim Sites); `code` validated against the hook registry; state they keep is listed in 11-combat-patrol §2.6 |
| `victory` | `{tie: draw \| fewerDestroyed}` | |
| `terrainLayouts` | Id[] | allowed layouts |

## 10. Terrain layouts

`{id, board, pieces: Piece[]}`; `Piece = {id, kind: ruin|crate|barricade|crater|wall|forest, pos: Vec2, rot: number(rad), footprint: Polygon (local), height, traits: (obscuring|cover|breachable|scalable|difficult|impassable|unstable)[], walls?: [{a: Vec2, b: Vec2, height, thickness, gaps?: [{from, to}] }], floors?: [{polygon, height}]}`.
`footprint` is the area used for "wholly within" tests; `walls` are the raycast blockers; `floors` are standable surfaces.

## 11. Worked examples

Taken from the Strike Force Octavius roster (11-combat-patrol §4); numbers are re-checked by the W2 data agents. Full JSON in `docs/spec/examples/` (validated in CI).

### Datasheet — `docs/spec/examples/datasheet.sm.infernus-squad.json`

```json
{ "id":"sm.infernus-squad", "faction":"sm", "name":"Infernus Squad",
  "keywords":["INFANTRY","IMPERIUM","TACTICUS","INFERNUS SQUAD"], "factionKeywords":["ADEPTUS ASTARTES"],
  "stats":{"M":6,"T":4,"Sv":3,"W":2,"Ld":6,"OC":1},
  "composition":[
    {"modelId":"sergeant","name":"Infernus Sergeant","min":1,"max":1,"default":1,"champion":true,
     "base":{"shape":"round","mm":32},
     "weapons":{"default":["sm.w.bolt-pistol","sm.w.pyreblaster","sm.w.close-combat-weapon"]},
     "figure":{"archetype":"infantry","kit":"sm-tacticus","parts":{"head":"sm.head.sergeant"}}},
    {"modelId":"marine","name":"Infernus Marine","min":4,"max":4,"default":4,
     "base":{"shape":"round","mm":32},
     "weapons":{"default":["sm.w.bolt-pistol","sm.w.pyreblaster","sm.w.close-combat-weapon"]},
     "figure":{"archetype":"infantry","kit":"sm-tacticus"}}],
  "abilities":["sm.a.oath-of-moment"], "coreAbilities":[],
  "points":[{"models":5,"points":0}],
  "figure":{"archetype":"infantry","kit":"sm-tacticus"} }
```

Referenced ability (`abilities.json`), showing the descriptor form:
`{"id":"sm.a.oath-of-moment","name":"Oath of Moment","text":"Pick one enemy unit at the start of your Command phase; until your next Command phase, attacks against it may re-roll the hit roll.","trigger":"hitRoll","when":{"oathTarget":true},"effect":{"reroll":"all"},"code":"oathOfMomentPick","params":{"pickWindow":"command.start"}}` — the re-roll is declarative (`all`: failed dice re-rolled automatically, successes offered via `rerollOffer`, R-6.24); the once-per-turn target pick is a `code` hook that opens a `chooseOption` decision.

Referenced weapon (`weapons.json`): `{"id":"sm.w.pyreblaster","name":"Pyreblaster","type":"ranged","range":12,"A":"D6","skill":null,"S":5,"AP":0,"D":1,"abilities":[{"ability":"TORRENT"},{"ability":"IGNORES_COVER"}],"figure":{"part":"sm.weapon.pyreblaster","hands":2}}`.

### Stratagem — `docs/spec/examples/stratagem.sm.gene-wrought-resilience.json`

```json
{ "id":"sm.s.gene-wrought-resilience", "faction":"sm", "name":"Gene-wrought Resilience",
  "text":"Use when one of your Astartes units is chosen as a target in the opponent's Shooting phase or either player's Fight phase. Until the phase ends, attacks against it whose Strength exceeds the unit's Toughness suffer -1 to wound.",
  "cost":1, "category":"battleTactic", "phases":["shooting","fight"],
  "window":["shooting.targetsDeclared","fight.targetsDeclared"], "who":"either",
  "condition":{"any":[{"phase":"shooting","ownTurn":false},{"phase":"fight"}]},
  "targets":[{"role":"unit","owner":"friendly","filter":{"keyword":"ADEPTUS ASTARTES"},"state":"targetedByAttack","count":1}],
  "when":{"strengthVsToughness":"gt"},
  "effect":{"modifyRoll":{"roll":"wound","value":-1}}, "scope":{"who":"attacker"},
  "duration":"untilEndOfPhase", "limit":"oncePerPhase" }
```

`condition` is checked once when the stratagem is used; `when` is checked on every application (here: per attack, `strengthVsToughness: gt`). The engine stores the resulting effect on the target unit with `scope.who = attacker`; the AI calculator reads the same descriptor (40-ai §2).

## 12. Validation rules beyond JSON Schema (`tools/validate-data.ts`)

Validator: `ajv` (2020-12 class, `strict: true, strictRequired: false`), all schemas added by `$id`, examples in `docs/spec/examples/` validated in CI as a smoke test.

| Check | Failure |
|---|---|
| all `Id` references resolve in the bundle | dangling ref |
| `code` hook names (abilities, stratagems, `ScoringRule.code`, `mission.rules[].code`) exist in `src/engine/hooks/registry.ts` | unknown hook |
| enhancement `choice.unitKeyword` names a keyword some datasheet in the same faction has | unusable choice |
| `composition` default sizes match a `points` entry | size/points mismatch |
| wargear `replace` ids ⊆ `default` | bad option |
| deployment zone polygons inside board, objectives inside board | geometry |
| `combat-patrol.attachTo` targets a unit the leader's `leader.attachTo` allows | illegal attach |
| paint scheme hex colours parse | colour |
| every `text` field ≤ 400 chars | verbosity guard |
