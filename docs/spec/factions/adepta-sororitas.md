# Faction spec — Adepta Sororitas: Sanctuary Guardians

Own-words data spec for the Adepta Sororitas Combat Patrol, same shape as 11-combat-patrol §4. Rule ids
`ADE-<section>.<n>` are cited by the `ADE-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose here is ours. Data id prefix: `ade.` (faction id `adepta-sororitas`, faction keyword
`ADEPTA SORORITAS`). Values marked **[unconfirmed]** came through a summarising fetch and should be eyeballed against
the source page before data entry (listed again in §11).

## 0. Sources (accessed 2026-10-03)

| Source | URL | Version shown on page |
|---|---|---|
| "Sanctuary Guardians" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/sanctuary-guardians/ | Index, 10th ed, June 2024 |
| "The Penitent Host" (appendix) | https://wahapedia.ru/wh40k10ed_cp/factions/the-penitent-host/ | Index, 10th ed, June 2023 |
| CP faction navigation (used to enumerate patrols) | menu on any page under https://wahapedia.ru/wh40k10ed_cp/factions/ | — (the CP index page itself returned HTTP 403) |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Patrol selection: the navigation lists two Adepta Sororitas patrols. Sanctuary Guardians (June 2024) is the newer,
current boxed patrol and is primary; The Penitent Host (June 2023) is summarised in §10.

## 1. Roster

4 units, 26 models. Faction keyword ADEPTA SORORITAS on every datasheet; all IMPERIUM, INFANTRY.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `canoness` | Canoness Adalya | 1 | Condemnor boltgun; hallowed chainsword; null rod (ability wargear) | **WARLORD**. Leader → `sisters` or `sacresants`; default attachment `sacresants` (owner may switch at setup) |
| `sisters` | Battle Sisters Squad | 10 | Sister Superior: bolt pistol, combi-weapon, power weapon. 1× Ministorum flamer, 1× Ministorum heavy flamer, 1× boltgun + Simulacrum Imperialis, 6× boltgun; every non-Superior model also bolt pistol + close combat weapon **[unconfirmed: bolt pistols on all, Simulacrum bearer's gun]** | Patrol Squads (ADE-1.2) |
| `sacresants` | Celestian Sacresants | 5 | each: bolt pistol, hallowed mace | bodyguard |
| `arcos` | Arco-flagellants | 10 | each: arco-flails | — |

| Id | Rule |
|---|---|
| ADE-1.1 | Leader eligibility: the Canoness lists both Battle Sisters Squad and Celestian Sacresants as bodyguards (one leader per bodyguard, R-10.1). |
| ADE-1.2 | Patrol Squads (CP-1.8): at Declare Battle Formations the Battle Sisters Squad may be split into two units of 5. Default: unsplit. Split parts **[interpretation]**: `sisters-a` = Superior, flamer, Simulacrum bearer, 2× boltgun; `sisters-b` = heavy flamer, 4× boltgun. Each part has Starting Strength 5. |

## 2. Faction ability — Acts of Faith (every datasheet)

| Id | Rule |
|---|---|
| ADE-2.1 | The player keeps a pool of Miracle dice. At the start of **every** turn (both players' turns) they gain 1 Miracle die. Each time one of their ADEPTA SORORITAS units is destroyed they gain 1 Miracle die. Gaining a die = roll one D6 at once; that value is the die's fixed value (it cannot be re-rolled, Command Re-roll included, unless a rule says so). |
| ADE-2.2 | Act of Faith: just before the player makes an Advance, Battle-shock, Charge, Damage, Hit, Saving or Wound roll **for an ADEPTA SORORITAS unit of theirs** (its own attacks for Hit/Wound/Damage; attacks against it for Saves), they may spend a Miracle die from the pool instead of rolling that die. The spent die's value counts as the **unmodified** result (modifiers then apply as usual; a 6 is a critical result where the rule cares). The spent die leaves the pool. |
| ADE-2.3 | Each Act of Faith replaces exactly one die. For a roll made of several dice (Charge 2D6, Battle-shock 2D6) at most one die of that roll can be replaced. In a fast-rolled batch (many attacks rolled together) still only one die of the batch can be replaced, so `maxSubstitutions` = 1 for every roll. Only D6 rolls can be replaced (a D3 Damage roll cannot) **[interpretation]**. A substituted die cannot be re-rolled. |
| ADE-2.4 | Per-phase cap: each of your units can perform at most 1 Act of Faith per phase (a unit already in `miracle.spentThisPhase` is not offered another substitution). Rolls not in the ADE-2.2 list (FNP, Hazardous, Desperate Escape, D6 attack counts, Deadly Demise) are never replaced. |
| ADE-2.5 | A unit "performed an Act of Faith" in a phase if at least one Miracle die was spent substituting a roll for it in that phase (used by Hallowed Retribution, §4). Discarding a die to pay for an enhancement or stratagem effect is **not** an Act of Faith. |
| ADE-2.6 | Attached units **[interpretation]**: the engine reports a destroyed half of an attached unit with its own `UnitDestroyed` (R-10.1 halves rule). Every `UnitDestroyed` of an own ADEPTA SORORITAS unit, halves included, grants 1 die. |

## 3. Enhancements (Canoness Adalya, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Defender of the Faith | default | the Save characteristic of every model in the bearer's unit (the bearer plus the attached bodyguard unit) improves by 1 (Sv 3+ → 2+). In your Command phase you may discard one Miracle die; if you do, until the start of your next Command phase models in the bearer's unit get +1 OC **[unconfirmed: bearer only vs bearer's unit; spec uses the unit]**. |
| Righteous Fury | optional | the bearer's unit (attached unit included) can shoot and declare a charge in a turn in which it Advanced or Fell Back. In your Command phase you may discard one Miracle die; if you do, until the end of that turn charge rolls for the bearer's unit may be re-rolled. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Hallowed Retribution | default | each time an enemy unit is destroyed by an attack (or ability) of one of your ADEPTA SORORITAS units, score 3 VP; 4 VP instead if that unit performed an Act of Faith (ADE-2.5) in the same phase. Kills with no `byUnitId` do not score **[interpretation]**. No cap stated. |
| Consecrated Ground | optional | from battle round 2 onward, at the end of each of your turns: 3 VP if at least one of your ADEPTA SORORITAS units has a model within 6" of the centre of the battlefield (origin); 4 VP instead if one of those units contains your WARLORD. Flat per turn, not per unit. Battle-shocked units do not count **[unconfirmed]**. |

## 5. Patrol stratagems

| Name | CP | Window | Target | Effect |
|---|---|---|---|---|
| Ascetic Discipline | 1 | your Shooting phase (`shooting.start` / `shooting.attacksResolved`), or either player's Fight phase (`fight.start` / `fight.attacksResolved`) | own ADEPTA SORORITAS unit that has not been selected to shoot or fight this phase | until end of phase, each attack by a model in the unit that scores a Critical Wound has its AP improved by 2 **[unconfirmed magnitude/trigger]** |
| A Martyr's Death | 1 | `shooting.targetsDeclared` (opponent's Shooting) or `fight.targetsDeclared` (an enemy unit fighting, either Fight phase), after an enemy unit picks targets | own ADEPTA SORORITAS unit that is a target of that enemy unit | when used you may discard one Miracle die. Until the end of the phase, each time a model in your unit is destroyed (by any attack, not only the enemy unit named when the stratagem was used), if that model has not yet shot (Shooting) / fought (Fight) this phase, roll D6 (+1 if a die was discarded); on 4+ the model is not removed yet: after the unit that destroyed it has finished all its attacks, the model shoots (Shooting phase) or fights (Fight phase), then it is removed |
| Holy Radiance | 1 | `shooting.targetsDeclared` (opponent's Shooting), after an enemy unit picks targets | own ADEPTA SORORITAS unit that is a target of that enemy unit | until end of phase: −1 to hit for attacks that target your unit, and models in your unit have Feel No Pain 5+ against those attacks |

Core stratagems: all apply per 10-rules §11 subject to their own keyword gates (Go to Ground is INFANTRY-only — every
unit qualifies; Tank Shock has no VEHICLE; Fire Overwatch needs a ranged weapon — Arco-flagellants have none).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Canoness Adalya | 1 | 32 mm | 6 | 3 | 3+ | 4+ | 4 | 7+ | 1 | INFANTRY, CHARACTER, IMPERIUM, CANONESS, CANONESS ADALYA | Leader → Battle Sisters Squad, Celestian Sacresants; Acts of Faith; Lead the Righteous: while leading a unit, hit rolls for attacks by models in that unit may be re-rolled **[unconfirmed: full re-roll vs re-roll 1s]**; Null Rod (wargear): models in the bearer's unit have Feel No Pain 4+ against mortal wounds and against Psychic attacks |
| Battle Sisters Squad | 10 | 32 mm | 6 | 3 | 3+ | 6+ **[unconfirmed]** | 1 | 7+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, BATTLE SISTERS SQUAD | Acts of Faith; Patrol Squads; Simulacrum Imperialis (wargear, 1 model): at the end of your Command phase, for each objective marker you control that a model of this model's unit is within range of, roll D6: on 4+ gain 1 Miracle die whose value is that roll (no new D6) |
| Celestian Sacresants | 5 | 32 mm | 6 | 3 | 3+ | 4+ | 1 | 7+ | 1 | INFANTRY, IMPERIUM, CELESTIAN SACRESANTS | Acts of Faith; Sworn Protectors: while an ADEPTA SORORITAS CHARACTER leads this unit, attacks that target it get −1 to the wound roll |
| Arco-flagellants | 10 | 25 mm **[unconfirmed]** | 7 | 3 | 7+ | — | 2 | 8+ | 1 | INFANTRY, IMPERIUM, ARCO-FLAGELLANTS | Feel No Pain 5+; Acts of Faith; Extremis Trigger Word: each time the unit is selected to fight you may trigger it; if you do, until end of phase arco-flails have A 6 and [HAZARDOUS] |

Faction keyword (all): ADEPTA SORORITAS. Arco-flagellants' Sv 7+ = no armour save is possible (only FNP protects).

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Canoness Adalya | — | Condemnor boltgun | hallowed chainsword |
| Battle Sisters Squad | Sister Superior ×1 | bolt pistol, combi-weapon | power weapon |
| Battle Sisters Squad | Sister (flamer) ×1 | bolt pistol, Ministorum flamer | close combat weapon |
| Battle Sisters Squad | Sister (heavy flamer) ×1 | bolt pistol, Ministorum heavy flamer | close combat weapon |
| Battle Sisters Squad | Sister (simulacrum) ×1 | bolt pistol, boltgun | close combat weapon |
| Battle Sisters Squad | Sister ×6 | bolt pistol, boltgun | close combat weapon |
| Celestian Sacresants | ×5 | bolt pistol | hallowed mace |
| Arco-flagellants | ×10 | — | arco-flails |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| Condemnor boltgun | 24" | 1 | 2+ | 4 | 0 | 1 | Anti-Psyker 2+, Devastating Wounds, Precision, Rapid Fire 1 |
| bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| boltgun | 24" | 1 | 3+ | 4 | 0 | 1 | Rapid Fire 1 |
| combi-weapon | 24" | 1 | 4+ | 4 | 0 | 1 | Anti-Infantry 4+, Devastating Wounds, Rapid Fire 1 |
| Ministorum flamer | 12" | D6 | n/a | 5 | 0 | 1 | Ignores Cover, Torrent |
| Ministorum heavy flamer | 12" | D6 | n/a | 6 | −1 | 1 | Ignores Cover, Torrent |
| hallowed chainsword | melee | 5 | 2+ | 3 | −1 | 1 | — **[unconfirmed S]** |
| power weapon | melee | 2 | 4+ | 4 | −2 | 1 | — |
| close combat weapon (Sister) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| hallowed mace | melee | 3 | 3+ | 4 | −1 | 2 | Lethal Hits |
| arco-flails | melee | 4 (6 with Extremis) | 4+ | 5 | 0 | 1 | Sustained Hits 1 (+Hazardous with Extremis) |

Suggested `paintScheme` (original): primary `#1c1c22` (near-black armour), secondary `#c8c2b4` (bone cloth), trim
`#a3242c` (crimson), metal `#b9a36a` (brass), decal `#f2efe6`.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`); (c) = engine change beyond a code hook. Engine changes are numbered E1–E5;
their TypeScript signatures are in §7.1 so the hook agent can code against them before they land.

| Rule | Enc. | Encoding |
|---|---|---|
| Acts of Faith — gain (ADE-2.1, 2.6) | (c) E1 | engine, not a hook: `factions/adepta-sororitas.ts` `runActsOfFaithTurnStart(ctx)` called at every turn start (both players) → one `gainMiracleDie` per player whose army has the `actsOfFaith` ability; `onOwnUnitDestroyed(ctx, unitId)` called from the `UnitDestroyed` emission path (state.ts) → `gainMiracleDie` for the owner if the unit had ADEPTA SORORITAS. Ability descriptor on every datasheet is a marker: `{trigger:'always', code:'actsOfFaith'}` (code hook `actsOfFaith` = registered noop so validation passes, like `reanimationProtocols`). |
| Acts of Faith — substitution (ADE-2.2–2.5) | (c) E1 | engine roll wrapper (`modules.ts` `ctx.roll`): before a D6 roll whose purpose ∈ {advance, battleShock, charge, damage, hit, wound, save} for a unit with ADEPTA SORORITAS (owner = roller for its own rolls; for saves the defending unit), if `player.miracle.dice.length > 0`, pause with a `chooseOption` decision topic `miracleDie`, data `{purpose, unitId, count, maxSubstitutions, pool}` (maxSubstitutions = 1 for every roll, attack batches included: one Act of Faith replaces one die), options `skip` / `use` (`use` carries `dieIndexes` = indexes into the pool, length 1). `substitutionEligible` also refuses a unit already in `miracle.spentThisPhase` (max 1 Act of Faith per unit per phase). Substituted values fill the first k dice, are recorded in `DiceRoll.substituted`, `canReroll` refuses them; `MiracleDieSpent` emitted per die; unit id appended to `miracle.spentThisPhase` (reset at every phase end). Re-entrancy: same pause/resume pattern as `rerollOffer`. AI policy (src/ai, not decider.ts): spend a high die on a save against D≥2 or a die ≥ needed on a charge, else skip. |
| Defender of the Faith — Save | (a) | enhancement effect `{trigger:'always', effect:{modifyStat:{stat:'Sv', value:-1}}, scope:{who:'self'}}` (explicit `self` = the bearer's unit, attached bodyguard included; Sv is a threshold; −1 = better; `dice.ts` clamps at 2+) |
| Defender of the Faith — OC | (b) | `defenderOfTheFaithOc` (`onCommandPhase`, own turn, opened at `command.start` like `resonantFocusPick`): if bearer on board and pool non-empty, `chooseOption` topic `abilityChoice` options = `decline` + one option per distinct die value; on pick calls `discardMiracleDie`, returns `grantEffect {unitId: bearer's canonical unit, effect:{modifyStat:{stat:'OC', value:1}}, duration:'untilNextTurn'}`. |
| Righteous Fury — advance/fall back | (a) | enhancement effect `{trigger:'always', effect:{shootAfterAdvance:true, shootAfterFallBack:true, chargeAfterAdvance:true, chargeAfterFallBack:true}, scope:{who:'self'}}` |
| Righteous Fury — charge re-roll | (b) | `righteousFuryPick` (`onCommandPhase`, same shape as above): discard → mark `righteousFury:<round>:<player>=<canonicalUnitId>`; `righteousFuryReroll` (`onChargeRoll`): gate = charging canonical unit = marked unit, mark round = current round, active player = mark owner → `{reroll:'all'}`. |
| Hallowed Retribution | (b) | secondary `scoring:[{id:'hallowed-retribution', when:'any.unitDestroyed', who:'both', rule:'custom', code:'hallowedRetribution', pointsPer:3, rounds:{from:1,to:5}, cap:99}]` (`who:'both'` because Sororitas kills also happen in the opponent's turn: Fight phase, Fire Overwatch, A Martyr's Death); `hallowedRetribution` = `missionHook('hallowedRetribution','onUnitDestroyed')` + amount fn in `missions.ts` (awards VP only to the player owning the killing ADEPTA SORORITAS unit): destroyed unit is the opponent's, `byUnitId` non-null and its unit (canonical, or its surviving half) has ADEPTA SORORITAS and belongs to the owner → 4 if `byUnitId` (or its canonical id) ∈ `players[owner].miracle.spentThisPhase`, else 3. |
| Consecrated Ground | (b) | secondary `scoring:[{id:'consecrated-ground', when:'turn.end', who:'active', rule:'custom', code:'consecratedGround', pointsPer:3, rounds:{from:2,to:5}, cap:99}]`; `consecratedGround` = `missionHook('consecratedGround','onTurnEnd')`: own canonical board units with ADEPTA SORORITAS, not `battleShocked`, with ≥1 model whose base edge is within 6" of (0,0,0) horizontally; 0 if none, 4 if any qualifying unit contains the WARLORD model, else 3. |
| Ascetic Discipline | (a) after E3 | stratagem `window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved']` (the only Shooting/Fight windows in `TimingWindowId`; no `shooting.unitSelect`), `who:'either'` with `condition:{any:[{phase:'shooting',ownTurn:true},{phase:'fight'}]}` (Shooting: own turn only; Fight: either player's turn), `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTA SORORITAS'}, state:'notYetActivated'}]` (one phase-agnostic state: not selected to shoot or fight this phase), `effect:{critWoundAp:2}`, `untilEndOfPhase`. Needs E3 (`Effect.critWoundAp`, `TargetSpec.state 'notYetActivated'`). |
| A Martyr's Death | (b)+(c) E4 | (b) `aMartyrsDeath` (stratagem, `hooks:['onModelDestroyed']`): on use, if pool non-empty, `chooseOption` (discard / keep) → `discardMiracleDie`, stores `params.bonus` 1/0 on the granted ActiveEffect. While active, on `onModelDestroyed` for ANY model of the target unit (no `byUnitId` gate; any destroying unit qualifies) whose own model has not yet shot/fought this phase (per-model gate, not per-unit): roll D6 (`purpose:'ability'`) + bonus; on ≥4 return `{kind:'request', deferRemoval:{kind: phase==='shooting' ? 'ranged' : 'melee', afterUnitId: byUnitId}}` (the destroying unit). (c) E4 does the rest. Stratagem `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'` reactive (opponent's attacks; the effect then lasts all phase for every destroyed model of the target unit), target state `targetedByAttack`, keyword ADEPTA SORORITAS. |
| Holy Radiance | (a) | `window:'shooting.targetsDeclared'` (opponent's turn), target state `targetedByAttack`, keyword ADEPTA SORORITAS, `effect:[{modifyRoll:{roll:'hit', value:-1}}, {feelNoPain:'5+'}]`, `scope:{who:'attacker'}` (explicit: hit `modifyRoll` is attacker-side, so without the flip the default holder = target would put −1 on the unit's own hit rolls; FNP stays defender-side under this flip, via `onFeelNoPainRoll`), `untilEndOfPhase` — same shape as Gene-wrought Resilience. |
| Lead the Righteous | (a) | `{trigger:'hitRoll', when:{leaderAttached:true}, effect:{reroll:'all'}, scope:{who:'self'}}` (any hit die may be re-rolled, so fishing for a Lethal Hits 6 with maces is legal) |
| Null Rod | (a) after E2 | `{trigger:'feelNoPainRoll', when:{any:[{weaponAbility:'PSYCHIC'}, {mortalWound:true}]}, effect:{feelNoPain:'4+'}, scope:{who:'self'}}` — bearer's unit (attached unit included). Engine already takes the best single FNP. Needs E2 (`mortalWound` condition). |
| Simulacrum Imperialis | (b) | `simulacrumImperialis` (`onPhaseEnd`, `when:{phase:'command', ownTurn:true}`, ability on model `ade.battle-sisters-squad/sister-simulacrum`, `scope.who:'bearer'`): if the bearer model is alive on the board, for each objective controlled by the owner with any model of the bearer's unit within objective range (after a Patrol Squads split, only the part holding the bearer): roll D6 (`purpose:'ability'`), on ≥4 `gainMiracleDie(ctx, player, 'simulacrum', die)`. Resolves before `command.end` scoring (same ordering slot as Reanimation, NEC-2.6). |
| Sworn Protectors | (a) | `{trigger:'woundRoll', when:{leaderAttached:true}, effect:{modifyRoll:{roll:'wound', value:-1}}, scope:{who:'attacker'}}` applied to attacks targeting the unit (defensive; wound-roll `modifyRoll` is an attacker-side key, so `who:'attacker'` flips it onto attacks that target the unit, same flip as `sm.s.gene-wrought-resilience`; `'self'` would wrongly penalise the Sacresants' own wound rolls); only the Canoness can lead it, so `leaderAttached` = "an ADEPTA SORORITAS CHARACTER leads" |
| Extremis Trigger Word | (b) | `extremisTriggerWord` (`onUnitSelectedToFight`, own unit, same flow as `plasmacyteSurge` minus the charge count): `chooseOption` topic `abilityChoice` use/decline; on use grants `[{setStat:{stat:'A', value:6}, when:{weaponId:'ade.arco-flails'}}, {grantWeaponAbility:{ability:'HAZARDOUS'}, when:{weaponType:'melee'}}]` scope `self`, `untilEndOfPhase`. |
| Feel No Pain 5+ (Arcos) | (a) | `coreAbilities:[{ability:'FEEL_NO_PAIN', value:5}]` |
| Patrol Squads (ADE-1.2) | (c) E5 | setup option, deferrable for the first playable build (default unsplit) |
| Leader (Canoness → Sisters / Sacresants) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['ade.battle-sisters-squad','ade.celestian-sacresants']`; patrol `attachTo:'sacresants'` |
| Anti-Psyker 2+ / Anti-Infantry 4+ / Devastating Wounds / Precision / Rapid Fire 1 / Pistol / Torrent / Ignores Cover / Lethal Hits / Sustained Hits 1 / Hazardous | (a) | weapon abilities `ANTI` (`PSYKER` 2 / `INFANTRY` 4), `DEVASTATING_WOUNDS`, `PRECISION`, `RAPID_FIRE` 1, `PISTOL`, `TORRENT`, `IGNORES_COVER`, `LETHAL_HITS`, `SUSTAINED_HITS` 1, `HAZARDOUS` |
| BATTLELINE, CANONESS | (a) | plain keywords |

Totals: **9 new code hooks** (`actsOfFaith` marker noop, `defenderOfTheFaithOc`, `righteousFuryPick`,
`righteousFuryReroll`, `hallowedRetribution`, `consecratedGround`, `aMartyrsDeath`, `simulacrumImperialis`,
`extremisTriggerWord`); **5 engine changes** (E1 Miracle dice, E2 mortal-wound FNP condition, E3 crit-wound AP +
`notYetActivated`, E4 deferred removal / martyr activation, E5 Patrol Squads split). Frozen contracts touched:
`types.ts` (E1, E4, E5), `events.ts` (E1, E4), `hooks.ts` (E2, E4). No `actions.ts`, `rng.ts`, `decider.ts` or
`index.ts` change. Matching `docs/spec/00-architecture.md` edit required.

### 7.1 Engine change signatures

```ts
// ---------- E1 Miracle dice ----------
// src/engine/types.ts (FROZEN)
export interface MiracleState { dice: number[]; spentThisPhase: UnitId[] }   // values 1..6, pool order = gain order
// Player: add
  miracle: MiracleState                       // createGame initialises { dice: [], spentThisPhase: [] } for every player
// DiceRoll: add
  substituted?: number[]                      // die indexes whose value came from a Miracle die; never re-rollable
// ChooseOptionTopic: add 'miracleDie'
//   data = { purpose: RollPurpose; unitId: UnitId; count: number; maxSubstitutions: number; pool: number[] }
//   options: 'skip' | 'use' (answer carries dieIndexes: number[] = indexes into pool, 1..maxSubstitutions)

// src/engine/events.ts (FROZEN) — add to the event union
export interface MiracleDieGained extends EventBase { type: 'MiracleDieGained'; player: PlayerId; value: number; source: string }
export interface MiracleDieSpent extends EventBase {
  type: 'MiracleDieSpent'; player: PlayerId; value: number; mode: 'substitute' | 'discard'
  unitId: UnitId | null; rollId: string | null; purpose: RollPurpose | null; source: string
}

// src/engine/factions/adepta-sororitas.ts (new, not frozen)
export const ACTS_OF_FAITH_CODE = 'actsOfFaith'
export function hasActsOfFaith(state: GameState, player: PlayerId): boolean
// rolls a D6 (purpose 'ability', not command-rerollable) unless `value` is given; pushes it; emits MiracleDieGained; returns the value
export function gainMiracleDie(ctx: EngineContext, player: PlayerId, source: string, value?: number): number
// removes pool[index]; emits MiracleDieSpent mode 'discard'; returns its value; throws EngineInvariantError if out of range
export function discardMiracleDie(ctx: EngineContext, player: PlayerId, index: number, unitId: UnitId | null, source: string): number
// true iff the roll may be substituted: sides 6, purpose in the ADE-2.2 list, unit has ADEPTA SORORITAS and is the roller's (save: the defender's)
export function substitutionEligible(state: GameState, spec: { purpose: RollPurpose; player: PlayerId; unitId: UnitId | null; sides: 3 | 6 }): boolean
export function runActsOfFaithTurnStart(ctx: EngineContext): void          // called from the turn-start path, both players
export function onOwnUnitDestroyed(ctx: EngineContext, unitId: UnitId): void // called where UnitDestroyed is emitted
export function clearActsOfFaithPhase(state: GameState): void              // phase end: every player's spentThisPhase = []

// ---------- E2 FNP against mortal wounds ----------
// src/engine/hooks.ts (FROZEN): AttackRollHookContext add
  mortal?: boolean                            // set only for onFeelNoPainRoll: true when the point being saved is a mortal wound
// src/data/types.ts Condition add (not frozen)
  mortalWound?: boolean                       // evaluateCondition reads ctx.mortal; false/undefined outside onFeelNoPainRoll
// attack.ts: bestFeelNoPain(ctx, model, actx, mortal: boolean) — applyOnePoint passes its `mortal` flag through

// ---------- E3 Critical-wound AP ----------
// src/data/types.ts (not frozen)
// Effect add:
  critWoundAp?: number                        // AP improves by this much (AP − n) for an attack whose unmodified wound roll was a critical wound
// TargetSpec.state add 'notYetActivated'     // phase-agnostic: unit has not been selected to shoot or fight this phase (a TargetSpec holds one state, so no separate notYetShot/notYetFought)
// attack.ts: wound stage records slot.critWound = boolean; save stage AP = weapon AP − Σ matching critWoundAp (attacker's effects, onWoundRoll match)

// ---------- E4 Deferred removal (A Martyr's Death) ----------
// src/engine/hooks.ts (FROZEN): EffectRequest add
  deferRemoval?: { kind: 'ranged' | 'melee'; afterUnitId: UnitId }
// engine must collect onModelDestroyed hooks BEFORE physically removing the model and honour deferRemoval
// src/engine/types.ts (FROZEN): PhaseState add
  deferredRemovals: { unitId: UnitId; modelIds: ModelId[]; kind: 'ranged' | 'melee'; afterUnitId: UnitId; source: string }[]
// Model add
  removalDeferred?: boolean                   // at 0 W, ModelDestroyed already emitted; cannot be targeted/allocated, has no OC
// src/engine/events.ts (FROZEN)
export interface ModelRemovalDeferred extends EventBase { type: 'ModelRemovalDeferred'; unitId: UnitId; modelId: ModelId; source: string }
// src/engine/factions/adepta-sororitas.ts
export function deferModelRemoval(ctx: EngineContext, modelId: ModelId, kind: 'ranged' | 'melee', afterUnitId: UnitId, source: string): void
// called when `afterUnitId` finishes its shooting / its fight activation: opens declareTargets for the deferred models only
// (ranged: normal target rules; melee: no pile-in/consolidate, only enemies in Engagement Range), resolves, then removes
// them; UnitDestroyed (and its Miracle die) is emitted when the last model actually leaves
export function resolveDeferredActivations(ctx: EngineContext, afterUnitId: UnitId): 'done' | 'awaiting'

// ---------- E5 Patrol Squads ----------
// src/data/types.ts (not frozen): PatrolUnitData add
  patrolSquads?: { ref: string; size: number; wargear: { modelId: string; count: number; weapons: Id[] }[] }[]
// src/engine/types.ts (FROZEN): PlayerSetup add
  splitUnits?: string[]                       // patrol unit refs to split at Declare Battle Formations; attachments then name the part refs
```

## 8. Test IDs

Same list as the `ADE` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| ADE-001 | ADE-1 | patrol loads: 4 units, 26 models, Canoness is WARLORD with Defender of the Faith, attached to Sacresants; default secondary Hallowed Retribution |
| ADE-002 | ADE-1.1 | Canoness may attach to Battle Sisters Squad instead; not to Arco-flagellants |
| ADE-003 | ADE-1.2 | Patrol Squads: `splitUnits:['sisters']` → two 5-model units with the listed wargear, each Starting Strength 5; default stays one unit of 10 |
| ADE-004 | ADE-2.1 | a Miracle die is gained at the start of each turn, both players' turns (one `MiracleDieGained` per turn, value = a D6) |
| ADE-005 | ADE-2.1 | own ADEPTA SORORITAS unit destroyed → +1 Miracle die; enemy unit destroyed → none |
| ADE-006 | ADE-2.2 | hit roll substitution: Miracle die 6 replaces one hit die of a boltgun batch → unmodified 6 (critical), die leaves the pool, `MiracleDieSpent` mode substitute |
| ADE-007 | ADE-2.2 | save substitution when an ADEPTA SORORITAS unit is attacked; substituted value is unmodified, AP still applies |
| ADE-008 | ADE-2.2 | no `miracleDie` decision for a non-eligible roll (FNP, Hazardous, Desperate Escape, D6 attack count) or an empty pool |
| ADE-009 | ADE-2.3 | charge roll: at most one of the 2D6 replaced; the other die is rolled |
| ADE-010 | ADE-2.3 | a substituted die cannot be re-rolled (Command Re-roll / Lead the Righteous refuse that index) |
| ADE-011 | ADE-2.3 | D3 damage roll is never offered a substitution; D6 damage is |
| ADE-012 | ADE-2.4, 2.5 | `spentThisPhase` records the unit after a substitution and clears at phase end; a discard (enhancement/stratagem) does not record it; a second substitution for the same unit in the same phase is not offered (`maxSubstitutions` = 1, one die per Act of Faith) |
| ADE-013 | ADE-2.6 | led Sacresants all destroyed (Canoness survives) → that half's `UnitDestroyed` grants 1 die |
| ADE-014 | ADE-3 | Defender of the Faith: Canoness Sv 3+ → 2+ and the led unit's models 3+ → 2+ (Sacresants or Battle Sisters) |
| ADE-015 | ADE-3 | Defender of the Faith OC: discard at own Command phase → bearer's unit +1 OC per model until own next Command phase; pool −1; not offered with empty pool |
| ADE-016 | ADE-3 | Righteous Fury: bearer's unit Advances then shoots and declares a charge; Falls Back then shoots and charges; Arco-flagellants cannot |
| ADE-017 | ADE-3 | Righteous Fury charge re-roll after a discard: failed charge may be re-rolled that turn only |
| ADE-018 | ADE-4 | Hallowed Retribution: Sacresants destroy an enemy unit → +3 VP |
| ADE-019 | ADE-4 | Hallowed Retribution: killing unit made an Act of Faith earlier that phase → +4 VP; Act of Faith in a previous phase → +3 |
| ADE-020 | ADE-4 | Hallowed Retribution: enemy unit killed with no `byUnitId` (e.g. its own Hazardous) → 0 VP |
| ADE-021 | ADE-4 | Consecrated Ground: round 1 → 0; round 2+, unit model within 6" of centre at end of own turn → +3; with WARLORD in it → +4 (not 7); two units → still one award |
| ADE-022 | ADE-4 | Consecrated Ground: only Battle-shocked units within 6" → 0 VP; opponent's turn end → nothing |
| ADE-023 | ADE-5 | Ascetic Discipline: unmodified 6 to wound with a boltgun → AP −2 on that attack; non-critical wound keeps AP 0; expires at phase end |
| ADE-024 | ADE-5 | Ascetic Discipline not offered for a unit already selected to shoot or fight this phase; IS offered in the opponent's Fight phase for an own unit that has not yet fought; not offered in the opponent's Shooting phase |
| ADE-025 | ADE-5 | A Martyr's Death (Fight): a Sacresant destroyed before it has fought (by any enemy unit attacking the unit this phase), D6 ≥4 → model stays, fights after the destroying unit's attacks, then removed; D6 3 → removed at once |
| ADE-026 | ADE-5 | A Martyr's Death with a discarded die: D6 3 + 1 → deferred; pool −1 |
| ADE-027 | ADE-5 | A Martyr's Death (Shooting): deferred Battle Sisters shoot after the enemy unit finishes shooting, then removed; deferred models cannot be allocated further attacks and add no OC |
| ADE-028 | ADE-5 | A Martyr's Death: the destroyed model has already shot / fought this phase → no D6 for it, removed normally (other models of the unit that have not acted still roll) |
| ADE-029 | ADE-5 | Holy Radiance: −1 to hit for attacks against the unit (not the unit's own hit rolls) and FNP 5+ per damage point, opponent's Shooting only, until phase end |
| ADE-030 | ADE-6 | Lead the Righteous: led unit may re-roll any hit die (incl. a success to fish for a Lethal Hits 6); not when the Canoness is not attached |
| ADE-031 | ADE-6 | Null Rod: FNP 4+ vs a Devastating Wounds mortal and vs a Psychic weapon attack; no FNP vs a normal boltgun attack |
| ADE-032 | ADE-6 | Simulacrum Imperialis: end of own Command phase, bearer in range of one controlled marker, D6 = 5 → +1 Miracle die of value 5; D6 = 3 → none; bearer dead → no roll; bearer out of range but another model of her unit in range → roll |
| ADE-033 | ADE-6 | Sworn Protectors: attacks targeting led Sacresants get −1 to wound (their own wound rolls unaffected); unled → no modifier |
| ADE-034 | ADE-6 | Extremis Trigger Word: triggered → arco-flails A 6 + Hazardous this phase, Hazardous test after attacks; declined → A 4, no Hazardous |
| ADE-035 | ADE-6 | Arco-flagellants: Sv 7+ means no armour save; FNP 5+ per wound point |
| ADE-036 | ADE-6 | Condemnor boltgun: wound roll 2+ vs PSYKER is critical → Devastating Wounds mortal; Precision allows allocation to a CHARACTER in an attached unit |
| ADE-037 | ADE-6 | combi-weapon Anti-Infantry 4+: unmodified 4 to wound vs INFANTRY is critical → Devastating Wounds |
| ADE-038 | ADE-6 | Ministorum flamer / heavy flamer: Torrent auto-hits D6 attacks, Ignores Cover; hallowed mace Lethal Hits auto-wounds on a critical hit |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, character 1.2); bases are rules-true. No real-world or GW iconography —
plain original shapes where a decal is wanted.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `canoness-adalya` | `ade.canoness-adalya/canoness` | 1 | 1.2 | 32 mm | A chibi battle-nun commander in ornate black plate with brass trim and a long crimson cloak, short white bob haircut, a glowing halo-disc behind her head, a chunky ornate rifle in one hand and a toothed chainsword raised in the other, a short rod clipped to her belt. |
| `battle-sister-superior` | `ade.battle-sisters-squad/superior` | 1 | 1.1 | 32 mm | A chibi armoured sister in black plate with a bone-white tabard and crimson trim, white bob hair, a bulky two-barrel rifle in one hand and a glowing straight sword in the other. |
| `battle-sister-flamer` | `ade.battle-sisters-squad/sister-flamer` | 1 | 1.1 | 32 mm | The same chibi armoured sister holding a stubby flamethrower with a small pilot flame and a fuel canister at the hip. |
| `battle-sister-heavy-flamer` | `ade.battle-sisters-squad/sister-heavy-flamer` | 1 | 1.1 | 32 mm | The same chibi armoured sister bracing an oversized flamethrower with twin fuel tanks on her back and a wide nozzle. |
| `battle-sister-simulacrum` | `ade.battle-sisters-squad/sister-simulacrum` | 1 | 1.4 | 32 mm | The same chibi armoured sister with a rifle and a tall brass banner pole on her back topped by a winged ornament and hanging crimson streamers. |
| `battle-sister` | `ade.battle-sisters-squad/sister` | 6 | 1.1 | 32 mm | A chibi armoured sister in black plate with a bone-white tabard and crimson trim, white bob hair, holding a chunky boxy rifle across her chest, a pistol holstered on her thigh. |
| `celestian-sacresant` | `ade.celestian-sacresants/sacresant` | 5 | 1.1 | 32 mm | A chibi heavily armoured guardian sister in black and brass plate with a hooded crimson mantle, a large rounded tower shield on one arm and a flanged brass mace in the other hand. |
| `arco-flagellant` | `ade.arco-flagellants/arco` | 10 | 1.1 | 25 mm | A chibi wiry hunched figure in a ragged crimson loincloth with pale stitched skin, a brass hood-mask over the eyes, and both forearms replaced by long segmented metal whips with spiked tips. |

## 10. Other Adepta Sororitas patrols (appendix)

- The Penitent Host — Index June 2023 — Canoness Ellyrine (1, WARLORD, leads Battle Sisters), Battle Sisters Squad
  (10), Seraphim Squad (5), Repentia Squad (5), Arco-flagellants (3), Penitent Engine (1), Sororitas Rhino (1)
  **[unconfirmed composition]**; enhancements Armour of Faith / Saintly Relic; secondaries Divine Judgement /
  Rites of Reconsecration; stratagems Ascetic Discipline, A Martyr's Death, Holy Radiance (different effects from the
  2024 versions).

## 11. Build notes — values to confirm before data entry

Fetched through a summarising reader; confirm on the source page: Battle Sisters 6+ invuln; hallowed chainsword S3;
Arco-flagellant base 25 mm (32 mm plausible); bolt pistols on every Battle Sister; Lead the Righteous full re-roll vs
re-roll 1s; Ascetic Discipline exact AP rule; 
Consecrated Ground battle-shock filter.
