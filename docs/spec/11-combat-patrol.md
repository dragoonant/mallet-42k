# 11 — Combat Patrol format, missions and rosters

Own-words data spec. Ids `CP-<section>.<n>` are cited by 12-rules-test-checklist. Coordinates per
00-architecture §7: board 44"×30", x ∈ [−22,22] (long edge), z ∈ [−15,15], origin at centre, Y up.
Sources (all accessed 2026-09-12):

| Source | URL | Version shown on page |
|---|---|---|
| Combat Patrol rules + missions | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | "Warhammer 40,000: Combat Patrol" rulebook, 10th ed, June 2023 (page includes Patrol Squads / secondary-objective era updates) |
| Space Marines box "Strike Force Octavius" | https://wahapedia.ru/wh40k10ed_cp/factions/strike-force-octavius/ | Index, June 2023 |
| Orks box "Gordrang's Gitstompas" | https://wahapedia.ru/wh40k10ed_cp/factions/gordrang-s-gitstompas/ | Index, June 2023 |
| Orks alternate "Morgrim's Butchas" (appendix) | https://wahapedia.ru/wh40k10ed_cp/factions/morgrim-s-butchas/ | Index, April 2024 |
| Core rules (mission map key, objective rules) | https://wahapedia.ru/wh40k10ed/the-rules/core-rules/ | — |

Mission deployment measurements were read from the map images at `wahapedia.ru/wh40k10ed_cp/img/maps/*.png`
(1 grid square = 1"); see issues list in the orchestrator return for anything read visually rather than from text.

## 1. Format

| Id | Rule |
|---|---|
| CP-1.1 | Battlefield 44"×30". Battle length 5 rounds. Game ~1 hour. |
| CP-1.2 | Army = every unit listed in the chosen patrol, with the fixed wargear per model. No points, no army building. The model marked Warlord is the WARLORD. |
| CP-1.3 | Faction/army rule: each datasheet carries a "Faction" ability (Space Marines: Oath of Moment; Orks: Waaagh!). It is defined on the patrol page and is the only army-wide rule; there is no detachment rule in Combat Patrol. |
| CP-1.4 | Enhancements: each patrol lists two; the default applies unless the player swaps to the optional one at step P1 (10-rules §13). Always on the WARLORD (CAPTAIN / WARBOSS / BEASTBOSS). |
| CP-1.5 | Secondary objectives: each patrol lists a default and an optional secondary; chosen at P1; scored in addition to the mission's primary. |
| CP-1.6 | Stratagems: the patrol's three bespoke stratagems plus all Core stratagems (10-rules §11) are usable, subject to each stratagem's target keywords (GRENADES / SMOKE do not occur in these boxes, so Grenade and Smokescreen are never legal here; Tank Shock only for the Ork VEHICLES; Epic Challenge only for CHARACTER units; Go to Ground only for INFANTRY). Normal once-per-phase limits apply. |
| CP-1.7 | CP economy exactly as core: both players +1 at the start of each Command phase; at most +1 more per player per round from missions/abilities. Both players start the battle with 0 CP **[interp: core rules give no starting CP; the first Command phase grants the first]**. |
| CP-1.8 | Patrol Squads: some CP datasheets may be split into smaller units at Declare Battle Formations exactly as their datasheet states. Neither roster in §4 has this ability (Gitstompas Boyz are already two units of 10). |
| CP-1.9 | Reserves: never arrive round 1; not on the board by the end of round 3 → destroyed (10-rules R-5.14). Deep Strike is the only Reserves route in these rosters (plus Tellyporta). |
| CP-1.10 | Deployment: alternate one unit at a time, Defender first; wholly within own DZ. First turn: roll-off, winner goes first. Attacker/Defender: roll-off, winner chooses. |
| CP-1.11 | End of battle: after round 5. A player with no models on the battlefield at the start of their turn skips it; the other keeps playing. Most VP wins; tie = draw. Battle Ready +10 VP treated as symmetric constant (default 0). |
| CP-1.12 | Terrain: players build the board; guidance in §3. |

## 2. Missions

### 2.1 Common scoring schedule
| Id | Rule |
|---|---|
| CP-2.1 | "Standard schedule" = rounds 2, 3, 4: the active player scores the primary at the **end of their Command phase**. Round 5: the player who had the first turn scores at the end of their Command phase; the second player scores instead at the **end of their turn**. Round 1: no primary scoring. Data: `ScoringRule` ×2 — `{when: command.end, rounds: 2–4, who: active}` and the round-5 pair `{when: command.end, rounds: 5–5, who: first}` + `{when: turn.end, rounds: 5–5, who: second}`. |
| CP-2.2 | Per-turn cap applies to the sum of the primary conditions in that scoring instance. |
| CP-2.3 | Control is evaluated with 10-rules R-12.3 at the scoring moment. |

### 2.4 Secured objectives (all CP missions)
| Id | Rule |
|---|---|
| CP-2.4 | At the end of each Command phase, each marker the active player controls while ≥1 of their non-Battle-shocked BATTLELINE units is within range of it becomes *secured* by that player. |
| CP-2.5 | While secured, the marker counts as controlled by the securing player at every control evaluation, even with no models in range. It stops being secured (and normal evaluation resumes from that moment) only at the end of a later Command phase at which the opponent's LoC is greater than the securer's **[interp: literal reading — opponent presence at other moments does not break it]**. A marker can be secured by only one player at a time; securing by the opponent implies the previous secure was already broken. |
| CP-2.6 | Duty and Honour (SM stratagem) is a second, independent "sticky" flag broken when the opponent controls the marker (higher LoC) at the start or end of any turn. A marker may carry both flags. |

### 2.5 Mission table
Attacker edge / DZ shapes are given in engine coordinates. "Strip 10" = DZ is the 10"-wide strip along the owner's short edge.

| # | Mission | Attacker edge | Attacker DZ | Defender DZ | Objectives (x, z) | Mission rule | Primary |
|---|---|---|---|---|---|---|---|
| 1 | Clash of Patrols | z = −15 (long edge) | z ∈ [−15,−10] | z ∈ [10,15] | (−10,0) (10,0) (0,6) (0,−6) | Retrieve Intelligence: from round 2, in your Command phase you may pick one marker you control that has not yet been used (by either player) and "recover" it; if your WARLORD is on the board (or embarked on one) gain 1 CP (subject to R-4.2 cap). | Take and Hold: standard schedule; 5 VP per controlled marker, max 15 per instance. |
| 2 | Archeotech Recovery | x = −22 | x ∈ [−22,−12] | x ∈ [12,22] | (0,0) (−8,8) (8,−8) (−16,−8) (16,8) | Irradiated Power Cells: start of round 3 the Defender randomly picks one NML marker = Gamma. Start of round 4: remove Gamma; Attacker randomly picks one of the two remaining NML markers = Beta. Start of round 5: remove Beta. (NML markers: the three with |x| ≤ 12.) | Recover Archeotech: rounds 2–5, end of each player's Command phase (both players, incl. round 5 second player — no end-of-turn variant): 5 VP per controlled marker, max 15. End of battle: 10 VP to the player controlling the last NML marker. |
| 3 | Forward Outpost | x = −22 | strip 10 | strip 10 | (0,8) (0,−8) (−16,0) (16,0) | Sabotage Enemy Comms: at the end of each player's turn, if the active player controls the marker in the opponent's DZ, the opponent can no longer use Command Re-roll for the rest of the battle. | Vital Ground: standard schedule; 5 VP per controlled marker in NML (the two at x = 0) + 10 VP if you control the marker in the enemy DZ; max 15. |
| 4 | Scorched Earth | x = −22 | triangle (−22,15) (−22,−15) (0,−15) | triangle (22,−15) (22,15) (0,15) | (0,6) (0,−6) A=(−10,4) B=(10,−4) | Raze and Ruin: at the start of your Command phase from round 2, if ≥2 markers remain, you may pick one marker you control with no enemy unit within 3" of it; Attacker never A, Defender never B; it is razed (removed). | Raze and Ruin: standard schedule; 5 VP if you control ≥1 marker; 5 VP if you control more markers than the opponent; 10 VP if you razed a marker this turn. |
| 5 | Sweeping Raid | x = −22 | strip 10 | strip 10 | A=(−16,−6) B=(−3,9) C=(3,−9) D=(16,6) | Supply Lines: start of your Command phase, if you control the marker in your own DZ (Attacker A, Defender D) roll 1D6; 4+ → +1 CP (cap R-4.2). | Priority Targets: rounds 2–4 only, end of active player's Command phase: 5 VP per controlled marker, max 15. End of battle: Attacker +5 VP if controls C, +10 if controls D; Defender +5 if controls B, +10 if controls A. |
| 6 | Display of Might | x = −22 | strip 10 | strip 10 | (0,8) (0,−8) (−14,0) (14,0) | Break Their Spirit: Insane Bravery may only target a unit within 6" of its WARLORD. Claim Sites: the two NML markers (x = 0) are symbolic sites; at the end of your Command phase, if you control a site and ≥1 of your CHARACTER models is within range, those models claim it; it stays claimed while any of them stays within range. | Symbolic Sites: standard schedule; 5 VP each for: control ≥1 marker; control ≥2 markers; ≥1 site claimed by your model; ≥1 site claimed by the same model for ≥2 consecutive of your turns (incl. this one). Max 20. |

Notes: markers with |x| > 12 (missions 2, 3, 5, 6) or in a DZ strip are "in a deployment zone"; NML = not in either DZ. Random selections (mission 2) use the engine RNG (`purpose: 'mission'`). "Razed"/removed markers no longer exist for any rule.

### 2.6 Mission data mapping (`mission.rules[]`, `ScoringRule.rule`, `MissionState.custom`)
| # | `rules[]` (code @ window) | Scoring rules | `custom` keys / state used |
|---|---|---|---|
| 1 | `retrieveIntelligence` @ `command.start` (round ≥ 2; opens `chooseOption` topic `recoverObjective`) | `holdObjectives` 5/marker cap 15, standard schedule | `Objective.used`; CP via R-4.2 cap |
| 2 | `irradiatedPowerCells` @ `round.start` (rounds 3, 4, 5) | `holdObjectives` 5/marker cap 15 `{when: command.end, rounds 2–5, who: active}` (no round-5 split); `holdNamed` 10 `{when: battle.end, params.objectiveIds: [last NML marker]}` resolved at run time | `gammaObjectiveId`, `betaObjectiveId`, `lastNmlObjectiveId` |
| 3 | `sabotageComms` @ `turn.end` | standard schedule: `holdObjectives` 5/NML marker (`params.objectiveIds`) + `holdEnemyHome` 10, shared cap 15 (`params.capGroup`) | `Player.commandRerollLocked` |
| 4 | `razeAndRuin` @ `command.start` (round ≥ 2; `chooseOption` topic `razeObjective`) | standard schedule: `holdObjectives` (≥1) 5, `holdMore` 5, `razedThisTurn` 10 | `razedThisTurn: {player, round}`; `Objective.removed` |
| 5 | `supplyLines` @ `command.start` | `holdObjectives` 5/marker cap 15 rounds 2–4 only; `battle.end`: `holdNamed` per player (Attacker C 5 / D 10; Defender B 5 / A 10) | — |
| 6 | `breakTheirSpirit` (always; gates Insane Bravery), `claimSites` @ `command.end` | standard schedule: `holdObjectives` (≥1) 5, `holdObjectives` (≥2) 5, `claimedSite` 5, `claimedSiteConsecutive` 5 `{params.turns: 2}`, cap 20 | `Objective.claimedBy` |

Secondaries use the same shape: Wrath of the Emperor = `custom` code `wrathOfTheEmperor` @ `phase.end` (reads `Player.secondaryState.killsThisPhase[captainModelId]`); Shock Tactics = `custom` @ `turn.end` (uses `Objective.controllerAtTurnStart`); Stomp 'Em = rule `stompEmPick` @ `round.start` (rounds 2–5, `chooseOption` topic `stompTarget`) + `custom` scoring @ `round.end`; Proper Lootin' = `custom` @ `command.end` (`Objective.lootedBy`); Bag the Big 'Un = `bagPick` @ `round.start` (round 1, topic `bagTarget`) + `custom` @ `battle.end` (`Unit.destroyedBy.modelId` vs the BEASTBOSS model); Krumpin' Spree = `custom` @ `turn.end`.

## 3. Terrain guidance and default layout

| Id | Rule |
|---|---|
| CP-3.1 | Guidance from the source: spread terrain evenly so both sides can find cover; enough that a straight line of sight from one edge to the other is not easy; leave lanes for VEHICLES. |
| CP-3.2 | Default layout `terrain.cp-01` (180° rotationally symmetric about the centre; all pieces > 1" from marker points; matches the "ideal" density of the reference photo — 2 big ruins, 2 small ruins, 2 containers, 2 craters, 2 barricades): |

| Piece | Category | Footprint (x, z) polygon / centre | Height | Notes |
|---|---|---|---|---|
| ruin-L1 | RUINS | L-shape: (−9,1) (−3,1) (−3,3) (−7,3) (−7,7) (−9,7) | 6" walls, floor at 3" | walls on the outer L edges; open interior |
| ruin-L2 | RUINS | rotate ruin-L1 by 180° | 6" | |
| ruin-S1 | RUINS | rect (−19,−13) to (−13,−9) | 4" | in Attacker DZ corner |
| ruin-S2 | RUINS | rect (13,9) to (19,13) | 4" | |
| container-1 | HILL (stand-on) | rect (2,−12) to (8,−9) | 3" | |
| container-2 | HILL | rect (−8,9) to (−2,12) | 3" | |
| crater-1 | CRATER | circle centre (10,4) r 2.5 | 0.5" | |
| crater-2 | CRATER | circle centre (−10,−4) r 2.5 | 0.5" | |
| barricade-1 | BARRICADE | segment (14,−3)→(18,−3), thickness 0.5 | 1.5" | |
| barricade-2 | BARRICADE | segment (−18,3)→(−14,3) | 1.5" | |

Missions may nudge pieces off marker points (R-3.10); the layout is data, not rules.

## 4. Roster: Space Marines — Strike Force Octavius

Source: strike-force-octavius page (Index, June 2023), accessed 2026-09-12. 4 units, 12 models. Faction keyword ADEPTUS ASTARTES; all IMPERIUM, INFANTRY.

### 4.1 Faction ability — Oath of Moment
| Id | Rule |
|---|---|
| CP-4.1 | At the start of your Command phase pick one enemy unit; until the start of your next Command phase it is your Oath target. Every attack by a model with this ability against the Oath target may re-roll its hit roll. |

### 4.2 Enhancements (Captain Octavius, WARLORD)
| Name | Default? | Effect |
|---|---|---|
| Champion Duellist | default | bearer's melee weapons gain [PRECISION] and [LETHAL HITS] (`scope.who: bearer` — the Terminators' power fists are unaffected) |
| Oathsworn Determination | optional | +1 OC to every model in the bearer's unit (attached unit included; `scope.who: self`) |

### 4.3 Secondary objectives
| Name | Default? | Scoring |
|---|---|---|
| Wrath of the Emperor | default | end of every phase (both players' turns): 2 VP if your CAPTAIN model destroyed ≥1 enemy model during that phase (per-model attribution: `ModelDestroyed.byModelId`; kills by other models of the Captain's attached unit do not count) |
| Shock Tactics | optional | end of each player's turn: 5 VP if you control ≥1 marker that the opponent controlled at the start of that turn |

### 4.4 Patrol stratagems
| Name | CP | Window | Target | Effect |
|---|---|---|---|---|
| Gene-wrought Resilience | 1 | `shooting.targetsDeclared` (opponent's Shooting) or `fight.targetsDeclared` (either Fight phase) | own ADEPTUS ASTARTES unit that was targeted | until end of phase: attacks with S > the unit's T get −1 to wound |
| Veteran Instincts | 1 | `[fight.start, fight.attacksResolved]` (between activations, either turn) | own TERMINATOR unit not yet selected to fight | until end of phase: its attacks re-roll wound rolls of 1; against MONSTER/VEHICLE targets re-roll any wound roll |
| Duty and Honour | 1 | `command.end` (your turn) | own ADEPTUS ASTARTES unit within range of a marker you control | marker stays yours with no models in range until the opponent controls it at the start or end of any turn (CP-2.6) |

### 4.5 Datasheets
| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Captain Octavius | 1 | 50 mm | 5 | 5 | 2+ | 4+ | 6 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, TERMINATOR, CAPTAIN, OCTAVIUS | Deep Strike; Leader → Terminator Squad; Oath of Moment; Unstoppable Valour: charge rolls for this model's unit may be re-rolled |
| Librarian Tantus | 1 | 40 mm | 5 | 5 | 2+ | 4+ | 5 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, IMPERIUM, TERMINATOR, LIBRARIAN TANTUS | Deep Strike; Leader → Terminator Squad; Oath of Moment; Veil of Time (Psychic): while leading, all weapons of models in that unit gain [SUSTAINED HITS 1] |
| Terminator Squad | 5 | 40 mm | 5 | 5 | 2+ | 4+ | 3 | 6+ | 1 | INFANTRY, IMPERIUM, TERMINATOR, TERMINATOR SQUAD | Deep Strike; Oath of Moment; Fury of the First: +1 to hit against the Oath target |
| Infernus Squad | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 1 | INFANTRY, IMPERIUM, TACTICUS, INFERNUS SQUAD | Oath of Moment |

Leader note: both characters list the Terminator Squad as their only bodyguard; one bodyguard takes one leader (R-10.1), so at most one attaches and the other operates alone.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Captain Octavius | — | storm bolter | relic weapon |
| Librarian Tantus | — | Smite (2 profiles), storm bolter | force weapon |
| Terminator Squad | Sergeant | storm bolter | power weapon |
| Terminator Squad | Terminator ×1 | assault cannon | power fist |
| Terminator Squad | Terminator ×3 | storm bolter | power fist |
| Infernus Squad | ×5 | bolt pistol, pyreblaster | close combat weapon |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| storm bolter (Captain) | 24" | 2 | 2+ | 4 | 0 | 1 | Rapid Fire 2 |
| storm bolter (others) | 24" | 2 | 3+ | 4 | 0 | 1 | Rapid Fire 2 |
| assault cannon | 24" | 6 | 3+ | 6 | 0 | 1 | Devastating Wounds |
| Smite — witchfire | 24" | D6 | 3+ | 5 | −1 | D3 | Psychic |
| Smite — focused witchfire | 24" | D6 | 3+ | 6 | −2 | D3 | Psychic, Devastating Wounds, Hazardous |
| bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| pyreblaster | 12" | D6 | n/a | 5 | 0 | 1 | Torrent, Ignores Cover |
| relic weapon | melee | 6 | 2+ | 5 | −2 | 2 | (+Precision, Lethal Hits with Champion Duellist) |
| force weapon | melee | 4 | 3+ | 6 | −1 | D3 | Psychic |
| power weapon | melee | 4 | 3+ | 5 | −2 | 1 | — |
| power fist | melee | 3 | 3+ | 8 | −2 | 2 | — |
| close combat weapon (Infernus) | melee | 3 | 3+ | 4 | 0 | 1 | — |

## 5. Roster: Orks — Gordrang's Gitstompas

Source: gordrang-s-gitstompas page (Index, June 2023), accessed 2026-09-12. 5 units, 25 models. Faction keyword ORKS.

### 5.1 Faction ability — Waaagh!
| Id | Rule |
|---|---|
| CP-5.1 | Once per battle, at the start of any battle round (window `round.start`, `chooseOption` topic `waaagh`), the Ork player may call a Waaagh!. Until the start of the next battle round (`duration: untilEndOfRound`): (a) units with the ability may declare a charge in a turn in which they Advanced; (b) melee weapons of models with the ability get +1 S and +1 A (not [EXTRA ATTACKS] weapons); (c) those models have a 5+ invulnerable save (they may still choose armour). |

### 5.2 Enhancements (Warboss Gordrang, WARLORD)
| Name | Default? | Effect |
|---|---|---|
| Grizzled Skarboy | default | each ranged attack allocated to the bearer has its Damage halved (round up **[interp]**, min 1) (`scope.who: bearer`) |
| Tellyporta | optional | at Declare Battle Formations pick one BOYZ unit (data `choice: {unitKeyword: BOYZ}` → `PlayerSetup.enhancementChoice.unitRef`, validated by `createGame`; sets `Unit.deepStrikeWith` on both units); the bearer and that unit gain Deep Strike; if used, both must arrive in the same turn, each set up within 3" of the other |

### 5.3 Secondary objectives
| Name | Default? | Scoring |
|---|---|---|
| Stomp 'Em | default | from round 2, at the start of each round (`round.start`) pick a surviving enemy unit; at the end of that round (`round.end`) 3 VP if it was destroyed by a melee attack from an ORKS model |
| Proper Lootin' | optional | end of your Command phase: for each marker you control that is outside your DZ and not yet looted by your army (`Objective.lootedBy`), if ≥1 ORKS unit is within range of it and none of those units is in ER: roll 1D6 — 2–4: looted, 3 VP; 5+: looted, 5 VP; 1: not looted (may retry later) |

### 5.4 Patrol stratagems
| Name | CP | Window | Target | Effect |
|---|---|---|---|---|
| Get Stuck In | 1 | `[fight.start, fight.attacksResolved]` (between activations, either turn) | own ORKS unit not yet selected to fight | until end of phase its Pile-in and Consolidation moves are up to 6" |
| Brutal but Kunnin' | 1 | `charge.start` (your Charge phase) | own ORKS INFANTRY unit | until end of phase it may declare a charge despite having Fallen Back this turn |
| Krump da Gitz! | 1 | `shooting.attacksResolved` (opponent's Shooting, after the enemy unit finished) | own ORKS unit that was among that unit's targets | it makes a Normal move of up to D6" ending as close as possible to that enemy unit (`Effect.move.kind: surge`, `MoveConstraints.asCloseAsPossibleTo`; R-5.9: not if Battle-shocked / in ER; may not end in ER) |

### 5.5 Datasheets
| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Warboss Gordrang | 1 | 50 mm | 5 | 6 | 2+ | 5+ | 7 | 6+ | 1 | INFANTRY, CHARACTER, WARBOSS, WARBOSS GORDRANG | Waaagh!; Dead 'ard: while a Waaagh! is active this model has Feel No Pain 4+ (`untilEndOfRound`). **No Leader ability** (cannot attach) |
| Boyz (unit A) | 10 | 32 mm | 6 | 5 | 5+ | — | 1 (Boss Nob 2) | 7+ | 2 | INFANTRY, BATTLELINE, MOB, BOYZ | Waaagh! |
| Boyz (unit B) | 10 | 32 mm | 6 | 5 | 5+ | — | 1 (Boss Nob 2) | 7+ | 2 | INFANTRY, BATTLELINE, MOB, BOYZ | Waaagh! |
| Deffkoptas | 3 | 75×42 mm oval | 12 | 6 | 4+ | 6+ | 4 | 7+ | 2 | VEHICLE, FLY, DEFFKOPTAS | Deep Strike; Waaagh! |
| Deff Dread | 1 | 60 mm | 8 | 9 | 2+ | 6+ | 8 | 7+ | 3 | VEHICLE, WALKER, DEFF DREAD | Deadly Demise 1; Waaagh!; Piston-driven Brutality: at the start of the Fight phase every enemy unit within ER of a model with this ability takes a Battle-shock test |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Warboss Gordrang | — | big shoota | 'uge choppa |
| Boyz A | Boss Nob | slugga | big choppa |
| Boyz A | Boy ×5 | slugga | choppa |
| Boyz A | Boy ×3 | shoota | close combat weapon |
| Boyz A | Boy ×1 | big shoota | close combat weapon |
| Boyz B | Boss Nob | slugga | power klaw |
| Boyz B | Boy ×5 | slugga | choppa |
| Boyz B | Boy ×3 | shoota | close combat weapon |
| Boyz B | Boy ×1 | rokkit launcha | close combat weapon |
| Deffkoptas | ×1 | kustom mega-blasta, slugga | spinnin' blades |
| Deffkoptas | ×2 | kopta rokkits, slugga | spinnin' blades |
| Deff Dread | — | rokkit launcha | dread klaw ×3 (single profile, A 6 via Dead Choppy) |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| big shoota (Gordrang) | 36" | 3 | 4+ | 5 | 0 | 1 | Rapid Fire 2 |
| big shoota (Boy) | 36" | 3 | 5+ | 5 | 0 | 1 | Rapid Fire 2 |
| rokkit launcha (Boy, Dread) | 24" | D3 | 5+ | 9 | −2 | 3 | Blast |
| shoota | 18" | 2 | 5+ | 4 | 0 | 1 | Rapid Fire 1 |
| slugga | 12" | 1 | 5+ | 4 | 0 | 1 | Pistol |
| kopta rokkits | 24" | D3 | 5+ | 9 | −2 | 3 | Blast, Twin-linked |
| kustom mega-blasta | 24" | 3 | 5+ | 9 | −2 | D6 | Hazardous |
| 'uge choppa | melee | 4 | 2+ | 12 | −2 | 2 | — |
| big choppa | melee | 3 | 3+ | 7 | −1 | 2 | — |
| choppa | melee | 3 | 3+ | 4 | −1 | 1 | — |
| close combat weapon (Boy) | melee | 2 | 3+ | 4 | 0 | 1 | — |
| power klaw | melee | 3 | 4+ | 9 | −2 | 2 | — |
| spinnin' blades | melee | 6 | 3+ | 5 | 0 | 1 | — |
| dread klaw (×3) | melee | 4 (+1 per extra klaw → 6) | 3+ | 12 | −2 | 3 | Dead Choppy (attack bonus is part of the base A for the engine; Waaagh! then gives 7) |

## 6. Appendix: Orks alternate roster — Morgrim's Butchas (compact)

Source: morgrim-s-butchas page (Index, April 2024). 5 units, 25 models. Same Waaagh! as CP-5.1 (worded "if your Army Faction is ORKS").

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Beastboss Morgrim (Warlord) | 1 | 50 mm | 6 | 5 | 4+ | 5+ | 6 | 6+ | 1 | INFANTRY, CHARACTER, BEAST SNAGGA, WARBOSS, BEASTBOSS, MORGRIM | FNP 6+; Leader → Beast Snagga Boyz; Beastboss: while leading, the unit's melee attacks get +1 to hit |
| Beast Snagga Boyz ×2 units | 10 each | 32 mm | 6 | 5 | 5+ | — | 1 (Nob 2) | 7+ | 2 | INFANTRY, MOB, BATTLELINE, BEAST SNAGGA, BEAST SNAGGA BOYZ | FNP 6+; Monster Hunters: re-roll hit rolls vs MONSTER/VEHICLE |
| Squighog Boyz | 4 | 75×42 mm (Nob on Smasha Squig 90×52 mm) | 10 | 7 | 4+ | — | 3 (Nob 4) | 7+ | 2 | MOUNTED, BEAST SNAGGA, SQUIGHOG BOYZ | FNP 5+ |

| Model | Ranged | Melee |
|---|---|---|
| Beastboss | shoota 18" A2 BS4+ S4 AP0 D1 [RF1] | Beast Snagga klaw A4 WS3+ S10 AP−2 D2 [Anti-MONSTER 4+, Anti-VEHICLE 4+]; beastchoppa A6 WS2+ S6 AP−1 D2 [Anti-MONSTER 4+, Anti-VEHICLE 4+] |
| Beast Snagga Nob | slugga | power snappa A4 WS3+ S7 AP−1 D2 |
| Beast Snagga Boy ×1 | thump gun 18" A D3 BS5+ S6 AP0 D2 [Blast] | close combat weapon A2 WS3+ S5 AP0 D1 |
| Beast Snagga Boy ×8 | slugga | choppa A3 WS3+ S5 AP−1 D1 |
| Nob on Smasha Squig | slugga | big choppa A4 WS3+ S6 AP−1 D2 [Anti-M 4+, Anti-V 4+]; squighog jaws A3 WS4+ S6 AP−1 D2 [Extra Attacks] |
| Squighog Boy ×3 | saddlegit weapons 9" A1 BS4+ S3 AP0 D1 [Assault]; stikka (ranged) 9" A1 BS5+ S5 AP−1 D2 [Assault, Anti-M 4+, Anti-V 4+] | stikka (melee) A3 WS3+ S5 AP−1 D2 [Anti-M 4+, Anti-V 4+, Lance]; squighog jaws [Extra Attacks] as above |

| Enhancement / Secondary / Stratagem | Effect |
|---|---|
| Half-chewed (default enh.) | bearer's unit (`scope.who: self`): FNP 5+ and +1 to armour saves against ranged attacks (counts toward the +1 save cap) |
| Bosskilla (optional enh.) | bearer's melee weapons (`scope.who: bearer`) gain [PRECISION] and [SUSTAINED HITS 1] |
| Bag the Big 'Un (default sec.) | `round.start` of round 1 pick an enemy MONSTER/VEHICLE model (else the enemy WARLORD); `battle.end` 8 VP if destroyed, 12 VP if destroyed by your BEASTBOSS (`Unit.destroyedBy.modelId`) |
| Krumpin' Spree (optional sec.) | end of your turn: 3 VP if you control the marker closest to the enemy edge, +1 VP per other controlled marker outside your DZ |
| Tough as Squig-hide (1 CP, `shooting.targetsDeclared` opponent's turn / `fight.targetsDeclared` either turn) | own ORKS INFANTRY target unit: attacks with S > T get −1 to wound until end of phase |
| Bestial Bellow (1 CP, `fight.start`) | own BEASTBOSS or SQUIGHOG BOYZ model: one enemy unit within 3" takes a Battle-shock test with −1 to the 2D6 total |
| Get In There! (1 CP, `[fight.start, fight.attacksResolved, fight.unitSelected]` — usable up to and including the moment the unit is selected, before Pile In) | that ORKS unit: Pile-in moves up to 6" this phase |
