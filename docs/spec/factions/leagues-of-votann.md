# Faction spec — Leagues of Votann: Warspeke's Prospect

Own-words data spec for the Leagues of Votann Combat Patrol, same shape as 11-combat-patrol §4. Rule ids
`LEA-<section>.<n>` are cited by the `LEA-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose here is ours. Faction id `leagues-of-votann`, data directory `src/data/factions/leagues-of-votann/`,
data id prefix `lov.`, faction keyword LEAGUES OF VOTANN.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Leagues of Votann box "Warspeke's Prospect" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/warspeke-s-prospect/ | Index, 10th ed, last update **June 2023** (Warhammer Community PDF) |
| CP faction navigation (used to enumerate patrols) | menu on the page above | — |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |
| Mechanisms reused | grey-knights.md E2/E3 + `src/engine/teleport.ts`; deathwatch.md §7.1 E1 (`TeleportArrivalOpts`); chaos-space-marines C5 + `src/engine/fight-on-death.ts`; adeptus-custodes `gildedSpear`; necrons `resonantFocusPick`; `patrolSquads` | — |

Patrol selection: the CP navigation lists exactly one Leagues of Votann patrol, Warspeke's Prospect (June 2023). It
is the primary and only roster; the appendix (§10) is empty.

Source quirk: the page's intro paragraph names the default secondary as "Explorator Acquisition", but that objective
is never described; the secondary section itself marks **Toil Earns** as the default and Holy Apparatus as the
alternative. We follow the secondary section (LEA-4).

## 1. Roster

4 datasheets, **19 models**. Faction keyword LEAGUES OF VOTANN on every datasheet. No IMPERIUM/CHAOS keyword.

| Ref | Datasheet id | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `kahl` | `lov.kahl-warspeke` | 1 | volkanite disintegrator; mass gauntlet; teleport crest (no rules) | **WARLORD**, enhancement Waste Feeds the Void (default). Leader → `hearthkyn` (default attachment) |
| `hearthkyn` | `lov.hearthkyn-warriors` | 10 | see per-model table (§6) | bodyguard for the Kâhl; Patrol Squads (LEA-1.2) |
| `pioneers` | `lov.hernkyn-pioneers` | 3 | see §6 | Scouts 9"; Outflanking Mag-Riders |
| `beserks` | `lov.cthonian-beserks` | 5 | see §6 | — |

| Id | Rule |
|---|---|
| LEA-1.1 | Leader eligibility: Kâhl Warspeke lists only Hearthkyn Warriors (`leader.attachTo:['lov.hearthkyn-warriors']`). |
| LEA-1.2 | Patrol Squads (CP-1.8): at the start of Declare Battle Formations, before any unit is set up, the 10 Hearthkyn may split into two units of 5 (Starting Strength 5 each). Default: unsplit. Split parts **[interpretation, owner-changeable]**: `hearthkyn-a` = Theyn, HYLas auto rifle Warrior, medipack Warrior, comms-array Warrior, 1 plain ion-blaster Warrior; `hearthkyn-b` = magna-rail Warrior, pan-spectral-scanner Warrior, 3 plain ion-blaster Warriors. When split, the Kâhl's patrol attachment names `hearthkyn-a`. |
| LEA-1.3 | Cosmetic wargear: the teleport crest (Kâhl), weavefield crest (Theyn), comms arrays (Hearthkyn, Pioneer) and rollbar searchlight (Pioneer) carry **no rules** on the CP page. They exist only as figure parts. |

## 2. Faction ability — Eye of the Ancestors (every datasheet)

| Id | Rule |
|---|---|
| LEA-2.1 | Each time an enemy unit destroys one of your LEAGUES OF VOTANN units, that enemy unit gains 1 Judgement token. A unit holds at most 2; extra tokens are lost. "Destroys" covers every attributed kill: attacks, Devastating Wounds, and mortal wounds that the engine credits to a unit (RC-090 grenades/Tank Shock, RC-072 Deadly Demise of an enemy model). A kill with no attributed enemy unit (Hazardous, lost in Reserves) gives no token. |
| LEA-2.2 | Each time a model with this ability attacks a unit that has ≥1 Judgement token: +1 to the hit roll. If the target has 2 tokens: +1 to the hit roll **and** +1 to the wound roll. Normal ±1 caps apply (R-6). |
| LEA-2.3 | Tokens belong to the unit for the rest of the battle (no expiry). Designer's notes: a unit that leaves and is set up again keeps its tokens; a unit that splits gives every resulting unit the original count; merging units keep the highest count. **[interpretation]** An attached unit (R-10.1) is one unit: a token goes to both halves, so if either half later becomes its own unit it keeps the count (the splitting note). |
| LEA-2.4 | **[interpretation]** Tokens are tracked per Votann player (they matter only to that player's models), so a Votann mirror match keeps two independent token sets. Each token change is announced (`AbilityTriggered`) and the client shows the count on the enemy unit. |

## 3. Enhancements (Kâhl Warspeke, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Waste Feeds the Void | default | ranged attacks by models in the bearer's unit (attached Hearthkyn included) re-roll hit rolls of 1; the bearer's unit may shoot in a turn in which it Fell Back (it still cannot charge that turn) |
| Prâgmaat Comms Uplink | optional | +1 OC to every model in the bearer's unit; the bearer's unit may re-roll its Battle-shock tests |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Toil Earns | default | LEA-4.1: at the start of the Deploy Armies step (after Declare Battle Formations, before the first unit is set up) you pick one objective marker that is **not** inside your own deployment zone. From battle round 2 on, at the end of each of **your** turns, 4 VP if you control that marker. No cap printed (max 16 VP across rounds 2–5). |
| Holy Apparatus | optional | LEA-4.2: from battle round 2 on, at the start of each battle round, pick one enemy unit that is not destroyed and has ≥1 Judgement token as that round's target. At the end of that battle round, 4 VP if the target is destroyed (by any means). No eligible unit → no target, no VP that round. **[interpretation]** "not destroyed" includes units in Reserves; an attached target counts as destroyed only when every half is destroyed. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Payment in Kind | 1 | epicDeed | `attack.modelDestroyed` (any phase, either player's turn), just after an enemy model's attack destroys the last model of one of your units | that own LEAGUES OF VOTANN unit (legal although destroyed) | for the rest of the battle, your LEAGUES OF VOTANN models re-roll hit rolls of 1 when attacking the unit of the enemy model that made the killing attack (both halves if it is attached) |
| Pan-Spectral Sweep | 1 | battleTactic | your Shooting phase (`shooting.start` … `shooting.attacksResolved`, between activations) | own LEAGUES OF VOTANN unit not yet selected to shoot this phase | until end of phase, its ranged weapons gain [LETHAL HITS] |
| Skeinwrought Physiology | 1 | battleTactic | `shooting.targetsDeclared` in the opponent's Shooting phase | own LEAGUES OF VOTANN unit that is a target of that enemy unit's attacks | until end of phase, improve the Save characteristic of its models by 1 (4+ → 3+, Kâhl 3+ → 2+; invulnerable save unchanged) |

Core stratagems: all apply per 10-rules §11 subject to their own gates (Go to Ground is INFANTRY-only, so Pioneers
— MOUNTED — cannot use it; Tank Shock needs VEHICLE, none here; Heroic Intervention is open to all four units: its only keyword gate is that a VEHICLE must be a WALKER, and there are no VEHICLES in this patrol).
Go to Ground is listed for the Kâhl, Hearthkyn and Beserks but not the Pioneers; Epic Challenge is listed for the Kâhl only.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Kâhl Warspeke | 1 | 40 mm | 5 | 5 | 3+ | 4+ | 4 | 7+ | 1 | INFANTRY, CHARACTER, KÂHL, WARSPEKE | Leader → Hearthkyn Warriors; Eye of the Ancestors; Grim Efficiency (LEA-6.1) |
| Hearthkyn Warriors | 10 | 28 mm | 5 | 5 | 4+ | — | 1 | 7+ | 2 | INFANTRY, BATTLELINE, HEARTHKYN WARRIORS | Eye of the Ancestors; Patrol Squads; Medipack, Pan-Spectral Scanner (LEA-6.2) |
| Hernkyn Pioneers | 3 | 90×52 mm oval | 12 | 6 | 4+ | — | 3 | 7+ | 2 | MOUNTED, FLY, HERNKYN PIONEERS | Scouts 9"; Eye of the Ancestors; Outflanking Mag-Riders (LEA-6.3) |
| Cthonian Beserks | 5 | 28 mm (mole-launcher model 50 mm) | 5 | 5 | 6+ | — | 2 (mole model 3) | 7+ | 1 | INFANTRY, CTHONIAN BESERKS | Feel No Pain 5+; Eye of the Ancestors; Cyberstimms (LEA-6.4); Mole Grenade Launcher (LEA-6.5) |

Faction keyword (all): LEAGUES OF VOTANN. No damaged profiles. No datasheet has an invulnerable save except the Kâhl.

| Id | Rule |
|---|---|
| LEA-6.1 | Grim Efficiency (Kâhl): once per battle round, in your Command phase, pick one enemy unit visible to this model; it gains 1 Judgement token (cap 2, LEA-2.1). Offered at `command.start` of your turn while the Kâhl is on the battlefield; mandatory when a candidate exists **[interpretation: no decline, it never hurts]**. |
| LEA-6.2 | Hearthkyn wargear: **Medipack** — while its bearer is alive, every model in the bearer's unit (an attached Kâhl included) has Feel No Pain 6+. **Pan-Spectral Scanner** — while its bearer is alive, ranged weapons of models in the bearer's unit have [IGNORES COVER]. After a Patrol Squads split each applies only to the half holding its bearer. |
| LEA-6.3 | Outflanking Mag-Riders (Pioneers): at the end of the opponent's turn, from battle round 2 on, if any model of this unit is within 6" (horizontal) of a battlefield edge and the unit is not within Engagement Range of an enemy unit, you may remove it and place it into Reserves (not Strategic Reserves). "The end of the opponent's turn, excluding their first turn" is the same as starting from battle round 2. In your **next** Reinforcements step it must be set up wholly within 6" of a battlefield edge that is not the opponent's battlefield edge, and more than 9" horizontally from every enemy model. Because this is plain Reserves, the CP-1.9 Strategic Reserves rules (round window, end-of-round-3 cull) do not apply at all: the return can happen in rounds 2–5 and the unit is never culled at the end of round 3. **[interpretation, as GRE-2.3/2.4/2.6]** a unit still off the board at battle end counts as destroyed (no attribution), and if it cannot or will not be set up it is destroyed as lost in Reserves. A spot within 6" of a side edge counts even near the opponent's corner (it is wholly within 6" of a non-opponent edge). |
| LEA-6.4 | Cyberstimms (Beserks): each time a model of this unit is destroyed by a melee attack while the unit has not fought this phase, roll one D6; on 4+ it stays (0 W, dead for every other purpose) and fights once after the attacking unit has finished its attacks, then it is removed. Applies in every Fight phase, both players' turns, to every such model (no per-unit limit printed). |
| LEA-6.5 | Mole Grenade Launcher (wargear): the model carrying it has +1 Wounds (3) and +1 Attacks. **[interpretation, owner-changeable]** "+1 Attacks" applies to every weapon that model carries: heavy plasma axe strike A4, sweep A7, mole grenade launcher D6+1. |

Wargear per model:
| Unit | Model (`modelId`) | Ranged | Melee |
|---|---|---|---|
| Kâhl Warspeke | `kahl` | volkanite disintegrator | mass gauntlet |
| Hearthkyn Warriors | Theyn `theyn` | EtaCarn plasma pistol | Kin melee weapon |
| Hearthkyn Warriors | Warrior ×4 `warrior` | Autoch-pattern bolt pistol, ion blaster | close combat weapon |
| Hearthkyn Warriors | Warrior (comms array) `warrior-comms` | Autoch-pattern bolt pistol, ion blaster | close combat weapon |
| Hearthkyn Warriors | Warrior (medipack) `warrior-medipack` | Autoch-pattern bolt pistol, ion blaster | close combat weapon |
| Hearthkyn Warriors | Warrior (pan-spectral scanner) `warrior-scanner` | Autoch-pattern bolt pistol, ion blaster | close combat weapon |
| Hearthkyn Warriors | Warrior (HYLas) `warrior-hylas` | Autoch-pattern bolt pistol, HYLas auto rifle | close combat weapon |
| Hearthkyn Warriors | Warrior (magna-rail) `warrior-magna` | Autoch-pattern bolt pistol, magna-rail rifle | close combat weapon |
| Hernkyn Pioneers | Pioneer (comms array) `pioneer-comms` | bolt revolver, bolt shotgun, magna-coil autocannon | plasma knife |
| Hernkyn Pioneers | Pioneer (searchlight) `pioneer-searchlight` | bolt revolver, bolt shotgun, magna-coil autocannon | plasma knife |
| Hernkyn Pioneers | Pioneer (rotary cannon) `pioneer-rotary` | bolt revolver, bolt shotgun, magna-coil autocannon, HYLas rotary cannon | plasma knife |
| Cthonian Beserks | Beserk ×3 `beserk` | — | heavy plasma axe (strike / sweep) |
| Cthonian Beserks | Beserk (mole launcher) `beserk-mole` | mole grenade launcher | heavy plasma axe (strike / sweep) |
| Cthonian Beserks | Beserk (gauntlet) `beserk-gauntlet` | — | twin concussion gauntlet |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| volkanite disintegrator | 18" | 3 | 2+ | 5 | 0 | 1 | Devastating Wounds |
| Autoch-pattern bolt pistol | 12" | 1 | 4+ | 4 | 0 | 1 | Pistol |
| Autoch-pattern bolter | 24" | 2 | 4+ | 4 | 0 | 1 | — (on the datasheet; no model in the box carries it) |
| EtaCarn plasma pistol | 6" | 1 | 4+ | 8 | −3 | 2 | Pistol |
| HYLas auto rifle | 24" | 3 | 4+ | 6 | −1 | 1 | Assault, Rapid Fire 3 |
| ion blaster | 18" | 1 | 4+ | 5 | −2 | 1 | — |
| magna-rail rifle | 18" | 1 | 5+ | 12 | −3 | D3+3 | Devastating Wounds, Heavy |
| bolt revolver | 9" | 1 | 4+ | 5 | 0 | 1 | Pistol |
| bolt shotgun | 12" | 2 | 4+ | 5 | 0 | 1 | Assault |
| HYLas rotary cannon | 24" | 6 | 4+ | 6 | −1 | 1 | Sustained Hits 1 |
| magna-coil autocannon | 24" | 3 | 4+ | 7 | −1 | 2 | — |
| mole grenade launcher | 24" | D6 (bearer D6+1, LEA-6.5) | 4+ | 5 | −1 | 1 | Blast, Indirect Fire |
| mass gauntlet | melee | 3 | 3+ | 8 | −2 | 3 | — |
| close combat weapon (Hearthkyn) | melee | 1 | 4+ | 4 | 0 | 1 | — |
| Kin melee weapon | melee | 2 | 4+ | 5 | −2 | 2 | — |
| plasma knife | melee | 2 | 4+ | 4 | 0 | 1 | — |
| heavy plasma axe — strike | melee | 3 (mole model 4) | 3+ | 6 | −2 | 2 | — |
| heavy plasma axe — sweep | melee | 6 (mole model 7) | 3+ | 4 | −1 | 1 | — |
| twin concussion gauntlet | melee | 4 | 4+ | 9 | −1 | 2 | Twin-linked |

Data note: the mole model's +1 A is data, not a hook — it gets its own weapon ids
(`lov.w.heavy-plasma-axe-strike-mole`, `lov.w.heavy-plasma-axe-sweep-mole`, `lov.w.mole-grenade-launcher` with A
`D6+1`) and `statsOverride:{W:3}`, base 50 mm, in its composition entry.

Suggested `paintScheme` (original): primary `#2f4a5c` (deep slate-teal armour), secondary `#d08a2c` (amber),
trim `#c9a64a` (brass), metal `#8d939b`, decal `#efe6cf` (bone).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, faction file `src/engine/factions/leagues-of-votann.ts` exporting
`leaguesOfVotannHooks`); (c) = engine change beyond a code hook (exact signatures in §7.1).

| Rule | Enc. | Encoding |
|---|---|---|
| Eye of the Ancestors — token gain (LEA-2.1, 2.3, 2.4) | (c) E1 | `judgementOnUnitDestroyed(ctx, unitId, by)` called from `attack.ts destroyUnitTail` right after `hooks.run('onUnitDestroyed')`. A hook cannot do it: `hooks-impl` skips holders whose location is `destroyed`, so the dying unit's own ability never runs. Fires iff the destroyed unit has faction keyword LEAGUES OF VOTANN **and** its datasheet carries an ability with `code:'eyeOfTheAncestors'`, `by.unitId !== null` and that unit's owner ≠ destroyed unit's owner → `addJudgement(ctx, <destroyed unit owner>, by.unitId, 1, 'lov.a.eye-of-the-ancestors')`. |
| Eye of the Ancestors — hit / wound bonus (LEA-2.2) | (b) | `eyeOfTheAncestors` (`kind:'ability'`, `hook:'onHitRoll'`, `hooks:['onHitRoll','onWoundRoll']`, `run: noop`). Datasheet descriptors (army rule `lov.a.eye-of-the-ancestors` on every datasheet): `[{trigger:'hitRoll', code:'eyeOfTheAncestors', params:{min:1}, effect:{modifyRoll:{roll:'hit', value:1}}}, {trigger:'woundRoll', code:'eyeOfTheAncestors', params:{min:2}, effect:{modifyRoll:{roll:'wound', value:1}}}]`. `gate(state, holder, entry, data)`: `const a = data?.attack; return !!a?.targetUnitId && judgementTokens(state, holder.player, a.targetUnitId) >= entry.params.min`. |
| Grim Efficiency (LEA-6.1) | (b) | `grimEfficiencyPick` (`kind:'ability'`, `hook:'onCommandPhase'`, `gate: () => false`, `pick:{window:'command.start', topic:'abilityChoice', offer, handle}` — same shape as `resonantFocusPick`). `offer`: own turn only, guard `ctx.once('grimEfficiency:<round>:<player>')`; bearer = the Kâhl model (board, alive); candidates = enemy canonical board units with `ctx.services.los.unitVisible(s, kahlModelId, unitId)`; none → no decision; `canPass:false`. `handle`: validates candidate, `addJudgement(ctx, player, unitId, 1, abilityId)`. |
| Waste Feeds the Void | (a) | enhancement `effect:[{trigger:'hitRoll', when:{weaponType:'ranged'}, effect:{reroll:'ones'}, scope:{who:'self'}}, {trigger:'always', effect:{shootAfterFallBack:true}, scope:{who:'self'}}]` (explicit `self`; enhancements default to `bearer`) |
| Prâgmaat Comms Uplink | (a) | `effect:[{trigger:'always', effect:{modifyStat:{stat:'OC', value:1}}, scope:{who:'self'}}, {trigger:'battleShockTest', effect:{reroll:'fails'}, scope:{who:'self'}}]` |
| Toil Earns — pick (LEA-4.1) | (b)+(c) E3 | secondary `scoring:[{id:'toil-earns-pick', when:'deployment.unit', rounds:{from:0,to:0}, who:'both', rule:'custom', code:'toilEarnsPick', pointsPer:0, cap:0}, …]`. `toilEarnsPick = missionHook('toilEarnsPick')`, added to `PICK_CODES` + a `runPick` branch → `toilEarnsOffer(ctx, pid, window, key)`: options = live objectives whose centre is **not** `pointInPolygon(obj.pos, deploymentZone(s, pid))`; `chooseOption` topic `abilityChoice`, `data:{window, key, code:'toilEarnsPick', owner:pid}`, `canPass:false`; answer stores `players[pid].secondaryState['lov:toilEarns'] = objectiveId`, emits `AbilityTriggered`, resumes `missions.onWindow`. E3 supplies the window. |
| Toil Earns — score | (b) | `{id:'toil-earns', when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'custom', code:'toilEarnsScore', pointsPer:4, cap:4}`; `toilEarnsScore = missionHook('toilEarnsScore', 'onTurnEnd')` + `case 'toilEarnsScore'` in `customAmount`: stored id live and `holds(ctx, id, pid)` → 4, else 0. |
| Holy Apparatus — pick (LEA-4.2) | (b) | `{id:'holy-apparatus-pick', when:'round.start', rounds:{from:2,to:5}, who:'both', rule:'custom', code:'holyApparatusPick', pointsPer:0, cap:0}`; `holyApparatusPick = missionHook('holyApparatusPick')` in `PICK_CODES`; offer: opponent canonical units with ≥1 half not `destroyed` (board or Reserves) and `judgementTokens(s, pid, id) >= 1`; none → store `null`, no decision; `canPass:false`; answer stores `players[pid].secondaryState['lov:holyApparatus'] = { unitId, round }`. |
| Holy Apparatus — score | (b) | `{id:'holy-apparatus', when:'round.end', rounds:{from:2,to:5}, who:'both', rule:'custom', code:'holyApparatusScore', pointsPer:4, cap:4}`; `holyApparatusScore = missionHook('holyApparatusScore')` + amount: stored `round === s.round` and every half of `unitId` has `location === 'destroyed'` → 4, else 0. |
| Payment in Kind | (b) | stratagem `window:'attack.modelDestroyed'`, `who:'either'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'LEAGUES OF VOTANN'}, state:'justDestroyed', count:1}]`, `duration:'battle'`, `code:'paymentInKind'`, `effect:{reroll:'ones'}`. Hook `paymentInKind` (`kind:'stratagem'`, `hook:'onModelDestroyed'`, `hooks:['onHitRoll']`, `run: noop`): `check` = reuse exported `gildedSpearCheck` (pending death request of that unit, requested by an enemy attack); `apply` = copy of `gildedSpearApply` that grants `{reroll:'ones'}` to every live half of the attacker's canonical unit with `scope:{who:'attacker'}`, `duration:'battle'`, `when:{attackerKeyword:'LEAGUES OF VOTANN'}` and clears the request mark. |
| Pan-Spectral Sweep | (a) | `window:['shooting.start','shooting.attacksResolved']`, `who:'active'`, target own LEAGUES OF VOTANN unit `state:'notYetShot'`, `effect:{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'LETHAL_HITS'}}`, `untilEndOfPhase` |
| Skeinwrought Physiology | (a) | `window:'shooting.targetsDeclared'`, `who:'reactive'`, target own LEAGUES OF VOTANN unit `state:'targetedByAttack'`, `effect:{modifyStat:{stat:'Sv', value:-1}}`, `untilEndOfPhase` (same shape as Gene-wrought Resilience; the stat change never touches the invuln) |
| Medipack (LEA-6.2) | (a) | Hearthkyn ability `{trigger:'always', when:{unitHasModel:'warrior-medipack'}, effect:{feelNoPain:'6+'}, scope:{who:'self'}}` (`unitHasModel` already checks both attached halves) |
| Pan-Spectral Scanner (LEA-6.2) | (a) | `{trigger:'always', when:{unitHasModel:'warrior-scanner', weaponType:'ranged'}, effect:{grantWeaponAbility:{ability:'IGNORES_COVER'}}, scope:{who:'self'}}` |
| Patrol Squads (LEA-1.2) | (a) | existing marker hook `patrolSquads` + datasheet `parts` / patrol `splitUnits` (as ADE-1.2 / BLA-6.4) |
| Outflanking Mag-Riders — pick + removal (LEA-6.3) | (b)+(c) E2 | `outflankingMagRiders` (`kind:'ability'`, `hook:'onTurnEnd'`, `gate: () => false`, `pick:{window:'turn.end', topic:'abilityChoice', offer, handle}`), copied from `teleportOffer/teleportHandle`. `offer`: P = non-active player; guard `ctx.once('magRiders:<round>:<activePlayer>')`; requires `s.round >= 2`; candidates = P's canonical board units whose every half carries this code, not `isTeleporting`, not in Engagement Range of an enemy unit, and with ≥1 model whose base is within 6" of any board edge (`min(hw-|x|, hh-|z|) - baseRadius <= 6`); options + `decline`. `handle`: `removeUnitToReserves(ctx, id, abilityId, { minEnemyGap: 9, forbidChargeOnArrival: false, region: 'edgeNotOpponent', eventVia: 'strategicReserves' })` + `AbilityTriggered`. Runs in the same `turn.end` slot as Teleport Assault (GRE-2.5 ordering). |
| Outflanking Mag-Riders — arrival | (c) E2 | movement.ts uses the record's `region` to build the arrival constraints (`magRidersArrivalConstraints`), reports `ReinforcementsArrived{via: opts.eventVia}` (the unit is in plain Reserves, not Strategic Reserves; `via:'strategicReserves'` is only a cosmetic event label, and no CP-1.9 Strategic Reserves rule applies); every other Teleport-record behaviour (mandatory next Reinforcements step, any round, decline ⇒ destroyed, no end-of-round-3 cull, destroyed if still off-board at battle end, Rapid Ingress refused) is reused unchanged. |
| Cyberstimms (LEA-6.4) | (b) | `cyberstimms` (`kind:'ability'`, `hook:'onPhaseStart'`, `run: noop`, `gate: () => false`, `runAt`): descriptor `{trigger:'phaseStart', when:{phase:'fight'}, code:'cyberstimms', params:{threshold:4}}`; `runAt(ctx, entry)`: if `ctx.state.phase === 'fight'` and the holder is on the board → `grantFightOnDeath(ctx.state, holder.id, entry.params.threshold ?? 4)` (export the existing function from `fight-on-death.ts`). The C5 engine path in `attack.ts destroyModel` already does the D6, the "not fought yet" check, the deferral and the later removal. |
| Mole Grenade Launcher (LEA-6.5) | (a) | data only: `statsOverride:{W:3}`, base 50 mm, bearer-specific weapon ids with A+1 |
| Feel No Pain 5+ (Beserks) | (a) | `coreAbilities:[{ability:'FEEL_NO_PAIN', value:5}]` |
| Scouts 9" (Pioneers) | (a) | `coreAbilities:[{ability:'SCOUTS', value:9}]` |
| Leader (Kâhl → Hearthkyn) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['lov.hearthkyn-warriors']`; patrol `attachTo:'hearthkyn'` |
| Devastating Wounds / Pistol / Assault / Rapid Fire 3 / Heavy / Sustained Hits 1 / Blast / Indirect Fire / Twin-linked | (a) | native weapon abilities |
| FLY, MOUNTED (Pioneers) | (a) | keywords; FLY is engine-native movement; MOUNTED blocks Go to Ground (not INFANTRY) |
| BATTLELINE, CHARACTER, KÂHL | (a) | plain keywords |

Totals: **9 new code hooks** (`eyeOfTheAncestors`, `grimEfficiencyPick`, `toilEarnsPick`, `toilEarnsScore`,
`holyApparatusPick`, `holyApparatusScore`, `paymentInKind`, `outflankingMagRiders`, `cyberstimms`); reused:
`patrolSquads`, `gildedSpearCheck`, `grantFightOnDeath`, `removeUnitToReserves`/Teleport path, `unitHasModel`.
**3 engine changes (c)**, none touching a frozen contract (`types.ts`, `actions.ts`, `events.ts`, `hooks.ts`,
`rng.ts`, `decider.ts`, `index.ts` unchanged; tokens live in `Player.secondaryState`, arrival reports the existing
`'strategicReserves'` via, decisions reuse `chooseOption`).

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; hooks code against these.

**E1 — Judgement tokens** (new non-frozen file `src/engine/judgement.ts`; one call added in `attack.ts`).
```ts
// src/engine/judgement.ts
import type { EngineContext } from './modules'
import type { DestroyedBy } from './attack'
import type { GameState, PlayerId, UnitId } from './types'

export const JUDGEMENT_KEY = 'lov:judgement'   // players[owner].secondaryState[JUDGEMENT_KEY]: Record<UnitId, number>
export const JUDGEMENT_MAX = 2
export const EYE_OF_THE_ANCESTORS_CODE = 'eyeOfTheAncestors'

// tokens `owner`'s models see on `unitId`: max over the unit's halves (leaderService.halves), 0..2
export function judgementTokens(state: GameState, owner: PlayerId, unitId: UnitId): number
// adds n (capped at JUDGEMENT_MAX) to every half of the canonical unit of `unitId` (destroyed halves included, so a
// later survivor keeps the count); emits AbilityTriggered {abilityId: source, targetUnitId: canonical, summary:
// 'Judgement: <name> now has k token(s)'}; returns the new count (unchanged count → no event)
export function addJudgement(ctx: EngineContext, owner: PlayerId, unitId: UnitId, n: number, source: string): number
// LEA-2.1 trigger; no-op unless the destroyed unit is LEAGUES OF VOTANN with an EYE_OF_THE_ANCESTORS_CODE ability
// and `by.unitId` is a unit of the other player
export function judgementOnUnitDestroyed(ctx: EngineContext, destroyedUnitId: UnitId, by: DestroyedBy): void
```
`attack.ts destroyUnitTail(ctx, unit, by)`: add `judgementOnUnitDestroyed(ctx, unit.id, by)` immediately after the
`ctx.services.hooks.run(ctx, 'onUnitDestroyed', …)` line (before `missions.unitDestroyed`; order is otherwise
irrelevant because Holy Apparatus only reads tokens at round start). Client: show the count on the enemy unit's badge
(read via `judgementTokens(state, viewer, unitId)`).

**E2 — Edge-redeploy arrival for Teleport records** (extends deathwatch.md §7.1 E1 `TeleportArrivalOpts`; if E1 is
not built yet, build it as specified there plus these two fields). Non-frozen files only.
```ts
// src/engine/teleport.ts
export interface TeleportArrivalOpts {
  minEnemyGap: number
  forbidChargeOnArrival: boolean
  region?: 'anywhere' | 'edgeNotOpponent'                  // absent = 'anywhere' (Deep Strike geometry)
  eventVia?: 'teleportAssault' | 'strategicReserves'       // ReinforcementsArrived.via to emit; absent = 'teleportAssault'
}
// src/engine/phases/movement.ts
// wholly within 6" of a battlefield edge other than the opponent's: forbidden = [board inset by 6" on every side,
// the 6"-deep strip along the opponent's edge (playerBattlefieldEdge(state.board, deploymentZone(state, otherPlayer(player))))
// minus its two 6" corner squares]; region = whole board; minDistanceFromEnemies = minEnemyGap; coherency false
export function magRidersArrivalConstraints(state: GameState, player: PlayerId, minEnemyGap: number): MoveConstraints
```
`resolveArrival` / `raiseArrivalDecision` for a teleporting unit: `region === 'edgeNotOpponent'` → use
`magRidersArrivalConstraints` instead of the Deep Strike branch; the arrival commit emits
`ReinforcementsArrived{ via: opts.eventVia ?? 'teleportAssault' }`. The internal `ArrivalVia` stays
`'teleportAssault'` for clear/destroy bookkeeping.

**E3 — Deploy Armies pick window** (`src/engine/setup.ts`, non-frozen).
In `case 'deploy'`, after the Patrol Squads loop and before the first `deployUnit` decision:
```ts
if (ctx.once('deployArmiesStart')) {
  ctx.services.missions.onWindow(ctx, 'deployment.unit', 'deployArmies')
  if (s.pending) return 'pending'
}
```
`s.round` is 0 during setup, so the pick rule uses `rounds:{from:0,to:0}`; no scoring rule uses this window today,
so the call only runs `PICK_CODES` rules (Toil Earns). A missions-decision answer must resume the setup `advance`
loop (the existing pick answer path calls `processWindow` and returns; the reducer re-enters `advance`).

## 8. Test IDs

Same list as the `LEA` section of 12-rules-test-checklist.

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
| LEA-030 | LEA-6.3 | Mag-Riders arrival emits `ReinforcementsArrived{via:'strategicReserves'}`; Rapid Ingress is not offered for it |
| LEA-031 | LEA-6.4 | Cyberstimms: Beserk destroyed by a melee attack before its unit fought, D6 = 4 → stays, fights once after the attacker finishes, then removed; D6 = 3 → removed at once |
| LEA-032 | LEA-6.4 | Cyberstimms: no roll once the Beserks have fought this phase; no roll for a model destroyed by a ranged attack; works in both players' Fight phases |
| LEA-033 | LEA-6.5 | mole-launcher Beserk has W 3, axe strike A4 / sweep A7, launcher D6+1 (Blast, Indirect Fire); other Beserks W 2, A3 / A6 |
| LEA-034 | LEA-6 | Beserks FNP 5+ against every wound; Pioneers Scouts 9" pre-battle move; Pioneers cannot be targeted by Go to Ground (MOUNTED) |
| LEA-035 | LEA-6 | magna-rail rifle: Heavy (+1 hit when stationary), D3+3 damage, Devastating Wounds on a critical wound; volkanite disintegrator Devastating Wounds |
| LEA-036 | LEA-6 | HYLas auto rifle Rapid Fire 3 at half range → A6, Assault (shoot after Advance); HYLas rotary cannon Sustained Hits 1; twin concussion gauntlet Twin-linked |
| LEA-037 | E1 | Regression: storing tokens in `secondaryState['lov:judgement']` keeps replay hashes deterministic (same seed + actions → same hash) and does not alter non-LoV games |

## 9. Figures

Votann are short and stocky: infantry about 0.95" tall (vs the 1.1" human baseline in 30-figures); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (house figure style, original; see docs/FIGURE-STYLE.md) |
|---|---|---|---|---|---|
| `kahl-warspeke` | `lov.kahl-warspeke/kahl` | 1 | 1.05 | 40 mm | A stout armoured dwarf lord in slate-teal plate with brass trim, huge braided white beard spilling over a glowing amber chest core, crested helm with a tiny floating holo-crest, a chunky gauntlet the size of his head on one arm and a short crackling disintegrator pistol in the other. |
| `hearthkyn-theyn` | `lov.hearthkyn-warriors/theyn` | 1 | 0.95 | 28 mm | A squat space dwarf sergeant in slate-teal armour and round bubble helmet, thick orange beard braids, a short crackling energy axe and a compact plasma pistol, a small shimmering shield-crest above the shoulder. |
| `hearthkyn-warrior-ion` | `lov.hearthkyn-warriors/warrior` (+ `warrior-comms`, `warrior-medipack`, `warrior-scanner` as part swaps) | 7 | 0.95 | 28 mm | A stocky dwarf trooper in slate-teal armour with a domed visor helmet and amber lenses, braided beard, holding a boxy blaster rifle with a glowing blue ion coil; variants add a back-mounted antenna pack, a white medic satchel, or a handheld scanner dish. |
| `hearthkyn-warrior-hylas` | `lov.hearthkyn-warriors/warrior-hylas` | 1 | 0.95 | 28 mm | The same dwarf trooper braced behind a long drum-fed automatic rifle with brass ammunition feed. |
| `hearthkyn-warrior-magna` | `lov.hearthkyn-warriors/warrior-magna` | 1 | 0.95 | 28 mm | The same dwarf trooper shouldering an oversized rail rifle with twin magnetic rails and a glowing amber charge cell. |
| `hernkyn-pioneer` | `lov.hernkyn-pioneers/pioneer-comms`, `pioneer-searchlight`, `pioneer-rotary` | 3 (1 rotary-cannon variant, 1 with tall antenna, 1 with roll-bar lamp) | 1.3 | 90×52 mm oval | A dwarf scout in a slate-teal flight suit and goggles riding a squat hovering grav-bike with no wheels, glowing amber underside thrusters, a twin-barrel autocannon on the nose and a shotgun holstered on the side; one bike carries a spinning multi-barrel cannon. |
| `cthonian-beserk-axe` | `lov.cthonian-beserks/beserk` | 3 | 1.0 | 28 mm | A brawny dwarf miner in a heavy orange-and-slate exo-rig with exposed pistons and a sealed rebreather mask, wild beard, swinging a two-handed axe with a glowing plasma edge. |
| `cthonian-beserk-gauntlet` | `lov.cthonian-beserks/beserk-gauntlet` | 1 | 1.0 | 28 mm | The same dwarf miner with two giant hydraulic piston fists instead of an axe. |
| `cthonian-beserk-mole` | `lov.cthonian-beserks/beserk-mole` | 1 | 1.0 | 50 mm | Two dwarf miners sharing one base: one crouched loading a short tunnelling grenade launcher shaped like a drill-nosed tube, the other with a plasma axe guarding beside it. |

## 10. Other Leagues of Votann patrols (appendix)

None listed on wahapedia's Combat Patrol section as of 2026-10-15 (Warspeke's Prospect, June 2023, is the only one).
