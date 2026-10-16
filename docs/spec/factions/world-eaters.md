# Faction spec — World Eaters: Karagar's Rampagers

This is our own-words data spec for the World Eaters Combat Patrol, laid out like 11-combat-patrol §4. Rule ids
`WOR-<section>.<n>` are cited by the `WOR-` rows of 12-rules-test-checklist. Mechanics match the source 1:1; all prose
here is our own. Data id prefix: `we.` (faction id `world-eaters`, faction keyword WORLD EATERS). Where a CSM row
has the same profile, the CSM data is reused by id (§6).

## 0. Sources (accessed 2026-10-16)

| Source | URL | Version shown on page |
|---|---|---|
| World Eaters patrol "Karagar's Rampagers" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/karagar-s-rampagers/ | Book "Karagar's Rampagers", kind Index, edition 10, last update **June 2023** |
| CP faction navigation (used to list patrols) | menu on the page above | lists one World Eaters patrol only |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already covered in 11-combat-patrol §1–2, not copied again here |

The navigation lists only one WORLD EATERS patrol, so §10 is empty. Four page reads were used.

**Source anomaly [needs-rules-check]:** the page's roster shows the "Khorne Berzerkers (10 models)" block twice,
word for word, but the Datasheets section has only one Khorne Berzerkers datasheet. We read this as a listing error
and build **one** 10-model unit (21 models in the patrol). If the owner checks the physical box and it really has two
units, add a second `berzerkers` roster entry (31 models). No other rule in this spec changes.

## 1. Roster

3 units, 21 models. Every datasheet has the faction keyword WORLD EATERS and the Blessings of Khorne ability.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `karagar` | Karagar the Blooded (Lord on Juggernaut) | 1 | plasma pistol (2 profiles); exalted chainblade; Juggernaut's bladed horn | **WARLORD** (the LORD ON JUGGERNAUT model). **No Leader ability**, so he always fights as a unit of his own |
| `berzerkers` | Khorne Berzerkers | 10 | Champion: plasma pistol + Berzerker chainblade; 1× plasma pistol + Berzerker chainblade; 1× plasma pistol + Berzerker chainblade + icon of Khorne; 2× bolt pistol + Khornate eviscerator; 5× bolt pistol + Berzerker chainblade | — |
| `jakhals` | Jakhals | 10 | Pack Leader: autopistol + Jakhal chainblades; Dishonoured: skullsmasher (no ranged weapon; 40 mm base); 1× autopistol + mauler chainblade; 1× autopistol + Jakhal chainblades + icon of Khorne; 6× autopistol + Jakhal chainblades | — |

No datasheet in this patrol has Patrol Squads (CP-1.8 does not apply). The icon of Khorne, Pack Leader and Dishonoured
have **no rules text** in the source. They only affect how the models look, so the Figures section (§9) gives them
their own models.

## 2. Faction ability — Blessings of Khorne (every datasheet)

| Id | Rule |
|---|---|
| WOR-2.1 | At the start of each battle round, the player may make a Blessings of Khorne roll by rolling **eight D6**. The engine always rolls, because a player can already choose no Blessing, so skipping the roll gains nothing. The roll is not a Command Re-roll target: it is not an attack, Advance, Charge, Hazardous or Desperate Escape roll (R-4.6). |
| WOR-2.2 | The rolled dice can switch on **up to two** different Blessings. Each Blessing needs its own set of dice showing one value. "Double" means 2 dice with the same value and "triple" means 3 dice with the same value. "Double N+" means a double whose value is N or more. Dice used by one Blessing are removed from the pool, so two Blessings can never share a die. Dice that are not used are thrown away. |
| WOR-2.3 | Each Blessing can be switched on at most once per battle round. An active Blessing applies to **every unit of that player with this ability** until the end of the battle round, including units that arrive later in the round. |
| WOR-2.4 | **Wrathful Devotion** (any double): models in the unit have Feel No Pain 6+. A model that already has Feel No Pain from another source instead adds 1 to its Feel No Pain rolls. |
| WOR-2.5 | **Total Carnage** (double 4+ or any triple): when a melee attack destroys a model in the unit and the unit has not fought yet this phase, roll one D6. On a 4+ the model is not removed yet. Once the attacking unit has finished all its attacks, the model fights and is then removed. Mortal wounds from abilities or stratagems are not melee attacks (Devastating Wounds from a melee weapon are). |
| WOR-2.6 | **Warp Blades** (double 5+ or any triple): the melee weapons of models in the unit have [LETHAL HITS]. |
| WOR-2.7 | **[interpretation]** In a mirror match both players roll. The first player of the round rolls and chooses first, as with Doctrina Imperatives. |

## 3. Enhancements (Karagar the Blooded, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Skulls for Khorne | default | Each time the bearer model destroys an enemy unit with a melee attack, roll one D6. On a 2+ its player gains 1 CP. The R-4.2 cap of one CP gained per battle round outside the Command phase still applies. The roll happens in either player's turn. "Destroys a unit" means the bearer's attack removes the last board model of the enemy unit; for an attached pair, that is the last model of both halves. No once-per-battle limit. |
| Arch-slaughterer | optional | The bearer's melee weapons (exalted chainblade, Juggernaut's bladed horn) have [PRECISION]. The plasma pistol does not. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Ravage and Ransack | default | At the end of the **opponent's** turn, in every battle round: 4 VP if the player controls the objective marker closest to the opponent's battlefield edge. **[interpretation]** The opponent's battlefield edge is the board edge their deployment zone shares the longest boundary with (`playerBattlefieldEdge`). Distance is measured from the marker centre to that edge line. Removed markers are ignored. If two markers tie (within 0.01"), controlling either one scores, but only 4 VP. The source prints no cap; data cap is 20 VP (5 × 4). |
| Blood Offering | optional | Each time a WORLD EATERS model from the player's army destroys an enemy unit with a melee attack, the player scores 2 VP if that enemy unit was within range of any objective marker (CP-2.4 range) at the **start of that phase**. For an attached pair, any model of either half counts, and the unit counts as destroyed when its last model is removed. A model kept on the board by Total Carnage still counts as a WORLD EATERS model. The source prints no cap; **[interpretation]** data cap is 99, which means no cap in practice. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Rage Unchecked | 1 | battleTactic | the player's own Shooting phase (`shooting.start`, between activations) or **either** player's Fight phase (`fight.start`, `fight.attacksResolved`, between activations). The page reads "the Fight phase"; an earlier summary of the same page said "your", so this is marked **[needs-rules-check]**. | one own BERZERKERS unit that is **Below Half-strength** and has not been selected to shoot (Shooting) or to fight (Fight) this phase | until the end of the phase, every weapon of every model in the unit has [SUSTAINED HITS 1] |
| Unstoppable Fury | 1 | strategicPloy | a Fight phase (**either** player's, **[needs-rules-check]** for the same reason), just before an own WORLD EATERS unit makes its Consolidation move, at the new window `fight.beforeConsolidate` (C2) | that unit | until the end of the phase, the unit's models may consolidate up to 6" instead of 3", as long as the unit ends the move within Engagement Range of one or more enemy units. If no such move is legal, the R-9.10 fallback toward an objective marker stays at 3" (C3). Pile-in is unchanged. |
| Overwhelming Onslaught | 1 | epicDeed | the player's own Charge phase, `charge.moveEnded`, just after an own WORLD EATERS unit ends a Charge move | that unit, plus one enemy unit within its Engagement Range | the enemy unit takes a Battle-shock test with 1 subtracted from the 2D6 result |

The core stratagems apply as set out in 10-rules §11, each behind its own keyword gate. Every unit here is INFANTRY
except Karagar, so Go to Ground and Smokescreen are not available to Karagar. No unit has GRENADES, SMOKE or VEHICLE,
so Grenade, Smokescreen and Tank Shock are never offered. Fire Overwatch is available, since every unit has a pistol.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Karagar the Blooded | 1 | 90 × 52 mm oval | 10 | 6 | 2+ | 4+ | 7 | 6+ | 2 | MOUNTED, CHARACTER, CHAOS, KHORNE, LORD ON JUGGERNAUT, KARAGAR THE BLOODED | Blessings of Khorne (no core abilities, no Leader) |
| Khorne Berzerkers | 10 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 2 | INFANTRY, CHAOS, KHORNE, BERZERKERS | Blessings of Khorne |
| Jakhals | 10 | 28 mm (Dishonoured 40 mm) | 6 | 3 | 6+ | — | 1 | 7+ | 1 | INFANTRY, BATTLELINE, CHAOS, KHORNE, JAKHALS | Feel No Pain 6+ (core); Blessings of Khorne |

Faction keyword (all): WORLD EATERS. None of the units is EPIC HERO, PSYKER, GRENADES or SMOKE.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Karagar the Blooded | — | plasma pistol (Karagar, 2 profiles) | exalted chainblade, Juggernaut's bladed horn |
| Khorne Berzerkers | Champion | plasma pistol (2 profiles) | Berzerker chainblade |
| Khorne Berzerkers | Berzerker (plasma) ×1 | plasma pistol | Berzerker chainblade |
| Khorne Berzerkers | Berzerker (icon) ×1 | plasma pistol | Berzerker chainblade (icon of Khorne: no rule) |
| Khorne Berzerkers | Berzerker (eviscerator) ×2 | bolt pistol | Khornate eviscerator |
| Khorne Berzerkers | Berzerker ×5 | bolt pistol | Berzerker chainblade |
| Jakhals | Pack Leader | autopistol | Jakhal chainblades |
| Jakhals | Dishonoured (40 mm) | — | skullsmasher |
| Jakhals | Jakhal (mauler) ×1 | autopistol | mauler chainblade |
| Jakhals | Jakhal (icon) ×1 | autopistol | Jakhal chainblades (icon of Khorne: no rule) |
| Jakhals | Jakhal ×6 | autopistol | Jakhal chainblades |

Weapon profiles (rows marked *reuse* point at the existing CSM data id, which has the same profile):
| Weapon | Data id | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| plasma pistol — standard (Karagar) | `we.w.plasma-pistol-karagar` | 12" | 1 | 2+ | 7 | −2 | 1 | Pistol |
| plasma pistol — supercharge (Karagar) | `we.w.plasma-pistol-karagar-supercharge` | 12" | 1 | 2+ | 8 | −3 | 2 | Hazardous, Pistol |
| plasma pistol — standard (Berzerkers) | *reuse* `csm.w.plasma-pistol` | 12" | 1 | 3+ | 7 | −2 | 1 | Pistol |
| plasma pistol — supercharge (Berzerkers) | *reuse* `csm.w.plasma-pistol-supercharge` | 12" | 1 | 3+ | 8 | −3 | 2 | Hazardous, Pistol |
| bolt pistol | *reuse* `csm.w.bolt-pistol` | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| autopistol | *reuse* `csm.w.autopistol` | 12" | 1 | 4+ | 3 | 0 | 1 | Pistol |
| exalted chainblade | `we.w.exalted-chainblade` | melee | 7 | 2+ | 6 | −1 | 2 | — |
| Juggernaut's bladed horn | `we.w.juggernauts-bladed-horn` | melee | 4 | 3+ | 6 | −1 | 2 | Extra Attacks, Lance |
| Berzerker chainblade | `we.w.berzerker-chainblade` | melee | 4 | 3+ | 5 | −1 | 1 | — |
| Khornate eviscerator | `we.w.khornate-eviscerator` | melee | 3 | 3+ | 8 | −2 | 2 | — |
| Jakhal chainblades | `we.w.jakhal-chainblades` | melee | 2 | 4+ | 3 | 0 | 1 | Sustained Hits 1 |
| mauler chainblade | `we.w.mauler-chainblade` | melee | 2 | 5+ | 5 | −1 | 2 | Sustained Hits 1 |
| skullsmasher | `we.w.skullsmasher` | melee | 4 | 4+ | 4 | −1 | 2 | — |

The mauler chainblade's WS 5+ was read the same way twice from the page, but it is worse than the plain Jakhal
blades, so it is marked **[needs-rules-check]**.

Suggested original `paintScheme`: primary `#8e1b1b` (deep crimson), secondary `#26262b` (blackened steel), trim
`#b08a3e` (dull brass), metal `#8d9299`, decal `#e6dfcc` (bone).

## 7. Mechanics mapping

Key: (a) = an existing declarative descriptor (20-data-schema §3/§6/§9); (b) = a new code hook registered through
`worldEatersHooks` in `src/engine/factions/world-eaters.ts` and spread into `codeHooks`; (c) = an engine change
beyond a code hook. **No (c) item touches a frozen contract** (`types/actions/events/hooks/rng/decider/index.ts`).
All new state goes in `players[p].secondaryState` or `phaseState.marks`, and every signal reuses an existing event
(`AbilityTriggered`, `DiceRolled`, `CpChanged`, `FeelNoPainRolled`, `BattleShockTested`).

Earlier factions already built several mechanisms this patrol needs, so we reuse them instead of writing new ones:
- **C5 fight-on-death** (`src/engine/fight-on-death.ts`, `grantFightOnDeath`; used by CSM Daemonic Fervour and the
  Votann Cyberstimms per-phase grant) — Total Carnage.
- **round.start pick + gate**, the Doctrina Imperatives pattern in `factions/adeptus-mechanicus.ts` — Blessings.
- **`hookService.gainCp`** with the R-4.2 cap, as in GRE `banishmentStone` — Skulls for Khorne.
- **`hookService.battleShockTest(ctx, id, src, -1)`**, as in ORK `bestialBellowApply` — Overwhelming Onslaught.
- **`getStuckInDistance` / `consolidateDistance`** — Unstoppable Fury.
- **Edge-nearest marker logic** from `krumpinSpreeAmount` and GRE `closestMarkerToEdge` — Ravage and Ransack.
- **The phase-start snapshot** behind Treasures of Aeons (`snapshotTreasures`, `missions.ts`) — Blood Offering.

| Rule | Enc. | Encoding |
|---|---|---|
| Blessings roll + choice (WOR-2.1–2.3, 2.7) | (b) | `blessingsOfKhorne`: kind `ability`, hook `onStatQuery`, `run: noop`. Its `pick` runs at window `round.start` with topic `abilityChoice`. The army-rule marker ability is `we.a.blessings-of-khorne` (`trigger:'always'`, `code:'blessingsOfKhorne'`, `params:{armyRule:true, dice:8, max:2, requirements:{wrathfulDevotion:{pairMin:1}, totalCarnage:{pairMin:4, triple:true}, warpBlades:{pairMin:5, triple:true}}}`). **offer:** go through the first player, then the other. Skip a player who already has mark `pick:blessings:<round>:<player>` or who has no board or reserve unit carrying `blessingsOfKhorne`. Otherwise push the mark, roll `8D6` (`purpose:'ability'`, `commandRerollable:false`, `unitId:null`), and raise `chooseOption` (`canPass:false`, `data:{window,key,code:'blessingsOfKhorne', dice}`). The options are every set that `feasibleBlessingSets(dice, req)` returns, plus `none`. Option ids are the sorted blessing ids joined with `+` (e.g. `totalCarnage+warpBlades`). Labels show the dice used. Options are listed in AI preference order: TC+WB, WD+WB, WD+TC, WB, TC, WD, none. The AI takes the first option. **handle:** check that the option is one of those offered, store `secondaryState['we:blessings'] = {round, dice, active}`, and emit `AbilityTriggered` with the dice and the choice. **gate(state, holder, entry):** `entry.params.blessing` undefined → false (the marker itself has no effect); otherwise `blessingActive(state, holder.player, entry.params.blessing)`. |
| Warp Blades (WOR-2.6) | (a) gated by (b) | Ability `we.a.blessing-warp-blades` on every datasheet: `{trigger:'always', effect:{when:{weaponType:'melee'}, grantWeaponAbility:{ability:'LETHAL_HITS'}}, scope:{who:'self'}, code:'blessingsOfKhorne', params:{blessing:'warpBlades'}}`. |
| Wrathful Devotion (WOR-2.4) | (b)+(c) | Ability `we.a.blessing-wrathful-devotion`: `{trigger:'feelNoPainRoll', code:'wrathfulDevotion', params:{blessing:'wrathfulDevotion', value:6, bonus:1}}`, with no data effect. Hook `wrathfulDevotion`: kind `ability`, hook `onFeelNoPainRoll`, `run: noop`. Its `adjustFeelNoPain(state, entry, modelId, current)` (C1) returns null unless `blessingActive(state, owner, 'wrathfulDevotion')` and the model belongs to `entry.holderUnitId`. If `current === null` it returns `{threshold: 6, modifier: 0}`; otherwise `{threshold: current, modifier: 1}`. |
| Total Carnage (WOR-2.5) | (b) | Ability `we.a.blessing-total-carnage`: `{trigger:'phaseStart', code:'totalCarnage', params:{blessing:'totalCarnage', threshold:4}}`. Hook `totalCarnage`: kind `ability`, hook `onPhaseStart`, `runAt`. It copies Votann `cyberstimms`: if `state.phase === 'fight'`, the holder is on the board and `blessingActive(state, holder.player, 'totalCarnage')`, it calls `grantFightOnDeath(state, holder.id, 4)`. The existing C5 path in `attack.ts destroyModel` already does the rest: the enemy-attack test, the "not fought yet" test, the D6, the 0-wound deferral, `resolveDeferredDeaths` once the attacker finishes, and `finishDestroy`. In the Fight phase only melee attacks happen, so the C5 `kind` test is enough. |
| Skulls for Khorne (WOR-3) | (b) | Enhancement data: `{trigger:'unitDestroyed', code:'skullsForKhorne', scope:{who:'bearer'}}`. Hook `skullsForKhorne`: kind `ability`, hook `onUnitDestroyed`, `runAt(ctx, entry, d)`. It fires only when `d.byModelId === entry.bearerModelId`, `d.kind === 'melee'`, the destroyed unit is an enemy unit, and `leaderService.halves(state, d.destroyedUnitId)` has no board model left (one roll per combined unit). It rolls `D6` (`purpose:'ability'`, `commandRerollable:false`); on 2+ it calls `hookService.gainCp(ctx, holder.player, 1, entry.source.id)`. It emits `AbilityTriggered` with the roll. Mark `skulls:<canonicalDestroyedUnitId>` (phase) prevents a second roll when both halves report. |
| Arch-slaughterer (WOR-3) | (a) | `{trigger:'always', effect:{when:{weaponType:'melee'}, grantWeaponAbility:{ability:'PRECISION'}}, scope:{who:'bearer'}}` |
| Ravage and Ransack (WOR-4) | (b) | Secondary `scoring:[{id:'we.sec.ravage-and-ransack', when:'turn.end', rounds:{from:1,to:5}, who:'opponent', rule:'custom', code:'ravageAndRansack', pointsPer:4, cap:20}]`. Registry entry: `ravageAndRansack: missionHook('ravageAndRansack', 'onTurnEnd')`. The `customAmount` case calls `ravageAndRansackAmount(ctx, rule, pid)` in `factions/world-eaters.ts`. That function takes the live markers, finds the minimum distance to `playerBattlefieldEdge(board, deploymentZone(s, other(pid)))`, keeps every marker within that distance + 0.01, and returns `pointsPer` when `holds(ctx, id, pid)` for any of them, else 0. It reuses the `krumpinSpreeAmount` distance code (pass `holds` in as a callback, as `chitinousTide` does). |
| Blood Offering (WOR-4) | (b) | Secondary `scoring:[{id:'we.sec.blood-offering', when:'any.unitDestroyed', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'bloodOffering', pointsPer:2, cap:99}]`. Registry entry: `bloodOffering: missionHook('bloodOffering', 'onUnitDestroyed')`. `missions.ts`: (1) in `processWindow`, beside the treasure snapshot, `if (window.endsWith('.start') && once(s, 'bloodSnapshot:'+window)) bloodOfferingSnapshot(s)`. That stores, for each player scoring Blood Offering, `secondaryState.bloodNearby` = the ids (both halves) of every enemy board unit with a model within CP-2.4 range of **any** live marker. (2) `bloodOfferingUnitDestroyed(ctx, info)` goes in the UnitDestroyed fan-out next to `treasuresUnitDestroyed`. With `pid = info.byPlayer`, it requires: `info.kind === 'melee'`; `info.byModelId` set; the killer unit is owned by pid and has keyword WORLD EATERS; `bloodNearby.includes(info.unitId)`; and no board model left in either half (mark `blood:<canonical>` stops double scoring). Then it calls `awardVp(pid, min(pointsPer, cap - scored))`. |
| Rage Unchecked (WOR-5) | (a)+(b) | Stratagem `we.s.rage-unchecked`: `window:['shooting.start','fight.start','fight.attacksResolved']`, `who:'either'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'BERZERKERS'}, state:'belowHalf', count:1}]`, `effect:{grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'rageUnchecked'`. Hook `rageUnchecked` (kind `stratagem`) only has a `check`. In phase shooting, the user must be the active player and no half may be in `phaseState.activated` or have `turn.shotThisPhase`. In phase fight, no half may have `turn.foughtThisPhase` or be in `phaseState.fight.fought`. It also requires `leaderService.isBelowHalfStrength(state, canonical)`. This copies CSM `vindictiveStrategy`'s check. |
| Unstoppable Fury (WOR-5) | (b)+(c) | Stratagem `we.s.unstoppable-fury`: `window:'fight.beforeConsolidate'` (C2), `who:'either'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'WORLD EATERS'}, count:1}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'unstoppableFury'`, `params:{consolidate:6, consolidateOnly:true, enemyOnly:true}`. Hook `unstoppableFury`: kind `stratagem`, hook `onMove`. **check:** `env.trigger.unitId` is set, `leaderService.sameUnit(state, t.ids[0], trigger.unitId)`, and the unit is owned by `env.player` with a board model. **apply:** do what `getStuckInDistance.apply` does (grant an empty-effect ActiveEffect, so `getStuckIn` finds the source). The distance itself comes from C3. |
| Overwhelming Onslaught (WOR-5) | (b) | Stratagem `we.s.overwhelming-onslaught`: `window:'charge.moveEnded'`, `who:'active'`, `phases:['charge']`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'WORLD EATERS'}, state:'chargedThisTurn', count:1}, {role:'unit', owner:'enemy', filter:{within:{of:'previousTarget', inches:1}}, count:1}]`, `code:'overwhelmingOnslaught'`, `duration:'instant'`. Hook **check:** `env.trigger.unitId` is the same unit as `t.ids[0]`, so only the unit that has just ended its Charge move qualifies, and `t.ids[1]` is an enemy board unit within Engagement Range (`withinEngagementRange`, 1" horizontal / 5" vertical) of it. **apply:** emit `AbilityTriggered`, then `hookService.battleShockTest(ctx, canonical(t.ids[1]), env.stratagem.id, -1)`. This is the `bestialBellowApply` pattern. |
| Feel No Pain 6+ (Jakhals) | (a) | `coreAbilities:[{ability:'FEEL_NO_PAIN', value:6}]` |
| Invulnerable save 4+ (Karagar) | (a) | datasheet `invuln:'4+'` |
| WARLORD / no Leader | (a) | patrol `warlord:'karagar'`, no `attachTo`. The datasheet has no `LEADER` core ability, so no attach choice appears before the game |
| Weapon abilities (Pistol, Hazardous, Extra Attacks, Lance, Sustained Hits 1) | (a) | `PISTOL`, `HAZARDOUS`, `EXTRA_ATTACKS`, `LANCE`, `SUSTAINED_HITS` 1; each plasma pistol pair is one `profileGroup` |
| Base 90 × 52 oval | (a) | `base:{shape:'oval', mm:90, mm2:52}` (the same footprint as the Bike row in 30-figures) |
| BATTLELINE (Jakhals) | (a) | keyword, used by CP-2.4 secured objectives |
| MOUNTED, CHAOS, KHORNE, icon of Khorne, Pack Leader, Dishonoured | (a) | Plain keywords or model labels only. None of them has a rule in this patrol |

### 7.1 Engine changes (c) — exact signatures

All three are in non-frozen files. The engine agent builds them, and the (b) hooks are written against these signatures.

**C1 — Feel No Pain adjusters (Wrathful Devotion).** `src/engine/code-hooks.ts`, `EngineCodeHook`:
```ts
// C1 (World Eaters Wrathful Devotion): runs after every other FNP source of `modelId` has been merged.
// `current` = the best FNP threshold the model has without this source (null = none).
// Returns the threshold to use and a modifier added to the FNP die; null = no opinion.
adjustFeelNoPain?(state: GameState, entry: HookSourceEntry, modelId: ModelId, current: number | null):
  { threshold: number | null; modifier: number } | null
```
`src/engine/attack.ts`: `bestFeelNoPain` changes to return `{ threshold: number; modifier: number } | null`.
1. Compute `best` as now (core FEEL_NO_PAIN + `feelNoPain` results).
2. Add `modifier` = the sum of `modifier` from the `onFeelNoPainRoll` roll results (this already exists in
   `RollResult`; it is how data `modifyRoll:{roll:'feelNoPain'}` comes through).
3. For each gated source entry of the model's unit whose code hook has `adjustFeelNoPain`, call it with `current = best`.
   A non-null result sets `best = r.threshold ?? best` and adds `r.modifier`.
4. Cap the total modifier at +1 / −1, the same cap as hit and wound modifiers.

`applyOnePoint` then uses `ignored = die + modifier >= threshold`. It emits `FeelNoPainRolled` with
`needed: threshold - modifier`, so the event shape is unchanged.
Export, for tests and the hook:
```ts
export function feelNoPainFor(ctx: EngineContext, modelId: ModelId, actx: AttackContext, mortal?: boolean, psychicSource?: boolean):
  { threshold: number; modifier: number } | null
```
Side effect: data `modifyRoll:{roll:'feelNoPain'}` now works everywhere. Today it is silently ignored. Grep the
faction data for it before merging; none existed at the time this spec was written.

**C2 — `fight.beforeConsolidate` window.** `src/data/types.ts`: add `'fight.beforeConsolidate'` to `TimingWindowId`.
`src/engine/phases/fight.ts`, in the activation step machine: `fight.subStep === 'consolidate'`, before
`doConsolidate`, and only if the unit still has a board model:
```ts
if (!ctx.marked(`fi:bcWindow:${unitId}`)) {
  if (ctx.window('fight.beforeConsolidate', unitId, ctx.order.active(), { unitId })) return 'pending'
  ctx.once(`fi:bcWindow:${unitId}`)
}
```
The window opens once per normal fight activation. It does not open for Total Carnage / Daemonic Fervour deferred
models, Death Blow models or deferred activations, because those never consolidate. Add the window to 20-data-schema's
window list. Stratagem players: both sides get the usual reactive order, so `who:'either'` works in the opponent's
Fight phase too.

**C3 — consolidate-only distance with an enemy-only condition.** `src/engine/hooks-impl.ts`:
```ts
// getStuckIn: read sources whose code is 'getStuckInDistance' OR 'unstoppableFury'
// params: { pileIn?: number; consolidate?: number; pileInOnly?: boolean; consolidateOnly?: boolean; enemyOnly?: boolean }
// consolidateOnly → pileIn = base (no pile-in bonus); enemyOnly → the bonus applies only to the enemy-engagement form
function getStuckIn(state: GameState, unitId: UnitId):
  { pileIn: number | null; consolidate: number | null; enemyOnly: boolean } | null
// HookQueries (non-frozen interface in hooks-impl.ts):
consolidateDistance(state: GameState, unitId: UnitId, base?: number, form?: 'enemy' | 'objective'): number
```
`consolidateDistance(…, 'objective')` returns `base` when the winning source has `enemyOnly`. `pileInDistance`
ignores `consolidateOnly` sources.
`src/engine/phases/fight.ts` `doConsolidate`:
- `distEnemy = consolidateDistance(s, unitId, 3, 'enemy')` and `distObj = consolidateDistance(s, unitId, 3, 'objective')`.
- `enemyFeasible` uses `distEnemy`, and `nearestReachableObjective` / its legality test use `distObj`.
- The decision's `context.distance` and the stored `fi:dist` mark take the distance of the chosen form.
- `checkConsolidateArrangement` reads the stored distance, so a 6" move toward an objective is rejected
  (`E_OUT_OF_RANGE`).

Totals: **9 new code hooks** (`blessingsOfKhorne`, `wrathfulDevotion`, `totalCarnage`, `skullsForKhorne`,
`ravageAndRansack`, `bloodOffering`, `rageUnchecked`, `unstoppableFury`, `overwhelmingOnslaught`) plus the
helpers below; **3 engine changes** (C1–C3). None touches a frozen contract, so `00-architecture.md` needs no edit.
20-data-schema gets the new window and a note that `modifyRoll:{roll:'feelNoPain'}` is now honoured.

Helpers exported from `src/engine/factions/world-eaters.ts` (b-side, no engine contract):
```ts
export type BlessingId = 'wrathfulDevotion' | 'totalCarnage' | 'warpBlades'
export interface BlessingRequirement { pairMin: number; triple?: boolean }
export interface StoredBlessings { round: number; dice: number[]; active: BlessingId[] }
export const BLESSINGS_KEY = 'we:blessings'
// every set of 0..max distinct blessings that can be paid for from `dice` with disjoint dice (brute force over
// value assignments: a blessing takes 2 dice of one value v >= pairMin, or, if `triple`, 3 dice of any one value)
export function feasibleBlessingSets(dice: number[], req: Record<BlessingId, BlessingRequirement>, max: number): BlessingId[][]
export function activeBlessings(state: GameState, player: PlayerId): BlessingId[]   // [] unless stored.round === state.round
export function blessingActive(state: GameState, player: PlayerId, id: BlessingId): boolean
export function ravageAndRansackAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, holds: (id: string) => boolean): number
export function worldEatersHooks(): Record<string, EngineCodeHook>   // hoisted factory (circular module graph, like adeptusMechanicusHooks)
```

## 8. Test IDs

This is the same list as the `WOR` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| WOR-001 | WOR-1 | patrol `we.cp.karagars-rampagers` loads (faction `world-eaters`): 3 units, 21 models; Karagar is WARLORD with Skulls for Khorne and is not attached to anything; default secondary Ravage and Ransack; stratagems are the three `we.s.*` ids; the start screen lists World Eaters |
| WOR-002 | WOR-6 | data: every stat and weapon row of §6 matches; every datasheet has faction keyword WORLD EATERS and the four Blessings abilities; Karagar has a 4+ invuln and a 90×52 oval base; Jakhals have FNP 6+ and the Dishonoured has a 40 mm base; Berzerker and Jakhal pistols reuse the `csm.w.*` ids |
| WOR-003 | WOR-2.1 | start of each battle round: the World Eaters player gets 8D6 rolled (`purpose:'ability'`, not Command-re-rollable) and one `chooseOption` (no pass) of feasible sets + `none`; a player with no World Eaters units is not asked; in a mirror match both are asked, first player first |
| WOR-004 | WOR-2.2 | dice [1,1,2,3,4,5,6,6] → offered: WD, TC, WB, WD+TC, WD+WB, none; **not** TC+WB (only one qualifying pair) |
| WOR-005 | WOR-2.2 | dice [3,3,3,2,2,1,4,6] → the triple 3s pay for TC or WB, the 2s pay for WD; TC+WB not offered; dice [5,5,5,5,1,2,3,4] → TC+WB offered (two pairs of 5); dice [1,2,3,4,5,6,1,2] with no double ≥ 4 and no triple → only WD (and none) offered |
| WOR-006 | WOR-2.3 | at most two Blessings, no Blessing twice; the choice is stored for the current round only; next round → a fresh roll and the old Blessings are gone; choosing `none` → no effect |
| WOR-007 | WOR-2.4 | Wrathful Devotion: a Berzerker with no FNP gets FNP 6+ (die 6 ignores, die 5 does not); a Jakhal (FNP 6+) adds 1 (die 5 ignores, die 4 does not); it also works against mortal wounds; Blessing not active → Berzerkers have no FNP |
| WOR-008 | C1 | engine: `adjustFeelNoPain` result `{threshold:6, modifier:0}` for a model with no FNP and `{threshold:current, modifier:1}` otherwise; data `modifyRoll:{roll:'feelNoPain', value:1}` is now applied; total modifier capped at +1; `FeelNoPainRolled.needed` shows the effective target |
| WOR-009 | WOR-2.5 | Total Carnage: an enemy melee attack destroys a Berzerker that has not fought, D6 = 4 → the model stays at 0 W and cannot be allocated; once the enemy unit's attacks finish it piles in and fights, then is removed; D6 = 3 → removed at once |
| WOR-010 | WOR-2.5 | Total Carnage: Berzerkers already fought this phase → no roll; a model destroyed by shooting (Overwatch / Shooting phase) or by stratagem mortal wounds → no roll; it works in the opponent's Fight phase too; Blessing not active → no roll |
| WOR-011 | WOR-2.6 | Warp Blades: Berzerker chainblade critical hit wounds automatically (Lethal Hits); a plasma pistol critical hit does not; it ends at the end of the round |
| WOR-012 | WOR-3 | Skulls for Khorne: Karagar's exalted chainblade removes the last model of an enemy unit, D6 = 2 → +1 CP; D6 = 1 → no CP; a Berzerker kill → no roll; a plasma-pistol kill → no roll; a second gain in the same round is discarded by R-4.2 |
| WOR-013 | WOR-3 | Skulls for Khorne vs an attached enemy pair: killing the bodyguard half while the leader lives → no roll; killing the last model of the pair → one roll |
| WOR-014 | WOR-3 | Arch-slaughterer: Karagar's melee attacks can be allocated to a visible CHARACTER in an attached unit (Precision); his plasma pistol cannot; no Skulls for Khorne roll when Arch-slaughterer is taken |
| WOR-015 | WOR-4 | Ravage and Ransack: end of the opponent's turn, the player controls the marker closest to the opponent's edge → +4 VP; end of the player's own turn → 0; marker not controlled → 0; tied nearest markers → controlling either scores 4 once; works on all six mission layouts (cp-01/cp-04 have no home markers) |
| WOR-016 | WOR-4 | Blood Offering: an enemy unit within range of a marker at `fight.start` is destroyed by a Berzerkers melee attack → +2 VP; the same unit off-objective at phase start → 0; destroyed by shooting → 0; two such units in one phase → +4; a Total Carnage deferred model's kill counts |
| WOR-017 | WOR-5 | Rage Unchecked: Berzerkers at 4/10 models, not yet fought → every weapon has Sustained Hits 1 until the end of the phase (a critical hit adds 1 hit); at 5/10 (not below half) → not offered; already shot this phase → not offered; offered in the opponent's Fight phase; never for Jakhals |
| WOR-018 | WOR-5, C2 | Unstoppable Fury: the `fight.beforeConsolidate` window opens after the unit's attacks and deferred deaths, before consolidation; once used, a model may move up to 6" and the unit must end in Engagement Range; pile-in stays 3" |
| WOR-019 | WOR-5, C3 | Unstoppable Fury: no enemy can be reached within 6" → the objective fallback is limited to 3" (a 4" move toward a marker is rejected `E_OUT_OF_RANGE`); the stratagem cannot target a unit other than the consolidating one; Gilded Spear (`getStuckInDistance`) behaviour unchanged |
| WOR-020 | WOR-5 | Overwhelming Onslaught: Berzerkers end a Charge move in ER of enemy X → stratagem offered; X takes a Battle-shock test with −1 (2D6 = 8 vs Ld 7+ → passes at 7; 2D6 = 7 → fails, X Battle-shocked); an enemy not in ER cannot be picked |
| WOR-021 | WOR-5 | Overwhelming Onslaught is not offered after a failed charge, a Heroic Intervention or in the opponent's Charge phase; only the unit that just charged can be the first target |
| WOR-022 | WOR-6 | Karagar's weapons: Juggernaut's bladed horn (Extra Attacks) attacks alongside the exalted chainblade; Lance → +1 to wound on the turn he charged; supercharged plasma pistol is Hazardous; BS 2+ |
| WOR-023 | WOR-6 | Jakhal weapons: Jakhal chainblades and mauler chainblade Sustained Hits 1; the Dishonoured has only the skullsmasher (no ranged attack, still counts for OC/coherency); Jakhals FNP 6+ vs normal damage |
| WOR-024 | WOR-2.2 | `feasibleBlessingSets` unit test: never returns a set needing more dice than rolled; set order is the AI preference order; `none` always offered |
| WOR-025 | WOR-2 | AI: the Blessings AI takes the first offered option; a full AI-vs-AI game with this patrol finishes without a stuck decision |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavier models up to 1.3; the mounted model is compressed). Bases match
the rules.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `karagar-the-blooded` | `we.karagar-the-blooded/karagar` | 1 | 1.9 | 90 × 52 mm oval | A chibi armoured warlord in deep crimson plate with dull brass trim and a horned crested helm, riding a squat brass-plated mechanical bull-beast with a single huge bladed horn and glowing ember eyes, a roaring chain-sword raised high and a small pistol at the hip. |
| `berzerker-champion` | `we.khorne-berzerkers/champion` | 1 | 1.2 | 32 mm | A chibi hulking crimson-armoured berserker with blackened steel pauldrons, a tall crested helm with a snarling grille, a stubby glowing-blue pistol in one hand and a toothed chain-sword in the other, a short bone-white trophy cape. |
| `berzerker-plasma` | `we.khorne-berzerkers/plasma` | 1 | 1.1 | 32 mm | A chibi crimson-armoured berserker in mid-roar with brass edging and pipes running from the helm to the backpack, holding a glowing-blue pistol and a toothed chain-sword. |
| `berzerker-icon` | `we.khorne-berzerkers/icon` | 1 | 1.1 | 32 mm | The same chibi crimson berserker with a chain-sword, a glowing-blue pistol and a tall brass banner pole on its back topped with an original spiky skull-and-blade icon. |
| `berzerker-eviscerator` | `we.khorne-berzerkers/eviscerator` | 2 | 1.1 | 32 mm | The same chibi crimson berserker swinging an oversized two-handed chain-cleaver with heavy teeth, a small pistol holstered on the thigh. |
| `berzerker` | `we.khorne-berzerkers/chainblade` | 5 | 1.1 | 32 mm | A chibi stocky crimson power-armoured berserker with blackened steel shoulders, brass trim and a grilled helm, charging with a chunky pistol in one hand and a toothed chain-sword in the other. |
| `jakhal-pack-leader` | `we.jakhals/pack-leader` | 1 | 1.05 | 28 mm | A chibi wiry human brute with a red-painted iron half-mask and a mohawk-like crest, crimson rags and brass-studded straps, twin small chain-blades and an autopistol on the belt. |
| `jakhal-dishonoured` | `we.jakhals/dishonoured` | 1 | 1.3 | 40 mm | A chibi oversized mutant hulk in torn crimson rags with a heavy iron collar and a cage-like iron mask, dragging a huge spiked club-hammer in both hands. |
| `jakhal-mauler` | `we.jakhals/mauler` | 1 | 1.0 | 28 mm | A chibi scrawny masked human raider in crimson rags and leather straps, gripping a long heavy chain-axe with both hands, an autopistol at the hip. |
| `jakhal-icon` | `we.jakhals/icon` | 1 | 1.0 | 28 mm | The same chibi masked human raider carrying a crooked scrap-iron banner pole topped with an original jagged skull icon, a small chain-blade in the free hand. |
| `jakhal` | `we.jakhals/jakhal` | 6 | 1.0 | 28 mm | A chibi scrawny human raider in a crude iron face-mask, patched crimson rags and brass-studded harness, an autopistol in one hand and a short chain-blade in the other. |

## 10. Other World Eaters patrols (appendix)

None. The wahapedia Combat Patrol navigation lists Karagar's Rampagers as the only World Eaters patrol (checked 2026-10-16).
