# Faction spec — Thousand Sons: The Coven Temporus

Own-words data spec for the Thousand Sons Combat Patrol, same shape as 11-combat-patrol §4. Rule ids
`THO-<section>.<n>` are cited by the `THO-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose here is ours. Data id prefix: `ths.` (faction id `thousand-sons`, faction keyword THOUSAND SONS).

## 0. Sources (accessed 2026-10-16)

| Source | URL | Version shown on page |
|---|---|---|
| Thousand Sons box "The Coven Temporus" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/the-coven-temporus/ | Index: The Coven Temporus, 10th ed, **June 2023** |
| CP faction navigation (used to enumerate patrols) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | — |
| Combat Patrol format rules | same rules page | already captured in 11-combat-patrol §1–2; not re-transcribed |

Patrol selection: the navigation lists exactly one patrol under Thousand Sons (§10). The patrol page also prints the
army-wide Thousand Sons Cabal of Sorcerers block with five Rituals; only the two Rituals in the Coven Temporus faction
ability (§2) belong to this patrol — Temporal Surge, Doombolt and Twist of Fate are **not** used.

## 1. Roster

4 units, 26 models. Faction keyword THOUSAND SONS on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `ahrak` | Ahrak the Time Weaver | 1 | inferno bolt pistol; Screamer Invocation (2 profiles); force weapon | **WARLORD**. Not a Leader (no Leader ability, no bodyguard list) — always operates alone |
| `scarabs` | Scarab Occult Terminators | 5 | Scarab Occult Sorcerer: Warpsmite + force weapon + Prosperine khopesh; 2× inferno combi-bolter + Prosperine khopesh; 1× soulreaper cannon + Prosperine khopesh; 1× hellfyre missile rack + inferno combi-bolter + Prosperine khopesh | — |
| `tzaangors-1` | Tzaangors | 10 | each: autopistol + chainsword | — |
| `tzaangors-2` | Tzaangors | 10 | each: autopistol + chainsword | second copy of the same datasheet |

No Patrol Squads ability (CP-1.8 does not apply). No leader attachments exist in this patrol (R-10.1 never applies).
The Sorcerer carries two melee weapons; like any multi-melee model it picks one per fight (R-9).

## 2. Faction ability — Cabal of Sorcerers (Ahrak "2", Scarab Occult Sorcerer model "1")

| Id | Rule |
|---|---|
| THO-2.1 | **Generation.** At the end of your Command phase, every model of yours with this ability that is on the battlefield and not Battle-shocked adds its listed value to your Cabal pool: Ahrak +2, the Scarab Occult Sorcerer model +1 (only that model carries the ability; its unit being Battle-shocked excludes it). Models in Reserves add nothing. |
| THO-2.2 | **Pool.** One pool per player (`players[p].secondaryState.cabalPoints`). It is reset to 0 at the start of your next Command phase (before anything else at `command.start`); points never carry past that. Other sources (THO-3.1 Temporal Sorceries, THO-6.3 Relic Hunters) add to the same pool at the same moment. |
| THO-2.3 | **Rituals.** At the start of any phase (either player's turn, `command.start` / `movement.start` / `shooting.start` / `charge.start` / `fight.start`) you may perform Rituals by spending their cost from the pool. Each Ritual needs you to pick one THOUSAND SONS PSYKER model of your army (Ahrak or the Scarab Occult Sorcerer); each Ritual is usable at most once per phase; a Ritual that costs more than the pool holds cannot be used. Both Rituals are Psychic. |
| THO-2.4 | **Weaver of Fates (2 points).** Until the end of the phase, once: when a saving throw fails for a model of a friendly THOUSAND SONS unit within 18" of the chosen PSYKER, you may re-roll that save. The PSYKER must be on the battlefield (the 18" is measured from that PSYKER model's position to the closest model of the defending unit, at the moment of the failed save; each player has their own once-per-phase use) **[interpretation]**. |
| THO-2.5 | **Echoes from the Warp (6 points).** Until the end of the phase, once: you may target the chosen PSYKER's unit with one Stratagem for 0 CP, even if that Stratagem has already been used this phase. The PSYKER may be anywhere that is not destroyed (e.g. in Reserves, so Rapid Ingress qualifies) **[interpretation]**. |
| THO-2.6 | **[interpretation]** Rituals are offered to both players at each phase-start window, active player first (Pain pattern). At your own `command.start` your pool has just been reset, so in practice your Rituals are spent in your later phases and in the opponent's turn. |

## 3. Enhancements (Ahrak, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| THO-3.1 | Temporal Sorceries | default | the bearer has Deep Strike and Lone Operative. At the end of your Command phase, if the bearer is on the battlefield (Battle-shock does not matter), add D3 to your Cabal pool. |
| THO-3.2 | Arch-Diabolist | optional | the bearer has Deep Strike and Lone Operative. Both Screamer Invocation profiles gain [PISTOL]. |

Ahrak is never part of an attached unit, so Lone Operative is always live (only targetable by ranged attacks from
within 12"). Deep Strike lets him be set up in Reserves at Declare Battle Formations (CP Reserves rules apply).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| THO-4.1 | Sorcerous Ritual | default | from battle round 2 on, at the end of the **opponent's** Fight phase: if at least one of your PSYKER models (Ahrak, the Scarab Occult Sorcerer) is within range of an objective marker you control that is **not** within your deployment zone, roll one D6 and add your remaining Cabal points (at most +3). On 5+ score 3 VP. Once per such phase; no overall cap stated. |
| THO-4.2 | Bringer of Change | optional | at the end of every phase (both players' turns): score D3 VP if at least one enemy model was destroyed this phase by a Psychic Attack (an attack with a [PSYCHIC] weapon, including mortal wounds from its Devastating Wounds) made by a model of your army. At most 12 VP in total from this objective. |

## 5. Patrol stratagems

| Id | Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|---|
| THO-5.1 | Wreathed in Warpflame | 1 | battleTactic | a Fight phase (either turn), between activations: `[fight.start, fight.attacksResolved]` | one own THOUSAND SONS unit, not TZAANGORS, not yet selected to fight this phase | until end of phase: the unit's melee weapons have [LETHAL HITS]; each attack by a model in the unit against a MONSTER or VEHICLE unit scores a Critical Hit on an unmodified hit roll of 5+. |
| THO-5.2 | Mutant Cunning | 1 | strategicPloy | opponent's Shooting phase, just after an enemy unit selects its targets (`shooting.targetsDeclared`) | one own TZAANGORS unit that is a target of one or more of those attacks | the unit makes a Normal move of up to D6" (normal move limits: cannot end — or move — within Engagement Range; a unit already in Engagement Range is not eligible). Until end of phase, ranged attacks against it count it as having the Benefit of Cover. |
| THO-5.3 | Malign Entanglement | 1 | strategicPloy | opponent's Charge phase, just after an enemy unit declares a charge (`charge.declared`) | one own THOUSAND SONS unit that is a target of that charge | until end of phase, the charging unit subtracts 2 from its Charge rolls. |

Core stratagems: all apply per 10-rules §11 under their own keyword gates (Epic Challenge: Ahrak is a CHARACTER;
Go to Ground: every unit is INFANTRY; no GRENADES, SMOKE or VEHICLE units).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ahrak the Time Weaver | 1 | 40 mm | 6 | 4 | 3+ | 5+ | 4 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, CHAOS, TZEENTCH, INFERNAL MASTER, AHRAK THE TIME WEAVER | Cabal of Sorcerers 2; Glimpse of Eternity (Psychic, THO-6.1); (Deep Strike + Lone Operative from either enhancement) |
| Scarab Occult Terminators | 5 | 40 mm | 5 | 5 | 2+ | 4+ | 3 | 6+ | 1 | INFANTRY, TERMINATOR, CHAOS, TZEENTCH, SCARAB OCCULT TERMINATORS; Sorcerer model also PSYKER | Deep Strike; Cabal of Sorcerers 1 (Sorcerer model only); Implacable Guardians (THO-6.2) |
| Tzaangors | 10 | 32 mm | 6 | 4 | 6+ | 6+ | 1 | 7+ | 2 | INFANTRY, BATTLELINE, CHAOS, TZEENTCH, TZAANGORS | Relic Hunters (THO-6.3) |

Faction keyword (all): THOUSAND SONS. "Psychic attack" = an attack made with a [PSYCHIC] weapon.

| Id | Ability | Rule |
|---|---|---|
| THO-6.1 | Glimpse of Eternity (Ahrak, Psychic) | once per turn, after one of these rolls is made for Ahrak, you may change it to an unmodified 6: one Hit roll or Wound roll (one die of one of his attacks), one Damage roll of one of his attacks, or one saving throw made for him. The changed die can no longer be re-rolled. **[interpretation]** a D3 roll is a halved D6, so a D3 Damage roll changed this way becomes 3. The change is offered after every re-roll step of that roll (automatic re-rolls, re-roll offers, Command Re-roll). |
| THO-6.2 | Implacable Guardians (Scarab Occult Terminators) | while the unit still contains its Sorcerer (the PSYKER model), each attack against the unit whose Strength is greater than the unit's Toughness subtracts 1 from its Wound roll. |
| THO-6.3 | Relic Hunters (Tzaangors) | at the end of your Command phase, for each objective marker you control that has at least one unit with this ability within range, roll one D6 (one die per marker, however many Tzaangors units are on it): each 4+ adds 1 to your Cabal pool. |

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Ahrak the Time Weaver | — | inferno bolt pistol, Screamer Invocation | force weapon |
| Scarab Occult Terminators | Scarab Occult Sorcerer (`sorcerer`) | Warpsmite | force weapon, Prosperine khopesh |
| Scarab Occult Terminators | Terminator (combi-bolter) ×2 (`combi`) | inferno combi-bolter | Prosperine khopesh |
| Scarab Occult Terminators | Terminator (soulreaper) ×1 (`soulreaper`) | soulreaper cannon | Prosperine khopesh |
| Scarab Occult Terminators | Terminator (hellfyre) ×1 (`hellfyre`) | hellfyre missile rack, inferno combi-bolter | Prosperine khopesh |
| Tzaangors | ×10 | autopistol | chainsword |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| inferno bolt pistol | 12" | 1 | 2+ | 4 | −1 | 1 | Pistol |
| Screamer Invocation — witchfire | 18" | 2D3 | n/a | 6 | −2 | 1 | Psychic, Torrent (+Pistol with Arch-Diabolist) |
| Screamer Invocation — focused witchfire | 18" | 2D6 | n/a | 6 | −2 | 1 | Hazardous, Psychic, Torrent (+Pistol with Arch-Diabolist) |
| hellfyre missile rack | 36" | 2 | 3+ | 10 | −2 | 3 | — |
| inferno combi-bolter | 24" | 2 | 3+ | 4 | −1 | 1 | Rapid Fire 2 |
| soulreaper cannon | 24" | 6 | 3+ | 6 | −1 | 1 | Devastating Wounds |
| Warpsmite | 18" | 3 | 3+ | 4 | −3 | 1 | Anti-INFANTRY 4+, Devastating Wounds, Pistol, Psychic |
| autopistol | 12" | 1 | 4+ | 3 | 0 | 1 | Pistol |
| force weapon (Ahrak, Sorcerer) | melee | 4 | 3+ | 6 | −1 | D3 | Psychic |
| Prosperine khopesh | melee | 3 | 3+ | 5 | −2 | 2 | — |
| chainsword | melee | 3 | 4+ | 4 | 0 | 1 | — |

Suggested `paintScheme` (original): primary `#1f4fa3` (lapis blue), secondary `#d4a73a` (burnished gold), trim
`#e8dcc0` (parchment), metal `#b8a26a` (brass), decal `#5ad1e6` (warp-cyan glow).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (in a new
`src/engine/factions/thousand-sons.ts`, exported as `thousandSonsHooks()` and spread into `codeHooks`); (c) = engine
change beyond a code hook. **No (c) item touches a frozen contract** (`types/actions/events/hooks/rng/decider/index.ts`):
`RerollKind 'oneDie'` already exists in hooks.ts, re-roll and fix signals reuse `DiceRerolled`, and every new field
lives in non-frozen files (`attack.ts`, `code-hooks.ts`, `stratagems.ts`, `setup.ts`, `state.ts`, new `fix-roll.ts`).
Reused as-is: Pain-style pool + phase-start pick windows (`src/engine/pain.ts`, `factions/drukhari.ts painOffer`),
`livesBeforeTerritory` (Tau, reactive D6" move + cover), `tgbOverawingCheck` (Custodes, charge-target check),
`grantsCoreAbility` (SM `stealthyHunter`), `unitHasModel`, `strengthVsToughness`, `lethalOn`, `stratagemCostOverride`
cost path (Aeldari Foresight). Nothing from Necrons' model-return work is needed.

| Rule | Enc. | Encoding |
|---|---|---|
| Cabal pool (THO-2.1, 2.2) | (b) | `cabalOfSorcerers` — ability descriptor on Ahrak `{trigger:'commandPhase', code:'cabalOfSorcerers', params:{value:2}}` and on the Scarab datasheet `{…, params:{value:1, modelId:'sorcerer'}}`. Pool helpers exported from `factions/thousand-sons.ts`: `cabalPoints(state, player): number`, `gainCabal(ctx, player, n, source)`, `spendCabal(ctx, player, n, source): boolean` (key `secondaryState.cabalPoints`, emits `AbilityTriggered`). `pick` window `command.start`: reset the **active** player's pool to 0 (once per turn, mark `ths:reset:<round>:<player>`), then fall through to the Ritual offer. `pick` window `command.end` (active player only, mark `ths:gen:<round>:<player>`): sum `value` over the player's board models that carry a `cabalOfSorcerers` ability (`params.modelId` → only that composition model, alive) whose unit is not `battleShocked`; then Temporal Sorceries D3 if its bearer is on the board; then Relic Hunters; `gainCabal` once per source. Raises no decision (pure bookkeeping; the pick's `offer` returns false). |
| Rituals offer (THO-2.3, 2.6) | (b) | `cabalRituals` — `pick` windows `command.start, movement.start, shooting.start, charge.start, fight.start` (painOffer pattern: loops active player then opponent, `ths:rit:done:<player>` phase mark). Options: `weaver:<psykerModelId>` (pool ≥2, not yet used this phase, PSYKER on board), `echoes:<psykerModelId>` (pool ≥6, not used this phase, PSYKER not destroyed), `done`. Handle: `spendCabal`, push phase mark `ths:weaver:<player>:<psykerModelId>` or call `grantPhaseCostOverride` (C3) with `{cost:0, ignoreLimit:true, source:'ths.a.echoes-from-the-warp'}` for the PSYKER's canonical unit; emit `AbilityTriggered`; re-offer until `done` (both Rituals may be used in one window). AI hint: Weaver only in a phase where the opponent attacks (opponent's shooting/fight start, own fight start); Echoes only when ≥1 own stratagem is affordable-relevant — default `done`. |
| Weaver of Fates (THO-2.4) | (b)+(c) | (b) `weaverOfFates` — ability `ths.a.weaver-of-fates` listed on every THOUSAND SONS datasheet (`trigger:'saveRoll', code:'weaverOfFates'`), `hook:'onSaveRoll'`, `forceScope:{who:'friendly'}`; `gateEffect`: the defending unit is THOUSAND SONS, a mark `ths:weaver:<defenderPlayer>:<m>` exists this phase with model `m` on the board within 18" of the defending unit, measured as the closest distance from the chosen PSYKER model `m`'s own position to any model of the defending unit (<= 18"; never from `m`'s whole unit, so a Scarab Occult Terminator unit's closest Terminator does not count), and no `oneDie:ths.a.weaver-of-fates:save:<defenderPlayer>` mark → result `{kind:'roll', reroll:'oneDie'}`. (c) C2 makes the save paths honour `oneDie`. |
| Echoes from the Warp (THO-2.5) | (b)+(c) | (b) handled inside `cabalRituals`; (c) C3 phase cost override in `stratagems.ts`. |
| Temporal Sorceries (THO-3.1) | (b)+(c) | enhancement effect `{trigger:'always', code:'temporalSorceries'}`; hook `temporalSorceries` (`kind:'ability'`, `hook:'onStatQuery'`, `run: noop`) with `grantsCoreAbility(state, entry, unitId)` → `['DEEP_STRIKE','LONE_OPERATIVE']` when `unitId` is the bearer's unit (SM `stealthyHunter` pattern). The D3 is rolled by `cabalOfSorcerers` at `command.end` (`purpose:'ability'`) when `unitWithAbilityCode(…,'temporalSorceries')`'s bearer is on the board. (c) C1 makes a hook-granted Deep Strike count for Reserves. |
| Arch-Diabolist (THO-3.2) | (a)+(b)+(c) | (a) `{trigger:'always', scope:{who:'bearer'}, effect:[{when:{weaponId:'ths.w.screamer-invocation-witchfire'}, grantWeaponAbility:{ability:'PISTOL'}}, {when:{weaponId:'ths.w.screamer-invocation-focused'}, grantWeaponAbility:{ability:'PISTOL'}}]}` plus a second descriptor `{trigger:'always', code:'archDiabolist'}`; hook `archDiabolist` = same `grantsCoreAbility` as `temporalSorceries`; C1 as above. |
| Sorcerous Ritual (THO-4.1) | (b) | secondary `scoring:[{id:'sorcerous-ritual', when:'phase.end', rounds:{from:2,to:5}, who:'opponent', rule:'custom', code:'sorcerousRitual', pointsPer:3, cap:999 /* no game cap */, params:{needed:5, maxBonus:3}}]`; `sorcerousRitual = missionHook('sorcerousRitual', 'onPhaseEnd')` + amount fn `sorcerousRitualAmount(ctx, rule, pid, controls)` in `factions/thousand-sons.ts` wired in `missions.ts`: returns 0 unless `s.phase === 'fight'`; needs a board PSYKER model of `pid` (model keywords) within range of a marker `controls(id)` that is not in `pid`'s deployment zone; rolls D6 (`purpose:'mission'`) + `min(maxBonus, cabalPoints(s, pid))` ≥ `needed` → `pointsPer`. Pool is read, never spent. |
| Bringer of Change (THO-4.2) | (b)+(c) | `{id:'bringer-of-change', when:'phase.end', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'bringerOfChange', pointsPer:3, cap:12}`; `bringerOfChange = missionHook('bringerOfChange', 'onPhaseEnd')` + `bringerOfChangeAmount(ctx, rule, pid)`: if `psychicKillThisPhase(s, pid)` (C5) roll D3 (`purpose:'mission'`) and return `min(roll, cap − vpBySource[rule.id])`. |
| Wreathed in Warpflame (THO-5.1) | (a) | stratagem `window:['fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{phase:'fight'}`, target `{role:'unit', owner:'friendly', filter:{keyword:'THOUSAND SONS', notKeyword:'TZAANGORS'}, state:'notYetFought', count:1}`, `scope:{who:'target'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'`, `effect:[{when:{weaponType:'melee'}, grantWeaponAbility:{ability:'LETHAL_HITS'}}, {when:{targetKeyword:['MONSTER','VEHICLE']}, lethalOn:5}]` (`lethalOn` → `critThreshold` on `onHitRoll`). |
| Mutant Cunning (THO-5.2) | (a)+reuse | stratagem `window:'shooting.targetsDeclared'`, `who:'reactive'`, `condition:{phase:'shooting', ownTurn:false}`, target `{owner:'friendly', filter:{keyword:'TZAANGORS'}, state:'targetedByAttack'}`, `code:'livesBeforeTerritory'`, `params:{keywords:['TZAANGORS']}`, `duration:'untilEndOfPhase'`. Existing hook (Tau SDC-5) does the D6 roll, `startReactiveMove` and the cover mark — no new code. |
| Malign Entanglement (THO-5.3) | (b) | stratagem `window:'charge.declared'`, `who:'reactive'`, `condition:{phase:'charge', ownTurn:false}`, targets `[{role:'unit', owner:'enemy', count:1}, {role:'unit', owner:'friendly', filter:{keyword:'THOUSAND SONS'}, count:1}]`, `code:'malignEntanglement'`, `duration:'untilEndOfPhase'`. Hook `malignEntanglement` (`kind:'stratagem'`, `hook:'onCharge'`): `check = tgbOverawingCheck` (reuse, adeptus-custodes.ts); `apply`: `ctx.services.effects.grant(ctx, canonical(t.ids[0]), [{modifyRoll:{roll:'charge', value:-2}}], {sourceAbilityId: stratagem.id, sourceUnitId: t.ids[1], scope:{who:'self'}, duration:'untilEndOfPhase', when:null})` + `AbilityTriggered`. |
| Glimpse of Eternity (THO-6.1) | (b)+(c) | (b) `glimpseOfEternity` — ability on Ahrak `{trigger:'always', code:'glimpseOfEternity'}`, hook with the new optional member `fixRoll(state, entry, roll)` (C4): returns `{value:6, usedKey:'ths:glimpse:<bearerModelId>'}` when `secondaryState['ths:glimpse:<modelId>'] !== '<round>:<activePlayer>'` and the roll is Ahrak's: `purpose` hit/wound/damage with `roll.unitId` = his unit (his unit has one model), or `purpose:'save'` with `roll.unitId` = his unit; else `null`. (c) C4 offers and applies the change. |
| Implacable Guardians (THO-6.2) | (a) | `{trigger:'woundRoll', scope:{who:'attacker'}, when:{strengthVsToughness:'gt', unitHasModel:'sorcerer'}, effect:{modifyRoll:{roll:'wound', value:-1}}}` (defender-side: scope 'attacker' means attacks whose target is this unit; same shape as Gene-wrought Resilience; ±1 cap applies). |
| Relic Hunters (THO-6.3) | (b) | ability `{trigger:'commandPhase', code:'relicHunters'}` on Tzaangors; marker hook (`gate: () => false`); executed inside `cabalOfSorcerers` at `command.end`: for each objective `o` with `ctx.services.objectives.controller(s, o) === player` and ≥1 board model of a `relicHunters` unit of that player in `modelsInRange(s, o, player)`: roll D6 (`purpose:'ability'`), 4+ → +1. One die per marker. |
| Deep Strike (Scarabs) / Lone Operative | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]`; Lone Operative from the enhancements via `grantsCoreAbility` (shooting already reads `hookService.hasCoreAbility`). |
| Invulnerable saves (5+ / 4+ / 6+) | (a) | datasheet `invuln` |
| Per-model PSYKER on the Sorcerer | (a) | composition `{modelId:'sorcerer', keywords:['PSYKER'], champion:true}` |
| Weapon abilities (Pistol, Psychic, Torrent, Hazardous, Rapid Fire 2, Devastating Wounds, Anti-INFANTRY 4+) | (a) | `PISTOL`, `PSYCHIC`, `TORRENT` (skill null), `HAZARDOUS`, `RAPID_FIRE` 2, `DEVASTATING_WOUNDS`, `ANTI {keyword:'INFANTRY', value:4}`; Screamer Invocation as one `profileGroup` (`ths.screamer-invocation`) |
| BATTLELINE (Tzaangors) | (a) | keyword — feeds CP-2.4 secured objectives |

### 7.1 Engine changes (c) — exact signatures

All in non-frozen files. Built by the engine agent; the (b) hooks code against these signatures.

**C1 — hook-granted Deep Strike counts for Reserves.** `src/engine/setup.ts`:
```ts
// datasheet DEEP_STRIKE, a Tellyporta pairing, or a code hook's grantsCoreAbility (enhancement-granted, e.g. Temporal Sorceries)
export function unitCanDeepStrike(state: GameState, unit: Unit): boolean
//   = ds.coreAbilities DEEP_STRIKE || unit.deepStrikeWith !== null || hookService.hasCoreAbility(state, unit.id, 'DEEP_STRIKE')
```
Replace the three inline checks with it: `setup.ts canDeepStrike`, `state.ts` createGame Reserves validation (move that
validation after enhancement abilities are attached to `state.abilities`, so the hook source exists), and
`code-hooks.ts` Rapid Ingress (`const deepStrike = …`). Reserves arrival (>9" from enemies) unchanged.

**C2 — `oneDie` re-roll on saves.** `src/engine/attack.ts`, both the per-attack save (`doSave…`, the `rollOnce('save:…')`
path) and `doSaveBatch`: after the roll and its Command Re-roll window, before evaluation, collect `onSaveRoll` results
with `reroll === 'oneDie'` (source ids via `collectSaveMods`' source, as `evalD6Die` does for hit/wound). If at least one
die fails its save and a source id `src` has no phase mark `oneDie:<src>:save:<defenderPlayer>`, raise once per roll
(`ctx.once('oneDieSaveDone:<key>')`, add the prefix to `SEQUENCE_SCOPED_MARK_PREFIXES`):
```ts
ctx.decide({ kind: 'chooseOption', player: defender, window: 'any.rollMade', canPass: false,
  context: { topic: 'rerollOffer', unitId: defendingUnitId, abilityId: src,
    data: { rollId, dieIndexes: failedIndexes, maxDice: 1, needed, purpose: 'save', key, oneDieMark: `oneDie:${src}:save:${defender}` } },
  options: [ reroll (dieIndexes:[i]) , keep ] })
```
On `reroll`: `ctx.reroll(roll, [i], src)` (emits `DiceRerolled`), push `oneDie:<src>:save:<defenderPlayer>` (phase-scoped — **not** in the
sequence-scoped list, so it lasts the whole phase), re-evaluate that die. `src` = `EffectSource.id` = the ability id
(`ths.a.weaver-of-fates`), so every holder of a given player shares one mark = once per phase per player (the mark is keyed by the defending player, so in a mirror match each player gets their own re-roll). Fast-rolled batches keep
batching; the offer lists the failed dice and takes one. Fragile invulnerable saves are never offered (not re-rollable).

**C3 — one-shot phase cost override (Echoes from the Warp).** `src/engine/stratagems.ts`:
```ts
export interface PhaseCostOverride { player: PlayerId; unitId: UnitId; cost: number; ignoreLimit: boolean; source: string }
// phase mark `costOverride:<json PhaseCostOverride>` (unitId canonical); cleared with phaseState.marks at phase end
export function grantPhaseCostOverride(state: GameState, o: PhaseCostOverride): void
export function phaseCostOverrides(state: GameState, player: PlayerId, unitId: UnitId): PhaseCostOverride[]
```
`costOverridesFor` also pushes `{cost, ignoreLimit}` for every phase override whose `unitId` is the canonical id of a
target (any stratagem, any half). When `useStratagem` resolves and the paid cost / waived limit came from a phase
override, remove that mark (first matching) — one Stratagem per Ritual. Emits nothing new (`StratagemUsed` already
carries the cost paid).

**C4 — fix-a-die-to-6 offer (Glimpse of Eternity).** New `src/engine/fix-roll.ts`; `EngineCodeHook` (code-hooks.ts)
gains an optional member:
```ts
// code-hooks.ts, EngineCodeHook
fixRoll?(state: GameState, entry: HookSourceEntry, roll: DiceRoll): { value: number; usedKey: string } | null
// fix-roll.ts
export const FIX_ROLL_TOPIC = 'fixRollOffer'
export interface FixRollOffer { sourceAbilityId: string; value: number; usedKey: string }
export function fixRollOffers(state: GameState, roll: DiceRoll): FixRollOffer[]           // every live source whose hook.fixRoll returns non-null
// re-entrant like miracleGate: 'pending' while the decision is open; the (possibly changed) roll when done
export function fixRollGate(ctx: EngineContext, key: string, roll: DiceRoll, indexes: number[]): 'pending' | DiceRoll
export function applyFixRoll(ctx: EngineContext, roll: DiceRoll, index: number, offer: FixRollOffer): DiceRoll
export const fixRollHandler: DecisionHandler                                               // registered for topic 'fixRollOffer'
```
`fixRollGate` raises `chooseOption` (player = roll.player, window `any.rollMade`, `context.topic:'fixRollOffer'`,
`data:{rollId, purpose, dieIndexes, value, key}`), options `fix:<i>` for each offered index whose die is not already the
value, plus `keep`; mark `fixRoll:<key>=<i|keep>` (add `fixRoll:` to `SEQUENCE_SCOPED_MARK_PREFIXES`). `applyFixRoll`
sets `dice[i] = value` (for `sides: 3` → 3), recomputes `final[i]`, adds `i` to `rerolled` (no further re-roll),
emits `DiceRerolled {source: sourceAbilityId, before, after, indexes:[i]}`, and stores
`players[roll.player].secondaryState[usedKey] = '<round>:<activePlayer>'`. Call sites in `attack.ts`: `rollBatchD6`
(after `ctx.rollOnce(key, spec)` returns, before the final `evalD6Die` map — all dice offered), the single save and
`doSaveBatch` (after C2), and the damage roll (`purpose:'damage'`, sum mode: the single die). Not offered on Hazardous,
Deadly Demise, charge, Battle-shock or attack-count rolls. AI policy: fix the first failing die; on a damage roll fix
when the result is below the maximum; otherwise keep.

**C5 — Psychic kill attribution.** `src/engine/attack.ts`:
```ts
export interface DestroyedBy { player: PlayerId | null; unitId: UnitId | null; modelId: ModelId | null; kind: AttackKind | 'mortal' | 'other'; psychic?: boolean }
// true iff `player` destroyed ≥1 enemy model with a Psychic attack in the current round/turn/phase
export function psychicKillThisPhase(state: GameState, player: PlayerId): boolean
```
Every `destroyModel` call made while resolving an attack sets `psychic: weapon has PSYCHIC` (including that attack's
Devastating Wounds mortal wounds and its spill-over); `queueMortalWounds` callers with a Psychic-tagged source pass it
through `by`. In `announceDestroyed`, when `by.player && by.psychic` and the victim belongs to the other player, set
`players[by.player].secondaryState.psychicKillStamp = '<round>:<activePlayer>:<phase>'`; `psychicKillThisPhase`
compares the stamp to now (stale stamps are ignored, so no reset is needed). Own Hazardous losses never set it.

Totals: **8 new code hooks** (`cabalOfSorcerers`, `cabalRituals`, `weaverOfFates`, `temporalSorceries`,
`archDiabolist`, `relicHunters`, `glimpseOfEternity`, `malignEntanglement`) + **2 mission hooks**
(`sorcerousRitual`, `bringerOfChange`); **5 engine changes** (C1–C5), none touching a frozen contract (no
`00-architecture.md` edit; 20-data-schema gets: save `oneDie` honoured, the `fixRoll` hook member, `psychic` on
DestroyedBy). Mutant Cunning reuses `livesBeforeTerritory`; Wreathed in Warpflame and Implacable Guardians are pure data.

## 8. Test IDs

Same list as the `THO` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| THO-001 | THO-1 | patrol `ths.cp.the-coven-temporus` loads (faction `thousand-sons`): 4 units, 26 models (1 + 5 + 10 + 10); Ahrak is WARLORD with Temporal Sorceries; default secondary Sorcerous Ritual; the three `ths.s.*` stratagems; no leader attachment offered |
| THO-002 | THO-6 | data: every stat/weapon row of §6 matches; invulns 5+/4+/6+; only the Sorcerer model has PSYKER; Screamer Invocation is one profile group with skill null + TORRENT |
| THO-003 | THO-2.1 | end of own Command phase with Ahrak and the Sorcerer on the board, none Battle-shocked, no marker held → pool = 3 + Temporal Sorceries D3 |
| THO-004 | THO-2.1 | Scarab unit Battle-shocked → Sorcerer adds 0; Sorcerer dead → 0; Ahrak in Reserves → neither his 2 nor the D3 |
| THO-005 | THO-2.2 | pool 4 left at the end of the opponent's turn → reset to 0 at the start of own Command phase before any Ritual offer; unchanged during the opponent's turn |
| THO-006 | THO-2.3 | start of the opponent's Shooting phase with pool 2 → Ritual offer lists Weaver (per PSYKER) and done, not Echoes; pool 1 → no offer |
| THO-007 | THO-2.3 | Weaver used at `shooting.start` → not offered again that phase; offered again at `charge.start`; pool reduced by 2 |
| THO-008 | THO-2.4 | Weaver active, Tzaangors 17" from Ahrak fail a save → re-roll offered; used → no second Weaver re-roll this phase; Tzaangors 19" away → no offer; with the Sorcerer chosen, range is measured from the Sorcerer model, not the closest Terminator of its unit; in a Thousand Sons mirror match each player gets their own once-per-phase re-roll |
| THO-009 | THO-2.4, C2 | Weaver re-roll in a fast-rolled save batch: offer lists the failed dice, one re-rolled, `DiceRerolled` with source `ths.a.weaver-of-fates`; the re-rolled save cannot take a Command Re-roll |
| THO-010 | THO-2.4 | Weaver does not apply to an enemy unit's saves, nor to a Thousand Sons unit when the chosen PSYKER is no longer on the board |
| THO-011 | THO-2.5, C3 | Echoes (pool 6) on Ahrak's unit, then Epic Challenge on Ahrak → 0 CP; a second stratagem on Ahrak the same phase costs normal CP |
| THO-012 | THO-2.5, C3 | Echoes on the Scarab unit after Malign Entanglement was already used this phase on another unit → Malign Entanglement on the Scarabs allowed for 0 CP; override expires at phase end unused |
| THO-013 | THO-3.1 | Temporal Sorceries: Ahrak may be set in Reserves (Deep Strike, C1) and arrives >9" from enemies from round 2; Rapid Ingress is offered for him |
| THO-014 | THO-3.1 | Lone Operative: enemy model 13" from Ahrak cannot target him with a ranged attack; at 11" it can |
| THO-015 | THO-3.2 | Arch-Diabolist: Ahrak in Engagement Range may fire Screamer Invocation at the engaged enemy (Pistol); he still has Deep Strike and Lone Operative; no D3 Cabal points at Command end |
| THO-016 | THO-4.1 | Sorcerous Ritual: round 2, end of opponent's Fight phase, Ahrak on a controlled marker outside own DZ, pool 2, D6 = 3 → 3+2 = 5 → +3 VP; D6 = 2 → 0 |
| THO-017 | THO-4.1 | Sorcerous Ritual: bonus capped at +3 (pool 5, D6 = 1 → 4 → 0 VP); round 1 → no roll; marker inside own DZ → no roll; end of own Fight phase → no roll |
| THO-018 | THO-4.1 | Sorcerous Ritual: only a Terminator (not the Sorcerer) on the marker → no roll; the Sorcerer on it → roll |
| THO-019 | THO-4.2 | Bringer of Change: Warpsmite kills an enemy model in own Shooting → D3 VP at phase end; a soulreaper kill only → 0 |
| THO-020 | THO-4.2, C5 | Bringer of Change: a Warpsmite Devastating Wounds mortal kill counts; force weapon kill in the opponent's Fight phase counts; Ahrak dying to his own Hazardous never counts; total capped at 12 |
| THO-021 | THO-5.1 | Wreathed in Warpflame: Scarabs' khopesh critical hit auto-wounds (Lethal Hits); vs a VEHICLE an unmodified 5 to hit is a critical hit; vs INFANTRY a 5 is not; not offered for Tzaangors or a unit that already fought |
| THO-022 | THO-5.2 | Mutant Cunning: opponent targets Tzaangors with shooting → offered; used → D6" Normal move (not into Engagement Range) then the unit has cover vs ranged attacks to phase end; not offered for Scarabs or an engaged Tzaangors unit |
| THO-023 | THO-5.3 | Malign Entanglement: enemy declares a charge at the Scarabs → offered; used → charge roll 2D6 = 9 counts as 7; not offered for a unit that is not a charge target; expires at phase end |
| THO-024 | THO-6.1, C4 | Glimpse: Ahrak's force weapon wound roll of 2 → fix to 6 offered → critical wound; a second fix the same turn is not offered; offered again in the next turn |
| THO-025 | THO-6.1, C4 | Glimpse on a save: AP −2 attack allocated to Ahrak, save die 1 → fixed to 6 → saved; on a D3 force weapon damage roll → becomes 3; the fixed die cannot be re-rolled |
| THO-026 | THO-6.1 | Glimpse is never offered for Scarab or Tzaangor rolls, nor on Hazardous, charge or Battle-shock rolls; Screamer Invocation (Torrent) has no hit roll to fix |
| THO-027 | THO-6.2 | Implacable Guardians: S6 attack vs Scarabs (T5) → −1 to wound; S5 → no change; Sorcerer destroyed → no modifier; with another −1 the ±1 cap holds |
| THO-028 | THO-6.3 | Relic Hunters: own Command end, Tzaangors on 2 controlled markers → 2 D6, each 4+ = +1 Cabal; both Tzaangors units on one marker → 1 die; marker not controlled → no die |
| THO-029 | THO-6 | weapons: Warpsmite Anti-INFANTRY 4+ crit wound on 4 + Devastating Wounds mortal; Screamer focused profile 2D6 auto-hits and takes a Hazardous test; inferno combi-bolter Rapid Fire 2 at half range → 4 shots; soulreaper Devastating Wounds |
| THO-030 | THO-6 | Scarabs Deep Strike from round 2 >9" from enemies; the Sorcerer picks force weapon or khopesh per fight, never both |
| THO-031 | THO-2.3 | AI: Ritual AI keeps points (`done`) at its own movement start and spends Weaver at the opponent's shooting start when a Thousand Sons unit is likely targeted; a full AI-vs-AI game with this patrol finishes without a stuck decision |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3); bases are rules-true. All designs original; no legion icons.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `ahrak-the-time-weaver` | `ths.ahrak-the-time-weaver/ahrak` | 1 | 1.25 | 40 mm | A chibi armoured sorcerer in lapis-blue plate with ornate gold trim, a tall crested helm with a cobra-hood shape and glowing cyan eye slits, a flowing parchment-coloured robe, an hourglass charm at the belt, a short pistol in one hand and a glowing staff-blade in the other with swirling cyan warp ribbons. |
| `scarab-occult-sorcerer` | `ths.scarab-occult-terminators/sorcerer` | 1 | 1.35 | 40 mm | A chibi bulky terminator-armoured sorcerer in lapis blue and gold with a high fan-shaped crest and a draped parchment tabard, a curved sickle-sword at the hip, one gauntlet crackling with cyan flame and a tall staff-blade in the other. |
| `scarab-occult-combi` | `ths.scarab-occult-terminators/combi` | 2 | 1.3 | 40 mm | A chibi hulking terminator in lapis-blue armour edged in gold, a tall plumed helm with a narrow cyan visor, a twin-barrel wrist gun on one arm and a curved khopesh sword in the other hand. |
| `scarab-occult-soulreaper` | `ths.scarab-occult-terminators/soulreaper` | 1 | 1.3 | 40 mm | Same chibi lapis-and-gold terminator bracing a chunky rotary multi-barrel cannon with glowing cyan barrel tips, khopesh slung at the hip. |
| `scarab-occult-hellfyre` | `ths.scarab-occult-terminators/hellfyre` | 1 | 1.3 | 40 mm | Same chibi lapis-and-gold terminator with a boxy shoulder-mounted missile pod of four tubes, a twin-barrel wrist gun and a curved khopesh. |
| `tzaangor` | `ths.tzaangors/tzaangor` | 20 | 1.2 | 32 mm | A chibi bird-headed beastman with a curved beak, swept-back horns and pale blue-violet skin, a gold-trimmed blue loincloth and leather harness, a small pistol in one hand and a chunky chain-blade in the other, standing on digitigrade legs. |

## 10. Other Thousand Sons patrols (appendix)

- None. The Combat Patrol navigation (accessed 2026-10-16) lists only "The Coven Temporus" under Thousand Sons.
