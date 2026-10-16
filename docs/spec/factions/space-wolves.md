# Faction spec — Space Wolves: Thoryk's Void Hunters

Own-words data spec for the Space Wolves Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `SPA-<section>.<n>`
are cited by the `SPA-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours.

Space Wolves is an Adeptus Astartes chapter, but in Mallet 42k it is **its own faction** on the start screen (owner
default): faction id `space-wolves`, data folder `src/data/factions/space-wolves/`, data id prefix `sw.`. Data ids are
global (`src/data/index.ts` puts every file into one id map), so the chapter **reuses Space Marines data by id**
(`sm.*`, faction id `sm`) wherever the Combat Patrol card matches. Every reused id is cited below; only differences get a
new `sw.*` id. Nothing under `src/data/factions/space-marines/` changes.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Space Wolves box "Thoryk's Void Hunters" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/thoryk-s-void-hunters/ | Book "Thoryk's Void Hunters" (Index), last update **June 2023** |
| Combat Patrol rules (Reserves never arrive in round 1; Scouts timing) | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | current (not re-fetched; already encoded) |
| Existing SM patrol specs | docs/spec/11-combat-patrol.md §4; docs/spec/factions/space-marines--strike-team-solarien.md | — |

## 1. Roster

4 datasheets, **17 models** (as boxed). Faction keywords ADEPTUS ASTARTES, SPACE WOLVES on every datasheet; every
unit is IMPERIUM.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `battle-leader-thoryk` | `sw.battle-leader-thoryk` (new) | 1 | bolt pistol (BS 2+), master-crafted bolter, master-crafted power weapon | **WARLORD**; default enhancement Tireless Hunter; Leader → Intercessor Squad |
| `intercessor-squad` | `sw.intercessor-squad` (new) | 10 | Sergeant ×1: bolt pistol, Astartes chainsword (no rifle). Intercessor ×9: bolt rifle, bolt pistol, close combat weapon | Patrol Squads: may split into 2 × 5 |
| `reiver-squad` | `sw.reiver-squad` (new) | 5 | each: special issue bolt pistol, combat knife, Reiver grav-chute (one profile for all five) | — |
| `invictor-tactical-warsuit` | `sw.invictor-tactical-warsuit` (new) | 1 | fragstorm grenade launcher, heavy bolter, twin ironhail autocannon, twin ironhail heavy stubber, Invictor fist | — |

- SPA-1.1 Default attachment: Thoryk → Intercessor Squad (patrol `attachTo: 'intercessor-squad'`). The page lists the
  Intercessor Squad as his only bodyguard. If the squad is split (SPA-6.6) he may join either half; the setup UI may
  change it within `leader.attachTo`.
- SPA-1.2 Patrol data uses `patrolSquads: [{ref:'intercessor-squad-a', size:5, wargear:[sergeant ×1, intercessor ×4]},
  {ref:'intercessor-squad-b', size:5, wargear:[intercessor ×5]}]` (existing 20-data-schema field and
  `setup.ts splitPatrolSquad`).
- SPA-1.3 No wargear options: the box builds exactly the loadouts above. The page's wargear line calls Thoryk's gun a
  "master-crafted bolt rifle" while his profile table names it "master-crafted bolter"; one profile, we use the table name.
- SPA-1.4 Faction file `src/data/factions/space-wolves/faction.json`: `{id:'space-wolves', name:'Space Wolves',
  factionKeyword:'ADEPTUS ASTARTES', armyRule:'sm.a.oath-of-moment', detachments:[{id:'sw.d.thoryks-void-hunters',
  name:"Thoryk's Void Hunters", rule:'sm.a.oath-of-moment', stratagems:[the three sw.s.* of §5], enhancements:[the two
  sw.e.* of §3]}], paintScheme:{…§9}, combatPatrols:['sw.cp.thoryks-void-hunters']}`. `factionKeyword` stays ADEPTUS
  ASTARTES because every patrol stratagem / Oath of Moment gate in the data keys on it. Client: add `'space-wolves'` to
  `StartScreen.tsx FACTION_ORDER` (after `'sm'`).

## 2. Faction ability — Oath of Moment (every datasheet)

- SPA-2.1 Identical to CP-4.1: reuse `sm.a.oath-of-moment` (code `oathOfMomentPick`, player-scoped
  `Player.oathTargetUnitId`, faction-agnostic) on all four datasheets. No new ability.

## 3. Enhancements (Battle Leader Thoryk, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `sw.e.tireless-hunter` | Tireless Hunter | default | SPA-3.1 When the first battle round begins, the bearer's player names one enemy unit (any enemy unit not destroyed, on the battlefield or in Reserves). For the rest of the battle, every attack **the bearer itself** makes (ranged or melee) against that unit adds 1 to its Wound roll (normal ±1 cap, R-6). Other models of the bearer's attached unit get nothing. |
| `sw.e.ferocious` | Ferocious | optional | SPA-3.2 The Heroic Intervention stratagem costs 0 CP when its target is the bearer's unit (attached unit included), and may be used on that unit even if Heroic Intervention was already used on another unit this phase. |

Both: `restriction: {keyword: ['BATTLE LEADER']}` (only Thoryk can take them).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `sw.sec.mighty-saga` | Mighty Saga | default | SPA-4.1 When the first battle round begins, pick one enemy model that is a CHARACTER, MONSTER or VEHICLE. At the end of the battle: 8 VP if that model has been destroyed; 12 VP instead if that model's unit was destroyed by your BATTLE LEADER **model** (Thoryk's own attacks; kills by his Intercessors do not count). Not secret: the pick is announced. |
| `sw.sec.reiving-conquerors` | Reiving Conquerors | optional | SPA-4.2 At the end of each of your **opponent's** turns (every round, round 1 included): 3 VP if you control ≥1 No Man's Land marker (`home === null`, not removed) and you control at least as many No Man's Land markers as the opponent. |

SPA-4.1 [interp]: the card picks a *model* but awards 12 for its *unit* being destroyed by the Battle Leader. We read
"its unit" as the picked model's own datasheet unit (`s.models[id].unitId`; for a CHARACTER leading a bodyguard that is
the character's own half). So 12 VP = that unit is destroyed and `destroyedBy.modelId` is Thoryk's model. A
never-arrived Reserves unit counts as destroyed and scores 8 (same R-5.16 reading as Bag the Big 'Un).

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `sw.s.a-warriors-death` | A Warrior's Death (Epic Deed) | 1 | SPA-5.1 either player's Fight phase, just after an enemy unit has picked its targets (`fight.targetsDeclared`) | one own ADEPTUS ASTARTES unit that is a target of one or more of those attacks | until the end of the phase: when a model of that unit is destroyed before it has fought this phase, roll a D6; on 4+ it is not removed yet, fights once the attacking unit has finished all its attacks, then is removed |
| `sw.s.keen-senses` | Keen Senses (Battle Tactic) | 1 | SPA-5.2 your Shooting phase (`shooting.start`, `shooting.attacksResolved`) | one own ADEPTUS ASTARTES unit not yet selected to shoot this phase (`state:'notYetShot'`) | until end of phase: its ranged weapons gain [IGNORES COVER]; its models' attacks that target a CHARACTER unit re-roll a Hit roll of 1 |
| `sw.s.pack-ambush` | Pack Ambush (Strategic Ploy) | 1 | SPA-5.3 your Shooting phase, just after one of your REIVER SQUAD units has finished its attacks (`shooting.attacksResolved`, key = that unit) | one enemy unit hit by ≥1 of those attacks and not within Engagement Range of that Reiver Squad | the enemy unit takes a Battle-shock test, subtracting 2 from the 2D6 result |

Core stratagems per the page: Thoryk (CHARACTER) may use Epic Challenge; Reivers (SMOKE) may use Smokescreen; the
Invictor (VEHICLE) may use Tank Shock; all already keyword-gated in core data.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Battle Leader Thoryk | 1 | 40 mm | 6 | 4 | 3+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, TACTICUS, BATTLE LEADER, THORYK | Leader → Intercessor Squad; Oath of Moment; Target Priority |
| Intercessor Squad | 10 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | **2** | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, INTERCESSOR SQUAD | Oath of Moment; Patrol Squads |
| Reiver Squad | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 1 | INFANTRY, SMOKE, IMPERIUM, PHOBOS, REIVER SQUAD | Scouts 6"; Deep Strike (Reiver grav-chute); Oath of Moment; Fearsome Assault |
| Invictor Tactical Warsuit | 1 | 90 mm | 8 | 8 | 3+ | — | 12 | 6+ | 4 | VEHICLE, WALKER, IMPERIUM, PHOBOS, INVICTOR TACTICAL WARSUIT | Deadly Demise D3; Scouts 8"; Oath of Moment; Damaged 1–4 |

Faction keywords (all four): ADEPTUS ASTARTES, SPACE WOLVES.

Abilities (own words):
- SPA-6.1 **Target Priority** (`sw.a.target-priority`): this model's unit (attached unit included) may shoot and may
  declare a charge in a turn in which it Fell Back.
- SPA-6.2 **Fearsome Assault** (`sw.a.fearsome-assault`): when any Fight phase begins (either player's turn), every
  enemy unit within Engagement Range of a unit with this ability takes a Battle-shock test (one test per enemy unit).
- SPA-6.3 **Reiver grav-chute** (wargear): every Reiver carries one, so the unit has Deep Strike — encoded as the
  datasheet core ability, not as a separate rule.
- SPA-6.4 **Damaged: 1–4 wounds remaining**: while the Invictor has 1–4 wounds left, every attack it makes subtracts 1
  from the Hit roll.
- SPA-6.5 Core: Leader, Scouts 6" / 8", Deep Strike, Deadly Demise D3 are native (`coreAbilities`). The Reivers can be
  set up in Reserves (Deep Strike) or make a Scouts move, not both; Reserves never arrive in round 1 (CP rule).
- SPA-6.6 **Patrol Squads**: reuse `sm.a.patrol-squads` (sizes 5/5) — at the start of Declare Battle Formations the
  10-model Intercessor Squad may split into two 5-model units; each half keeps Oath of Moment.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Battle Leader Thoryk | — | bolt pistol (BS 2+), master-crafted bolter | master-crafted power weapon |
| Intercessor Squad | Sergeant ×1 | bolt pistol | Astartes chainsword |
| Intercessor Squad | Intercessor ×9 | bolt rifle, bolt pistol | close combat weapon |
| Reiver Squad | ×5 | special issue bolt pistol | combat knife |
| Invictor Tactical Warsuit | — | fragstorm grenade launcher, heavy bolter, twin ironhail autocannon, twin ironhail heavy stubber | Invictor fist |

Weapon profiles (reused ids checked equal to the CP page):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `sw.w.bolt-pistol-thoryk` (new; same numbers as `sm.w.bolt-pistol-solarien`, new id only so the UI name is not "(Solarien)") | bolt pistol (Thoryk) | 12" | 1 | 2+ | 4 | 0 | 1 | Pistol |
| `sw.w.master-crafted-bolter` (new) | master-crafted bolter | 24" | 2 | 2+ | 4 | −1 | 2 | — |
| `sw.w.master-crafted-power-weapon` (new) | master-crafted power weapon | melee | 5 | 2+ | 5 | −2 | 2 | — |
| `sm.w.bolt-pistol` (reuse) | bolt pistol (Intercessors) | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `sw.w.bolt-rifle` (new) | bolt rifle | 24" | 2 | 3+ | 4 | −1 | 1 | Assault, Heavy |
| `sw.w.astartes-chainsword` (new) | Astartes chainsword | melee | 5 | 3+ | 4 | −1 | 1 | — |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon | melee | 3 | 3+ | 4 | 0 | 1 | — |
| `sw.w.special-issue-bolt-pistol` (new) | special issue bolt pistol | 12" | 1 | 3+ | 4 | −1 | 1 | Pistol, Precision |
| `sw.w.combat-knife` (new) | combat knife | melee | 4 | 3+ | 4 | 0 | 1 | Precision |
| `sw.w.fragstorm-grenade-launcher` (new) | fragstorm grenade launcher | 18" | D6 | 3+ | 4 | 0 | 1 | Blast |
| `sw.w.heavy-bolter` (new) | heavy bolter | 36" | 3 | 3+ | 5 | −1 | 2 | Sustained Hits 1 |
| `sw.w.twin-ironhail-autocannon` (new) | twin ironhail autocannon | 48" | 3 | 3+ | 9 | −1 | 3 | Twin-linked |
| `sw.w.twin-ironhail-heavy-stubber` (new) | twin ironhail heavy stubber | 36" | 3 | 3+ | 4 | 0 | 1 | Rapid Fire 3, Twin-linked |
| `sw.w.invictor-fist` (new) | Invictor fist | melee | 5 | 3+ | 14 | −2 | 3 | — |

The Invictor fires all four ranged weapons each Shooting phase (normal R-6 weapon selection); none is Pistol.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§5/§6/§7) or an existing code hook reused by id; (b) = new
code hook in `src/engine/factions/space-wolves.ts` (new file; spread into `codeHooks` as `...spaceWolvesHooks`);
(c) = engine change beyond a code hook. **No frozen contract changes** (`types/actions/events/hooks/rng/decider/index.ts`
untouched): E1 is internal to `stratagems.ts`, E2 adds optional `params` reads to `missions.ts`. Signals reuse
`AbilityTriggered`, `BattleShockTest` (via `hookService.battleShockTest`), `VpScored`.

Reused mechanisms (no new code): `oathOfMomentPick`; `patrolSquads`/`splitPatrolSquad`; `pistonDrivenBrutality`
(Ork Deff Dread: Battle-shock at start of Fight); `aMartyrsDeath` + deferred removal (`deferred.ts`, Sororitas E4 —
params `discardsMiracleDie:false` already used by Penitent Host Holy Radiance); `stratagemCostOverride` (Tyranid
Pouncing Leap); `reconnaissanceInForce` (SM Solarien) with different params; `bagPick` / `bagTheBigUnScore` (Morgrim's
Butchas) with new params; `unitsHitByWeapon` (attack.ts export); `hookService.battleShockTest(ctx, unit, source,
modifier)` (Bestial Bellow); `damaged` datasheet field.

| Rule | Enc. | Encoding |
|---|---|---|
| Oath of Moment (SPA-2.1) | (a) | reuse `sm.a.oath-of-moment` in every datasheet's `abilities` |
| Leader, Scouts 6"/8", Deep Strike, Deadly Demise D3 (SPA-6.3, 6.5) | (a) | `coreAbilities`: Thoryk `LEADER` + `leader.attachTo:['sw.intercessor-squad']`; Reivers `SCOUTS` 6, `DEEP_STRIKE`; Invictor `DEADLY_DEMISE` `"D3"`, `SCOUTS` 8 |
| Patrol Squads (SPA-6.6) | (a) | reuse `sm.a.patrol-squads` + patrol `patrolSquads` entries (SPA-1.2) |
| Target Priority (SPA-6.1) | (a) | new ability `sw.a.target-priority` `{trigger:'always', effect:{shootAfterFallBack:true, chargeAfterFallBack:true}, scope:{who:'self'}}` (same shape as `tau.a.battlesuit-support-system` + `ade.e.righteous-fury`) |
| Fearsome Assault (SPA-6.2) | (a) | new ability `sw.a.fearsome-assault` `{trigger:'phaseStart', when:{phase:'fight'}, code:'pistonDrivenBrutality'}` — existing hook: holder on board, each enemy canonical unit with a model within Engagement Range of a holder model tests once |
| Damaged 1–4 (SPA-6.4) | (a) | Invictor datasheet `damaged:{threshold:4, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| Tireless Hunter (SPA-3.1) | (b) | enhancement effect `{trigger:'woundRoll', effect:{modifyRoll:{roll:'wound', value:1}}, scope:{who:'bearer'}, code:'tirelessHunter'}`. Hook `tirelessHunter`: `kind:'ability'`, `hook:'onWoundRoll'`. **pick** `{window:'round.start', topic:'abilityChoice'}`: `offer(ctx, window, key)` → only when `s.round === 1`; for each player (A then B) with an enhancement ability `a.source==='enhancement' && a.code==='tirelessHunter'` whose `bearerModelId` model is not destroyed, and mark `pick:tirelessHunter:<player>` absent: push the mark, raise `chooseOption` (`canPass:false`, `context:{topic:'abilityChoice', unitId: bearerUnit, abilityId, data:{window, key, code:'tirelessHunter'}}`) over enemy units with `location !== 'destroyed'` and no `bodyguardUnitId` (one option per canonical unit); none → false. `handle`: store `s.players[p].secondaryState.tirelessHunter = { unitIds: leaderService.halves(s, picked) }`, emit `AbilityTriggered` "hunting <name>". **gate**`(state, holder, entry, data)` → true only when `data.attack` exists and `data.attack.targetUnitId` ∈ stored `unitIds` (or `leaderService.sameUnit` with any of them); no pick → false. Scope `bearer` already limits the +1 to Thoryk's own attacks. |
| Ferocious (SPA-3.2) | (a)+(c E1) | enhancement effect `{trigger:'always', code:'stratagemCostOverride', params:{stratagemId:'core.s.heroic-intervention', cost:0, ignoreLimit:true}}` (identical params to `tyr.a.pouncing-leap`). E1 makes `costOverridesFor` see enhancement-sourced abilities. |
| Mighty Saga (SPA-4.1) | (a)+(c E2) | secondary `scoring:[{id:'saga-pick', when:'round.start', rounds:{from:1,to:1}, rule:'custom', code:'bagPick', pointsPer:0, cap:0, params:{pickKeywords:['CHARACTER','MONSTER','VEHICLE'], fallbackWarlord:false}}, {id:'saga-score', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', code:'bagTheBigUnScore', pointsPer:0, cap:12, params:{unitPoints:8, beastbossPoints:12, bigScoreOn:'unit'}}]` |
| Reiving Conquerors (SPA-4.2) | (a) | secondary `scoring:[{id:'reiving-conquerors', when:'turn.end', who:'opponent', rounds:{from:1,to:5}, rule:'custom', code:'reconnaissanceInForce', pointsPer:3, cap:3, params:{tiePoints:3}}]` — `reconnaissanceInForceAmount`: mine 0 → 0, mine > theirs → 3, tie → 3, fewer → 0; `who:'opponent'` scores the SW player at the end of the other player's turn |
| A Warrior's Death (SPA-5.1) | (a) | stratagem `category:'epicDeed', phases:['fight'], window:'fight.targetsDeclared', who:'either', condition:{phase:'fight'}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, state:'targetedByAttack', count:1}]`, `duration:'untilEndOfPhase'`, `code:'aMartyrsDeath'`, `params:{threshold:4, discardBonus:0, discardsMiracleDie:false}` — no Miracle-die prompt, D6 per destroyed not-yet-fought model, 4+ → `deferRemoval` until the attacking unit has finished, then it fights and is removed |
| Keen Senses (SPA-5.2) | (a)+(b) | stratagem `category:'battleTactic', phases:['shooting'], window:['shooting.start','shooting.attacksResolved'], who:'active', condition:{phase:'shooting', ownTurn:true}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, state:'notYetShot', count:1}]`, `effect:[{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'IGNORES_COVER'}}, {when:{targetKeyword:'CHARACTER'}, reroll:'ones'}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'keenSenses'`. Hook `keenSenses` = `{name:'keenSenses', kind:'stratagem', hook:'onHitRoll', run:noop, hooks:['onHitRoll','onStatQuery']}` — needed because a stratagem's `reroll` only applies through a code's `hooks` list (cf. `veteranInstincts`, `voraciousAssaultHit`), and `onStatQuery` must stay listed so the IGNORES_COVER grant still applies. "CHARACTER unit" uses the existing `targetKeyword` test (`unitKeywordsAny`, attached halves included). |
| Pack Ambush (SPA-5.3) | (b) | stratagem `category:'strategicPloy', phases:['shooting'], window:'shooting.attacksResolved', who:'active', condition:{phase:'shooting', ownTurn:true}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'REIVER SQUAD'}, count:1}, {role:'unit', owner:'enemy', count:1}]`, `duration:'instant'`, `code:'packAmbush'`, `params:{weaponId:'sw.w.special-issue-bolt-pistol', modifier:-2}`. Hook `packAmbush` (`kind:'stratagem'`, `hook:'onPhaseStart'`, pattern `bestialBellow`): `check(env, t)`: reiver = `leaderService.canonicalUnitId(s, t.ids[0])` must equal canonical of `env.trigger.unitId` (the unit that just shot) and be on board; enemy = canonical of `t.ids[1]`, enemy player, ≥1 half on board, `enemy ∈ unitsHitByWeapon(s, reiver, params.weaponId)` (attack.ts export), and **no** pair (reiver model, enemy model) with `withinEngagementRange` (geometry.ts). `apply(ctx, env, t)`: emit `AbilityTriggered` "Battle-shock test (−2)", then `hookService.battleShockTest(ctx, enemy, env.stratagem.id, params.modifier)`. |
| Weapon abilities (Pistol, Assault, Heavy, Precision, Blast, Sustained Hits 1, Twin-linked, Rapid Fire 3) | (a) | native weapon abilities |
| SMOKE, PHOBOS, WALKER, BATTLELINE, VEHICLE | (a) | keywords; SMOKE gates Smokescreen, VEHICLE gates Tank Shock |

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; hooks and data code against these. Neither touches a frozen contract.

**E1 — Stratagem cost overrides from enhancements** (Ferocious; `src/engine/stratagems.ts`). Signature unchanged:
```ts
function costOverridesFor(state: GameState, player: PlayerId, s: RuntimeStratagem, targetUnitIds: UnitId[]): { cost: number; ignoreLimit: boolean }[]
```
Today it only scans `state.datasheets[half.datasheetId].abilities`. Add, for each half of each target unit, every
runtime ability `a` in `Object.values(state.abilities)` with `a.source === 'enhancement'`, `a.code ===
'stratagemCostOverride'`, `a.params?.stratagemId === s.id`, `a.bearerModelId` set, and
`state.models[a.bearerModelId]?.unitId === half` with that model not destroyed. Push `{cost: Number(a.params.cost ??
s.cost), ignoreLimit: a.params.ignoreLimit === true}`. Enhancement `effect` arrays are expanded into runtime abilities
the same way `resonantFocusReroll` already finds them. `effectiveCost`, `ignoresLimit` and the "any override" UI helper
pick it up unchanged. Pouncing Leap behaviour is untouched.

**E2 — Bag-the-Big-'Un parameters** (Mighty Saga; `src/engine/missions.ts`). New optional `ScoringRule.params` keys
(params is already `Record<string, unknown>`; no type change):
```ts
// bagPickRule(ctx, rule, pid, key) — the pick rule's params
params.pickKeywords?: string[]      // default ['MONSTER', 'VEHICLE']; a model qualifies if its unit's keywordsOf() has any
params.fallbackWarlord?: boolean    // default true; false → no candidates means no pick (and the secondary scores 0)

// bagByModelAmount(s, rule, pid, modelId) / bagTheBigUnAmount — the score rule's params
params.bigScoreOn?: 'model' | 'unit' // default 'model' (Bag the Big 'Un: the warlord model killed the picked model)
// 'unit': 12 (beastbossPoints) only when s.units[s.models[picked].unitId].location === 'destroyed' and
// its destroyedBy.modelId === s.units[s.players[pid].warlordUnitId].models[0]; otherwise 8 (unitPoints) when the picked
// model is destroyed (sec.bagKilled) or its never-arrived Reserves unit counts as destroyed; else 0
```
Morgrim's Butchas data sets none of these keys, so its behaviour (MOR tests) is unchanged.

## 8. Test IDs

Same list as the `SPA` section of 12-rules-test-checklist. Engine tests: `tests/engine/space-wolves.test.ts`; data
tests: `tests/data/space-wolves.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| SPA-001 | SPA-1 | patrol `sw.cp.thoryks-void-hunters` loads (default): faction `space-wolves`, 4 units, 17 models; Thoryk is WARLORD with Tireless Hunter, attached to the Intercessor Squad; default secondary Mighty Saga; stratagems are the three `sw.s.*` ids; SM patrols still load unchanged |
| SPA-002 | SPA-1.2, 6.6 | Patrol Squads split → Intercessors become two 5-model units (sergeant in half A); Thoryk may attach to either half |
| SPA-003 | SPA-6 | data: every stat/profile row of §6 matches (Intercessor OC 2; Invictor T8 W12 OC4; twin ironhail autocannon S9 D3 Twin-linked); reused `sm.*` ids are unchanged; every `sw.*` id is unique |
| SPA-004 | SPA-2.1 | Oath of Moment: an Invictor or Intercessor attack vs the Oath target re-rolls the hit roll (shared `sm.a.oath-of-moment`) |
| SPA-005 | SPA-1.4 | start screen lists Space Wolves as its own faction; a Space Wolves player can face a Space Marines player |
| SPA-006 | SPA-6.5 | Scouts: Reivers offered a 6" Scouts move, the Invictor an 8" one; Reivers in Reserves (Deep Strike) are not offered Scouts |
| SPA-007 | SPA-6.3 | Deep Strike: Reivers may be set up in Reserves and arrive >9" from enemies from round 2; Intercessors, Thoryk, Invictor may not |
| SPA-008 | SPA-3.1 | Tireless Hunter: round 1 start → pick offered to the SW player (one option per enemy unit); Thoryk's attack vs the picked unit gets +1 to wound (S4 vs T4: 3+ instead of 4+), ranged and melee |
| SPA-009 | SPA-3.1 | Tireless Hunter: Intercessor attacks vs the picked unit get no bonus; Thoryk vs another unit gets none; not offered again in round 2; bonus still live in round 3 |
| SPA-010 | SPA-3.2 | Ferocious: Heroic Intervention on Thoryk's unit costs 0 CP and is allowed after HI was already used on another unit this phase; on another unit it costs 1 CP |
| SPA-011 | SPA-4.1 | Mighty Saga: round 1 start pick lists only enemy CHARACTER/MONSTER/VEHICLE models; picked model destroyed by Reivers → 8 VP at battle end; not destroyed → 0 |
| SPA-012 | SPA-4.1 | Mighty Saga: picked model's unit destroyed by Thoryk's own attack → 12 VP; destroyed by an Intercessor of Thoryk's attached unit → 8 VP; Morgrim's Bag the Big 'Un unchanged |
| SPA-013 | SPA-4.2 | Reiving Conquerors: end of the opponent's turn, 1 v 1 No Man's Land markers → 3 VP; 2 v 1 → 3; 1 v 2 → 0; 0 v 0 → 0; home markers ignored; round 1 counts |
| SPA-014 | SPA-4.2 | Reiving Conquerors: end of the SW player's own turn → 0 |
| SPA-015 | SPA-5.1 | A Warrior's Death: enemy fights the targeted Intercessors; destroyed not-yet-fought model rolls 4+ → stays, fights after the enemy unit finishes, then is removed; roll 3 → removed at once; no Miracle-die prompt |
| SPA-016 | SPA-5.1 | A Warrior's Death not offered in the Shooting phase; a model whose unit already fought this phase gets no roll |
| SPA-017 | SPA-5.2 | Keen Senses: target in cover gets no +1 save vs the unit's ranged attacks; hit roll of 1 vs a CHARACTER unit is re-rolled; vs a non-CHARACTER unit it is not; not offered for a unit that already shot; expires at phase end |
| SPA-018 | SPA-5.3 | Pack Ambush: after Reivers shoot and hit an enemy unit → offered; enemy Battle-shock test subtracts 2 (2D6 = 8 vs Ld 6+ with −2 → 6 → passes; 7 −2 → 5 → fails) |
| SPA-019 | SPA-5.3 | Pack Ambush not offered: enemy not hit by the Reivers; enemy within Engagement Range of the Reivers; after a non-Reiver unit shoots |
| SPA-020 | SPA-6.1 | Target Priority: Thoryk's unit Falls Back, then may shoot and declare a charge that turn; Intercessors alone may not |
| SPA-021 | SPA-6.2 | Fearsome Assault: at the start of either Fight phase each enemy unit in Engagement Range of the Reivers takes one Battle-shock test; unengaged enemies do not |
| SPA-022 | SPA-6.4 | Damaged: Invictor at 4 W hits on 4+ with BS 3+ weapons; at 5 W on 3+ |
| SPA-023 | SPA-6 | weapons: twin ironhail heavy stubber at half range → 6 shots, failed wound rolls re-rolled (Twin-linked); fragstorm Blast +1 A per 5 target models; Reiver pistol and knife Precision allocate to a visible CHARACTER |
| SPA-024 | SPA-6 | bolt rifle: Intercessors Advance and still shoot (Assault); stationary → +1 to hit (Heavy) |
| SPA-025 | SPA-6.5 | Invictor Deadly Demise D3: on death roll 6 → D3 mortal wounds to each unit within 6" |
| SPA-026 | E1 | Pouncing Leap (Tyranids) cost override unchanged; an enhancement override applies only while its bearer is alive and in the target unit |

## 9. Figures

Space Wolves **share the Space Marines procedural figure kits** (`sm-tacticus` for Thoryk / Intercessors / Reivers,
`generic-heavy` walker archetype for the Invictor). The look changes through the new faction's `paintScheme` (the paint
system resolves colours by faction id, and `space-wolves` is already canonical, so no alias is needed):
`primary #6b7f93` (blue-grey plate), `secondary #d9b13b` (dull yellow), `trim #a8322a` (deep red), `metal #8a8f98`,
`decal #e8e2d0` (bone). Original designs: fur pelts, braids and bone talismans are generic; no chapter icon, wolf-head
emblem or other logo. GLB slugs carry a `sw-` prefix wherever a unit name could later collide with an SM patrol
(Intercessors, Reivers, Invictor), because Hunyuan GLBs bake their colours. GLB keys = `<datasheet id>/<modelId>`.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `battle-leader-thoryk` | `sw.battle-leader-thoryk/thoryk` | 1 | 1.2 | 40 mm | A chibi veteran warrior in blue-grey power armour with yellow shoulder rims, a shaggy grey fur cloak over his shoulders, a bare head with a wild braided red beard, a short bolt rifle in one hand and a glowing blue power sword in the other. |
| `sw-intercessor-sergeant` | `sw.intercessor-squad/sergeant` | 1 | 1.1 | 32 mm | A chibi armoured squad leader in blue-grey plate with a red helmet stripe and a small fur pelt on one shoulder, a pistol raised in one hand and a toothed chainsword in the other. |
| `sw-intercessor` | `sw.intercessor-squad/intercessor` | 9 | 1.1 | 32 mm | A chibi armoured trooper in rounded blue-grey plate with yellow knee guards and green eye-lenses, a chunky bolt rifle held across the chest and a bone talisman hanging from the belt. |
| `sw-reiver` | `sw.reiver-squad/reiver` | 5 | 1.1 | 32 mm | A chibi raider in light blue-grey armour with a pale bone-white skull-shaped faceplate, a short grav-chute pack on the back, a combat knife in one hand and a stubby pistol in the other. |
| `sw-invictor` | `sw.invictor-tactical-warsuit/invictor` | 1 | 2.4 | 90 mm | A chibi squat two-legged war walker in blue-grey plate with yellow hazard edging and an open cockpit showing a tiny helmeted pilot, a huge clawed fist on one arm, a twin autocannon on the other and a small grenade launcher on the shoulder. |

## 10. Other Space Wolves patrols (appendix)

- None found besides Thoryk's Void Hunters: the Adeptus Astartes chapter list recorded on 2026-10-15
  (space-marines--strike-team-solarien.md §10) shows only this box for Space Wolves. Not re-verified this run (the CP
  index page returned 403 to the fetcher).
