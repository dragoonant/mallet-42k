# Faction spec — T'au Empire: Protectors of Aun'shar

Own-words data spec for the T'au Empire Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `TAU-<section>.<n>`
are cited by the `TAU-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours. Data id prefix: `tau.` (faction id `tau-empire`, faction keyword `T'AU EMPIRE`).

## 0. Sources (accessed 2026-10-05)

| Source | URL | Version shown on page |
|---|---|---|
| T'au Empire box "Protectors of Aun'shar" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/protectors-of-aun-shar/ | Index, 10th ed, June 2023 |
| T'au Empire box "Sudden Dawn Cadre" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/sudden-dawn-cadre/ | Index, May 2024 |
| CP faction navigation (used to enumerate patrols) | menu on the patrol pages above | lists exactly these two T'au patrols |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Patrol selection: owner's choice is Protectors of Aun'shar (the original 2023 box), even though Sudden Dawn Cadre is
newer. Values were read through a summarising fetcher; anything it could not pin down is marked **[unconfirmed]**.

## 1. Roster

5 units, 16 models. Faction keyword T'AU EMPIRE on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `aunshar` | Aun'Shar | 1 | honour stave; hover drone | **WARLORD**, carries the enhancement. Not a Leader (operates alone). |
| `fireblade` | Shas'nel D'tano | 1 | Fireblade pulse rifle; close combat weapon | Leader → `strike-team` (default attachment) |
| `strike-team` | Strike Team | 10 | Shas'ui ×1: pulse carbine, pulse pistol, close combat weapon, support turret missile system (DS8, conditional), marker drone; Fire Warrior ×5: pulse rifle, pulse pistol, close combat weapon; Fire Warrior ×4: pulse carbine, pulse pistol, close combat weapon | bodyguard for the Fireblade |
| `stealth` | Stealth Battlesuits | 3 | Shas'vre ×1: fusion blaster, battlesuit fists, battlesuit support system (cosmetic, no rule), marker drone; Shas'ui ×2: burst cannon, battlesuit fists | — |
| `ghostkeel` | Ghostkeel Battlesuit | 1 | cyclic ion raker (2 profiles); twin fusion blaster; Ghostkeel fists; battlesuit support system | — |

No Patrol Squads ability on any datasheet (CP-1.8 does not apply).

## 2. Faction ability — For the Greater Good (every datasheet except Aun'Shar)

| Id | Rule |
|---|---|
| TAU-2.1 | In your own Shooting phase only, when you select a unit with this ability to shoot, and that unit is not an Observer this phase, you may name one *other* friendly unit with this ability that is itself eligible to shoot right now and is not Battle-shocked and not already an Observer this phase. Then pick one enemy unit that is visible to both units (at least one model of each can see it). Until the end of the phase the shooting unit is the **Guided** unit, the other is its **Observer**, and the enemy unit is the **Spotted** unit. |
| TAU-2.2 | Guided attacks against the Spotted unit: Ballistic Skill improved by 1 (a characteristic change, so it is not limited by the ±1 hit-roll cap and stacks with hit-roll modifiers such as Stealth). If the Observer has the MARKERLIGHT keyword, those attacks also have [IGNORES COVER]. |
| TAU-2.3 | Guided attacks against any other enemy unit: Ballistic Skill worsened by 1. |
| TAU-2.4 | One Observer per Guided unit; each unit can be an Observer at most once per phase; an Observer can never become a Guided unit in the same phase. Observing is not shooting: the Observer may still be selected to shoot later in the phase, but then without any pairing. |
| TAU-2.5 | "Eligible to shoot" for the Observer **[interpretation]**: the same test the engine uses to offer a unit for selection (on the board, not yet selected/shot this phase, not Advanced or Fallen Back unless an effect allows it, Engagement Range limits per R-6.2). Marker Drone (TAU-6.6) waives the Advanced restriction. |
| TAU-2.6 | The pairing is optional and made at selection, before targets are declared. Fire Overwatch and Laser-Marked Targets shooting is never Guided (it is not your Shooting phase). An attached unit (Fireblade + Strike Team) is one unit for all of this. |

## 3. Enhancements (Aun'Shar, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| DS13 Experimental Drone | default | Bearer gains Lone Operative and Stealth. Aura: while a friendly T'AU EMPIRE INFANTRY unit is within 6" of the bearer, its models improve their Save characteristic by 1 and have Feel No Pain 5+. The bearer's own unit is always in range (R-10.11), so Aun'Shar is Sv 4+, FNP 5+. |
| DS15 Experimental Drone | optional | Bearer gains Lone Operative and Stealth. Aura: while a friendly T'AU EMPIRE unit (any type) is within 6" of the bearer, ranged weapons of models in that unit have [LETHAL HITS]. |

Within 6" of the bearer = any model of the unit within 6" of the Aun'Shar model (R-10.11: applies once per unit).

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Kauyon Lure | default | at the end of your Command phase (`command.end`, `who: active`), battle rounds 2–5: 5 VP if at least one of your T'AU EMPIRE units that is not Battle-shocked is within your own deployment zone (any part of any model's base inside the zone). Flat 5 VP per qualifying Command phase, not per unit (max 20). Evaluated after the Battle-shock step. |
| Leadership Caste | optional | at the end of the battle (`battle.end`): 20 VP if your ETHEREAL model (Aun'Shar) is not destroyed. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Defensive Fusillade | 1 | battleTactic | your Shooting phase, between activations (`shooting.start`, `shooting.attacksResolved`) | one own T'AU EMPIRE unit not yet selected to shoot this phase | until end of phase, every ranged weapon of models in the unit has [PISTOL] (so it may shoot while in Engagement Range, at units it is engaged with, R-6.7) |
| Rapid Repositioning | 1 | strategicPloy | end of your Shooting phase (`phase.end`, phase = shooting) | one own T'AU EMPIRE unit not within Engagement Range of any enemy unit | the unit makes a Normal move of up to D6" — or up to 6" if it has the BATTLESUIT keyword (no roll). The unit cannot declare a charge this turn. |
| Laser-Marked Targets | 1 | strategicPloy | opponent's Charge phase, just after an enemy unit declares a charge (`charge.declared`), before the charge roll | one own T'AU EMPIRE unit that is a target of that charge and not within Engagement Range of any enemy unit | the unit shoots the charging unit as if it were your Shooting phase, but every ranged attack hits only on an unmodified 6 (regardless of BS and modifiers). Then, until end of phase, that enemy unit subtracts 2 from its Charge rolls. **Restriction:** the unit cannot shoot more than once this turn (no Laser-Marked Targets if it already fired Overwatch this turn, and no Overwatch afterwards). |

Core stratagems: all apply per 10-rules §11 subject to their own gates (Go to Ground: INFANTRY; Tank Shock: VEHICLE →
Ghostkeel; Grenade: no T'au datasheet here has GRENADES; Fire Overwatch: every unit except Aun'Shar, which has only a
melee weapon).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Aun'Shar | 1 | 25 mm | 6 (10 with hover drone) | 3 | 5+ | 5+ | 3 | 6+ | 1 | INFANTRY, CHARACTER, FLY, ETHEREAL, AUN'SHAR | Coordinated Leadership; Hover Drone. **No** For the Greater Good. (Lone Operative + Stealth come from either enhancement — see note) |
| Shas'nel D'tano | 1 | 25 mm | 6 | 3 | 4+ | — | 3 | 7+ | 1 | INFANTRY, CHARACTER, CADRE FIREBLADE, SHAS'NEL D'TANO | Leader → Strike Team; For the Greater Good; Volley Fire |
| Strike Team | 10 | 25 mm | 6 | 3 | 4+ | — | 1 | 7+ | 2 | INFANTRY, BATTLELINE, MARKERLIGHT, FIRE WARRIOR, STRIKE TEAM | For the Greater Good; Cover Fire; DS8 Support Turret |
| Stealth Battlesuits | 3 | 32 mm (as printed on source) | 8 | 4 | 3+ | — | 2 | 7+ | 1 | INFANTRY, FLY, BATTLESUIT, STEALTH | Infiltrators; Stealth; For the Greater Good; Forward Observers; Marker Drone (wargear) |
| Ghostkeel Battlesuit | 1 | 105×70 mm oval | 10 | 8 | 2+ | — | 12 | 7+ | 3 | VEHICLE, WALKER, FLY, BATTLESUIT, GHOSTKEEL | Deadly Demise D3; Infiltrators; Lone Operative; Stealth; For the Greater Good; Battlesuit Support System (wargear); Damaged 1–4 |

Faction keyword (all): T'AU EMPIRE. Leader note: only the Fireblade is a Leader, and only for the Strike Team.
Aun'Shar note **[unconfirmed]**: the fetcher once listed Lone Operative and Stealth among Aun'Shar's own abilities;
both enhancements grant exactly those two, and Aun'Shar always carries one, so play is identical either way.

| Id | Ability | Rule |
|---|---|---|
| TAU-6.1 | Coordinated Leadership (Aun'Shar) | at the end of your Command phase, if Aun'Shar is on the battlefield, roll one D6: on 4+ you gain 1 CP (subject to the R-4.2 +1-per-round cap on extra CP). |
| TAU-6.2 | Hover Drone (Aun'Shar, wargear) | the bearer has FLY and Move 10". |
| TAU-6.3 | Volley Fire (Fireblade) | while this model leads a unit, ranged weapons of every model in that unit (Fireblade included) get +1 Attacks. Applied before Rapid Fire bonus attacks. |
| TAU-6.4 | Cover Fire (Strike Team) | while the unit is within range of an objective marker you control, when it is the target of the Fire Overwatch stratagem its attacks hit on an unmodified 4+ (instead of only on 6). Critical hits stay on unmodified 6. Applies to Fire Overwatch only, not to Laser-Marked Targets. |
| TAU-6.5 | DS8 Support Turret (Strike Team) | if the unit Remains Stationary in your Movement phase, its Shas'ui is equipped with the support turret missile system until the start of your next Movement phase (so it can fire it in that Shooting phase and in Overwatch during the opponent's turn). Otherwise that weapon does not exist for the model. |
| TAU-6.6 | Marker Drone (Stealth Battlesuits, wargear on the Shas'vre) | the bearer's unit has the MARKERLIGHT keyword, and may act as an Observer even if it Advanced this turn. **[interpretation]** both effects end when the Shas'vre dies. The Strike Team's Shas'ui also lists a marker drone, but the Strike Team already has MARKERLIGHT natively and no separate rule text was found **[unconfirmed]** — treated as cosmetic. |
| TAU-6.7 | Forward Observers (Stealth Battlesuits) | while this unit is an Observer, ranged attacks by models of its Guided unit against the Spotted unit re-roll a wound roll of 1 (until end of phase). |
| TAU-6.8 | Battlesuit Support System (Ghostkeel only) | Falling Back does not stop this model from shooting later in the same turn. The Stealth Shas'vre's support system is cosmetic (equipment-list only, no rule text, like the Strike Team Shas'ui's marker drone); a Stealth unit that Fell Back cannot shoot. |
| TAU-6.9 | Damaged 1–4 (Ghostkeel) | while it has 1–4 wounds left, −1 to every hit roll it makes. |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Aun'Shar | — | — | honour stave |
| Shas'nel D'tano | — | Fireblade pulse rifle | close combat weapon (Fireblade) |
| Strike Team | Shas'ui ×1 | pulse carbine, pulse pistol, support turret missile system (only per DS8) | close combat weapon (Fire Warrior) |
| Strike Team | Fire Warrior (rifle) ×5 | pulse rifle, pulse pistol | close combat weapon (Fire Warrior) |
| Strike Team | Fire Warrior (carbine) ×4 | pulse carbine, pulse pistol | close combat weapon (Fire Warrior) |
| Stealth Battlesuits | Shas'vre ×1 | fusion blaster | battlesuit fists |
| Stealth Battlesuits | Shas'ui ×2 | burst cannon | battlesuit fists |
| Ghostkeel Battlesuit | — | cyclic ion raker (standard / overcharge), twin fusion blaster | Ghostkeel fists |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| Fireblade pulse rifle | 30" | 1 | 3+ | 5 | 0 | 2 | Rapid Fire 1 |
| pulse rifle | 30" | 1 | 4+ | 5 | 0 | 1 | Rapid Fire 1 |
| pulse carbine | 20" | 2 | 4+ | 5 | 0 | 1 | — (no Assault on source) |
| pulse pistol | 12" | 1 | 4+ | 5 | 0 | 1 | Pistol |
| support turret missile system | 30" | 2 | 5+ | 5 | 0 | 1 | Indirect Fire, Twin-linked |
| burst cannon | 18" | 4 | 4+ | 5 | 0 | 1 | — |
| fusion blaster | 12" | 1 | 4+ | 9 | −4 | D6 | Melta 2 |
| cyclic ion raker — standard | 36" | 6 | 4+ | 7 | −1 | 2 | — |
| cyclic ion raker — overcharge | 36" | 6 | 4+ | 8 | −2 | 3 | Hazardous |
| twin fusion blaster | 12" | 1 | 4+ | 9 | −4 | D6 | Melta 2, Twin-linked |
| honour stave | melee | 2 | 4+ | 5 | 0 | 1 | — |
| close combat weapon (Fireblade) | melee | 3 | 4+ | 3 | 0 | 1 | — |
| close combat weapon (Fire Warrior) | melee | 1 | 5+ | 3 | 0 | 1 | — |
| battlesuit fists | melee | 2 | 5+ | 4 | 0 | 1 | — |
| Ghostkeel fists | melee | 3 | 5+ | 6 | 0 | 2 | — |

Suggested `paintScheme` (original): primary `#d8cdb2` (bone ceramic), secondary `#2e6a86` (deep teal), trim `#d9762b`
(signal orange), metal `#6f7884`, decal `#1c2a33`, glow `#7fd6ff` (sensor blue).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, implemented in a new `src/engine/factions/tau-empire.ts` exporting
`tauEmpireHooks`); (c) = engine change beyond a code hook (signatures in §7.1). **No frozen contract changes.**

| Rule | Enc. | Encoding |
|---|---|---|
| For the Greater Good — pairing (TAU-2.1, 2.4–2.6) | (b)+(c) | (b) `forTheGreaterGood` — ability `tau.a.for-the-greater-good` on every datasheet but Aun'Shar: `{trigger:'always', code:'forTheGreaterGood', effect:{when:{weaponType:'ranged'}, ignoreCover:true}}`, `hooks:['onSaveRoll']`. `pick:{window:'shooting.unitSelected', topic:'abilityChoice'}`: `offer` only when `state.phase==='shooting'`, the selected unit (canonical) carries the code on either half, belongs to the active player and has no mark `ftgg:obs:<unitId>`; options = `<observerId>@<spottedId>` for every own canonical board unit ≠ selected carrying the code that passes `ftggObserverEligible` (C5 export) and every enemy canonical board unit visible to ≥1 model of each, plus `decline`. `handle`: push phase marks `ftgg:guided:<guidedId>=<observerId>@<spottedId>` and `ftgg:obs:<observerId>`, emit `AbilityTriggered`. Marks live in `phaseState.marks` so they expire with the phase. |
| For the Greater Good — ±1 BS (TAU-2.2, 2.3) | (b)+(c) | same hook implements C1 `skillDeltaVsTarget`: for a ranged, non-overwatch attack by a model whose canonical unit has a `ftgg:guided` mark → `-1` (better) if `targetUnitId` canonical = Spotted, else `+1`; no mark → 0. |
| For the Greater Good — Ignores Cover (TAU-2.2) | (b) | `gate(state, holder, entry, data)` for the `ignoreCover` effect: true iff `data.attack` is ranged, not overwatch, attacker canonical unit = holder canonical, holder has a guided mark whose Spotted = target canonical, and `hookService.keywordsFor(observer)` (either half) contains MARKERLIGHT. |
| Forward Observers (TAU-6.7) | (b) | `forwardObservers` — ability `{trigger:'woundRoll', code:'forwardObservers', effect:{reroll:'ones'}}`, `hooks:['onWoundRoll']`, `forceScope:{who:'friendly'}`; `gate`: holder canonical id is the Observer recorded in some `ftgg:guided:<g>=<holder>@<s>` mark, attack is ranged non-overwatch, attacker canonical = `g`, target canonical = `s`. |
| Marker Drone (TAU-6.6) | (a) reuse | ability `{trigger:'always', effect:{grantKeyword:'MARKERLIGHT'}, code:'wargearBearerAlive', params:{modelId:'shasvre', observerAfterAdvance:true}}` — reuses the Astra Militarum `wargearBearerAlive` gate (active while the Shas'vre lives). `ftggObserverEligible` reads `params.observerAfterAdvance` from any such active ability on the candidate. |
| DS13 Experimental Drone | (a)+(c) | enhancement `effect` becomes a list of two descriptors (C7): ① `{trigger:'always', effect:[{grantKeyword:'LONE OPERATIVE'}, {stealth:true}], scope:{who:'bearer'}}` (same shape as Psychostatic Veil; `stealth` is a defender key, −1 to hit vs ranged); ② `{trigger:'always', effect:[{modifyStat:{stat:'Sv', value:-1}}, {feelNoPain:'5+'}], scope:{who:'friendly', within:6, keyword:'INFANTRY'}}`. Faction filter is implicit: every friendly unit in a single-faction patrol is T'AU EMPIRE. |
| DS15 Experimental Drone | (a)+(c) | C7 list: descriptor ① as DS13; ② aura `{trigger:'always', effect:{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'LETHAL_HITS'}}, scope:{who:'friendly', within:6}}` |
| Coordinated Leadership (TAU-6.1) | (b) | `coordinatedLeadership` — ability `{trigger:'phaseEnd', when:{phase:'command', ownTurn:true}, code:'coordinatedLeadership', params:{on:4, cp:1}}`; `runAt(ctx, entry)`: if the holder is on the board, `ctx.roll({purpose:'ability', player, count:1, sides:6, mode:'perDie', unitId: holder})`; on ≥ `params.on` → `hookService.gainCp(ctx, player, 1, abilityId)` (cap applies); emit `AbilityTriggered` either way. |
| Hover Drone (TAU-6.2) | (a) | `{trigger:'always', effect:{setStat:{stat:'M', value:10}}}` (FLY already on the keyword line) |
| Volley Fire (TAU-6.3) | (a) | `{trigger:'always', when:{leaderAttached:true}, effect:{when:{weaponType:'ranged'}, modifyStat:{stat:'A', value:1}}, scope:{who:'self'}}` |
| Cover Fire (TAU-6.4) | (b)+(c) | `coverFire` — ability `{trigger:'always', code:'coverFire', params:{hitOn:4, stratagemId:'core.s.fire-overwatch'}}`; implements C2 `overwatchHitOn(state, entry, shooterUnitId, stratagemId)`: returns `params.hitOn` iff `stratagemId === params.stratagemId`, the holder canonical = shooter canonical, and some objective marker within range of any model of the shooter (11-combat-patrol §2.4) is currently controlled by the holder's player; else `null`. |
| DS8 Support Turret (TAU-6.5) | (b)+(c) | `ds8SupportTurret` — ability `{trigger:'phaseEnd', when:{phase:'movement', ownTurn:true}, code:'ds8SupportTurret', params:{modelId:'shasui', weaponId:'tau.w.support-turret-missile-system'}}`. `runAt` at own Movement end: if `holder.turn.moveType === 'stationary'` set `players[p].secondaryState['tau:ds8:'+holderId] = true`, else delete it. A second descriptor-less registration `hooks:['onPhaseStart']` is not needed: the key is rewritten every own Movement end, which is exactly "until the start of your next Movement phase" for every shooting opportunity. Implements C4 `weaponAvailable(state, entry, modelId, weaponId)`: for `weaponId === params.weaponId` on a model of the holder → key present; other weapons → `null`. |
| Battlesuit Support System — Ghostkeel | (a) | `{trigger:'always', effect:{shootAfterFallBack:true}, scope:{who:'self'}}` |
| Kauyon Lure | (b) | secondary `scoring:[{when:'command.end', who:'active', rounds:{from:2,to:5}, rule:'custom', code:'kauyonLure', pointsPer:5, cap:20}]`; `kauyonLure` = `missionHook('kauyonLure', 'onPhaseEnd')` + amount fn `kauyonLureAmount(state, rule, pid)` in `factions/tau-empire.ts` wired in `missions.ts`: `pointsPer` if any own canonical board unit with keyword T'AU EMPIRE (either half), not `battleShocked`, has any model whose base footprint intersects the owner's deployment-zone polygon; else 0. |
| Leadership Caste | (b) | secondary `scoring:[{when:'battle.end', rounds:{from:5,to:5}, rule:'custom', code:'leadershipCaste', pointsPer:20, cap:20}]` (scored once, for the secondary's owner); `leadershipCaste` = `missionHook('leadershipCaste')` + `leadershipCasteAmount(state, rule, pid)`: 20 iff the owner has a model on the board whose unit keywords include ETHEREAL. |
| Defensive Fusillade | (a) | stratagem `window:['shooting.start','shooting.attacksResolved']`, `who:'active'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:"T'AU EMPIRE"}, state:'notYetShot'}]`, `effect:{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'PISTOL'}}`, `duration:'untilEndOfPhase'` |
| Rapid Repositioning | (a)+(b)+(c) | stratagem `window:'phase.end'`, `who:'active'`, target own T'AU EMPIRE unit, `effect:{forbid:'charge'}`, `duration:'untilEndOfTurn'` (a); (b) `rapidRepositioning` stratagem hook — `check`: `state.phase === 'shooting'`, target on board, not in ER of any enemy (`leaderService.inEngagementWithEnemy` false); `apply`: distance = 6 if either half has BATTLESUIT else `ctx.roll` D6 (`purpose:'stratagem'`), then `startReactiveMove(ctx, unitId, distance, stratagemId, 'phase.end')` (C6). |
| Laser-Marked Targets | (a)+(b)+(c) | stratagem `window:'charge.declared'`, `who:'reactive'`, `targets:[{role:'unit', owner:'enemy', count:1}, {role:'unit', owner:'friendly', filter:{keyword:"T'AU EMPIRE"}, count:1}]`, `effect:{modifyRoll:{roll:'charge', value:-2}}` on `targets[0]` (the charger), `duration:'untilEndOfPhase'`; stratagem record `code:'laserMarkedTargets'`; (b) `laserMarkedTargets` — `check`: `ids[0]` is the trigger unit (`leaderService.sameUnit(state, ids[0], env.trigger.unitId)`), `ids[1]` (or a half of it) is in `phaseState.charge.targetUnitIds`, `ids[1]` not in ER of any enemy, `eligibleToShootNow(state, ids[1])`, `!shotThisTurn(state, ids[1])` (C3), `anyModelSees`; `apply`: `pushReaction({kind:'overwatch', …, unitId: ids[1], enemyUnitId: ids[0], window:'charge.declared'})` — the attack sequence is `overwatch: true`, so hits only on unmodified 6 and FtGG never applies. C3 drains it before the charge roll. |
| Fire Overwatch "once per turn per unit" interplay | (c) | C3 `shotThisTurn` also consulted by `fireOverwatch.check` (no Overwatch after Laser-Marked Targets in the same turn, and vice versa). |
| Leader (Fireblade → Strike Team) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['tau.strike-team']`; patrol `attachTo:'strike-team'` |
| Infiltrators / Stealth / Lone Operative / Deadly Demise D3 | (a) | `coreAbilities` `INFILTRATORS`, `STEALTH`, `LONE_OPERATIVE`, `DEADLY_DEMISE` value `'D3'` |
| Damaged 1–4 (Ghostkeel) | (a) | `damaged:{threshold:4, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| Rapid Fire 1 / Pistol / Indirect Fire / Twin-linked / Melta 2 / Hazardous | (a) | weapon abilities `RAPID_FIRE` 1, `PISTOL`, `INDIRECT_FIRE`, `TWIN_LINKED`, `MELTA` 2, `HAZARDOUS` |
| cyclic ion raker 2 profiles | (a) | two weapon records sharing `profileGroup` (like Smite) |
| Ghostkeel oval base | (a) | `base:{shape:'oval', mm:105, mm2:70}` |
| FLY, BATTLELINE, MARKERLIGHT, ETHEREAL, BATTLESUIT | (a) | plain keywords (FLY engine-native; MARKERLIGHT read by FtGG) |

Totals: **9 new code hooks** (`forTheGreaterGood`, `forwardObservers`, `coordinatedLeadership`, `coverFire`,
`ds8SupportTurret`, `kauyonLure`, `leadershipCaste`, `rapidRepositioning`, `laserMarkedTargets`) + 1 reused
(`wargearBearerAlive`); **7 engine changes (C1–C7), none touching a frozen contract** (`types.ts`, `actions.ts`,
`events.ts`, `hooks.ts`, `rng.ts`, `decider.ts`, `index.ts` unchanged; persistence uses existing `phaseState.marks` and
`PlayerState.secondaryState`).

### 7.1 Engine changes (c) — exact signatures

The hooks above are written against these before they exist; the engine agent implements them in parallel.

```ts
// C1 target-aware Ballistic Skill (For the Greater Good) — characteristic change, NOT a hit-roll modifier
// src/engine/code-hooks.ts (not frozen)
export interface EngineCodeHook { /* … */
  // signed BS/WS step for one attack: −1 = one step better (4+ → 3+), +1 = one step worse; null/0 = no opinion
  skillDeltaVsTarget?(state: GameState, entry: HookSourceEntry, attackerModelId: ModelId, weapon: RuntimeWeapon,
    targetUnitId: UnitId, info: { kind: 'ranged' | 'melee'; overwatch: boolean }): number | null
}
// src/engine/hooks-impl.ts HookQueries (not frozen)
skillDeltaFor(state: GameState, attackerModelId: ModelId, weapon: RuntimeWeapon, targetUnitId: UnitId,
  info: { kind: 'ranged' | 'melee'; overwatch: boolean }): number          // sum over active sources
// src/engine/attack.ts: in the hit step, when !a.overwatch:
//   needed = clamp((weapon.skill ?? 7) + hookService.skillDeltaFor(...), 2, 6)   (weapon.skill 7 = no skill stays 7)
//   the hit roll's ±1 modifier cap is applied to modifiers only, never to this delta; HitRolled shows the new needed.

// C2 Overwatch hit threshold (Cover Fire)
// src/engine/code-hooks.ts
export interface EngineCodeHook { /* … */
  overwatchHitOn?(state: GameState, entry: HookSourceEntry, shooterUnitId: UnitId, stratagemId: string): number | null
}
// src/engine/hooks-impl.ts HookQueries
overwatchHitOnFor(state: GameState, shooterUnitId: UnitId, stratagemId: string): number   // min of non-null answers, default 6
// src/engine/attack.ts (not frozen; AttackSequenceState in types.ts is frozen, so the value rides in a phase mark)
export interface AttackBegin { kind: AttackKind; attackerUnitId: UnitId; overwatch: boolean; targets: DeclaredTarget[];
  overwatchHitOn?: number }                                              // default 6; begin() writes mark `atk:owHitOn=<n>`
//   hitOpts: success = unmodified >= owHitOn (modifiers ignored); critical = unmodified === 6; `needed` shown = owHitOn.
//   movement.ts and charge.ts overwatch drains pass overwatchHitOn: hookService.overwatchHitOnFor(state, req.unitId, req.stratagemId)

// C3 reactive shooting before the charge roll + per-turn shot record (Laser-Marked Targets)
// src/engine/phases/charge.ts driveCharge: right after the `charge.declared` window returns false and before
//   doChargeRoll, drain pendingReactions('overwatch') whose enemyUnitId is the charger (reuse drainChargeOverwatch),
//   guarded by mark `ch:declOw:<unitId>`; if the charger is no longer on the board → clear phaseState.charge, no roll.
// src/engine/attack.ts
export function shotThisTurn(state: GameState, unitId: UnitId): boolean
//   attackService.begin(kind 'ranged') records the canonical shooter in
//   players[owner].secondaryState['shotTurn'] = { key: `${round}:${activePlayer}`, unitIds: UnitId[] } (reset when key differs);
//   shotThisTurn compares the key with the current round/active player. fireOverwatch.check also refuses when true.

// C4 conditional weapon availability (DS8 Support Turret)
// src/engine/code-hooks.ts
export interface EngineCodeHook { /* … */
  weaponAvailable?(state: GameState, entry: HookSourceEntry, modelId: ModelId, weaponId: WeaponId): boolean | null  // null = no opinion
}
// src/engine/weapons.ts weaponService
isAvailable(state: GameState, modelId: ModelId, weaponId: WeaponId): boolean   // false iff some source answers false
//   consulted by shooting.ts buildShootingWeaponEntries, charge.ts overwatchTargetsFor, the movement-phase overwatch
//   target builder, and attackService.begin validation (an unavailable weapon is rejected).

// C5 observer eligibility export
// src/engine/phases/shooting.ts
export function unitEligibleToShoot(ctx: EngineContext, unitId: UnitId, opts?: { ignoreAdvance?: boolean }): boolean
// src/engine/factions/tau-empire.ts
export function ftggObserverEligible(ctx: EngineContext, unitId: UnitId): boolean
//   board, not battleShocked, no `ftgg:obs:` mark, not in phaseState.activated / turn.shotThisPhase, and
//   unitEligibleToShoot(ctx, unitId, { ignoreAdvance: hasObserverAfterAdvance(state, unitId) })

// C6 reactive Normal move outside the Movement phase (Rapid Repositioning)
// src/engine/phases/movement.ts
export function startReactiveMove(ctx: EngineContext, unitId: UnitId, distance: number, source: string,
  window?: TimingWindowId): void                                         // default 'movement.unitMoved' (Skulking Horrors unchanged)
export function reactiveMoveLegalActions(state: GameState, pending: PendingDecision): Action[] | null   // null = not a reactive move
export function handleReactiveMove(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void | null
// src/engine/phases/shooting.ts shootingModule.legalActions / handle delegate to these first when pending.kind === 'moveUnit';
//   after the move resolves the reducer resumes the `phase.end` window drain. The move never writes unit.turn.moveType.

// C7 enhancement with several descriptors (DS13 / DS15: bearer-only grants + an aura with a different scope)
// src/data/types.ts (not frozen) + docs/spec/schemas enhancement schema + 20-data-schema §7 wording
export interface EnhancementData { /* … */ effect: AbilityDescriptor | AbilityDescriptor[] | Id }
// createGame / enhancements.ts: each descriptor becomes its own RuntimeAbility (source 'enhancement', bearerModelId =
//   the warlord model, default scope bearer); ids `${enh.id}.effect` for the first, `${enh.id}.effect.${n}` (n >= 2) after.
//   tools/validate-data.ts accepts the array form and checks every entry like a single descriptor.
```

## 8. Test IDs

Same list as the `TAU` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| TAU-001 | TAU-1 | patrol loads: 5 units, 16 models; Aun'Shar is WARLORD with DS13 and unattached; Fireblade attached to Strike Team; default secondary Kauyon Lure |
| TAU-002 | TAU-2.1 | selecting Strike Team to shoot offers an FtGG pick listing Stealth/Ghostkeel as Observers and enemies visible to both; Aun'Shar is never an Observer option |
| TAU-003 | TAU-2.1 | an Observer candidate that is Battle-shocked, already shot this phase, or already an Observer is absent from the options |
| TAU-004 | TAU-2.2 | Guided pulse rifle (BS 4+) vs the Spotted unit hits on 3+; with the target in Stealth (−1 hit) it hits on 4+ |
| TAU-005 | TAU-2.2 | BS change is not hit-capped: Damaged Ghostkeel (−1) Guided vs a Stealth target (−1) → cap −1 applied to modifiers, BS 3+ → hits on 4+ |
| TAU-006 | TAU-2.2 | Observer with MARKERLIGHT (Strike Team) → Guided attacks vs Spotted ignore cover; Observer Ghostkeel (no MARKERLIGHT) → cover still applies |
| TAU-007 | TAU-2.3 | Guided unit splits fire: attacks vs a non-Spotted enemy need one worse (4+ → 5+) |
| TAU-008 | TAU-2.4 | after observing, the Observer can still be selected to shoot later in the phase, but no FtGG pick is offered for it |
| TAU-009 | TAU-2.6 | Fire Overwatch by a unit that was Guided earlier gets no BS change; marks are gone in the next phase |
| TAU-010 | TAU-2.5 | Stealth Battlesuits that Advanced can be an Observer while the Shas'vre lives; once the Shas'vre is destroyed they cannot (and lose MARKERLIGHT) |
| TAU-011 | TAU-2.5 | an Advanced Strike Team (no marker drone rule) is not offered as Observer |
| TAU-012 | TAU-3 | DS13: Strike Team within 6" of Aun'Shar has Sv 3+ and FNP 5+; at 6.1" neither; Aun'Shar itself Sv 4+, FNP 5+ |
| TAU-013 | TAU-3 | DS13: Ghostkeel (not INFANTRY) within 6" gets nothing |
| TAU-014 | TAU-3 | DS13/DS15: Aun'Shar has Lone Operative (not targetable beyond 12") and Stealth (−1 to hit vs ranged) |
| TAU-015 | TAU-3 | DS15: Ghostkeel within 6" of Aun'Shar → its ranged critical hits auto-wound; melee does not |
| TAU-016 | TAU-4 | Kauyon Lure: round 1 own Command phase end → 0 VP; round 2 with Strike Team partly in own DZ → +5 VP |
| TAU-017 | TAU-4 | Kauyon Lure: only qualifying unit Battle-shocked in that Command phase → 0 VP; two qualifying units → still 5 VP |
| TAU-018 | TAU-4 | Leadership Caste: Aun'Shar alive at battle end → +20 VP; destroyed → 0 |
| TAU-019 | TAU-5 | Defensive Fusillade: Strike Team in Engagement Range shoots pulse rifles (now Pistol) at the engaged unit; not offered for a unit that already shot |
| TAU-020 | TAU-5 | Rapid Repositioning: offered at own Shooting phase end; Strike Team gets a D6 Normal move (rolled), Stealth/Ghostkeel get 6" with no roll |
| TAU-021 | TAU-5 | Rapid Repositioning: the moved unit cannot declare a charge that turn; not offered to a unit in Engagement Range |
| TAU-022 | TAU-5 | Laser-Marked Targets: after an enemy declares a charge vs the Strike Team, the Strike Team shoots before the charge roll, hitting only on unmodified 6 |
| TAU-023 | TAU-5 | Laser-Marked Targets: the charger's Charge roll is reduced by 2 (2D6 = 9 → 7) for that phase; a second charger is unaffected |
| TAU-024 | TAU-5 | Laser-Marked Targets: charger destroyed by the shooting → no charge roll, no move |
| TAU-025 | TAU-5 | Laser-Marked Targets refused for a unit that fired Overwatch earlier this turn; after it, Fire Overwatch is refused for that unit this turn |
| TAU-026 | TAU-5 | Laser-Marked Targets not offered for a unit that is not a target of the declared charge, nor in own turn |
| TAU-027 | TAU-6.1 | Coordinated Leadership: own Command phase end D6 4 → +1 CP; 3 → no CP; a second CP gain in the same round is capped |
| TAU-028 | TAU-6.2 | Aun'Shar moves up to 10" and over a model (FLY) |
| TAU-029 | TAU-6.3 | Volley Fire: led Strike Team pulse rifle A 2 (A 3 at half range with Rapid Fire 1); Fireblade rifle A 2; without the leader A 1 |
| TAU-030 | TAU-6.4 | Cover Fire: Strike Team on a controlled marker fires Overwatch → hits on unmodified 4+, crits only on 6; off the marker → 6s only |
| TAU-031 | TAU-6.4 | Cover Fire does not apply to Laser-Marked Targets shooting (still 6s only) |
| TAU-032 | TAU-6.5 | DS8: Strike Team Remained Stationary → support turret missile system offered in that Shooting phase and in Overwatch during the opponent's turn |
| TAU-033 | TAU-6.5 | DS8: Strike Team moved (Normal/Advance) → turret absent from weapon choices; next own Movement it moves → turret gone again |
| TAU-034 | TAU-6.5 | support turret: Indirect Fire vs a non-visible target (−1 hit, unmodified 1–3 fail) and Twin-linked wound re-roll |
| TAU-035 | TAU-6.7 | Forward Observers: Stealth as Observer → Guided Strike Team re-rolls wound rolls of 1 vs the Spotted unit only |
| TAU-036 | TAU-6.8 | Ghostkeel Falls Back and can still shoot; Stealth unit Falls Back → cannot shoot at all |
| TAU-037 | TAU-6.9 | Ghostkeel at 4 W → −1 to hit; destroyed → Deadly Demise D3 on a 6 |
| TAU-038 | TAU-6 | weapons: fusion blaster Melta 2 at ≤6" adds 2 damage; overcharge cyclic ion raker triggers a Hazardous test; pulse pistol only weapon usable in Engagement Range without Fusillade |
| TAU-039 | TAU-6 | Infiltrators: Stealth Battlesuits and Ghostkeel may deploy anywhere >9" from the enemy DZ and enemy models |
| TAU-040 | TAU-6 | Stealth: ranged attacks vs Stealth Battlesuits/Ghostkeel are −1 to hit; Lone Operative Ghostkeel cannot be targeted from beyond 12" |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3, vehicles compressed); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `aun-shar` | `tau.aun-shar/aun-shar` | 1 | 1.1 | 25 mm | A chibi serene alien priest with blue-grey skin and a tall topknot, flowing bone-and-teal layered robes, holding a long ceremonial staff, standing on a small hovering disc-drone with a sensor-blue glow underneath. |
| `shasnel-dtano` | `tau.shasnel-dtano/fireblade` | 1 | 1.0 | 25 mm | A chibi veteran alien soldier in bone-coloured plated armour with a teal sash, wide flat helmet pushed back to show a scarred face, holding a long sleek rifle with a glowing blue sight. |
| `fire-warrior-rifle` | `tau.strike-team/fire-warrior-rifle` | 5 | 1.0 | 25 mm | A chibi alien trooper in rounded bone-ceramic armour with teal shoulder pads, a smooth domed helmet with a single blue lens strip, holding a long boxy rifle. |
| `fire-warrior-carbine` | `tau.strike-team/fire-warrior-carbine` | 4 | 1.0 | 25 mm | Same chibi alien trooper holding a short chunky carbine with an under-barrel grip, small pistol on the hip. |
| `fire-warrior-shasui` | `tau.strike-team/shasui` | 1 | 1.0 | 25 mm | Same chibi trooper with orange-striped helmet crest and a tall antenna, carbine in hand, a small saucer drone hovering at the shoulder. |
| `support-turret` | accessory on the Shas'ui base (shown only while DS8 is active) | 1 (decorative) | 0.4 | — | A tiny chibi tripod turret with a twin missile pod painted bone and teal, blue targeting light on top. |
| `stealth-shasvre` | `tau.stealth-battlesuits/shasvre` | 1 | 1.3 | 32 mm | A chibi sleek armoured suit with a hunched wedge-shaped head and glowing blue visor, dark teal panels with shimmering half-transparent edges, a stubby heat-gun on one forearm and a tiny drone on the back. |
| `stealth-shasui` | `tau.stealth-battlesuits/shasui` | 2 | 1.3 | 32 mm | Same chibi stealth suit with a rotary multi-barrel gun on the right arm and orange trim. |
| `ghostkeel` | `tau.ghostkeel/ghostkeel` | 1 | 3.0 | 105×70 mm oval | A chibi tall long-legged walker suit with a forward-slung armoured cockpit, angular shoulder plates in bone and teal with shimmer-cloak panels, a long ribbed rapid-fire cannon on one arm and twin stubby heat-guns under the chest. |

## 10. Other T'au Empire patrols (appendix)

- Sudden Dawn Cadre — Index, May 2024 — Commander Cloudspear ×1, Pathfinder Team ×10, Breacher Team ×10, Devilfish ×1
  (model counts as reported by the fetcher **[unconfirmed]**).
