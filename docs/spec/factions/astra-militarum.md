# Faction spec — Astra Militarum: Karsk's Gunners

Own-words data spec for the Astra Militarum Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `AST-<section>.<n>`
are cited by the `AST-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours. Data id prefix: `am.` (faction id `astra-militarum`, faction keyword `ASTRA MILITARUM`).

## 0. Sources (accessed 2026-10-03)

| Source | URL | Version shown on page |
|---|---|---|
| Astra Militarum box "Karsk's Gunners" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/karsk-s-gunners/ | Index, 10th ed, last update June 2023 |
| CP faction navigation (used to enumerate patrols) | menu on any page under https://wahapedia.ru/wh40k10ed_cp/factions/ | — |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Patrol selection: the wahapedia Combat Patrol navigation lists exactly one Astra Militarum patrol, Karsk's Gunners
(June 2023). It is therefore both the current boxed patrol and the only one; there is no appendix roster (§10).

## 1. Roster

5 units, 28 models. Faction keyword ASTRA MILITARUM on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `karsk` | Command Squad Karsk | 5 | Karsk (Cadian Commander): plasma pistol, power weapon. Veteran ×1: bolt pistol, power fist. Veteran ×1: lasgun, close combat weapon. Veteran ×1: lasgun, close combat weapon, **medi-pack**. Veteran ×1: lasgun, close combat weapon, **regimental standard** | **WARLORD** (the Karsk model is the OFFICER and bears the enhancement). The whole 5-model unit is a Leader → `shock-a` (default attachment) |
| `shock-a` | Cadian Shock Troops | 10 | Sergeant: laspistol, chainsword. 7× lasgun + close combat weapon. 1× flamer + ccw. 1× meltagun + ccw | bodyguard for Command Squad Karsk |
| `shock-b` | Cadian Shock Troops | 10 | Sergeant: drum-fed autogun + ccw. 6× lasgun + ccw. 1× lasgun + ccw + vox-caster (no rule effect in this patrol). 1× grenade launcher + ccw. 1× plasma gun + ccw | — |
| `battery` | Field Ordnance Battery | 2 | gun 1: bombast field gun, lasgun, laspistol, battery close combat weapons. gun 2: malleus rocket launcher, lasgun, laspistol, battery close combat weapons | **Patrol Squads** (AST-6.6): may split into two 1-model units |
| `sentinel` | Armoured Sentinels | 1 | hunter-killer missile, plasma cannon, close combat weapon | — |

Composition order matters: the Karsk model must be the first composition entry of Command Squad Karsk (AST-3.0).
Core stratagems that become legal through keywords in this box (CP-1.6 update): Smokescreen and Tank Shock for the
Armoured Sentinels (VEHICLE, SMOKE), Go to Ground for every INFANTRY unit, Epic Challenge for the Karsk unit. No unit has
GRENADES, so Grenade is never legal.

## 2. Faction ability — Voice of Command (Command Squad Karsk)

| Id | Rule |
|---|---|
| AST-2.1 | In your own Command phase, each OFFICER **model** of yours with this ability that is on the battlefield may issue Orders; its datasheet gives the count and eligible units (Karsk: 1 Order, to a REGIMENT unit). Engine timing: offered at `command.end` (after battle-shock tests). Declining is allowed. |
| AST-2.2 | Issuing: pick one Order from AST-2.5 and one eligible friendly unit with at least one model within 6" of the OFFICER model. An attached unit counts as one unit and has REGIMENT if either half has it, so Karsk's attached Shock Troops (Karsk's own models included) can be ordered; an unattached Command Squad Karsk is not REGIMENT and cannot order itself. |
| AST-2.3 | The ordered unit is affected until the start of your next Command phase. A unit carries at most one Order: a new Order replaces the current one. |
| AST-2.4 | If an affected unit **becomes** Battle-shocked, its Order ends immediately. An Order issued to a unit that is already Battle-shocked does apply (it did not "become" shocked) **[interp: RAW; logged for needs-rules-check]**. |
| AST-2.5 | Orders: **Move! Move! Move!** — +3" to the Move characteristic of the unit's models. **Take Aim!** — ranged weapons of the unit's models get BS improved by 1 (4+ → 3+). **Take Cover!** — Save characteristic of the unit's models improved by 1, never to better than 3+ (5+ → 4+, 4+ → 3+, 3+ and 2+ unchanged). |

## 3. Enhancements (Karsk, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| AST-3.0 | — | — | The enhancement is borne by the Karsk model (the OFFICER/CHARACTER model), not by the veterans. "Bearer on the battlefield" = the Karsk model is alive on the board. |
| AST-3.1 | Command Laurels | default | In your Command phase, if the bearer is on the battlefield, gain 1 CP (subject to the R-4.2 / CP-1.7 +1-per-round cap). Also, each Order the bearer issues goes to **every** friendly ASTRA MILITARUM unit on the battlefield at once (no range check, no REGIMENT check, battle-shocked units included); each such unit's current Order is replaced. |
| AST-3.2 | Gunnery Officer (Aura) | optional | In your Command phase, if the bearer is on the battlefield, gain 1 CP (same cap). While a friendly ARTILLERY unit has a model within 6" of any model of the bearer's unit (attached unit included): (a) each roll that sets the number of attacks a model of that ARTILLERY unit makes with a weapon may be re-rolled (the dice of the random part, e.g. the D6 of D6+6); (b) the models of that ARTILLERY unit have Lone Operative while they have not made any attack yet this battle. The unit counts as Lone Operative only while every one of its models qualifies **[interp]**. |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| AST-4.1 | Hold the Line | default | At the end of the **opponent's** turn (every round): 5 VP if no enemy unit is wholly within 6" of your deployment zone; otherwise 3 VP if no enemy unit is wholly within your deployment zone; otherwise 0. Battle-shocked enemy units are ignored for both tests; units not on the battlefield are ignored. "Wholly within 6" of the zone" = every point of every model's base is inside the zone or ≤ 6" from its boundary. Attached units are tested as one unit (all models of both halves). |
| AST-4.2 | Methodical Destruction | optional | At the start of each battle round (rounds 1–5) pick one enemy unit that is not destroyed (board or Reserves; an attached pair is one candidate). At the end of that round, 4 VP if that unit is destroyed (every half destroyed), by any cause. No candidate → no pick, no VP. |

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| AST-5.1 | Send in the Next Wave (Strategic Ploy) | 1 | Reinforcements step of your Movement phase (engine `movement.end`, own turn — the active player's window inside the reinforcements step) | one **destroyed** CADIAN SHOCK TROOPS unit of yours | Create a new unit identical to the destroyed one (same datasheet, same per-model loadouts) at its original Starting Strength, with full wounds and fresh ids; set it up wholly within 9" of your battlefield edge and not within Engagement Range of any enemy unit. It counts as having arrived as reinforcements this turn (R-5.12: no further move this phase; may shoot and charge). It is legal in round 1 (it is not a Reserves arrival). The destroyed original stays destroyed and may be targeted again in a later turn **[interp: RAW has no restriction; logged]**. Not offered if no legal set-up exists. |
| AST-5.2 | Bring It Down (Battle Tactic) | 1 | your Shooting phase: `shooting.start` or `shooting.attacksResolved` (between units), own turn | any number of your ASTRA MILITARUM units + one enemy unit | Until the end of the phase, attacks by models of the selected units that target that enemy unit may re-roll the hit roll. The engine treats the target as "one enemy unit" and applies the re-roll to attacks by every ASTRA MILITARUM unit of yours that was not Battle-shocked when the Stratagem was used (R-11.2: a Battle-shocked unit cannot be affected by your Stratagems, so it cannot be a selected unit; for an attached unit, neither half may be Battle-shocked). A unit that becomes Battle-shocked later in the phase keeps the re-roll; a unit that was Battle-shocked at use time never gets it. |
| AST-5.3 | Artillery Strike (Strategic Ploy) | 2 | start of the opponent's Command phase (`command.start`, reactive) | one OFFICER **model** of yours on the battlefield | Until the end of that turn, for every enemy unit (board or arriving from Reserves): Move characteristic halved, Advance rolls halved, cannot declare a charge, and −1 to the hit roll of every ranged attack its models make. Halving rounds up and is applied before additive modifiers **[interp: core halving convention; logged]**. Once per battle. |

## 6. Datasheets

| Unit | Model | Base | M | T | Sv | Inv | W | Ld | OC | Keywords (all models) | Model-only keywords |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Command Squad Karsk | Karsk (Cadian Commander) | 28 mm | 6 | 3 | 5+ | — | 3 | 7+ | 1 | INFANTRY, IMPERIUM, CADIAN, COMMAND SQUAD | CHARACTER, OFFICER, KARSK |
| Command Squad Karsk | Cadian Veteran Guardsman ×4 | 28 mm | 6 | 3 | 5+ | — | 1 | 7+ | 1 | (same) | — |
| Cadian Shock Troops | Shock Trooper / Sergeant | 25 mm | 6 | 3 | 5+ | — | 1 | 7+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, REGIMENT, PLATOON, CADIAN, CADIAN SHOCK TROOPS | — |
| Field Ordnance Battery | gun + crew | 100 mm | 4 | 5 | 4+ | — | 6 | 7+ | 2 | INFANTRY, ARTILLERY, IMPERIUM, REGIMENT, FIELD ORDNANCE BATTERY | — |
| Armoured Sentinels | Armoured Sentinel | 80 mm | 8 | 8 | 2+ | — | 7 | 7+ | 2 | VEHICLE, WALKER, IMPERIUM, REGIMENT, SQUADRON, SMOKE, ARMOURED SENTINELS | — |

No invulnerable save and no Damaged profile on any datasheet.

Abilities:

| Id | Unit | Ability |
|---|---|---|
| AST-6.1 | Command Squad Karsk | Core: Leader → Cadian Shock Troops (the whole squad attaches). Faction: Voice of Command. Orders: the OFFICER issues 1 Order to a REGIMENT unit. In an attached unit, attacks may be allocated to the veterans (not CHARACTER) but not to Karsk while a Shock Trooper lives (R-10.1, per-model keyword). |
| AST-6.2 | Command Squad Karsk | Medi-pack (wargear): while its bearer lives, the bearer's unit (attached unit included) has Feel No Pain 6+. |
| AST-6.3 | Command Squad Karsk | Regimental Standard (wargear): while its bearer lives, +1 OC to every model of the bearer's unit (attached unit included). |
| AST-6.4 | Cadian Shock Troops | No abilities. The vox-caster has no rule effect in this patrol (figure only). |
| AST-6.5 | Field Ordnance Battery | Rearm, Reload, Fire: while the unit is affected by an Order and it Remained Stationary this turn, its Heavy weapons gain [SUSTAINED HITS 1]. (Not in the opponent's turn — the unit did not Remain Stationary that turn.) |
| AST-6.6 | Field Ordnance Battery | Patrol Squads (CP-1.8): at the start of Declare Battle Formations, before any unit is set up, the unit may be split into two units of one model each (Starting Strength 1 each). |
| AST-6.7 | Armoured Sentinels | Core: Deadly Demise 1. Mobile Hunter-killers: attacks by this unit that target a MONSTER or VEHICLE unit may re-roll the wound roll. |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Command Squad Karsk | Karsk | plasma pistol (2 profiles) | power weapon |
| Command Squad Karsk | Veteran (fist) | bolt pistol | power fist |
| Command Squad Karsk | Veteran ×3 (plain / medic / standard) | lasgun | close combat weapon (Command Squad profile) |
| Cadian Shock Troops (`shock-a`) | Sergeant | laspistol | chainsword |
| Cadian Shock Troops (`shock-a`) | ×7 / flamer ×1 / meltagun ×1 | lasgun / flamer / meltagun | close combat weapon (Shock Troops profile) |
| Cadian Shock Troops (`shock-b`) | Sergeant | drum-fed autogun | close combat weapon |
| Cadian Shock Troops (`shock-b`) | ×6 + vox ×1 / grenade launcher ×1 / plasma ×1 | lasgun / grenade launcher (2 profiles) / plasma gun (2 profiles) | close combat weapon |
| Field Ordnance Battery | gun 1 / gun 2 | bombast field gun / malleus rocket launcher; both also lasgun, laspistol | battery close combat weapons |
| Armoured Sentinels | Sentinel | hunter-killer missile, plasma cannon (2 profiles) | close combat weapon (Sentinel profile) |

Weapon profiles (Karsk's profiles equal the veterans'; nothing in the box has BS/WS 3+):
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| bolt pistol | 12" | 1 | 4+ | 4 | 0 | 1 | Pistol |
| lasgun | 24" | 1 | 4+ | 3 | 0 | 1 | Rapid Fire 1 |
| laspistol | 12" | 1 | 4+ | 3 | 0 | 1 | Pistol |
| plasma pistol — standard | 12" | 1 | 4+ | 7 | −2 | 1 | Pistol |
| plasma pistol — supercharge | 12" | 1 | 4+ | 8 | −3 | 2 | Pistol, Hazardous |
| drum-fed autogun | 24" | 2 | 4+ | 3 | 0 | 1 | — |
| flamer | 12" | D6 | n/a | 4 | 0 | 1 | Torrent, Ignores Cover |
| grenade launcher — frag | 24" | D3 | 4+ | 4 | 0 | 1 | Blast |
| grenade launcher — krak | 24" | 1 | 4+ | 9 | −2 | D3 | — |
| meltagun | 12" | 1 | 4+ | 9 | −4 | D6 | Melta 2 |
| plasma gun — standard | 24" | 1 | 4+ | 7 | −2 | 1 | Rapid Fire 1 |
| plasma gun — supercharge | 24" | 1 | 4+ | 8 | −3 | 2 | Rapid Fire 1, Hazardous |
| bombast field gun | 48" | D6 | 5+ | 7 | −1 | 2 | Blast, Heavy, Indirect Fire |
| malleus rocket launcher | 48" | D6+6 | 5+ | 6 | −1 | 1 | Blast, Heavy |
| hunter-killer missile | 48" | 1 | 4+ | 14 | −3 | D6 | One Shot |
| plasma cannon — standard | 36" | D3 | 4+ | 7 | −2 | 1 | Blast |
| plasma cannon — supercharge | 36" | D3 | 4+ | 8 | −3 | 2 | Blast, Hazardous |
| power weapon | melee | 3 | 4+ | 4 | −2 | 1 | — |
| power fist | melee | 3 | 4+ | 6 | −2 | 2 | — |
| close combat weapon (Command Squad) | melee | 2 | 4+ | 3 | 0 | 1 | — |
| chainsword | melee | 3 | 4+ | 3 | 0 | 1 | — |
| close combat weapon (Shock Troops) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| battery close combat weapons | melee | 3 | 4+ | 3 | 0 | 1 | — |
| close combat weapon (Sentinel) | melee | 2 | 4+ | 6 | 0 | 1 | — |

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`); (c) = engine change beyond a code hook. Reused from earlier factions:
`effects.grant` with `scope:{who:'attacker'}` held by the enemy unit (Resonant Focus), `missionHook` + `PICK_CODES`
picks (Stomp 'Em, Treasures of Aeons), `whollyWithinPolygon` (Reclaim and Dominate), `Unit.destroyedModels` snapshots
(Necrons, for cloning loadouts), `autoDeployPlacements` (setup), `raiseArrivalDecision` + `pushReaction` (Rapid Ingress),
`chooseOption` topic `abilityChoice`, `rerollOffer` (R-6.24). No new decision kinds or topics are needed.

| Rule | Enc. | Encoding |
|---|---|---|
| Voice of Command — issuing (AST-2.1–2.3) | (b) | `voiceOfCommand` — ability `am.a.voice-of-command` on Command Squad Karsk: `{trigger:'commandPhase', code:'voiceOfCommand', params:{pickWindow:'command.end', officerKeyword:'OFFICER', ordersPerOfficer:1, eligibleKeyword:'REGIMENT', range:6, orderIds:['am.order.move-move-move','am.order.take-aim','am.order.take-cover']}}`. `pick.window:'command.end'`, `topic:'abilityChoice'`. `offer`: active player only; for each own board model whose `modelKeywordsOf` has OFFICER and whose unit (or attached partner) carries this ability, while marks `order:<round>:<modelId>:<n>` < ordersPerOfficer: options = `<orderId>@<canonicalUnitId>` for each canonical friendly board unit with `eligibleKeyword` on either half and any model within `range` of the officer model, plus `decline`; if the officer bears an enhancement whose code is `commandLaurels`, options = one per order (`<orderId>@all`) plus `decline`. `handle`: for each target canonical unit (all friendly board units with faction keyword `params.allKeyword` of the Laurels ability for `@all`), remove from both halves every ActiveEffect whose `sourceAbilityId` ∈ `orderIds` (emit `EffectExpired`), then `effects.grant(ctx, unitId, asList(order.effect), {sourceAbilityId: orderId, sourceUnitId: officerUnitId, scope:{who:'self'}, duration:'untilNextTurn', when:null})`; push the mark; emit `AbilityTriggered` ("Take Aim! → Shock Troops"); re-offer while orders remain. Expiry `nextOwnTurn` = start of the next own turn, i.e. before the next Command phase (AST-2.3). |
| Order effects (AST-2.5) | (a) + (c)C6 | three ability records (`trigger:'always'`, never on a datasheet, only granted): `am.order.move-move-move` `{modifyStat:{stat:'M', value:3}}`; `am.order.take-aim` `{when:{weaponType:'ranged'}, modifyStat:{stat:'BS', value:-1}}` (BS is stored as the target number, so −1 = improve); `am.order.take-cover` `{modifyStat:{stat:'Sv', value:-1, cap:3}}` — `cap` is new (C6; ActiveEffects skip code gates in `hooks-impl gateOpen`, so the 3+ floor cannot be a gate hook). All three carry `params:{order:true, endsOnBattleShock:true}`. |
| Order ends on battle-shock (AST-2.4) | (c)C7 | `hooks-impl.ts battleShockTest`: after setting `battleShocked = true` on the halves, remove every ActiveEffect on those halves whose source ability has `params.endsOnBattleShock === true`, emitting `EffectExpired` per effect. Non-frozen. |
| Command Laurels (AST-3.1) | (a) + (b) | enhancement effect `{trigger:'commandPhase', when:{ownTurn:true}, effect:{cp:1}, scope:{who:'bearer'}, code:'commandLaurels', params:{allKeyword:'ASTRA MILITARUM'}}`. `commandLaurels` = marker hook (no gate, `run: noop`) read by `voiceOfCommand` to switch to all-units mode. CP via `hookService.gainCp` (R-4.2 cap). |
| Gunnery Officer CP (AST-3.2) | (a) + (b) | enhancement effect `{trigger:'commandPhase', when:{ownTurn:true}, effect:{cp:1}, scope:{who:'bearer'}, code:'gunneryOfficer', params:{auraRange:6, auraKeyword:'ARTILLERY'}}` (no gate: CP always applies while the bearer is on the board). |
| Gunnery Officer re-roll attacks (AST-3.2a) | (b) + (c)C4 | `gunneryOfficer.rerollsAttackCount(state, entry, attackerModelId, weapon)`: true iff the bearer model is on the board and the attacker's unit has `auraKeyword`, belongs to the bearer's player and has a model within `auraRange` of any model of the bearer's (canonical) unit. Engine (C4): `attack.ts`, after the `attacks:<group>` roll, calls `hookService.attackCountRerollSource(...)`; non-null → raise the existing `chooseOption` topic `rerollOffer` (data `{rollId, dieIndexes: all dice, purpose:'attacks', key}`); answer `reroll` → `ctx.reroll` with that source; the new result stands (a die is never re-rolled twice). |
| Gunnery Officer Lone Operative (AST-3.2b) | (b) + (c)C5 | `gunneryOfficer.grantsCoreAbility(state, entry, unitId)`: returns `['LONE_OPERATIVE']` iff the aura condition above holds for `unitId` and `!modelHasAttacked(state, m)` for every model of it, else `[]`. Engine (C5): `shooting.ts isLoneOperative` (and any other LONE_OPERATIVE reader) uses `hookService.hasCoreAbility(state, unitId, 'LONE_OPERATIVE')`; `attack.ts` calls `recordModelAttacked(state, modelId)` once a model's attack count for a weapon resolves to ≥ 1 (shooting, Overwatch, melee). |
| Hold the Line (AST-4.1) | (b) | secondary `scoring:[{when:'turn.end', who:'opponent', rounds:{from:1,to:5}, rule:'custom', code:'holdTheLine', pointsPer:3, params:{fullPoints:5, buffer:6}}]`; `holdTheLine` = `missionHook('holdTheLine','onTurnEnd')` + amount fn in `missions.ts`: enemy = active player; consider enemy canonical board units not `battleShocked`; zone = `deploymentZone(s, pid)`; if none has every model `whollyWithinOfPolygon(m, zone, 6)` → 5; else if none has every model `whollyWithinPolygon(m, zone)` → 3; else 0. New pure helper `whollyWithinOfPolygon` in `geometry.ts` (signature in §7.1). |
| Methodical Destruction (AST-4.2) | (b) | `methodicalDestructionPick` (mission hook, `when:'round.start'`, `rounds:{from:1,to:5}`, added to `PICK_CODES`): `offerChoice` topic `abilityChoice` over canonical enemy units with ≥ 1 half not `destroyed` (Reserves included); stores `secondaryState.methodicalTarget = {halves: UnitId[], round}`. `methodicalDestructionScore` (`when:'round.end'`, `rule:'custom'`, `pointsPer:4`): 4 if the stored round = current round and every stored half has `location === 'destroyed'`; then clears the state. (Stomp 'Em's pick is not reused: it lists halves separately and its score requires a melee kill by the owner.) |
| Send in the Next Wave (AST-5.1) | (b) + (c)C3 | stratagem `{cost:1, window:'movement.end', who:'active', targets:[{role:'unit', owner:'friendly', filter:{keyword:'CADIAN SHOCK TROOPS'}}], code:'sendInTheNextWave'}`. Hook: `destroyedTargets: true` (candidates = own units with `location === 'destroyed'` matching the filter); `check`: `autoDeployPlacements(clonedModels, battlefieldEdgeStrip(board, deploymentZone(s, player), 9), friendly, enemies)` is non-null with no model in Engagement Range of an enemy; `apply`: `const u = spawnUnitCopy(ctx, tuple.ids[0])` then `pushReaction(ctx, {kind:'nextWave', stratagemId, player, unitId: u.id, enemyUnitId:null, window, distance:null})`. Engine (C3): `movement.ts doReinforcementsStep` consumes `nextWave` reactions after Rapid Ingress and raises the arrival `deployUnit` decision with `zone = battlefieldEdgeStrip(...)` and coherency required, rejecting any model within Engagement Range of an enemy (instead of the 9" Deep Strike gap); on placement: `location:'board'`, `turn.arrivedThisTurn = true`, emit `ReinforcementsArrived{via:'nextWave'}` (spawn already emitted `UnitDeployed{toReserves:true}`), then the opponent's `movement.reinforcements` window (Fire Overwatch) as for other arrivals. The spawned unit bypasses CP-1.9 (round-1 ban, round-3 cull) because it never waits in Reserves past the decision. |
| Bring It Down (AST-5.2) | (a) + (b) | stratagem `{cost:1, window:['shooting.start','shooting.attacksResolved'], who:'active', targets:[{role:'unit', owner:'enemy'}], effect:{reroll:'all'}, when:{attackerKeyword:'ASTRA MILITARUM'}, scope:{who:'attacker'}, duration:'untilEndOfPhase', code:'bringItDown'}`. `stratagems.ts` grants `effect` to `targets[0]` with the stratagem's `scope`/`when`, so the enemy unit holds the re-roll and it applies to attacks targeting it. A declarative `effect:{reroll}` on a stratagem has `trigger: null`, and `hooks-impl.ts keyApplies` (`case 'reroll'`) only fires it when `triggerHook(entry) === hook` or `(entry.trigger === null && !!spec?.hooks)`, so a code hook that lists its hooks is mandatory (same pattern as the `veteranInstincts` stratagem hook; NOT the Resonant Focus mechanism, which is an enhancement ability with `trigger:'hitRoll'`). `bringItDown` = `{kind:'stratagem', hook:'onHitRoll', hooks:['onHitRoll'], run: noop}`; it only makes `keyApplies` true. Battle-shock gate: at use time (`apply`) snapshot the ids of friendly ASTRA MILITARUM canonical units with no half `battleShocked` into the effect params (`params:{eligibleUnitIds:[...]}`); the re-roll applies only when the attacker's canonical unit id is in that list (alternatively gate per attack on the attacker not being Battle-shocked at use time; the snapshot is preferred). |
| Artillery Strike (AST-5.3) | (b) + (c)C1 + (c)C6 | stratagem `{cost:2, window:'command.start', who:'reactive', limit:'oncePerBattle', targets:[{role:'model', owner:'friendly', filter:{keyword:'OFFICER'}}], code:'artilleryStrike'}` (model filter uses `modelKeywordsOf`, C1); hook `grantsItself: true`. `artilleryStrike.apply`: for every unit of the opponent with `location` `board` or `reserves`, `effects.grant(ctx, unitId, [{when:{weaponType:'ranged'}, modifyRoll:{roll:'hit', value:-1}}, {halveStat:'M'}, {halveRoll:'advance'}, {forbid:'charge'}], {sourceAbilityId: stratagemId, sourceUnitId: officerUnitId, scope:{who:'self'}, duration:'untilEndOfTurn', when:null})`. The three new Effect keys are C6. |
| Rearm, Reload, Fire (AST-6.5) | (a) + (b) | ability `{trigger:'always', when:{unitStationary:true}, effect:{when:{weaponAbility:'HEAVY'}, grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}, code:'requireActiveOrder'}`; `requireActiveOrder.gate(state, holder)`: true iff the holder or its attached partner has an ActiveEffect whose source ability has `params.order === true`. |
| Patrol Squads (AST-6.6) | (c)C2 | datasheet `patrolSquads:{unitSizes:[1,1]}`; setup choice `PlayerSetup.splitUnits` (frozen types.ts, additive); `createGameState` builds the split units. |
| Medi-pack (AST-6.2) | (a) + (b) | ability `{trigger:'always', effect:{feelNoPain:'6+'}, scope:{who:'self'}, code:'wargearBearerAlive', params:{modelId:'veteran-medic'}}`; `wargearBearerAlive.gate(state, holder, entry)`: true iff a model with `datasheetModelId === params.modelId` is alive in the entry's own unit (the Command Squad half). |
| Regimental Standard (AST-6.3) | (a) + (b) | `{trigger:'always', effect:{modifyStat:{stat:'OC', value:1}}, scope:{who:'self'}, code:'wargearBearerAlive', params:{modelId:'veteran-standard'}}` |
| Karsk-only CHARACTER/OFFICER, multi-model Leader (AST-6.1, AST-3.0) | (a) + (c)C1 | datasheet `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['am.cadian-shock-troops']`, patrol `attachTo:'shock-a'`; composition `karsk` (first, `champion:true`, `statsOverride:{W:3}`, `keywords:['CHARACTER','OFFICER','KARSK']`), `veteran` ×2 (fist / lasgun via patrol wargear), `veteran-medic` ×1, `veteran-standard` ×1. C1 makes allocation, Precision, Hazardous casualty choice, Epic Challenge, model-role stratagem targets and the enhancement bearer use per-model keywords. |
| Mobile Hunter-killers (AST-6.7) | (a) | `{trigger:'woundRoll', when:{targetKeyword:['MONSTER','VEHICLE']}, effect:{reroll:'all'}}` |
| Deadly Demise 1 | (a) | `coreAbilities:[{ability:'DEADLY_DEMISE', value:1}]` |
| Weapon abilities | (a) | `PISTOL`, `RAPID_FIRE` 1, `HAZARDOUS`, `TORRENT`, `IGNORES_COVER`, `BLAST`, `MELTA` 2, `HEAVY`, `INDIRECT_FIRE`, `ONE_SHOT`; two-profile weapons via `profileGroup` (plasma pistol, plasma gun, plasma cannon, grenade launcher) |
| Keywords SMOKE, VEHICLE, INFANTRY | (a) | core stratagems Smokescreen / Tank Shock / Go to Ground become legal by keyword (existing data) |
| BATTLELINE, PLATOON, SQUADRON, WALKER, CADIAN, ARTILLERY | (a) | plain keywords (ARTILLERY is read by Gunnery Officer) |

### 7.1 Engine changes (c) — exact signatures

The hooks above are written against these before they exist; the engine agent implements them in parallel.

```ts
// C1 per-model keywords — src/data/types.ts (not frozen) + docs/spec/schemas datasheet schema
export interface Composition { /* … */ keywords?: Keyword[] }          // model-only keywords, added to the datasheet's
// src/engine/state.ts
export function modelKeywordsOf(state: GameState, modelId: ModelId): string[]   // datasheet keywords + faction keywords + the model's composition keywords
export function keywordsOf(state: GameState, unitId: UnitId): string[]         // CHANGED semantics: ∪ over the unit's living models' modelKeywordsOf (datasheet-wide union when it has no models)
// switched to modelKeywordsOf: leaders.ts allocationPool (CHARACTER test), attack.ts precision pool + hazardous pool,
// stratagems.ts target filter for role 'model', enhancements.ts bearerModelId (first model whose modelKeywordsOf has CHARACTER, else models[0])

// C2 Patrol Squads — src/data/types.ts
export interface DatasheetData { /* … */ patrolSquads?: { unitSizes: number[] } }
// src/engine/types.ts  (FROZEN — additive optional field; matching 00-architecture edit required)
export interface PlayerSetup { /* … */ splitUnits?: string[] }                 // patrol unit refs the player splits
// createGameState: a split unit keeps id `${player}:${ref}` with its first unitSizes[0] models; each further part gets
// ref `${ref}-${k}` (k = 2, 3, …), id unitIdFor(player, `${ref}-${k}`), startingStrength = its size. createGame throws
// EngineInvariantError if a split ref has no patrolSquads or appears in attachments.

// C3 unit spawning (Send in the Next Wave)
// src/engine/state.ts
export function spawnUnitCopy(ctx: EngineContext, sourceUnitId: UnitId): Unit
//   new id `${sourceUnitId}~${n}` (n = 1 + count of existing ids with that prefix), ref `${ref}~${n}`, same player /
//   datasheetId / name; models rebuilt from source.destroyedModels (+ any living models) keeping datasheetModelId,
//   weapons, base, height; woundsRemaining = profile W; oneShotUsed []; ids modelIdFor(newId, i);
//   startingStrength = source.startingStrength; location 'reserves'; no leader link, enhancement or warlord flag;
//   emits UnitDeployed { unitId, toReserves: true }
// src/engine/geometry.ts
export function battlefieldEdgeStrip(board: Pick<Board, 'w' | 'h'>, zone: Polygon, depth: number): Polygon
//   board-perimeter segments lying on the zone boundary = "your battlefield edge"; returns the part of the board within
//   `depth` of the longest such side (one battlefield edge per player: a rectangle; a corner zone yields its longest side, not an L, RC AM-16)
// src/engine/code-hooks.ts (not frozen)
export interface ReactionRequest { kind: ReactionKind | 'surge' | 'nextWave'; /* … */ }
export interface EngineCodeHook { /* … */ destroyedTargets?: boolean }      // friendly candidates come from destroyed units
// src/engine/events.ts  (FROZEN — additive union member; matching 00-architecture edit required)
export interface ReinforcementsArrived extends EventBase { type: 'ReinforcementsArrived'; unitId: UnitId; via: 'deepStrike' | 'strategicReserves' | 'rapidIngress' | 'nextWave' }

// C4 attack-count re-roll — src/engine/hooks-impl.ts HookService
attackCountRerollSource(state: GameState, attackerModelId: ModelId, weapon: RuntimeWeapon): string | null   // ability id or null
// src/engine/code-hooks.ts EngineCodeHook
rerollsAttackCount?(state: GameState, entry: HookSourceEntry, attackerModelId: ModelId, weapon: RuntimeWeapon): boolean

// C5 dynamic core abilities + attack history
// src/engine/hooks-impl.ts HookService
hasCoreAbility(state: GameState, unitId: UnitId, ability: CoreAbility['ability']): boolean   // datasheet coreAbilities ∪ grantsCoreAbility answers
// src/engine/code-hooks.ts EngineCodeHook
grantsCoreAbility?(state: GameState, entry: HookSourceEntry, unitId: UnitId): CoreAbility['ability'][]
// src/engine/state.ts — stored in state.mission.custom.attackedModelIds: ModelId[] (frozen type unchanged)
export function recordModelAttacked(state: GameState, modelId: ModelId): void
export function modelHasAttacked(state: GameState, modelId: ModelId): boolean

// C6 Effect extensions — src/data/types.ts Effect (not frozen) + effect schema + hooks-impl resultFor/statFor
modifyStat?: { stat: StatName; value: number; cap?: number }   // cap: this modifier never takes the stat past `cap`
//   (for Sv/BS/WS/Ld "past" = lower than cap; else higher); value already at/past cap → contributes 0
halveStat?: StatName                 // statFor: (set ?? base) halved, rounded up, before additive deltas
halveRoll?: 'advance'                // movement.ts: advanceRoll = hookService.advanceRollFor(state, unitId, rolled)
forbid?: 'charge'                    // charge.ts canDeclareCharge: false when hookService.chargeForbidden(state, unitId)
// src/engine/hooks-impl.ts HookService
advanceRollFor(state: GameState, unitId: UnitId, rolled: number): number    // ceil(rolled/2) if halveRoll:'advance' active, then onAdvanceRoll modifiers
chargeForbidden(state: GameState, unitId: UnitId): boolean

// C7 effects ending on battle-shock — hooks-impl.ts battleShockTest (no new signature)

// pure geometry helper used by holdTheLine (b) — src/engine/geometry.ts
export function whollyWithinOfPolygon(m: Footprint, poly: Polygon, n: number): boolean   // every base edge point inside poly or ≤ n from its boundary
```

Totals: **11 new code hooks** (`voiceOfCommand`, `commandLaurels`, `gunneryOfficer`, `requireActiveOrder`,
`wargearBearerAlive`, `holdTheLine`, `methodicalDestructionPick`, `methodicalDestructionScore`, `sendInTheNextWave`,
`artilleryStrike`, `bringItDown`); **7 engine changes** (C1–C7). Frozen contracts touched: `types.ts` (`PlayerSetup.splitUnits?`, C2)
and `events.ts` (`ReinforcementsArrived.via` + `'nextWave'`, C3) — both additive; no `actions.ts`, `hooks.ts`, `rng.ts`,
`decider.ts` or `index.ts` change. Matching `docs/spec/00-architecture.md` edit required for the two frozen changes.

## 8. Test IDs

Same list as the `AST` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| AST-001 | AST-1 | patrol loads: 5 units, 28 models; Karsk unit is WARLORD with Command Laurels borne by the Karsk model and attached to `shock-a`; default secondary Hold the Line; Sentinel can use Smokescreen, no unit can use Grenade |
| AST-002 | AST-2.1 | own `command.end`: Order offered for REGIMENT units within 6" of Karsk only; never in the opponent's Command phase |
| AST-003 | AST-2.1 | Karsk model destroyed, veterans alive → no Order offered |
| AST-004 | AST-2.5 | Take Aim!: lasgun hits on 3+ (was 4+) until the start of own next turn, then 4+ again |
| AST-005 | AST-2.5 | Move! Move! Move!: M 6 → 9; an Advance adds its roll on top |
| AST-006 | AST-2.5 | Take Cover!: Shock Troops 5+ → 4+, Battery 4+ → 3+, Sentinel 2+ stays 2+, a 3+ model stays 3+ |
| AST-007 | AST-2.3 | a second Order issued to an ordered unit replaces the first (`EffectExpired` for the old one) |
| AST-008 | AST-2.4 | ordered unit fails a battle-shock test → Order removed at once (save/BS back to datasheet value) |
| AST-009 | AST-2.4 | Order issued at `command.end` to a unit that failed battle-shock earlier that phase still applies |
| AST-010 | AST-2.2 | unattached Command Squad Karsk is not an eligible target; attached Karsk + Shock Troops is (Karsk's own models gain the Order) |
| AST-011 | AST-3.1 | Command Laurels: +1 CP in own Command phase while Karsk is on the board; discarded when the R-4.2 cap is already used; none after Karsk dies |
| AST-012 | AST-3.1 | Command Laurels: one Order reaches every friendly AM unit on the board (Sentinel 30" away, unattached Command Squad included) |
| AST-013 | AST-3.0 | enhancement bearer is the Karsk model: veterans alive and Karsk dead → no Laurels CP, no Gunnery aura |
| AST-014 | AST-3.2 | Gunnery Officer: Battery within 6" of Karsk's unit → re-roll offered for the bombast D6 and for the D6 of malleus D6+6; beyond 6" → not offered |
| AST-015 | AST-3.2 | Gunnery Officer: Battery in aura and never attacked → enemy ranged attacker 13" away cannot target it, 11" away can |
| AST-016 | AST-3.2 | Gunnery Officer Lone Operative lost after the Battery model has made any attack (incl. Overwatch) or when the aura breaks |
| AST-017 | AST-3.2 | Gunnery Officer: +1 CP; Orders limited to 1 unit within 6" (no Laurels broadcast) |
| AST-018 | AST-4.1 | Hold the Line at end of opponent's turn: no enemy wholly within 6" of own DZ → 5 VP; one enemy wholly within 6" but not wholly in DZ → 3 VP; enemy wholly in DZ → 0 VP |
| AST-019 | AST-4.1 | Hold the Line ignores Battle-shocked enemies and units with one model outside the region; never scored at the end of own turn |
| AST-020 | AST-4.2 | Methodical Destruction: round-start pick lists canonical enemy units (attached pair once, Reserves included); target destroyed that round by any cause → 4 VP at round end; survives → 0 |
| AST-021 | AST-4.2 | Methodical Destruction on an attached pair: only the bodyguard destroyed → 0 VP; both halves → 4 VP |
| AST-022 | AST-5.1 | Send in the Next Wave: offered in own Movement phase only when a CADIAN SHOCK TROOPS unit is destroyed; new unit has 10 models with the original per-model loadouts (sergeant chainsword, flamer, meltagun), full wounds, new ids |
| AST-023 | AST-5.1 | Next Wave placement: outside the 9" edge strip or within Engagement Range is rejected; new unit counts as arrived (no further move; may shoot); opponent gets the Fire Overwatch window |
| AST-024 | AST-5.1 | Next Wave usable in round 1; the same destroyed unit may be targeted again in a later turn; never offered for Command Squad Karsk or the Battery |
| AST-025 | AST-5.2 | Bring It Down: AM attacks against the chosen enemy re-roll hit rolls (fails auto, successes offered); attacks against other units do not; ends at phase end |
| AST-026 | AST-5.3 | Artillery Strike at the opponent's `command.start`: that turn enemy M 6 → 3 and 5 → 3, Advance 5 → 3, no charge declarations, ranged hit −1 (melee unaffected); all gone at turn end |
| AST-027 | AST-5.3 | Artillery Strike: once per battle; costs 2 CP; not offered in own turn or with no OFFICER model on the board; applies to a unit arriving from Reserves that turn |
| AST-028 | AST-6.5 | Rearm, Reload, Fire: Battery with an Order and Remained Stationary → bombast/malleus Sustained Hits 1; moved, or no Order → none; lasgun never; Overwatch in the opponent's turn → none |
| AST-029 | AST-6.6 | Patrol Squads: split → two 1-model Battery units (ids `…:battery`, `…:battery-2`, SS 1 each); unsplit → one 2-model unit |
| AST-030 | AST-6.2 | Medi-pack: Karsk's attached unit has FNP 6+ while the medic lives; medic destroyed → no FNP |
| AST-031 | AST-6.3 | Regimental Standard: Shock Troops OC 3, veterans/Karsk OC 2 while the bearer lives; bearer destroyed → base OC |
| AST-032 | AST-6.1 | allocation into attached Karsk + Shock Troops: veterans and troopers allocatable, Karsk not while a Shock Trooper lives |
| AST-033 | AST-6.1 | Precision / Epic Challenge pick only Karsk among the Command Squad; Artillery Strike target list = Karsk model only |
| AST-034 | AST-6.7 | Mobile Hunter-killers: Sentinel wound re-roll vs VEHICLE/MONSTER targets, none vs INFANTRY |
| AST-035 | AST-6.7 | Sentinel: hunter-killer One Shot; plasma cannon supercharge Hazardous; Deadly Demise 1 on destruction |
| AST-036 | AST-6 | weapons: meltagun +2 D at half range; frag Blast vs 10 models +2 attacks; bombast Indirect Fire at a non-visible target; flamer Torrent ignores cover; lasgun Rapid Fire 1 |
| AST-037 | AST-6.6 | Gunnery Officer + split Battery: each 1-model unit is tested separately for the aura and Lone Operative |
| AST-038 | AST-2.5 | Take Aim! has no effect on Torrent weapons or melee WS |
| AST-039 | AST-2.3 | Orders expire at the start of own next turn even when no new Order is issued |
| AST-040 | AST-5.1 | Next Wave not offered when no legal set-up exists in the strip (all positions in ER / blocked) |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, artillery and walkers compressed); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `karsk-commander` | `am.command-squad-karsk/karsk` | 1 | 1.15 | 28 mm | A chibi human officer in a long olive-drab greatcoat and peaked cap with a big square chin, brass buttons and a red sash, pointing a chunky glowing-blue pistol forward and holding a short broad sword. |
| `cadian-veteran-fist` | `am.command-squad-karsk/veteran` (fist) | 1 | 1.1 | 28 mm | A chibi helmeted soldier in tan fatigues and olive flak plates with an oversized grey armoured gauntlet on one arm and a small pistol in the other hand. |
| `cadian-veteran-lasgun` | `am.command-squad-karsk/veteran` | 1 | 1.1 | 28 mm | A chibi helmeted soldier in tan fatigues and olive flak plates holding a long boxy brown rifle across the chest, goggles pushed up on the helmet. |
| `cadian-veteran-medic` | `am.command-squad-karsk/veteran-medic` | 1 | 1.1 | 28 mm | The same chibi soldier with the rifle slung, a white armband and a white shoulder satchel, holding up a chunky injector tool. |
| `cadian-veteran-standard` | `am.command-squad-karsk/veteran-standard` | 1 | 1.1 | 28 mm | The same chibi soldier carrying a tall pole with a square dark-green banner edged in gold, rifle slung on the back. |
| `shock-sergeant-chainsword` | `am.cadian-shock-troops/sergeant` (shock-a) | 1 | 1.1 | 25 mm | A chibi helmeted squad leader in olive armour with a small pistol raised and a toothed motor-blade sword, a red stripe across the helmet. |
| `shock-sergeant-autogun` | `am.cadian-shock-troops/sergeant` (shock-b) | 1 | 1.1 | 25 mm | The same chibi squad leader cradling a stubby rifle with a big round drum magazine underneath. |
| `shock-trooper-lasgun` | `am.cadian-shock-troops/trooper` | 13 | 1.1 | 25 mm | A chibi round-helmeted infantryman in olive flak armour and tan trousers aiming a long boxy brown rifle. |
| `shock-trooper-vox` | `am.cadian-shock-troops/trooper` (vox) | 1 | 1.1 | 25 mm | The lasgun trooper with a big boxy radio backpack and a tall whip antenna, holding a handset to one ear. |
| `shock-trooper-flamer` | `am.cadian-shock-troops/trooper` (flamer) | 1 | 1.1 | 25 mm | The chibi trooper with a fat short-nozzled weapon and twin fuel canisters on the back, a tiny pilot flame at the tip. |
| `shock-trooper-melta` | `am.cadian-shock-troops/trooper` (meltagun) | 1 | 1.1 | 25 mm | The chibi trooper with a stubby wide-muzzled heat gun glowing orange, held at the hip. |
| `shock-trooper-grenade` | `am.cadian-shock-troops/trooper` (grenade launcher) | 1 | 1.1 | 25 mm | The chibi trooper with a short fat-barrelled launcher and a bandolier of round shells across the chest. |
| `shock-trooper-plasma` | `am.cadian-shock-troops/trooper` (plasma gun) | 1 | 1.1 | 25 mm | The chibi trooper with a bulky rifle wrapped in coils glowing bright blue and a vented cylinder on top. |
| `ordnance-bombast` | `am.field-ordnance-battery/gun` (bombast) | 1 | 1.4 | 100 mm | A squat chibi wheeled field cannon in olive green with a thick short barrel tilted upward, a gun shield, and two tiny helmeted crew loading a fat shell. |
| `ordnance-malleus` | `am.field-ordnance-battery/gun` (malleus) | 1 | 1.4 | 100 mm | A chibi wheeled rack of stacked rocket tubes in olive green with red-tipped rockets, a gun shield, and two tiny helmeted crew aiming it. |
| `armoured-sentinel` | `am.armoured-sentinels/sentinel` | 1 | 2.6 | 80 mm | A chibi two-legged boxy walker in olive green with backward-bending legs, an enclosed armoured cab with a narrow visor slit, a fat glowing-blue cannon under the cab and a single rocket pod on top. |

## 10. Other Astra Militarum patrols (appendix)

None listed on wahapedia's Combat Patrol section as of 2026-10-03 (Karsk's Gunners, June 2023, is the only one).
