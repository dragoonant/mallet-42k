# Faction spec — Adepta Sororitas: The Penitent Host (second patrol)

Own-words data spec for the second Adepta Sororitas Combat Patrol, same shape as 11-combat-patrol §4. This file covers
**only** this patrol: everything the faction already has (Acts of Faith / Miracle dice engine E1, Patrol Squads E5,
deferred removal E4, shared weapons) is cited by its id in `docs/spec/factions/adepta-sororitas.md` (rules `ADE-*`)
and not restated. Rule ids here are `PEN-<section>.<n>`, cited by the `PEN-` rows of 12-rules-test-checklist.
Mechanics are 1:1 with the source; every sentence of prose is ours. Faction id `adepta-sororitas`, data id prefix
`ade.` (patrol-specific ids carry `pen` where a name would otherwise collide). Values marked **[unconfirmed]** came
through a summarising fetch and should be eyeballed against the source page before data entry (listed again in §11).

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| "The Penitent Host" (primary for this file) | https://wahapedia.ru/wh40k10ed_cp/factions/the-penitent-host/ | Index, 10th ed, June 2023 |
| Faction navigation (enumerates CP patrols) | menu on the page above | lists Sanctuary Guardians and The Penitent Host only |
| Existing faction spec (shared rules) | docs/spec/factions/adepta-sororitas.md | Sanctuary Guardians, June 2024 |

## 1. Roster

7 units, 26 models. Faction keyword ADEPTA SORORITAS on every datasheet. Patrol id `ade.cp.the-penitent-host`.

| Ref | Datasheet id | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|---|
| `canoness` | `ade.canoness-ellyrine` (new) | Canoness Ellyrine | 1 | plasma pistol (standard / supercharge), power weapon (Ellyrine), rod of office (no profile, figure only) | **WARLORD** (the patrol names "the CANONESS model"); enhancement Armour of Faith (default); Leader → `sisters` only; `attachTo: 'sisters'` |
| `sisters` | `ade.pen.battle-sisters-squad` (new) | Battle Sisters Squad | 10 | Sister Superior: boltgun, bolt pistol, chainsword. 6× Sister: boltgun, bolt pistol, close combat weapon. 1× Sister: boltgun, bolt pistol, ccw + Simulacrum Imperialis (no rule on this page). 1× Sister: artificer-crafted storm bolter, bolt pistol, ccw. 1× Sister: Ministorum flamer, bolt pistol, ccw | Patrol Squads (PEN-1.2) |
| `seraphim` | `ade.seraphim-squad` (new) | Seraphim Squad | 5 | Seraphim Superior: plasma pistol (Seraphim), power weapon (Seraphim). 4× Seraphim: two bolt pistols, close combat weapon (Seraphim) | — |
| `repentia` | `ade.repentia-squad` (new) | Repentia Squad | 5 | Repentia Superior: bolt pistol, neural whips. 4× Sister Repentia: penitent eviscerator | — |
| `arcos` | `ade.pen.arco-flagellants` (new) | Arco-flagellants | 3 | each: arco-flails (Penitent Host profile) | — |
| `engine` | `ade.penitent-engine` (new) | Penitent Engine | 1 | penitent flamers, twin penitent buzz-blades | — |
| `rhino` | `ade.sororitas-rhino` (new) | Sororitas Rhino | 1 | storm bolter (Rhino), armoured tracks | Transport 12 (PEN-6.8) |

| Id | Rule |
|---|---|
| PEN-1.1 | Leader eligibility: Canoness Ellyrine lists only this patrol's Battle Sisters Squad (`leader.attachTo:['ade.pen.battle-sisters-squad']`). Seraphim, Repentia, Arcos, Engine and Rhino cannot be led. |
| PEN-1.2 | Patrol Squads (same rule as ADE-1.2, E5): the 10 Sisters may split into two units of 5 at Declare Battle Formations; one part takes the flamer Sister, the other the storm-bolter Sister. Default unsplit. Split parts **[interpretation for the Superior / Simulacrum]**: `sisters-a` = Superior, flamer Sister, 3× boltgun Sister; `sisters-b` = storm-bolter Sister, Simulacrum Sister, 3× boltgun Sister. Starting Strength 5 each. |
| PEN-1.3 | Datasheet sharing: none of the Sanctuary Guardians datasheets is reused. The Battle Sisters Squad and Arco-flagellants have different CP-page profiles here (wargear, abilities, model count, weapon abilities), so they get **new** ids `ade.pen.battle-sisters-squad` / `ade.pen.arco-flagellants`; `ade.battle-sisters-squad` and `ade.arco-flagellants` are untouched. |

## 2. Faction ability — Acts of Faith

Identical to ADE-2.1 – ADE-2.6 (Miracle dice gain at every turn start and on own ADEPTA SORORITAS unit destroyed; one
Act of Faith per unit per phase; one die per roll; eligible rolls Advance, Battle-shock, Charge, Damage, Hit, Save,
Wound). Every Penitent Host datasheet — VEHICLEs included — lists `ade.a.acts-of-faith`. No patrol-scoped ability.

| Id | Rule |
|---|---|
| PEN-2.1 | Reuse: `ade.a.acts-of-faith` on all 7 datasheets. A destroyed Penitent Engine or Rhino also yields a Miracle die (it is an own ADEPTA SORORITAS unit). Hit / Wound / Damage substitution applies to the Engine's and Rhino's attacks, Save substitution to attacks against them. |

## 3. Enhancements (Canoness Ellyrine, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| `ade.e.armour-of-faith` | Armour of Faith | default | the bearer has Feel No Pain 4+. While the bearer leads a unit, every other model in that unit has Feel No Pain 5+. |
| `ade.e.saintly-relic` | Saintly Relic | optional | (PEN-3.1) in your Command phase, if the bearer is not Battle-shocked and is within range of an objective marker you control (3" horizontal / 5" vertical, the normal objective range), gain 1 Miracle die. (PEN-3.2) While the bearer is on the battlefield, each time you gain a Miracle die (from any source) you may re-roll it once. |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `ade.sec.divine-judgement` | Divine Judgement | default | (PEN-4.1) At the start of battle round 1 your **opponent** picks one unit of their own army that is neither MONSTER nor VEHICLE. (PEN-4.2) At the end of the battle: 10 VP if that unit was destroyed by a melee attack of an ADEPTA SORORITAS model of yours; otherwise 6 VP if it was destroyed at all; 0 if it survives. A unit that never arrived from Reserves and is culled at the end of round 3 counts as destroyed with no killer → 6 **[interpretation, same as Bag the Big 'Un]**. Picking a Leader or a bodyguard of an attached unit: only that individual unit has to be destroyed (core Attached-unit rule). No eligible unit → no pick, 0 VP. |
| `ade.sec.rites-of-reconsecration` | Rites of Reconsecration | optional | (PEN-4.3) From battle round 2, at the end of each of your turns: 3 VP if at least one of your ADEPTA SORORITAS units that is not Battle-shocked is wholly within the opponent's deployment zone (an attached unit counts as one unit, every model inside). Flat per turn, never more than 3 in a turn. |

## 5. Patrol stratagems

New ids — the Sanctuary Guardians stratagems with the same names (`ade.s.ascetic-discipline`, `ade.s.a-martyrs-death`,
`ade.s.holy-radiance`) have different effects and are not used by this patrol.

| Id | Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|---|
| `ade.s.pen.ascetic-discipline` | Ascetic Discipline | 1 | Epic Deed | opponent's Shooting phase or a Fight phase, just after an enemy unit selects its targets (`shooting.targetsDeclared`, `fight.targetsDeclared`) | one own ADEPTA SORORITAS unit that is a target of those attacks | (PEN-5.1) until end of phase models in the unit have a 5+ invulnerable save; 4+ instead if the unit is a BATTLE SISTERS SQUAD or SERAPHIM SQUAD. Fight phase: either player's turn **[interpretation]**. |
| `ade.s.pen.a-martyrs-death` | A Martyr's Death | 1 | Battle Tactic | your Shooting phase, or the Fight phase of either turn | one own ADEPTA SORORITAS INFANTRY unit not yet selected to shoot or fight this phase | (PEN-5.2) until end of phase the unit's weapons have [LETHAL HITS]. |
| `ade.s.pen.holy-radiance` | Holy Radiance | 2 | Battle Tactic | Fight phase (either turn), just after an enemy unit selects its targets (`fight.targetsDeclared`) | one own ADEPTA SORORITAS unit that is a target of those attacks | (PEN-5.3) until end of phase, each time a model of the unit is destroyed while it has not yet fought this phase, it is not removed; once the attacking unit has finished all its attacks the model fights, then it is removed. No dice roll, no Miracle discard. |

Core stratagems apply per 10-rules §11 with their keyword gates (Tank Shock: Rhino / Penitent Engine are VEHICLEs;
Fire Overwatch: Repentia Sisters and Arcos lack ranged weapons, the Repentia Superior's bolt pistol qualifies).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Canoness Ellyrine | 1 | 32 mm | 6 | 3 | 3+ | 4+ | 4 | 7+ | 1 | INFANTRY, CHARACTER, IMPERIUM, CANONESS, ELLYRINE | Leader → Battle Sisters Squad (PEN); Acts of Faith; Lead the Righteous (= `ade.a.lead-the-righteous`, PEN-6.1) |
| Battle Sisters Squad (PEN) | 10 | 32 mm | 6 | 3 | 3+ | 6+ | 1 | 7+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, BATTLE SISTERS SQUAD | Acts of Faith; Patrol Squads. Simulacrum Imperialis is carried but **no rule** is printed for it on this page (PEN-6.2) **[unconfirmed]** |
| Seraphim Squad | 5 | 32 mm | 12 | 3 | 3+ | 5+ | 1 | 7+ | 1 | INFANTRY, JUMP PACK, FLY, IMPERIUM, SERAPHIM SQUAD | Deep Strike; Acts of Faith; Angelic Ascent (PEN-6.3) |
| Repentia Squad | 5 | 28 mm | 7 | 3 | Superior 3+ / Sister Repentia 7+ | 6+ | 1 | Superior 7+ / Sister Repentia 8+ | 1 | INFANTRY, IMPERIUM, REPENTIA SQUAD | Feel No Pain 5+; Acts of Faith; Overseer of Redemption (PEN-6.4) — per-model Sv/Ld **[unconfirmed mapping]** |
| Arco-flagellants (PEN) | 3 | 25 mm | 7 | 3 | 7+ | — | 2 | 8+ | 1 | INFANTRY, IMPERIUM, ARCO-FLAGELLANTS | Feel No Pain 4+; Acts of Faith (no Extremis Trigger Word in this patrol) |
| Penitent Engine | 1 | 50 mm | 8 | 6 | 4+ | — | 5 | 7+ | 2 | VEHICLE, WALKER, IMPERIUM, PENITENT ENGINES | Deadly Demise 1; Feel No Pain 5+; Acts of Faith; Endless Suffering (PEN-6.5) |
| Sororitas Rhino | 1 | hull, "use model" (≈ 120 × 75 mm footprint **[interpretation]**) | 12 | 9 | 3+ | 6+ | 10 | 7+ | 2 | VEHICLE, TRANSPORT, DEDICATED TRANSPORT, SMOKE, IMPERIUM, SORORITAS RHINO | Deadly Demise D3; Firing Deck 2; Acts of Faith; Transport (PEN-6.8) |

| Id | Rule |
|---|---|
| PEN-6.1 | Lead the Righteous: while Ellyrine leads a unit, any hit roll for an attack by a model in that unit may be re-rolled (same descriptor as the existing `ade.a.lead-the-righteous`). |
| PEN-6.2 | Simulacrum Imperialis has no effect in this patrol (the page gives no ability for it; `ade.a.simulacrum-imperialis` is NOT on `ade.pen.battle-sisters-squad`). The bearer is a plain boltgun Sister with a banner figure. |
| PEN-6.3 | Angelic Ascent: just after the unit has shot in your Shooting phase, if it is not within Engagement Range of an enemy unit, it may make a Normal move of up to 6"; if it does, it cannot declare a charge this turn. |
| PEN-6.4 | Overseer of Redemption: while the unit contains its Repentia Superior (alive), melee hit rolls of models in the unit may be re-rolled, and if the unit made a Charge move this turn its melee wound rolls may be re-rolled too. |
| PEN-6.5 | Endless Suffering: Advancing does not stop the Penitent Engine from charging later in the same turn. |
| PEN-6.6 | Feel No Pain: Repentia 5+, Arcos 4+, Penitent Engine 5+. Sister Repentia Sv 7+ = no armour save, the 6+ invuln is used. |
| PEN-6.7 | Deadly Demise: Penitent Engine 1, Rhino D3 (core R-10.4). |
| PEN-6.8 | Transport: the Rhino carries up to 12 ADEPTA SORORITAS INFANTRY models, never JUMP PACK models (so Seraphim cannot embark). Firing Deck 2 (R-5.19). **Deferrable** for the first playable build (E-PEN2): the Rhino then plays as an empty gun vehicle and Firing Deck is inert, like GEN-6.9. |

Wargear per model:
| Unit | Model key | Count | Ranged | Melee |
|---|---|---|---|---|
| Canoness Ellyrine | `canoness` | 1 | plasma pistol (Ellyrine), standard + supercharge | power weapon (Ellyrine) |
| Battle Sisters (PEN) | `superior` | 1 | bolt pistol, boltgun | chainsword |
| Battle Sisters (PEN) | `sister-storm-bolter` | 1 | bolt pistol, artificer-crafted storm bolter | close combat weapon |
| Battle Sisters (PEN) | `sister-flamer` | 1 | bolt pistol, Ministorum flamer | close combat weapon |
| Battle Sisters (PEN) | `sister-simulacrum` | 1 | bolt pistol, boltgun | close combat weapon |
| Battle Sisters (PEN) | `sister` | 6 | bolt pistol, boltgun | close combat weapon |
| Seraphim Squad | `superior` | 1 | plasma pistol (Seraphim), standard + supercharge | power weapon (Seraphim) |
| Seraphim Squad | `seraphim` | 4 | paired bolt pistols | close combat weapon (Seraphim) |
| Repentia Squad | `superior` | 1 | bolt pistol | neural whips |
| Repentia Squad | `repentia` | 4 | — | penitent eviscerator |
| Arco-flagellants (PEN) | `arco` | 3 | — | arco-flails (PEN) |
| Penitent Engine | `engine` | 1 | penitent flamers | twin penitent buzz-blades |
| Sororitas Rhino | `rhino` | 1 | storm bolter (Rhino) | armoured tracks |

Weapon profiles (reused ids keep their existing data; new ids are appended to `weapons.json`):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `ade.w.bolt-pistol` (reuse) | bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `ade.w.boltgun` (reuse) | boltgun | 24" | 1 | 3+ | 4 | 0 | 1 | Rapid Fire 1 |
| `ade.w.ministorum-flamer` (reuse) | Ministorum flamer | 12" | D6 | n/a | 5 | 0 | 1 | Ignores Cover, Torrent |
| `ade.w.close-combat-weapon` (reuse) | close combat weapon (Sister) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| `ade.w.ellyrine-plasma-pistol` / `-supercharge` | plasma pistol (Ellyrine) | 12" | 1 | 2+ | 7 / 8 | −2 / −3 | 1 / 2 | Pistol; supercharge also Hazardous; `profileGroup` `ade.w.ellyrine-plasma-pistol` |
| `ade.w.ellyrine-power-weapon` | power weapon (Ellyrine) | melee | 4 | 2+ | 4 | −2 | 1 | — |
| `ade.w.artificer-storm-bolter` | artificer-crafted storm bolter | 24" | 2 | 3+ | 4 | 0 | 2 | Rapid Fire 2 |
| `ade.w.chainsword` | chainsword | melee | 3 | 4+ | 3 | 0 | 1 | — |
| `ade.w.seraphim-plasma-pistol` / `-supercharge` | plasma pistol (Seraphim) | 12" | 1 | 3+ | 7 / 8 | −2 / −3 | 1 / 2 | Pistol; supercharge also Hazardous; `profileGroup` `ade.w.seraphim-plasma-pistol` |
| `ade.w.paired-bolt-pistols` | paired bolt pistols | 12" | 2 | 3+ | 4 | 0 | 1 | Pistol — two bolt pistols merged into one A2 weapon **[interpretation: data has no duplicated weapon ids; the only difference, splitting the two pistols between targets, is lost]** |
| `ade.w.seraphim-power-weapon` | power weapon (Seraphim) | melee | 3 | 3+ | 4 | −2 | 1 | — |
| `ade.w.seraphim-ccw` | close combat weapon (Seraphim) | melee | 2 | 3+ | 3 | 0 | 1 | — |
| `ade.w.neural-whips` | neural whips | melee | 4 | 3+ | 3 | −1 | 1 | Anti-Infantry 4+ |
| `ade.w.penitent-eviscerator` | penitent eviscerator | melee | 2 | 4+ | 6 | −2 | 2 | — |
| `ade.w.pen-arco-flails` | arco-flails (PEN) | melee | 4 | 4+ | 5 | 0 | 1 | Sustained Hits 1, Twin-linked |
| `ade.w.penitent-flamers` | penitent flamers | 12" | 2D6 | n/a | 5 | 0 | 1 | Assault, Ignores Cover, Torrent, Twin-linked |
| `ade.w.penitent-buzz-blades` | twin penitent buzz-blades | melee | 4 | 4+ | 10 | −3 | 2 | Sustained Hits 1, Twin-linked |
| `ade.w.rhino-storm-bolter` | storm bolter (Rhino) | 24" | 2 | 3+ | 4 | 0 | 1 | Rapid Fire 2 |
| `ade.w.armoured-tracks` | armoured tracks | melee | 3 | 4+ | 6 | 0 | 1 | — |

`paintScheme`: same as the faction (adepta-sororitas.md §6). Penitent Engine / Repentia lean on the crimson trim.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema); (b) = code hook (registered in `src/engine/code-hooks.ts` via
`adeptaSororitasHooks`, bodies in `src/engine/factions/adepta-sororitas.ts`, mission bodies in `missions.ts` as for
`hallowedRetribution`); (c) = engine change beyond a hook, numbered E-PEN1 – E-PEN3, signatures in §7.1.

| Rule | Enc. | Encoding |
|---|---|---|
| Acts of Faith (PEN-2.1) | (a) reuse | `abilities:['ade.a.acts-of-faith', …]` on all 7 new datasheets. Nothing new: E1 (`miracle.ts`) already keys on the ability code. |
| Leader (PEN-1.1) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader:{attachTo:['ade.pen.battle-sisters-squad'], effects:[]}`; patrol `attachTo:'sisters'`, `warlord:'canoness'` |
| Patrol Squads (PEN-1.2) | (a) reuse E5 | patrol unit `patrolSquads:[{ref:'sisters-a',size:5,wargear:[superior, sister-flamer, 3× sister]}, {ref:'sisters-b',size:5,wargear:[sister-storm-bolter, sister-simulacrum, 3× sister]}]` + the `patrolSquads` marker ability already used by `ade.battle-sisters-squad` |
| Lead the Righteous (PEN-6.1) | (a) reuse | ability id `ade.a.lead-the-righteous` on `ade.canoness-ellyrine` |
| Armour of Faith | (a) | `enhancements.json` `ade.e.armour-of-faith` with two effect abilities: `{trigger:'feelNoPainRoll', effect:{feelNoPain:4}, scope:{who:'bearer'}}` and `ade.e.armour-of-faith.unit` `{trigger:'feelNoPainRoll', when:{leaderAttached:true}, effect:{feelNoPain:5}, scope:{who:'self'}}` (engine takes the best single FNP, so the bearer keeps 4+, the bodyguards get 5+) |
| Saintly Relic — gain (PEN-3.1) | (b) | `saintlyRelicGain` (`kind:'ability'`, `hook:'onPhaseEnd'`, `runAt`, enhancement ability `when:{phase:'command', ownTurn:true}`): bearer = `enhancementBearer(s, player, 'saintlyRelicGain')`; if bearer on board, bearer's unit not `battleShocked`, and the bearer model is `withinObjectiveRange` of an objective that `controlsNow(ctx, obj, player)` → `gainMiracleDie(ctx, player, abilityId)` once (one die total, not per marker). Same ordering slot as `simulacrumImperialis` (before `command.end` scoring). |
| Saintly Relic — re-roll on gain (PEN-3.2) | (c) E-PEN1 | marker ability `code:'saintlyRelic'` on the enhancement (registered noop like `actsOfFaith`); `miracle.ts gainMiracleDie` queues every gained value while a Saintly Relic bearer is on the board; the window runner offers the queued re-rolls (one `chooseOption` per die, `keep` / `reroll`) at the next timing window; a re-rolled die is never offered again. AI: re-roll a value ≤ 3. |
| Divine Judgement — pick (PEN-4.1) | (b) | secondary scoring rule `{id:'divine-judgement-pick', when:'round.start', rounds:{from:1,to:1}, who:'both', rule:'custom', code:'divineJudgementPick', pointsPer:0, cap:0}`; `divineJudgementPick = missionHook('divineJudgementPick')`, added to `PICK_CODES` in missions.ts; `runPick` → `divineJudgementPickRule(ctx, rule, owner, key)`: candidates = opponent's units not destroyed, not MONSTER, not VEHICLE; `offerChoice(ctx, opponent, …, topic 'other', data {code:'divineJudgement', owner, ruleId}, canPass false)` — the **opponent** is the decision's player; the missions decision handler routes topic `'other'` with `data.code==='divineJudgement'` and stores `players[owner].secondaryState.divineJudgementUnitId`. No candidates → no decision. AI (opponent side, 40-ai): pick the candidate with the highest `W × models` (tie: best Sv), i.e. the hardest unit to kill. |
| Divine Judgement — score (PEN-4.2) | (b) | rule `{id:'divine-judgement', when:'battle.end', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'divineJudgementScore', pointsPer:6, cap:10, params:{meleePoints:10}}`; `divineJudgementScore = missionHook('divineJudgementScore')`; amount fn in `customAmount`: target = `secondaryState.divineJudgementUnitId`; `location==='destroyed'` (or still `reserves`) → if `destroyedBy?.kind==='melee' && destroyedBy.player===owner && destroyedBy.unitId` has ADEPTA SORORITAS → `meleePoints` (10) else `pointsPer` (6); otherwise 0. |
| Rites of Reconsecration (PEN-4.3) | (a) reuse | rule `{id:'rites-of-reconsecration', when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'custom', code:'reclaimAndDominate', pointsPer:3, cap:3, params:{keyword:'ADEPTA SORORITAS'}}` — the Necrons `reclaimAndDominateAmount` is exactly this rule (non-Battle-shocked, attached unit as one, every model wholly inside the opponent's zone, flat award) and already takes `params.keyword`. |
| Ascetic Discipline (PEN-5.1) | (a) | stratagem `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting',ownTurn:false},{phase:'fight'}]}`, target `{role:'unit', owner:'friendly', filter:{keyword:'ADEPTA SORORITAS'}, state:'targetedByAttack', count:1}`, `effect:[{invuln:4, when:{targetKeyword:['BATTLE SISTERS SQUAD','SERAPHIM SQUAD']}}, {invuln:5}]` (conditional entry first: within one stratagem the first matching entry wins per key), `scope:{who:'self'}`, `untilEndOfPhase` — same shape as `nec.s.mercurial-resilience`; `saveSetup` collects save mods with the attack context so `targetKeyword` reads the defending unit; across separate sources the best invuln wins. |
| A Martyr's Death (PEN-5.2) | (a) | `window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{any:[{phase:'shooting',ownTurn:true},{phase:'fight'}]}`, target `{owner:'friendly', filter:{keyword:'INFANTRY'}, state:'notYetActivated'}` (every friendly unit is ADEPTA SORORITAS, so the INFANTRY filter is the whole gate), `effect:{grantWeaponAbility:{ability:'LETHAL_HITS'}}`, `scope:{who:'self'}`, `untilEndOfPhase` |
| Holy Radiance (PEN-5.3) | (b) extend | reuse the existing `aMartyrsDeath` hook with new params on `ade.s.pen.holy-radiance`: `code:'aMartyrsDeath', params:{roll:false, discardsMiracleDie:false, perModelGate:true}`; window `fight.targetsDeclared`, `who:'either'`, `condition:{phase:'fight'}`, target state `targetedByAttack`, cost 2. Hook change (backward compatible, Sanctuary Guardians params untouched): `apply` skips the discard `chooseOption` when `params.discardsMiracleDie === false`; `produce` skips the D6 and treats the model as a success when `params.roll === false` (still per-model `modelNotYetActed` gate, still `deferRemoval:{kind:'melee', afterUnitId:byUnitId}` → existing E4 `deferred.ts` does pile-in / fight / removal). |
| Angelic Ascent (PEN-6.3) | (b) | `angelicAscent` (`kind:'ability'`, `hook:'onUnitSelectedToShoot'`, `pick:{window:'shooting.attacksResolved', topic:'abilityChoice'}` — same slot as Tyranids `disruptionBombardment`): offer to the unit that just shot (key = its id) if it holds the ability, is on the board, its turn, not `anyWithinEngagementRange`, and not already offered (`pick:angelic:<unitId>` mark). `use` → `startReactiveMove(ctx, unitId, 6, abilityId, 'shooting.attacksResolved')` (FLY movement rules come with it) and `services.effects.grant(ctx, unitId, [{forbid:'charge'}], {scope:{who:'self'}, duration:'untilEndOfTurn'})`. `decline` → nothing. |
| Overseer of Redemption (PEN-6.4) | (a) after E-PEN3 | two abilities: `{trigger:'hitRoll', when:{unitHasModel:'superior', weaponType:'melee'}, effect:{reroll:'all'}, scope:{who:'self'}}` and `{trigger:'woundRoll', when:{unitHasModel:'superior', weaponType:'melee', unitCharged:true}, effect:{reroll:'all'}, scope:{who:'self'}}` |
| Repentia per-model stats | (a) | `composition[].statsOverride`: Sister Repentia `{Sv:7, Ld:8}` on top of the datasheet line `M7 T3 Sv3 W1 Ld7 OC1` (Superior) |
| Endless Suffering (PEN-6.5) | (a) | `{trigger:'always', effect:{chargeAfterAdvance:true}, scope:{who:'self'}}` |
| Deep Strike (Seraphim) | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]` |
| Feel No Pain 5+/4+/5+ (PEN-6.6) | (a) | `coreAbilities:[{ability:'FEEL_NO_PAIN', value:5}]` (Repentia, Engine), `value:4` (Arcos) |
| Deadly Demise 1 / D3 (PEN-6.7) | (a) | `{ability:'DEADLY_DEMISE', value:1}` / `value:'D3'` |
| Transport 12 + Firing Deck 2 (PEN-6.8) | (c) E-PEN2 | data `transport:{capacity:12, keywords:['ADEPTA SORORITAS','INFANTRY'], excludeKeywords:['JUMP PACK']}` + `{ability:'FIRING_DECK', value:2}`. Deferrable: until E-PEN2 lands the data loads, no embark is offered, Firing Deck inert. |
| SMOKE (core Smokescreen), DEDICATED TRANSPORT, WALKER, JUMP PACK, FLY | (a) | SMOKE enables the core stratagem `core.s.smokescreen` (10-rules-core §11) for the Sororitas Rhino (the patrol page lists Smokescreen, 1 CP); no unit can use Grenade. DEDICATED TRANSPORT, WALKER, JUMP PACK, FLY are plain keywords |
| Pistol / Rapid Fire 1–2 / Torrent / Ignores Cover / Hazardous / Anti-Infantry 4+ / Sustained Hits 1 / Twin-linked / Assault / supercharge profiles | (a) | weapon abilities `PISTOL`, `RAPID_FIRE`, `TORRENT`, `IGNORES_COVER`, `HAZARDOUS`, `ANTI` (`INFANTRY` 4), `SUSTAINED_HITS` 1, `TWIN_LINKED`, `ASSAULT`; plasma modes via `profileGroup` (as `am.w.plasma-pistol`) |

Totals: **4 new code hooks** (`saintlyRelicGain`, `divineJudgementPick`, `divineJudgementScore`, `angelicAscent`) plus
1 marker noop (`saintlyRelic`, engine-read) and 1 backward-compatible extension of `aMartyrsDeath`; **3 engine
changes** (E-PEN1 Miracle re-roll on gain, E-PEN2 transport wiring + Firing Deck — deferrable, E-PEN3 `unitHasModel`
condition). Frozen contracts touched: **none** (E-PEN1 keeps its queue in `secondaryState`, E-PEN2 answers through
existing `chooseOption` / `moveUnit` / `declareTargets` actions with topic `'other'`, E-PEN3 is in `src/data/types.ts`).

### 7.1 Engine change signatures

```ts
// ---------- E-PEN1 Miracle die re-roll on gain (Saintly Relic) ----------
// src/engine/miracle.ts (not frozen)
export const SAINTLY_RELIC_CODE = 'saintlyRelic'
// true iff `player` has an enhancement ability with code 'saintlyRelic' whose bearer model is alive on the battlefield
export function miracleRerollOnGain(state: GameState, player: PlayerId): boolean
// gainMiracleDie (existing signature unchanged): after pushing value v, when miracleRerollOnGain(state, player) and
// source !== MIRACLE_REROLL_SOURCE, push v onto players[player].secondaryState.miracleRerollPending (number[]).
export const MIRACLE_REROLL_SOURCE = 'saintlyRelicReroll'
// called by the window runner at the start of every timing window (before pick hooks), and by clearActsOfFaithPhase's
// caller before a phase ends: if a pending value exists and no decision is open, raise ONE chooseOption
//   { player, topic: 'abilityChoice', unitId: bearer unit, abilityId: Saintly Relic ability id,
//     data: { code: 'saintlyRelicReroll', value, window, key }, options: 'keep' | 'reroll', canPass: false }
// returns true when a decision was opened (the window re-enters after the answer, like other picks).
export function offerMiracleRerolls(ctx: EngineContext, window: TimingWindowId, key: string): boolean
// answer: shift the pending value; 'reroll' → if the pool still holds a die of that value, remove one (no
// MiracleDieSpent: it is replaced, not spent), then gainMiracleDie(ctx, player, MIRACLE_REROLL_SOURCE) (rolled D6,
// purpose 'ability', not command-rerollable, never queued again); 'keep' → nothing. A pending value whose die was
// already spent is dropped without a decision. Bearer dead when the offer comes up → pending list cleared.
export function answerMiracleReroll(ctx: EngineContext, action: Action, pending: ChooseOptionDecision): Rejection | void

// ---------- E-PEN2 Transport wiring + Firing Deck (deferrable) ----------
// src/data/types.ts (not frozen): DatasheetData add
  transport?: { capacity: number; keywords: Keyword[]; excludeKeywords?: Keyword[] }  // all `keywords` required, none of `excludeKeywords`
// src/engine/transports.ts: capacity() reads ds.transport?.capacity first, keeps the `TRANSPORT:<n>` keyword fallback;
// canEmbark additionally checks keywords / excludeKeywords and counts MODELS (not units) against capacity.
export function embarkOffer(ctx: EngineContext, unitId: UnitId): boolean
//   after moveUnit resolves a Normal/Advance/Fall Back move: if canEmbark for some friendly transport, raise
//   chooseOption topic 'other', data { code: 'embark', unitId }, options 'stay' | `embark:<transportUnitId>`; returns true if raised
export function answerEmbark(ctx: EngineContext, action: Action, pending: ChooseOptionDecision): Rejection | void
//   `embark:<id>` → transportService.embark(state, unitId, id); emits UnitEmbarked (existing event if present, else
//   AbilityTriggered summary — no events.ts change)
// movement.ts: chooseUnitToActivate accepts an embarked unit whose transport has not Advanced/Fallen Back this phase and
// that began the phase embarked; declareMove then moveUnit placements are validated as "set up wholly within 3" of the
// transport, outside Engagement Range, then the declared move" (R-5.18 modes already in transports.disembarkModeThisPhase).
export function validateDisembarkPlacements(state: GameState, unitId: UnitId, transportUnitId: UnitId, placements: ModelPlacement[]): Rejection | null
// shooting.ts: when the transport is selected to shoot, its declareTargets may also carry WeaponTarget entries whose
// modelId is an embarked model (≤ FIRING_DECK value models, one ranged non-[ONE SHOT] weapon each, units not yet shot);
// those passenger units are then marked shotThisPhase.
export function firingDeckWeapons(state: GameState, transportUnitId: UnitId): { modelId: ModelId; weaponIds: WeaponId[] }[]
// setup (optional, later): PatrolUnitData add `startsEmbarkedIn?: string` (transport ref) — not needed for v1.

// ---------- E-PEN3 "unit contains model" condition ----------
// src/data/types.ts (not frozen): Condition add
  unitHasModel?: string   // holder unit (attached halves included) has a live model whose datasheetModelId === value or ends with `/${value}`
// src/engine/hooks-impl.ts evaluateCondition: reads the holder unit (h) and its partner half; false when no such model
```

## 8. Test IDs

Same list as the `PEN` section of 12-rules-test-checklist. Engine tests: `tests/engine/adepta-sororitas-the-penitent-host.test.ts`;
data tests: `tests/data/adepta-sororitas-the-penitent-host.test.ts`.

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
| PEN-013 | PEN-5.2 | A Martyr's Death: own Shooting, Battle Sisters not yet shot → boltgun unmodified 6 to hit auto-wounds; Penitent Engine / Rhino not eligible targets; not usable in the opponent's turn |
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

## 9. Figures

Heights follow 30-figures (infantry H 1.1, character 1.2, vehicles at 60 % true height). Only new models need figures;
the PEN Battle Sisters reuse `battle-sister`, `battle-sister-flamer`, `battle-sister-simulacrum`, and PEN Arcos reuse
`arco-flagellant` (adepta-sororitas.md §9). Faction palette: near-black armour, bone cloth, crimson trim, brass metal.
No real-world or GW iconography.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `canoness-ellyrine` | `ade.canoness-ellyrine/canoness` | 1 | 1.2 | 32 mm | A chibi battle-nun commander in black plate with brass trim and a flowing crimson cloak, long dark braid, a tall brass rod topped with a winged ornament in one hand, a stubby glowing-blue plasma pistol in the other and a straight sword at her hip. |
| `battle-sister-superior-chainsword` | `ade.pen.battle-sisters-squad/superior` | 1 | 1.1 | 32 mm | The chibi armoured sister in black plate and bone tabard with a short white bob and a crimson sash, a boxy rifle slung on her back and a chunky toothed chainsword raised overhead. |
| `battle-sister-storm-bolter` | `ade.pen.battle-sisters-squad/sister-storm-bolter` | 1 | 1.1 | 32 mm | The chibi armoured sister bracing an ornate double-barrelled brass-chased rifle with a drum magazine against her hip. |
| `seraphim-superior` | `ade.seraphim-squad/superior` | 1 | 1.2 | 32 mm | A chibi airborne sister in black plate with a white bob, a backpack of two upturned brass thruster nozzles with short feathered fins, a plasma pistol in one hand and a glowing straight sword in the other. |
| `seraphim` | `ade.seraphim-squad/seraphim` | 4 | 1.2 | 32 mm | A chibi airborne sister in black plate with a bone tabard, twin-nozzle brass thruster pack with little fin-wings, a chunky pistol held out in each hand. |
| `repentia-superior` | `ade.repentia-squad/superior` | 1 | 1.1 | 28 mm | A chibi stern overseer in a long black robe and crimson cowl over light armour, holding a pistol in one hand and a bundle of three crackling purple whip cords in the other. |
| `sister-repentia` | `ade.repentia-squad/repentia` | 4 | 1.1 | 28 mm | A chibi barefoot penitent in a ragged crimson shift and bandage wraps, cropped hair under a red hood, swinging an oversized two-handed chain-blade almost as tall as she is. |
| `penitent-engine` | `ade.penitent-engine/engine` | 1 | 2.0 | 50 mm | A chibi hunched two-legged walker frame of dark iron with brass rivets, a small bound figure strapped in a crimson-draped cage at its chest, two long spinning saw-blade arms and a pair of stubby flame nozzles on the shoulders. |
| `sororitas-rhino` | `ade.sororitas-rhino/rhino` | 1 | 1.6 | hull ≈ 120 × 75 mm | A chibi chunky boxy tracked carrier in black armour with bone-coloured panels and crimson trim, a rounded hatch with a stubby twin-barrel gun on top, small smoke launchers on the front corners and a little brass spire ornament on the roof. |

## 10. Other Adepta Sororitas patrols (appendix)

- Sanctuary Guardians — Index June 2024 — Canoness Adalya (1, WARLORD), Battle Sisters Squad (10), Celestian Sacresants (5), Arco-flagellants (10); already playable, spec `docs/spec/factions/adepta-sororitas.md`.

## 11. Build notes — values to confirm before data entry

- Repentia per-model line: the page prints `7" 3 7+ 1 8+ 1` beside the Superior label without column headers; this
  spec reads it as the Sister Repentia line (Sv 7+, Ld 8+) and gives the Superior the squad line (Sv 3+, Ld 7+).
- Simulacrum Imperialis: no rule text on this page → inert here (PEN-6.2).
- Penitent Engine: no invulnerable save, Ld 7+ as fetched.
- Rhino footprint (page says "use model") and Ascetic Discipline's Fight-phase scope (either turn) are interpretations.
- Seraphim paired bolt pistols merged into one A2 weapon (see weapon table).
- Patrol Squads placement of the Superior and the Simulacrum bearer between the halves is not stated.

**E-PEN2 Hazardous ruling:** a failed Hazardous test on a weapon fired through Firing Deck is resolved against the transport (the Rhino takes the 3 mortal wounds), not the passenger. Legal actions always offer the transport-only declaration plus one Firing Deck variant.
