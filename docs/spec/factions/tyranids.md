# Faction spec — Tyranids: The Vardenghast Swarm

Own-words data spec for the Tyranids Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `TYR-<section>.<n>`
are cited by the `TYR-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours. Data id prefix: `tyr.` (faction id `tyranids`, faction keyword `TYRANIDS`).

## 0. Sources (accessed 2026-10-03)

| Source | URL | Version shown on page |
|---|---|---|
| Tyranids box "The Vardenghast Swarm" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/the-vardenghast-swarm/ | Index, 10th ed, June 2023 |
| Tyranids "Insidious Infiltrators" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/insidious-infiltrators/ | Index 10, May 2024 |
| CP faction navigation (used to enumerate patrols) | menu on https://wahapedia.ru/wh40k10ed_cp/factions/amonhotekh-s-guard/ | — (the CP index page returned HTTP 403) |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Patrol selection: wahapedia lists two Tyranids patrols. **The Vardenghast Swarm** (June 2023) is the roster of the
boxed Combat Patrol: Tyranids set (Winged Tyranid Prime, Psychophage, 20 Termagants, 5 Barbgaunts, 3 Von Ryan's
Leapers). **Insidious Infiltrators** (May 2024) is newer but is not a single box — it needs a Neurolictor, a Lictor
and three separate Von Ryan's Leapers kits — so it is the alternate roster (§10), the same way Morgrim's Butchas
(April 2024) is the Orks appendix while the boxed Gordrang's Gitstompas is primary (11-combat-patrol §5–6).

## 1. Roster

5 units, 30 models (6 units if the Termagants split, TYR-6.6). Faction keyword TYRANIDS on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `prime` | Terror of Vardenghast (Winged Tyranid Prime) | 1 | Prime talons | **WARLORD**. No Leader ability on this sheet → operates alone |
| `psychophage` | Psychophage | 1 | psychoclastic torrent; talons and betentacled maw | — |
| `termagants` | Termagants | 20 | each: fleshborer; chitinous claws and teeth | Patrol Squads: may split into 2 × 10 |
| `barbgaunts` | Barbgaunts | 5 | each: barblauncher; chitinous claws and teeth | — |
| `leapers` | Von Ryan's Leapers | 3 | each: Leaper's talons | — |

No wargear options in the box build; no leader attachments.

## 2. Faction abilities

### 2.1 Synapse (every datasheet)

| Id | Rule |
|---|---|
| TYR-2.1 | A TYRANIDS unit from your army is **in Synapse Range** while any of its models is within 6" of at least one friendly model with the SYNAPSE keyword (in this patrol only the Terror of Vardenghast). A SYNAPSE unit is always in its own Synapse Range. |
| TYR-2.2 | When a unit of yours that is in Synapse Range takes a Battle-shock test, roll three D6 and sum them instead of two. Ld and modifiers are unchanged; every other battle-shock rule applies (10-rules R-4.x). |
| TYR-2.3 | Synapse is measured when the test is taken. Once the SYNAPSE model is destroyed (or while it is in Reserves) nothing is in Synapse Range. |

### 2.2 Shadow in the Warp (Terror of Vardenghast only)

| Id | Rule |
|---|---|
| TYR-2.4 | Once per battle, during either player's Command phase, while at least one of your units with this ability is on the battlefield, you may trigger it: every enemy unit on the battlefield takes a Battle-shock test (normal 2D6 vs Ld; their own modifiers apply). This version has no PSYKER modifier. |
| TYR-2.5 | Timing **[interpretation]**: offered at `command.start` of each Command phase (yours and the opponent's), before that phase's R-4.3 recovery and Battle-shock step. A unit already Battle-shocked still tests (failing keeps it shocked, R-4.8). Expiry of a failed test follows the normal rule (until the start of the shocked unit's controller's next Command phase). |

## 3. Enhancements (Terror of Vardenghast, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Psychostatic Veil | default | the bearer gains Lone Operative and a 4+ invulnerable save, and every melee attack that targets the bearer gets −1 to its hit roll (subject to the ±1 hit-modifier cap). |
| Secretion Goad | optional | once per turn, when a friendly TYRANIDS unit within 6" of the bearer (the bearer's own unit included) is selected to shoot or to fight, you may activate it: until the end of that phase the AP of that unit's weapons improves by 1 (0 → −1, −1 → −2). Works in either player's turn. Timing **[interpretation]**: offered when that unit's targets are declared in Shooting (the engine has no separate "selected to shoot" window; AP only matters at saves) and at `fight.unitSelected` in Fight. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Alpha Xenoform | default | at the end of every phase (both players' turns): 4 VP if your WINGED TYRANID PRIME model destroyed ≥1 enemy model during that phase (per-model attribution `ModelDestroyed.byModelId`, same mechanism as Wrath of the Emperor). Kills it makes while fighting on through Death Blow (TYR-6.1) count. |
| Chitinous Tide | optional | at the end of your turn (`turn.end`, `who: active`): 5 VP if you control at least one objective marker within 6" of the opponent's deployment zone. Flat 5 VP per turn. A marker inside that zone is within 0" and counts **[interpretation]**. Distance = from the closest part of the 40 mm marker disc (radius 20 mm ≈ 0.787") to the zone polygon, not from the marker's centre (core rules measure to the closest part of a marker; 10-rules-core R-12.1). |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Hyper-Reactive | 1 | battleTactic | `shooting.targetsDeclared` (opponent's Shooting) or `fight.targetsDeclared` (Fight phase), just after an enemy unit picks its targets | own TYRANIDS INFANTRY unit that is a target of that enemy unit | until end of phase, every attack that targets the unit gets −1 to its hit roll |
| Voracious Assault | 1 | battleTactic | your Shooting phase, or the Fight phase of either turn (same shape as Hyper-Reactive), between activations | own TYRANIDS unit not yet selected to shoot (Shooting) / to fight (Fight) this phase | until end of phase, each attack by a model of the unit that targets the **closest eligible target** may re-roll its hit roll |
| Teeming Broods | 1 | strategicPloy | `movement.reinforcements` (your Movement phase) | one TERMAGANTS unit of yours — may be a destroyed one | not destroyed: up to D6 of its destroyed models come back to it. Destroyed: a new unit identical to it, containing 2D6 models, is added to your army in Strategic Reserves. |

Rule details:

| Id | Rule |
|---|---|
| TYR-5.1 | Hyper-Reactive timing: the page reads "opponent's Shooting phase, or the Fight phase" (confirmed 2026-10-03); we use the Gene-wrought Resilience shape (opponent's Shooting phase, or the Fight phase of either turn), since enemy units pick melee targets in both. |
| TYR-5.2 | Closest eligible target **[interpretation]**: when the unit declares its targets, compute the enemy units it could legally target with that attack type (ranged: visible and within range of at least one of its ranged weapons; melee: within Engagement Range); the closest is the one at the smallest model-to-model distance from the attacking unit (ties: the controlling player picks one tied unit as the closest; the engine keeps one: the tied unit the declaration targets most often (most declared attacks/weapons), else the lowest id **[interpretation]**). Attacks at any other unit get no re-roll. |
| TYR-5.3 | Teeming Broods, unit alive: roll D6; return that many destroyed models (capped at Starting Strength − current models), one at a time, each with full wounds (1 W), placed like Reanimation returns (NEC-2.4: in coherency, not within ER of an enemy unit, no overlap; legal spot nearest the centroid). "Up to" → the engine returns as many as it can **[interpretation, deterministic]**. No legal spot → that model stays destroyed. |
| TYR-5.4 | Teeming Broods, unit destroyed: roll 2D6 = N. Create a new unit of the same datasheet and wargear with N models (Starting Strength N; cap 20 = datasheet maximum **[interpretation]**), `location: reserves`. It arrives as Strategic Reserves (R-5.15: from round 2, wholly within 6" of any battlefield edge, not inside the enemy DZ in round 2, more than 9" horizontally from every enemy model) in a later Reinforcements step of yours, not the step it was created in **[interpretation]**. CP-1.9 still applies: never arrives in round 1, and a unit still in Reserves at the end of round 3 is destroyed (culled units do not credit the opponent with a kill — `destroyedBy.player` = owner, kind `other`, as the existing cull does). A destroyed TERMAGANTS unit can be revived this way any number of times (only the once-per-phase limit applies). |
| TYR-5.5 | A destroyed target is legal only for Teeming Broods (its `targets` entry carries `includeDestroyed: true`). R-11.2 (no stratagem on your own Battle-shocked unit) applies to the living branch only. |

Core stratagems apply per 10-rules §11 with their keyword gates (Go to Ground: INFANTRY; Fire Overwatch needs a
ranged weapon — the Prime and the Leapers have none; Tank Shock is VEHICLE-only → nobody). Heroic Intervention is
modified for the Leapers (TYR-6.5).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Terror of Vardenghast | 1 | 50 mm | 12 | 5 | 4+ | — (4+ with Psychostatic Veil) | 6 | 7+ | 1 | INFANTRY, CHARACTER, FLY, GREAT DEVOURER, SYNAPSE, VANGUARD INVADER, WINGED TYRANID PRIME, TERROR OF VARDENGHAST | Deep Strike; Synapse; Shadow in the Warp; Death Blow |
| Psychophage | 1 | 120 × 92 mm oval | 8 | 9 | 3+ | — | 10 | 8+ | 3 | MONSTER, GREAT DEVOURER, HARVESTER, PSYCHOPHAGE | Deadly Demise 1; Feel No Pain 5+; Synapse; Feeding Frenzy |
| Termagants | 20 | 28 mm | 6 | 3 | 5+ | — | 1 | 8+ | 2 | INFANTRY, BATTLELINE, GREAT DEVOURER, ENDLESS MULTITUDE, TERMAGANTS | Synapse; Skulking Horrors; Patrol Squads |
| Barbgaunts | 5 | 40 mm | 6 | 4 | 4+ | — | 2 | 8+ | 1 | INFANTRY, GREAT DEVOURER, BARBGAUNTS | Synapse; Disruption Bombardment |
| Von Ryan's Leapers | 3 | 40 mm | 10 | 5 | 4+ | 6+ | 3 | 8+ | 1 | INFANTRY, GREAT DEVOURER, VANGUARD INVADER, VON RYAN'S LEAPERS | Fights First; Infiltrators; Stealth; Synapse; Pouncing Leap |

Faction keyword (all): TYRANIDS.

Datasheet abilities:

| Id | Ability | Rule |
|---|---|---|
| TYR-6.1 | Death Blow (Prime) | When this model is destroyed by a melee attack and it has not fought yet this phase, roll a D6. On 4+ it is not removed yet: once the attacking unit has finished all of its attacks, its controller may fight with it (optional: a `chooseOption` use/decline, then a normal fight activation: pile in, attack, consolidate). The model is removed after it fights or when the controller declines. Until removed it cannot be allocated further attacks and does not count for OC or coherency. The removal then credits the original attacker (`ModelDestroyed.by*` from the killing attack). Confirmed against the source page (re-fetched 2026-10-03): the fight comes after the attacker finishes, and the model is removed afterwards. |
| TYR-6.2 | Feeding Frenzy (Psychophage) | Each melee attack of this model that targets a unit below its Starting Strength gets +1 to hit; if that unit is also Below Half-strength, the attack also gets +1 to wound. Strength counts use the combined unit for attached pairs (R-10.1). |
| TYR-6.3 | Skulking Horrors (Termagants) | Once per turn, when an enemy unit ends a Normal, Advance or Fall Back move within 9" of this unit, and this unit is not within Engagement Range of any enemy unit, it may make a Normal move of up to D6". The move follows normal-move rules (no ending in ER, coherency, terrain) and does not change the unit's own `turn.moveType`. |
| TYR-6.4 | Disruption Bombardment (Barbgaunts) | In your Shooting phase, after this unit has shot, pick one enemy INFANTRY unit that was hit by at least one of those attacks. Until the end of your opponent's next turn it is **disrupted**: −2 to its Move characteristic, and −2 to its Advance and Charge rolls. No eligible unit → nothing. Overwatch is not "your Shooting phase" → no trigger. |
| TYR-6.5 | Pouncing Leap (Leapers) | Heroic Intervention may target this unit for 0 CP, and may do so even if Heroic Intervention was already used on another unit this phase. Every other Heroic Intervention eligibility rule still applies. |
| TYR-6.6 | Patrol Squads (Termagants) | At Declare Battle Formations, before any unit is set up, the unit may be split into two units of 10 models each (CP-1.8). Each half keeps every ability and has Starting Strength 10. |
| TYR-6.7 | Psychostatic Veil interaction | The bearer is never attached (no Leader ability), so Lone Operative always applies: ranged attacks may target it only from within 12" (R-6.9). |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Terror of Vardenghast | — | — | Prime talons |
| Psychophage | — | psychoclastic torrent | talons and betentacled maw |
| Termagants | ×20 | fleshborer | chitinous claws and teeth (Termagant) |
| Barbgaunts | ×5 | barblauncher | chitinous claws and teeth (Barbgaunt) |
| Von Ryan's Leapers | ×3 | — | Leaper's talons |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| psychoclastic torrent | 12" | D6 | n/a | 6 | −1 | 1 | Ignores Cover, Torrent |
| fleshborer | 18" | 1 | 4+ | 5 | 0 | 1 | Assault |
| barblauncher | 24" | D6 | 4+ | 5 | 0 | 1 | Blast, Heavy |
| Prime talons | melee | 6 | 2+ | 6 | −1 | 2 | — |
| talons and betentacled maw | melee | D6+1 | 3+ | 6 | −1 | 2 | Anti-Psyker 4+, Devastating Wounds |
| chitinous claws and teeth (Termagant) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| chitinous claws and teeth (Barbgaunt) | melee | 1 | 4+ | 4 | 0 | 1 | — |
| Leaper's talons | melee | 6 | 3+ | 5 | −1 | 1 | — |

Suggested `paintScheme` (original): primary `#e3d6b4` (bone carapace), secondary `#4b2a63` (deep violet hide),
trim `#b3262e` (crimson), metal `#2b2228` (dark chitin claws), decal `#7fd14b` (bioluminescent green).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`); (c) = engine change beyond a code hook. Reused from Necrons:
`Unit.destroyedModels`, `findReturnSpot` / `returnModel` (`src/engine/factions/necrons.ts`), the `ModelReturned`
event, `chooseOption` topic `abilityChoice`, the `pick` offer pattern and `oncePerBattleUsed`.

| Rule | Enc. | Encoding |
|---|---|---|
| Synapse (TYR-2.1–2.3) | (b)+(c) | (b) `synapseBattleShock` — ability `{trigger:'battleShockTest', code:'synapseBattleShock', params:{range:6, keyword:'SYNAPSE'}}` on every datasheet. Fires in `onBattleShockTest` with holder = test unit: if the test unit's owner has a board model whose unit has keyword SYNAPSE and any test-unit model is within 6" (`within`, base to base) of it → `{kind:'roll', extraDice:1}`. (c) **`src/engine/hooks.ts` (frozen)**: `RollModifierResult.extraDice?: number`; `hookService.battleShockTest` (hooks-impl.ts) rolls `2 + max(extraDice)` dice, mode `sum`. |
| Shadow in the Warp (TYR-2.4–2.5) | (b) | `shadowInTheWarp` — ability hook `hook:'onCommandPhase'`, `pick:{window:'command.start', topic:'abilityChoice'}`; offered to the holder's owner (active **or** non-active player) when the holder is on the board and `oncePerBattleUsed` lacks `<abilityId>`; options use / decline; offered once per Command phase (mark `pick:shadow:<round>:<activePlayer>`). On use: push `<abilityId>` to `oncePerBattleUsed`, emit `AbilityTriggered`, then `hookService.battleShockTest(ctx, id, abilityId)` for each enemy board unit (canonical id, once per attached pair, ascending id order). |
| Psychostatic Veil | (a)+(c) | enhancement effects `[{trigger:'always', effect:{invuln:'4+'}}, {trigger:'always', effect:{grantKeyword:'LONE_OPERATIVE'}}, {trigger:'hitRoll', when:{weaponType:'melee'}, effect:{modifyRoll:{roll:'hit', value:-1}}, scope:{who:'attacker'}}]` (bearer default). (c) non-frozen: the Lone Operative check in `shooting.ts` uses the new `hasCoreAbility(state, unitId, 'LONE_OPERATIVE')`, which also honours a granted keyword equal to the core-ability name. |
| Secretion Goad | (b) | `secretionGoadShoot` (`pick.window:'shooting.targetsDeclared'`, hook `onTargetsDeclared`, own attacking unit) and `secretionGoadFight` (`pick.window:'fight.unitSelected'`, hook `onUnitSelectedToFight`): offered to the bearer's owner if the attacking/selected unit is friendly TYRANIDS, has a model within 6" of the bearer (bearer on the board), and mark `goad:<round>:<activePlayer>` is absent (once per turn, shared by both hooks). On use: write the mark, `effects.grant(ctx, unitId, [{modifyStat:{stat:'AP', value:-1}}], {scope:{who:'self'}, duration:'untilEndOfPhase', …})` (AP is stored ≤ 0, so −1 = improve). |
| Alpha Xenoform | (b) | secondary `scoring:[{when:'phase.end', who:'both', rule:'custom', code:'alphaXenoform', pointsPer:4}]`; `alphaXenoform = missionHook('alphaXenoform')` + amount fn in `missions.ts`: same as `wrathOfTheEmperorAmount` with keyword `WINGED TYRANID PRIME` (factor a shared `keywordModelKilledThisPhase(s, pid, keyword)`; it must also reset `secondaryState.killsThisPhase`). |
| Chitinous Tide | (b) | secondary `scoring:[{when:'turn.end', who:'active', rule:'custom', code:'chitinousTide', pointsPer:5}]`; `chitinousTide = missionHook('chitinousTide','onTurnEnd')` + amount fn: 5 if any non-removed objective `o` with `controls(ctx, o.id, pid)` has `pointInPolygon(o.pos, zone) \|\| pointToPolygonEdge(o.pos, zone) - OBJECTIVE_MARKER_RADIUS <= 6 + EPS`, `zone = deploymentZone(s, otherPlayer(pid))`; `OBJECTIVE_MARKER_RADIUS` is the 40 mm disc radius (≈ 0.787"), geometry.ts: the closest part of the marker is measured, not its centre. |
| Hyper-Reactive | (a) | stratagem `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}]` (every friendly unit is TYRANIDS), `effect:{modifyRoll:{roll:'hit', value:-1}}`, `scope:{who:'attacker'}`, `untilEndOfPhase` |
| Voracious Assault | (a)+(c) | stratagem `window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:true},{phase:'fight'}]}`, target own TYRANIDS unit with `state:'notYetShot'` in Shooting / `state:'notYetFought'` in Fight (one `targets` entry per phase branch, or one combined `notYetSelected` that checks per phase), `effect:{when:{targetIsClosestEligible:true}, reroll:'all'}`, `scope:{who:'self'}`, `untilEndOfPhase`. (c) new Condition key `targetIsClosestEligible` (TYR-5.2) and new TargetSpec state `notYetShot` (§7.1 item 8). |
| Teeming Broods | (b)+(c) | stratagem `window:'movement.reinforcements'`, `who:'active'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'TERMAGANTS'}, includeDestroyed:true, count:1}]`, `code:'teemingBroods'`. (b) `teemingBroods` stratagem hook: unit on the board → roll D6 (`purpose:'stratagem'`), then up to that many times take the latest `destroyedModels` snapshot, `findReturnSpot` + `returnModel` (necrons.ts) with `woundsRemaining` = full W; stop at Starting Strength. Unit destroyed → roll 2D6, `spawnUnitCopy(state, unitId, Math.min(N, 20))`, emit `UnitDeployed{toReserves:true}` + `AbilityTriggered`. (c) `includeDestroyed`, `spawnUnitCopy`, Strategic Reserves arrival route. |
| Death Blow (TYR-6.1) | (b)+(c) | (b) `deathBlow` — marker ability `{trigger:'modelDestroyed', code:'deathBlow'}` registered for validation (`run: noop`). (c) logic in new `src/engine/factions/tyranids.ts`, called by `attackService.destroyModel` before `removeModel`; **`types.ts` (frozen)** `Model.pendingRemoval`; **`events.ts` (frozen)** `ModelRemovalDeferred`; fight.ts activation queue offers the fight as an optional `chooseOption` use/decline (not mandatory); the model is removed after it fights or declines. |
| Feeding Frenzy | (a)+(c) | ability `[{trigger:'hitRoll', when:{weaponType:'melee', targetBelowStartingStrength:true}, effect:{modifyRoll:{roll:'hit', value:1}}}, {trigger:'woundRoll', when:{weaponType:'melee', targetBelowHalf:true}, effect:{modifyRoll:{roll:'wound', value:1}}}]` (Below Half implies below Starting Strength). (c) new Condition keys. |
| Skulking Horrors | (b)+(c) | (b) `skulkingHorrors` — ability hook `hook:'onMove'`, `pick:{window:'movement.unitMoved', topic:'abilityChoice'}`: offered to the holder's owner when the moved unit is an enemy of the holder, its `turn.moveType` ∈ {normal, advance, fallBack}, any holder model is within 9" of it, the holder is on the board and not within ER of any enemy, and mark `skulk:<round>:<activePlayer>:<holderId>` is absent. On use: write the mark, roll D6 (`purpose:'ability'`), call `startReactiveMove(ctx, holderId, roll, abilityId)`. (c) reactive move in movement.ts. |
| Disruption Bombardment | (b) | `disruptionBombardment` — ability hook `hook:'onUnitSelectedToShoot'`, `pick:{window:'shooting.attacksResolved', topic:'abilityChoice'}`: in its owner's own Shooting phase (not Overwatch), after this unit's attacks resolve, candidates = enemy units with keyword INFANTRY that appear as the target of a `HitRolled{hit:true}` (incl. auto hits) emitted since this unit's `AttackSequenceStarted`. One candidate → applied; several → owner chooses. Apply: `effects.grant(ctx, enemyId, [{modifyStat:{stat:'M', value:-2}}, {modifyRoll:{roll:'advance', value:-2}}, {modifyRoll:{roll:'charge', value:-2}}], {sourceUnitId: barbgauntsId, scope:{who:'self'}, duration:'untilNextTurn', …})` — `untilNextTurn` with owner = Barbgaunts' player expires at the start of the Tyranid player's next turn = end of the opponent's next turn. Emit `AbilityTriggered`. |
| Pouncing Leap | (b)+(c) | (b) `stratagemCostOverride` — marker ability `{trigger:'always', code:'stratagemCostOverride', params:{stratagemId:'core.s.heroic-intervention', cost:0, ignoreLimit:true}}`, `run: noop`. (c) stratagems.ts reads it per target unit. |
| Patrol Squads (Termagants) | (b)+(c) | (b) `patrolSquads` — marker ability `{trigger:'always', code:'patrolSquads', params:{sizes:[10,10]}}`. (c) setup.ts offers the split at Declare Battle Formations. |
| Deep Strike (Prime) | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]` |
| Infiltrators (Leapers) | (a)+(c) | `coreAbilities:[{ability:'INFILTRATORS'}]` — not read by setup.ts yet (c) |
| Fights First (Leapers) | (a)+(c) | `coreAbilities:[{ability:'FIGHTS_FIRST'}]` — not read by fight.ts `hasFightsFirst` yet (c). Stop-gap if (c) slips: ability `{trigger:'always', effect:{fightsFirst:true}}`. |
| Stealth (Leapers) | (a) | `coreAbilities:[{ability:'STEALTH'}]` (native, attack.ts) |
| Feel No Pain 5+ / Deadly Demise 1 (Psychophage) | (a) | `coreAbilities:[{ability:'FEEL_NO_PAIN', value:'5+'}, {ability:'DEADLY_DEMISE', value:1}]` |
| 6+ invuln (Leapers) | (a) | datasheet `invuln:'6+'` |
| Torrent / Ignores Cover / Anti-Psyker 4+ / Devastating Wounds / Assault / Blast / Heavy | (a) | weapon abilities `TORRENT`, `IGNORES_COVER`, `ANTI` (`keyword:'PSYKER', value:4`), `DEVASTATING_WOUNDS`, `ASSAULT`, `BLAST`, `HEAVY` |
| FLY (Prime) | (a) | keyword `FLY` (engine-native) |
| GREAT DEVOURER, VANGUARD INVADER, HARVESTER, ENDLESS MULTITUDE, BATTLELINE | (a) | plain keywords |

### 7.1 Engine changes (c) — exact signatures

The (b) hooks are written against these before they exist.

1. **Synapse dice** — `src/engine/hooks.ts` (**frozen**):
   ```ts
   export interface RollModifierResult { /* …existing… */ extraDice?: number } // honoured for onBattleShockTest only
   ```
   `hooks-impl.ts battleShockTest`: `count: 2 + Math.max(0, ...rolls.map((r) => r.extraDice ?? 0))`.
2. **Death Blow deferred removal** — `src/engine/types.ts` (**frozen**):
   ```ts
   export interface PendingRemoval { byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null; kind: AttackKind | 'mortal' | 'other'; source: Id }
   export interface Model { /* …existing… */ pendingRemoval?: PendingRemoval | null }
   ```
   `src/engine/events.ts` (**frozen**), added to the event union:
   ```ts
   export interface ModelRemovalDeferred extends EventBase { type: 'ModelRemovalDeferred'; unitId: UnitId; modelId: ModelId; source: Id }
   ```
   new `src/engine/factions/tyranids.ts`:
   ```ts
   export const DEATH_BLOW_CODE = 'deathBlow'
   // called by attackService.destroyModel before removeModel; true = removal deferred (caller returns early, no ModelDestroyed yet)
   export function tryDeathBlow(ctx: EngineContext, model: Model, by: { player: PlayerId | null; unitId: UnitId | null; modelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }): boolean
   // units with a model whose pendingRemoval is set, in deferral order (fight.ts offers each controller an optional use/decline fight right after the attacker finishes, out of alternation)
   export function pendingDeathBlowUnits(state: GameState): UnitId[]
   // after that unit's fight activation (or when the controller declines or it cannot fight): removes the model and emits ModelDestroyed/UnitDestroyed with the stored attribution
   export function finishDeferredRemoval(ctx: EngineContext, modelId: ModelId): void
   ```
   Gate inside `tryDeathBlow`: `by.kind === 'melee'`, the model's unit has an ability with code `deathBlow`, `!unit.turn.foughtThisPhase`; roll D6 `purpose:'ability'`; 4+ → set `pendingRemoval`, `woundsRemaining = 0`, emit `AbilityTriggered` + `ModelRemovalDeferred`. Allocation, OC, coherency and target lists skip models with `pendingRemoval`. Safety net: any still pending at Fight phase end are removed via `finishDeferredRemoval`.
3. **Teeming Broods spawn + Strategic Reserves** — non-frozen:
   ```ts
   // src/data/types.ts TargetSpec (+ 20-data-schema + JSON schema)
   includeDestroyed?: boolean
   // src/engine/state.ts — new unit `${sourceUnitId}~${n}` (n = 1 + copies so far), same datasheet/wargear as the source's
   // first model snapshot, models `${newId}#${i}`, location 'reserves', startingStrength = modelCount, no effects/enhancement
   export function spawnUnitCopy(state: GameState, sourceUnitId: UnitId, modelCount: number): Unit
   // src/engine/phases/movement.ts — route for a Reserves unit: DEEP_STRIKE (or deepStrikeWith) → 'deepStrike', else 'strategicReserves'
   export function reserveRouteFor(state: GameState, unitId: UnitId): 'deepStrike' | 'strategicReserves'
   // region = board, forbidden = [board inset 6" on every side] (+ enemy DZ in round 2), minDistanceFromEnemies 9
   export function strategicReservesConstraints(state: GameState, player: PlayerId): MoveConstraints
   ```
   `raiseArrivalDecision`'s `via` widens to `'deepStrike' | 'rapidIngress' | 'strategicReserves'` (`ReinforcementsArrived.via` already allows it). Units created mid-battle must be picked up by the client renderer and the AI (they appear in `state.units`).
4. **Reactive Normal move** (Skulking Horrors) — non-frozen `src/engine/phases/movement.ts`:
   ```ts
   // opens a MoveUnitDecision {moveType:'normal'} for the unit's owner (the non-active player) with maxDistance = distance and
   // normal-move constraints; resumes the interrupted activation afterwards; never writes unit.turn.moveType
   export function startReactiveMove(ctx: EngineContext, unitId: UnitId, distance: number, source: Id): void
   ```
5. **Infiltrators** — non-frozen `setup.ts`: fill `DeployUnitDecision.context.infiltrators` (already in the frozen type) with units whose datasheet has `INFILTRATORS`; such a unit may instead be placed anywhere wholly on the board more than 9" horizontally from the enemy DZ and from every enemy model (R-10.7).
6. **Fights First core ability** — non-frozen `fight.ts` / `hooks-impl.ts`: `hasFightsFirst` is also true when every half's datasheet has `FIGHTS_FIRST`.
7. **Granted core abilities** — non-frozen `src/engine/state.ts`:
   ```ts
   export function hasCoreAbility(state: GameState, unitId: UnitId, ability: CoreAbility): boolean // datasheet OR active grantKeyword === ability
   ```
   used by the Lone Operative check in `shooting.ts`.
8. **Condition keys** — non-frozen `src/data/types.ts` `Condition` + `hooks-impl.ts` evaluation + 20-data-schema + JSON schema:
   ```ts
   targetBelowStartingStrength?: boolean // target's combined current models (both halves) < combined Starting Strength
   targetBelowHalf?: boolean             // leaderService.isBelowHalfStrength(state, target)
   targetIsClosestEligible?: boolean     // TYR-5.2
   // TargetSpec.state (src/data/types.ts + 20-data-schema §6 + both common.schema.json copies): add 'notYetShot'
   // = the unit is not the current shooter and no half has turn.shotThisPhase (Shooting counterpart of 'notYetFought'; Voracious Assault)
   // src/engine/leaders.ts LeaderService
   isBelowStartingStrength(state: GameState, unitId: UnitId): boolean
   closestEligibleTargets(state: GameState, attackerUnitId: UnitId, kind: 'ranged' | 'melee'): UnitId[]
   ```
9. **Stratagem cost / limit override** (Pouncing Leap) — non-frozen `src/engine/stratagems.ts`:
   ```ts
   export function effectiveCost(state: GameState, player: PlayerId, s: RuntimeStratagem, targetUnitIds: UnitId[]): number
   export function ignoresLimit(state: GameState, player: PlayerId, s: RuntimeStratagem, targetUnitIds: UnitId[]): boolean
   ```
   Both read abilities with code `stratagemCostOverride` on the friendly target units; offers and validation compute cost per target tuple (a 0-CP use is offered even at 0 CP). `StratagemUsed.cost` carries the effective cost.
10. **Patrol Squads split** — non-frozen `src/engine/setup.ts`:
    ```ts
    // keeps `unitId` for the first sizes[0] models, creates `${unitId}~a` for the rest; each gets startingStrength = its size
    export function splitPatrolSquad(state: GameState, unitId: UnitId, sizes: number[]): UnitId[]
    ```
    offered via `chooseOption` topic `abilityChoice` to the owner during Declare Battle Formations, before leader attachment and deployment.

Totals: 12 new code hooks (`synapseBattleShock`, `shadowInTheWarp`, `secretionGoadShoot`, `secretionGoadFight`,
`alphaXenoform`, `chitinousTide`, `teemingBroods`, `deathBlow`, `skulkingHorrors`, `disruptionBombardment`,
`stratagemCostOverride`, `patrolSquads`); 10 engine changes, of which 2 touch frozen contracts (Synapse →
`hooks.ts` `RollModifierResult.extraDice`; Death Blow → `types.ts` `Model.pendingRemoval` + `events.ts`
`ModelRemovalDeferred`). No `actions.ts`, `rng.ts`, `decider.ts` or `index.ts` change (decisions reuse `chooseOption`
and `moveUnit`). A matching `docs/spec/00-architecture.md` edit is required for the frozen changes.

## 8. Test IDs

Same list as the `TYR` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| TYR-001 | TYR-2.2 | Termagants within 6" of the Prime take a Battle-shock test → one `DiceRolled` with 3 dice, total = sum of 3 |
| TYR-002 | TYR-2.1 | Termagants 7" from the Prime (no model within 6") → 2D6 test |
| TYR-003 | TYR-2.3 | Prime destroyed → every Tyranid test is 2D6; the Prime's own test while alive is 3D6 |
| TYR-004 | TYR-2.1 | an enemy unit within 6" of the Prime tests on 2D6 (Synapse only helps its owner) |
| TYR-005 | TYR-2.4 | Shadow in the Warp offered at own `command.start`; used → every enemy board unit tests once (attached pair once); never offered again this battle |
| TYR-006 | TYR-2.5 | Shadow in the Warp offered to the Tyranid player at the opponent's `command.start`; a failed unit stays shocked through that Command phase (OC 0 for its primary scoring) |
| TYR-007 | TYR-2.4 | Shadow in the Warp not offered while the Prime is in Reserves or destroyed |
| TYR-008 | TYR-3 | Psychostatic Veil: Prime has a 4+ invuln; melee hit roll vs the Prime gets −1; ranged hit roll unchanged |
| TYR-009 | TYR-3 | Psychostatic Veil: the Prime cannot be targeted by a ranged attack from 13"; can from 12" (Lone Operative) |
| TYR-010 | TYR-3 | Secretion Goad: Barbgaunts within 6" of the bearer declare targets → offered; used → barblauncher AP 0 → −1 this phase only |
| TYR-011 | TYR-3 | Secretion Goad once per turn: after use in Shooting, not offered in that turn's Fight; offered again next turn (incl. the opponent's Fight phase) |
| TYR-012 | TYR-3 | Secretion Goad not offered for a unit with no model within 6" of the bearer |
| TYR-013 | TYR-4 | Alpha Xenoform: the Prime kills an enemy model in a phase → +4 VP at that phase end; a kill by Termagants → 0 |
| TYR-014 | TYR-4 | Alpha Xenoform: Prime destroyed in melee, Death Blow 4+, fights back and kills → +4 VP that phase |
| TYR-015 | TYR-4 | Chitinous Tide: control a marker 5" outside the enemy DZ at own `turn.end` → +5 VP; 7" outside → 0; centre 6.5" outside (marker edge within 6") → +5 VP; two such markers → still 5 |
| TYR-016 | TYR-5.1 | Hyper-Reactive after an enemy targets Termagants in the opponent's Shooting → their hit rolls −1 until phase end; not offered for the Psychophage (not INFANTRY) |
| TYR-017 | TYR-5.1 | Hyper-Reactive in a Fight phase after an enemy unit selects the Leapers as its melee target |
| TYR-018 | TYR-5.2 | Voracious Assault: Termagants shoot the closest eligible enemy → hit re-roll offered; at a farther unit → none |
| TYR-019 | TYR-5.2 | Voracious Assault: two enemy units tied for closest → only one counts as the closest (the declared target if it is one of them) |
| TYR-019b | TYR-5.2 | Voracious Assault: offered in either player's Fight phase for a unit not yet selected to fight; in Shooting only in your own phase for a unit not yet selected to shoot (`notYetShot`) |
| TYR-020 | TYR-5.3 | Teeming Broods on Termagants at 12/20 with D6 = 4 → 16 models; returned models at 1 W, in coherency, not in ER of enemies |
| TYR-021 | TYR-5.3 | Teeming Broods on a 10-model split unit at 8/10 with D6 = 5 → only 2 return (Starting Strength cap) |
| TYR-022 | TYR-5.4 | Teeming Broods on a destroyed Termagants unit, 2D6 = 7 → new Reserves unit with 7 models, SS 7; the destroyed unit stays destroyed |
| TYR-023 | TYR-5.4 | the spawned unit arrives as Strategic Reserves in a later own Movement phase: wholly within 6" of an edge, >9" from enemies, not in the enemy DZ in round 2; cannot arrive in the step it was created |
| TYR-024 | TYR-5.4 | a spawned unit still in Reserves at the end of round 3 is removed; the opponent gets no kill credit |
| TYR-025 | TYR-5.5 | Teeming Broods target list includes destroyed TERMAGANTS units; no other stratagem lists destroyed units |
| TYR-026 | TYR-6.1 | Death Blow: Prime (not yet fought) killed in melee, D6 = 4 → not removed, `ModelRemovalDeferred`; once the attacker's activation ends its controller may fight with it (use/decline), then `ModelDestroyed` credits the original killer; declining removes it at once |
| TYR-027 | TYR-6.1 | Death Blow: D6 = 3 → removed at once; killed by a ranged attack or mortal wounds → no roll; already fought this phase → no roll |
| TYR-028 | TYR-6.1 | while removal is pending the Prime takes no further allocated attacks and adds 0 OC |
| TYR-029 | TYR-6.2 | Feeding Frenzy: Psychophage melee vs a full-strength unit → no modifier; vs 19/20 Termagants → +1 hit; vs 9/20 → +1 hit and +1 wound |
| TYR-030 | TYR-6.2 | Feeding Frenzy does not apply to the psychoclastic torrent (ranged) |
| TYR-031 | TYR-6.3 | Skulking Horrors: enemy ends a Normal move 8" from Termagants → offer; used → D6" Normal move by the non-active player; a second enemy move that turn → no offer |
| TYR-032 | TYR-6.3 | Skulking Horrors not offered when the Termagants are in ER, when the enemy ends 10" away, or after a Charge / Pile-in move |
| TYR-033 | TYR-6.4 | Disruption Bombardment: Barbgaunts hit enemy INFANTRY → that unit −2 M, −2 Advance, −2 Charge through the opponent's next turn; expires at the start of the Tyranid player's next turn |
| TYR-034 | TYR-6.4 | Disruption Bombardment: only a VEHICLE/MONSTER was hit, or nothing was hit → no effect |
| TYR-035 | TYR-6.5 | Pouncing Leap: Heroic Intervention with the Leapers costs 0 CP (offered at 0 CP) and is offered even after HI was used on another unit this phase; Termagants still pay 1 CP |
| TYR-036 | TYR-6.6 | Patrol Squads: split offered at Declare Battle Formations → two TERMAGANTS units of 10, each SS 10, each with Skulking Horrors |
| TYR-037 | TYR-6 | Leapers deploy via Infiltrators more than 9" from the enemy DZ and enemy models; 8.9" is rejected; the area is the exact 9" offset of the zone (triangular cp-04 wedges included) |
| TYR-038 | TYR-6 | Leapers fight in the Fights First step without having charged; Psychophage FNP 5+ and Deadly Demise 1 resolve |
| TYR-039 | TYR-6 | psychoclastic torrent auto-hits and ignores cover; the maw's Anti-Psyker 4+ makes a 4+ wound roll vs a PSYKER critical, triggering Devastating Wounds |
| TYR-040 | TYR-1 | patrol loads: 5 units, 30 models, the Prime is WARLORD with Psychostatic Veil; default secondary Alpha Xenoform |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3, monsters compressed); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `terror-of-vardenghast` | `tyr.terror-of-vardenghast/prime` | 1 | 1.6 | 50 mm | A chibi winged insectoid alien warrior with a bone-white armoured carapace over violet hide, large leathery bat-like wings, a crested elongated head with glowing green eyes, and four scything bone talons raised to strike. |
| `psychophage` | `tyr.psychophage/psychophage` | 1 | 2.4 | 120 × 92 mm oval | A chibi squat six-legged alien beast with a bulbous bone-plated back, a huge round maw ringed with writhing violet tentacles leaking green mist, and stubby clawed forelimbs. |
| `termagant` | `tyr.termagants/termagant` | 20 | 0.9 | 28 mm | A small chibi hunched alien gunner on two backward-bent legs with a bone-white shell, violet skin and a long tail, clutching a fleshy organic rifle with a crimson muzzle. |
| `barbgaunt` | `tyr.barbgaunts/barbgaunt` | 5 | 1.0 | 40 mm | A chibi stocky alien creature with a heavier bone carapace and violet hide, hauling a large two-handed spiny bio-mortar with a crimson tube and glowing green sacs. |
| `von-ryans-leaper` | `tyr.von-ryans-leapers/leaper` | 3 | 1.3 | 40 mm | A chibi crouched alien ambusher with long spring-loaded hind legs, a sleek violet body with a bone-plated spine, a narrow eyeless head, and two pairs of long sickle claws. |

## 10. Other Tyranids patrols (appendix)

- **Insidious Infiltrators** — Index 10, May 2024 (non-box roster): Death's Shadow (Neurolictor, WARLORD) ×1,
  Lictor ×1, Von Ryan's Leapers ×3 units of 3 — 5 units, 11 models; faction ability Shadow in the Warp; enhancements
  Neurogoad (default) / Psionic Phantoms; secondaries Alpha Predation (default) / Left to Last; stratagems Swift Kills,
  Pheromonal Trace, Predators, Not Prey.
