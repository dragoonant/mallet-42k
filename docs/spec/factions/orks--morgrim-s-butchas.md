# Patrol spec — Orks: Morgrim's Butchas

Own-words data spec for the **second** Orks Combat Patrol, in the same shape as 11-combat-patrol §4. It covers only this
patrol. The Orks faction is already playable through Gordrang's Gitstompas (11-combat-patrol §5). Anything identical to
that patrol is cited by id and not restated. This file supersedes the compact appendix in 11-combat-patrol §6 wherever
the two differ. Rule ids `MOR-<section>.<n>` are cited by the `MOR-` rows of 12-rules-test-checklist. Mechanics are 1:1
with the source, and all prose here is ours. Data id prefix `ork.` (faction id `ork`, faction keyword `ORKS`).

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Orks "Morgrim's Butchas" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/morgrim-s-butchas/ | Index, 10th ed, April 2024 |
| Orks "Gordrang's Gitstompas" (already in game; checked for the page layout only) | https://wahapedia.ru/wh40k10ed_cp/factions/gordrang-s-gitstompas/ | Index, 10th ed, June 2023 |
| CP faction navigation (used to list patrols) | menu on the morgrim-s-butchas page | — (the CP index page returned HTTP 403) |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already in 11-combat-patrol §1–2; not fetched again |

Layout note: wahapedia's CP pages print one roster heading for each fielded unit. The Gitstompas page prints
"BOYZ (10 MODELS)" twice, and our data fields two Boyz units. The Butchas page prints "BEAST SNAGGA BOYZ (10 MODELS)"
twice in the same way, so this patrol fields **two** Beast Snagga Boyz units. The bracketed weapon keywords on the
page come out of the page converter as suffixes on the weapon name ("Slugga pistol", "Thump gun blast"). These read as
[PISTOL] and [BLAST], the same way "Rokkit launcha blast" is [BLAST] in the existing data.

## 1. Roster

4 units, 25 models. Every datasheet has the faction keyword ORKS.

| Ref | Unit (datasheet id) | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `beastboss` | Beastboss Morgrim (`ork.beastboss-morgrim`) | 1 | shoota (Beastboss profile); beastchoppa; Beast Snagga klaw | **WARLORD**. Leader → Beast Snagga Boyz; default `attachTo: snaggas-a`, and setup may switch it to `snaggas-b` or detach him |
| `snaggas-a` | Beast Snagga Boyz (`ork.beast-snagga-boyz`) | 10 | Nob: slugga, power snappa · 1 Boy: thump gun, close combat weapon · 8 Boyz: slugga, choppa | BATTLELINE |
| `snaggas-b` | Beast Snagga Boyz (`ork.beast-snagga-boyz`) | 10 | same as `snaggas-a` | BATTLELINE |
| `squighogs` | Squighog Boyz (`ork.squighog-boyz`) | 4 | Nob on Smasha Squig: slugga, big choppa (Squighog profile), squighog jaws · 3 Squighog Boyz: saddlegit weapons, stikka (ranged + melee profiles), squighog jaws | mixed bases |

The box build has no wargear options. The only leader attachment is Morgrim → one Beast Snagga Boyz unit.

## 2. Faction ability — Waaagh! (MOR-2.1)

The rule matches CP-5.1 exactly (once per battle at the start of a round; until the next round starts, the unit may
charge after Advancing, gets +1 S / +1 A on melee weapons, and has a 5+ invulnerable save). Every datasheet in this
patrol lists `ork.a.waaagh` unchanged. No patrol-scoped ability is needed and `faction.json` `armyRule` stays as it is.
The existing encoding leaves the +1 A off [EXTRA ATTACKS] weapons. In this patrol that weapon is the squighog jaws:
they get +1 S but not +1 A during a Waaagh!.

## 3. Enhancements (Beastboss Morgrim, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| MOR-3.1 | Half-chewed (`ork.e.half-chewed`) | default | The bearer's whole unit (attached Boyz included, `scope.who: self`) has Feel No Pain 5+. When a **ranged** attack is allocated to a model in that unit, add 1 to the **armour** saving throw. The bonus does not apply to an invulnerable save, and it counts toward the usual +1 save-modifier cap with cover. |
| MOR-3.2 | Bosskilla (`ork.e.bosskilla`) | optional | The bearer's melee weapons (`scope.who: bearer`, so the Boyz are unaffected) gain [PRECISION] and [SUSTAINED HITS 1]. |

Neither enhancement has a restriction beyond being on Morgrim (the WARLORD).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| MOR-4.1 | Bag the Big 'Un (`ork.sec.bag-the-big-un`) | default | At the start of battle round 1, pick one enemy MONSTER or VEHICLE **model**. If the enemy has none, pick the enemy WARLORD instead. At the end of the battle: 8 VP if that model has been destroyed, or 12 VP instead if your BEASTBOSS model destroyed it. Under R-5.16, Reserves that never arrived count as destroyed, with no killer (8 VP). |
| MOR-4.2 | Krumpin' Spree (`ork.sec.krumpin-spree`) | optional | At the end of each of your turns (every round): 3 VP if you control the objective marker nearest the opponent's battlefield edge, plus 1 VP for each **other** marker you control that is not inside your own deployment zone. **[interp]** The source does not cover ties. If two markers are equally near the edge (within 0.01"), they all count as "nearest": controlling any of them earns the 3 VP once, and each further tied marker you control counts as an "other" marker. "Inside your deployment zone" = the marker centre lies in your zone polygon, as in Proper Lootin'. There is no VP cap in the source. |

## 5. Patrol stratagems

| Id | Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|---|
| MOR-5.1 | Tough As Squig-hide (`ork.s.tough-as-squig-hide`) | 1 | battleTactic | `shooting.targetsDeclared` in the opponent's Shooting phase, or `fight.targetsDeclared` in either player's Fight phase, just after an enemy unit picks its targets | one own ORKS INFANTRY unit hit by one or more of those attacks | until the end of the phase, an attack against that unit whose S is greater than the unit's T gets −1 to wound. Same mechanic as Gene-wrought Resilience (CP-4.4). |
| MOR-5.2 | Bestial Bellow (`ork.s.bestial-bellow`) | 1 | epicDeed | `fight.start` (either player's turn) | one own BEASTBOSS or SQUIGHOG BOYZ model, then one enemy unit within 3" of that model | the enemy unit takes a Battle-shock test, with 1 subtracted from the 2D6 result |
| MOR-5.3 | Get In There! (`ork.s.get-in-there`) | 1 | battleTactic | `fight.unitSelected`: Fight phase (either turn), after an own ORKS unit is picked to fight and just before it Piles In | that ORKS unit | until the end of the phase, each Pile-in move by its models can be up to 6" instead of 3". Consolidation is unchanged. |

The core stratagems are the standard ones listed on each datasheet (Command Re-roll, Insane Bravery, Fire Overwatch,
Rapid Ingress, Go to Ground for INFANTRY, Heroic Intervention, Counter-Offensive 2 CP, and Epic Challenge for the
CHARACTER). Nothing changes.

## 6. Datasheets

### 6.1 Profiles

| Unit / model | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Abilities |
|---|---|---|---|---|---|---|---|---|---|---|
| Beastboss Morgrim (MOR-6.1) | 50 mm | 6" | 5 | 4+ | 5+ | 6 | 6+ | 1 | INFANTRY, CHARACTER, BEAST SNAGGA, WARBOSS, BEASTBOSS, MORGRIM | Feel No Pain 6+; Leader (Beast Snagga Boyz); Waaagh!; **Beastboss** (MOR-6.2): while he leads a unit, every melee attack by a model in that unit (Morgrim included) gets +1 to hit |
| Beast Snagga Boy (MOR-6.3) | 32 mm | 6" | 5 | 5+ | — | 1 | 7+ | 2 | INFANTRY, MOB, BATTLELINE, BEAST SNAGGA, BEAST SNAGGA BOYZ | Feel No Pain 6+; Waaagh!; **Monster Hunters** (MOR-6.4): each attack by a model in this unit (an attached Morgrim included) against a MONSTER or VEHICLE unit may re-roll its hit roll |
| Beast Snagga Nob | 32 mm | 6" | 5 | 5+ | — | 2 | 7+ | 2 | as Boy (champion model) | as Boy |
| Squighog Boy (MOR-6.5) | 75 × 42 mm oval | 10" | 7 | 4+ | — | 3 | 7+ | 2 | MOUNTED, BEAST SNAGGA, SQUIGHOG BOYZ | Feel No Pain 5+; Waaagh! |
| Nob on Smasha Squig | 90 × 52 mm oval | 10" | 7 | 4+ | — | 4 | 7+ | 2 | as Squighog Boy (champion model) | as Squighog Boy |

None of these units has Deep Strike, Scouts, Infiltrators, Stealth or Deadly Demise.

### 6.2 Weapons

Reused unchanged: `ork.w.slugga` (12", A1, BS5+, S4, AP0, D1, [PISTOL]). All other profiles below are **new ids**,
because a same-named Gitstompas profile differs or does not exist. Never edit `ork.w.shoota`, `ork.w.choppa`,
`ork.w.close-combat-weapon` or `ork.w.big-choppa`.

| New id | Name | Range | A | BS/WS | S | AP | D | Abilities | Carried by | Differs from |
|---|---|---|---|---|---|---|---|---|---|---|
| `ork.w.shoota-beastboss` | Shoota | 18" | 2 | 4+ | 4 | 0 | 1 | Rapid Fire 1 | Morgrim | `ork.w.shoota` (BS5+) |
| `ork.w.beastchoppa` | Beastchoppa | melee | 6 | 2+ | 6 | −1 | 2 | Anti-MONSTER 4+, Anti-VEHICLE 4+ | Morgrim | new |
| `ork.w.beast-snagga-klaw` | Beast Snagga klaw | melee | 4 | 3+ | 10 | −2 | 2 | Anti-MONSTER 4+, Anti-VEHICLE 4+ | Morgrim | new |
| `ork.w.thump-gun` | Thump gun | 18" | D3 | 5+ | 6 | 0 | 2 | Blast | 1 Boy per Snagga unit | new |
| `ork.w.choppa-snagga` | Choppa | melee | 3 | 3+ | 5 | −1 | 1 | — | 8 Boyz per Snagga unit | `ork.w.choppa` (S4) |
| `ork.w.close-combat-weapon-snagga` | Close combat weapon | melee | 2 | 3+ | 5 | 0 | 1 | — | thump-gun Boy | `ork.w.close-combat-weapon` (S4) |
| `ork.w.power-snappa` | Power snappa | melee | 4 | 3+ | 7 | −1 | 2 | — | Beast Snagga Nob | new |
| `ork.w.saddlegit-weapons` | Saddlegit weapons | 9" | 1 | 4+ | 3 | 0 | 1 | Assault | 3 Squighog Boyz | new |
| `ork.w.stikka-ranged` | Stikka (thrown) | 9" | 1 | 5+ | 5 | −1 | 2 | Assault, Anti-MONSTER 4+, Anti-VEHICLE 4+ | 3 Squighog Boyz | new |
| `ork.w.stikka` | Stikka | melee | 3 | 3+ | 5 | −1 | 2 | Anti-MONSTER 4+, Anti-VEHICLE 4+, Lance | 3 Squighog Boyz | new |
| `ork.w.big-choppa-squighog` | Big choppa | melee | 4 | 3+ | 6 | −1 | 2 | Anti-MONSTER 4+, Anti-VEHICLE 4+ | Nob on Smasha Squig | `ork.w.big-choppa` (A3, S7, no Anti) |
| `ork.w.squighog-jaws` | Squighog jaws | melee | 3 | 4+ | 6 | −1 | 2 | Extra Attacks | all 4 Squighog models | new |

Each stikka profile is its own weapon id. They are used in different phases, so there is no `profileGroup`. A model
with two non-Extra-Attacks melee weapons (Morgrim; the Squighog Nob has one plus the jaws) picks one of them each time
it fights, as usual.

### 6.3 Composition (data `composition[]`)

- `ork.beast-snagga-boyz`: `nob` (champion, W 2 via `statsOverride`, 1) · `boy-thump-gun` (1) · `boy-choppa` (8). All 32 mm round.
- `ork.squighog-boyz`: `nob-smasha-squig` (champion, W 4, base oval 90×52) · `squighog-boy` (3, oval 75×42).
- `ork.beastboss-morgrim`: `beastboss` (1, 50 mm), `leader.attachTo: ["ork.beast-snagga-boyz"]`.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9) or existing engine code; (b) = new code hook (body in
the new `src/engine/factions/orks.ts`, registered in `src/engine/code-hooks.ts` `codeHooks` the same way the lazily
imported Tyranid hooks are); (c) = engine change beyond a code hook. Note: **`src/engine/factions/orks.ts` does not exist
yet**. The Gitstompas hooks live inline in `code-hooks.ts`. The engine agent creates the file and leaves the existing
inline Ork hooks where they are.

| Rule | Enc. | Encoding |
|---|---|---|
| Waaagh! (MOR-2.1) | (a) | existing `ork.a.waaagh` / `waaaghCall`, listed in each new datasheet's `abilities` |
| Feel No Pain 6+ / 5+ (MOR-6.1/6.3/6.5) | (a) | `coreAbilities: [{ability:'FEEL_NO_PAIN', value:6}]` (Morgrim, Snaggas) / `value:5` (Squighogs) |
| Leader (MOR-1) | (a) | `coreAbilities: LEADER`, `leader.attachTo: ['ork.beast-snagga-boyz']`; patrol unit `beastboss` has `attachTo: 'snaggas-a'` |
| Beastboss (MOR-6.2) | (a) | ability `ork.a.beastboss`: `{trigger:'hitRoll', when:{weaponType:'melee', leaderAttached:true}, effect:{modifyRoll:{roll:'hit', value:1}}, scope:{who:'self'}}` (`leaderAttached` is checked against the holder = Morgrim; scope `self` covers the attached pair). Already in the checklist as WEAP-041 |
| Monster Hunters (MOR-6.4) | (a) | ability `ork.a.monster-hunters`: `{trigger:'hitRoll', when:{targetKeyword:['MONSTER','VEHICLE']}, effect:{reroll:'all'}, scope:{who:'self'}}` |
| Weapon abilities (MOR-6.6) | (a) | `ANTI {keyword, value:4}` ×2, `LANCE`, `ASSAULT`, `BLAST`, `PISTOL`, `RAPID_FIRE 1`, `EXTRA_ATTACKS`, all existing enums |
| Mixed oval bases (MOR-6.5) | (a) | per-model `base: {shape:'oval', mm, mm2}`, as the Deffkoptas have |
| Half-chewed FNP (MOR-3.1) | (a) | enhancement effect `{trigger:'feelNoPainRoll', effect:{feelNoPain:5}, scope:{who:'self'}}`; the existing best-single-FNP rule picks 5+ over 6+ (SHOOT-035) |
| Half-chewed armour +1 vs ranged (MOR-3.1) | **(c)** + (a) | data `{trigger:'saveRoll', when:{weaponType:'ranged'}, effect:{modifyRoll:{roll:'save', value:1, armourOnly:true}}, scope:{who:'self'}}`. Today a `modifyRoll` save modifier also improves an invulnerable save (`attack.ts` adds `hookPositive` to `invulnTarget`), and that is wrong for "armour saving throw". See §7.1 C1 |
| Bosskilla (MOR-3.2) | (a) | `[{trigger:'always', when:{weaponType:'melee'}, effect:{grantWeaponAbility:{ability:'PRECISION'}}}, {trigger:'always', when:{weaponType:'melee'}, effect:{grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}}]`, scope `bearer` (same pattern as Champion Duellist, LEAD-015) |
| Bag the Big 'Un pick (MOR-4.1) | (a) + (b) registry | `scoring: [{id:'bag-pick', when:'round.start', rounds:{from:1,to:1}, rule:'custom', code:'bagPick', pointsPer:0, cap:0}, {id:'bag-score', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', code:'bagTheBigUnScore', pointsPer:0, cap:12, params:{beastbossPoints:12, unitPoints:8}}]`. The logic already exists in `missions.ts` (`bagPickRule`, `bagTheBigUnAmount`, decision topic `bagTarget`), but **`bagPick` and `bagTheBigUnScore` are not registered in `codeHooks`**. Add `bagPick: missionHook('bagPick')` and `bagTheBigUnScore: missionHook('bagTheBigUnScore')` so data validation accepts the codes |
| Bag the Big 'Un model-level target (MOR-4.1) | (b) (missions.ts, not frozen) | Today the target is a **unit** (`secondaryState.bagTargetUnitId`) and scoring needs the whole unit destroyed. That is right for single-model MONSTER/VEHICLE units, wrong for multi-model ones (Deffkoptas). Also, `destroyedBy.unitId === warlordUnitId` credits a kill by Morgrim's own unit half, which is fine, since his half holds only him. Refinement (see §7.1 B3): the pick lists models; a `modelDestroyed` listener records the killer; scoring reads the model. Unit-level behaviour stays for existing tests (MISSION-036) |
| Krumpin' Spree (MOR-4.2) | (b) | new mission code `krumpinSpreeScore`: `scoring:[{id:'krumpin-spree', when:'turn.end', who:'active', rounds:{from:1,to:5}, rule:'custom', code:'krumpinSpreeScore', pointsPer:3, cap:99, params:{nearestPoints:3, otherPoints:1}}]`; register `krumpinSpreeScore: missionHook('krumpinSpreeScore', 'onTurnEnd')`; amount fn in `missions.ts` (§7.1 B2) |
| Tough As Squig-hide (MOR-5.1) | (a) | copy of `sm.s.gene-wrought-resilience`: `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}]` (every unit in the army is ORKS, so INFANTRY is the only filter needed; MOUNTED Squighogs are excluded, see STRAT-028), `when:{strengthVsToughness:'gt'}`, `effect:{modifyRoll:{roll:'wound', value:-1}}`, `scope:{who:'attacker'}`, `duration:'untilEndOfPhase'` |
| Bestial Bellow (MOR-5.2) | (b) | new stratagem hook `bestialBellow` (§7.1 B1). Data: `category:'epicDeed'`, `window:['fight.start']`, `who:'either'`, `targets:[{role:'model', owner:'friendly', filter:{keyword:'BEAST SNAGGA'}}, {role:'unit', owner:'enemy', filter:{within:{of:'previousTarget', inches:3}}}]`, `code:'bestialBellow'`. The keyword filter takes only one keyword, so `check` narrows the first target to BEASTBOSS or SQUIGHOG BOYZ. The forced test reuses `hookService.battleShockTest(ctx, unitId, source, -1)` (already tested as STRAT-027) |
| Get In There! (MOR-5.3) | (a) | reuse `getStuckInDistance`: `window:['fight.unitSelected']`, `who:'either'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ORKS'}, state:'selectedToFight', count:1}]`, `code:'getStuckInDistance'`, `params:{pileIn:6, pileInOnly:true}`, `duration:'untilEndOfPhase'`. `hooks-impl.ts` `getStuckIn()` already honours `pileInOnly` (consolidation stays 3"). The `fight.unitSelected` window opens before the pile-in decision (`fight.ts` ~l.860) |
| Patrol / faction wiring | (a) | `patrols/morgrim-s-butchas.json` (id `ork.cp.morgrims-butchas`, `warlord:'beastboss'`, stratagems ×3, enhancements Half-chewed default / Bosskilla, secondaries Bag the Big 'Un default / Krumpin' Spree). Append the id to `faction.json` `combatPatrols` (append only; do not touch the Gitstompas detachment lists) |

### 7.1 Exact signatures

**C1 — armour-only save modifier (engine change; touches a FROZEN contract).**

- `src/data/types.ts` (not frozen): `modifyRoll?: { roll: RollName; value: number; armourOnly?: boolean }`. `src/data/schema/common.schema.json` `Effect.modifyRoll.properties` adds `"armourOnly": {"type": "boolean"}`. 20-data-schema §3 effect table: `modifyRoll` `{roll, value, armourOnly?}`, where `armourOnly` is honoured for `roll:'save'` only.
- **`src/engine/hooks.ts` (FROZEN)**: `RollModifierResult` adds `armourOnly?: boolean // onSaveRoll only: the modifier applies to an armour save, never to an invulnerable save (Half-chewed)`. This needs the matching line in `docs/spec/00-architecture.md` and a note in the agent's `issues`.
- `src/engine/hooks-impl.ts` effect → result mapping (~l.441): `case 'modifyRoll': return { kind: 'roll', modifier: e.modifyRoll!.value, ...(e.modifyRoll!.armourOnly ? { armourOnly: true } : {}) }`.
- `src/engine/attack.ts` save setup (~l.758–780): sum pre-pass modifiers into `hookPositive` (general) and `hookPositiveArmour` (`r.armourOnly`). Then `armourTarget = saveTarget(sv, weapon.AP, hookPositive + hookPositiveArmour + (cover ? 1 : 0), preNegative)`, `invulnTarget = saveTarget(invuln, 0, hookPositive, preNegative)`, and `prePositive = hookPositive + (kind === 'armour' ? hookPositiveArmour + (cover ? 1 : 0) : 0)`. In `evaluateSave`, skip any result with `r.armourOnly` when `setup.kind === 'invuln'`. The total positive stays capped at +1 (`Math.min(1, positive)`).

**B1 — `bestialBellow` (stratagem hook, `src/engine/factions/orks.ts`).**
```ts
export function bestialBellowCheck(env: StratagemEnv, tuple: StratagemTuple): boolean
// true iff tuple.ids[0] is a friendly board model whose unit has keyword BEASTBOSS or SQUIGHOG BOYZ
export function bestialBellowApply(ctx: EngineContext, env: StratagemEnv, tuple: StratagemTuple): void
// enemy = leaderService.canonicalUnitId(state, tuple.ids[1]); emit AbilityTriggered{abilityId: env.stratagem.id,
// sourceUnitId: unit of tuple.ids[0], targetUnitId: enemy, summary: 'Battle-shock test (−1)', player: env.player};
// hookService.battleShockTest(ctx, enemy, env.stratagem.id, -1)
```
Registry entry: `bestialBellow: { name: 'bestialBellow', kind: 'stratagem', hook: 'onPhaseStart', run: noop, check: (e, t) => ork.bestialBellowCheck(e, t), apply: (c, e, t) => ork.bestialBellowApply(c, e, t) }`.
If `filter.within.of:'previousTarget'` does not resolve a **model** id as the previous target (`stratagems.ts`
`footprintsOf(state, prevId)`), the check also measures the 3" itself: any enemy model within 3" of that model's base.

**B2 — `krumpinSpreeScore` (mission code, `src/engine/missions.ts`).**
```ts
function krumpinSpreeAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId): number
// opp = otherPlayer(pid); edge = playerBattlefieldEdge(s.board, deploymentZone(s, opp)) ('L'|'R'|'T'|'B', geometry.ts:491);
// dist(o) = distance from o.pos to that board edge line; live = objectives not removed;
// nearest = live with dist within 0.01 of min dist; ownZone = deploymentZone(s, pid);
// total = (nearest.some(o => holds(ctx, o.id, pid)) ? params.nearestPoints(3) : 0)
//       + count(o in live, holds(ctx,o.id,pid), o is not the one nearest marker that paid the 3 VP, !pointInPolygon(o.pos, ownZone)) * params.otherPoints(1)
```
Wire it with `case 'krumpinSpreeScore': return krumpinSpreeAmount(ctx, rule, pid)` in `customAmount`.

**B3 — Bag the Big 'Un by model (`src/engine/missions.ts`, optional refinement).**
```ts
// secondaryState keys (Record<string, unknown>, no type change): bagTargetModelId?: ModelId; bagKilled?: boolean;
// bagKilledByModelId?: ModelId | null
function bagTheBigUnModelDestroyed(ctx: EngineContext, info: ModelDestroyedInfo): void
// for each player p whose secondaryState.bagTargetModelId === info.modelId: bagKilled = true, bagKilledByModelId = info.byModelId
```
Call it from `missionService.modelDestroyed`. `bagPickRule` offers one option per model of each candidate unit (option id
= model id; the label is the unit name plus "#n" for multi-model units). `handleBagTarget` accepts a model id (it sets
`bagTargetModelId` and `bagTargetUnitId` = that model's unit) or a unit id (legacy). `bagTheBigUnAmount`: when
`bagTargetModelId` is set, return `beastbossPoints` if `bagKilledByModelId` is the warlord's model, else `unitPoints`
if `bagKilled` (or the unit is still in Reserves / was culled), else 0.

## 8. Test IDs

Same list as the `MOR` section of 12-rules-test-checklist. Engine tests go in `tests/engine/orks-morgrim-s-butchas.test.ts`
and data tests in `tests/data/orks-morgrim-s-butchas.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| MOR-001 | MOR-1 | data: patrol `ork.cp.morgrims-butchas` loads; 4 units / 25 models (1 + 10 + 10 + 4); warlord `beastboss`; Morgrim attached to `snaggas-a` by default; listed in `faction.json` `combatPatrols` after the Gitstompas |
| MOR-002 | MOR-6.1 | data: Morgrim M6 T5 Sv4+ inv 5+ W6 Ld6+ OC1, 50 mm, keywords include BEASTBOSS and WARBOSS, FNP 6, LEADER → Beast Snagga Boyz |
| MOR-003 | MOR-6.3 | data: Beast Snagga Boyz T5 Sv5+ W1 (Nob 2) OC2, 32 mm, BATTLELINE; wargear Nob slugga + power snappa, 1 thump gun + ccw, 8 slugga + choppa |
| MOR-004 | MOR-6.5 | data: Squighog Boyz M10 T7 Sv4+ W3 (Nob 4), FNP 5, MOUNTED (not INFANTRY); bases 75×42 / 90×52 oval |
| MOR-005 | MOR-6.6 | data: every new weapon profile matches §6.2; Gitstompas weapons (`ork.w.shoota`, `choppa`, `close-combat-weapon`, `big-choppa`) unchanged |
| MOR-006 | MOR-2.1 | Waaagh! called: a Snagga choppa fights at S6 A4 with a 5+ invuln; squighog jaws S7, A stays 3; Squighogs may charge after Advancing |
| MOR-007 | MOR-6.2 | Morgrim attached: a Boy's melee hit roll of 3 (needs 3+) +1 → a natural 2 hits; ranged hit rolls unchanged; a detached Snagga unit gets no bonus |
| MOR-008 | MOR-6.4 | Snagga Boyz vs a VEHICLE: a failed hit may be re-rolled; vs INFANTRY: no re-roll; an attached Morgrim's attacks vs a VEHICLE may re-roll too |
| MOR-009 | MOR-6.6 | beastchoppa vs a VEHICLE: unmodified wound 4 → critical wound; stikka on a charge turn +1 to wound (Lance); saddlegit weapons fire after Advancing (Assault) |
| MOR-010 | MOR-3.1 | Half-chewed: an attached Snagga Boy loses a wound → FNP rolled at 5+ (not 6+), one roll |
| MOR-011 | MOR-3.1 | Half-chewed: ranged AP0 vs a Snagga Boy (Sv5+) → saves on 4+; melee AP0 → 5+; with cover still 4+ (cap +1) |
| MOR-012 | MOR-3.1 | Half-chewed C1: during a Waaagh!, ranged AP−2 vs a Snagga Boy → armour 6+, invuln 5+ (not 4+); the auto-pick takes the invuln at 5+ |
| MOR-013 | MOR-3.2 | Bosskilla: Morgrim's beastchoppa hit 6 → 1 extra hit (Sustained Hits 1) and Precision allocation to an attached enemy CHARACTER; Boyz' choppas unaffected; shoota unaffected |
| MOR-014 | MOR-4.1 | Bag the Big 'Un: round 1 start offers enemy MONSTER/VEHICLE models; with none, only the enemy WARLORD |
| MOR-015 | MOR-4.1 | Bag the Big 'Un: target killed by Morgrim → 12 VP at battle end; killed by a Snagga Boy in his attached unit → 8; alive → 0; Reserves never arrived → 8 |
| MOR-016 | MOR-4.1 | Bag the Big 'Un (B3): one model of a 3-model VEHICLE unit picked → its death alone scores 8 at battle end, even though the unit survives |
| MOR-017 | MOR-4.2 | Krumpin' Spree: end of own turn, holding the marker nearest the enemy edge plus one more marker outside own DZ → 4 VP; holding only a marker in own DZ → 0 |
| MOR-018 | MOR-4.2 | Krumpin' Spree: not scored at the end of the opponent's turn; two markers tied for nearest and both held → 3 + 1 = 4 |
| MOR-019 | MOR-5.1 | Tough As Squig-hide: S6 attack vs Snagga Boyz (T5) → −1 to wound; S5 → unchanged; offered in the opponent's Shooting and either Fight phase; not offered for Squighogs (MOUNTED) |
| MOR-020 | MOR-5.2 | Bestial Bellow: start of the Fight phase, Morgrim 2" from an enemy unit → offered; the enemy rolls 2D6 −1 vs its Ld (7 → 6 passes vs Ld 6+, 6 → 5 fails) |
| MOR-021 | MOR-5.2 | Bestial Bellow: offered for a Squighog Boy model; not for a Beast Snagga Boy model; not for an enemy 4" away; 1 CP spent once |
| MOR-022 | MOR-5.3 | Get In There!: offered when an own ORKS unit is picked to fight; pile-in allowance 6"; consolidation still 3"; not offered for an enemy unit |
| MOR-023 | MOR-1 | e2e: the start-screen patrol picker lists Morgrim's Butchas for Orks; starting with it fields 4 units; an AI-vs-AI sim game with this patrol completes 5 rounds without an engine error |

## 9. Figures

Heights follow 30-figures (MGSD proportions: about 2.5 heads, a huge head, stubby legs; infantry about H 1.1, heavy
about 1.3). Bases are rules-true. Colours follow the Orks paint scheme (green skin, rust red, brass trim) with this
patrol's own bone-and-hide trophies.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `beastboss-morgrim` | `ork.beastboss-morgrim/beastboss` | 1 | 1.45 | 50 mm | A chibi hulking green-skinned brute chieftain in rust-red plate scraps under a huge horned beast-skull helmet with a furry pelt cloak, swinging an oversized jagged bone-and-iron cleaver in one fist and a big brass crushing claw on the other arm. |
| `beast-snagga-boy` | `ork.beast-snagga-boyz/boy-choppa` | 16 | 1.1 | 32 mm | A chibi stocky green brute with a tusked underbite, bone necklaces and a hide loincloth, waving a crude chunky cleaver and a stubby brass-banded pistol. |
| `beast-snagga-thump-gun` | `ork.beast-snagga-boyz/boy-thump-gun` | 2 | 1.1 | 32 mm | The same chibi tusked green brute hefting a fat short-barrelled drum grenade launcher with a rust-red muzzle, wearing a fur pelt over one shoulder. |
| `beast-snagga-nob` | `ork.beast-snagga-boyz/nob` | 2 | 1.25 | 32 mm | A bigger chibi green brute boss wearing a toothy animal-jaw helmet, with a big brass mechanical snapping pincer on one arm and a stubby pistol in the other hand. |
| `squighog-boy` | `ork.squighog-boyz/squighog-boy` | 3 | 1.7 | 75 × 42 mm oval | A chibi green rider on a round tusked red-orange beast with a huge toothy mouth and tiny legs, holding a long barbed spear, with a little goblin sidekick on the saddle waving a tiny gun. |
| `nob-on-smasha-squig` | `ork.squighog-boyz/nob-smasha-squig` | 1 | 1.9 | 90 × 52 mm oval | A chibi armoured green boss riding an even larger spiky red-orange tusked beast in a brass muzzle cage, raising a heavy jagged cleaver over its horned helmet. |

## 10. Other Orks patrols (appendix)

- **Gordrang's Gitstompas**: Index, June 2023 (already playable, 11-combat-patrol §5). Warboss Gordrang ×1 (WARLORD), Boyz 2 × 10, Deffkoptas ×3, Deff Dread ×1. 5 units, 25 models.
