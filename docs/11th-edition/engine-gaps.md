# 11th edition: core-rules gaps in the engine

Planning note, 2026-10-26. No code has been changed.

**What was compared.** Our 10th-edition engine as specified in `docs/spec/10-rules-core.md` (rule ids `R-x.y`),
`docs/spec/00-architecture.md` (frozen contracts) and `docs/spec/12-rules-test-checklist.md` (checklist ids),
checked against the 11th-edition Core Rules (`docs/sources/core-rules-11th.pdf`, 88 pages; page numbers below are
that PDF's printed pages) and the one-page Universal Rules Updates v1.1 errata. Everything below is a summary in our
own words. Rule names are kept; nothing is quoted.

**Scope.** Core gameplay only. Missions, terrain areas and categories, deployment maps and patrol data belong to a
separate gap list. They show up here only where they change the engine's core loop (§13).

**Columns.** *Ours (10th)* is the behaviour we have and where it lives. *11th* is what changes, with its page.
*Size*: **S** = a constant, predicate or small branch plus tests; **M** = about one lean workflow stage; **L** = more
than one stage, touching the decision flow, AI and UI. *Contract*: frozen files under `src/engine/` that change
(each one also needs a `00-architecture.md` edit). "—" = none. *Checklist*: existing ids whose expected results change
or which stop applying. New tests will need new ids.

---

## 1. Core concepts, measuring, coherency

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 1.1 | Engagement Range is 1" horizontal / 5" vertical (`geometry.ts` `ENGAGEMENT_H = 1`, `withinEngagementRange`). Used by ~35 call sites, the charge planner and the AI. | Engagement range becomes **2"** horizontal (5" vertical unchanged). Units in it are now called "engaged" (p14). The constant is a one-line change. The knock-on effects are large: charge distances, fight eligibility, pile-in geometry, the AI's spacing heuristics, and every fixture that sits at 1". | L (ripple) | — | MEAS-004/005/006/008, CHARGE-007/010/012/013, FIGHT-006/015/016, FIGHT-RANK-*, LOS-030 |
| 1.2 | Coherency: within 2" of 1 neighbour, or 2 neighbours for units of 7+ (`coherencyNeighboursNeeded`, `isCoherent`, `coherencyGroups`, `legal.ts` `repairCoherency`). | Every model needs 1 neighbour within 2"/5" **and** must be within **9" horizontally of every other model** in the unit. The 7+ two-neighbour rule is gone (p14). The end-of-turn cull is unchanged. | M | — | MEAS-010/011/012/014 |
| 1.3 | A set-up that can't be made legal destroys the unit (R-2.4 edge case). | If a unit can't be fully set up it goes back where it came from (reserves, transport). When that happens during a move, the unit counts as not having moved, so it can try again or stay put (p14). | S | — | MOVE-022 |
| 1.4 | Active player is always whoever's turn it is. | While a unit is selected to move, shoot or fight, its controller is the active player until that activation ends. Between turns, the first-turn player is active (p8). This affects every "active player first" window order and any rule keyed to the active player during Overwatch, Heroic Intervention and the fight alternation. | M | — | STRAT-029, MEAS-021 |
| 1.5 | LoS is blocked by models of every unit except the observer's own (`los.ts` `modelBlocks`). | Models in the **target's** unit are also ignored when drawing a line (p24). | S | — | LOS-003/004/031 |
| 1.6 | Every model has a base; measurement is base to base. | New FRAME keyword: models without a base measure to their hull (p62). Only matters if a roster has one. | S | — | — |
| 1.7 | Duplicate abilities are handled one case at a time (e.g. FNP R-10.5). | General rule: two copies of the same core or weapon ability never stack, even with different numbers or keywords, and the owner picks one. Scouts takes the lowest value not shared by every model (p78). Weapon abilities can carry a target-keyword qualifier, e.g. Lethal Hits that only work against VEHICLE (p78). Needs a data-schema field and a target check in `hasAbility`. | M | types.ts (RuntimeWeapon ability shape) | SHOOT-035 |
| 1.8 | Starting Strength = model count when the unit is added; an attached unit's SS reverts when one half dies (R-4.5, `leaders.ts` `startingStrength`). | SS = model count at the start of battle round 1. An attached unit keeps its combined SS for the whole battle (a lone surviving leader is below half). "At half-strength" exists only for even SS / even W (p86). | S | — | CMD-008/009, LEAD-010 |

## 2. Battle round and Command phase

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 2.1 | Turn = 5 phases; windows `command.start` … `turn.end`. No start-of-turn step. | A turn is Start of Turn step → 5 phases → End of Turn step. At end of turn, and at the end of the round and of the Command phase, non-mission rules resolve before mission scoring (p28–30). Add a `turn.start` window and fix the end-step ordering in `reducer.ts` `startTurn`/`transition`. | S | types.ts (`CommandStep`; `TimingWindowId` lives in `src/data/types.ts`) | FIGHT-028, MISSION ordering tests |
| 2.2 | Battle-shock test for units **below** half-strength; the shock wears off on its own at the start of the owner's next Command phase (`command.ts` `eligibleForTest`, `recoverExpiredShock`; `Unit.battleShockExpiresRound`). | Test units **at or below** half-strength **and** every unit already shocked. A shocked unit stays shocked until it passes one of these rolls, so the shock no longer expires on its own (p30–31). A unit that passes recovers. Insane Bravery can be spent on a recovery roll. | M | types.ts (`battleShockExpiresRound` loses its meaning) | CMD-004/005/006/007/015/016/020, MOVE-031 |
| 2.3 | Battle-shocked: OC 0, Desperate Escape on Fall Back, no own stratagems, no surge. | OC becomes "–" rather than 0 (matters for "+1 OC" effects), no own stratagems, can't start actions; a fall-back must use Desperate Escape (p9, p33). | S | — | CMD-011/014 |
| 2.4 | CP: +1 each Command phase, plus at most 1 extra per round (R-4.2). | The +1 "Core CP" for both players stays (p30). The core text no longer states the 1-extra-per-round cap (it may be in the app). | S | — | CMD-002/003, STRAT-032 |
| 2.5 | Leadership/battle-shock: 2D6 ≥ best Ld in the unit. | Same: pass if the roll meets any Ld in the unit (p9). | — | — | — |

## 3. Movement phase

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 3.1 | Units on the board are activated one by one; Reserves arrive in a separate Reinforcements step after all moves (`movement.ts` `doSelect`, `doReinforcementsStep`, `movement.reinforcements` window). | **Every** unit, including those in reserves or embarked, must be selected once and given a move type. Remain stationary, normal, advance, fall-back, **disembark** and **ingress** are all move types (p32). The Reinforcements step goes away: arrivals and disembarks happen inside unit selection. | L | types.ts (`MoveType` gains `disembark`, `ingress`; `DeclareMove` context), actions.ts, events.ts (`ReinforcementsArrived` → per-unit ingress) | MOVE-008/024/026/034/036, CHARGE-019 |
| 3.2 | Normal move: no model may enter ER at any point (`geometry.ts` `pathEntersEngagement`, `movement.ts` `checkPaths`). | A normal or advance move only has to **end** unengaged. Models may pass through engagement range on the way, but still not through enemy models (p33). | S | — | MOVE-019 (and new) |
| 3.3 | Pivot cost 0"/1"/2" by base type (`pivotCost`, `pathLength`). | Rotation is free; distance is measured from the same point on the base at the start and end of each straight leg (p12). Drop pivot cost. | S | — | MOVE-005 |
| 3.4 | MONSTER/VEHICLE may cross friendly non-M/V models only (`crossesBigFriendly`). | In normal and advance moves, M/V models may pass through **friendly and enemy** models, except other M/V (p62). | S | — | MOVE-002/003, CHARGE-032 |
| 3.5 | Advance: D6 added to M; no shooting except Assault, no charge. | Same, plus the unit can't start an action (p33). | — | — | — |
| 3.6 | Remain Stationary enables Heavy; a unit that disembarked can't remain stationary. | Remaining stationary just means nobody moves, and it fires no start-of-move or end-of-move triggers. It is no longer what Heavy checks (see 5.10). The disembark restriction is gone (p33). | S | — | MOVE-009, MOVE-030 |
| 3.7 | Fall Back: may cross enemies; each model that crosses an enemy base takes a Desperate Escape test (1–2 = dies); if Battle-shocked every model tests; RC-010 asks the survivors to re-submit their move (`doDeclare`, `doMove`, `canFallBack`, R-5.5b). | Two **modes**, picked before moving (p33). **Ordered Retreat** (only if not shocked): no tests, but no passing through enemy models. **Desperate Escape** (required if shocked, optional otherwise): one hazard roll **per model** before moving (1–2 → 1 mortal wound each, not an outright kill), the unit may pass through enemy models, and afterwards an unshocked unit takes a battle-shock roll. The rolls come before any model moves, so the RC-010 re-submit flow can be deleted. | M | types.ts / actions.ts (fall-back mode on `declareMove`) | MOVE-010/010b/011/012/013/035/040, CMD-014 |
| 3.8 | FLY always crosses models, may enter ER mid-move, and measures straight-line 3D paths (R-5.8, R-8.8). | FLY is now opt-in. For a normal, advance, fall-back or charge move the player may declare **take to the skies**: max distance −2" (HOVER units skip the penalty), vertical distance is ignored, and the model may pass through any model and any terrain. Without that declaration a FLY model moves like a ground model (p71, p85). | M | types.ts / actions.ts (flag on `declareMove` and charge move) | MOVE-012/019/020, CHARGE-015/032 |
| 3.9 | Vertical movement: climb counts toward the move; no mid-climb stop (R-5.7). | Same counting, plus the model must stay within ½" horizontally of the feature while climbing. MONSTER models may now end on upper levels too (p48). Terrain-category rules belong to the terrain agent; `terrain.ts` `canPassWalls`/`settleY` is where they land. | S | — | MOVE-015/016/017/018 |
| 3.10 | Surge move: never ends in ER, at most one per phase (`resolveSurgeMove`, RC-013). | Surge moves now **charge in**. The target is the closest enemy unit; each model must end engaged with it if it can, otherwise as close as possible, and must not end engaged with anyone else. The unit must be unengaged, not shocked, and not have moved this phase (p70). Existing faction surge abilities that say "not within ER" need a per-ability check. | M | — | MOVE-027/027c, STRAT-025 |
| 3.11 | Models with different M in one unit: handled per model. | Confirmed per-model maximum (p87). | — | — | — |
| 3.12 | "Set up away from enemies" distances are 9" (Deep Strike R-5.13, Infiltrators R-10.7, Scouts end R-10.8). | All three become **8"**. Scouts units held in reserves may instead deploy anywhere wholly in their DZ during pre-battle (p80, p82, p84). Change `strategicReservesConstraints`, `validateArrival`, `setup.ts` `infiltratorConstraints` and the Scouts step. | S | — | MOVE-021/032/033 |

## 4. Reserves, transports, aircraft

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 4.1 | Combat Patrol uses Deep Strike only; Strategic Reserves are written down but dormant (R-5.15). | Strategic reserves are a standard option (up to 50% of points). An arrival is an **ingress move**: wholly within 6" of any battlefield edge, more than 8" from enemy units, never inside the enemy DZ before round 3, from round 2 onward. After arriving the unit can't make other moves until the next Charge phase starts, so it may still charge. Units still in reserve at the end of round 3 are destroyed (p68–69). Deep Strike is now a variant of the ingress move (p80). | M | events.ts (`via` values) | MOVE-021/023/024/025, STRAT-012/013 |
| 4.2 | Units sent back to reserves mid-battle by abilities (teleport.ts, Deathwatch, Cult Ambush) follow per-faction rules. | General "repositioned units" rules: an advance, fall-back or disembark that turn still counts after the unit is set up again, ongoing effects persist, and these units are exempt from the round-3 cull (p68–69). | S | — | MOVE-025, GRE/DEA/GEN reposition ids |
| 4.3 | Embark after a move within 3"; not if disembarked this phase (R-5.17). | Embark after a normal, advance or fall-back move within 3"; not allowed if the unit was set up on the battlefield this turn (p64). | S | — | MOVE-026/029 |
| 4.4 | Disembark: set up within 3" before or after the transport moves; if the transport moved, the unit counts as having made a normal move (R-5.18, `resolveDisembark`, `raiseDisembark`, `transports.ts`). | Disembark is the unit's own move type and has three **modes** (p65). **Rapid** (transport made a normal or ingress move): 3", no charge; after an ingress it obeys the ingress placement limits. **Tactical** (transport stationary or not yet moved): 3", then the unit makes a normal or advance move. **Combat** (any other case): 6", a hazard roll per model, may be set up engaged with whatever the transport is engaged with, then battle-shocked and can't charge. No disembark if the transport advanced or fell back. The errata adds "assault" and "shock" disembark variants (18.06/18.07) that are not in the core PDF. | M | types.ts, actions.ts, events.ts | MOVE-030 |
| 4.5 | Destroyed transport: Deadly Demise first, then passengers disembark within 3" (1 = MW), or 6" in an emergency (R-5.20). | **Emergency disembark first**: 6", as close to the hull as possible, a hazard roll per model (1–2 → 1 MW), battle-shocked, can't charge; models that can't be placed die. **Then** Deadly Demise (p65, p80). | S | — | MOVE-031, SHOOT-044/045 |
| 4.6 | Firing Deck x (R-5.19). | Same shape; the embarked units can't shoot for the rest of the turn (p81). | S | — | — |
| 4.7 | AIRCRAFT out of scope. | Clearer rules (reserves only, ingress-only movement, back to reserves at the end of the opponent's turn, ignored for pile-in/consolidate/surge selection) (p74). Still out of scope until a roster needs it. | — | — | — |

## 5. Shooting phase and attack sequence

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 5.1 | Eligibility is a set of flags; the weapon filter is inferred (Assault after Advance, Pistols in ER, Big Guns Never Tire) (`shooting.ts` `unitEligibleToShoot`, `targetLegality`, `isBigGunsUnit`). | When selected, a unit picks a **shooting type** (p34–35). **Normal**: unengaged, didn't advance. **Assault**: advanced, Assault weapons only. **Close-quarters**: engaged, didn't advance, has CQ weapons or is M/V. **Indirect**: has Indirect Fire weapons. **Snap** shooting is Overwatch. Every type blocks starting an action. A unit with no ranged weapons still counts as eligible (p88). | M | types.ts / actions.ts (type on unit selection or `declareTargets`) | SHOOT-001/002/003, WEAP-001 |
| 5.2 | [PISTOL]. | Renamed **[CLOSE-QUARTERS]**; Pistol is kept as an alias (p80, p83). The rule is the same: a non-M/V model fires either its CQ weapons or its other guns. | S | — | SHOOT-012/013, WEAP-021/022 |
| 5.3 | Big Guns Never Tire: an engaged M/V shoots at −1 unless Pistol; Blast can't target a unit in ER of the firer's army (R-6.3, WEAP-007). | Close-quarters shooting covers it. An engaged M/V fires everything at −1, except CQ weapons aimed at a unit it is engaged with. Blast still can't target an engaged unit. Shooting **at** an engaged M/V is −1 unless it's a CQ weapon from a unit engaged with it (p35, p62). Nearly the same as now; the Blast restriction becomes "target is engaged". | S | — | SHOOT-005/006/007, WEAP-007 |
| 5.4 | Attacks are grouped per weapon profile (`attack.ts` `buildGroups`, `assignRuns`). | Attack dice are pooled across **all weapons whose attacks are identical** (same BS/WS, S, AP, D and abilities) against one target (p17). This changes batch composition and RNG draw order, so `engineVersion` needs a major bump. | M | — | SHOOT-014, CORE replay ids |
| 5.5 | Hit: unmodified 1 fails, 6 crits; net roll modifier capped at ±1 (`dice.ts` `clampHitWoundModifier`). | Same thresholds (p18). Several effects now change the **BS characteristic** instead of the roll: cover worsens BS by 1, Plunging Fire improves it by 1. The core text doesn't say whether the ±1 cap still exists or whether BS changes count toward it (see open questions). | M | hooks.ts likely (a BS-modifier channel in `RollModifierResult`) | SHOOT-016/017 |
| 5.6 | Allocate one wounded attack at a time; the defender picks the model; a model hit earlier this phase must keep taking hits; CHARACTERs are shielded by bodyguards (R-6.13, `doAllocateStage`, `priorityPool`, `finalizeAllocation`, `leaders.allocatableModels`, decision `allocateAttack`). | **Allocation groups** (p19, p23). Every CHARACTER model is its own group; the other models are grouped by identical W/Sv/InSv. The defender declares the group order: a group containing a wounded non-character goes first, characters always come last, and wounded characters come before unwounded ones. Then **all save dice are rolled together** and applied from the lowest result up to the current group, wounded model first. A group that is wiped out passes the remaining dice to the next group, and excess is lost when the unit dies. The "hit earlier this phase" rule is gone. This rewrites the save, allocate and damage stages and fast-rolling (M9). | L | types.ts (new decision kind for allocation order, retire `allocateAttack`, `CurrentAttack.saveTargets`), actions.ts, events.ts | SHOOT-020/021/022/023/024/027/028/047/048, LEAD-013/014, WEAP-025 |
| 5.7 | Save: owner picks armour or invuln, and the engine auto-picks the lower target (M9). Cover adds +1 to armour (`saveSetup`, `evaluateSave`). | An invulnerable save is a characteristic, InSv. The same die is checked against InSv first, then against Sv after AP (p19). No choice, and no cover term on the save. Results match our auto-pick except where save modifiers exist. | S | — | SHOOT-024/025/026 |
| 5.8 | Benefit of Cover: per **model** at allocation, +1 armour save, never vs invulns, none for Sv 3+ vs AP 0, max +1 total (`coverFor`, `los.benefitOfCover`, R-3.11–3.14). Stealth is a separate −1 to hit (`attack.ts` ~l.459). | Cover is now decided per **unit**, per attack: **every** model must be INFANTRY/BEASTS/SWARM inside a terrain area, or not fully visible because of terrain or an obscuring area. Its effect is **−1 to the attack's BS** (p50). The 3+/AP0 exception and the save cap are gone. Stealth now simply grants cover, so it doesn't stack with terrain cover (p85). Ignores Cover also cancels Stealth (p82). Indirect Fire and Smokescreen grant it. Cover moves from the save stage to the hit stage. | L | hooks.ts / types.ts (`saveTargets.cover`) | LOS-013/014/015/016/017/018/019/020/021/022/023/024/027, SHOOT-025/036, WEAP-019, STRAT-014 |
| 5.9 | Plunging Fire: shooter wholly within a ruin ≥ 6" up, target wholly at ground level → AP improves by 1 (R-3.8). | Shooter on any terrain section **3"+ tall**, or a TOWERING shooter within 12", and the target has **at least one** model at ground level → **BS improves by 1**. Not for AIRCRAFT (p73). | S | — | LOS-025/026a/026b |
| 5.10 | [HEAVY]: +1 to hit if the unit remained stationary and didn't arrive this turn (`attack.ts` l.453). | +1 to hit in your own Shooting phase if the unit is unengaged, wasn't set up this turn, and **no model moved more than 3"** (p82). Needs per-model distance moved this turn recorded in movement. | S | types.ts maybe (per-model distance on `Unit.turn`) | WEAP-002 |
| 5.11 | [INDIRECT FIRE]: only when no model is visible: −1 to hit, 1–3 fail, cover (R-6.23). | Its own shooting type (p35). Indirect weapons may target unseen units. Every Indirect attack gives the target cover and can't re-roll hits. Unmodified **1–5 fail**, improving to 1–3 only if the unit stayed stationary **and** a friendly unit can see the target. | M | — | SHOOT-041, WEAP-020 |
| 5.12 | Lone Operative: targetable only from within 12" (`shooting.ts` `isLoneOperative`). | Now **not visible** at all beyond 12" (or X"), and can't be targeted by Indirect beyond that range (p83). That touches LoS-based rules, not just targeting. Errata: stratagem effects that grant a 12" shield become 18". | S | — | SHOOT-037 |
| 5.13 | Mortal wounds: allocated like attacks; excess from Hazardous and Devastating Wounds is lost on the dying model (R-6.16–6.17, `drainOneMortalPoint`). | Fixed model order: wounded non-character, then any non-character, then wounded character, then character (p24). Excess carries on, except Devastating Wounds, where each critical damages at most one model (p80). | S | — | SHOOT-029/030/031, LEAD-014 |
| 5.14 | [HAZARDOUS]: 1 fails; 3 MW put on a carrier, picked by priority (`tickHazardous`, `applyHazardousCasualty`). | A new **hazard roll** primitive: 1–2 fails and deals **1 MW** to the unit (3 if every model is M/V), allocated by the normal mortal-wound order. One roll per Hazardous weapon selected (p24, p81). The same primitive is reused by Desperate Escape, Combat Disembark and emergency disembark, and by Command Re-roll. | M | events.ts (a `HazardRolled` event or a `DiceRolled` purpose) | SHOOT-031/038/039, WEAP-023/024, CHARGE-022 |
| 5.15 | Deadly Demise is rolled when the model is destroyed, before removal (`rollDeadlyDemise`); `attack.modelDestroyed` window after each attack. | On-death rules and model removal **wait until the attacking unit has finished all its attacks** (p87). Deadly Demise also comes after the emergency disembark. Several faction on-death hooks and the `attack.modelDestroyed` window timing move. | M | — | SHOOT-044/045, NEC/TYR/ADE on-death ids |
| 5.16 | Rapid Fire / Melta: half range checked when the attack is made. | Checked once at **target selection** (p83–84). | S | — | WEAP-003/004/018 |

## 6. Weapon and unit abilities

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 6.1 | [BLAST]: +1 attack per 5 models. | Adds a **[BLAST X]** form (+X per 5) (p79). | S | — | WEAP-006 |
| 6.2 | — | New **[CLEAVE X]**: when a melee weapon puts all its attacks into one unit, +X attacks per 5 models in it (p79). | S | — | new |
| 6.3 | [LETHAL HITS]: a critical hit always auto-wounds. | Auto-wound becomes **optional** per critical, so you can roll for a critical wound and trigger Devastating Wounds (p82). Needs a policy flag or a prompt. | S | — | WEAP-010/011 |
| 6.4 | [PSYCHIC]: tag only. | Psychic attacks may ignore any modifiers to BS/WS and to the hit roll (p84). | S | — | WEAP-030 |
| 6.5 | [PRECISION]: pick a visible CHARACTER per wounding attack. | Before allocation order is declared, the attacker may make a visible CHARACTER's group the current group until it dies or the attacks end (p84). Rides on 5.6. | S (with 5.6) | — | WEAP-025/026, LEAD-013/015, SHOOT-050 |
| 6.6 | [EXTRA ATTACKS]: its A can't be changed unless a rule names the weapon. | The core text only says to select all Extra Attacks weapons plus one other melee weapon if possible (p81). The A-modifier restriction isn't stated. | S | — | WEAP-027/028 |
| 6.7 | [ONE SHOT]. | Adds rules for revived models and newly added units (p83). | S | — | WEAP-029 |
| 6.8 | Fights First: every model has it. | Same (p81). Charging, Heroic Intervention and Counteroffensive now all grant it (see 7.6, 9.6, 9.7). | — | — | — |
| 6.9 | — | New core abilities and keywords: **Hover** (no −2" when taking to the skies), **Super-heavy Walker** (walks through models and short terrain, may become MOBILE at a battle-shock risk), **Support** (a second attachment slot, see 8.1), and the keywords TOWERING, SWARM, MOBILE and EXPLOSIVES (p84–85, p48). Only needed when a roster uses them. | S each | — | — |

## 7. Charge phase

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 7.1 | Declare targets (within 12"), then roll 2D6 (`declareCharge` with `targets`, `doDeclareCharge`, `doChargeRoll`). | Declare **without** targets, roll, then choose targets that are within 12" **and** within the rolled distance. The move is optional even if it's possible (p36–37). | M | types.ts / actions.ts (`declareCharge` payload; new target-pick decision after the roll), events.ts | CHARGE-004/005/006/007/009/031 |
| 7.2 | Each model must end in **base contact** if it can (R-8.5, `couldReachBaseContact`, `planChargeMove`). | Each model must end **within 1"** of a charge target if it can, and **engaged** if it can (p37). The unit must still end engaged with every target and with no other enemy. | M | — | CHARGE-010/011/012, FIGHT-RANK-005 |
| 7.3 | Fire Overwatch can trigger when a charge move starts or ends; feasibility is re-checked after casualties (`charge.moveStarted`, `doChargeOverwatch`, `drainChargeOverwatch`). | No Overwatch in the Charge phase at all (p57). Delete the window and the re-check path. | S (deletion) | — | CHARGE-016/017/018/021/022 |
| 7.4 | Heroic Intervention after each enemy charge (`charge.moveEnded` reaction, `consumeHeroicFor`). | Once, at the **end** of the opponent's Charge phase (see 9.6). | M | data `TimingWindowId` (`charge.end`) | CHARGE-023/024/025 |
| 7.5 | Tank Shock at `charge.moveEnded`. | Replaced by **Crushing Impact** (see 9.4). | S | — | CHARGE-026/027 |
| 7.6 | Fights First after a Charge move, except Heroic Intervention (R-8.6). | Every charge move grants Fights First, including Heroic Intervention (p37). | S | — | FIGHT-008, CHARGE-023 |

## 8. Leaders and attached units

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 8.1 | One Leader per bodyguard, attached at Declare Battle Formations (R-10.1, `leaders.ts` `canAttach`, `attachOptions`). | Attachment happens in **Muster Armies**. A bodyguard may take one **Leader and one Support** unit (p66). | M | types.ts (`PlayerSetup` attachment shape) | LEAD-001/002/003 |
| 8.2 | When the bodyguard or the leader is wiped out, the survivor **splits off** as its own unit with its own SS; "unit destroyed" fires for that half (`leaders.detach`, `pendingDetach` in `attack.ts`, copying in `hooks-impl.ts`). | **No split.** It stays one unit until the last model that started in it dies, and only then do "unit destroyed" rules fire. Each ability lasts while its source part (leader, bodyguard, or a specific model) has a model alive; a leader keeps its "while leading" abilities after the bodyguard dies (p66–67). Removes the detach machinery and changes kill and VP attribution for missions (e.g. "destroy a CHARACTER unit"). | L | types.ts (Unit partner/canonical fields), events.ts (`UnitDestroyed` semantics) | LEAD-006/007/008/009/012, SHOOT-048, CMD-009, MISSION kill-credit ids |
| 8.3 | Wound against the bodyguard's T for the whole volley (R-6.12). | Use the **highest** T among bodyguard models; if only leaders are left, the highest leader T (p66). | S | — | SHOOT-049, LEAD-005 |
| 8.4 | Keywords per model. | The attached unit has every keyword of its parts, so unit-keyword rules such as Anti-X apply to the whole unit; models don't gain each other's keywords (p67, p87). | S | — | WEAP-014/015 (new attached case) |

## 9. Stratagems

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 9.1 | Same stratagem at most once per phase per player (`stratagems.ts` `limitUsed`). | Kept. New: a player **can't target the same unit with two stratagems in one phase** unless the stratagem says so (p54). That includes Command Re-roll after another stratagem on the same unit. | M | — | STRAT-003/004/006, CMD-024 |
| 9.2 | Flat cost (`effectiveCost`, `pay`). | Stratagems can have optional **extra-cost sections** (e.g. +1CP for an extra mode) (p54–55). Needs a cost field per option in `StratagemData` (`src/data/types.ts`) and a mode pick. Errata: "free" effects become −1CP (we already normalise this). | S | — | STRAT-002 |
| 9.3 | Core list in `src/data/core/stratagems.json`: Command Re-roll, Counter-offensive, Epic Challenge, Insane Bravery, Grenade, Tank Shock, Rapid Ingress, Fire Overwatch, Go to Ground, Smokescreen, Heroic Intervention. | New list (p56–57). **Removed**: Go to Ground, Tank Shock, Grenade. **Added**: Explosives and Crushing Impact. The rest are reworked as in 9.4–9.8. | M (data + code hooks) | — | STRAT-011/014/015/018/034, CMD-025 |
| 9.4 | Tank Shock (VEHICLE, dice = T, 5+ = MW, max 6). Grenade (GRENADES). | **Crushing Impact**: MONSTER or VEHICLE, just after its charge move; dice = T; each 5+ is a MW on the enemy (max 6), and **each 1 is a MW on your own unit**. **Explosives**: EXPLOSIVES or GRENADES unit, unengaged, eligible to shoot, didn't advance; enemy unengaged, visible, within 8"; 6D6, 4+ each (p56). | S each | — | CHARGE-026/027, STRAT-011/018/030 |
| 9.5 | Fire Overwatch: when an enemy starts or ends a move, is set up, or charges; target within 24"; hits on 6s; once per turn (`overwatchTargets`, `drainOverwatch`, four windows). | **Only at the end of the opponent's Movement phase.** Pick one unengaged friendly unit (not TITANIC); it **snap shoots** one visible enemy within 24", hitting only on unmodified 6s, with **no hit re-rolls** (p57). The `movement.moveStarted`, `unitMoved` and `reinforcements` windows lose their Overwatch use, and so does the RC-010 casualty path. | M | data `TimingWindowId` (windows retire) | CHARGE-016/017/018/019/020/021/022, MOVE-010b/036, STRAT-019/034, SHOOT-040 |
| 9.6 | Heroic Intervention: own unit within 6" of the enemy that just charged; charges only it; no Fights First. | End of the opponent's Charge phase. Any unengaged unit within 12" of an enemy (VEHICLE only if CHARACTER or WALKER). Choose a mode before rolling. **Leap to Defend**: may only target units that charged this phase. **Into the Fray** (+1CP): roll capped at 6, may target anything within 6". Fights First applies (p57). | M | — | CHARGE-023/024/025, FIGHT-008, STRAT-017 |
| 9.7 | Counter-offensive: either player, 2CP, the chosen unit fights next (RC-040). | 2CP, only in the **opponent's** Fight phase, after an enemy unit attacks. The unit gains **Fights First** for the phase and must be your next pick (p57). Rides on the new fight order (10.3). | S | — | FIGHT-025/026 |
| 9.8 | Epic Challenge needs a CHARACTER in ER of an enemy attached unit. Smokescreen at `shooting.targetsDeclared` gives cover and Stealth. Rapid Ingress at end of opponent's Movement. Command Re-roll list. Insane Bravery once per battle. | Epic Challenge: just after **any** friendly CHARACTER unit is selected to fight; no attached-enemy condition. Smokescreen: at the **start** of the opponent's Shooting phase; cover for the SMOKE unit **and** any unit it hides from view; no Stealth. Rapid Ingress: an ingress move (not AIRCRAFT, not round 1). Command Re-roll: "hazard roll" replaces Desperate Escape test; charge rolls are re-rolled whole. Insane Bravery: unchanged (p56–57). | S each | — | FIGHT-027, STRAT-016/020/033, STRAT-006/012 |
| 9.9 | Errata (Universal Rules Updates v1.1). | (a) Stratagems that bring back a destroyed unit as a new copy become once per battle. (b) Permission to reuse a stratagem in a phase, or to ignore a per-turn/round/battle limit, only counts if the rule names the stratagem. (c) 12" "can't be shot from beyond" shields become 18". (d) Disembark after a normal-moving transport plus charge permission → assault disembark; disembark from an advanced transport → shock disembark. | S | — | faction ids using `ignoresLimit`, AST "next wave" ids |

## 10. Fight phase

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 10.1 | Each activation runs pile-in → targets → attacks → consolidate (`fight.ts` `driveFightUnit`, `doPileIn`, `doConsolidate`; `FightSubStep`). | The phase becomes **steps** (p38–42). A **Pile In step**: every eligible unit may pile in once, active player's units first, then the opponent's. A **Fight step**: units are picked and attack, with no movement. A **Consolidate step**: every unit that was eligible to fight may consolidate once, active player first. Windows `fight.unitSelected`, `fight.beforeConsolidate` and `fight.attacksResolved` shift meaning. | L | types.ts (`FightSubStep`, phase state), data `TimingWindowId` | FIGHT-001/010/011/012/013/014/019/022/023/033/034/035, FIGHT-RANK-*, STRAT-024, WOR Unstoppable Fury ids |
| 10.2 | Pile-in: 3" closer to the closest enemy, base contact if possible, must end in ER (R-9.5). | Eligible if engaged, if it charged, or for an overrun fight. Targets are every enemy it's engaged with, or else any enemies within 5". Models already in base contact stay put. Each moved model ends closer to the closest target and engaged if possible. Any model that started engaged with a unit must still be engaged with it (p38). | M | — | FIGHT-010/011/012/013, FIGHT-007 |
| 10.3 | Fights First step, then Remaining Combats; the **non-active** player picks first; a Fights First unit that becomes eligible late fights in step 2 (R-9.1, R-9.3, `eligibleFighters`, `doFightSelect`). | The **active** player picks first. Whenever a Fights First unit becomes eligible during Remaining Combats, play **goes back** to the Fights First step (p40). A player may pass if all their eligible units are more than 5" from every enemy; two passes in a row end the step (p87). | M | — | FIGHT-002/003/009 |
| 10.4 | Eligible: in ER, or charged this turn (R-9.2). | Eligible: engaged now, engaged at the start of the Fight step, or charged. Two fight types (p40). **Normal fight**: the unit is engaged. **Overrun fight**: the unit is unengaged, or became engaged mid-step; it makes an extra pile-in, then fights (it can drag in fresh enemies, who then become eligible). | M | types.ts / actions.ts (fight type) | FIGHT-006/007/021/024 |
| 10.5 | A model can attack if in ER, or touching a teammate who touches the enemy (R-9.6, R-9.8, `fightEligibility.ts` `fightingModelIds`). | Each melee weapon's targets must be **engaged with that model** (within 2"). No base-contact chain. A weapon can split between at most A target units (p16–17). | M | — | FIGHT-015/016/018, FIGHT-RANK-001..008 |
| 10.6 | Consolidate: 3" toward the closest enemy; else toward the closest objective, only if it ends in range (R-9.10). | Three **modes**, taken in order, each mandatory if it applies (p42). **Ongoing** (engaged): models in contact stay; others close in; must stay engaged. **Engaging** (an enemy within 3"): must end engaged with every chosen enemy; any of those that hasn't fought is **picked by the opponent and fights right away**. **Objective** (an objective within 3"): end in range if possible, otherwise closer. | M | — | FIGHT-022/023/024 |
| 10.7 | Must fight with every eligible unit; can't pass (FIGHT-003). | Must fight, except for the >5" pass in 10.3. Pile-in and consolidation are optional (p38). | S | — | FIGHT-003 |

## 11. New core concepts

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 11.1 | No action framework. | **Actions** (p58): a unit starts one at a set time and completes it later. Units that can't start one: shocked, OC 0 or –, engaged (unless TITANIC), advanced or fell back, or already started one this turn. Starting one bars shooting and charging for the turn. Moving or leaving the board cancels it. Every shooting type and every fall-back or advance flag feeds into this. Needs per-unit action state and a mission-data hook (the missions agent owns the actions themselves). | M | types.ts (Unit action state), actions.ts, events.ts | new; MISSION ids |
| 11.2 | Visibility = true LoS plus ruin footprint blocking (R-3.7). | **Hidden**: an INFANTRY/BEASTS/SWARM model in a terrain area with a dense feature, whose unit made no ranged attacks this turn or last turn, can only be seen from within **15"**. **Obscuring** areas block sight lines that cross them. **Solid** dense features block sight through gaps 3" or lower (p50). The terrain agent covers the data; the engine needs `los.ts` `unitVisible` support and a two-turn "made ranged attacks" history (today `shotThisTurn` only covers this turn). | M | types.ts maybe (shot history) | LOS-001..012, LOS-031 |
| 11.3 | Combat Patrol "secured" rule and Duty-and-Honour stickiness are mission code. | **Secured objectives** and control **checked at the end of every phase and turn** are now core (p52). Objective markers may be ended on (p88). Mostly the missions agent's job; the `objectives.ts` timing hooks are shared. | S | — | LOS-029, MISSION control-timing ids, STRAT-021 |

## 12. Pre-battle hooks that touch the core loop

| # | Ours (10th) | 11th | Size | Contract | Checklist |
|---|---|---|---|---|---|
| 12.1 | P5 Declare Battle Formations holds attachments, reserves and embarks (`createGame`, `GameSetup`). | Attachments move to Muster Armies; reserves and embarks stay in Declare Battle Formations; Scouts and pre-battle abilities run after that (p66, p84, p88). Mostly a reorder of the `GameSetup` fields. | S | types.ts (`PlayerSetup`) | LEAD-001, MOVE-032 |

## 13. Things outside this list that will be pulled in

- Patrol and faction rules written in 10th terms (cover +1 save, Overwatch on charge, Go to Ground, "surge must stay
  out of ER", 1" engagement). A sweep of `src/engine/factions/*.ts` and `code-hooks.ts` will be needed once each core
  item lands; that sweep is not counted below.
- `src/ai/*` (stratagem policy, charge and fight planners) and `src/client` (move previews, cover badges, fight-step
  HUD) follow every L item.
- `engineVersion` major bump: 5.4, 5.6, 5.14 and 10.1 change the RNG draw order, so existing saves and recorded
  sim games stop replaying.

---

## Unclear / needs owner call

1. **Which edition do we target?** These core rules assume 11th matched-play missions and terrain areas. Our patrols,
   missions and datasheets are 10th Combat Patrol. Is there an 11th Combat Patrol pack, or do we run 11th core
   with 10th CP missions and datasheets? Either way, choose between a hard switch and a ruleset flag that keeps 10th
   playable (a flag costs about 30% more, mostly in tests).
2. **Hit-modifier cap.** The core PDF never states the ±1 cap on hit and wound modifiers, or whether BS changes
   (cover −1, Plunging Fire +1) count toward it. That text lives in the app ("Modifying Dice Rolls"). We need the app wording
   before 5.5 and 5.8.
3. **CP gain cap** (at most 1 extra CP per round) isn't in the core text. Keep it, drop it, or follow the CP mission pack?
4. **Missing pieces referenced but not supplied:** the assault and shock disembark moves (18.06/18.07, from the
   errata), the Extra Attacks A-modifier rule, and whether Precision still lets Devastating-Wounds mortal wounds land
   on a CHARACTER. Mortal wounds now follow the fixed order in 5.13, which suggests it doesn't.
5. Owner preference on 6.3 (optional Lethal Hits): prompt the player, or auto-pick the better choice?

## Rough effort

Count: 87 numbered items. **L: 6** (1.1, 3.1, 5.6, 5.8, 8.2, 10.1). **M: 30**. **S: 46**. **5** need no change.

At lean pace, an L item is about 2–3 workflow stages, an M about 1 stage, and 4–5 S items fit in one stage. That
gives roughly **15 + 30 + 10 ≈ 50–55 engine stages** for the core alone. Several M items share code with an L item
(5.5 with 5.8, 6.5 with 5.6, 10.2–10.6 with 10.1), so batching them could save about 10 stages. The faction-rule sweep, AI and client
follow-ups in §13 come on top, plausibly another 50–80% again. Suggested order (each step stays playable):
(1) ER 2", coherency, 8" distances, pivot and M/V movement; (2) hazard roll primitive, battle-shock persistence,
fall-back modes; (3) cover/BS and allocation groups; (4) fight-phase steps; (5) movement unification (ingress,
disembark); (6) core stratagem set; (7) attached-unit no-split; (8) charge target-after-roll and the shooting types;
(9) Hidden and actions.
