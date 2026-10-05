# 12 — Rules test checklist

One line per case: `ID | rule ref | scenario → expected`. Ids are stable; verify agents cite them. Rule refs point to
10-rules-core (R-x.y) and 11-combat-patrol (CP-x.y). Fixtures: "Term" = Terminator (T5 Sv2+ Inv4+ W3), "Boy" = Ork Boy
(T5 Sv5+ W1 OC2), "Dread" = Deff Dread (T9 Sv2+ Inv6+ W8), "Kopta" = Deffkopta (T6 Sv4+ W4 FLY), "Infernus" (T4 Sv3+ W2).
Use `ScriptedRng` for dice. This file is the single source of checklist IDs (60-testing §1 gives the regex); rows whose
expectation is `alias → X` are cross-references only and are skipped by coverage tooling.

## CORE — RNG, dice, reducer, log, save/load
| ID | Ref | Scenario → expected |
|---|---|---|
| CORE-001 | 00-arch §6 | `SeededRng('a')` twice → identical first 1000 `next()` values; seed `'b'` → different sequence |
| CORE-002 | 00-arch §6 | `serialize()` after 17 rolls, `restoreRng` → continues with the same values as the original |
| CORE-003 | 00-arch §6 | `roll(6)` over 6 000 samples → each face 1/6 ± 3 %; `roll(3)` ∈ 1..3 |
| CORE-004 | 20 §2 | DiceExpr parse: `3` → 3; `"D6"` → 1 die; `"2D6+1"` → 2 dice +1; `"D3+3"` → D3 +3; `"D7"`/`"-1"` → `E_SCHEMA` at data load |
| CORE-005 | R-1.5 | `"2D6"` rolled with ScriptedRng [3,4] → 7, one `DiceRolled` with `dice: [3,4]` |
| CORE-006 | 00-arch §2 | `step` leaves the input state untouched (same reference, deep-equal to a pre-call clone) and returns a new object on accept |
| CORE-007 | 00-arch §8 | action with `decisionId` ≠ `pending.id` → `E_WRONG_DECISION`, `state` same reference, `events = [ActionRejected]`, `pending` unchanged |
| CORE-008 | 00-arch §8 | `action.player` ≠ `pending.player` → `E_WRONG_PLAYER` |
| CORE-009 | 00-arch §8 | any action after `GameEnded` → `E_GAME_OVER`; `pending` null |
| CORE-010 | 00-arch §8 | `moveUnit` with `placements` missing / `pos.x` a string → `E_SCHEMA` |
| CORE-011 | 00-arch §6 | `state.log[seq].hashAfter` equals `replay(setup, seed, actions[0..seq])`.state.hash for every seq of a 200-step game |
| CORE-012 | 00-arch §6 | `step` without an `rng` argument uses `state.rng`; the same state + action stepped twice → identical events and hash |
| CORE-013 | 00-arch §6 | `step` with a `ScriptedRng` override → `state.rng` afterwards is `scripted:<remaining dice>`; a later `step` without override continues that queue |
| CORE-014 | 00-arch §6 | `SaveFile` round trip: save at seq 120 → load (= replay) → `finalHash` matches; save with a different major `engineVersion` → refused |
| CORE-015 | 00-arch §6 | hotseat undo of the last move = replay to seq − 1 → positions restored; vs AI, undo of an action that emitted `DiceRolled` → refused |
| CORE-016 | 10 P5 | `view(state, 'A')` during deployment: B's `reserves` unit list absent, `hidden.opponentReserveCount` = 1; after deployment ends → visible |
| CORE-017 | 00-arch §7 | positions written with 4 decimals → stored rounded to 1/1000"; hash identical across two runs |

## MEAS — measurement, engagement range, coherency
| ID | Ref | Scenario → expected |
|---|---|---|
| MEAS-001 | R-2.1 | two 32 mm bases with centres 2.26" apart → distance 1.00" (edge to edge) |
| MEAS-002 | R-2.1 | 32 mm vs 60 mm base, centres 5" apart → distance 5 − 0.63 − 1.18 = 3.19" |
| MEAS-003 | R-2.1 | bases overlapping horizontally on different floors, Δy = 3" → horizontal gap 0, plain distance 3" |
| MEAS-004 | R-2.3 | horizontal gap 1.0", Δy 0 → within ER |
| MEAS-005 | R-2.3 | horizontal gap 1.01" → not within ER |
| MEAS-006 | R-2.3 | horizontal gap 0.5", Δy 5.0" → within ER; Δy 5.01" → not |
| MEAS-007 | R-2.3 | units A and B: only one model pair within ER → both units are within ER of each other |
| MEAS-008 | R-2.4 | Normal move ending with a model at 0.9" from an enemy → rejected `E_ENGAGEMENT` |
| MEAS-009 | R-2.5 | 5-model unit, one model 2.1" horizontally from all others → move rejected `E_COHERENCY` |
| MEAS-010 | R-2.5 | 5-model chain, each within 2" of exactly one neighbour → coherent |
| MEAS-011 | R-2.5 | 10-model Boyz, one model within 2" of only one other → not coherent (needs two) |
| MEAS-012 | R-2.7 | Boyz reduced to 6 models, chain with one neighbour each → coherent |
| MEAS-013 | R-2.5 | model 1.5" horizontally but 5.5" vertically from all others → not coherent |
| MEAS-014 | R-2.6 | at turn end a unit is split into two groups (3 + 2) → owner removes models until one group; removed models emit no `UnitDestroyed`-trigger abilities (Deadly Demise not rolled) |
| MEAS-015 | R-2.8 | unit "wholly within 3" of X": one base edge point at 3.1" → not wholly within |
| MEAS-016 | R-1.5 | D3 mapping: D6 1,2→1; 3,4→2; 5,6→3 |
| MEAS-017 | R-1.6 | a die re-rolled once cannot be re-rolled by a second source (Command Re-roll after Oath re-roll → rejected) |
| MEAS-018 | R-1.4 | roll-off tie → re-rolled until decided; roll-offs ignore re-roll abilities |
| MEAS-019 | R-1.9 | modifier drives Sv to 1+ → clamped 2+; AP modified to +1 → clamped 0; D reduced to 0 by generic halving → 1 |
| MEAS-020 | 00-arch §7 | positions round-trip through hashing with 1/1000" rounding → identical hash |
| MEAS-021 | R-1.3 | two `phaseStart` triggers of the active player fire together (Piston-driven Brutality on two Dreads fixture) → a `chooseOption` order decision for the active player; at `round.start` both players have a trigger → first-turn player's window opens first |
| MEAS-022 | R-2.2 | measure query `distance(modelA, modelB)` and `distance(model, objective)` available to both players from any `view()`; equals the engine's range check to 1/1000" |

## LOS — visibility, terrain, cover
| ID | Ref | Scenario → expected |
|---|---|---|
| LOS-001 | R-3.1 | open board, no terrain → every model visible to every model |
| LOS-002 | R-3.1 | 4" tall solid obstacle exactly between two 1.8" tall models → not visible |
| LOS-003 | R-3.1 | friendly model of the observer's own unit in the way → still visible (own unit ignored) |
| LOS-004 | R-3.1 | model of another friendly unit fully blocking → not visible |
| LOS-005 | R-3.2 | 5-model target unit, only one model visible → unit visible; may be targeted |
| LOS-006 | R-3.3 | target half hidden behind a 2" crate → visible but not fully visible |
| LOS-007 | R-3.7 | observer outside ruin A, target outside ruin A on the far side, open window between → not visible |
| LOS-008 | R-3.7 | observer outside ruin, target wholly within ruin ground floor behind a window → visible |
| LOS-009 | R-3.7 | observer wholly within ruin, target outside → visible (sees out normally) |
| LOS-010 | R-3.7 | both models inside the same ruin, interior wall between → wall blocks like any solid |
| LOS-011 | R-3.7 | observer on ruin upper floor, target beyond the ruin footprint edge on the other side, ray passes over the footprint → not visible |
| LOS-012 | R-3.7 | observer outside, ray clips the ruin footprint corner at ground level → not visible (footprint prism blocks) |
| LOS-013 | R-3.11 | Boy (Sv5+) in ruin wholly within footprint targeted by bolt pistol AP0 → save on 4+ |
| LOS-014 | R-3.12 | Term (Sv2+) in ruin vs AP0 → save 2+ (no cover bonus); vs AP−1 → cover gives 2+ (3+ +1) |
| LOS-015 | R-3.12 | Infernus (Sv3+) in cover vs AP0 → needs 3 (no bonus); vs AP−1 → needs 3 (4 after AP, −1 from cover) |
| LOS-016 | R-3.13 | Go to Ground cover + ruin cover on the same model → only +1 total |
| LOS-017 | R-3.11 | model in cover targeted by melee attack → no cover bonus |
| LOS-018 | R-3.11 | model in cover using invulnerable save → no cover bonus |
| LOS-019 | §3.2 | INFANTRY wholly on crater → cover; VEHICLE (Dread) wholly on crater → no cover |
| LOS-020 | §3.2 | Infernus wholly within 3" of barricade and partly obscured by it from one attacking model → cover; fully visible to every attacking model → no cover |
| LOS-021 | §3.2 | model behind a barricade but 3.5" from it → no cover |
| LOS-022 | §3.2 | Dread partially obscured by a container (HILL) → cover (no INFANTRY restriction) |
| LOS-023 | R-3.14 | 5 attackers, target not fully visible to 4 of them but fully visible to the 5th → no cover from that obstacle |
| LOS-024 | §3.2 | model wholly within ruin footprint, fully visible through a doorway to all attackers → still has cover (wholly within) |
| LOS-025 | R-3.8 | Term on ruin floor 6" up shooting storm bolter at Boyz at ground level → AP −1 (Plunging Fire) |
| LOS-026a | R-3.8 | shooter 5.9" up → no Plunging Fire; 6.0" → Plunging Fire |
| LOS-026b | R-3.8 | target unit with one model standing on a 1" crate (y > 0) → not "every model at ground level" → no Plunging Fire **[interp]** |
| LOS-027 | §3.2 Woods | model wholly within woods → never fully visible → cover vs every ranged attack |
| LOS-028 | R-3.5 | attempt to target a terrain feature → `E_INVALID_TARGET` |
| LOS-029 | R-3.10 | move ending on an objective marker disc → `E_OVERLAP` |
| LOS-030 | R-3.9 | charging unit across a barricade ends within 2" of a target within 1" of it → charge succeeds; both units count as in ER for fighting |
| LOS-031 | R-3.4 | 5-model unit, four models fully visible, the fifth half behind a crate → unit not fully visible; models of the observed unit standing in front of each other → still fully visible (own unit ignored) |

## CMD — command phase, battle-shock, CP
| ID | Ref | Scenario → expected |
|---|---|---|
| CMD-001 | R-4.1 | start of player A's Command phase → both A and B gain 1 CP (`CpChanged` ×2) |
| CMD-002 | R-4.2 | player gains 1 CP from Clash of Patrols and 1 from Supply Lines in the same round → second gain discarded |
| CMD-003 | R-4.2 | extra CP gained in round 2 and another in round 3 → both kept (cap is per round) |
| CMD-004 | R-4.3 | 10-Boyz unit at 4 models, Ld 7+, 2D6 = 7 → pass; 2D6 = 6 → Battle-shocked |
| CMD-005 | R-4.4 | Boyz at 5 models → no test (5 is not below half of 10) |
| CMD-006 | R-4.4 | Gordrang (W7) at 3 wounds → test; at 4 wounds → no test |
| CMD-007 | R-4.4 | Captain (W6) at 3 wounds → no test (3 is not < 3); at 2 wounds → test |
| CMD-008 | R-4.5 | Captain + 5 Terms (SS 6) at 3 models → no test; at 2 models → test |
| CMD-009 | R-4.5 | all Terms dead, Captain alone at full wounds → SS reverts to 1, no test |
| CMD-010 | R-4.3 | tests only for units on the battlefield; unit in Reserves below half (impossible) / embarked → skipped |
| CMD-011 | R-4.6a | Battle-shocked Boyz within range of marker → contribute OC 0 |
| CMD-012 | R-4.6c | owner targets Battle-shocked unit with Get Stuck In → rejected `E_INVALID_TARGET` |
| CMD-013 | R-4.6c | opponent's Fire Overwatch targets own unit while the enemy Battle-shocked unit moves → allowed (restriction is on the owner's stratagems) |
| CMD-014 | R-4.6b | Battle-shocked unit Falls Back without crossing enemies → Desperate Escape for every model |
| CMD-015 | R-4.3 | Battle-shock lasts until start of the owner's next Command phase → `BattleShockRecovered` emitted then, before new tests |
| CMD-016 | R-4.7 | Piston-driven Brutality: at start of Fight phase enemy Terms in ER of Dread take test; fail → Battle-shocked until their owner's next Command phase |
| CMD-017 | R-4.7 | Bestial Bellow: 2D6 = 7 with −1 vs Ld 6+ → 6 ≥ 6 pass; 2D6 = 6 → 5 fail |
| CMD-018 | R-4.3 | Insane Bravery window opens before each test only if owner has ≥1 CP and has not used it this battle |
| CMD-019 | R-4.3 | owner chooses test order among several units → each test emits `BattleShockTested` with unit id |
| CMD-020 | R-4.8 | already Battle-shocked unit (from Dread) fails Command-phase test → remains shocked, single flag |
| CMD-021 | CP-4.1 | SM player picks Oath target at start of Command phase → all SM attacks vs that unit get hit re-roll until next SM Command phase |
| CMD-022 | CP-4.1 | Oath target destroyed mid-turn → no re-selection until next Command phase |
| CMD-023 | R-11.1 | player with 0 CP → no stratagem windows opened in that phase |
| CMD-024 | R-11.1 | Command Re-roll used in Movement phase, then attempted again in same Movement phase → `E_STRATAGEM_USED`; allowed again in Shooting phase |
| CMD-025 | R-11.1 | player A uses Go to Ground in B's Shooting phase; A may use it again in B's next turn's Shooting phase |

## MOVE — movement, reserves, deep strike, transports
| ID | Ref | Scenario → expected |
|---|---|---|
| MOVE-001 | R-5.2 | Term (M5) path of 3" + 2" → legal; 5.01" → `E_OUT_OF_RANGE` |
| MOVE-002 | R-5.2 | path segment crosses an enemy base → rejected; crosses friendly Boy → allowed; ends overlapping any model → `E_OVERLAP` |
| MOVE-003 | R-5.2 | Dread path crosses Kopta (friendly VEHICLE) → rejected; crosses friendly Boy → allowed |
| MOVE-004 | R-5.2 | path leaves the 44×30 board → rejected |
| MOVE-005 | R-5.2 | Kopta pivot → 2" deducted once; Term pivot → 0" |
| MOVE-006 | R-5.3 | Advance: D6 rolled once per unit; every model allowance = M + roll; unit flagged `advanced`; cannot shoot (no Assault weapons) or charge |
| MOVE-007 | R-5.3 | Advanced Squighog Boyz (Assault weapons) → may shoot but only saddlegit/stikka ranged |
| MOVE-008 | R-5.1 | unit in ER offered only Remain Stationary / Fall Back |
| MOVE-009 | R-5.4 | Remain Stationary → flagged; Heavy would apply; unit cannot later move this phase |
| MOVE-010 | R-5.5 | Fall Back ending within ER → rejected; no legal end → unit cannot Fall Back (option absent) |
| MOVE-010b | R-5.5b | declared Fall Back boxed in after declaration (Overwatch casualties) → reverts to Remain Stationary (`UnitRemainedStationary`, not marked fallBack, unit activated, no moveUnit decision); with a strict destination available, staying put / empty placements are rejected |
| MOVE-011 | R-5.6 | Fall Back with 3 of 5 models crossing enemy bases, dice 1,2,5 → 2 models destroyed (owner chooses which), before movement |
| MOVE-012 | R-5.6 | FLY Kopta Falls Back over enemies → no Desperate Escape |
| MOVE-013 | R-5.6 | Battle-shocked 10-Boyz Fall Back, no crossing → 10 tests |
| MOVE-014 | R-5.5 | unit that Fell Back → cannot shoot, cannot charge (Brutal but Kunnin' restores charge only) |
| MOVE-015 | R-5.7 | Term climbs onto 3" container: horizontal 2" + vertical 3" = 5" ≤ M5 → legal; onto 4" → rejected |
| MOVE-016 | R-5.7 | ending a move on a wall top / mid-climb → `E_OVERLAP` |
| MOVE-017 | R-5.7 | Boy walks through ruin wall → allowed (INFANTRY); Dread through ruin wall → rejected; Dread on ruin ground floor through doorway → allowed |
| MOVE-018 | §3.2 Ruins | Term ends on upper floor with base fully on the floor → legal; overhanging → rejected; Dread on upper floor → rejected |
| MOVE-019 | R-5.8 | Kopta Normal move over enemy Terms, ending outside ER → legal; ending in ER → rejected |
| MOVE-020 | R-5.8 | Kopta ends on ruin upper floor 6" up, 8" horizontal → distance = sqrt(64+36) = 10" ≤ 12 → legal |
| MOVE-021 | R-5.13 | Terms Deep Strike at 9.1" horizontal from nearest enemy (vertical ignored) → legal; 9.0" → rejected |
| MOVE-022 | R-5.13 | Deep Strike placement breaking coherency → rejected; unit stays in Reserves |
| MOVE-023 | R-5.12 | unit arrived by Deep Strike → cannot move further; may shoot (Heavy bonus not granted), charge, fight |
| MOVE-024 | R-5.14 | Reserves in round 1 → Reinforcements step offers nothing; Rapid Ingress in round 1 → not offered |
| MOVE-025 | R-5.14 | Terms still in Reserves at end of round 3 → `UnitDestroyed`; does not score Stomp 'Em (not a melee kill) |
| MOVE-026 | R-5.11 | Reinforcements step occurs after all moves; arriving unit cannot then embark |
| MOVE-027 | R-5.9 | Krump da Gitz surge move by a Battle-shocked unit → not offered; by unit in ER → not offered; twice in a phase → second not offered |
| MOVE-027c | R-5.9 | RC-013: a surging unit's models each end as close as possible to the target (per-model push after the rigid translation), still coherent and outside Engagement Range |
| MOVE-040 | R-5.6 | RC-010: after Desperate Escape casualties the survivors re-submit the Fall Back move (coherency enforced, only tested models may cross enemies); no second roll |
| MOVE-028 | CP-5.2 | Tellyporta via `PlayerSetup.enhancementChoice = {unitRef:'boyz-a'}`: Gordrang + Boyz A (`deepStrikeWith` set both ways) in Reserves; Boyz A arrive round 2 without Gordrang → rejected (must arrive together within 3"); `unitRef` naming the Deffkoptas (not BOYZ) or an enemy unit → `createGame` throws `EngineInvariantError` |
| MOVE-029 | R-5.17 | (transport fixture) unit ends Normal move with all models within 3" of friendly transport → may embark; one model at 3.1" → cannot |
| MOVE-030 | R-5.18 | (transport fixture) disembark after transport moved → unit cannot move or charge; before → acts normally, cannot Remain Stationary |
| MOVE-031 | R-5.20 | (transport fixture) transport destroyed, 5 passengers, dice 1,1,3,4,6 → 2 mortal wounds, unit Battle-shocked, counts as moved, cannot charge |
| MOVE-032 | R-10.8 | Scouts 6" fixture: pre-battle Normal move ≤ 6" ending > 9" from enemies; first-turn player moves first |
| MOVE-033 | R-10.7 | Infiltrators fixture: deploy at 9.1" from enemy DZ edge and all enemy models → legal; 9.0" → rejected |
| MOVE-034 | R-5.2 | a unit may be selected to move only once per Movement phase |
| MOVE-035 | R-5.6 | Battle-shocked Boy that also crosses an enemy base while Falling Back → exactly one Desperate Escape die for that model this phase |
| MOVE-036 | R-5.1 | activation sequence: `chooseUnitToActivate` → `declareMove` (options = allowed types) → for Normal/Advance/Fall Back a `reactionWindow` `movement.moveStarted` for the opponent (only if Overwatch is legal) → `moveUnit` (positions) → `movement.unitMoved`; Remain Stationary → no `moveStarted` window, no `moveUnit` decision; Advance → `DiceRolled purpose:'advance'` emitted on `declareMove` |

## SHOOT — shooting sequence
| ID | Ref | Scenario → expected |
|---|---|---|
| SHOOT-001 | R-6.1 | unit that Advanced (no Assault) → not offered in `chooseUnitToActivate` |
| SHOOT-002 | R-6.1 | unit with no weapon having range + visibility to any enemy → not selectable |
| SHOOT-003 | R-6.2 | Terms in ER of Boyz → not eligible; Infernus (bolt pistols) in ER → eligible, pistols only, only at a unit they are in ER of |
| SHOOT-004 | R-6.2 | enemy Terms are within ER of Boyz A → Koptas cannot target those Terms (`E_INVALID_TARGET`) |
| SHOOT-005 | R-6.3 | Dread in ER of Terms shoots rokkit at a different, unengaged unit → −1 to hit; the engaged Terms cannot be a rokkit target (Blast vs unit in ER of a friendly unit, the Dread itself) |
| SHOOT-006 | R-6.3 | Kopta (VEHICLE) in ER shoots slugga (Pistol) at the engaged unit → no −1; kopta rokkits at that unit → Blast forbids |
| SHOOT-007 | R-6.3 | Terms (not engaged) shoot the Dread while it is in ER of friendly Boyz → allowed, −1 to hit; Boyz in ER of the Dread may shoot it only with sluggas (Pistol rule) |
| SHOOT-008 | R-6.4 | storm bolter 24": nearest target model at 24.0" → in range; 24.1" → `E_NOT_IN_RANGE` |
| SHOOT-009 | R-6.4 | target unit visible to model 1 only; model 2 declares the same target with no LoS → model 2's weapon rejected `E_NO_LOS` |
| SHOOT-010 | R-6.4 | one ranged weapon listed twice with two targets (or with `attacks`) → `E_SCHEMA`; two weapons on one model at two targets → allowed (melee splitting: FIGHT-018) |
| SHOOT-011 | R-6.4 | Smite: profile chosen before targets; both profiles in one activation → rejected |
| SHOOT-012 | R-6.7 | Infernus model declares bolt pistol + pyreblaster in the same activation → rejected (pistol OR others) |
| SHOOT-013 | R-6.7 | Kopta declares slugga + kopta rokkits → allowed (VEHICLE) |
| SHOOT-014 | R-6.6 | targets T1 and T2 declared; all T1 attacks resolve (all storm bolters, then assault cannon) before any T2 |
| SHOOT-015 | R-6.6 | target loses LoS/range mid-resolution (other weapon killed the visible model) → remaining attacks still resolved |
| SHOOT-016 | R-6.11 | BS3+ roll 3 → hit; roll 2 → miss; unmodified 1 with +1 → miss; unmodified 6 with −1 → hit and critical |
| SHOOT-017 | R-6.11 | +1 (Fury of the First) and +1 (hypothetical) and −1 (Stealth) → net +1; two −1 sources → net −1 only |
| SHOOT-018 | R-6.12 | S4 vs T5 → 5+; S5 vs T5 → 4+; S6 vs T5 → 3+; S12 vs T5 → 2+; S4 vs T9 → 6+; S5 vs T9 → 6+; S9 vs T9 → 4+ |
| SHOOT-019 | R-6.12 | unmodified 6 with −1 wound modifier → still wounds and is a critical wound; unmodified 1 with +1 → fails |
| SHOOT-020 | R-6.13 | Term unit with one model at 1 wound; new wound → must be allocated to it (`allocateAttack` not offered) |
| SHOOT-021 | R-6.13 | no wounded model, 5 healthy → defender chooses any model, including one not visible to the attacker |
| SHOOT-022 | R-6.13 | model that had an attack allocated but saved → subsequent attacks this phase still must go to it |
| SHOOT-023 | R-6.13 | previous-phase wounded model rule persists (wounded in Shooting, then Fight phase; derived from `woundsRemaining < W`, no flag reset) → still must be allocated first |
| SHOOT-024 | R-6.14 | Term vs AP−2: armour needs 4+, invuln 4+ → owner chooses; vs AP−3 → invuln 4+ better; choice recorded in `SaveRolled` |
| SHOOT-025 | R-6.14 | unmodified save roll 1 with +1 cover → fails |
| SHOOT-026 | R-6.14 | Boy Sv5+ vs AP−1 → needs 6; vs AP−2 → needs 7 → auto-fail (no roll needed but `SaveRolled` emitted with impossible target) |
| SHOOT-027 | R-6.15 | D2 attack on W1 Boy → Boy destroyed, 1 damage lost; next attack to a fresh Boy |
| SHOOT-028 | R-6.15 | D3 damage rolled per attack; 2 attacks on Term W3: rolls 2 then 3 → first Term at 1W, second attack must go to it → destroyed, 2 excess lost |
| SHOOT-029 | R-6.16 | 3 mortal wounds on a unit of Boys → 3 separate models die (spill over) |
| SHOOT-030 | R-6.17 | Devastating Wounds critical D3=3 on a W1 Boy → Boy dies, 2 lost |
| SHOOT-031 | R-6.17 | Hazardous failure 3 MW on a W1 Boy carrying KMB → only that model dies |
| SHOOT-032 | R-6.18 | assault cannon: 2 normal wounds + 1 dev-wound critical vs Terms → normal attacks allocated/saved first, then the mortal wounds |
| SHOOT-033 | R-10.5 | FNP 4+ (Gordrang in Waaagh!) takes D2: two rolls 4 and 3 → loses 1 wound |
| SHOOT-034 | R-10.5 | FNP applies to mortal wounds (Squighog FNP 5+ vs Tank Shock) |
| SHOOT-035 | R-10.5 | model with FNP 6+ (Beast Snagga) and Half-chewed FNP 5+ → single roll at 5+ |
| SHOOT-036 | R-6.8 | ranged attack vs Stealth unit → −1 hit; melee → no modifier |
| SHOOT-037 | R-6.9 | Lone Operative fixture at 12.1" → cannot be targeted; at 12" → can; when attached → normal |
| SHOOT-038 | R-6.10 | Librarian fires focused Smite → after all attacks one Hazardous test; roll 1 → 3 MW to the Librarian (only carrier) |
| SHOOT-039 | R-7 Hazardous | Koptas: KMB model wounded + failed test → wounded carrier chosen first; unwounded → non-character carrier |
| SHOOT-040 | R-6.22 | Overwatch: BS2+ Captain rolls 5 → miss; 6 → hit (critical) |
| SHOOT-041 | R-6.23 | Indirect Fire fixture vs unseen target: −1 hit, unmodified 3 fails, target gets cover |
| SHOOT-042 | R-6.5 | pyreblaster D6 attacks rolled per model per activation; 5 Infernus → 5 separate D6 |
| SHOOT-043 | R-6.24 | Oath of Moment (`reroll: all`) vs the Oath target, BS 3+: unmodified 2 → auto re-rolled, no decision, `DiceRerolled`; unmodified 4 (a hit) → `chooseOption` topic `rerollOffer` with `data.rollId`, options [die 0, keep]; keep → die unchanged; re-roll → new die, and Command Re-roll no longer offered for it (R-1.6) |
| SHOOT-044 | R-10.4 | Dread destroyed: D6 = 6 → every unit within 6" (both sides) suffers 1 MW; D6 = 5 → nothing |
| SHOOT-045 | R-10.4 | Deadly Demise rolled before removal; unit at 6.0" → affected; 6.1" → not |
| SHOOT-046 | R-6.1 | each unit shoots at most once per phase |
| SHOOT-047 | R-6.13/R-10.1 | attached Captain+Terms: attacks cannot be allocated to Captain while a Term lives, even if Captain is wounded |
| SHOOT-048 | R-10.1 | last Term dies mid-volley → remaining attacks of that volley may be allocated to the Captain; Captain becomes a separate unit after the volley |
| SHOOT-049 | R-6.12 | attacks vs attached Librarian(T5)+Infernus-like fixture (bodyguard T4) → wound vs T4 throughout the volley |
| SHOOT-050 | CP-4.2 | Champion Duellist Precision applies to melee only; Captain's storm bolter vs attached unit → no Precision |

## WEAP — weapon abilities
| ID | Ref | Scenario → expected |
|---|---|---|
| WEAP-001 | Assault | Advanced unit with Assault + non-Assault weapons → only Assault weapons may be declared |
| WEAP-002 | Heavy | Heavy fixture: Remained Stationary → +1 hit; moved → none; arrived from Reserves → none |
| WEAP-003 | Rapid Fire | storm bolter (RF2) at target 12.0" → 4 attacks; 12.1" → 2 attacks |
| WEAP-004 | Rapid Fire | shoota (RF1) at 9" → 3 attacks; per-model measurement (one model in half range, another not → 3 and 2) |
| WEAP-005 | Torrent | pyreblaster → no hit roll, all attacks hit, none critical (no Sustained/Lethal trigger) |
| WEAP-006 | Blast | rokkit D3 vs 10 Boyz → +2 attacks; vs 4 models → +0; vs 5 → +1; count taken at target selection |
| WEAP-007 | Blast | rokkit at a unit within ER of any friendly unit (including shooter) → `E_INVALID_TARGET` |
| WEAP-008 | Sustained Hits | Veil of Time: storm bolter unmodified 6 → 2 hits, 2 wound rolls |
| WEAP-009 | Sustained Hits | SH1 with hit roll 6 after re-roll (first roll 1, re-roll 6) → critical (re-rolls precede modifiers, unmodified 6) |
| WEAP-010 | Lethal Hits | Champion Duellist relic weapon: hit 6 → wound step skipped; not a critical wound (Precision still usable) |
| WEAP-011 | Lethal Hits + Sustained | both on one weapon (Captain in Tantus's unit): 6 → 1 auto-wound + 1 extra hit that rolls to wound normally |
| WEAP-012 | Devastating Wounds | assault cannon wound roll 6 vs Terms → no save (armour or invuln), 1 MW after other attacks |
| WEAP-013 | Devastating Wounds | dev-wound attack allocated last: 6 attacks, 3 normal wounds and 1 critical → normal three resolved, then the MW |
| WEAP-014 | Anti | Beast Snagga klaw (Anti-VEHICLE 4+) vs Dread, unmodified wound 4 → critical wound (auto-wound); vs Terms (INFANTRY) roll 4 vs S10/T5 → normal 2+ success, not critical |
| WEAP-015 | Anti + Dev | Anti-X 4+ on a Devastating Wounds fixture: wound 4 vs keyword target → mortal wounds |
| WEAP-016 | Twin-linked | kopta rokkits failed wound → re-rolled automatically; succeeded → `rerollOffer` decision (player may decline); `reroll: fails` sources never open the offer |
| WEAP-017 | Lance | stikka melee after a Charge move this turn → +1 wound; after Heroic Intervention charge → +1 (it is a Charge move) |
| WEAP-018 | Melta | Melta 2 fixture D6 at half range → D6+2; beyond → D6 |
| WEAP-019 | Ignores Cover | pyreblaster vs Boyz in ruin → save 5+ not 4+ |
| WEAP-020 | Indirect Fire | fixture: may target unit with no visible model; Torrent+Indirect → visibility required |
| WEAP-021 | Pistol | Boyz in ER: shootas/big shoota cannot fire; sluggas fire only at an engaged unit |
| WEAP-022 | Pistol | Boyz not in ER: a Boy with only slugga fires it at any target; the unit's shootas at another target |
| WEAP-023 | Hazardous | KMB Kopta selects targets → 1 test after unit finishes; kopta rokkits → no test |
| WEAP-024 | Hazardous | two failed tests in one unit (two hazardous weapons) → resolved one at a time, second may pick a different model |
| WEAP-025 | Precision | Epic Challenge Captain wounds attached Beastboss+Boyz with Beastboss visible → attacker may allocate to Beastboss; not visible → normal allocation |
| WEAP-026 | Precision | Precision with Devastating Wounds fixture → mortal wounds may be put on the CHARACTER |
| WEAP-027 | Extra Attacks | Squighog Boy fights: stikka (3) + jaws (3) → 6 attacks; Waaagh! → stikka 4, jaws stays 3 |
| WEAP-028 | Extra Attacks | Nob on Smasha Squig fights → big choppa (its only non-EA melee weapon) plus squig jaws, 4 + 3 attacks; jaws cannot be declined or chosen instead of the big choppa |
| WEAP-029 | One Shot | fixture: second use in a battle → weapon not offered |
| WEAP-030 | Psychic | force weapon wounds tagged psychic in `DamageApplied` event |
| WEAP-031 | Dead Choppy | Dread with 3 klaws → 6 attacks; under Waaagh! → 7 attacks, S13 |
| WEAP-032 | Waaagh! | during Waaagh!: choppa A4 S5; Boyz 5+ invuln offered vs AP−3; outside Waaagh! → no invuln |
| WEAP-033 | Waaagh! | Waaagh! offered as `chooseOption` topic `waaagh` in the `round.start` window; called at start of round 3 → effects stored with `duration: untilEndOfRound` (`expires.kind: roundEnd`), Ork units may charge after Advancing in round 3 (both player turns); `EffectExpired` after round 3's `round.end`, gone in round 4 |
| WEAP-034 | Waaagh! | attempt to call Waaagh! twice → second not offered; cannot be called mid-round |
| WEAP-035 | R-1.10 | Smite D6 attacks roll → `DiceRolled purpose:'attacks'` with `commandRerollable: true`; Command Re-roll offered on it when the Librarian's player has ≥1 CP |
| WEAP-036 | Dead 'ard | Gordrang FNP 4+ only during Waaagh! round |
| WEAP-037 | Grizzled Skarboy | ranged D3 (=3) allocated to Gordrang → 2; D1 → 1; melee D2 → 2 (unchanged) |
| WEAP-038 | Fury of the First | Term vs Oath target: +1 hit and hit re-roll both available |
| WEAP-039 | Unstoppable Valour | Captain's unit charge roll 4 needing 7 → both dice re-rolled automatically (R-6.24); roll 8 needing 7 → `rerollOffer`; a re-rolled 2D6 cannot then take Command Re-roll |
| WEAP-040 | Monster Hunters | Beast Snagga vs Dread → hit re-roll; vs Terms → none |
| WEAP-041 | Beastboss | Morgrim leading Boyz → their melee +1 hit; their ranged → none; Morgrim alone → none for others |

## CHARGE — charge phase, overwatch, heroic intervention
| ID | Ref | Scenario → expected |
|---|---|---|
| CHARGE-001 | R-8.1 | unit 12.0" from an enemy → may declare; 12.1" → not offered |
| CHARGE-002 | R-8.1 | unit that Advanced → not offered; under Waaagh! (ORKS) → offered; SM Advanced → not |
| CHARGE-003 | R-8.1 | unit in ER → not offered; unit that Fell Back → not offered unless Brutal but Kunnin' used this phase |
| CHARGE-004 | R-8.2 | targets need not be visible (behind ruin) → declaration accepted |
| CHARGE-005 | R-8.2 | target at 13" (out of 12") → `E_INVALID_TARGET` |
| CHARGE-006 | R-8.3 | 2D6 rolled once per charge, `DiceRolled purpose:'charge'` |
| CHARGE-007 | R-8.4 | roll 7, nearest target model 7.5" away (edge to edge) → charge fails, no move, `ChargeFailed` |
| CHARGE-008 | R-8.4 | roll 7, target 6" but reaching it requires passing within ER of a non-target unit → fails |
| CHARGE-009 | R-8.4 | two targets declared, roll reaches one but not the other → fails |
| CHARGE-010 | R-8.4 | 10 Boyz charge, roll 5, only 6 models can reach ER while keeping coherency → succeeds if a coherent arrangement with unit in ER of every target exists (not every model must reach) |
| CHARGE-011 | R-8.5 | a charging model ends farther from all targets than it started → rejected |
| CHARGE-012 | R-8.5 | a model could reach base contact within the roll but is placed 0.5" away → rejected (must make base contact if possible) |
| CHARGE-013 | R-5.7/R-8.4 | target on a 3" container, horizontal gap 4.5" → needs roll ≥ 7.5 → 8+ |
| CHARGE-014 | R-8.6 | successful charger has Fights First this turn; fights in step 1 |
| CHARGE-015 | R-8.8 | Kopta charge path over enemy models allowed; ends on a model → rejected |
| CHARGE-016 | Fire Overwatch | enemy Boyz declare a charge 20" from my Terms → no window at `charge.declared`; roll 9 vs 7" needed (feasible) → `reactionWindow` `charge.moveStarted` for me (Terms visible to target, ≤24", eligible to shoot; option = `useStratagem core.s.fire-overwatch`) |
| CHARGE-017 | Fire Overwatch | my unit Advanced this turn (own previous turn irrelevant: check current-turn flags → not Advanced in opponent's turn) → eligible; my unit in ER → not eligible |
| CHARGE-018 | Fire Overwatch | Overwatch already used this turn → second window not opened |
| CHARGE-019 | Fire Overwatch | Movement phase: enemy `declareMove` Normal within 24" and visible → `movement.moveStarted` window (before any model moves); after the move ends within 24" → `movement.unitMoved` window; set up via Deep Strike → `movement.reinforcements` window; Remain Stationary → none |
| CHARGE-020 | Fire Overwatch | Overwatch shooting vs the Oath target: a failed hit die is re-rolled by Oath and hits only on an unmodified 6; Fury of the First +1 has no effect **[interp: abilities not keyed to "your Shooting phase" still work]** |
| CHARGE-021 | Fire Overwatch | roll already made (7, feasible with 10 Boyz); Overwatch at `charge.moveStarted` kills the 4 Boyz that could reach → R-8.4 re-checked with survivors → `ChargeFailed`, no model moves, no `chargeMove` decision; if a feasible arrangement remains → `chargeMove` decision as normal |
| CHARGE-022 | Fire Overwatch | Hazardous test failed during Charge-phase Overwatch → MW applied after the charge move ends |
| CHARGE-023 | Heroic Intervention | enemy ends charge 5" from my Boyz (not in ER, not Advanced/Fell Back) → `charge.moveEnded` window; my Boyz charge only that unit with 2D6; success → no Fights First |
| CHARGE-024 | Heroic Intervention | Dread (WALKER) may intervene; Kopta (VEHICLE, not WALKER) may not |
| CHARGE-025 | Heroic Intervention | intervening unit 6.1" away → not offered |
| CHARGE-026 | Tank Shock | Dread ends charge in ER of Terms → 9 dice, each 5+ = 1 MW, cap 6 |
| CHARGE-027 | Tank Shock | Koptas (T6) → 6 dice |
| CHARGE-028 | R-8.1 | each unit may declare a charge once per phase; failed charge → no second attempt |
| CHARGE-029 | Brutal but Kunnin' | used on Boyz that Fell Back → charge offered this phase only for that unit |
| CHARGE-030 | R-8.4 | charge move into a ruin: Term must pass through doorway/walls as INFANTRY → allowed; Dread through wall → path invalid |
| CHARGE-031 | R-8.4 | failed charge (roll 4, target 6" away): every model's `pos` identical before and after, `ChargeFailed` emitted, unit flagged as having declared (CHARGE-028) |
| CHARGE-032 | R-8.5 | RC-034: a MONSTER/VEHICLE charger's path through a friendly MONSTER/VEHICLE model is rejected (E_OVERLAP); same rule applies to pile-in/consolidate (FIGHT-*) and is skipped for FLY |

## FIGHT — fight phase
| ID | Ref | Scenario → expected |
|---|---|---|
| FIGHT-001 | R-9.1 | active player A charged with Terms; B has Boyz in ER (no Fights First) → step 1: Terms fight; step 2: B picks first among remaining |
| FIGHT-002 | R-9.1 | both players have Fights First units → non-active player selects first in step 1 |
| FIGHT-003 | R-9.1 | player with eligible units attempts `pass` → `E_PASS_NOT_ALLOWED` |
| FIGHT-004 | R-9.1 | B has 2 eligible, A has 0 → B fights both consecutively |
| FIGHT-005 | R-9.1 | unit fights once per phase; selecting it again → `E_NOT_AN_OPTION` |
| FIGHT-006 | R-9.2 | unit in ER but did not charge → eligible in step 2; unit not in ER and did not charge → not eligible |
| FIGHT-007 | R-9.2 | unit charged but every target died to Overwatch, ended not in ER → still eligible (charged), pile-in may bring it into ER |
| FIGHT-008 | R-9.3 | Heroic Intervention unit → step 2 only |
| FIGHT-009 | R-9.3 | unit gains ER only after an enemy consolidation → fights in step 2 (even with Fights First) |
| FIGHT-010 | R-9.5 | pile-in 3.0" ending closer to closest enemy → legal; 3.1" → rejected; ending farther → rejected |
| FIGHT-011 | R-9.5 | model already in base contact → cannot move |
| FIGHT-012 | R-9.5 | pile-in cannot end unit within ER of any enemy → no model moves (decision skipped) |
| FIGHT-013 | R-9.5 | model can reach base contact → must (placing at 0.3" rejected) |
| FIGHT-014 | Get Stuck In | pile-in up to 6" for that unit; consolidation up to 6" too; Get In There → pile-in only |
| FIGHT-015 | R-9.6 | Boy at 1.2" from enemy (not in ER) but in base contact with a Boy that touches an enemy → may attack |
| FIGHT-016 | R-9.6 | Boy 1.2" away, touching a friend who is only within ER (not base contact) → cannot attack |
| FIGHT-017 | R-9.7 | Term picks power fist; cannot also use a second melee weapon; Squighog jaws added automatically |
| FIGHT-018 | R-9.8 | model in ER of unit X only, touching friend in base contact with unit Y → may target X or Y; power fist A3 split as two `targets[]` entries `{attacks: 2 → X}`, `{attacks: 1 → Y}` → accepted; 2 + 2 → `E_SCHEMA` (sum ≠ A) |
| FIGHT-019 | R-9.7 | no eligible target after pile-in → no attacks; consolidation still offered |
| FIGHT-020 | R-9.9 | melee attack sequence uses WS; save/damage identical to shooting; no Benefit of Cover |
| FIGHT-021 | R-9.9 | all declared attacks resolved even after the target unit's models leave ER (killed) |
| FIGHT-022 | R-9.10 | consolidation 3" toward closest enemy, base contact if possible |
| FIGHT-023 | R-9.10 | no enemy reachable within ER → move up to 3" toward closest objective if the unit ends within range of it; otherwise no move |
| FIGHT-024 | R-9.10 | consolidation into ER of a fresh enemy unit → that enemy becomes eligible to fight this phase (step 2) |
| FIGHT-025 | R-9.12 | Counter-offensive after enemy unit fought → my chosen unit fights immediately; it counts as a selection, so the opponent selects next (RC-040; no double activation for the Counter-offensive player) **[interp]** |
| FIGHT-026 | R-9.12 | Counter-offensive on a unit that already fought → `E_INVALID_TARGET` |
| FIGHT-027 | Epic Challenge | usable only when the CHARACTER's unit is in ER of an attached unit; Precision on its melee attacks until end of phase |
| FIGHT-028 | R-9.13 | after Fight phase: coherency cull (R-2.6), then `turn.end` windows, then next player's Command phase |
| FIGHT-029 | Piston-driven | Dread in ER of two enemy units at start of Fight phase → both test; Dread itself not tested |
| FIGHT-030 | Veteran Instincts | Terms re-roll wound 1s; vs Dread re-roll any failed wound; stratagem must be used before the unit is selected |
| FIGHT-031 | Gene-wrought | Boyz choppa S4 vs Term T5 → no −1 (S not > T); 'uge choppa S12 → −1 wound |
| FIGHT-032 | R-9.5 | pile-in over a 2" crate ignored; onto 3" container costs vertical distance |
| FIGHT-033 | R-9.5 | pile-in path whose segment crosses an enemy base → rejected `E_OVERLAP`; crossing a friendly Boy → allowed |
| FIGHT-034 | R-9.4 | after melee targets declared: `stratagemWindow` `fight.targetsDeclared` for the targeted unit's owner first (Gene-wrought / Tough as Squig-hide usable, `TargetSpec.state: targetedByAttack` satisfied), then the fighting player; no window before targets are declared |

## LEAD — leaders, characters
| ID | Ref | Scenario → expected |
|---|---|---|
| LEAD-001 | R-10.1 | Captain attaches to Terms at Declare Battle Formations → one unit of 6 in state; Librarian cannot also attach |
| LEAD-002 | R-10.1 | Librarian attaches instead → Captain deploys alone |
| LEAD-003 | R-10.1 | Gordrang has no Leader ability → attach option absent |
| LEAD-004 | R-10.1 | attached unit moves/shoots/charges as one unit; coherency includes the leader |
| LEAD-005 | R-10.1 | attacks vs Tantus+Terms wound against T5 (bodyguard T) |
| LEAD-006 | R-10.1 | bodyguard destroyed → leader separate unit, SS 1; `UnitDestroyed` emitted for the bodyguard unit only |
| LEAD-007 | R-10.1 | leader destroyed (via Precision) → `UnitDestroyed` for the CHARACTER unit; bodyguard continues as a separate unit with SS 5 |
| LEAD-008 | R-10.1 | destroying only the bodyguard does not satisfy "destroyed a CHARACTER unit" conditions |
| LEAD-009 | R-1.7 | persisting effect (Gene-wrought) on attached unit; leader split mid-phase → both halves keep the effect |
| LEAD-010 | R-4.5/CMD | attached unit below half (2 of 6 models) → single test for the unit |
| LEAD-011 | CP-4.2 | Oathsworn Determination: Captain+5 Terms on a marker → LoC 12; Captain alone → 2 |
| LEAD-012 | Veil of Time | Tantus leading Terms → Terms' storm bolters and fists gain SH1; after Tantus dies → lost |
| LEAD-013 | R-10.1 | Precision attack vs attached unit when the CHARACTER is not visible to the attacking model → normal allocation |
| LEAD-014 | R-10.1 | bodyguard's last model dies to mortal wounds spilling over → spill continues onto the CHARACTER (mortal wounds allocate like attacks; after last bodyguard dies the character is allocatable) |
| LEAD-015 | Bosskilla / Duellist | Precision from an enhancement applies to every melee attack by the bearer, without Epic Challenge |
| LEAD-016 | CP-4.2 / 20 §3 | Champion Duellist (`scope.who: bearer`, `RuntimeAbility.bearerModelId` = Captain model): Captain attached to Terminators → relic weapon has Lethal Hits + Precision; the Terminators' power fists have neither; Oathsworn Determination (`self`) → every model of the attached unit OC 2 |

## STRAT — stratagems and CP economy
| ID | Ref | Scenario → expected |
|---|---|---|
| STRAT-001 | R-11.1 | 0 CP → no `stratagemWindow` decisions at all in that phase |
| STRAT-002 | R-11.1 | Counter-offensive with 1 CP → not offered (costs 2) |
| STRAT-003 | R-11.1 | same stratagem twice in one phase → second not offered / `E_STRATAGEM_USED` |
| STRAT-004 | R-11.1 | Command Re-roll in A's Shooting phase and again in B's Shooting phase → both legal |
| STRAT-005 | R-11.2 | stratagem targeting own Battle-shocked unit → not offered |
| STRAT-006 | Command Re-roll | after an Advance roll → re-roll; after a charge roll → both dice re-rolled; after a single save in fast rolling → one die |
| STRAT-007 | Command Re-roll | on a die already re-rolled by Oath → not offered (R-1.6) |
| STRAT-008 | Command Re-roll | Forward Outpost lockout active → never offered to that player |
| STRAT-009 | Insane Bravery | used once → never offered again; test auto-passes, no dice |
| STRAT-010 | Insane Bravery | Display of Might: unit 6.1" from WARLORD → not offered |
| STRAT-011 | Grenade | no GRENADES unit in rosters → never offered (data test with a GRENADES fixture: 6D6, 4+ = MW, target within 8" and visible, not in ER) |
| STRAT-012 | Rapid Ingress | at end of opponent's Movement phase, my Terms in Reserves, round 2 → arrive by Deep Strike; round 1 → not offered |
| STRAT-013 | Rapid Ingress | unit arriving by Rapid Ingress in opponent's turn → cannot move that turn; may be charged; may Overwatch later |
| STRAT-014 | Go to Ground | Terms targeted → 6+ invuln (they already have 4+: choose better) and cover until end of phase |
| STRAT-015 | Go to Ground | target Dread (VEHICLE) → not offered |
| STRAT-016 | Smokescreen | no SMOKE unit → never offered |
| STRAT-017 | Heroic Intervention | alias → CHARGE-023, CHARGE-024, CHARGE-025 |
| STRAT-018 | Tank Shock | offered in `stratagemWindow` `charge.moveEnded` only to the player whose VEHICLE just made a Charge move (Dread charge → offered; Dread that Heroically Intervened → not offered, out-of-phase rule (RC-041); Dread that did not charge this phase → not offered) |
| STRAT-019 | Fire Overwatch | once per turn across both Movement and Charge phases |
| STRAT-020 | Epic Challenge | alias → FIGHT-027 |
| STRAT-021 | Duty and Honour | marker stays SM-controlled with no models; Orks have LoC 4 there at the start of their turn (`controllerAtTurnStart` = B) or at a turn end → sticky flag cleared; Ork presence only mid-turn (left before turn end) → flag kept |
| STRAT-022 | Gene-wrought | offered at `shooting.targetsDeclared` (opponent's Shooting) and `fight.targetsDeclared` (either Fight phase) to the targeted unit's owner, before any hit roll; not at `fight.unitSelected`; effect lasts the phase for all attackers |
| STRAT-023 | Veteran Instincts | target must be TERMINATOR unit not yet selected; Infernus → not offered |
| STRAT-024 | Get Stuck In / Get In There | alias → FIGHT-014; Get Stuck In offered at `fight.start` and after each activation (`fight.attacksResolved`), not once the unit is selected; Get In There! also at `fight.unitSelected` |
| STRAT-025 | Krump da Gitz | after enemy unit finished shooting at Boyz → Boyz Normal move D6", must end as close as possible to that enemy, not in ER; Battle-shocked → not offered |
| STRAT-026 | Brutal but Kunnin' | alias → CHARGE-029 |
| STRAT-027 | Bestial Bellow | start of Fight phase, enemy within 3" of Beastboss → test with −1 |
| STRAT-028 | Tough as Squig-hide | Squighog (MOUNTED) → not offered; Beast Snagga Boyz → offered |
| STRAT-029 | R-11.3 | window ordering when both players could use a stratagem in `shooting.targetsDeclared` → opponent first, then active |
| STRAT-030 | R-1.8 | Overwatch shooting cannot use Shooting-phase stratagems (Grenade) |
| STRAT-031 | CP-1.7 | game starts with 0 CP each; after round 1 player-1 Command phase both have 1; after player-2 Command phase both have 2 |
| STRAT-032 | R-4.2 | Clash of Patrols: A recovers data (+1 CP) in round 2, then any second non-automatic CP gain for A in round 2 → discarded |
| STRAT-033 | CP-1.6 | Epic Challenge offered only for a unit containing a CHARACTER model in ER of an attached enemy unit; Terminator Squad without leader → not offered |
| STRAT-034 | R-11.5 | Fire Overwatch, Heroic Intervention, Rapid Ingress, Counter-offensive arrive as `reactionWindow` decisions whose options are `useStratagem` actions (0 CP → no window; same stratagem twice in a phase → `E_STRATAGEM_USED`); Tank Shock and Go to Ground arrive as `stratagemWindow` |

## MISSION — missions, objectives, scoring, game end
| ID | Ref | Scenario → expected |
|---|---|---|
| MISSION-001 | R-12.1 | model 3.0" horizontally from marker edge → in range; 3.1" → not; 2" horizontal but 5.1" up → not |
| MISSION-002 | R-12.2 | 5 Boyz (OC2) vs 5 Terms (OC1) on a marker → Orks control (10 vs 5) |
| MISSION-003 | R-12.3 | LoC 4 vs 4 → contested; 0 vs 0 → contested |
| MISSION-004 | R-4.6a | Battle-shocked Boyz LoC 0 vs Captain 1 → SM control |
| MISSION-005 | R-12.3 | control re-evaluated at end of each phase; `ObjectiveControlChanged` emitted only on change |
| MISSION-006 | CP-2.4 | end of Ork Command phase, Boyz (BATTLELINE) on marker, controlled → secured; SM Terms (not BATTLELINE) → not secured |
| MISSION-007 | CP-2.5 | secured marker, Boyz leave; end of next SM Command phase SM has LoC 2 there → SM controls and secure cleared; Orks with 0 there in between → still Ork-controlled at Ork scoring |
| MISSION-008 | CP-2.5 | secured marker; SM presence at end of SM Movement phase only (not Command) → secure not broken |
| MISSION-008 | CP-2.5 | RC-048: secured marker; opponent LoC higher at a non-Command check → opponent controls it then, secure flag intact; once they leave the securer controls again |
| MISSION-009 | CP-2.4 | Battle-shocked BATTLELINE on marker → cannot secure |
| MISSION-010 | CP-2.1 | round 1 → no primary VP for either player |
| MISSION-011 | CP-2.1 | round 5: first player scores at end of Command phase; second player at end of their turn |
| MISSION-012 | Clash | 4 markers controlled → 15 VP (cap) |
| MISSION-013 | Clash | recover data: marker used by A in round 2 → B cannot use it later; WARLORD dead → no CP |
| MISSION-014 | Archeotech | `mission.rules` hook `irradiatedPowerCells` at `round.start`: round 3 Gamma chosen among 3 NML markers ((0,0),(−8,8),(8,−8)) with `DiceRolled purpose:'mission'`; round 4 removed (`ObjectiveRemoved`), Beta chosen among remaining 2; round 5 removed; `battle.end`: 10 VP (`holdNamed`) for controlling the last NML marker |
| MISSION-015 | Archeotech | round 5 second player scores at end of Command phase (not end of turn) |
| MISSION-016 | Forward Outpost | control both NML markers + enemy DZ marker → 5+5+10 = 20 → capped 15 |
| MISSION-017 | Forward Outpost | end of A's turn, A controls B's DZ marker → B loses Command Re-roll permanently (still after A loses the marker) |
| MISSION-018 | Scorched Earth | Attacker may not raze A; Defender may not raze B; marker with enemy unit within 3" cannot be razed; razing when only 1 marker remains → not allowed |
| MISSION-019 | Scorched Earth | razed this turn → 10 VP that Command phase; razed marker no longer counts for control |
| MISSION-020 | Scorched Earth | DZ triangle: Attacker deploy at (−5,−14) → inside (x ≤ −22 + 22·(15−z)/30 → −22+21.3 = −0.7 ≥ −5 ✓); at (−5,0) → outside |
| MISSION-021 | Sweeping Raid | `battle.end` scoring rules (`holdNamed`): Attacker controls C and D → +15; Defender controls A → +10; `VpScored` emitted before `GameEnded` |
| MISSION-022 | Sweeping Raid | Supply Lines: Attacker controls A at start of Command phase, D6 4 → +1 CP (subject to cap) |
| MISSION-023 | Sweeping Raid | round 5 → no per-turn primary |
| MISSION-024 | Display of Might | control 2 markers, one site claimed by Captain this and last turn → 5+5+5+5 = 20 |
| MISSION-025 | Display of Might | claim persists while the claiming model stays in range; model leaves → claim lost; another CHARACTER can claim later |
| MISSION-026 | Display of Might | Insane Bravery restricted to units within 6" of WARLORD |
| MISSION-027 | CP-1.10 | deployment alternates starting with Defender; unit partly outside DZ → rejected |
| MISSION-028 | CP-1.10 | first-turn roll-off winner takes first turn (no choice) |
| MISSION-029 | CP-1.11 | round 5 completes → `GameEnded` with VP totals; higher wins; equal → draw |
| MISSION-030 | R-12.6 | Ork army wiped in round 3 → Ork turns skipped, SM continues scoring through round 5 |
| MISSION-031 | R-12.8 | resign → immediate `GameEnded`, opponent wins |
| MISSION-032 | Wrath of the Emperor | Captain model kills a Boy in Shooting phase and another in Fight phase → 2 + 2 VP at each `phase.end`; kills two in one phase → 2 VP; `secondaryState.killsThisPhase` reset at phase end |
| MISSION-032b | Wrath of the Emperor | Captain attached to the Terminator Squad; a Terminator's power fist kills a Boy (`ModelDestroyed.byModelId` = that Terminator) → 0 VP; a mortal wound from the Captain's unit (`byModelId: null`) → 0 VP |
| MISSION-033 | Shock Tactics | `Objective.controllerAtTurnStart` = B (Ork-controlled at start of SM turn), SM-controlled at `turn.end` → 5 VP; contested at start → 0; taken and lost again within the turn → 0 |
| MISSION-034 | Stomp 'Em | `chooseOption` topic `stompTarget` in the `round.start` window of round 2 (not round 1); destroyed by Ork melee in round 2 (`destroyedBy.kind: melee`, ORKS unit) → 3 VP at `round.end`; destroyed by shooting → 0; still alive → 0 and a new pick at round 3 |
| MISSION-035 | Proper Lootin' | marker outside DZ, Boyz in range not in ER: D6 1 → nothing, retry allowed next turn; 3 → 3 VP looted; later → cannot loot again |
| MISSION-036 | Bag the Big 'Un | `chooseOption` topic `bagTarget` at `round.start` of round 1, options = enemy MONSTER/VEHICLE models (else the WARLORD); at `battle.end`: destroyed with `destroyedBy.modelId` = the Beastboss model → 12; by a Beast Snagga Boy in the Beastboss's unit → 8; alive → 0 |
| MISSION-037 | CP-1.5 | secondary VP added to primary totals; per-source `VpScored` events |
| MISSION-038 | R-12.7 | Battle Ready constant default 0 for both; config 10/10 changes nothing about winner |
| MISSION-039 | CP-2.5 §2.5 | objectives placed at exact mission coordinates; marker radius 0.787" used for range |
| MISSION-040 | R-5.16 | Reserves unit never arrived → counts as destroyed for Bag the Big 'Un |
| MISSION-040 | R-5.16 | RC-050: target culled from stranded Reserves (destroyed, no killer) → Bag the Big 'Un unit tier (8 VP) |
| MISSION-041 | CP-1.4 | optional enhancement chosen at setup → data applied (Tellyporta grants Deep Strike) |
| MISSION-042 | Sweeping Raid | markers B (−3,9) and C (3,−9) are NML; A and D are DZ markers |
| MISSION-043 | CP-3.2 | layout `terrain.cp-01` loaded with every mission: each piece's footprint > 1" from every marker point; the piece set is invariant under 180° rotation about the origin (each footprint maps onto another's within 0.01") |
| MISSION-044 | CP-1.5 / R-12.5 | secondary per-instance caps: Display of Might-style secondary fixture with cap 5 and two conditions met → 5 VP once; Wrath of the Emperor twice in the same phase → 2 VP (cap per instance) |
| MISSION-045 | R-12.6 | both armies wiped out simultaneously (Deadly Demise kills the last models of both sides in round 3) → `battle.end` window, `GameEnded` with `reason: 'tabled'`, winner by VP; only one side wiped → reason `vp` after round 5 (MISSION-030) |

## SIM — headless simulator invariants
| ID | Ref | Scenario → expected |
|---|---|---|
| SIM-001 | 00-arch §6 | 100 random-legal games, seeds 1..100 → all reach `GameEnded` within 5 rounds |
| SIM-002 | | no model ever has wounds < 0 or > W |
| SIM-003 | | no NaN / non-finite position or stat; positions inside board |
| SIM-004 | | every model always within its unit's coherency at phase end (after culls) |
| SIM-005 | | no two bases overlap at any decision point |
| SIM-006 | | no model within ER of an enemy after a Normal/Advance/Fall Back move or set-up |
| SIM-007 | | CP never negative; per-round extra CP gain ≤ 1 |
| SIM-008 | | VP monotonic non-decreasing; per-instance caps respected |
| SIM-009 | | replay of the action log reproduces `state.hash` at every seq |
| SIM-010 | | every `rng.roll` produced a `DiceRolled` event |
| SIM-011 | | each unit shoots ≤ 1×, fights ≤ 1×, moves ≤ 1× per phase (excluding surge/pile-in) |
| SIM-012 | | Insane Bravery used ≤ 1 per player per game; Waaagh! ≤ 1 per game |
| SIM-013 | | Reserves units all on board or destroyed by end of round 3 |
| SIM-014 | | game ends in a draw only when VP equal; `GameEnded.winner` consistent |
| SIM-015 | | `legalActions` for finite decisions never empty when `canPass` is false |
| SIM-016 | | attached units are never allocated wounds on the CHARACTER while bodyguards live (assert in allocation) |
| SIM-017 | | objective control events only at phase/turn ends or rule-triggered evaluations |
| SIM-018 | | all six missions × both roster pairings run without invariant failures |

## NEC — Necrons: Amonhotekh's Guard (docs/spec/factions/necrons.md)
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
| NEC-023 | NEC-4 | Treasures of Aeons: a kill with no `byModelId` (Hazardous / self-inflicted) → 0 VP; a Tank Shock or grenade kill by a NECRONS unit → +3 VP (RC-090); a kill by Deadly Demise from a NECRONS model → +3 VP (RC-072) |
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
| NEC-039 | NEC-2.4 | RC-102: a returned model must pass `terrainService.canEndAt` (not inside a solid crate/wall, not mid-air); candidate heights are neighbour y, surface height, ground |

## CHA — Chaos Space Marines: Zarkan's Daemonkin (docs/spec/factions/chaos-space-marines.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| CHA-001 | CHA-2.1 | Legionaries selected to shoot → Dark Pact offered at `shooting.unitSelected` with lethal / sustained / decline; decline → no Ld roll, no effect |
| CHA-002 | CHA-2.1 | Possessed selected to fight → Dark Pact offered at `fight.unitSelected` before pile-in |
| CHA-003 | CHA-2.2 | Pact made, Ld test 2D6 = 7 vs Ld 6+ → pass, no mortal wounds; weapons gain the picked ability until phase end |
| CHA-004 | CHA-2.2 | Pact made, Ld test fails → D3 mortal wounds on the unit (owner allocates), then the ability is still gained |
| CHA-005 | CHA-2.2 | Ld test is not a Battle-shock test: failing never sets `battleShocked`, Insane Bravery is not offered, Battle-shock modifiers do not apply |
| CHA-006 | CHA-2.3 | Lethal Hits pact: boltgun critical hit auto-wounds; Sustained Hits pact: critical hit adds 1 hit; both expire at phase end |
| CHA-007 | CHA-2.3 | attached Zarkan + Possessed make one Pact: one Ld test using best Ld, ability on both halves' weapons |
| CHA-008 | CHA-2.3 | Pact mortal wounds destroy the whole unit → no declareTargets, no ability granted |
| CHA-009 | CHA-2.4 | Fire Overwatch by Legionaries → no Dark Pact prompt |
| CHA-010 | CHA-3 | Foul Zealotry: Zarkan's unit Pact options are both / decline; `both` grants Lethal Hits and Sustained Hits 1 together |
| CHA-011 | CHA-3 | Foul Zealotry does not affect Cultists or an un-led unit (pick-one options) |
| CHA-012 | CHA-3 | Prey on the Weak: Rite of Possession hits enemy unit X → after Zarkan's unit shoots, pick X, X tests Battle-shock with −1 |
| CHA-013 | CHA-3 | Prey on the Weak: enemy hit only by bolt pistol / Legionary boltguns → no prompt; Rite attacks all miss → no prompt |
| CHA-014 | CHA-4 | Marked for Execution: opponent WARLORD destroyed in round 2 → +12 VP; in round 4 → +6 VP; never scores twice |
| CHA-015 | CHA-4 | Marked for Execution: WARLORD killed by its own Hazardous roll still scores |
| CHA-014 | CHA-4 | CSM-06: Warlord stranded in Reserves at the end of round 3 counts as destroyed → +12 VP, once |
| CHA-016 | CHA-4 | Sites of Power: round 1 → 0 VP; round 2, end of own turn, 2 vs 2 markers → +2 VP; 1 vs 2 → 0; 0 vs 0 → +2 |
| CHA-017 | CHA-5 | Vindictive Strategy: target at Starting Strength → no hit re-roll; one model lost → hit roll of 1 re-rolled, wound roll of 1 not |
| CHA-018 | CHA-5 | Vindictive Strategy: target below half-strength → hit 1s and wound 1s both re-rolled; attached target uses combined Starting Strength |
| CHA-019 | CHA-5 | Vindictive Strategy not offered for a unit already selected to shoot / that already fought this phase |
| CHA-020 | CHA-5 | Violent Unbinding: enemy melee attack destroys Zarkan, attacker within 6" → window opens before the next attack; D6 = 6 → 3 MW to the attacker |
| CHA-021 | CHA-5 | Violent Unbinding: attacker more than 6" away (shooting) → stratagem not offered; D6 = 1 → no mortal wounds |
| CHA-022 | CHA-5 | Daemonic Fervour: Possessed targeted in the Fight phase, model destroyed, D6 = 4 → model stays at 0 W, not allocatable; before the enemy unit consolidates it may pile in (3", coherency kept against the live models), then attacks with normal fight eligibility (CSM-09/CSM-10), never consolidates; then removed |
| CHA-023 | CHA-5 | Daemonic Fervour: D6 = 3 → removed normally; Possessed already fought this phase → no roll |
| CHA-024 | CHA-5 | Daemonic Fervour: deferred model has no OC and is skipped by coherency; `UnitDestroyed` only after the last deferred model is removed; kill credited to the attacker |
| CHA-025 | CHA-6 | Sacrificial Dagger: Zarkan selected to shoot, use → his unit suffers 1 MW; Rite of Possession gets +1 hit and +1 wound this phase; bolt pistol does not |
| CHA-026 | CHA-6 | Sacrificial Dagger offered at most once per phase and only after the Dark Pact prompt |
| CHA-027 | CHA-6 | Veterans of the Long War: Legionaries melee wound roll of 1 re-rolled; target within range of a marker → any failed wound roll re-rolled; ranged attacks unaffected |
| CHA-028 | CHA-6 | Rite of Possession vs a PSYKER target: Anti-PSYKER 2+ → every unmodified wound roll of 2+ is a critical wound; Precision lets the attacker allocate to a visible CHARACTER |
| CHA-029 | CHA-6 | Zarkan and Possessed have a 5+ invulnerable save (used against AP −3 instead of the 3+ armour) |
| CHA-030 | CHA-6 | Legionary heavy bolter: Heavy +1 to hit when Remained Stationary; meltagun Melta 2 at half range |
| CHA-031 | CHA-1 | patrol loads: 4 units, 26 models, Zarkan is WARLORD with Foul Zealotry and attached to Possessed; default secondary Marked for Execution |
| CHA-032 | CHA-1 | Zarkan may instead attach to Legionaries (pre-game choice); never to Cultists |

## TYR — Tyranids: The Vardenghast Swarm (docs/spec/factions/tyranids.md)
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
| TYR-026 | TYR-6.1 | Death Blow: Prime (not yet fought) killed in melee, D6 = 4 → not removed, `ModelRemovalDeferred`; after the attacker's attacks and before it consolidates its controller may fight with it (use/decline; pile-in then attacks, no unit selection, no consolidate; TYR-02), then `ModelDestroyed` credits the original killer; declining removes it at once |
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

## AST — Astra Militarum: Karsk's Gunners (docs/spec/factions/astra-militarum.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| AST-001 | AST-1 | patrol loads: 5 units, 28 models; Karsk unit is WARLORD with Command Laurels borne by the Karsk model and attached to `shock-a`; default secondary Hold the Line; Sentinel can use Smokescreen, no unit can use Grenade |
| AST-002 | AST-2.1 | own `command.end`: Order offered for REGIMENT units within 6" of Karsk only; never in the opponent's Command phase |
| AST-003 | AST-2.1 | Karsk model destroyed, veterans alive → no Order offered |
| AST-004 | AST-2.5 | Take Aim!: lasgun hits on 3+ (was 4+) until the start of own next turn, then 4+ again |
| AST-005 | AST-2.5 | Move! Move! Move!: M 6 → 9; an Advance adds its roll on top |
| AST-006 | AST-2.5 | Take Cover!: Shock Troops 5+ → 4+, Battery 4+ → 3+, Sentinel 2+ stays 2+, a 3+ model stays 3+ |
| AST-007 | AST-2.3 | a second Order issued to an ordered unit replaces the first (`EffectExpired` for the old one) |
| AST-008 | AST-2.4 | ordered unit fails a battle-shock test → Order removed at once (save/BS back to datasheet value) |
| AST-009 | AST-2.4 | Order issued at `command.end` to a unit that failed battle-shock earlier that phase still applies |
| AST-010 | AST-2.2 | unattached Command Squad Karsk is not an eligible target; attached Karsk + Shock Troops is (Karsk's own models gain the Order) |
| AST-011 | AST-3.1 | Command Laurels: +1 CP in own Command phase while Karsk is on the board; discarded when the R-4.2 cap is already used; none after Karsk dies |
| AST-012 | AST-3.1 | Command Laurels: one Order reaches every friendly AM unit on the board (Sentinel 30" away, unattached Command Squad included) |
| AST-013 | AST-3.0 | enhancement bearer is the Karsk model: veterans alive and Karsk dead → no Laurels CP, no Gunnery aura |
| AST-014 | AST-3.2 | Gunnery Officer: Battery within 6" of Karsk's unit → re-roll offered for the bombast D6 and for the D6 of malleus D6+6; beyond 6" → not offered |
| AST-015 | AST-3.2 | Gunnery Officer: Battery in aura and never attacked → enemy ranged attacker 13" away cannot target it, 11" away can |
| AST-016 | AST-3.2 | Gunnery Officer Lone Operative lost after the Battery model has made any attack (incl. Overwatch) or when the aura breaks |
| AST-017 | AST-3.2 | Gunnery Officer: +1 CP; Orders limited to 1 unit within 6" (no Laurels broadcast) |
| AST-018 | AST-4.1 | Hold the Line at end of opponent's turn: no enemy wholly within 6" of own DZ → 5 VP; one enemy wholly within 6" but not wholly in DZ → 3 VP; enemy wholly in DZ → 0 VP |
| AST-019 | AST-4.1 | Hold the Line ignores Battle-shocked enemies and units with one model outside the region; never scored at the end of own turn |
| AST-020 | AST-4.2 | Methodical Destruction: round-start pick lists canonical enemy units (attached pair once, Reserves included); target destroyed that round by any cause → 4 VP at round end; survives → 0 |
| AST-021 | AST-4.2 | Methodical Destruction on an attached pair: only the bodyguard destroyed → 0 VP; both halves → 4 VP |
| AST-022 | AST-5.1 | Send in the Next Wave: offered in own Movement phase only when a CADIAN SHOCK TROOPS unit is destroyed; new unit has 10 models with the original per-model loadouts (sergeant chainsword, flamer, meltagun), full wounds, new ids |
| AST-023 | AST-5.1 | Next Wave placement: outside the 9" edge strip or within Engagement Range is rejected; new unit counts as arrived (no further move; may shoot); opponent gets the Fire Overwatch window |
| AST-024 | AST-5.1 | Next Wave usable in round 1; the same destroyed unit may be targeted again in a later turn; never offered for Command Squad Karsk or the Battery |
| AST-025 | AST-5.2 | Bring It Down: AM attacks against the chosen enemy re-roll hit rolls (fails auto, successes offered); attacks against other units do not; ends at phase end; the re-roll actually fires (code hook `bringItDown` present) |
| AST-026 | AST-5.3 | Artillery Strike at the opponent's `command.start`: that turn enemy M 6 → 3 and 5 → 3, Advance 5 → 3, no charge declarations, ranged hit −1 (melee unaffected); all gone at turn end |
| AST-027 | AST-5.3 | Artillery Strike: once per battle; costs 2 CP; not offered in own turn or with no OFFICER model on the board; applies to a unit arriving from Reserves that turn |
| AST-028 | AST-6.5 | Rearm, Reload, Fire: Battery with an Order and Remained Stationary → bombast/malleus Sustained Hits 1; moved, or no Order → none; lasgun never; Overwatch in the opponent's turn → none |
| AST-029 | AST-6.6 | Patrol Squads: split → two 1-model Battery units (ids `…:battery`, `…:battery-2`, SS 1 each); unsplit → one 2-model unit |
| AST-030 | AST-6.2 | Medi-pack: Karsk's attached unit has FNP 6+ while the medic lives; medic destroyed → no FNP |
| AST-031 | AST-6.3 | Regimental Standard: Shock Troops OC 3, veterans/Karsk OC 2 while the bearer lives; bearer destroyed → base OC |
| AST-032 | AST-6.1 | allocation into attached Karsk + Shock Troops: veterans and troopers allocatable, Karsk not while a Shock Trooper lives |
| AST-033 | AST-6.1 | Precision / Epic Challenge pick only Karsk among the Command Squad; Artillery Strike target list = Karsk model only |
| AST-034 | AST-6.7 | Mobile Hunter-killers: Sentinel wound re-roll vs VEHICLE/MONSTER targets, none vs INFANTRY |
| AST-035 | AST-6.7 | Sentinel: hunter-killer One Shot; plasma cannon supercharge Hazardous; Deadly Demise 1 on destruction |
| AST-036 | AST-6 | weapons: meltagun +2 D at half range; frag Blast vs 10 models +2 attacks; bombast Indirect Fire at a non-visible target; flamer Torrent ignores cover; lasgun Rapid Fire 1 |
| AST-037 | AST-6.6 | Gunnery Officer + split Battery: each 1-model unit is tested separately for the aura and Lone Operative |
| AST-038 | AST-2.5 | Take Aim! has no effect on Torrent weapons or melee WS |
| AST-039 | AST-2.3 | Orders expire at the start of own next turn even when no new Order is issued |
| AST-040 | AST-5.1 | Next Wave not offered when no legal set-up exists in the strip (all positions in ER / blocked) |
| AST-041 | AST-5.2 | Bring It Down: an AM unit that was Battle-shocked when the Stratagem was used gets no hit re-roll against the chosen enemy; a non-shocked AM unit still does; an attached unit with either half Battle-shocked gets none |

## ADE — Adepta Sororitas: Sanctuary Guardians (docs/spec/factions/adepta-sororitas.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| ADE-001 | ADE-1 | patrol loads: 4 units, 26 models, Canoness is WARLORD with Defender of the Faith, attached to Sacresants; default secondary Hallowed Retribution |
| ADE-002 | ADE-1.1 | Canoness may attach to Battle Sisters Squad instead; not to Arco-flagellants |
| ADE-003 | ADE-1.2 | Patrol Squads: `splitUnits:['sisters']` → two 5-model units with the listed wargear, each Starting Strength 5; default stays one unit of 10 |
| ADE-004 | ADE-2.1 | a Miracle die is gained at the start of each turn, both players' turns (one `MiracleDieGained` per turn, value = a D6) |
| ADE-005 | ADE-2.1 | own ADEPTA SORORITAS unit destroyed → +1 Miracle die; enemy unit destroyed → none |
| ADE-006 | ADE-2.2 | hit roll substitution: Miracle die 6 replaces one hit die of a boltgun batch → unmodified 6 (critical), die leaves the pool, `MiracleDieSpent` mode substitute |
| ADE-007 | ADE-2.2 | save substitution when an ADEPTA SORORITAS unit is attacked; substituted value is unmodified, AP still applies |
| ADE-008 | ADE-2.2 | no `miracleDie` decision for a non-eligible roll (FNP, Hazardous, Desperate Escape, D6 attack count) or an empty pool |
| ADE-009 | ADE-2.3 | charge roll: at most one of the 2D6 replaced; the other die is rolled |
| ADE-010 | ADE-2.3 | a substituted die cannot be re-rolled (Command Re-roll / Lead the Righteous refuse that index) |
| ADE-011 | ADE-2.3 | D3 damage roll is never offered a substitution; D6 damage is |
| ADE-012 | ADE-2.4, 2.5 | `spentThisPhase` records the unit after a substitution and clears at phase end; a discard (enhancement/stratagem) does not record it; a second substitution for the same unit in the same phase is not offered (`maxSubstitutions` = 1, one die per Act of Faith) |
| ADE-013 | ADE-2.6 | led Sacresants all destroyed (Canoness survives) → that half's `UnitDestroyed` grants 1 die |
| ADE-014 | ADE-3 | Defender of the Faith: Canoness Sv 3+ → 2+ and the led unit's models 3+ → 2+ (Sacresants or Battle Sisters) |
| ADE-015 | ADE-3 | Defender of the Faith OC: discard at own Command phase → bearer's unit +1 OC per model until own next Command phase; pool −1; not offered with empty pool |
| ADE-016 | ADE-3 | Righteous Fury: bearer's unit Advances then shoots and declares a charge; Falls Back then shoots and charges; Arco-flagellants cannot |
| ADE-017 | ADE-3 | Righteous Fury charge re-roll after a discard: failed charge may be re-rolled that turn only |
| ADE-018 | ADE-4 | Hallowed Retribution: Sacresants destroy an enemy unit → +3 VP |
| ADE-019 | ADE-4 | Hallowed Retribution: killing unit made an Act of Faith earlier that phase → +4 VP; Act of Faith in a previous phase → +3 |
| ADE-020 | ADE-4 | Hallowed Retribution: enemy unit killed with no `byUnitId` (e.g. its own Hazardous) → 0 VP |
| ADE-021 | ADE-4 | Consecrated Ground: round 1 → 0; round 2+, unit model within 6" of centre at end of own turn → +3; with WARLORD in it → +4 (not 7); two units → still one award |
| ADE-022 | ADE-4 | Consecrated Ground: only Battle-shocked units within 6" → 0 VP; opponent's turn end → nothing |
| ADE-023 | ADE-5 | Ascetic Discipline: unmodified 6 to wound with a boltgun → AP −2 on that attack; non-critical wound keeps AP 0; expires at phase end |
| ADE-024 | ADE-5 | Ascetic Discipline not offered for a unit already selected to shoot or fight this phase; IS offered in the opponent's Fight phase for an own unit that has not yet fought; not offered in the opponent's Shooting phase |
| ADE-025 | ADE-5 | A Martyr's Death (Fight): a Sacresant destroyed before it has fought (by any enemy unit attacking the unit this phase), D6 ≥4 → model stays, piles in (3") then fights with normal fight eligibility after the destroying unit's attacks and before it consolidates (RC-ADE-10), then removed; D6 3 → removed at once |
| ADE-026 | ADE-5 | A Martyr's Death with a discarded die: D6 3 + 1 → deferred; pool −1 |
| ADE-027 | ADE-5 | A Martyr's Death (Shooting): deferred Battle Sisters shoot after the enemy unit finishes shooting, then removed; deferred models cannot be allocated further attacks and add no OC |
| ADE-028 | ADE-5 | A Martyr's Death: the destroyed model has already shot / fought this phase → no D6 for it, removed normally (other models of the unit that have not acted still roll) |
| ADE-029 | ADE-5 | Holy Radiance: −1 to hit for attacks against the unit (not the unit's own hit rolls) and FNP 5+ per damage point, opponent's Shooting only, until phase end |
| ADE-030 | ADE-6 | Lead the Righteous: led unit may re-roll any hit die (incl. a success to fish for a Lethal Hits 6); not when the Canoness is not attached |
| ADE-031 | ADE-6 | Null Rod: FNP 4+ vs a Devastating Wounds mortal and vs a Psychic weapon attack; no FNP vs a normal boltgun attack |
| ADE-032 | ADE-6 | Simulacrum Imperialis: end of own Command phase, bearer in range of one controlled marker, D6 = 5 → +1 Miracle die of value 5; D6 = 3 → none; bearer dead → no roll; bearer out of range but another model of her unit in range → roll |
| ADE-033 | ADE-6 | Sworn Protectors: attacks targeting led Sacresants get −1 to wound (their own wound rolls unaffected); unled → no modifier |
| ADE-034 | ADE-6 | Extremis Trigger Word: triggered → arco-flails A 6 + Hazardous this phase, Hazardous test after attacks; declined → A 4, no Hazardous |
| ADE-035 | ADE-6 | Arco-flagellants: Sv 7+ means no armour save; FNP 5+ per wound point |
| ADE-036 | ADE-6 | Condemnor boltgun: wound roll 2+ vs PSYKER is critical → Devastating Wounds mortal; Precision allows allocation to a CHARACTER in an attached unit |
| ADE-037 | ADE-6 | combi-weapon Anti-Infantry 4+: unmodified 4 to wound vs INFANTRY is critical → Devastating Wounds |
| ADE-038 | ADE-6 | Ministorum flamer / heavy flamer: Torrent auto-hits D6 attacks, Ignores Cover; hallowed mace Lethal Hits auto-wounds on a critical hit |
| ADE-039 | ADE-2.2 | limitation: a Battle-shock test forced mid-resolution (source other than `command`) rolls its 2D6 straight through and never raises a `miracleDie` decision, even with a non-empty pool; the Command-phase test does |

## GRE — Grey Knights: Aurellios' Banishers (docs/spec/factions/grey-knights.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| GRE-001 | GRE-1 | patrol loads (default): 3 units, 11 models; Librarian is WARLORD with Banishment Stone, attached to Terminators; default secondary Champion of Titan |
| GRE-002 | GRE-1.1, 1.2 | `unitChoices:{heavy:'dreadknight'}` → 3 units, 7 models, no Terminator unit exists (not in Reserves), Librarian unattached; an unknown ref throws EngineInvariantError |
| GRE-003 | GRE-2.1 | end of opponent's turn: pick offered to the Grey Knights player only, candidates exclude units in Engagement Range and the Dreadknight; picking removes the unit (`location:'reserves'`, `UnitRemovedFromBattlefield`); decline leaves the board unchanged |
| GRE-004 | GRE-2.1 | only one unit per opponent turn; no pick offered at the end of the Grey Knights player's own turn |
| GRE-005 | GRE-2.1 | attached Librarian + Terminators picked → both halves removed and later arrive together, still attached |
| GRE-006 | GRE-2.2 | next own Movement: Reinforcements requires set-up >9" from every enemy model; a placement at 8.9" is rejected; on success `ReinforcementsArrived{via:'teleportAssault'}` and the unit cannot make a further move but may shoot and charge |
| GRE-007 | GRE-2.3 | Grey Knights moving second: removed at end of round-1 opponent turn → arrives in own round-1 Movement; removed in round 3/4 → arrives in round 4/5 and is never culled by the round-3 Reserves cull |
| GRE-008 | GRE-2.4 | Grey Knights first, unit removed at end of round 5 → destroyed at battle end before `battle.end` scoring (UnitLostInReserves, null attribution) |
| GRE-009 | GRE-2.5 | No Escape scored at a turn end with the teleporting unit still counted on its marker; the removal happens after scoring |
| GRE-010 | GRE-2.6 | passing the mandatory arrival destroys the teleporting unit |
| GRE-011 | GRE-2.7 | Grey Knights with only a teleporting unit left at the opponent's turn end → not tabled; battle continues |
| GRE-012 | GRE-3.1 | Banishment Stone: bearer's force weapon kills an enemy CHARACTER model, D6 2 → +1 CP; D6 1 → no CP; Terminator kills the CHARACTER → no roll; a second gain in the same round discarded by R-4.2 |
| GRE-013 | GRE-3.1 | Banishment Stone: bearer kills a non-CHARACTER model → no roll |
| GRE-014 | GRE-3.2 | Dominating Aura: bearer OC 3 (Terminators unchanged at 2); Battle-shocked → 0 |
| GRE-015 | GRE-4.1 | Champion of Titan: Warlord kills an enemy CHARACTER model → +6 VP; two in one phase → +12; a CHARACTER killed by the Strike Squad → 0; a non-CHARACTER killed by the Warlord → 0 |
| GRE-016 | GRE-4.1 | Champion of Titan scores in the opponent's Fight phase too, and for a CHARACTER leader inside an enemy attached unit |
| GRE-017 | GRE-4.2 | No Escape: end of opponent's turn, controlling both edge-closest markers → +10; only one → 0; at the end of own turn → 0 |
| GRE-018 | GRE-4.2 | No Escape scores at most once per battle (second qualifying turn end → 0); a razed marker is skipped for "closest" |
| GRE-019 | GRE-5.1 | Vindictive Strategy: S5 vs Strike Squad T4 → −1 to wound; S4 → no change; offered in opponent's Shooting and either Fight phase, not in own Shooting; not offered for the Dreadknight |
| GRE-020 | GRE-5.2 | Violent Unbinding: Strike Squad model destroyed before fighting, D6 4 → stays at 0 W, fights after the enemy unit's attacks, then removed; D6 3 → removed at once |
| GRE-021 | GRE-5.2 | Violent Unbinding: a model of a unit that already fought this phase → no roll |
| GRE-022 | GRE-5.3 | Daemonic Fervour (2 CP): in the opponent's Fight phase, unit in Engagement Range → that turn's Teleport Assault pick offers it; without the stratagem it is excluded; the grant does not carry to a later turn |
| GRE-023 | GRE-5.3 | Daemonic Fervour not offered in own Fight phase, nor for a unit not in Engagement Range, nor for the Dreadknight |
| GRE-024 | GRE-6.1 | Sanctic Hood: attached Terminators/Librarian get FNP 4+ vs a Psychic weapon attack (incl. its Devastating Wounds mortals); no FNP vs a bolter; Librarian not attached → no FNP; mortal wounds from an enemy Psychic ability also get FNP 4+ |
| GRE-025 | GRE-6.2 | Hammerhand: after a successful charge Terminator force weapons and the attached Librarian's force weapon have Lethal Hits (critical hit auto-wounds) until end of turn; next turn without a charge → none; Heroic Intervention charge also triggers it |
| GRE-026 | GRE-6.3 | Dreadknight at 4 W → −1 to hit on heavy psycannon and greatsword; at 5 W → no modifier; destroyed → Deadly Demise D3 on 6 |
| GRE-027 | GRE-6 | weapons: Purge Soul focused profile Hazardous test after shooting and Precision allocation to a CHARACTER; psilencer Sustained Hits 1; storm bolter Rapid Fire 2 at half range; greatsword strike D6 damage |

## TAU — T'au Empire: Protectors of Aun'shar (docs/spec/factions/tau-empire.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| TAU-001 | TAU-1 | patrol loads: 5 units, 16 models; Aun'Shar is WARLORD with DS13 and unattached; Fireblade attached to Strike Team; default secondary Kauyon Lure |
| TAU-002 | TAU-2.1 | selecting Strike Team to shoot offers an FtGG pick listing Stealth/Ghostkeel as Observers and enemies visible to both; Aun'Shar is never an Observer option |
| TAU-003 | TAU-2.1 | an Observer candidate that is Battle-shocked, already shot this phase, or already an Observer is absent from the options |
| TAU-004 | TAU-2.2 | Guided pulse rifle (BS 4+) vs the Spotted unit hits on 3+; with the target in Stealth (−1 hit) it hits on 4+ |
| TAU-005 | TAU-2.2 | BS change is not hit-capped: Damaged Ghostkeel (−1) Guided vs a Stealth target (−1) → cap −1 applied to modifiers, BS 3+ → hits on 4+ |
| TAU-006 | TAU-2.2 | Observer with MARKERLIGHT (Strike Team) → Guided attacks vs Spotted ignore cover; Observer Ghostkeel (no MARKERLIGHT) → cover still applies |
| TAU-007 | TAU-2.3 | Guided unit splits fire: attacks vs a non-Spotted enemy need one worse (4+ → 5+) |
| TAU-008 | TAU-2.4 | after observing, the Observer can still be selected to shoot later in the phase, but no FtGG pick is offered for it |
| TAU-009 | TAU-2.6 | Fire Overwatch by a unit that was Guided earlier gets no BS change; marks are gone in the next phase |
| TAU-010 | TAU-2.5 | Stealth Battlesuits that Advanced can be an Observer while the Shas'vre lives; once the Shas'vre is destroyed they cannot (and lose MARKERLIGHT) |
| TAU-011 | TAU-2.5 | an Advanced Strike Team (no marker drone rule) is not offered as Observer |
| TAU-012 | TAU-3 | DS13: Strike Team within 6" of Aun'Shar has Sv 3+ and FNP 5+; at 6.1" neither; Aun'Shar itself Sv 4+, FNP 5+ |
| TAU-013 | TAU-3 | DS13: Ghostkeel (not INFANTRY) within 6" gets nothing |
| TAU-014 | TAU-3 | DS13/DS15: Aun'Shar has Lone Operative (not targetable beyond 12") and Stealth (−1 to hit vs ranged) |
| TAU-015 | TAU-3 | DS15: Ghostkeel within 6" of Aun'Shar → its ranged critical hits auto-wound; melee does not |
| TAU-016 | TAU-4 | Kauyon Lure: round 1 own Command phase end → 0 VP; round 2 with Strike Team partly in own DZ → +5 VP |
| TAU-017 | TAU-4 | Kauyon Lure: only qualifying unit Battle-shocked in that Command phase → 0 VP; two qualifying units → still 5 VP |
| TAU-018 | TAU-4 | Leadership Caste: Aun'Shar alive at battle end → +20 VP; destroyed → 0 |
| TAU-019 | TAU-5 | Defensive Fusillade: Strike Team in Engagement Range shoots pulse rifles (now Pistol) at the engaged unit; not offered for a unit that already shot |
| TAU-020 | TAU-5 | Rapid Repositioning: offered at own Shooting phase end; Strike Team gets a D6 Normal move (rolled), Stealth/Ghostkeel get 6" with no roll |
| TAU-021 | TAU-5 | Rapid Repositioning: the moved unit cannot declare a charge that turn; not offered to a unit in Engagement Range |
| TAU-022 | TAU-5 | Laser-Marked Targets: after an enemy declares a charge vs the Strike Team, the Strike Team shoots before the charge roll, hitting only on unmodified 6 |
| TAU-023 | TAU-5 | Laser-Marked Targets: the charger's Charge roll is reduced by 2 (2D6 = 9 → 7) for that phase; a second charger is unaffected |
| TAU-024 | TAU-5 | Laser-Marked Targets: charger destroyed by the shooting → no charge roll, no move |
| TAU-025 | TAU-5 | Laser-Marked Targets refused for a unit that fired Overwatch earlier this turn; after it, Fire Overwatch is refused for that unit this turn |
| TAU-026 | TAU-5 | Laser-Marked Targets not offered for a unit that is not a target of the declared charge, nor in own turn |
| TAU-027 | TAU-6.1 | Coordinated Leadership: own Command phase end D6 4 → +1 CP; 3 → no CP; a second CP gain in the same round is capped |
| TAU-028 | TAU-6.2 | Aun'Shar moves up to 10" and over a model (FLY) |
| TAU-029 | TAU-6.3 | Volley Fire: led Strike Team pulse rifle A 2 (A 3 at half range with Rapid Fire 1); Fireblade rifle A 2; without the leader A 1 |
| TAU-030 | TAU-6.4 | Cover Fire: Strike Team on a controlled marker fires Overwatch → hits on unmodified 4+, crits only on 6; off the marker → 6s only |
| TAU-031 | TAU-6.4 | Cover Fire does not apply to Laser-Marked Targets shooting (still 6s only) |
| TAU-032 | TAU-6.5 | DS8: Strike Team Remained Stationary → support turret missile system offered in that Shooting phase and in Overwatch during the opponent's turn |
| TAU-033 | TAU-6.5 | DS8: Strike Team moved (Normal/Advance) → turret absent from weapon choices; next own Movement it moves → turret gone again |
| TAU-034 | TAU-6.5 | support turret: Indirect Fire vs a non-visible target (−1 hit, unmodified 1–3 fail) and Twin-linked wound re-roll |
| TAU-035 | TAU-6.7 | Forward Observers: Stealth as Observer → Guided Strike Team re-rolls wound rolls of 1 vs the Spotted unit only |
| TAU-036 | TAU-6.8 | Ghostkeel Falls Back and can still shoot; Stealth unit Falls Back → cannot shoot at all |
| TAU-037 | TAU-6.9 | Ghostkeel at 4 W → −1 to hit; destroyed → Deadly Demise D3 on a 6 |
| TAU-038 | TAU-6 | weapons: fusion blaster Melta 2 at ≤6" adds 2 damage; overcharge cyclic ion raker triggers a Hazardous test; pulse pistol only weapon usable in Engagement Range without Fusillade |
| TAU-039 | TAU-6 | Infiltrators: Stealth Battlesuits and Ghostkeel may deploy anywhere >9" from the enemy DZ and enemy models |
| TAU-040 | TAU-6 | Stealth: ranged attacks vs Stealth Battlesuits/Ghostkeel are −1 to hit; Lone Operative Ghostkeel cannot be targeted from beyond 12" |

## GEN — Genestealer Cults: Hand of the Magus (docs/spec/factions/genestealer-cults.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| GEN-001 | GEN-1 | patrol loads: 6 units, 32 models; Magus is WARLORD with Psionic Shield, attached to `neophytes-a`; default secondary Rise Up; Rockgrinder has 1 model |
| GEN-002 | GEN-2.1 | Neophytes destroyed → D6 +3 always ≥ 4: unit enters the pool and a marker-placement chooseOption is raised for its owner |
| GEN-003 | GEN-2.1 | Acolytes destroyed with D6 = 3 → no pool entry, no marker decision; D6 = 4 → pool + decision |
| GEN-004 | GEN-2.1 | Aberrants and Rockgrinder destroyed → no Cult Ambush roll at all |
| GEN-005 | GEN-2.7 | every offered marker point is >9" from all enemy models and wholly on the board; with enemies covering the board → no decision, unit still in pool |
| GEN-006 | GEN-2.2 | enemy unit ends a Normal move with a model 8.9" from a marker → marker removed; ending at 9.1" → kept |
| GEN-007 | GEN-2.2 | marker removed by an enemy charge move, pile-in and consolidate; own units moving near it never remove it |
| GEN-008 | GEN-2.3 | opponent's next Movement phase, after their reinforcements: return offered per marker; unit returns at full model count, full wounds, original loadouts, one model touching the marker, all >9" from enemies; marker gone |
| GEN-009 | GEN-2.3 | placement with no model touching the marker is rejected (`mustTouch`) |
| GEN-010 | GEN-2.3 | owner declines → marker and pool entry persist; usable at the following opponent Movement phase (GEN-2.4) |
| GEN-011 | GEN-2.3 | return is not offered in the owner's own Movement phase |
| GEN-012 | GEN-2.4 | two markers, one pool unit → only one return; pool unit may use a marker created by a different unit |
| GEN-013 | GEN-2.5 | Magus leading Neophytes; whole unit destroyed → only the 10 Neophytes return, unled; Magus stays destroyed |
| GEN-014 | GEN-2.5 | returned copy destroyed again → opponent's destroyed-unit counts rise twice; copy rolls Cult Ambush again |
| GEN-015 | GEN-2.5 | returned Acolytes whose demolition charges were already fired cannot fire them again; charges not yet fired are still available (One Shot state carried over) |
| GEN-016 | GEN-2.6 | round 4 opponent Movement phase: no return offered even with markers and pool units |
| GEN-017 | GEN-2.6 | unit destroyed in round 4 → roll emitted, no marker decision |
| GEN-018 | GEN-3 | Psionic Shield: Magus-led Neophytes (Sv 5+) save an AP 0 ranged attack on 4+ and an AP −1 one on 5+; melee attacks unchanged (5+ / 6+); Magus alone → no bonus |
| GEN-019 | GEN-3 | Resonance Stave: stave vs INFANTRY critical wounds on 5+; a critical wound becomes mortal wounds (Devastating Wounds); vs VEHICLE wounds normally |
| GEN-020 | GEN-4 | Rise Up: end of opponent's round-1 turn → no roll; round 2 with 2 controlled markers holding Neophytes → 2 D6 rolled, VP = Σ(1 on 1–3, 3 on 4+) |
| GEN-021 | GEN-4 | Rise Up: marker held only by Acolytes, or by Battle-shocked Neophytes → no roll for it; end of own turn → no scoring |
| GEN-022 | GEN-4 | Will of the Patriarch: Magus base edge 2.9" from centre at battle end → +15 VP; 3.2" or destroyed → 0 |
| GEN-023 | GEN-5 | Defend the Magus: offered at start of own Shooting only if an enemy is in ER of the MAGUS unit; Neophyte hit roll of 1 vs that enemy re-rolled, wound 1 re-rolled; vs another enemy no re-roll |
| GEN-024 | GEN-5 | Defend the Magus at start of the opponent's Fight phase works; gone at phase end; persists if the Magus dies mid-phase |
| GEN-025 | GEN-5 | Lurking Killers: offered after enemy targets declared vs own Acolytes; attacks against them −1 to hit until phase end, including from a second enemy unit |
| GEN-026 | GEN-5 | Lurking Killers not offered for Aberrants or the Rockgrinder |
| GEN-027 | GEN-5 | Return to the Shadows: enemy ends a Normal move 8" from Neophytes → offered; D6 rolled; Normal move up to that distance; not offered if enemy only Remained Stationary or unit is in ER |
| GEN-028 | GEN-5 | Return to the Shadows on Magus-led unit → flat 6", no roll |
| GEN-029 | GEN-6.1 | Spiritual Leader: led unit gets FNP 5+ vs Smite (PSYCHIC) damage; none vs a bolter; Magus alone → none |
| GEN-030 | GEN-6.2 | Vile Insurrectionists: hit 1s re-rolled always; wound 1s re-rolled only when the target is within range of an objective marker |
| GEN-031 | GEN-6.2 | Vile Insurrectionists applies to a leading Magus's attacks |
| GEN-032 | GEN-6.3 | demolition charges usable once per battle and trigger Hazardous; Rockgrinder cache can fire every turn |
| GEN-033 | GEN-6.4 | Hypermorph fights with heavy improvised weapon (5 A) plus tail (1 A) |
| GEN-034 | GEN-6.5 | Rockgrinder at 3 W: −1 to hit; at 4 W: none; destroyed → Deadly Demise D3 on a 6 |
| GEN-035 | GEN-6.7 | Deep Strike: Magus, Neophytes, Acolytes may start in Reserves; Aberrants and Rockgrinder may not |
| GEN-036 | GEN-6.9 | Rockgrinder offers no embark option to any unit |
| GEN-037 | GEN-6 | weapons: webber auto-hits D6 with Devastating Wounds; seismic cannon Heavy +1 to hit when stationary and Rapid Fire 2 at ≤12"; clearance incinerator Torrent Ignores Cover |

## CUS — Adeptus Custodes: Guardians of the Throne (docs/spec/factions/adeptus-custodes.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| CUS-001 | CUS-1 | patrol loads (default): 4 units, 15 models; Tyvan is WARLORD with Auramite Thunderbolt, attached to the Guard; default secondary Guardian of the Realm |
| CUS-002 | CUS-1.1, 1.2 | `unitChoices:{escort:'praetors'}` → 4 units, 12 models, no Guard unit exists, Tyvan unattached |
| CUS-003 | CUS-1.4, 6.1 | Guard wargear as built: vexilla model has only a misericordia (never selectable to shoot); shield models start at 4 W, spear models at 3; Tyvan starts at 7 W |
| CUS-004 | CUS-2.1 | at the start of each Fight phase (both turns) the Custodes player gets a mandatory Dacatarai/Rendax choice; no choice when no Ka'tah unit is on the battlefield |
| CUS-005 | CUS-2.2 | Dacatarai: Guard spear critical hit → 1 extra hit; Prosecutors' and Vigilators' melee unaffected; ranged weapons unaffected |
| CUS-006 | CUS-2.3 | Rendax: Praetor lance critical hit auto-wounds; effect gone after the phase ends |
| CUS-007 | CUS-2.4 | attached Tyvan + Guard: Tyvan's sentinel blade also gains the stance |
| CUS-008 | CUS-3.1 | Auramite Thunderbolt: failed charge of Tyvan's unit is re-rolled; a passing charge offers an optional re-roll; Advance roll of the unit offers a re-roll; other units get none |
| CUS-009 | CUS-3.2 | Blade of the Vaults: bearer's critical wound with sentinel blade (AP −2) → resolved at AP −3; non-critical wound stays −2; a Guard model's critical wound is unchanged |
| CUS-010 | CUS-4.1 | Guardian of the Realm: Tyvan kills a model whose unit started the phase off every marker → +1 VP at phase end; started within range of a marker → +2; two kills in one phase → still 2 max |
| CUS-011 | CUS-4.1 | Guardian of the Realm: kill by a Guard model of Tyvan's attached unit → 0; kill in the opponent's Fight phase scores; a victim unit that arrived by Deep Strike this phase counts as not in range |
| CUS-012 | CUS-4.2 | Drive the Talons Deep: round 2+, end of opponent's turn, a non-shocked Custodes unit wholly in the enemy zone → +3; one model straddling the edge → 0; round 1 → 0; end of own turn → 0; Battle-shocked unit → 0 |
| CUS-013 | CUS-4.2 | Necron Reclaim and Dominate still filters on NECRONS after the keyword param change |
| CUS-014 | CUS-5.1 | Gilded Spear: offered only just after an enemy attack destroys Tyvan (any phase, incl. Overwatch); afterwards Custodes ranged attacks against that enemy unit have Sustained Hits 1 for the rest of the battle; against other units, and in melee, no change |
| CUS-015 | CUS-5.1 | Gilded Spear: not offered when Tyvan is destroyed outside an enemy attack (e.g. mortal wounds from an enemy ability, own Hazardous) or when a non-Captain model dies; enemy attached unit marked → both halves stay marked after the leader dies |
| CUS-016 | CUS-5.2 | Inescapable Vengeance (2 CP): own Command phase, target unit OC +1 (Guard 3, Prosecutors 3); persists through the opponent's turn; gone at the start of the owner's next turn; Battle-shocked unit not targetable |
| CUS-017 | CUS-5.3 | Overawing Magnificence: enemy falls back from Custodes INFANTRY unit → offered; unit makes a normal move up to 6" and must end outside Engagement Range |
| CUS-018 | CUS-5.3 | Overawing Magnificence not offered: unit still in Engagement Range of another enemy; unit was not engaged with the mover at phase start; enemy made a normal move; Vertus Praetors (not INFANTRY); own turn |
| CUS-019 | CUS-6.2 | Stand Vigil: wound roll of 1 re-rolled; on a controlled marker a failed 3 may be re-rolled too; on an uncontrolled / contested marker only 1s; attached Tyvan's attacks also benefit |
| CUS-020 | CUS-6.3 | Purity of Execution: boltgun vs PSYKER unit → Precision (may allocate to a CHARACTER) and Devastating Wounds (crit wound → mortal wounds); vs non-PSYKER → neither; melee unaffected |
| CUS-021 | CUS-6.4 | Deft Parry: melee attacks against Vigilators −1 to hit; ranged attacks unchanged; combined with another −1 still capped at −1 |
| CUS-022 | CUS-6 | weapons: executioner greatblade Anti-PSYKER 4+ (wound roll 4 vs PSYKER is critical → Devastating Wounds); interceptor lance +1 to wound on the charge; hurricane bolter Rapid Fire 3 + Twin-linked at half range; sentinel blade Pistol usable in Engagement Range |
| CUS-023 | CUS-6 | Deep Strike: Tyvan, Guard may start in Reserves; Praetors, Prosecutors, Vigilators may not |
| CUS-024 | E2 | weapon-ability queries without an attack context are unchanged (Champion Duellist, Veil of Time, Epic Challenge regression) |
