# Faction spec — Space Marines: Strike Team Solarien (second patrol)

Own-words data spec for the **second** Space Marines Combat Patrol, same shape as 11-combat-patrol §4 (the existing
patrol, Strike Force Octavius, is specified there and stays untouched). Rule ids `SOL-<section>.<n>` are cited by the
`SOL-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose here is ours.
Data id prefix: `sm.` (faction id `space-marines`, faction keyword ADEPTUS ASTARTES). Anything identical to the
Octavius patrol is cited by its existing id and not restated; every difference gets a new id.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| SM box "Strike Team Solarien" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/strike-team-solarien/ | Book "White Dwarf 10 (Strike Team Solarien)", last update **April 2024**; datasheets marked Combat-Patrol-only |
| Combat Patrol rules (Reserves never arrive in round 1; Scouts timing) | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | current |
| Existing SM patrol spec | docs/spec/11-combat-patrol.md §4 | — |

## 1. Roster

4 datasheets, **15 models** (as boxed). Faction keyword ADEPTUS ASTARTES; every unit is IMPERIUM, INFANTRY.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `lieutenant-solarien` | `sm.lieutenant-solarien` (new) | 1 | bolt pistol (BS 2+), master-crafted scoped bolt carbine, paired combat blades | **WARLORD**; default enhancement Auto-choral Resonators; Leader → Infiltrator Squad |
| `librarian-xarius` | `sm.librarian-xarius` (new) | 1 | bolt pistol, Smite (2 profiles), force weapon | Leader → Infiltrator Squad |
| `infiltrator-squad` | `sm.infiltrator-squad` (new) | 10 | each: bolt pistol, marksman bolt carbine, close combat weapon (one profile for all ten; no sergeant profile) | Patrol Squads: may split into 2 × 5 |
| `suppressor-squad` | `sm.suppressor-squad` (new) | 3 | each: accelerator autocannon, bolt pistol, close combat weapon | — |

- SOL-1.1 Default attachment: Solarien → Infiltrator Squad (patrol `attachTo: 'infiltrator-squad'`); Xarius unattached.
  One bodyguard takes one leader (R-10.1). If the squad is split (SOL-6.10), each 5-model half may take one of the two
  leaders, so both can be attached. The setup UI may change attachments within `leader.attachTo`.
- SOL-1.2 Patrol data uses `patrolSquads: [{ref:'infiltrator-squad-a', size:5, …}, {ref:'infiltrator-squad-b', size:5, …}]`
  (existing 20-data-schema field and `setup.ts splitPatrolSquad`).
- SOL-1.3 No wargear options: the box builds exactly the loadouts above.

## 2. Faction ability — Oath of Moment (every datasheet)

- SOL-2.1 Identical to CP-4.1: reuse `sm.a.oath-of-moment` (code `oathOfMomentPick`) on all four datasheets. No
  patrol-scoped faction ability is needed and `faction.json` `armyRule` is unchanged.

## 3. Enhancements (Lieutenant Solarien, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `sm.e.auto-choral-resonators` | Auto-choral Resonators | default | SOL-3.1 At the end of your Command phase, if the bearer's unit (attached unit included) is within range of a marker you control, that marker stays yours even with no models in range, until the opponent controls it at the start or end of any turn (same sticky rule as CP-2.6 / Duty and Honour, but automatic and free). |
| `sm.e.stealthy-hunter` | Stealthy Hunter | optional | SOL-3.2 The bearer gains Lone Operative and Stealth; its master-crafted scoped bolt carbine gains [ANTI-INFANTRY 4+], [DEVASTATING WOUNDS] and [PRECISION]. Lone Operative only protects while unattached (R-6.9); Stealth needs every model of the target unit to have it (R-6.8), so it is effectively live only while Solarien operates alone. |

Both: `restriction: {keyword: ['LIEUTENANT']}` (only Solarien can take them).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `sm.sec.reconnaissance-in-force` | Reconnaissance in Force | default | SOL-4.1 Battle round 2 onward, at the end of **your** turn: count No Man's Land markers (`home === null`, not removed) each player controls. If you control ≥1 and the counts are equal → 2 VP; if you control ≥1 and more than the opponent → 4 VP; otherwise 0. |
| `sm.sec.pinpoint-purge` | Pinpoint Purge | optional | SOL-4.2 Every time a model of your army destroys an enemy unit with a ranged attack (either player's turn, Overwatch included; mortal wounds from that ranged attack's Devastating Wounds count): 2 VP, or 3 VP if that unit was your Oath of Moment target at that moment. No per-turn cap (only the CP mission's overall VP limits apply). |

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `sm.s.vanguard-strike` | Vanguard Strike (Battle Tactic) | 1 | SOL-5.1 your Command phase (`command.start`, `command.end`) | one own ADEPTUS ASTARTES unit | +1 OC to its models until the start of your next Command phase (`untilNextTurn`) |
| `sm.s.giantslayer-doctrine` | Giantslayer Doctrine (Strategic Ploy) | 1 | SOL-5.2 your Shooting phase (`shooting.start`, `shooting.attacksResolved`) | one own SUPPRESSOR SQUAD unit that has not been selected to shoot this phase (`state:'notYetShot'`) | until end of phase its ranged weapons get AP improved by 1 and gain [ANTI-MONSTER 4+] and [ANTI-VEHICLE 4+] |
| `sm.s.rapid-repositioning` | Rapid Repositioning (Strategic Ploy) | 1 | SOL-5.3 opponent's Movement phase, just after an enemy unit ends a Normal, Advance or Fall Back move (`movement.unitMoved`) | one own PHOBOS unit within 9" of that enemy unit and not within Engagement Range of any enemy unit | the unit makes a Normal move of up to 3" |

Core stratagems per the page: CHARACTERs (Solarien, Xarius) may use Epic Challenge; the SMOKE units (Infiltrators,
Suppressors) may use Smokescreen — both already keyword-gated in core data. Suppressors are not PHOBOS, so Rapid
Repositioning never targets them.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Lieutenant Solarien | 1 | 40 mm | 6 | 4 | 3+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, IMPERIUM, PHOBOS, LIEUTENANT, LIEUTENANT SOLARIEN | Deep Strike; Infiltrators; Leader → Infiltrator Squad; Scouts 6"; Oath of Moment; Strategic Dispersal |
| Librarian Xarius | 1 | 40 mm | 6 | 4 | 3+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, IMPERIUM, PHOBOS, LIBRARIAN, LIBRARIAN XARIUS | Infiltrators; Leader → Infiltrator Squad; Oath of Moment; Shrouding (Psychic) |
| Infiltrator Squad | 10 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 1 | INFANTRY, SMOKE, IMPERIUM, PHOBOS, INFILTRATOR SQUAD | Infiltrators; Oath of Moment; Omni-scramblers; Patrol Squads |
| Suppressor Squad | 3 | 40 mm | 12 | 4 | 3+ | — | 2 | 6+ | 1 | INFANTRY, SMOKE, JUMP PACK, FLY, IMPERIUM, SUPPRESSOR SQUAD | Oath of Moment; Suppression Fire (no core abilities: no Deep Strike) |

Abilities (own words):
- SOL-6.1 **Strategic Dispersal** (`sm.a.strategic-dispersal`): in your Shooting phase, just after this model's unit
  (attached unit included) has shot, if it is not within Engagement Range of any enemy unit, it may make a Normal move
  of up to D6". Optional; once per unit activation; not after Overwatch.
- SOL-6.2 **Shrouding** (`sm.a.shrouding`, Psychic): while Xarius is leading a unit, every model of that unit (Xarius
  included) has Stealth, and the unit cannot be chosen as the target of a ranged attack unless the attacking model is
  within 12". No effect while unattached.
- SOL-6.3 **Omni-scramblers** (`sm.a.omni-scramblers`): enemy units arriving from Reserves (Deep Strike, Strategic
  Reserves, Rapid Ingress, any other Reserves arrival) cannot be set up within 12" (horizontal, base edge to base edge)
  of any model of this unit (its attached unit included). Each Patrol Squads half keeps it.
- SOL-6.4 **Suppression Fire** (`sm.a.suppression-fire`): in your Shooting phase, after this unit has shot, pick one
  enemy unit hit by ≥1 accelerator autocannon attack from this unit this phase. Until the start of your next turn,
  while this Suppressor unit is on the battlefield, that enemy unit is *suppressed*: each attack its models make gets
  −1 to the Hit roll (R-6 ±1 cap applies). Mandatory when a candidate exists (single candidate auto-picked).
- SOL-6.10 **Patrol Squads**: as existing (`patrolSquads` marker hook) — at the start of Declare Battle Formations the
  10-model squad may split into two 5-model units.
- Core: Deep Strike / Infiltrators / Scouts 6" / Leader are native (`coreAbilities`). Combined-unit rules already in
  the engine apply: an attached Solarien + Infiltrators may Infiltrate (all models have it) but can neither Scout nor
  Deep Strike (the Infiltrators lack both); Solarien alone may do either. Reserves never arrive in round 1 (CP rule).

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Lieutenant Solarien | — | bolt pistol (Solarien), master-crafted scoped bolt carbine | paired combat blades |
| Librarian Xarius | — | bolt pistol, Smite (2 profiles) | force weapon |
| Infiltrator Squad | ×10 | bolt pistol, marksman bolt carbine | close combat weapon |
| Suppressor Squad | ×3 | accelerator autocannon, bolt pistol | close combat weapon |

Weapon profiles (reused ids marked; every reused profile was checked equal to the CP page):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `sm.w.bolt-pistol-solarien` (new) | bolt pistol (Solarien) | 12" | 1 | 2+ | 4 | 0 | 1 | Pistol |
| `sm.w.master-crafted-scoped-bolt-carbine` (new) | master-crafted scoped bolt carbine | 24" | 2 | 2+ | 4 | 0 | 2 | — (+Anti-INFANTRY 4+, Devastating Wounds, Precision with Stealthy Hunter) |
| `sm.w.paired-combat-blades` (new) | paired combat blades | melee | 5 | 2+ | 4 | 0 | 1 | Sustained Hits 1 |
| `sm.w.bolt-pistol` (reuse) | bolt pistol (Xarius, Infiltrators, Suppressors) | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `sm.w.smite` (reuse) | Smite — witchfire | 24" | D6 | 3+ | 5 | −1 | D3 | Psychic |
| `sm.w.smite-focused` (reuse) | Smite — focused witchfire | 24" | D6 | 3+ | 6 | −2 | D3 | Psychic, Devastating Wounds, Hazardous |
| `sm.w.force-weapon` (reuse) | force weapon | melee | 4 | 3+ | 6 | −1 | D3 | Psychic |
| `sm.w.marksman-bolt-carbine` (new) | marksman bolt carbine | 24" | 2 | 3+ | 4 | 0 | 1 | Heavy |
| `sm.w.accelerator-autocannon` (new) | accelerator autocannon | 48" | 3 | **4+** | 8 | −1 | 2 | Heavy |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon | melee | 3 | 3+ | 4 | 0 | 1 | — |

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook in
`src/engine/factions/space-marines.ts` (new file; spread into `codeHooks` as `...spaceMarinesHooks`); (c) = engine
change beyond a code hook. **One additive, optional frozen-contract change** (documented in `00-architecture.md`): `Player.stratagemIds?` in
`types.ts` (patrol-scoped stratagem ownership, filled in `state.ts`, read by `stratagems.ts` `ownedBy`). No other (c) item
touches a frozen contract (`types/actions/events/hooks/rng/decider/index.ts`); new members go on `EngineCodeHook` (code-hooks.ts), `HookService` (hooks-impl.ts) and `MissionService` (missions.ts),
all non-frozen; signals reuse `AbilityTriggered`, `ObjectiveSecured`, `VpScored`, `UnitMoved`.
Reused mechanisms: `oathOfMomentPick`, `patrolSquads`/`splitPatrolSquad`, `dutyAndHonour`'s sticky marker
(`obj.stickyBy`), `unitsHitByWeapon` (CHA C3), `startReactiveMove` (Tyranid Skulking Horrors / Custodes Overawing
Magnificence), `grantsCoreAbility` (C5), `effects.grant` + `expires.kind:'nextOwnTurn'` (Tyranid Disruption Bombardment).

| Rule | Enc. | Encoding |
|---|---|---|
| Oath of Moment (SOL-2.1) | (a) | reuse `sm.a.oath-of-moment` |
| Deep Strike, Infiltrators, Scouts 6", Leader (SOL-6) | (a) | `coreAbilities` `DEEP_STRIKE`, `INFILTRATORS`, `SCOUTS` (value 6), `LEADER`; `leader.attachTo:['sm.infiltrator-squad']` on both characters |
| Patrol Squads (SOL-6.10) | (a) | existing ability pattern `{trigger:'always', code:'patrolSquads'}` as new `sm.a.patrol-squads` (text: two units of 5) + patrol `patrolSquads` entries |
| Auto-choral Resonators (SOL-3.1) | (b) | `autoChoralResonators` — `kind:'ability'`, `hook:'onPhaseEnd'`; enhancement descriptor `{trigger:'phaseEnd', when:{phase:'command', ownTurn:true}, code:'autoChoralResonators'}` (no effect). `runAt(ctx, entry, data)`: bearer = `s.abilities[entry.abilityId].bearerModelId`; if its unit is on the board, for every non-removed marker with `controller === bearer player` and any model of `leaderService.halves(bearerUnit)` within range (same `withinObjectiveRange(m, obj, 0, range, radius)` test `dutyAndHonour.check` uses — factor it into `unitWithinObjectiveRange(state, unitId, obj): boolean` in code-hooks.ts and reuse in both), set `obj.stickyBy = player` and emit `ObjectiveSecured {flag:'sticky'}`. If phaseEnd runs too late for a test, use the `command.end` window via `pick.offer` returning false after applying. |
| Stealthy Hunter (SOL-3.2) | (a)+(b)+(c E1) | (a) enhancement effect `{trigger:'always', scope:{who:'bearer'}, effect:[{when:{weaponId:'sm.w.master-crafted-scoped-bolt-carbine'}, grantWeaponAbility:{ability:'ANTI', keyword:'INFANTRY', value:4}}, {when:{weaponId:…}, grantWeaponAbility:{ability:'DEVASTATING_WOUNDS'}}, {when:{weaponId:…}, grantWeaponAbility:{ability:'PRECISION'}}], code:'stealthyHunter'}`. (b) `stealthyHunter`: `grantsCoreAbility(state, entry, unitId)` → `['LONE_OPERATIVE','STEALTH']` when `unitId` is the bearer model's own unit id, else `[]`. Lone Operative is already read through `hookService.hasCoreAbility` (shooting.ts `isLoneOperative`, which also drops it while attached). Stealth needs E1. |
| Reconnaissance in Force (SOL-4.1) | (b) | secondary `scoring:[{id:'reconnaissance-in-force', when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'custom', code:'reconnaissanceInForce', pointsPer:4, cap:4, params:{tiePoints:2}}]`; `reconnaissanceInForce = missionHook('reconnaissanceInForce','onTurnEnd')` + `case 'reconnaissanceInForce'` in `missions.ts customAmount`: `mine = count(o: !o.removed && o.home === null && o.controller === pid)`, `theirs` likewise for the opponent; `mine === 0 → 0`, `mine > theirs → pointsPer`, `mine === theirs → params.tiePoints`, else 0. |
| Pinpoint Purge (SOL-4.2) | (b)+(c E4) | secondary `scoring:[{id:'pinpoint-purge', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'pinpointPurge', pointsPer:2, cap:99, params:{oathPoints:3}}]`; `pinpointPurge = missionHook('pinpointPurge','onUnitDestroyed')`; in `missions.ts unitDestroyedHook` add `pinpointPurgeDestroyed(ctx, info)`: `pid = info.byPlayer`; requires `info.rangedAttack` (E4), the destroyed unit's owner ≠ pid, and a pid rule with that code in round range; amount = `params.oathPoints` when `leaderService.canonicalUnitId(info.unitId) === canonical(s.players[pid].oathTargetUnitId)`, else `pointsPer`; `awardVp` + push `mission.scored`. An attached unit whose two halves die separately scores only when its last half dies (the canonical unit is destroyed): skip when any other half of the same canonical unit is still on the board. |
| Vanguard Strike (SOL-5.1) | (a) | stratagem `phases:['command'], window:['command.start','command.end'], who:'active', condition:{phase:'command', ownTurn:true}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, count:1}]`, `effect:{modifyStat:{stat:'OC', value:1}}`, `scope:{who:'self'}`, `duration:'untilNextTurn'` (same shape as `cus.s.inescapable-vengeance`) |
| Giantslayer Doctrine (SOL-5.2) | (a) | stratagem `phases:['shooting'], window:['shooting.start','shooting.attacksResolved'], who:'active', condition:{phase:'shooting', ownTurn:true}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'SUPPRESSOR SQUAD'}, state:'notYetShot', count:1}]`, `effect:[{when:{weaponType:'ranged'}, modifyStat:{stat:'AP', value:-1}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'ANTI', keyword:'MONSTER', value:4}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'ANTI', keyword:'VEHICLE', value:4}}]` (distinct grant keys, so all three apply), `scope:{who:'self'}`, `duration:'untilEndOfPhase'` |
| Rapid Repositioning (SOL-5.3) | (b) | stratagem `phases:['movement'], window:'movement.unitMoved', who:'reactive'`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'PHOBOS'}, count:1}]`, `code:'rapidRepositioning'`, no effect. Hook `kind:'stratagem'`, `hook:'onMove'` (pattern: `overawingMagnificence`): `check(env,t)`: mover = `env.trigger.unitId` is an enemy board unit whose halves' `turn.moveType ∈ {'normal','advance','fallBack'}` (not a reinforcement/surge/reactive move), target on board, `leaderService.unitDistance(s, target, mover) <= 9 + EPS`, `!leaderService.inEngagementWithEnemy(s, target)`; `apply`: emit `AbilityTriggered` and `startReactiveMove(ctx, t.ids[0], 3, env.stratagem.id)`. |
| Strategic Dispersal (SOL-6.1) | (b) | `strategicDispersal` — ability `{trigger:'unitSelectedToShoot', code:'strategicDispersal'}`; `pick` at window `shooting.attacksResolved` (key = unit that just shot): offer only in the holder's own Shooting phase, when the unit that shot contains the holder model (`leaderService.halves`), mark `pick:dispersal:<canonicalUnitId>` absent, and `!leaderService.inEngagementWithEnemy`. Options `use` / `decline` (`useDeclineOptions`). `use`: roll D6 (`purpose:'ability'`), emit `AbilityTriggered`, `startReactiveMove(ctx, canonicalUnitId, roll, abilityId, 'shooting.attacksResolved')`. Offered after `suppressionFire` if both ever share a unit (they cannot in this roster). |
| Shrouding (SOL-6.2) | (b)+(c E1, E3) | `shrouding` — `kind:'ability'`, ability `{trigger:'always', code:'shrouding'}` (no effect). `grantsCoreAbility(state, entry, unitId)` → `['STEALTH']` when Xarius (holder) is attached (`leaderService.isAttached`) and `unitId ∈ leaderService.halves(state, holderUnitId)`; `targetRangeCap(state, entry, targetUnitId, firingModelId)` (E3) → `12` under the same condition, else `null`. |
| Omni-scramblers (SOL-6.3) | (b)+(c E2) | `omniScramblers` — ability `{trigger:'always', code:'omniScramblers'}`; `reserveExclusion(state, entry, arrivingPlayer)` (E2) → `{unitIds: leaderService.halves(state, holderCanonical) on board, distance: params.range ?? 12}` when `arrivingPlayer !== holder.player` and the holder is on the board, else `null`. |
| Suppression Fire (SOL-6.4) | (b) | `suppressionFire` — ability `{trigger:'unitSelectedToShoot', code:'suppressionFire', params:{weaponId:'sm.w.accelerator-autocannon'}}`; `pick` at `shooting.attacksResolved` (own Shooting phase, key = unit that just shot, mark `pick:suppress:<unitId>`): candidates = `unitsHitByWeapon(state, unitId, params.weaponId)` (CHA C3) still on board; 0 → nothing; 1 → apply; >1 → `chooseOption` topic `abilityChoice` over them. Apply: `effects.grant(ctx, targetId, [{modifyRoll:{roll:'hit', value:-1}}], {sourceAbilityId, sourceUnitId: suppressor, scope:{who:'self'}, duration:'untilNextTurn', when:null})`, then set `active.expires = {kind:'nextOwnTurn', round, player: suppressor.player}` (as Disruption Bombardment). `gateActive(state, entry)` → the source Suppressor unit is still `location:'board'` (effect dormant otherwise; it does not come back since the unit cannot return). Emit `AbilityTriggered` "suppressed". The grant is attacker-side (the suppressed unit's own attacks, Overwatch and melee included). |
| Weapon abilities (Pistol, Heavy, Sustained Hits 1, Psychic, Devastating Wounds, Hazardous, Anti-X, Precision) | (a) | native weapon abilities |
| FLY, JUMP PACK, SMOKE, PHOBOS, PSYKER | (a) | keywords; FLY is native movement; SMOKE gates Smokescreen; PHOBOS gates Rapid Repositioning |

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; hooks code against these.

**E1 — Stealth honours granted core abilities** (`src/engine/attack.ts`, `hitOpts`): replace the datasheet-only test
```ts
stealthHalves.every((id) => datasheetOf(s, id).coreAbilities.some((c) => c.ability === 'STEALTH'))
```
with
```ts
stealthHalves.every((id) => ctx.services.hooks.hasCoreAbility(s, id, 'STEALTH'))
```
(`HookService.hasCoreAbility` already folds in datasheet abilities and `grantsCoreAbility`). Every model of every half
must still have it (R-6.8). No signature change.

**E2 — Reserve-arrival exclusion zones** (Omni-scramblers):
```ts
// src/engine/code-hooks.ts, EngineCodeHook
// E2 (SM Omni-scramblers): enemy units arriving from Reserves for `arrivingPlayer` may not be set up within `distance`"
// (horizontal edge-to-edge) of any model of `unitIds`; null = no zone
reserveExclusion?(state: GameState, entry: HookSourceEntry, arrivingPlayer: PlayerId): { unitIds: UnitId[]; distance: number } | null

// src/engine/hooks-impl.ts, HookService (+ implementation looping sourcesFor/gateOpen like hasCoreAbility)
reserveExclusionZones(state: GameState, arrivingPlayer: PlayerId): { sourceUnitId: UnitId; unitIds: UnitId[]; distance: number }[]

// src/engine/phases/movement.ts (exported for tests / AI)
export function reserveExclusionPolygons(state: GameState, arrivingPlayer: PlayerId): Polygon[]
```
- `movement.ts resolveArrival` (every `ArrivalVia`: deepStrike, rapidIngress, strategicReserves, nextWave,
  teleportAssault, cultAmbush): after `checkPlacements` passes, for each zone and each placed model, if
  `horizontalGap(placedFootprint, zoneModelFootprint) <= zone.distance + EPS` → reject
  `{ code: 'E_ENGAGEMENT', reason: '<model> must be set up more than 12" from <unit> (Omni-scramblers)', details: { modelId, unitId: sourceUnitId } }`.
- `reserveExclusionPolygons` = for each zone model, a 32-gon circle centred on the model with radius
  `distance + model base radius` (circumscribed, so slightly conservative); appended to `constraints.forbidden` of the
  `deployUnit` decision raised for arrivals (so client/AI placement avoids the zone). The exact gap test above is
  authoritative.
- Setup deployment / Infiltrators are **not** affected (only arrivals from Reserves).

**E3 — Hook-supplied targeting range cap** (Shrouding):
```ts
// src/engine/code-hooks.ts, EngineCodeHook
// E3 (SM Shrouding): ranged attacks against `targetUnitId` from `firingModelId` are only legal within this many inches; null = no opinion
targetRangeCap?(state: GameState, entry: HookSourceEntry, targetUnitId: UnitId, firingModelId: ModelId): number | null

// src/engine/hooks-impl.ts, HookService — minimum of all non-null answers, or null
targetRangeCapFor(state: GameState, targetUnitId: UnitId, firingModelId: ModelId): number | null
```
`shooting.ts targetLegality`: `effRange = Math.min(weapon.range, loneOp ? 12 : Infinity, hookService.targetRangeCapFor(state, targetUnitId, firingModelId) ?? Infinity)`.
The hook must answer for either half id of an attached target (it resolves `leaderService.halves`). Overwatch uses the
same legality path, so it is capped too.

**E4 — Ranged-kill flag for mission scoring** (Pinpoint Purge):
```ts
// src/engine/missions.ts, MissionService
unitDestroyed?(ctx: EngineContext, info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null;
  byModelId: string | null; kind: AttackKind | 'mortal' | 'other'; rangedAttack: boolean }): void
```
`attack.ts destroyUnitTail` passes `kind: by.kind` and
`rangedAttack: by.kind === 'ranged' || (by.kind === 'mortal' && by.unitId !== null && s.phaseState.attack?.kind === 'ranged' && leaderService.canonicalUnitId(s, by.unitId) === leaderService.canonicalUnitId(s, s.phaseState.attack.attackerUnitId) && by.player !== unit.player)`
(Devastating Wounds mortal wounds of a ranged attack count; own Hazardous never does). Existing callers
(`treasuresUnitDestroyed`, `markedForExecutionDestroyed`, `hallowedRetributionUnitDestroyed`) ignore the new fields.

## 8. Test IDs

Same list as the `SOL` section of 12-rules-test-checklist. Engine tests: `tests/engine/space-marines-strike-team-solarien.test.ts`;
data tests: `tests/data/space-marines-strike-team-solarien.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| SOL-001 | SOL-1 | patrol loads (default): 4 units, 15 models; Solarien is WARLORD with Auto-choral Resonators, attached to the Infiltrator Squad; default secondary Reconnaissance in Force; Strike Force Octavius still loads unchanged |
| SOL-002 | SOL-1.2, 6.10 | Patrol Squads split → two 5-model Infiltrator units, each with Omni-scramblers; Solarien and Xarius can each attach to one half |
| SOL-003 | SOL-6 | data: every profile/stat row of §6 matches (accelerator autocannon BS 4+, Solarien bolt pistol BS 2+); reused weapon ids are unchanged |
| SOL-004 | SOL-2.1 | Oath of Moment: Infiltrator carbine attack vs the Oath target re-rolls the hit roll (shared `sm.a.oath-of-moment`) |
| SOL-005 | SOL-6 | Infiltrators: attached Solarien + Infiltrators may deploy >9" from the enemy zone and models; Suppressors may not |
| SOL-006 | SOL-6 | Scouts 6": unattached Solarien offered a Scouts move; attached Solarien + Infiltrators not offered |
| SOL-007 | SOL-6 | Deep Strike: unattached Solarien may go to Reserves; Infiltrators, Xarius, Suppressors may not |
| SOL-008 | SOL-3.1 | Auto-choral Resonators: end of own Command phase with Solarien's unit on a controlled marker → marker sticky (`ObjectiveSecured` sticky); unit leaves → still controlled; opponent gains higher OC at end of a turn → lost |
| SOL-009 | SOL-3.1 | Auto-choral Resonators: not in range / marker not controlled / opponent's Command phase → no sticky |
| SOL-010 | SOL-3.2 | Stealthy Hunter: unattached Solarien cannot be targeted from 13" by ranged attacks, can from 12"; ranged attacks against it −1 to hit |
| SOL-011 | SOL-3.2 | Stealthy Hunter: attached to Infiltrators → no Lone Operative range limit and no Stealth −1 (Infiltrators lack Stealth) |
| SOL-012 | SOL-3.2 | Stealthy Hunter carbine: unmodified wound 4 vs INFANTRY → critical wound → Devastating Wounds mortal wounds; may allocate to a visible CHARACTER (Precision); bolt pistol and blades unaffected |
| SOL-013 | SOL-4.1 | Reconnaissance in Force: round 2, end of own turn, 1 v 1 No Man's Land markers → 2 VP; 2 v 1 → 4 VP; 0 v 0 → 0; home markers ignored |
| SOL-014 | SOL-4.1 | Reconnaissance in Force: round 1 → 0; end of opponent's turn → 0 |
| SOL-015 | SOL-4.2 | Pinpoint Purge: own ranged attack destroys an enemy unit → +2 VP; Oath target → +3 VP; melee kill → 0; opponent's own Hazardous kill → 0 |
| SOL-016 | SOL-4.2 | Pinpoint Purge: kill by Overwatch in the opponent's turn scores; kill by Devastating Wounds mortal wounds of a ranged attack scores; attached unit scores once, when its last half is destroyed |
| SOL-017 | SOL-5.1 | Vanguard Strike: own Command phase, Infiltrators OC 1 → 2 through the opponent's turn; back to 1 at the start of the next own Command phase |
| SOL-018 | SOL-5.2 | Giantslayer Doctrine: Suppressor autocannon AP −1 → −2; unmodified wound 4 vs VEHICLE/MONSTER is a critical wound; not offered for a Suppressor unit that already shot; expires at phase end |
| SOL-019 | SOL-5.3 | Rapid Repositioning: enemy ends a Normal/Advance/Fall Back move within 9" of Infiltrators → offered; unit moves up to 3" (Normal-move rules, ends outside Engagement Range) |
| SOL-020 | SOL-5.3 | Rapid Repositioning not offered: target 9.5" away; target in Engagement Range; target is Suppressors (not PHOBOS); enemy unit arrived from Reserves |
| SOL-021 | SOL-6.1 | Strategic Dispersal: after Solarien's unit shoots (not engaged) → use/decline; use → D6 roll, Normal move up to that many inches; not offered when engaged or after Overwatch |
| SOL-022 | SOL-6.2 | Shrouding: Xarius leading Infiltrators → enemy ranged attack from 13" illegal (`E_NOT_IN_RANGE`), from 12" legal; ranged hits −1 (Stealth) |
| SOL-023 | SOL-6.2 | Shrouding: Xarius unattached → no range cap, no Stealth; Infiltrators alone → none |
| SOL-024 | SOL-6.3 | Omni-scramblers: enemy Deep Strike placement 11.9" from an Infiltrator model → rejected; 12.1" → accepted (all other arrival rules still apply) |
| SOL-025 | SOL-6.3 | Omni-scramblers: applies to Strategic Reserves / Rapid Ingress arrivals too; does not restrict the owner's own arrivals; the arrival decision's `constraints.forbidden` includes the zone polygons |
| SOL-026 | SOL-6.4 | Suppression Fire: autocannon hits enemy unit → it is suppressed: its attacks (ranged, melee, Overwatch) −1 to hit until the start of the SM player's next turn |
| SOL-027 | SOL-6.4 | Suppression Fire: two units hit → `chooseOption`; a unit hit only by bolt pistols is not a candidate; Suppressors destroyed → penalty ends at once |
| SOL-028 | SOL-6 | Accelerator autocannon Heavy: stationary Suppressors hit on 3+ (BS 4+ with +1) |
| SOL-029 | SOL-6 | Smite focused witchfire on Xarius: Hazardous 1 → Xarius (CHARACTER) takes 3 mortal wounds |
| SOL-030 | E1 | Stealth regression: datasheet Stealth units (other factions) unchanged; granted Stealth counted only when every half has it |
| SOL-031 | E4 | Mission regression: Treasures of Aeons / Marked for Execution / Hallowed Retribution unchanged with the new `unitDestroyed` fields |

## 9. Figures

Heights follow 30-figures (infantry H 1.1); bases rules-true. Colours from the existing SM paint scheme (deep blue
`#1b3a6b`, gold `#c9a227`) with dark-grey Phobos cloaks; no chapter icons or logos.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (house figure style, original; see docs/FIGURE-STYLE.md) |
|---|---|---|---|---|---|
| `lieutenant-solarien` | `sm.lieutenant-solarien/solarien` | 1 | 1.2 | 40 mm | A lightly armoured scout officer in deep-blue plate with gold trim, a hooded dark-grey camouflage cloak, a bare head with short hair and a visor pushed up, a long scoped carbine slung over one shoulder and twin short blades crossed at the back. |
| `librarian-xarius` | `sm.librarian-xarius/xarius` | 1 | 1.2 | 40 mm | A psychic warrior in sleek deep-blue armour with a pale-blue psychic hood frame behind the head, a tattered dark-grey hooded cloak, a glowing blue-white force blade in one hand and crackling blue light in the other. |
| `infiltrator-leader` | `sm.infiltrator-squad/leader` | 1 | 1.1 | 32 mm | A stealth trooper in streamlined deep-blue armour with a smooth faceplate helmet and a short antenna, a compact boxy carbine held ready and a small sensor pack on the back. |
| `infiltrator` | `sm.infiltrator-squad/infiltrator` | 9 | 1.1 | 32 mm | A stealth trooper in streamlined deep-blue armour with a smooth faceplate helmet with green eye-lenses, a compact boxy carbine with a long scope, and a slim backpack with a short aerial. |
| `suppressor-leader` | `sm.suppressor-squad/leader` | 1 | 1.2 | 40 mm | A jump-pack trooper in deep-blue armour with gold edging, a squat twin-thruster pack, and a long-barrelled rapid-fire cannon braced at the hip, with a short sensor fin on the helmet. |
| `suppressor` | `sm.suppressor-squad/suppressor` | 2 | 1.2 | 40 mm | A jump-pack trooper in deep-blue armour with a squat twin-thruster pack glowing orange, a long-barrelled rapid-fire cannon braced at the hip, and a round helmet with green lenses. |

## 10. Other Space Marines patrols (appendix)

- **Strike Force Octavius** (Index, June 2023) — Captain Octavius (WARLORD, Terminator armour), Librarian Tantus,
  Terminator Squad ×5, Infernus Squad ×5; already implemented (11-combat-patrol §4).
- Chapter patrols on wahapedia's Adeptus Astartes list are separate factions here and out of scope: Black Templars
  (Siguard's Crusaders), Blood Angels (Strike Force Marcellos), Dark Angels (Mordekai's Judgement, The Vengeful
  Brethren), Deathwatch (Vigil Force Alphion), Space Wolves (Thoryk's Void Hunters).
