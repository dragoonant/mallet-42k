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
| FIGHT-025 | R-9.12 | Counter-offensive after enemy unit fought → my chosen unit fights immediately, then alternation resumes with the player who would have been next **[interp]** |
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
| STRAT-018 | Tank Shock | offered in `stratagemWindow` `charge.moveEnded` only to the player whose VEHICLE just made a Charge move (Dread charge → offered; Dread that Heroically Intervened → offered, it is a Charge move **[interp]**; Dread that did not charge this phase → not offered) |
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
