# Patrol spec — Adeptus Custodes: Tristraen's Gilded Blades

Own-words data spec for the **second** Adeptus Custodes Combat Patrol, same shape as 11-combat-patrol §4. The faction is
already playable through Guardians of the Throne (`docs/spec/factions/adeptus-custodes.md`, rule ids `CUS-*`); this file
covers **only** this patrol. Anything identical to the existing spec is cited by its data id / rule id, not restated.
Rule ids here are `TRI-<section>.<n>`, test ids `TRI-0nn` (12-rules-test-checklist, section "TRI"). Data ids keep the
faction prefix `cus.`; ids that would collide with a Guardians of the Throne rule of the same name but different
mechanics carry a `tgb` marker (`cus.s.tgb-*`, `cus.a.martial-katah-tgb`, `cus.custodian-guard-tgb`).
Mechanics are 1:1 with the source; every sentence of prose is ours.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Adeptus Custodes box "Tristraen's Gilded Blades" (this patrol) | https://wahapedia.ru/wh40k10ed_cp/factions/tristraen-s-gilded-blades/ | Index, 10th ed, April 2024 (GW PDF April 2024); datasheets are Combat-Patrol-only |
| Existing patrol (cited, not re-fetched) | https://wahapedia.ru/wh40k10ed_cp/factions/guardians-of-the-throne/ via `docs/spec/factions/adeptus-custodes.md` §0 | Index, June 2023 |

The CP navigation lists exactly two Adeptus Custodes patrols (enumerated 2026-10-05 in `adeptus-custodes.md` §0); the
other one is in §10.

## 1. Roster

Patrol id `cus.cp.tristraen-s-gilded-blades`. A battle uses **3 units**: Tristraen, the Custodian Guard, and **either**
the Custodian Wardens **or** the Allarus Custodians (chosen at setup). Warden build: 7 models; Allarus build: 6 models.
Faction keyword ADEPTUS CUSTODES on every datasheet.

| Ref | Unit (datasheet id) | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `tristraen` | Tristraen (`cus.tristraen`, new) | 1 | vaultswords (3 melee profiles, one `profileGroup`) | **WARLORD**, default enhancement Watchman of Terra. No Leader ability, never attached |
| `guard` | Custodian Guard (`cus.custodian-guard-tgb`, new — differs from `cus.custodian-guard`) | 3 | each: sentinel blade (ranged + melee) + praesidium shield | always fielded |
| `wardens` | Custodian Wardens (`cus.custodian-wardens`, new) | 3 | 1× castellan axe (ranged + melee); 2× guardian spear (ranged + melee) | choice group `retinue` (default) |
| `allarus` | Allarus Custodians (`cus.allarus-custodians`, new) | 2 | each: balistus grenade launcher + guardian spear (ranged + melee) | choice group `retinue` (alternative) |

| Id | Rule |
|---|---|
| TRI-1.1 | Unit choice: exactly one of `wardens` / `allarus` is in the army; the other is never created. Default `wardens` (the page offers no default; we pick the larger unit). |
| TRI-1.2 | Tristraen is always the WARLORD. He has no Leader ability and no bodyguard: he always operates as his own unit. |
| TRI-1.3 | No unit has Deep Strike, Leader, BATTLELINE or a Patrol Squads ability on this patrol's pages. |
| TRI-1.4 | Every Guard model carries a praesidium shield: all three start at 4 W. |

## 2. Faction ability — Martial Ka'tah, per-activation form (all four datasheets)

This patrol prints Martial Ka'tah with a **different timing** from Guardians of the Throne (CUS-2.1 picks once for the
whole army at the start of the Fight phase). It is encoded as a patrol-scoped ability `cus.a.martial-katah-tgb` carried
only by this patrol's datasheets; `faction.json` `armyRule` and `cus.a.martial-katah` stay untouched.

| Id | Rule |
|---|---|
| TRI-2.1 | Each time a unit with this ability is selected to fight, its player picks one stance for that unit (mandatory). It lasts until the unit has finished its attacks for that activation (encoded: until the end of the phase — a unit is selected to fight at most once per phase). |
| TRI-2.2 | Dacatarai: every melee weapon of the unit's models gains [SUSTAINED HITS 1]. |
| TRI-2.3 | Rendax: every melee weapon of the unit's models gains [LETHAL HITS]. |
| TRI-2.4 | Ranged weapons are never affected. Each unit picks independently; one unit's stance never touches another unit. Works in both players' Fight phases. |
| TRI-2.5 | The army-wide CUS-2.1 pick is never offered to a player whose units only carry `cus.a.martial-katah-tgb`. |

## 3. Enhancements (Tristraen, WARLORD)

| Id | Name | Default? | Effect |
|---|---|---|---|
| TRI-3.1 | Watchman of Terra (`cus.e.watchman-of-terra`) | default | While the bearer is within Engagement Range of at least one enemy unit, the bearer's OC is 4 (set, not added). Battle-shocked still means OC 0 (engine skips shocked units when counting control). |
| TRI-3.2 | Warrior Exemplar (`cus.e.warrior-exemplar`) | optional | Each time the bearer destroys an enemy unit (the bearer model made the attack / caused the mortal wounds that destroyed its last model), roll one D6: on 3+ its player gains 1 CP. No per-turn limit printed; the core R-4.2 cap on extra CP per battle round still applies. |

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| TRI-4.1 | Raise the Vexillas (`cus.sec.raise-the-vexillas`) | default | From battle round 3 on, at the end of the player's **own** turn: 3 VP if the player controls **both** the objective marker closest to the opponent's battlefield edge **and** the one closest to the player's own battlefield edge. Flat 3 VP per qualifying turn end; no battle cap printed. |
| TRI-4.2 | Consecrated Ground (`cus.sec.consecrated-ground`) | optional | Any time, either turn, rounds 1–5: +3 VP each time an enemy unit is destroyed (any cause). −1 VP each time an ADEPTUS CUSTODES model of the player's army is destroyed; this secondary's running total never goes below 0. |

TRI-4.1 notes: "battlefield edge" = the long table edge behind the player's deployment zone (`playerBattlefieldEdge`).
Closest = smallest distance from the marker centre to that edge line among non-removed markers. **[interp]** On a tie
for closest, controlling any one of the tied markers satisfies that half. If one marker is closest to both edges, it
satisfies both halves.
TRI-4.2 notes: **[interp]** the "minimum of 0" floor applies to the VP this secondary has earned
(`vpBySource[rule.id]`), not to the player's whole score. **[interp]** An attached enemy unit destroyed counts once per
original unit (leader and bodyguard each fire `unitDestroyed`), and an enemy unit culled from Reserves at the end of
round 3 counts (it "counts as destroyed").

## 5. Patrol stratagems

All three share names with Guardians of the Throne stratagems but have **different mechanics**, so they get new ids.

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| TRI-5.1 | The Gilded Spear (`cus.s.tgb-gilded-spear`, Battle Tactic) | 1 | Fight phase, either player's turn, before the next unit is picked to fight (`fight.start`, `fight.attacksResolved`) | one own ADEPTUS CUSTODES unit not yet selected to fight this phase | until the end of the phase the unit's Pile-in moves are up to 6" instead of 3" (Consolidation unchanged) |
| TRI-5.2 | Inescapable Vengeance (`cus.s.tgb-inescapable-vengeance`, Strategic Ploy) | 1 | own Movement phase, before a unit is picked to move (`movement.start`, `movement.unitMoved`) | one own ADEPTUS CUSTODES unit not yet selected to move this phase | until the end of the phase +2 to the unit's Advance rolls |
| TRI-5.3 | Overawing Magnificence (`cus.s.tgb-overawing-magnificence`, Battle Tactic) | 1 | opponent's Charge phase, just after an enemy unit declares a charge (`charge.declared`) | one own ADEPTUS CUSTODES unit that is a target of that charge | the charging unit takes a Leadership test (2D6 ≥ its Ld); on a fail, −2 to its Charge rolls until the end of the phase |

Core stratagems per datasheet: Tristraen lists Epic Challenge and not Fire Overwatch (he has no ranged weapon, so
Fire Overwatch could never be used anyway); the other three list Fire Overwatch and not Epic Challenge. Both match the
engine's core eligibility rules; nothing patrol-specific.

## 6. Datasheets

All bases 40 mm round. Faction keyword (all): ADEPTUS CUSTODES. Every datasheet: invulnerable save 4+, ability
`cus.a.martial-katah-tgb`, no core abilities.

| Unit (id) | Models | M | T | Sv | Inv | W | Ld | OC | Keywords | Abilities |
|---|---|---|---|---|---|---|---|---|---|---|
| Tristraen (`cus.tristraen`) | 1 | 6 | 6 | 2+ | 4+ | 6 | 6+ | 2 | INFANTRY, CHARACTER, IMPERIUM, BLADE CHAMPION, TRISTRAEN | Martial Ka'tah (TRI-2) |
| Custodian Guard (`cus.custodian-guard-tgb`) | 3 | 6 | 6 | 2+ | 4+ | 3 (4 with praesidium shield → all 4) | 6+ | 2 | INFANTRY, IMPERIUM, CUSTODIAN GUARD | Martial Ka'tah; Praesidium Shield (`cus.a.praesidium-shield`, CUS-6.1) |
| Custodian Wardens (`cus.custodian-wardens`) | 3 | 6 | 6 | 2+ | 4+ | 3 | 6+ | 2 | INFANTRY, IMPERIUM, CUSTODIAN WARDENS | Martial Ka'tah |
| Allarus Custodians (`cus.allarus-custodians`) | 2 | 5 | 7 | 2+ | 4+ | 4 | 6+ | 2 | INFANTRY, TERMINATOR, IMPERIUM, ALLARUS CUSTODIANS | Martial Ka'tah |

Differences of `cus.custodian-guard-tgb` from `cus.custodian-guard` (why it is a new datasheet): 3 models instead of 4;
no BATTLELINE keyword; no Deep Strike; no Stand Vigil (CUS-6.2); single loadout (sentinel blade + shield on every
model, no spear / vexilla models); not a Leader target of anything.

| Id | Rule |
|---|---|
| TRI-6.1 | Vaultswords: three melee profiles in one `profileGroup` (`cus.w.vaultswords`); each time Tristraen fights he uses exactly one of them for all his attacks (core multi-profile rule). |
| TRI-6.2 | Praesidium Shield on the Guard: identical to CUS-6.1 (`cus.a.praesidium-shield`, `statsOverride:{W:4}`) on every Guard model. |
| TRI-6.3 | Balistus grenade launcher [BLAST]: D6 attacks, +1 attack per 5 models in the target unit; never against a unit within Engagement Range of a friendly unit (core Blast). |

Wargear per model:
| Unit | Model key | Ranged | Melee |
|---|---|---|---|
| Tristraen | `champion` | — | vaultswords — Behemor / Hurricanus / Victus |
| Custodian Guard | `guard` ×3 | `cus.w.sentinel-blade-ranged` (reused) | `cus.w.sentinel-blade-guard` (reused) |
| Custodian Wardens | `axe` ×1 | castellan axe (ranged) | castellan axe |
| Custodian Wardens | `spear` ×2 | `cus.w.guardian-spear-ranged` (reused) | `cus.w.guardian-spear-melee` (reused) |
| Allarus Custodians | `allarus` ×2 | balistus grenade launcher + `cus.w.guardian-spear-ranged` (reused) | `cus.w.guardian-spear-melee` (reused) |

Reused weapon profiles (values identical on this patrol's page — verified 2026-10-15): sentinel blade ranged 12" A2 2+
S4 AP−1 D2 Assault, Pistol; sentinel blade (Guard) melee A5 2+ S6 AP−2 D1; guardian spear ranged 24" A2 2+ S4 AP−1 D2
Assault; guardian spear melee A5 2+ S7 AP−2 D2.

New weapon profiles:
| Weapon (id) | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| vaultswords — Behemor (`cus.w.vaultswords-behemor`) | melee | 6 | 2+ | 7 | −2 | 2 | Precision |
| vaultswords — Hurricanus (`cus.w.vaultswords-hurricanus`) | melee | 9 | 2+ | 5 | −1 | 1 | Sustained Hits 1 |
| vaultswords — Victus (`cus.w.vaultswords-victus`) | melee | 5 | 2+ | 6 | −3 | 3 | Devastating Wounds |
| castellan axe (ranged) (`cus.w.castellan-axe-ranged`) | 24" | 2 | 2+ | 4 | −1 | 2 | Assault |
| castellan axe (`cus.w.castellan-axe-melee`) | melee | 4 | 2+ | 9 | −1 | 3 | — |
| balistus grenade launcher (`cus.w.balistus-grenade-launcher`) | 18" | D6 | 2+ | 4 | −1 | 1 | Blast |

Stacking note: Hurricanus already has Sustained Hits 1; Dacatarai adds nothing extra to it (same ability, no stacking).
Rendax on Hurricanus gives Lethal Hits + Sustained Hits 1.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§8/§9); (b) = new code hook (bodies appended to
`src/engine/factions/adeptus-custodes.ts`, added to the `adeptusCustodesHooks` export, so `code-hooks.ts` needs no new
spread); (c) = engine change beyond a code hook (signatures in §7.1). Reused mechanisms are named.

| Rule | Enc. | Encoding |
|---|---|---|
| Unit choice Wardens / Allarus (TRI-1.1) | (a) existing | patrol `unitChoices:[{id:'retinue', refs:['wardens','allarus'], default:'wardens'}]` (GK / CUS mechanism). |
| Tristraen WARLORD, unattached (TRI-1.2) | (a) | patrol `warlord:'tristraen'`; datasheet has no `leader`, no `coreAbilities`. |
| Guard shields (TRI-1.4, 6.2) | (a) | composition `{modelId:'guard', min:3, max:3, default:3, statsOverride:{W:4}}`; abilities `['cus.a.martial-katah-tgb','cus.a.praesidium-shield']`. |
| Martial Ka'tah per activation (TRI-2.1–2.5) | (b) | `katahOnSelect` — ability `cus.a.martial-katah-tgb` = `{id, name:"Martial Ka'tah", trigger:'unitSelectedToFight', code:'katahOnSelect'}` on all four datasheets. Hook `{name:'katahOnSelect', kind:'ability', hook:'onUnitSelectedToFight', run:noop, pick:{window:'fight.unitSelected', topic:'abilityChoice', offer:katahSelectOffer, handle:katahSelectHandle}}` (pattern of CSM `darkPact`). `offer(ctx, window, key)`: `s.phase==='fight'`; `canon = canonicalUnitId(s, key)`; some board half of `canon` carries an ability with code `katahOnSelect`; mark `pick:katahSel:<canon>:<round>:<activePlayer>` not yet in `phaseState.marks` (push it); `ctx.decide({kind:'chooseOption', player: owner, window, canPass:false, context:{topic:'abilityChoice', unitId:canon, abilityId, data:{window,key,code:'katahOnSelect'}}, options:[dacatarai, rendax]})`. `handle`: `effects.grant(ctx, canon, [{when:{weaponType:'melee'}, grantWeaponAbility: dacatarai ? {ability:'SUSTAINED_HITS', value:1} : {ability:'LETHAL_HITS'}}], {sourceAbilityId: abilityId, sourceUnitId: canon, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`; emit `AbilityTriggered` naming the stance. The existing `martialKatahPick` only looks for code `martialKatahPick`, so TRI-2.5 needs no change. |
| Watchman of Terra (TRI-3.1) | (a)+(b) | enhancement `{trigger:'always', code:'watchmanOfTerra', effect:{setStat:{stat:'OC', value:4}}, scope:{who:'bearer'}}`; gate-only hook `watchmanOfTerra = {kind:'ability', hook:'onStatQuery', run:noop, gate:(state, holder) => leaderService.inEngagementWithEnemy(state, holder.id)}` (gates are honoured by `matchEffects`, as `standVigil` / `deadArdFeelNoPain`). |
| Warrior Exemplar (TRI-3.2) | (a)+(b) | enhancement `{trigger:'unitDestroyed', code:'warriorExemplar', scope:{who:'bearer'}, params:{threshold:3, cp:1}}`; hook `warriorExemplar = {kind:'ability', hook:'onUnitDestroyed', run:noop, runAt}`: `runAt(ctx, entry, d)` fires when `d.byModelId === entry.bearerModelId` and `state.units[d.destroyedUnitId].player !== holder.player`; rolls 1 D6 (`purpose:'ability'`), on ≥ threshold `hookService.gainCp(ctx, holder.player, cp, entry.source.id)` (R-4.2 cap inside gainCp); emits `AbilityTriggered` with the roll. Reuses the GK/T'au `gainCp` path. |
| Raise the Vexillas (TRI-4.1) | (a)+(c) E1 | secondary `scoring:[{id:'raise-the-vexillas', when:'turn.end', rounds:{from:3,to:5}, who:'active', rule:'custom', code:'raiseTheVexillas', pointsPer:3, cap:999}]`; registry `raiseTheVexillas: missionHook('raiseTheVexillas','onTurnEnd')`. Body `vexillaObjectiveIds(state, pid)` in `factions/adeptus-custodes.ts` (uses `playerBattlefieldEdge` + `deploymentZone` like GK); E1 adds `case 'raiseTheVexillas'` to `customAmount` that needs `holds(ctx, id, pid)` for ≥1 id of each list. |
| Consecrated Ground (TRI-4.2) | (a)+(c) E1 | secondary `scoring:[{id:'consecrated-ground-tgb', when:'battle.end', rounds:{from:1,to:5}, who:'both', rule:'custom', code:'tgbConsecratedGround', pointsPer:3, cap:999, params:{lossPerModel:1, keyword:'ADEPTUS CUSTODES'}}]` — the `when` window is never the scoring moment; scoring happens in the destroy fan-outs (pattern of Hallowed Retribution / Treasures of Aeons, whose rules are also event-driven). `customAmount` case returns 0. Registry `tgbConsecratedGround: missionHook('tgbConsecratedGround','onUnitDestroyed')` (distinct from Sororitas `consecratedGround`). Pure amount bodies `tgbConsecratedGroundGain` / `tgbConsecratedGroundLoss` in `factions/adeptus-custodes.ts`; E1 adds the fan-outs `tgbConsecratedGroundUnitDestroyed` / `tgbConsecratedGroundModelDestroyed` in `missions.ts` (wired into `unitDestroyedHook` / `modelDestroyed`) and `deductVp`. |
| The Gilded Spear (TRI-5.1) | (a) reuse | stratagem `cost:1`, `category:'battleTactic'`, `phases:['fight']`, `window:['fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{phase:'fight'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS CUSTODES'}, state:'notYetFought', count:1}]`, `code:'getStuckInDistance'`, `params:{pileIn:6, pileInOnly:true}`, `duration:'untilEndOfPhase'` — the Ork Get Stuck In hook; `pileInOnly` keeps Consolidation at 3". |
| Inescapable Vengeance (TRI-5.2) | (a) | `cost:1`, `category:'strategicPloy'`, `window:['movement.start','movement.unitMoved']`, `who:'active'`, `condition:{phase:'movement', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS CUSTODES'}, state:'notYetActivated', count:1}]` (in the Movement phase `phaseState.activated` holds the units already selected to move), `effect:{modifyRoll:{roll:'advance', value:2}}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'` — read by `advanceRollFor`. |
| Overawing Magnificence (TRI-5.3) | (a)+(b) | stratagem `cost:1`, `window:'charge.declared'`, `who:'reactive'`, `condition:{phase:'charge', ownTurn:false}`, `targets:[{role:'unit', owner:'enemy', count:1}, {role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS CUSTODES'}, count:1}]`, no `effect`, `code:'tgbOverawing'` (target shape of T'au `laserMarkedTargets`). Hook `tgbOverawing` (kind stratagem, hook `onCharge`): `check` = t.ids[0] on board, `sameUnit(state, t.ids[0], env.trigger.unitId)`; t.ids[1] own board unit and some id in `phaseState.charge.targetUnitIds` is `sameUnit` with it. `apply` = `passed = hookService.leadershipTest(ctx, canon(t.ids[0]), stratagem.id)`; if `!passed` → `effects.grant(ctx, canon(t.ids[0]), [{modifyRoll:{roll:'charge', value:-2}}], {sourceAbilityId: stratagem.id, sourceUnitId:null, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`. |
| Vaultswords (TRI-6.1) | (a) | three weapons with `profileGroup:'cus.w.vaultswords'` (engine's multi-profile selection, as `am.w.plasma-pistol`); abilities `PRECISION` / `SUSTAINED_HITS 1` / `DEVASTATING_WOUNDS`. |
| Blast (TRI-6.3) / Assault / Pistol | (a) | weapon abilities `BLAST`, `ASSAULT`, `PISTOL`; `A:"D6"`. |
| TERMINATOR, BLADE CHAMPION keywords | (a) | keywords only; no rule in this patrol reads them. |

Totals: **6 new registry entries** — 4 faction code hooks (`katahOnSelect`, `watchmanOfTerra`, `warriorExemplar`,
`tgbOverawing`) and 2 mission hooks (`raiseTheVexillas`, `tgbConsecratedGround`, via `missionHook`). Reused:
`unitChoices` (GK/CUS), `getStuckInDistance` (ORK), `leadershipTest` + `charge.targetUnitIds` (T'au
`laserMarkedTargets`), `gainCp` (GK/T'au), `playerBattlefieldEdge` (GK), CSM `darkPact` pick pattern. **1 engine change** (E1 mission plumbing in `missions.ts`). **No frozen contract changes**: `types.ts`,
`actions.ts`, `events.ts`, `hooks.ts`, `rng.ts`, `decider.ts`, `index.ts` untouched (`VpScored.amount` is already a
plain `number`; a negative amount is emitted for the Consecrated Ground loss).

### 7.1 Engine change signatures

```ts
// ---------- E1 Mission plumbing (TRI-4.1, 4.2) — src/engine/missions.ts (not frozen) ----------
// VP loss, floored so the source's own running total never drops below 0. Returns the VP actually removed (≥ 0).
function deductVp(ctx: EngineContext, pid: PlayerId, amount: number, source: string): number
//   removed = min(amount, p.vpBySource[source] ?? 0); if removed === 0 return 0
//   p.vp -= removed; p.vpBySource[source] -= removed
//   ctx.emit({ type: 'VpScored', source, amount: -removed, total: p.vp, player: pid })
//   s.mission.scored.push({ ruleId: source, player: pid, round: s.round, turn: s.activePlayer, amount: -removed })
// in missions.ts (pattern of hallowedRetributionUnitDestroyed: the faction file decides amounts, missions.ts owns the ledger)
function tgbConsecratedGroundUnitDestroyed(ctx: EngineContext, info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: string | null }): void
//   for pid of ['A','B']: rule = active custom rule with code 'tgbConsecratedGround' for pid (rulesFor + rounds gate); if none continue
//   raw = tgbConsecratedGroundGain(s, info, pid, rule); amount = min(raw, rule.cap - (vpBySource[rule.id] ?? 0))
//   if amount > 0: awardVp(ctx, pid, amount, rule.id) + s.mission.scored.push({... amount})
function tgbConsecratedGroundModelDestroyed(ctx: EngineContext, info: ModelDestroyedInfo): void
//   owner = s.units[info.unitId]?.player; rule = owner's active 'tgbConsecratedGround' rule; if none return
//   loss = tgbConsecratedGroundLoss(s, info, owner, rule); if loss > 0: deductVp(ctx, owner, loss, rule.id)
// unitDestroyedHook gains:   tgbConsecratedGroundUnitDestroyed(ctx, info)
// MissionService.modelDestroyed gains: tgbConsecratedGroundModelDestroyed(ctx, info)   (after guardianOfTheRealmModelDestroyed)
// customAmount gains:
//   case 'raiseTheVexillas': { const v = vexillaObjectiveIds(s, pid)
//     return v.own.some((id) => holds(ctx, id, pid)) && v.enemy.some((id) => holds(ctx, id, pid)) ? rule.pointsPer : 0 }
//   case 'tgbConsecratedGround': return 0   // event-driven, scored in the destroy fan-outs

// ---------- (b) hook bodies — src/engine/factions/adeptus-custodes.ts (extend) ----------
export const KATAH_SELECT_CODE = 'katahOnSelect'
export function katahSelectOffer(ctx: EngineContext, window: TimingWindowId, key: string): boolean
export function katahSelectHandle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
export function watchmanOfTerraGate(state: GameState, holder: Unit): boolean
export function warriorExemplarRun(ctx: EngineContext, entry: HookSourceEntry, data: Record<string, unknown>): void
export function tgbOverawingCheck(env: StratagemEnv, t: StratagemTuple): boolean
export function tgbOverawingApply(ctx: EngineContext, env: StratagemEnv, t: StratagemTuple): void
// Raise the Vexillas: the non-removed markers closest to each battlefield edge (ties → all tied ids)
export function vexillaObjectiveIds(state: GameState, pid: PlayerId): { own: ObjectiveId[]; enemy: ObjectiveId[] }
// Consecrated Ground (TRI-4.2) amounts — pure, no VP writes (missions.ts E1 applies them)
export function tgbConsecratedGroundGain(
  state: GameState,
  info: { unitId: UnitId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: string | null },
  pid: PlayerId, rule: ScoringRule,
): number   // rule.pointsPer if state.units[info.unitId].player !== pid, else 0
export function tgbConsecratedGroundLoss(
  state: GameState,
  info: { unitId: UnitId; modelId: ModelId; byPlayer: PlayerId | null; byUnitId: UnitId | null; byModelId: ModelId | null },
  pid: PlayerId, rule: ScoringRule,
): number   // (rule.params.lossPerModel ?? 1) if the unit is pid's and has keyword (rule.params.keyword ?? 'ADEPTUS CUSTODES'), else 0
// adeptusCustodesHooks gains: katahOnSelect, watchmanOfTerra, warriorExemplar, tgbOverawing
// code-hooks.ts registry gains: raiseTheVexillas: missionHook('raiseTheVexillas','onTurnEnd'),
//                               tgbConsecratedGround: missionHook('tgbConsecratedGround','onUnitDestroyed')
```

Import direction: `missions.ts` already imports `guardianOfTheRealm*` from `factions/adeptus-custodes.ts`; it adds
`vexillaObjectiveIds`, `tgbConsecratedGroundGain`, `tgbConsecratedGroundLoss` to that import. The faction file never
imports `missions.ts` (no cycle). A model kill that also destroys its unit runs the model fan-out (−1 if it is the
owner's Custodes model) before the unit fan-out (+3 for the other player); they never touch the same player for one event.

AI note (40-ai, not engine): Ka'tah per unit — Rendax when the target has T ≥ 7 or the unit wounds on 5+, else
Dacatarai; Tristraen: Victus vs W ≥ 3 / 2+ save targets, Hurricanus vs hordes, Behemor to snipe a CHARACTER.
Gilded Spear when a 3" pile-in cannot reach base contact. Overawing whenever affordable against a charger with Ld 7+.

## 8. Test IDs

| ID | Ref | Scenario → expected |
|---|---|---|
| TRI-001 | TRI-1 | patrol loads (default): 3 units, 7 models (Tristraen 1, Guard 3, Wardens 3); Tristraen is WARLORD with Watchman of Terra, unattached; default secondary Raise the Vexillas |
| TRI-002 | TRI-1.1 | `unitChoices:{retinue:'allarus'}` → 3 units, 6 models, no Wardens unit exists |
| TRI-003 | TRI-1.3, 1.4 | no unit may start in Deep Strike Reserves; Guard has no BATTLELINE keyword; all 3 Guard models start at 4 W; Tristraen at 6 W; Allarus T 7, M 5 |
| TRI-004 | TRI-2.1 | each time a TGB unit is selected to fight (both players' turns) its player gets a mandatory Dacatarai/Rendax choice for that unit only; no army-wide pick at Fight-phase start |
| TRI-005 | TRI-2.2, 2.4 | two TGB units in one phase: Guard picks Dacatarai (critical hit → 1 extra hit), Wardens pick Rendax (critical hit auto-wounds); each unit only gets its own stance; ranged weapons unaffected; stance gone at phase end |
| TRI-006 | TRI-2.5 | Guardians of the Throne still gets its Fight-phase-start pick (CUS-004 regression); a TGB-only army never sees it |
| TRI-007 | TRI-3.1 | Watchman of Terra: Tristraen in Engagement Range → OC 4 (outweighs 3 OC 1 enemies on a marker); out of Engagement Range → OC 2; Battle-shocked → 0 |
| TRI-008 | TRI-3.2 | Warrior Exemplar: Tristraen destroys the last model of an enemy unit → D6, 3+ gains 1 CP, 1–2 nothing; kill by a Guard model → no roll; a second gain in the same round is discarded by the R-4.2 cap |
| TRI-009 | TRI-4.1 | Raise the Vexillas: round 3+, end of own turn, controls both edge-closest markers → +3; only one of them → 0; round 2 → 0; end of opponent's turn → 0 |
| TRI-010 | TRI-4.1 | Raise the Vexillas edge selection: markers picked by distance to each player's battlefield edge for both deployment orientations; a tie lets either tied marker count |
| TRI-011 | TRI-4.2 | Consecrated Ground: enemy unit destroyed in either turn (attack, mortal wounds, Reserve cull) → +3 each |
| TRI-012 | TRI-4.2 | Consecrated Ground: own Custodes model destroyed → −1; at 0 secondary VP a loss removes nothing; VP from other sources are never reduced; the opponent's models dying do not reduce it |
| TRI-013 | TRI-5.1 | Gilded Spear: Custodes unit not yet fought, either turn → pile-in up to 6" this phase; consolidate still 3"; not targetable after the unit fought |
| TRI-014 | TRI-5.2 | Inescapable Vengeance: own Movement phase, unit not yet moved → Advance roll +2 (rolled 3 → 5"); not targetable once the unit moved; expires at phase end; not usable in the opponent's turn |
| TRI-015 | TRI-5.3 | Overawing Magnificence: enemy declares a charge on a Custodes unit → offered; Ld test failed → charge roll −2 (2D6 = 9 → 7); passed → no change; Custodes unit not a charge target → not offered |
| TRI-016 | TRI-5 | the Guardians of the Throne stratagems `cus.s.*` are not in this patrol's list, and the `cus.s.tgb-*` ones are not in Guardians' (both patrols' data load side by side) |
| TRI-017 | TRI-6.1 | Tristraen fights with exactly one vaultswords profile: Behemor 6 A with Precision (may allocate to an attached CHARACTER), Hurricanus 9 A Sustained Hits 1, Victus 5 A Devastating Wounds D 3 |
| TRI-018 | TRI-6.3 | balistus grenade launcher: D6 attacks +2 against a 10-model unit (Blast); cannot target a unit engaged with a friendly unit |
| TRI-019 | TRI-6 | Wardens wargear as built: axe model has castellan axe ranged 24" A2 and melee A4 S9 AP−1 D3; spear models use reused guardian spear profiles |
| TRI-020 | TRI-6 | Dacatarai on Hurricanus does not stack a second Sustained Hits; Rendax on Hurricanus gives both Lethal and Sustained |

## 9. Figures

Heights follow 30-figures and the existing Custodes figures (Custodes H 1.35–1.45, Terminator-bulk a little taller and
much wider). Bases are rules-true. Original designs, no heraldry or logos.

The TGB Custodian Guard (`cus.custodian-guard-tgb/guard`, 3 models) reuses the existing `custodian-guard-shield` figure
(sentinel blade + shield) — no new figure.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `tristraen` | `cus.tristraen/champion` | 1 | 1.45 | 40 mm | A chibi gold-armoured duellist with a smooth tall-crested helmet and a long crimson plume, a short crimson cape, and three different swords: a broad heavy blade in one hand, a slim fast blade in the other and a third long blade sheathed across the back. |
| `custodian-warden-axe` | `cus.custodian-wardens/axe` | 1 | 1.4 | 40 mm | A chibi gold-armoured sentinel with a high crested helmet and dark crimson robes hanging below the waist, holding a long-hafted golden war-axe with a broad crescent blade and a gun barrel along the haft. |
| `custodian-warden-spear` | `cus.custodian-wardens/spear` | 2 | 1.4 | 40 mm | The same chibi robed golden sentinel holding a very long spear tipped with a broad leaf-shaped blade and a gun barrel set into the haft. |
| `allarus-custodian` | `cus.allarus-custodians/allarus` | 2 | 1.5 | 40 mm | A chibi hulking warrior in very thick rounded gold armour with massive shoulder plates, a small crested helmet sunk between them, a short grenade launcher on the wrist and a long bladed spear held upright, crimson tabard at the waist. |

## 10. Other Adeptus Custodes patrols (appendix)

- Guardians of the Throne — Index, June 2023 — Shield-Captain Tyvan (1, WARLORD); Prosecutors (5); Vigilators (5); then Custodian Guard (4) OR Vertus Praetors (1). Spec: `docs/spec/factions/adeptus-custodes.md`.

## 11. Build notes — values to confirm / id table

- Sentinel blade ranged: the page prints "assault pistol" in the weapon name and shows no bracket cell; read as Assault +
  Pistol, the same as `cus.w.sentinel-blade-ranged` (reused). **[confirm]** if a later page revision differs.
- The page gives no default for the Wardens / Allarus choice; `wardens` default is ours (TRI-1.1).
- Martial Ka'tah "until the unit has finished its attacks" is encoded as `untilEndOfPhase` (a unit fights once per phase).
- Consecrated Ground floor scope and attached-unit counting are **[interp]** (§4 notes).
- Model keys: `champion` (Tristraen), `guard`, `axe` / `spear` (Wardens), `allarus`.
- New ids: datasheets `cus.tristraen`, `cus.custodian-guard-tgb`, `cus.custodian-wardens`, `cus.allarus-custodians`;
  ability `cus.a.martial-katah-tgb`; weapons `cus.w.vaultswords-behemor|hurricanus|victus` (profileGroup
  `cus.w.vaultswords`), `cus.w.castellan-axe-ranged`, `cus.w.castellan-axe-melee`, `cus.w.balistus-grenade-launcher`;
  enhancements `cus.e.watchman-of-terra`, `cus.e.warrior-exemplar` (+ `.effect` ability ids, as the existing pair);
  stratagems `cus.s.tgb-gilded-spear`, `cus.s.tgb-inescapable-vengeance`, `cus.s.tgb-overawing-magnificence`;
  secondaries `cus.sec.raise-the-vexillas`, `cus.sec.consecrated-ground`; patrol `cus.cp.tristraen-s-gilded-blades`
  (append to `faction.json` `combatPatrols` — the only `faction.json` edit; `armyRule` and the existing detachment are
  unchanged).
- Reused ids: `cus.w.sentinel-blade-ranged`, `cus.w.sentinel-blade-guard`, `cus.w.guardian-spear-ranged`,
  `cus.w.guardian-spear-melee`, `cus.a.praesidium-shield`.
- Source typo: the page's replacement sentence calls the optional secondary "Victory's Price"; we follow the printed
  section title Consecrated Ground (`cus.sec.consecrated-ground`).
