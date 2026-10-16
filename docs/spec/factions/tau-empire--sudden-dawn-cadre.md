# Patrol spec — T'au Empire: Sudden Dawn Cadre

Own-words data spec for the **second** T'au Empire Combat Patrol, same shape as 11-combat-patrol §4. It covers only
this patrol: the faction, its army rule and the first patrol (Protectors of Aun'shar) live in
[tau-empire.md](tau-empire.md) and are cited by id, never restated. Rule ids `SDC-<section>.<n>` are cited by the
`SDC-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose is ours.
Data id prefix stays `tau.` (faction id `tau-empire`, faction keyword `T'AU EMPIRE`); every id below marked **new** is
appended to the existing faction files, nothing the first patrol uses is edited.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| T'au Empire box "Sudden Dawn Cadre" (primary for this file) | https://wahapedia.ru/wh40k10ed_cp/factions/sudden-dawn-cadre/ | Index 10, last update May 2024 |
| First T'au patrol (shared ids) | [tau-empire.md](tau-empire.md) §0 | Index, June 2023 |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

The page was read three times through a summarising fetcher (third pass = raw table cells for the doubtful values).
Anything still open is marked **[unconfirmed]**; rulings we had to make are marked **[interpretation]**.

## 1. Roster

4 units, 22 models (24 with the Pathfinders split). Faction keyword T'AU EMPIRE on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `cloudspear` | Commander Cloudspear | 1 | airbursting fragmentation projector; plasma rifle; battlesuit fists (Commander); 2 shield drones; weapon support system | **WARLORD** (the only CHARACTER), carries the enhancement. Not a Leader — operates alone. |
| `pathfinders` | Pathfinder Team | 10 | Shas'ui ×1: pulse carbine, pulse pistol, close combat weapon, grav-inhibitor drone; Pathfinder ×3: rail rifle, pulse pistol, close combat weapon; Pathfinder ×6: pulse carbine, pulse pistol, close combat weapon | **Patrol Squads** (SDC-1.1) |
| `breachers` | Breacher Team | 10 | every model: pulse blaster, pulse pistol, close combat weapon (one model is modelled as the Shas'ui, no rules difference) | — |
| `devilfish` | Devilfish | 1 | accelerator burst cannon; 2 twin pulse carbines; armoured hull | TRANSPORT 12 (SDC-6.7) — first real transport in the game |

| Id | Rule |
|---|---|
| SDC-1.1 | Patrol Squads (Pathfinders, CP-1.8 / E5 `splitUnits`): at Declare Battle Formations the unit may become two 5-model units. Half **A** = the Shas'ui (with the grav-inhibitor drone) + 4 carbine Pathfinders; half **B** = the 3 rail rifle Pathfinders + 2 carbine Pathfinders. Refs `pathfinders-a` / `pathfinders-b`. |
| SDC-1.2 | No Leader attachments exist in this patrol. Cloudspear is WARLORD by default (no other CHARACTER). |
| SDC-1.3 | Start embarked **[interpretation of P5]**: at Declare Battle Formations either infantry unit (or one Pathfinder half) may start embarked in the Devilfish, capacity permitting (10 + 10 = 20 > 12, so at most one 10-model unit, or one 5-model half + nothing else of 10). Default setup: nothing embarked. |

## 2. Faction ability — For the Greater Good (all four datasheets)

Identical to the first patrol: reuse `tau.a.for-the-greater-good` unchanged (rules TAU-2.1 – TAU-2.6, hook
`forTheGreaterGood`, engine C1/C5). Patrol-specific notes:

| Id | Note |
|---|---|
| SDC-2.1 | MARKERLIGHT Observers here: Pathfinder Team (either half) and Breacher Team → Guided attacks vs the Spotted unit gain [IGNORES COVER]. Cloudspear and the Devilfish can observe but give no Ignores Cover. |
| SDC-2.2 | An embarked unit is not on the battlefield, so it can be neither Guided nor Observer (falls out of `ftggObserverEligible` via the board check; no new code). |
| SDC-2.3 | Weapon Support System (SDC-6.2) ignores hit-roll *modifiers*; FtGG changes Ballistic Skill (a characteristic), so a Guided Cloudspear keeps the BS change while ignoring e.g. the Electro-static/Stealth −1 of its target. |

## 3. Enhancements (Commander Cloudspear, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Electro-static Flares | default | Bearer has a 4+ invulnerable save. **Aura:** while a friendly T'AU EMPIRE unit that is not a DEVILFISH is within 6" of the bearer, (i) enemy units cannot use the Fire Overwatch stratagem to shoot at it, and (ii) each ranged attack that targets it subtracts 1 from the hit roll. The bearer's own unit is always in range (R-10.11), so Cloudspear itself benefits. |
| Prototype Systems | optional | Bearer has a 4+ invulnerable save. Each time the bearer is selected to shoot (own Shooting phase or Fire Overwatch), you may re-roll **one** hit roll and **one** wound roll among that activation's attacks, and you may re-roll the dice that set the Attacks of its airbursting fragmentation projector. |

| Id | Rule |
|---|---|
| SDC-3.1 | Flares (ii) is a hit-roll modifier: it does not stack past the R-6 ±1 cap with Stealth or other −1s. |
| SDC-3.2 | Flares (i) is checked when the opponent would use Fire Overwatch, against the moving/charging unit's position at that moment **[interpretation]**. |
| SDC-3.3 | Prototype re-rolls: one die per kind per activation, shared across all its weapon batches; a die is never re-rolled twice (R-1.6), so it cannot combine with a Command Re-roll on the same die. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Surprise Attack | default | At the end of **your** turn (`turn.end`, `who: active`): battle rounds 1–2 → 4 VP per objective marker in No Man's Land you control; rounds 3–5 → 2 VP per such marker. Per-turn maximum 15 (rounds 1–2), 10 (rounds 3–4), 5 (round 5). |
| Ethereal Edict | optional | At the start of battle round 1 your **opponent** picks one unit of **their own** army (any unit; an attached pair is one candidate; Reserves allowed). At the end of the battle you score 12 VP if that unit is destroyed. |

| Id | Rule |
|---|---|
| SDC-4.1 | No Man's Land marker = marker whose centre is inside neither deployment-zone polygon (11-combat-patrol §2 note); removed/razed markers never count. |
| SDC-4.2 | The source's prose gives 4/2 VP per marker while its table header "VP scored" lists 15 / 10 / 5 per round band. We read the table as per-turn caps **[interpretation, unconfirmed]** — with ≤ 3 NML markers on every CP mission only the round-5 cap (5) can actually bite. |
| SDC-4.3 | Ethereal Edict: "destroyed" = every half `location === 'destroyed'`; a unit still in Reserves at battle end counts as destroyed (R-5.16; R-5.14 already culls it at round 3). If the opponent has no unit at the pick, no pick and no VP. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Fight by the Code | 1 | strategicPloy | your Shooting phase, between activations (`shooting.start`, `shooting.attacksResolved`) | one own T'AU EMPIRE unit | until end of phase the unit is eligible to shoot even though it Fell Back this turn |
| Rampart of Fire | 1 | battleTactic | your Shooting phase, between activations | one own T'AU EMPIRE unit not yet selected to shoot this phase | until end of phase, attacks by its models against an enemy unit within 10" improve AP by 1 (AP 0 → −1) |
| Lives Before Territory | 1 | strategicPloy | opponent's Shooting phase, just after an enemy unit has selected its targets (`shooting.targetsDeclared`) | one own T'AU EMPIRE INFANTRY or BATTLESUIT unit that is a target of one or more of that unit's attacks | the unit makes a Normal move of up to D6"; then, until end of phase, every attack that targets it gets the Benefit of Cover |

| Id | Rule |
|---|---|
| SDC-5.1 | Fight by the Code is offered only for a unit whose `turn.moveType === 'fallBack'` (using it on any other unit has no effect; offering it would only be noise). |
| SDC-5.2 | Rampart "within 10"" is the attack's distance to the target unit (`attack.range`, the same distance `range:{within}` conditions read). Applies to every attack of the unit in that phase, ranged or Pistol/melee alike. |
| SDC-5.3 | Lives Before Territory: a unit within Engagement Range cannot make a Normal move, so the stratagem is not offered for it **[interpretation]**. Eligible targets here: both Pathfinder/Breacher units and Cloudspear (BATTLESUIT); the Devilfish is neither. |
| SDC-5.4 | After the move the shooting resumes against the original declarations: an attacking model whose target is now out of its weapon's range, or (non-Indirect) no longer visible, loses those attacks **[interpretation]**. Cover applies to every attack against the unit until end of phase (all enemy units, not only the triggering one), denied by [IGNORES COVER] and by the Sv 3+ vs AP 0 rule (R-3.12) as usual. |

Core stratagems: all apply per 10-rules §11 subject to their own gates (Go to Ground: Pathfinders/Breachers; Tank Shock:
Cloudspear and Devilfish (VEHICLE); Epic Challenge: Cloudspear; Grenade: none — no GRENADES keyword; Fire Overwatch:
every unit).

## 6. Datasheets

| Unit (new datasheet id) | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Commander Cloudspear (`tau.commander-cloudspear`) | 1 | 60 mm | 8 | 5 | 2+ | — (4+ from either enhancement) | 6 (+2 drones = 8) | 7+ | 2 | VEHICLE, WALKER, FLY, CHARACTER, BATTLESUIT, COMMANDER IN ENFORCER BATTLESUIT, COMMANDER CLOUDSPEAR | Deep Strike; For the Greater Good; Shield Drone ×2; Weapon Support System |
| Pathfinder Team (`tau.pathfinder-team`) | 10 | 25 mm | 7 | 3 | 4+ | — | 1 | 7+ | 1 | INFANTRY, MARKERLIGHT, PATHFINDER TEAM | Scouts 7"; For the Greater Good; Grav-inhibitor Drone (Shas'ui wargear); Patrol Squads |
| Breacher Team (`tau.breacher-team`) | 10 | 25 mm | 6 | 3 | 4+ | — | 1 | 7+ | 2 | INFANTRY, BATTLELINE, MARKERLIGHT, FIRE WARRIOR, BREACHER TEAM | For the Greater Good; Breach and Clear |
| Devilfish (`tau.devilfish`) | 1 | 60 mm round flying base | 12 | 9 | 3+ | — | 13 | 7+ | 2 | VEHICLE, FLY, TRANSPORT, DEDICATED TRANSPORT, DEVILFISH | Deadly Demise D3; For the Greater Good; Transport 12 |

Faction keyword (all): T'AU EMPIRE. No datasheet here shares a profile with the first patrol, so all four are new ids.
**[unconfirmed]** The CP card shows no Damaged band for the Devilfish (matched play has one) and W 13 (matched play 12);
we follow the CP card: no `damaged`, W 13. **[interpretation]** Shield Drone says "add 1 to Wounds" and the card lists
two, so the model starts at W 8 (data: `stats.W: 6`, `statsOverride: {W: 8}` on the model, the drone ability carries
`modifyStat W 0` as a label only, like the Custodes praesidium shield — no runtime W modification).

| Id | Ability | Rule |
|---|---|---|
| SDC-6.1 | Shield Drone (Cloudspear, wargear ×2) | +1 Wounds per drone; already folded into the model's W 8 (see note). |
| SDC-6.2 | Weapon Support System (Cloudspear, wargear) | each time the bearer makes a ranged attack, its hit roll ignores every modifier (we always ignore all: nothing in this game gives T'au a positive hit modifier, so "any or all" collapses to "all"). Ballistic Skill changes (FtGG) are not modifiers and still apply. Indirect Fire's −1 is ignored too, but its unmodified 1–3 auto-fail is not a modifier and stays. |
| SDC-6.3 | Grav-inhibitor Drone (Pathfinder Shas'ui, wargear) | when an enemy unit declares a charge that includes the bearer's unit as a target, that charge roll gets −2. Not cumulative with other negative modifiers to that roll: the total negative modifier is the more severe of −2 and the sum of the other negatives (e.g. with Laser-Marked −2 → −2; with a −1 → −2; with −3 → −3). Positive modifiers still add. Ends when the Shas'ui dies; after a Patrol Squads split only half A has it. |
| SDC-6.4 | Breach and Clear (Breacher Team) | each ranged attack by a model of this unit that targets an enemy unit within range of any objective marker may re-roll its wound roll (any result). |
| SDC-6.5 | Scouts 7" (Pathfinders) | R-10.8. **[interpretation]** If the Pathfinders (alone) start embarked in the Devilfish, the Devilfish may make the 7" Scouts move instead (R-10.8 last sentence). |
| SDC-6.6 | Deep Strike (Cloudspear) | native; CP R-5.14 limits apply. |
| SDC-6.7 | Transport (Devilfish) | capacity 12 T'AU EMPIRE INFANTRY models; cannot carry BATTLESUIT, KROOT or VESPID STINGWINGS models. R-5.17 – R-5.20 apply. No Firing Deck on the CP card. |
| SDC-6.8 | Deadly Demise D3 (Devilfish) | native (R-10.4), rolled before passengers disembark (R-5.20). |

Wargear per model:
| Unit | Model (`modelId`) | Ranged | Melee |
|---|---|---|---|
| Commander Cloudspear | `cloudspear` | airbursting fragmentation projector, plasma rifle | battlesuit fists (Commander) |
| Pathfinder Team | `shasui` ×1 | pulse carbine, pulse pistol | close combat weapon |
| Pathfinder Team | `pathfinder-rail` ×3 | rail rifle, pulse pistol | close combat weapon |
| Pathfinder Team | `pathfinder-carbine` ×6 | pulse carbine, pulse pistol | close combat weapon |
| Breacher Team | `shasui` ×1, `breacher` ×9 | pulse blaster, pulse pistol | close combat weapon |
| Devilfish | `devilfish` | accelerator burst cannon, twin pulse carbine ×2 | armoured hull |

Weapon profiles (reused ids cited, new ids **bold**):
| Weapon | Id | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| airbursting fragmentation projector | **`tau.w.airbursting-fragmentation-projector`** | 24" | D6 | 3+ | 3 | 0 | 1 | Blast, Indirect Fire |
| plasma rifle | **`tau.w.plasma-rifle`** | 24" | 1 | 3+ | 8 | −3 | 3 | — |
| battlesuit fists (Commander) | **`tau.w.battlesuit-fists-commander`** | melee | 3 | 4+ | 5 | 0 | 1 | — (differs from `tau.w.battlesuit-fists` A2 WS5+ S4) |
| pulse carbine | `tau.w.pulse-carbine` (reused) | 20" | 2 | 4+ | 5 | 0 | 1 | — |
| pulse pistol | `tau.w.pulse-pistol` (reused) | 12" | 1 | 4+ | 5 | 0 | 1 | Pistol |
| close combat weapon | `tau.w.close-combat-weapon` (reused) | melee | 1 | 5+ | 3 | 0 | 1 | — |
| rail rifle | **`tau.w.rail-rifle`** | 30" | 1 | 5+ | 10 | −4 | 3 | Devastating Wounds, Heavy |
| pulse blaster | **`tau.w.pulse-blaster`** | 10" | 2 | 3+ | 6 | −1 | 1 | Assault |
| accelerator burst cannon | **`tau.w.accelerator-burst-cannon`** | 18" | 4 | 4+ | 6 | −1 | 1 | — |
| twin pulse carbine | **`tau.w.twin-pulse-carbine`** | 20" | 2 | 4+ | 5 | 0 | 1 | Assault, Twin-linked |
| twin pulse carbine (second) | **`tau.w.twin-pulse-carbine-2`** | 20" | 2 | 4+ | 5 | 0 | 1 | Assault, Twin-linked (second carbine on the Devilfish; same profile as above, separate id) |
| armoured hull | **`tau.w.armoured-hull`** | melee | 3 | 5+ | 6 | 0 | 1 | — |

Rail rifle BS 5+ and pulse blaster BS 3+ were re-read from the raw cells (they differ from matched play; the CP card wins).

New ability ids: `tau.a.shield-drone`, `tau.a.weapon-support-system`, `tau.a.grav-inhibitor-drone`,
`tau.a.breach-and-clear`. New enhancement ids: `tau.e.electrostatic-flares` (+ `.effect`, `.aura`),
`tau.e.prototype-systems` (+ `.effect`, `.hit`, `.wound`, `.projector`). New stratagem ids:
`tau.s.fight-by-the-code`, `tau.s.rampart-of-fire`, `tau.s.lives-before-territory`. Secondaries (in the patrol file):
`tau.sec.surprise-attack`, `tau.sec.ethereal-edict`. Patrol `tau.cp.sudden-dawn-cadre`; faction.json gains a second
detachment `tau.d.sudden-dawn-cadre` (rule `tau.a.for-the-greater-good`, the 3 stratagems, the 2 enhancements) and the
patrol id appended to `combatPatrols` — existing entries untouched.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered through
`tauEmpireHooks` in `src/engine/factions/tau-empire.ts`); (c) = engine change beyond a code hook (signatures in §7.1).

| Rule | Enc. | Encoding |
|---|---|---|
| For the Greater Good (SDC-2) | (a) reuse | `tau.a.for-the-greater-good` on all 4 datasheets; hooks `forTheGreaterGood` + C1/C5 unchanged. |
| Patrol Squads (SDC-1.1) | (a) | patrol unit `patrolSquads:[{ref:'pathfinders-a', size:5, wargear:[{modelId:'shasui',count:1,…},{modelId:'pathfinder-carbine',count:4,…}]}, {ref:'pathfinders-b', size:5, wargear:[{modelId:'pathfinder-rail',count:3,…},{modelId:'pathfinder-carbine',count:2,…}]}]` (E5, as Sanctuary Guardians) |
| Electro-static Flares — 4+ invuln | (a) | enhancement `effect` list (C7): ① `{id:'tau.e.electrostatic-flares.effect', trigger:'always', effect:{invuln:'4+'}, scope:{who:'bearer'}}` |
| Electro-static Flares — −1 to hit aura | (a) | ② `{id:'….aura', trigger:'always', when:{targetNotKeyword:'DEVILFISH'}, effect:{stealth:true}, scope:{who:'friendly', within:6}}` — `stealth` is the defender-side "−1 to hit vs ranged" key; `targetNotKeyword` excludes the Devilfish. Same descriptor also carries `code:'electrostaticFlares'` (next row). |
| Electro-static Flares — no Overwatch | (b)+(c) | `electrostaticFlares` hook (kind `ability`, `forceScope:{who:'friendly', within:6}`) implements E4 `forbidsOverwatchAgainst(state, entry, targetUnitId)`: true iff `targetUnitId` canonical is a friendly (holder's player) board unit, no half has DEVILFISH, and `leaderService.unitDistance(state, targetUnitId, holderId) <= 6` (holder's own unit always true). `fireOverwatch.check` refuses when `hookService.overwatchForbiddenAgainst(state, enemyId)`. |
| Prototype Systems — 4+ invuln | (a) | ① `{trigger:'always', effect:{invuln:'4+'}, scope:{who:'bearer'}}` |
| Prototype Systems — one hit + one wound re-roll | (a)+(c) | ② `{id:'….hit', trigger:'hitRoll', when:{weaponType:'ranged'}, effect:{reroll:'oneDie'}, scope:{who:'bearer'}}`, ③ same with `trigger:'woundRoll'` (`….wound`). E2 teaches `rollBatchD6` the `oneDie` kind (RerollKind already lists it — no frozen change). |
| Prototype Systems — re-roll projector Attacks | (b) | ④ `{id:'….projector', trigger:'always', code:'prototypeSystems', params:{weaponId:'tau.w.airbursting-fragmentation-projector'}, scope:{who:'bearer'}}`; hook implements existing `rerollsAttackCount(state, entry, attackerModelId, weapon)`: true iff `attackerModelId === entry.bearerModelId` and `weapon.id === params.weaponId` (same query as Astra Militarum's C4 user). |
| Shield Drone ×2 | (a) | `stats.W 6` + model `statsOverride:{W:8}`; ability `tau.a.shield-drone` `{trigger:'always', effect:{modifyStat:{stat:'W', value:0}}}` (label only, praesidium-shield pattern) |
| Weapon Support System | (a) | `{trigger:'hitRoll', when:{weaponType:'ranged'}, effect:{ignoreModifiers:'hit'}, scope:{who:'bearer'}}` (attack.ts `evalD6Die` already zeroes the net modifier; Indirect's auto-fail threshold is separate and stays) |
| Grav-inhibitor Drone | (b)+(c) | ability `{trigger:'chargeRoll', code:'gravInhibitorDrone', effect:{modifyRoll:{roll:'charge', value:-2}}, params:{modelId:'shasui', nonCumulativeNegative:true}}`. Hook: `hooks:['onChargeRoll']`, `forceScope:{who:'enemy'}`, `gate(state, holder, entry, data)`: holder still has a model with `datasheetModelId === params.modelId` (the `wargearBearerAlive` test) **and** `data.targetUnitIds` contains a unit `leaderService.sameUnit` as the holder. E3 makes `chargeRollModifier` honour `params.nonCumulativeNegative`. |
| Breach and Clear | (a) | `{trigger:'woundRoll', when:{weaponType:'ranged', targetOnObjective:true}, effect:{reroll:'all'}}` (`targetOnObjective` = target unit within range of any marker; `all` = fails auto-re-rolled, successes offered via `rerollOffer`) |
| Scouts 7" / Deep Strike / Deadly Demise D3 | (a) | `coreAbilities` `SCOUTS` value 7, `DEEP_STRIKE`, `DEADLY_DEMISE` value `'D3'` |
| Scouts via Dedicated Transport (SDC-6.5) | (c) | E1 part f: the pre-battle Scouts step also offers a DEDICATED TRANSPORT whose embarked units all have SCOUTS; the move uses the smallest Scouts value among them. |
| Transport 12 (SDC-6.7) + start embarked (SDC-1.3) | (c) | E1 (transport data, setup embarkation, interactive embark/disembark, R-5.20 destroyed-transport disembark). |
| Fight by the Code | (a) | stratagem `window:['shooting.start','shooting.attacksResolved']`, `who:'active'`, `condition:{phase:'shooting'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:"T'AU EMPIRE"}, state:'fellBackNotYetShot', count:1}]`, `effect:{shootAfterFallBack:true}`, `duration:'untilEndOfPhase'` |
| Rampart of Fire | (a) | same window/who, `targets:[{…, state:'notYetShot'}]`, `effect:{when:{range:{within:10}}, modifyStat:{stat:'AP', value:-1}}`, `duration:'untilEndOfPhase'` |
| Lives Before Territory | (a)+(b)+(c) | stratagem `window:'shooting.targetsDeclared'`, `who:'reactive'`, `condition:{phase:'shooting', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:"T'AU EMPIRE"}, state:'targetedByAttack', count:1}]`, `code:'livesBeforeTerritory'`, `params:{dice:'D6', keywords:['INFANTRY','BATTLESUIT']}`, `duration:'untilEndOfPhase'`, no `effect`. (b) hook `livesBeforeTerritory` (kind `stratagem`): `check` = target on board, some half has a keyword in `params.keywords`, `!leaderService.inEngagementWithEnemy(state, target)`; `apply` = push phase mark `cover:<canonical target id>` (read by `hasBenefitOfCover`, E5; phase marks expire at phase end = "until end of phase"), roll D6 (`purpose:'stratagem'`), emit `AbilityTriggered`, then `startReactiveMove(ctx, target, roll, stratagem.id, 'shooting.targetsDeclared')` (C6, shooting module already delegates reactive moves). E6 re-validates the attacker's declarations afterwards. |
| Surprise Attack | (b) | secondary `scoring:[{id:'surprise-attack-early', when:'turn.end', who:'active', rounds:{from:1,to:2}, rule:'custom', code:'surpriseAttack', pointsPer:4, cap:15}, {id:'surprise-attack-mid', …rounds 3–4, pointsPer:2, cap:10}, {id:'surprise-attack-late', …rounds 5–5, pointsPer:2, cap:5}]`; `surpriseAttack` = `missionHook('surpriseAttack', 'onTurnEnd')` + `surpriseAttackAmount(state, rule, pid)` in `factions/tau-empire.ts`, wired in `missions.ts` beside `kauyonLure`: `rule.pointsPer ×` (number of non-removed markers controlled by `pid` whose centre is outside both `mission.deploymentZones` polygons); cap applied by the generic scorer. |
| Ethereal Edict | (b)+(c) | secondary `scoring:[{id:'ethereal-edict-pick', when:'round.start', rounds:{from:1,to:1}, rule:'custom', code:'etherealEdictPick', pointsPer:0, cap:0}, {id:'ethereal-edict', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', code:'etherealEdictScore', pointsPer:12, cap:12}]`. `etherealEdictPick` (added to `PICK_CODES`): candidates = canonical units of the **opponent** with ≥ 1 half not destroyed (Reserves included, attached pair once); E7 lets `offerChoice` ask the opponent (`topic:'abilityChoice'`, `data.owner = pid`); answer stores `players[pid].secondaryState['tau:edict'] = { halves: UnitId[] }`. `etherealEdictScore` amount: 12 iff stored and every half has `location === 'destroyed'` (R-5.14 cull already destroyed stranded Reserves), else 0. AI answer for the picker: the candidate with the highest `sum(W) × T` among its models (hardest to kill). |
| Patrol / detachment / ids | (a) | §6 id list; `warlord:'cloudspear'`, `enhancements:[{id:'tau.e.electrostatic-flares', default:true}, {id:'tau.e.prototype-systems', default:false}]`, enhancement `restriction:{keyword:['COMMANDER CLOUDSPEAR']}` |
| Weapon abilities | (a) | `BLAST`, `INDIRECT_FIRE`, `DEVASTATING_WOUNDS`, `HEAVY`, `ASSAULT`, `TWIN_LINKED`, `PISTOL` |

Totals: **7 new code hooks** (`electrostaticFlares`, `prototypeSystems`, `gravInhibitorDrone`, `livesBeforeTerritory`,
`surpriseAttack`, `etherealEdictPick`, `etherealEdictScore`) + reused `forTheGreaterGood` (with C1/C5) and C6
`startReactiveMove`; **7 engine changes (E1–E7)**. Exactly **one frozen-contract change**: E1 adds an optional
`PlayerSetup.embarked` field to `src/engine/types.ts` (additive, same kind as E5 `splitUnits`; needs a matching line in
00-architecture). Everything else lives in non-frozen files (`code-hooks.ts`, `hooks-impl.ts`, `attack.ts`,
`phases/*.ts`, `transports.ts`, `setup.ts`, `missions.ts`, `data/types.ts`, schemas, validate-data).

### 7.1 Engine changes (c) — exact signatures

The (b) hooks code against these before they exist; the engine agent implements them in parallel.

```ts
// E1 Transports (Devilfish) — data, setup embarkation, interactive embark/disembark, destroyed-transport disembark
// src/data/types.ts (not frozen) + datasheet schema + 20-data-schema §5 row
export interface TransportData { capacity: number; keywords?: Keyword[]; excludeKeywords?: Keyword[]; firingDeck?: number }  // capacity counted in models
export interface DatasheetData { /* … */ transport?: TransportData }
//   Devilfish: { capacity: 12, keywords: ["T'AU EMPIRE", 'INFANTRY'], excludeKeywords: ['BATTLESUIT', 'KROOT', 'VESPID STINGWINGS'] }
// src/engine/types.ts PlayerSetup — FROZEN, additive optional field (00-architecture §contracts note required)
embarked?: { unitRef: string; transportRef: string }[]            // unitRef may be a Patrol Squads half ref
// src/engine/transports.ts (not frozen) — capacity() reads datasheet.transport (TRANSPORT:<n> keyword stays a fallback)
canCarry(state: GameState, passengerUnitId: UnitId, transportUnitId: UnitId): boolean   // keyword gates + spare capacity
disembarkZone(state: GameState, transportUnitId: UnitId): Polygon  // transport footprint grown by 3" (32-gon)
emergencyDisembark(ctx: EngineContext, transportUnitId: UnitId): void
//   R-5.20, called after Deadly Demise when a transport with passengers is destroyed: auto-place each passenger unit
//   wholly within 3" (else 6") outside ER via the deploy-placement solver; 1 MW per model on a D6 of 1 (1–3 for 6");
//   unplaceable models destroyed; unit Battle-shocked, counts as Normal move, cannot charge this turn.
// src/engine/setup.ts createGame: validate `embarked` (refs exist in the player's fielded units, transport has
//   `transport`, canCarry) → transportService.embark at Declare Battle Formations; passengers never appear in
//   DeployUnitDecision.unitIds and are skipped by the R-5.14 Reserves cull while their transport is on the board.
// src/engine/phases/movement.ts
export function disembarkCandidates(state: GameState, player: PlayerId): UnitId[]
//   own embarked units with transportService.disembarkMode(...) !== null; appended to ChooseUnitToActivateDecision
//   .context.eligible in the Movement phase. Choosing one raises a DeployUnitDecision (zone = disembarkZone,
//   constraints.mustEndOutsideEngagement) resolved through the existing resolveArrival/checkPlacements path with
//   via 'disembark' + canDisembarkAt; then 'actsNormally' → DeclareMoveDecision allowed ['normal','advance'],
//   'countsAsNormalMove' → unit done (turn.moveType = 'normal').
export function offerEmbark(ctx: EngineContext, unitId: UnitId): boolean
//   after a Normal/Advance/Fall Back move resolves: if some friendly board transport passes canEmbark → chooseOption
//   { topic: 'other', data: { kind: 'embark', transportUnitIds } }, options `embark:<transportId>` | 'stay'; returns
//   true when a decision was raised. AI default: 'stay' unless the unit is below half strength.
// (f) pre-battle Scouts: a DEDICATED TRANSPORT whose passengers all have SCOUTS gets the Scouts move (min value).

// E2 one-die re-roll per activation (Prototype Systems) — RerollKind 'oneDie' already exists in hooks.ts
// src/engine/attack.ts rollBatchD6, after automatic re-rolls and before the R-6.24 `all` offer:
//   for a die whose eval.kinds has 'oneDie', that failed, canReroll, while phase mark
//   `oneDie:<sourceId>:<attackerUnitId>` is absent → raise rerollOffer { dieIndexes: failedIdx, maxDice: 1, key }
//   (ChooseOptionAction.dieIndexes picks one; 'keep' saves it for a later batch of the same activation).
//   On use push the mark (phase marks expire with the phase = once per activation; a unit shoots once per phase).
function oneDieOffer(ctx: EngineContext, key: string, roll: DiceRoll, evals: D6Eval[], dies: DieCtx[]): 'pending' | null

// E3 non-cumulative negative charge modifier (Grav-inhibitor Drone) — src/engine/phases/charge.ts
//   chargeRollModifier: split results by source; flagged = sources whose ability params.nonCumulativeNegative === true.
//   pos = Σ positive; negOther = Σ negative of unflagged; negFlag = min of flagged negatives (or 0);
//   return pos + (negFlag < 0 ? Math.min(negFlag, negOther) : negOther)
function chargeRollModifier(ctx: EngineContext, charge: ChargeState, roll: DiceRoll): number   // signature unchanged

// E4 Overwatch ban (Electro-static Flares)
// src/engine/code-hooks.ts EngineCodeHook (not frozen)
forbidsOverwatchAgainst?(state: GameState, entry: HookSourceEntry, targetUnitId: UnitId): boolean
// src/engine/hooks-impl.ts HookQueries (not frozen)
overwatchForbiddenAgainst(state: GameState, targetUnitId: UnitId): boolean   // any active source answers true
//   fireOverwatch.check: `if (hookService.overwatchForbiddenAgainst(state, enemyId)) return false` (enemyId = mover/charger)

// E5 Benefit of Cover from a phase mark (Lives Before Territory) — src/engine/hooks-impl.ts
hasBenefitOfCover(state: GameState, unitId: UnitId): boolean
//   existing stratCover test OR some half h of unitId has phase mark `cover:${canonical(h)}` in phaseState.marks
export const coverMarkKey = (unitId: UnitId): string => `cover:${unitId}`   // canonical (bodyguard) id; exported for the hook

// E6 re-validate declared targets after a reactive move in `shooting.targetsDeclared` — src/engine/attack.ts
export function pruneUnreachableTargets(ctx: EngineContext, attackerUnitId: UnitId): void
//   called once after the targetsDeclared window drains and before the first hit roll: drops each (model, weapon,
//   target) entry whose target has no model within the weapon's range of that model, or (not INDIRECT_FIRE) none
//   visible; emits nothing new (the attacks are simply not made). No-op when no reactive move happened (mark check).

// E7 mission pick answered by the other player — src/engine/missions.ts
//   offerChoice(ctx, opponentOf(pid), …, data { ruleId, owner: pid }) for code 'etherealEdictPick'; the PICK_CODES
//   answer handler resolves the rule owner from data.owner (fallback: action.player) instead of the answering player.
```

## 8. Test IDs

Same list as the `SDC` section of 12-rules-test-checklist. Engine/data tests: `tests/engine/tau-empire-sudden-dawn-cadre.test.ts`,
`tests/data/tau-empire-sudden-dawn-cadre.test.ts`; e2e starts as this patrol via the patrol picker.

| ID | Ref | Scenario → expected |
|---|---|---|
| SDC-001 | SDC-1 | patrol loads: 4 units, 22 models; Cloudspear WARLORD with Electro-static Flares; default secondary Surprise Attack; first patrol's data unchanged |
| SDC-002 | SDC-1.1 | Patrol Squads split: half A = Shas'ui + 4 carbines (has grav-inhibitor), half B = 3 rail rifles + 2 carbines |
| SDC-003 | SDC-2.1 | FtGG: Breachers observing for Pathfinders → Guided attacks vs Spotted gain Ignores Cover; Devilfish observing → no Ignores Cover |
| SDC-004 | SDC-2.2 | an embarked unit is never offered as Observer nor gets an FtGG pick |
| SDC-005 | SDC-3 | Flares: Cloudspear has 4+ invuln; ranged attacks vs Breachers within 6" of Cloudspear −1 to hit; at 6.1" no penalty; Devilfish within 6" no penalty |
| SDC-006 | SDC-3.1 | Flares −1 plus target Stealth/Go to Ground-style −1 still capped at −1 |
| SDC-007 | SDC-3.2 | Flares: Fire Overwatch not offered against a T'au unit moving/charging within 6" of Cloudspear; offered against the Devilfish and against units beyond 6" |
| SDC-008 | SDC-3 | Prototype Systems: 4+ invuln; one failed hit die re-rolled per activation (second batch gets no offer after use); one failed wound die likewise |
| SDC-009 | SDC-3.3 | Prototype Systems: declining the hit re-roll in the projector batch keeps it for the plasma rifle batch of the same activation; next phase it is available again |
| SDC-010 | SDC-3 | Prototype Systems: the projector's D6 Attacks roll may be re-rolled; plasma rifle has no attacks roll offer |
| SDC-011 | SDC-4.1 | Surprise Attack: end of own turn round 1 controlling 2 NML markers → 8 VP; a home-DZ marker scores nothing; opponent's turn end scores nothing |
| SDC-012 | SDC-4.2 | Surprise Attack: round 3 with 2 NML markers → 4 VP; round 5 with 3 NML markers → 5 VP (cap) |
| SDC-013 | SDC-4.3 | Ethereal Edict: start of round 1 the opponent (not the owner) gets the pick over their own canonical units (attached pair once, Reserves included) |
| SDC-014 | SDC-4.3 | Ethereal Edict: chosen unit destroyed by battle end → +12 VP; alive → 0; attached pair with only the bodyguard dead → 0 |
| SDC-015 | SDC-5.1 | Fight by the Code: a unit that Fell Back shoots after the stratagem; not offered for a unit that did not Fall Back; without it a Fell-Back unit cannot shoot |
| SDC-016 | SDC-5.2 | Rampart of Fire: pulse carbine vs a target 9" away resolves AP −1; vs a target 11" away AP 0; not offered for a unit that already shot |
| SDC-017 | SDC-5 | Lives Before Territory: after an enemy declares shots at the Pathfinders, they move up to the rolled D6" and every attack against them that phase gets Benefit of Cover (AP 0 vs Sv 4+ → saves on 3+) |
| SDC-018 | SDC-5.3 | Lives Before Territory: not offered for the Devilfish, for an untargeted unit, for a unit in Engagement Range, or in own turn |
| SDC-019 | SDC-5.4 | Lives Before Territory: target moves out of a pulse rifle's range → that model's attacks are dropped; models still in range resolve normally; Indirect Fire attacks are not dropped for lost visibility |
| SDC-020 | SDC-6.1 | Cloudspear starts at W 8 |
| SDC-021 | SDC-6.2 | Weapon Support System: Cloudspear vs a −1-to-hit target hits on its BS unmodified; Indirect projector vs unseen target ignores the −1 but an unmodified 1–3 still fails |
| SDC-022 | SDC-6.3 | Grav-inhibitor: enemy charges half A → 2D6 9 becomes 7; charging half B (no drone) → 9 |
| SDC-023 | SDC-6.3 | Grav-inhibitor not cumulative: plus Laser-Marked-style −2 → total −2; with a −1 → −2; positive +1 still added (−2 + 1 = −1) |
| SDC-024 | SDC-6.3 | Grav-inhibitor ends once the Shas'ui is destroyed |
| SDC-025 | SDC-6.4 | Breach and Clear: Breacher ranged attack vs a unit within range of a marker re-rolls failed wounds (and may re-roll a success); vs a unit off-marker no re-roll; melee unaffected |
| SDC-026 | SDC-6.5 | Scouts 7": Pathfinders make a pre-battle move ending > 9" from enemies; embarked alone in the Devilfish → the Devilfish may make it instead |
| SDC-027 | SDC-6.7 | Transport setup: Breachers start embarked (not offered in deployment); 10 Breachers + 5 Pathfinders rejected (15 > 12); Cloudspear (BATTLESUIT) rejected |
| SDC-028 | SDC-6.7 | Disembark: Devilfish not yet moved → Breachers placed wholly within 3", then must move (no Remain Stationary); after the Devilfish moved → counts as Normal move, cannot charge; Devilfish Advanced → no disembark |
| SDC-029 | SDC-6.7 | Embark: Pathfinders end a Normal move with every model within 3" of the Devilfish → embark offered; one model at 3.1" → not offered; embarked units give no OC |
| SDC-030 | SDC-6.8 | Devilfish destroyed with passengers: Deadly Demise first, then passengers placed within 3", D6 per model (1 = MW), unit Battle-shocked and cannot charge |
| SDC-031 | SDC-6 | weapons: rail rifle Heavy +1 hit when stationary and Devastating Wounds on a crit wound; pulse blaster Assault after Advance; twin pulse carbine Twin-linked wound re-roll; projector Blast +1 A per 5 models |
| SDC-032 | SDC-6 | Deep Strike: Cloudspear may start in Reserves (not round 1, >9" from enemies); Devilfish may not |

## 9. Figures

Heights follow 30-figures (infantry H ~1.0–1.1, battlesuits taller, vehicles compressed); bases are rules-true. Paint
scheme: the faction's existing one (bone `#d8cdb2`, deep teal `#2e6a86`, signal orange `#d9762b`, sensor blue glow).

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `commander-cloudspear` | `tau.commander-cloudspear/cloudspear` | 1 | 1.8 | 60 mm | A chibi chunky armoured battlesuit with a broad wedge head and a single glowing blue visor slit, bone-and-teal plates with orange command stripes, a stubby wide-mouthed launcher on one shoulder and a long glowing rifle on one arm, two tiny saucer drones with shimmering shield discs hovering beside it. |
| `pathfinder-shasui` | `tau.pathfinder-team/shasui` | 1 | 1.0 | 25 mm | A chibi alien scout in light bone armour with a teal hooded cloak, a sleek helmet with a tall sensor antenna and orange stripe, short carbine in hand, a small humming drone with a violet grav ring floating at the shoulder. |
| `pathfinder-carbine` | `tau.pathfinder-team/pathfinder-carbine` | 6 | 1.0 | 25 mm | A chibi alien scout in light bone armour with a teal hooded cloak and a rangefinder eyepiece on a smooth helmet, holding a short chunky carbine. |
| `pathfinder-rail` | `tau.pathfinder-team/pathfinder-rail` | 3 | 1.0 | 25 mm | The same chibi cloaked scout kneeling slightly, carrying a very long slim rifle with a glowing blue coil running along the barrel. |
| `breacher-shasui` | `tau.breacher-team/shasui` | 1 | 1.0 | 25 mm | A chibi alien trooper in heavier rounded bone armour with teal shoulder pads, a domed helmet with an orange crest, holding a short fat-barrelled shotgun-like blaster with a wide muzzle. |
| `breacher` | `tau.breacher-team/breacher` | 9 | 1.0 | 25 mm | The same chibi armoured trooper without the crest, short wide-muzzled blaster held low at the hip, small pistol on the belt. |
| `devilfish` | `tau.devilfish/devilfish` | 1 | 1.8 (hull ~4.0 long, compressed) | 60 mm round flying base | A chibi rounded hover-transport shaped like a smooth flat fish, bone hull with teal panels and orange nose stripe, two stubby engine pods at the back, a short rotary cannon under the chin, a rear ramp hatch, floating on a clear stem with a sensor-blue glow beneath. |

## 10. Other T'au Empire patrols (appendix)

- Protectors of Aun'shar — Index, June 2023 — Aun'Shar ×1, Shas'nel D'tano ×1, Strike Team ×10, Stealth Battlesuits ×3,
  Ghostkeel Battlesuit ×1 (already playable, [tau-empire.md](tau-empire.md)).
