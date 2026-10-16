# Faction spec — Drukhari: The Blades of Torment

Own-words data spec for the Drukhari Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `DRU-<section>.<n>`
are cited by the `DRU-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours (no Games Workshop wording).

New faction: id `drukhari`, data id prefix `drk.`, data folder `src/data/factions/drukhari/`, engine hooks in
`src/engine/factions/drukhari.ts` (export `drukhariHooks`, spread into `codeHooks` in `code-hooks.ts`). Faction
keyword DRUKHARI on every datasheet; every datasheet also carries AELDARI.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Drukhari box "The Blades of Torment" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/the-blades-of-torment/ | Book "The Blades of Torment", kind **Index**, edition 10, last update **June 2023** |
| CP navigation (patrol enumeration) | menu on https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | lists exactly **one** Drukhari patrol: The Blades of Torment |
| Combat Patrol rules | same page | not re-read; 11-combat-patrol §1 already encodes it |

## 1. Roster

5 datasheets, **18 models** (as boxed). Faction keyword DRUKHARI; every unit is also AELDARI.

| Ref | Datasheet id | Models | Wargear as built | Leader / notes |
|---|---|---|---|---|
| `archon` | `drk.archon` | 1 | splinter pistol, huskblade | **WARLORD**; default enhancement Shudderworm Bottle; Leader → Kabalite Warriors |
| `kabalites` | `drk.kabalite-warriors` | 10 | Sybarite: splinter pistol, Sybarite weapon. 7 Warriors: splinter rifle, close combat weapon. 1 Warrior: shredder, close combat weapon. 1 Warrior: splinter cannon, close combat weapon | led by the Archon |
| `incubi` | `drk.incubi` | 5 | Klaivex: demiklaives (2 profiles). 4 Incubi: klaive | — |
| `raider` | `drk.raider` | 1 | disintegrator cannon, bladevanes | TRANSPORT 11, Firing Deck 11 |
| `ravager` | `drk.ravager` | 1 | 2 dark lances, disintegrator cannon, bladevanes | — |

- DRU-1.1 Default attachment: Archon → Kabalite Warriors (patrol `attachTo: 'kabalites'`); the setup UI may
  detach him. He cannot lead the Incubi.
- DRU-1.2 No wargear options: the box builds exactly the loadouts above. Model keys: `sybarite` (champion, 1),
  `warrior` (7, rifle), `shredder-warrior` (1), `cannon-warrior` (1); `klaivex` (champion, 1), `incubus` (4).
- DRU-1.3 Default deployment: nothing embarked (the Archon + Kabalites may start embarked in the Raider once E3 lands:
  10 + 1 = 11 = capacity).
- DRU-1.4 New faction record `src/data/factions/drukhari/faction.json`: `{id:'drukhari', name:'Drukhari',
  factionKeyword:'DRUKHARI', armyRule:'drk.a.power-from-pain', detachments:[{id:'drk.d.blades-of-torment',
  name:'The Blades of Torment', rule:'drk.a.power-from-pain', stratagems:['drk.s.quicksilver-reactions',
  'drk.s.many-cuts','drk.s.there-and-gone'], enhancements:['drk.e.shudderworm-bottle','drk.e.spiteful-predator']}],
  paintScheme:{primary:'#1d2a2e', secondary:'#3fae9a', trim:'#7a1f3d', metal:'#9aa3ad', decal:'#d8e8e2'},
  combatPatrols:['drk.cp.blades-of-torment']}`. Patrol file `patrols/blades-of-torment.json`.

## 2. Faction ability — Power from Pain (every datasheet)

- DRU-2.1 **Pain pool.** Each player whose army has this ability keeps a pool of Pain tokens. It gains **1** when the
  battle starts, **1** each time an enemy unit is destroyed (whatever destroyed it; each half of an attached unit is
  its own unit), and **1** each time an enemy unit fails a Battle-shock test (any source: Command phase, Tormentors,
  stratagems). No maximum. Tokens persist between phases, turns and rounds.
- DRU-2.2 **Empower.** At the start of any phase (either player's turn), the player may spend tokens one at a time; for
  each one spent they pick one of their own units that has Power from Pain. That unit is **Empowered** until the end
  of the phase.
- DRU-2.3 Empowered in a **Movement or Charge phase**: the unit may re-roll its Advance rolls and Charge rolls.
- DRU-2.4 Empowered in a **Shooting or Fight phase**: each attack made by a model of the unit may re-roll its Hit roll.
- DRU-2.5 Interpretations **[interp]**: (a) the Command phase is a phase, but Empowering there does nothing, so no
  spend is offered at `command.start`; (b) only units on the battlefield can be picked (an embarked unit cannot);
  (c) a unit already Empowered this phase is not offered again (a second token would add nothing); (d) an Empowered
  unit firing Overwatch in the opponent's Movement/Charge phase gets **no** hit re-roll (DRU-2.3 lists only
  Advance/Charge for those phases).

## 3. Enhancements (Archon, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `drk.e.shudderworm-bottle` | Shudderworm Bottle | default | DRU-3.1 While the bearer leads a unit, every model of that unit (the Archon included) has Feel No Pain 5+. Unattached: no effect. |
| `drk.e.spiteful-predator` | Spiteful Predator | optional | DRU-3.2 The bearer's unit (attached unit included) can shoot and declare a charge in a turn in which it Fell Back. |

Both: `restriction: {keyword: ['ARCHON']}`.

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `drk.sec.rapacious-raiders` | Rapacious Raiders | default | DRU-4.1 End of **your** turn, rounds 1–5 (no round restriction printed): if at least one of your DRUKHARI units that is not Battle-shocked has every model wholly within the opponent's deployment zone → 3 VP; if at least one of those qualifying units is INFANTRY → 4 VP instead (never 7). Attached unit = one unit (all models of both halves; Battle-shocked if either half is). Embarked units are not on the battlefield and never qualify; the Raider itself can. |
| `drk.sec.murderous-monster` | Murderous Monster | optional | DRU-4.2 End of **every Fight phase** (either player's turn, rounds 1–5): 3 VP if the ARCHON **model** itself destroyed at least one enemy model in that phase. Kills by the Kabalites, mortal-wound kills with no attacking model, and kills in other phases never count. No cap. |

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `drk.s.quicksilver-reactions` | Quicksilver Reactions (Battle Tactic) | 1 | DRU-5.1 opponent's Shooting phase, or the Fight phase of **either** turn, just after an enemy unit selects its targets | one own DRUKHARI INFANTRY unit picked as a target of ≥1 of those attacks | until end of phase, every attack that targets that unit gets −1 to its Hit roll |
| `drk.s.many-cuts` | Many Cuts (Battle Tactic) | 1 | DRU-5.2 your Shooting phase, or the Fight phase of **either** turn | one own DRUKHARI INFANTRY unit not yet selected to shoot (Shooting) / to fight (Fight) this phase | until end of phase, the unit's weapons gain [SUSTAINED HITS 1] for attacks against a unit that is below its Starting Strength |
| `drk.s.there-and-gone` | There and Gone (Strategic Ploy) | 1 | DRU-5.3 end of the opponent's Fight phase | one own DRUKHARI INFANTRY unit not within Engagement Range of any enemy unit, **and** one own TRANSPORT model | the INFANTRY unit embarks in that TRANSPORT, provided every one of its models is within 3" of it and the transport has room for the whole unit |

- DRU-5.4 Sustained Hits from Many Cuts does not stack with the splinter cannon's own Sustained Hits 1 (same ability,
  same value; native "highest value" handling). "Below Starting Strength" is read per attack (combined halves for an
  attached target, `targetBelowStartingStrength`).
- DRU-5.5 There and Gone: the unit is embarked from this point; next own Movement phase it began the phase embarked,
  so it may disembark (R-5.18). An attached Archon + Kabalites embarks as one unit (11 models = capacity) — needs E3.
- Core stratagems per the page: all units Command Re-roll, Insane Bravery, Rapid Ingress, Heroic Intervention,
  Counter-Offensive; Archon Epic Challenge; infantry Go to Ground; Raider/Ravager Tank Shock; units with ranged
  weapons Fire Overwatch — all already keyword-gated in core data.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Archon | 1 | 25 mm | 8 | 3 | 4+ | 2+* | 4 | 6+ | 1 | INFANTRY, CHARACTER, KABAL, AELDARI, ARCHON, MALIVEX | Leader → Kabalite Warriors; Power from Pain; Shadowfield (DRU-6.1) |
| Kabalite Warriors | 10 | 25 mm | 8 | 3 | 4+ | 6+ | 1 | 6+ | 2 | INFANTRY, BATTLELINE, KABAL, AELDARI, KABALITE WARRIORS | Power from Pain |
| Incubi | 5 | 28 mm | 7 | 3 | 3+ | 5+ | 1 (Klaivex 2) | 6+ | 1 | INFANTRY, AELDARI, INCUBI | Power from Pain; Tormentors |
| Raider | 1 | 60 mm round flying base | 14 | 8 | 4+ | 6+ | 10 | 6+ | 2 | VEHICLE, TRANSPORT, DEDICATED TRANSPORT, FLY, AELDARI, RAIDER | Deadly Demise D3; Deep Strike; Firing Deck 11; Power from Pain; Transport 11 |
| Ravager | 1 | "use model" → oval 170 × 90 mm **[interp]** | 14 | 9 | 4+ | 6+ | 11 | 6+ | 3 | VEHICLE, KABAL, FLY, AELDARI, RAVAGER | Deadly Demise D3; Deep Strike; Power from Pain; Damaged 1–4 |

Faction keyword on all five: DRUKHARI. The Archon datasheet's single model entry carries per-model keyword ARCHON
(Murderous Monster reads per-model keywords).

Abilities (own words):
- DRU-6.1 **Shadowfield** (`drk.a.shadowfield`, Archon; the page prints it unnamed under the invulnerable save): the
  Archon has a 2+ invulnerable save that can never be re-rolled (no Command Re-roll, no other re-roll). The first time
  an invulnerable save made with it fails, the model loses the invulnerable save for the rest of the battle. Armour
  saves and mortal wounds (no save made) do not consume it. With Sv 4+ the invulnerable is always the better save while
  it exists (2+ vs 4+ with any AP), so the auto-pick always uses it.
- DRU-6.2 **Tormentors** (`drk.a.tormentors`, Incubi): at the start of every Fight phase (either turn), each enemy unit
  within Engagement Range of a unit with this ability takes a Battle-shock test (one test per enemy unit).
- DRU-6.3 **Damaged: 1–4 wounds remaining** (Ravager): each of its attacks gets −1 to the Hit roll.
- DRU-6.4 **Transport** (Raider): capacity 11 DRUKHARI INFANTRY models; Firing Deck 11 (R-5.19, E-PEN2 native).
- DRU-6.5 Core: Leader (Archon), Deadly Demise D3 + Deep Strike (Raider, Ravager) native. CP rule: Reserves never
  arrive in round 1. The page gives the Raider **no** Damaged bracket. Setup refuses "embarked AND in Reserves"
  (existing state.ts rule), so the Raider can Deep Strike only empty — accepted limitation.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Archon | — | splinter pistol (Archon, BS 2+) | huskblade |
| Kabalite Warriors | Sybarite ×1 | splinter pistol | Sybarite weapon |
| Kabalite Warriors | Warrior ×7 | splinter rifle | close combat weapon |
| Kabalite Warriors | Warrior ×1 | shredder | close combat weapon |
| Kabalite Warriors | Warrior ×1 | splinter cannon | close combat weapon |
| Incubi | Klaivex ×1 | — | demiklaives (single blade / dual blades) |
| Incubi | Incubus ×4 | — | klaive |
| Raider | — | disintegrator cannon | bladevanes |
| Ravager | — | dark lance ×2, disintegrator cannon | bladevanes |

Weapon profiles:
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `drk.w.archon-splinter-pistol` | splinter pistol (Archon) | 12" | 1 | 2+ | 2 | 0 | 1 | Anti-INFANTRY 3+, Assault, Pistol |
| `drk.w.huskblade` | huskblade | melee | 5 | 2+ | 3 | −2 | 2 | Anti-INFANTRY 3+ |
| `drk.w.splinter-pistol` | splinter pistol (Sybarite) | 12" | 1 | 3+ | 2 | 0 | 1 | Anti-INFANTRY 3+, Assault, Pistol |
| `drk.w.splinter-rifle` | splinter rifle | 24" | 2 | 3+ | 2 | 0 | 1 | Anti-INFANTRY 3+, Assault |
| `drk.w.shredder` | shredder | 18" | D6 | N/A | 6 | 0 | 1 | Assault, Torrent |
| `drk.w.splinter-cannon` | splinter cannon | 36" | 3 | 4+ | 3 | −1 | 2 | Anti-INFANTRY 3+, Heavy, Sustained Hits 1 |
| `drk.w.sybarite-weapon` | Sybarite weapon | melee | 3 | 3+ | 3 | −1 | 1 | Anti-INFANTRY 3+ |
| `drk.w.close-combat-weapon` | close combat weapon | melee | 2 | 3+ | 3 | 0 | 1 | — |
| `drk.w.demiklaives-single` (`profileGroup: drk.w.demiklaives`) | demiklaives — single blade | melee | 3 | 3+ | 4 | −2 | 2 | — |
| `drk.w.demiklaives-dual` (same group) | demiklaives — dual blades | melee | 6 | 3+ | 4 | −1 | 1 | Twin-linked |
| `drk.w.klaive` | klaive | melee | 3 | 3+ | 4 | −2 | 2 | — |
| `drk.w.disintegrator-cannon` | disintegrator cannon | 36" | 3 | 3+ | 5 | −2 | 2 | — |
| `drk.w.dark-lance` | dark lance | 36" | 1 | 3+ | 12 | −3 | D6+2 | — |
| `drk.w.bladevanes` | bladevanes | melee | 3 | 4+ | 6 | 0 | 1 | — |

Notes: the splinter cannon's 4+ BS is as printed (lower than the Warriors' 3+; kept 1:1). The Klaivex picks one
demiklaive profile per fight (R-4 multi-profile). The Ravager fires both dark lances and the cannon.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema); (b) = code hook in `src/engine/factions/drukhari.ts`
(registered in `code-hooks.ts`; mission codes also need their `missions.ts customAmount` case); (c) = engine change
beyond a code hook. **No frozen contract changes**: Pain tokens and the Shadowfield record live in
`players[p].secondaryState` / `players[p].oncePerBattleUsed`, announcements use the existing `AbilityTriggered` event,
so `types/actions/events/hooks/rng/decider/index.ts` are untouched.
Reused mechanisms: `pistonDrivenBrutality` (Ork fight-start Battle-shock), Tyranid Hyper-Reactive / Voracious Assault
stratagem shapes (`state` + `params.stateByPhase`), `targetBelowStartingStrength` + target-aware `grantWeaponAbility`
(attack.ts `targetedWeapon`), Armour of Faith's `leaderAttached` FNP descriptor, Righteous Fury's fall-back
eligibility effects, `championOfTheDarkGodsAmount` + `killsThisPhase`, `reclaimAndDominateAmount`, Miracle-dice style
pool on `UnitDestroyed` in the reducer `emit` listener, Katah's two-player `fight.start` pick loop, the
`${phase}.start` windows opened by reducer.ts for every battle phase, `transportService` + E-PEN2 Firing Deck,
`damaged` datasheet field, native core abilities.

| Rule | Enc. | Encoding |
|---|---|---|
| Leader, Deep Strike, Deadly Demise D3, Firing Deck 11 (DRU-6.4/6.5) | (a) | `coreAbilities`: `LEADER` (Archon, `leader.attachTo:['drk.kabalite-warriors']`), `DEEP_STRIKE` + `DEADLY_DEMISE` `D3` (Raider, Ravager); Raider `transport:{capacity:11, keywords:['DRUKHARI','INFANTRY'], firingDeck:11}` |
| Weapon abilities (Anti-INFANTRY 3+, Assault, Pistol, Torrent, Heavy, Sustained Hits 1, Twin-linked) | (a) | native; demiklaives share `profileGroup` |
| Ravager Damaged 1–4 (DRU-6.3) | (a) | `damaged:{threshold:4, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| Tormentors (DRU-6.2) | (a) | ability `drk.a.tormentors` `{trigger:'phaseStart', when:{phase:'fight'}, code:'pistonDrivenBrutality'}` — reuse the Ork hook unchanged (one test per canonical enemy unit in ER) |
| Shudderworm Bottle (DRU-3.1) | (a) | enhancement `effect:{trigger:'feelNoPainRoll', when:{leaderAttached:true}, effect:{feelNoPain:5}, scope:{who:'self'}}` (Armour of Faith unit-half shape) |
| Spiteful Predator (DRU-3.2) | (a) | enhancement `effect:{trigger:'always', effect:{shootAfterFallBack:true, chargeAfterFallBack:true}, scope:{who:'self'}}` (Righteous Fury shape, no code) |
| Quicksilver Reactions (DRU-5.1) | (a) | `category:'battleTactic', phases:['shooting','fight'], window:['shooting.targetsDeclared','fight.targetsDeclared'], who:'either', condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}]`, `effect:{modifyRoll:{roll:'hit', value:-1}}`, `scope:{who:'attacker'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'` (= `tyr.s.hyper-reactive`) |
| Many Cuts (DRU-5.2) | (a) | `category:'battleTactic', phases:['shooting','fight'], window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved'], who:'either', condition:{any:[{phase:'shooting', ownTurn:true},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'notYetShot', count:1}]`, `params:{stateByPhase:{shooting:'notYetShot', fight:'notYetFought'}}`, `effect:{when:{targetBelowStartingStrength:true}, grantWeaponAbility:{ability:'SUSTAINED_HITS', value:1}}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'` (Voracious Assault shape, no code) |
| There and Gone (DRU-5.3) | (a)+(b)+(c E3) | stratagem `category:'strategicPloy', phases:['fight'], window:'phase.end', who:'reactive', condition:{phase:'fight', ownTurn:false}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, count:1}, {role:'unit', owner:'friendly', filter:{keyword:'TRANSPORT'}, count:1}]`, `duration:'instant'`, `code:'thereAndGone'`. (b) `thereAndGone`: `kind:'stratagem'`, `hook:'onPhaseEnd'`, `run: noop`; `check(env, t)`: `state.phase === 'fight'`, `state.activePlayer !== env.player`, passenger `t.ids[0]` and transport `t.ids[1]` on board and owned by `env.player`, no model of any half of the passenger within Engagement Range of an enemy model (`anyWithinEngagementRange`), and `transportService.canEmbarkOutOfMove(state, t.ids[0], t.ids[1])` (E3); `apply(ctx, env, t)`: `transportService.embark(ctx.state, t.ids[0], t.ids[1])` (E3 moves every half) and emit `AbilityTriggered` "There and Gone: <unit> embarks in <transport>". |
| Power from Pain — pool, gains (DRU-2.1) | (c E1) | `src/engine/pain.ts` (new) + reducer `emit` listener + battle-start call; see §7.1 |
| Power from Pain — spend / Empower (DRU-2.2, 2.5) | (b) | `powerFromPainSpend`: `kind:'ability'`, `hook:'onPhaseStart'`, `run: noop`, `pick:{window:'movement.start', windows:['shooting.start','charge.start','fight.start'], topic:'abilityChoice', offer, handle}`. `offer(ctx, window, key)`: for `player` of `[activePlayer, other]` (Katah loop): skip if `!hasPowerFromPain(s, player)`, `painTokens(s, player) === 0`, or phase mark `pain:done:<player>` is set; candidates = own canonical board units whose datasheet (either half) lists the `powerFromPain` ability and that are not `isEmpowered(s, id)`; none → push the done mark and continue; else `ctx.decide({kind:'chooseOption', player, window, canPass:false, context:{topic:'abilityChoice', unitId:candidates[0], abilityId:'drk.a.power-from-pain', data:{window, key, code:'powerFromPainSpend'}}, options:[...]})` with one option per candidate (`empower:<unitId>`, label "Empower <name> (N tokens)") plus `done` ("Keep tokens"). **Ordering for the generic AI** (decider is frozen; its `abilityChoice` fallback takes the first option): put the best unit first only when (own Shooting phase and the unit has a ranged weapon with a visible target in range) or (Fight phase and the unit is within Engagement Range of an enemy) or (own Charge phase and the unit is within 12" of an enemy and eligible to charge); otherwise `done` first. `handle`: `done` → push `pain:done:<player>`; `empower:<id>` → validate candidate, `spendPainToken(ctx, player, id)` (E1), then `ctx.services.effects.grant(ctx, id, [{reroll:'all'}], {sourceAbilityId:'drk.a.power-from-pain', sourceUnitId:id, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`, emit `AbilityTriggered` "Power from Pain: <unit> Empowered". The base `offerPicks` re-call after the answer re-offers until `done` or no tokens/candidates, then moves to the other player. |
| Power from Pain — Empowered re-rolls (DRU-2.3, 2.4) | (a)+(b) | ability `drk.a.power-from-pain` `{trigger:'always', code:'powerFromPain'}` on every datasheet and as `armyRule`. (b) `powerFromPain`: `kind:'ability'`, `hook:'onHitRoll'`, `run: noop`, `hooks:['onHitRoll','onAdvanceRoll','onChargeRoll']`, `rerollHooks:['onHitRoll','onAdvanceRoll','onChargeRoll']`, `gate: () => false` (the descriptor itself grants nothing; only the Empower ActiveEffect does), `gateEffect(state, holder, _entry, data)`: `purpose = (data?.roll as RollContext)?.purpose`; phase `movement`/`charge` → `purpose === 'advance' \|\| purpose === 'charge'`; phase `shooting`/`fight` → `purpose === 'hit'` and `(data.attack as AttackContext).attackerUnitId` is the holder (`leaderService.sameUnit`); otherwise false. If `gateEffect` is not consulted for the advance/charge collectors, the hook agent wires it there (test DRU-006). |
| Shadowfield (DRU-6.1) | (a)+(c E2) | datasheet `invuln: 2` + ability `drk.a.shadowfield` `{trigger:'saveRoll', code:'shadowfield'}` (no effect); behaviour in attack.ts, §7.1 E2 |
| Rapacious Raiders (DRU-4.1) | (b, extension) | `scoring:[{id:'rapacious-raiders', when:'turn.end', rounds:{from:1,to:5}, who:'active', rule:'custom', pointsPer:3, cap:999, code:'reclaimAndDominate', params:{keyword:'DRUKHARI', bonusKeyword:'INFANTRY', bonusPoints:4}}]`. Extend `reclaimAndDominateAmount` (missions.ts): when `params.bonusKeyword` is set, keep scanning all qualifying units; return `params.bonusPoints` if any qualifying unit has `bonusKeyword` on either half, else `pointsPer`. Without the param: unchanged (Necrons, CSM). |
| Murderous Monster (DRU-4.2) | (b) | `scoring:[{id:'murderous-monster', when:'phase.end', rounds:{from:1,to:5}, who:'both', rule:'custom', pointsPer:3, cap:999, code:'murderousMonster', params:{keyword:'ARCHON'}}]`; register `murderousMonster: missionHook('murderousMonster', 'onPhaseEnd')`; `customAmount` case calls `murderousMonsterAmount(s, rule, pid)` exported from `factions/drukhari.ts`: `const v = championOfTheDarkGodsAmount(s, rule, pid); return s.phase === 'fight' ? v : 0` — the call runs in **every** phase so `killsThisPhase` is reset each phase end and a Shooting-phase kill never leaks into the Fight phase. |
| Keywords AELDARI / KABAL / BATTLELINE / FLY / DEDICATED TRANSPORT | (a) | keywords only; FLY native |

### 7.1 Engine changes (c) — exact signatures

Built in parallel with the (b) hooks; the hooks code against these. None touches a frozen contract.

**E1 — Pain token pool.** New file `src/engine/pain.ts`:
```ts
export const POWER_FROM_PAIN_CODE = 'powerFromPain'
export const PAIN_TOKENS_KEY = 'painTokens'           // players[p].secondaryState[PAIN_TOKENS_KEY]: number
export const EMPOWERED_KEY = 'empowered'              // players[p].secondaryState[EMPOWERED_KEY]: EmpoweredRecord
export interface EmpoweredRecord { round: number; turn: PlayerId; phase: Phase; unitIds: UnitId[] } // stale when any field differs
// true when any of the player's units (any location) has an ability whose code is POWER_FROM_PAIN_CODE
export function hasPowerFromPain(state: GameState, player: PlayerId): boolean
export function painTokens(state: GameState, player: PlayerId): number               // 0 when unset
export function gainPainToken(ctx: EngineContext, player: PlayerId, source: 'battleStart' | 'unitDestroyed' | 'battleShockFailed'): void
//   +1, emits AbilityTriggered { abilityId: 'drk.a.power-from-pain', summary: 'Pain token gained (<source>): <n>' }
export function spendPainToken(ctx: EngineContext, player: PlayerId, unitId: UnitId): boolean
//   false (no change) when the pool is 0; else -1 and records canonicalUnitId(unitId) in the EmpoweredRecord for now
export function isEmpowered(state: GameState, unitId: UnitId): boolean            // current-phase record, sameUnit compare
export function startBattlePain(ctx: EngineContext): void                          // gainPainToken(…,'battleStart') per player with the ability
export function onPainEvent(ctx: EngineContext, e: { type: string; unitId?: UnitId; passed?: boolean }): void
```
- reducer.ts `emit`: next to `onOwnUnitDestroyed`, call `onPainEvent(ctx, e)` for `UnitDestroyed` (the destroyed unit's
  opponent gains 1 if `hasPowerFromPain`) and for `BattleShockTested` with `passed === false` (same rule).
- `startBattlePain` runs once, just before the round-1 `round.start` window (guard with `ctx.once('pain:battleStart')`).
- Mirror match: each player keeps an independent pool.
- Client (later, not this spec's work): show each player's pool in the HUD from `secondaryState.painTokens`.

**E2 — Single-failure invulnerable save** (Shadowfield). `src/engine/attack.ts` (helpers may live in `pain.ts`'s
sibling `src/engine/fragile-invuln.ts`):
```ts
export const FRAGILE_INVULN_CODE = 'shadowfield'
// the model's datasheet lists an ability with code FRAGILE_INVULN_CODE
export function hasFragileInvuln(state: GameState, modelId: ModelId): boolean
// players[owner].oncePerBattleUsed includes `shadowfield:lost:<modelId>`
export function fragileInvulnLost(state: GameState, modelId: ModelId): boolean
// pushes that key and emits AbilityTriggered '<model>: invulnerable save lost for the battle'
export function loseFragileInvuln(ctx: EngineContext, modelId: ModelId): void
```
- Save setup (`let invuln = datasheetOf(...).invuln`, attack.ts ~790): use `null` when `fragileInvulnLost`.
- Save roll (`rollOnce('save:…')`, ~865): `commandRerollable: !(kind === 'invuln' && hasFragileInvuln(s, modelId))`;
  any `reroll` hook result on that save is ignored likewise.
- After `evaluateSave`: `kind === 'invuln' && !ev.saved && hasFragileInvuln(...) && !fragileInvulnLost(...)` →
  `loseFragileInvuln`.
- Fast-rolled saves (`leadBatch` path): a model with `hasFragileInvuln` is never part of a shared batch roll (its saves
  roll singly), so both rules above always apply.

**E3 — Attached unit in a transport** (Archon + Kabalites). `src/engine/transports.ts`, `state.ts`, `movement.ts`,
`shooting.ts`:
```ts
// every half of the (possibly attached) unit, canonical first; a plain unit returns [unitId]
export function passengerHalves(state: GameState, passengerUnitId: UnitId): UnitId[]
// TransportService additions
canEmbarkOutOfMove(state: GameState, unitId: UnitId, transportUnitId: UnitId): boolean
//   stratagem embark (There and Gone): both on board, same owner, canCarry, every model of every half within 3"
//   of a transport model, not disembarked this phase. Ignores turn.moveType / arrivedThisTurn (it is not a move).
```
- `canCarry`: drop the "attached unit refused" rule; keyword gates apply to every half; model count = sum over halves;
  used capacity sums `embarkedIn` excluding every half of the passenger.
- `embark` / `disembark`: act on every half (map entry, `embarkedAt` / `disembarkedAt`, `location`); the attach links
  (`attachedLeaderId` / `bodyguardUnitId`) are kept untouched. `embarkedIn` returns every half.
- movement.ts disembark: the canonical unit is activated; placements cover the models of every half, all validated by
  `canDisembarkAt`. `emergencyDisembark` places every half.
- state.ts setup: allow an attached unit in `setup.players[pid].embarked` (drop the attached-unit invariant; keep the
  "not also in Reserves" one).
- shooting.ts `firingDeckWeapons`: lists models of every embarked half.
- `canEmbark` (end-of-move embark) gains the same multi-half behaviour through `canCarry`.

## 8. Test IDs

Same list as the `DRU` section of 12-rules-test-checklist. Engine tests: `tests/engine/drukhari.test.ts`; data tests:
`tests/data/drukhari.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| DRU-001 | DRU-1 | patrol `drk.cp.blades-of-torment` loads (faction `drukhari`): 5 units, 18 models; Archon is WARLORD with Shudderworm Bottle, attached to the Kabalite Warriors; default secondary Rapacious Raiders; stratagems are the three `drk.s.*` ids; start screen lists Drukhari |
| DRU-002 | DRU-6 | data: every stat/profile row of §6 matches (incl. splinter cannon BS 4+, Klaivex W2, Archon 2+ invuln); every datasheet has faction keyword DRUKHARI and keyword AELDARI; Raider transport capacity 11 DRUKHARI INFANTRY, Firing Deck 11 |
| DRU-003 | DRU-2.1, E1 | Pain pool: each Drukhari player starts the battle with 1; +1 when an enemy unit is destroyed (each half of an attached unit counts); +1 when an enemy unit fails a Battle-shock test; own unit destroyed or enemy passing the test → no gain; non-Drukhari opponent has no pool |
| DRU-004 | DRU-2.2, 2.5 | Empower offer: at the start of the Movement / Shooting / Charge / Fight phase (either turn) a player with tokens gets a chooseOption listing own on-board units + Keep tokens; none at command.start; 0 tokens → no offer; a unit Empowered this phase is not listed again; spending decrements the pool; both players are offered in a mirror match |
| DRU-005 | DRU-2.4 | Empowered in own Shooting phase: Kabalite rifle misses are re-rolled; in the opponent's Fight phase an Empowered unit fighting back re-rolls hits; non-Empowered unit does not; expires at end of phase |
| DRU-006 | DRU-2.3 | Empowered in Movement phase: Advance roll re-roll offered; in Charge phase: a short Charge roll is re-rolled; Empowered in the opponent's Movement phase and firing Overwatch → no hit re-roll |
| DRU-007 | DRU-3.1 | Shudderworm Bottle: Archon leading Kabalites → each Kabalite and the Archon roll FNP 5+ per lost wound; Archon detached → no FNP for anyone |
| DRU-008 | DRU-3.2 | Spiteful Predator: Archon's unit Falls Back → may shoot and may declare a charge that turn; without the enhancement → neither |
| DRU-009 | DRU-4.1 | Rapacious Raiders: end of own turn, Kabalites wholly in the opponent's zone → 4 VP; only the Ravager wholly in → 3 VP; Raider + Incubi both in → 4 (not 7); one model straddling the line → 0 |
| DRU-010 | DRU-4.1 | Rapacious Raiders: qualifying unit Battle-shocked → 0; attached unit with either half Battle-shocked → 0; unit embarked in a Raider that is in the zone → only the Raider counts (3 VP); end of the opponent's turn → 0; Necrons Reclaim and Dominate / CSM Idolatrous Despoilers amounts unchanged |
| DRU-011 | DRU-4.2 | Murderous Monster: Archon kills an enemy model in the Fight phase (either turn) → 3 VP at the end of that phase; kills in two Fight phases → 3 + 3 |
| DRU-012 | DRU-4.2 | Murderous Monster: only Kabalites kill → 0; Archon kills in the Shooting phase only → 0 at end of Shooting and 0 at end of the following Fight phase (no leak); Rapacious Raiders chosen → never scores |
| DRU-013 | DRU-5.1 | Quicksilver Reactions: opponent's Shooting phase, enemy targets Kabalites → offered; used → every attack on them −1 to hit until end of phase; in the Drukhari's own Fight phase an enemy unit targets Incubi → offered |
| DRU-014 | DRU-5.1 | Quicksilver Reactions not offered: Drukhari's own Shooting phase; untargeted unit; Raider/Ravager (not INFANTRY); second use in the same phase |
| DRU-015 | DRU-5.2 | Many Cuts: own Shooting phase, Kabalites not yet shot → offered; vs a target below Starting Strength the splinter rifles get Sustained Hits 1 (a critical hit → 1 extra hit); vs a full-strength target → none; splinter cannon SH1 does not become SH2 |
| DRU-016 | DRU-5.2 | Many Cuts in the Fight phase of either turn for Incubi not yet fought → offered; not offered for a unit that already shot / fought this phase, nor in the opponent's Shooting phase |
| DRU-017 | DRU-5.3, E3 | There and Gone: end of the opponent's Fight phase, Incubi wholly within 3" of the Raider and out of ER → offered; used → Incubi embarked (location reserves, linked to the Raider); next own Movement phase they may disembark |
| DRU-018 | DRU-5.3 | There and Gone not offered: unit in Engagement Range; a model more than 3" from the transport; capacity short (Kabalites 10 + Incubi 5 > 11); own Fight phase; Ravager as transport (not TRANSPORT) |
| DRU-019 | E3 | Attached transport: Archon + Kabalites (11 models) embark after a Normal move and via There and Gone; both halves leave the board together and disembark together within 3"; may start embarked at setup; Firing Deck 11 lists weapons of both halves; Raider destroyed → both halves emergency-disembark; attach link kept |
| DRU-020 | DRU-6.1, E2 | Shadowfield: Archon invulnerable 2+ used vs AP −1; a failed invuln save cannot be Command Re-rolled; after the first failure later saves use Sv 4+ (with AP) for the rest of the battle; a failed armour save or a mortal wound does not consume it |
| DRU-021 | DRU-6.2 | Tormentors: start of the Fight phase (either turn), each enemy unit in Engagement Range of the Incubi takes one Battle-shock test; a failure gives the Drukhari player a Pain token; units not in ER are not tested |
| DRU-022 | DRU-6.3 | Ravager at 4 wounds remaining: hit rolls −1 (dark lance hits on 4+); at 5 → no penalty |
| DRU-023 | DRU-6.4 | Raider: Firing Deck 11 — embarked Kabalites' rifles fire through the Raider; non-DRUKHARI or non-INFANTRY units cannot embark |
| DRU-024 | DRU-6 | Splinter weapons: Anti-INFANTRY 3+ — unmodified wound 3 vs INFANTRY is a critical wound (wounds T3–T10 alike); vs VEHICLE wounds as S2 |
| DRU-025 | DRU-6 | Shredder Torrent auto-hits D6 attacks; Klaivex picks single or dual demiklaive profile per fight, dual is Twin-linked; dark lance damage D6+2 |
| DRU-026 | DRU-6.5 | Raider / Ravager Deep Strike from round 2 only (>9" from enemies); Deadly Demise D3 on destruction |
| DRU-027 | E1 | Regression: Pain pool and Empowered record in `secondaryState` keep replay hashes deterministic (same seed + actions → same hash); non-Drukhari games create no `painTokens` key |

## 9. Figures

Heights follow 30-figures (infantry ≈ 1.1", true-scale to 28 mm); bases rules-true. Figure kits: infantry use
`{archetype:'infantry', kit:'generic-infantry'}`, vehicles `{archetype:'vehicle', kit:'generic-vehicle'}` until GLBs
exist. Paint: dark teal-black armour `#1d2a2e`, jade `#3fae9a`, deep wine `#7a1f3d`, pale steel. No logos or glyphs.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `archon` | `drk.archon/archon` | 1 | 1.2 | 25 mm | A chibi slender tyrant-lord in spiky dark teal-black armour with a tall crested helm, a long flowing wine-red cape, a curved hooked sword in one hand, a small needle pistol in the other, and a faint shimmering dark aura bubble around him. |
| `kabalite-sybarite` | `drk.kabalite-warriors/sybarite` | 1 | 1.15 | 25 mm | A chibi lean raider-captain in segmented teal-black plate with jade trim, a flared crested helmet, a short wicked blade raised and a slim pistol at the hip. |
| `kabalite-warrior` | `drk.kabalite-warriors/warrior` | 7 | 1.1 | 25 mm | A chibi lean pirate-soldier in spiky teal-black armour with jade panels and a pointed visor helmet, holding a long thin bladed rifle with a glowing green crystal along the barrel. |
| `kabalite-shredder` | `drk.kabalite-warriors/shredder-warrior` | 1 | 1.1 | 25 mm | The same chibi pirate-soldier holding a stubby wide-mouthed net-launcher gun with a coiled jade-wire drum. |
| `kabalite-splinter-cannon` | `drk.kabalite-warriors/cannon-warrior` | 1 | 1.1 | 25 mm | The same chibi pirate-soldier bracing a long heavy multi-barrel needle cannon with jade crystal coils on his hip. |
| `incubi-klaivex` | `drk.incubi/klaivex` | 1 | 1.2 | 28 mm | A chibi grim temple-warrior in heavy layered dark armour with a tall crested topknot helm and wine-red tabard, wielding a pair of long curved blades crossed in front. |
| `incubus` | `drk.incubi/incubus` | 4 | 1.15 | 28 mm | A chibi grim temple-warrior in heavy layered dark armour with a horned crested helm and wine-red tabard, gripping a huge two-handed curved greatblade. |
| `raider` | `drk.raider/raider` | 1 | 2.3 | 60 mm flying base | A chibi sleek knife-shaped open-deck skiff with swept teal-black hull, jade sail fins, hooked blade-vanes along the prow, a long thin cannon on the front, hovering on a slim stand. |
| `ravager` | `drk.ravager/ravager` | 1 | 2.4 | hull oval 170 × 90 mm | A chibi sleek knife-shaped gunboat with a teal-black hull, jade fins and wine-red trim, three long thin cannons on swivel mounts along an open deck, spiked keel blades, hovering on a slim stand. |

## 10. Other Drukhari patrols (appendix)

- None. The wahapedia CP navigation (2026-10-15) lists only The Blades of Torment (Index, June 2023) for Drukhari.

## 11. Open points

- Ravager base: the page says "use model"; 170 × 90 mm oval is our hull estimate. The Raider (same hull family) is
  printed as a 60 mm flying base and is kept 1:1.
- Klaivex W2: the page layout around the Klaivex line is ambiguous; W2 is the reading confirmed by two fetches.
- Splinter cannon BS 4+ is as printed (confirmed twice), though the Warriors' BS is 3+.
- DRU-2.5 interpretations (no Command-phase spend, board units only, no double Empower, no Overwatch re-roll).
- DRU-6.5: Raider cannot Deep Strike with passengers (existing setup rule).
