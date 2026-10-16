# Patrol spec — Dark Angels: The Vengeful Brethren

Own-words data spec for the **second** Dark Angels Combat Patrol, in the same shape as 11-combat-patrol §4. It covers
only this patrol. The faction is playable through Mordekai's Judgement ([dark-angels.md](dark-angels.md), rule ids
`DAR-…`); anything identical to that patrol (or to the Space Marines data it reuses) is cited by id and not restated.
This file supersedes the appendix line in dark-angels.md §10 wherever the two differ. Rule ids here are
`DAV-<section>.<n>`; test ids `DAV-0nn` (12-rules-test-checklist, section DAV). Mechanics are 1:1 with the source;
every sentence of prose is ours.

Data id prefix stays `da.` (faction `dark-angels`, faction keyword ADEPTUS ASTARTES, `src/data/factions/dark-angels/`).
Patrol id `da.cp.the-vengeful-brethren`, file `patrols/the-vengeful-brethren.json`, appended to `faction.json`
`combatPatrols` (the only faction.json change: `armyRule` and the Mordekai's Judgement detachment entry stay as they
are). Code names introduced here carry a `vb` prefix so they cannot collide with the Blood Angels / Black Templars
builds running in parallel (both have Bladeguard-style units).

## 0. Sources (accessed 2026-10-16)

| Source | URL | Version shown on page |
|---|---|---|
| Dark Angels "The Vengeful Brethren" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/the-vengeful-brethren/ | Book "The Vengeful Brethren", kind **Index**, edition 10, last update **April 2024** |
| Dark Angels "Mordekai's Judgement" (already specified; not re-fetched) | https://wahapedia.ru/wh40k10ed_cp/factions/mordekai-s-judgement/ | Index 10, June 2023 |
| CP faction navigation (enumerates patrols) | menu on the CP page above | exactly two Dark Angels patrols: Mordekai's Judgement, The Vengeful Brethren |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | captured in 11-combat-patrol §1–2; not re-fetched |

Every number below was read from the page's raw HTML on 2026-10-16 (one fetch). Source quirks recorded as found:
- **Master Zacharial has no Leader ability** on the CP card (abilities: Oath of Moment, Refuse to Yield only). He always
  operates as his own unit; the patrol has no attachment.
- The Intercessor Squad composition line says every model carries bolt pistol, bolt rifle and close combat weapon:
  **no Sergeant and no power weapon** on this card (unlike Mordekai's Judgement, DAR-1). It has Patrol Squads.
- The page never names a WARLORD; the enhancement text says "your CAPTAIN model". Zacharial is the patrol's only
  CHARACTER and enhancement bearer → WARLORD (CP-1.3 convention, as every other patrol).
- Wahapedia prints weapon abilities in lowercase after the name ("Relic chainsword extra attacks", "Plasma
  incinerator – supercharge assault hazardous heavy"); read as weapon abilities.
- The dark-angels.md §10 appendix summary of the stratagems is confirmed; it lacked every profile, which follow here.

## 1. Roster

4 units (5 if the Intercessors split), **19 models**. Faction keywords ADEPTUS ASTARTES, DARK ANGELS and keyword
IMPERIUM, INFANTRY on every datasheet.

| Ref | Unit | Datasheet id | Models | Wargear as built (fixed) | Notes |
|---|---|---|---|---|---|
| `zacharial` | Master Zacharial | `da.master-zacharial` (new) | 1 | boltstorm gauntlet, power fist, relic chainsword | **WARLORD**, Determined Combatant by default. No Leader: never attached |
| `intercessors` | Intercessor Squad | `da.vb.intercessor-squad` (new, patrol-specific) | 10 | each: bolt pistol, bolt rifle, close combat weapon | BATTLELINE; Patrol Squads 5 + 5 |
| `hellblasters` | Hellblaster Squad | `da.hellblaster-squad` (new) | 5 | each: bolt pistol, plasma incinerator (2 profiles), close combat weapon | — |
| `bladeguard` | Bladeguard Veteran Squad | `da.bladeguard-veteran-squad` (new) | 3 | each: heavy bolt pistol, master-crafted power weapon | invuln 4+ |

| Id | Rule |
|---|---|
| DAV-1.1 | No wargear options, no unit choices. The only setup choice besides enhancement/secondary is Patrol Squads (DAV-1.2). |
| DAV-1.2 | Patrol Squads: at the start of Declare Battle Formations the Intercessor Squad may split into two units of 5 (`intercessors-a`, `intercessors-b`), each with 5 identical models. Reuse `sm.a.patrol-squads` (`code:'patrolSquads'`, `params.sizes:[5,5]`). |
| DAV-1.3 | Why a new Intercessor datasheet: the Mordekai card has a Sergeant with a power weapon and no Patrol Squads; this card has ten identical Intercessors and Patrol Squads. `da.intercessor-squad` is **not** edited. Stats and weapons are otherwise identical, so the new sheet reuses `sm.w.bolt-pistol`, `da.w.bolt-rifle`, `sm.w.close-combat-weapon`. |
| DAV-1.4 | WARLORD = `zacharial` (patrol `warlord:'zacharial'`), carrying the chosen enhancement. No `attachTo` anywhere in this patrol. |

## 2. Faction ability — Oath of Moment

Identical to DAR-2.1 (CP-4.1). Reuse `sm.a.oath-of-moment` (`code:'oathOfMomentPick'`) on all four datasheets; the
faction `armyRule` is unchanged. No patrol-scoped army rule. Wages of Retribution (DAV-3.2) reads the same per-player
`Player.oathTargetUnitId`.

## 3. Enhancements (Master Zacharial, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `da.e.determined-combatant` | Determined Combatant | default | DAV-3.1 While the bearer is within range of any objective marker (controlled or not; removed markers never count), every weapon the bearer carries — ranged and melee — has [SUSTAINED HITS 1]. Checked live at each attack. |
| `da.e.wages-of-retribution` | Wages of Retribution | optional | DAV-3.2 Each time an ADEPTUS ASTARTES model from your army destroys your Oath of Moment target, and the bearer is on the battlefield, roll one D6: on 4+ you gain 1 CP. |

Both: `restriction: {keyword: ['CAPTAIN']}` (only Zacharial).

| Id | Rule |
|---|---|
| DAV-3.2a | "Destroys the target" **[interpretation, core Attached-units rule]**: the destroyed unit (or, for an attached Oath target, **each** destroyed half — the core rule printed on the page says unit-destroyed triggers fire for either half) is the current Oath target (`leaderService.sameUnit(s, oath, destroyedUnitId)`, read in `onUnitDestroyed`, which runs before the leader split). The killer = `byUnitId` owned by the bearer's player with faction keyword ADEPTUS ASTARTES (every unit in this army). Bearer "on the battlefield" = Zacharial's unit is `location === 'board'` with his model alive (a Wages roll when Zacharial himself dies in the same attack is not made). The CP gain goes through `hookService.gainCp`, so the R-4.2 cap (1 extra CP per battle round) applies. The D6 is an ability roll: not Command-Re-rollable. |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `da.sec.hunters-of-heretics` | Hunters of Heretics | default | DAV-4.1 Each time an ADEPTUS ASTARTES unit from your army destroys an enemy CHARACTER model: 5 VP (any phase, either turn, rounds 1–5). At the end of the battle: +5 VP if every enemy CHARACTER model is destroyed. No cap printed. |
| `da.sec.take-the-stronghold` | Take the Stronghold | optional | DAV-4.2 At the start of the Deploy Armies step the **opponent** picks one objective marker that is **not** in the opponent's own deployment zone. At the end of each of **your** turns (rounds 1–5): 5 VP if you control that marker. No cap printed (max 25). |

| Id | Rule |
|---|---|
| DAV-4.1a | Kill credit = the destroyed model's `byPlayer === pid` and `byUnitId` is a unit of `pid` with faction keyword ADEPTUS ASTARTES. CHARACTER = the destroyed model's own unit's datasheet keywords (a bodyguard model of an enemy attached unit is not a CHARACTER). Deadly Demise mortal wounds credited to one of our units count (it is our unit's effect). Own Hazardous or Desperate Escape losses never count (enemy-only). |
| DAV-4.1b | End-of-battle bonus **[interpretation]**: every enemy unit whose datasheet has CHARACTER has no live model on the battlefield or embarked; enemy units still in Reserves count as destroyed (R-5.16). If the enemy army never contained a CHARACTER model the bonus is 0 (nothing was hunted). |
| DAV-4.2a | Pick timing reuses the LoV E3 Deploy Armies window (`deployment.unit`, key `deployArmies`, `rounds:{from:0,to:0}`, already in setup.ts). Options = live markers whose **centre** is not inside the picker's (opponent's) deployment zone (`pointInPolygon`, Toil Earns test). `canPass:false`. Rounds: none restricted on the page, so round 1 counts. A removed marker scores 0 from then on. |

## 5. Patrol stratagems

Ids are patrol-scoped `da.s.vb-*` (dark-angels.md §5/§10: the names collide with Mordekai's Judgement's `da.s.mj-*`).

| Id | Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|---|
| `da.s.vb-unyielding` | Unyielding | 1 | epicDeed | DAV-5.1 Fight phase (either turn), just after an enemy unit selects its targets | one own ADEPTUS ASTARTES unit picked as a target of ≥1 of those attacks | until end of phase, each time a model of the unit is destroyed while it has not fought this phase, roll a D6 (+1 if the model is BLADEGUARD VETERAN SQUAD): on 4+ it stays; once the attacking unit has finished its attacks the model fights, then is removed |
| `da.s.vb-march-of-vengeance` | March of Vengeance | 1 | strategicPloy | DAV-5.2 Fight phase (either turn), any time (before a unit is picked to fight, after a fight, or just before a Consolidation) | one own ADEPTUS ASTARTES unit | until end of phase, the unit's Consolidation moves may be up to 6" instead of 3" |
| `da.s.vb-relic-munitions` | Relic Munitions | 1 | battleTactic | DAV-5.3 your Shooting phase, between unit activations | one own ADEPTUS ASTARTES unit not yet selected to shoot this phase | until end of phase, ranged weapons of the unit's models have [LETHAL HITS], **except** plasma incinerators (both profiles) |

| Id | Rule |
|---|---|
| DAV-5.1a | Reuses the C5 fight-on-death machinery (CSM Daemonic Fervour): `grantFightOnDeath(state, unitId, threshold)`. "+1 to the roll, 4+" = threshold **3** for a BLADEGUARD VETERAN SQUAD unit, **4** otherwise (no attachments exist in this patrol, so unit keyword = model keyword). Not offered when the target has already fought this phase **[interpretation: it could do nothing]**. Only deaths from an enemy attack in the Fight phase defer (C5 rule in attack.ts). The die is not Command-Re-rollable (C5 rolls with `commandRerollable:false`). |
| DAV-5.2a | Both Consolidation forms (toward the enemy and toward an objective) get 6"; Pile-in stays 3". Reuses `getStuckInDistance` with `params:{consolidate:6, consolidateOnly:true}` (not `enemyOnly`). Using it on a unit that already consolidated does nothing (allowed, as printed). |
| DAV-5.3a | Only the Hellblasters carry plasma incinerators; their bolt pistols still gain Lethal Hits. Not usable for Fire Overwatch (opponent's turn). An Intercessor half (after Patrol Squads) is its own unit/target. |

Core stratagems per the page (every datasheet lists the same set): Command Re-roll, Insane Bravery, Fire Overwatch,
Rapid Ingress, Go to Ground, Heroic Intervention, Counter-offensive; Epic Challenge only on Zacharial (CHARACTER). All
already keyword-gated in core data; no VEHICLE in this patrol (no Tank Shock).

## 6. Datasheets

| Unit | Data id | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Master Zacharial | `da.master-zacharial` | 1 | 40 mm | 5 | 6 | 3+ | 4+ | 6 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, GRAVIS, CAPTAIN, MASTER ZACHARIAL | Oath of Moment; Refuse to Yield |
| Intercessor Squad | `da.vb.intercessor-squad` | 10 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, INTERCESSOR SQUAD | Oath of Moment; Patrol Squads |
| Hellblaster Squad | `da.hellblaster-squad` | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 1 | INFANTRY, IMPERIUM, TACTICUS, HELLBLASTER SQUAD | Oath of Moment |
| Bladeguard Veteran Squad | `da.bladeguard-veteran-squad` | 3 | 40 mm | 6 | 4 | 3+ | 4+ | 3 | 6+ | 1 | INFANTRY, IMPERIUM, TACTICUS, BLADEGUARD VETERAN SQUAD | Oath of Moment; Bladeguard |

Faction keywords (all four): ADEPTUS ASTARTES, DARK ANGELS.

Abilities:

| Id | Unit | Rule |
|---|---|---|
| DAV-6.1 | Zacharial — Refuse to Yield (`da.a.refuse-to-yield`) | each time an attack is allocated to Zacharial, halve that attack's Damage (rounded up; D1 stays 1). Ranged and melee. Applied before any other Damage modifier. Ability mortal wounds that are not an attack are unaffected. |
| DAV-6.2 | Intercessors — Patrol Squads (`sm.a.patrol-squads`) | DAV-1.2. |
| DAV-6.3 | Bladeguard (`da.a.vb-bladeguard` + `da.a.vb-swords-of-the-chapter` + `da.a.vb-shields-of-the-chapter`) | at the start of each Fight phase (either player's turn) you may choose one mode for the unit until the end of the phase. **Swords of the Chapter**: its models' melee attacks re-roll a Hit roll of 1. **Shields of the Chapter**: each **invulnerable** saving throw made for its models re-rolls a 1 (armour saves never). Optional; one mode per unit per phase. |
| DAV-6.4 | Pistols | Every model has a Pistol; INFANTRY, so in Engagement Range they shoot only Pistols (native). Zacharial's boltstorm gauntlet is his only ranged weapon. |
| DAV-6.5 | Relic chainsword [EXTRA ATTACKS] | Zacharial fights with the relic chainsword **and** the power fist in the same fight (native Extra Attacks). |
| DAV-6.6 | Supercharge [HAZARDOUS] | a failed test destroys a Hellblaster (not CHARACTER/VEHICLE) — native. |

Wargear per model (`composition[]`, modelIds in backticks):

| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Master Zacharial | `zacharial` ×1 | boltstorm gauntlet | power fist (Zacharial), relic chainsword |
| Intercessor Squad (VB) | `intercessor` ×10 (min 5, max 10, default 10) | bolt pistol, bolt rifle | close combat weapon |
| Hellblaster Squad | `hellblaster` ×5 | bolt pistol, plasma incinerator (standard / supercharge) | close combat weapon |
| Bladeguard Veteran Squad | `bladeguard` ×3 | heavy bolt pistol | master-crafted power weapon |

Weapon profiles ("reuse" = existing id, values checked equal to this page; everything else new, appended to
`weapons.json`):

| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `da.w.boltstorm-gauntlet` (new) | boltstorm gauntlet | 12" | 3 | 2+ | 4 | −1 | 1 | Pistol |
| `da.w.power-fist-zacharial` (new) | power fist (Zacharial) | melee | 5 | 2+ | 8 | −2 | 2 | — (differs from `sm.w.power-fist` A3 WS3+) |
| `da.w.relic-chainsword` (new) | relic chainsword | melee | 3 | 2+ | 4 | −1 | 2 | Extra Attacks |
| `sm.w.bolt-pistol` (reuse) | bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `da.w.bolt-rifle` (reuse, DAR §6) | bolt rifle | 24" | 2 | 3+ | 4 | −1 | 1 | Assault, Heavy |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon | melee | 3 | 3+ | 4 | 0 | 1 | — |
| `da.w.plasma-incinerator` (new, `profileGroup: da.w.plasma-incinerator`) | plasma incinerator — standard | 24" | 2 | 3+ | 7 | −2 | 1 | Assault, Heavy |
| `da.w.plasma-incinerator-supercharge` (new, same group) | plasma incinerator — supercharge | 24" | 2 | 3+ | 8 | −3 | 2 | Assault, Hazardous, Heavy |
| `da.w.heavy-bolt-pistol` (new) | heavy bolt pistol | 18" | 1 | 3+ | 4 | −1 | 1 | Pistol |
| `da.w.master-crafted-power-weapon` (new) | master-crafted power weapon | melee | 4 | 3+ | 5 | −2 | 2 | — |

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§5/§6/§7/§9); (b) = new code hook, added to
`src/engine/factions/dark-angels.ts` (`darkAngelsHooks`, already spread into `codeHooks` by the Mordekai build) plus
the usual one-line dispatches in `missions.ts`; (c) = engine change beyond a code hook. Reused: `oathOfMomentPick`
(sm), `patrolSquads` (sm), `halveDamage` (ork Grizzled Skarboy), `unitOnObjective` condition, `grantWeaponAbility`
with `not`/`any`/`weaponId` conditions, `getStuckInDistance` (`consolidate`/`consolidateOnly` params), C5
fight-on-death (`grantFightOnDeath`, fight-on-death.ts), the Daemonic Fervour stratagem shape, Banishment Stone's
`runAt` on a destroy hook, `hookService.gainCp` (R-4.2 cap), Champion of Titan's `missionService.modelDestroyed`
fan-out, LoV Toil Earns' Deploy Armies pick (E3 window, `PICK_CODES` / `runPick`), Martial Ka'tah's `fight.start`
`abilityChoice` pick, the Aeldari Storm of Shots stratagem shape (`notYetShot`).

| Rule | Enc. | Encoding |
|---|---|---|
| Oath of Moment (DAV-2) | (a) | `abilities` of all four datasheets include `sm.a.oath-of-moment` |
| Patrol / WARLORD / ids (DAV-1) | (a) | patrol `da.cp.the-vengeful-brethren`: units `zacharial` (`da.master-zacharial`, size 1, enhancement `da.e.determined-combatant`), `intercessors` (`da.vb.intercessor-squad`, size 10, `patrolSquads:[{ref:'intercessors-a', size:5, wargear:[{modelId:'intercessor', count:5, weapons:['sm.w.bolt-pistol','da.w.bolt-rifle','sm.w.close-combat-weapon']}]}, {ref:'intercessors-b', …same}]`), `hellblasters` 5, `bladeguard` 3; no `attachTo`; `warlord:'zacharial'`; `enhancements:[{id:'da.e.determined-combatant', default:true}, {id:'da.e.wages-of-retribution', default:false}]`; secondaries inline (DAV-4); `stratagems:['da.s.vb-unyielding','da.s.vb-march-of-vengeance','da.s.vb-relic-munitions']`. faction.json: append the patrol id to `combatPatrols` only. |
| Patrol Squads (DAV-1.2) | (a) | `da.vb.intercessor-squad` `abilities:['sm.a.oath-of-moment','sm.a.patrol-squads']` |
| No Leader (quirk) | (a) | `da.master-zacharial` has no `LEADER` core ability and no `leader` block |
| Refuse to Yield (DAV-6.1) | (a) | ability `da.a.refuse-to-yield` `{trigger:'damageApplied', effect:{halveDamage:true}, scope:{who:'self'}}` (ranged and melee: no `when`) |
| Determined Combatant (DAV-3.1) | (a) | enhancement `effect:{id:'da.e.determined-combatant.effect', trigger:'always', when:{unitOnObjective:true}, effect:{grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}, scope:{who:'bearer'}}` |
| Wages of Retribution (DAV-3.2) | (a)+(b) | enhancement `effect:{id:'da.e.wages-of-retribution.effect', trigger:'unitDestroyed', code:'vbWagesOfRetribution', scope:{who:'bearer'}, params:{threshold:4, cp:1}}`. (b) `vbWagesOfRetribution` (§7.1) |
| Hunters of Heretics (DAV-4.1) | (b) | secondary `da.sec.hunters-of-heretics`, `scoring:[{id:'hunters-of-heretics', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', pointsPer:5, cap:999, code:'vbHuntersOfHeretics', params:{keyword:'CHARACTER', killerFactionKeyword:'ADEPTUS ASTARTES'}}, {id:'hunters-of-heretics-end', when:'battle.end', rounds:{from:5,to:5}, who:'both', rule:'custom', pointsPer:5, cap:5, code:'vbHuntersOfHereticsEnd', params:{keyword:'CHARACTER'}}]`. (b) two mission hooks (§7.1) |
| Take the Stronghold (DAV-4.2) | (b) | secondary `da.sec.take-the-stronghold`, `scoring:[{id:'take-the-stronghold-pick', when:'deployment.unit', rounds:{from:0,to:0}, who:'both', rule:'custom', pointsPer:0, cap:0, code:'vbTakeTheStrongholdPick'}, {id:'take-the-stronghold', when:'turn.end', rounds:{from:1,to:5}, who:'active', rule:'custom', pointsPer:5, cap:25, code:'vbTakeTheStrongholdScore'}]`. (b) two mission hooks (§7.1) |
| Unyielding (DAV-5.1) | (a)+(b) | stratagem `da.s.vb-unyielding`, cost 1, `category:'epicDeed'`, `phases:['fight']`, `window:'fight.targetsDeclared'`, `who:'either'`, `condition:{phase:'fight'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, state:'targetedByAttack', count:1}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'vbUnyielding'`, `params:{threshold:4, bonusKeyword:'BLADEGUARD VETERAN SQUAD'}` (Daemonic Fervour shape). (b) `vbUnyielding` (§7.1) |
| March of Vengeance (DAV-5.2) | (a) | stratagem `da.s.vb-march-of-vengeance`, cost 1, `strategicPloy`, `phases:['fight']`, `window:['fight.start','fight.attacksResolved','fight.beforeConsolidate']`, `who:'either'`, `condition:{phase:'fight'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, count:1}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'getStuckInDistance'`, `params:{consolidate:6, consolidateOnly:true}` |
| Relic Munitions (DAV-5.3) | (a) | stratagem `da.s.vb-relic-munitions`, cost 1, `battleTactic`, `phases:['shooting']`, `window:['shooting.start','shooting.attacksResolved']`, `who:'active'`, `condition:{phase:'shooting', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, state:'notYetShot', count:1}]`, `effect:{when:{weaponType:'ranged', not:{any:[{weaponId:'da.w.plasma-incinerator'},{weaponId:'da.w.plasma-incinerator-supercharge'}]}}, grantWeaponAbility:{ability:'LETHAL_HITS'}}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'` (no code) |
| Bladeguard (DAV-6.3) | (a)+(b)+(c E1) | three abilities on `da.bladeguard-veteran-squad`: `da.a.vb-bladeguard` `{trigger:'phaseStart', when:{phase:'fight'}, code:'vbBladeguardPick', scope:{who:'self'}, params:{pickWindow:'fight.start'}}`; `da.a.vb-swords-of-the-chapter` `{trigger:'hitRoll', when:{weaponType:'melee'}, effect:{reroll:'ones'}, scope:{who:'self'}, code:'vbBladeguardStance', params:{stance:'swords'}}`; `da.a.vb-shields-of-the-chapter` `{trigger:'saveRoll', effect:{reroll:'ones'}, scope:{who:'self'}, code:'vbBladeguardStance', params:{stance:'shields', invulnOnly:true}}`. (b) `vbBladeguardPick`, `vbBladeguardStance`; (c) E1 save re-roll of 1s + `saveKind` (§7.1) |
| Weapon abilities | (a) | `PISTOL`, `ASSAULT`, `HEAVY`, `HAZARDOUS`, `EXTRA_ATTACKS`; incinerator modes via `profileGroup` (as `da.w.macro-plasma-incinerator`) |
| Invulnerable saves | (a) | `invuln`: Zacharial 4, Bladeguard 4 |
| Bases | (a) | `composition[].base` round: Zacharial 40, Intercessors 32, Hellblasters 32, Bladeguard 40 |

### 7.1 Exact signatures

**One (c) item (E1). No frozen contract (`src/engine/{types,actions,events,hooks,rng,decider,index}.ts`) changes.**
E1 adds a key to the untyped hook `data` record (`hooks-impl.ts` `Data = Record<string, unknown> & …`), so
`AttackRollHookContext` in hooks.ts is not edited. Built in parallel with the (b) hooks; the hooks code against these.

**E1 — Save re-roll of 1s + save kind on `onSaveRoll`** (`src/engine/attack.ts`, `src/engine/hooks-impl.ts`):
```ts
// attack.ts — every onSaveRoll collect payload gains the kind of save being rolled:
//   { attack: actx, roll: {...}, saveKind }   (collectSaveMods, saveOneDieSources, and the new function below)
export type SaveKind = 'armour' | 'invuln'
function collectSaveMods(ctx: EngineContext, actx: AttackContext, roll: DiceRoll, dieIndex?: number, saveKind?: SaveKind): RollHookResult[]
function saveOneDieSources(ctx: EngineContext, actx: AttackContext, roll: DiceRoll, dieIndex: number, saveKind?: SaveKind): string[]
// NEW: ids of defender-side sources whose onSaveRoll result is { reroll: 'ones' } for this die (gates see data.saveKind)
function saveOnesRerollSources(ctx: EngineContext, actx: AttackContext, roll: DiceRoll, dieIndex: number, saveKind: SaveKind): string[]
// NEW (as built): rollSaveWithOnesReroll — rolls the save under the `roll:<key>=` mark (behind miracleGate), then auto re-rolls
// (ctx.reroll(roll, ones, 'save')) every die i with canReroll && roll.dice[i] === 1 && saveOnesRerollSources(...).length > 0,
// once per key (mark `onesSaveDone:<key>`), emitting AbilityTriggered for the first source. doSaveStage and doSaveBatch call it
// BEFORE ctx.rollOnce, so the 'any.rollMade' Command Re-roll window only ever sees the final dice and a re-rolled die is
// never offered a Command Re-roll (same pattern as rollBatchD6 / the damage roll). saveRollOffers keeps the oneDie / fix offers.
// The saveKind travels ONLY in the untyped hook `data` record (saveRollPayload); hooks.ts is not edited.
```
- `doSaveStage` passes `setup.kind`. `doSaveBatch` passes the kind `saveSetup` gives the first candidate model of the
  batch (a batch shares one target number, so all its saves are the same kind; if `saveBatchTarget` already refuses
  mixed batches, nothing more is needed — otherwise make it return `null` when the candidates' kinds differ).
- `hooks-impl.ts`: `reroll:'ones'` from an `onSaveRoll` match is already classified defender-side (line ~374); the
  effect matcher must let `{reroll:'ones'}` through for `onSaveRoll` (today only `oneDie` is consumed there) — no
  other change. Existing `oneDie` save sources (Weaver of Fates) behave as before.

Hook semantics (all in `src/engine/factions/dark-angels.ts`, returned in `darkAngelsHooks`):

```ts
import { grantFightOnDeath } from '../fight-on-death'
export const VB_STRONGHOLD_KEY = 'da:stronghold'
export function vbWagesOfRetributionRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void
export function vbHuntersOfHereticsModelDestroyed(ctx: EngineContext, info: ModelDestroyedInfo): void
export function vbHuntersOfHereticsEndAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number
export function vbTakeTheStrongholdOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string): void
export function vbTakeTheStrongholdAnswer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
export function vbTakeTheStrongholdAmount(s: GameState, rule: ScoringRule, pid: PlayerId, holds: (id: ObjectiveId) => boolean): number
export function vbBladeguardOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean
export function vbBladeguardHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void

// src/engine/missions.ts (non-frozen):
//   missionService.modelDestroyed: add vbHuntersOfHereticsModelDestroyed(ctx, info) beside championOfTitanModelDestroyed
//   customAmount: case 'vbHuntersOfHereticsEnd': return vbHuntersOfHereticsEndAmount(s, rule, pid)
//                 case 'vbTakeTheStrongholdScore': return vbTakeTheStrongholdAmount(s, rule, pid, (id) => holds(ctx, id, pid))
//                 case 'vbHuntersOfHeretics': return 0   // event-driven (fan-out above)
//   PICK_CODES += 'vbTakeTheStrongholdPick'; runPick branch → vbTakeTheStrongholdOffer(ctx, pid, window, key)
```

1. **`vbWagesOfRetribution`** — `{kind:'ability', hook:'onUnitDestroyed', run:noop, runAt: vbWagesOfRetributionRun}`
   (Banishment Stone shape). `d = data.destroyedUnitId`; `holder = s.units[entry.holderUnitId]`; return unless the
   bearer model `entry.bearerModelId` is alive on the board; `oath = s.players[holder.player].oathTargetUnitId`; return
   unless `oath && leaderService.sameUnit(s, oath, d)` and `s.units[d].player !== holder.player`; killer
   `k = data.byUnitId` must exist, `s.units[k].player === holder.player`, and carry faction keyword ADEPTUS ASTARTES
   (`keywordsOf`). Roll `ctx.rollExpr('D6', {purpose:'ability', player, unitId: holder.id, commandRerollable:false})`;
   emit `AbilityTriggered` ("Wages of Retribution: rolled n"); `>= params.threshold` →
   `hookService.gainCp(ctx, holder.player, params.cp, entry.source.id)`.
2. **`vbHuntersOfHeretics`** — `missionHook('vbHuntersOfHeretics', 'onModelDestroyed')`. `vbHuntersOfHereticsModelDestroyed`:
   `pid = info.byPlayer`; find the rule with `code === 'vbHuntersOfHeretics'` in `pid`'s secondaries (Champion of
   Titan `rulesFor`), round in range; victim unit `info.unitId` owned by the other player and its datasheet keywords
   include `params.keyword`; killer `info.byUnitId` owned by `pid` with faction keyword `params.killerFactionKeyword`;
   award `min(pointsPer, cap − vpBySource[rule.id])` via the GK `awardVp` pattern + push `mission.scored`.
3. **`vbHuntersOfHereticsEnd`** — `missionHook('vbHuntersOfHereticsEnd')`. Amount: enemy units whose datasheet has
   `params.keyword`; none → 0 (DAV-4.1b); all have no live model on board/embarked (Reserves = destroyed) →
   `rule.pointsPer`; else 0.
4. **`vbTakeTheStrongholdPick`** — `{kind:'mission', hook:'onPhaseStart', run:noop, answer: vbTakeTheStrongholdAnswer}`.
   `vbTakeTheStrongholdOffer` (copy of `toilEarnsOffer`): `picker = otherPlayer(owner)`; options = non-removed
   objectives with `!pointInPolygon(o.pos, deploymentZone(s, picker))` (label = marker name/id, `hint:{objectiveId}`);
   `ctx.decide({kind:'chooseOption', player: picker, window, canPass:false, context:{topic:'abilityChoice', unitId:null,
   abilityId:null, data:{window, key, code:'vbTakeTheStrongholdPick', owner}}, options})`. Answer: validate the option
   is one offered, store `s.players[owner].secondaryState[VB_STRONGHOLD_KEY] = objectiveId`, emit `AbilityTriggered`
   (to the owner: "Take the Stronghold: <marker> chosen by the opponent"), resume `ctx.services.missions.onWindow(ctx,
   window, key)` (setup advance loop re-entry as Toil Earns). AI (utility.ts, picker side): choose the option farthest
   from the owner's deployment zone centroid.
5. **`vbTakeTheStrongholdScore`** — `missionHook('vbTakeTheStrongholdScore', 'onTurnEnd')`. Amount: stored id live
   (`!removed`) and `holds(id)` → `rule.pointsPer`, else 0.
6. **`vbUnyielding`** — `{kind:'stratagem', hook:'onTargetsDeclared', run:noop, check, apply}`. `check` = Daemonic
   Fervour's (Fight phase, no half of the target has fought / is fighting). `apply`: `threshold = params.threshold`
   minus 1 when some half of the target has keyword `params.bonusKeyword` (`hookService.keywordsFor`);
   `grantFightOnDeath(ctx.state, leaderService.canonicalUnitId(ctx.state, t.ids[0]), threshold)`; emit
   `AbilityTriggered` ("Unyielding: models fight on a n+"). AI: use when the target has ≥2 models and CP ≥ 1, or is the
   Bladeguard.
7. **`vbBladeguardPick`** — `{kind:'ability', hook:'onPhaseStart', run:noop, pick:{window:'fight.start',
   topic:'abilityChoice', offer: vbBladeguardOffer, handle: vbBladeguardHandle}}`. Offer: for each player (active
   first), each canonical board unit of that player carrying an ability with `code:'vbBladeguardPick'` and no phase
   mark `vbBladeguard:<unitId>=*` / `pick:vbBladeguard:<unitId>`: push `pick:vbBladeguard:<unitId>`, `ctx.decide({kind:
   'chooseOption', player, window, canPass:true, context:{topic:'abilityChoice', unitId, abilityId, data:{window, key,
   code:'vbBladeguardPick'}}, options:[swords, shields, decline]})`; return true (one decision at a time). Handle:
   `swords|shields` → push phase mark `vbBladeguard:<unitId>=<stance>`, emit `AbilityTriggered`; `decline` or `pass`
   → nothing. Phase marks clear at phase end = "until the end of the phase". AI: Swords in its own turn, Shields in
   the opponent's turn; decline only when the unit is not within 12" of any enemy unit.
8. **`vbBladeguardStance`** — `{kind:'ability', hook:'onHitRoll', hooks:['onSaveRoll'], run:noop, gateEffect(state,
   holder, entry, data)}`: `stance = entry.source.params.stance`; true iff phase mark
   `vbBladeguard:<canonicalUnitId(holder)>=<stance>` exists and, when `params.invulnOnly`, `data.saveKind === 'invuln'`
   (E1). Swords: the descriptor's `when:{weaponType:'melee'}` limits it to melee attacks.

Test files: `tests/engine/dark-angels-the-vengeful-brethren.test.ts` (DAV-003…DAV-019),
`tests/data/dark-angels-the-vengeful-brethren.test.ts` (DAV-001, DAV-002), Playwright e2e (DAV-020). Existing `DAR-`
tests must stay green unchanged.

## 8. Test IDs

Same list as the `DAV` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| DAV-001 | DAV-1 | patrol `da.cp.the-vengeful-brethren` loads (faction `dark-angels`): 4 units, 19 models; Zacharial is WARLORD with Determined Combatant and not attached; default secondary Hunters of Heretics; stratagems are the three `da.s.vb-*` ids; `faction.json` lists both patrols; Mordekai's Judgement still loads unchanged (its `da.intercessor-squad` untouched) |
| DAV-002 | DAV-6 | data: every stat / weapon row of §6 matches; invulns 4+/—/—/4+; Zacharial has no LEADER; the VB Intercessors are 10 identical models with Patrol Squads; reused `sm.w.bolt-pistol` / `sm.w.close-combat-weapon` / `da.w.bolt-rifle` unchanged; incinerator profiles share `profileGroup` |
| DAV-003 | DAV-1.2 | Patrol Squads: split offered at Declare Battle Formations; split → two 5-model BATTLELINE units, each its own stratagem target and objective holder |
| DAV-004 | DAV-6.1 | Refuse to Yield: power-fist-like D2 attack allocated to Zacharial → 1 damage; D3 → 2; D1 → 1; ranged and melee both halved |
| DAV-005 | DAV-3.1 | Determined Combatant: Zacharial within 3" of an uncontrolled marker → boltstorm gauntlet and both melee weapons have Sustained Hits 1 (crit hit → 2 hits); 4" away → none; removed marker → none |
| DAV-006 | DAV-3.2 | Wages of Retribution: Hellblasters destroy the Oath target, Zacharial on the board, D6 = 4 → +1 CP; D6 = 3 → none; Zacharial destroyed or in Reserves → no roll; a non-Oath unit destroyed → no roll; second CP gain in the same round discarded (R-4.2) |
| DAV-007 | DAV-3.2a | Wages vs an attached Oath target: the bodyguard half destroyed → roll; later the leader half destroyed → roll again; destroyed by the enemy's own Hazardous → no roll |
| DAV-008 | DAV-4.1 | Hunters of Heretics: an enemy CHARACTER model destroyed by Intercessors → 5 VP (in either player's turn, any phase); a bodyguard model of an attached unit → 0; an enemy CHARACTER dying to its own Hazardous → 0; two characters → 10 |
| DAV-009 | DAV-4.1b | Hunters end bonus: battle end with every enemy CHARACTER destroyed → +5; one alive → 0; enemy CHARACTER unit still in Reserves at the end counts destroyed → +5; an enemy army without CHARACTERs → 0 |
| DAV-010 | DAV-4.2 | Take the Stronghold: at the start of Deploy Armies the OPPONENT gets a `chooseOption` listing only markers outside its own deployment zone; end of DA turn controlling it → 5 VP (round 1 included); not controlled → 0; end of the opponent's turn → 0; marker removed → 0; Hunters chosen → no pick |
| DAV-011 | DAV-5.1 | Unyielding: enemy fights the Intercessors (not yet fought) → offered; used → a destroyed Intercessor stays on a 4+ (die 4 stays, 3 removed) and fights after the enemy finishes, then is removed |
| DAV-012 | DAV-5.1a | Unyielding on Bladeguard: die 3 stays (3 + 1 = 4); die 2 removed; not offered for a unit that already fought this phase; not offered in the Shooting phase; offered in both players' Fight phases |
| DAV-013 | DAV-5.2 | March of Vengeance: used on Bladeguard → Consolidation up to 6" (toward the enemy, and the objective form too); Pile-in still 3"; expires at end of phase; usable in the opponent's Fight phase |
| DAV-014 | DAV-5.3 | Relic Munitions: own Shooting phase, Intercessors not yet shot → bolt rifle crit hit auto-wounds (Lethal Hits); Hellblasters → plasma incinerator (both profiles) gains nothing, their bolt pistols gain Lethal Hits; a unit that already shot is not offered; gone next phase |
| DAV-015 | DAV-6.3 | Bladeguard pick at the start of each Fight phase (both turns): Swords → melee hit 1s re-rolled, saves unchanged; Shields → an invulnerable save of 1 re-rolled (AP −3 attack saved on the 4+ invuln); decline → neither; next phase a fresh choice |
| DAV-016 | DAV-6.3, E1 | Shields never re-rolls an armour save (AP 0 attack, 3+ armour roll of 1 stays failed); a re-rolled die cannot be Command-Re-rolled; fast-rolled save batch of the Bladeguard also re-rolls 1s; Weaver of Fates `oneDie` save offers unchanged (regression) |
| DAV-017 | DAV-6 | weapons: plasma supercharge Hazardous 1 destroys a Hellblaster, standard does not; bolt rifle / incinerator Assault after Advance and Heavy +1 when stationary; Zacharial attacks with relic chainsword (Extra Attacks) and power fist in one fight; boltstorm gauntlet Pistol in Engagement Range |
| DAV-018 | DAV-1.4 | Zacharial alone: Go to Ground and Epic Challenge offered (INFANTRY, CHARACTER); no attach option in setup |
| DAV-019 | DAV-3.2, 4.2, 5.1, 6.3 | AI: Bladeguard pick and opponent's Stronghold pick answered by the AI; a full AI-vs-AI game with this patrol (vs Strike Force Octavius and the Mordekai mirror) finishes without a stuck decision; the sim rotation includes the patrol |
| DAV-020 | DAV-1 | e2e (Playwright): start screen → Dark Angels → patrol picker → The Vengeful Brethren → deployment shows 19 models (Zacharial, 10 Intercessors, 5 Hellblasters, 3 Bladeguard) and the game reaches battle round 1 |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3), true-scale to 28 mm; bases rules-true. Palette from the
`dark-angels` faction `paintScheme` (deep green `#1f3b2a`, bone `#d9cfb4`, dark red `#8e1b1b`); no chapter icons or
logos. The Intercessors reuse the Mordekai build's `intercessor` GLB (same loadout: bolt rifle, no sergeant on this
card), so only three new slugs are needed. Per owner instruction (2026-10-16), all GLBs for this patrol are generated
on **Alteisen** (`ssh alteisen`, E:\AI pipeline), not on the local GPU.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `master-zacharial` | `da.master-zacharial/zacharial` | 1 | 1.35 | 40 mm | A chibi commander in extra-bulky deep-green heavy armour with a long bone-white robe skirt and a dark red cape, bare stern face with a short grey beard, a huge crackling power gauntlet with built-in twin gun barrels on one arm and a toothed chainsword raised in the other. |
| `intercessor` (reuse) | `da.vb.intercessor-squad/intercessor` | 10 | 1.1 | 32 mm | (existing Mordekai's Judgement slug) |
| `hellblaster` | `da.hellblaster-squad/hellblaster` | 5 | 1.1 | 32 mm | A chibi armoured soldier in rounded deep-green plate with bone shoulder rims, holding a chunky rifle with a glowing blue coil chamber and a thick cable running to a small backpack canister. |
| `bladeguard-veteran` | `da.bladeguard-veteran-squad/bladeguard` | 3 | 1.15 | 40 mm | A chibi veteran knight in ornate deep-green armour with a bone-coloured hooded tabard, a tall rectangular storm shield on one arm and a blue-glowing broadsword held high, a stubby pistol on the hip. |

## 10. Other Dark Angels patrols (appendix)

- **Mordekai's Judgement** — Index 10, June 2023, already playable (dark-angels.md): Chaplain Mordekai ×1 (WARLORD,
  Leader → Intercessor Squad), Intercessor Squad ×5, Inceptor Squad ×3, Redemptor Dreadnought ×1 — 4 units, 10 models.
