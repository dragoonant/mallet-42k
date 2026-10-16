# Faction spec — Death Guard: The Shambling Horde

Own-words data spec for the Death Guard Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `DTG-<section>.<n>`
are cited by the `DTG-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours. Faction id `death-guard`, data directory `src/data/factions/death-guard/`, data id prefix `dg.`, faction
keyword DEATH GUARD.

**Test-ID prefix note:** the workflow asked for `DEA-`, but `DEA-001…` is already taken by Deathwatch (12-rules-test-checklist
§DEA). Coverage is measured by test names, so a shared prefix would let one faction's tests satisfy the other's
rows. This faction uses **`DTG-`** instead.

## 0. Sources (accessed 2026-10-16)

| Source | URL | Version shown on page |
|---|---|---|
| Death Guard patrol "The Shambling Horde" (primary, only one) | https://wahapedia.ru/wh40k10ed_cp/factions/the-shambling-horde/ | Index: The Shambling Horde, 10th ed, **June 2023** |
| CP faction navigation (used to enumerate patrols) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | lists exactly one DEATH GUARD patrol |
| Matched-play Death Guard faction page (cross-check only, not a rules source) | https://wahapedia.ru/wh40k10ed/factions/death-guard/ | Faction Pack v1.1, April 2026; draws Contagion Range as images, same as the CP page |
| Combat Patrol format rules | CP rules page above | already captured in 11-combat-patrol §1–2; not re-transcribed |

Patrol selection: the navigation lists only The Shambling Horde for Death Guard (owner's choice as well). §10 records
that there are no others.

**Unconfirmed value:** both pages show Contagion Range as three diagrams (`ContagionRange1–3.png`) with no text.
This spec uses the Index values **3" in battle round 1, 6" in round 2, 9" from round 3 on**, from our knowledge of
the June 2023 Index. They live in data (`params.ranges`), so a check against the images only changes data.

## 1. Roster

6 units, 39 models. Faction keyword DEATH GUARD on every datasheet; every unit also has CHAOS, NURGLE, INFANTRY.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `typhus` | Typhus | 1 | master-crafted manreaper (2 profiles) | **WARLORD**. Leader → Poxwalkers only; default attached to `poxwalkers-a` |
| `grelch` | Folgoth Grelch | 1 | hyper blight grenades; injector pistol; plague knives | Leader → Plague Marines only (default attached) |
| `plague-marines` | Plague Marines | 7 | Plague Champion: plague boltgun + heavy plague weapon; 1× plague spewer + plague knives; 1× blight launcher + plague knives; 4× plague boltgun + plague knives | bodyguard for Grelch |
| `poxwalkers-a` | Poxwalkers | 10 | each: improvised weapon | bodyguard for Typhus (default) |
| `poxwalkers-b` | Poxwalkers | 10 | each: improvised weapon | — |
| `poxwalkers-c` | Poxwalkers | 10 | each: improvised weapon | — |

| Id | Rule |
|---|---|
| DTG-1.1 | The patrol page lists Poxwalkers (10 models) three times, so the patrol has **three separate 10-model Poxwalkers units**. No datasheet has wargear options or a Patrol Squads ability (CP-1.8 does not apply). |
| DTG-1.2 | Typhus can lead only Poxwalkers. He may lead any one of the three units, chosen before the game; by default he leads `poxwalkers-a`. Grelch can lead only the Plague Marines. |
| DTG-1.3 | Typhus is the WARLORD and starts with Walking Plague. The owner may swap it for Miasmic Arrival before the game. |

## 2. Faction ability — Nurgle's Gift (Aura; every datasheet)

| Id | Rule |
|---|---|
| DTG-2.1 | Every unit in this patrol has a **Contagion Range**, set by the battle round: 3" in round 1, 6" in round 2, 9" in round 3 and later **[values unconfirmed, see §0]**. It is measured unit to unit (closest models, the normal "within" rule) from the unit that has the ability. |
| DTG-2.2 | While an enemy unit is within the Contagion Range of one or more friendly units with this ability, each model in that enemy unit has −1 Toughness. |
| DTG-2.3 | The modifier does **not stack**. An enemy within range of three Death Guard units still loses only 1 Toughness (R-10.11 one contribution per source; every holder shares the ability id `dg.a.nurgles-gift`). Toughness never drops below 1. |
| DTG-2.4 | The check is live. It applies to every Toughness query (wound rolls, UI stat display) while the condition holds and stops as soon as the units are out of range. An attached enemy unit is one unit: if either half is in range, both halves lose 1 Toughness. |
| DTG-2.5 | Units in Reserves have no Contagion Range, and enemy units in Reserves are never in range. |

## 3. Enhancements (Typhus, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Walking Plague | default | Once in each of your Command phases (at `command.start`, before the Battle-shock step), you may pick one friendly POXWALKERS unit on the battlefield that is within the bearer's Contagion Range and has at least one destroyed model. Roll D6 and return that many destroyed Poxwalkers models to that unit, stopping early if it is back to Starting Strength or out of destroyed models. Each returned model has full wounds. Placement uses the Reanimation rules (NEC-2.4 via `findReturnSpot`): in coherency, wholly on the board, and not newly within Engagement Range of an enemy unit. If a model has no legal spot, it and any remaining returns are lost. **[interpretation]** Distance is measured from the bearer model, so the unit Typhus leads always qualifies. "Up to D6" returns as many as possible and offers no partial choice. A Poxwalkers unit that is wholly destroyed is no longer on the battlefield and cannot be picked. |
| Miasmic Arrival | optional | Every model in the bearer's unit has Deep Strike. Typhus already has it. While he leads Poxwalkers, that combined unit may be set up in Reserves and arrive by Deep Strike (CP: from round 2, more than 9" from all enemy models). If Typhus is not attached, the enhancement changes nothing. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Contaminate Ground | default | From battle round 2, at the end of each of your turns: 3 VP if at least one of your DEATH GUARD units on the battlefield, not Battle-shocked, has a model within 3" of the battlefield centre (base edge to the centre point (0,0), horizontal distance). At most 3 VP per turn. An attached unit is one unit; if either half is Battle-shocked, it does not count. |
| Spread the Blight | optional | 2 VP each time a DEATH GUARD unit from your army destroys an enemy unit, if that enemy unit was within Contagion Range of at least one of your units at the **start of the phase** in which it was destroyed. No cap. A unit that arrived from Reserves during the phase did not start it within range. **[interpretation]** "Destroys" means the destroying credit (`destroyedBy.unitId`) belongs to one of your DEATH GUARD units, whatever the kill type (attacks, Devastating Wounds, Grelch's Deadly Demise). Enemy units stranded in Reserves at the end of round 3 do not score. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Corrosive Effluents | 1 | battleTactic | your Shooting phase (`shooting.start`, `shooting.attacksResolved`) or either player's Fight phase (`fight.start`, `fight.attacksResolved`), between activations | one own DEATH GUARD unit that has not been selected to shoot or fight this phase | until end of phase, every attack made by a model in that unit has its AP improved by 1 (AP 0 → −1, −2 → −3). This covers ranged and melee attacks alike, plus Torrent. |
| Harbingers of Despair | 1 | strategicPloy | start of either player's Fight phase (`fight.start`) | one own DEATH GUARD unit on the battlefield that is within Engagement Range of at least one enemy unit | every enemy unit (canonical; an attached unit tests once) within Engagement Range of the target takes a Battle-shock test immediately, with normal modifiers |
| Disgustingly Resilient | 1 | battleTactic | opponent's Shooting phase, `shooting.targetsDeclared` (just after an enemy unit picks its targets) | one own DEATH GUARD unit that was picked as a target | until end of phase, every attack allocated to a model in that unit has its Damage reduced by 1 (minimum 1). This applies after a random D is rolled, and Melta is added before the reduction. |

Core stratagems apply per 10-rules §11 under their own gates. Fire Overwatch needs a ranged weapon, so Typhus and the
Poxwalkers never get it. Epic Challenge needs a CHARACTER (Typhus, Grelch). Go to Ground covers all INFANTRY. No unit
has GRENADES, SMOKE or VEHICLE.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Typhus | 1 | 50 mm | 5 | 6 | 2+ | 4+ | 6 | 6+ | 1 | INFANTRY, CHARACTER, EPIC HERO, CHAOS, NURGLE, PSYKER, TERMINATOR, TYPHUS | Deep Strike; Leader → Poxwalkers; Nurgle's Gift; **The Destroyer Hive** (DTG-6.1) |
| Folgoth Grelch | 1 | 40 mm | 5 | 5 | 3+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, CHAOS, NURGLE, BIOLOGUS PUTRIFIER, FOLGOTH GRELCH | Deadly Demise 1; Leader → Plague Marines; Nurgle's Gift; **Foul Infusion** (DTG-6.2) |
| Plague Marines | 7 | 32 mm | 5 | 5 | 3+ | — | 2 | 6+ | 2 | INFANTRY, BATTLELINE, CHAOS, NURGLE, PLAGUE MARINES | Nurgle's Gift; **Remorseless** (DTG-6.3) |
| Poxwalkers (×3 units) | 10 | 25 mm | 4 | 4 | 7+ | — | 1 | 8+ | 1 | INFANTRY, CHAOS, NURGLE, POXWALKERS | Feel No Pain 5+; Nurgle's Gift; **Curse of the Walking Pox** (DTG-6.4) |

Faction keyword (all): DEATH GUARD.

| Id | Rule |
|---|---|
| DTG-6.1 | **The Destroyer Hive**: while Typhus leads a unit, every melee attack that targets that unit gets −1 to its hit roll (subject to the R-6 ±1 cap). It does nothing while he is unattached. |
| DTG-6.2 | **Foul Infusion**: while Grelch leads a unit, every weapon of every model in it, his own included, has [LETHAL HITS], and an unmodified hit roll of **5+** is a Critical Hit for those models' attacks. Torrent weapons make no hit roll, so the spewer gains nothing. |
| DTG-6.3 | **Remorseless**: while the unit (attached unit included) is within range of an objective marker its controller controls, add 1 to its Battle-shock tests. |
| DTG-6.4 | **Curse of the Walking Pox**: each time an attack by a model in this unit destroys an enemy model that is neither MONSTER nor VEHICLE, return one destroyed Poxwalkers model to this unit (`findReturnSpot` placement, full wounds), if any is destroyed and the unit is below Starting Strength. **[interpretation]** The return is automatic: the rule says "may", but no situation makes declining better, so there is no prompt. A kill by Typhus while he leads the unit counts, because the attached unit is one unit (R-10.1); owner-changeable via `params.includeLeader`. A model with no legal spot is not returned. Kills by mortal wounds outside an attack (Deadly Demise, Hazardous) do not count. |
| DTG-6.5 | Typhus has the PSYKER keyword but no Psychic weapon or ability on this page. The keyword only matters for enemy Anti-PSYKER weapons. |
| DTG-6.6 | Grelch has **Deadly Demise 1** as printed on the CP page. When he is destroyed, roll D6: on a 6, each unit within 6" suffers 1 mortal wound. |
| DTG-6.7 | Poxwalkers Sv 7+ means no armour save is possible unless cover improves it to 6+ (R-7). Feel No Pain 5+ applies to every wound lost, mortal wounds included. |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Typhus | — | — | master-crafted manreaper (strike / sweep) |
| Folgoth Grelch | — | hyper blight grenades, injector pistol | plague knives (Grelch) |
| Plague Marines | Plague Champion | plague boltgun | heavy plague weapon |
| Plague Marines | Plague Marine (spewer) ×1 | plague spewer | plague knives |
| Plague Marines | Plague Marine (blight launcher) ×1 | blight launcher | plague knives |
| Plague Marines | Plague Marine (boltgun) ×4 | plague boltgun | plague knives |
| Poxwalkers | ×10 | — | improvised weapon |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| master-crafted manreaper — strike | melee | 5 | 2+ | 9 | −2 | 3 | Lethal Hits |
| master-crafted manreaper — sweep | melee | 10 | 2+ | 6 | −1 | 1 | Lethal Hits |
| hyper blight grenades | 12" | D6 | 3+ | 5 | −1 | 2 | Assault, Blast, Lethal Hits |
| injector pistol | 3" | 1 | 3+ | 4 | −1 | 3 | Pistol |
| plague knives (Grelch) | melee | 4 | 3+ | 4 | 0 | 1 | Lethal Hits |
| plague knives (Plague Marines) | melee | 3 | 3+ | 4 | 0 | 1 | Lethal Hits |
| plague boltgun | 24" | 2 | 3+ | 4 | 0 | 1 | Lethal Hits |
| blight launcher | 24" | 2 | 3+ | 6 | −1 | 2 | Lethal Hits |
| plague spewer | 12" | D6 | n/a | 5 | −1 | 1 | Anti-Infantry 2+, Ignores Cover, Torrent |
| heavy plague weapon | melee | 3 | 4+ | 8 | −2 | 2 | Lethal Hits |
| improvised weapon | melee | 2 | 5+ | 3 | 0 | 1 | Lethal Hits |

Suggested `paintScheme` (original): primary `#8b9460` (faded olive-green plate), secondary `#6e5434` (rust
bronze), trim `#b39456` (tarnished brass), metal `#7c7d77`, decal `#c6d45a` (sickly glow-green).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, implemented in a new `src/engine/factions/death-guard.ts` exporting
`deathGuardHooks()`); (c) = engine change beyond a code hook. **No (c) item touches a frozen contract**
(`types/actions/events/hooks/rng/decider/index.ts`). All signals reuse existing events (`AbilityTriggered`,
`DiceRolled`, `ModelDestroyed`, `UnitDestroyed`, `BattleShockTested`, `VpScored`). Model returns reuse the Necrons
mechanism (`findReturnSpot` / `returnModel` in `src/engine/factions/necrons.ts`, already reused by Tyranids' Teeming
Broods), and no new return code is written.

Shared helper (in `factions/death-guard.ts`, hooks agent):
```ts
// DTG-2.1: 0 when the unit (either half) has no ability with code 'nurglesGift' or is not on the battlefield; otherwise
// params.ranges[min(round,3)-1] of that ability (default [3,6,9])
export function contagionRange(state: GameState, unitId: UnitId): number
// DTG-2.2: enemy (canonical, either half) within contagionRange of >=1 board unit of `player` holding nurglesGift
export function withinContagionOf(state: GameState, enemyUnitId: UnitId, player: PlayerId): boolean
```

| Rule | Enc. | Encoding |
|---|---|---|
| Nurgle's Gift (DTG-2.1–2.5) | (a)+(b) | ability `dg.a.nurgles-gift` on every datasheet: `{trigger:'always', effect:{modifyStat:{stat:'T', value:-1}}, scope:{who:'enemy'}, code:'nurglesGift', params:{ranges:[3,6,9]}}`. Hook `nurglesGift` follows the `radSaturation` pattern (`kind:'ability'`, `hook:'onStatQuery'`, `run: noop`). `gate(state, holder, entry, data)`: holder on board, `data.stat === 'T'`, `data.queryUnitId` is an enemy unit, `leaderService.unitDistance(state, queryUnitId, holder.id) <= contagionRange(state, holder.id) + 1e-6`. Non-stacking comes free from the `matchEffects` dedupe by `source.id` (DTG-2.3). `clampStat` keeps T ≥ 1. |
| Walking Plague | (b) | enhancement `dg.e.walking-plague` `{trigger:'commandPhase', code:'walkingPlague'}`. Hook `walkingPlague`: `pick` at window `command.start` (own turn, key = bearer unit id, mark `pick:walkingPlague:<round>`). `offer`: candidate own board units with keyword POXWALKERS where `destroyedModels.length > 0`, `models.length < startingStrength`, and `leaderService.unitDistance` from the bearer model ≤ `contagionRange(bearer unit)`; options = those units + `decline` (no candidate → no decision). `handle`: `ctx.rollExpr('D6', {purpose:'ability', …})`, then loop exactly as `teemingBroodsApply`'s on-board branch: `findReturnSpot` → `returnModel` → set `woundsRemaining = W`; stop at Starting Strength, at no destroyed models, or at no legal spot. Emit `AbilityTriggered` with the count. |
| Miasmic Arrival | (b)+(c) | enhancement `dg.e.miasmic-arrival` `{trigger:'always', code:'grantDeepStrike', scope:{who:'self'}}`. Hook `grantDeepStrike` is a marker (`kind:'ability'`, `hook:'onDeployment'`, `run: noop`, `gate: () => false`), read by E1. |
| Contaminate Ground | (b) | secondary `scoring:[{id:'contaminate-ground', when:'turn.end', rounds:{from:2,to:5}, who:'active', rule:'custom', code:'contaminateGround', pointsPer:3, cap:3, params:{within:3, keyword:'DEATH GUARD'}}]`. `contaminateGround = missionHook('contaminateGround', 'onTurnEnd')` plus `case 'contaminateGround'` in `missions.ts` `customAmount` → `contaminateGroundAmount(s, rule, pid)` in `factions/death-guard.ts`. It mirrors `consecratedGroundAmount`: canonical board units of `pid` with the keyword on either half, no half `battleShocked`, some model with `Math.max(0, signedDistanceToBase({x:0,z:0}, m)) <= within`, and returns `pointsPer`, with no Warlord bonus. |
| Spread the Blight | (b) | secondary `scoring:[{id:'spread-the-blight', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'spreadTheBlight', pointsPer:2, cap:99}]`. `spreadTheBlight = missionHook('spreadTheBlight', 'onUnitDestroyed')`. In `missions.ts`, add next to `snapshotTreasures`: `if (window.endsWith('.start') && once(s, 'blightSnapshot:'+window)) spreadTheBlightSnapshot(s)`. It stores the canonical enemy unit ids where `withinContagionOf(s, id, pid)` is true, for each player who has the rule, in `players[pid].secondaryState['dg:blight']` (`{round, turn, phase, ids}`). Add `spreadTheBlightDestroyed(ctx, info)` to `unitDestroyedHook`: `info.byUnitId` belongs to `pid` and has DEATH GUARD (either half), the destroyed canonical id is in the snapshot taken this phase, then award `pointsPer` (cap check as `infiltratorsUnitDestroyed`). |
| Corrosive Effluents | (a) | stratagem `window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:true},{phase:'fight'}]}`, target `{role:'unit', owner:'friendly', filter:{keyword:'DEATH GUARD'}, state:'notYetActivated', count:1}`, `effect:{modifyStat:{stat:'AP', value:-1}}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`. Same shape as `ade.s.pen.a-martyrs-death`. |
| Harbingers of Despair | (b) | stratagem `window:'fight.start'`, `who:'either'`, `condition:{phase:'fight'}`, target `{role:'unit', owner:'friendly', filter:{keyword:'DEATH GUARD'}, state:'inEngagement', count:1}`, `duration:'instant'`, `code:'harbingersOfDespair'`. Hook (`kind:'stratagem'`, `hook:'onPhaseStart'`): `apply` emits `AbilityTriggered` and calls `hookService.battleShockTest(ctx, enemyCanonical, stratagemId)` for each distinct canonical enemy unit within Engagement Range of the target. Reuse the engagement scan from `pistonDrivenBrutality`, or export `enemiesInEngagement` from `factions/adeptus-mechanicus.ts`. |
| Disgustingly Resilient | (a) | stratagem `window:'shooting.targetsDeclared'`, `who:'either'`, `condition:{phase:'shooting', ownTurn:false}`, target `{owner:'friendly', filter:{keyword:'DEATH GUARD'}, state:'targetedByAttack', count:1}`, `effect:{damageReduction:1}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'` |
| The Destroyer Hive | (a) | `{trigger:'hitRoll', when:{leaderAttached:true, weaponType:'melee'}, effect:{modifyRoll:{roll:'hit', value:-1}}, scope:{who:'attacker'}}` (Deft Parry pattern + `leaderAttached`) |
| Foul Infusion | (a) | two descriptors: `{trigger:'always', when:{leaderAttached:true}, effect:{grantWeaponAbility:{ability:'LETHAL_HITS'}}, scope:{who:'self'}}` and `{trigger:'hitRoll', when:{leaderAttached:true}, effect:{lethalOn:5}, scope:{who:'self'}}` (`lethalOn` sets the critical-hit threshold) |
| Remorseless | (a)+(c) | `{trigger:'battleShockTest', when:{unitOnObjectiveControlledBy:'self'}, effect:{modifyRoll:{roll:'battleShock', value:1}}, scope:{who:'self'}}`, which needs the E2 condition key |
| Curse of the Walking Pox | (b) | ability `dg.a.curse-of-the-walking-pox` `{trigger:'modelDestroyed', code:'curseOfTheWalkingPox', params:{includeLeader:true, excludeKeywords:['MONSTER','VEHICLE']}}`. Hook (`kind:'ability'`, `hook:'onModelDestroyed'`, `runAt`, the `feederTendrils` pattern): `data.byModelId` is a model of the holder, or of its attached leader when `includeLeader`; `data.kind` is `'ranged' \| 'melee'`; the destroyed unit is an enemy; the destroyed model's keywords (fall back to the datasheet's, as feederTendrils does) contain none of `excludeKeywords`; the holder is on the board with `destroyedModels.length > 0` and `models.length < startingStrength`. Then `findReturnSpot(s, holder.id, snapshot)` (last destroyed) → `returnModel(ctx, holder, snapshot, pos, abilityId)` → full W, and emit `AbilityTriggered`. No spot → nothing. It only runs from `announceDestroyed` (`hooks.run`), never as a removal deferral. |
| Leader (Typhus → Poxwalkers; Grelch → Plague Marines) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['dg.poxwalkers']` / `['dg.plague-marines']`; patrol `attachTo:'poxwalkers-a'` / `'plague-marines'` |
| Deep Strike (Typhus), Deadly Demise 1 (Grelch), Feel No Pain 5+ (Poxwalkers) | (a) | `coreAbilities`: `DEEP_STRIKE`; `DEADLY_DEMISE` value `"1"`; `FEEL_NO_PAIN` value `5` |
| Typhus 4+ invulnerable save | (a) | datasheet `invuln: 4` |
| Weapon abilities (Lethal Hits, Assault, Blast, Pistol, Anti-Infantry 2+, Ignores Cover, Torrent) | (a) | `LETHAL_HITS`, `ASSAULT`, `BLAST`, `PISTOL`, `ANTI {keyword:'INFANTRY', value:2}`, `IGNORES_COVER`, `TORRENT` (`skill:null`); manreaper as one `profileGroup` |
| BATTLELINE (Plague Marines) | (a) | keyword, which feeds CP-2.4 secured objectives |
| CHAOS, NURGLE, PSYKER, TERMINATOR, EPIC HERO | (a) | plain keywords |

### 7.1 Engine changes (c): exact signatures

Both are in non-frozen files. The engine agent builds them; the (b) hooks code against these signatures.

**E1: Deep Strike granted by an ability (Miasmic Arrival).** New export in `src/engine/state.ts`, next to
`hasCoreAbility`. It lives there, not in `leaders.ts`, to avoid an import cycle. It resolves the partner through the
unit's own `bodyguardUnitId` / attached-leader fields:
```ts
// true when the unit's datasheet has DEEP_STRIKE, or when the unit or its attached partner carries a runtime ability or
// enhancement (state.abilities, enhancement bearer in either half) whose `code` is 'grantDeepStrike'
// (an enhancement's bearer unit = the whole attached unit)
export function hasDeepStrike(state: GameState, unitId: UnitId): boolean
```
Replace all four datasheet-only checks with it, keeping each `|| u.deepStrikeWith !== null`:
`movement.ts` private `hasDeepStrike` (line ~583), `setup.ts` `canDeepStrike` (~30), `state.ts` (~584) and
`code-hooks.ts` (~407, Rapid Ingress). `reserveRouteFor` already asks every reserve half, so Typhus + Poxwalkers
arrive by Deep Strike once the Poxwalkers answer true through Typhus's enhancement.
`grantDeepStrike` must be registered in `codeHooks` (marker, §7). Document the code in 20-data-schema §3.

**E2: condition key `unitOnObjectiveControlledBy` (Remorseless).** `src/data/types.ts` `Condition`: add
`unitOnObjectiveControlledBy?: 'self' | 'opponent'`. Add the same to the JSON schema under `src/data/schema`
(Condition `$def`). `src/engine/hooks-impl.ts` `evaluateCondition`:
```ts
if (c.unitOnObjectiveControlledBy !== undefined) {
  const wanted = c.unitOnObjectiveControlledBy === 'self' ? env.player : (env.player === 'A' ? 'B' : 'A')
  if (!(h && targetOnControlledObjective(state, h.id, wanted))) return false
}
```
(`targetOnControlledObjective` already checks both halves and `o.controller`). Add it to 20-data-schema §3's condition
list next to `targetOnObjectiveControlledBy`.

Totals: **7 new code hooks** (`nurglesGift`, `walkingPlague`, `grantDeepStrike`, `contaminateGround`,
`spreadTheBlight`, `harbingersOfDespair`, `curseOfTheWalkingPox`) plus the `missions.ts` wiring for the two
secondaries (customAmount case, phase-start snapshot, unitDestroyed fan-out). **2 engine changes** (E1, E2), neither
touching a frozen contract, so no `00-architecture.md` edit is needed. 20-data-schema gets `grantDeepStrike` and
`unitOnObjectiveControlledBy`.

## 8. Test IDs

Same list as the `DTG` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| DTG-001 | DTG-1 | patrol loads: faction `death-guard`, 6 units, 39 models (1+1+7+10+10+10); Typhus is WARLORD with Walking Plague, attached to `poxwalkers-a`; Grelch attached to Plague Marines; default secondary Contaminate Ground |
| DTG-002 | DTG-1.2 | Typhus may instead lead `poxwalkers-b` or `-c` (pre-game), never Plague Marines; Grelch may lead only Plague Marines |
| DTG-003 | DTG-6 | data: every stat/profile row of §6 matches (Typhus T6 2+ 4++ W6 base 50 mm; Poxwalkers Sv 7+ Ld 8+ M4; Plague Marines OC 2; manreaper strike 5A S9 AP−2 D3 / sweep 10A S6 AP−1 D1; spewer D6 Torrent Anti-Infantry 2+) |
| DTG-004 | DTG-2.1 | Contagion Range is 3" in round 1, 6" in round 2, 9" in rounds 3–5 (`contagionRange`) |
| DTG-005 | DTG-2.2 | round 1: enemy T4 unit 2.9" from Plague Marines → wound rolls against it use T3; at 3.1" → T4 |
| DTG-006 | DTG-2.3 | enemy within range of three DG units → T reduced by 1 only; a T1 target stays T1 |
| DTG-007 | DTG-2.4 | enemy moves out of range mid-turn → T restored immediately; an attached enemy unit with one half in range → both halves at −1 T |
| DTG-008 | DTG-2.5 | DG unit in Reserves projects no Contagion Range; aura never affects friendly units |
| DTG-009 | DTG-3 | Walking Plague: Command phase, Poxwalkers unit with 4 destroyed models within range, D6 = 6 → 4 return (cap at Starting Strength), at full W, in coherency, not newly in Engagement Range |
| DTG-010 | DTG-3 | Walking Plague: Poxwalkers unit outside the bearer's Contagion Range or at full strength → not offered; no candidate → no decision; offered once per Command phase, before Battle-shock tests |
| DTG-011 | DTG-3 | Walking Plague: no legal spot for a returned model → it and the remaining returns are lost; a wholly destroyed Poxwalkers unit cannot be picked |
| DTG-012 | DTG-3 | Miasmic Arrival: Typhus + Poxwalkers may be set up in Reserves and arrive by Deep Strike (round 2+, >9" from enemies); without it, the attached pair cannot go into Deep Strike Reserves |
| DTG-013 | DTG-4 | Contaminate Ground: round 1 → 0 VP; round 2 end of own turn, Plague Marines model 2.9" from centre → +3 VP; 3.1" → 0; two units in → still 3 VP |
| DTG-014 | DTG-4 | Contaminate Ground: the only unit near the centre is Battle-shocked → 0 VP; opponent's turn end → no score |
| DTG-015 | DTG-4 | Spread the Blight: enemy unit within Contagion Range at the start of the Fight phase, destroyed by Poxwalkers that phase → +2 VP; two such kills → +4 VP |
| DTG-016 | DTG-4 | Spread the Blight: enemy that moved into range during the phase (outside at phase start) → no VP; enemy that arrived by Deep Strike this phase → no VP |
| DTG-017 | DTG-5 | Corrosive Effluents: Plague Marines' plague boltgun AP 0 → −1 and heavy plague weapon −2 → −3 until end of phase; offered in either Fight phase; not for a unit that already shot / fought this phase |
| DTG-018 | DTG-5 | Harbingers of Despair: at the start of a Fight phase, Poxwalkers in Engagement Range of two enemy units → each takes one Battle-shock test; an attached enemy unit tests once; not offered for a DG unit not in Engagement Range |
| DTG-019 | DTG-5 | Disgustingly Resilient: enemy targets Plague Marines with D2 weapons → each allocated attack deals 1; D1 attacks stay 1; random D rolled first; only in the opponent's Shooting phase |
| DTG-020 | DTG-6.1 | The Destroyer Hive: melee attacks against Typhus + Poxwalkers get −1 to hit; ranged attacks do not; unattached Typhus gets no modifier |
| DTG-021 | DTG-6.2 | Foul Infusion: with Grelch attached, a plague boltgun unmodified hit roll of 5 is a Critical Hit and auto-wounds (Lethal Hits); Plague Marines without Grelch crit only on 6 |
| DTG-022 | DTG-6.3 | Remorseless: Plague Marines within range of a marker their side controls → Battle-shock test +1; marker contested or enemy-controlled → no bonus |
| DTG-023 | DTG-6.4 | Curse of the Walking Pox: a Poxwalker kills an enemy INFANTRY model while the unit has destroyed models → one Poxwalker returns at once (placement rules), up to Starting Strength |
| DTG-024 | DTG-6.4 | Curse of the Walking Pox: killing a MONSTER or VEHICLE model → no return; unit at full strength → no return; the kill by attached Typhus returns a Poxwalker (`includeLeader`) |
| DTG-025 | DTG-6.6 | Grelch destroyed → Deadly Demise 1: D6 = 6 → 1 mortal wound to each unit within 6"; 1–5 → nothing |
| DTG-026 | DTG-6.7 | Poxwalkers: AP 0 attack, Sv 7+ → no armour save; in cover 6+ save is rolled; Feel No Pain 5+ ignores wounds incl. mortal wounds |
| DTG-027 | DTG-6 | Typhus 4+ invuln used against AP −3 (2+ armour becomes 5+); hyper blight grenades Blast +2 A vs a 10-model unit, Assault after Advancing; injector pistol fired in Engagement Range |
| DTG-028 | E2 | condition `unitOnObjectiveControlledBy: 'self'` true only when the holder (either half) is in range of a marker whose `controller` is the holder's player; existing `targetOnObjectiveControlledBy` unchanged |
| DTG-029 | E1 | `hasDeepStrike` true for a datasheet with DEEP_STRIKE and for any half of an attached unit carrying `grantDeepStrike`; false otherwise; existing Deep Strike and Tellyporta tests unchanged |
| DTG-030 | DTG-1 | AI: a full AI-vs-AI game with this patrol (both sides or vs Space Marines) finishes without a stuck decision (Walking Plague prompt, Harbingers, Curse returns) |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3); bases are rules-true.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `typhus` | `dg.typhus/typhus` | 1 | 1.4 | 50 mm | A chibi hulking plague lord in bloated olive-green heavy armour with rusted bronze trim, a single tall horn on a hooded helm, a cracked chimney-like vent on his back trailing a cloud of tiny buzzing flies, holding a huge two-handed scythe. |
| `folgoth-grelch` | `dg.folgoth-grelch/grelch` | 1 | 1.15 | 40 mm | A chibi pot-bellied plague alchemist in grimy olive-green armour with a tarnished brass rebreather mask, a bandolier of glowing green glass grenades across the chest, a syringe pistol in one hand and a short rusty knife in the other. |
| `plague-champion` | `dg.plague-marines/champion` | 1 | 1.15 | 32 mm | A chibi swollen armoured warrior in faded olive-green plate with rust-bronze edging, a one-horned helm with a single round eye-lens, a rifle at the hip and a heavy cleaver-headed axe raised overhead. |
| `plague-marine-spewer` | `dg.plague-marines/spewer` | 1 | 1.15 | 32 mm | Same chibi olive-green plague warrior lugging a stubby wide-nozzled sprayer fed by a sloshing green tank on the back, dripping sickly green liquid. |
| `plague-marine-blight-launcher` | `dg.plague-marines/blight-launcher` | 1 | 1.15 | 32 mm | Same chibi olive-green plague warrior shouldering a short fat-barrelled launcher with a drum magazine of glowing green shells. |
| `plague-marine` | `dg.plague-marines/boltgun` | 4 | 1.15 | 32 mm | A chibi bulky plague warrior in pitted olive-green armour with rust patches, a round-bellied torso, a dented helm with a breathing tube, holding a chunky rusted rifle with a small knife at the belt. |
| `poxwalker` | `dg.poxwalkers/poxwalker` | 30 (two variants, 15 each) | 1.0 | 25 mm | A chibi shambling zombie-like mutant in torn grey-green work clothes, pale greenish skin, a small horn sprouting from the forehead, slack jaw and arms forward, gripping a rusty wrench or a broken pipe. |
| `poxwalker-b` | `dg.poxwalkers/poxwalker` (variant) | (see above) | 1.0 | 25 mm | Same chibi shambling mutant with a hunched back and ragged hood, one arm swollen and blotchy, dragging a cracked shovel. |

## 10. Other Death Guard patrols (appendix)

- None. The Combat Patrol navigation lists only **The Shambling Horde** (Index, June 2023) for Death Guard.
