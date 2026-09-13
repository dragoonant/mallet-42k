# 10 — Core rules (10th edition, as used in Combat Patrol)

Own-words specification of the mechanics the engine implements. Rule ids `R-<section>.<n>` are stable and are
cited by 12-rules-test-checklist. Source: wahapedia.ru core rules page (accessed 2026-09-12). Where the source
is ambiguous the chosen interpretation is marked **[interp]**. Coordinates follow 00-architecture §7
(1.0 = 1", XZ board plane, Y up, x ∈ [−22,22], z ∈ [−15,15]).

## 0. Vocabulary

| Term | Meaning |
|---|---|
| model | one base with stats; belongs to exactly one unit |
| unit | group of models activated together; Starting Strength (SS) = model count when added to the army |
| active player | the player whose turn it is |
| within N" | distance ≤ N (inclusive) |
| wholly within | every part of every base of the unit/model is within the region |
| horizontal distance | base-edge to base-edge gap projected on XZ (00-arch §7 `h`) |
| vertical distance | `|Δy|` of base contact heights |
| distance (plain) | `sqrt(h² + v²)` — used for all ranges/measurements unless a rule says "horizontally" |
| unmodified roll | die face after any re-roll, before modifiers |
| critical hit / wound | unmodified 6 on the hit / wound roll (Anti-X can lower the wound threshold) |
| ER | Engagement Range |
| DZ / NML | deployment zone / no man's land |

## 1. Battle structure

| Id | Rule |
|---|---|
| R-1.1 | A battle is 5 battle rounds (Combat Patrol). Each round: player 1 takes a full turn, then player 2. The same player goes first every round. |
| R-1.2 | Turn = phases in fixed order: Command → Movement → Shooting → Charge → Fight. A phase with nothing to do is still entered (windows may open) and then exits. |
| R-1.3 | Simultaneous rule triggers during the battle: active player chooses order. Outside a turn (start/end of round, pre-battle): roll-off, winner chooses. Engine: windows `round.start`, `round.end`, `battle.end` are offered to the first-turn player, then the second **[interp: no roll-off — no conflicting simultaneous triggers exist in the CP rosters]**. |
| R-1.4 | Roll-off: each player rolls 1D6; higher wins; ties re-roll. Never modified or re-rolled. |
| R-1.5 | D3 = ceil(D6/2). "xDy" = sum of x dice. A re-roll of a multi-die roll re-rolls all dice of it unless stated. |
| R-1.6 | A die is never re-rolled more than once. Re-rolls happen before modifiers. |
| R-1.7 | Persisting effects ("until end of turn" etc.) survive the affected unit splitting (leader/bodyguard) and apply to each resulting unit. |
| R-1.8 | Out-of-phase actions (e.g. Overwatch shooting in the opponent's turn) grant only the named action; other rules keyed to "your Shooting phase" do not trigger and phase-specific stratagems cannot be used. |
| R-1.9 | Game state characteristic floors/caps after all modifiers: M ≥ 1"; T ≥ 1; Sv never better than 2+; Ld between 4+ and 9+; OC ≥ 0; weapon Range ≥ 1"; A ≥ 1; WS/BS never better than 2+; AP never worse than 0 (i.e. AP is 0 or negative); D ≥ 1 unless a rule sets it to 0. |
| R-1.10 | Random characteristics: a unit's random M is rolled once per unit when it moves; every other random value (A, D, etc.) is rolled per model/weapon/attack each time it is needed. |

## 2. Measurement, Engagement Range, coherency

| Id | Rule |
|---|---|
| R-2.1 | Model-to-model distance is measured base edge to base edge (00-arch §7). Distances to objective markers: from the nearest point of the 40 mm marker disc. |
| R-2.2 | Players may measure anything at any time (the engine exposes a measure query; no hidden distances). |
| R-2.3 | Two models are within ER of each other when horizontal gap `h ≤ 1` and vertical gap `v ≤ 5`. Two units are within ER when any model of one is within ER of any model of the other. |
| R-2.4 | A model may not be set up, nor end a Normal, Advance or Fall Back move, within ER of an enemy model. If it cannot comply it is destroyed (edge case: forced set-ups). |
| R-2.5 | Coherency (units of 2–6 models): every model must be within 2" horizontally and 5" vertically of ≥1 other model of its unit. Units of 7+ models: ≥2 other models. Checked when set up and at the end of any kind of move. A move that would break coherency is illegal (reject, positions unchanged). |
| R-2.6 | End of every turn (both players): for each unit not in coherency the owner removes models one at a time until one coherent group remains. Removed models count as destroyed but trigger no "when destroyed" rules. |
| R-2.7 | Coherency uses the current model count (a 10-model unit reduced to 6 needs only 1 neighbour). |
| R-2.8 | Vertical distance counts for coherency/ER exactly as stated; "wholly within N" of X" is evaluated with plain distance from every point of the base. |

## 3. Visibility, terrain, Benefit of Cover

### 3.1 Line of sight
| Id | Rule |
|---|---|
| R-3.1 | Visibility is true line of sight from the observing model: model B is *visible* to model A if any part of B (body or base) can be seen from any part of A. Engine: raycasts between LoS sample points (00-arch §7), blocked by terrain per §3.2 and by models of other units (friendly or enemy) but never by models of the observer's own unit. |
| R-3.2 | Unit visible to A ⇔ ≥1 of its models visible to A. |
| R-3.3 | Model B is *fully visible* to A if every part of B facing A is visible (no terrain or other-unit model occludes any sample point). Engine: all of B's sample points are visible from at least one of A's sample points **[interp]**. |
| R-3.4 | Unit fully visible to A ⇔ every model of it fully visible to A; models of the observed unit do not block each other for this test. |
| R-3.5 | Terrain features cannot be targeted. |

### 3.2 Terrain categories
| Category | Keywords | Movement | Visibility | Cover condition (ranged attack allocated to a model) |
|---|---|---|---|---|
| Crater / rubble | AREA TERRAIN, CRATER | move over freely (height ≤ 2") | normal | INFANTRY model wholly on the feature |
| Barricade / fuel pipe | OBSTACLE, BARRICADE | may cross (up/over/down); may not be set up or end a move on top | normal | INFANTRY model wholly within 3" of it AND not fully visible to every attacking model because of it |
| Debris / statuary | OBSTACLE, BATTLEFIELD DEBRIS | as barricade | normal | model not fully visible to every attacking model because of it |
| Hill / container / sealed building | HILL | may stand on top if base does not overhang; other terrain may sit on a hill | normal | model not fully visible to every attacking model because of it |
| Woods | AREA TERRAIN, WOODS | move over freely | a model wholly within is never fully visible; a model that must look through/over the woods never sees the target fully visible (except AIRCRAFT/TOWERING) | model wholly within, OR not fully visible to every attacking model because of it |
| Ruins | AREA TERRAIN, RUINS | INFANTRY (and BEAST, FLY for floors) pass through walls/floors as if absent but may not end inside a wall/floor; INFANTRY/BEAST/FLY may end on upper floors if base does not overhang; all others ground floor only | see R-3.7 | model wholly within, OR not fully visible to every attacking model because of it |

| Id | Rule |
|---|---|
| R-3.6 | Footprint: every AREA TERRAIN feature has an agreed ground-level polygon. "Wholly within" a feature = whole base inside the footprint polygon (any floor). |
| R-3.7 | Ruins block visibility across them: a model outside a ruin cannot see through or over that ruin's footprint to a model on the far side, even through windows/gaps (engine: the ruin footprint prism, full height + open top, blocks rays whose start and end are both outside the footprint, except AIRCRAFT). Models see *into* a ruin normally, models wholly within see *out* normally, and models within a ruin are seen normally. A model on an upper floor still "sees out" normally. |
| R-3.8 | Plunging Fire (ruins): a model wholly within a ruin and ≥ 6" above ground level making a ranged attack whose target unit is entirely at ground level: improve AP by 1 (e.g. 0 → −1). |
| R-3.9 | Barricade ER exception: charging a unit within 1" of a barricade from the other side succeeds if the charger ends as close as possible to the barricade and within 2" of the target; in the Fight phase units/models within 2" of each other across a barricade count as in ER for eligibility and attacks. |
| R-3.10 | Objective markers may sit on terrain; never on an impassable part; models may move over markers but not end on one. |

### 3.3 Benefit of Cover
| Id | Rule |
|---|---|
| R-3.11 | A model with Benefit of Cover adds +1 to its **armour** save against a **ranged** attack. Never applies to invulnerable saves; never to melee. |
| R-3.12 | Exception: a model with Sv 3+ or better gets no cover bonus against an attack with AP 0. (Terminator 2+ vs AP0: no bonus; vs AP−1: bonus applies.) |
| R-3.13 | Not cumulative; cover is a boolean per attack. Saving throws can never be improved by more than +1 in total from any sources (cover + others). |
| R-3.14 | Cover is evaluated per attack when it is allocated, against "every model in the attacking unit" for the not-fully-visible tests. [IGNORES COVER] removes it; Go to Ground / Smokescreen / Indirect Fire grant it. |

## 4. Command phase

| Id | Rule |
|---|---|
| R-4.1 | Step 1 (Command): both players gain 1 CP. Then resolve other Command-phase rules (mission scoring, Oath of Moment target, etc.). |
| R-4.2 | CP gain cap: apart from that automatic 1 CP, each player can gain at most 1 additional CP per battle round from all other sources combined. Extra gains are lost. |
| R-4.3 | Step 2 (Battle-shock): for every unit of the active player on the battlefield that is Below Half-strength, roll 2D6; pass if total ≥ the best (lowest) Ld in the unit; otherwise the unit is Battle-shocked until the start of that player's next Command phase. Tests are taken one unit at a time in an order chosen by the owner (Insane Bravery window before each). |
| R-4.4 | Below Half-strength: SS ≥ 2 → current models < SS/2 (10 → ≤4; 5 → ≤2; 6 → ≤2). SS = 1 → remaining wounds < W/2 (W7 → ≤3; W6 → ≤2). |
| R-4.5 | Attached unit SS = leader SS + bodyguard SS; when either part is destroyed the survivor reverts to its own SS. |
| R-4.6 | Effects while Battle-shocked: (a) OC of all its models = 0; (b) if it Falls Back every model takes a Desperate Escape test; (c) its owner cannot target it with stratagems; (d) it cannot make "surge" moves; (e) cannot count for CP-mission "secured"/BATTLELINE conditions (see 11). All models in the unit are Battle-shocked. |
| R-4.7 | A Battle-shock test forced by another rule (e.g. Piston-driven Brutality, Bestial Bellow) uses the same 2D6 ≥ Ld procedure and the same duration (until the start of the owner's next Command phase). Modifiers to "the result" apply to the 2D6 total. |
| R-4.8 | A unit already Battle-shocked that fails again simply remains Battle-shocked (duration resets to the later expiry) **[interp]**. |
| R-4.9 | Leadership test (generic) = same 2D6 ≥ best Ld procedure. |

## 5. Movement phase

### 5.1 Move units
| Id | Rule |
|---|---|
| R-5.1 | Units are selected one at a time; each unit moves once. Not in ER of enemies: Normal move / Advance / Remain Stationary. In ER: Remain Stationary / Fall Back only. Engine sequence per unit: `chooseUnitToActivate` → `declareMove` (type; Advance die rolled) → window `movement.moveStarted` (opponent: Fire Overwatch) → `moveUnit` (placements) → window `movement.unitMoved`. Remain Stationary opens no `moveStarted` window. |
| R-5.2 | Normal move: each model moves ≤ M along any path of straight segments; may not enter ER of any enemy model at any point; may pass through friendly models (except MONSTER/VEHICLE through other MONSTER/VEHICLE) but not end overlapping any model; may not cross the board edge; may not pass through enemy models. Pivot cost: models not on a round base (non MONSTER/VEHICLE) 1", MONSTER/VEHICLE not on round base 2", VEHICLE on round base >32 mm with flying stem 2", all others 0" — applied once per move on first pivot. Engine: all CP box models are on round/oval bases → pivot cost 0 except Deffkoptas (oval VEHICLE with flight stem → 2") **[interp: oval counts as "not round"]**. |
| R-5.3 | Advance: roll 1D6 once per unit, add to M for every model for the rest of the phase; then move as Normal. The unit cannot shoot (except Assault weapons) nor declare a charge this turn (except under Waaagh!). |
| R-5.4 | Remain Stationary: no model moves; enables Heavy +1. A unit that disembarked this turn cannot Remain Stationary. |
| R-5.5 | Fall Back: each model moves ≤ M and may pass through/within ER of enemies but must end outside ER of all enemy models; if no model can, the unit cannot Fall Back. Cannot shoot or charge this turn (Brutal but Kunnin' overrides charge). |
| R-5.6 | Desperate Escape: after `declareMove` (Fall Back) and its `movement.moveStarted` window, before any model moves, roll 1D6 for each model that will cross an enemy model's base (not TITANIC, not FLY); if the unit is Battle-shocked roll for every model. Each 1–2 destroys one model of the unit chosen by the owner. A model triggers at most one test per phase **[interp: the crossing set is taken from the submitted paths; the engine asks for paths first, then rolls, then applies the move]**. |
| R-5.7 | Moving over terrain: features ≤ 2" tall are ignored. Taller features are climbed: the vertical distance up and down counts toward the move (Manhattan: horizontal path + |Δy| segments). Cannot end mid-climb (base must rest on a floor/ground). Walls of ruins are impassable to non-INFANTRY/BEAST/FLY. |
| R-5.8 | FLY: when making Normal/Advance/Fall Back moves can cross enemy models and enter ER during the move, but cannot end on a model or in ER; measures the straight-line 3D path ("through the air") when starting or ending on terrain; still cannot end mid-air. FLY models never take Desperate Escape tests for crossing enemies. |
| R-5.9 | Surge moves (out-of-phase moves granted by abilities, e.g. Krump da Gitz; data `Effect.move.kind: surge`): max one per unit per phase; not while Battle-shocked; not while in ER; may not end in ER. "As close as possible to X" = `MoveConstraints.asCloseAsPossibleTo`: every model ends at the minimum distance to X reachable within its allowance while keeping coherency and the ER rule. |
| R-5.10 | A model's movement path is validated as: total length ≤ allowance; no segment enters a forbidden region; end position legal (no overlap, coherency, ER rule). Engine may accept a polyline path per model; distance = sum of segment lengths (+ climb) + pivot cost. |

### 5.2 Reinforcements / Reserves
| Id | Rule |
|---|---|
| R-5.11 | Units declared in Reserves at Declare Battle Formations arrive in the Reinforcements step (after all moves). Distances "away from enemy models" for set-up are horizontal only. |
| R-5.12 | An arriving unit counts as having made a Normal move (cannot move further this phase, may shoot, charge, fight; Heavy bonus not available). |
| R-5.13 | Deep Strike: unit with every model having the ability may start in Reserves; arrives anywhere on the battlefield > 9" horizontally from all enemy models, in coherency, not overlapping, wholly on the board; if it cannot be placed legally it stays in Reserves. |
| R-5.14 | Combat Patrol limits: Reserves never arrive in round 1; any Reserves unit not on the battlefield at the end of round 3 is destroyed (and units embarked in it). Rapid Ingress cannot bypass R-5.14. |
| R-5.15 | Strategic Reserves (not used by CP rosters; retained for scale-up): declared pre-battle, ≤ 25 % of points; arrive round 2+ wholly within 6" of any board edge (round 2: not inside enemy DZ), > 9" horizontally from enemies; Deep Strike units may use either method. |
| R-5.16 | Reserves units not on the battlefield when the battle ends count as destroyed (for "destroyed" secondary scoring). |

### 5.3 Transports (no transport in either CP box; implement lazily)
| Id | Rule |
|---|---|
| R-5.17 | Embark: after a Normal/Advance/Fall Back move, if every model ends within 3" of a friendly TRANSPORT with capacity, the unit may embark (removed from board). Not if it disembarked this phase. Embarked units do nothing and are unaffected. |
| R-5.18 | Disembark: only a unit that began the Movement phase embarked; set up wholly within 3" of the transport, outside ER, else cannot. Transport stationary or not yet moved → unit acts normally (must move or advance; cannot Remain Stationary). Transport already made a Normal move → unit counts as having made a Normal move, cannot move further or charge. Transport Advanced/Fell Back → no disembark. |
| R-5.19 | Firing Deck x: when the transport shoots, pick up to x embarked models whose units have not shot; one ranged weapon each (not [ONE SHOT]); the transport fires them; those units are then not eligible to shoot this phase. |
| R-5.20 | Destroyed transport: Deadly Demise rolled first; embarked units disembark wholly within 3" outside ER, roll 1D6 per model, each 1 = 1 mortal wound to the unit; the unit is Battle-shocked until its next Command phase, counts as having made a Normal move and cannot charge this turn. Emergency disembark if 3" impossible: wholly within 6", mortal wound on 1–3, models that still cannot be placed are destroyed. |

### 5.4 Aircraft
Neither CP box contains AIRCRAFT; out of scope for the engine until a roster needs it. Summary for later: start in Reserves as Strategic Reserves; must move ≥ 20" straight then may pivot ≤ 90°; leave the board → back to reserves and return next turn; only FLY units can charge/fight them; ignored for ER of ground units; pile-in/consolidate ignore them.

## 6. Shooting phase

### 6.1 Sequence
| Id | Rule |
|---|---|
| R-6.1 | Active player selects eligible units one at a time; each shoots once. Eligible unless it Advanced (unless it has Assault weapons — then only Assault weapons fire) or Fell Back this turn. A unit with no legal target for any weapon cannot be selected. |
| R-6.2 | Locked in combat: a unit in ER of an enemy is not eligible (exceptions: Pistols, MONSTER/VEHICLE). An enemy unit in ER of any friendly unit cannot be targeted (exceptions: the enemy is MONSTER/VEHICLE; the shooter uses Pistols against a unit it is in ER of). |
| R-6.3 | Big Guns Never Tire: MONSTER/VEHICLE units may shoot while in ER and may target units they are in ER of; each of their ranged attacks gets −1 to hit if the unit was in ER when targets were selected, unless the weapon is a Pistol. Enemy MONSTER/VEHICLE in ER of friendly units may be targeted; attacks against it get −1 to hit unless Pistol. Note: a non-MONSTER/VEHICLE unit in ER of a MONSTER/VEHICLE still cannot shoot it (unless via Pistols). |
| R-6.4 | Select targets: for every ranged weapon of every model, declare a target unit (and profile, and pistol-vs-other choice) before any dice. A weapon may target a unit only if ≥1 model of that unit is within the weapon's Range of the firing model AND visible to the firing model (Indirect Fire waives visibility; Lone Operative caps range at 12"). One weapon → one target; different weapons/models may split. |
| R-6.5 | Attack count per weapon = A (roll random A per weapon; Blast/Rapid Fire adjust). |
| R-6.6 | Resolution order: all attacks against one target before the next target; within a target, all attacks sharing a weapon profile are resolved together before another profile. Attacks are still made even if the target became out of range/not visible after selection. Devastating-Wounds critical attacks are allocated after all other attacks by that unit against that target. |
| R-6.7 | Pistol: a model with Pistols shoots either its Pistols or all its non-Pistol weapons (MONSTER/VEHICLE: both). A unit in ER may shoot only Pistols and only at one unit it is in ER of. |
| R-6.8 | Stealth: every model in the target unit has it → −1 to hit for ranged attacks against it. |
| R-6.9 | Lone Operative: unless attached to a unit, can be targeted by a ranged attack only if the attacking model is within 12". |
| R-6.10 | After a unit resolves all attacks: Hazardous tests (R-7 Hazardous), then `shooting.attacksResolved` window. |

### 6.2 Attack sequence (one attack)
| Step | Id | Rule |
|---|---|---|
| 1 Hit | R-6.11 | Roll 1D6. Success if modified result ≥ BS (ranged) / WS (melee). Unmodified 6 = critical hit, always hits. Unmodified 1 always misses. Net hit modifier is clamped to [−1, +1] before comparison. Torrent skips the roll (auto-hit, not a critical). |
| 2 Wound | R-6.12 | Roll 1D6; compare attack S with target T (attached unit: bodyguard T for the whole shooting unit's attacks): S ≥ 2T → 2+; S > T → 3+; S = T → 4+; S < T → 5+; S ≤ T/2 → 6+. Unmodified 6 = critical wound, always wounds; unmodified 1 always fails; net modifier clamped to [−1, +1]. Lethal Hits critical hit skips this step (auto-wound, not a critical wound). |
| 3 Allocate | R-6.13 | Defending player allocates to one model: if any model in the unit has already lost wounds (at any time — `woundsRemaining < W`, no per-phase reset) or had an attack allocated this phase, it must be that model (if several such exist, owner chooses among them **[interp]**); otherwise any model. Visibility/range of the chosen model is irrelevant. CHARACTER models in an attached unit cannot be chosen while a bodyguard model remains (unless Precision). |
| 4 Save | R-6.14 | Owner chooses armour or invulnerable save (never both). Armour: roll 1D6, add AP (negative), add +1 if Benefit of Cover applies, clamp total improvement to +1; success if ≥ Sv. Invulnerable: roll 1D6 unmodified by AP (other modifiers may apply) success if ≥ invuln value. Unmodified 1 always fails either save. Success ends the attack. Devastating-Wounds critical attacks allow no save. |
| 5 Damage | R-6.15 | Damage = D (roll per attack if random; Melta adds). The model loses that many wounds (Feel No Pain per wound, R-10.5); at 0 wounds it is destroyed and any excess damage from that attack is lost. |

### 6.3 Mortal wounds
| Id | Rule |
|---|---|
| R-6.16 | Each mortal wound = 1 damage, applied one at a time; no hit/wound/save of any kind; allocated like an attack (same "already wounded model first" rule); FNP applies. |
| R-6.17 | Excess mortal wounds carry over to the next model in the unit, except mortal wounds from Hazardous tests or from a Devastating Wounds critical: those are lost when the model they were allocated to is destroyed. |
| R-6.18 | When a unit's attacks include mortal-wound sources, all normal damage against the target is applied before the mortal wounds; mortal wounds "in addition to" an attack still apply if the normal damage was saved. Precision attacks may allocate their mortal wounds to a CHARACTER. |
| R-6.19 | Mortal wounds do not trigger Deadly Demise of the wounded model any differently; destruction by mortal wounds is destruction. |

### 6.4 Modifier bookkeeping
| Id | Rule |
|---|---|
| R-6.20 | Hit/wound modifiers: sum all applicable ±N, clamp to [−1,+1], add to the die. Re-rolls are decided on the unmodified die and applied before modifiers. "Re-roll 1s" means unmodified 1s. |
| R-6.21 | Save modifiers: AP applies fully (no clamp on penalties); total improvements clamp at +1. |
| R-6.22 | Overwatch shooting: hits only on unmodified 6 regardless of BS/modifiers; criticals still count as criticals. |
| R-6.23 | Indirect Fire vs. a target with no visible model: −1 to hit, unmodified 1–3 fail, target has cover. |
| R-6.24 | Optional re-rolls ("may re-roll": Oath of Moment, Unstoppable Valour, Twin-linked, `reroll: all`): a die whose modified result would fail is re-rolled automatically (never worse; no decision). A die that would succeed opens `chooseOption` topic `rerollOffer` (`data: {rollId, dieIndexes}`; options: one per re-rollable successful die + keep) only when the source allows re-rolling successes (`reroll: all`, Twin-linked); the player may decline. `reroll: ones` / `reroll: fails` never open a decision. R-1.6 still applies (each die at most once), so a die re-rolled here is not offered to Command Re-roll. Charge rolls: the 2D6 is re-rolled as a whole (R-1.5); Unstoppable Valour offers it when the total fails, and via `rerollOffer` when it succeeds. |

## 7. Weapon abilities

| Ability | Effect (engine) |
|---|---|
| [ASSAULT] | Unit that Advanced may still shoot, but only Assault weapons. |
| [HEAVY] | +1 to hit if the bearer's unit Remained Stationary this turn (a unit that arrived from Reserves did not Remain Stationary). |
| [RAPID FIRE x] | +x attacks when the target unit is within half the weapon's Range of the firing model (measured to the nearest model of the target). |
| [TORRENT] | Every attack hits automatically (no hit roll; not a critical hit). Cannot use Indirect Fire. |
| [BLAST] | Attacks += floor(models in target unit at target selection / 5). May never target a unit within ER of any unit of the attacker's army (including the attacker). |
| [SUSTAINED HITS x] | A critical hit scores x extra hits (each a normal hit, resolved as separate wound rolls). |
| [LETHAL HITS] | A critical hit wounds automatically (skip wound roll; it is not a critical wound). |
| [DEVASTATING WOUNDS] | A critical wound: no save of any kind; instead of damage the target suffers D mortal wounds (rolled after allocation); such attacks are allocated after the unit's other attacks; excess lost when the allocated model dies. |
| [ANTI-KEYWORD x+] | Against a target with KEYWORD an unmodified wound roll ≥ x is a critical wound (so it wounds, and triggers Devastating Wounds if present). Multiple Anti on one weapon: any applies. |
| [TWIN-LINKED] | May re-roll the wound roll (owner decides per attack; engine offers on fails by default). |
| [LANCE] | +1 to wound if the bearer made a Charge move this turn. |
| [MELTA x] | +x Damage when the target unit is within half Range. |
| [IGNORES COVER] | Target never has Benefit of Cover against this attack. |
| [INDIRECT FIRE] | May target units not visible; if no model of the target is visible when selected: −1 to hit, unmodified 1–3 fail, target has cover. Torrent weapons cannot use it. |
| [PISTOL] | See R-6.7. |
| [HAZARDOUS] | After the unit finishes all its attacks (shooting or fighting), one test per Hazardous weapon that had a target: roll 1D6, 1 = fail. Per failure pick, in priority: a wounded model carrying a Hazardous weapon; else a non-CHARACTER carrier; else a CHARACTER carrier. The unit suffers 3 mortal wounds allocated to that model (excess lost). Overwatch in the Charge phase: apply after the charger finishes its move. |
| [PRECISION] | On wounding an attached unit, if a CHARACTER model of it is visible to the attacking model, the attacker may allocate that attack (and its mortal wounds) to that CHARACTER. |
| [EXTRA ATTACKS] | The bearer attacks with every Extra Attacks melee weapon it has *in addition to* one other melee weapon. Its A cannot be modified unless the rule names the weapon (Waaagh! +1 A therefore does not apply to Squighog jaws). |
| [ONE SHOT] | Weapon can be fired once per battle; cannot be used through Firing Deck. |
| [PSYCHIC] | Tag only: wounds it causes are "Psychic Attacks" for rules that care. No other mechanic. |
| multi-profile | A weapon with several profiles: choose one profile per shooting/fighting activation before targets. |

## 8. Charge phase

| Id | Rule |
|---|---|
| R-8.1 | Eligible: unit within 12" of ≥1 enemy unit; not Advanced (Waaagh! waives) or Fell Back (Brutal but Kunnin' waives) this turn; not in ER; not AIRCRAFT. Each unit may declare once per phase. |
| R-8.2 | Declare: choose ≥1 enemy units within 12"; visibility not required. Window `charge.declared` (opponent; unused by core/patrol stratagems). |
| R-8.3 | Roll 2D6 = max inches each model may move (window `charge.rolled` → Command Re-roll; Unstoppable Valour re-roll, R-6.24). If the roll cannot satisfy R-8.4 the charge fails now (`ChargeFailed`); otherwise the charge move starts: window `charge.moveStarted` (opponent → Fire Overwatch, "starts a Charge move"). After Overwatch casualties R-8.4 feasibility is re-checked with the surviving models and the same roll; if it is now impossible the charge fails and no model moves. |
| R-8.4 | The charge succeeds only if there exists an arrangement where every model moves ≤ roll (incl. climbs, R-5.7), the unit ends within ER of **every** target, never enters ER of a non-target enemy, and is in coherency. Otherwise it fails and no model moves (positions unchanged, `ChargeFailed`). Engine computes feasibility by search over model end positions; the active player then supplies actual positions satisfying the same constraints. |
| R-8.5 | During the move each model must end closer to at least one target unit than it started, and must end in base-to-base contact with an enemy model if that is possible while satisfying R-8.4. |
| R-8.6 | Charge bonus: a unit that made a Charge move has Fights First until end of turn. |
| R-8.7 | Window `charge.moveEnded` → Heroic Intervention (opponent, `reactionWindow`), then Tank Shock (active VEHICLE, `stratagemWindow`). |
| R-8.8 | FLY chargers: may cross other models, measure through the air; cannot end on a model. |

## 9. Fight phase

| Id | Rule |
|---|---|
| R-9.1 | Two steps: Fights First, then Remaining Combats. In each step players alternate selecting one eligible unit to fight, **starting with the non-active player**. A player with an eligible unit may not pass. When one player has none left, the other fights all remaining, one at a time. A unit fights at most once per phase. |
| R-9.2 | Eligible to fight: in ER of an enemy unit, or made a Charge move this turn. |
| R-9.3 | Fights First step: units eligible and where every model has Fights First (charge bonus or ability). A Fights First unit that becomes eligible later (e.g. after a consolidation puts it in ER) fights in Remaining Combats. |
| R-9.4 | Fight activation = Pile In → declare targets → Make melee attacks → Consolidate. Windows: `fight.unitSelected` before pile-in; `fight.targetsDeclared` after targets are declared, before any attack (opponent of the fighting unit first, then owner); `fight.attacksResolved` after consolidation. |
| R-9.5 | Pile In: each model not already in base contact with an enemy may move ≤ 3" (Get Stuck In/Get In There: 6"). Allowed only if afterwards the unit is within ER of ≥1 enemy unit and in coherency; else nobody moves. A pile-in path may not cross enemy models (reject `E_OVERLAP`). Every moved model must end closer to the closest enemy model (measured from its start position **[interp: closest enemy model at the start of that model's move]**) and in base contact with an enemy if possible. Pile-in may cross terrain per R-5.7 but not enemy models. |
| R-9.6 | Which models may attack: models within ER of an enemy unit, or in base contact with a friendly model of the same unit that is itself in base contact with an enemy unit. |
| R-9.7 | Each attacking model picks one melee weapon (plus every [EXTRA ATTACKS] weapon) and one profile, then targets are declared for all attacks; a model may split attacks between units it may target (R-9.8): `declareTargets.targets[]` repeats the (model, weapon) pair with `attacks` per target, and the per-(model, weapon) sum must equal the weapon's A (random A is rolled before declaration and shown in `DeclareTargetsDecision.context.weapons[].attacks` **[interp]**). No eligible target → no attacks, unit still consolidates. |
| R-9.8 | A model may target an enemy unit if within ER of it, or in base contact with a friendly model of its unit that is in base contact with that enemy unit. |
| R-9.9 | Attacks use the §6.2 sequence with WS. Resolve per target unit, per profile grouping. All declared attacks are made even if the target is no longer in ER. |
| R-9.10 | Consolidate: as Pile In (≤ 3", closer to closest enemy, base contact if possible, end within ER of an enemy and in coherency). If that is impossible: each model may instead move ≤ 3" toward the closest objective marker, only if the unit ends within range of that marker and in coherency. Otherwise no move. |
| R-9.11 | After a fight, previously ineligible units may have become eligible (dragged into ER); they can be selected in the current or later step per R-9.3. |
| R-9.12 | Counter-offensive (2 CP): right after an enemy unit fought, one of your eligible units that has not fought this phase fights next, overriding alternation. |
| R-9.13 | Fight phase ends when no eligible unfought units remain in either step; then the turn ends (R-2.6 coherency cull, `turn.end`). |

## 10. Unit-level core abilities

| Id | Ability | Rule |
|---|---|---|
| R-10.1 | Leader / attached units | At Declare Battle Formations a Leader may attach to one listed bodyguard unit in the army; one leader per bodyguard. The attached unit is one unit for all purposes except "unit destroyed" triggers. Attacks against it use the bodyguard's T; attacks cannot be allocated to the CHARACTER while any bodyguard model lives (even if the character is wounded); once the last bodyguard model dies, remaining unallocated attacks of the current attacking unit may go to the character. When the bodyguard part is destroyed the leader becomes its own unit (own SS) after the attacking unit finishes; when the leader dies the bodyguard likewise becomes its own unit. Destroying only the bodyguard does not count as destroying a CHARACTER unit and vice versa. |
| R-10.2 | Character | Keyword used by Precision, Epic Challenge, Hazardous priority, Lone Operative and Combat Patrol claims. No other intrinsic rule (10th ed). |
| R-10.3 | Lone Operative | R-6.9. |
| R-10.4 | Deadly Demise x | When the model is destroyed, before removal, roll 1D6; on a 6 every unit (both sides) within 6" suffers x mortal wounds (random x rolled per unit). Transport: before passengers disembark. |
| R-10.5 | Feel No Pain x+ | Each time the model would lose a wound (damage or mortal wound), roll 1D6; ≥ x → that wound is not lost. Only one FNP ability may be used per wound. Applied per point of damage. |
| R-10.6 | Stealth | R-6.8. |
| R-10.7 | Infiltrators | During deployment the unit (all models having it) may be set up anywhere > 9" horizontally from the enemy DZ and all enemy models, instead of in its own DZ. |
| R-10.8 | Scouts x" | Pre-battle (after first turn is decided, first-turn player moves first): the unit may make a Normal move of up to x" (per-model cap x, ignoring M) ending > 9" horizontally from all enemy models. A dedicated transport carrying only Scouts units may make the move instead. |
| R-10.9 | Deep Strike | R-5.13. |
| R-10.10 | Fights First | R-9.3. |
| R-10.11 | Aura | An aura applies to a unit at most once even if in range of several copies; the bearer is always in range of its own aura. |
| R-10.12 | Psychic | Tag, R-7 [PSYCHIC]. |
| R-10.13 | Firing Deck | R-5.19. |

## 11. Stratagems

| Id | Rule |
|---|---|
| R-11.1 | Using a stratagem costs its CP; insufficient CP → illegal. The same stratagem cannot be used more than once per phase by the same player (per player, per phase; a phase in each player's turn is distinct). Some carry stricter limits (once per turn/battle). |
| R-11.2 | A player cannot target their own Battle-shocked unit with a stratagem. |
| R-11.3 | Windows: the engine opens a `stratagemWindow` only when the player has an affordable legal stratagem for that timing (00-arch §3). Both core and patrol stratagems are usable in Combat Patrol (the CP datasheets list exactly which core stratagems each unit may be targeted by; see 11-combat-patrol §3). |
| R-11.4 | Stratagem categories (Battle Tactic / Epic Deed / Strategic Ploy / Wargear) are data tags only. |
| R-11.5 | Decision kinds and ordering. `reactionWindow` (options are `useStratagem` actions + pass; CP and limits enforced exactly as for `stratagemWindow`): Fire Overwatch (`movement.moveStarted`, `movement.unitMoved`, `movement.reinforcements`, `charge.moveStarted`), Heroic Intervention (`charge.moveEnded`), Rapid Ingress (`movement.end`), Counter-offensive (`fight.attacksResolved`). Every other stratagem, including Tank Shock (`charge.moveEnded`, active player), goes through `stratagemWindow`. Ordering when both players could act: defensive windows (`shooting.targetsDeclared`, `fight.targetsDeclared`) → the targeted unit's owner first, then the attacker; all other windows → active player first, then opponent; `round.*`/`battle.end` → first-turn player first (R-1.3). |

### Core stratagems (all usable in Combat Patrol unless a mission or datasheet says otherwise)

| Name | CP | Window (00-arch §4) | Whose turn | Target | Effect | Limits / notes |
|---|---|---|---|---|---|---|
| Command Re-roll | 1 | `any.rollMade` | either | own unit/model whose roll it was | re-roll one Advance roll, Charge roll, Desperate Escape test, Hazardous test, hit, wound, damage, save, or attacks-count roll (fast-rolling: pick one die) | once per phase like all stratagems; Forward Outpost may lock it out |
| Counter-offensive | 2 | `fight.attacksResolved` (after an enemy unit fought) | either | own unit in ER that has not fought this phase | it fights next | — |
| Epic Challenge | 1 | `fight.unitSelected` (own CHARACTER unit in ER of an attached unit) | either | one CHARACTER model in that unit | its melee attacks gain [PRECISION] until end of phase | — |
| Insane Bravery | 1 | `command.battleShock` (before a specific test) | yours | that unit | test auto-passed | once per battle; Display of Might restricts |
| Grenade | 1 | `shooting.start` / any point in your Shooting phase before the unit shoots | yours | own GRENADES unit not in ER, that has not Advanced, Fallen Back or shot this turn | pick one GRENADES model and one enemy unit within 8" of and visible to it and not in ER of friendly units; roll 6D6, each 4+ = 1 mortal wound | requires GRENADES keyword (none in the two CP boxes) |
| Tank Shock | 1 | `charge.moveEnded` (own VEHICLE) | yours | that VEHICLE unit | pick an enemy unit in ER and a VEHICLE model in ER of it; roll dice = that model's T; each 5+ = 1 mortal wound, max 6 | Deff Dread T9 → 9 dice; Deffkoptas T6 |
| Rapid Ingress | 1 | `movement.end` (opponent's) | opponent's | own unit in Reserves | arrives now as if in your Reinforcements step (Deep Strike placement allowed) | cannot arrive in a round it could not normally (CP: never round 1) |
| Fire Overwatch | 1 | `movement.moveStarted` / `movement.unitMoved` / `movement.reinforcements` (enemy unit set up, or starts/ends a Normal, Advance or Fall Back move) and `charge.moveStarted` / `charge.moveEnded` (starts/ends a Charge move, after the roll) | opponent's | own unit within 24" of that enemy unit that would be eligible to shoot in your Shooting phase | if the enemy unit is visible to your unit, shoot it as if it were your Shooting phase; every hit needs an unmodified 6 | once per turn; not vs TITANIC; out-of-phase (R-1.8); Hazardous R-7 |
| Go to Ground | 1 | `shooting.targetsDeclared` | opponent's | own INFANTRY unit that was targeted | until end of phase: 6+ invulnerable and Benefit of Cover | — |
| Smokescreen | 1 | `shooting.targetsDeclared` | opponent's | own SMOKE unit that was targeted | until end of phase: Benefit of Cover and Stealth | requires SMOKE (none in the two CP boxes) |
| Heroic Intervention | 1 | `charge.moveEnded` (enemy charge finished) | opponent's | own unit within 6" of that enemy unit that would be eligible to charge it (not in ER, not Advanced/Fell Back) | declare and resolve a charge against only that unit as if your Charge phase (2D6, full R-8 constraints) | VEHICLES only if WALKER; no charge bonus (no Fights First) |

Stratagem-text normalisations already applied by the source (relevant for future data): "set up more than 3" away" effects become 6"; AP-worsening effects last until the attacking unit finishes; "target for 0CP" abilities become −1 CP.

## 12. Objectives, control, victory

| Id | Rule |
|---|---|
| R-12.1 | Objective marker = 40 mm disc centred on the mission point. A model is *within range* of it if within 3" horizontally and 5" vertically of the disc edge. Models cannot end a move on a marker. |
| R-12.2 | Level of Control (LoC) = sum of OC of a player's models within range (Battle-shocked models contribute 0; embarked/reserve models never count). |
| R-12.3 | A marker is controlled by the player with the strictly greater LoC; equal LoC (including 0–0) → contested. Control is (re)evaluated at the start of every turn (snapshot `Objective.controllerAtTurnStart`, used by Shock Tactics and Duty and Honour), at the end of every phase and every turn, and whenever a rule asks. The engine keeps `controller` per marker updated at those points and emits `ObjectiveControlChanged`. |
| R-12.4 | Combat Patrol "secured" rule and mission specifics: see 11-combat-patrol §2.4. |
| R-12.5 | VP are awarded by mission rules at the stated moments; per-turn caps apply per scoring instance. |
| R-12.6 | Game end (CP): after battle round 5 completes (`round.end` → `battle.end` → `GameEnded`, reason `vp`). If a player has no models on the battlefield (and none in Reserves that can still arrive) at the start of their turn, their turn is skipped and the opponent continues to take turns until round 5 ends. If **both** players are in that state the battle ends immediately (`battle.end`, reason `tabled`, VP decide) **[interp]**. |
| R-12.7 | Victor: higher VP total. Equal → draw. Battle Ready bonus (10 VP for a fully painted force) is a constant per player; engine default gives both players 0 (configurable, symmetric). |
| R-12.8 | Resign action ends the game immediately with the other player as victor. |

## 13. Pre-battle sequence (engine `createGame` → deployment decisions)

| Step | Rule |
|---|---|
| P1 | Each player: pick patrol, enhancement (default/optional), secondary objective (default/optional). |
| P2 | Mission chosen or rolled (D6 → mission 1–6). |
| P3 | Battlefield 44"×30"; terrain layout from data; objective markers per mission. |
| P4 | Roll-off; winner chooses Attacker or Defender (edges fixed by mission). |
| P5 | Declare Battle Formations (secret, revealed together): Patrol Squads splits, leader attachments, embarkations, Reserves (Deep Strike), enhancement unit choices (Tellyporta). Engine: all of it is `GameSetup` supplied to `createGame`; `view(state, player)` hides the opponent's reserve list until deployment ends (only `hidden.opponentReserveCount`). |
| P6 | Deploy alternately, one unit at a time, **Defender first**; each unit wholly within its DZ (Infiltrators per R-10.7). A player with nothing left to deploy waits while the other finishes. Units with "set up after both armies deployed" rules: roll-off, alternate. |
| P7 | Roll-off; winner takes the first turn. |
| P8 | Pre-battle rules alternate starting with the first-turn player (Scouts moves). |
| P9 | Round 1 begins. |
