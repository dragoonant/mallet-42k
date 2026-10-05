# Faction spec — Chaos Space Marines: Zarkan's Daemonkin

Own-words data spec for the Chaos Space Marines Combat Patrol, same shape as 11-combat-patrol §4. Rule ids
`CHA-<section>.<n>` are cited by the `CHA-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose here is ours. Data id prefix: `csm.` (faction id `chaos-space-marines`, faction keyword
HERETIC ASTARTES).

## 0. Sources (accessed 2026-10-03)

| Source | URL | Version shown on page |
|---|---|---|
| CSM box "Zarkan's Daemonkin" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/zarkan-s-daemonkin/ | Index: Zarkan's Daemonkin, 10th ed, **May 2024** |
| CSM patrol "Dark Zealots" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/dark-zealots/ | Index, 10th ed, June 2023 |
| CP faction navigation (used to enumerate patrols) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | — (the CP index page https://wahapedia.ru/wh40k10ed_cp/ returned HTTP 403) |
| Combat Patrol format rules | same rules page | already captured in 11-combat-patrol §1–2; not re-transcribed |

Patrol selection: the navigation lists two HERETIC ASTARTES patrols. Zarkan's Daemonkin (May 2024) is the newer
boxed patrol and is the primary; Dark Zealots (June 2023) is summarised in §10.

## 1. Roster

4 units, 26 models. Faction keyword HERETIC ASTARTES on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `zarkan` | Aranis Zarkan | 1 | bolt pistol; Rite of Possession (2 profiles); staff of possession | **WARLORD**. Leader → `possessed` (default) or `legionaries` |
| `possessed` | Possessed | 5 | each: hideous mutations | bodyguard option for Zarkan |
| `legionaries` | Legionaries | 10 | Aspiring Champion: plasma pistol + accursed weapon; 1× bolt pistol + meltagun + close combat weapon; 1× bolt pistol + heavy bolter + close combat weapon; 7× bolt pistol + boltgun + close combat weapon | bodyguard option for Zarkan |
| `cultists` | Cultist Mob | 10 | Cultist Champion: bolt pistol + brutal assault weapon; 9× autopistol + brutal assault weapon | — |

No Patrol Squads ability on any datasheet in this patrol (CP-1.8 does not apply). Default attachment Zarkan →
Possessed is **[interpretation, owner-changeable]** (the source allows either; the patrol's theme and the Daemonic
Fervour / Foul Zealotry pairing favour Possessed).

## 2. Faction ability — Dark Pacts (every datasheet)

| Id | Rule |
|---|---|
| CHA-2.1 | Each time a unit with this ability is selected to shoot or selected to fight, its controller may make a Dark Pact for it (optional; declining has no effect). |
| CHA-2.2 | Making a Pact: the unit first takes a **Leadership test** (2D6 ≥ the best Ld among its models; this is not a Battle-shock test, so Battle-shock modifiers, auto-pass/fail effects and Insane Bravery do not apply and failing does not Battle-shock the unit). On a fail the unit suffers D3 mortal wounds (allocated per R-7 mortal-wound rules, owner allocates; attached unit = one unit). |
| CHA-2.3 | Then, pass or fail, the controller picks [LETHAL HITS] **or** [SUSTAINED HITS 1]; every weapon of every model in the unit (attached unit included) has that ability until the end of the phase. If the mortal wounds destroyed the unit, nothing further happens. |
| CHA-2.4 | **[interpretation]** Fire Overwatch is not treated as "selected to shoot" for this ability (no Pact is offered when shooting via Overwatch). Log for needs-rules-check. |
| CHA-2.5 | Prompt order when a unit with Zarkan is selected **[owner's choice made deterministic]**: Dark Pact first (test, mortal wounds, ability pick), then Sacrificial Dagger (§6). |

## 3. Enhancements (Aranis Zarkan, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Foul Zealotry | default | when the bearer's unit (attached unit included) makes a Dark Pact, it gains **both** [LETHAL HITS] and [SUSTAINED HITS 1] for the phase instead of picking one. The Leadership test and its mortal wounds are unchanged. |
| Prey on the Weak | optional | in your Shooting phase, once the bearer's unit has finished shooting, pick one enemy unit that was hit (successful hit roll, incl. critical hits) by at least one attack from the bearer's Rite of Possession that activation. That unit immediately takes a Battle-shock test with −1 to the result. No such enemy → nothing happens. Not in Overwatch. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Marked for Execution | default | the moment the opponent's WARLORD model is destroyed: 12 VP if it is battle round 1, 2 or 3; 6 VP from round 4 on. Scores at most once. Any cause counts (attacks, mortal wounds, Hazardous, Deadly Demise) **[interpretation: literal]**. A WARLORD that never arrives from Reserves does not score. |
| Sites of Power | optional | from battle round 2 onward, at the end of each of your turns: 2 VP if the number of objective markers you control is **greater than or equal to** the number the opponent controls. **[interpretation: literal — a 0–0 tie scores]**. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Vindictive Strategy | 1 | battleTactic | your Shooting phase (`shooting.start`, between activations) or a Fight phase (`[fight.start, fight.attacksResolved]`, between activations) | one own HERETIC ASTARTES unit not yet selected to shoot (Shooting) / fight (Fight) this phase | until end of phase, each attack by a model in the unit against an enemy unit that is **below its Starting Strength** re-rolls a hit roll of 1; if that enemy unit is also **Below Half-strength**, the attack also re-rolls a wound roll of 1. Starting Strength / half-strength are those of the whole target (attached unit = combined, R-10.1). **[interpretation]** "Fight phase" = either player's Fight phase. |
| Violent Unbinding | 1 | epicDeed | opponent's Shooting phase or a Fight phase, just after an enemy attack destroys your MASTER OF POSSESSION model, before it is removed | your MASTER OF POSSESSION model (Zarkan) | if the attacking enemy unit has a model within 6" of Zarkan (measured from where he stood), roll D6: 1 nothing; 2–5 that enemy unit suffers D3 mortal wounds; 6 it suffers 3 mortal wounds. **[interpretation]** "Fight phase" = either player's Fight phase. |
| Daemonic Fervour | 1 | battleTactic | a Fight phase (either turn), `fight.targetsDeclared`, just after an enemy unit selects its targets | one own POSSESSED unit that is a target of that enemy unit (attached Zarkan included) | until end of phase, each time a model in the unit is destroyed by an enemy attack, if the unit has not fought yet this phase, roll D6: on 4+ the model is not removed yet. Once the attacking enemy unit has finished making its attacks, each such model fights (melee attacks only — no pile-in or consolidation **[interpretation]**) and is then removed. |

Core stratagems: all apply per 10-rules §11 under their own keyword gates (Go to Ground needs INFANTRY — every unit
here is INFANTRY; Fire Overwatch needs a ranged weapon — Possessed have none; no GRENADES, SMOKE or VEHICLE units).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Aranis Zarkan | 1 | 40 mm | 8 | 4 | 3+ | 5+ | 4 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, CHAOS, MASTER OF POSSESSION, ARANIS ZARKAN | Leader → Possessed or Legionaries; Dark Pacts; Sacrificial Dagger: once per phase, when this model is selected to shoot or fight, you may have its unit suffer 1 mortal wound; if you do, until end of phase this model's Psychic attacks get +1 to hit and +1 to wound |
| Possessed | 5 | 40 mm | 9 | 6 | 3+ | 5+ | 3 | 6+ | 1 | INFANTRY, CHAOS, DAEMON, POSSESSED | Dark Pacts |
| Legionaries | 10 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, CHAOS, LEGIONARIES | Dark Pacts; Veterans of the Long War: melee attacks by models in this unit re-roll a wound roll of 1; if the target unit is within range of an objective marker they may re-roll any failed wound roll instead |
| Cultist Mob | 10 | 25 mm | 6 | 3 | 6+ | — | 1 | 7+ | 1 | INFANTRY, BATTLELINE, CHAOS, DAMNED, CULTIST MOB | Dark Pacts |

Faction keyword (all): HERETIC ASTARTES. "Psychic attack" = an attack made with a [PSYCHIC] weapon.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Aranis Zarkan | — | bolt pistol, Rite of Possession | staff of possession |
| Possessed | ×5 | — | hideous mutations |
| Legionaries | Aspiring Champion | plasma pistol (2 profiles) | accursed weapon |
| Legionaries | Legionary (melta) ×1 | bolt pistol, meltagun | close combat weapon |
| Legionaries | Legionary (heavy bolter) ×1 | bolt pistol, heavy bolter | close combat weapon |
| Legionaries | Legionary (boltgun) ×7 | bolt pistol, boltgun | close combat weapon |
| Cultist Mob | Cultist Champion | bolt pistol (BS 4+) | brutal assault weapon |
| Cultist Mob | Cultist ×9 | autopistol | brutal assault weapon |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| bolt pistol (Zarkan, Legionaries) | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| Rite of Possession — witchfire | 18" | 2 | 3+ | 4 | −3 | 2 | Anti-PSYKER 2+, Pistol, Precision, Psychic |
| Rite of Possession — focused witchfire | 18" | 2 | 3+ | 6 | −3 | 3 | Anti-PSYKER 2+, Hazardous, Pistol, Precision, Psychic |
| boltgun | 24" | 2 | 3+ | 4 | 0 | 1 | — |
| heavy bolter (Legionary) | 36" | 3 | 4+ | 5 | −1 | 2 | Heavy, Sustained Hits 1 |
| meltagun | 12" | 1 | 3+ | 9 | −4 | D6 | Melta 2 |
| plasma pistol — standard | 12" | 1 | 3+ | 7 | −2 | 1 | Pistol |
| plasma pistol — supercharge | 12" | 1 | 3+ | 8 | −3 | 2 | Hazardous, Pistol |
| autopistol | 12" | 1 | 4+ | 3 | 0 | 1 | Pistol |
| bolt pistol (Cultist Champion) | 12" | 1 | 4+ | 4 | 0 | 1 | Pistol |
| staff of possession | melee | 4 | 3+ | 6 | −1 | D3 | Anti-PSYKER 2+, Psychic |
| hideous mutations | melee | 4 | 3+ | 5 | −1 | 2 | — |
| accursed weapon | melee | 4 | 3+ | 5 | −2 | 1 | — |
| close combat weapon (Legionary) | melee | 3 | 3+ | 4 | 0 | 1 | — |
| brutal assault weapon | melee | 2 | 4+ | 3 | 0 | 1 | — |

Suggested `paintScheme` (original): primary `#2b2f3a` (blue-black), secondary `#7a1f2b` (dried crimson), trim
`#a8823c` (old brass), metal `#8d9299`, decal `#c9b8f0` (pale warp-violet glow).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`); (c) = engine change beyond a code hook. **No (c) item touches a frozen
contract** (`types/actions/events/hooks/rng/decider/index.ts`); all new state lives in `phaseState.marks` and all
signals reuse existing events (`AbilityTriggered`, `DiceRolled`, `DamageApplied`, `ModelDestroyed`, `UnitDestroyed`,
`BattleShockTested`). Nothing from Necrons' model-return work (`src/engine/factions/necrons.ts`) is needed here.

| Rule | Enc. | Encoding |
|---|---|---|
| Dark Pacts (CHA-2.1–2.5) | (b)+(c) | (b) `darkPact` — ability descriptor `{trigger:'unitSelectedToShoot', code:'darkPact'}` (the hook's picks cover both selections). `pick` at windows `shooting.unitSelected` (new, C1) and `fight.unitSelected` (key = selected unit id, mark `pick:darkPact:<unitId>:<phase>`): offers `chooseOption` topic `abilityChoice` (`data.code:'darkPact'`) with options `lethal` / `sustained` / `decline` — or `both` / `decline` when any half of the unit carries an ability with code `foulZealotry`. On a non-decline answer: `hookService.leadershipTest(ctx, canonicalUnitId, abilityId)` (C2); if it fails, roll D3 (`purpose:'ability'`) and `queueMortals(ctx, canonicalUnitId, n, abilityId)` (existing helper in code-hooks); then, if any model of the unit is still on the board, `effects.grant` to the canonical unit `{grantWeaponAbility:{ability:'LETHAL_HITS'}}` and/or `{grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}`, scope `self`, `untilEndOfPhase`; emit `AbilityTriggered`. Only on the unit's normal selection (not Overwatch, CHA-2.4). |
| Foul Zealotry | (b) | `foulZealotry` — marker hook (`kind:'ability'`, `hook:'onStatQuery'`, `run: noop`, `gate: () => false`); enhancement data `{trigger:'always', code:'foulZealotry'}` with no effect; read only by `darkPact` via `unitWithAbilityCode`. |
| Prey on the Weak | (b)+(c) | (b) `preyOnTheWeak` — `pick` at window `shooting.attacksResolved` (key = the unit that just shot; own Shooting phase only, so never Overwatch): if the bearer is in that unit and `unitsHitByWeapon(state, unitId, 'csm.rite-of-possession')` (C3) is non-empty, offer `chooseOption` (topic `abilityChoice`) over those enemy canonical units still on the board, then `hookService.battleShockTest(ctx, chosenId, abilityId, -1)` (existing; −1 modifier). No candidate → no decision. |
| Sacrificial Dagger | (b) | `sacrificialDagger` — `pick` at `shooting.unitSelected` (C1) and `fight.unitSelected`, offered after `darkPact` (CHA-2.5) when the selected unit contains the bearer model and mark `pick:dagger:<modelId>:<phase>` is absent (= once per phase): options `use` / `decline`. On `use`: `queueMortals(ctx, canonicalUnitId, 1, abilityId)`; if the bearer survives, grant scope `bearer`, `untilEndOfPhase`: `[{when:{weaponAbility:'PSYCHIC'}, modifyRoll:{roll:'hit', value:1}}, {when:{weaponAbility:'PSYCHIC'}, modifyRoll:{roll:'wound', value:1}}]` (R-6 ±1 caps still apply). |
| Marked for Execution | (b) | secondary `scoring:[{when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'markedForExecution', pointsPer:12, cap:12, params:{latePoints:6, lateFromRound:4}}]`; `markedForExecution = missionHook('markedForExecution', 'onUnitDestroyed')` + amount fn in `missions.ts`: returns `pointsPer` (rounds 1–3) or `latePoints` (round ≥ `lateFromRound`) the first time `s.units[s.players[opp].warlordUnitId]` has `location: 'destroyed'` (any `destroyedBy`); sets `secondaryState.markedScored = true` so it never scores twice. Reserves at game end: 0. |
| Sites of Power | (a)+(c) | `{when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'holdMore', pointsPer:2, cap:2, params:{allowTie:true}}` — needs C6 (one-line `holdMore` param). |
| Vindictive Strategy | (b) | stratagem `window:['shooting.start','fight.start','fight.attacksResolved']`, `who:'either'` (Shooting only when active — enforced in `check`), target own HERETIC ASTARTES unit, `effect:{reroll:'ones'}`, `duration:'untilEndOfPhase'`, `code:'vindictiveStrategy'`. Hook: `kind:'stratagem'`, `hooks:['onHitRoll','onWoundRoll']` (same pattern as `veteranInstincts`); `check`: phase shooting → user is active and no half of the target is in `phaseState.activated` or has `turn.shotThisPhase`; phase fight → no half has `turn.foughtThisPhase`. `gate(state, holder, entry, data)`: with `t = leaderService.canonicalUnitId(state, data.attack.targetUnitId)`, `data.roll.purpose === 'hit'` → combined board model count < `leaderService.startingStrength(state, t)`; `'wound'` → `leaderService.isBelowHalfStrength(state, t)`. |
| Violent Unbinding | (b)+(c) | stratagem `window:'attack.modelDestroyed'` (new, C4), `who:'reactive'`, target `{role:'unit', owner:'friendly', filter:{keyword:'MASTER OF POSSESSION'}, state:'justDestroyed'}`, `code:'violentUnbinding'`, `duration:'instant'`. Hook `check`: `pendingDeathReaction(state)` (C4) exists for that unit and `attackerUnitId` has a board model within 6" (`distance`) of the snapshot `pos`; `apply`: roll D6 (`purpose:'ability'`), 2–5 → roll D3 and `queueMortals(ctx, attackerCanonical, n, id)`, 6 → `queueMortals(…, 3, …)`; then `consumeDeathReaction`. |
| Daemonic Fervour | (b)+(c) | stratagem `window:'fight.targetsDeclared'`, `who:'either'` (reactive), target `{owner:'friendly', filter:{keyword:'POSSESSED'}, state:'targetedByAttack'}`, `code:'daemonicFervour'`, no data effect. Hook `apply`: `grantFightOnDeath(ctx.state, canonicalUnitId, 4)` (C5). The deferral, the D6, the late fight and the removal are engine work (C5). |
| Veterans of the Long War | (a) | `{trigger:'woundRoll', scope:{who:'self'}, effect:[{when:{weaponType:'melee'}, reroll:'ones'}, {when:{weaponType:'melee', targetOnObjective:true}, reroll:'fails'}]}` |
| Leader (Zarkan → Possessed / Legionaries) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['csm.possessed','csm.legionaries']`; patrol `attachTo:'possessed'` |
| Invulnerable saves 5+ (Zarkan, Possessed) | (a) | datasheet `invuln:'5+'` |
| Weapon abilities (Anti-PSYKER 2+, Pistol, Precision, Psychic, Hazardous, Heavy, Sustained Hits 1, Melta 2) | (a) | `ANTI` `{keyword:'PSYKER', value:2}`, `PISTOL`, `PRECISION`, `PSYCHIC`, `HAZARDOUS`, `HEAVY`, `SUSTAINED_HITS` 1, `MELTA` 2; two-profile weapons as one `profileGroup` |
| BATTLELINE (Legionaries, Cultists) | (a) | keyword — feeds CP-2.4 secured objectives |
| DAEMON, DAMNED, CHAOS | (a) | plain keywords, no intrinsic rule in CP |

### 7.1 Engine changes (c) — exact signatures

All in non-frozen files. Built by the engine agent; the (b) hooks code against these signatures.

**C1 — `shooting.unitSelected` window.** `src/data/types.ts`: add `'shooting.unitSelected'` to `TimingWindowId`.
`src/engine/phases/shooting.ts`: after `chooseUnitToActivate` is accepted and before `doOpenDeclareTargets`, call
`ctx.window('shooting.unitSelected', unitId, ctx.order.active(), { unitId })` (return `'pending'` if it raised a
decision; picks run through `hookService.offerPicks`, exactly as `fight.unitSelected` does for Plasmacyte). If the
unit has no board model left afterwards (Dark Pact mortal wounds), skip its declareTargets. Not opened for Overwatch.
Add the window to 20-data-schema's window list.

**C2 — Leadership test.** `src/engine/hooks-impl.ts`, `HookQueries`:
```ts
// 2D6 (+modifier) ≥ best Ld of the unit's board models (both halves); NOT a Battle-shock test: no onBattleShockTest
// hooks, no state change. Rolls with purpose 'ability'; emits AbilityTriggered with the total. Returns passed.
leadershipTest(ctx: EngineContext, unitId: UnitId, source: string, modifier?: number): boolean
```

**C3 — units hit by a weapon this phase.** `src/engine/attack.ts`: after each hit roll that succeeds (incl. critical
hits and Torrent auto-hits), push (deduplicated) the phase-scoped mark
`hitBy:<attackerCanonicalUnitId>:<weaponDataId>:<targetCanonicalUnitId>` (not cleared at attack-sequence end). Export:
```ts
export function unitsHitByWeapon(state: GameState, attackerUnitId: UnitId, weaponDataId: string): UnitId[]
```
(`weaponDataId` = the data weapon id without profile suffix, e.g. `'csm.rite-of-possession'`; matches every profile.)

**C4 — death-reaction window `attack.modelDestroyed`.** `src/data/types.ts`: add `'attack.modelDestroyed'` to
`TimingWindowId`. `src/engine/attack.ts`:
```ts
export interface DeathReactionRequest {
  modelId: ModelId; unitId: UnitId; player: PlayerId // owner of the destroyed model
  attackerUnitId: UnitId                              // canonical enemy unit whose attack destroyed it
  pos: Vec3                                           // model position at destruction (measurements use this)
  phase: Phase
}
export function pendingDeathReaction(state: GameState): DeathReactionRequest | null
export function consumeDeathReaction(state: GameState, modelId: ModelId): void
```
In `destroyModel`, when `by.unitId` is set and `by.kind` is `'ranged' | 'melee'` (an enemy attack, incl. its
Devastating Wounds) and the model carries a keyword some own stratagem at this window filters on (or simply always —
the window is cheap), push mark `deathReaction:<json>` **before** removal/deferral. `attackService.advance`, once the
current attack's damage has fully resolved (before the next attack's allocation), and if a request is pending, opens
`ctx.window('attack.modelDestroyed', request.unitId, ctx.order.defensive(request.player), { unitId: request.unitId, modelId: request.modelId })`
— returns pending like any allocation decision — then drops any unconsumed request. The stratagem's existing
`justDestroyed` target state matches `trigger.unitId`.

**C5 — fight on death (Daemonic Fervour).** New module `src/engine/fight-on-death.ts` (CSM-09/CSM-10: each deferred unit first gets an optional pile-in via `deferredPileInStep` in fight.ts, then its targets come from `deferredWeapons`, the normal R-9.8 eligibility; the model never consolidates and is not selected to fight [interp]):
```ts
export interface DeferredDeath { modelId: ModelId; unitId: UnitId; attackerUnitId: UnitId; by: DestroyedBy }
// mark `fightOnDeath:<canonicalUnitId>:<threshold>` (phase-scoped)
export function grantFightOnDeath(state: GameState, unitId: UnitId, threshold: number): void
export function fightOnDeathThreshold(state: GameState, unitId: UnitId): number | null
// marks `deferredDeath:<json DeferredDeath>`
export function deferredDeaths(state: GameState, attackerUnitId?: UnitId): DeferredDeath[]
export function isDeferredDead(state: GameState, modelId: ModelId): boolean
// raise one melee declareTargets per owning unit (weapons list = the deferred models only), resolve via
// attackService.begin({kind:'melee', ...}), then finishDestroy each; 'pending' while a decision is open
export function resolveDeferredDeaths(ctx: EngineContext, attackerUnitId: UnitId): 'pending' | 'done'
```
`src/engine/attack.ts`: split `destroyModel` into the deferral check + a new
`AttackService.finishDestroy(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): void` (today's tail: Deadly
Demise, `removeModel`, `ModelDestroyed`, kill credit, `UnitDestroyed`, missions, detach). `destroyModel` defers when
the phase is `fight`, `fightOnDeathThreshold(state, model.unitId)` is non-null, no half of the unit has
`turn.foughtThisPhase`, and `by.unitId` is an enemy unit: it rolls D6 (`purpose:'ability'`) and on ≥ threshold pushes
the `deferredDeath` mark, emits `AbilityTriggered`, leaves the model at 0 wounds on the board and returns. Every
allocation pool, OC count, coherency check and target-legality query skips `isDeferredDead` models.
`src/engine/phases/fight.ts`: right after an attacking unit's attack sequence finishes (before its consolidation),
call `resolveDeferredDeaths(ctx, attackerUnitId)`; deferred models attack with their melee weapons against enemy
units they are eligible to fight (normal model eligibility, no pile-in/consolidate), then are removed via
`finishDestroy`. A deferred model that cannot fight anything is removed at once. Deferred models never get a Dark Pact
or Sacrificial Dagger prompt (they are not "selected to fight").

**C6 — `holdMore` tie option.** `src/engine/missions.ts` `case 'holdMore'`:
`return (rule.params?.allowTie ? mine >= theirs : mine > theirs) ? rule.pointsPer : 0`. Document `params.allowTie` in
20-data-schema.

Totals: **8 new code hooks** (`darkPact`, `foulZealotry`, `preyOnTheWeak`, `sacrificialDagger`,
`markedForExecution`, `vindictiveStrategy`, `violentUnbinding`, `daemonicFervour`); **6 engine changes** (C1–C6), none
touching a frozen contract (no `00-architecture.md` edit needed; 20-data-schema gets the two new windows and the
`holdMore` param).

## 8. Test IDs

Same list as the `CHA` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| CHA-001 | CHA-2.1 | Legionaries selected to shoot → Dark Pact offered at `shooting.unitSelected` with lethal / sustained / decline; decline → no Ld roll, no effect |
| CHA-002 | CHA-2.1 | Possessed selected to fight → Dark Pact offered at `fight.unitSelected` before pile-in |
| CHA-003 | CHA-2.2 | Pact made, Ld test 2D6 = 7 vs Ld 6+ → pass, no mortal wounds; weapons gain the picked ability until phase end |
| CHA-004 | CHA-2.2 | Pact made, Ld test fails → D3 mortal wounds on the unit (owner allocates), then the ability is still gained |
| CHA-005 | CHA-2.2 | Ld test is not a Battle-shock test: failing never sets `battleShocked`, Insane Bravery is not offered, Battle-shock modifiers do not apply |
| CHA-006 | CHA-2.3 | Lethal Hits pact: boltgun critical hit auto-wounds; Sustained Hits pact: critical hit adds 1 hit; both expire at phase end |
| CHA-007 | CHA-2.3 | attached Zarkan + Possessed make one Pact: one Ld test using best Ld, ability on both halves' weapons |
| CHA-008 | CHA-2.3 | Pact mortal wounds destroy the whole unit → no declareTargets, no ability granted |
| CHA-009 | CHA-2.4 | Fire Overwatch by Legionaries → no Dark Pact prompt |
| CHA-010 | CHA-3 | Foul Zealotry: Zarkan's unit Pact options are both / decline; `both` grants Lethal Hits and Sustained Hits 1 together |
| CHA-011 | CHA-3 | Foul Zealotry does not affect Cultists or an un-led unit (pick-one options) |
| CHA-012 | CHA-3 | Prey on the Weak: Rite of Possession hits enemy unit X → after Zarkan's unit shoots, pick X, X tests Battle-shock with −1 |
| CHA-013 | CHA-3 | Prey on the Weak: enemy hit only by bolt pistol / Legionary boltguns → no prompt; Rite attacks all miss → no prompt |
| CHA-014 | CHA-4 | Marked for Execution: opponent WARLORD destroyed in round 2 → +12 VP; in round 4 → +6 VP; never scores twice |
| CHA-015 | CHA-4 | Marked for Execution: WARLORD killed by its own Hazardous roll still scores |
| CHA-016 | CHA-4 | Sites of Power: round 1 → 0 VP; round 2, end of own turn, 2 vs 2 markers → +2 VP; 1 vs 2 → 0; 0 vs 0 → +2 |
| CHA-017 | CHA-5 | Vindictive Strategy: target at Starting Strength → no hit re-roll; one model lost → hit roll of 1 re-rolled, wound roll of 1 not |
| CHA-018 | CHA-5 | Vindictive Strategy: target below half-strength → hit 1s and wound 1s both re-rolled; attached target uses combined Starting Strength |
| CHA-019 | CHA-5 | Vindictive Strategy not offered for a unit already selected to shoot / that already fought this phase |
| CHA-020 | CHA-5 | Violent Unbinding: enemy melee attack destroys Zarkan, attacker within 6" → window opens before the next attack; D6 = 6 → 3 MW to the attacker |
| CHA-021 | CHA-5 | Violent Unbinding: attacker more than 6" away (shooting) → stratagem not offered; D6 = 1 → no mortal wounds |
| CHA-022 | CHA-5 | Daemonic Fervour: Possessed targeted in the Fight phase, model destroyed, D6 = 4 → model stays at 0 W, not allocatable; before the enemy unit consolidates it may pile in (3", coherency kept against the live models), then attacks with normal fight eligibility (CSM-09/CSM-10), never consolidates; then removed |
| CHA-023 | CHA-5 | Daemonic Fervour: D6 = 3 → removed normally; Possessed already fought this phase → no roll |
| CHA-024 | CHA-5 | Daemonic Fervour: deferred model has no OC and is skipped by coherency; `UnitDestroyed` only after the last deferred model is removed; kill credited to the attacker |
| CHA-025 | CHA-6 | Sacrificial Dagger: Zarkan selected to shoot, use → his unit suffers 1 MW; Rite of Possession gets +1 hit and +1 wound this phase; bolt pistol does not |
| CHA-026 | CHA-6 | Sacrificial Dagger offered at most once per phase and only after the Dark Pact prompt |
| CHA-027 | CHA-6 | Veterans of the Long War: Legionaries melee wound roll of 1 re-rolled; target within range of a marker → any failed wound roll re-rolled; ranged attacks unaffected |
| CHA-028 | CHA-6 | Rite of Possession vs a PSYKER target: Anti-PSYKER 2+ → every unmodified wound roll of 2+ is a critical wound; Precision lets the attacker allocate to a visible CHARACTER |
| CHA-029 | CHA-6 | Zarkan and Possessed have a 5+ invulnerable save (used against AP −3 instead of the 3+ armour) |
| CHA-030 | CHA-6 | Legionary heavy bolter: Heavy +1 to hit when Remained Stationary; meltagun Melta 2 at half range |
| CHA-031 | CHA-1 | patrol loads: 4 units, 26 models, Zarkan is WARLORD with Foul Zealotry and attached to Possessed; default secondary Marked for Execution |
| CHA-032 | CHA-1 | Zarkan may instead attach to Legionaries (pre-game choice); never to Cultists |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `aranis-zarkan` | `csm.aranis-zarkan/zarkan` | 1 | 1.25 | 40 mm | A chibi armoured sorcerer in blue-black plate with brass trim, a tall horned helm with a glowing violet visor, a ragged crimson robe over the armour, a long staff topped by a caged glowing violet skull and a curved ritual dagger at the belt. |
| `possessed` | `csm.possessed/possessed` | 5 | 1.4 | 40 mm | A chibi hulking mutated warrior bursting out of blue-black armour, one arm swollen into a huge claw, spiky tentacles and bony horns sprouting from the shoulders, crimson flesh and a wide fanged grin under a cracked helm. |
| `legionary-champion` | `csm.legionaries/champion` | 1 | 1.15 | 32 mm | A chibi spiky-armoured warrior in blue-black and brass with a horned crested helm and a crimson cape, a short plasma pistol with a violet glow in one hand and a jagged glowing sword in the other. |
| `legionary-boltgun` | `csm.legionaries/boltgun` | 7 | 1.1 | 32 mm | A chibi power-armoured warrior in blue-black plate with brass edging, spiked shoulder pads, a helm with a grille mouth and red eye-lenses, holding a chunky rifle across the chest. |
| `legionary-heavy-bolter` | `csm.legionaries/heavy-bolter` | 1 | 1.1 | 32 mm | Same chibi blue-black warrior bracing an oversized drum-fed heavy gun at the hip with an ammo belt looping to a backpack. |
| `legionary-melta` | `csm.legionaries/meltagun` | 1 | 1.1 | 32 mm | Same chibi blue-black warrior holding a stubby wide-barrelled heat gun with a glowing orange muzzle and coolant fins. |
| `cultist-champion` | `csm.cultist-mob/champion` | 1 | 1.0 | 25 mm | A chibi human zealot in a hooded crimson robe with scrap-metal shoulder plates and a brass face mask, a pistol in one hand and a heavy cleaver in the other. |
| `cultist` | `csm.cultist-mob/cultist` | 9 | 1.0 | 25 mm | A chibi ragged human cultist with a rough cloth hood, patched crimson rags and leather straps, a small pistol in one hand and a crude jagged blade in the other. |

## 10. Other Chaos Space Marines patrols (appendix)

- **Dark Zealots** (Index, June 2023) — Ghallaron the Pious, Dark Apostle + 2 Dark Disciples (WARLORD, leads Legionaries); Legionaries ×10 (Patrol Squads); Havocs ×5; Helbrute ×1. Uses the older Dark Pacts wording (Leadership test after the unit's attacks resolve).
