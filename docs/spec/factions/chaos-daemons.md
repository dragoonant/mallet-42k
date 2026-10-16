# Faction spec — Chaos Daemons: Butchers of Hyporia

Own-words data spec for the Chaos Daemons Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `DMN-<section>.<n>`
are cited by the Chaos Daemons rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of
prose here is ours (no Games Workshop wording).

New faction: id `chaos-daemons`, data id prefix `cdm.`, data folder `src/data/factions/chaos-daemons/`, engine hooks in
`src/engine/factions/chaos-daemons.ts` (export `chaosDaemonsHooks`, spread into `codeHooks` in `code-hooks.ts`), engine
rules in the new `src/engine/shadow.ts` (§7.1). Faction keyword LEGIONES DAEMONICA on every datasheet; every datasheet
also carries CHAOS, DAEMON and KHORNE.

**Test-ID prefix.** The brief asked for `CHA-`, but `CHA-001…CHA-034` already belong to Chaos Space Marines (Zarkan's
Daemonkin) in 12-rules-test-checklist and in test names (`tests/engine/chaos-space-marines-core.test.ts`). Coverage is
measured by test names, so this faction's tests are numbered **CHA-101 … CHA-130** (same prefix, a range that cannot
collide). Rule refs use `DMN-`.

## 0. Sources (accessed 2026-10-16)

| Source | URL | Version shown on page |
|---|---|---|
| Chaos Daemons box "Butchers of Hyporia" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/butchers-of-hyporia/ | Book "Butchers of Hyporia", kind **Index**, edition 10, last update **June 2023** |
| CP navigation (patrol enumeration) | faction menu on the page above | lists exactly **one** Chaos Daemons patrol: Butchers of Hyporia |
| Combat Patrol rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | not re-read; 11-combat-patrol §1 already encodes it |

The page was read in four passes (roster/rules, fine print, Shadow of Chaos detail, stat verification); every number in
§6 was confirmed twice.

## 1. Roster

4 datasheets, 6 units, **34 models** (as boxed). Faction keyword LEGIONES DAEMONICA.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `khharret` | `cdm.khharret-the-butcher` | 1 | blade of blood | **WARLORD** (BLOODMASTER); default enhancement Incarnated Rage; Leader → Bloodletters |
| `bloodletters-1` | `cdm.bloodletters` | 10 | 8 × hellblade; 1 × hellblade + daemonic icon; 1 × hellblade + instrument of Chaos | led by Kh'har'ret |
| `bloodletters-2` | `cdm.bloodletters` | 10 | as `bloodletters-1` | — |
| `flesh-hounds-1` | `cdm.flesh-hounds` | 5 | Gore Hound: burning roar, gore-drenched fangs, collar of Khorne. 4 Flesh Hounds: gore-drenched fangs, collar of Khorne | — |
| `flesh-hounds-2` | `cdm.flesh-hounds` | 5 | as `flesh-hounds-1` | — |
| `bloodcrushers` | `cdm.bloodcrushers` | 3 | each: hellblade + Juggernaut's bladed horn; one also carries a daemonic icon, one an instrument of Chaos | — |

- DMN-1.1 Default attachment: Kh'har'ret → `bloodletters-1` (patrol `attachTo: 'bloodletters-1'`); the setup UI may move
  him to `bloodletters-2` or detach him. Bloodletters are his only Bodyguard datasheet.
- DMN-1.2 No wargear options. The daemonic icon and instrument of Chaos have **no rules effect** on this page (they
  appear only in the composition lines) — cosmetic model variants. Model keys: `bloodletter` (8), `bloodletter-icon` (1),
  `bloodletter-musician` (1); `gore-hound` (1), `flesh-hound` (4); `bloodcrusher` (1), `bloodcrusher-icon` (1),
  `bloodcrusher-musician` (1). No model is a champion (no Bloodreaper / Bloodhunter on the page).
- DMN-1.3 New faction record `src/data/factions/chaos-daemons/faction.json`: `{id:'chaos-daemons', name:'Chaos Daemons',
  factionKeyword:'LEGIONES DAEMONICA', armyRule:'cdm.a.shadow-of-chaos', detachments:[{id:'cdm.d.butchers-of-hyporia',
  name:'Butchers of Hyporia', rule:'cdm.a.shadow-of-chaos', stratagems:['cdm.s.blood-maddened-banishment',
  'cdm.s.empyric-predators','cdm.s.manifest-hate'], enhancements:['cdm.e.incarnated-rage','cdm.e.warp-locus']}],
  paintScheme:{primary:'#8e1a14', secondary:'#2b1d18', trim:'#b8862b', metal:'#7d7f84', decal:'#e9dcb6'},
  combatPatrols:['cdm.cp.butchers-of-hyporia']}`. Patrol file `patrols/butchers-of-hyporia.json`, default secondary
  `cdm.sec.worthy-offerings`.

## 2. Faction ability — The Shadow of Chaos (every datasheet)

- DMN-2.1 **Areas of the Shadow.** Each player whose army has this ability has a *Shadow of Chaos*:
  (a) their own deployment zone is always inside it;
  (b) No Man's Land is inside it for one phase when, at the start of that phase, the player controls at least half of
  the objective markers in No Man's Land;
  (c) the opponent's deployment zone is inside it for one phase when, at the start of that phase, the player controls at
  least half of the objective markers in that zone;
  (d) with Warp Locus (DMN-3.2), the area within 3" of the bearer is inside it.
- DMN-2.2 **Daemonic Manifestation.** Each time a unit of that player's army takes a Battle-shock test while it is within
  their Shadow, add 1 to the test. If the test is passed, one model of the unit regains up to D3 lost wounds; if the unit
  is BATTLELINE, the player may instead return up to D3 destroyed models to it.
- DMN-2.3 **Daemonic Terror.** Each time an enemy unit takes a Battle-shock test while it is within that player's Shadow,
  subtract 1 from the test. If the test is failed, that enemy unit suffers D3 mortal wounds.
- DMN-2.4 The rule creates **no new tests**: it changes tests that happen anyway (Command-phase Below Half-strength
  tests, forced tests from abilities/stratagems). Insane Bravery's automatic pass counts as a pass.
- DMN-2.5 Interpretations **[interp]**:
  (a) a unit is *within* the Shadow when at least one of its living on-board models has its base partly inside a Shadow
  area (own/enemy deployment zone: `partlyWithinPolygon`; No Man's Land: the base is not wholly within either deployment
  zone; Warp Locus: edge-to-edge distance to the bearer ≤ 3"). Both halves of an attached unit count as one unit;
  (b) an objective marker belongs to a zone by its centre point (`pointInPolygon`); No Man's Land markers are the
  non-removed markers whose centre lies in neither deployment zone; "control" is `objective.controller` at the moment the
  phase starts; zero markers in an area never satisfies "at least half";
  (c) the zone record is taken at the start of **every** phase of both turns, before that phase's start window; outside
  battle phases (deployment) only (a) own deployment zone and (d) Warp Locus apply;
  (d) the BATTLELINE choice is automatic (no prompt): if the unit has a BATTLELINE half with destroyed models and is below
  its Starting Strength, return up to D3 of that half's destroyed models (most recently destroyed first; each at a legal
  spot found by the Necrons `findReturnSpot`, stop when none); otherwise heal the model that has lost the most wounds
  (CHARACTER first on ties) by D3, capped at its W. Nothing to heal and nothing to return → no roll. Owner may ask for a
  prompt later (open point);
  (e) in a mirror match each player has an independent Shadow; a unit inside both gets +1 and −1 (net 0) and both
  after-effects;
  (f) Terror mortal wounds credit no attacking model (they are not an attack).

## 3. Enhancements (Kh'har'ret, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `cdm.e.incarnated-rage` | Incarnated Rage | default | DMN-3.1 While the bearer leads a unit, every melee weapon of every model in that unit (the bearer included) has [LETHAL HITS]. Unattached: no effect. |
| `cdm.e.warp-locus` | Warp Locus | optional | DMN-3.2 Aura: the area within 3" of the bearer is inside its army's Shadow of Chaos (DMN-2.1 d). Bearer off the board → no area. |

Both: `restriction: {keyword: ['BLOODMASTER']}`.

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `cdm.sec.worthy-offerings` | Worthy Offerings | default | DMN-4.1 At the end of the battle: 6 VP if the opponent's WARLORD unit is destroyed; 10 VP instead if it was destroyed by an attack made by your WARLORD model. A WARLORD that never arrived from Reserves counts as destroyed with no killer → 6 VP (R-5.16 **[interp]**, Bag the Big 'Un precedent). |
| `cdm.sec.dark-conjunction` | Dark Conjunction | optional | DMN-4.2 End of **your** turn, battle rounds 2–5: 1 VP per objective marker that is within your Shadow of Chaos and not within your own deployment zone (no cap printed). Uses the Shadow record of the phase in progress (the Fight phase record taken at `fight.start`), plus markers whose centre is within 3" of a Warp Locus bearer. |

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `cdm.s.blood-maddened-banishment` | Blood-Maddened Banishment (Battle Tactic) | 1 | DMN-5.1 Fight phase of **either** turn, just after an enemy unit selects its targets | one own BLOODLETTERS unit that is a target of those attacks | until end of phase, each time a model of that unit that has not fought this phase is destroyed, roll a D6: on 4+ it stays on the board (dead for every other purpose) and fights once the attacking unit has finished its attacks, then it is removed |
| `cdm.s.empyric-predators` | Empyric Predators (Strategic Ploy) | 1 | DMN-5.2 opponent's Movement phase, just after an enemy unit ends a Normal, Advance or Fall Back move | one own FLESH HOUNDS unit within 6" of that enemy unit that has not fired Overwatch this phase | the unit makes a Normal move of up to 6"; until end of phase it cannot be picked to Fire Overwatch |
| `cdm.s.manifest-hate` | Manifest Hate (Battle Tactic) | 1 | DMN-5.3 opponent's Shooting phase, just after an enemy unit selects its targets | one own LEGIONES DAEMONICA unit that is a target of those attacks | until end of phase, models in that unit have a 4+ invulnerable save |

- DMN-5.4 Empyric Predators **[interp]**: the page's "has not been targeted with Fire Overwatch" is read as "has not been
  the unit using the Fire Overwatch stratagem this phase" (stratagems target your own unit), and the after-clause as
  "cannot use Fire Overwatch for the rest of the phase". The Normal move follows the usual rules (cannot start or end in
  Engagement Range; a unit in Engagement Range cannot make it).
- DMN-5.5 Manifest Hate on Kh'har'ret (already 4+) changes nothing; on Bloodletters / Flesh Hounds it improves 5+ to 4+;
  the best invulnerable save is used (native).
- DMN-5.6 Blood-Maddened Banishment on Kh'har'ret + Bloodletters covers both halves (one attached unit), exactly like CSM
  Daemonic Fervour.
- Core stratagems per the page: all units Command Re-roll, Insane Bravery, Rapid Ingress, Heroic Intervention,
  Counter-Offensive; Kh'har'ret Epic Challenge; INFANTRY Go to Ground; Flesh Hounds (ranged weapon) Fire Overwatch —
  all keyword-gated in core data already.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Kh'har'ret the Butcher | 1 | 40 mm | 6 | 4 | 5+ | 4+ | 4 | 7+ | 1 | INFANTRY, CHARACTER, CHAOS, DAEMON, BLOODMASTER, KHORNE, KH'HAR'RET THE BUTCHER | Deep Strike; Leader → Bloodletters; Shadow of Chaos; A Gory Path (DMN-6.1) |
| Bloodletters | 10 | 32 mm | 6 | 4 | 7+ | 5+ | 1 | 7+ | 2 | INFANTRY, BATTLELINE, CHAOS, DAEMON, KHORNE, BLOODLETTERS | Deep Strike; Shadow of Chaos |
| Bloodcrushers | 3 | oval 90 × 52 mm | 10 | 7 | 4+ | 4+ | 4 | 7+ | 2 | MOUNTED, CHAOS, DAEMON, KHORNE, BLOODCRUSHERS | Shadow of Chaos (no core abilities) |
| Flesh Hounds | 5 | oval 60 × 35 mm | 12 | 4 | 7+ | 5+ | 2 | 7+ | 1 | BEAST, CHAOS, DAEMON, KHORNE, FLESH HOUNDS | Shadow of Chaos; Collar of Khorne (DMN-6.2) (no core abilities) |

Faction keyword on all four: LEGIONES DAEMONICA. Sv 7+ means no armour save can succeed (a 6 + any modifier never
reaches 7 with AP ≤ 0; the invulnerable save is the only real save) — the engine's save math already handles Sv 7.
The Gore Hound has the same profile as the other Flesh Hounds (W 2); it differs only by carrying the burning roar.

Abilities (own words):
- DMN-6.1 **A Gory Path** (`cdm.a.a-gory-path`, Kh'har'ret): each time this model's unit Consolidates, it may move up to
  6" instead of up to 3". Pile-in stays 3". Applies to the whole attached unit while he leads.
- DMN-6.2 **Collar of Khorne** (`cdm.a.collar-of-khorne`, wargear ability, every Flesh Hounds model): Feel No Pain 3+
  against wounds and mortal wounds caused by Psychic attacks / Psychic abilities.
- DMN-6.3 Core: Deep Strike (Kh'har'ret, Bloodletters; attached pair arrives together — existing reserves code), Leader
  native. CP rule: Reserves never arrive in round 1.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Kh'har'ret | — | — | blade of blood |
| Bloodletters | bloodletter ×8, icon ×1, musician ×1 | — | hellblade |
| Bloodcrushers | each of 3 | — | hellblade, Juggernaut's bladed horn |
| Flesh Hounds | gore-hound ×1 | burning roar | gore-drenched fangs |
| Flesh Hounds | flesh-hound ×4 | — | gore-drenched fangs |

Weapon profiles:
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `cdm.w.blade-of-blood` | blade of blood | melee | 5 | 2+ | 6 | −2 | 3 | — |
| `cdm.w.hellblade` | hellblade | melee | 2 | 3+ | 5 | −2 | 2 | — |
| `cdm.w.juggernauts-bladed-horn` | Juggernaut's bladed horn | melee | 4 | 4+ | 6 | −1 | 1 | Extra Attacks, Lance |
| `cdm.w.burning-roar` | burning roar | 12" | D6 | N/A | 4 | 0 | 1 | Ignores Cover, Torrent |
| `cdm.w.gore-drenched-fangs` | gore-drenched fangs | melee | 3 | 3+ | 5 | −1 | 1 | — |

Notes: a Bloodcrusher fights with its hellblade **and** its bladed horn (Extra Attacks); Lance gives +1 to wound when
the unit charged this turn (attack.ts native).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema); (b) = code hook in `src/engine/factions/chaos-daemons.ts`
(registered in `code-hooks.ts`; mission codes also need their `missions.ts customAmount` case); (c) = engine change
beyond a code hook. **No frozen contract changes**: the Shadow record lives in `players[p].secondaryState`, results are
announced with the existing `AbilityTriggered` / `WoundsRegained` / `ModelReturned` events, so
`types/actions/events/hooks/rng/decider/index.ts` are untouched.
Reused mechanisms: CSM `daemonicFervour` + `fight-on-death.ts` (C5), CSM Empyric Rites `invuln` effect shape, GSC
Psionic Shield `leaderAttached` + `weaponType` shape, Grey Knights / GSC `sourcePsychic` FNP condition, GSC
`returnToTheShadows` check + `startReactiveMove` (movement.ts), Necrons `findReturnSpot` / `returnModel`, Drukhari
`onPainEvent` reducer-listener pattern, `getStuckInDistance` params, Ork Bag the Big 'Un warlord-kill attribution
(`destroyedBy.modelId` / `unitId`), `deploymentZone` (state.ts), `partlyWithinPolygon` / `whollyWithinPolygon` /
`pointInPolygon` / `within` (geometry.ts), core Extra Attacks / Lance / Torrent / Ignores Cover.

| Rule | Enc. | Encoding |
|---|---|---|
| Leader, Deep Strike (DMN-6.3) | (a) | `coreAbilities`: `LEADER` (Kh'har'ret, `leader.attachTo:['cdm.bloodletters']`), `DEEP_STRIKE` (Kh'har'ret, Bloodletters) |
| Weapon abilities (Extra Attacks, Lance, Torrent, Ignores Cover) | (a) | native weapon abilities |
| Collar of Khorne (DMN-6.2) | (a) | Flesh Hounds ability `{trigger:'feelNoPainRoll', when:{sourcePsychic:true}, effect:{feelNoPain:3}, scope:{who:'self'}}` |
| Incarnated Rage (DMN-3.1) | (a) | enhancement `effect:{trigger:'always', when:{weaponType:'melee', leaderAttached:true}, effect:{grantWeaponAbility:{ability:'LETHAL_HITS'}}, scope:{who:'self'}}` (Psionic Shield unit-half shape + Resonance Stave weapon grant) |
| Warp Locus (DMN-3.2) | (a)+(c E1) | enhancement with no effect, `code:'warpLocus'`, `params:{range:3}`; shadow.ts reads it (`warpLocusBearers`). (b) `warpLocus`: `kind:'ability'`, `hook:'onPhaseStart'`, `run: noop` (name-only, like `reanimationProtocols`) |
| Manifest Hate (DMN-5.3) | (a) | `category:'battleTactic', phases:['shooting'], window:'shooting.targetsDeclared', who:'reactive', condition:{phase:'shooting', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'LEGIONES DAEMONICA'}, state:'targetedByAttack', count:1}]`, `effect:{invuln:4}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'` (= `csm.s.empyric-rites` minus the Fight window) |
| Blood-Maddened Banishment (DMN-5.1, 5.6) | (a)+(b reuse) | copy of `csm.s.daemonic-fervour` with `filter:{keyword:'BLOODLETTERS'}`: `category:'battleTactic', phases:['fight'], window:'fight.targetsDeclared', who:'either', condition:{phase:'fight'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'BLOODLETTERS'}, state:'targetedByAttack', count:1}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'`, `code:'daemonicFervour'`, `params:{threshold:4}` — the CSM hook unchanged, no new code |
| Empyric Predators (DMN-5.2, 5.4) | (a)+(b)+(c E3) | `category:'strategicPloy', phases:['movement'], window:'movement.unitMoved', who:'reactive', condition:{phase:'movement', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'FLESH HOUNDS'}, count:1}]`, `scope:{who:'self'}`, `duration:'instant'`, `limit:'oncePerPhase'`, `code:'empyricPredators'`, `params:{range:6, distance:6}`. (b) `empyricPredators`: `kind:'stratagem'`, `hook:'onMove'`, `run: noop`; `check(env, t)`: same as GSC `returnToTheShadows.check` (target on board; mover `env.trigger.unitId` is an enemy unit whose moveType (any half) is `normal`/`advance`/`fallBack`; `leaderService.unitDistance(target, mover) ≤ params.range`; target not in Engagement Range) **and** `!shotThisTurn(state, t.ids[0])` (attack.ts; in the opponent's Movement phase this equals "fired Overwatch this phase"); `apply(ctx, env, t)`: `id = canonicalUnitId(t.ids[0])`; emit `AbilityTriggered` "Empyric Predators: <unit> moves up to 6\""; `ctx.services.effects.grant(ctx, id, [{forbid:'overwatch'}], {sourceAbilityId: env.stratagem.id, sourceUnitId: id, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})` (E3); then `startReactiveMove(ctx, id, params.distance, env.stratagem.id)` |
| A Gory Path (DMN-6.1) | (a)+(c E4) | Kh'har'ret ability `{trigger:'always', code:'getStuckInDistance', params:{pileIn:3, consolidate:6}}` (no effect); E4 makes `consolidateDistance` read datasheet abilities with that code |
| Shadow of Chaos — areas (DMN-2.1, 2.5 a–c) | (c E1) | new `src/engine/shadow.ts` + reducer phase-start refresh; §7.1 |
| Shadow of Chaos — ±1 to Battle-shock tests (DMN-2.2, 2.3) | (c E2) | `hookService.battleShockTest` adds `shadowBattleShockModifiers` to its modifier list |
| Shadow of Chaos — Manifestation heal / return, Terror mortal wounds (DMN-2.2–2.5) | (c E2) | reducer `emit` listener on `BattleShockTested` → `onShadowBattleShock`; command.ts drains the attack queue after each test |
| Shadow of Chaos — ability marker | (a)+(b) | ability `cdm.a.shadow-of-chaos` `{trigger:'always', code:'shadowOfChaos'}` on every datasheet and as `armyRule`. (b) `shadowOfChaos`: `kind:'ability'`, `hook:'onPhaseStart'`, `run: noop` (name-only; shadow.ts does the work) |
| Worthy Offerings (DMN-4.1) | (b) | `scoring:[{id:'worthy-offerings', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', pointsPer:6, cap:10, code:'worthyOfferings', params:{unitPoints:6, warlordPoints:10}}]`; register `worthyOfferings: missionHook('worthyOfferings', 'onTurnEnd')` (same shape as ADM `targetedPurgeScore`); `customAmount` case calls `worthyOfferingsAmount(s, rule, pid)` exported from `factions/chaos-daemons.ts`: target = `s.units[s.players[otherPlayer(pid)].warlordUnitId]`; never-arrived Reserves (location `reserves`, not embarked — `transportService.transportOf === null`) or destroyed with no `destroyedBy` → `unitPoints`; location ≠ `destroyed` → 0; destroyed and (`destroyedBy.modelId` = own warlord unit's first model id **or** `destroyedBy.unitId` = own `warlordUnitId`) and `destroyedBy.kind` ≠ `'other'` → `warlordPoints`; else `unitPoints` |
| Dark Conjunction (DMN-4.2) | (b) | `scoring:[{id:'dark-conjunction', when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'custom', pointsPer:1, cap:999, code:'darkConjunction'}]`; register `darkConjunction: missionHook('darkConjunction', 'onTurnEnd')`; `customAmount` case calls `darkConjunctionAmount(s, rule, pid)`: `pointsPer ×` count of non-removed objectives with `objectiveInShadow(s, pid, obj) && !pointInPolygon(obj.pos, deploymentZone(s, pid))` (E1) |
| Keywords CHAOS / DAEMON / KHORNE / BATTLELINE / MOUNTED / BEAST | (a) | keywords only |
| Daemonic icon / instrument of Chaos (DMN-1.2) | — | cosmetic model variants, no data effect |

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; the hooks code against these. None touches a frozen contract.

**E1 — Shadow of Chaos areas.** New file `src/engine/shadow.ts`:
```ts
export const SHADOW_CODE = 'shadowOfChaos'
export const WARP_LOCUS_CODE = 'warpLocus'
export const SHADOW_KEY = 'shadowOfChaos'          // players[p].secondaryState[SHADOW_KEY]: ShadowRecord
export interface ShadowRecord { round: number; turn: PlayerId; phase: Phase; noMansLand: boolean; enemyZone: boolean } // stale when round/turn/phase differ
// true when any of the player's units (any location) has an ability whose code is SHADOW_CODE
export function hasShadowOfChaos(state: GameState, player: PlayerId): boolean
// DMN-2.5 b: non-removed objectives by centre point
export function noMansLandObjectives(state: GameState): Objective[]
export function zoneObjectives(state: GameState, zoneOwner: PlayerId): Objective[]
// runs at the start of every battle phase (both turns): for each player with the ability writes a fresh ShadowRecord
// (noMansLand / enemyZone = controls ≥ half, ≥1 marker); emits AbilityTriggered 'Shadow of Chaos: No Man's Land …'
// only when a flag differs from the previous record
export function refreshShadow(ctx: EngineContext): void
export function shadowFlags(state: GameState, player: PlayerId): { noMansLand: boolean; enemyZone: boolean } // false/false when stale or unset
// on-board models carrying an enhancement whose code is WARP_LOCUS_CODE, with its params.range (default 3)
export function warpLocusBearers(state: GameState, player: PlayerId): { modelId: ModelId; range: number }[]
// DMN-2.5 a: one model
export function modelInShadow(state: GameState, player: PlayerId, modelId: ModelId): boolean
// DMN-2.5 a: any living on-board model of any half (leaderService.halves) in the player's Shadow
export function unitInShadow(state: GameState, player: PlayerId, unitId: UnitId): boolean
// DMN-4.2: centre in own zone, or in NML and noMansLand, or in enemy zone and enemyZone, or within range of a Warp Locus bearer
export function objectiveInShadow(state: GameState, player: PlayerId, obj: Objective): boolean
```
- reducer.ts: call `refreshShadow(ctx)` immediately before it opens each `${phase}.start` window (command, movement,
  shooting, charge, fight; both turns), guarded by `ctx.once(\`shadow:${round}:${turn}:${phase}\`)`. No-op when no
  player has the ability (non-Daemon games write nothing → replay hashes unchanged).

**E2 — Battle-shock modifiers and after-effects.** `src/engine/shadow.ts` + `hooks-impl.ts` + `reducer.ts` +
`phases/command.ts`:
```ts
// DMN-2.2/2.3: +1 for each player with the ability whose own unit is in their Shadow; −1 for each such player whose
// enemy (= testing) unit is in that player's Shadow. Sources are labelled 'cdm.a.shadow-of-chaos'.
export function shadowBattleShockModifiers(state: GameState, unitId: UnitId): { source: string; value: number }[]
// reducer emit listener for BattleShockTested (both outcomes). Reads the unit's position at test time.
//   passed && unit's owner has the ability && unitInShadow(owner) → manifestation (DMN-2.5 d): one D3 roll
//     (purpose 'ability'), then returnModel ×n (factions/necrons.ts) or woundsRemaining += min(n, lost) + WoundsRegained
//   !passed && opponent has the ability && unitInShadow(opponent) → D3 (purpose 'ability', player = opponent),
//     ctx.services.attack.queueMortalWounds(ctx, canonicalUnitId, n, 'cdm.a.shadow-of-chaos', false) (no credit);
//     resolve at once when `!state.pending && state.phaseState.attack` (code-hooks queueMortals pattern)
//   each outcome emits AbilityTriggered { abilityId: 'cdm.a.shadow-of-chaos', summary: 'Daemonic Manifestation: …' / 'Daemonic Terror: …' }
export function onShadowBattleShock(ctx: EngineContext, e: { unitId: UnitId; passed: boolean }): void
```
- hooks-impl.ts `battleShockTest`: after building `modifiers`, append `...shadowBattleShockModifiers(s, unitId)`
  (skipped when an autoPass/autoFail result decides the test). The spec passed to `rollOnce` / `roll` carries them, so the
  dice log shows them.
- reducer.ts `emit`: `if (e.type === 'BattleShockTested') onShadowBattleShock(ctx, e)` next to `onPainEvent`.
- phases/command.ts `runBattleShockTests`: after each `battleShockTest` returns, while `s.phaseState.attack` is set call
  `ctx.services.attack.advance(ctx)`; return `'pending'` if a decision is open (movement.ts precedent) — Terror mortal
  wounds must finish before the next unit is tested.
- Order inside one test: Pain token (Drukhari) and Shadow listener are independent; Shadow runs after `BattleShocked`
  state is set (the event is emitted before the flag loop — the listener only reads position and wounds, not the flag).

**E3 — `forbid: 'overwatch'` effect.** `src/data/types.ts` `Effect.forbid?: 'charge' | 'overwatch'`;
`src/data/schema/common.schema.json` `forbid: {enum: ['charge', 'overwatch']}`; 20-data-schema row updated.
```ts
// HookQueries (hooks-impl.ts): a forbid:'overwatch' effect is active on any half of the unit
overwatchForbidden(state: GameState, unitId: UnitId): boolean
```
- code-hooks.ts `fireOverwatch.check`: `if (hookService.overwatchForbidden?.(state, friendlyId)) return false` before the
  `eligibleToShootNow` test.

**E4 — Always-on consolidation distance.** hooks-impl.ts `getStuckIn(state, unitId)`: besides ActiveEffects, scan each
on-board half's datasheet abilities (`state.datasheets[..].abilities`) for `code === 'getStuckInDistance'` and fold their
params the same way (largest pile-in, largest consolidate). Signatures unchanged (`pileInDistance`,
`consolidateDistance`). Kh'har'ret's params `{pileIn:3, consolidate:6}` → pile-in 3, consolidate 6; a stratagem Get Stuck
In on the same unit still wins where larger.

## 8. Test IDs

Same list as the Chaos Daemons section of 12-rules-test-checklist. Engine tests: `tests/engine/chaos-daemons.test.ts`;
data tests: `tests/data/chaos-daemons.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| CHA-101 | DMN-1 | patrol `cdm.cp.butchers-of-hyporia` loads (faction `chaos-daemons`): 6 units, 34 models; Kh'har'ret is WARLORD with Incarnated Rage, attached to `bloodletters-1`; default secondary Worthy Offerings; stratagems are the three `cdm.s.*` ids; start screen lists Chaos Daemons |
| CHA-102 | DMN-6 | data: every stat/profile row of §6 matches (Bloodletters Sv 7+ inv 5+, Bloodcrushers T7 W4 inv 4+, Kh'har'ret Sv 5+ inv 4+); every datasheet has faction keyword LEGIONES DAEMONICA and the Shadow of Chaos ability; bases 40 / 32 / 90×52 / 60×35 mm |
| CHA-103 | DMN-2.1, E1 | Shadow areas: a Daemon unit partly in its own deployment zone is in the Shadow; a unit wholly in No Man's Land is not, unless at the start of the phase the Daemons controlled ≥ half the NML markers (then it is until the phase ends); a non-Daemon game writes no `shadowOfChaos` key |
| CHA-104 | DMN-2.1 c, 2.5 b | enemy deployment zone joins the Shadow only when the Daemons control ≥ half of its markers at phase start; control gained mid-phase takes effect at the next phase start; an area with zero markers never qualifies |
| CHA-105 | DMN-2.2 | Manifestation modifier: Bloodletters below half strength in own DZ test in the Command phase with +1 (dice log shows it); same unit in NML outside the Shadow → no modifier |
| CHA-106 | DMN-2.2, 2.5 d | Manifestation pass: Bloodletters (BATTLELINE) with 6 destroyed models pass → D3 destroyed models return at legal spots, never above Starting Strength; failed test → nothing returns |
| CHA-107 | DMN-2.2, 2.5 d | Manifestation pass on Bloodcrushers (not BATTLELINE) with a model on 1 wound → that model regains D3 (capped at W4); Kh'har'ret attached and wounded with no Bloodletters lost → Kh'har'ret is healed |
| CHA-108 | DMN-2.4 | Insane Bravery auto-pass inside the Shadow triggers Manifestation; a unit at full strength is never tested just for being in the Shadow |
| CHA-109 | DMN-2.3 | Daemonic Terror: an enemy unit below half strength inside the Daemon deployment zone tests with −1 in its Command phase; on a fail it takes D3 mortal wounds (resolved before the next unit tests); on a pass nothing; an enemy outside the Shadow has no −1 |
| CHA-110 | DMN-2.3, E2 | Terror mortal wounds that destroy the enemy unit emit UnitDestroyed with no attacking model (Worthy Offerings 10-VP tier never triggers from them) |
| CHA-111 | DMN-2.5 e | mirror match: a unit standing in both Shadows tests at net 0 and gets both Manifestation (if passed) or Terror (if failed) from the right player |
| CHA-112 | DMN-3.1 | Incarnated Rage: Kh'har'ret leading Bloodletters → hellblade unmodified 6 to hit auto-wounds (Lethal Hits) for the Bloodletters and for the blade of blood; detached → no Lethal Hits |
| CHA-113 | DMN-3.2 | Warp Locus: an objective whose centre is 2.9" from Kh'har'ret in NML is in the Shadow; at 3.1" not; an enemy unit within 3" of him tests with −1; Kh'har'ret in Reserves → no area |
| CHA-114 | DMN-4.1 | Worthy Offerings: opponent's Warlord destroyed by Bloodletters → 6 VP at battle end; destroyed by Kh'har'ret's own attack → 10 VP; alive → 0; never arrived from Reserves → 6 |
| CHA-115 | DMN-4.1 | Worthy Offerings: Warlord killed by Kh'har'ret while he leads Bloodletters → 10 (credited to his model, not the Bloodletters); killed by a Bloodletter of his attached unit → 6 |
| CHA-116 | DMN-4.2 | Dark Conjunction: round 1 → 0; round 2, end of own turn, Daemons controlled 2 of 3 NML markers at `fight.start` → every NML marker (3) scores 1 VP each, controlled or not; markers in own DZ never score; end of the opponent's turn → 0 |
| CHA-117 | DMN-4.2 | Dark Conjunction: Daemons control 1 of 3 NML markers → NML not in Shadow → only Warp Locus-covered markers score; controlling half the enemy-zone markers adds them |
| CHA-118 | DMN-5.1 | Blood-Maddened Banishment: enemy targets Bloodletters in the Fight phase → offered; a destroyed Bloodletter that had not fought rolls D6, 4+ stays and fights after the attacker finishes, then is removed; 1–3 removed at once |
| CHA-119 | DMN-5.1 | Blood-Maddened Banishment not offered: target is Flesh Hounds / Bloodcrushers; Bloodletters already fought this phase; second use in the same phase |
| CHA-120 | DMN-5.2 | Empyric Predators: opponent's Movement phase, enemy unit ends a Normal move 5" from Flesh Hounds → offered; used → Flesh Hounds make a Normal move of up to 6" (not into Engagement Range) |
| CHA-121 | DMN-5.2, E3 | Empyric Predators: after it, Fire Overwatch is not offered for those Flesh Hounds this phase; Flesh Hounds that already fired Overwatch this phase are not eligible targets; enemy 6.5" away → not offered; own Movement phase → not offered |
| CHA-122 | DMN-5.3 | Manifest Hate: opponent's Shooting phase, enemy targets Bloodletters → offered; used → saves on 4+ invulnerable vs AP −3 until end of phase; not offered in the Fight phase or the Daemons' own Shooting phase |
| CHA-123 | DMN-6.1, E4 | A Gory Path: Kh'har'ret's unit consolidates up to 6" (a 5.5" placement legal, 6.5" refused); pile-in still 3"; Bloodletters without him consolidate 3" |
| CHA-124 | DMN-6.2 | Collar of Khorne: Flesh Hounds roll FNP 3+ against a Psychic weapon's wounds and Psychic-ability mortal wounds; no FNP against a bolter |
| CHA-125 | DMN-6 | Bloodcrushers fight with hellblade + bladed horn (Extra Attacks) together; bladed horn gets +1 to wound only when they charged (Lance) |
| CHA-126 | DMN-6 | Gore Hound's burning roar auto-hits D6 times (Torrent) and the target gets no cover bonus (Ignores Cover); other Flesh Hounds have no ranged weapon |
| CHA-127 | DMN-6.3 | Kh'har'ret + Bloodletters Deep Strike together from round 2, more than 9" from enemies; refused in round 1 |
| CHA-128 | DMN-6 | Sv 7+: a Bloodletter hit by AP 0 saves only with its 5+ invulnerable; Kh'har'ret saves on his 4+ invulnerable rather than his 5+ armour (also vs AP 0) |
| CHA-129 | E1/E2 | regression: Shadow record + modifiers keep replay hashes deterministic (same seed + actions → same hash); Drukhari Pain gain on a failed test still fires alongside Daemonic Terror |
| CHA-130 | DMN-1.2 | icon / musician models carry no extra rule: OC, Ld and attacks identical to a plain Bloodletter / Bloodcrusher |

## 9. Figures

Heights follow 30-figures (infantry ≈ 1.1", true-scale to 28 mm; daemons a little taller); bases rules-true. True MGSD
proportions (≈2.5 heads, huge head, stubby legs). Paint: deep blood-red skin `#8e1a14`, soot-black horns and hide
`#2b1d18`, dull brass `#b8862b`, iron-grey blades. No logos, glyphs or skull runes. Kits until GLBs exist: infantry
`{archetype:'infantry', kit:'generic-infantry'}`, cavalry/beasts `{archetype:'monster', kit:'generic-monster'}`.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `khharret` | `cdm.khharret-the-butcher/khharret` | 1 | 1.6 | 40 mm | A chibi hulking red-skinned daemon champion with a huge horned head, burning eyes, a brass-plated collar and shoulder guard, a ragged black loincloth, swinging an oversized jagged brass greatblade dripping glossy red. |
| `bloodletter` | `cdm.bloodletters/bloodletter` | 8 | 1.3 | 32 mm | A chibi wiry red-skinned daemon with a big snarling head, two long swept-back black horns, a lashing tail and bone-spur elbows, gripping a long black-and-brass hooked sword. |
| `bloodletter-icon` | `cdm.bloodletters/bloodletter-icon` | 1 | 1.5 | 32 mm | The same chibi red horned daemon holding its hooked sword and a tall brass pole topped with a plain horned brass crest and a tattered dark-red banner (no symbols). |
| `bloodletter-musician` | `cdm.bloodletters/bloodletter-musician` | 1 | 1.3 | 32 mm | The same chibi red horned daemon with its hooked sword and a curled brass war-horn raised to its fanged mouth. |
| `bloodcrusher` | `cdm.bloodcrushers/bloodcrusher` | 1 | 2.0 | oval 90 × 52 mm | A chibi red horned daemon rider with a hooked sword astride a squat armoured brass-and-black bull-beast with a huge horned head, a single heavy bladed horn and stubby pillar legs. |
| `bloodcrusher-icon` | `cdm.bloodcrushers/bloodcrusher-icon` | 1 | 2.3 | oval 90 × 52 mm | The same chibi daemon rider on its brass bull-beast, also holding a tall pole with a plain horned brass crest and a ragged dark-red banner. |
| `bloodcrusher-musician` | `cdm.bloodcrushers/bloodcrusher-musician` | 1 | 2.0 | oval 90 × 52 mm | The same chibi daemon rider on its brass bull-beast, blowing a curled brass horn with its sword held low. |
| `flesh-hound` | `cdm.flesh-hounds/flesh-hound` | 4 | 0.9 | oval 60 × 35 mm | A chibi pouncing hound-daemon with crimson scaly hide, a giant fanged head with a black bony crest, a thick brass collar, a spiked spine and a stubby whipping tail. |
| `gore-hound` | `cdm.flesh-hounds/gore-hound` | 1 | 1.0 | oval 60 × 35 mm | A bigger chibi crimson hound-daemon with a heavier black horn crest and brass collar, jaws wide open breathing a cone of orange-red flame. |

## 10. Other Chaos Daemons patrols (appendix)

- None. The wahapedia CP navigation (2026-10-16) lists only Butchers of Hyporia (Index, June 2023) for Chaos Daemons.

## 11. Open points

- DMN-2.5 d: the BATTLELINE "return models instead" choice is automatic (return first when possible). If the owner
  wants a prompt (e.g. heal Kh'har'ret instead), add a `chooseOption` in a later stage; it needs a re-entrant resolution
  point outside the event listener.
- DMN-2.5 a–c: "within the Shadow" geometry, marker-by-centre and phase-start timing are our readings; the page gives no
  finer detail.
- DMN-5.4: Empyric Predators' Overwatch clauses read as "has not used / cannot use Fire Overwatch".
- Bloodcrushers base 90 × 52 mm and T 7 are as printed (confirmed twice), though other editions differ.
- Client (later, not this spec's work): a board overlay that tints the current Shadow areas per player, and the dice
  log label for the ±1.
