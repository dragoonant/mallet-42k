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
| MOVE-041 | R-5.7 | `heightAt(x,z)` is the topmost surface; `heightAt(x,z,{near})`/`settleY` pick the highest surface at or below the intended height (ground under a ruin upper floor stays ground, a model on a floor stays on it), else the nearest, and fall to another surface only when `canEndAt` rejects the preferred one **[interp]** |
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
| CHARGE-033 | R-5.7/R-8.5 | charge end point under a ruin upper floor keeps the charger's starting level: ground charger ends at y 0, a charger on the 2.25" floor ends on that floor (not the topmost floor) |

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
| FIGHT-RANK-001 | R-9.6 | a model that cannot reach an enemy during pile-in steps into base contact with a teammate already touching an enemy, forming a second rank whose models may then fight |
| FIGHT-RANK-002 | R-9.5/R-9.6 | a 10-model unit in two loose ranks piling into a 5-model line: the first offered pile-in gives a fighting spot to every model that can plainly reach one within 3" |
| FIGHT-RANK-003 | R-9.5/R-9.6 | mixed base sizes (25/28.5/32/40mm): back-rank models still close up behind whichever unit-mate ends up touching the enemy |
| FIGHT-RANK-004 | R-9.5/R-9.6 | enemy standing in a curved arc: front models find contact spots round the arc and the rest form up behind them |
| FIGHT-RANK-005 | R-9.5/R-9.6 | front rank stopped at the 0.99" edge after its charge: the default pile-in closes to base contact (not the edge) so the back rank can join |
| FIGHT-RANK-006 | R-9.6 | models that started in base contact with the enemy count as anchors for back-rank models to step up behind |
| FIGHT-RANK-007 | R-9.5/R-9.6 | narrow enemy front: back-rank models left out by the first placement pass get another try (including trading spots with a unit-mate) and the offered candidates are ranked by how many models can fight |
| FIGHT-RANK-008 | R-9.5/R-9.6 | two ranks of five 0.9" from a six-model line on open ground: front models step straight into contact, back models step up behind them, all ten can fight |
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
| FIGHT-035 | R-9.5 | pile-in/consolidation end point under a ruin upper floor keeps the model's level: ground-level model stays at y 0 |

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
| MISSION-046 | CP-3.4 | WTC layouts (`terrain.cp-long-edges`, `-short-edges`, `-diagonal`): lane width L = smallest side of the largest non-INFANTRY roster base + 0.5" (130 mm → 5.62"); no choke point — every spot an L-wide base fits is joined to the rest of the open board by lanes ≥ L wide, or sealed by a gap < 0.25" (`tests/data/terrainLanes.test.ts`) |
| MISSION-047 | CP-3.4 | WTC layouts: the largest-base non-INFANTRY model (set up outside every ruin footprint, inside its zone) can travel on a ≤ 0.25" grid, footprint-inflated by its base, from each deployment zone to within objective range of every marker of every mission that uses the layout |
| MISSION-048 | CP-3.2, CP-3.3 | WTC layouts: invariant under 180° rotation about the origin (footprints, walls, floors); every ruin wall and crate > 1" from the edge of every objective marker (R-3.10, RC-052; a marker may sit inside a ruin footprint); all terrain stays on the 44×30 board |
| MISSION-049 | CP-3.5 | WTC layouts: every ruin has an upper-floor spot where a 40 mm base fits wholly on the floor, clear of the walls, with 0.1" to spare (`terrainService.canEndAt`); every floor lies inside its ruin footprint (`tests/data/terrainFloors.test.ts`) |

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
| ADE-039 | ADE-2.2 | a Battle-shock test forced mid-resolution (source other than `command`) opens a `miracleDie` decision and is finished by the Miracle handler; further Sororitas units tested while that offer is open are queued (`bsqueue:`) and each get their own offer (RC-ADE-23); empty pool or non-Sororitas rolls straight through |

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

## SOL — Space Marines: Strike Team Solarien (docs/spec/factions/space-marines--strike-team-solarien.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| SOL-001 | SOL-1 | patrol loads (default): 4 units, 15 models; Solarien is WARLORD with Auto-choral Resonators, attached to the Infiltrator Squad; default secondary Reconnaissance in Force; Strike Force Octavius still loads unchanged |
| SOL-002 | SOL-1.2, 6.10 | Patrol Squads split → two 5-model Infiltrator units, each with Omni-scramblers; Solarien and Xarius can each attach to one half |
| SOL-003 | SOL-6 | data: every profile/stat row of §6 matches (accelerator autocannon BS 4+, Solarien bolt pistol BS 2+); reused weapon ids are unchanged |
| SOL-004 | SOL-2.1 | Oath of Moment: Infiltrator carbine attack vs the Oath target re-rolls the hit roll (shared `sm.a.oath-of-moment`) |
| SOL-005 | SOL-6 | Infiltrators: attached Solarien + Infiltrators may deploy >9" from the enemy zone and models; Suppressors may not |
| SOL-006 | SOL-6 | Scouts 6": unattached Solarien offered a Scouts move; attached Solarien + Infiltrators not offered |
| SOL-007 | SOL-6 | Deep Strike: unattached Solarien may go to Reserves; Infiltrators, Xarius, Suppressors may not |
| SOL-008 | SOL-3.1 | Auto-choral Resonators: end of own Command phase with Solarien's unit on a controlled marker → marker sticky (`ObjectiveSecured` sticky); unit leaves → still controlled; opponent gains higher OC at end of a turn → lost |
| SOL-009 | SOL-3.1 | Auto-choral Resonators: not in range / marker not controlled / opponent's Command phase → no sticky |
| SOL-010 | SOL-3.2 | Stealthy Hunter: unattached Solarien cannot be targeted from 13" by ranged attacks, can from 12"; ranged attacks against it −1 to hit |
| SOL-011 | SOL-3.2 | Stealthy Hunter: attached to Infiltrators → no Lone Operative range limit and no Stealth −1 (Infiltrators lack Stealth) |
| SOL-012 | SOL-3.2 | Stealthy Hunter carbine: unmodified wound 4 vs INFANTRY → critical wound → Devastating Wounds mortal wounds; may allocate to a visible CHARACTER (Precision); bolt pistol and blades unaffected |
| SOL-013 | SOL-4.1 | Reconnaissance in Force: round 2, end of own turn, 1 v 1 No Man's Land markers → 2 VP; 2 v 1 → 4 VP; 0 v 0 → 0; home markers ignored |
| SOL-014 | SOL-4.1 | Reconnaissance in Force: round 1 → 0; end of opponent's turn → 0 |
| SOL-015 | SOL-4.2 | Pinpoint Purge: own ranged attack destroys an enemy unit → +2 VP; Oath target → +3 VP; melee kill → 0; opponent's own Hazardous kill → 0 |
| SOL-016 | SOL-4.2 | Pinpoint Purge: kill by Overwatch in the opponent's turn scores; kill by Devastating Wounds mortal wounds of a ranged attack scores; attached unit scores once, when its last half is destroyed |
| SOL-017 | SOL-5.1 | Vanguard Strike: own Command phase, Infiltrators OC 1 → 2 through the opponent's turn; back to 1 at the start of the next own Command phase |
| SOL-018 | SOL-5.2 | Giantslayer Doctrine: Suppressor autocannon AP −1 → −2; unmodified wound 4 vs VEHICLE/MONSTER is a critical wound; not offered for a Suppressor unit that already shot; expires at phase end |
| SOL-019 | SOL-5.3 | Rapid Repositioning: enemy ends a Normal/Advance/Fall Back move within 9" of Infiltrators → offered; unit moves up to 3" (Normal-move rules, ends outside Engagement Range) |
| SOL-020 | SOL-5.3 | Rapid Repositioning not offered: target 9.5" away; target in Engagement Range; target is Suppressors (not PHOBOS); enemy unit arrived from Reserves |
| SOL-021 | SOL-6.1 | Strategic Dispersal: after Solarien's unit shoots (not engaged) → use/decline; use → D6 roll, Normal move up to that many inches; not offered when engaged or after Overwatch |
| SOL-022 | SOL-6.2 | Shrouding: Xarius leading Infiltrators → enemy ranged attack from 13" illegal (`E_NOT_IN_RANGE`), from 12" legal; ranged hits −1 (Stealth) |
| SOL-023 | SOL-6.2 | Shrouding: Xarius unattached → no range cap, no Stealth; Infiltrators alone → none |
| SOL-024 | SOL-6.3 | Omni-scramblers: enemy Deep Strike placement 11.9" from an Infiltrator model → rejected; 12.1" → accepted (all other arrival rules still apply) |
| SOL-025 | SOL-6.3 | Omni-scramblers: applies to Strategic Reserves / Rapid Ingress arrivals too; does not restrict the owner's own arrivals; the arrival decision's `constraints.forbidden` includes the zone polygons |
| SOL-026 | SOL-6.4 | Suppression Fire: autocannon hits enemy unit → it is suppressed: its attacks (ranged, melee, Overwatch) −1 to hit until the start of the SM player's next turn |
| SOL-027 | SOL-6.4 | Suppression Fire: two units hit → `chooseOption`; a unit hit only by bolt pistols is not a candidate; Suppressors destroyed → penalty ends at once |
| SOL-028 | SOL-6 | Accelerator autocannon Heavy: stationary Suppressors hit on 3+ (BS 4+ with +1) |
| SOL-029 | SOL-6 | Smite focused witchfire on Xarius: Hazardous 1 → Xarius (CHARACTER) takes 3 mortal wounds |
| SOL-030 | E1 | Stealth regression: datasheet Stealth units (other factions) unchanged; granted Stealth counted only when every half has it |
| SOL-031 | E4 | Mission regression: Treasures of Aeons / Marked for Execution / Hallowed Retribution unchanged with the new `unitDestroyed` fields |

## MOR — Orks: Morgrim's Butchas (docs/spec/factions/orks--morgrim-s-butchas.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| MOR-001 | MOR-1 | data: patrol `ork.cp.morgrims-butchas` loads; 4 units / 25 models (1 + 10 + 10 + 4); warlord `beastboss`; Morgrim attached to `snaggas-a` by default; listed in `faction.json` `combatPatrols` after the Gitstompas |
| MOR-002 | MOR-6.1 | data: Morgrim M6 T5 Sv4+ inv 5+ W6 Ld6+ OC1, 50 mm, keywords include BEASTBOSS and WARBOSS, FNP 6, LEADER → Beast Snagga Boyz |
| MOR-003 | MOR-6.3 | data: Beast Snagga Boyz T5 Sv5+ W1 (Nob 2) OC2, 32 mm, BATTLELINE; wargear Nob slugga + power snappa, 1 thump gun + ccw, 8 slugga + choppa |
| MOR-004 | MOR-6.5 | data: Squighog Boyz M10 T7 Sv4+ W3 (Nob 4), FNP 5, MOUNTED (not INFANTRY); bases 75×42 / 90×52 oval |
| MOR-005 | MOR-6.6 | data: every new weapon profile matches §6.2; Gitstompas weapons (`ork.w.shoota`, `choppa`, `close-combat-weapon`, `big-choppa`) unchanged |
| MOR-006 | MOR-2.1 | Waaagh! called: a Snagga choppa fights at S6 A4 with a 5+ invuln; squighog jaws S7, A stays 3; Squighogs may charge after Advancing |
| MOR-007 | MOR-6.2 | Morgrim attached: a Boy's melee hit roll of 3 (needs 3+) +1 → a natural 2 hits; ranged hit rolls unchanged; a detached Snagga unit gets no bonus |
| MOR-008 | MOR-6.4 | Snagga Boyz vs a VEHICLE: a failed hit may be re-rolled; vs INFANTRY: no re-roll; an attached Morgrim's attacks vs a VEHICLE may re-roll too |
| MOR-009 | MOR-6.6 | beastchoppa vs a VEHICLE: unmodified wound 4 → critical wound; stikka on a charge turn +1 to wound (Lance); saddlegit weapons fire after Advancing (Assault) |
| MOR-010 | MOR-3.1 | Half-chewed: an attached Snagga Boy loses a wound → FNP rolled at 5+ (not 6+), one roll |
| MOR-011 | MOR-3.1 | Half-chewed: ranged AP0 vs a Snagga Boy (Sv5+) → saves on 4+; melee AP0 → 5+; with cover still 4+ (cap +1) |
| MOR-012 | MOR-3.1 | Half-chewed C1: during a Waaagh!, ranged AP−2 vs a Snagga Boy → armour 6+, invuln 5+ (not 4+); the auto-pick takes the invuln at 5+ |
| MOR-013 | MOR-3.2 | Bosskilla: Morgrim's beastchoppa hit 6 → 1 extra hit (Sustained Hits 1) and Precision allocation to an attached enemy CHARACTER; Boyz' choppas unaffected; shoota unaffected |
| MOR-014 | MOR-4.1 | Bag the Big 'Un: round 1 start offers enemy MONSTER/VEHICLE models; with none, only the enemy WARLORD |
| MOR-015 | MOR-4.1 | Bag the Big 'Un: target killed by Morgrim → 12 VP at battle end; killed by a Snagga Boy in his attached unit → 8; alive → 0; Reserves never arrived → 8 |
| MOR-016 | MOR-4.1 | Bag the Big 'Un (B3): one model of a 3-model VEHICLE unit picked → its death alone scores 8 at battle end, even though the unit survives |
| MOR-017 | MOR-4.2 | Krumpin' Spree: end of own turn, holding the marker nearest the enemy edge plus one more marker outside own DZ → 4 VP; holding only a marker in own DZ → 0 |
| MOR-018 | MOR-4.2 | Krumpin' Spree: not scored at the end of the opponent's turn; two markers tied for nearest and both held → 3 + 1 = 4 |
| MOR-019 | MOR-5.1 | Tough As Squig-hide: S6 attack vs Snagga Boyz (T5) → −1 to wound; S5 → unchanged; offered in the opponent's Shooting and either Fight phase; not offered for Squighogs (MOUNTED) |
| MOR-020 | MOR-5.2 | Bestial Bellow: start of the Fight phase, Morgrim 2" from an enemy unit → offered; the enemy rolls 2D6 −1 vs its Ld (7 → 6 passes vs Ld 6+, 6 → 5 fails) |
| MOR-021 | MOR-5.2 | Bestial Bellow: offered for a Squighog Boy model; not for a Beast Snagga Boy model; not for an enemy 4" away; 1 CP spent once |
| MOR-022 | MOR-5.3 | Get In There!: offered when an own ORKS unit is picked to fight; pile-in allowance 6"; consolidation still 3"; not offered for an enemy unit |
| MOR-023 | MOR-1 | e2e: the start-screen patrol picker lists Morgrim's Butchas for Orks; starting with it fields 4 units; an AI-vs-AI sim game with this patrol completes 5 rounds without an engine error |

## TRI — Adeptus Custodes: Tristraen's Gilded Blades (docs/spec/factions/adeptus-custodes--tristraen-s-gilded-blades.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| TRI-001 | TRI-1 | patrol loads (default): 3 units, 7 models (Tristraen 1, Guard 3, Wardens 3); Tristraen is WARLORD with Watchman of Terra, unattached; default secondary Raise the Vexillas |
| TRI-002 | TRI-1.1 | `unitChoices:{retinue:'allarus'}` → 3 units, 6 models, no Wardens unit exists |
| TRI-003 | TRI-1.3, 1.4 | no unit may start in Deep Strike Reserves; Guard has no BATTLELINE keyword; all 3 Guard models start at 4 W; Tristraen at 6 W; Allarus T 7, M 5 |
| TRI-004 | TRI-2.1 | each time a TGB unit is selected to fight (both players' turns) its player gets a mandatory Dacatarai/Rendax choice for that unit only; no army-wide pick at Fight-phase start |
| TRI-005 | TRI-2.2, 2.4 | two TGB units in one phase: Guard picks Dacatarai (critical hit → 1 extra hit), Wardens pick Rendax (critical hit auto-wounds); each unit only gets its own stance; ranged weapons unaffected; stance gone at phase end |
| TRI-006 | TRI-2.5 | Guardians of the Throne still gets its Fight-phase-start pick (CUS-004 regression); a TGB-only army never sees it |
| TRI-007 | TRI-3.1 | Watchman of Terra: Tristraen in Engagement Range → OC 4 (outweighs 3 OC 1 enemies on a marker); out of Engagement Range → OC 2; Battle-shocked → 0 |
| TRI-008 | TRI-3.2 | Warrior Exemplar: Tristraen destroys the last model of an enemy unit → D6, 3+ gains 1 CP, 1–2 nothing; kill by a Guard model → no roll; a second gain in the same round is discarded by the R-4.2 cap |
| TRI-009 | TRI-4.1 | Raise the Vexillas: round 3+, end of own turn, controls both edge-closest markers → +3; only one of them → 0; round 2 → 0; end of opponent's turn → 0 |
| TRI-010 | TRI-4.1 | Raise the Vexillas edge selection: markers picked by distance to each player's battlefield edge for both deployment orientations; a tie lets either tied marker count |
| TRI-011 | TRI-4.2 | Consecrated Ground: enemy unit destroyed in either turn (attack, mortal wounds, Reserve cull) → +3 each |
| TRI-012 | TRI-4.2 | Consecrated Ground: own Custodes model destroyed → −1; at 0 secondary VP a loss removes nothing; VP from other sources are never reduced; the opponent's models dying do not reduce it |
| TRI-013 | TRI-5.1 | Gilded Spear: Custodes unit not yet fought, either turn → pile-in up to 6" this phase; consolidate still 3"; not targetable after the unit fought |
| TRI-014 | TRI-5.2 | Inescapable Vengeance: own Movement phase, unit not yet moved → Advance roll +2 (rolled 3 → 5"); not targetable once the unit moved; expires at phase end; not usable in the opponent's turn |
| TRI-015 | TRI-5.3 | Overawing Magnificence: enemy declares a charge on a Custodes unit → offered; Ld test failed → charge roll −2 (2D6 = 9 → 7); passed → no change; Custodes unit not a charge target → not offered |
| TRI-016 | TRI-5 | the Guardians of the Throne stratagems `cus.s.*` are not in this patrol's list, and the `cus.s.tgb-*` ones are not in Guardians' (both patrols' data load side by side) |
| TRI-017 | TRI-6.1 | Tristraen fights with exactly one vaultswords profile: Behemor 6 A with Precision (may allocate to an attached CHARACTER), Hurricanus 9 A Sustained Hits 1, Victus 5 A Devastating Wounds D 3 |
| TRI-018 | TRI-6.3 | balistus grenade launcher: D6 attacks +2 against a 10-model unit (Blast); cannot target a unit engaged with a friendly unit |
| TRI-019 | TRI-6 | Wardens wargear as built: axe model has castellan axe ranged 24" A2 and melee A4 S9 AP−1 D3; spear models use reused guardian spear profiles |
| TRI-020 | TRI-6 | Dacatarai on Hurricanus does not stack a second Sustained Hits; Rendax on Hurricanus gives both Lethal and Sustained |

## SDC — T'au Empire: Sudden Dawn Cadre (docs/spec/factions/tau-empire--sudden-dawn-cadre.md)
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

## DZE — Chaos Space Marines: Dark Zealots (docs/spec/factions/chaos-space-marines--dark-zealots.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| DZE-001 | DZE-1 | patrol `csm.cp.dark-zealots` loads: 4 units, 19 models (Ghallaron unit 3, Legionaries 10, Havocs 5, Helbrute 1); Ghallaron model is WARLORD with Hateful Exhortation, attached to Legionaries; default secondary Champion of the Dark Gods; Zarkan's Daemonkin still loads unchanged |
| DZE-002 | DZE-1.1 | Ghallaron unit: Ghallaron W4 Sv3+ Ld5+, Disciples W1 Sv6+ Ld7+, all 4+ invuln; attached to Legionaries, an enemy non-Precision attack may be allocated to a Disciple but not to Ghallaron while a Legionary lives |
| DZE-003 | DZE-1.2 | Patrol Squads: split → `legionaries-a` and `legionaries-b` of 5 each with the DZE-1.2 wargear, Ghallaron attaches to `legionaries-a`; unsplit is the default |
| DZE-004 | DZE-2.1 | Havocs selected to shoot → Dark Pact offered (lethal / sustained / decline); decline → no test at any point |
| DZE-005 | DZE-2.2 | Pact made → no Ld roll at selection; the picked ability is on every weapon of the unit for the whole activation |
| DZE-006 | DZE-2.3 | Pact made while shooting → Ld test rolled at `shooting.attacksResolved` after the last attack; fail → D3 mortal wounds resolved before the next unit is selected; pass → none |
| DZE-007 | DZE-2.3 | Helbrute Pact in the Fight phase → Ld test after its attacks (after consolidation); attached Ghallaron + Legionaries test against Ld 5+ (best Ld) |
| DZE-008 | DZE-2.3 | unit destroyed by its own Hazardous rolls before the test → no test, no error |
| DZE-009 | DZE-2.1 | Fire Overwatch by Legionaries / Havocs → no Pact prompt; Zarkan's patrol units still test before attacking (CHA-003 regression) |
| DZE-010 | DZE-3.1 | Hateful Exhortation: at the start of round 1 the owner picks enemy unit X (once, never again in later rounds); Legionary critical wound vs X (AP 0 boltgun) resolves at AP −1; vs another unit no change; non-critical wound vs X no change |
| DZE-011 | DZE-3.1 | Hateful Exhortation stops once Ghallaron is destroyed; an attached marked enemy unit stays marked on both halves after its leader detaches |
| DZE-012 | DZE-3.2 | Infernal Blessing: Ghallaron ignores lost wounds on 5+ (normal and mortal); Disciples and Legionaries get no FNP |
| DZE-013 | DZE-4.1 | Champion of the Dark Gods: Ghallaron's crozius kills an enemy model in the Fight phase → +3 VP at that phase's end; also in the opponent's turn; a Disciple or Legionary kill alone → 0 |
| DZE-014 | DZE-4.1 | Champion of the Dark Gods: Ghallaron kills a model and is then destroyed in the same phase → still +3; scores in each qualifying phase (no cap) |
| DZE-015 | DZE-4.2 | Idolatrous Despoilers: at the end of the opponent's turn, one non-Battle-shocked unit wholly inside the enemy zone → +4 VP (flat with two units); one model outside → 0; Battle-shocked → 0; end of own turn → 0 |
| DZE-016 | DZE-5.1 | Empyric Rites: Havocs targeted in the opponent's Shooting phase → 4+ invuln vs AP −3 this phase only; not offered for the Helbrute (VEHICLE) or in own Shooting phase; offered in either Fight phase |
| DZE-017 | DZE-5.2 | Bitter Blows: Legionaries targeted in a Fight phase, model destroyed before they fought, D6 = 4 → model stays at 0 W, fights after the enemy unit's attacks, then removed; D6 = 3 → removed; already fought → no roll |
| DZE-018 | DZE-5.2 | Bitter Blows not offered for the Helbrute; a deferred model gets no Dark Pact prompt or test (DZE-2.4) |
| DZE-019 | DZE-5.3 | Malicious Volleys: Havocs vs a target at full strength → hit 1s re-rolled only; vs a Below Half-strength target → any failed hit roll re-rolled |
| DZE-020 | DZE-5.3 | Malicious Volleys not offered for a unit already selected to shoot, for the Helbrute, or outside own Shooting phase |
| DZE-021 | DZE-6.1 | Dark Zealotry: attached Ghallaron + Legionaries melee wound roll +1 (chainsword S4 vs T4 wounds on 3+); unattached Ghallaron unit → no bonus; Ghallaron dead (Disciples alive) → no bonus; ranged unaffected |
| DZE-022 | DZE-6.2 | Havoc heavy bolter: no +1 to hit for Remaining Stationary, Sustained Hits 1 on a critical hit; Legionary heavy bolter still Heavy |
| DZE-023 | DZE-6 | Havoc missile launcher frag Blast: D6 attacks +1 per 5 models in the target; plasma gun Rapid Fire 1 at half range; supercharge Hazardous |
| DZE-024 | DZE-6.3 | Helbrute: Deadly Demise 1 on a 6 → 1 MW to each unit within 6"; plasma cannon Hazardous fail → 3 mortal wounds to the Helbrute (VEHICLE), not destroyed outright |
| DZE-025 | C2 | patrol `armyRule` override: Dark Zealots registers and shows `csm.a.dark-pacts-dz`; patrols without the field keep the faction `armyRule` |
| DZE-026 | data | data validates: every new datasheet/weapon/ability/stratagem/enhancement id resolves; no existing `csm.` record changed; `faction.json` lists both patrols |
| DZE-027 | e2e | start screen: pick Chaos Space Marines → patrol picker → Dark Zealots → game starts with Ghallaron's unit attached to Legionaries and the Helbrute on the board |

## CLA — Genestealer Cults: Claw of Ascension (docs/spec/factions/genestealer-cults--claw-of-ascension.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| CLA-001 | CLA-1 | patrol `gsc.cp.claw-of-ascension` loads: 5 units, 17 models; Shanus is WARLORD with Priority Kill Order, attached to `jackals`; default secondary Infiltration Agenda; `faction.json` lists both patrols; Hand of the Magus still loads unchanged |
| CLA-002 | CLA-1 | wargear as built: Metamorph mutant has no ranged weapon; 3 flamers have hand flamer; Wolfquad has mining laser and 4 W, other Jackals 2 W |
| CLA-003 | CLA-2.1 | Metamorphs destroyed in round 2 with D6 = 4 → total 5 → pool + marker decision; D6 = 3 → lost |
| CLA-004 | CLA-2.1 | Metamorphs destroyed in round 3 with D6 = 4 → lost (no bonus); D6 = 5 → pool |
| CLA-005 | CLA-2.1 | Atalan Jackals, Shanus and the Ridgerunner destroyed → no Cult Ambush roll |
| CLA-006 | CLA-2.3 | return: a placement with a model 3.2" beyond the marker edge is rejected; all models wholly within 3", one touching, all >9" from enemies → accepted |
| CLA-007 | CLA-2.3 | marker 1" from a board edge: offered placements stay on the board and inside the 3" region |
| CLA-008 | CLA-2.4 | returned Metamorphs are a new unit at 5 models, full wounds; `oneShotUsed` empty on every model (resetOneShot) |
| CLA-009 | CLA-2.5 | Metamorphs destroyed in round 1 during the GSC player's own first turn (going first) → pool + marker, but no return offered in the opponent's round-1 Movement phase; offered in round 2 |
| CLA-010 | CLA-2.5 | Claw pool unit still waiting when the second player's round-3 reinforcements end → `UnitLostInReserves`, counted once more as destroyed, no Cult Ambush re-roll, pool empty |
| CLA-011 | CLA-2.5 | Metamorphs destroyed in round 4 → roll made; on success no marker decision, never returns, never counted |
| CLA-012 | CLA-2 | regression: Hand of the Magus Neophytes still +3 BATTLELINE / 4+, keep One Shot state, no round-1 restriction change (GEN-002, GEN-015 unchanged) |
| CLA-013 | CLA-3.1 | Priority Kill Order: start of own Shooting phase → decision lists only enemies visible to Shanus; a missed Ridgerunner hit roll vs the picked unit is re-rolled; a successful one may be re-rolled by choice; vs another unit no re-roll; gone at phase end |
| CLA-014 | CLA-3.1 | Priority Kill Order: not offered in the opponent's Shooting phase; no option for an enemy hidden from Shanus's model |
| CLA-015 | CLA-3.2 | Master of Suppression: after Shanus's unit shoots, picks only among units it hit; that unit's attacks −1 to hit in its own next turn and in Overwatch during the GSC player's next Movement phase; gone at the start of the GSC player's next Shooting phase |
| CLA-016 | CLA-3.2 | Master of Suppression stacked with Stealth on the target of the suppressed unit's attacks → still −1 (cap) |
| CLA-017 | CLA-4.1 | Infiltration Agenda: end of own turn with a non-shocked Metamorph model's base overlapping the enemy zone → +4; two units in → still 4; Battle-shocked only → 0; end of opponent's turn → 0 |
| CLA-018 | CLA-4.2 | Safeguard the Sanctuary: cp-01 GSC as player A controls `south` at battle end → +10; controls `north` only → 0 |
| CLA-019 | CLA-4.2 | Safeguard the Sanctuary on cp-04 (triangle zone): closest marker to the west edge (`site-a`) is the one that scores |
| CLA-020 | CLA-5.1 | Metamorphic Spasm: enemy picks Metamorphs in the Fight phase → offered; a model destroyed before the unit fought rolls 4+ → stays, fights after the enemy finishes, then removed; roll 3 → removed at once |
| CLA-021 | CLA-5.1 | Metamorphic Spasm not offered for Jackals or the Ridgerunner |
| CLA-022 | CLA-5.2 | Point-Blank Ambush: Jackals' small-arms critical hits vs a unit 10" away auto-wound; vs a unit 14" away they do not; usable in either player's Fight phase on a unit that has not fought |
| CLA-023 | CLA-5.2 | Point-Blank Ambush not offered for a unit that already shot this phase, nor in the opponent's Shooting phase |
| CLA-024 | CLA-5.3 | Swarm the Oppressors: start of own Charge phase, enemy X picked; a charge declaring X (alone or with others) gets +1 to the roll; a charge not including X gets none; gone after the phase |
| CLA-025 | CLA-6.1 | Master Outrider: after Shanus+Jackals shoot, out of Engagement Range → may move up to 6" (Normal move, must end outside ER); afterwards no charge declaration offered that turn; declining keeps charging legal |
| CLA-026 | CLA-6.1 | Master Outrider not offered when the unit is within Engagement Range after shooting, nor in the opponent's turn (Overwatch) |
| CLA-027 | CLA-6.2 | Crossfire: after the Ridgerunner hits enemy X, X gets −1 AP improvement vs GSC attacks for the rest of the turn (Metamorph strike AP −1 resolves at −2 in the Fight phase); Shanus's ranged attacks vs X later that phase also improved; effect gone at end of turn |
| CLA-028 | CLA-6.2 | Crossfire: no decision when the Ridgerunner hit nothing; a unit already Crossfire-marked this turn is not offered again |
| CLA-029 | CLA-6.3 | Scouts: Shanus+Jackals and the Ridgerunner may Scout 9", Metamorphs 6"; Deep Strike offered to no unit |
| CLA-030 | CLA-6.4 | Metamorphs FNP 5+: each lost wound rolls; Jackals have no FNP |
| CLA-031 | CLA-6.5 | Stealth: ranged attacks vs Shanus+Jackals −1 to hit; melee unchanged |
| CLA-032 | CLA-6.6 | Ridgerunner destroyed → Deadly Demise 1 on a 6 (1 mortal wound to each unit within 6") |
| CLA-033 | CLA-6.7 | cult sniper rifle: Precision lets the hit go to an attached enemy CHARACTER; Heavy +1 to hit when stationary |
| CLA-034 | CLA-6.8 | weapons: hand flamer D6 auto-hits ignoring cover and usable in Engagement Range; twin heavy stubber re-rolls failed wound rolls and fires 6 shots within 18"; mining laser D6+1 damage |
| CLA-035 | CLA-6.9 | Metamorph mutations: each model fights with exactly one profile (strike 3 A or sweep 5 A), never both |

## INF — Tyranids: Insidious Infiltrators (docs/spec/factions/tyranids--insidious-infiltrators.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| INF-001 | INF-1 | patrol loads: 5 units, 11 models (1 + 1 + 3 × 3); Death's Shadow is WARLORD and bearer of Neurogoad; default secondary Alpha Predation; three separate Leaper units |
| INF-002 | INF-1.2 | Psionic Phantoms selected → its ability sits on Death's Shadow's only model (no CHARACTER in the army) |
| INF-003 | INF-2.2 | no Synapse: a Leaper unit next to Death's Shadow takes a Battle-shock test on 2D6; `tyr.von-ryans-leapers-inf` differs from `tyr.von-ryans-leapers` only by lacking `tyr.a.synapse` |
| INF-004 | INF-2.1 | Shadow in the Warp offered at either player's `command.start` while Death's Shadow is on the board; used → every enemy board unit tests once; never again this battle |
| INF-005 | INF-6.1 | Neural Disruption at own `command.start`: enemy unit 11.9" away is an option, one 12.1" away is not; picked unit takes one Battle-shock test (2D6 vs Ld) |
| INF-006 | INF-6.1 | Neural Disruption not offered in the opponent's Command phase, nor twice in one phase; a unit picked by both Neural Disruption and Shadow in the Warp tests twice |
| INF-007 | INF-6.2 | Psychological Saboteur: a Battle-shocked enemy unit within 12" of Death's Shadow → its hit rolls −1; not shocked → 0; shocked but 12.5" away → 0 |
| INF-008 | INF-6.2 | Psychological Saboteur wounds: the Lictor (20" from Death's Shadow) attacks a shocked enemy unit 10" from Death's Shadow → +1 to wound; target 13" away → 0; Death's Shadow destroyed → 0 |
| INF-009 | INF-6.2 | Psychological Saboteur stacks with another −1 to hit only up to the −1 cap |
| INF-010 | INF-6.3 | Feeder Tendrils: the Lictor destroys an enemy CHARACTER model → +1 CP; a non-CHARACTER kill → 0; a second CHARACTER kill in the same round → 0 (R-4.2 cap); a CHARACTER killed by a Leaper → 0 |
| INF-011 | INF-6.6 | Precision: Lictor claws and talons vs an attached unit → the attacker may allocate to the Leader model |
| INF-012 | INF-6.5 | Lone Operative: Death's Shadow and the Lictor can be shot from 12" but not 12.1" |
| INF-013 | INF-6 | core abilities: the Lictor and Leapers fight in the Fights First step without charging, Death's Shadow does not; all three datasheets deploy via Infiltrators (>9" from the enemy DZ and models); ranged hit rolls vs each get −1 (Stealth) |
| INF-014 | INF-6 | profiles: Death's Shadow 4+ invuln, Lictor no invuln, Leapers 6+; piercing claws A6 WS2+ S6 AP−2 D1; Lictor claws A6 WS2+ S7 AP−2 D2 |
| INF-015 | INF-3.1, 3.3 | Neurogoad at own `command.start`: friendly unit 11" from the bearer is an option, 12.5" is not; picked → its charge roll may be re-rolled and its hit rolls may be re-rolled, also in the opponent's following Fight phase; the effect is gone at the start of the Tyranid player's next turn |
| INF-016 | INF-3.3 | Neurogoad not offered in the opponent's Command phase, and only once per own Command phase |
| INF-017 | INF-3.4, 3.5 | Psionic Phantoms: an enemy unit declares ranged targets including Death's Shadow → offer; used → a Normal move of up to 6" (6.1" rejected, ending in ER rejected); bearer still visible → the declared attacks resolve unchanged |
| INF-018 | INF-3.6, 3.7 | Psionic Phantoms: bearer hidden after the move, D6 = 2 → the shooter re-declares only the weapons that targeted the bearer; new legal targets accepted, the bearer is not; pass → those attacks are lost; other declared targets unchanged |
| INF-019 | INF-3.8 | Psionic Phantoms: bearer hidden, D6 = 5 → models that targeted the bearer make no attacks (their weapons aimed at other units dropped too); models that targeted other units still shoot |
| INF-020 | INF-3.4 | Psionic Phantoms: once per battle round (second targeting in the same round → no offer; next round → offer); offered vs Fire Overwatch after set-up, after a move ends and after a charge declaration (4-6: that Overwatch makes no attacks), not offered vs the 'starts a move' Overwatch trigger, not offered while the bearer is in ER, or when only another unit is targeted |
| INF-021 | INF-4.1, 4.3 | Alpha Predation: enemy Warlord destroyed in round 2 → +15 VP; in round 3 → +10; in round 5 → +5; scored once only |
| INF-022 | INF-4.3 | Alpha Predation: enemy Warlord stranded in Reserves and culled at the end of round 3 → +10 VP |
| INF-023 | INF-4.2, 4.4 | Left to Last: destroying an enemy non-Warlord unit while the enemy Warlord lives → +4 VP each; destroying the Warlord's unit → 0; any kill after that → 0 |
| INF-024 | INF-4.4 | Left to Last: an enemy unit lost to its own Hazardous roll or the Reserves cull → 0; a Bodyguard half destroyed while its attached Warlord lives → +4 |
| INF-025 | INF-5.1, 5.4 | Swift Kills on Leapers not yet fought: Leaper's talons AP −1 → −2, Anti-MONSTER 4+ and Anti-VEHICLE 4+ (wound roll 4 vs a VEHICLE is critical; vs INFANTRY not); ends at phase end |
| INF-026 | INF-5.1 | Swift Kills offered in both players' Fight phases; not offered for a unit that has already fought this phase |
| INF-027 | INF-5.2, 5.5 | Pheromonal Trace at own `command.end`: Leapers within 3" of a marker you control → `securedBy` you; Leapers leave → the marker stays yours; opponent controls it at the end of a later Command phase → flag cleared |
| INF-028 | INF-5.2 | Pheromonal Trace not offered for the Lictor or Death's Shadow (not VON RYAN'S LEAPERS), for a marker you do not control, or for Leapers out of range |
| INF-029 | INF-5.3, 5.6 | Predators, Not Prey in Movement on a unit not yet moved: a Normal move whose path crosses enemy and friendly models (and passes through ER) is accepted; ending within ER or overlapping is still rejected |
| INF-030 | INF-5.6 | Predators, Not Prey: a Fall Back that crosses enemies (or a Battle-shocked unit) rolls no Desperate Escape dice and loses no models |
| INF-031 | INF-5.3, 5.7 | Predators, Not Prey in the Charge phase before a charge is declared → the charge move may cross models; not offered for a unit that already moved / declared a charge, nor in the opponent's turn |
| INF-032 | INF-6.4 | Pouncing Leap: Heroic Intervention on each Leaper unit costs 0 CP and is offered even after HI was used on another Leaper unit this phase; the Lictor pays 1 CP |
| INF-033 | INF-1 | data: every new id exists and validates; the Vardenghast Swarm records (datasheets, weapons, abilities, stratagems, enhancements, patrol) are byte-for-byte unchanged |
/^>>>>>>> bc61039/d
## PEN — Adepta Sororitas: The Penitent Host (docs/spec/factions/adepta-sororitas--the-penitent-host.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| PEN-001 | PEN-1 | patrol `ade.cp.the-penitent-host` loads: 7 units, 26 models; Ellyrine is WARLORD with Armour of Faith, attached to the Battle Sisters; default secondary Divine Judgement; stratagems are the three `ade.s.pen.*` ids |
| PEN-002 | PEN-1.3 | data: Sanctuary Guardians still loads unchanged; no existing `ade.*` datasheet / weapon / ability / stratagem value differs from before; every new id is unique |
| PEN-003 | PEN-1.1 | Ellyrine may attach only to `ade.pen.battle-sisters-squad` (Seraphim / Repentia / Arcos refused) |
| PEN-004 | PEN-1.2 | Patrol Squads split → `sisters-a` (Superior, flamer, 3 boltgun) and `sisters-b` (storm bolter, Simulacrum, 3 boltgun), each Starting Strength 5; default unsplit |
| PEN-005 | PEN-2.1 | own Penitent Engine destroyed → +1 Miracle die; its hit roll is offered a Miracle substitution; Rhino's save is offered one |
| PEN-006 | PEN-3 | Armour of Faith: Ellyrine FNP 4+; attached Battle Sisters FNP 5+; after Ellyrine dies the Sisters lose it |
| PEN-007 | PEN-3.1 | Saintly Relic gain: end of own Command phase, bearer within range of a controlled marker → +1 die; two markers → still 1; bearer's unit Battle-shocked → 0; marker not controlled → 0; opponent's Command phase → 0 |
| PEN-008 | PEN-3.2 | Saintly Relic re-roll: bearer on board → each gained die (turn start, unit destroyed, Relic gain) gets one keep/reroll offer; reroll replaces the value and is not offered again; bearer dead → no offer; Armour of Faith patrol → no offer |
| PEN-009 | PEN-4.1 | Divine Judgement pick: at round 1 start the **opponent** gets the decision; candidates exclude MONSTER and VEHICLE units; choice stored for the Sororitas player; no pick in round 2 |
| PEN-010 | PEN-4.2 | Divine Judgement score at battle end only: target destroyed by Repentia melee → 10; by shooting (or by an enemy's own Hazardous) → 6; survives → 0; Reserves cull → 6; nothing scored before battle end |
| PEN-011 | PEN-4.3 | Rites of Reconsecration: round 1 → 0; round 2+, end of own turn, a unit wholly inside the enemy zone → 3; one model outside → 0; Battle-shocked → 0; two units inside → 3 |
| PEN-012 | PEN-5.1 | Ascetic Discipline: opponent's Shooting, Repentia targeted → 5+ invuln (Sister Repentia saves on 5+ instead of 6+); Battle Sisters / Seraphim → 4+; not usable in own Shooting phase; expires at phase end |
| PEN-013 | PEN-5.2 | A Martyr's Death: own Shooting, Battle Sisters not yet shot → boltgun unmodified 6 to hit auto-wounds; Penitent Engine / Rhino not eligible targets; not usable in the opponent's Shooting phase; usable in the opponent's Fight phase on a unit that has not fought yet |
| PEN-014 | PEN-5.3 | Holy Radiance (2 CP): enemy fights Repentia, a not-yet-fought Repentia is destroyed → no D6, model stays, fights after the enemy unit's attacks, then removed; a model that already fought → removed at once; no Miracle discard prompt; not offered in Shooting |
| PEN-015 | PEN-5.3 | Sanctuary Guardians `ade.s.a-martyrs-death` behaviour unchanged by the `aMartyrsDeath` param extension (D6 + discard still happen) |
| PEN-016 | PEN-6.1 | Lead the Righteous: led Battle Sisters may re-roll hits; unled → no re-roll |
| PEN-017 | PEN-6.3 | Angelic Ascent: Seraphim shoot, not in Engagement Range → offered a Normal move up to 6"; used → cannot declare a charge this turn; declined → can charge; within Engagement Range → no offer |
| PEN-018 | PEN-6.3 | Seraphim Deep Strike: may start in Reserves, arrive from round 2 more than 9" from enemies |
| PEN-019 | PEN-6.4 | Overseer of Redemption: Superior alive → melee hit re-roll; wound re-roll only after a Charge move this turn; Superior dead → neither; bolt pistol shots unaffected |
| PEN-020 | PEN-6 | Repentia per-model stats: Superior Sv 3+ Ld 7+; Sister Repentia Sv 7+ (invuln 6+ used) Ld 8+; FNP 5+ per wound |
| PEN-021 | PEN-6.6 | PEN Arco-flagellants: FNP 4+; arco-flails Twin-linked (wound re-roll) + Sustained Hits 1; no Extremis decision offered |
| PEN-022 | PEN-6.5, 6.7 | Penitent Engine: declares a charge after Advancing; FNP 5+; Deadly Demise 1; penitent flamers 2D6 Torrent Twin-linked and fire after an Advance (Assault) |
| PEN-023 | PEN-6.7 | Sororitas Rhino: T9 W10 Sv 3+ invuln 6+; storm bolter Rapid Fire 2 at half range → 4 shots; Deadly Demise D3 |
| PEN-024 | PEN-6.8 | (E-PEN2) Battle Sisters end a move within 3" of the Rhino → embark offer; Seraphim (JUMP PACK) never offered; capacity counts models (12); disembark next Movement phase wholly within 3" |
| PEN-025 | PEN-6.8 | (E-PEN2) Firing Deck 2: the Rhino shoots with up to 2 embarked models' ranged weapons; those passenger units cannot shoot afterwards |
| PEN-026 | PEN-6 | weapons: plasma supercharge profile is Hazardous (Ellyrine BS 2+, Seraphim BS 3+); artificer storm bolter D2 Rapid Fire 2; neural whips Anti-Infantry 4+ (unmodified 4 vs INFANTRY is a critical wound); penitent eviscerator S6 AP−2 D2 |
| PEN-027 | E-PEN3 | `unitHasModel` condition: true while a matching live model exists in the holder unit (attached halves included), false otherwise and for non-matching keys |

## BLO — Blood Angels: Strike Force Marcellos (docs/spec/factions/blood-angels.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| BLO-001 | BLO-1 | patrol `ba.cp.strike-force-marcellos` loads under faction `blood-angels`: 5 units, 15 models; Marcellos WARLORD with Baalite Bladesman, attached to the Intercessors; start screen lists Blood Angels as its own faction |
| BLO-002 | BLO-1.3 | data: no existing `sm.*` record changes; reused ids (`sm.a.oath-of-moment`, bolt pistol, Smite ×2, force weapon, ccw, storm bolter) resolve from the `ba` patrol; Octavius and Solarien still load unchanged |
| BLO-003 | BLO-1.1 | Marcellos may attach only to `ba.intercessor-squad` (Incursors / Aggressors refused) |
| BLO-004 | BLO-2.1 | Oath of Moment: Blood Angels player picks a target at own Command start; an Impulsor storm bolter attack against it may re-roll the hit |
| BLO-005 | BLO-3.1 | Baalite Bladesman: attached Intercessor chainsword AP −2, ccw AP −1, Marcellos force weapon AP −2; ranged AP unchanged; unattached Intercessors unaffected |
| BLO-006 | BLO-3.2 | Radiant Wrath: Smite (both profiles) critical-wounds a VEHICLE on 5+; an INFANTRY target still needs the normal roll; force weapon gains nothing |
| BLO-007 | BLO-4.1 | Angelic Wrath: end of opponent's turn, controlled marker 5" from enemy zone → 4 VP; marker 7" away → 0; two qualifying markers → still 4; end of own turn → 0 |
| BLO-008 | BLO-4.2 | Strategic Aggression pick at round 1 start: candidates are enemy MONSTER/VEHICLE models; with none, enemy CHARACTER models (not just the WARLORD); with none of either, no decision |
| BLO-009 | BLO-4.2 | Strategic Aggression score at battle end only: picked model destroyed → 10 VP whoever killed it; alive → 0; Morgrim's Bag the Big 'Un unchanged (no `fallbackKeyword` → WARLORD fallback, 8/12 VP) |
| BLO-010 | BLO-5.1 | Controlled Ferocity: enemy picks the Intercessors in the Fight phase (either turn) → offered; attacks against them −1 to hit; Impulsor not a legal target |
| BLO-011 | BLO-5.2 | Harness the Flaw: not-yet-fought Aggressors re-roll wound 1s; vs a VEHICLE re-roll any failed wound; unit that already fought not offered; Impulsor never a target |
| BLO-012 | BLO-5.3 | Rapid Strike: end of own Shooting, Incursors (or Intercessors + Marcellos) out of Engagement Range → Normal move up to 6"; Aggressors not offered; unit in Engagement Range not offered |
| BLO-013 | BLO-5.3 | Rapid Strike restriction: the moved unit cannot declare a charge that turn; no embark offer at the end of the move |
| BLO-014 | BLO-6 | Datasheet stats exact: Marcellos M6 T4 Sv3+ W4 Ld6+ OC1; Intercessors OC2 BATTLELINE; Aggressors M5 T6 W3; Impulsor M12 T9 W11 OC2 |
| BLO-015 | BLO-6.1 | Mental Fortress: attached Intercessors and Marcellos save on 4+ invuln vs AP −3; unattached Marcellos has no invuln |
| BLO-016 | BLO-6.2 | Multi-spectrum Array: Incursors hit one enemy → it is auto-marked; a later Aggressor/Intercessor attack on it this phase gets +1 to hit; next phase gone |
| BLO-017 | BLO-6.2 | Multi-spectrum Array: two hit units → choice offered; an unhit unit is never a candidate; ±1 cap holds against a −1 to-hit defender; not triggered by Overwatch |
| BLO-018 | BLO-6.3 | Impulsor transport: Intercessors (5) and Incursors (5) may embark; Aggressors (GRAVIS) refused; capacity 6 counts models (Intercessors + Incursors together refused) |
| BLO-019 | BLO-6.3 | Firing Deck 6: Impulsor fires up to 6 embarked models' ranged weapons; those passenger units cannot shoot afterwards |
| BLO-020 | BLO-6.3 | Impulsor Deadly Demise D3: on destruction a 6 deals D3 mortal wounds to each unit within 6"; passengers emergency-disembark |
| BLO-021 | BLO-6.4 | Haywire Mine: start of a phase, enemy within 3" of the haywire Incursor → offer; 2+ deals D3 MW (2D3 to a VEHICLE); a 1 deals nothing and spends it; never offered again |
| BLO-022 | BLO-6.4 | Haywire Mine: decline → offered again next phase; haywire model dead (other Incursors alive) → never offered; enemy 4" away → not offered |
| BLO-023 | BLO-6 | Weapons: flamestorm gauntlets D6+1 Torrent Twin-linked Ignores Cover; bolt rifle Assault + Heavy AP −1; occulus carbine Assault Ignores Cover; paired blades Sustained Hits 1 A3 WS3+ |
| BLO-024 | BLO-6 | Bellicatus array: exactly one of frag (Blast) / icarus (Anti-FLY 2+) / krak (D6 damage) per shooting; twin power fists WS4+ Twin-linked |
| BLO-025 | BLO-6 | Incursor Scouts 6": pre-battle Scout move offered; Intercessors not offered |
| BLO-026 | BLO-7 | Sim: a full Blood Angels vs Space Marines (and vs Orks) game runs to battle end with no invariant errors |

## SPA — Space Wolves: Thoryk's Void Hunters (docs/spec/factions/space-wolves.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| SPA-001 | SPA-1 | patrol `sw.cp.thoryks-void-hunters` loads (default): faction `space-wolves`, 4 units, 17 models; Thoryk is WARLORD with Tireless Hunter, attached to the Intercessor Squad; default secondary Mighty Saga; stratagems are the three `sw.s.*` ids; SM patrols still load unchanged |
| SPA-002 | SPA-1.2, 6.6 | Patrol Squads split → Intercessors become two 5-model units (sergeant in half A); Thoryk may attach to either half |
| SPA-003 | SPA-6 | data: every stat/profile row of §6 matches (Intercessor OC 2; Invictor T8 W12 OC4; twin ironhail autocannon S9 D3 Twin-linked); reused `sm.*` ids are unchanged; every `sw.*` id is unique |
| SPA-004 | SPA-2.1 | Oath of Moment: an Invictor or Intercessor attack vs the Oath target re-rolls the hit roll (shared `sm.a.oath-of-moment`) |
| SPA-005 | SPA-1.4 | start screen lists Space Wolves as its own faction; a Space Wolves player can face a Space Marines player |
| SPA-006 | SPA-6.5 | Scouts: Reivers offered a 6" Scouts move, the Invictor an 8" one; Reivers in Reserves (Deep Strike) are not offered Scouts |
| SPA-007 | SPA-6.3 | Deep Strike: Reivers may be set up in Reserves and arrive >9" from enemies from round 2; Intercessors, Thoryk, Invictor may not |
| SPA-008 | SPA-3.1 | Tireless Hunter: round 1 start → pick offered to the SW player (one option per enemy unit); Thoryk's attack vs the picked unit gets +1 to wound (S4 vs T4: 3+ instead of 4+), ranged and melee |
| SPA-009 | SPA-3.1 | Tireless Hunter: Intercessor attacks vs the picked unit get no bonus; Thoryk vs another unit gets none; not offered again in round 2; bonus still live in round 3 |
| SPA-010 | SPA-3.2 | Ferocious: Heroic Intervention on Thoryk's unit costs 0 CP and is allowed after HI was already used on another unit this phase; on another unit it costs 1 CP |
| SPA-011 | SPA-4.1 | Mighty Saga: round 1 start pick lists only enemy CHARACTER/MONSTER/VEHICLE models; picked model destroyed by Reivers → 8 VP at battle end; not destroyed → 0 |
| SPA-012 | SPA-4.1 | Mighty Saga: picked model's unit destroyed by Thoryk's own attack → 12 VP; destroyed by an Intercessor of Thoryk's attached unit → 8 VP; Morgrim's Bag the Big 'Un unchanged |
| SPA-013 | SPA-4.2 | Reiving Conquerors: end of the opponent's turn, 1 v 1 No Man's Land markers → 3 VP; 2 v 1 → 3; 1 v 2 → 0; 0 v 0 → 0; home markers ignored; round 1 counts |
| SPA-014 | SPA-4.2 | Reiving Conquerors: end of the SW player's own turn → 0 |
| SPA-015 | SPA-5.1 | A Warrior's Death: enemy fights the targeted Intercessors; destroyed not-yet-fought model rolls 4+ → stays, fights after the enemy unit finishes, then is removed; roll 3 → removed at once; no Miracle-die prompt |
| SPA-016 | SPA-5.1 | A Warrior's Death not offered in the Shooting phase; a model whose unit already fought this phase gets no roll |
| SPA-017 | SPA-5.2 | Keen Senses: target in cover gets no +1 save vs the unit's ranged attacks; hit roll of 1 vs a CHARACTER unit is re-rolled; vs a non-CHARACTER unit it is not; not offered for a unit that already shot; expires at phase end |
| SPA-018 | SPA-5.3 | Pack Ambush: after Reivers shoot and hit an enemy unit → offered; enemy Battle-shock test subtracts 2 (2D6 = 8 vs Ld 6+ with −2 → 6 → passes; 7 −2 → 5 → fails) |
| SPA-019 | SPA-5.3 | Pack Ambush not offered: enemy not hit by the Reivers; enemy within Engagement Range of the Reivers; after a non-Reiver unit shoots |
| SPA-020 | SPA-6.1 | Target Priority: Thoryk's unit Falls Back, then may shoot and declare a charge that turn; Intercessors alone may not |
| SPA-021 | SPA-6.2 | Fearsome Assault: at the start of either Fight phase each enemy unit in Engagement Range of the Reivers takes one Battle-shock test; unengaged enemies do not |
| SPA-022 | SPA-6.4 | Damaged: Invictor at 4 W hits on 4+ with BS 3+ weapons; at 5 W on 3+ |
| SPA-023 | SPA-6 | weapons: twin ironhail heavy stubber at half range → 6 shots, failed wound rolls re-rolled (Twin-linked); fragstorm Blast +1 A per 5 target models; Reiver pistol and knife Precision allocate to a visible CHARACTER |
| SPA-024 | SPA-6 | bolt rifle: Intercessors Advance and still shoot (Assault); stationary → +1 to hit (Heavy) |
| SPA-025 | SPA-6.5 | Invictor Deadly Demise D3: on death roll 6 → D3 mortal wounds to each unit within 6" |
| SPA-026 | E1 | Pouncing Leap (Tyranids) cost override unchanged; an enhancement override applies only while its bearer is alive and in the target unit |

## DEA — Deathwatch: Vigil Force Alphion (docs/spec/factions/deathwatch.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| DEA-001 | DEA-1 | patrol loads (default): faction `deathwatch`, 4 units, 15 models; Alphion is WARLORD with Aegis Vigilate, attached to the Intercessor Squad; default secondary Hunters' Insight; both SM patrols still load unchanged |
| DEA-002 | DEA-1.2, 6.4 | Patrol Squads split → `intercessor-squad-a` (Sergeant + 3 rifles + 1 grenadier, all 5 with bolt rifles) and `-b` (4 rifles + 1 grenadier, all 5 with bolt rifles); Alphion and Krenn can each attach to one half |
| DEA-003 | DEA-6 | data: every stat/profile row of §6 matches (Krenn ccw A4, absolvor 18" S5 AP−1 D2, reductor 3" AP−4, flamestorm D6+1 Torrent Twin-linked, Aggressor T6 W3 M5, Intercessor OC 2); reused `sm.` ids unchanged |
| DEA-004 | DEA-2.1 | Oath of Moment: a Deathwatch bolt-rifle attack vs the Oath target may re-roll its hit roll; in a DW-vs-SM game each player keeps their own target |
| DEA-005 | DEA-3.1 | Aegis Vigilate: attached Intercessors are T5 (S5 attack wounds on 4+, not 3+) with a 4+ invulnerable save (AP−3 attack saved on 4+); unattached Krenn's unit unaffected |
| DEA-006 | DEA-3.2 | Aliens' Bane: Alphion's master-crafted power weapon wounds T4 on 2+ (S5 +1); may allocate to a CHARACTER in the target unit (Precision); his bolt pistol and the Intercessors' melee are unaffected |
| DEA-007 | DEA-6.1 | Target Priority: Alphion's unit Falls Back, then is eligible to shoot and to declare a charge that turn; Aggressors that Fell Back are not |
| DEA-008 | DEA-6.2 | Narthecium: Krenn leading a squad that lost a grenadier → at own `command.start` a choice among destroyed kinds + decline; pick grenadier → model returns in coherency with full 2 W and its grenade launcher (`ModelReturned`) |
| DEA-009 | DEA-6.2 | Narthecium not offered: Krenn unattached; squad at Starting Strength; opponent's Command phase; already used this Command phase; no legal spot → nothing returns |
| DEA-010 | DEA-6.3 | Close-quarters Firepower: Aggressor flamestorm vs the closest eligible enemy unit → AP −1; vs a farther unit → AP 0 |
| DEA-011 | DEA-4.1 | Hunters' Insight: at own `command.start` pick a No Man's Land marker; end of the opponent's next turn, own non-shocked Intercessors on it and controlled → +4 VP |
| DEA-012 | DEA-4.1, 4.4 | Hunters' Insight: markers in own deployment zone not offered; 0 VP when uncontrolled, when the only unit in range is Battle-shocked, or when the only unit in range is not ADEPTUS ASTARTES; pick cleared after scoring |
| DEA-013 | DEA-4.1 | Hunters' Insight timing: DW moving second picks in round 1 and scores at the end of the opponent's round-2 turn; a round-5 pick by the second player never scores; no score at the end of own turn |
| DEA-014 | DEA-4.2, 4.5 | Head-taker: Intercessors kill an attached enemy CHARACTER model → +5 VP; killing a non-CHARACTER model → 0; enemy CHARACTER dying to its own Hazardous → 0 |
| DEA-015 | DEA-4.3 | Head-taker sweep: at battle end every enemy CHARACTER destroyed → +5 VP; one CHARACTER alive → 0 |
| DEA-016 | DEA-5.1 | Veteran Instincts: after an enemy targets Intercessors in its Shooting phase → FNP 5+ until end of phase; on Aggressors (GRAVIS) → FNP 4+; offered in own Fight phase too; not offered in own Shooting phase |
| DEA-017 | DEA-5.2 | Special-Issue Ammunition set A: bolt rifle wound roll of unmodified 5 vs a VEHICLE is a critical wound; grenade launcher krak within half range gets +2 D; ends at phase end |
| DEA-018 | DEA-5.2 | Special-Issue Ammunition set B: bolt rifle after Advancing may shoot; target in cover gets no cover bonus; unmodified 6 to hit → 2 extra hits; not offered for a unit that already shot |
| DEA-019 | DEA-5.3 | Teleportarium: end of the opponent's Fight phase, unengaged Intercessors (with attached Alphion) → removed (`UnitRemovedFromBattlefield`); next own Movement Reinforcements step set-up 3.1" from enemies accepted, 2.9" rejected |
| DEA-020 | DEA-5.3 | Teleportarium: arrived unit cannot declare a charge that turn but can shoot; not offered for an engaged unit, in own turn, or a second time in the battle (once per battle) |
| DEA-021 | DEA-5.5 | Teleportarium arrival is mandatory: declining destroys the unit (`UnitLostInReserves`); DW moving second may arrive in round 1; a unit still off-board at battle end is destroyed |
| DEA-022 | DEA-6 | Astartes grenade launcher: frag profile Blast (D3 + 1 per 5 models vs a 10-model unit); krak S9 AP−2 DD3; the model picks one profile per shooting |
| DEA-023 | DEA-6 | Bolt rifle Assault + Heavy: shoots after Advancing (Assault); +1 to hit when stationary (Heavy) |
| DEA-024 | DEA-6 | Twin power fists Twin-linked: failed wound rolls may be re-rolled; flamestorm gauntlets auto-hit (Torrent), ignore cover, Twin-linked wound re-roll |
| DEA-025 | DEA-6 | Reductor pistol: legal only at ≤ 3"; Pistol may be fired while in Engagement Range |
| DEA-026 | E1 | Grey Knights regression: Teleport Assault records without `arrival` still use the 9" gap and allow a charge after arrival |

## BLA — Black Templars: Siguard's Crusaders (docs/spec/factions/black-templars.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| BLA-001 | BLA-1 | patrol `bt.cp.siguard-s-crusaders` loads: 4 units, 17 models; Siguard is WARLORD with Crusaders' Fervour, attached to the Crusader Squad; default secondary Path of Purgation; stratagems are the three `bt.s.*` ids; `black-templars` is a selectable faction |
| BLA-002 | BLA-6 | data: every stat / weapon row of §6 matches (Neophyte Sv 4+, Initiates and Sword Brother Sv 3+, Siguard invuln 4+ W5, Impulsor T9 W11 OC2); reused `sm.*` ids unchanged; SM patrols still load |
| BLA-003 | BLA-2.1 | Oath of Moment: a BT unit's attack against the Oath target re-rolls the hit roll (shared `sm.a.oath-of-moment`); BT v SM mirror keeps two separate Oath targets |
| BLA-004 | BLA-1.1 | Siguard may attach to the Intercessors or the Crusader Squad (either split half); attaching to the Impulsor is refused |
| BLA-005 | BLA-6.4 | Patrol Squads split → `crusader-squad-initiates` (5 Initiates: 2 chainsword, 2 bolt rifle, 1 pyreblaster) and `crusader-squad-brethren` (Sword Brother + 4 Neophytes), each Starting Strength 5; default unsplit |
| BLA-006 | BLA-6 | Scouts 6": unled Crusader Squad (or a half) is offered a Scouts move; Siguard + Crusaders combined is not |
| BLA-007 | BLA-3.1 | Crusaders' Fervour: Astartes chainsword makes 6 attacks, Siguard's master-crafted power weapon 7, Intercessors unaffected while Siguard leads the Crusaders; ranged weapons unchanged |
| BLA-008 | BLA-3.2 | Righteous Defiance: Siguard ignores a wound on 5+ (FNP); unit models without activation have no FNP |
| BLA-009 | BLA-3.3 | Righteous Defiance: opponent's unit targets Siguard's unit in Shooting → use/decline offer; use → every model FNP 4+ until phase end; never offered again in the battle; not offered when another unit is targeted |
| BLA-010 | BLA-3.3 | Righteous Defiance in the Fight phase: offered at `fight.targetsDeclared`; after expiry (next phase) FNP back to 5+ (Siguard) / none |
| BLA-011 | BLA-4.1 | Path of Purgation: battle end, Siguard wholly in enemy zone, not Battle-shocked → 10 VP; one base edge outside → falls back to 8 if any non-shocked ADEPTUS ASTARTES unit has a model partly inside |
| BLA-012 | BLA-4.1 | Path of Purgation: only Battle-shocked units inside → 0; only the Impulsor partly inside → 8; embarked unit inside the transport does not count on its own; nothing scored before battle end |
| BLA-013 | BLA-4.2 | Sacred Vow pick: no pick in round 1; at round 2 start the BT player picks a canonical enemy unit that is not destroyed; one pick per round |
| BLA-014 | BLA-4.3 | Sacred Vow score: vow target destroyed by an Intercessor melee attack → 3 VP at round end; by a Neophyte or Initiate melee attack → 4 VP; by shooting → 0; survives → 0 |
| BLA-015 | BLA-4.5 | Sacred Vow: Siguard (attached to the Crusaders) lands the killing melee blow → 3 VP; attached enemy target scores only when its last half dies; the enemy's own Hazardous kill → 0 |
| BLA-016 | BLA-5.1 | Shield of Zeal: opponent shoots the Crusader Squad from 5.9" → Initiates save on invuln 4+ vs AP−3, Neophytes on 5+; shooter 6.1" away → armour only; not offered in own Shooting phase |
| BLA-017 | BLA-5.1 | Shield of Zeal in either Fight phase: melee attacks against the targeted unit use the 4+ / 5+ invuln; Impulsor never an eligible target; expires at phase end |
| BLA-018 | BLA-5.2 | Hate-Fuelled Strength: own Shooting, unit not yet shot → hit rolls against the closest eligible target may re-roll; a farther target → no re-roll; unit that already shot → not offered; usable in the opponent's Fight phase on a unit not yet fought |
| BLA-019 | BLA-5.3 | Goaded to Fury: after an enemy unit shoots the Intercessors → offered; the unit moves up to 6" ending as close as possible to the shooter and outside Engagement Range; not offered for a unit the shooter did not target, nor in the BT player's own turn |
| BLA-020 | BLA-6.1 | Righteous Zeal: Crusader Squad Advance roll and Charge roll each offered a re-roll; Intercessors not |
| BLA-021 | BLA-6.3 | Transport: the 5 Intercessors embark (5/6); a 5-model Crusader half embarks; the unsplit 10-model squad is refused; Firing Deck 6 lets embarked models' bolt rifles fire from the Impulsor |
| BLA-022 | BLA-6.2 | (E-BT2) Assault Vehicle: Impulsor Advances, then the passengers disembark (counts as a Normal move, no further move, charge declaration refused); after a Fall Back → no disembark; a Sororitas Rhino after an Advance still refuses |
| BLA-023 | BLA-6.3 | (E-BT3) Siguard leading the Intercessors (6 models) embarks as one unit, occupies 6/6 capacity, disembarks together wholly within 3" and stays attached; Siguard + unsplit Crusaders (11) refused |
| BLA-024 | BLA-6 | weapons: plasma pistol supercharge Hazardous (roll 1 → Siguard, a CHARACTER, takes 3 mortal wounds); multi-melta Melta 2 within 9" (+2 D); bolt rifle Assault + Heavy; storm bolters Rapid Fire 2 at half range → 4 shots each; Impulsor Deadly Demise D3 |
| BLA-025 | E-BT1 | Condition `targetModelKeyword`: true at the save of a model with the keyword, false for other models of the same unit and when no target model is known; existing conditions unchanged |

## DAR — Dark Angels: Mordekai's Judgement (docs/spec/factions/dark-angels.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| DAR-001 | DAR-1 | patrol `da.cp.mordekais-judgement` loads (faction `dark-angels`): 4 units, 10 models; Mordekai is WARLORD with Stoic Exemplar, attached to the Intercessor Squad; default secondary Endless Hunt; stratagems are the three `da.s.mj-*` ids; the start screen lists Dark Angels as its own faction |
| DAR-002 | DAR-1.4, 6 | data: every stat/profile row of §6 matches; every datasheet has faction keywords ADEPTUS ASTARTES + DARK ANGELS; reused `sm.w.bolt-pistol` / `sm.w.close-combat-weapon` / `sm.w.power-weapon` and all SM patrols load unchanged |
| DAR-003 | DAR-2.1 | Oath of Moment: an Intercessor bolt rifle attack vs the Oath target re-rolls a failed hit; SM-vs-DA game keeps one Oath target per player |
| DAR-004 | DAR-6.1 | Litany of Hate: Mordekai leading Intercessors → their melee wound rolls +1 (close combat weapon S4 vs T4 wounds on 3+); ranged attacks unaffected; Mordekai unattached → no bonus |
| DAR-005 | DAR-3.1 | Stoic Exemplar: enemy unit charges Mordekai's unit → that turn every enemy melee attack against it −1 to wound (including a second enemy unit that did not charge); ranged attacks unaffected |
| DAR-006 | DAR-3.1 | Stoic Exemplar not active: no charge this turn (fight in a later turn); enemy charged a different unit; enemy charge failed; next turn the effect is gone |
| DAR-007 | DAR-3.1, E1 | Stoic Exemplar via Heroic Intervention: in the DA turn, an enemy unit heroically intervenes into Mordekai's unit → enemy melee attacks −1 to wound that Fight phase; `chargersIntoThisTurn` stale log from a previous turn returns [] |
| DAR-008 | DAR-3.2 | Zealous Wrath: Mordekai + Intercessors Advance → re-roll offer; charge roll that falls short is re-rolled; a die already re-rolled (Command Re-roll) is never re-rolled again |
| DAR-009 | DAR-4.1 | Endless Hunt: round 2, end of own turn, Intercessors on a controlled No Man's Land marker → 3 VP; on a controlled marker in the opponent's zone → 5 VP (not 8 when both); marker in own zone → 0; Mordekai attached, only Mordekai's model within range of a controlled No Man's Land marker → 3 VP (the combined unit is an INTERCESSOR SQUAD unit); attached Mordekai alone in range of a controlled marker in the opponent's zone → 5 VP |
| DAR-010 | DAR-4.1 | Endless Hunt: round 1 → 0; Intercessors Battle-shocked → 0; attached unit with either half Battle-shocked → 0; marker in range but controlled by the opponent → 0; Inceptors on the marker (no Intercessors) → 0; end of the opponent's turn → 0 |
| DAR-011 | DAR-4.2 | Archeotech Reliquary: start of round 1 the OPPONENT gets a `chooseOption` listing every live marker; DA controls it at battle end → 10 VP; does not → 0 |
| DAR-012 | DAR-4.2 | Archeotech Reliquary: the picked marker is later removed by a mission rule → 0; no pick offered in rounds 2–5; Endless Hunt chosen → no pick at all |
| DAR-013 | DAR-5.1 | Unyielding: own Command phase, Intercessors OC 2 → 3 through the opponent's turn, back to 2 at the next own Command phase; Mordekai alone and the Redemptor are not offered |
| DAR-014 | DAR-5.2 | March of Vengeance: Intercessors Fall Back → offered; used → eligible to shoot in that Shooting phase; if they did not shoot they may declare a charge |
| DAR-015 | DAR-5.2, E2 | March of Vengeance: after the unit shot this turn it is not eligible to charge; not offered after a Normal move or Advance, nor for the Redemptor; expires at end of turn; `shotThisTurn` ignores Overwatch |
| DAR-016 | DAR-5.3 | Relic Munitions: opponent targets Intercessors standing on a marker DA controls → offered; used → Benefit of Cover against every attack that phase (+1 save vs AP 0 per R-6 cover rules); Ignores Cover weapons bypass it |
| DAR-017 | DAR-5.3 | Relic Munitions not offered: unit not within range of a controlled marker; marker controlled by the opponent; untargeted unit; Redemptor (not INFANTRY); expires at the end of the phase |
| DAR-018 | DAR-5.4 | Keywords: unattached Mordekai (no INFANTRY on the CP card) is not a legal target for Unyielding / March of Vengeance / Relic Munitions / Go to Ground; attached Mordekai + Intercessors is |
| DAR-019 | DAR-6.2 | Redemptor at 4 wounds remaining: its hit rolls −1 (gatling cannon hits on 4+); at 5 wounds no penalty |
| DAR-020 | DAR-6 | Redemptor Deadly Demise D3: destroyed → roll D6; on a 6, D3 mortal wounds to each unit within 6" |
| DAR-021 | DAR-6 | Macro plasma incinerator: choose standard or supercharge per shooting; supercharge Hazardous 1 → Redemptor takes 3 mortal wounds; Blast adds +1 A per 5 target models |
| DAR-022 | DAR-6 | Icarus rocket pod: unmodified wound 2 vs a FLY unit is a critical wound; onslaught gatling cannon critical wounds become mortal wounds (Devastating Wounds) |
| DAR-023 | DAR-6 | Inceptors: Deep Strike from round 2 only (>9" from enemies); assault bolters Pistol — may shoot while in Engagement Range; Twin-linked re-rolls wound rolls; Sustained Hits 2 → 2 extra hits on a critical hit |
| DAR-024 | DAR-6 | Intercessor bolt rifle: Assault (may shoot after Advancing) and Heavy (+1 to hit when stationary) |
| DAR-025 | E1, E2 | Regression: storing `chargeLog` / `shotLog` in `mission.custom` leaves existing mission custom keys and replay hashes deterministic (same seed + actions → same hash) |

## DRU — Drukhari: The Blades of Torment (docs/spec/factions/drukhari.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| DRU-001 | DRU-1 | patrol `drk.cp.blades-of-torment` loads (faction `drukhari`): 5 units, 18 models; Archon is WARLORD with Shudderworm Bottle, attached to the Kabalite Warriors; default secondary Rapacious Raiders; stratagems are the three `drk.s.*` ids; start screen lists Drukhari |
| DRU-002 | DRU-6 | data: every stat/profile row of §6 matches (incl. splinter cannon BS 4+, Klaivex W2, Archon 2+ invuln); every datasheet has faction keyword DRUKHARI and keyword AELDARI; Raider transport capacity 11 DRUKHARI INFANTRY, Firing Deck 11 |
| DRU-003 | DRU-2.1, E1 | Pain pool: each Drukhari player starts the battle with 1; +1 when an enemy unit is destroyed (each half of an attached unit counts); +1 when an enemy unit fails a Battle-shock test; own unit destroyed or enemy passing the test → no gain; non-Drukhari opponent has no pool |
| DRU-004 | DRU-2.2, 2.5 | Empower offer: at the start of the Movement / Shooting / Charge / Fight phase (either turn) a player with tokens gets a chooseOption listing own on-board units + Keep tokens; none at command.start; 0 tokens → no offer; a unit Empowered this phase is not listed again; spending decrements the pool; both players are offered in a mirror match |
| DRU-005 | DRU-2.4 | Empowered in own Shooting phase: Kabalite rifle misses are re-rolled; in the opponent's Fight phase an Empowered unit fighting back re-rolls hits; non-Empowered unit does not; expires at end of phase |
| DRU-006 | DRU-2.3 | Empowered in Movement phase: Advance roll re-roll offered; in Charge phase: a short Charge roll is re-rolled; Empowered in the opponent's Movement phase and firing Overwatch → no hit re-roll |
| DRU-007 | DRU-3.1 | Shudderworm Bottle: Archon leading Kabalites → each Kabalite and the Archon roll FNP 5+ per lost wound; Archon detached → no FNP for anyone |
| DRU-008 | DRU-3.2 | Spiteful Predator: Archon's unit Falls Back → may shoot and may declare a charge that turn; without the enhancement → neither |
| DRU-009 | DRU-4.1 | Rapacious Raiders: end of own turn, Kabalites wholly in the opponent's zone → 4 VP; only the Ravager wholly in → 3 VP; Raider + Incubi both in → 4 (not 7); one model straddling the line → 0 |
| DRU-010 | DRU-4.1 | Rapacious Raiders: qualifying unit Battle-shocked → 0; attached unit with either half Battle-shocked → 0; unit embarked in a Raider that is in the zone → only the Raider counts (3 VP); end of the opponent's turn → 0; Necrons Reclaim and Dominate / CSM Idolatrous Despoilers amounts unchanged |
| DRU-011 | DRU-4.2 | Murderous Monster: Archon kills an enemy model in the Fight phase (either turn) → 3 VP at the end of that phase; kills in two Fight phases → 3 + 3 |
| DRU-012 | DRU-4.2 | Murderous Monster: only Kabalites kill → 0; Archon kills in the Shooting phase only → 0 at end of Shooting and 0 at end of the following Fight phase (no leak); Rapacious Raiders chosen → never scores |
| DRU-013 | DRU-5.1 | Quicksilver Reactions: opponent's Shooting phase, enemy targets Kabalites → offered; used → every attack on them −1 to hit until end of phase; in the Drukhari's own Fight phase an enemy unit targets Incubi → offered |
| DRU-014 | DRU-5.1 | Quicksilver Reactions not offered: Drukhari's own Shooting phase; untargeted unit; Raider/Ravager (not INFANTRY); second use in the same phase |
| DRU-015 | DRU-5.2 | Many Cuts: own Shooting phase, Kabalites not yet shot → offered; vs a target below Starting Strength the splinter rifles get Sustained Hits 1 (a critical hit → 1 extra hit); vs a full-strength target → none; splinter cannon SH1 does not become SH2 |
| DRU-016 | DRU-5.2 | Many Cuts in the Fight phase of either turn for Incubi not yet fought → offered; not offered for a unit that already shot / fought this phase, nor in the opponent's Shooting phase |
| DRU-017 | DRU-5.3, E3 | There and Gone: end of the opponent's Fight phase, Incubi wholly within 3" of the Raider and out of ER → offered; used → Incubi embarked (location reserves, linked to the Raider); next own Movement phase they may disembark |
| DRU-018 | DRU-5.3 | There and Gone not offered: unit in Engagement Range; a model more than 3" from the transport; capacity short (Kabalites 10 + Incubi 5 > 11); own Fight phase; Ravager as transport (not TRANSPORT) |
| DRU-019 | E3 | Attached transport: Archon + Kabalites (11 models) embark after a Normal move and via There and Gone; both halves leave the board together and disembark together within 3"; may start embarked at setup; Firing Deck 11 lists weapons of both halves; Raider destroyed → both halves emergency-disembark; attach link kept |
| DRU-020 | DRU-6.1, E2 | Shadowfield: Archon invulnerable 2+ used vs AP −1; a failed invuln save cannot be Command Re-rolled; after the first failure later saves use Sv 4+ (with AP) for the rest of the battle; a failed armour save or a mortal wound does not consume it |
| DRU-021 | DRU-6.2 | Tormentors: start of the Fight phase (either turn), each enemy unit in Engagement Range of the Incubi takes one Battle-shock test; a failure gives the Drukhari player a Pain token; units not in ER are not tested |
| DRU-022 | DRU-6.3 | Ravager at 4 wounds remaining: hit rolls −1 (dark lance hits on 4+); at 5 → no penalty |
| DRU-023 | DRU-6.4 | Raider: Firing Deck 11 — embarked Kabalites' rifles fire through the Raider; non-DRUKHARI or non-INFANTRY units cannot embark |
| DRU-024 | DRU-6 | Splinter weapons: Anti-INFANTRY 3+ — unmodified wound 3 vs INFANTRY is a critical wound (wounds T3–T10 alike); vs VEHICLE wounds as S2 |
| DRU-025 | DRU-6 | Shredder Torrent auto-hits D6 attacks; Klaivex picks single or dual demiklaive profile per fight, dual is Twin-linked; dark lance damage D6+2 |
| DRU-026 | DRU-6.5 | Raider / Ravager Deep Strike from round 2 only (>9" from enemies); Deadly Demise D3 on destruction |
| DRU-027 | E1 | Regression: Pain pool and Empowered record in `secondaryState` keep replay hashes deterministic (same seed + actions → same hash); non-Drukhari games create no `painTokens` key |

## LEA — Leagues of Votann: Warspeke's Prospect (docs/spec/factions/leagues-of-votann.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| LEA-001 | LEA-1 | patrol loads: 4 units, 19 models; Kâhl is WARLORD with Waste Feeds the Void, attached to Hearthkyn; default secondary Toil Earns |
| LEA-002 | LEA-1.2 | Patrol Squads: split offered at Declare Battle Formations; split → two 5-model units with the LEA-1.2 parts, Kâhl attached to `hearthkyn-a` |
| LEA-003 | LEA-2.1 | enemy shooting destroys the Beserks → that enemy unit gets 1 Judgement token (`AbilityTriggered`) |
| LEA-004 | LEA-2.1 | a second LoV unit destroyed by the same enemy → 2 tokens; a third → still 2 |
| LEA-005 | LEA-2.1 | a LoV unit dying to its own Hazardous / lost in Reserves → no token anywhere |
| LEA-006 | LEA-2.1 | Deadly Demise of an enemy model destroys a LoV unit → token on the exploding model's unit (RC-072) |
| LEA-007 | LEA-2.2 | Hearthkyn ion blaster vs a 1-token target: hit roll +1 (3 on the die hits), wound roll unmodified |
| LEA-008 | LEA-2.2 | vs a 2-token target: +1 hit and +1 wound; vs a 0-token unit: no modifier; Heavy +1 plus token +1 still capped at +1 to hit |
| LEA-009 | LEA-2.3 | attached enemy pair gains a token; its bodyguard is later wiped → the surviving leader still has the token |
| LEA-010 | LEA-2.3 | an enemy unit with tokens goes to Reserves and returns → tokens kept |
| LEA-011 | LEA-2.4 | mirror match: tokens are per player — player A's tokens on B's unit do not modify B's attacks |
| LEA-012 | LEA-6.1 | Grim Efficiency: own Command phase, Kâhl on board → `chooseOption` over visible enemy units only; pick → +1 token; not offered in the opponent's Command phase or when the Kâhl is dead |
| LEA-013 | LEA-6.1 | Grim Efficiency on a 2-token unit → stays 2 |
| LEA-014 | LEA-3 | Waste Feeds the Void: Hearthkyn ranged hit roll of 1 re-rolled; melee 1s not re-rolled; Pioneers (not the bearer's unit) not re-rolled |
| LEA-015 | LEA-3 | Waste Feeds the Void: led Hearthkyn Fall Back then shoot (legal); cannot declare a charge |
| LEA-016 | LEA-3 | Prâgmaat Comms Uplink: Hearthkyn OC 2 → 3, Kâhl OC 1 → 2; failed Battle-shock test may be re-rolled |
| LEA-017 | LEA-4.1 | Toil Earns: pick offered after Patrol Squads, before the first deployUnit; markers inside own DZ excluded |
| LEA-018 | LEA-4.1 | Toil Earns: control the marker at end of own round-1 turn → 0 VP; at end of own round-2 turn → 4 VP; at end of opponent's turn → nothing |
| LEA-019 | LEA-4.2 | Holy Apparatus: no pick in round 1; round-2 start pick lists only enemy units with ≥1 token; none → no decision, 0 VP |
| LEA-020 | LEA-4.2 | Holy Apparatus: target destroyed during the round (any means) → 4 VP at round end; survives → 0; attached target with one half alive → 0 |
| LEA-021 | LEA-5 | Payment in Kind: offered just after an enemy attack destroys the last Hearthkyn; used → for the rest of the battle LoV hit rolls of 1 vs the killer's unit are re-rolled; not vs other units |
| LEA-022 | LEA-5 | Payment in Kind not offered when the LoV unit died to Hazardous or to a non-attack effect |
| LEA-023 | LEA-5 | Pan-Spectral Sweep: own Shooting phase, unit not yet shot → ranged weapons gain Lethal Hits (critical hit auto-wounds) until phase end; not offered for a unit that already shot |
| LEA-024 | LEA-5 | Skeinwrought Physiology: opponent's Shooting after targets declared → Hearthkyn save 4+ → 3+, Kâhl 3+ → 2+, invuln 4+ unchanged; expires at phase end |
| LEA-025 | LEA-6.2 | Medipack: Hearthkyn and attached Kâhl get FNP 6+ while the medipack Warrior lives; gone once he dies; after a split only his half has it |
| LEA-026 | LEA-6.2 | Pan-Spectral Scanner: Hearthkyn ranged attacks ignore the target's cover while the scanner Warrior lives |
| LEA-027 | LEA-6.3 | Mag-Riders: end of opponent's round-2 turn, Pioneers within 6" of an edge and not engaged → offered; round 1 → not offered; engaged or > 6" from every edge → not offered |
| LEA-028 | LEA-6.3 | Mag-Riders arrival: next own Reinforcements step, mandatory; legal spots wholly within 6" of a non-opponent edge and > 9" from enemies; a spot in the opponent's edge strip (away from the side edges) rejected |
| LEA-029 | LEA-6.3 | Mag-Riders: arrival allowed in round 4; unit not culled at end of round 3; declining the set-up destroys it; removed at end of the battle's last turn → counts as destroyed |
| LEA-030 | LEA-6.3 | Mag-Riders go into plain Reserves (not Strategic Reserves, so no CP-1.9 round window or cull); arrival emits `ReinforcementsArrived{via:'strategicReserves'}` (cosmetic label only); Rapid Ingress is not offered for it |
| LEA-031 | LEA-6.4 | Cyberstimms: Beserk destroyed by a melee attack before its unit fought, D6 = 4 → stays, fights once after the attacker finishes, then removed; D6 = 3 → removed at once |
| LEA-032 | LEA-6.4 | Cyberstimms: no roll once the Beserks have fought this phase; no roll for a model destroyed by a ranged attack; works in both players' Fight phases |
| LEA-033 | LEA-6.5 | mole-launcher Beserk has W 3, axe strike A4 / sweep A7, launcher D6+1 (Blast, Indirect Fire); other Beserks W 2, A3 / A6 |
| LEA-034 | LEA-6 | Beserks FNP 5+ against every wound; Pioneers Scouts 9" pre-battle move; Pioneers cannot be targeted by Go to Ground (MOUNTED) |
| LEA-035 | LEA-6 | magna-rail rifle: Heavy (+1 hit when stationary), D3+3 damage, Devastating Wounds on a critical wound; volkanite disintegrator Devastating Wounds |
| LEA-036 | LEA-6 | HYLas auto rifle Rapid Fire 3 at half range → A6, Assault (shoot after Advance); HYLas rotary cannon Sustained Hits 1; twin concussion gauntlet Twin-linked |
| LEA-037 | E1 | Regression: storing tokens in `secondaryState['lov:judgement']` keeps replay hashes deterministic (same seed + actions → same hash) and does not alter non-LoV games |

## AEL — Aeldari: The Fatebreakers (docs/spec/factions/aeldari.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| AEL-001 | AEL-1 | patrol `ael.cp.the-fatebreakers` loads (faction `aeldari`): 4 units, 19 models; Farseer is WARLORD with Foresight, attached to Guardian Defenders; default secondary Ineffable Agenda; stratagems Whip-fast Reactions, Storm of Shots, Zephyr-swift |
| AEL-002 | AEL-1, 6 | data: every stat/profile row of §6 matches; Heavy Weapon Platform OC 0, W 2, 40 mm; Wraithlord has two shuriken catapult weapons and no Strands of Fate |
| AEL-003 | AEL-2.1 | round 1 start: 12 D6 rolled for the Aeldari player; `reroll` → 11 fresh dice replace the set; `keep` → pool = those values, one `MiracleDieGained` per die |
| AEL-004 | AEL-2.1 | re-rolling down to 1 die ends the choice automatically with a 1-die pool; the opponent (non-Aeldari) gets no pool and no decision |
| AEL-005 | AEL-2.2 | hit substitution: Fate die 6 replaces one shuriken catapult hit die → unmodified 6 (critical), die leaves the pool, `MiracleDieSpent` mode substitute; option label says "Fate" |
| AEL-006 | AEL-2.2 | save substitution: Guardians targeted, Fate die 5 used on one save die vs AP −1 → succeeds as unmodified 5 then modified 4 vs 4+ |
| AEL-007 | AEL-2.2 | charge substitution: Fate die replaces one of the 2D6 of a Windriders charge; Battle-shock: one of the 2D6 replaced |
| AEL-008 | AEL-2.3 | the same unit can use Fate dice on several rolls in one phase (no Acts-of-Faith cap); at most one die per individual roll (2D6 charge / Battle-shock: 1); a 10-attack shuriken catapult hit batch accepts two Fate dice in one decision (two attacks' hit dice replaced, both dice leave the pool, both `MiracleDieSpent` events) while a Sororitas batch still caps at 1 |
| AEL-009 | AEL-2.4 | a substituted die is not offered to Command Re-roll; no `miracleDie` offer for Eldritch Storm's D3 Damage, D6 attack count, Hazardous, Deadly Demise or Fortune's D6 |
| AEL-010 | AEL-2.5 | Wraithlord attacks / saves never raise a `miracleDie` decision even with a non-empty pool; Sororitas Acts of Faith behaviour unchanged (ADE tests still pass) |
| AEL-011 | AEL-3 | Foresight: bearer's unit offered Fire Overwatch at 0 CP with 0 CP in the pool; a second Overwatch the same turn is refused (once per turn) |
| AEL-012 | AEL-3 | Foresight: Overwatch by Farseer+Guardians on a controlled marker hits on unmodified 4+, off it on 5+; criticals only on 6; without the enhancement 6s only |
| AEL-013 | AEL-3 | Eldritch Might: Eldritch Storm re-rolls hit 1s, wound 1s and a D3 Damage result of 1; shuriken pistol attacks and Guardian attacks get no re-roll |
| AEL-014 | AEL-4 | Ineffable Agenda: end of own turn, Aeldari take a marker outside their zone held by the opponent (or nobody) at turn start → +3 VP; a marker they already held → 0; a newly taken marker inside their own zone → 0 |
| AEL-015 | AEL-4 | Ineffable Agenda: two newly taken markers → still 3 VP; end of the opponent's turn → 0 |
| AEL-016 | AEL-4 | A Greater Destiny: battle end with Windriders wholly in the enemy zone → +10 VP; one model outside → 0; Battle-shocked → 0 |
| AEL-017 | AEL-5 | Whip-fast Reactions: opponent targets Windriders with shooting → used → enemy attacks vs them −1 to hit (ranged and, in a Fight phase, melee); not offered for the Wraithlord; expires at phase end |
| AEL-018 | AEL-5 | Storm of Shots on Guardian Defenders: +1 to hit (shuriken catapult hits on 2+); with a −1 source the ±1 cap nets 0 |
| AEL-019 | AEL-5 | Storm of Shots after a Windriders split: first squad targeted, the second offered and accepted → both +1 to hit; INFANTRY target → no second pick; Wraithlord not a legal target |
| AEL-020 | AEL-5 | Zephyr-swift: Guardians make a Normal move up to 6" in own Shooting phase, may then shoot (not yet shot), cannot declare a charge that turn |
| AEL-021 | AEL-5, E5 | Zephyr-swift with two Windrider squads: two reactive moves run one after the other; a unit in Engagement Range is not offered; the move does not change Remained-Stationary status |
| AEL-022 | AEL-6.1 | Fortune: own Command phase, D6 = 1 → nothing; D6 = 4 → Windriders within 12" chosen → enemy wound rolls vs them −1 until the start of the next own Command phase; a unit 12.1" away is not offered |
| AEL-023 | AEL-6.1 | Fortune: the Farseer's own unit is a legal pick; the effect expires at the next own turn start |
| AEL-024 | AEL-6.3 | Defenders of Fate: end of own Command phase, Guardians on one controlled marker → D6 rolled and added to the pool with that value (a 1 is added too); two markers → two dice; no controlled marker → none |
| AEL-025 | AEL-6.4 | Crewed Platform: last Guardian Defender destroyed → the Heavy Weapon Platform is removed at once, unit destroyed, kill credited to the attacker; attached Farseer survives and operates alone |
| AEL-026 | AEL-6.4 | Crewed Platform: platform destroyed while Guardians live → nothing else happens; Guardians die one by one while ≥1 lives → platform stays |
| AEL-027 | AEL-6.5 | Swift Demise: Windriders shoot the closest eligible enemy → hit 1s re-rolled; a farther target → no re-roll |
| AEL-028 | AEL-6.5, E4 | Swift Demise: closest target on a marker the opponent controls → any failed hit re-rolled; a marker the Aeldari control or an uncontrolled one → 1s only |
| AEL-029 | AEL-6.6 | Patrol Squads: split at Declare Battle Formations gives two units of 3, each with one scatter laser; Starting Strength 3 each; default unsplit |
| AEL-030 | AEL-6 | Farseer Leader: attaches only to Guardian Defenders; Precision-free attacks vs the attached unit allocate to Guardians first |
| AEL-031 | AEL-6.7 | Wraithlord destroyed → Deadly Demise: on a 6, 1 mortal wound to each unit within 6" |
| AEL-032 | AEL-6 | weapons: Eldritch Storm Blast adds +1 A per 5 target models; twin shuriken catapult Twin-linked wound re-roll; shuriken pistol usable in Engagement Range; Assault weapons usable after Advancing |
| AEL-033 | AEL-6 | Wraithlord fires both shuriken catapults at two different targets; ghostglaive strike or sweep chosen per fight |
| AEL-034 | AEL-6 | Windriders M 14 with FLY move over models; Heavy Weapon Platform OC 0 adds nothing to objective control |

## ADM — Adeptus Mechanicus: Purge Corps Deltic-9 (docs/spec/factions/adeptus-mechanicus.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| ADM-001 | ADM-1 | patrol `adm.cp.purge-corps-deltic-9` loads (faction `adeptus-mechanicus`): 4 units, 19 models; Skand is WARLORD with Aspergilla of Tarentum, attached to the Skitarii Vanguard; default secondary Targeted Purge; stratagems are the three `adm.s.pcd-*` ids; the start screen lists Adeptus Mechanicus |
| ADM-002 | ADM-6 | data: every stat/weapon row of §6 matches; every datasheet has faction keyword ADEPTUS MECHANICUS and a 5+ invuln; Skand has no Doctrina ability; Skand's only bodyguard is the Vanguard |
| ADM-003 | ADM-2.1 | start of every battle round: the AdMech player gets a `chooseOption` Protector/Conqueror (no pass); the choice is stored for that round only; a player without Doctrina units is not asked; AdMech mirror → both players asked, first player first |
| ADM-004 | ADM-2.2–2.3 | Protector: Vanguard radium carbines have HEAVY (stationary → +1 to hit); Conqueror: they have ASSAULT (may shoot after Advancing); under Protector an Advanced Vanguard cannot shoot |
| ADM-005 | ADM-2.2, 2.4 | Protector: enemy AP −1 ranged attack vs Vanguard partly in own DZ → AP 0 at the save; AP 0 stays 0; Vanguard wholly outside its DZ → AP unchanged; melee attack → unchanged; the Vanguard's own weapon profile (no attack context) is never modified |
| ADM-006 | ADM-2.3, 2.4 | Conqueror: radium carbine (AP 0) vs a target with one model partly in the enemy DZ → AP −1; target wholly outside → AP 0; melee unchanged |
| ADM-007 | ADM-2.5, 2.6 | Doctrina expires at the end of the round (round 2 effects need the round-2 choice); Skand alone: no HEAVY/ASSAULT; Skand attached: attacks vs the combined unit in own DZ get the Protector AP penalty; Conqueror (−1) vs Protector (+1 cap 0) mirror: AP −1 weapon vs Protector unit in DZ → −1 |
| ADM-008 | ADM-3 | Aspergilla: S3 attack vs Skand + Vanguard (T3) wounds on 5+ instead of 4+, ranged and melee; Skand alone also; Sulphurhounds unaffected; ±1 cap holds with another −1 |
| ADM-009 | ADM-3 | Overcharged Electropositors: Vanguard radium carbine range 24" (target at 23.5" legal, 24.5" not), Ignores Cover (no cover bonus); melee unchanged; other units unchanged |
| ADM-010 | ADM-6.1 | Galvanic Field: Skand leading → an unmodified hit 6 from a Vanguard radium carbine or close combat weapon auto-wounds; Skand detached / alone → no Lethal Hits; Sulphurhounds never |
| ADM-011 | ADM-4.1 | Targeted Purge: start of round 1 the OPPONENT gets a `chooseOption`; MONSTER/VEHICLE units (and an attached pair with such a half) are not listed; the picked unit destroyed at battle end → 12 VP; alive → 0; still in Reserves at the end → 12 |
| ADM-012 | ADM-4.1 | Targeted Purge: answering with a VEHICLE unit id is rejected; opponent with only MONSTER/VEHICLE units → no pick, 0 VP; Prescribed Excoriation chosen → no pick; Ethereal Edict still lists every unit (regression) |
| ADM-013 | ADM-4.2 | Prescribed Excoriation: round 1 → 0; round 2 end of own turn, closest enemy 6.5" from the DZ → 5 VP; enemy 4" from the DZ but outside it → 3 VP; enemy model partly inside the DZ → 0; end of the opponent's turn → 0 |
| ADM-014 | ADM-4.2 | Prescribed Excoriation: the only enemy unit inside the DZ is Battle-shocked → 5 VP (if nothing else within 6"); embarked / Reserves enemy units ignored; attached enemy pair with one half Battle-shocked → ignored |
| ADM-015 | ADM-5.1 | An Evaluation of Mettle: opponent shoots the Vanguard → offered; used → each lost wound (mortal wounds too) ignored on a 5+; expires at the end of the phase; offered in the Fight phase of either turn; not offered in own Shooting phase or for an untargeted unit |
| ADM-016 | ADM-5 | Optimised Efficiency: Sulphurhounds Fall Back → offered; used → eligible to shoot and to declare a charge that turn; not offered after a Normal move or Advance, nor for a unit other than the one that just fell back; expires at end of turn |
| ADM-017 | ADM-5.2 | Acceptable Risk Ratio: own Shooting, Vanguard not yet shot → radium carbine AP −1, supercharge caliver AP −4; after shooting, Hazardous test per firing model: a 1 destroys a Vanguard model, Skand rolling a 1 takes 3 mortal wounds; not offered for a unit that already shot or in the opponent's turn |
| ADM-018 | ADM-6.2 | Rad-saturation: enemy INFANTRY with OC 2 within 3" of the Vanguard counts 1 OC per model on a marker; OC 1 model → 0; enemy VEHICLE unaffected; enemy at 3.1" unaffected; friendly units unaffected |
| ADM-019 | ADM-6.3 | Line-breakers: 3 Sulphurhounds end a charge in ER of one enemy, started 8" from the Vanguard → 3 D6, each 4+ = 1 mortal wound; started 5" from the Vanguard → +2 per die (2+ succeeds); two enemies in ER → owner chooses one |
| ADM-020 | ADM-6.3, 6.5 | Line-breakers: failed charge → no roll; a Sulphurhound not in ER of the chosen unit rolls no die; only Skand (not BATTLELINE) within 6" at the start → no bonus; Heroic Intervention charge move still triggers it |
| ADM-021 | ADM-6.4 | Searing Conflagration: phosphor torch vs enemy on an objective → wound roll 1 re-rolled, a failed 2 not; Pteraxii within 6" of the Vanguard → any wound roll may be re-rolled (re-roll offer); target not on an objective → no re-roll; flechette blaster / taser goad → no re-roll |
| ADM-022 | E-ADM1 | Condition `friendlyKeywordWithin`: true at 5.9" from another friendly BATTLELINE unit, false at 6.1"; a BATTLELINE holder does not satisfy it by itself; enemy BATTLELINE never counts; existing conditions unchanged |
| ADM-023 | ADM-6 | Skand / Vanguard weapons: transonic cannon auto-hits D6 times, a wound 6 is a 2-damage mortal (Devastating Wounds); arc rifle Rapid Fire 1 at half range → 2 shots, Anti-Vehicle 4+; radium carbine Anti-Infantry 4+ crit on a 4; plasma caliver supercharge Hazardous |
| ADM-024 | ADM-6.6 | Sulphurhound weapons: sulphur breath (Torrent, Pistol) fires while in Engagement Range; the carbine model fires either its pistols or the carbine, never both; carbine Blast +2 A vs a 10-model unit (+1 per 5 models, rounded down); arc maul (Extra Attacks) adds 1 attack alongside the clawed limbs |
| ADM-025 | ADM-6 | Pteraxii: Deep Strike from round 2 more than 9" from enemies; FLY moves over models; taser goad Sustained Hits 2 → 2 extra hits on a 6; Alpha's flechette blaster (Pistol) fired in Engagement Range |
| ADM-026 | ADM-2.1, 4.1 | AI: Doctrina AI picks Conqueror only when an enemy unit in its own DZ is within 18" of a Doctrina unit, else Protector; Targeted Purge AI picker chooses the highest sum(W)×T eligible unit; a full AI-vs-AI game with this patrol finishes without a stuck decision |

## DTG — Death Guard: The Shambling Horde (docs/spec/factions/death-guard.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| DTG-001 | DTG-1 | patrol loads: faction `death-guard`, 6 units, 39 models (1+1+7+10+10+10); Typhus is WARLORD with Walking Plague, attached to `poxwalkers-a`; Grelch attached to Plague Marines; default secondary Contaminate Ground |
| DTG-002 | DTG-1.2 | Typhus may instead lead `poxwalkers-b` or `-c` (pre-game), never Plague Marines; Grelch may lead only Plague Marines |
| DTG-003 | DTG-6 | data: every stat/profile row of §6 matches (Typhus T6 2+ 4++ W6 base 50 mm; Poxwalkers Sv 7+ Ld 8+ M4; Plague Marines OC 2; manreaper strike 5A S9 AP−2 D3 / sweep 10A S6 AP−1 D1; spewer D6 Torrent Anti-Infantry 2+) |
| DTG-004 | DTG-2.1 | Contagion Range is 3" in round 1, 6" in round 2, 9" in rounds 3–5 (`contagionRange`) |
| DTG-005 | DTG-2.2 | round 1: enemy T4 unit 2.9" from Plague Marines → wound rolls against it use T3; at 3.1" → T4 |
| DTG-006 | DTG-2.3 | enemy within range of three DG units → T reduced by 1 only; a T1 target stays T1 |
| DTG-007 | DTG-2.4 | enemy moves out of range mid-turn → T restored immediately; an attached enemy unit with one half in range → both halves at −1 T |
| DTG-008 | DTG-2.5 | DG unit in Reserves projects no Contagion Range; aura never affects friendly units |
| DTG-009 | DTG-3 | Walking Plague: Command phase, Poxwalkers unit with 4 destroyed models within range, D6 = 6 → 4 return (cap at Starting Strength), at full W, in coherency, not newly in Engagement Range |
| DTG-010 | DTG-3 | Walking Plague: Poxwalkers unit outside the bearer's Contagion Range or at full strength → not offered; no candidate → no decision; offered once per Command phase, before Battle-shock tests |
| DTG-011 | DTG-3 | Walking Plague: no legal spot for a returned model → it and the remaining returns are lost; a wholly destroyed Poxwalkers unit cannot be picked |
| DTG-012 | DTG-3 | Miasmic Arrival: Typhus + Poxwalkers may be set up in Reserves and arrive by Deep Strike (round 2+, >9" from enemies); without it, the attached pair cannot go into Deep Strike Reserves |
| DTG-013 | DTG-4 | Contaminate Ground: round 1 → 0 VP; round 2 end of own turn, Plague Marines model 2.9" from centre → +3 VP; 3.1" → 0; two units in → still 3 VP |
| DTG-014 | DTG-4 | Contaminate Ground: the only unit near the centre is Battle-shocked → 0 VP; opponent's turn end → no score |
| DTG-015 | DTG-4 | Spread the Blight: enemy unit within Contagion Range at the start of the Fight phase, destroyed by Poxwalkers that phase → +2 VP; two such kills → +4 VP |
| DTG-016 | DTG-4 | Spread the Blight: enemy that moved into range during the phase (outside at phase start) → no VP; enemy that arrived by Deep Strike this phase → no VP |
| DTG-017 | DTG-5 | Corrosive Effluents: Plague Marines' plague boltgun AP 0 → −1 and heavy plague weapon −2 → −3 until end of phase; offered in either Fight phase; not for a unit that already shot / fought this phase |
| DTG-018 | DTG-5 | Harbingers of Despair: at the start of a Fight phase, Poxwalkers in Engagement Range of two enemy units → each takes one Battle-shock test; an attached enemy unit tests once; not offered for a DG unit not in Engagement Range |
| DTG-019 | DTG-5 | Disgustingly Resilient: enemy targets Plague Marines with D2 weapons → each allocated attack deals 1; D1 attacks stay 1; random D rolled first; only in the opponent's Shooting phase |
| DTG-020 | DTG-6.1 | The Destroyer Hive: melee attacks against Typhus + Poxwalkers get −1 to hit; ranged attacks do not; unattached Typhus gets no modifier |
| DTG-021 | DTG-6.2 | Foul Infusion: with Grelch attached, a plague boltgun unmodified hit roll of 5 is a Critical Hit and auto-wounds (Lethal Hits); Plague Marines without Grelch crit only on 6 |
| DTG-022 | DTG-6.3 | Remorseless: Plague Marines within range of a marker their side controls → Battle-shock test +1; marker contested or enemy-controlled → no bonus |
| DTG-023 | DTG-6.4 | Curse of the Walking Pox: a Poxwalker kills an enemy INFANTRY model while the unit has destroyed models → one Poxwalker returns at once (placement rules), up to Starting Strength |
| DTG-024 | DTG-6.4 | Curse of the Walking Pox: killing a MONSTER or VEHICLE model → no return; unit at full strength → no return; the kill by attached Typhus returns a Poxwalker (`includeLeader`) |
| DTG-025 | DTG-6.6 | Grelch destroyed → Deadly Demise 1: D6 = 6 → 1 mortal wound to each unit within 6"; 1–5 → nothing |
| DTG-026 | DTG-6.7 | Poxwalkers: AP 0 attack, Sv 7+ → no armour save; in cover 6+ save is rolled; Feel No Pain 5+ ignores wounds incl. mortal wounds |
| DTG-027 | DTG-6 | Typhus 4+ invuln used against AP −3 (2+ armour becomes 5+); hyper blight grenades Blast +2 A vs a 10-model unit, Assault after Advancing; injector pistol fired in Engagement Range |
| DTG-028 | E2 | condition `unitOnObjectiveControlledBy: 'self'` true only when the holder (either half) is in range of a marker whose `controller` is the holder's player; existing `targetOnObjectiveControlledBy` unchanged |
| DTG-029 | E1 | `hasDeepStrike` true for a datasheet with DEEP_STRIKE and for any half of an attached unit carrying `grantDeepStrike`; false otherwise; existing Deep Strike and Tellyporta tests unchanged |
| DTG-030 | DTG-1 | AI: a full AI-vs-AI game with this patrol (both sides or vs Space Marines) finishes without a stuck decision (Walking Plague prompt, Harbingers, Curse returns) |

## CHA (101–130) — Chaos Daemons: Butchers of Hyporia (docs/spec/factions/chaos-daemons.md)
IDs start at CHA-101: CHA-001…034 belong to Chaos Space Marines above.
| ID | Ref | Scenario → expected |
|---|---|---|
| CHA-101 | DMN-1 | patrol `cdm.cp.butchers-of-hyporia` loads (faction `chaos-daemons`): 6 units, 34 models; Kh'har'ret is WARLORD with Incarnated Rage, attached to `bloodletters-1`; default secondary Worthy Offerings; stratagems are the three `cdm.s.*` ids; start screen lists Chaos Daemons |
| CHA-102 | DMN-6 | data: every stat/profile row of §6 matches (Bloodletters Sv 7+ inv 5+, Bloodcrushers T7 W4 inv 4+, Kh'har'ret Sv 5+ inv 4+); every datasheet has faction keyword LEGIONES DAEMONICA and the Shadow of Chaos ability; bases 40 / 32 / 90×52 / 60×35 mm |
| CHA-103 | DMN-2.1, E1 | Shadow areas: a Daemon unit partly in its own deployment zone is in the Shadow; a unit wholly in No Man's Land is not, unless at the start of the phase the Daemons controlled ≥ half the NML markers (then it is until the phase ends); a non-Daemon game writes no `shadowOfChaos` key |
| CHA-104 | DMN-2.1 c, 2.5 b | enemy deployment zone joins the Shadow only when the Daemons control ≥ half of its markers at phase start; control gained mid-phase takes effect at the next phase start; an area with zero markers never qualifies |
| CHA-105 | DMN-2.2 | Manifestation modifier: Bloodletters below half strength in own DZ test in the Command phase with +1 (dice log shows it); same unit in NML outside the Shadow → no modifier |
| CHA-106 | DMN-2.2, 2.5 d | Manifestation pass: Bloodletters (BATTLELINE) with 6 destroyed models pass → D3 destroyed models return at legal spots, never above Starting Strength; failed test → nothing returns |
| CHA-107 | DMN-2.2, 2.5 d | Manifestation pass on Bloodcrushers (not BATTLELINE) with a model on 1 wound → that model regains D3 (capped at W4); Kh'har'ret attached and wounded with no Bloodletters lost → Kh'har'ret is healed |
| CHA-108 | DMN-2.4 | Insane Bravery auto-pass inside the Shadow triggers Manifestation; a unit at full strength is never tested just for being in the Shadow |
| CHA-109 | DMN-2.3 | Daemonic Terror: an enemy unit below half strength inside the Daemon deployment zone tests with −1 in its Command phase; on a fail it takes D3 mortal wounds (resolved before the next unit tests); on a pass nothing; an enemy outside the Shadow has no −1 |
| CHA-110 | DMN-2.3, E2 | Terror mortal wounds that destroy the enemy unit emit UnitDestroyed with no attacking model (Worthy Offerings 10-VP tier never triggers from them) |
| CHA-111 | DMN-2.5 e | mirror match: a unit standing in both Shadows tests at net 0 and gets both Manifestation (if passed) or Terror (if failed) from the right player |
| CHA-112 | DMN-3.1 | Incarnated Rage: Kh'har'ret leading Bloodletters → hellblade unmodified 6 to hit auto-wounds (Lethal Hits) for the Bloodletters and for the blade of blood; detached → no Lethal Hits |
| CHA-113 | DMN-3.2 | Warp Locus: an objective whose centre is 2.9" from Kh'har'ret in NML is in the Shadow; at 3.1" not; an enemy unit within 3" of him tests with −1; Kh'har'ret in Reserves → no area |
| CHA-114 | DMN-4.1 | Worthy Offerings: opponent's Warlord destroyed by Bloodletters → 6 VP at battle end; destroyed by Kh'har'ret's own attack → 10 VP; alive → 0; never arrived from Reserves → 6 |
| CHA-115 | DMN-4.1 | Worthy Offerings: Warlord killed by Kh'har'ret while he leads Bloodletters → 10 (credited to his model, not the Bloodletters); killed by a Bloodletter of his attached unit → 6 |
| CHA-116 | DMN-4.2 | Dark Conjunction: round 1 → 0; round 2, end of own turn, Daemons controlled 2 of 3 NML markers at `fight.start` → every NML marker (3) scores 1 VP each, controlled or not; markers in own DZ never score; end of the opponent's turn → 0 |
| CHA-117 | DMN-4.2 | Dark Conjunction: Daemons control 1 of 3 NML markers → NML not in Shadow → only Warp Locus-covered markers score; controlling half the enemy-zone markers adds them |
| CHA-118 | DMN-5.1 | Blood-Maddened Banishment: enemy targets Bloodletters in the Fight phase → offered; a destroyed Bloodletter that had not fought rolls D6, 4+ stays and fights after the attacker finishes, then is removed; 1–3 removed at once |
| CHA-119 | DMN-5.1 | Blood-Maddened Banishment not offered: target is Flesh Hounds / Bloodcrushers; Bloodletters already fought this phase; second use in the same phase |
| CHA-120 | DMN-5.2 | Empyric Predators: opponent's Movement phase, enemy unit ends a Normal move 5" from Flesh Hounds → offered; used → Flesh Hounds make a Normal move of up to 6" (not into Engagement Range) |
| CHA-121 | DMN-5.2, E3 | Empyric Predators: after it, Fire Overwatch is not offered for those Flesh Hounds this phase; Flesh Hounds that already fired Overwatch this phase are not eligible targets; enemy 6.5" away → not offered; own Movement phase → not offered |
| CHA-122 | DMN-5.3 | Manifest Hate: opponent's Shooting phase, enemy targets Bloodletters → offered; used → saves on 4+ invulnerable vs AP −3 until end of phase; not offered in the Fight phase or the Daemons' own Shooting phase |
| CHA-123 | DMN-6.1, E4 | A Gory Path: Kh'har'ret's unit consolidates up to 6" (a 5.5" placement legal, 6.5" refused); pile-in still 3"; Bloodletters without him consolidate 3" |
| CHA-124 | DMN-6.2 | Collar of Khorne: Flesh Hounds roll FNP 3+ against a Psychic weapon's wounds and Psychic-ability mortal wounds; no FNP against a bolter |
| CHA-125 | DMN-6 | Bloodcrushers fight with hellblade + bladed horn (Extra Attacks) together; bladed horn gets +1 to wound only when they charged (Lance) |
| CHA-126 | DMN-6 | Gore Hound's burning roar auto-hits D6 times (Torrent) and the target gets no cover bonus (Ignores Cover); other Flesh Hounds have no ranged weapon |
| CHA-127 | DMN-6.3 | Kh'har'ret + Bloodletters Deep Strike together from round 2, more than 9" from enemies; refused in round 1 |
| CHA-128 | DMN-6 | Sv 7+: a Bloodletter hit by AP 0 saves only with its 5+ invulnerable; Kh'har'ret saves on his 4+ invulnerable rather than his 5+ armour (also vs AP 0) |
| CHA-129 | E1/E2 | regression: Shadow record + modifiers keep replay hashes deterministic (same seed + actions → same hash); Drukhari Pain gain on a failed test still fires alongside Daemonic Terror |
| CHA-130 | DMN-1.2 | icon / musician models carry no extra rule: OC, Ld and attacks identical to a plain Bloodletter / Bloodcrusher |

## WOR — World Eaters: Karagar's Rampagers (docs/spec/factions/world-eaters.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| WOR-001 | WOR-1 | patrol `we.cp.karagars-rampagers` loads (faction `world-eaters`): 3 units, 21 models; Karagar is WARLORD with Skulls for Khorne and is not attached to anything; default secondary Ravage and Ransack; stratagems are the three `we.s.*` ids; the start screen lists World Eaters |
| WOR-002 | WOR-6 | data: every stat and weapon row of §6 matches; every datasheet has faction keyword WORLD EATERS and the four Blessings abilities; Karagar has a 4+ invuln and a 90×52 oval base; Jakhals have FNP 6+ and the Dishonoured has a 40 mm base; Berzerker and Jakhal pistols reuse the `csm.w.*` ids |
| WOR-003 | WOR-2.1 | start of each battle round: the World Eaters player gets 8D6 rolled (`purpose:'ability'`, not Command-re-rollable) and one `chooseOption` (no pass) of feasible sets + `none`; a player with no World Eaters units is not asked; in a mirror match both are asked, first player first |
| WOR-004 | WOR-2.2 | dice [1,1,2,3,4,5,6,6] → offered: WD, TC, WB, WD+TC, WD+WB, none; **not** TC+WB (only one qualifying pair) |
| WOR-005 | WOR-2.2 | dice [3,3,3,2,2,1,4,6] → the triple 3s pay for TC or WB, the 2s pay for WD; TC+WB not offered; dice [5,5,5,5,1,2,3,4] → TC+WB offered (two pairs of 5); dice [1,2,3,4,5,6,1,2] with no double ≥ 4 and no triple → only WD (and none) offered |
| WOR-006 | WOR-2.3 | at most two Blessings, no Blessing twice; the choice is stored for the current round only; next round → a fresh roll and the old Blessings are gone; choosing `none` → no effect |
| WOR-007 | WOR-2.4 | Wrathful Devotion: a Berzerker with no FNP gets FNP 6+ (die 6 ignores, die 5 does not); a Jakhal (FNP 6+) adds 1 (die 5 ignores, die 4 does not); it also works against mortal wounds; Blessing not active → Berzerkers have no FNP |
| WOR-008 | C1 | engine: `adjustFeelNoPain` result `{threshold:6, modifier:0}` for a model with no FNP and `{threshold:current, modifier:1}` otherwise; data `modifyRoll:{roll:'feelNoPain', value:1}` is now applied; total modifier capped at +1; `FeelNoPainRolled.needed` shows the effective target |
| WOR-009 | WOR-2.5 | Total Carnage: an enemy melee attack destroys a Berzerker that has not fought, D6 = 4 → the model stays at 0 W and cannot be allocated; once the enemy unit's attacks finish it piles in and fights, then is removed; D6 = 3 → removed at once |
| WOR-010 | WOR-2.5 | Total Carnage: Berzerkers already fought this phase → no roll; a model destroyed by shooting (Overwatch / Shooting phase) or by stratagem mortal wounds → no roll; it works in the opponent's Fight phase too; Blessing not active → no roll |
| WOR-011 | WOR-2.6 | Warp Blades: Berzerker chainblade critical hit wounds automatically (Lethal Hits); a plasma pistol critical hit does not; it ends at the end of the round |
| WOR-012 | WOR-3 | Skulls for Khorne: Karagar's exalted chainblade removes the last model of an enemy unit, D6 = 2 → +1 CP; D6 = 1 → no CP; a Berzerker kill → no roll; a plasma-pistol kill → no roll; a second gain in the same round is discarded by R-4.2 |
| WOR-013 | WOR-3 | Skulls for Khorne vs an attached enemy pair: killing the bodyguard half while the leader lives → no roll; killing the last model of the pair → one roll |
| WOR-014 | WOR-3 | Arch-slaughterer: Karagar's melee attacks can be allocated to a visible CHARACTER in an attached unit (Precision); his plasma pistol cannot; no Skulls for Khorne roll when Arch-slaughterer is taken |
| WOR-015 | WOR-4 | Ravage and Ransack: end of the opponent's turn, the player controls the marker closest to the opponent's edge → +4 VP; end of the player's own turn → 0; marker not controlled → 0; tied nearest markers → controlling either scores 4 once; works on all six mission layouts (cp-01/cp-04 have no home markers) |
| WOR-016 | WOR-4 | Blood Offering: an enemy unit within range of a marker at `fight.start` is destroyed by a Berzerkers melee attack → +2 VP; the same unit off-objective at phase start → 0; destroyed by shooting → 0; two such units in one phase → +4; a Total Carnage deferred model's kill counts |
| WOR-017 | WOR-5 | Rage Unchecked: Berzerkers at 4/10 models, not yet fought → every weapon has Sustained Hits 1 until the end of the phase (a critical hit adds 1 hit); at 5/10 (not below half) → not offered; already shot this phase → not offered; offered in the opponent's Fight phase; never for Jakhals |
| WOR-018 | WOR-5, C2 | Unstoppable Fury: the `fight.beforeConsolidate` window opens after the unit's attacks and deferred deaths, before consolidation; once used, a model may move up to 6" and the unit must end in Engagement Range; pile-in stays 3" |
| WOR-019 | WOR-5, C3 | Unstoppable Fury: no enemy can be reached within 6" → the objective fallback is limited to 3" (a 4" move toward a marker is rejected `E_OUT_OF_RANGE`); the stratagem cannot target a unit other than the consolidating one; Gilded Spear (`getStuckInDistance`) behaviour unchanged |
| WOR-020 | WOR-5 | Overwhelming Onslaught: Berzerkers end a Charge move in ER of enemy X → stratagem offered; X takes a Battle-shock test with −1 (2D6 = 8 vs Ld 7+ → passes at 7; 2D6 = 7 → fails, X Battle-shocked); an enemy not in ER cannot be picked |
| WOR-021 | WOR-5 | Overwhelming Onslaught is not offered after a failed charge, a Heroic Intervention or in the opponent's Charge phase; only the unit that just charged can be the first target |
| WOR-022 | WOR-6 | Karagar's weapons: Juggernaut's bladed horn (Extra Attacks) attacks alongside the exalted chainblade; Lance → +1 to wound on the turn he charged; supercharged plasma pistol is Hazardous; BS 2+ |
| WOR-023 | WOR-6 | Jakhal weapons: Jakhal chainblades and mauler chainblade Sustained Hits 1; the Dishonoured has only the skullsmasher (no ranged attack, still counts for OC/coherency); Jakhals FNP 6+ vs normal damage |
| WOR-024 | WOR-2.2 | `feasibleBlessingSets` unit test: never returns a set needing more dice than rolled; set order is the AI preference order; `none` always offered |
| WOR-025 | WOR-2 | AI: the Blessings AI takes the first offered option; a full AI-vs-AI game with this patrol finishes without a stuck decision |

## THO — Thousand Sons: The Coven Temporus (docs/spec/factions/thousand-sons.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| THO-001 | THO-1 | patrol `ths.cp.the-coven-temporus` loads (faction `thousand-sons`): 4 units, 26 models (1 + 5 + 10 + 10); Ahrak is WARLORD with Temporal Sorceries; default secondary Sorcerous Ritual; the three `ths.s.*` stratagems; no leader attachment offered |
| THO-002 | THO-6 | data: every stat/weapon row of §6 matches; invulns 5+/4+/6+; only the Sorcerer model has PSYKER; Screamer Invocation is one profile group with skill null + TORRENT |
| THO-003 | THO-2.1 | end of own Command phase with Ahrak and the Sorcerer on the board, none Battle-shocked, no marker held → pool = 3 + Temporal Sorceries D3 |
| THO-004 | THO-2.1 | Scarab unit Battle-shocked → Sorcerer adds 0; Sorcerer dead → 0; Ahrak in Reserves → neither his 2 nor the D3 |
| THO-005 | THO-2.2 | pool 4 left at the end of the opponent's turn → reset to 0 at the start of own Command phase before any Ritual offer; unchanged during the opponent's turn |
| THO-006 | THO-2.3 | start of the opponent's Shooting phase with pool 2 → Ritual offer lists Weaver (per PSYKER) and done, not Echoes; pool 1 → no offer |
| THO-007 | THO-2.3 | Weaver used at `shooting.start` → not offered again that phase; offered again at `charge.start`; pool reduced by 2 |
| THO-008 | THO-2.4 | Weaver active, Tzaangors 17" from Ahrak fail a save → re-roll offered; used → no second Weaver re-roll this phase; Tzaangors 19" away → no offer; with the Sorcerer chosen, range is measured from the Sorcerer model, not the closest Terminator of its unit; in a Thousand Sons mirror match each player gets their own once-per-phase re-roll |
| THO-009 | THO-2.4, C2 | Weaver re-roll in a fast-rolled save batch: offer lists the failed dice, one re-rolled, `DiceRerolled` with source `ths.a.weaver-of-fates`; the re-rolled save cannot take a Command Re-roll |
| THO-010 | THO-2.4 | Weaver does not apply to an enemy unit's saves, nor to a Thousand Sons unit when the chosen PSYKER is no longer on the board |
| THO-011 | THO-2.5, C3 | Echoes (pool 6) on Ahrak's unit, then Epic Challenge on Ahrak → 0 CP; a second stratagem on Ahrak the same phase costs normal CP |
| THO-012 | THO-2.5, C3 | Echoes on the Scarab unit after Malign Entanglement was already used this phase on another unit → Malign Entanglement on the Scarabs allowed for 0 CP; override expires at phase end unused |
| THO-013 | THO-3.1 | Temporal Sorceries: Ahrak may be set in Reserves (Deep Strike, C1) and arrives >9" from enemies from round 2; Rapid Ingress is offered for him |
| THO-014 | THO-3.1 | Lone Operative: enemy model 13" from Ahrak cannot target him with a ranged attack; at 11" it can |
| THO-015 | THO-3.2 | Arch-Diabolist: Ahrak in Engagement Range may fire Screamer Invocation at the engaged enemy (Pistol); he still has Deep Strike and Lone Operative; no D3 Cabal points at Command end |
| THO-016 | THO-4.1 | Sorcerous Ritual: round 2, end of opponent's Fight phase, Ahrak on a controlled marker outside own DZ, pool 2, D6 = 3 → 3+2 = 5 → +3 VP; D6 = 2 → 0 |
| THO-017 | THO-4.1 | Sorcerous Ritual: bonus capped at +3 (pool 5, D6 = 1 → 4 → 0 VP); round 1 → no roll; marker inside own DZ → no roll; end of own Fight phase → no roll |
| THO-018 | THO-4.1 | Sorcerous Ritual: only a Terminator (not the Sorcerer) on the marker → no roll; the Sorcerer on it → roll |
| THO-019 | THO-4.2 | Bringer of Change: Warpsmite kills an enemy model in own Shooting → D3 VP at phase end; a soulreaper kill only → 0 |
| THO-020 | THO-4.2, C5 | Bringer of Change: a Warpsmite Devastating Wounds mortal kill counts; force weapon kill in the opponent's Fight phase counts; Ahrak dying to his own Hazardous never counts; total capped at 12 |
| THO-021 | THO-5.1 | Wreathed in Warpflame: Scarabs' khopesh critical hit auto-wounds (Lethal Hits); vs a VEHICLE an unmodified 5 to hit is a critical hit; vs INFANTRY a 5 is not; not offered for Tzaangors or a unit that already fought |
| THO-022 | THO-5.2 | Mutant Cunning: opponent targets Tzaangors with shooting → offered; used → D6" Normal move (not into Engagement Range) then the unit has cover vs ranged attacks to phase end; not offered for Scarabs or an engaged Tzaangors unit |
| THO-023 | THO-5.3 | Malign Entanglement: enemy declares a charge at the Scarabs → offered; used → charge roll 2D6 = 9 counts as 7; not offered for a unit that is not a charge target; expires at phase end |
| THO-024 | THO-6.1, C4 | Glimpse: Ahrak's force weapon wound roll of 2 → fix to 6 offered → critical wound; a second fix the same turn is not offered; offered again in the next turn |
| THO-025 | THO-6.1, C4 | Glimpse on a save: AP −2 attack allocated to Ahrak, save die 1 → fixed to 6 → saved; on a D3 force weapon damage roll → becomes 3; the fixed die cannot be re-rolled |
| THO-026 | THO-6.1 | Glimpse is never offered for Scarab or Tzaangor rolls, nor on Hazardous, charge or Battle-shock rolls; Screamer Invocation (Torrent) has no hit roll to fix |
| THO-027 | THO-6.2 | Implacable Guardians: S6 attack vs Scarabs (T5) → −1 to wound; S5 → no change; Sorcerer destroyed → no modifier; with another −1 the ±1 cap holds |
| THO-028 | THO-6.3 | Relic Hunters: own Command end, Tzaangors on 2 controlled markers → 2 D6, each 4+ = +1 Cabal; both Tzaangors units on one marker → 1 die; marker not controlled → no die |
| THO-029 | THO-6 | weapons: Warpsmite Anti-INFANTRY 4+ crit wound on 4 + Devastating Wounds mortal; Screamer focused profile 2D6 auto-hits and takes a Hazardous test; inferno combi-bolter Rapid Fire 2 at half range → 4 shots; soulreaper Devastating Wounds |
| THO-030 | THO-6 | Scarabs Deep Strike from round 2 >9" from enemies; the Sorcerer picks force weapon or khopesh per fight, never both |
| THO-031 | THO-2.3 | AI: Ritual AI keeps points (`done`) at its own movement start and spends Weaver at the opponent's shooting start when a Thousand Sons unit is likely targeted; a full AI-vs-AI game with this patrol finishes without a stuck decision |

## MVA — Adeptus Mechanicus: Maniple Verask-Alpha (docs/spec/factions/adeptus-mechanicus--maniple-verask-alpha.md)
| ID | Ref | Scenario → expected |
|---|---|---|
| MVA-001 | MVA-1 | patrol `adm.cp.maniple-verask-alpha` loads (faction `adeptus-mechanicus`): 4 units, 15 models; Verask is WARLORD with Omniballistic Data-Tether, attached to the Rangers; default secondary Explorator Acquisition; stratagems are the three `adm.s.mva-*` ids; `faction.json` lists both patrols; Purge Corps Deltic-9 still loads unchanged |
| MVA-002 | MVA-6 | data: every stat / weapon row of §6 matches; invulns 5+/6+/6+/4+; Verask has no Doctrina ability, the other three carry the four Doctrina ids; the arquebus Ranger base is 60 × 35 oval; reused weapon ids are unchanged; `adm.w.mechanicus-pistol-verask` is BS 3+; Verask's only bodyguard is the Rangers |
| MVA-003 | MVA-2.2, 2.3 | Doctrina on the new units: round-start pick is offered to a Verask-Alpha player; Protector → galvanic rifle and Kataphron culverin have HEAVY (stationary +1 to hit); arquebus stationary gets +1 once, not +2; Conqueror → Icarus array (AP −1) vs a target partly in the enemy DZ → AP −2; enemy AP −2 shot at the Dunecrawler in its own DZ under Protector → AP −1 |
| MVA-004 | MVA-2.4, 2.3 | Verask leading the Rangers under Conqueror → his pistol has ASSAULT; Verask alone → nothing; Damaged Dunecrawler under Protector, stationary → net 0 hit modifier |
| MVA-005 | MVA-3.1 | Data-Tether: Verask + Rangers shoot → one failed hit die and one failed wound die offered for re-roll, no second offer in that activation across both halves; melee attacks get none; budget returns in the next phase; an Overwatch shot gets its own budget; Rangers without Verask → no offer |
| MVA-006 | MVA-3.2 | Surge-wafer chosen: unit selected to shoot → use/decline offered; decline → offered again next Shooting phase; use → ranged weapons have PRECISION this phase (wound allocated to a visible enemy CHARACTER in an attached unit), gone next phase; never offered again; also offered when the bearer's unit is selected to fire Overwatch, Precision lasting until the end of that phase |
| MVA-007 | MVA-4.1 | Explorator Acquisition: round 1 → no roll; round 2 end of own Command phase controlling 2 markers, die 5 → 4 VP, die 4 → 0; no roll at the end of the opponent's Command phase; after 3 successes (12 VP) → no further VP; removed markers do not count |
| MVA-008 | MVA-4.2 | Holy Apparatus at battle end: Verask alive + Dunecrawler at 11 W → 8; Dunecrawler at 5 W → 6; at 6 W → 8; Verask destroyed + Dunecrawler 11 W → 4; Dunecrawler destroyed + Verask alive → 4; nothing scored before the battle ends; Verask attached and the Rangers wiped but Verask alive → warlord 4 |
| MVA-009 | MVA-4.2b | Code-name isolation: `mvaHolyApparatus` never opens a pick; the Leagues of Votann `holyApparatusPick` / `holyApparatusScore` behave as before (LoV regression) |
| MVA-010 | MVA-5.1 | Retribution Codes: an enemy shooting attack kills Verask → offered to the AdMech player in the opponent's turn; used (1 CP) → AdMech hit rolls of 1 against the killer's unit are re-rolled, still in a later round, ranged and melee; attacks against other units are not; a Ranger dying → not offered; Verask killed by ability mortal wounds that are not an attack (e.g. an enemy Deadly Demise) → not offered |
| MVA-011 | MVA-5.2 | Reactive Field-Shroud: opponent shoots the Rangers → offered; used → 4+ invuln this phase (AP −3 attack saved on 4+ instead of 6+), gone next phase; Verask + Rangers and the Dunecrawler eligible; Kataphron Destroyers not eligible; offered in the Fight phase of either turn; not in own Shooting phase |
| MVA-012 | MVA-5.3 | Retrogradial Targeting: costs 2 CP; Verask (alone, or leading the Rangers) Falls Back → offered; used → the unit may shoot this turn but still cannot declare a charge; Kataphrons / Dunecrawler Fall Back → not offered; Verask Normal move → not offered |
| MVA-013 | MVA-6.1 | Enginseer: Verask unattached 2.5" from the Dunecrawler → an enemy ranged attack from 13" is illegal, from 11.5" legal; 3.5" away → targetable from 24"; leading the Rangers → never Lone Operative; an enemy VEHICLE within 3" does not count |
| MVA-014 | MVA-6.2 | Omnissiah's Blessing: own Command phase, Dunecrawler at 4 W within 3" of Verask → offered; D3 = 2 → 6 W and the Damaged −1 is gone; never above W; a wounded model 3.5" away and unwounded models not listed; Verask may pick himself; decline allowed; not offered in the opponent's Command phase; destroyed Rangers never return |
| MVA-015 | MVA-6.3, 1.1 | Scouts: Rangers unattached make a Scouts move of up to 6" ending > 9" from enemies; Rangers led by Verask → no Scouts move offered |
| MVA-016 | MVA-6.4, 6.5 | Dunecrawler: at 4 W → −1 to hit, at 5 W → none; Deadly Demise D3 on a 6; Icarus array Twin-linked re-rolls failed wound rolls and is Anti-Fly 4+ (crit wound on 4 vs FLY); Daedalus Anti-Fly 2+, D6+1 damage; cognis heavy stubber at ≤ 18" → 6 attacks, Sustained Hits 1 |
| MVA-017 | MVA-6 | Kataphrons: heavy grav-cannon Anti-Vehicle 2+; culverin supercharge triggers a Hazardous test (Kataphron model destroyed on a 1 — not a CHARACTER/VEHICLE), standard does not; cognis flamer auto-hits D6 with Ignores Cover; phosphor blaster at ≤ 12" → 2 attacks |
| MVA-018 | MVA-6 | Verask / Rangers weapons: Verask's pistol hits on 3+; servo-arm (Extra Attacks) adds 1 attack alongside the Omnissian axe; transuranic arquebus Heavy + Precision; galvanic rifle 30" 2 attacks; arc rifle Rapid Fire 1 at ≤ 15" → 2 shots |
| MVA-019 | MVA-3.2, 5.1, 6.2 | AI: Blessing picks the most-wounded candidate; Surge-wafer AI uses it only with an attached enemy CHARACTER in range (or round 5); Retribution Codes used when CP ≥ 1; a full AI-vs-AI game with this patrol (both sides and the mirror vs Purge Corps) finishes without a stuck decision; the sim rotation includes the patrol |
| MVA-020 | MVA-1 | e2e (Playwright): start screen → Adeptus Mechanicus → patrol picker → Maniple Verask-Alpha → deployment shows 15 models (Verask with the Rangers, Kataphrons, Dunecrawler) and the game reaches battle round 1 |
| MVA-021 | MVA-1 | Oversize base vs cp-01 (Rules Commentary: Deploying Units): the Dunecrawler's 130 mm (5.12") base cannot stand wholly inside cp-01's 5" deployment strips, so it is set up with its base touching its player's battlefield edge instead (still wholly on the board, centre inside the zone, gap from the base outline to the edge at most 0.05"). Nothing starts in Reserves. The AI scans along that edge for a clear spot (`edgeDeployPlacement`, `src/engine/setup.ts`); a human drag snaps to the edge (`snapToBattlefieldEdge`); `resolveDeploy` rejects an oversize placement 1" in from the edge and a normal-size model outside the zone. Geometry: `oversizeEdgePlacementOk` / `isOversizeForZone` in `src/engine/geometry.ts`, fit test in `src/data/rosterFit.ts`. Other missions are unaffected. |

## DAV — Dark Angels: The Vengeful Brethren (docs/spec/factions/dark-angels--the-vengeful-brethren.md)
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
