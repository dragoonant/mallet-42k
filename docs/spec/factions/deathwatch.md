# Faction spec — Deathwatch: Vigil Force Alphion

Own-words data spec for the Deathwatch Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `DEA-<section>.<n>`
are cited by the `DEA-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours.

Deathwatch is a Space Marine chapter, but on the start screen it is its **own faction** (owner default): faction id
`deathwatch`, data directory `src/data/factions/deathwatch/`, data id prefix `dw.`, faction keywords
ADEPTUS ASTARTES + DEATHWATCH. The data bundle is flat (ids resolve across factions), so anything identical to the
Space Marines data (faction id `sm`, `src/data/factions/space-marines`) is **cited by its existing `sm.` id and
not copied**; only differences get new `dw.` ids.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Deathwatch box "Vigil Force Alphion" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/vigil-force-alphion/ | Index, 10th ed, last update **June 2023** |
| CP navigation (used to enumerate patrols) + Reserves rule | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | current |
| Space Marines specs reused | docs/spec/11-combat-patrol.md §4, docs/spec/factions/space-marines--strike-team-solarien.md | — |
| Teleport mechanism reused | docs/spec/factions/grey-knights.md E2/E3, `src/engine/teleport.ts` | — |

Patrol selection: the CP navigation lists exactly one Deathwatch patrol, Vigil Force Alphion (June 2023). There is
no alternate roster (§10).

## 1. Roster

4 datasheets, **15 models** (as boxed). Every unit is IMPERIUM, INFANTRY; faction keywords ADEPTUS ASTARTES, DEATHWATCH.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `lieutenant-alphion` | `dw.lieutenant-alphion` (new) | 1 | bolt pistol (BS 2+), master-crafted power weapon | **WARLORD**; default enhancement Aegis Vigilate; Leader → Intercessor Squad |
| `apothecary-krenn` | `dw.apothecary-krenn` (new) | 1 | absolvor bolt pistol, reductor pistol, close combat weapon (A4) | Leader → Intercessor Squad |
| `intercessor-squad` | `dw.intercessor-squad` (new) | 10 | Sergeant: bolt rifle, bolt pistol, close combat weapon. 7 Intercessors: same. 2 Intercessors: bolt rifle, Astartes grenade launcher (in addition to the rifle), bolt pistol, close combat weapon | Patrol Squads: may split into 2 × 5 |
| `aggressor-squad` | `dw.aggressor-squad` (new) | 3 | each: flamestorm gauntlets, twin power fists | — |

- DEA-1.1 Default attachment: Alphion → Intercessor Squad (patrol `attachTo: 'intercessor-squad'`); Krenn unattached.
  One bodyguard takes one leader (R-10.1). If the squad is split (DEA-6.6), each 5-model half may take one of the two
  leaders, so both can lead (the only way Narthecium ever works while Alphion is attached). The setup UI may change
  attachments within `leader.attachTo`; the AI should prefer split + both attached.
- DEA-1.2 Patrol Squads halves (`patrolSquads` entries, existing 20-data-schema field + `setup.ts splitPatrolSquad`):
  every model carries a bolt rifle (the squad has 10 bolt rifles), and two of them also carry a grenade launcher:
  `intercessor-squad-a` = 5 bolt-rifle models: Sergeant + 4 Intercessors, 1 of whom also has a grenade launcher;
  `intercessor-squad-b` = 5 bolt-rifle Intercessors (no Sergeant), 1 of whom also has a grenade launcher.
  A grenadier shoots its bolt rifle and one launcher profile (frag or krak) in the same Shooting phase.
- DEA-1.3 The Sergeant has the same profile and wargear as the other Intercessors (no separate sergeant profile; the
  `sergeant` model id exists only for the figure and the Patrol Squads split).
- DEA-1.4 No wargear options: the box builds exactly the loadouts above.

## 2. Faction ability — Oath of Moment (every datasheet)

- DEA-2.1 Identical to CP-4.1: reuse `sm.a.oath-of-moment` (code `oathOfMomentPick`, faction-agnostic) on all four
  datasheets; `dw` `faction.json` `armyRule: 'sm.a.oath-of-moment'`. Each player keeps their own Oath target, so a
  Deathwatch-vs-Space-Marines game works unchanged.

## 3. Enhancements (Lieutenant Alphion, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `dw.e.aegis-vigilate` | Aegis Vigilate | default | DEA-3.1 Every model in the bearer's unit (the attached bodyguard included) gets +1 Toughness and a 4+ invulnerable save. |
| `dw.e.aliens-bane` | Aliens' Bane | optional | DEA-3.2 The bearer's melee weapons gain [PRECISION], and each melee attack the bearer makes adds 1 to its Wound roll (R-6 ±1 cap applies). Bodyguard models are unaffected. |

Both: `restriction: {keyword: ['LIEUTENANT']}` (only Alphion can take them).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `dw.sec.hunters-insight` | Hunters' Insight | default | DEA-4.1 At the start of each of **your** turns (your `command.start`), pick one objective marker that is not inside your deployment zone. At the end of the opponent's **next** turn: 4 VP if you control that marker and at least one of your ADEPTUS ASTARTES units that is not Battle-shocked has a model within range of it. The pick is consumed when that turn ends (scored or not). No per-battle cap (only the CP mission's overall VP limits apply). |
| `dw.sec.head-taker-doctrine` | Head-taker Doctrine | optional | DEA-4.2 Score 5 VP whenever one of your ADEPTUS ASTARTES units kills an enemy CHARACTER model. DEA-4.3 At the end of the battle: a further 5 VP if every enemy CHARACTER model has been destroyed. No per-turn cap. |

- DEA-4.4 **[interp]** Hunters' Insight: "not inside your deployment zone" = the marker centre is not inside your
  deployment-zone polygon (`pointInPolygon(o.pos, deploymentZone(state, pid))`); removed markers are never offered.
  A pick made when no later opponent turn exists (you go second, round 5) simply never scores.
- DEA-4.5 **[interp]** Head-taker: the killing unit is the attack's attacker unit (`byUnitId`, either half of an
  attached unit); kills with no attacker attribution (Hazardous, Reserves loss, Desperate Escape) never score. The end
  bonus needs the opponent to have fielded ≥1 CHARACTER model (always true in CP: every WARLORD is a CHARACTER); a
  CHARACTER unit still in Reserves at the end counts as destroyed only if the engine already destroys it then.

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `dw.s.veteran-instincts` | Veteran Instincts (Battle Tactic) | 1 | DEA-5.1 opponent's Shooting phase or either player's Fight phase, just after an enemy unit selects its targets (`shooting.targetsDeclared` / `fight.targetsDeclared`) | one own ADEPTUS ASTARTES unit that was targeted | until end of phase its models have Feel No Pain 5+, or 4+ if the unit is GRAVIS |
| `dw.s.special-issue-ammunition` | Special-Issue Ammunition (Battle Tactic) | 1 | DEA-5.2 your Shooting phase (`shooting.start`, `shooting.attacksResolved`) | one own ADEPTUS ASTARTES unit not yet selected to shoot this phase | pick one set; until end of phase the unit's ranged weapons gain it — **Set A**: [ANTI-MONSTER 5+], [ANTI-VEHICLE 5+], [MELTA 2]; **Set B**: [ASSAULT], [IGNORES COVER], [SUSTAINED HITS 2] |
| `dw.s.deathwatch-teleportarium` | Deathwatch Teleportarium (Strategic Ploy) | 1 | DEA-5.3 end of the opponent's Fight phase (`phase.end`, phase `fight`, opponent's turn) | one own ADEPTUS ASTARTES unit not within Engagement Range of any enemy unit | remove it from the battlefield; in the Reinforcements step of your next Movement phase set it up anywhere more than 3" horizontally from every enemy model; it cannot declare a charge that turn. **Once per battle.** |

- DEA-5.4 `dw.s.veteran-instincts` is a new id: the Space Marines stratagem of the same name (`sm.s.veteran-instincts`,
  wound re-rolls for TERMINATORs) is a different rule and stays untouched.
- DEA-5.5 **[interp]** Teleportarium arrival follows the Teleport Assault rules already in the engine (GRE-2.2–2.6),
  only the gap (3" instead of 9") and the no-charge rider differ: the set-up is mandatory in that Movement phase
  (declining destroys the unit, `UnitLostInReserves`), the specific timing beats the CP "no Reserves in round 1" rule
  (if the Deathwatch player moves second, a unit removed at the end of the opponent's round-1 Fight phase arrives in
  round 1), the unit is never culled by the end-of-round-3 Reserves rule, and a unit removed at the end of the
  battle's final Fight phase is destroyed at battle end (GRE-2.4). The arrival does not count as Deep Strike.
- DEA-5.6 Core stratagems per the page: CHARACTERs (Alphion, Krenn) may use Epic Challenge; the squads may not —
  already keyword-gated in core data.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lieutenant Alphion | 1 | 40 mm | 6 | 4 | 3+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, TACTICUS, LIEUTENANT, ALPHION | Leader → Intercessor Squad; Oath of Moment; Target Priority |
| Apothecary Krenn | 1 | 40 mm | 6 | 4 | 3+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, TACTICUS, APOTHECARY, KRENN | Leader → Intercessor Squad; Oath of Moment; Narthecium |
| Intercessor Squad | 10 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, INTERCESSOR SQUAD | Oath of Moment; Patrol Squads |
| Aggressor Squad | 3 | 40 mm | 5 | 6 | 3+ | — | 3 | 6+ | 1 | INFANTRY, IMPERIUM, GRAVIS, AGGRESSOR SQUAD | Oath of Moment; Close-quarters Firepower |

All four: faction keywords ADEPTUS ASTARTES, DEATHWATCH. No datasheet has Deep Strike, Scouts, Infiltrators, Stealth
or Feel No Pain; the only core ability is Leader (Alphion, Krenn).

Abilities (own words):
- DEA-6.1 **Target Priority** (`dw.a.target-priority`): this model's unit (the attached bodyguard included) may shoot
  and may declare a charge in a turn in which it Fell Back.
- DEA-6.2 **Narthecium** (`dw.a.narthecium`): while Krenn is leading a unit, once in each of your Command phases you
  may return one destroyed non-CHARACTER model to that unit. The model is set up in unit coherency, wholly on the
  battlefield, not overlapping any model and not newly within Engagement Range (NEC-2.4 placement); if no legal spot
  exists, nothing returns. **[interp]** It returns with its full Wounds (as Teeming Broods); it is offered at
  `command.start`, before Battle-shock tests, and never takes the unit above its Starting Strength.
- DEA-6.3 **Close-quarters Firepower** (`dw.a.close-quarters-firepower`): each ranged attack a model of this unit makes
  against the closest eligible target improves its AP by 1 (e.g. 0 → −1).
- DEA-6.4 **Patrol Squads**: as existing (`sm.a.patrol-squads`, code `patrolSquads`) — at the start of Declare
  Battle Formations the 10-model squad may split into two 5-model units (DEA-1.2).

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Lieutenant Alphion | — | bolt pistol (Alphion) | master-crafted power weapon |
| Apothecary Krenn | — | absolvor bolt pistol, reductor pistol | close combat weapon (Krenn) |
| Intercessor Squad | Sergeant ×1, Intercessor ×7 | bolt rifle, bolt pistol | close combat weapon |
| Intercessor Squad | Grenadier ×2 | Astartes grenade launcher (2 profiles), bolt rifle, bolt pistol | close combat weapon |
| Aggressor Squad | ×3 | flamestorm gauntlets | twin power fists |

Weapon profiles (reused ids marked; every reused profile was checked equal to the CP page):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `dw.w.bolt-pistol-alphion` (new; same profile as `sm.w.bolt-pistol-solarien`, own name) | bolt pistol (Alphion) | 12" | 1 | 2+ | 4 | 0 | 1 | Pistol |
| `dw.w.master-crafted-power-weapon` (new) | master-crafted power weapon | melee | 5 | 2+ | 5 | −2 | 2 | — (+Precision with Aliens' Bane) |
| `dw.w.absolvor-bolt-pistol` (new) | absolvor bolt pistol | 18" | 1 | 3+ | 5 | −1 | 2 | Pistol |
| `dw.w.reductor-pistol` (new) | reductor pistol | 3" | 1 | 3+ | 4 | −4 | 2 | Pistol |
| `dw.w.close-combat-weapon-krenn` (new) | close combat weapon (Krenn) | melee | 4 | 3+ | 4 | 0 | 1 | — |
| `sm.w.bolt-pistol` (reuse) | bolt pistol (Intercessors) | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `dw.w.bolt-rifle` (new) | bolt rifle | 24" | 2 | 3+ | 4 | −1 | 1 | Assault, Heavy |
| `dw.w.grenade-launcher-frag` (new, `profileGroup: 'dw.w.grenade-launcher'`) | Astartes grenade launcher — frag | 24" | D3 | 3+ | 4 | 0 | 1 | Blast |
| `dw.w.grenade-launcher-krak` (new, same group) | Astartes grenade launcher — krak | 24" | 1 | 3+ | 9 | −2 | D3 | — |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon (Intercessors) | melee | 3 | 3+ | 4 | 0 | 1 | — |
| `dw.w.flamestorm-gauntlets` (new) | flamestorm gauntlets | 12" | D6+1 | n/a | 4 | 0 | 1 | Ignores Cover, Torrent, Twin-linked |
| `dw.w.twin-power-fists` (new) | twin power fists | melee | 3 | 3+ | 8 | −2 | 2 | Twin-linked |

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook in
`src/engine/factions/deathwatch.ts` (new file, `export const deathwatchHooks: Record<string, EngineCodeHook>`, spread
into `codeHooks` as `...deathwatchHooks`; mission amounts/picks wired through `missions.ts` like the other factions);
(c) = engine change beyond a code hook. **One (c) item, E1, in non-frozen files only** (`teleport.ts`,
`phases/movement.ts`); no frozen contract (`types/actions/events/hooks/rng/decider/index.ts`) changes. Signals reuse
`AbilityTriggered`, `ModelReturned`, `UnitRemovedFromBattlefield`, `ReinforcementsArrived{via:'teleportAssault'}`,
`VpScored`.
Reused mechanisms: `oathOfMomentPick`, `patrolSquads`/`splitPatrolSquad`, `findReturnSpot` + `returnModel` (Necrons,
also used by Tyranid Teeming Broods), Teleport Assault removal/arrival/cull/battle-end (`teleport.ts`, GRE E2/E3),
`targetIsClosestEligible` condition (Tyranids), `shootAfterFallBack`/`chargeAfterFallBack` effects, the Dark Pact
"stratagem/ability raises chooseOption then grants from `params`" pattern, the Ascetic Discipline keyword-tiered
defensive grant, the mission pick pattern (`PICK_CODES` + `runPick` + `answer`, Divine Judgement / Ethereal Edict),
the `missions.modelDestroyed` fan-out (Champion of Titan).

| Rule | Enc. | Encoding |
|---|---|---|
| Oath of Moment (DEA-2.1) | (a) | reuse `sm.a.oath-of-moment` on all four datasheets; faction `armyRule` = same id |
| Leader (DEA-6) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['dw.intercessor-squad']` on Alphion and Krenn |
| Patrol Squads (DEA-6.4, 1.2) | (a) | reuse ability `sm.a.patrol-squads` (sizes [5,5]) + patrol `patrolSquads` entries `intercessor-squad-a` / `-b` |
| Target Priority (DEA-6.1) | (a) | ability `dw.a.target-priority`: `{trigger:'always', effect:[{shootAfterFallBack:true},{chargeAfterFallBack:true}], scope:{who:'self'}}` (read by `hooks-impl` eligibility, `shooting.ts` / `charge.ts` Fell-Back gates) |
| Close-quarters Firepower (DEA-6.3) | (a) | ability `dw.a.close-quarters-firepower`: `{trigger:'always', when:{weaponType:'ranged', targetIsClosestEligible:true}, effect:{modifyStat:{stat:'AP', value:-1}}, scope:{who:'self'}}`. The closest-eligible test is the existing `hooks-impl` condition (Tyranid Voracious Assault). |
| Aegis Vigilate (DEA-3.1) | (a) | enhancement effect `{trigger:'always', effect:[{modifyStat:{stat:'T', value:1}}, {invuln:4}], scope:{who:'self'}}` — `attack.ts` reads T through `statFor(..., stat:'T')` on the bodyguard id, so the attached unit's T 4 → 5 |
| Aliens' Bane (DEA-3.2) | (a) | enhancement effect (array, Armour of Faith pattern): `[{trigger:'always', effect:{when:{weaponType:'melee'}, grantWeaponAbility:{ability:'PRECISION'}}, scope:{who:'bearer'}}, {trigger:'woundRoll', when:{weaponType:'melee'}, effect:{modifyRoll:{roll:'wound', value:1}}, scope:{who:'bearer'}}]` |
| Veteran Instincts (DEA-5.1) | (a) | stratagem `phases:['shooting','fight'], window:['shooting.targetsDeclared','fight.targetsDeclared'], who:'either', condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, state:'targetedByAttack', count:1}]`, `effect:[{feelNoPain:4, when:{targetKeyword:'GRAVIS'}}, {feelNoPain:5}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'` (exact shape of `ade.s.pen.ascetic-discipline`) |
| Special-Issue Ammunition (DEA-5.2) | (b) | stratagem `phases:['shooting'], window:['shooting.start','shooting.attacksResolved'], who:'active', condition:{phase:'shooting', ownTurn:true}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, state:'notYetShot', count:1}]`, **no `effect`**, `limit:'oncePerPhase'`, `code:'specialIssueAmmunition'`, `params:{sets:{A:[{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'ANTI', keyword:'MONSTER', value:5}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'ANTI', keyword:'VEHICLE', value:5}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'MELTA', value:2}}], B:[{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'ASSAULT'}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'IGNORES_COVER'}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'SUSTAINED_HITS', value:2}}]}}`. Hook `specialIssueAmmunition` — `kind:'stratagem'`, `hook:'onUnitSelectedToShoot'`: `apply(ctx, env, t)` raises `ctx.decide({kind:'chooseOption', player: env.player, window: env.window, canPass:false, context:{topic:'abilityChoice', unitId: canonical(t.ids[0]), abilityId: env.stratagem.id, data:{code:'specialIssueAmmunition', window, key:''}}, options:[A, B]})` (option hints for the AI: A priority 2 when any visible enemy unit is MONSTER/VEHICLE, else B priority 2); `answer(ctx, action, pending)`: optionId ∈ {A,B} else `E_NOT_AN_OPTION`; for every half of the unit `effects.grant(ctx, half, params.sets[opt], {sourceAbilityId: stratagem id, sourceUnitId: half, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`; emit `AbilityTriggered` naming the set. (`stratagems.ts` already tolerates a decision raised inside `apply`: it sets the window record to null when `s.pending` is set.) |
| Deathwatch Teleportarium (DEA-5.3, 5.5) | (b)+(c E1) | stratagem `phases:['fight'], window:'phase.end', who:'reactive', condition:{phase:'fight', ownTurn:false}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, count:1}]`, no effect, `limit:'oncePerBattle'`, `code:'deathwatchTeleportarium'`, `params:{minEnemyGap:3}`. Hook `deathwatchTeleportarium` — `kind:'stratagem'`, `hook:'onPhaseEnd'`: `check(env,t)`: target `location==='board'`, `!isTeleporting(state, t.ids[0])`, `!leaderService.inEngagementWithEnemy(state, t.ids[0])`; `apply(ctx,env,t)`: `removeUnitToReserves(ctx, t.ids[0], env.stratagem.id, {minEnemyGap: params.minEnemyGap ?? 3, forbidChargeOnArrival: true})` (E1) + `AbilityTriggered` "teleported out". Everything after (mandatory arrival in the next own Movement phase, any round, no cull, battle-end destruction) is the existing Teleport Assault path keyed on `isTeleporting`. |
| Narthecium (DEA-6.2) | (b) | ability `dw.a.narthecium`: `{trigger:'commandPhase', code:'narthecium'}` (no effect). Hook `narthecium` — `kind:'ability'`, `hook:'onCommandPhase'`, `gate: () => false`, `pick:{window:'command.start', topic:'abilityChoice', offer, handle}`. `offer(ctx, w, key)`: P = active player; holder = P's board unit carrying the code (Krenn); requires `leaderService.isAttached(state, holder)`; bodyguard = the holder's `bodyguardUnitId`, on board, `models.length < startingStrength`, `destroyedModels` non-empty; guard `ctx.once('pick:narthecium:<round>:<P>')`. Options: one per distinct destroyed model kind (export Necrons' `returnCandidates(half)` and reuse it; sergeant / rifle / grenadier) + `decline`. `handle`: `decline` → nothing; else snapshot = that destroyed model, `pos = findReturnSpot(state, bodyguardId, snapshot)`; null → emit `AbilityTriggered` "no room" and stop; else `m = returnModel(ctx, bodyguard, snapshot, pos, abilityId)`; `m.woundsRemaining = modelStats(state, m).W`; emit `AbilityTriggered`. CHARACTER models are never candidates (only the bodyguard half's `destroyedModels` are read). |
| Hunters' Insight — pick (DEA-4.1, 4.4) | (b) | secondary `scoring:[{id:'hunters-insight-pick', when:'command.start', rounds:{from:1,to:5}, who:'active', rule:'custom', code:'huntersInsightPick', pointsPer:0, cap:0}, {id:'hunters-insight', when:'turn.end', rounds:{from:1,to:5}, who:'opponent', rule:'custom', code:'huntersInsightScore', pointsPer:4, cap:4}]`. `huntersInsightPick` = mission hook (`hook:'onPhaseStart'`, `answer`), added to `PICK_CODES` and `runPick` → `huntersInsightOffer(ctx, owner, window, key)`: candidates = `!o.removed && !pointInPolygon({x:o.pos.x, z:o.pos.z}, deploymentZone(state, owner))`; `chooseOption` (topic `abilityChoice`, `data:{code:'huntersInsightPick', owner, window, key}`); answer stores `players[owner].secondaryState.huntersInsight = {objectiveId, round}` and emits `AbilityTriggered`, then resumes `missions.onWindow(ctx, w, k)` (Divine Judgement pattern). |
| Hunters' Insight — score (DEA-4.1) | (b) | `huntersInsightScore` = `missionHook('huntersInsightScore','onTurnEnd')` + `case 'huntersInsightScore'` in `missions.ts customAmount` → `huntersInsightAmount(ctx, rule, pid, controls)`: read and **clear** `secondaryState.huntersInsight`; 0 if none / marker removed; `controls(ctx, id, pid)` must be true; and some pid unit with keyword ADEPTUS ASTARTES, `!battleShocked`, has a model in `ctx.services.objectives.modelsInRange(state, id, pid)` → `rule.pointsPer`, else 0. Runs before the next own `command.start` pick, so picks never overlap. |
| Head-taker Doctrine — kills (DEA-4.2, 4.5) | (b) | secondary `scoring:[{id:'head-taker-doctrine', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'headTakerDoctrine', pointsPer:5, cap:99}, {id:'head-taker-sweep', when:'battle.end', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'headTakerSweep', pointsPer:5, cap:5}]`. `headTakerDoctrine = missionHook('headTakerDoctrine','onModelDestroyed')`; `customAmount` case returns 0 (event-driven); `missions.ts modelDestroyed` fan-out adds `headTakerModelDestroyed(ctx, info: ModelDestroyedInfo)`: pid = `info.byPlayer`; need pid rule with this code in round range, `info.byUnitId` non-null and any of `leaderService.halves(state, byUnitId)` has keyword ADEPTUS ASTARTES, victim unit `s.units[info.unitId]` owned by the opponent with CHARACTER in its keywords (`keywordsOf`); award `pointsPer` via `awardVp` + `mission.scored` push (Champion of Titan shape). |
| Head-taker Doctrine — sweep (DEA-4.3) | (b) | `headTakerSweep = missionHook('headTakerSweep')` + `case 'headTakerSweep'` → `headTakerSweepAmount(s, rule, pid)`: enemy units with CHARACTER keyword; ≥1 exists and every one has `location === 'destroyed'` → `pointsPer`, else 0. |
| Weapon abilities (Pistol, Assault, Heavy, Blast, Torrent, Ignores Cover, Twin-linked, Precision, Anti-X, Melta, Sustained Hits) | (a) | native weapon abilities |
| BATTLELINE, GRAVIS, TACTICUS, CHARACTER | (a) | keywords; GRAVIS gates the 4+ tier of Veteran Instincts |

### 7.1 Engine change (c) — exact signatures

Built in parallel with the (b) hooks; hooks code against these.

**E1 — Teleport arrival options** (Deathwatch Teleportarium reuses the Grey Knights Teleport Assault path with a
different gap and a no-charge rider). Non-frozen files only.
```ts
// src/engine/teleport.ts
export interface TeleportArrivalOpts {
  minEnemyGap: number            // set-up must be more than this many inches (horizontal) from every enemy model; Teleport Assault 9
  forbidChargeOnArrival: boolean // the unit may not declare a charge in the turn it arrives
}
export const DEFAULT_TELEPORT_ARRIVAL: TeleportArrivalOpts = { minEnemyGap: 9, forbidChargeOnArrival: false }
export interface TeleportRecord {
  unitId: UnitId; removedRound: number; removedInTurnOf: PlayerId; source: string
  arrival?: TeleportArrivalOpts  // absent = DEFAULT_TELEPORT_ARRIVAL (existing Grey Knights records unchanged)
}
// opts is stored on the pushed record; existing 3-argument callers are unchanged
export function removeUnitToReserves(ctx: EngineContext, unitId: UnitId, source: string, opts?: TeleportArrivalOpts): void
// the record's arrival options for a teleporting unit (any half id), DEFAULT_TELEPORT_ARRIVAL if none / not teleporting
export function teleportArrivalOpts(state: GameState, unitId: UnitId): TeleportArrivalOpts
// the pending record for a teleporting unit (any half id), or null
export function teleportRecord(state: GameState, unitId: UnitId): TeleportRecord | null
```
`src/engine/phases/movement.ts`:
- `resolveArrival(...)`: for `via === 'teleportAssault'` use
  `emptyMoveConstraints(9999, { minDistanceFromEnemies: teleportArrivalOpts(state, groupIds[0]).minEnemyGap, coherency: false })`
  instead of the fixed 9 (all other routes unchanged).
- `raiseArrivalDecision(...)`: same gap in the `deployUnit` decision constraints for `via === 'teleportAssault'`.
- arrival commit (the `deployUnit` answer, `via === 'teleportAssault'` branch): read `teleportRecord(s, uid)`
  **before** `clearTeleport`; if `arrival?.forbidChargeOnArrival`, for every half
  `ctx.services.effects.grant(ctx, half, [{ forbid: 'charge' }], { sourceAbilityId: record.source, sourceUnitId: half, scope: { who: 'self' }, duration: 'untilEndOfTurn', when: null })`.
- Everything else (`eligibleArrivals` any-round + mandatory-first ordering, decline ⇒ `destroyTeleportingUnit`,
  `cullStrandedReserves` skip, `destroyStrandedTeleports` at battle end, `rapidIngressArrival.check` false for
  teleporting units, `ReinforcementsArrived{via:'teleportAssault'}`) is reused as is. Omni-scramblers exclusion
  (SOL E2) still applies to this arrival.

### 7.2 Faction wiring and shared Space Marine figure kits

- `src/data/factions/deathwatch/faction.json`: `{id:'deathwatch', name:'Deathwatch', factionKeyword:'DEATHWATCH',
  armyRule:'sm.a.oath-of-moment', detachments:[{id:'dw.d.vigil-force-alphion', name:'Vigil Force Alphion',
  rule:'sm.a.oath-of-moment', stratagems:[the three dw.s.*], enhancements:['dw.e.aegis-vigilate','dw.e.aliens-bane']}],
  paintScheme:{primary:'#17181b', secondary:'#b9bec4', trim:'#d9d9d9', metal:'#8a8f98', decal:'#ffffff'},
  combatPatrols:['dw.cp.vigil-force-alphion']}` — black armour with silver accents; no chapter icons. Stratagem
  ownership is by faction `deathwatch` (or patrol-scoped `Player.stratagemIds`), so SM stratagems never leak in.
- Figure kits are shared with Space Marines: `src/client/figures/data.ts KNOWN_KIT` maps `dw.lieutenant-alphion`,
  `dw.apothecary-krenn`, `dw.intercessor-squad` → `'sm-tacticus'` and `dw.aggressor-squad` → `'sm-terminator'`
  (the bulky kit stands in for Gravis until its GLB exists); the faction's `paintScheme` recolours them. Bespoke GLBs
  (§9) are added to `glbModels.ts GLB_SLUG_BY_MODEL` under `dw.<datasheet>/<modelId>` keys as they are generated; the
  shared `sm.weapon.*` figure parts are reused for bolt pistol / close combat weapon.

## 8. Test IDs

Same list as the `DEA` section of 12-rules-test-checklist. Engine tests: `tests/engine/deathwatch.test.ts`;
data tests: `tests/data/deathwatch.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| DEA-001 | DEA-1 | patrol loads (default): faction `deathwatch`, 4 units, 15 models; Alphion is WARLORD with Aegis Vigilate, attached to the Intercessor Squad; default secondary Hunters' Insight; both SM patrols still load unchanged |
| DEA-002 | DEA-1.2, 6.4 | Patrol Squads split → `intercessor-squad-a` (Sergeant + 3 rifles + 1 grenadier, all 5 with bolt rifles) and `-b` (4 rifles + 1 grenadier, all 5 with bolt rifles); Alphion and Krenn can each attach to one half |
| DEA-003 | DEA-6 | data: every stat/profile row of §6 matches (Krenn ccw A4, absolvor 18" S5 AP−1 D2, reductor 3" AP−4, flamestorm D6+1 Torrent Twin-linked, Aggressor T6 W3 M5, Intercessor OC 2); reused `sm.` ids unchanged |
| DEA-004 | DEA-2.1 | Oath of Moment: a Deathwatch bolt-rifle attack vs the Oath target may re-roll its hit roll; in a DW-vs-SM game each player keeps their own target |
| DEA-005 | DEA-3.1 | Aegis Vigilate: attached Intercessors are T5 (S5 attack wounds on 4+, not 3+) with a 4+ invulnerable save (AP−3 attack saved on 4+); unattached Krenn's unit unaffected |
| DEA-006 | DEA-3.2 | Aliens' Bane: Alphion's master-crafted power weapon wounds T4 on 2+ (S5 +1); may allocate to a CHARACTER in the target unit (Precision); his bolt pistol and the Intercessors' melee are unaffected |
| DEA-007 | DEA-6.1 | Target Priority: Alphion's unit Falls Back, then is eligible to shoot and to declare a charge that turn; Aggressors that Fell Back are not |
| DEA-008 | DEA-6.2 | Narthecium: Krenn leading a squad that lost a grenadier → at own `command.start` a choice among destroyed kinds + decline; pick grenadier → model returns in coherency with full 2 W and its grenade launcher (`ModelReturned`) |
| DEA-009 | DEA-6.2 | Narthecium not offered: Krenn unattached; squad at Starting Strength; opponent's Command phase; already used this Command phase; no legal spot → nothing returns |
| DEA-010 | DEA-6.3 | Close-quarters Firepower: Aggressor flamestorm vs the closest eligible enemy unit → AP −1; vs a farther unit → AP 0 |
| DEA-011 | DEA-4.1 | Hunters' Insight: at own `command.start` pick a No Man's Land marker; end of the opponent's next turn, own non-shocked Intercessors on it and controlled → +4 VP |
| DEA-012 | DEA-4.1, 4.4 | Hunters' Insight: markers in own deployment zone not offered; 0 VP when uncontrolled, when the only unit in range is Battle-shocked, or when the only unit in range is not ADEPTUS ASTARTES; pick cleared after scoring |
| DEA-013 | DEA-4.1 | Hunters' Insight timing: DW moving second picks in round 1 and scores at the end of the opponent's round-2 turn; a round-5 pick by the second player never scores; no score at the end of own turn |
| DEA-014 | DEA-4.2, 4.5 | Head-taker: Intercessors kill an attached enemy CHARACTER model → +5 VP; killing a non-CHARACTER model → 0; enemy CHARACTER dying to its own Hazardous → 0 |
| DEA-015 | DEA-4.3 | Head-taker sweep: at battle end every enemy CHARACTER destroyed → +5 VP; one CHARACTER alive → 0 |
| DEA-016 | DEA-5.1 | Veteran Instincts: after an enemy targets Intercessors in its Shooting phase → FNP 5+ until end of phase; on Aggressors (GRAVIS) → FNP 4+; offered in own Fight phase too; not offered in own Shooting phase |
| DEA-017 | DEA-5.2 | Special-Issue Ammunition set A: bolt rifle wound roll of unmodified 5 vs a VEHICLE is a critical wound; grenade launcher krak within half range gets +2 D; ends at phase end |
| DEA-018 | DEA-5.2 | Special-Issue Ammunition set B: bolt rifle after Advancing may shoot; target in cover gets no cover bonus; unmodified 6 to hit → 2 extra hits; not offered for a unit that already shot |
| DEA-019 | DEA-5.3 | Teleportarium: end of the opponent's Fight phase, unengaged Intercessors (with attached Alphion) → removed (`UnitRemovedFromBattlefield`); next own Movement Reinforcements step set-up 3.1" from enemies accepted, 2.9" rejected |
| DEA-020 | DEA-5.3 | Teleportarium: arrived unit cannot declare a charge that turn but can shoot; not offered for an engaged unit, in own turn, or a second time in the battle (once per battle) |
| DEA-021 | DEA-5.5 | Teleportarium arrival is mandatory: declining destroys the unit (`UnitLostInReserves`); DW moving second may arrive in round 1; a unit still off-board at battle end is destroyed |
| DEA-022 | DEA-6 | Astartes grenade launcher: frag profile Blast (D3 + 1 per 5 models vs a 10-model unit); krak S9 AP−2 DD3; the model picks one profile per shooting |
| DEA-023 | DEA-6 | Bolt rifle Assault + Heavy: shoots after Advancing (Assault); +1 to hit when stationary (Heavy) |
| DEA-024 | DEA-6 | Twin power fists Twin-linked: failed wound rolls may be re-rolled; flamestorm gauntlets auto-hit (Torrent), ignore cover, Twin-linked wound re-roll |
| DEA-025 | DEA-6 | Reductor pistol: legal only at ≤ 3"; Pistol may be fired while in Engagement Range |
| DEA-026 | E1 | Grey Knights regression: Teleport Assault records without `arrival` still use the 9" gap and allow a charge after arrival |

## 9. Figures

Heights follow 30-figures (infantry H 1.1; characters a little taller; Gravis bulkier 1.3); bases rules-true. Colours
from the proposed Deathwatch paint scheme: gloss black armour `#17181b`, silver `#b9bec4` on the left shoulder and arm,
pale-grey trim; no chapter icons, skulls-with-wings or other logos.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `lieutenant-alphion` | `dw.lieutenant-alphion/alphion` | 1 | 1.2 | 40 mm | A chibi armoured officer in gloss-black plate with one silver shoulder and forearm, a short dark-red cloak, bare head with a stern jaw and cropped grey hair, a glowing blue-edged sword raised in one hand and a stubby pistol in the other. |
| `apothecary-krenn` | `dw.apothecary-krenn/krenn` | 1 | 1.2 | 40 mm | A chibi field medic in gloss-black armour with a white helmet and one silver arm, a bulky gauntlet with a fold-out syringe and saw, a long-barrelled pistol on the hip and small sample vials on the belt. |
| `dw-intercessor-sergeant` | `dw.intercessor-squad/sergeant` | 1 | 1.1 | 32 mm | A chibi heavily armoured trooper in gloss-black plate with a silver left shoulder and a white-striped helmet crest, holding a chunky long rifle across the chest, with a pistol holstered on the thigh. |
| `dw-intercessor` | `dw.intercessor-squad/intercessor` | 7 | 1.1 | 32 mm | A chibi heavily armoured trooper in gloss-black plate with a silver left shoulder and arm, a rounded helmet with green eye-lenses, and a chunky long rifle held ready. |
| `dw-intercessor-grenadier` | `dw.intercessor-squad/grenadier` | 2 | 1.1 | 32 mm | A chibi heavily armoured trooper in gloss-black plate with a silver left arm, carrying a chunky rifle with a fat drum-fed launcher tube slung underneath and spare round shells on the belt. |
| `aggressor` | `dw.aggressor-squad/aggressor` | 3 | 1.3 | 40 mm | A chibi hulking walking-tank trooper in thick gloss-black armour with a sunken helmet between huge shoulders, one silver pauldron, and two oversized fists with flamer nozzles on the knuckles and a glowing pilot light. |

## 10. Other Deathwatch patrols (appendix)

- None. The wahapedia CP navigation lists only Vigil Force Alphion for Deathwatch (June 2023). Other Adeptus Astartes
  patrols in the same menu belong to other factions here: Space Marines (Strike Force Octavius, Strike Team
  Solarien), Black Templars (Siguard's Crusaders), Blood Angels (Strike Force Marcellos), Dark Angels (Mordekai's
  Judgement, The Vengeful Brethren), Space Wolves (Thoryk's Void Hunters).
