# Rules items to check against the real rules

During development a lot of small calls were made where the 10th edition Combat Patrol rules were unclear, where
a faithful implementation was too costly, or where the engine takes a shortcut. This file collects every one we
could find in the specs, `STATUS.md`, `HANDOFF.md` and code comments, so the owner can check them against the
published rules in one sitting. Work through the tables, compare each "What the game does" with the real rule, and
set the Status column to `confirmed` (matches the rules, nothing to do), `wrong → fix` (deviates; needs a change,
note the correct ruling in the row) or `open` (not yet checked). Everything starts as `open`. Spec ids (R-x.y,
CP-x.y, NEC-x.y) are in `docs/spec/10-rules-core.md`, `11-combat-patrol.md` and `factions/necrons.md`; file:line
refs are to the tree at the time of writing and may drift. The Necrons patrol exists only as a spec so far (no data
or engine hooks yet), so its rows describe intended behaviour.

## Core rules

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-001 | R-1.3 simultaneous triggers outside a turn | No roll-off: `round.*` and `battle.end` windows are offered to the first-turn player, then the second | `docs/spec/10-rules-core.md:31`, `00-architecture.md:118` (no conflicting triggers in CP rosters) | open |
| RC-002 | CP-1.7 starting CP | Both players start with 0 CP; each Command phase gives +1 (so first gain is the first Command phase) | `docs/spec/11-combat-patrol.md:28` ([interp]: core rules give no starting CP) | open |
| RC-003 | R-2.6 / MEAS-014 unit coherency | A 3 + 2 split of a 5-model unit is not coherent; only one connected group counts | `src/engine/geometry.ts:187` ([interp]) | open |
| RC-004 | R-4.8 re-failing Battle-shock | A shocked unit that fails again stays shocked; spec says expiry resets to the later date, but the code overwrites the expiry with a freshly computed one instead of taking the max | `docs/spec/10-rules-core.md:101`, `src/engine/hooks-impl.ts:456,648`, `HANDOFF.md` (open issues) | open |
| RC-005 | Condition `weaponAbility` (data hooks) | Tests only the weapon's own printed abilities, not abilities granted by effects | `src/engine/hooks-impl.ts:182` ([interp]) | open |
| RC-006 | Condition `roll` bounds (data hooks) | Compared against the unmodified die; modifiers are folded in afterwards | `src/engine/hooks-impl.ts:200` ([interp]) | open |
| RC-007 | R-6.24 / R-1.6 optional re-rolls | "May re-roll" sources (Oath of Moment, Unstoppable Valour, Twin-linked, `reroll: all`) re-roll a die that would fail automatically, never worse, no decision; a die is re-rolled at most once, so ability re-rolls use the die up before Command Re-roll | `docs/spec/10-rules-core.md:181` | open |
| RC-008 | Aircraft / Strategic Reserves | Not implemented: neither CP box has AIRCRAFT or Strategic Reserves, only summarised in the spec | `docs/spec/10-rules-core.md:127,139` | open |

## Movement

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-009 | R-5.2 pivot cost | An oval base counts as "not round", so a Deffkopta (oval, VEHICLE, flight stem) pays a 2" pivot; every other CP model pays 0 | `docs/spec/10-rules-core.md:110` ([interp]) | open |
| RC-010 | R-5.6 Desperate Escape | The set of models that "cross an enemy" is taken from the submitted paths: engine asks for paths first, rolls, then applies the move; at most one test per model per phase | `docs/spec/10-rules-core.md:114`, `src/engine/phases/movement.ts:6` | open |
| RC-011 | R-5.7/R-5.8 FLY in a mixed unit | Straight-line 3D measuring is used only when every model in the unit has FLY; a FLY model in a mixed attached unit is measured like its non-FLY mates | `src/engine/phases/movement.ts:136` ([interp]) | open |
| RC-012 | R-2.6 out-of-coherency mover | A unit already out of coherency (casualties, e.g. from Overwatch) that moves no model may end its move as it stands; the end-of-turn cull resolves it | `src/engine/phases/movement.ts:146` ([interp], avoids a move with no legal answer) | open |
| RC-013 | R-5.9 surge move (Krump da Gitz!) | Resolved as one rigid translation of the whole unit toward the target, stopping outside Engagement Range, instead of per-model "as close as possible" pathing | `src/engine/phases/movement.ts:255` ([interp]) | open |
| RC-014 | R-5.9 surge move wiring | The stratagem queues a `surge` reaction but no caller of `resolveSurgeMove` was found in `src/`, so the move may never happen; handoff lists "surge move not integrated into shooting" | `src/engine/stratagems.ts:478`, `HANDOFF.md` (open issues) | open |
| RC-015 | Fire Overwatch targeting | The reacting unit shoots with every ranged weapon at the mover; no `declareTargets` choice is offered | `src/engine/phases/movement.ts:14` ([interp]) | open |
| RC-016 | Terrain height | `heightAt` returns the highest surface directly reachable at a point; callers pass the exact y to `canEndAt`. Craters/barricades never raise standing height | `src/engine/terrain.ts:4` ([interp]) | open |
| RC-017 | R-5.17–5.19 Transports | Implemented but unused: no CP datasheet has capacity, so capacity is a `TRANSPORT:<n>` keyword convention, and transports are not wired into decisions | `src/engine/transports.ts:2`, `HANDOFF.md` (open issues) | open |
| RC-018 | Movement legal actions | Declaration answers (moves, pile-in, charge placements) have no finite option list, so `legalActions` offers a small heuristic candidate set; the engine still validates any manual placement | `src/engine/phases/legal.ts:2`, `STATUS.md` (client known gaps) | open |

## Shooting

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-019 | R-3.3 fully visible | Modelled as "every LoS sample point of the target is visible from at least one sample point of the attacker" | `src/engine/los.ts:4`, `docs/spec/10-rules-core.md:60` ([interp]) | open |
| RC-020 | R-3.14 Benefit of Cover from terrain | Evaluated per terrain piece (view re-tested using only that piece's geometry) so cover is attributed to the piece that blocks the view | `src/engine/los.ts:7` ([interp]) | open |
| RC-021 | Woods and visibility | Approximated as "straight line between base centres crosses a woods footprint" instead of a full sightline search | `src/engine/los.ts:11` ([interp]) | open |
| RC-022 | R-6.13 allocation | If several models already lost wounds or had an attack allocated, the owner chooses among them | `docs/spec/10-rules-core.md:162` ([interp]) | open |
| RC-023 | R-6.14 save choice | The player no longer chooses armour vs invulnerable; the engine picks whichever needs the lower roll (tie → armour) | `src/engine/attack.ts:615`, `src/engine/types.ts:463` (M9) | open |
| RC-024 | R-6.23 Indirect Fire | Marked partial in handoff; -1 to hit / unmodified 1–3 fail is decided from target visibility when targets are declared, not live per roll | `HANDOFF.md` (open issues), `src/engine/attack.ts:29-37` | open |
| RC-025 | R-6.3 Big Guns Never Tire | The -1 to hit is snapshotted at the moment targets are selected (engaged state) and not re-evaluated if the engaging enemy dies mid-volley | `src/engine/attack.ts:29-37` | open |
| RC-026 | Devastating Wounds ordering | Critical-wound mortals are deferred to the end of their own (model, weapon, target) group, not the whole unit-vs-target sequence | `src/engine/attack.ts:11` | open |
| RC-027 | Blast | Model count of the target is snapshotted when the sequence begins, so earlier groups in the same sequence do not shrink the bonus | `src/engine/attack.ts:13` | open |
| RC-028 | Attacks vs a wiped target | Attacks still aimed at a target with no models left are lost, never rolled and never offered a re-roll | `src/engine/attack.ts:171` (owner item 10) | open |
| RC-029 | Fast-rolled dice (M9) | All hit (or wound) dice of a batch are rolled together; the automatic re-roll is one re-roll of all qualifying dice, then one optional `rerollOffer` for dice that would succeed, then one Command Re-roll window | `docs/spec/10-rules-core.md:181`, `src/engine/attack.ts:238` | open |
| RC-030 | Modifying a dice-expression Attacks stat | Stat modifiers apply to a fixed A only; modifying a D3/D6 expression in place is out of scope | `src/engine/weapons.ts:24` ([interp]) | open |
| RC-031 | WEAP-030 Psychic | The Psychic tag has no field on `DamageApplied`, so Psychic-specific effects are not tracked | `HANDOFF.md` (open issues) | open |

## Charge / Fight

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-032 | R-8.4 charge feasibility | Feasibility and the actual arrangement come from one heuristic search (direct approach, detour around non-target ER, angular sweep, walk-to-friend); it finds a legal arrangement if its strategies do, not a proof of impossibility, so an odd geometry may wrongly fail or lack a candidate | `src/engine/phases/charge.ts:10`, `STATUS.md` (Charge row) | open |
| RC-033 | R-8.5 base contact if possible | Checked per model against its own budget, overlap with the rest of the unit and other friendlies, not a joint optimisation of the whole unit | `src/engine/phases/charge.ts:21` | open |
| RC-034 | R-8.x charge path | A charging model may not cross any model's base (target or not) unless FLY, but may pass through its own friendly models (R-5.2 applied by analogy) | `src/engine/phases/charge.ts:24` | open |
| RC-035 | Heroic Intervention and Overwatch | Heroic Intervention's move never reopens a Fire Overwatch window | `src/engine/phases/charge.ts:27` | open |
| RC-036 | R-9.5/R-9.10 pile-in and consolidate | Same heuristic search as charges (closest model first, straight toward nearest enemy at ER); base contact checked per model | `src/engine/phases/fight.ts:14` | open |
| RC-037 | R-9.5 "closer to closest enemy" | Measured against the enemy model that was closest at the start of that model's move | `docs/spec/10-rules-core.md:230`, `src/engine/phases/fight.ts:238` ([interp]) | open |
| RC-038 | R-9.7 random Attacks | Random A (D3/D6) is rolled before targets are declared and shown in the declaration, so attack splits are exact | `docs/spec/10-rules-core.md:232` ([interp]) | open |
| RC-039 | Melee weapon choice | A model picks one non-Extra-Attacks melee weapon (asked when more than one); multi-profile melee weapons use the first profile with no choice. Neither occurs in current CP data | `src/engine/phases/fight.ts:20` | open |
| RC-040 | R-9.12 Counter-offensive sequencing | The inserted activation is a pure insertion: alternation resumes exactly where it would have been, not consuming the opponent's next pick | `src/engine/phases/fight.ts:11` ([interp]) | open |

## Stratagems

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-041 | STRAT-018 Tank Shock after Heroic Intervention | Tank Shock may also follow a Heroic Intervention charge by the reacting player's VEHICLE | `src/engine/stratagems.ts:111`, `src/engine/code-hooks.ts:401` ([interp]) | open |
| RC-042 | Tank Shock enforcement | Hook must require the VEHICLE model to belong to the charging unit and be within ER of the target; mortal wounds capped via `maxMortalWounds: 6`. Code appears to check this; confirm vs rules | `HANDOFF.md` (hook-enforcement note 2), `src/engine/code-hooks.ts:396-406` | open |
| RC-043 | Epic Challenge enforcement | Data cannot say "enemy unit has an attached leader"; the `epicChallenge` hook is meant to enforce it. Not verified in this audit | `HANDOFF.md` (hook-enforcement note 1), `src/engine/code-hooks.ts:376` | open |
| RC-044 | Counter-offensive enforcement | Data encodes only "not yet fought"; the `counterOffensive` hook is meant to also require Engagement Range. Not verified in this audit | `HANDOFF.md` (hook-enforcement note 3), `src/engine/code-hooks.ts:357` | open |
| RC-045 | Keyword filters on attached units | A unit "has" a filter keyword only if every half of an attached unit has it; `notKeyword` excludes if any half has it | `src/engine/stratagems.ts:196` ([interp]) | open |
| RC-046 | R-11.5 reaction ordering | Defensive windows (`shooting.targetsDeclared`, `fight.targetsDeclared`) offer the targeted unit's owner first; all other windows active player first; Fire Overwatch, Heroic Intervention, Rapid Ingress, Counter-offensive are reaction windows, others (incl. Tank Shock) are stratagem windows | `docs/spec/10-rules-core.md:266` | open |
| RC-047 | Core stratagem availability | Grenade and Smokescreen are never legal and Tank Shock only for Ork VEHICLES because no CP unit has GRENADES/SMOKE | `docs/spec/11-combat-patrol.md:27` | open |

## Missions / Scoring

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-048 | CP-2.5 secured objectives | A marker stays secured until the end of a later Command phase at which the opponent's Level of Control exceeds the securer's; opponent presence at other moments does not break it | `docs/spec/11-combat-patrol.md:48` ([interp], literal reading) | open |
| RC-049 | R-12.6 tabled players | A player with no models (and no Reserves that can still arrive) skips their turns; if both are in that state the battle ends at once and VP decide | `docs/spec/10-rules-core.md:295`, `src/engine/missions.ts:28` ([interp]) | open |
| RC-050 | R-5.16 Reserves counted as destroyed | A Reserves unit that never arrived counts as destroyed for "destroyed" secondaries; with no credited killer it scores the lower unit tier (8 VP), not the Beastboss tier; the spec gives no exact number for this case | `src/engine/missions.ts:257` ([interp]) | open |
| RC-051 | R-12.7 Battle Ready | The 10 VP painted-army bonus is a symmetric constant, default 0 for both players | `docs/spec/10-rules-core.md:296`, `11-combat-patrol.md:32` | open |
| RC-052 | Terrain layout vs objectives | Ruin and container footprints were recomputed so every piece is >1" from every objective; the data is authoritative and `11-combat-patrol.md` §3 table still shows the old footprints | `HANDOFF.md` (residual data findings), `STATUS.md` (known doc drift) | open |

## Space Marines

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-053 | Oath of Moment re-roll | Attacks against the Oath target re-roll a failing hit automatically (see RC-007), no per-attack choice | `docs/spec/11-combat-patrol.md:106` with `10-rules-core.md:181` | open |
| RC-054 | Wrath of the Emperor | Scores only when the CAPTAIN model itself destroys an enemy model; kills by the rest of its attached unit do not count | `docs/spec/11-combat-patrol.md` §4.3 (per-model attribution) | open |
| RC-055 | Champion Duellist | Gives Precision and Lethal Hits to the bearer's melee weapons only; the Terminators' power fists are unaffected | `docs/spec/11-combat-patrol.md` §4.2 (`scope.who: bearer`) | open |
| RC-056 | Leaders and bodyguards | Both characters list the Terminator Squad only; one bodyguard takes one leader, so at most one attaches and the other fights alone | `docs/spec/11-combat-patrol.md:135` | open |
| RC-057 | Duty and Honour | Marker is sticky until the opponent controls it at the start or end of any turn; independent from the secured flag; usable only on a unit within range of a marker the user controls | `docs/spec/11-combat-patrol.md:49` (CP-2.6), `HANDOFF.md` | open |
| RC-058 | Shock Tactics | Compares control against the snapshot taken at the start of each turn (`controllerAtTurnStart`) | `docs/spec/10-rules-core.md:292` | open |

## Orks

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-059 | Grizzled Skarboy | Halves the Damage of each ranged attack allocated to the bearer, rounding up, minimum 1 | `docs/spec/11-combat-patrol.md:175` ([interp] on rounding) | open |
| RC-060 | Dead Choppy / Waaagh! | The Deff Dread's extra-klaw attack bonus is baked into base A (6) so Waaagh! +1 A gives 7; shown as base A in the data | `docs/spec/11-combat-patrol.md:232` | open |
| RC-061 | Krump da Gitz! | See RC-013 and RC-014: rigid translation, and the reaction appears not to be drained in the Shooting phase | `src/engine/phases/movement.ts:255`, `src/engine/stratagems.ts:478` | open |
| RC-062 | Deffkopta pivot | Counts as a non-round VEHICLE and pays 2" once per move (see RC-009) | `docs/spec/10-rules-core.md:110` | open |
| RC-063 | Stomp 'Em / beastboss tier | The 8 VP / 12 VP split relies on a Beastboss alternate roster whose data does not exist yet | `src/engine/missions.ts:257` | open |

## Necrons

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-064 | NEC-2.4 Reanimation placement | A returned model is placed automatically at the legal spot closest to the unit's centroid (coherent, wholly on board, no overlap, not in ER of any enemy the unit was not already in ER of); no player choice; if no spot exists the step is wasted | `docs/spec/factions/necrons.md:39` ([interpretation]) | open |
| RC-065 | NEC-2.4 returned model state | Returns with original model id and wargear, at 1 wound, with no per-turn state; One Shot usage resets only if the model never used it | `docs/spec/factions/necrons.md:39` | open |
| RC-066 | NEC-2.5 pick order | Heals the wounded model with fewest wounds remaining (ties: CHARACTER first, then lowest index) and returns the most recently destroyed model first; the owner's choice was made deterministic | `docs/spec/factions/necrons.md:40` ([interpretation]) | open |
| RC-067 | NEC-2.2 heal vs return | Each D3 step heals 1 wound if any model is wounded, otherwise returns one destroyed model; healing always takes priority, and a returned model can be healed by a later step | `docs/spec/factions/necrons.md:37` | open |
| RC-068 | NEC-2.6 timing | Reanimation resolves at the end of your Command phase before the `command.end` primary scoring, so returned Warriors add OC for that scoring (owner's sequencing choice) | `docs/spec/factions/necrons.md:41,116` | open |
| RC-069 | NEC-2.3 attached unit | Overlord + Warriors roll one D3 together, healing goes to either half, returns come from the bodyguard; once one half is wiped the survivor is its own unit, so a dead Overlord never returns and an Overlord alone cannot bring Warriors back | `docs/spec/factions/necrons.md:38` | open |
| RC-070 | Implacable Resilience | Reduces Damage of each attack allocated to the Overlord by 1 (min 1), including Devastating Wounds attacks, but does not reduce mortal wounds that are not attacks (Deadly Demise, Hazardous) | `docs/spec/factions/necrons.md:74,126` | open |
| RC-071 | Doomstalker base size | 90 mm base recorded "as printed on source"; not independently confirmed | `docs/spec/factions/necrons.md:78,196` | open |
| RC-072 | Treasures of Aeons | 3 VP per kill by a NECRONS model of a unit that was in range of the chosen NML marker or own-DZ marker at the start of the phase; kills with no `byModelId` (Deadly Demise, other mortals) score nothing; no cap | `docs/spec/factions/necrons.md:55` ([interpretation]) | open |
| RC-073 | Reclaim and Dominate | Flat 4 VP per turn (not per unit) if one non-Battle-shocked NECRONS unit has every model wholly in the opponent's deployment zone; an attached unit is one unit | `docs/spec/factions/necrons.md:54` | open |
| RC-074 | Protocol of Resonant Focus | Pick is made at own Command phase start among enemies within 12" and visible to the bearer; range/visibility only matter at selection; re-roll of hit 1s for any friendly NECRONS attacker until end of that turn | `docs/spec/factions/necrons.md:48,119` | open |
| RC-075 | Overriding Control | Bearer's unit (attached Warriors included) can shoot after Falling Back but still cannot declare a charge | `docs/spec/factions/necrons.md:47` | open |
| RC-076 | Will of the Overlord | +1 OC until your next Command phase, usable only while an OVERLORD model is on the battlefield (extra hook restriction) | `docs/spec/factions/necrons.md:65` | open |
| RC-077 | Roster source | Patrol assembled from the Wahapedia CP navigation because the CP index page returned HTTP 403; Amonhotekh's Guard (June 2023) is the only Necrons patrol found | `docs/spec/factions/necrons.md:7-16` | open |

## AI / client presentation that affects rules

| ID | Rule | What the game does | Why / source | Status |
|---|---|---|---|---|
| RC-078 | Objective Control display | The HUD recomputes OC client-side because the engine does not export its control-level helper; it ignores ability-based OC modifiers (e.g. Oathsworn Determination, Will of the Overlord), so the shown OC can differ from what the engine scores | `src/client/board/controlLevels.ts:5`, `STATUS.md`, `HANDOFF.md` | open |
| RC-079 | Stratagem panel eligibility | Greys out stratagems from CP, timing and use limits only; does not check per-stratagem targets or conditions, so an unusable stratagem can show as usable (the engine's own check is final) | `src/client/ui/stratagemInfo.ts:4`, `STATUS.md` | open |
| RC-080 | Formation/move validation in the client | Move allowance is checked with straight-line distance, an approximation of the engine's pivot-aware path length; the engine has the final word | `src/client/interaction/formationValidation.ts:128` | open |
| RC-081 | Dice tray | Does not show battle-shock or Desperate Escape rolls | `HANDOFF.md` (2026-09-15 open list) | open |
| RC-082 | Bot decisions | Bot-owned decisions with no progress for 5 s are force-answered; the bot ignores most faction stratagems and scores only a few by id | `HANDOFF.md` (2026-09-15), `STATUS.md` (AI known gaps) | open |
| RC-083 | AI damage model | AI estimates ignore Extra Attacks and Precision, apply Anti only to the wound roll, and use flat multipliers for FNP and cover; affects bot choices, not engine resolution | `src/ai/expected.ts:4` | open |
