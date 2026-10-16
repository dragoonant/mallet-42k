# Faction spec — Black Templars: Siguard's Crusaders

Own-words data spec for the Black Templars Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `BLA-<section>.<n>`
are cited by the `BLA-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose here
is ours.

**Faction setup (owner default):** the chapter is its **own faction** on the start screen — faction id `black-templars`,
data id prefix `bt.`, data folder `src/data/factions/black-templars/`, engine hooks `src/engine/factions/black-templars.ts`.
It is a Space Marine chapter, so it **reuses** the Space Marines (`sm`) data wherever the CP card matches: the data bundle
is global, so `bt.*` datasheets may list `sm.w.*` weapons and `sm.a.*` abilities directly (stratagem ownership comes from
`patrol.stratagems` → `Player.stratagemIds`, so cross-faction ids are safe). Anything reused is cited by its existing id
and not restated; every difference gets a new `bt.` id. Datasheet faction keywords: `ADEPTUS ASTARTES`, `BLACK TEMPLARS`.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| BT box "Siguard's Crusaders" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/siguard-s-crusaders/ | Book "Siguard's Crusaders", kind **Index**, edition 10, last update **June 2023**; datasheets marked Combat-Patrol-only |
| Combat Patrol section nav (patrol list) | same page, left menu | only one Black Templars patrol listed (see §10) |
| Existing SM patrol specs | docs/spec/11-combat-patrol.md §4, docs/spec/factions/space-marines--strike-team-solarien.md | — |

Profile-row note: wahapedia prints a multi-profile unit's model name to the **right** of its stat row. The Primaris
Crusader Squad's first row (Sv 4+) belongs to the **Primaris Neophyte** (28 mm), the second row (Sv 3+) to the
**Initiates and Sword Brother** (32/40 mm). Verified in the page HTML (`dsProfileWrapRight` beside the 4+ row); a plain
text dump reads it the wrong way round.

## 1. Roster

4 datasheets, **17 models** (as boxed). Every unit is IMPERIUM; faction keywords ADEPTUS ASTARTES, BLACK TEMPLARS.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `marshal-siguard` | `bt.marshal-siguard` (new) | 1 | plasma pistol (2 profiles), master-crafted power weapon | **WARLORD**; default enhancement Crusaders' Fervour; Leader → Intercessor Squad **or** Primaris Crusader Squad |
| `primaris-crusader-squad` | `bt.primaris-crusader-squad` (new) | 10 | 1 Sword Brother: heavy bolt pistol, power weapon · 2 Initiates: heavy bolt pistol, Astartes chainsword · 2 Initiates: bolt pistol, bolt rifle, close combat weapon · 1 Initiate: pyreblaster, bolt pistol, close combat weapon · 2 Neophytes: bolt pistol, Astartes chainsword · 2 Neophytes: Neophyte firearm, close combat weapon | Patrol Squads (BLA-6.4) |
| `intercessor-squad` | `bt.intercessor-squad` (new) | 5 | each: bolt pistol, bolt rifle, close combat weapon (one profile, no sergeant row) | — |
| `impulsor` | `bt.impulsor` (new) | 1 | multi-melta, 2 storm bolters, armoured hull, orbital comms array (no rules on this card) | Transport 6, Firing Deck 6 |

- BLA-1.1 Default attachment (ours; the page names no default): Siguard → Primaris Crusader Squad (patrol
  `attachTo: 'primaris-crusader-squad'`). The setup UI may switch him to the Intercessors (`leader.attachTo` lists both).
  If the Crusader Squad is split (BLA-6.4) he may join either half.
- BLA-1.2 Crusader Squad composition entries (one per loadout, so no wargear options are needed and each gets its own
  figure): `sword-brother` ×1, `initiate-chainsword` ×2, `initiate-bolt-rifle` ×2, `initiate-pyreblaster` ×1 (model
  keyword `PRIMARIS INITIATE` on the three initiate entries), `neophyte-chainsword` ×2, `neophyte-firearm` ×2 (model
  keyword `PRIMARIS NEOPHYTE`, `statsOverride:{Sv:4}`, base 28 mm).
- BLA-1.3 Starting embarked: none by default (all four units deploy on the board). Patrol setup may list
  `embarked:[{unitRef:'intercessor-squad', transportRef:'impulsor'}]` as an option; an attached Siguard can only start
  embarked once E-BT3 lands.
- BLA-1.4 No wargear options: the box builds exactly the loadouts above.

## 2. Faction ability — Oath of Moment (every datasheet)

- BLA-2.1 Identical to CP-4.1: reuse `sm.a.oath-of-moment` (code `oathOfMomentPick`) on all four datasheets;
  `black-templars/faction.json` sets `armyRule: 'sm.a.oath-of-moment'`. The pick finds its holder by ability code, not
  by faction, so it works unchanged (a BT v SM mirror gives each player their own Oath target).

## 3. Enhancements (Marshal Siguard, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `bt.e.crusaders-fervour` | Crusaders' Fervour | default | BLA-3.1 Every melee weapon carried by a model of the bearer's unit (attached unit included, both halves) gets +1 Attacks. Ranged weapons unaffected. |
| `bt.e.righteous-defiance` | Righteous Defiance | optional | BLA-3.2 The bearer always has Feel No Pain 5+. BLA-3.3 Once per battle, when the bearer's unit (attached unit included) is picked as the target of an attack, its owner may invoke it: until the end of that phase every model of the unit (bearer included) has Feel No Pain 4+. |

Both: `restriction: {keyword: ['MARSHAL']}` (only Siguard can take them).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `bt.sec.path-of-purgation` | Path of Purgation | default | BLA-4.1 At the end of the battle only: **10 VP** if the WARLORD model (Siguard) is on the battlefield, his unit is not Battle-shocked, and his model is **wholly** inside the opponent's deployment zone; otherwise **8 VP** if at least one of your ADEPTUS ASTARTES units on the battlefield (attached pair = one unit), not Battle-shocked, has any model **partly or wholly** inside the opponent's deployment zone; otherwise 0. Embarked units do not count (not on the battlefield); the Impulsor does. Never both (max 10). |
| `bt.sec.sacred-vow` | Sacred Vow | optional | BLA-4.2 From battle round 2 onward, at the start of each battle round, you pick one enemy unit that is not destroyed (attached pair = one unit; may be on the board, in Reserves or embarked) as that round's vow target. BLA-4.3 At the end of that battle round: **3 VP** if that unit was destroyed during the round and the attack that destroyed it was a **melee** attack by an ADEPTUS ASTARTES model of your army; **4 VP** instead if that model has the keyword PRIMARIS CRUSADER SQUAD. Otherwise 0. One pick and at most one award per round. |

Interpretations: BLA-4.4 "destroyed by a melee attack" includes mortal wounds from that melee attack's Devastating
Wounds (none in this roster) and excludes the enemy's own Hazardous; for an attached target the killing attack is the
one that removes its last model. BLA-4.5 The 4 VP check reads the **attacking model's** keywords: Siguard leading the
Crusader Squad scores 3 for his own kill (his datasheet lacks PRIMARIS CRUSADER SQUAD); a Sword Brother, Initiate or
Neophyte kill scores 4.

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `bt.s.shield-of-zeal` | Shield of Zeal (Battle Tactic) | 1 | BLA-5.1 opponent's Shooting phase or either Fight phase, just after an enemy unit picks its targets (`shooting.targetsDeclared`, `fight.targetsDeclared`) | one own ADEPTUS ASTARTES INFANTRY unit picked as a target of that enemy unit | until end of phase, each attack against the unit whose **attacking model** is within 6" of the unit: the defending model has a 4+ invulnerable save against it, or 5+ if that model is a PRIMARIS NEOPHYTE |
| `bt.s.hate-fuelled-strength` | Hate-Fuelled Strength (Battle Tactic) | 1 | BLA-5.2 your Shooting phase, or either Fight phase (between activations) | one own ADEPTUS ASTARTES INFANTRY unit not yet selected to shoot (Shooting) / fight (Fight) this phase | until end of phase, each attack by its models that targets the closest eligible target may re-roll the hit roll |
| `bt.s.goaded-to-fury` | Goaded to Fury (Strategic Ploy) | 1 | BLA-5.3 opponent's Shooting phase, just after an enemy unit has shot (`shooting.attacksResolved`) | one own ADEPTUS ASTARTES INFANTRY unit that was a target of that enemy unit's attacks | the unit makes a Normal move (up to its M, 6") and must end it as close as possible to that enemy unit (Normal-move rules: cannot start or end in Engagement Range) |

Target keyword note: every INFANTRY unit in this army is ADEPTUS ASTARTES and the only non-INFANTRY unit is the Impulsor,
so `filter.keyword: 'INFANTRY'` (friendly) is exactly "ADEPTUS ASTARTES INFANTRY" for this roster. Core stratagems per
the page: Siguard may use Epic Challenge (CHARACTER); the Impulsor gets Tank Shock and no patrol stratagems (it is not
INFANTRY) — all already keyword-gated in core data.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Marshal Siguard | 1 | 40 mm | 6 | 4 | 3+ | 4+ | 5 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, TACTICUS, MARSHAL, SIGUARD | Leader → Intercessor Squad, Primaris Crusader Squad; Oath of Moment |
| Primaris Crusader Squad — Sword Brother, Initiates | 6 | 40 mm (Sword Brother), 32 mm (Initiates) | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, PRIMARIS CRUSADER SQUAD | Scouts 6"; Oath of Moment; Righteous Zeal; Patrol Squads |
| Primaris Crusader Squad — Neophytes | 4 | 28 mm | 6 | 4 | **4+** | — | 2 | 6+ | 2 | as above + model keyword PRIMARIS NEOPHYTE | (same unit) |
| Intercessor Squad | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, INTERCESSOR SQUAD | Oath of Moment |
| Black Templars Impulsor | 1 | 100 mm (round) | 12 | 9 | 3+ | — | 11 | 6+ | 2 | VEHICLE, TRANSPORT, DEDICATED TRANSPORT, IMPERIUM, IMPULSOR | Deadly Demise D3; Firing Deck 6; Oath of Moment; Assault Vehicle; Transport 6 |

Abilities (own words):
- BLA-6.1 **Righteous Zeal** (`bt.a.righteous-zeal` charge, `bt.a.righteous-zeal-advance` Advance — two descriptors, one
  displayed name): this unit may re-roll its Advance rolls and its Charge rolls. An attached Siguard's combined unit
  benefits (R-10.1: one unit).
- BLA-6.2 **Assault Vehicle** (`bt.a.assault-vehicle`): units may disembark from the Impulsor even after it has Advanced
  this turn; a unit that does counts as having made a Normal move (no further move this phase) and cannot declare a
  charge this turn. (Disembarking after a Fall Back stays illegal.)
- BLA-6.3 **Transport** (`transport` field): capacity 6 models; the rule allows TACTICUS or PHOBOS INFANTRY. Encoded as
  `keywords:['ADEPTUS ASTARTES','INFANTRY','TACTICUS']` (the schema's `keywords` is AND-only; this army has no PHOBOS
  unit, so it is exact for every legal BT roster). Firing Deck 6 (`transport.firingDeck: 6`). Capacity counts models:
  the 5 Intercessors, a 5-model Crusader half, or (E-BT3) Siguard + Intercessors / Siguard + a Crusader half (6) fit; the
  unsplit 10-model Crusader Squad never fits.
- BLA-6.4 **Patrol Squads** (`bt.a.patrol-squads`, marker code `patrolSquads`): at the start of Declare Battle Formations
  the 10-model squad may split into two 5-model units: one holds the five Initiates (`crusader-squad-initiates`:
  2 chainsword, 2 bolt rifle, 1 pyreblaster), the other the Sword Brother and the four Neophytes
  (`crusader-squad-brethren`). The split is fixed by the patrol data, so the composition rule is always met.
- Core: Leader, Scouts 6", Deadly Demise D3, Firing Deck are native. An attached Siguard + Crusader Squad may Scout only
  if every model has Scouts (R-10.1) — Siguard lacks it, so the combined unit cannot Scout; the unled squad (or either
  unled half) can. Siguard has no Deep Strike.

Wargear per model:
| Unit | Model (count) | Ranged | Melee |
|---|---|---|---|
| Marshal Siguard | siguard (1) | plasma pistol (standard / supercharge) | master-crafted power weapon |
| Primaris Crusader Squad | sword-brother (1) | heavy bolt pistol | power weapon (Sword Brother) |
| | initiate-chainsword (2) | heavy bolt pistol | Astartes chainsword |
| | initiate-bolt-rifle (2) | bolt pistol, bolt rifle | close combat weapon |
| | initiate-pyreblaster (1) | pyreblaster, bolt pistol | close combat weapon |
| | neophyte-chainsword (2) | bolt pistol | Astartes chainsword |
| | neophyte-firearm (2) | Neophyte firearm | close combat weapon |
| Intercessor Squad | intercessor (5) | bolt pistol, bolt rifle | close combat weapon |
| Black Templars Impulsor | impulsor (1) | multi-melta, storm bolter ×2 | armoured hull |

Weapon profiles (reused ids marked; every reused profile was checked equal to the CP page):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `bt.w.plasma-pistol-standard` (new, `profileGroup: bt.w.plasma-pistol`) | plasma pistol — standard | 12" | 1 | 2+ | 7 | −2 | 1 | Pistol |
| `bt.w.plasma-pistol-supercharge` (new, same group) | plasma pistol — supercharge | 12" | 1 | 2+ | 8 | −3 | 2 | Pistol, Hazardous |
| `bt.w.master-crafted-power-weapon` (new) | master-crafted power weapon | melee | 6 | 2+ | 5 | −2 | 2 | — |
| `sm.w.bolt-pistol` (reuse) | bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `bt.w.bolt-rifle` (new) | bolt rifle | 24" | 2 | 3+ | 4 | −1 | 1 | Assault, Heavy |
| `bt.w.heavy-bolt-pistol` (new) | heavy bolt pistol | 18" | 1 | 3+ | 4 | −1 | 1 | Pistol |
| `bt.w.neophyte-firearm` (new) | Neophyte firearm | 18" | 2 | 3+ | 4 | 0 | 1 | Assault |
| `sm.w.pyreblaster` (reuse) | pyreblaster | 12" | D6 | n/a | 5 | 0 | 1 | Torrent, Ignores Cover |
| `bt.w.astartes-chainsword` (new) | Astartes chainsword | melee | 5 | 3+ | 4 | −1 | 1 | — |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon | melee | 3 | 3+ | 4 | 0 | 1 | — |
| `bt.w.power-weapon` (new — `sm.w.power-weapon` has A4) | power weapon (Sword Brother) | melee | 3 | 3+ | 5 | −2 | 1 | — |
| `bt.w.multi-melta` (new) | multi-melta | 18" | 2 | 3+ | 9 | −4 | D6 | Melta 2 |
| `sm.w.storm-bolter` (reuse) + `bt.w.storm-bolter-2` (new, identical profile; second mount, same pattern as `tau.w.twin-pulse-carbine-2`) | storm bolter | 24" | 2 | 3+ | 4 | 0 | 1 | Rapid Fire 2 |
| `bt.w.armoured-hull` (new) | armoured hull | melee | 3 | 4+ | 6 | 0 | 1 | — |

With Crusaders' Fervour every melee profile above gets A+1 (e.g. Astartes chainsword 6, master-crafted power weapon 7).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook in
`src/engine/factions/black-templars.ts` (new file; spread into `codeHooks` as `...blackTemplarsHooks`); (c) = engine
change beyond a code hook. **No frozen contract changes** (`types/actions/events/hooks/rng/decider/index.ts` untouched):
E-BT1 adds an optional Condition key in `src/data/types.ts` + `common.schema.json` + `hooks-impl.ts`; E-BT2/E-BT3 live
in `transports.ts`, `phases/movement.ts`, `state.ts`. Signals reuse `AbilityTriggered`, `VpScored`, `UnitMoved`.

Reused mechanisms (no new code): `oathOfMomentPick`; `patrolSquads` / `splitPatrolSquad`; `voraciousAssaultHit` +
`params.stateByPhase` + Condition `targetIsClosestEligible` (Tyranid Voracious Assault); the surge-move stratagem effect
`move:{kind:'surge'}` + `params.asCloseAsPossibleTo:'target'` (Ork Krump da Gitz!); state `targetedByAttack` stratagems
(Gene-wrought Resilience / Tough as Squig-hide shape); transport embark/disembark + Firing Deck (T'au E1, Sororitas
E-PEN2); per-model `statsOverride` and composition `keywords` (Sororitas Repentia); `modelKeywordsOf` (Astra C1); the
round-start enemy-unit pick + round-end score (`methodicalDestructionPick/Score`, Astra); the enhancement-bearer
targets-declared offer (`phantomsOffer`, Tyranid Psionic Phantoms); `missions.ts unitDestroyedHook` with `kind`
(Solarien E4); `partlyWithinPolygon` / `whollyWithinPolygon` (geometry).

| Rule | Enc. | Encoding |
|---|---|---|
| Oath of Moment (BLA-2.1) | (a) | reuse `sm.a.oath-of-moment` on all four datasheets; faction `armyRule` = same id |
| Leader, Scouts 6", Deadly Demise D3 (BLA-6) | (a) | `coreAbilities` `LEADER` (Siguard; `leader.attachTo:['bt.intercessor-squad','bt.primaris-crusader-squad']`), `SCOUTS` value 6 (Crusader Squad), `DEADLY_DEMISE` value `'D3'` (Impulsor) |
| Per-model stats / keywords / bases (BLA-1.2) | (a) | composition entries per §1.2: Neophytes `statsOverride:{Sv:4}`, `keywords:['PRIMARIS NEOPHYTE']`, base 28 mm; Initiates `keywords:['PRIMARIS INITIATE']`, 32 mm; Sword Brother 40 mm |
| Crusaders' Fervour (BLA-3.1) | (a) | enhancement effect `{trigger:'always', scope:{who:'self'}, effect:{when:{weaponType:'melee'}, modifyStat:{stat:'A', value:1}}}` (same `scope.who:'self'` as Oathsworn Determination) |
| Righteous Defiance FNP 5+ (BLA-3.2) | (a) | enhancement effect entry `{trigger:'always', scope:{who:'bearer'}, effect:{feelNoPain:5}}` |
| Righteous Defiance activation (BLA-3.3) | (b) | enhancement effect entries `{trigger:'targetsDeclared', code:'righteousDefiance'}` and `{trigger:'targetsDeclared', code:'righteousDefianceFight'}`. Hooks `kind:'ability'`, `hook:'onTargetsDeclared'`, `pick.topic:'abilityChoice'`, windows `shooting.targetsDeclared` / `fight.targetsDeclared` (two hook objects sharing one `rdOffer(ctx, window, key)` / `rdHandle`, pattern `secretionGoadShoot/Fight` + `phantomsOffer`). `offer`: bearer = enhancement ability with code `righteousDefiance` (helper `enhancementBearer(s, player, code)` as in adepta-sororitas.ts), its unit on board; the attacking unit (`s.phaseState.attack.attackerUnitId`, else the window trigger unit) belongs to the other player; the bearer's canonical unit is among the attacking unit's declared targets (`attack.targetUnitIds` ∪ `TARGETED_PREFIX` marks — export the existing `targetedSet` from stratagems.ts as `export function targetedUnitsOf(state: GameState, trigger: WindowTrigger): Set<UnitId>`); `'bt.e.righteous-defiance'` not in `players[p].oncePerBattleUsed`; occurrence mark `pick:rd:<attackerId>` absent. Options `use`/`decline` (`useDeclineOptions`). `handle` use: push `'bt.e.righteous-defiance'` to `oncePerBattleUsed`; for every half of `leaderService.halves(bearerCanonical)` on board `effects.grant(ctx, half, [{feelNoPain:4}], {sourceAbilityId, sourceUnitId: bearerUnit, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`; emit `AbilityTriggered` "Righteous Defiance". Overwatch targeting is **not** offered (documented simplification; the 5+ still applies). |
| Path of Purgation (BLA-4.1) | (b) | secondary `scoring:[{id:'path-of-purgation', when:'battle.end', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'pathOfPurgation', pointsPer:8, cap:10, params:{warlordPoints:10, keyword:'ADEPTUS ASTARTES'}}]`; hook `pathOfPurgation = { name:'pathOfPurgation', kind:'mission', hook:'onPhaseEnd', run: noop }` (pattern `safeguardTheSanctuary`) + `case 'pathOfPurgation': return pathOfPurgationAmount(s, rule, pid)` in `missions.ts customAmount`. `pathOfPurgationAmount(s, rule, pid)`: `zone = deploymentZone(s, otherPlayer(pid))`; warlord = `s.units[s.players[pid].warlordUnitId]`, its CHARACTER model (`modelKeywordsOf` has CHARACTER, else models[0]); if warlord `location==='board'`, no half of `leaderService.halves(warlord)` Battle-shocked and `whollyWithinPolygon(model, zone)` → `params.warlordPoints`; else if any canonical own board unit (skip `bodyguardUnitId`-led halves; check halves together) with `params.keyword` on a half, no half Battle-shocked, and any model `partlyWithinPolygon(m, zone)` → `pointsPer`; else 0. |
| Sacred Vow pick (BLA-4.2) | (b) | scoring entry `{id:'sacred-vow-pick', when:'round.start', rounds:{from:2,to:5}, who:'both', rule:'custom', pointsPer:0, cap:0, code:'sacredVowPick'}`; hook `sacredVowPick = { name:'sacredVowPick', kind:'mission', hook:'onPhaseStart', run: noop, answer: answerSacredVow }`; add `'sacredVowPick'` to `missions.ts PICK_CODES` and `else if (rule.code === 'sacredVowPick') sacredVowOffer(ctx, pid, rule.when, key)`. `sacredVowOffer`: exactly `methodicalDestructionOffer` (canonical enemy units with `location !== 'destroyed'`, chooser = owner, `canPass:false`, topic `abilityChoice`, `data:{window,key,code:'sacredVowPick'}`). `answerSacredVow`: store `secondaryState.sacredVow = { halves: leaderService.halves(s, canonical), round: s.round, kill: null }`; emit `AbilityTriggered` "Sacred Vow"; resume `missions.onWindow(ctx, window, key)` when nothing is pending. |
| Sacred Vow kill record + score (BLA-4.3–4.5) | (b) | `missions.ts unitDestroyedHook` gains `sacredVowDestroyed(ctx, info)`: for each player `pid` whose `secondaryState.sacredVow` has `round === s.round`, `kill === null`, `info.unitId ∈ halves`, and every half now `location === 'destroyed'`: `melee = info.kind === 'melee' \|\| (info.kind === 'mortal' && s.phaseState.attack?.kind === 'melee' && info.byUnitId !== null && leaderService.sameUnit(s, info.byUnitId, s.phaseState.attack.attackerUnitId))`; `kws = info.byModelId && s.models[info.byModelId] ? modelKeywordsOf(s, info.byModelId) : (info.byUnitId ? keywordsOf(s, info.byUnitId) : [])`; store `kill = { melee: melee && info.byPlayer === pid, astartes: kws.includes('ADEPTUS ASTARTES'), crusader: kws.includes('PRIMARIS CRUSADER SQUAD') }`. Score entry `{id:'sacred-vow', when:'round.end', rounds:{from:2,to:5}, who:'both', rule:'custom', pointsPer:3, cap:4, code:'sacredVowScore', params:{crusaderPoints:4}}`; hook `sacredVowScore = { name:'sacredVowScore', kind:'mission', hook:'onPhaseEnd', run: noop }` + `case 'sacredVowScore'` → `sacredVowAmount(s, rule, pid)`: read and clear `secondaryState.sacredVow`; `round !== s.round` or no kill or `!kill.melee \|\| !kill.astartes` → 0; `kill.crusader` → `params.crusaderPoints`; else `pointsPer`. |
| Shield of Zeal (BLA-5.1) | (a)+(c E-BT1) | stratagem `phases:['shooting','fight'], window:['shooting.targetsDeclared','fight.targetsDeclared'], who:'either', condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}` (exact `sm.s.gene-wrought-resilience` shape); targets `[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}]`; `effect:[{when:{range:{within:6}, targetModelKeyword:'PRIMARIS NEOPHYTE'}, invuln:5}, {when:{range:{within:6}, not:{targetModelKeyword:'PRIMARIS NEOPHYTE'}}, invuln:4}]` (mutually exclusive gates, so the `Math.min` over invuln results in attack.ts `saveSetup` can never give a Neophyte 4+); `scope:{who:'self'}`, `duration:'untilEndOfPhase'`. `attack.range` is already attacker-model → closest model of the target unit (both halves), i.e. "attacking model within 6" of your unit". |
| Hate-Fuelled Strength (BLA-5.2) | (a) | same shape as `tyr.s.voracious-assault`: `window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved'], who:'either', condition:{any:[{phase:'shooting', ownTurn:true},{phase:'fight'}]}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'notYetShot', count:1}]`, `effect:{when:{targetIsClosestEligible:true}, reroll:'all'}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'voraciousAssaultHit'`, `params:{stateByPhase:{shooting:'notYetShot', fight:'notYetFought'}}` |
| Goaded to Fury (BLA-5.3) | (a) | same shape as `ork.s.krump-da-gitz`: `phases:['shooting'], window:'shooting.attacksResolved', who:'reactive', condition:{phase:'shooting', ownTurn:false}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}]`, `effect:{move:{distance:6, kind:'surge'}}`, `params:{asCloseAsPossibleTo:'target'}`, `duration:'instant'`. Distance 6 = M of every BT INFANTRY unit (no M modifiers exist in this roster); the deterministic surge resolver (`resolveSurgeMove`, R-5.9) already ends "as close as possible", outside Engagement Range, never from Engagement Range. |
| Righteous Zeal (BLA-6.1) | (a) | two abilities: `bt.a.righteous-zeal` `{trigger:'chargeRoll', effect:{reroll:'all'}}` (as `sm.a.unstoppable-valour`) and `bt.a.righteous-zeal-advance` `{trigger:'advanceRoll', effect:{reroll:'all'}}` (movement.ts already collects `onAdvanceRoll` re-roll kinds) |
| Patrol Squads (BLA-6.4) | (a) | `bt.a.patrol-squads` `{trigger:'always', code:'patrolSquads'}` (own text) + patrol `patrolSquads:[{ref:'crusader-squad-initiates', size:5, wargear:[initiate-chainsword×2, initiate-bolt-rifle×2, initiate-pyreblaster×1]}, {ref:'crusader-squad-brethren', size:5, wargear:[sword-brother×1, neophyte-chainsword×2, neophyte-firearm×2]}]` |
| Transport 6 / Firing Deck 6 (BLA-6.3) | (a) | datasheet `transport:{capacity:6, keywords:['ADEPTUS ASTARTES','INFANTRY','TACTICUS'], firingDeck:6}` (existing T'au/Sororitas wiring) |
| Assault Vehicle (BLA-6.2) | (b)+(c E-BT2) | ability `bt.a.assault-vehicle` `{trigger:'always', code:'assaultVehicle'}`; marker hook `assaultVehicle = { name:'assaultVehicle', kind:'ability', hook:'onPhaseStart', run: noop }` (exists only so validation passes; behaviour is E-BT2) |
| Siguard + bodyguard embarking together (BLA-6.3) | (c E-BT3) | combined-unit embark/disembark (below). **Deferrable**: until it lands an attached Siguard's unit is simply never offered embarkation; unled units embark normally. |
| Weapon abilities (Pistol, Assault, Heavy, Hazardous, Torrent, Ignores Cover, Melta 2, Rapid Fire 2) | (a) | native weapon abilities |
| Keywords BATTLELINE, TACTICUS, DEDICATED TRANSPORT, MARSHAL | (a) | keywords; MARSHAL gates the enhancements |

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; hooks code against these.

**E-BT1 — Condition `targetModelKeyword`** (Shield of Zeal):
```ts
// src/data/types.ts, interface Condition (+ the same optional property in src/data/schema/common.schema.json Condition)
targetModelKeyword?: Keyword   // the attacked / save-taking model (attack.targetModelId) has this keyword per modelKeywordsOf

// src/engine/hooks-impl.ts, evaluateCondition — after the targetNotKeyword test
if (c.targetModelKeyword !== undefined) {
  const mid = attack?.targetModelId ?? null
  if (!mid || !state.models[mid] || !modelKeywordsOf(state, mid).includes(c.targetModelKeyword)) return false
}
```
attack.ts `saveSetup` already builds its context with `targetModelId = modelId` (the model making the save), so the
condition is live at `onSaveRoll`. With no model known (hit/wound hooks before allocation) the key is false, and
`not:{targetModelKeyword}` is true — authors must only use it for defender-side keys. Document the key in
20-data-schema §3 Condition keys.

**E-BT2 — Assault Vehicle: disembark after the transport Advanced** (`src/engine/transports.ts`):
```ts
// true when the transport's datasheet lists an ability whose code is 'assaultVehicle'
export function allowsDisembarkAfterAdvance(state: GameState, transportUnitId: UnitId): boolean
```
- `transportService.disembarkMode`: replace `if (mt === 'advance' || mt === 'fallBack') return null` with
  `if (mt === 'fallBack') return null; if (mt === 'advance') return allowsDisembarkAfterAdvance(state, t) ? 'countsAsNormalMove' : null`.
- `transportService.disembark`: `mode = (mt === 'normal' || (mt === 'advance' && allowsDisembarkAfterAdvance(state, t))) ? 'countsAsNormalMove' : 'actsNormally'`
  (existing `countsAsNormalMove` branch then sets the passenger's `turn.moveType = 'normal'` and `markNoCharge`).
- No signature change to `TransportService`; `disembarkCandidates` (movement.ts) picks the new mode up automatically.

**E-BT3 — Combined (Leader + Bodyguard) embarkation** (deferrable; `transports.ts`, `phases/movement.ts`, `state.ts`):
```ts
// src/engine/transports.ts
// the units that embark / disembark together: leaderService.halves(state, unitId) (bodyguard first; a lone unit → [unitId])
export function embarkGroup(state: GameState, unitId: UnitId): UnitId[]

// src/engine/phases/movement.ts (internal helper; signature widened)
function resolveDisembark(state: GameState, unitIds: UnitId[], placements: ModelPlacement[]): { rejection: Rejection | null; resolved: ResolvedPlacement[] }
```
`TransportService` member signatures are unchanged; their semantics widen to the whole group:
- `canCarry`: drop the `halves(...).length > 1` refusal; keyword gates must pass for **every** half; `used + Σ models of
  every half ≤ capacity` (passengers already aboard counted once per half id).
- `canEmbark`: every model of every half within 3"; every half `location === 'board'`, not disembarked this phase,
  not arrived this turn, not stationary.
- `embark` / `disembark`: apply to every half (one `embarked` map entry per half id, same `embarkedAt` / `disembarkedAt`
  key; `location` flips for every half); `transportOf(halfId)` answers for each half; `disembarkMode` of either half is
  the group's.
- `canDisembarkAt(state, passengerUnitId, footprints)`: footprints cover the models of every half.
- `emergencyDisembark`: places each group as one coherent set (both halves together).
- movement.ts: `offerEmbark` runs once per canonical unit (`ctx.once` key on `leaderService.canonicalUnitId`);
  `disembarkCandidates` returns canonical ids only; `disembarkPlacement` / `raiseDisembark` use
  `embarkGroup(...)` models and `context.unitIds = embarkGroup(...)`, `mv:arriveGroup` = the group; the `via ===
  'disembark'` branch of the `deployUnit` handler resolves, moves and flips every half, then `finishUnit` /
  `mv:cur` on the canonical id.
- state.ts setup `embarked`: an entry naming either half embarks the whole group (replace the "attached unit cannot
  start embarked" throw with `canCarry` on the group).
- Firing Deck is per embarked model and needs no change.

## 8. Test IDs

Same list as the `BLA` section of 12-rules-test-checklist. Engine tests: `tests/engine/black-templars.test.ts`; data
tests: `tests/data/black-templars.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| BLA-001 | BLA-1 | patrol `bt.cp.siguard-s-crusaders` loads: 4 units, 17 models; Siguard is WARLORD with Crusaders' Fervour, attached to the Crusader Squad; default secondary Path of Purgation; stratagems are the three `bt.s.*` ids; `black-templars` is a selectable faction |
| BLA-002 | BLA-6 | data: every stat / weapon row of §6 matches (Neophyte Sv 4+, Initiates and Sword Brother Sv 3+, Siguard invuln 4+ W5, Impulsor T9 W11 OC2); reused `sm.*` ids unchanged; SM patrols still load |
| BLA-003 | BLA-2.1 | Oath of Moment: a BT unit's attack against the Oath target re-rolls the hit roll (shared `sm.a.oath-of-moment`); BT v SM mirror keeps two separate Oath targets |
| BLA-004 | BLA-1.1 | Siguard may attach to the Intercessors or the Crusader Squad (either split half); attaching to the Impulsor is refused |
| BLA-005 | BLA-6.4 | Patrol Squads split → `crusader-squad-initiates` (5 Initiates: 2 chainsword, 2 bolt rifle, 1 pyreblaster) and `crusader-squad-brethren` (Sword Brother + 4 Neophytes), each Starting Strength 5; default unsplit |
| BLA-006 | BLA-6 | Scouts 6": unled Crusader Squad (or a half) is offered a Scouts move; Siguard + Crusaders combined is not |
| BLA-007 | BLA-3.1 | Crusaders' Fervour: Astartes chainsword makes 6 attacks, Siguard's master-crafted power weapon 7, Intercessors unaffected while Siguard leads the Crusaders; ranged weapons unchanged |
| BLA-008 | BLA-3.2 | Righteous Defiance: Siguard ignores a wound on 5+ (FNP); unit models without activation have no FNP |
| BLA-009 | BLA-3.3 | Righteous Defiance: opponent's unit targets Siguard's unit in Shooting → use/decline offer; use → every model FNP 4+ until phase end; never offered again in the battle; not offered when another unit is targeted |
| BLA-010 | BLA-3.3 | Righteous Defiance in the Fight phase: offered at `fight.targetsDeclared`; after expiry (next phase) FNP back to 5+ (Siguard) / none |
| BLA-011 | BLA-4.1 | Path of Purgation: battle end, Siguard wholly in enemy zone, not Battle-shocked → 10 VP; one base edge outside → falls back to 8 if any non-shocked ADEPTUS ASTARTES unit has a model partly inside |
| BLA-012 | BLA-4.1 | Path of Purgation: only Battle-shocked units inside → 0; only the Impulsor partly inside → 8; embarked unit inside the transport does not count on its own; nothing scored before battle end |
| BLA-013 | BLA-4.2 | Sacred Vow pick: no pick in round 1; at round 2 start the BT player picks a canonical enemy unit that is not destroyed; one pick per round |
| BLA-014 | BLA-4.3 | Sacred Vow score: vow target destroyed by an Intercessor melee attack → 3 VP at round end; by a Neophyte or Initiate melee attack → 4 VP; by shooting → 0; survives → 0 |
| BLA-015 | BLA-4.5 | Sacred Vow: Siguard (attached to the Crusaders) lands the killing melee blow → 3 VP; attached enemy target scores only when its last half dies; the enemy's own Hazardous kill → 0 |
| BLA-016 | BLA-5.1 | Shield of Zeal: opponent shoots the Crusader Squad from 5.9" → Initiates save on invuln 4+ vs AP−3, Neophytes on 5+; shooter 6.1" away → armour only; not offered in own Shooting phase |
| BLA-017 | BLA-5.1 | Shield of Zeal in either Fight phase: melee attacks against the targeted unit use the 4+ / 5+ invuln; Impulsor never an eligible target; expires at phase end |
| BLA-018 | BLA-5.2 | Hate-Fuelled Strength: own Shooting, unit not yet shot → hit rolls against the closest eligible target may re-roll; a farther target → no re-roll; unit that already shot → not offered; usable in the opponent's Fight phase on a unit not yet fought |
| BLA-019 | BLA-5.3 | Goaded to Fury: after an enemy unit shoots the Intercessors → offered; the unit moves up to 6" ending as close as possible to the shooter and outside Engagement Range; not offered for a unit the shooter did not target, nor in the BT player's own turn |
| BLA-020 | BLA-6.1 | Righteous Zeal: Crusader Squad Advance roll and Charge roll each offered a re-roll; Intercessors not |
| BLA-021 | BLA-6.3 | Transport: the 5 Intercessors embark (5/6); a 5-model Crusader half embarks; the unsplit 10-model squad is refused; Firing Deck 6 lets embarked models' bolt rifles fire from the Impulsor |
| BLA-022 | BLA-6.2 | (E-BT2) Assault Vehicle: Impulsor Advances, then the passengers disembark (counts as a Normal move, no further move, charge declaration refused); after a Fall Back → no disembark; a Sororitas Rhino after an Advance still refuses |
| BLA-023 | BLA-6.3 | (E-BT3) Siguard leading the Intercessors (6 models) embarks as one unit, occupies 6/6 capacity, disembarks together wholly within 3" and stays attached; Siguard + unsplit Crusaders (11) refused |
| BLA-024 | BLA-6 | weapons: plasma pistol supercharge Hazardous (roll 1 → Siguard, a CHARACTER, takes 3 mortal wounds); multi-melta Melta 2 within 9" (+2 D); bolt rifle Assault + Heavy; storm bolters Rapid Fire 2 at half range → 4 shots each; Impulsor Deadly Demise D3 |
| BLA-025 | E-BT1 | Condition `targetModelKeyword`: true at the save of a model with the keyword, false for other models of the same unit and when no target model is known; existing conditions unchanged |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, Primaris a touch taller, Neophytes a touch shorter; vehicle height compressed
to 60 %). Bases rules-true. **Kit sharing:** BT datasheets reuse the SM figure kits — `sm-tacticus` (infantry archetype)
for every infantry model and `generic-vehicle` for the Impulsor — so they render procedurally on day one with the BT
`paintScheme` (black armour `#141414`, bone-white trim `#e6dfc8`, crimson `#9b1b1b`, metal `#8a8f98`, decal `#ffffff`).
GLB slugs below map `bt.<datasheet>/<modelId>` keys in `glbModels.ts`. No chapter crosses or other logos.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `marshal-siguard` | `bt.marshal-siguard/siguard` | 1 | 1.25 | 40 mm | A chibi armoured knight-commander in glossy black plate with bone-white shoulder trims and a short crimson tabard, a bare stern head with a cropped beard, a long gleaming sword held high and a small glowing blue plasma pistol at the hip. |
| `crusader-sword-brother` | `bt.primaris-crusader-squad/sword-brother` | 1 | 1.2 | 40 mm | A chibi veteran knight in black power armour with a white-trimmed helmet crest, a hanging crimson parchment seal on the chest, a broad energy sword in one hand and a chunky pistol in the other. |
| `crusader-initiate-chainsword` | `bt.primaris-crusader-squad/initiate-chainsword` | 2 | 1.15 | 32 mm | A chibi black-armoured warrior in a rounded helmet with a white visor strip, a toothed chain-blade raised over the head and a heavy pistol, a short crimson tabard flapping. |
| `crusader-initiate-bolt-rifle` | `bt.primaris-crusader-squad/initiate-bolt-rifle` | 2 | 1.15 | 32 mm | A chibi black-armoured warrior in a rounded helmet with white shoulder rims, a long boxy rifle braced in both hands and a small crimson cloth on the belt. |
| `crusader-initiate-pyreblaster` | `bt.primaris-crusader-squad/initiate-pyreblaster` | 1 | 1.15 | 32 mm | A chibi black-armoured warrior with a squat fuel tank on the back feeding a wide-nozzled flame gun held at the hip, the nozzle glowing orange, white-rimmed shoulders. |
| `crusader-neophyte-chainsword` | `bt.primaris-crusader-squad/neophyte-chainsword` | 2 | 1.0 | 28 mm | A chibi young novice with a bare shaved head in lighter dark-grey padded armour with a crimson sash, swinging a toothed chain-blade and holding a small pistol. |
| `crusader-neophyte-firearm` | `bt.primaris-crusader-squad/neophyte-firearm` | 2 | 1.0 | 28 mm | A chibi young novice with a bare head in lighter dark-grey padded armour and a crimson sash, aiming a compact stubby carbine with a curved magazine. |
| `bt-intercessor` | `bt.intercessor-squad/intercessor` | 5 | 1.15 | 32 mm | A chibi black-armoured line trooper in a round smooth helmet with green eye-lenses, bone-white shoulder rims, a long boxy rifle held across the chest and a pistol on the thigh. |
| `bt-impulsor` | `bt.impulsor/impulsor` | 1 | 1.5 | 100 mm | A chibi chunky hover-carrier in black armour with bone-white panels and crimson trim, an open-topped troop bay with a low rail, two small rapid guns on the front corners, a stubby wide-barrelled heat cannon on a pintle and a short antenna dish at the back, floating on glowing blue thrusters. |

## 10. Other Black Templars patrols (appendix)

- None. The Combat Patrol section's patrol list (2026-10-15) shows only Siguard's Crusaders (Index, June 2023) for the
  Black Templars; the other Adeptus Astartes entries (Strike Force Octavius, Strike Team Solarien, Strike Force
  Marcellos, Mordekai's Judgement, The Vengeful Brethren, Vigil Force Alphion, Thoryk's Void Hunters) belong to the
  generic SM or other chapters.

## 11. Open points

- Default leader attachment (BLA-1.1) and default "nothing starts embarked" (BLA-1.3) are our choices; the page names none.
- The orbital comms array appears only in the Impulsor's equipment line with no rules on the CP card: no effect.
- Righteous Defiance is not offered against Overwatch (BLA-3.3 simplification).
- Goaded to Fury uses a fixed 6" (every BT INFANTRY M); a future M modifier would need `move.distance` to read M.
- Transport keyword gate is TACTICUS-only (PHOBOS dropped; no PHOBOS unit can be in this army).
