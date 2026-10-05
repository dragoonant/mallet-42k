# Faction spec — Necrons: Amonhotekh's Guard

Own-words data spec for the Necrons Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `NEC-<section>.<n>`
are cited by the `NEC-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours. Data id prefix: `nec.` (faction id `necrons`, faction keyword `NECRONS`).

## 0. Sources (accessed 2026-10-03)

| Source | URL | Version shown on page |
|---|---|---|
| Necrons box "Amonhotekh's Guard" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/amonhotekh-s-guard/ | Index, 10th ed, June 2023 (only Necrons patrol listed) |
| CP faction navigation (used to enumerate patrols) | menu on any page under https://wahapedia.ru/wh40k10ed_cp/factions/ | — (the CP index page itself returned HTTP 403) |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Patrol selection: the wahapedia Combat Patrol navigation lists exactly one Necrons patrol, Amonhotekh's Guard
(June 2023). It is therefore both the current boxed patrol and the only one; there is no appendix roster (§9).

## 1. Roster

5 units, 18 models. Faction keyword NECRONS on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `overlord` | Overlord Amonhotekh | 1 | tachyon arrow; Overlord's blade | **WARLORD**. Leader → `warriors` (default attachment) |
| `warriors` | Necron Warriors | 10 | 5× gauss flayer + close combat weapon; 5× gauss reaper + close combat weapon | bodyguard for the Overlord |
| `skorpekhs` | Skorpekh Destroyers | 3 | each: Skorpekh hyperphase weapons; the unit has 1 plasmacyte (a token, not a model) | — |
| `scarabs` | Canoptek Scarab Swarms | 3 | each: feeder mandibles | — |
| `doomstalker` | Canoptek Doomstalker | 1 | doomsday blaster; twin gauss flayer; Doomstalker limbs | — |

No Patrol Squads ability on any datasheet (CP-1.8 does not apply).

## 2. Faction ability — Reanimation Protocols (every datasheet)

| Id | Rule |
|---|---|
| NEC-2.1 | At the end of your Command phase, every unit of yours on the battlefield with this ability rolls D3: that many "reanimation steps" are resolved for it one at a time. |
| NEC-2.2 | Each step: if any model in the unit is below its starting Wounds, pick one such model and it gets 1 lost wound back. Otherwise, if the unit has fewer models than its Starting Strength, one destroyed model of that unit is put back on the battlefield with 1 wound remaining. Otherwise the step (and every remaining step) does nothing. Healing always takes priority over returning a model, and a model returned by an earlier step can be healed by a later one. |
| NEC-2.3 | Attached unit (R-10.1: one unit for all purposes): Overlord + Warriors roll one D3 together, healing can go to either half, and returned models come from the bodyguard's destroyed models; Starting Strength is the combined count. When either half is wiped out the survivor is its own unit with its own Starting Strength (R-10.1), so a destroyed Overlord can never come back, and if all Warriors die the Overlord alone cannot bring them back. A unit whose location is `destroyed` never reanimates. |
| NEC-2.4 | Returned model **[interpretation]**: it comes back with its original model id and wargear (gauss flayer vs gauss reaper matters), is set up wholly on the battlefield, in unit coherency, not within Engagement Range of any enemy unit the reanimating unit was not already within Engagement Range of, and not overlapping any base. The engine picks the legal spot closest to the unit's centroid (deterministic, no new action). If no legal spot exists the step is wasted. Returned models carry no per-turn state (they have not moved/shot/fought) and one-shot usage resets only if the model never used it. |
| NEC-2.5 | Pick order **[interpretation, owner's choice made deterministic]**: heal the wounded model with the fewest wounds remaining; ties → a CHARACTER model first, then lowest model index. Return the destroyed model destroyed most recently first. |
| NEC-2.6 | Ordering inside the end of the Command phase: Reanimation resolves before the Command-phase scoring rules run at `command.end` (owner's sequencing choice — returned Warriors add OC before primary scoring). |

## 3. Enhancements (Overlord Amonhotekh, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Overriding Control | default | the bearer's unit (attached Warriors included, `scope.who: self`) can shoot in a turn in which it Fell Back. It still cannot declare a charge that turn. |
| Protocol of Resonant Focus | optional | in your Command phase, choose one enemy unit within 12" of the bearer and visible to it. Until the end of that turn, every attack made by a friendly NECRONS model (any unit) that targets the chosen unit re-rolls a hit roll of 1. Range/visibility only matter at selection. No eligible enemy → no pick. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Reclaim and Dominate | default | at the end of each of your turns (`turn.end`, `who: active`): 4 VP if at least one of your NECRONS units that is not Battle-shocked has **every** model wholly inside the opponent's deployment zone. Flat 4 VP per turn, not per unit. An attached unit is one unit (all of its models must be wholly inside). |
| Treasures of Aeons | optional | at the start of battle round 1 you pick one objective marker in No Man's Land (the "treasure" marker). Each time a model from your army with NECRONS destroys an enemy unit, you score 3 VP if that enemy unit was within range of the treasure marker, or within range of the marker inside your own deployment zone (if the mission has one), **at the start of the phase** in which it was destroyed. A kill by Deadly Demise mortal wounds counts for the owner of the exploding model (its `byModelId` is that model; RC-072). Other kills with no `byModelId` (e.g. Hazardous, mortal wounds from other rules) do not score **[interpretation]**. No cap stated. |

"Within range" of a marker for a unit = any of its models within the mission's objective range (11-combat-patrol §2.4).

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Mercurial Resilience | 1 | wargear | `shooting.targetsDeclared` (opponent's Shooting) or `fight.targetsDeclared` (either Fight phase), just after an enemy unit picks its targets | own NECRONS unit that is a target of that enemy unit | until end of phase, models in the unit have a 5+ invulnerable save (the better invuln is used if they already have one, e.g. the Overlord's 4+) |
| Disruption Fields | 1 | battleTactic | `[fight.start, fight.attacksResolved]` (between activations, either player's turn) | own NECRONS unit not yet selected to fight this phase | until end of phase, +1 Strength to the melee weapons of models in the unit |
| Will of the Overlord | 1 | strategicPloy | `command.start` (your Command phase) | one own NECRONS unit | until the start of your next Command phase (`untilNextTurn`), +1 OC to every model in the unit. **Restriction:** only usable while an OVERLORD model of yours is on the battlefield. |

Core stratagems: all apply per 10-rules §11 subject to their own keyword gates (Go to Ground is INFANTRY-only;
Fire Overwatch needs a ranged weapon — Skorpekhs and Scarabs have none; Tank Shock is VEHICLE-only → Doomstalker).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Overlord Amonhotekh | 1 | 40 mm | 5 | 5 | 2+ | 4+ | 6 | 4+ | 1 | INFANTRY, CHARACTER, NOBLE, OVERLORD, AMONHOTEKH | Leader → Necron Warriors; Reanimation Protocols; Implacable Resilience: each attack allocated to this model has its Damage reduced by 1 (min 1) |
| Necron Warriors | 10 | 32 mm | 5 | 4 | 4+ | — | 1 | 7+ | 2 | INFANTRY, BATTLELINE, NECRON WARRIORS | Reanimation Protocols |
| Skorpekh Destroyers | 3 | 50 mm | 7 | 6 | 3+ | — | 3 | 7+ | 2 | INFANTRY, SKORPEKH DESTROYERS | Reanimation Protocols; Plasmacyte (wargear): once per battle per plasmacyte the unit carries (1 here), when the unit is selected to fight you may spend one; if you do, its melee weapons have [DEVASTATING WOUNDS] until end of phase |
| Canoptek Scarab Swarms | 3 | 40 mm | 9 | 2 | 6+ | — | 4 | 8+ | 0 | SWARM, FLY, CANOPTEK, SCARAB SWARMS | Deadly Demise 1; Reanimation Protocols |
| Canoptek Doomstalker | 1 | 90 mm (as printed on source) | 7 | 8 | 3+ | 4+ | 12 | 8+ | 4 | VEHICLE, WALKER, CANOPTEK, DOOMSTALKER | Deadly Demise D3; Reanimation Protocols; Damaged (1–4 wounds left): −1 to every hit roll this model makes |

Faction keyword (all): NECRONS. Leader note: the Overlord lists only Necron Warriors as a bodyguard.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Overlord Amonhotekh | — | tachyon arrow | Overlord's blade |
| Necron Warriors | Warrior (flayer) ×5 | gauss flayer | close combat weapon |
| Necron Warriors | Warrior (reaper) ×5 | gauss reaper | close combat weapon |
| Skorpekh Destroyers | ×3 | — | Skorpekh hyperphase weapons |
| Canoptek Scarab Swarms | ×3 | — | feeder mandibles |
| Canoptek Doomstalker | — | doomsday blaster, twin gauss flayer | Doomstalker limbs |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| tachyon arrow | 72" | 1 | 2+ | 16 | −5 | D6+2 | One Shot (once per battle) |
| gauss flayer | 24" | 1 | 4+ | 4 | 0 | 1 | Lethal Hits, Rapid Fire 1 |
| gauss reaper | 12" | 2 | 4+ | 5 | −1 | 1 | Lethal Hits |
| doomsday blaster | 48" | D6+1 | 4+ | 14 | −3 | 3 | Blast, Heavy |
| twin gauss flayer | 24" | 1 | 4+ | 4 | 0 | 1 | Lethal Hits, Rapid Fire 1, Twin-linked |
| Overlord's blade | melee | 4 | 2+ | 8 | −3 | 2 | Devastating Wounds |
| close combat weapon (Warrior) | melee | 1 | 4+ | 4 | 0 | 1 | — |
| Skorpekh hyperphase weapons | melee | 4 | 3+ | 7 | −2 | 2 | — (+Devastating Wounds via Plasmacyte) |
| feeder mandibles | melee | 6 | 5+ | 2 | 0 | 1 | Lethal Hits |
| Doomstalker limbs | melee | 3 | 4+ | 6 | 0 | 1 | — |

Suggested `paintScheme` (original): primary `#3a3f45` (dark gunmetal), secondary `#39ff6a` (glow green), trim
`#b8923a` (tarnished gold), metal `#9aa3ab`, decal `#1d2a22`.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`); (c) = engine change beyond a code hook.

| Rule | Enc. | Encoding |
|---|---|---|
| Reanimation Protocols roll + heal/return (NEC-2.1–2.6) | (b)+(c) | (b) `reanimationProtocols` — ability descriptor `trigger: phaseEnd, when:{phase:'command', ownTurn:true}, code:'reanimationProtocols'`. Fires once per own Command phase after battle-shock tests and **before** the `command.end` ScoringRules (NEC-2.6). Reads every own board unit carrying the code (attached pairs resolved once via `leaderService.canonicalUnitId`/`halves`), rolls D3 (`purpose:'ability'`), then per step heals 1 wound on the pick-order model (NEC-2.5) or returns one model from that unit's destroyed-model record with `woundsRemaining = 1`, placed per NEC-2.4; emits the new events. (c) needs: **`src/engine/types.ts` (frozen)** — add `Unit.destroyedModels: Model[]` (snapshot of each removed model: id, datasheetModelId, weapons, base, height, oneShotUsed), filled by `state.ts removeModel`; **`src/engine/events.ts` (frozen)** — add `WoundsRegained {unitId, modelId, amount, source}` and `ModelReturned {unitId, modelId, pos, source}` to the event union; non-frozen: a `returnModel(ctx, unitId, snapshot)` helper in `state.ts` + an auto-placement routine in `geometry.ts`/`movement.ts` (coherency, ER, overlap, board edge), and the `command.end` ordering in `phases/command.ts`. Matching `docs/spec/00-architecture.md` edit required. |
| Overriding Control | (a) | enhancement effect `{trigger:'always', effect:{shootAfterFallBack:true}, scope:{who:'self'}}` (explicit `self` — enhancements default to `bearer`) |
| Protocol of Resonant Focus — pick | (b) | `resonantFocusPick` (`onCommandPhase`, own turn, opened at `command.start` like `oathOfMomentPick`): if the bearer is on the board, offers `chooseOption` (topic `abilityChoice`) over enemy board units within 12" of and visible to the bearer; stores mark `pick:resonantFocus:<round>:<player>=<unitId>`; emits `AbilityTriggered`. No candidates → no decision. |
| Protocol of Resonant Focus — re-roll | (b) | `resonantFocusReroll` (`onHitRoll`): gate = attacker unit has faction keyword NECRONS, attacker owner = mark owner, target canonical unit = marked unit, mark round = current round and the mark owner is the active player (expires at end of that turn); result `{reroll:'ones'}`. Could become (a) if a `Condition.markedTarget: <mark name>` key is added later. |
| Reclaim and Dominate | (b) | secondary `scoring:[{when:'turn.end', who:'active', rule:'custom', code:'reclaimAndDominate', pointsPer:4}]`; `reclaimAndDominate` = `missionHook('reclaimAndDominate','onTurnEnd')` in code-hooks + amount fn in `missions.ts`: 4 if any own board unit (canonical, attached pair once) with NECRONS, not `battleShocked`, has every model wholly inside the opponent's deployment-zone polygon (base footprint, not just centre). (The existing `unitsInEnemyZone` rule counts any-model-inside per unit and has no battle-shock/keyword filter, so it is not reused.) |
| Treasures of Aeons — pick | (b) | `treasuresOfAeonsPick` (mission hook, `when:'round.start'`, `rounds:{from:1,to:1}`, added to `PICK_CODES` like `stompEmPick`): owner `chooseOption` over No Man's Land markers; stores `secondaryState.treasureObjectiveId`. |
| Treasures of Aeons — phase snapshot + score | (b) | `treasuresOfAeonsScore` (scoring rule `when:'any.unitDestroyed'`, `rule:'custom'`, `pointsPer:3`): at every phase start (`onPhaseStart`) the hook snapshots into `secondaryState.treasureNearby` the enemy unit ids (canonical + halves) within range of the treasure marker or of the owner's DZ marker if one exists; on `UnitDestroyed` with `byPlayer` = owner, `byModelId` non-null and the killer model's unit carrying NECRONS, scores 3 if the destroyed unit id is in the snapshot. |
| Mercurial Resilience | (a) | stratagem `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'` with `condition` reactive in Shooting, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'NECRONS'}, state:'targetedByAttack'}]`, `effect:{invuln:'5+'}`, `duration:'untilEndOfPhase'` (same shape as Gene-wrought Resilience) |
| Disruption Fields | (a) | `window:['fight.start','fight.attacksResolved']`, `who:'either'`, target state `notYetFought`, keyword NECRONS, `effect:{when:{weaponType:'melee'}, modifyStat:{stat:'S', value:1}}`, `untilEndOfPhase` |
| Will of the Overlord | (a)+(b) | `window:'command.start'`, `who:'active'`, target own NECRONS unit, `effect:{modifyStat:{stat:'OC', value:1}}`, `duration:'untilNextTurn'`; restriction via (b) `requireFriendlyKeywordOnBoard` (stratagem hook with only `check`: true iff the user has a board model whose unit has keyword `params.keyword` = `OVERLORD`; generic data effect still granted) |
| Implacable Resilience | (a) | `{trigger:'attacksAllocated', effect:{damageReduction:1}, scope:{who:'bearer'}}` — applies to every attack allocated to the Overlord (incl. Devastating Wounds attacks, which the engine treats as attacks); not to mortal wounds outside an attack (Deadly Demise, Hazardous) |
| Plasmacyte | (b) | `plasmacyteSurge` (`onUnitSelectedToFight`, window `fight.unitSelected`): if `params.charges` (1) minus uses recorded in `oncePerBattleUsed` (key `<abilityId>:<unitId>:<n>`) > 0, offers `chooseOption` topic `abilityChoice` (use / decline); on use grants `{grantWeaponAbility:{ability:'DEVASTATING_WOUNDS'}, when:{weaponType:'melee'}}` scope `self`, `untilEndOfPhase`, records the use. |
| Leader (Overlord → Warriors) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['nec.necron-warriors']`; patrol `attachTo:'warriors'` |
| Deadly Demise 1 / D3 | (a) | `coreAbilities:[{ability:'DEADLY_DEMISE', value:1 \| 'D3'}]` |
| Damaged 1–4 (Doomstalker) | (a) | `damaged:{threshold:4, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| One Shot (tachyon arrow) | (a) | weapon ability `ONE_SHOT` (tracked in `Model.oneShotUsed`) |
| Lethal Hits / Rapid Fire 1 / Twin-linked / Blast / Heavy / Devastating Wounds | (a) | weapon abilities `LETHAL_HITS`, `RAPID_FIRE` value 1, `TWIN_LINKED`, `BLAST`, `HEAVY`, `DEVASTATING_WOUNDS` |
| FLY (Scarabs) | (a) | keyword `FLY` (engine-native movement rule) |
| SWARM, NOBLE, CANOPTEK, BATTLELINE | (a) | plain keywords, no intrinsic rule in CP |

Totals: 8 new code hooks (`reanimationProtocols`, `resonantFocusPick`, `resonantFocusReroll`, `reclaimAndDominate`,
`treasuresOfAeonsPick`, `treasuresOfAeonsScore`, `requireFriendlyKeywordOnBoard`, `plasmacyteSurge`); 1 engine
change (model return/heal), which touches 2 frozen contracts (`types.ts` `Unit.destroyedModels`, `events.ts`
`WoundsRegained` + `ModelReturned`). No `actions.ts`, `hooks.ts`, `rng.ts`, `decider.ts` or `index.ts` change
(decisions reuse `chooseOption`; placement is automatic).

## 8. Test IDs

Same list as the `NEC` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| NEC-001 | NEC-2.1 | end of own Command phase, Skorpekhs 2/3 models, one at 2W; D3 = 3 → wounded model to 3W, destroyed model returns at 1W, then healed to 2W (source example) |
| NEC-002 | NEC-2.1 | Reanimation does not fire in the opponent's Command phase nor at any other phase end |
| NEC-003 | NEC-2.2 | unit at full strength and full wounds → D3 rolled, no state change, no `ModelReturned`/`WoundsRegained` |
| NEC-004 | NEC-2.2 | heal before return: Warriors 8/10 + attached Overlord at 4/6 W, D3 = 2 → Overlord to 6W, no Warrior returned |
| NEC-005 | NEC-2.3 | attached Overlord + Warriors roll one D3 (one `DiceRolled` purpose `ability`), Starting Strength 11 |
| NEC-006 | NEC-2.3 | Overlord destroyed → bodyguard is its own unit; next Reanimation never returns the Overlord |
| NEC-007 | NEC-2.3 | all Warriors destroyed while led → Overlord alone (SS 1) cannot return Warriors |
| NEC-008 | NEC-2.3 | a unit with `location: destroyed` never reanimates |
| NEC-009 | NEC-2.4 | returned Warrior keeps its original id and loadout (a destroyed gauss reaper model returns with gauss reaper) |
| NEC-010 | NEC-2.4 | returned model is in coherency, on the board, overlaps no base, not in ER of a new enemy unit |
| NEC-011 | NEC-2.4 | no legal spot (unit boxed in) → step wasted, model stays destroyed |
| NEC-012 | NEC-2.6 | returned Warriors count for OC in the same `command.end` primary scoring |
| NEC-013 | NEC-3 | Overriding Control: led Warriors Fall Back then shoot (legal); same unit cannot declare a charge |
| NEC-014 | NEC-3 | Overriding Control: Skorpekhs (not the bearer's unit) cannot shoot after Falling Back |
| NEC-015 | NEC-3 | Resonant Focus pick offered at own `command.start` only among enemies within 12" and visible to the bearer |
| NEC-016 | NEC-3 | Resonant Focus: Doomstalker attack vs marked unit with an unmodified 1 re-rolls; vs another unit no re-roll; re-roll of 2+ not offered |
| NEC-017 | NEC-3 | Resonant Focus expires at end of turn (opponent's turn: no re-roll) |
| NEC-018 | NEC-4 | Reclaim and Dominate: Scarabs wholly in enemy DZ at end of own turn → +4 VP once even with two qualifying units |
| NEC-019 | NEC-4 | Reclaim and Dominate: one model's base partly outside the DZ, or unit Battle-shocked → 0 VP |
| NEC-020 | NEC-4 | Treasures of Aeons: pick offered at round 1 start among NML markers only |
| NEC-021 | NEC-4 | Treasures of Aeons: enemy unit within range of the treasure marker at phase start, moves away, destroyed by Warriors that phase → +3 VP |
| NEC-022 | NEC-4 | Treasures of Aeons: unit within range of the owner's DZ marker at phase start destroyed → +3 VP; unit outside both at phase start but inside when destroyed → 0 VP |
| NEC-023 | NEC-4 | Treasures of Aeons: a kill with no `byModelId` (Hazardous, other rule mortals) → 0 VP; a kill by Deadly Demise from a NECRONS model → +3 VP (RC-072) |
| NEC-024 | NEC-5 | Mercurial Resilience: offered after enemy targets declared in opponent's Shooting; Warriors gain 5+ invuln until phase end; Overlord keeps 4+ |
| NEC-025 | NEC-5 | Mercurial Resilience in a Fight phase (either turn) after an enemy unit selects targets |
| NEC-026 | NEC-5 | Disruption Fields: Skorpekh hyperphase S7 → S8; vs T8 now wounds on 4+ (was 5+); ranged weapons unchanged; not offered for a unit that already fought |
| NEC-027 | NEC-5 | Will of the Overlord: +1 OC per model until start of own next Command phase |
| NEC-028 | NEC-5 | Will of the Overlord not offered when no OVERLORD model is on the board |
| NEC-029 | NEC-6 | Implacable Resilience: a D2 attack allocated to the Overlord deals 1; D1 stays 1; Deadly Demise mortal wounds not reduced |
| NEC-030 | NEC-6 | Plasmacyte: offered when Skorpekhs are selected to fight; used → hyperphase weapons gain Devastating Wounds this phase; never offered again |
| NEC-031 | NEC-6 | tachyon arrow is One Shot: second shooting phase it is not a legal weapon |
| NEC-032 | NEC-6 | Doomstalker at 4 W left: −1 to hit on its attacks; at 5 W no modifier |
| NEC-033 | NEC-6 | Deadly Demise: Scarab model destroyed → D6 roll, on 6 units within 6" take 1 MW; Doomstalker → D3 MW |
| NEC-034 | NEC-6 | gauss flayer / twin gauss flayer: Lethal Hits auto-wound on critical hit; Rapid Fire 1 at half range; twin-linked re-rolls wound |
| NEC-035 | NEC-1 | patrol loads: 5 units, 18 models, Overlord is WARLORD with Overriding Control and attached to Warriors; default secondary Reclaim and Dominate |
| NEC-036 | NEC-3 | Resonant Focus re-roll survives the bearer's death: Overlord destroyed after the mark is placed → marked-unit hit re-roll of 1s still applies (Doomstalker and Warriors), still not vs another unit, gone at turn end |
| NEC-037 | NEC-6 | a fired One Shot weapon is not a legal Overwatch weapon: after the tachyon arrow is fired it is absent from Fire Overwatch targets in both the Movement and Charge phases, and `attackService.begin` refuses it centrally |
| NEC-038 | NEC-4 | Treasures of Aeons: a unit finished off by Devastating Wounds from a NECRONS attack near the treasure marker (in range at phase start) → +3 VP, credited to the attacking model |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3, vehicles compressed); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `overlord-amonhotekh` | `nec.overlord-amonhotekh/overlord` | 1 | 1.3 | 40 mm | A chibi skeletal android noble in tarnished gold and dark gunmetal, oversized skull-like faceplate with glowing green eyes, tall crested headpiece, flowing tattered cloak, a long bow-shaped energy launcher in one hand and a curved glowing blade on the other arm. |
| `necron-warrior-flayer` | `nec.necron-warriors/warrior-flayer` | 5 | 1.1 | 32 mm | A chibi gaunt metal skeleton soldier in dark gunmetal with ribbed limbs and a big round skull head with green eye-slits, holding a long rifle with a glowing green tube and an axe-blade under the barrel. |
| `necron-warrior-reaper` | `nec.necron-warriors/warrior-reaper` | 5 | 1.1 | 32 mm | Same chibi metal skeleton soldier, gripping a short, chunky twin-tube carbine with a wide glowing green muzzle held at the hip. |
| `skorpekh-destroyer` | `nec.skorpekh-destroyers/destroyer` | 3 | 1.6 | 50 mm | A chibi hunched android killer on three long blade-tipped legs, gunmetal body with green-lit spine, two arms ending in oversized curved glowing scythe blades, eyeless grinning head. |
| `plasmacyte` | accessory on one Skorpekh base | 1 (decorative) | 0.5 | — | A tiny chibi floating spider-like construct with a glowing green orb body and thin dangling legs, hovering beside the destroyer. |
| `scarab-swarm` | `nec.canoptek-scarab-swarms/swarm` | 3 | 0.4 | 40 mm | Three or four round chibi beetle drones in gunmetal and gold clustered on one base, each with a single bright green eye and short pincers. |
| `canoptek-doomstalker` | `nec.canoptek-doomstalker/doomstalker` | 1 | 3.0 | 90 mm | A chibi four-legged spider walker in gunmetal and gold with a tall arched back, a huge single glowing green cannon slung under its body, a small twin rifle at the front and bright green eye lenses. |

## 10. Other Necrons patrols (appendix)

None listed on wahapedia's Combat Patrol section as of 2026-10-03 (Amonhotekh's Guard, June 2023, is the only one).
