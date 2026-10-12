# Faction spec — Grey Knights: Aurellios' Banishers

Own-words data spec for the Grey Knights Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `GRE-<section>.<n>`
are cited by the `GRE-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours. Data id prefix: `gk.` (faction id `grey-knights`, faction keyword `GREY KNIGHTS`).

## 0. Sources (accessed 2026-10-05)

| Source | URL | Version shown on page |
|---|---|---|
| Grey Knights box "Aurellios' Banishers" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/aurellios-banishers/ | Index, 10th ed, last update June 2023 |
| CP navigation (used to enumerate patrols) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | — |

Patrol selection: the wahapedia Combat Patrol navigation lists exactly one Grey Knights patrol, Aurellios' Banishers
(June 2023). It is both the current boxed patrol and the only one; there is no appendix roster (§10).

## 1. Roster

Faction keyword GREY KNIGHTS on every datasheet. The box holds 12 models, but a battle uses **3 units**: the
Librarian, the Strike Squad, and **either** the Brotherhood Terminator Squad **or** the Nemesis Dreadknight (chosen
at the Select Combat Patrol and Enhancement step, GRE-1.1). Terminator build: 11 models; Dreadknight build: 7 models.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `librarian` | Librarian Aurellios | 1 | Purge Soul (2 profiles); Nemesis force weapon | **WARLORD**, default enhancement Banishment Stone. Leader → `terminators` only (default attachment when the Terminators are fielded) |
| `strike` | Strike Squad | 5 | Justicar: storm bolter + Nemesis force weapon; 3 Grey Knights: storm bolter + Nemesis force weapon; 1 Grey Knight: psilencer + close combat weapon | always fielded |
| `terminators` | Brotherhood Terminator Squad | 5 | Terminator Justicar: storm bolter + Nemesis force weapon; 3 Terminators: storm bolter + Nemesis force weapon; 1 Terminator: psycannon + Nemesis force weapon | choice group `heavy` (default) |
| `dreadknight` | Nemesis Dreadknight | 1 | heavy psycannon; Nemesis greatsword (2 profiles) | choice group `heavy` (alternative) |

| Id | Rule |
|---|---|
| GRE-1.1 | Unit choice: exactly one of `terminators` / `dreadknight` is in the army. The other is not created at all (it is not in Reserves and never counts as destroyed). Default `terminators`. |
| GRE-1.2 | With the Dreadknight fielded the Librarian has no legal bodyguard and operates alone; the `librarian → terminators` attachment is dropped. |
| GRE-1.3 | The Librarian is always the WARLORD. No Patrol Squads ability on any datasheet (CP-1.8 does not apply). |

## 2. Faction ability — Teleport Assault (Librarian, Strike Squad, Terminators; NOT the Dreadknight)

| Id | Rule |
|---|---|
| GRE-2.1 | At the end of the opponent's turn, the Grey Knights player may pick one of their units on the battlefield that has Teleport Assault and is not within Engagement Range of any enemy unit, and take it off the battlefield. At most one unit per opponent turn. Declining is allowed. An attached unit (Librarian + Terminators) is one unit: both halves go and come back together, still attached. |
| GRE-2.2 | In the Reinforcements step of that player's **next** Movement phase the unit must be set up anywhere on the battlefield more than 9" horizontally from every enemy model (Deep Strike geometry: wholly on the board, coherent, not overlapping models/impassable terrain). It counts as having arrived from Reserves (R-5.x: counts as a Normal move, cannot move again this phase, may shoot and charge). |
| GRE-2.3 | **[interp]** Specific beats general: a Teleport Assault arrival ignores the CP-1.9 round window (it may arrive in round 1 when the Grey Knights player moves second, and in rounds 4–5), and a teleporting unit is never culled by the end-of-round-3 Reserves rule. |
| GRE-2.4 | A unit still off the battlefield at the end of the battle counts as destroyed (only possible when it was removed at the end of the battle's final turn). This happens before `battle.end` scoring, with no killer attribution. |
| GRE-2.5 | **[interp]** Ordering at the opponent's turn end: every `turn.end` ScoringRule (including No Escape, GRE-4.2) resolves first, then the Teleport Assault pick, then the turn-end objective control evaluation and effect expiry. |
| GRE-2.6 | **[interp]** If the owner declines (or cannot complete) the mandatory set-up at GRE-2.2, the unit is destroyed as if lost in Reserves (`UnitLostInReserves`, no killer attribution). |
| GRE-2.7 | While a unit is teleporting the player is not "without forces" for R-12.6 tabling, in any round. |

## 3. Enhancements (Librarian Aurellios, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| GRE-3.1 | Banishment Stone (Psychic) | default | Whenever the bearer model itself destroys an enemy CHARACTER model, roll a D6; on 2+ its player gains 1 CP (still subject to the R-4.2 once-per-round gain cap). Only kills attributed to the bearer model (`byModelId`) count. |
| GRE-3.2 | Dominating Aura (Psychic) | optional | The bearer's OC characteristic becomes 3 (a set, not a +2; Battle-shock still makes it 0). |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| GRE-4.1 | Champion of Titan | default | 6 VP every time the player's WARLORD model destroys an enemy CHARACTER model (per model, any phase, either turn; kills attributed via `byModelId`). No cap in the source. |
| GRE-4.2 | No Escape | optional | At the end of an opponent's turn: 10 VP if the player controls both (a) the objective marker closest to the opponent's battlefield edge and (b) the one closest to their own battlefield edge. Scores at most once per battle. |

Battlefield edge for GRE-4.2: the board side the player's deployment zone touches along its greatest length (the same
side `geometry.battlefieldEdgeStrip` picks; for Scorched Earth's triangles that is the short edge x = ±22). Closest =
smallest perpendicular distance from the marker centre to that edge line, among markers that still exist (razed /
removed markers ignored). In the six CP missions there are no ties (Clash (0,±6), Archeotech (∓16,∓8), Forward
Outpost / Display of Might (∓16|∓14,0), Scorched Earth A/B, Sweeping Raid A/D); **[interp]** a tie would be satisfied by
controlling any of the tied markers.

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| GRE-5.1 | Vindictive Strategy | 1 | `shooting.targetsDeclared` (opponent's Shooting) or `fight.targetsDeclared` (either Fight phase), just after an enemy unit picks targets | own GREY KNIGHTS INFANTRY unit targeted by that enemy unit | until end of phase: an attack against the unit with S greater than the unit's T gets −1 to wound |
| GRE-5.2 | Violent Unbinding | 1 | `fight.targetsDeclared` (either Fight phase) | own GREY KNIGHTS INFANTRY unit targeted by that enemy unit | until end of phase: each time one of its models that has not fought this phase is destroyed, D6; on 4+ it stays on the board, fights once the attacking unit has finished all its attacks, then is removed |
| GRE-5.3 | Daemonic Fervour | 2 | any point of the opponent's Fight phase (`fight.start` … `fight.attacksResolved`) | own GREY KNIGHTS INFANTRY unit within Engagement Range of an enemy unit | until end of that turn: the unit may be picked for Teleport Assault (GRE-2.1) despite being in Engagement Range |

Core stratagems as listed per datasheet (Command Re-roll, Insane Bravery, Fire Overwatch, Rapid Ingress, Go to Ground,
Heroic Intervention, Counter-offensive, Epic Challenge for the Librarian, Tank Shock for the Dreadknight) are engine
core; nothing faction-specific.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Librarian Aurellios | 1 | 40 mm | 5 | 5 | 2+ | 4+ | 5 | 6+ | 1 | INFANTRY, CHARACTER, TERMINATOR, PSYKER, IMPERIUM, LIBRARIAN, AURELLIOS | Deep Strike; Leader → Brotherhood Terminator Squad; Teleport Assault; Sanctic Hood: while leading a unit, every model of that unit has Feel No Pain 4+ against Psychic attacks (GRE-6.1) |
| Brotherhood Terminator Squad | 5 | 40 mm | 5 | 5 | 2+ | 4+ | 3 | 6+ | 2 | INFANTRY, BATTLELINE, PSYKER, TERMINATOR, IMPERIUM, BROTHERHOOD TERMINATOR SQUAD | Deep Strike; Teleport Assault; Hammerhand (Psychic): after a model of the unit makes a Charge move, the unit's melee weapons have [LETHAL HITS] until end of turn (GRE-6.2) |
| Nemesis Dreadknight | 1 | 120×92 mm oval | 8 | 8 | 2+ | 4+ | 13 | 6+ | 4 | VEHICLE, WALKER, PSYKER, IMPERIUM, NEMESIS DREADKNIGHT | Deadly Demise D3; Damaged 1–4: −1 to hit for its attacks. **No** Deep Strike, **no** Teleport Assault |
| Strike Squad | 5 | 32 mm | 6 | 4 | 2+ **[confirm]** | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, PSYKER, IMPERIUM, STRIKE SQUAD | Deep Strike; Teleport Assault |

Faction keyword (all): GREY KNIGHTS. Leader note: the Librarian's only bodyguard is the Terminator Squad (GRE-1.2).

| Id | Rule |
|---|---|
| GRE-6.1 | Sanctic Hood: applies only while the Librarian is attached; covers the Librarian and the Terminators; triggers on each wound lost to a Psychic Attack: an attack made with a [PSYCHIC] weapon (including its Devastating Wounds mortal wounds) or a wound caused by a Psychic-tagged ability (e.g. mortal wounds from an enemy Psychic ability). Best single FNP applies. |
| GRE-6.2 | Hammerhand: triggers on any Charge move of the unit (a charge in its Charge phase or a Heroic Intervention). Lasts until end of that turn. Applies to every model in the unit, including an attached Librarian (an Attached unit is one unit for all rules), so the Librarian's Nemesis force weapon also gains [LETHAL HITS]. Not an interpretation. |
| GRE-6.3 | Damaged (Dreadknight): while it has 1–4 wounds left, −1 to every hit roll it makes. |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Librarian Aurellios | — | Purge Soul (witchfire / focused witchfire) | Nemesis force weapon (Librarian) |
| Strike Squad | Justicar | storm bolter | Nemesis force weapon (Strike) |
| Strike Squad | Grey Knight ×3 | storm bolter | Nemesis force weapon (Strike) |
| Strike Squad | Grey Knight (psilencer) ×1 | psilencer | close combat weapon |
| Brotherhood Terminator Squad | Terminator Justicar | storm bolter | Nemesis force weapon (Terminator) |
| Brotherhood Terminator Squad | Terminator ×3 | storm bolter | Nemesis force weapon (Terminator) |
| Brotherhood Terminator Squad | Terminator (psycannon) ×1 | psycannon | Nemesis force weapon (Terminator) |
| Nemesis Dreadknight | — | heavy psycannon | Nemesis greatsword (strike / sweep) |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| Purge Soul — witchfire | 24" | 1 | 3+ | 6 | −2 | 3 | Psychic |
| Purge Soul — focused witchfire | 24" | 1 | 3+ | 6 | −2 | 3 | Psychic, Hazardous, Precision |
| storm bolter | 24" | 2 | 3+ | 4 | 0 | 1 | Rapid Fire 2 |
| psilencer | 24" | 6 | 3+ | 5 | 0 | 1 | Psychic, Sustained Hits 1 |
| psycannon | 24" | 3 | 3+ | 8 | −1 | 2 | Psychic |
| heavy psycannon | 24" | 6 | 3+ | 10 | −1 | 3 | Psychic |
| Nemesis force weapon (Librarian) | melee | 4 | 2+ | 6 | −1 | 2 | Psychic |
| Nemesis force weapon (Terminator) | melee | 4 | 3+ | 6 | −2 | 2 | Psychic (+Lethal Hits via Hammerhand) |
| Nemesis force weapon (Strike) | melee | 3 | 3+ | 6 | −2 | 2 | Psychic |
| close combat weapon | melee | 3 | 3+ | 4 | 0 | 1 | — |
| Nemesis greatsword — strike | melee | 5 | 3+ | 10 | −2 | D6 | Psychic |
| Nemesis greatsword — sweep | melee | 10 | 3+ | 5 | −1 | 1 | Psychic |

Purge Soul's two profiles share `profileGroup`; they have identical numbers and differ only in the focused profile's
Hazardous + Precision (as the source prints them).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, bodies in a new `src/engine/factions/grey-knights.ts` exporting
`greyKnightsHooks`, spread into `codeHooks` like `chaosSpaceMarinesHooks`); (c) = engine change beyond a code hook
(signatures in §7.1).

| Rule | Enc. | Encoding |
|---|---|---|
| Unit choice Terminators / Dreadknight (GRE-1.1, 1.2) | (c) E1 | patrol data `unitChoices:[{id:'heavy', refs:['terminators','dreadknight'], default:'terminators'}]`; `PlayerSetup.unitChoices` (**frozen `types.ts`**); `createGame` skips the unpicked refs and drops attachments whose bodyguard was skipped. Client setup panel gets a two-way picker (client work, not engine). |
| Teleport Assault — pick + removal (GRE-2.1, 2.5) | (b)+(c) E2 | (b) `teleportAssaultPick` — ability descriptor on the three datasheets `{trigger:'turnEnd', code:'teleportAssaultPick'}`; `pick:{window:'turn.end', topic:'abilityChoice', offer, handle}`. `offer` runs once per `turn.end` key (guard `ctx.once('teleportAssault:<round>:<activePlayer>')`); P = the non-active player; candidates = P's canonical board units where every half carries this code, keyword GREY KNIGHTS, not `isTeleporting`, and either no enemy unit is in Engagement Range (`leaderService.unitsInEngagement`) or `hasTeleportFervour(state, unit)`; no candidates → no decision. Options: each candidate + `decline`. `handle`: `removeUnitToReserves(ctx, unitId, abilityId)` + `AbilityTriggered`. Window order (missions.onWindow before hooks.onWindow, both before `evaluateControl('turnEnd')`) already gives GRE-2.5. (c) the removal primitive, the record store, the new event — E2. |
| Teleport Assault — arrival (GRE-2.2, 2.3, 2.6) | (c) E3 | `movement.ts`: `eligibleArrivals` includes `isTeleporting` units of the moving player in **any** round (bypasses the round 2–3 filter); arrival constraints = Deep Strike (`resolveArrival(..., 'teleportAssault')` uses the Deep Strike branch: >9" horizontally from enemies); the Reinforcements decision may not end while a teleporting unit is unplaced except via an explicit `pass`, which destroys it (GRE-2.6); on arrival `clearTeleport` + `ReinforcementsArrived{via:'teleportAssault'}` (**frozen `events.ts`** union extension). `rapidIngressArrival.check` returns false for teleporting units. |
| Teleport Assault — cull / forces / battle end (GRE-2.3, 2.4, 2.7) | (c) E3 | `cullStrandedReserves` skips `isTeleporting` units; `missions.ts hasForces` counts teleporting units in any round; `reducer.ts endBattleChain` calls `destroyStrandedTeleports(ctx)` before the `battle.end` window (emits `UnitLostInReserves` + `ModelDestroyed`/`UnitDestroyed` with null attribution, then `missionService.unitDestroyed`). |
| Daemonic Fervour (GRE-5.3) | (a)+(b) | stratagem `window:['fight.start','fight.attacksResolved']`, `who:'reactive'`, `condition:{phase:'fight', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'inEngagement', count:1}]`, no effect, `code:'teleportFervour'`. (b) `teleportFervour` (stratagem): `check` = target's halves carry `teleportAssaultPick`; `apply` = `grantTeleportFervour(state, canonical)` (record `{unitId, round, turn: activePlayer}`; read by the pick at the same turn's `turn.end`, ignored afterwards — "until end of turn" without an ActiveEffect). Every friendly unit is GREY KNIGHTS, so the filter only needs INFANTRY. |
| Vindictive Strategy (GRE-5.1) | (a) | same shape as `sm.s.gene-wrought-resilience`: `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, `when:{strengthVsToughness:'gt'}`, target `{owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack'}`, `effect:{modifyRoll:{roll:'wound', value:-1}}`, `scope:{who:'attacker'}`, `untilEndOfPhase`. (Do **not** reuse the CSM `vindictiveStrategy` hook — same name, different rule.) |
| Violent Unbinding (GRE-5.2) | (a)+existing hook | reuse the CSM fight-on-death hook: `window:'fight.targetsDeclared'`, `who:'either'`, `condition:{phase:'fight'}`, target `{filter:{keyword:'INFANTRY'}, state:'targetedByAttack'}`, `code:'daemonicFervour'`, `params:{threshold:4}`, `untilEndOfPhase` (exactly `csm.s.daemonic-fervour`: `grantFightOnDeath` + the C5 deferral in `attack.ts`/`fight-on-death.ts`). Do **not** use the CSM `violentUnbinding` hook (that one deals mortal wounds). No new code. |
| Banishment Stone (GRE-3.1) | (b) | `banishmentStone` (kind ability, hook `onModelDestroyed`, `runAt`): enhancement `{trigger:'modelDestroyed', code:'banishmentStone', scope:{who:'bearer'}}`. `runAt(ctx, entry, d)`: fires iff `d.byModelId === entry.bearerModelId`, the destroyed model's own unit is an enemy unit and its datasheet keywords include CHARACTER; rolls 1D6 (`purpose:'ability'`, `commandRerollable:false`); on ≥2 `hookService.gainCp(ctx, holder.player, 1, entry.source.id)` (R-4.2 cap inside `gainCp`); emits `AbilityTriggered` with the roll. |
| Dominating Aura (GRE-3.2) | (a) | enhancement `{trigger:'always', effect:{setStat:{stat:'OC', value:3}}, scope:{who:'bearer'}}` |
| Champion of Titan (GRE-4.1) | (b)+(c) E4 | secondary `scoring:[{when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'championOfTitan', pointsPer:6, cap:999}]`; registry `championOfTitan: missionHook('championOfTitan','onModelDestroyed')`; body `championOfTitanModelDestroyed(ctx, info)` in `missions.ts`, called from the new `MissionService.modelDestroyed` (E4): for pid = `info.byPlayer` with the rule, scores `pointsPer` iff `info.byModelId === modelIdFor(players[pid].warlordUnitId, 0)` and the destroyed model's unit datasheet has CHARACTER; `awardVp` + `mission.scored` push (same as Hallowed Retribution). |
| No Escape (GRE-4.2) | (b) | secondary `scoring:[{when:'turn.end', rounds:{from:1,to:5}, who:'opponent', rule:'custom', code:'noEscape', pointsPer:10, cap:10}]`; registry `noEscape: missionHook('noEscape','onTurnEnd')`; `customAmount` case `noEscape` → `noEscapeAmount(ctx, rule, pid)`: 0 if `vpBySource[rule.id] ≥ cap`; else find the closest existing marker to each player's battlefield edge (new non-frozen helper `playerBattlefieldEdge(board, zone): 'L'\|'R'\|'T'\|'B'` in `geometry.ts`, factored out of `battlefieldEdgeStrip`) and return 10 iff `controls(ctx, id, pid)` for both. |
| Sanctic Hood (GRE-6.1) | (a) | `{trigger:'feelNoPainRoll', when:{sourcePsychic:true, leaderAttached:true}, effect:{feelNoPain:4}, scope:{who:'self'}}` (same shape as the Null Rod). `Condition.sourcePsychic` matches both a [PSYCHIC] weapon attack and damage from a Psychic-tagged ability, so GRE-6.1 is covered in full. |
| Hammerhand (GRE-6.2) | (a) | `{trigger:'always', when:{unitCharged:true}, effect:{when:{weaponType:'melee'}, grantWeaponAbility:{ability:'LETHAL_HITS'}}, scope:{who:'self'}}` on the Terminator datasheet. `unitCharged` reads `turn.chargedThisTurn` (reset each turn = "until end of turn"). Scope `self` covers the whole attached unit, so the Librarian's weapons are included; no attackerKeyword narrowing. |
| Leader (Librarian → Terminators) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['gk.brotherhood-terminator-squad']`; patrol `attachTo:'terminators'` |
| Deep Strike (Librarian, Terminators, Strike) | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]` |
| Deadly Demise D3, Damaged 1–4 (Dreadknight) | (a) | `DEADLY_DEMISE` value `'D3'`; `damaged:{threshold:4, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| Psychic / Hazardous / Precision / Rapid Fire 2 / Sustained Hits 1 | (a) | weapon abilities `PSYCHIC`, `HAZARDOUS`, `PRECISION`, `RAPID_FIRE` 2, `SUSTAINED_HITS` 1 |
| Oval base 120×92 | (a) | `base:{shape:'oval', mm:120, mm2:92}` (as `tyr` Psychophage) |
| BATTLELINE (Strike, Terminators) | (a) | keyword; engine-native for secured objectives (CP-2.4) |

Totals: **5 new code hooks** (`teleportAssaultPick`, `teleportFervour`, `banishmentStone`, `championOfTitan`,
`noEscape`); 1 reused (`daemonicFervour`, CSM). **4 engine changes** (E1 unit choice, E2 removal primitive, E3
arrival/cull/end-of-battle, E4 mission model-destroyed plumbing). Frozen contracts touched: **`types.ts`**
(`PlayerSetup.unitChoices`) and **`events.ts`** (`UnitRemovedFromBattlefield`, `ReinforcementsArrived.via` +
`'teleportAssault'`); matching `docs/spec/00-architecture.md` edit required. No `actions.ts`, `hooks.ts`, `rng.ts`,
`decider.ts` or `index.ts` change (decisions reuse `chooseOption` / the existing reinforcement placement action).

### 7.1 Engine change signatures

```ts
// ---------- E1 Unit choice (GRE-1.1, 1.2) ----------
// src/data/types.ts (not frozen) — CombatPatrolData: add
  unitChoices?: { id: string; refs: string[]; default: string }[]   // each group: exactly one ref is fielded
// JSON schema src/data/schema (combat patrol) gets the same optional array; validate:data checks refs exist and default ∈ refs

// src/engine/types.ts (FROZEN) — PlayerSetup: add
  // group id → chosen unit ref; omitted group → its default. createGame throws EngineInvariantError for an unknown
  // group id or a ref not in the group. Unchosen refs are never created; attachments / attachTo naming them are dropped.
  unitChoices?: Record<string, string>

// ---------- E2 Teleport Assault removal + record store (GRE-2.1) ----------
// src/engine/teleport.ts (new, not frozen). State lives in Player.secondaryState.teleportAssault (free-form, like
// transports.ts 'embarked'); no GameState field is added.
export interface TeleportRecord { unitId: UnitId; removedRound: number; removedInTurnOf: PlayerId; source: string }
export interface TeleportAssaultState {
  pending: TeleportRecord[]                                         // canonical unit ids currently off-board via Teleport Assault
  fervour: { unitId: UnitId; round: number; turn: PlayerId } | null // Daemonic Fervour grant, valid only for that round+turn
}
export function teleportState(state: GameState, player: PlayerId): TeleportAssaultState   // lazily initialises
export function isTeleporting(state: GameState, unitId: UnitId): boolean                  // unitId or any of its halves
// canonical unit: every half → location 'reserves' (attachment kept), push TeleportRecord, emit
// UnitRemovedFromBattlefield once with the canonical id. Throws EngineInvariantError if the unit is not on the board.
export function removeUnitToReserves(ctx: EngineContext, unitId: UnitId, source: string): void
export function clearTeleport(state: GameState, unitId: UnitId): void
export function grantTeleportFervour(state: GameState, unitId: UnitId): void
export function hasTeleportFervour(state: GameState, unitId: UnitId): boolean // record matches canonical id, state.round, state.activePlayer
export function destroyStrandedTeleports(ctx: EngineContext): void            // GRE-2.4; also used for GRE-2.6 with one unit
export function destroyTeleportingUnit(ctx: EngineContext, unitId: UnitId): void

// src/engine/events.ts (FROZEN) — add to the event union
export interface UnitRemovedFromBattlefield extends EventBase { type: 'UnitRemovedFromBattlefield'; unitId: UnitId; source: string }
// and widen:
export interface ReinforcementsArrived extends EventBase {
  type: 'ReinforcementsArrived'; unitId: UnitId; via: 'deepStrike' | 'strategicReserves' | 'rapidIngress' | 'nextWave' | 'teleportAssault'
}
// client: src/client/ui/eventSummary.ts gets a line for both (client work).

// ---------- E3 Arrival / cull / forces / battle end (GRE-2.2–2.7) ----------
// src/engine/phases/movement.ts (not frozen)
//   eligibleArrivals(state, player): + isTeleporting units, no round filter; these are listed first and are mandatory
//   resolveArrival(state, groupIds, placements, via: 'deepStrike' | 'rapidIngress' | 'strategicReserves' | 'nextWave' | 'teleportAssault')
//     'teleportAssault' uses the Deep Strike constraints; success → clearTeleport + ReinforcementsArrived{via:'teleportAssault'}
//   a `pass` while a teleporting unit is unplaced → destroyTeleportingUnit(ctx, id) for each such unit (GRE-2.6)
//   cullStrandedReserves: `if (isTeleporting(s, u.id)) continue`
// src/engine/code-hooks.ts rapidIngressArrival.check: `if (isTeleporting(state, u.id)) return false`
// src/engine/missions.ts hasForces(state, player): true if any isTeleporting unit of `player` exists (any round)
// src/engine/reducer.ts endBattleChain: destroyStrandedTeleports(ctx) before the 'battle.end' window

// ---------- E4 Mission model-destroyed plumbing (GRE-4.1) ----------
// src/engine/missions.ts (not frozen) — MissionService: add
  modelDestroyed?(ctx: EngineContext, info: { unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null }): void
// called in src/engine/attack.ts announceDestroyed() right after hooks.run(ctx, 'onModelDestroyed', …), for every
// ModelDestroyed attack.ts emits (deferred removals included, at the moment ModelDestroyed is emitted).

// ---------- (b) hook bodies — src/engine/factions/grey-knights.ts (new) ----------
export const TELEPORT_ASSAULT_CODE = 'teleportAssaultPick'
export function teleportCandidates(state: GameState, player: PlayerId): UnitId[]   // canonical ids, sorted
export function teleportOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean
export function teleportHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
export function banishmentStoneRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void
export function noEscapeAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number
export function championOfTitanModelDestroyed(ctx: EngineContext, info: { unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null }): void
export const greyKnightsHooks: Record<string, EngineCodeHook>  // teleportAssaultPick, teleportFervour, banishmentStone
// championOfTitan / noEscape are registered as missionHook(...) in code-hooks.ts like the other secondaries.
```

AI note (40-ai, not engine): decline Teleport Assault when the battle ends before the unit's next Movement phase
(round 5 and the Grey Knights player had the first turn); otherwise the default heuristic.

## 8. Test IDs

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

## 9. Figures

Heights follow 30-figures (infantry H 1.1, Terminator 1.3, vehicles/walkers compressed); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `librarian-aurellios` | `gk.librarian-aurellios/librarian` | 1 | 1.3 | 40 mm | A chibi armoured psychic knight in bulky polished silver plate with a tall psychic hood rising behind the head like a fan of cables, deep blue scholar's robes under the armour, a glowing blue-white rune staff-sword in one hand and crackling lightning around the other fist. |
| `gk-terminator-justicar` | `gk.brotherhood-terminator-squad/justicar` | 1 | 1.3 | 40 mm | A chibi hulking silver-armoured knight with huge rounded shoulder plates, a red tabard and a small parchment seal, bare-headed with a stern face and topknot, a wrist-mounted twin gun and a long glowing halberd. |
| `gk-terminator` | `gk.brotherhood-terminator-squad/terminator` | 3 | 1.3 | 40 mm | A chibi hulking knight in gleaming silver plate with an enclosed visor helmet glowing blue, a red cloth tabard, a twin gun on one wrist and a long blue-edged halberd held two-handed. |
| `gk-terminator-psycannon` | `gk.brotherhood-terminator-squad/psycannon` | 1 | 1.3 | 40 mm | The same chibi silver heavy knight carrying a long, chunky multi-barrel cannon with glowing blue coils along it, halberd slung on the back. |
| `strike-justicar` | `gk.strike-squad/justicar` | 1 | 1.1 | 32 mm | A chibi slim silver-armoured knight with a bare stern head and short cape, red tabard, a compact twin gun on the wrist and a glowing blue-bladed sword raised high. |
| `strike-knight` | `gk.strike-squad/knight` | 3 | 1.1 | 32 mm | A chibi silver power-armoured knight with a round visored helmet glowing blue, red tabard, a wrist-mounted twin gun and a long blue-edged halberd. |
| `strike-psilencer` | `gk.strike-squad/psilencer` | 1 | 1.1 | 32 mm | The same chibi silver knight braced behind a long slim rotary-barrel gun that glows pale blue along its length. |
| `nemesis-dreadknight` | `gk.nemesis-dreadknight/dreadknight` | 1 | 2.6 | 120×92 mm oval | A chibi towering silver battle-frame walker with stubby powerful legs, a small armoured pilot seated in its chest cradle, a huge glowing blue greatsword in one giant fist and a shoulder-mounted heavy cannon with blue energy coils, red cloth banners hanging from the waist. |

## 10. Other Grey Knights patrols (appendix)

None listed on wahapedia's Combat Patrol section as of 2026-10-05 (Aurellios' Banishers, June 2023, is the only one).

## 11. Build notes — values to confirm before data entry

- Strike Squad Sv: the CP page prints **2+** (two separate reads agree); the standard GK index Strike Squad is 3+.
  Data follows the source (2+) until the owner says otherwise.
- Strike Squad and Terminator OC 2: as printed on the CP page (standard index Terminators are OC 1).
- Purge Soul: both profiles print identical numbers (24", A1, BS3+, S6, AP−2, D3); only the keywords differ.
- Teleport Assault round-1 arrival (GRE-2.3) is an interpretation, flagged `[interp]`.
