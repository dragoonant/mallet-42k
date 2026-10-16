# Faction spec — Tyranids: Insidious Infiltrators (second patrol)

Own-words data spec for the second Tyranids Combat Patrol, same shape as 11-combat-patrol §4 and
`docs/spec/factions/tyranids.md` (the Vardenghast Swarm, cited below as **TYR**). This file covers ONLY this patrol:
anything identical to TYR is cited by id, every difference is recorded here. Rule ids `INF-<section>.<n>` are cited by
the `INF-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose is ours. Data id
prefix stays `tyr.` (faction `tyranids`, faction keyword `TYRANIDS`); new records get new ids, no existing record or
value changes.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Tyranids "Insidious Infiltrators" (primary for this file) | https://wahapedia.ru/wh40k10ed_cp/factions/insidious-infiltrators/ | Index, 10th ed, last update May 2024 |
| Tyranids "The Vardenghast Swarm" (existing patrol, TYR) | https://wahapedia.ru/wh40k10ed_cp/factions/the-vardenghast-swarm/ | Index, 10th ed, June 2023 (see TYR §0) |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | captured in 11-combat-patrol §1–2; not re-fetched |

The patrol page was fetched three times on 2026-10-15 (stats, abilities, keyword lines re-checked). Patrol enumeration
is unchanged from TYR §0/§10: wahapedia lists exactly two Tyranids patrols (appendix §10).

## 1. Roster

5 units, 11 models. Faction keyword TYRANIDS on every datasheet. No SYNAPSE and no CHARACTER keyword anywhere in this
patrol.

| Ref | Unit | Datasheet id | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|---|
| `deaths-shadow` | Death's Shadow (Neurolictor) | `tyr.deaths-shadow` (new) | 1 | piercing claws and talons | **WARLORD** (enhancement bearer although not a CHARACTER). No Leader ability → always alone |
| `lictor` | Lictor | `tyr.lictor` (new) | 1 | Lictor claws and talons | — |
| `leapers-a` | Von Ryan's Leapers | `tyr.von-ryans-leapers-inf` (new) | 3 | each: Leaper's talons | — |
| `leapers-b` | Von Ryan's Leapers | `tyr.von-ryans-leapers-inf` | 3 | each: Leaper's talons | — |
| `leapers-c` | Von Ryan's Leapers | `tyr.von-ryans-leapers-inf` | 3 | each: Leaper's talons | — |

| Id | Rule |
|---|---|
| INF-1.1 | The page states each unit's size as "(N MODELS)" and introduces the Leapers three times; the patrol fields three separate 3-model Leaper units (matches TYR §10). No Patrol Squads rule, no unit choices, no wargear options, no leader attachments. |
| INF-1.2 | WARLORD = Death's Shadow; the enhancement goes on its only model (engine C1 bearer fallback: first model when no CHARACTER model exists, `enhancements.ts`). |

Patrol data `src/data/factions/tyranids/patrols/insidious-infiltrators.json`, id `tyr.cp.insidious-infiltrators`;
append that id to `faction.json` `combatPatrols` (no other faction.json value changes).

## 2. Faction ability

| Id | Rule |
|---|---|
| INF-2.1 | **Shadow in the Warp** — identical to TYR-2.4/TYR-2.5; reuse ability `tyr.a.shadow-in-the-warp` (code `shadowInTheWarp`) unchanged. Holder here: Death's Shadow only (the Lictor and Leapers do not carry it). |
| INF-2.2 | **No Synapse.** Unlike TYR-2.1–2.3, no datasheet in this patrol lists Synapse, and no unit has SYNAPSE, so every Tyranid Battle-shock test in this patrol is 2D6. `faction.json` `armyRule` stays `tyr.a.synapse` (it only registers the ability record; nothing here carries it). The faction ability is therefore patrol-scoped by sitting on Death's Shadow's datasheet, not by editing faction.json. |

## 3. Enhancements (Death's Shadow, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| INF-3.1 | Neurogoad (`tyr.e.neurogoad`) | default | In your Command phase, pick one friendly TYRANIDS unit within 12" of the bearer (the bearer's own unit allowed). Until the start of your next Command phase, that unit may re-roll its Charge rolls, and its models may re-roll their Hit rolls. |
| INF-3.2 | Psionic Phantoms (`tyr.e.psionic-phantoms`) | optional | Once per battle round, when the bearer is chosen as a target of one or more ranged attacks by models of an enemy unit, the bearer may make a Normal move of up to 6". If afterwards that enemy unit can no longer see the bearer, roll one D6: on 1–3 the models that had picked the bearer may choose new targets; on 4–6 they cannot, and those models make no attacks this phase. |

Rule details:

| Id | Rule |
|---|---|
| INF-3.3 | Neurogoad timing **[interpretation]**: offered at your own `command.start` (same slot as Shadow in the Warp), once per own Command phase. "Until the start of your next Command phase" = engine duration `untilNextTurn` owned by the Tyranid player (expires at the start of the Tyranid player's next turn, whose first step is that Command phase), so it covers the opponent's turn too (e.g. hit re-rolls in the opponent's Fight phase). The Charge re-roll re-rolls the whole 2D6; the Hit re-roll is a full re-roll of any hit die. |
| INF-3.4 | Psionic Phantoms trigger **[interpretation]**: offered to the bearer's owner in the `shooting.targetsDeclared` window of an enemy unit's Shooting-phase activation whose declared targets include the bearer. Also offered when the bearer is targeted by Fire Overwatch, because the source has no phase limit, in the Overwatch target-declaration window, but only for the Overwatch triggers where the bearer is not mid-move: after it is set up, after it ends a Normal/Advance/Fall Back move, and after it declares a charge. It is NOT offered for the 'starts a move' Overwatch trigger (the bearer is mid-move and cannot make a second Normal move). On a 4-6 result against Overwatch, that Overwatch unit makes no attacks. Not offered: when the bearer is within Engagement Range of an enemy unit (no Normal move possible), when it is not on the battlefield, or when already used this battle round (mark `phantoms:<round>`). |
| INF-3.5 | Psionic Phantoms move: a Normal move of up to 6" under Normal-move rules (cannot end within ER, coherency trivially true for 1 model, terrain), made out of sequence by the non-active player; it does not change the bearer's `turn.moveType`. The owner may decline the move (pass); declining still spends the once-per-round use **[interpretation]**. |
| INF-3.6 | Visibility check **[interpretation]**: "no longer visible" = no board model of the shooting unit can see the bearer (`los.unitVisible(state, shooterModelId, bearerUnitId)` false for every one). If it is still visible, nothing more happens and the declared attacks resolve as declared (no re-check of range). |
| INF-3.7 | D6 1–3: the shooter's controller re-declares targets only for the (model, weapon) pairs that had targeted the bearer. New targets follow every normal target rule at that moment (range, visibility, Lone Operative, the one-engaged-unit and Pistol rules evaluated over the whole activation). The controller may leave a pair without a target (those attacks are lost). Re-declared attacks join the running sequence after its existing groups. |
| INF-3.8 | D6 4–6: every model that had targeted the bearer makes no attacks this phase: all of its declared attacks are removed from the sequence, including weapons it aimed at other units **[interpretation — literal reading of "make no attacks this phase"]**. Models that did not target the bearer shoot normally. |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| INF-4.1 | Alpha Predation (`tyr.sec.alpha-predation`) | default | Once per battle: in the battle round in which the enemy WARLORD is first destroyed, score 15 VP if that is round 1 or 2, 10 VP if round 3 or 4, 5 VP if round 5. |
| INF-4.2 | Left to Last (`tyr.sec.left-to-last`) | optional | While the enemy WARLORD has not been destroyed, score 4 VP each time you destroy an enemy unit. |

Rule details:

| Id | Rule |
|---|---|
| INF-4.3 | Alpha Predation timing **[interpretation]**: scored the moment the enemy Warlord's unit becomes destroyed (any cause, killer or not), using the current round's tier — the page gives no scoring moment, and scoring at once or at round end gives the same total. Same mechanism as Marked for Execution (CHA-4): a Warlord still in Reserves when the end-of-round-3 cull removes it counts as destroyed in round 3 (10 VP). |
| INF-4.4 | Left to Last **[interpretation]**: kill-triggered (`any.unitDestroyed`), scores only when the destroyed unit's `destroyedBy.player` is you (a cull or the enemy's own Hazardous loss is not "you destroy"). The enemy Warlord's own unit never scores (it is no longer "not destroyed" at that moment); every unit destroyed after the Warlord scores 0. Each half of an attached pair counts as its own unit when its last model dies (10th Leader rule). The page sets no cap: data `cap: 999`. |

## 5. Patrol stratagems

| Id | Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|---|
| INF-5.1 | Swift Kills (`tyr.s.swift-kills`) | 1 | battleTactic | Fight phase of either turn, between activations | one own TYRANIDS unit not yet selected to fight this phase | until end of phase, its models' melee weapons improve AP by 1 and gain [ANTI-MONSTER 4+] and [ANTI-VEHICLE 4+] |
| INF-5.2 | Pheromonal Trace (`tyr.s.pheromonal-trace`) | 1 | strategicPloy | your Command phase | one own VON RYAN'S LEAPERS unit within range of an objective marker you control | that marker becomes **secured** by you |
| INF-5.3 | Predators, Not Prey (`tyr.s.predators-not-prey`) | 1 | strategicPloy | your Movement phase or your Charge phase, between activations | one own TYRANIDS unit not yet selected to move this phase and that has not declared a charge this phase | until end of phase, its models pass Desperate Escape tests automatically, and whenever one of them moves it may pass horizontally through models as if they were absent |

Rule details:

| Id | Rule |
|---|---|
| INF-5.4 | Swift Kills: "either turn" because units fight in both players' Fight phases (same shape as TYR-5.1/Voracious Assault). AP 0 → −1, −1 → −2, −2 → −3. Two Anti abilities on one weapon: the lowest critical-wound threshold whose keyword the target has applies (attack.ts already takes the minimum). |
| INF-5.5 | Pheromonal Trace: "within range" = the 3" objective range measured to the marker edge (as Duty and Honour). Secured = existing CP-2.4/2.5 flag `Objective.securedBy`: the marker stays yours with no models in range; a strictly higher enemy Level of Control takes control at a control check; the flag itself is cleared only when the opponent controls the marker at the end of a later Command phase (either player's). No BATTLELINE needed — the stratagem secures directly. Window `command.end` **[interpretation]**: after the Battle-shock step, so Level of Control already reflects shocked units; since you must control the marker, the same phase's end-of-Command check can never clear it. |
| INF-5.6 | Predators, Not Prey "through models" covers friendly and enemy models, MONSTER/VEHICLE included, and **[interpretation]** also ignores Engagement Range mid-path ("as if they were absent", the same exemption FLY gives) — end positions keep every rule (no Normal/Advance/Fall Back end within ER; no overlap). It applies to every move the unit makes this phase (Normal, Advance, Fall Back, Charge, and any reactive move). Auto-pass: a Fall Back that would trigger Desperate Escape (crossing enemies, or the unit is Battle-shocked) rolls no dice and loses no models; the models still count as tested (they may cross enemies). |
| INF-5.7 | Predators, Not Prey targeting: "not selected to move" uses the existing `notYetActivated` state (Movement marks moved units in `phaseState.activated`; Charge marks units that declared). A unit that stayed Stationary in its activation counts as selected. |

Core stratagems apply per 10-rules §11 (Go to Ground: INFANTRY = everyone; Fire Overwatch needs a ranged weapon →
nobody here has one; Tank Shock → nobody). Heroic Intervention is modified for each Leaper unit (Pouncing Leap,
TYR-6.5).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Death's Shadow (`tyr.deaths-shadow`) | 1 | 50 mm | 8 | 5 | 4+ | 4+ | 7 | 7+ | 1 | INFANTRY, GREAT DEVOURER, VANGUARD INVADER, NEUROLICTOR, DEATH'S SHADOW | Infiltrators; Lone Operative; Stealth; Shadow in the Warp; Neural Disruption; Psychological Saboteur |
| Lictor (`tyr.lictor`) | 1 | 50 mm | 8 | 6 | 4+ | — | 6 | 7+ | 1 | INFANTRY, GREAT DEVOURER, VANGUARD INVADER, LICTOR | Fights First; Infiltrators; Lone Operative; Stealth; Feeder Tendrils |
| Von Ryan's Leapers (`tyr.von-ryans-leapers-inf`) | 3 | 40 mm | 10 | 5 | 4+ | 6+ | 3 | 8+ | 1 | INFANTRY, GREAT DEVOURER, VANGUARD INVADER, VON RYAN'S LEAPERS | Fights First; Infiltrators; Stealth; Pouncing Leap |

Faction keyword (all): TYRANIDS.

**Leapers difference (why a new id):** the CP page profile matches `tyr.von-ryans-leapers` (TYR §6) in every stat,
keyword, base, weapon and the Pouncing Leap ability, but this page lists **no Synapse** faction ability on it. The
new datasheet `tyr.von-ryans-leapers-inf` = a copy of `tyr.von-ryans-leapers` with `abilities: ['tyr.a.pouncing-leap']`
(no `tyr.a.synapse`), same `coreAbilities` (FIGHTS_FIRST, INFILTRATORS, STEALTH), same weapon `tyr.w.leapers-talons`,
same figure kit `tyr-leaper`. The existing datasheet is not touched.

Datasheet abilities:

| Id | Ability | Rule |
|---|---|---|
| INF-6.1 | Neural Disruption (Death's Shadow), `tyr.a.neural-disruption` | In your Command phase, pick one enemy unit within 12" of this model (no visibility needed); it takes a Battle-shock test. Timing **[interpretation]**: offered at your own `command.start`, once per own Command phase, alongside Shadow in the Warp (order free; a unit hit by both tests twice). A unit already Battle-shocked still tests (TYR-2.5). An attached pair is one candidate (canonical id). |
| INF-6.2 | Psychological Saboteur (Death's Shadow, Aura 12"), `tyr.a.psychological-saboteur` + `tyr.a.psychological-saboteur-wounds` | While an enemy unit within 12" of this model is Battle-shocked: (i) each attack made by a model of that unit gets −1 to its Hit roll; (ii) each attack by a friendly TYRANIDS model that targets that unit gets +1 to its Wound roll (the attacker may be anywhere; the 12" is measured from Death's Shadow to the target). Both obey the ±1 caps. Battle-shocked = either half of an attached pair is shocked. Ends at once when Death's Shadow is destroyed or off the board. |
| INF-6.3 | Feeder Tendrils (Lictor), `tyr.a.feeder-tendrils` | Each time this model destroys an enemy CHARACTER model (per-model keywords; kill attributed by `ModelDestroyed.byModelId`), its player gains 1 CP — subject to the R-4.2 cap (+1 non-automatic CP per player per battle round, `hookService.gainCp`). |
| INF-6.4 | Pouncing Leap (each Leaper unit) | = TYR-6.5, ability `tyr.a.pouncing-leap` reused. Each of the three units has its own 0-CP Heroic Intervention exemption. |
| INF-6.5 | Lone Operative (Death's Shadow, Lictor) | Never attached → always on: ranged attacks may target it only from within 12" (R-6.9). |
| INF-6.6 | Precision (both new melee weapons) | Native weapon ability: the attacker may allocate to an attached CHARACTER (R-7 [PRECISION]). |
| INF-6.7 | Enhancement on a non-CHARACTER | Death's Shadow carries the enhancement as WARLORD (page states it). No CHARACTER-only rule applies to it: it cannot be targeted as a CHARACTER by Precision, it is not a CHARACTER for Feeder Tendrils-type effects, and Epic Deeds/Insane Bravery work as for any unit. |

Wargear per model:

| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Death's Shadow | — | — | piercing claws and talons |
| Lictor | — | — | Lictor claws and talons |
| Von Ryan's Leapers | ×3 (×3 units) | — | Leaper's talons (`tyr.w.leapers-talons`, TYR §6, unchanged) |

New weapon profiles:

| Weapon | Id | Range | A | WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| piercing claws and talons | `tyr.w.piercing-claws-and-talons` | melee | 6 | 2+ | 6 | −2 | 1 | Precision |
| Lictor claws and talons | `tyr.w.lictor-claws-and-talons` | melee | 6 | 2+ | 7 | −2 | 2 | Precision |

Paint scheme: the faction `paintScheme` (TYR §6) is reused unchanged.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, logic in `src/engine/factions/tyranids.ts` or `missions.ts`); (c) = engine
change beyond a code hook. Reused as-is: `shadowInTheWarp`, `stratagemCostOverride` (Pouncing Leap), Infiltrators /
Fights First / Stealth / Lone Operative core abilities (built for TYR), `startReactiveMove` (movement.ts, already
handled inside shooting.ts), `hookService.battleShockTest`, `hookService.gainCp`, the Duty and Honour `needsObjective`
stratagem pattern and `Objective.securedBy`, the Marked for Execution kill-triggered secondary path
(`any.unitDestroyed`), the Auramite Thunderbolt `rerollHooks` pattern, the Vindictive Strategy `gateEffect` pattern.

| Rule | Enc. | Encoding |
|---|---|---|
| Roster (INF-1) | (a) | patrol JSON `tyr.cp.insidious-infiltrators`: units `deaths-shadow` (`tyr.deaths-shadow`, size 1, enhancement `tyr.e.neurogoad`), `lictor` (`tyr.lictor`, 1), `leapers-a/b/c` (`tyr.von-ryans-leapers-inf`, 3 each); `stratagems: ['tyr.s.swift-kills','tyr.s.pheromonal-trace','tyr.s.predators-not-prey']`; enhancements Neurogoad default / Psionic Phantoms; secondaries Alpha Predation default / Left to Last; `warlord: 'deaths-shadow'`. faction.json: append to `combatPatrols` only. |
| Shadow in the Warp (INF-2.1) | (b, reused) | `tyr.a.shadow-in-the-warp` on `tyr.deaths-shadow`; `shadowInTheWarp` finds holders by code, no change. |
| No Synapse (INF-2.2) | (a) | no datasheet here lists `tyr.a.synapse`; Leapers get the new id `tyr.von-ryans-leapers-inf`. |
| Neurogoad (INF-3.1, 3.3) | (b) | enhancement ability `{trigger:'commandPhase', code:'neurogoad', params:{range:12, keyword:'TYRANIDS'}}`. Hook `neurogoad`: `hook:'onCommandPhase'`, `pick:{window:'command.start', topic:'abilityChoice'}`, `hooks:['onHitRoll','onChargeRoll']`, `rerollHooks:['onHitRoll','onChargeRoll']`. Offer: active player = bearer's owner, bearer on the board, mark `neurogoad:<round>:<player>` absent; options = each friendly TYRANIDS board unit (canonical id) with `leaderService.unitDistance(unit, bearerUnit) <= 12`, plus decline. On pick: write the mark, `effects.grant(ctx, unitId, [{reroll:'all'}], {sourceAbilityId: neurogoadAbilityId, sourceUnitId: bearerUnitId, scope:{who:'self'}, duration:'untilNextTurn', when:null})`, emit `AbilityTriggered`. |
| Psionic Phantoms (INF-3.2, 3.4–3.8) | (b)+(c) | enhancement ability `{trigger:'targetsDeclared', code:'psionicPhantoms', params:{distance:6}}`. (b) `psionicPhantoms`: `hook:'onTargetsDeclared'`, `pick:{window:'shooting.targetsDeclared', topic:'abilityChoice'}`. The same pick is also raised in the Overwatch target-declaration window for the non-'starts a move' triggers; 'starts a move' is excluded. Offer to the bearer's owner when `phaseState.attack` is `kind:'ranged'`, attacker is an enemy unit (Overwatch included, except the 'starts a move' trigger, where the bearer is mid-move), `targetUnitIds` contains the bearer's unit, bearer on board and not in ER of any enemy, and `oncePerBattleUsed` lacks `phantoms:<round>`. On use: push the mark, write phase mark `phantoms:pending=<shooterUnitId>|<bearerUnitId>`, emit `AbilityTriggered`, call `startReactiveMove(ctx, bearerUnitId, 6, abilityId, 'shooting.targetsDeclared')`. Decline → nothing (no mark). (c) the after-move step (visibility, D6, re-declare / drop) — §7.1 C1. |
| Alpha Predation (INF-4.1, 4.3) | (b) | secondary `scoring:[{id:'alpha-predation', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'alphaPredation', pointsPer:15, cap:15, params:{tiers:[{toRound:2, vp:15},{toRound:4, vp:10},{toRound:5, vp:5}]}}]`. `alphaPredation = missionHook('alphaPredation','onUnitDestroyed')`; logic in `missions.ts` beside `markedForExecutionDestroyed`, called from `unitDestroyedHook`: for each player `pid` with this rule, if `info.unitId === s.players[otherPlayer(pid)].warlordUnitId` and `!secondaryState.alphaPredationScored` → set it, award the first tier with `round <= toRound`. Runs for the round-3 Reserves cull too (it already routes through `unitDestroyedHook`). |
| Left to Last (INF-4.2, 4.4) | (b) | secondary `scoring:[{id:'left-to-last', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'leftToLast', pointsPer:4, cap:999}]`. `leftToLast = missionHook('leftToLast','onUnitDestroyed')`; in `unitDestroyedHook`: `pid = info.byPlayer`; requires the rule for `pid`, `info.unitId !== warlordUnitId(opp)`, and `s.units[warlordUnitId(opp)].location !== 'destroyed'` → `awardVp(ctx, pid, 4, rule.id)` + `mission.scored` push. |
| Swift Kills (INF-5.1, 5.4) | (a) | stratagem `window:['fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{phase:'fight'}`, `targets:[{role:'unit', owner:'friendly', state:'notYetFought', count:1}]`, `effect:[{when:{weaponType:'melee'}, modifyStat:{stat:'AP', value:-1}}, {when:{weaponType:'melee'}, grantWeaponAbility:{ability:'ANTI', keyword:'MONSTER', value:4}}, {when:{weaponType:'melee'}, grantWeaponAbility:{ability:'ANTI', keyword:'VEHICLE', value:4}}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`. (The two grants have distinct key identities, so both apply.) |
| Pheromonal Trace (INF-5.2, 5.5) | (b) | stratagem `window:'command.end'`, `who:'active'`, `condition:{phase:'command'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:"VON RYAN'S LEAPERS", within:{of:'controlledObjective', inches:3}}, count:1}]`, `code:'pheromonalTrace'`, `limit:'oncePerPhase'`. Hook `pheromonalTrace` (`kind:'stratagem'`, `needsObjective:true`): `check` = the Duty and Honour check (marker not removed, `controller === env.player`, own turn, a board model of the unit within objective range); `apply`: `obj.securedBy = env.player`, emit `ObjectiveSecured{flag:'secured'}`. Breaking is the existing objectives.ts end-of-Command-phase check. |
| Predators, Not Prey (INF-5.3, 5.6, 5.7) | (a)+(c) | stratagem `window:['movement.start','charge.start']`, `who:'active'`, `condition:{ownTurn:true, any:[{phase:'movement'},{phase:'charge'}]}`, `targets:[{role:'unit', owner:'friendly', state:'notYetActivated', count:1}]`, `effect:[{moveThroughModels:true},{autoPassDesperateEscape:true}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`. (c) two new Effect keys read by movement.ts / charge.ts — §7.1 C2. |
| Neural Disruption (INF-6.1) | (b) | ability `{trigger:'commandPhase', code:'neuralDisruption', params:{range:12}}`. Hook `neuralDisruption`: `hook:'onCommandPhase'`, `pick:{window:'command.start', topic:'abilityChoice'}`. Offer to the holder's owner only when they are the active player, holder on the board, mark `neural:<round>:<player>:<holderId>` absent, ≥1 enemy board unit (canonical) with `unitDistance ≤ 12`; options = those units + decline. On pick: write the mark, emit `AbilityTriggered`, `hookService.battleShockTest(ctx, targetId, abilityId)`. |
| Psychological Saboteur (INF-6.2) | (a)+(b) | two ability records, both `code:'psychologicalSaboteur'`: `tyr.a.psychological-saboteur` `{trigger:'hitRoll', scope:{who:'enemy', within:12}, effect:{modifyRoll:{roll:'hit', value:-1}}}` and `tyr.a.psychological-saboteur-wounds` `{trigger:'woundRoll', scope:{who:'friendly', keyword:'TYRANIDS'}, effect:{modifyRoll:{roll:'wound', value:1}}}` (the second carries a short text that it is the aura's second half). Hook `psychologicalSaboteur` (`run: noop`, `hooks:['onHitRoll','onWoundRoll']`) with `gateEffect(state, holder, entry, data)`: holder on the board; for `roll.purpose === 'hit'` → some half of `attack.attackerUnitId` is `battleShocked`; for `'wound'` → some half of `attack.targetUnitId` is `battleShocked`, the target is an enemy of the holder, and `leaderService.unitDistance(state, target, holder.id) <= 12`. |
| Feeder Tendrils (INF-6.3) | (b) | ability `{trigger:'modelDestroyed', code:'feederTendrils', params:{cp:1, keyword:'CHARACTER'}}`. Hook `feederTendrils`: `hook:'onModelDestroyed'`, `runAt(ctx, entry, data)`: if `data.byModelId` is a model of the holder unit, the destroyed unit's player ≠ holder's player, and `modelKeywordsOf(state, data.destroyedModelId)` includes CHARACTER → `hookService.gainCp(ctx, holder.player, 1, entry.source.id)` + `AbilityTriggered`. (Death Blow-style deferred removals are irrelevant: the kill event carries the attribution whenever it fires.) |
| Pouncing Leap (INF-6.4) | (b, reused) | `tyr.a.pouncing-leap` on `tyr.von-ryans-leapers-inf` (code `stratagemCostOverride`). |
| Infiltrators / Fights First / Stealth / Lone Operative | (a) | `coreAbilities`: Death's Shadow `[INFILTRATORS, LONE_OPERATIVE, STEALTH]`; Lictor `[FIGHTS_FIRST, INFILTRATORS, LONE_OPERATIVE, STEALTH]`; Leapers `[FIGHTS_FIRST, INFILTRATORS, STEALTH]` — all engine-native since TYR (§7.1 items 5–7). |
| 4+ / 6+ invuln | (a) | datasheet `invuln: 4` (Death's Shadow), `invuln: 6` (Leapers) |
| Precision | (a) | weapon ability `PRECISION` (native, attack.ts allocation) |
| GREAT DEVOURER, VANGUARD INVADER, NEUROLICTOR, DEATH'S SHADOW, LICTOR | (a) | plain keywords |

### 7.1 Engine changes (c) — exact signatures

One additive frozen-contract change: `src/engine/hooks.ts` `EFFECT_HOOKS` gains the keys `moveThroughModels` and `autoPassDesperateEscape` (empty hook lists), noted in `docs/spec/00-architecture.md`. Nothing else in `src/engine/{types,actions,events,hooks,rng,decider,index}.ts` changes (new
Effect keys live in `src/data/types.ts`; the re-declaration reuses the existing `declareTargets` decision and
`DeclaredTarget` type; `ObjectiveSecured` already has `flag:'secured'`). The (b) hooks are written against these.

**C1 — Psionic Phantoms after-move step** (non-frozen `src/engine/attack.ts`, `src/engine/phases/shooting.ts`,
`src/engine/factions/tyranids.ts`):

```ts
// src/engine/attack.ts (AttackService gains these; the sequence is phaseState.attack, which has not rolled anything yet)
// removes every declared target matching `pred` and its (unresolved) AttackGroups; recomputes targetUnitIds; returns the removed ones
removeDeclaredTargets(ctx: EngineContext, pred: (t: DeclaredTarget) => boolean): DeclaredTarget[]
// removes these attacker models from every unresolved group (group.attacks recomputed for the remaining models; empty groups dropped)
dropAttackerModels(ctx: EngineContext, modelIds: ModelId[]): void
// builds groups for further targets of the running sequence with the same per-target snapshots begin() takes
// (blast count, Big Guns target flag, Indirect Fire LoS marks), appends them, emits TargetsDeclared for them
appendDeclaredTargets(ctx: EngineContext, targets: DeclaredTarget[]): void

// src/engine/factions/tyranids.ts
export const PHANTOMS_CODE = 'psionicPhantoms'
export const PHANTOMS_PENDING_MARK = 'phantoms:pending'      // value `${shooterUnitId}|${bearerUnitId}`
export const PHANTOMS_REDECLARE_MARK = 'phantoms:redeclare'  // value JSON DeclaredTarget[] (the removed pairs)
// called by shooting.ts doResolve right after the shooting.targetsDeclared window and before attackService.advance.
// No pending mark, or the reactive move decision still open → 'done' / 'pending' accordingly. Otherwise: clear the mark;
// bearer still visible to some shooter board model → 'done'. Else roll D6 (purpose 'ability', player = bearer's owner):
//  1–3: removed = attack.removeDeclaredTargets(t => t.targetUnitId === bearer); write PHANTOMS_REDECLARE_MARK; raise
//       declareTargets {player: shooter's owner, window:'shooting.targetsDeclared', canPass:true, context:{unitId: shooter,
//       attackKind:'ranged', overwatch:false, weapons: buildShootingWeaponEntries restricted to the removed (model, weapon)
//       pairs, engagedWith}} → 'pending'.
//  4–6: models = distinct modelIds of the declared targets aimed at the bearer; attack.dropAttackerModels(models) → 'done'.
// Emits AbilityTriggered with the roll and outcome.
export function psionicPhantomsStep(ctx: EngineContext, shooterUnitId: UnitId): 'pending' | 'done'
// shooting.ts routes a declareTargets answer here while PHANTOMS_REDECLARE_MARK is set (instead of starting a new
// activation): validates with validateDeclareTargets limited to the stored pairs (plus the activation-wide Pistol /
// one-engaged-unit rules against the targets still in the sequence), then attack.appendDeclaredTargets; pass = no new targets.
export function phantomsRedeclareHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
```

shooting.ts `doResolve`: `if (psionicPhantomsStep(ctx, unitId) === 'pending') return 'pending'` between the
`shooting.targetsDeclared` window and `attackService.advance`; if the sequence has no groups left afterwards it ends
normally (the `shooting.attacksResolved` window still opens). `legalActions` for the re-declare decision = the restricted
`shootingLegalActions` candidates (one per target unit) plus pass.

**C2 — Predators, Not Prey movement effects** (non-frozen `src/data/types.ts` `Effect` + 20-data-schema §3 + both
`common.schema.json` copies; read in `src/engine/phases/movement.ts` and `src/engine/phases/charge.ts`):

```ts
// src/data/types.ts Effect
moveThroughModels?: true        // INF-5.6: models may cross any model and ignore ER mid-path (end position rules unchanged)
autoPassDesperateEscape?: true  // INF-5.6: Desperate Escape tests are passed without rolling

// src/engine/phases/movement.ts (exported; charge.ts imports the first)
export function unitMovesThroughModels(state: GameState, unitId: UnitId): boolean       // any half has a live ActiveEffect (effects.activeFor) with moveThroughModels
export function unitAutoPassesDesperateEscape(state: GameState, unitId: UnitId): boolean // same for autoPassDesperateEscape
```

`checkPaths` (and the charge-move path check in charge.ts) treats a model of such a unit like a FLY model for mid-path
purposes (skip `pathCrossesModels` against enemies and against friendly MONSTER/VEHICLE, skip `pathEntersEngagement`),
without FLY's 3D path measurement. In `doMove`'s Fall Back block, when `unitAutoPassesDesperateEscape`: no
`ctx.roll`, every model in `testSet` gets `flags.desperateEscapeTested = true`, emit
`DesperateEscapeRolled{dice:[], casualties:0}`, `mv:deRemaining`/`mv:deFails` = 0. `keyApplies` in hooks-impl.ts
returns false for both keys at every hook (they are read directly, like `cp`/`vp`).

## 8. Test IDs

Same list as the `INF` section of 12-rules-test-checklist.

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

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3; tall lanky hunters a little over); bases are rules-true. The Leapers
reuse the existing `tyr-leaper` kit (`tyr.von-ryans-leapers-inf` → `tyr-leaper` in `src/client/figures/data.ts`); only
the two new units need figures. Colours follow the faction scheme (bone carapace, violet hide, crimson trim, green glow).

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `deaths-shadow` | `tyr.deaths-shadow/neurolictor` (kit `tyr-neurolictor`, archetype heavy) | 1 | 1.5 | 50 mm | A chibi lanky stalking alien with a hunched bone-white back, violet mottled skin, an oversized swollen head crowned by glowing green brain-like lobes trailing wispy psychic tendrils, and two long jointed claw arms tucked like a mantis. |
| `lictor` | `tyr.lictor/lictor` (kit `tyr-lictor`, archetype heavy) | 1 | 1.6 | 50 mm | A chibi tall ambush-hunter alien crouched on digitigrade legs, with a chameleon-patterned violet-and-bone hide, two huge scything upper talons raised over its head, smaller grasping claws, and a cluster of crimson feeding tendrils around its fanged jaw. |

## 10. Other Tyranids patrols (appendix)

- **The Vardenghast Swarm** — Index 10, June 2023 (boxed set; the existing patrol, `docs/spec/factions/tyranids.md`):
  Terror of Vardenghast (Winged Tyranid Prime, WARLORD) ×1, Psychophage ×1, Termagants ×20, Barbgaunts ×5, Von Ryan's
  Leapers ×3 — 5 units, 30 models.
