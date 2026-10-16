# Faction spec — Dark Angels: Mordekai's Judgement

Own-words data spec for the Dark Angels Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `DAR-<section>.<n>`
are cited by the `DAR-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours.

Dark Angels are a Space Marine chapter, but here they are **their own faction** on the start screen: faction id
`dark-angels`, data id prefix `da.`, data folder `src/data/factions/dark-angels/`. Every datasheet carries the faction
keywords ADEPTUS ASTARTES **and** DARK ANGELS, so all ADEPTUS ASTARTES-gated rules (core data, Oath of Moment, the
patrol stratagems) apply unchanged. Anything identical to the existing Space Marines data (faction id `sm`,
`src/data/factions/space-marines`) is **cited by its `sm.*` id and reused, not copied** (the data bundle is global, so
a `dark-angels` datasheet may reference `sm.w.*` / `sm.a.*` records); only differences get new `da.*` ids.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| DA box "Mordekai's Judgement" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/mordekai-s-judgement/ | Book "Mordekai's Judgement", kind **Index**, edition 10, last update **June 2023** |
| DA box "The Vengeful Brethren" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/the-vengeful-brethren/ | last update **April 2024** |
| Combat Patrol rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | current (not re-fetched; 11-combat-patrol §1 already encodes it) |
| Existing SM data / specs | `src/data/factions/space-marines/`, 11-combat-patrol §4, `factions/space-marines--strike-team-solarien.md` | — |

Wahapedia's CP faction menu lists exactly two Dark Angels patrols: Mordekai's Judgement and The Vengeful Brethren.

## 1. Roster

4 datasheets, **10 models** (as boxed). Faction keywords ADEPTUS ASTARTES, DARK ANGELS; every unit is IMPERIUM.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `chaplain-mordekai` | `da.chaplain-mordekai` (new) | 1 | absolvor bolt pistol, crozius arcanum | **WARLORD** (the patrol's CHAPLAIN); default enhancement Stoic Exemplar; Leader → Intercessor Squad |
| `intercessor-squad` | `da.intercessor-squad` (new) | 5 | Sergeant: bolt pistol, power weapon. 4 Intercessors: bolt pistol, bolt rifle, close combat weapon | led by Mordekai |
| `inceptor-squad` | `da.inceptor-squad` (new) | 3 | each: assault bolters, close combat weapon | — |
| `redemptor-dreadnought` | `da.redemptor-dreadnought` (new) | 1 | icarus rocket pod, macro plasma incinerator (2 profiles), onslaught gatling cannon, twin fragstorm grenade launcher, Redemptor fist | — |

- DAR-1.1 Default attachment: Mordekai → Intercessor Squad (patrol `attachTo: 'intercessor-squad'`). It is the only
  bodyguard either way; the setup UI may detach him (operates alone).
- DAR-1.2 No wargear options: the box builds exactly the loadouts above. No Patrol Squads.
- DAR-1.3 Composition hint for the later second patrol: The Vengeful Brethren fields a 10-model Intercessor Squad.
  Build `da.intercessor-squad` composition as `sergeant` (min 1, max 1, champion) + `intercessor` (min 4, max 9,
  default 4) so the add-patrol pass can reuse it with `size: 10` if its CP card matches.
- DAR-1.4 New faction record `src/data/factions/dark-angels/faction.json`:
  `{id:'dark-angels', name:'Dark Angels', factionKeyword:'ADEPTUS ASTARTES', armyRule:'sm.a.oath-of-moment',
  detachments:[{id:'da.d.mordekais-judgement', name:"Mordekai's Judgement", rule:'sm.a.oath-of-moment',
  stratagems:[the three da.s.mj-* ids], enhancements:['da.e.stoic-exemplar','da.e.zealous-wrath']}],
  paintScheme:{primary:'#1f3b2a', secondary:'#d9cfb4', trim:'#8e1b1b', metal:'#8a8f98', decal:'#d9cfb4'},
  combatPatrols:['da.cp.mordekais-judgement']}`. Patrol file `patrols/mordekais-judgement.json`, id
  `da.cp.mordekais-judgement`, `faction: 'dark-angels'`.

## 2. Faction ability — Oath of Moment (every datasheet)

- DAR-2.1 Identical to CP-4.1 (pick one enemy unit at the start of your Command phase; until the start of your next
  Command phase, attacks by models with this ability against it may re-roll the Hit roll). Reuse
  `sm.a.oath-of-moment` (code `oathOfMomentPick`) on all four datasheets and as `armyRule`. Per-player state
  (`Player.oathTargetUnitId`), so an SM-vs-DA game keeps two independent Oaths.
- The page lists no Dark Angels chapter rule beyond this (no Deathwing / Inner Circle mechanics).

## 3. Enhancements (Chaplain Mordekai, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `da.e.stoic-exemplar` | Stoic Exemplar | default | DAR-3.1 Whenever a **melee** attack targets the bearer's unit (attached unit included), and at least one enemy unit has ended a Charge move (a normal charge or a Heroic Intervention) within Engagement Range of the bearer's unit **this turn**, that attack gets −1 to its Wound roll. It applies to every melee attacker once the condition holds, including attackers that did not charge, and in either player's turn. ±1 cap (R-6) applies. |
| `da.e.zealous-wrath` | Zealous Wrath | optional | DAR-3.2 Advance rolls and Charge rolls made for the bearer's unit (attached unit included) may be re-rolled. |

Both: `restriction: {keyword: ['CHAPLAIN']}` (only Mordekai can take them).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `da.sec.endless-hunt` | Endless Hunt | default | DAR-4.1 Battle round 2 onward, at the end of **your** turn: look at every objective marker you control whose centre is **not** inside your deployment zone and that a non-Battle-shocked INTERCESSOR SQUAD unit of yours is within range of (a unit is within range if any of its models is; with Mordekai attached the whole Attached unit counts as an INTERCESSOR SQUAD unit, so Mordekai's own model in range is enough, DAR-5.4). If any such marker lies inside the **opponent's** deployment zone → 5 VP; else if any such marker exists → 3 VP; otherwise 0. One award per turn (5 replaces 3, never 8). |
| `da.sec.archeotech-reliquary` | Archeotech Reliquary | optional | DAR-4.2 At the start of battle round 1 the **opponent** must pick one objective marker (any marker on the board, home markers included). At the end of the battle, 10 VP if you control that marker; 0 otherwise (also 0 if the marker was removed). |

## 5. Patrol stratagems

Ids are patrol-scoped (`da.s.mj-*`) because The Vengeful Brethren's stratagems reuse these names with different rules (see §10).

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `da.s.mj-unyielding` | Unyielding (Strategic Ploy) | 1 | DAR-5.1 your Command phase | one own ADEPTUS ASTARTES INFANTRY unit | +1 OC to its models until the start of your next Command phase |
| `da.s.mj-march-of-vengeance` | March of Vengeance (Strategic Ploy) | 1 | DAR-5.2 your Movement phase, just after an own ADEPTUS ASTARTES INFANTRY unit Falls Back | that unit | until end of turn it is eligible to shoot **or** declare a charge despite having Fallen Back — not both: once it has been selected to shoot this turn it may not declare a charge |
| `da.s.mj-relic-munitions` | Relic Munitions (Battle Tactic) | 1 | DAR-5.3 opponent's Shooting phase, just after an enemy unit selects its targets | one own ADEPTUS ASTARTES INFANTRY unit that was picked as a target of ≥1 of those attacks **and** is within range of an objective marker you control | until end of phase, every attack against that unit gives it the Benefit of Cover |

Core stratagems per the page: Mordekai may use Epic Challenge (CHARACTER); Intercessors and Inceptors may use Go to
Ground (INFANTRY); the Redemptor may use Tank Shock (VEHICLE) — all already keyword-gated in core data.

Keyword note (DAR-5.4): the page prints Mordekai's keywords as CHARACTER, IMPERIUM, TACTICUS, CHAPLAIN, MORDEKAI —
**without INFANTRY**. We follow the page: Mordekai on his own is not a legal target for the three INFANTRY-gated
stratagems nor Go to Ground; attached to the Intercessors the combined unit qualifies (keyword filters match when any
half has the keyword, `stratagems.ts keywordOk`). The Redemptor (VEHICLE) never qualifies.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Chaplain Mordekai | 1 | 40 mm | 6 | 4 | 3+ | 4+ | 4 | 5+ | 1 | CHARACTER, IMPERIUM, TACTICUS, CHAPLAIN, MORDEKAI | Leader → Intercessor Squad; Oath of Moment; Litany of Hate |
| Intercessor Squad | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, INTERCESSOR SQUAD | Oath of Moment |
| Inceptor Squad | 3 | 40 mm | 10 | 6 | 3+ | — | 3 | 6+ | 1 | INFANTRY, JUMP PACK, FLY, IMPERIUM, GRAVIS, INCEPTOR SQUAD | Deep Strike; Oath of Moment |
| Redemptor Dreadnought | 1 | 90 mm | 8 | 10 | 2+ | — | 12 | 6+ | 4 | VEHICLE, WALKER, IMPERIUM, REDEMPTOR DREADNOUGHT | Deadly Demise D3; Oath of Moment; Damaged 1–4 |

Faction keywords on all four: ADEPTUS ASTARTES, DARK ANGELS.

Abilities (own words):
- DAR-6.1 **Litany of Hate** (`da.a.litany-of-hate`, leader effect): while Mordekai leads a unit, every melee attack
  made by a model of that unit (Mordekai included) gets +1 to its Wound roll. No effect while unattached.
- DAR-6.2 **Damaged: 1–4 wounds remaining** (Redemptor): while the model has 1–4 wounds left, each of its attacks gets
  −1 to the Hit roll.
- DAR-6.3 Core: Leader (Mordekai), Deep Strike (Inceptors), Deadly Demise D3 (Redemptor) are native (`coreAbilities`).
  CP rule: Reserves never arrive in battle round 1. The CP page gives the Intercessors no named ability and the
  Inceptors no Meteoric Descent — do not add them.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Chaplain Mordekai | — | absolvor bolt pistol | crozius arcanum |
| Intercessor Squad | Sergeant ×1 | bolt pistol | power weapon |
| Intercessor Squad | Intercessor ×4 | bolt pistol, bolt rifle | close combat weapon |
| Inceptor Squad | ×3 | assault bolters | close combat weapon |
| Redemptor Dreadnought | — | icarus rocket pod, macro plasma incinerator (standard / supercharge), onslaught gatling cannon, twin fragstorm grenade launcher | Redemptor fist |

Weapon profiles (reused ids marked; each reused profile was checked equal to the CP page):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `da.w.absolvor-bolt-pistol` (new) | absolvor bolt pistol | 18" | 1 | 3+ | 5 | −1 | 2 | Pistol |
| `da.w.crozius-arcanum` (new) | crozius arcanum | melee | 5 | 2+ | 6 | −1 | 2 | — |
| `sm.w.bolt-pistol` (reuse) | bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `da.w.bolt-rifle` (new) | bolt rifle | 24" | 2 | 3+ | 4 | −1 | 1 | Assault, Heavy |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon (Intercessors, Inceptors) | melee | 3 | 3+ | 4 | 0 | 1 | — |
| `sm.w.power-weapon` (reuse) | power weapon (Sergeant) | melee | 4 | 3+ | 5 | −2 | 1 | — |
| `da.w.assault-bolters` (new) | assault bolters | 18" | 3 | 3+ | 5 | −1 | 2 | Assault, Pistol, Sustained Hits 2, Twin-linked |
| `da.w.icarus-rocket-pod` (new) | icarus rocket pod | 24" | D3 | 3+ | 8 | −1 | 2 | Anti-FLY 2+ |
| `da.w.macro-plasma-incinerator` (new, `profileGroup: da.w.macro-plasma-incinerator`) | macro plasma incinerator — standard | 36" | D6+1 | 3+ | 8 | −3 | 2 | Blast |
| `da.w.macro-plasma-incinerator-supercharge` (new, same group) | macro plasma incinerator — supercharge | 36" | D6+1 | 3+ | 9 | −4 | 3 | Blast, Hazardous |
| `da.w.onslaught-gatling-cannon` (new) | onslaught gatling cannon | 24" | 8 | 3+ | 5 | 0 | 1 | Devastating Wounds |
| `da.w.twin-fragstorm-grenade-launcher` (new) | twin fragstorm grenade launcher | 18" | D6 | 3+ | 4 | 0 | 1 | Blast, Twin-linked |
| `da.w.redemptor-fist` (new) | Redemptor fist | melee | 5 | 3+ | 12 | −2 | 3 | — |

Notes: the Redemptor fires every ranged weapon it has (one profile of the incinerator per shooting, R-4 multi-profile
rule). Supercharge Hazardous on a VEHICLE: a failed test inflicts 3 mortal wounds on it (native). Inceptors' assault
bolters are Pistols, so the squad may shoot them while in Engagement Range (native Pistol rule; Big Guns/Pistol
interplay unchanged).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§5/§6/§7/§9); (b) = new code hook in
`src/engine/factions/dark-angels.ts` (new file; export `darkAngelsHooks`, spread into `codeHooks` in `code-hooks.ts`
like `...spaceMarinesHooks`; mission codes also need their `missions.ts` branches); (c) = engine change beyond a code
hook. **No frozen contract changes**: both (c) items keep turn-scoped records in `state.mission.custom` (the pattern
of `cult-ambush.ts` / GSC `crossfireMarked`), so `types/actions/events/hooks/rng/decider/index.ts` are untouched.
Reused mechanisms: `oathOfMomentPick` (sm), Sworn Protectors' attacker-scoped −1 wound pattern (`ade.a.sworn-protectors`),
`unstoppable-valour`-style `reroll:'all'` on `chargeRoll` / E3 `advanceRoll` re-roll path (`collectAdvanceRerollKinds`),
Vanguard Strike's OC stratagem shape (`sm.s.vanguard-strike`), `eligibilityFor` + `shootAfterFallBack` /
`chargeAfterFallBack` effects with a `gateEffect` (pattern `vindictiveStrategy`), the T'au cover phase mark
(`coverMarkKey`, read by `hasBenefitOfCover`; `livesBeforeTerritory`), `within.of:'controlledObjective'` target filter,
Divine Judgement's opponent-picks flow (`divineJudgementOffer` / `answer`), `properLootin`'s marker-in-zone test
(`pointInPolygon(obj.pos, deploymentZone(...))`), `damaged` datasheet field, native core abilities.

| Rule | Enc. | Encoding |
|---|---|---|
| Oath of Moment (DAR-2.1) | (a) | reuse `sm.a.oath-of-moment` in every datasheet's `abilities` and as faction/detachment `armyRule` |
| Leader, Deep Strike, Deadly Demise D3 (DAR-6.3) | (a) | `coreAbilities`: `LEADER` (Mordekai, `leader.attachTo:['da.intercessor-squad']`), `DEEP_STRIKE` (Inceptors), `DEADLY_DEMISE` value `D3` (Redemptor) |
| Litany of Hate (DAR-6.1) | (a) | ability `da.a.litany-of-hate` `{trigger:'woundRoll', when:{weaponType:'melee'}, effect:{modifyRoll:{roll:'wound', value:1}}, scope:{who:'self'}}` placed in Mordekai's `leader.effects` (only live while leading, as `sm.a.veil-of-time`) |
| Damaged 1–4 (DAR-6.2) | (a) | datasheet `damaged: {threshold: 4, effect: {modifyRoll: {roll: 'hit', value: -1}}}` (as Doomstalker / Dreadknight) |
| Weapon abilities (Pistol, Assault, Heavy, Sustained Hits 2, Twin-linked, Anti-FLY 2+, Blast, Hazardous, Devastating Wounds) | (a) | native weapon abilities; incinerator profiles share `profileGroup` |
| JUMP PACK, FLY, WALKER, BATTLELINE, GRAVIS, TACTICUS | (a) | keywords; FLY native movement; WALKER enables Heroic Intervention for the Redemptor; VEHICLE gates Tank Shock |
| Unyielding (DAR-5.1) | (a) | stratagem `da.s.mj-unyielding`: `category:'strategicPloy', phases:['command'], window:['command.start','command.end'], who:'active', condition:{phase:'command', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, count:1}]` (every own unit is ADEPTUS ASTARTES, so filtering INFANTRY is exact), `effect:{modifyStat:{stat:'OC', value:1}}`, `scope:{who:'self'}`, `duration:'untilNextTurn'` (same shape as `sm.s.vanguard-strike`) |
| Zealous Wrath (DAR-3.2) | (a) | enhancement `effect:[{trigger:'advanceRoll', effect:{reroll:'all'}, scope:{who:'self'}}, {trigger:'chargeRoll', effect:{reroll:'all'}, scope:{who:'self'}}]` — the Advance roll gets the optional re-roll offer (movement.ts E3 path), the Charge roll the auto re-roll on an infeasible roll + offer otherwise (charge.ts). `scope self` = whole attached unit; if `collectAdvanceRerollKinds` / `collectChargeRerollKinds` only read the queried half, the hook agent extends them to `leaderService.halves` (test DAR-008) |
| Stoic Exemplar (DAR-3.1) | (a)+(b)+(c E1) | enhancement `effect:{trigger:'woundRoll', when:{weaponType:'melee'}, effect:{modifyRoll:{roll:'wound', value:-1}}, scope:{who:'attacker'}, code:'stoicExemplar'}` (attacker scope = attacks that target the holder unit, Sworn Protectors pattern). (b) `stoicExemplar`: `kind:'ability'`, `hook:'onWoundRoll'`, `run: noop`, `gateEffect(state, holder, entry, data)`: `attack = data.attack as AttackContext`; bearer unit = `state.models[entry.bearerModelId].unitId` (fallback `entry.holderUnitId`); return `attack.kind === 'melee' && leaderService.sameUnit(state, attack.targetUnitId, bearerUnit) && chargersIntoThisTurn(state, bearerUnit).some((c) => state.units[c]?.player !== state.units[bearerUnit].player)` (E1). |
| March of Vengeance (DAR-5.2) | (a)+(b)+(c E2) | stratagem `da.s.mj-march-of-vengeance`: `phases:['movement'], window:'movement.unitMoved', who:'active', condition:{phase:'movement', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'justMoved', count:1}]`, `effect:[{shootAfterFallBack:true}, {chargeAfterFallBack:true}]`, `scope:{who:'self'}`, `duration:'untilEndOfTurn'`, `code:'marchOfVengeance'`. (b) `marchOfVengeance`: `kind:'stratagem'`, `hook:'onEligibility'`, `run: noop`; `check(env, t)`: target on board, owned by `env.player`, `state.activePlayer === env.player`, and some half has `turn.moveType === 'fallBack'` (just Fell Back); `gateEffect(state, holder, _entry, data)`: `data.check === 'charge'` → `!shotThisTurn(state, holder.id)` (E2); any other check → `true`. Granting both and closing the charge door after shooting keeps the choice open until the Shooting phase, 1:1 with "either, not both". |
| Relic Munitions (DAR-5.3) | (a)+(b) | stratagem `da.s.mj-relic-munitions`: `category:'battleTactic', phases:['shooting'], window:'shooting.targetsDeclared', who:'reactive', condition:{phase:'shooting', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY', within:{of:'controlledObjective'}}, state:'targetedByAttack', count:1}]` (`controlledObjective` tests `o.controller === env.player`, the stratagem user; default inches = objective range), no `effect`, `duration:'untilEndOfPhase'`, `code:'relicMunitions'`. (b) `relicMunitions`: `kind:'stratagem'`, `hook:'onTargetsDeclared'`, `run: noop`; `check`: `state.phase === 'shooting'`, target on board and owned by `env.player`; `apply(ctx, env, t)`: `ctx.state.phaseState.marks.push(coverMarkKey(leaderService.canonicalUnitId(s, t.ids[0])))` (exported from hooks-impl; phase marks reset at phase end = "until end of phase") and emit `AbilityTriggered` "Relic Munitions: <unit> has the Benefit of Cover". Ignores Cover still beats it (native cover pipeline). |
| Endless Hunt (DAR-4.1) | (b) | secondary `scoring:[{id:'endless-hunt', when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'custom', code:'endlessHunt', pointsPer:3, cap:5, params:{enemyZonePoints:5, keyword:'INTERCESSOR SQUAD'}}]`; `endlessHunt = missionHook('endlessHunt','onTurnEnd')` + `case 'endlessHunt': return endlessHuntAmount(ctx, rule, pid)` in `missions.ts customAmount`, implemented in `factions/dark-angels.ts` as `endlessHuntAmount(ctx, rule, pid, controls)` (signature like `safeguardTheSanctuaryAmount`): `own = deploymentZone(s, pid)`, `enemy = deploymentZone(s, other)`; units = own board units where some half has `params.keyword` and no half is `battleShocked` (the unit qualifies as a whole, as in DAR-5.4); for each live marker with `controls(o.id)` and `!pointInPolygon(o.pos, own)` and some model of ANY half of such a unit (Mordekai included) `withinObjectiveRange(m, o, 0, range, radius)`: best = max(best, `pointInPolygon(o.pos, enemy) ? params.enemyZonePoints : pointsPer`); return best. |
| Archeotech Reliquary (DAR-4.2) | (b) | secondary `scoring:[{id:'archeotech-reliquary-pick', when:'round.start', rounds:{from:1,to:1}, who:'both', rule:'custom', pointsPer:0, cap:0, code:'archeotechReliquaryPick'}, {id:'archeotech-reliquary', when:'battle.end', rounds:{from:1,to:5}, who:'both', rule:'custom', pointsPer:10, cap:10, code:'archeotechReliquaryScore'}]`. (b) `archeotechReliquaryPick` (`kind:'mission'`, `hook:'onPhaseStart'`, `answer`) — `archeotechReliquaryOffer(ctx, owner, window, key)` copied from `divineJudgementOffer`: picker = opponent of `owner`; options = every non-removed objective (`id`, label = marker name/id, `hint:{objectiveId}`); `chooseOption` topic `abilityChoice`, `data:{window, key, code:'archeotechReliquaryPick', owner}`, `canPass:false`; answer validates the marker is live, stores `s.players[owner].secondaryState.archeotechObjectiveId`, emits `AbilityTriggered`, then resumes `ctx.services.missions.onWindow(ctx, window, key)`. Add the code to `PICK_CODES` and a `runPick` branch. (b) `archeotechReliquaryScore` (`kind:'mission'`, `hook:'onPhaseEnd'`, noop) + `case 'archeotechReliquaryScore'` in `customAmount`: id = stored marker; `0` if unset/removed; `holds(ctx, id, pid) ? rule.pointsPer : 0`. AI decider: the opponent's pick may use the generic `abilityChoice` fallback (picking a marker in its own deployment zone is the sensible default). |

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; the hooks code against these. Neither touches a frozen contract; add a one-line
note to `00-architecture.md` only if the engine agent decides to move the records into `types.ts` (not proposed).

**E1 — Turn-scoped charge record** (Stoic Exemplar). `src/engine/phases/charge.ts`:
```ts
// E1 (DA Stoic Exemplar): turn-scoped log of completed Charge moves (normal charges and Heroic Interventions)
// stored in state.mission.custom[CHARGE_LOG_KEY]; a log whose round/turn differ from the current ones is stale and empty
export const CHARGE_LOG_KEY = 'chargeLog'
export interface ChargeLog { round: number; turn: PlayerId; pairs: { charger: UnitId; target: UnitId }[] }
// canonical ids of every unit that ended a Charge move this turn with `unitId` (either half) among its charge targets
export function chargersIntoThisTurn(state: GameState, unitId: UnitId): UnitId[]
// internal, called from applyChargeMove after the models are placed
function recordChargeTargets(state: GameState, chargerUnitId: UnitId, targetUnitIds: UnitId[]): void
```
- `applyChargeMove`: after the `ChargeMoved` emit, call `recordChargeTargets(s, charge.unitId, charge.targetUnitIds)`.
  It stores canonical ids (`leaderService.canonicalUnitId`) for the charger and each target; if the stored log has
  `round !== s.round || turn !== s.activePlayer` it is replaced by a fresh one first. Heroic Intervention moves pass
  through `applyChargeMove` (`charge.heroic`), so they are logged too.
- A charge move must end within Engagement Range of every target and of no other enemy unit (R-8.4), so the target
  list equals "units the charger ended its Charge move within Engagement Range of". A failed charge is never logged.
- `chargersIntoThisTurn` compares with `leaderService.sameUnit(state, target, unitId)`.

**E2 — Turn-scoped "has shot" record** (March of Vengeance). `src/engine/phases/shooting.ts`:
```ts
// E2 (DA March of Vengeance): turn-scoped list of canonical unit ids selected to shoot this turn (not Overwatch),
// stored in state.mission.custom[SHOT_LOG_KEY]; stale when round/turn differ
export const SHOT_LOG_KEY = 'shotLog'
export interface ShotLog { round: number; turn: PlayerId; unitIds: UnitId[] }
export function shotThisTurn(state: GameState, unitId: UnitId): boolean
```
- Written at the point the Shooting phase marks a unit as selected to shoot (where `turn.shotThisPhase = true` /
  `phaseState.activated` is set for the active player's unit), storing `leaderService.canonicalUnitId`. Overwatch and
  other out-of-phase shooting (e.g. Fire Overwatch in the opponent's turn) are not recorded.
- `shotThisTurn` returns true when the current-turn log contains `canonicalUnitId(state, unitId)`.

## 8. Test IDs

Same list as the `DAR` section of 12-rules-test-checklist. Engine tests: `tests/engine/dark-angels.test.ts`;
data tests: `tests/data/dark-angels.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| DAR-001 | DAR-1 | patrol `da.cp.mordekais-judgement` loads (faction `dark-angels`): 4 units, 10 models; Mordekai is WARLORD with Stoic Exemplar, attached to the Intercessor Squad; default secondary Endless Hunt; stratagems are the three `da.s.mj-*` ids; the start screen lists Dark Angels as its own faction |
| DAR-002 | DAR-1.4, 6 | data: every stat/profile row of §6 matches; every datasheet has faction keywords ADEPTUS ASTARTES + DARK ANGELS; reused `sm.w.bolt-pistol` / `sm.w.close-combat-weapon` / `sm.w.power-weapon` and all SM patrols load unchanged |
| DAR-003 | DAR-2.1 | Oath of Moment: an Intercessor bolt rifle attack vs the Oath target re-rolls a failed hit; SM-vs-DA game keeps one Oath target per player |
| DAR-004 | DAR-6.1 | Litany of Hate: Mordekai leading Intercessors → their melee wound rolls +1 (close combat weapon S4 vs T4 wounds on 3+); ranged attacks unaffected; Mordekai unattached → no bonus |
| DAR-005 | DAR-3.1 | Stoic Exemplar: enemy unit charges Mordekai's unit → that turn every enemy melee attack against it −1 to wound (including a second enemy unit that did not charge); ranged attacks unaffected |
| DAR-006 | DAR-3.1 | Stoic Exemplar not active: no charge this turn (fight in a later turn); enemy charged a different unit; enemy charge failed; next turn the effect is gone |
| DAR-007 | DAR-3.1, E1 | Stoic Exemplar via Heroic Intervention: in the DA turn, an enemy unit heroically intervenes into Mordekai's unit → enemy melee attacks −1 to wound that Fight phase; `chargersIntoThisTurn` stale log from a previous turn returns [] |
| DAR-008 | DAR-3.2 | Zealous Wrath: Mordekai + Intercessors Advance → re-roll offer; charge roll that falls short is re-rolled; a die already re-rolled (Command Re-roll) is never re-rolled again |
| DAR-009 | DAR-4.1 | Endless Hunt: round 2, end of own turn, Intercessors on a controlled No Man's Land marker → 3 VP; on a controlled marker in the opponent's zone → 5 VP (not 8 when both); marker in own zone → 0; Mordekai attached, only Mordekai's model within range of a controlled No Man's Land marker → 3 VP (the combined unit is an INTERCESSOR SQUAD unit); attached Mordekai alone in range of a controlled marker in the opponent's zone → 5 VP |
| DAR-010 | DAR-4.1 | Endless Hunt: round 1 → 0; Intercessors Battle-shocked → 0; attached unit with either half Battle-shocked → 0; marker in range but controlled by the opponent → 0; Inceptors on the marker (no Intercessors) → 0; end of the opponent's turn → 0 |
| DAR-011 | DAR-4.2 | Archeotech Reliquary: start of round 1 the OPPONENT gets a `chooseOption` listing every live marker; DA controls it at battle end → 10 VP; does not → 0 |
| DAR-012 | DAR-4.2 | Archeotech Reliquary: the picked marker is later removed by a mission rule → 0; no pick offered in rounds 2–5; Endless Hunt chosen → no pick at all |
| DAR-013 | DAR-5.1 | Unyielding: own Command phase, Intercessors OC 2 → 3 through the opponent's turn, back to 2 at the next own Command phase; Mordekai alone and the Redemptor are not offered |
| DAR-014 | DAR-5.2 | March of Vengeance: Intercessors Fall Back → offered; used → eligible to shoot in that Shooting phase; if they did not shoot they may declare a charge |
| DAR-015 | DAR-5.2, E2 | March of Vengeance: after the unit shot this turn it is not eligible to charge; not offered after a Normal move or Advance, nor for the Redemptor; expires at end of turn; `shotThisTurn` ignores Overwatch |
| DAR-016 | DAR-5.3 | Relic Munitions: opponent targets Intercessors standing on a marker DA controls → offered; used → Benefit of Cover against every attack that phase (+1 save vs AP 0 per R-6 cover rules); Ignores Cover weapons bypass it |
| DAR-017 | DAR-5.3 | Relic Munitions not offered: unit not within range of a controlled marker; marker controlled by the opponent; untargeted unit; Redemptor (not INFANTRY); expires at the end of the phase |
| DAR-018 | DAR-5.4 | Keywords: unattached Mordekai (no INFANTRY on the CP card) is not a legal target for Unyielding / March of Vengeance / Relic Munitions / Go to Ground; attached Mordekai + Intercessors is |
| DAR-019 | DAR-6.2 | Redemptor at 4 wounds remaining: its hit rolls −1 (gatling cannon hits on 4+); at 5 wounds no penalty |
| DAR-020 | DAR-6 | Redemptor Deadly Demise D3: destroyed → roll D6; on a 6, D3 mortal wounds to each unit within 6" |
| DAR-021 | DAR-6 | Macro plasma incinerator: choose standard or supercharge per shooting; supercharge Hazardous 1 → Redemptor takes 3 mortal wounds; Blast adds +1 A per 5 target models |
| DAR-022 | DAR-6 | Icarus rocket pod: unmodified wound 2 vs a FLY unit is a critical wound; onslaught gatling cannon critical wounds become mortal wounds (Devastating Wounds) |
| DAR-023 | DAR-6 | Inceptors: Deep Strike from round 2 only (>9" from enemies); assault bolters Pistol — may shoot while in Engagement Range; Twin-linked re-rolls wound rolls; Sustained Hits 2 → 2 extra hits on a critical hit |
| DAR-024 | DAR-6 | Intercessor bolt rifle: Assault (may shoot after Advancing) and Heavy (+1 to hit when stationary) |
| DAR-025 | E1, E2 | Regression: storing `chargeLog` / `shotLog` in `mission.custom` leaves existing mission custom keys and replay hashes deterministic (same seed + actions → same hash) |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, true-scale to 28 mm); bases rules-true. The chapter **shares the SM figure
kits**: datasheet `figure` uses `{archetype:'infantry', kit:'sm-tacticus'}` (Mordekai, Intercessors),
`{archetype:'heavy', kit:'sm-terminator'}` (Inceptors, bulky Gravis) and `{archetype:'vehicle', kit:'generic-vehicle'}`
(Redemptor) exactly as SM datasheets reference them; the different look comes
from the `dark-angels` faction `paintScheme` (deep green `#1f3b2a`, bone `#d9cfb4`, dark red trim `#8e1b1b`) and
per-model parts (hood, robe tabard). GLB models are new slugs for the 3D pipeline. No chapter icons or logos.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `chaplain-mordekai` | `da.chaplain-mordekai/mordekai` | 1 | 1.2 | 40 mm | A chibi battle-priest in gloss-black power armour with bone-white trim, a pale skull-faced helmet with glowing red eyes, a long bone-coloured robe skirt, a winged golden mace raised high and a chunky ornate pistol in the other hand. |
| `intercessor-sergeant` | `da.intercessor-squad/sergeant` | 1 | 1.15 | 32 mm | A chibi armoured veteran in deep-green plate with a short bone-coloured robe tabard and red helmet stripe, a glowing blue-edged sword held forward and a stubby pistol at the hip. |
| `intercessor` | `da.intercessor-squad/intercessor` | 4 | 1.1 | 32 mm | A chibi armoured soldier in rounded deep-green plate with bone-white shoulder rims and green eye-lenses, holding a long chunky rifle across the chest. |
| `inceptor` | `da.inceptor-squad/inceptor` | 3 | 1.3 | 40 mm | A chibi heavy trooper in extra-bulky deep-green armour with a big twin-thruster jump pack blasting orange flame, a heavy compact gun in each fist and a squat helmet sunk between huge pauldrons. |
| `redemptor-dreadnought` | `da.redemptor-dreadnought/redemptor` | 1 | 2.8 | 90 mm | A chibi hulking walker with a boxy deep-green armoured body and bone trim, a tiny sarcophagus front plate, one arm a fat blue-glowing plasma cannon, the other a giant clawed fist with a spinning multi-barrel gun under it, and a small rocket pod on one shoulder. |

## 10. Other Dark Angels patrols (appendix)

- **The Vengeful Brethren** (wahapedia CP, last update April 2024) — Master Zacharial ×1 (CAPTAIN), Intercessor Squad ×10,
  Hellblaster Squad ×5, Bladeguard Veteran Squad ×3 (19 models); to be added later in add-patrol mode (verify its
  enhancements, secondaries and stratagems on the page then). Re-checked on wahapedia (April 2024): its three
  stratagems share the NAMES Unyielding, March of Vengeance and Relic Munitions with Mordekai's Judgement but the
  EFFECTS differ — Unyielding is an Epic Deed used in the Fight phase after an enemy selects targets (a destroyed
  ADEPTUS ASTARTES model fights on a 4+, +1 for BLADEGUARD VETERAN SQUAD); March of Vengeance is a Fight-phase
  Strategic Ploy allowing a 6" Consolidation; Relic Munitions is a Battle Tactic used in your own Shooting phase.
  Stratagem ids are therefore patrol-scoped: Mordekai's Judgement uses `da.s.mj-*`, The Vengeful Brethren will use
  `da.s.vb-*` (`da.s.vb-unyielding`, `da.s.vb-march-of-vengeance`, `da.s.vb-relic-munitions`); never the bare
  `da.s.<name>`.
