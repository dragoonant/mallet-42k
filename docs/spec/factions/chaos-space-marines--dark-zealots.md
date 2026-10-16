# Faction spec — Chaos Space Marines: Dark Zealots (second patrol)

Own-words data spec for the second Chaos Space Marines Combat Patrol, same shape as 11-combat-patrol §4. This file
covers **only** what Dark Zealots adds to the faction already specified in `docs/spec/factions/chaos-space-marines.md`
(Zarkan's Daemonkin, rule ids `CHA-…`). Anything identical is cited by its existing data id, not restated. Rule ids
`DZE-<section>.<n>` are cited by the `DZE-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose is ours. Data id prefix stays `csm.` (faction `chaos-space-marines`, faction keyword HERETIC
ASTARTES); new ids never collide with or change the Zarkan's Daemonkin ids.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| CSM patrol "Dark Zealots" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/dark-zealots/ | Index: Dark Zealots, 10th ed, **June 2023** |
| CP navigation (patrol enumeration) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | lists exactly two CSM patrols: Dark Zealots, Zarkan's Daemonkin |
| Existing faction spec | `docs/spec/factions/chaos-space-marines.md` | Zarkan's Daemonkin (May 2024) — shared ids cited from there |

Owner's choice: Dark Zealots is this file's patrol. Zarkan's Daemonkin is already playable (appendix §10).

## 1. Roster

4 patrol units (5 if Legionaries split), **19 models**. WARLORD: the DARK APOSTLE model (Ghallaron). Faction keyword
HERETIC ASTARTES on every datasheet.

| Ref | Unit (datasheet id) | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `ghallaron` | Ghallaron the Pious (`csm.ghallaron-the-pious`, NEW) | 3 = Ghallaron + 2 Dark Disciples | Ghallaron: bolt pistol, accursed crozius. Each Dark Disciple: Dark Disciple close combat weapon | **WARLORD** (Ghallaron model). Whole 3-model unit is a Leader → `legionaries` (default, and only, attachment) |
| `legionaries` | Legionaries (`csm.legionaries-dz`, NEW — profile differs from `csm.legionaries`) | 10 | Aspiring Champion: plasma pistol (2 profiles) + accursed weapon (no bolt pistol). 4× bolt pistol + boltgun + close combat weapon. 2× bolt pistol + Astartes chainsword. 1× bolt pistol + Astartes chainsword + Chaos icon. 1× bolt pistol + heavy bolter + close combat weapon. 1× bolt pistol + meltagun + close combat weapon | Patrol Squads (DZE-1.2); bodyguard for Ghallaron |
| `havocs` | Havocs (`csm.havocs`, NEW) | 5 | Havoc Champion: plasma gun (2 profiles) + Havoc Astartes chainsword. 1× Havoc heavy bolter + ccw; 1× Havoc lascannon + ccw; 1× Havoc missile launcher (2 profiles) + ccw; 1× Havoc reaper chaincannon + ccw | — |
| `helbrute` | Helbrute (`csm.helbrute`, NEW) | 1 | Helbrute plasma cannon; Helbrute hammer | — |

| Id | Rule |
|---|---|
| DZE-1.1 | Ghallaron's unit is one datasheet with two model kinds (precedent: Command Squad Karsk, AST-3.0). Composition order: the Ghallaron model is entry 0 (CHARACTER, DARK APOSTLE, GHALLARON THE PIOUS per-model keywords, `champion: true`), then `disciple` ×2. Enhancements are borne by the Ghallaron model. In an attached unit, attacks may be allocated to the Disciples (not CHARACTER) but not to Ghallaron while a Legionary lives (R-10.1, per-model keyword). |
| DZE-1.2 | Patrol Squads (CP-1.8): at Declare Battle Formations the Legionaries may split into two units of 5 (default: unsplit). Split parts **[interpretation, owner-changeable]**: `legionaries-a` = Aspiring Champion, heavy bolter, 2× boltgun, 1× chainsword; `legionaries-b` = meltagun, icon bearer, 1× chainsword, 2× boltgun. Each part has Starting Strength 5. When split, Ghallaron's attachment names `legionaries-a` by default (either part is legal). |
| DZE-1.3 | The Chaos icon is wargear with **no rule** on this card (cosmetic; figure only). |

## 2. Faction ability — Dark Pacts, Dark Zealots wording (every datasheet in this patrol)

This card prints the **older** Dark Pacts wording: the Leadership test comes **after** the unit's attacks, not
before. It is encoded as a patrol-scoped ability `csm.a.dark-pacts-dz` on the four new datasheets; `faction.json`'s
`armyRule` (`csm.a.dark-pacts`) is not edited.

| Id | Rule |
|---|---|
| DZE-2.1 | Each time a unit with this ability is selected to shoot or selected to fight, its controller may make a Dark Pact (optional). Same prompt windows as CHA-2.1 (`shooting.unitSelected`, `fight.unitSelected`); Fire Overwatch never offers a Pact (CHA-2.4 interpretation carried over). |
| DZE-2.2 | Making the Pact: pick [LETHAL HITS] **or** [SUSTAINED HITS 1]; every weapon of every model in the unit (attached unit included) has it until the end of the phase. No test happens yet, so the ability is always gained. |
| DZE-2.3 | Once the unit has resolved its attacks (the `shooting.attacksResolved` / `fight.attacksResolved` window keyed to that unit — in the Fight phase that is after its consolidation **[interpretation]**), it takes a Leadership test (2D6 ≥ the best Ld among its models — 5+ while Ghallaron lives in it; not a Battle-shock test, exactly as CHA-2.2). On a fail it suffers D3 mortal wounds (owner allocates; attached unit = one unit). If the unit has no model left on the board by then, no test. |
| DZE-2.4 | A model that fights through Bitter Blows (DZE-5.2) was not "selected to fight": no Pact prompt, no test. |

## 3. Enhancements (Ghallaron model, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| DZE-3.1 | Hateful Exhortation (`csm.e.hateful-exhortation`) | default | at the start of battle round 1, the controller picks one enemy unit (on the board or in Reserves **[interpretation]**). For the rest of the battle, each attack made by a model in the bearer's unit (attached unit included; ranged and melee) that targets that enemy unit improves its AP by 1 if it scores a Critical Wound. Works only while the bearer is alive. If the picked unit is an attached unit, both halves stay marked even if they later separate. |
| DZE-3.2 | Infernal Blessing (`csm.e.infernal-blessing`) | optional | the bearer (Ghallaron model only, not the Disciples or the bodyguard) has Feel No Pain 5+ against every lost wound (normal and mortal). |

Restriction for both **[interpretation]**: DARK APOSTLE model.

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| DZE-4.1 | Champion of the Dark Gods (`csm.sec.champion-of-the-dark-gods`) | default | at the end of **every** phase (either player's turn, rounds 1–5): 3 VP if your DARK APOSTLE **model** (Ghallaron himself, not a Disciple or bodyguard) destroyed at least one enemy model during that phase. No cap stated (each qualifying phase scores). A kill made in the phase Ghallaron himself dies still counts. |
| DZE-4.2 | Idolatrous Despoilers (`csm.sec.idolatrous-despoilers`) | optional | at the end of your opponent's turn (rounds 1–5; no round restriction printed): 4 VP if at least one of your units that is not Battle-shocked has every model wholly within the opponent's deployment zone (attached unit = one unit, all models of both halves). Flat award, however many units qualify. |

## 5. Patrol stratagems (all "Dark Zealots – Battle Tactic", 1 CP)

| Id | Name | Window | Target | Effect |
|---|---|---|---|---|
| DZE-5.1 | Empyric Rites (`csm.s.empyric-rites`) | opponent's Shooting phase or a Fight phase (either turn **[interpretation]**), just after an enemy unit selects its targets (`shooting.targetsDeclared` / `fight.targetsDeclared`) | one own HERETIC ASTARTES INFANTRY unit that is one of those targets | until end of phase, models in the unit have a 4+ invulnerable save (a better one already held is used instead, R-7 one-save rule) |
| DZE-5.2 | Bitter Blows (`csm.s.bitter-blows`) | a Fight phase (either turn), `fight.targetsDeclared`, just after an enemy unit selects its targets | one own HERETIC ASTARTES INFANTRY unit that is one of those targets | identical mechanics to Daemonic Fervour (`csm.s.daemonic-fervour`, CHA-5 / CSM-09 / CSM-10) except the keyword gate: until end of phase, each time a model of the unit is destroyed by an enemy attack while the unit has not fought this phase, roll D6; on 4+ it stays (0 W, not allocatable, no OC), fights once the attacking unit has finished its attacks, then is removed |
| DZE-5.3 | Malicious Volleys (`csm.s.malicious-volleys`) | your Shooting phase (`shooting.start`, between activations) | one own HERETIC ASTARTES INFANTRY unit not yet selected to shoot this phase | until end of phase, each attack by a model in the unit re-rolls a hit roll of 1; if the attack's target is Below Half-strength (combined, R-10.1) it may re-roll the hit roll whatever the result |

Core stratagems: per 10-rules §11 under their own gates (Helbrute is VEHICLE WALKER: no Go to Ground; Havocs,
Legionaries, Ghallaron are INFANTRY; no GRENADES or SMOKE units).

## 6. Datasheets

| Unit | Model | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ghallaron the Pious | Ghallaron | 40 mm | 6 | 4 | 3+ | 4+ | 4 | 5+ | 1 | all: INFANTRY, CHAOS; model: CHARACTER, DARK APOSTLE, GHALLARON THE PIOUS | Leader → Legionaries (`csm.legionaries-dz`); Dark Pacts (DZ); **Dark Zealotry** (DZE-6.1) |
| Ghallaron the Pious | Dark Disciple ×2 | 25 mm | 6 | 4 | 6+ | 4+ **[unconfirmed: page shows one invuln block for the card]** | 1 | 7+ | 1 | INFANTRY, CHAOS | — |
| Legionaries | all | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, CHAOS, LEGIONARIES | Dark Pacts (DZ); Patrol Squads (5/5). **No** Veterans of the Long War (that is `csm.legionaries` only). |
| Havocs | all | 40 mm | 5 | 5 | 3+ | — | 2 | 6+ | 1 | INFANTRY, CHAOS, HAVOCS | Dark Pacts (DZ) |
| Helbrute | — | 60 mm | 6 | 9 | 2+ | — | 8 | 6+ | 3 | VEHICLE, WALKER, CHAOS, HELBRUTE | Dark Pacts (DZ); Deadly Demise 1 |

Faction keyword (all): HERETIC ASTARTES. Datasheet-level stats of `csm.ghallaron-the-pious` = the Disciple line;
the Ghallaron model carries `statsOverride {Sv:3, W:4, Ld:5}`. Invuln 4+ is datasheet-level.

| Id | Rule |
|---|---|
| DZE-6.1 | Dark Zealotry: while the Ghallaron model is alive and his unit is leading a bodyguard, each melee attack by any model of the combined unit (Ghallaron, Disciples, Legionaries) adds 1 to the wound roll (R-6 ±1 cap applies). Unattached → no bonus. |
| DZE-6.2 | Havoc weapons have **no** [HEAVY] on this card (the Legionary heavy bolter keeps its own [HEAVY]). |
| DZE-6.3 | Helbrute: Deadly Demise 1 (on a 6 when destroyed, each unit within 6" suffers 1 mortal wound). Hazardous on its plasma cannon follows the core VEHICLE rule (3 mortal wounds instead of the model being destroyed). |

Wargear per model:
| Unit | Model (modelId) | Ranged | Melee |
|---|---|---|---|
| Ghallaron the Pious | Ghallaron (`ghallaron`) | `csm.w.bolt-pistol` | `csm.w.accursed-crozius` |
| Ghallaron the Pious | Dark Disciple ×2 (`disciple`) | — | `csm.w.dark-disciple-ccw` |
| Legionaries | Aspiring Champion (`champion`) | `csm.w.plasma-pistol`, `csm.w.plasma-pistol-supercharge` | `csm.w.accursed-weapon` |
| Legionaries | boltgun ×4 (`boltgun`) | `csm.w.bolt-pistol`, `csm.w.boltgun` | `csm.w.close-combat-weapon` |
| Legionaries | chainsword ×2 (`chainsword`) | `csm.w.bolt-pistol` | `csm.w.astartes-chainsword` |
| Legionaries | icon bearer ×1 (`icon`) | `csm.w.bolt-pistol` | `csm.w.astartes-chainsword` |
| Legionaries | heavy bolter ×1 (`heavy-bolter`) | `csm.w.bolt-pistol`, `csm.w.heavy-bolter` | `csm.w.close-combat-weapon` |
| Legionaries | meltagun ×1 (`meltagun`) | `csm.w.bolt-pistol`, `csm.w.meltagun` | `csm.w.close-combat-weapon` |
| Havocs | Havoc Champion (`champion`) | `csm.w.plasma-gun`, `csm.w.plasma-gun-supercharge` | `csm.w.havoc-astartes-chainsword` |
| Havocs | heavy bolter (`heavy-bolter`) | `csm.w.havoc-heavy-bolter` | `csm.w.close-combat-weapon` |
| Havocs | lascannon (`lascannon`) | `csm.w.havoc-lascannon` | `csm.w.close-combat-weapon` |
| Havocs | missile launcher (`missile-launcher`) | `csm.w.havoc-missile-launcher-frag`, `csm.w.havoc-missile-launcher-krak` | `csm.w.close-combat-weapon` |
| Havocs | reaper chaincannon (`reaper-chaincannon`) | `csm.w.havoc-reaper-chaincannon` | `csm.w.close-combat-weapon` |
| Helbrute | Helbrute (`helbrute`) | `csm.w.helbrute-plasma-cannon` | `csm.w.helbrute-hammer` |

Reused weapon ids (profiles identical to the CHA spec §6, unchanged): `csm.w.bolt-pistol`, `csm.w.boltgun`,
`csm.w.heavy-bolter`, `csm.w.meltagun`, `csm.w.plasma-pistol`, `csm.w.plasma-pistol-supercharge`,
`csm.w.accursed-weapon`, `csm.w.close-combat-weapon`.

New weapon profiles:
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `csm.w.accursed-crozius` | Accursed crozius | melee | 5 | 2+ | 6 | −1 | 2 | — |
| `csm.w.dark-disciple-ccw` | Close combat weapon (Dark Disciple) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| `csm.w.astartes-chainsword` | Astartes chainsword (Legionary) | melee | 4 | 3+ | 4 | −1 | 1 | — |
| `csm.w.havoc-astartes-chainsword` | Astartes chainsword (Havoc Champion) | melee | 5 **[unconfirmed: page reports A5 vs A4 on Legionaries]** | 3+ | 4 | −1 | 1 | — |
| `csm.w.havoc-heavy-bolter` | Havoc heavy bolter | 36" | 3 | 3+ | 5 | −1 | 2 | Sustained Hits 1 |
| `csm.w.havoc-lascannon` | Havoc lascannon | 48" | 1 | 3+ | 12 | −3 | D6+1 | — |
| `csm.w.havoc-missile-launcher-frag` | Havoc missile launcher — frag | 48" | D6 | 3+ | 4 | 0 | 1 | Blast |
| `csm.w.havoc-missile-launcher-krak` | Havoc missile launcher — krak | 48" | 1 | 3+ | 9 | −2 | D6 | — |
| `csm.w.havoc-reaper-chaincannon` | Havoc reaper chaincannon | 24" | 8 | 3+ | 5 | 0 | 1 | — |
| `csm.w.plasma-gun` | Plasma gun — standard | 24" | 1 | 3+ | 7 | −2 | 1 | Rapid Fire 1 |
| `csm.w.plasma-gun-supercharge` | Plasma gun — supercharge | 24" | 1 | 3+ | 8 | −3 | 2 | Hazardous, Rapid Fire 1 |
| `csm.w.helbrute-plasma-cannon` | Helbrute plasma cannon | 36" | D3 | 3+ | 8 | −3 | 3 | Blast, Hazardous |
| `csm.w.helbrute-hammer` | Helbrute hammer | melee | 5 | 4+ | 14 | −3 | D6+1 | — |

Two-profile weapons (missile launcher, plasma gun) are one `profileGroup` each, as `csm.w.plasma-pistol*`.
Paint scheme: unchanged faction `paintScheme`.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9) or an existing code hook reused as-is; (b) = new or
extended code hook (registered via `chaosSpaceMarinesHooks` in `src/engine/factions/chaos-space-marines.ts`);
(c) = engine change beyond a code hook. **No item touches a frozen contract** (`types/actions/events/hooks/rng/
decider/index.ts`). Reused machinery: `leadershipTest` (CHA C2), `daemonicFervour` + fight-on-death (CHA C5),
`wargearBearerAlive` (AST-6.2), `voraciousAssaultHit` (TYR stratagem hit-roll router), `reclaimAndDominate`
(CUS Drive the Talons Deep), `patrolSquads` + patrol `patrolSquads` parts (ADE E5), per-model `keywords` /
`statsOverride` (Command Squad Karsk), `critWoundAp` effect (CUS Blade of the Vaults).

| Rule | Enc. | Encoding |
|---|---|---|
| Dark Pacts DZ (DZE-2.1–2.4) | (b) | New ability `csm.a.dark-pacts-dz`: same shape as `csm.a.dark-pacts` (`trigger:'unitSelectedToShoot'`, `code:'darkPact'`, same `choices`, `excludeOverwatch`) plus `params.testTiming:'afterAttacks'`. **Extend `darkPact`** (`darkPactHandle`): when the ability's `params.testTiming === 'afterAttacks'`, grant the picked ability as today but do **not** call `leadershipTest`; instead push phase mark `pactTestDue:<canonicalUnitId>`. **New hook `darkPactLateTest`** (`kind:'ability'`, `hook:'onPhaseEnd'`, `run: noop`, referenced by no data; `pick.windows:['shooting.attacksResolved','fight.attacksResolved']`): `offer(ctx, window, key)` — `canon = canonicalUnitId(key)`; if mark `pactTestDue:<canon>` is present, remove it; if the unit still has a board model, `passed = hooks.leadershipTest(ctx, canon, abilityId)`; on fail roll D3 (`purpose:'ability'`) and `queueMortals(ctx, canon, n, abilityId)` (no credit); emit `AbilityTriggered`; **return false** (never raises a decision). Mortal-wound drain after the window: C1. The `both` option (Foul Zealotry) never appears here — no `foulZealotry` enhancement in this patrol. |
| Hateful Exhortation (DZE-3.1) | (b) | Enhancement `restriction:{keyword:['DARK APOSTLE']}`, effect descriptor `{trigger:'woundRoll', scope:{who:'self'}, effect:{critWoundAp:1}, code:'hatefulExhortation'}`. **New hook `hatefulExhortation`** (`kind:'ability'`, `hook:'onWoundRoll'`, `run: noop`): `pick` at `round.start` (only `state.round === 1`, mark `pick:hatefulExhortation:<player>` so once): for each player holding an enhancement with this code whose bearer model is not destroyed, `chooseOption` (topic `abilityChoice`, `data.code:'hatefulExhortation'`) over every enemy canonical unit not destroyed (board or Reserves); `handle` stores `state.players[player].secondaryState.hatefulTarget = <canonical unit id>` and emits `AbilityTriggered`. `gate(state, holder, entry, data)`: true iff the bearer model (`entry.bearerModelId`) is alive **and** `data.attack` exists **and** `leaderService.sameUnit(state, hatefulTarget, data.attack.targetUnitId)` or the target is either half of the stored unit. AI default: the enemy unit with the highest total wounds. |
| Infernal Blessing (DZE-3.2) | (a) | enhancement effect `{trigger:'always', effect:{feelNoPain:5}, scope:{who:'bearer'}}` (Tau DS13 shape) |
| Champion of the Dark Gods (DZE-4.1) | (b) | secondary `scoring:[{id:'champion-of-the-dark-gods', when:'phase.end', rounds:{from:1,to:5}, who:'both', rule:'custom', pointsPer:3, cap:999, code:'championOfTheDarkGods', params:{keyword:'DARK APOSTLE'}}]`. **New amount fn** `championOfTheDarkGodsAmount(s, rule, pid): number` exported from `src/engine/factions/chaos-space-marines.ts` and wired by one `case 'championOfTheDarkGods'` line in `missions.ts` `customAmount` (alphaXenoform pattern). It finds the own unit whose **datasheet composition** has a model entry with `params.keyword` in its per-model keywords (not `keywordsOf`, which drops a dead model's keywords), takes that entry's model id `modelIdFor(unit.id, index)` (0 for Ghallaron), reads `secondaryState.killsThisPhase`, resets it to `{}` (as Wrath of the Emperor), returns `pointsPer` if that model's count ≥ 1. Disciple / bodyguard kills never count. |
| Idolatrous Despoilers (DZE-4.2) | (a) | `{id:'idolatrous-despoilers', when:'turn.end', rounds:{from:1,to:5}, who:'opponent', rule:'custom', pointsPer:4, cap:999, code:'reclaimAndDominate', params:{keyword:'HERETIC ASTARTES'}}` — existing fn already does canonical units, wholly within the enemy zone, skips Battle-shocked, flat award. |
| Empyric Rites (DZE-5.1) | (a) | stratagem `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, target `{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}`, `effect:{invuln:4}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'` (exact shape of the Necron 5+ invuln stratagem) |
| Bitter Blows (DZE-5.2) | (a) | stratagem identical to `csm.s.daemonic-fervour` except `filter:{keyword:'INFANTRY'}`; `code:'daemonicFervour'`, `params.threshold:4` — reuses the hook and CHA C5 fight-on-death unchanged |
| Malicious Volleys (DZE-5.3) | (a) | stratagem `window:'shooting.start'`, `who:'active'`, `condition:{phase:'shooting', ownTurn:true}`, target `{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'notYetShot', count:1}`, `effect:[{when:{targetBelowHalf:true}, reroll:'all'}, {reroll:'ones'}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'`, `code:'voraciousAssaultHit'` (existing marker that routes a stratagem's reroll effects to `onHitRoll`) |
| Dark Zealotry (DZE-6.1) | (a) | ability `csm.a.dark-zealotry` `{trigger:'woundRoll', scope:{who:'self'}, when:{leaderAttached:true}, effect:{when:{weaponType:'melee'}, modifyRoll:{roll:'wound', value:1}}, code:'wargearBearerAlive', params:{modelId:'ghallaron'}}` |
| Patrol Squads (DZE-1.2) | (a) | ability `csm.a.patrol-squads-legionaries` `{trigger:'always', code:'patrolSquads', params:{sizes:[5,5]}}`; patrol unit `legionaries.patrolSquads:[{ref:'legionaries-a',…},{ref:'legionaries-b',…}]` with the DZE-1.2 wargear split |
| Leader (Ghallaron unit → Legionaries) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['csm.legionaries-dz']`; patrol `attachTo:'legionaries'`, `warlord:'ghallaron'` |
| Retinue models (DZE-1.1) | (a) | per-model `keywords`, `statsOverride`, `champion:true` on entry 0 (Karsk precedent) |
| Invuln 4+ (Ghallaron unit) | (a) | datasheet `invuln:'4+'` |
| Deadly Demise 1 (Helbrute) | (a) | `coreAbilities:[{ability:'DEADLY_DEMISE', value:1}]` |
| Weapon abilities (Sustained Hits 1, Blast, Hazardous, Rapid Fire 1, Heavy, Melta 2, Pistol) | (a) | standard `WeaponAbility` entries; two-profile weapons as one `profileGroup` |
| BATTLELINE (Legionaries), VEHICLE / WALKER (Helbrute) | (a) | keywords |
| Patrol-scoped faction ability shown in the UI | (c) | C2 |

### 7.1 Engine changes (c) — exact signatures

Both in non-frozen files. The (b) hooks above code against these.

**C1 — drain pick-queued mortal wounds after `fight.attacksResolved`.** `darkPactLateTest` queues mortal wounds from
inside a pick `offer` that raises no decision. `shooting.ts` `doResolve` already drains `phaseState.attack` on
re-entry; the engine agent must confirm the same in `src/engine/phases/fight.ts` and, if absent, add right after the
`ctx.window('fight.attacksResolved', unitId, …)` call:
```ts
if (s.phaseState.attack && attackService.advance(ctx) === 'pending') return 'pending'
```
(guarded by the existing `fi:arWindow:<unitId>` once-mark so the window is not reopened). No new types.

**C2 — patrol-level army rule override.** `src/data/types.ts` `CombatPatrolData`:
```ts
armyRule?: Id // overrides FactionData.armyRule for this patrol (registration + UI faction-ability panel)
```
`src/engine/state.ts`: `const armyRuleId = addAbility(patrol.armyRule ?? faction.armyRule, 'core')`; client faction-
ability display reads the same fallback. Dark Zealots sets `armyRule:'csm.a.dark-pacts-dz'`. Document the field in
20-data-schema. (Gameplay does not depend on C2 — the Pact rides on each datasheet's `abilities` list — it only keeps
the rules panel from showing the Zarkan wording.)

Data-only touch outside new ids: `faction.json` `combatPatrols` gains `"csm.cp.dark-zealots"` (required by the
state.ts patrol check); `armyRule` and `detachments` stay as they are.

Totals: **3 new code hooks** (`darkPactLateTest`, `hatefulExhortation`, `championOfTheDarkGods` amount fn) + **1
extended** (`darkPact`: `testTiming:'afterAttacks'`); **2 engine changes** (C1 verify-or-add fight drain, C2 patrol
`armyRule`), none touching a frozen contract.

## 8. Test IDs

Same list as the `DZE` section of 12-rules-test-checklist. Engine: `tests/engine/chaos-space-marines-dark-zealots.test.ts`;
data: `tests/data/chaos-space-marines-dark-zealots.test.ts`.

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

## 9. Figures

Heights follow 30-figures (infantry ~1.1, heavy infantry ~1.2, walkers by hull); bases are rules-true. Style: true
MGSD chibi (~2.5 heads, huge head, stubby legs), faction palette blue-black / dried crimson / old brass / warp-violet
glow; original designs, no logos or real-world faction iconography. The four Legionary variants shared with
Zarkan's patrol reuse existing slugs (`legionary-champion`, `legionary-boltgun` ×4, `legionary-heavy-bolter`,
`legionary-melta`) under model keys `csm.legionaries-dz/<modelId>`.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `ghallaron` | `csm.ghallaron-the-pious/ghallaron` | 1 | 1.2 | 40 mm | A chibi armoured preacher in blue-black plate draped with long crimson vestments covered in scribbled brass-script scrolls, a tall crested helm with a glowing violet visor, a book chained to the hip and a heavy spiked mace-staff topped with a burning brass brazier. |
| `dark-disciple` | `csm.ghallaron-the-pious/disciple` | 2 | 0.85 | 25 mm | A chibi hunched robed acolyte in ragged crimson cloth with a blank brass face mask, iron chains wound around the arms and a small hooked knife. |
| `legionary-chainsword` | `csm.legionaries-dz/chainsword` | 2 | 1.1 | 32 mm | A chibi spiky power-armoured warrior in blue-black plate with brass edging, a grille-mouthed helm with red eye-lenses, a bolt pistol raised in one hand and a chunky toothed chainsword in the other. |
| `legionary-icon` | `csm.legionaries-dz/icon` | 1 | 1.1 | 32 mm | Same chibi blue-black warrior holding a tall pole topped with a jagged brass sunburst sigil trailing tattered crimson ribbons, a chainsword at the other hand. |
| `havoc-champion` | `csm.havocs/champion` | 1 | 1.2 | 40 mm | A chibi bulky armoured gunner-leader in blue-black and brass with a horned crest helm, a plasma rifle with violet-glowing coils and a toothed chainsword. |
| `havoc-heavy-bolter` | `csm.havocs/heavy-bolter` | 1 | 1.2 | 40 mm | A chibi heavy-armoured blue-black warrior with a squat brass ammunition backpack feeding a belt into an oversized drum-fed gun held at the hip. |
| `havoc-lascannon` | `csm.havocs/lascannon` | 1 | 1.2 | 40 mm | Same chibi heavy-armoured warrior shouldering a long slim cannon with a red-glowing lens tip and a cable running to a battery pack. |
| `havoc-missile-launcher` | `csm.havocs/missile-launcher` | 1 | 1.2 | 40 mm | Same chibi heavy-armoured warrior with a boxy tube launcher on the shoulder and a rack of crimson-tipped rockets on the backpack. |
| `havoc-reaper-chaincannon` | `csm.havocs/reaper-chaincannon` | 1 | 1.2 | 40 mm | Same chibi heavy-armoured warrior hugging a stubby multi-barrel rotary gun with spiked brass cowling and a long looping ammo belt. |
| `helbrute` | `csm.helbrute/helbrute` | 1 | 2.2 | 60 mm | A chibi hunched stompy walker in blue-black plate with a fleshy crimson torso bursting through cracked armour, a tiny glowing violet eye-slit, one arm a fat plasma cannon with violet coils and the other a huge brass-studded hammer. |

## 10. Other Chaos Space Marines patrols (appendix)

- **Zarkan's Daemonkin** (Index, May 2024) — Aranis Zarkan (WARLORD, leads Possessed or Legionaries), Possessed ×5, Legionaries ×10, Cultist Mob ×10; already playable, spec `docs/spec/factions/chaos-space-marines.md`.
