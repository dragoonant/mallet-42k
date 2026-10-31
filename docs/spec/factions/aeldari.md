# Faction spec — Aeldari: The Fatebreakers

Own-words data spec for the Aeldari Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `AEL-<section>.<n>` are
cited by the `AEL-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose here is
ours. Faction id `aeldari`, data id prefix `ael.`, data folder `src/data/factions/aeldari/`, patrol id
`ael.cp.the-fatebreakers`, faction keyword AELDARI.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Aeldari box "The Fatebreakers" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/the-fatebreakers/ | Book "The Fatebreakers", kind **Index**, edition 10, last update **June 2023** |
| CP faction navigation (used to enumerate patrols) | faction menu on the patrol page above (the CP index page returned HTTP 403) | lists The Fatebreakers as the only Aeldari patrol |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Values were read through a summarising fetcher (two passes over the same page, cross-checked); anything it could not
pin down is marked **[unconfirmed]**, our reading of ambiguous text is marked **[interpretation]**.

## 1. Roster

4 datasheets, **19 models**. Faction keyword AELDARI on every datasheet. No wargear options: the box builds exactly
the loadouts below.

| Ref | Datasheet id | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `farseer` | `ael.farseer-iraneth` | 1 | Eldritch Storm, shuriken pistol, singing spear (ranged + melee profiles) | **WARLORD**, carries the enhancement; Leader → `guardians` (default attachment) |
| `guardians` | `ael.guardian-defenders` | 11 | Guardian Defender ×10: shuriken catapult, close combat weapon. Heavy Weapon Platform ×1: starcannon, close combat weapon | bodyguard for the Farseer. Starting Strength 11 |
| `windriders` | `ael.windriders` | 6 | Windrider ×4: twin shuriken catapult, close combat weapon. Windrider ×2: scatter laser, close combat weapon | Patrol Squads (AEL-6.6) |
| `wraithlord` | `ael.wraithlord` | 1 | bright lance, shuriken catapult ×2, ghostglaive (2 profiles) | — |

- AEL-1.1 Default attachment: Farseer Iraneth → Guardian Defenders (patrol `attachTo: 'guardians'`). It is her only
  bodyguard; the setup UI may detach her.
- AEL-1.2 Patrol Squads split (default: unsplit): `windriders-a` = 1 scatter laser + 2 twin shuriken catapult Windriders;
  `windriders-b` = the same. Each part has Starting Strength 3.
- AEL-1.3 The Wraithlord carries **two** shuriken catapults with one profile; they are two separate weapons (each may
  pick its own target), encoded as two weapon records with the same profile (§7).

## 2. Faction ability — Strands of Fate (Farseer, Guardian Defenders, Windriders; **not** the Wraithlord)

| Id | Rule |
|---|---|
| AEL-2.1 | Pool creation: at the start of the battle (round 1, before the first Command phase; the first-turn player resolves first) the player rolls **12 D6**. They may then re-roll *all* of those dice, but the re-roll uses one die fewer (12 → 11 → 10 …). They may repeat this as often as they like until they are happy or only one die is left. The dice they stop on become their **Fate dice** pool, each die keeping its face value. A re-roll replaces the whole set; no die can be kept from an earlier set. |
| AEL-2.2 | Substitution: just before the player makes an Advance, Battle-shock, Charge, Damage, Hit, Saving or Wound roll **for a unit of theirs that has Strands of Fate** (its own attacks for Hit/Wound/Damage, attacks against it for Saves), they may spend one Fate die instead of rolling one die of that roll. The Fate die's value is the **unmodified** result (modifiers then apply as usual; a 6 is a critical result where the rule cares). Any other dice in that roll are rolled normally. The spent die leaves the pool. |
| AEL-2.3 | At most one Fate die per individual roll. A single roll made of several dice (Charge 2D6, Battle-shock 2D6) can have at most one die replaced. A fast-rolled batch of N attacks is N separate Hit / Wound / Save / Damage rolls (one per attack), so up to N Fate dice may be spent on that batch, one per attack (`maxSubstitutions` = the batch count). **No** per-unit or per-phase limit on how many Fate dice are spent (unlike Acts of Faith ADE-2.4, which caps Sororitas at one per unit per phase and so keeps `maxSubstitutions` at 1). |
| AEL-2.4 | Fate dice are fixed: neither a die in the pool nor a substituted die can be re-rolled or changed (Command Re-roll included) unless a rule says so. Only D6 rolls can be replaced; a D3 roll (Eldritch Storm's D3 Damage) cannot **[interpretation, same as ADE-2.3]**. Rolls outside the AEL-2.2 list (D6 attack counts, Hazardous, Deadly Demise, Desperate Escape, Fortune's D6) are never replaced. |
| AEL-2.5 | The pool lasts the whole battle (no expiry). It only grows through Defenders of Fate (AEL-6.3). The Wraithlord has no Strands of Fate, so its rolls (and saves against attacks on it) can never use a Fate die. An attached Farseer + Guardian Defenders is one unit; both halves have the ability. |

## 3. Enhancements (Farseer Iraneth, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Foresight (Psychic) | default | Once per turn, the bearer's unit can be the target of the Fire Overwatch stratagem for **0 CP** (the stratagem's own once-per-turn limit still applies). While resolving Fire Overwatch for that unit, its attacks score hits on unmodified rolls of **4+** if the unit is within range of an objective marker its player controls, otherwise on **5+** (critical hits stay on unmodified 6). |
| Eldritch Might (Psychic) | optional | Each time the bearer makes an attack with a [PSYCHIC] weapon (Eldritch Storm, singing spear), it re-rolls a Hit roll of 1, a Wound roll of 1 and a Damage roll of 1. Only the bearer's own attacks (`scope.who: bearer`); the Guardians are unaffected. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Ineffable Agenda | default | at the end of **your** turn (`turn.end`, `who: active`), rounds 1–5: 3 VP if you control at least one objective marker that lies outside your own deployment zone and that you did **not** control at the start of that turn (it was the opponent's or nobody's). Flat 3 VP per turn, not per marker. No cap stated (max 15 by the schedule). |
| A Greater Destiny | optional | at the end of the battle (`battle.end`): 10 VP if at least one of your units that is not Battle-shocked is **wholly** within the opponent's deployment zone (every model of the unit; an attached unit counts as one). Scored once. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Whip-fast Reactions | 1 | battleTactic | just after an enemy unit selects its targets, in the opponent's Shooting phase or a Fight phase (`shooting.targetsDeclared`, `fight.targetsDeclared`) **[interpretation: either player's Fight phase, as for Gene-wrought Resilience]** | one own AELDARI INFANTRY or AELDARI MOUNTED unit that is a target of one or more of those attacks | until the end of the phase, every attack that targets your unit subtracts 1 from its Hit roll (all attacks, ranged and melee, from any enemy unit) |
| Storm of Shots | 1 | battleTactic | your Shooting phase, between activations (`shooting.start`, `shooting.attacksResolved`) | **up to two** own AELDARI MOUNTED units, **or** one own AELDARI INFANTRY unit | until the end of the phase, every attack made by models in the chosen unit(s) adds 1 to its Hit roll (±1 cap applies) |
| Zephyr-swift | 1 | strategicPloy | your Shooting phase (`shooting.start`, `shooting.attacksResolved`, and `phase.end` with phase = shooting) | **up to two** own AELDARI MOUNTED units, **or** one own AELDARI INFANTRY unit, each not within Engagement Range of any enemy unit | each chosen unit makes a Normal move of up to 6" (one after the other). Those units cannot declare a charge for the rest of the turn. The move is not a Movement-phase move: it does not change the unit's Remained Stationary / Advanced / Fell Back state, so a unit that has not shot yet may still shoot afterwards. |

"Up to two MOUNTED" only matters after the Windriders Patrol Squads split; a mixed pick (one MOUNTED + one INFANTRY) is
not allowed. Core stratagems apply per 10-rules §11 subject to their own gates (Go to Ground: INFANTRY only; Grenade:
no datasheet here has GRENADES; Tank Shock: no VEHICLE; Fire Overwatch: every unit).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Farseer Iraneth | 1 | 25 mm | 7 | 3 | 6+ | 4+ | 4 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, FARSEER, IRANETH | Leader → Guardian Defenders; Strands of Fate; Fortune (Psychic) |
| Guardian Defenders — Guardian Defender | 10 | 28 mm | 7 | 3 | 4+ | — | 1 | 6+ | 2 | INFANTRY, BATTLELINE, GUARDIANS, GUARDIAN DEFENDERS | Strands of Fate; Defenders of Fate; Crewed Platform |
| Guardian Defenders — Heavy Weapon Platform | 1 | 40 mm | 7 | 3 | 4+ | — | 2 | 6+ | **0** | (same unit keywords) | (same unit abilities) |
| Windriders | 6 | 32 mm flying base **[unconfirmed: the page says ⌀32mm flying base; the physical kit uses a larger oval — follow the page]** | 14 | 4 | 3+ | — | 2 | 6+ | 2 | MOUNTED, FLY, WINDRIDERS | Strands of Fate; Swift Demise; Patrol Squads |
| Wraithlord | 1 | 60 mm | 8 | 11 | 2+ | — | 10 | 6+ | 3 | MONSTER, WALKER, WRAITH CONSTRUCT, WRAITHLORD | Deadly Demise 1. **No** Strands of Fate, no other ability, no Damaged profile |

Faction keyword (all): AELDARI. Ld 6+ on every model as read twice from the page **[unconfirmed against print]**.

| Id | Ability | Rule |
|---|---|---|
| AEL-6.1 | Fortune (Psychic) — Farseer | in your Command phase, if the Farseer is on the battlefield, roll one D6 (not Command-re-rollable, not Fate-substitutable). On 2+ pick one friendly AELDARI unit with any model within 12" of the Farseer (her own unit allowed). Until the start of your next Command phase, each attack that targets that unit subtracts 1 from its Wound roll (±1 cap applies). On a 1 nothing happens. |
| AEL-6.2 | Leader — Farseer | may attach only to Guardian Defenders. |
| AEL-6.3 | Defenders of Fate — Guardian Defenders | at the end of your Command phase, for each objective marker you control that has one or more of your units with this ability within range, roll one D6 and add it to your Fate dice pool with the value rolled (no threshold). One roll per marker, not per unit. The attached Farseer's models count for range (one unit). |
| AEL-6.4 | Crewed Platform — Guardian Defenders | when the last Guardian Defender model of the unit is destroyed, every remaining Heavy Weapon Platform model of the unit is destroyed too (removed at once; credited to whatever destroyed that last Guardian). An attached Farseer is not affected and then operates alone. |
| AEL-6.5 | Swift Demise — Windriders | each time a model of this unit makes a ranged attack that targets the closest eligible target, re-roll a Hit roll of 1; if that target is within range of an objective marker controlled by **your opponent**, the attacker may re-roll the Hit roll instead (any result). Attacks against a target that is not the closest eligible one get nothing. |
| AEL-6.6 | Patrol Squads — Windriders | at the start of Declare Battle Formations, before any unit is set up, the unit may split into two units of 3 models, each containing one scatter laser Windrider (AEL-1.2). |
| AEL-6.7 | Deadly Demise 1 — Wraithlord | when destroyed, roll a D6 before removing it; on a 6 each unit within 6" suffers 1 mortal wound. |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Farseer Iraneth | — | Eldritch Storm, shuriken pistol, singing spear (ranged) | singing spear (melee) |
| Guardian Defenders | Guardian Defender ×10 | shuriken catapult | close combat weapon (Guardian) |
| Guardian Defenders | Heavy Weapon Platform ×1 | starcannon | close combat weapon (Guardian) |
| Windriders | Windrider (catapult) ×4 | twin shuriken catapult | close combat weapon (Windrider) |
| Windriders | Windrider (scatter) ×2 | scatter laser | close combat weapon (Windrider) |
| Wraithlord | — | bright lance, shuriken catapult (Wraithlord) ×2 | ghostglaive (strike / sweep) |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| Eldritch Storm | 24" | D6 | 3+ | 6 | −2 | D3 | Blast, Psychic |
| shuriken pistol | 12" | 1 | 2+ | 4 | −1 | 1 | Assault, Pistol |
| singing spear (ranged) | 12" | 1 | 2+ | 9 | 0 | 3 | Assault, Psychic |
| singing spear (melee) | melee | 2 | 2+ | 3 | 0 | 3 | Psychic |
| shuriken catapult (Guardian) | 18" | 2 | 3+ | 4 | −1 | 1 | Assault |
| starcannon | 36" | 2 | 3+ | 8 | −3 | 2 | — |
| close combat weapon (Guardian) | melee | 1 | 3+ | 3 | 0 | 1 | — |
| scatter laser | 36" | 6 | 3+ | 5 | 0 | 1 | — |
| twin shuriken catapult | 18" | 2 | 3+ | 4 | −1 | 1 | Assault, Twin-linked |
| close combat weapon (Windrider) | melee | 3 | 3+ | 3 | 0 | 1 | — |
| bright lance | 36" | 1 | 4+ | 12 | −3 | D6+2 | — |
| shuriken catapult (Wraithlord) | 18" | 2 | 4+ | 4 | −1 | 1 | Assault |
| ghostglaive — strike | melee | 4 | 4+ | 10 | −3 | D6+1 | — |
| ghostglaive — sweep | melee | 8 | 4+ | 7 | −2 | 2 | — |

Suggested `paintScheme` (original): primary `#ece4cf` (pearl wraithbone), secondary `#1f6f78` (deep jade), trim
`#c9a54a` (burnished gold), metal `#8a8f98`, decal `#20313a`, glow `#5fe3cf` (spirit-stone green).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9) or existing hook reused as-is; (b) = new code hook
(registered in `src/engine/code-hooks.ts` `codeHooks`, implemented in a new `src/engine/factions/aeldari.ts` exporting
`aeldariHooks`); (c) = engine change beyond a code hook (signatures in §7.1). **No frozen contract changes**
(`types.ts`, `actions.ts`, `events.ts`, `hooks.ts`, `rng.ts`, `decider.ts`, `index.ts` unchanged: the Fate pool reuses
`PlayerState.miracle`, the `miracleDie` topic and the `MiracleDieGained` / `MiracleDieSpent` events).

| Rule | Enc. | Encoding |
|---|---|---|
| Strands of Fate — marker + eligibility (AEL-2.2–2.5) | (b)+(c) E1 | ability `ael.a.strands-of-fate` `{trigger:'always', code:'strandsOfFate'}` on Farseer, Guardian Defenders, Windriders (not Wraithlord). E1 generalises `miracle.ts`: a unit is substitution-eligible when either half carries code `strandsOfFate` and the pool is non-empty — no faction-keyword test, no `spentThisPhase` cap. `miracleGate` / `miracleHandler` are extended so the Strands of Fate path allows up to one die per attack in a fast-rolled batch (`maxSubstitutions` = batch count when `unitHasStrandsOfFate`, and `miracleHandler` accepts up to that many `dieIndexes`, each pool die used at most once and each batch die replaced at most once); single rolls and multi-die single rolls (Charge 2D6, Battle-shock 2D6) stay at 1, and the Sororitas path stays at `maxSubstitutions: 1`. Everything else (purposes list, `DiceRoll.substituted` never re-rollable, `miracleGate` call sites in `rollOnce` / `rollBatchD6`, AI policy) is reused unchanged. Option labels read "Use Fate die N" (E1 `diePoolName`). |
| Strands of Fate — pool creation (AEL-2.1) | (b) | `strandsOfFate` hook `pick:{window:'round.start', topic:'abilityChoice'}` (same pattern as `hatefulExhortation`). `offer`: only `state.round === 1`; for each player (first-turn player first) whose army has the code and `secondaryState['ael:fateDone']` unset: if `secondaryState['ael:fateDraft']` is unset, roll 12 D6 (`ctx.roll({purpose:'ability', player, sides:6, count:12, mode:'perDie', commandRerollable:false})`) and store the values there; if the draft has 1 die, finish at once (below) and continue; else raise `chooseOption` (`data:{window, key, code:'strandsOfFate', draft}`) with options `keep` and `reroll` ("Re-roll all as N−1 dice"). `handle`: `keep` → `setFatePool(ctx, player, draft, abilityId)` (E1), set `ael:fateDone`, delete the draft; `reroll` → roll `draft.length − 1` D6 and overwrite the draft. The window loop calls `offer` again, so the next choice (or the other player) follows. AI: re-roll iff `(draft.length − 1) / 3` > number of dice showing 5–6 in the draft. |
| Defenders of Fate (AEL-6.3) | (a) reuse | ability `{trigger:'phaseEnd', when:{phase:'command', ownTurn:true}, code:'simulacrumImperialis', params:{modelId:'guardian-defender', dieThreshold:1, label:'Defenders of Fate'}}` on Guardian Defenders. The Sororitas hook already does "for each controlled marker with a model of this (attached) unit in range, roll D6 and gain a die of that value if ≥ threshold"; the bearer check passes while any Guardian Defender lives (Crewed Platform guarantees no platform-only unit). Only addition: the `AbilityTriggered` summary uses `params.label` when present (cosmetic one-line edit in `factions/adepta-sororitas.ts`). |
| Crewed Platform (AEL-6.4) | (b) | `crewedPlatform` — ability `{trigger:'modelDestroyed', code:'crewedPlatform', params:{crewModelId:'guardian-defender', platformModelId:'heavy-weapon-platform'}}`, scope self. `runAt(ctx, entry, data)`: holder = `data.destroyedUnitId`'s unit (the Guardians half); if no live, not-deferred-dead (`isDeferredDead`) model of the holder has `datasheetModelId` ending in `crewModelId`, call `attackService.destroyModel(ctx, m.id, {player, unitId: data.byUnitId, modelId: data.byModelId, kind:'other'})` for every live platform model (`player` = owner of `byUnitId`, or null). Re-entrancy: the nested ModelDestroyed for a platform re-enters `runAt`, which finds nothing left to remove. |
| Fortune (AEL-6.1) | (b) | `fortune` — ability `{trigger:'commandPhase', code:'fortune', params:{range:12, on:2}}` (text starts "Psychic."). `pick:{window:'command.start', topic:'abilityChoice'}`: `offer` only for the active player's own Farseer on the board, guarded by mark `ael:fortune:<holderId>`; roll D6 (`purpose:'ability'`, `commandRerollable:false`); on < `params.on` emit `AbilityTriggered` (failed) and return false; else options = every own canonical board unit whose `keywordsOf` (either half) has AELDARI and with any model within `params.range`" (edge-to-edge, `distance`) of the Farseer model. `handle`: `ctx.services.effects.grant(ctx, unitId, {modifyRoll:{roll:'wound', value:-1}}, {sourceAbilityId, sourceUnitId: farseerUnitId, scope:{who:'attacker'}, duration:'untilNextTurn', when:null})`; emit `AbilityTriggered`. Same defender-side `modifyRoll` + `who:'attacker'` shape as the Sororitas stratagem `-1 to hit` effect. |
| Swift Demise (AEL-6.5) | (a)+(c) E4 | `{trigger:'hitRoll', when:{weaponType:'ranged', targetIsClosestEligible:true}, effect:[{when:{targetOnObjectiveControlledBy:'opponent'}, reroll:'all'}, {reroll:'ones'}]}` — first matching entry wins. `targetIsClosestEligible` exists (Tyranids); E4 adds the `targetOnObjectiveControlledBy` condition key. |
| Patrol Squads (AEL-6.6) | (a) | `ael.a.patrol-squads` `{trigger:'always', code:'patrolSquads'}` + patrol `patrolSquads:[{ref:'windriders-a', size:3, wargear:[windrider-scatter×1, windrider-catapult×2]}, {ref:'windriders-b', size:3, wargear:[same]}]` |
| Leader (Farseer → Guardians) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['ael.guardian-defenders']`; patrol `attachTo:'guardians'` |
| Deadly Demise 1 (Wraithlord) | (a) | `coreAbilities:[{ability:'DEADLY_DEMISE', value:1}]` |
| Foresight — 0 CP Overwatch | (a)+(c) E3 | enhancement `ael.e.foresight` `effect` = list (Tau C7, already in `EnhancementData.effect`): ① `{trigger:'always', code:'stratagemCostOverride', params:{stratagemId:'core.s.fire-overwatch', cost:0, ignoreLimit:false}}`; ② `{trigger:'always', code:'foresight', params:{onObjective:4, otherwise:5, stratagemId:'core.s.fire-overwatch'}}`. E3 = the Space Wolves E1 change (enhancement-sourced `stratagemCostOverride`); if it already landed, nothing to do. |
| Foresight — 4+/5+ hits (AEL-3) | (b) | `foresight` hook (`kind:'ability'`, `hook:'onStatQuery'`, `run: noop`) implements the existing C2 `overwatchHitOn(state, entry, shooterUnitId, stratagemId)`: if `stratagemId === params.stratagemId` and `leaderService.sameUnit(state, entry.holderUnitId, shooterUnitId)` → `params.onObjective` when any board model of the shooter is within range of a non-removed objective whose `controller` is the holder's player, else `params.otherwise`; otherwise `null`. `overwatchHitOnFor` already takes the minimum and the engine applies it as an unmodified threshold. Enhancement sources are already in `sourcesFor`. |
| Eldritch Might (AEL-3) | (a)+(c) E2 | enhancement `ael.e.eldritch-might` `effect` list, each `scope:{who:'bearer'}`: `{trigger:'hitRoll', when:{weaponAbility:'PSYCHIC'}, effect:{reroll:'ones'}}`, `{trigger:'woundRoll', when:{weaponAbility:'PSYCHIC'}, effect:{reroll:'ones'}}`, `{trigger:'damageRoll', when:{weaponAbility:'PSYCHIC'}, effect:{reroll:'ones'}}`. Hit / wound re-rolls are native; E2 makes the damage step honour `onDamageRoll` `reroll`. |
| Ineffable Agenda (AEL-4) | (b) | secondary `scoring:[{id:'ineffable-agenda', when:'turn.end', who:'active', rounds:{from:1,to:5}, rule:'custom', code:'ineffableAgenda', pointsPer:3, cap:999}]`; `ineffableAgenda` = `missionHook('ineffableAgenda')` + `ineffableAgendaAmount(ctx, rule, pid, holds)` in `factions/aeldari.ts`, wired in `missions.ts` `customAmount`: `pointsPer` iff some objective `o` with `!o.removed`, `!pointInPolygon(o.pos, deploymentZone(state, pid))`, `holds(o.id)` and `o.controllerAtTurnStart !== pid`; else 0. |
| A Greater Destiny (AEL-4) | (a) reuse | `{id:'a-greater-destiny', when:'battle.end', who:'both', rounds:{from:1,to:5}, rule:'custom', code:'reclaimAndDominate', pointsPer:10, cap:10, params:{keyword:'AELDARI'}}` — the Necrons amount fn is exactly this (non-Battle-shocked, attached unit as one, every model wholly in the opponent's zone, flat award). |
| Whip-fast Reactions | (a)+(b) | stratagem `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false}, {phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'AELDARI'}, state:'targetedByAttack', count:1}]`, `effect:{modifyRoll:{roll:'hit', value:-1}}`, `scope:{who:'attacker'}`, `duration:'untilEndOfPhase'`, `code:'infantryOrMounted'`. (b) `infantryOrMounted` stratagem hook `check(env, t)`: `hookService.keywordsFor(state, t.ids[0])` (either half) includes INFANTRY or MOUNTED (Wraithlord refused). |
| Storm of Shots | (a)+(b) | stratagem `window:['shooting.start','shooting.attacksResolved']`, `who:'active'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'AELDARI'}, state:'notYetShot', count:1}]`, `effect:{modifyRoll:{roll:'hit', value:1}}`, `duration:'untilEndOfPhase'`, `code:'stormOfShots'`. (b) `stormOfShots`: `check` = INFANTRY or MOUNTED (as `infantryOrMounted`); `apply`: if `ids[0]` is MOUNTED and another own canonical board MOUNTED AELDARI unit that has not shot this phase exists, raise `chooseOption` (topic `abilityChoice`, `data.code:'stormOfShots'`) with one option per such unit + `decline`; `answer`: grant the same effect via `ctx.services.effects.grant(ctx, id, {modifyRoll:{roll:'hit', value:1}}, {sourceAbilityId: stratagemId, sourceUnitId: id, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`. |
| Zephyr-swift | (a)+(b)+(c) E5 | stratagem `window:['shooting.start','shooting.attacksResolved','phase.end']`, `who:'active'`, `condition:{phase:'shooting', ownTurn:true}`, target own AELDARI unit, `effect:{forbid:'charge'}`, `duration:'untilEndOfTurn'`, `code:'zephyrSwift'`, `params:{distance:6}`. (b) `zephyrSwift`: `check` = INFANTRY or MOUNTED and `!leaderService.inEngagementWithEnemy(state, id)`; `apply`: if MOUNTED and another eligible MOUNTED unit (not in Engagement Range) exists, raise `chooseOption` (second unit or `decline`), else start the move; `answer`: on a second unit also grant it `{forbid:'charge'}` until end of turn, then `startReactiveMove(ctx, first, 6, stratagemId, env.window, [{unitId: second, distance: 6}])` (E5 queue); without a second unit the `then` list is empty. |
| Assault / Pistol / Blast / Psychic / Twin-linked | (a) | weapon abilities `ASSAULT`, `PISTOL`, `BLAST`, `PSYCHIC`, `TWIN_LINKED` |
| ghostglaive 2 profiles | (a) | two melee weapon records sharing `profileGroup: 'ael.pg.ghostglaive'` |
| singing spear ranged + melee | (a) | two records `ael.w.singing-spear-ranged` (ranged) and `ael.w.singing-spear` (melee); not a profile group (different types) |
| Wraithlord's two shuriken catapults (AEL-1.3) | (a) | two weapon records with the same profile, `ael.w.shuriken-catapult-wraithlord-1` / `-2` (both named "shuriken catapult"), because a model's `weapons` list is keyed by weapon id and a duplicated id would collapse to one entry in `buildShootingWeaponEntries` |
| Heavy Weapon Platform OC 0, W 2, 40 mm base | (a) | per-model profile on the datasheet (`models[]` with its own stats and base) |
| MOUNTED, FLY, BATTLELINE, WRAITH CONSTRUCT, PSYKER | (a) | plain keywords (FLY engine-native) |

Totals: **8 new code hooks** (`strandsOfFate`, `fortune`, `crewedPlatform`, `foresight`, `ineffableAgenda`,
`infantryOrMounted`, `stormOfShots`, `zephyrSwift`) + 4 reused (`simulacrumImperialis`, `reclaimAndDominate`,
`stratagemCostOverride`, `patrolSquads`); **5 engine changes (E1–E5), none touching a frozen contract.**

### 7.1 Engine changes (c) — exact signatures

The hooks above are written against these before they exist; the engine agent implements them in parallel.

```ts
// E1 Strands of Fate: generalise the Miracle dice pool (src/engine/miracle.ts, not frozen)
export const STRANDS_OF_FATE_CODE = 'strandsOfFate'
// true iff any of the player's units (any location) has a datasheet ability with code strandsOfFate
export function hasStrandsOfFate(state: GameState, player: PlayerId): boolean
// true iff either half of the (canonical) unit carries an ability with code strandsOfFate
export function unitHasStrandsOfFate(state: GameState, unitId: UnitId): boolean
// 'Fate' when hasStrandsOfFate, else 'Miracle' — used in miracleGate option labels ("Use Fate die 4")
export function diePoolName(state: GameState, player: PlayerId): 'Fate' | 'Miracle'
// replaces players[player].miracle.dice with `values` (each 1..6, else EngineInvariantError); emits one
// MiracleDieGained {player, value, source} per die. Never triggers the Saintly Relic re-roll.
export function setFatePool(ctx: EngineContext, player: PlayerId, values: number[], source: string): void
// substitutionEligible (signature unchanged) becomes:
//   sides === 6 && SUBSTITUTABLE.has(purpose) && unit exists && unit.player === player && pool non-empty && (
//     unitHasStrandsOfFate(state, unit.id)                                  // Aeldari: no keyword test, no per-phase cap
//     || (hasActsOfFaith(state, player) && keywordsOf(state, unit.id).includes('ADEPTA SORORITAS')
//         && unit (or a half) not in spentThisPhase))                       // Sororitas path unchanged
// maxSubstitutions (computed in miracleGate for rollOnce / rollBatchD6) becomes:
//   single roll (rollOnce), including multi-die rolls such as 2D6: 1
//   fast-rolled batch of N attacks (rollBatchD6): unitHasStrandsOfFate(state, unit.id) ? N : 1   // Sororitas: 1
//   (always also capped by the pool size)
// miracleHandler: the Strands of Fate path accepts up to maxSubstitutions dieIndexes in one decision (distinct pool
// dice onto distinct roll dice; more than the cap or a repeat is rejected); the Sororitas path still accepts exactly 1.
// MiracleState / 'miracleDie' topic / events unchanged (spentThisPhase still recorded; harmless).

// E2 Damage-roll re-rolls (Eldritch Might) — src/engine/attack.ts doDamageStage (not frozen)
// after `ctx.rollOnce(key, {purpose:'damage', …})` returns a roll with dice (parsed.count > 0), once per key
// (`ctx.once('autoReroll:' + key)`, already sequence-scoped):
function damageRerollKinds(ctx: EngineContext, actx: AttackContext, roll: DiceRoll): Set<'ones' | 'fails' | 'all'>
//   = the `reroll` values of every source collected at 'onDamageRoll' for this attack (hookService.collect with
//     {attack: actx, roll: RollContext}); attacker-side, `when` evaluated with the attack (weaponAbility etc.)
//   if kinds has 'ones': ctx.reroll(roll, indexes of dice === 1 that canReroll(roll, i), source) and use the result.
//   ('fails' / 'all' have no meaning for a Damage roll and are ignored.) Fate-substituted dice are never re-rolled.

// E3 Stratagem cost overrides from enhancements (= Space Wolves E1; identical behaviour, implement once)
// src/engine/stratagems.ts — signature unchanged:
function costOverridesFor(state: GameState, player: PlayerId, s: RuntimeStratagem, targetUnitIds: UnitId[]): { cost: number; ignoreLimit: boolean }[]
//   additionally scans runtime abilities with source 'enhancement', code 'stratagemCostOverride',
//   params.stratagemId === s.id, bearerModelId set, state.models[bearerModelId] alive and its unitId among the halves
//   of a target unit; pushes { cost: Number(params.cost ?? s.cost), ignoreLimit: params.ignoreLimit === true }.

// E4 Condition key: objective controlled by a given side (Swift Demise)
// src/data/types.ts Condition (not frozen) + docs/spec/schemas condition schema + 20-data-schema §3 key list:
targetOnObjectiveControlledBy?: 'self' | 'opponent'
// src/engine/hooks-impl.ts evaluateCondition: needs `attack`; true iff some non-removed objective o has
//   o.controller === (value === 'self' ? holderPlayer : otherPlayer(holderPlayer)) and any board model of the target
//   (either half) is within objective range of o (same geometry as unitOnObjective). holderPlayer = the player who
//   owns the ability's holder unit. Missing attack → false. tools/validate-data.ts accepts the key.

// E5 Queued reactive moves (Zephyr-swift on two Windrider squads) — src/engine/phases/movement.ts (not frozen)
interface ReactiveMove { unitId: UnitId; distance: number; source: string; then?: { unitId: UnitId; distance: number }[] }
export function startReactiveMove(ctx: EngineContext, unitId: UnitId, distance: number, source: string,
  window: TimingWindowId = 'movement.unitMoved', then: { unitId: UnitId; distance: number }[] = []): void
//   backward compatible (existing callers pass no `then`). When handleReactiveMove finishes a move (moved or pass)
//   and the record's `then` is non-empty, it immediately calls startReactiveMove for then[0] with the rest as its
//   `then` (same source / window); a queued unit that is no longer on the board or is now within Engagement Range
//   of an enemy is skipped. Only after the queue is empty does the window drain resume.
```

## 8. Test IDs

Same list as the `AEL` section of 12-rules-test-checklist.

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

## 9. Figures

Heights follow 30-figures (infantry H ≈ 1.1, mounted/heavy taller, monsters compressed); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (house figure style, original; see docs/FIGURE-STYLE.md) |
|---|---|---|---|---|---|
| `farseer-iraneth` | `ael.farseer-iraneth/farseer` | 1 | 1.1 | 25 mm | A slender seer in a tall crested helm with a smooth faceplate, long flowing pearl-and-jade robes over sleek armour, glowing green gems on the chest, one hand raised crackling with storm light, the other holding a long leaf-bladed spear. |
| `guardian-defender` | `ael.guardian-defenders/guardian-defender` | 10 | 1.0 | 28 mm | A lithe alien trooper in pearl-white ridged armour with jade shoulder plates, a tall domed helmet with a narrow eye slit and a short crest, holding a compact curved disc-throwing rifle. |
| `heavy-weapon-platform` | `ael.guardian-defenders/heavy-weapon-platform` | 1 | 0.9 | 40 mm | A small floating anti-grav sled in pearl and jade with a slim swept-back cannon that glows pale green at the muzzle, a tiny gem-studded control fin at the back. |
| `windrider-catapult` | `ael.windriders/windrider-catapult` | 4 | 1.4 | 32 mm flying | A rider in a crested helm hunched low over a sleek pointed jetbike with swept wings, pearl hull with jade stripes, twin short disc-throwers under the nose, mounted on a clear flying stand. |
| `windrider-scatter` | `ael.windriders/windrider-scatter` | 2 | 1.4 | 32 mm flying | Same jetbike rider with a long multi-lens laser cannon slung under the nose and gold trim on the wings. |
| `wraithlord` | `ael.wraithlord/wraithlord` | 1 | 2.8 | 60 mm | A towering bone-white construct with long elegant limbs, a small elongated faceless head with a glowing green gem, a long curved glaive in one hand, a slender lance cannon on one shoulder and two small disc-throwers on the forearms. |

## 10. Other Aeldari patrols (appendix)

- None. The Fatebreakers is the only Aeldari patrol in wahapedia's CP faction menu (Index, June 2023). The separate
  Drukhari faction lists one patrol, The Blades of Torment — out of scope here (its own faction spec).
