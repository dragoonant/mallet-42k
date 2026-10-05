# Faction spec — Adeptus Custodes: Guardians of the Throne

Own-words data spec for the Adeptus Custodes Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `CUS-<section>.<n>`
are cited by the `CUS-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose here
is ours. Data id prefix: `cus.` (faction id `adeptus-custodes`, faction keyword `ADEPTUS CUSTODES`).

Prefix note: `ADE-` / `ade.` are already taken by Adepta Sororitas (checklist section "ADE", data ids `ade.*`), so this
faction uses `CUS-` test ids and `cus.` data ids to keep coverage-by-test-name unambiguous.

## 0. Sources (accessed 2026-10-05)

| Source | URL | Version shown on page |
|---|---|---|
| Adeptus Custodes box "Guardians of the Throne" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/guardians-of-the-throne/ | Index, 10th ed, June 2023 |
| Alternate patrol "Tristraen's Gilded Blades" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/tristraen-s-gilded-blades/ | Index, 10th ed, April 2024 |
| CP navigation (used to enumerate patrols) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | — |

Patrol selection: the wahapedia CP navigation lists two Adeptus Custodes patrols. Guardians of the Throne is primary;
Tristraen's Gilded Blades is listed in §10 only.

## 1. Roster

Faction keyword ADEPTUS CUSTODES on every datasheet (the Prosecutors and Vigilators too). A battle uses **4 units**:
the Shield-Captain, the Prosecutors, the Vigilators, and **either** the Custodian Guard **or** the Vertus Praetors
(chosen at setup, CUS-1.1). Guard build: 15 models; Praetor build: 12 models.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `captain` | Shield-Captain Tyvan | 1 | sentinel blade (ranged + melee profiles), praesidium shield | **WARLORD**, default enhancement Auramite Thunderbolt. Leader → `guard` only (default attachment when the Guard is fielded) |
| `prosecutors` | Prosecutors | 5 | each: boltgun + close combat weapon | always fielded |
| `vigilators` | Vigilators | 5 | each: executioner greatblade | always fielded |
| `guard` | Custodian Guard | 4 | 2× guardian spear (ranged + melee); 1× misericordia + praesidium shield + vexilla (no ranged weapon); 1× sentinel blade (ranged + melee) + praesidium shield | choice group `escort` (default) |
| `praetors` | Vertus Praetors | 1 | Vertus hurricane bolter; interceptor lance | choice group `escort` (alternative) |

| Id | Rule |
|---|---|
| CUS-1.1 | Unit choice: exactly one of `guard` / `praetors` is in the army; the other is never created (not in Reserves, never counts as destroyed). Default `guard`. |
| CUS-1.2 | With the Praetors fielded the Shield-Captain has no legal bodyguard and operates alone; the `captain → guard` attachment is dropped. |
| CUS-1.3 | The Shield-Captain is always the WARLORD. No Patrol Squads ability on any datasheet (CP-1.8 does not apply). |
| CUS-1.4 | The vexilla has no rules text on the CP page: it is cosmetic only (figure part). The vexilla bearer's only weapon is the misericordia, so it never shoots. |

## 2. Faction ability — Martial Ka'tah (Shield-Captain, Custodian Guard, Vertus Praetors; NOT Prosecutors / Vigilators)

| Id | Rule |
|---|---|
| CUS-2.1 | At the start of every Fight phase (both players' turns), the Custodes player picks one stance for their army; it lasts until the end of that phase. Picking is mandatory whenever the player has at least one unit with this ability on the battlefield. |
| CUS-2.2 | Dacatarai stance: every melee weapon of every model in a unit with Martial Ka'tah gains [SUSTAINED HITS 1]. |
| CUS-2.3 | Rendax stance: every melee weapon of every model in a unit with Martial Ka'tah gains [LETHAL HITS]. |
| CUS-2.4 | Ranged weapons are never affected. An attached unit (Shield-Captain + Guard) is one unit with the ability: all its models gain the stance. |
| CUS-2.5 | **[interp]** In a mirror match both players pick, the active player first. |

## 3. Enhancements (Shield-Captain Tyvan, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| CUS-3.1 | Auramite Thunderbolt | default | The bearer's unit may re-roll its Advance rolls and its Charge rolls (whole attached unit; R-6.24 optional re-roll of a passing roll, automatic for a failed charge). |
| CUS-3.2 | Blade of the Vaults | optional | Every attack the bearer model makes (ranged or melee): if the wound roll is a Critical Wound, that attack's AP improves by 1 (e.g. −2 → −3). |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| CUS-4.1 | Guardian of the Realm | default | At the end of every phase (both players' turns): 1 VP if the player's SHIELD-CAPTAIN model destroyed at least one enemy model during that phase; 2 VP instead if at least one of the units those destroyed models belonged to was within range of any objective marker at the **start** of that phase. At most 2 VP per phase; no battle cap. Per-model attribution (`byModelId`): kills by other models of the Captain's attached unit do not count. |
| CUS-4.2 | Drive the Talons Deep | optional | From battle round 2 on, at the end of the opponent's turn: 3 VP if at least one ADEPTUS CUSTODES unit of the player that is not Battle-shocked is **wholly** within the opponent's deployment zone (an attached unit counts once; all its models must be wholly inside). Flat 3 VP per qualifying turn end, not per unit. |

CUS-4.1 notes: "within range" = any model of the unit within the mission's objective range of a non-removed marker
(controlled or not). **[interp]** A unit not on the battlefield at the start of the phase (e.g. arriving from Deep
Strike) was not within range. Kills without model attribution never score.

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| CUS-5.1 | The Gilded Spear (Battle Tactic) | 1 | `attack.modelDestroyed` (any phase, either turn), just after an enemy attack destroys the Shield-Captain | own SHIELD-CAPTAIN model just destroyed by an attack of an enemy model (usable although it is dead) | until the end of the battle: ranged weapons of the player's ADEPTUS CUSTODES models have [SUSTAINED HITS 1] while attacking the unit of the enemy model that destroyed the Captain |
| CUS-5.2 | Inescapable Vengeance (Strategic Ploy) | 2 | own Command phase (`command.start` or `command.end`) | one own ADEPTUS CUSTODES unit | until the start of the player's next Command phase: +1 OC to every model in the unit |
| CUS-5.3 | Overawing Magnificence (Strategic Ploy) | 1 | opponent's Movement phase, just after an enemy unit finishes a Fall Back move (`movement.unitMoved`) | one own ADEPTUS CUSTODES INFANTRY unit that was within Engagement Range of that enemy unit at the start of the phase | if the unit is now not within Engagement Range of any enemy model, it may make a Normal move (up to its M, must end outside Engagement Range) |

CUS-5.1 notes: the "attacking unit" is the canonical unit of the enemy model that made the killing attack (an attached
enemy unit counts as one; if it later splits, both halves stay marked). Only usable once per phase (core limit); the
Captain can only die once, so effectively once per battle.

Core stratagems as listed per datasheet (Command Re-roll, Insane Bravery, Fire Overwatch, Rapid Ingress, Go to Ground,
Heroic Intervention, Counter-offensive, Epic Challenge for the Shield-Captain) are engine core; nothing faction-specific.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shield-Captain Tyvan | 1 | 40 mm | 6 | 6 | 2+ | 4+ | 6 (7 with praesidium shield) | 6+ | 2 | INFANTRY, CHARACTER, IMPERIUM, SHIELD-CAPTAIN, TYVAN | Deep Strike; Leader → Custodian Guard; Martial Ka'tah; Praesidium Shield (+1 W, CUS-6.1) |
| Custodian Guard | 4 | 40 mm | 6 | 6 | 2+ | 4+ | 3 (4 for shield bearers) | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, CUSTODIAN GUARD | Deep Strike; Martial Ka'tah; Stand Vigil (CUS-6.2); Praesidium Shield |
| Vertus Praetors | 1 | 75×42 mm oval (60 mm round flying base allowed) | 12 | 6 | 2+ | 4+ | 4 | 6+ | 2 | MOUNTED, FLY, IMPERIUM, VERTUS PRAETORS | Martial Ka'tah. **No** Deep Strike |
| Prosecutors | 5 | 32 mm | 6 | 3 | 3+ | — | 1 | 6+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, ANATHEMA PSYKANA, PROSECUTORS | Purity of Execution (CUS-6.3) |
| Vigilators | 5 | 32 mm | 6 | 3 | 3+ | — | 1 | 6+ | 1 | INFANTRY, IMPERIUM, ANATHEMA PSYKANA, VIGILATORS | Deft Parry (CUS-6.4) |

Faction keyword (all): ADEPTUS CUSTODES. Leader note: the Shield-Captain's only bodyguard is the Custodian Guard (CUS-1.2).

| Id | Rule |
|---|---|
| CUS-6.1 | Praesidium Shield: the model carrying it has +1 Wounds (Tyvan 7, the two shield-bearing Guard 4). Set at creation; starting wounds use the raised value. |
| CUS-6.2 | Stand Vigil: every attack made by a model of this unit (the attached Shield-Captain included) re-rolls a wound roll of 1; while the unit is within range of an objective marker its player **controls**, it may re-roll the wound roll instead (any result). |
| CUS-6.3 | Purity of Execution: a ranged attack by a Prosecutor against a PSYKER unit has [PRECISION] and [DEVASTATING WOUNDS]. |
| CUS-6.4 | Deft Parry: every melee attack that targets this unit gets −1 to its hit roll (R-1.x ±1 cap applies). |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Shield-Captain Tyvan | — | sentinel blade (ranged) | sentinel blade (Tyvan) |
| Custodian Guard | spear ×2 | guardian spear (ranged) | guardian spear |
| Custodian Guard | vexilla ×1 | — | misericordia |
| Custodian Guard | blade ×1 | sentinel blade (ranged) | sentinel blade (Guard) |
| Vertus Praetors | — | Vertus hurricane bolter | interceptor lance |
| Prosecutors | ×5 | boltgun | close combat weapon (Prosecutor) |
| Vigilators | ×5 | — | executioner greatblade |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| sentinel blade (ranged) | 12" | 2 | 2+ | 4 | −1 | 2 | Assault, Pistol |
| guardian spear (ranged) | 24" | 2 | 2+ | 4 | −1 | 2 | Assault |
| Vertus hurricane bolter | 18" | 3 | 2+ | 4 | 0 | 1 | Rapid Fire 3, Twin-linked |
| boltgun | 24" | 1 | 3+ | 4 | 0 | 1 | Rapid Fire 1 (+Precision, Devastating Wounds vs PSYKER, CUS-6.3) |
| sentinel blade (Tyvan) | melee | 7 **[confirm]** | 2+ | 6 | −2 | 1 | — |
| sentinel blade (Guard) | melee | 5 | 2+ | 6 | −2 | 1 | — |
| guardian spear | melee | 5 | 2+ | 7 | −2 | 2 | — |
| misericordia | melee | 5 | 2+ | 5 | −2 | 1 | — |
| interceptor lance | melee | 5 | 2+ | 7 | −2 | 2 | Lance |
| close combat weapon (Prosecutor) | melee | 2 | 3+ | 3 | 0 | 1 | — |
| executioner greatblade | melee | 2 | 3+ | 5 | −2 | 2 | Anti-PSYKER 4+, Devastating Wounds |

The ranged and melee sentinel blade / guardian spear profiles are separate weapons both carried (not a `profileGroup`
choice): the model shoots with one and fights with the other.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§8/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, bodies in a new `src/engine/factions/adeptus-custodes.ts` exporting
`adeptusCustodesHooks`, spread into `codeHooks` like `greyKnightsHooks`); (c) = engine change beyond a code hook
(signatures in §7.1). Reused mechanisms are named.

| Rule | Enc. | Encoding |
|---|---|---|
| Unit choice Guard / Praetors (CUS-1.1, 1.2) | (a) existing | patrol `unitChoices:[{id:'escort', refs:['guard','praetors'], default:'guard'}]` — the GK E1 mechanism (`PlayerSetup.unitChoices`, client picker) already exists; no new code. |
| Martial Ka'tah (CUS-2.1–2.5) | (b) | `martialKatahPick` — ability descriptor on Tyvan, Guard, Praetors `{id:'cus.a.martial-katah', trigger:'phaseStart', code:'martialKatahPick'}`; `pick:{window:'fight.start', topic:'abilityChoice', offer, handle}` (pattern of `oathOfMomentPick` / `resonantFocusPick`). `offer`: for each player P (active first) with ≥1 canonical board unit where some half carries this code, guarded by mark `pick:katah:<round>:<activePlayer>:<P>`, `ctx.decide` chooseOption, `canPass:false`, options `dacatarai` / `rendax`. `handle`: for every such canonical unit `ctx.services.effects.grant(ctx, unitId, [{when:{weaponType:'melee'}, grantWeaponAbility: stance==='dacatarai' ? {ability:'SUSTAINED_HITS', value:1} : {ability:'LETHAL_HITS'}}], {sourceAbilityId, sourceUnitId:null, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`; emits `AbilityTriggered` naming the stance; stores `secondaryState.katahStance = {stance, round, turn}` for the UI/AI. |
| Auramite Thunderbolt (CUS-3.1) | (b)+(c) E3 | enhancement `{trigger:'chargeRoll', code:'auramiteThunderbolt', effect:{reroll:'all'}, scope:{who:'self'}}`; hook `auramiteThunderbolt = {name, kind:'ability', hook:'onChargeRoll', run:noop, rerollHooks:['onChargeRoll','onAdvanceRoll']}`. Charge re-roll already works through `collectChargeRerollKinds` (as Unstoppable Valour). E3 adds `EngineCodeHook.rerollHooks` (descriptor's `reroll` applies at every listed hook) and an Advance-roll re-roll path in `movement.ts` (today the Advance roll has no ability re-roll at all). |
| Blade of the Vaults (CUS-3.2) | (a) | enhancement `{trigger:'woundRoll', effect:{critWoundAp:1}, scope:{who:'bearer'}}` (same key as `ade.s.*` critWoundAp). |
| Guardian of the Realm (CUS-4.1) | (b)+(c) E1 | secondary `scoring:[{when:'phase.end', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'guardianOfTheRealm', pointsPer:1, cap:999, params:{bonusPoints:2, keyword:'SHIELD-CAPTAIN'}}]`; registry `guardianOfTheRealm: missionHook('guardianOfTheRealm','onPhaseEnd')`. Bodies in `factions/adeptus-custodes.ts`: `guardianOfTheRealmSnapshot` (phase start: canonical + halves of enemy board units within objective range of any marker → `secondaryState.gotrNearAtStart`; resets `secondaryState.gotrKills`), `guardianOfTheRealmModelDestroyed` (if `info.byModelId === modelIdFor(<own SHIELD-CAPTAIN unit>,0)` and the victim's unit is an enemy unit → push `{unitId: info.unitId}` to `gotrKills`), `guardianOfTheRealmAmount` (0 if no kills; `bonusPoints` if any killed unit id ∈ `gotrNearAtStart`; else `pointsPer`; then clears `gotrKills`). Do **not** read the shared `killsThisPhase` (only Wrath of the Emperor resets it). E1 wires the three bodies into `missions.ts`. |
| Drive the Talons Deep (CUS-4.2) | (a)+existing hook | reuse Necron `reclaimAndDominate` (wholly-within, not Battle-shocked, attached pair once, flat award): `scoring:[{when:'turn.end', rounds:{from:2,to:5}, who:'opponent', rule:'custom', code:'reclaimAndDominate', pointsPer:3, cap:999, params:{keyword:'ADEPTUS CUSTODES'}}]`. E1 replaces the hard-coded `'NECRONS'` in `reclaimAndDominateAmount` with `rule.params?.keyword ?? 'NECRONS'` (Necron data unchanged). |
| The Gilded Spear (CUS-5.1) | (a)+(b)+(c) E2 | stratagem `window:'attack.modelDestroyed'`, `who:'either'`, no phase condition, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'SHIELD-CAPTAIN'}, state:'justDestroyed', count:1}]`, no `effect`, `duration:'battle'`, `code:'gildedSpear'` (target shape of `csm.s.violent-unbinding`). (b) `gildedSpear` (kind stratagem, hook `onModelDestroyed`): `check` = `pendingDeathReaction(state)` exists, `req.unitId === t.ids[0]`, `req.player === env.player`; `apply` = for each half h of `req.attackerUnitId`: `effects.grant(ctx, h, [{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}], {sourceAbilityId: stratagem.id, sourceUnitId:null, scope:{who:'attacker'}, duration:'battle', when:{attackerKeyword:'ADEPTUS CUSTODES'}})`. E2 makes `grantWeaponAbility` held by the *target* (scope `attacker`) visible to the attacker's weapon during attack resolution. |
| Inescapable Vengeance (CUS-5.2) | (a) | `cost:2`, `window:['command.start','command.end']`, `who:'active'`, `condition:{phase:'command', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', count:1}]`, `effect:{modifyStat:{stat:'OC', value:1}}`, `scope:{who:'self'}`, `duration:'untilNextTurn'` (expires at the start of the owner's next turn = before its next Command phase). Every friendly unit is ADEPTUS CUSTODES, so no keyword filter. |
| Overawing Magnificence (CUS-5.3) | (a)+(b)+(c) E4 | stratagem `window:'movement.unitMoved'`, `who:'reactive'`, `condition:{phase:'movement', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, count:1}]`, `code:'overawingMagnificence'`. (b) `check(env,t)`: mover = `env.trigger.unitId` is an enemy unit with `turn.moveType==='fallBack'`; target canonical `engagedAtMovementStart(state, target, mover)` (E4); and `!leaderService.inEngagementWithEnemy(state, target)`. `apply`: `startReactiveMove(ctx, target, M, stratagem.id)` with M = min over the target's board models of `statFor(M)` (same path as Skulking Horrors: normal move, `mustEndOutsideEngagement`, coherency). |
| Praesidium Shield (CUS-6.1) | (a) | composition `statsOverride:{W:7}` on Tyvan, `statsOverride:{W:4}` on the `vexilla` and `blade` Guard models (`state.ts` already merges `statsOverride`). Ability text listed on the datasheet as an informational descriptor with no effect. |
| Stand Vigil (CUS-6.2) | (a)+(b) | two descriptors on the Guard: `{trigger:'woundRoll', effect:{reroll:'ones'}, scope:{who:'self'}}` and `{trigger:'woundRoll', code:'standVigil', effect:{reroll:'all'}, scope:{who:'self'}}`. (b) `standVigil` = gate-only hook `{kind:'ability', hook:'onWoundRoll', run:noop, gate(state, holder)}`: true iff some board model of the holder's canonical unit (both halves) is within objective range of a non-removed marker whose `controller === holder.player`. (`Condition.unitOnObjective` ignores control, so it is not enough.) |
| Purity of Execution (CUS-6.3) | (a)+(c) E2 | two descriptors on the Prosecutors: `{trigger:'always', when:{weaponType:'ranged', targetKeyword:'PSYKER'}, effect:{grantWeaponAbility:{ability:'PRECISION'}}}` and the same with `DEVASTATING_WOUNDS` (two descriptors because one effect list keeps only the first entry per key). `targetKeyword` needs the attack target in the weapon-ability query: E2. |
| Deft Parry (CUS-6.4) | (a) | `{trigger:'hitRoll', when:{weaponType:'melee'}, effect:{modifyRoll:{roll:'hit', value:-1}}, scope:{who:'attacker'}}` |
| Leader (Tyvan → Guard) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['cus.custodian-guard']`; patrol `attachTo:'guard'` |
| Deep Strike (Tyvan, Guard) | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]` |
| Assault / Pistol / Rapid Fire 1·3 / Twin-linked / Lance / Anti-PSYKER 4+ / Devastating Wounds | (a) | weapon abilities `ASSAULT`, `PISTOL`, `RAPID_FIRE` 1/3, `TWIN_LINKED`, `LANCE`, `ANTI {keyword:'PSYKER', value:4}`, `DEVASTATING_WOUNDS` |
| Oval base 75×42 (Praetors) | (a) | `base:{shape:'oval', mm:75, mm2:42}` |
| MOUNTED, FLY, BATTLELINE | (a) | keywords; FLY movement and BATTLELINE secured objectives are engine-native |

Totals: **6 new code hooks** (`martialKatahPick`, `auramiteThunderbolt`, `standVigil`, `gildedSpear`,
`overawingMagnificence`, `guardianOfTheRealm`); reused: `unitChoices` (GK), `reclaimAndDominate` (NEC, + keyword
param), `startReactiveMove` (TYR), `justDestroyed` death-reaction targeting (CSM). **4 engine changes** (E1 mission
plumbing, E2 target-aware weapon abilities, E3 Advance re-roll + `rerollHooks`, E4 Movement-phase engagement snapshot).
**No frozen contract changes**: `types.ts`, `actions.ts`, `events.ts`, `hooks.ts`, `rng.ts`, `decider.ts`, `index.ts` are
untouched (E2 builds an `AttackContext` that `hooks.ts` already defines; E3 uses the existing `onAdvanceRoll` hook,
`AdvanceRollHookContext` and `rerollOffer` topic; E4 stores marks in the existing `phaseState.marks`).

### 7.1 Engine change signatures

```ts
// ---------- E1 Mission plumbing (CUS-4.1, 4.2) — src/engine/missions.ts (not frozen) ----------
export interface ModelDestroyedInfo {
  unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null
}
// MissionService.modelDestroyed becomes a fan-out (signature unchanged):
//   modelDestroyed(ctx, info) { championOfTitanModelDestroyed(ctx, info); guardianOfTheRealmModelDestroyed(ctx, info) }
// processWindow: `if (window.endsWith('.start') && once(s, `gotrSnapshot:${window}`)) guardianOfTheRealmSnapshot(s)`
//   (next to snapshotTreasures; runs before any rule of that window)
// customAmount: `case 'guardianOfTheRealm': return guardianOfTheRealmAmount(s, rule, pid)`
// reclaimAndDominateAmount: keyword = (rule.params?.keyword as string | undefined) ?? 'NECRONS'

// ---------- E2 Target-aware weapon abilities (CUS-5.1, 6.3) ----------
// src/engine/weapons.ts (not frozen) — WeaponService.effectiveWeapon gains an optional attack context:
  effectiveWeapon(state: GameState, modelId: ModelId, weaponId: WeaponId, attack?: AttackContext): RuntimeWeapon
// src/engine/hooks-impl.ts (not frozen) — HookQueries.weaponAbilitiesFor likewise:
  weaponAbilitiesFor(state: GameState, modelId: ModelId, weapon: RuntimeWeapon, attack?: AttackContext): WeaponAbility[]
// With `attack` present the onStatQuery Data carries `attack` (so partyFor resolves sides: a target-held entry with
// scope 'attacker' matches the attacking model's weapon, and Conditions targetKeyword / attackerKeyword evaluate).
// Without it behaviour is unchanged. Memo: effectiveWeapon's identity shortcut still returns `base` when nothing changed.
// src/engine/attack.ts: after buildAttackContext(...) (built from the target-less weapon as today), every weapon read at
// hit (Sustained/Lethal Hits, Torrent), wound (Anti, Devastating Wounds, Lance, Twin-linked), allocation (Precision) and
// damage (Melta) uses `weaponService.effectiveWeapon(s, model, weaponId, actx)`; the actx.weapon is replaced with it.

// ---------- E3 Advance re-roll + multi-hook rerolls (CUS-3.1) ----------
// src/engine/code-hooks.ts (not frozen) — EngineCodeHook: add
  rerollHooks?: HookName[]   // a descriptor with this code applies its `reroll` key at every hook listed here
// src/engine/hooks-impl.ts keyApplies, case 'reroll': `|| (spec?.rerollHooks?.includes(hook) ?? false)`
// src/engine/phases/movement.ts (not frozen):
export function collectAdvanceRerollKinds(ctx: EngineContext, unitId: UnitId, roll: DiceRoll): Set<'ones' | 'fails' | 'all' | 'oneDie'>
//   = services.hooks.collect(ctx, 'onAdvanceRoll', { movingUnitId: unitId, roll: { purpose:'advance', roll, dieIndex:0, unmodified, rerolled } })
// After the Advance roll (before advanceRollFor): if the die was not already re-rolled and kinds is non-empty, offer
// chooseOption topic 'rerollOffer' (options 'reroll' / 'keep', window 'movement.moveStarted', canPass:false, mark
// `mv:advRerollOffered:<unitId>`); 'reroll' → ctx.reroll(roll, [0], 'advanceRoll'). An Advance roll never "fails", so
// 'fails'/'ones' only re-roll a 1 automatically; 'all' is the optional offer. Then advanceRollFor + UnitAdvanced as today.

// ---------- E4 Engagement snapshot at Movement-phase start (CUS-5.3) — src/engine/phases/movement.ts ----------
// at Movement-phase entry (after phaseState reset, before the movement.start window):
export function snapshotEngagementAtMovementStart(state: GameState): void
//   for every pair of opposing canonical board units in Engagement Range (leaderService.unitsInEngagement):
//   phaseState.marks.push(`erAtStart:${a}|${b}`) with a < b lexicographically
export function engagedAtMovementStart(state: GameState, unitA: UnitId, unitB: UnitId): boolean // canonicalises both ids

// ---------- (b) hook bodies — src/engine/factions/adeptus-custodes.ts (new) ----------
export const MARTIAL_KATAH_CODE = 'martialKatahPick'
export type KatahStance = 'dacatarai' | 'rendax'
export function katahUnits(state: GameState, player: PlayerId): UnitId[]          // canonical board units with the code, sorted
export function katahOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean
export function katahHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
export function standVigilGate(state: GameState, holder: Unit): boolean
export function gildedSpearCheck(env: StratagemEnv, t: StratagemTuple): boolean
export function gildedSpearApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void
export function overawingCheck(env: StratagemEnv, t: StratagemTuple): boolean
export function overawingApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void
export function guardianOfTheRealmSnapshot(state: GameState): void
export function guardianOfTheRealmModelDestroyed(ctx: EngineContext, info: ModelDestroyedInfo): void
export function guardianOfTheRealmAmount(state: GameState, rule: ScoringRule, pid: PlayerId): number
export const adeptusCustodesHooks: Record<string, EngineCodeHook> // martialKatahPick, auramiteThunderbolt, standVigil, gildedSpear, overawingMagnificence
// guardianOfTheRealm is registered as missionHook('guardianOfTheRealm','onPhaseEnd') in code-hooks.ts like the other secondaries.
```

AI note (40-ai, not engine): Ka'tah — pick Rendax when the likely melee targets have T ≥ 7 or the unit's weapons
wound on 5+/6+, otherwise Dacatarai. Overawing Magnificence — use when the freed unit can then reach an objective.

## 8. Test IDs

| ID | Ref | Scenario → expected |
|---|---|---|
| CUS-001 | CUS-1 | patrol loads (default): 4 units, 15 models; Tyvan is WARLORD with Auramite Thunderbolt, attached to the Guard; default secondary Guardian of the Realm |
| CUS-002 | CUS-1.1, 1.2 | `unitChoices:{escort:'praetors'}` → 4 units, 12 models, no Guard unit exists, Tyvan unattached |
| CUS-003 | CUS-1.4, 6.1 | Guard wargear as built: vexilla model has only a misericordia (never selectable to shoot); shield models start at 4 W, spear models at 3; Tyvan starts at 7 W |
| CUS-004 | CUS-2.1 | at the start of each Fight phase (both turns) the Custodes player gets a mandatory Dacatarai/Rendax choice; no choice when no Ka'tah unit is on the battlefield |
| CUS-005 | CUS-2.2 | Dacatarai: Guard spear critical hit → 1 extra hit; Prosecutors' and Vigilators' melee unaffected; ranged weapons unaffected |
| CUS-006 | CUS-2.3 | Rendax: Praetor lance critical hit auto-wounds; effect gone after the phase ends |
| CUS-007 | CUS-2.4 | attached Tyvan + Guard: Tyvan's sentinel blade also gains the stance |
| CUS-008 | CUS-3.1 | Auramite Thunderbolt: failed charge of Tyvan's unit is re-rolled; a passing charge offers an optional re-roll; Advance roll of the unit offers a re-roll; other units get none |
| CUS-009 | CUS-3.2 | Blade of the Vaults: bearer's critical wound with sentinel blade (AP −2) → resolved at AP −3; non-critical wound stays −2; a Guard model's critical wound is unchanged |
| CUS-010 | CUS-4.1 | Guardian of the Realm: Tyvan kills a model whose unit started the phase off every marker → +1 VP at phase end; started within range of a marker → +2; two kills in one phase → still 2 max |
| CUS-011 | CUS-4.1 | Guardian of the Realm: kill by a Guard model of Tyvan's attached unit → 0; kill in the opponent's Fight phase scores; a victim unit that arrived by Deep Strike this phase counts as not in range |
| CUS-012 | CUS-4.2 | Drive the Talons Deep: round 2+, end of opponent's turn, a non-shocked Custodes unit wholly in the enemy zone → +3; one model straddling the edge → 0; round 1 → 0; end of own turn → 0; Battle-shocked unit → 0 |
| CUS-013 | CUS-4.2 | Necron Reclaim and Dominate still filters on NECRONS after the keyword param change |
| CUS-014 | CUS-5.1 | Gilded Spear: offered only just after an enemy attack destroys Tyvan (any phase, incl. Overwatch); afterwards Custodes ranged attacks against that enemy unit have Sustained Hits 1 for the rest of the battle; against other units, and in melee, no change |
| CUS-015 | CUS-5.1 | Gilded Spear: not offered when Tyvan is destroyed outside an enemy attack (e.g. mortal wounds from an enemy ability, own Hazardous) or when a non-Captain model dies; enemy attached unit marked → both halves stay marked after the leader dies |
| CUS-016 | CUS-5.2 | Inescapable Vengeance (2 CP): own Command phase, target unit OC +1 (Guard 3, Prosecutors 3); persists through the opponent's turn; gone at the start of the owner's next turn; Battle-shocked unit not targetable |
| CUS-017 | CUS-5.3 | Overawing Magnificence: enemy falls back from Custodes INFANTRY unit → offered; unit makes a normal move up to 6" and must end outside Engagement Range |
| CUS-018 | CUS-5.3 | Overawing Magnificence not offered: unit still in Engagement Range of another enemy; unit was not engaged with the mover at phase start; enemy made a normal move; Vertus Praetors (not INFANTRY); own turn |
| CUS-019 | CUS-6.2 | Stand Vigil: wound roll of 1 re-rolled; on a controlled marker a failed 3 may be re-rolled too; on an uncontrolled / contested marker only 1s; attached Tyvan's attacks also benefit |
| CUS-020 | CUS-6.3 | Purity of Execution: boltgun vs PSYKER unit → Precision (may allocate to a CHARACTER) and Devastating Wounds (crit wound → mortal wounds); vs non-PSYKER → neither; melee unaffected |
| CUS-021 | CUS-6.4 | Deft Parry: melee attacks against Vigilators −1 to hit; ranged attacks unchanged; combined with another −1 still capped at −1 |
| CUS-022 | CUS-6 | weapons: executioner greatblade Anti-PSYKER 4+ (wound roll 4 vs PSYKER is critical → Devastating Wounds); interceptor lance +1 to wound on the charge; hurricane bolter Rapid Fire 3 + Twin-linked at half range; sentinel blade Pistol usable in Engagement Range |
| CUS-023 | CUS-6 | Deep Strike: Tyvan, Guard may start in Reserves; Praetors, Prosecutors, Vigilators may not |
| CUS-024 | E2 | weapon-ability queries without an attack context are unchanged (Champion Duellist, Veil of Time, Epic Challenge regression) |

## 9. Figures

Heights follow 30-figures (infantry H 1.1; Custodes are a head taller than Space Marines, so H 1.35–1.45; bikes compressed);
bases are rules-true. All designs are original — no heraldry or logos.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `shield-captain-tyvan` | `cus.shield-captain-tyvan/captain` | 1 | 1.45 | 40 mm | A chibi towering warrior in ornate polished gold armour with a tall crimson horsehair crest on a smooth-faced helmet, a flowing crimson cloak, a round gilded shield on one arm and a short broad sword with a pistol barrel set in its guard. |
| `custodian-guard-spear` | `cus.custodian-guard/spear` | 2 | 1.4 | 40 mm | A chibi tall golden-armoured guardian with a crested high helmet, crimson tabard and a very long spear that ends in a broad axe-like blade with a gun barrel built into the haft. |
| `custodian-guard-vexilla` | `cus.custodian-guard/vexilla` | 1 | 1.4 | 40 mm | The same chibi golden guardian holding a tall standard pole topped with a winged golden sunburst and a hanging crimson banner, a round shield on the other arm and a slim dagger at the hip. |
| `custodian-guard-shield` | `cus.custodian-guard/blade` | 1 | 1.4 | 40 mm | The same chibi golden guardian with a round gilded shield raised and a short broad sword with an under-barrel pistol, crimson cloak behind. |
| `vertus-praetor` | `cus.vertus-praetors/praetor` | 1 | 1.7 | 75×42 mm oval | A chibi gold-armoured rider crouched on a sleek hovering gold jetbike with swept wings and twin bolt guns on the nose, holding a long lance couched forward, crimson pennant streaming. |
| `prosecutor` | `cus.prosecutors/prosecutor` | 5 (1 may be a cosmetic leader variant with a taller crest) | 1.1 | 32 mm | A chibi slim woman warrior in burnished bronze plate with a high crimson-plumed helmet and a face-covering mask, crimson half-cape, holding a chunky rifle. |
| `vigilator` | `cus.vigilators/vigilator` | 5 (1 may be a cosmetic leader variant) | 1.1 | 32 mm | A chibi slim woman warrior in burnished bronze plate with a crimson-plumed helmet and masked face, swinging an oversized two-handed executioner's greatsword with a pale steel edge. |

## 10. Other Adeptus Custodes patrols (appendix)

- Tristraen's Gilded Blades — Index, April 2024 — Tristraen (1, WARLORD); Custodian Guard (3); then Custodian Wardens (3) OR Allarus Custodians (2).

## 11. Build notes — values to confirm before data entry

- Tyvan's sentinel blade melee **A 7** (the Guard's sentinel blade is A 5): read once from the CP page; re-check before data entry.
- Sentinel blade ranged keywords printed as "[ASSAULT PISTOL]" on the extracted page: read as Assault + Pistol (two abilities).
- Vertus Praetors: the CP page lists Martial Ka'tah only (no Deep Strike, no extra ability); the box builds 1 model.
- Prosecutors / Vigilators: no invulnerable save, no Leader, no Deep Strike printed. Prosecutors OC 2, Vigilators OC 1 as printed.
- Vexilla: no rules text in this patrol (cosmetic). Stratagem categories (Battle Tactic / Strategic Ploy) are UI-only.
- Window choice for Inescapable Vengeance (`command.start` + `command.end`) is an encoding of "your Command phase".
