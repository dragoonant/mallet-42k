# Faction spec — Blood Angels: Strike Force Marcellos

Own-words data spec for the Blood Angels Combat Patrol, same shape as 11-combat-patrol §4. Rule ids `BLO-<section>.<n>`
are cited by the `BLO-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every sentence of prose
here is ours (no GW text copied).

Blood Angels is a Space Marine chapter that ships as its **own faction** on the start screen (owner default):
faction id `blood-angels`, data id prefix `ba.`, faction keywords ADEPTUS ASTARTES + BLOOD ANGELS. Everything that is
identical to the existing Space Marines data (`src/data/factions/space-marines`, faction id `sm`) is **cited by its
existing id and reused** (the data bundle indexes abilities/weapons globally, and stratagem ownership is patrol-scoped
through `Player.stratagemIds`, so a `ba` patrol may reference `sm.*` records). Only differences get new `ba.*` ids.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Strike Force Marcellos (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/strike-force-marcellos/ | Book "Strike Force Marcellos", **Index, June 2023** (version field blank) |
| Haywire mine rule (not printed on the CP page — see BLO-6.4) | https://wahapedia.ru/wh40k10ed/factions/space-marines/Incursor-Squad | matched-play Incursor datasheet, current |
| Existing SM patrol specs | docs/spec/11-combat-patrol.md §4; docs/spec/factions/space-marines--strike-team-solarien.md | — |

The wahapedia CP index and the chapter sub-page returned 403/404 on this run; the Solarien spec (§10, same date)
lists Strike Force Marcellos as the only Blood Angels patrol on wahapedia's Adeptus Astartes list (see §10).

## 1. Roster

5 datasheets, **15 models** (as boxed). Faction keywords ADEPTUS ASTARTES, BLOOD ANGELS; every unit is IMPERIUM.

| Ref | Datasheet id | Models | Wargear as built (fixed, no options) | Leader / notes |
|---|---|---|---|---|
| `librarian-marcellos` | `ba.librarian-marcellos` (new) | 1 | bolt pistol, Smite (2 profiles), force weapon | **WARLORD**; default enhancement Baalite Bladesman; Leader → Intercessor Squad only |
| `intercessor-squad` | `ba.intercessor-squad` (new) | 5 | Sergeant: bolt pistol, Astartes chainsword. 4 Intercessors: bolt rifle, bolt pistol, close combat weapon | bodyguard for Marcellos |
| `incursor-squad` | `ba.incursor-squad` (new) | 5 | Sergeant + 4 Incursors: bolt pistol, occulus bolt carbine, paired combat blades; **one** Incursor also carries a haywire mine | Scouts 6" |
| `aggressor-squad` | `ba.aggressor-squad` (new) | 3 | each: flamestorm gauntlets, twin power fists | GRAVIS — cannot ride the Impulsor |
| `impulsor` | `ba.impulsor` (new) | 1 | Bellicatus missile array (3 profiles), 2 storm bolters, armoured hull | DEDICATED TRANSPORT, capacity 6 |

- BLO-1.1 Default attachment: Marcellos → Intercessor Squad (patrol `attachTo: 'intercessor-squad'`); the setup UI may
  leave him unattached. He may lead no other unit.
- BLO-1.2 Datasheet model ids: Intercessor `sergeant` ×1, `intercessor` ×4; Incursor `sergeant` ×1, `incursor` ×3,
  `incursor-haywire` ×1 (the haywire bearer is its own model id so BLO-6.4 can find it); Aggressor `aggressor` ×3;
  Impulsor `impulsor` ×1; Marcellos `marcellos` ×1.
- BLO-1.3 Patrol id `ba.cp.strike-force-marcellos`; detachment `ba.d.strike-force-marcellos`; `faction.json`:
  `{id:'blood-angels', name:'Blood Angels', factionKeyword:'ADEPTUS ASTARTES', armyRule:'sm.a.oath-of-moment',
  combatPatrols:['ba.cp.strike-force-marcellos'], paintScheme:{primary:'#9e1b1b', secondary:'#c9a227', trim:'#1a1a1a', …}}`.

## 2. Faction ability — Oath of Moment (every datasheet)

- BLO-2.1 Identical to CP-4.1: reuse `sm.a.oath-of-moment` (code `oathOfMomentPick`) on all five datasheets, the
  Impulsor included. Nothing new.

## 3. Enhancements (Librarian Marcellos, WARLORD)

| Id | Name | Default? | Effect (own words) |
|---|---|---|---|
| `ba.e.baalite-bladesman` | Baalite Bladesman | default | BLO-3.1 Every melee weapon carried by a model in the bearer's unit (attached Intercessors included) has its AP improved by 1 (force weapon −1→−2, Astartes chainsword −1→−2, close combat weapon 0→−1). |
| `ba.e.radiant-wrath` | Radiant Wrath (Psychic) | optional | BLO-3.2 Both of the bearer's Smite profiles gain [ANTI-MONSTER 5+] and [ANTI-VEHICLE 5+]. Other weapons are unaffected. |

Both: `restriction: {keyword: ['LIBRARIAN']}`. Exactly one is taken (CP-1.4).

## 4. Secondary objectives

| Id | Name | Default? | Scoring |
|---|---|---|---|
| `ba.sec.angelic-wrath` | Angelic Wrath | default | BLO-4.1 At the end of every **opponent's** turn (rounds 1–5): 4 VP if you control ≥1 objective marker that lies inside, or within 6" of, the opponent's deployment zone. At most 4 VP per turn end however many markers qualify. |
| `ba.sec.strategic-aggression` | Strategic Aggression | optional | BLO-4.2 At the start of battle round 1 you pick one enemy MONSTER or VEHICLE **model**; if the enemy has none, one enemy CHARACTER model instead (none of either → no pick, 0 VP). At the end of the battle: 10 VP if that model has been destroyed (by anything). |

## 5. Patrol stratagems

| Id | Name | CP | Window | Target | Effect |
|---|---|---|---|---|---|
| `ba.s.controlled-ferocity` | Controlled Ferocity (Battle Tactic) | 1 | BLO-5.1 any Fight phase, just after an enemy unit has picked its targets (`fight.targetsDeclared`, `who:'either'`) | one own ADEPTUS ASTARTES INFANTRY unit that the enemy unit picked as a target | until the end of the phase, attacks against your unit get −1 to the Hit roll |
| `ba.s.harness-the-flaw` | Harness the Flaw (Battle Tactic) | 1 | BLO-5.2 any Fight phase (`[fight.start, fight.attacksResolved]`, between activations, `who:'either'`) | one own ADEPTUS ASTARTES INFANTRY unit not yet selected to fight this phase | until the end of the phase its attacks re-roll Wound rolls of 1; against a MONSTER or VEHICLE target they may re-roll the Wound roll instead |
| `ba.s.rapid-strike` | Rapid Strike (Strategic Ploy) | 1 | BLO-5.3 end of your Shooting phase (`phase.end`, own turn) | one own INTERCESSOR SQUAD or INCURSOR SQUAD unit (an attached Marcellos moves with it) not within Engagement Range of any enemy | the unit makes a Normal move (up to its M); it may not embark into a TRANSPORT at the end of that move. Restriction: it cannot declare a charge for the rest of the turn. |

Core stratagems per the page: all units except the Impulsor may use the infantry list; Marcellos may use Epic
Challenge (CHARACTER); the Incursors may use Smokescreen (SMOKE); the Impulsor may use Tank Shock (VEHICLE). All are
already keyword-gated in core data — no change.

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Librarian Marcellos | 1 | 40 mm | 6 | 4 | 3+ | — (4+ while leading, BLO-6.1) | 4 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, IMPERIUM, TACTICUS, LIBRARIAN, MARCELLOS | Leader → Intercessor Squad; Oath of Moment; Mental Fortress (Psychic) |
| Intercessor Squad | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | **2** | INFANTRY, BATTLELINE, IMPERIUM, TACTICUS, INTERCESSOR SQUAD | Oath of Moment |
| Incursor Squad | 5 | 32 mm | 6 | 4 | 3+ | — | 2 | 6+ | 1 | INFANTRY, SMOKE, IMPERIUM, PHOBOS, INCURSOR SQUAD | Scouts 6"; Oath of Moment; Multi-spectrum Array; Haywire Mine (wargear) |
| Aggressor Squad | 3 | 40 mm | 5 | 6 | 3+ | — | 3 | 6+ | 1 | INFANTRY, IMPERIUM, GRAVIS, AGGRESSOR SQUAD | Oath of Moment |
| Impulsor | 1 | 100 mm (see issues) | 12 | 9 | 3+ | — | 11 | 6+ | 2 | VEHICLE, TRANSPORT, DEDICATED TRANSPORT, IMPERIUM, IMPULSOR | Deadly Demise D3; Firing Deck 6; Oath of Moment; Transport |

Faction keywords (all): ADEPTUS ASTARTES, BLOOD ANGELS.

Abilities (own words):
- BLO-6.1 **Mental Fortress** (`ba.a.mental-fortress`, Psychic): while Marcellos is leading a unit, every model of that
  unit (Marcellos included) has a 4+ invulnerable save. Unattached, nobody gains it (Marcellos has no invuln of his own).
- BLO-6.2 **Multi-spectrum Array** (`ba.a.multi-spectrum-array`): in your Shooting phase, just after this unit has shot,
  pick one enemy unit it hit with ≥1 attack this phase. Until the end of that phase, attacks by friendly ADEPTUS
  ASTARTES models against that enemy unit get +1 to the Hit roll (R-6 ±1 cap applies). Not after Overwatch; not when
  the squad's weapons were fired through the Impulsor's Firing Deck (the Impulsor shot, not the squad).
- BLO-6.3 **Transport** (Impulsor): capacity 6 models; only TACTICUS or PHOBOS INFANTRY may embark (here: Marcellos,
  Intercessors, Incursors; never the GRAVIS Aggressors). **Firing Deck 6**, **Deadly Demise D3** — native.
- BLO-6.4 **Haywire Mine** (`ba.a.haywire-mine`, wargear of the `incursor-haywire` model): once per battle, at the
  start of any phase (either player's turn: Command, Movement, Shooting, Charge, Fight), while that model is alive,
  you may pick one enemy unit within 3" of it and roll a D6: on 2+ the unit suffers D3 mortal wounds, or 2D3 if it is
  a VEHICLE. Optional. Source caveat: the CP page lists the mine in the loadout but prints no rule; this is the
  matched-play wargear rule (see issues).
- Core: Leader, Scouts 6", Deadly Demise D3, Firing Deck 6 are native (`coreAbilities` / `transport.firingDeck`).
  Scouts on an attached unit is unaffected here (Marcellos cannot lead the Incursors).

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Librarian Marcellos | — | bolt pistol, Smite (2 profiles) | force weapon |
| Intercessor Squad | Sergeant | bolt pistol | Astartes chainsword |
| Intercessor Squad | Intercessor ×4 | bolt rifle, bolt pistol | close combat weapon |
| Incursor Squad | Sergeant, Incursor ×3, Incursor (haywire) ×1 | bolt pistol, occulus bolt carbine | paired combat blades |
| Aggressor Squad | ×3 | flamestorm gauntlets | twin power fists |
| Impulsor | — | Bellicatus missile array (frag / icarus / krak — pick one profile per shooting), storm bolter ×2 | armoured hull |

Weapon profiles (reused ids marked; every reused profile was checked equal to the CP page):
| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `sm.w.bolt-pistol` (reuse) | bolt pistol | 12" | 1 | 3+ | 4 | 0 | 1 | Pistol |
| `sm.w.smite` (reuse) | Smite — witchfire | 24" | D6 | 3+ | 5 | −1 | D3 | Psychic (+Anti-MONSTER 5+, Anti-VEHICLE 5+ with Radiant Wrath) |
| `sm.w.smite-focused` (reuse) | Smite — focused witchfire | 24" | D6 | 3+ | 6 | −2 | D3 | Psychic, Devastating Wounds, Hazardous (+Radiant Wrath as above) |
| `sm.w.force-weapon` (reuse) | force weapon | melee | 4 | 3+ | 6 | −1 | D3 | Psychic |
| `sm.w.close-combat-weapon` (reuse) | close combat weapon | melee | 3 | 3+ | 4 | 0 | 1 | — |
| `sm.w.storm-bolter` (reuse) | storm bolter | 24" | 2 | 3+ | 4 | 0 | 1 | Rapid Fire 2 |
| `ba.w.bolt-rifle` (new) | bolt rifle | 24" | 2 | 3+ | 4 | −1 | 1 | Assault, Heavy |
| `ba.w.astartes-chainsword` (new) | Astartes chainsword | melee | 5 | 3+ | 4 | −1 | 1 | — |
| `ba.w.occulus-bolt-carbine` (new) | occulus bolt carbine | 24" | 2 | 3+ | 4 | 0 | 1 | Assault, Ignores Cover |
| `ba.w.paired-combat-blades` (new; Solarien's `sm.w.paired-combat-blades` is A5 WS2+) | paired combat blades | melee | 3 | 3+ | 4 | 0 | 1 | Sustained Hits 1 |
| `ba.w.flamestorm-gauntlets` (new) | flamestorm gauntlets | 12" | D6+1 | n/a | 4 | 0 | 1 | Ignores Cover, Torrent, Twin-linked |
| `ba.w.twin-power-fists` (new; `sm.w.power-fist` is WS3+, no Twin-linked) | twin power fists | melee | 3 | 4+ | 8 | −2 | 2 | Twin-linked |
| `ba.w.bellicatus-frag` (new) | Bellicatus missile array — frag | 48" | D6 | 3+ | 4 | 0 | 1 | Blast |
| `ba.w.bellicatus-icarus` (new) | Bellicatus missile array — icarus | 48" | D3 | 3+ | 8 | −1 | 2 | Anti-FLY 2+ |
| `ba.w.bellicatus-krak` (new) | Bellicatus missile array — krak | 48" | 1 | 3+ | 8 | −2 | D6 | — |
| `ba.w.armoured-hull` (new) | armoured hull | melee | 3 | 4+ | 6 | 0 | 1 | — |

The three Bellicatus profiles share one `profileGroup` (one profile per shooting, like Smite).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9) or an existing hook reused as-is; (b) = new code hook
(or param extension of an existing one) in `src/engine/factions/blood-angels.ts` (new file, exported as
`bloodAngelsHooks`, spread into `codeHooks` in `code-hooks.ts`); (c) = engine change beyond a code hook.

**No (c) change is required and no frozen contract (`src/engine/{types,actions,events,hooks,rng,decider,index}.ts`)
changes.** Signals reuse existing events (`AbilityTriggered`, `VpScored`, `UnitMoved`) and the `queueMortals` path.
Reused mechanisms: `oathOfMomentPick`, `veteranInstincts` (declarative), `chitinousTide` (Tyranids, marker within N" of
the enemy zone), `bagPick` / `bagTheBigUnScore` (Orks Morgrim's Butchas, model pick + end-of-battle score),
`startReactiveMove` + `forbid:'charge'` (T'au `rapidRepositioning`), GSC `masterOfSuppression` pick pattern and
`hitBy:` phase marks, `queueMortals` + `mortalCredit` (`grenadeMortalWounds`), `oncePerBattleUsed` (Tyranid Shadow in
the Warp), `wargearBearerAlive`-style `params.modelId` bearer lookup, transport `keywords`/`excludeKeywords`/`firingDeck`.

| Rule | Enc. | Encoding |
|---|---|---|
| Faction registration (BLO-1.3) | (a) | `src/data/factions/blood-angels/{faction,abilities,weapons,stratagems,enhancements}.json`, `datasheets/*.json`, `patrols/strike-force-marcellos.json`; datasheet `faction:'blood-angels'`, `factionKeywords:['ADEPTUS ASTARTES','BLOOD ANGELS']`. Client wiring only: `StartScreen.tsx FACTION_ORDER` + `store/game.ts FACTION_ID` gain `'blood-angels'`; no engine code. |
| Oath of Moment (BLO-2.1) | (a) | reuse `sm.a.oath-of-moment` on every datasheet; `armyRule:'sm.a.oath-of-moment'` |
| Leader (BLO-1.1) | (a) | `coreAbilities:[{ability:'LEADER'}]`, `leader.attachTo:['ba.intercessor-squad']`; patrol `attachTo:'intercessor-squad'` |
| Scouts 6", Deadly Demise D3 | (a) | `coreAbilities` `SCOUTS` (6) on Incursors; `DEADLY_DEMISE` (`'D3'`) on Impulsor |
| Transport + Firing Deck 6 (BLO-6.3) | (a) | `transport:{capacity:6, keywords:['ADEPTUS ASTARTES','INFANTRY'], excludeKeywords:['GRAVIS','TERMINATOR','JUMP PACK'], firingDeck:6}` — `keywords` is all-of, so "TACTICUS or PHOBOS" is expressed by exclusion; exact for this roster (every non-GRAVIS infantry here is TACTICUS or PHOBOS). Existing limit: an **attached** Marcellos + Intercessors is refused by `transportService.canCarry` (combined-unit embark not built); each may embark separately. See issues. |
| Baalite Bladesman (BLO-3.1) | (a) | enhancement effect `{trigger:'always', effect:{when:{weaponType:'melee'}, modifyStat:{stat:'AP', value:-1}}, scope:{who:'self'}}` |
| Radiant Wrath (BLO-3.2) | (a) | `{trigger:'always', scope:{who:'bearer'}, effect:[{when:{weaponId:'sm.w.smite'}, grantWeaponAbility:{ability:'ANTI', keyword:'MONSTER', value:5}}, {when:{weaponId:'sm.w.smite'}, grantWeaponAbility:{ability:'ANTI', keyword:'VEHICLE', value:5}}, same two for `sm.w.smite-focused`]` |
| Angelic Wrath (BLO-4.1) | (a) | reuse Tyranid code: `scoring:[{id:'angelic-wrath', when:'turn.end', rounds:{from:1,to:5}, who:'opponent', rule:'custom', code:'chitinousTide', pointsPer:4, cap:4, params:{withinInches:6}}]` (`chitinousTideAmount`: any controlled live marker inside the enemy zone or whose edge is ≤6" from it → flat `pointsPer`) |
| Strategic Aggression (BLO-4.2) | (b) small | reuse `bagPick` + `bagTheBigUnScore`: `scoring:[{id:'aggression-pick', when:'round.start', rounds:{from:1,to:1}, rule:'custom', pointsPer:0, cap:0, code:'bagPick', params:{fallbackKeyword:'CHARACTER'}}, {id:'aggression-score', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', pointsPer:0, cap:10, code:'bagTheBigUnScore', params:{unitPoints:10, beastbossPoints:10}}]`. **Param extension** in `missions.ts bagPickRule`: when `rule.params.fallbackKeyword` is a string and the opponent has no live MONSTER/VEHICLE unit, candidates = every non-destroyed enemy unit with that keyword (each model an option) instead of the enemy WARLORD unit; absent param → unchanged Morgrim behaviour. Equal unit/beastboss points make the killer irrelevant. |
| Controlled Ferocity (BLO-5.1) | (a) | stratagem `phases:['fight'], window:'fight.targetsDeclared', who:'either', condition:{phase:'fight'}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}, state:'targetedByAttack', count:1}]` (every own unit is ADEPTUS ASTARTES, so INFANTRY is exact), `effect:{modifyRoll:{roll:'hit', value:-1}}`, `scope:{who:'attacker'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'` (shape of `sm.s.gene-wrought-resilience`) |
| Harness the Flaw (BLO-5.2) | (a) | copy of `sm.s.veteran-instincts` with `filter:{keyword:'INFANTRY'}`: `window:['fight.start','fight.attacksResolved'], who:'either', state:'notYetFought', effect:[{when:{targetKeyword:['MONSTER','VEHICLE']}, reroll:'all'}, {reroll:'ones'}], scope:{who:'self'}, duration:'untilEndOfPhase', code:'veteranInstincts'` |
| Rapid Strike (BLO-5.3) | (b) | stratagem `phases:['shooting'], window:'phase.end', who:'active', condition:{phase:'shooting', ownTurn:true}`, targets `[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS ASTARTES'}, count:1}]`, `effect:{forbid:'charge'}, scope:{who:'self'}, duration:'untilEndOfTurn'`, `code:'rapidStrike'`, `params:{keywords:['INTERCESSOR SQUAD','INCURSOR SQUAD']}`. New hook **`rapidStrike`** (`kind:'stratagem'`, `hook:'onPhaseEnd'`, pattern T'au `rapidRepositioning`): `check(env,t)`: `state.phase === 'shooting'`, target on board and owned by `env.player`, some half (`leaderService.halves`) has a keyword in `params.keywords`, `!leaderService.inEngagementWithEnemy(state, id)`. `apply(ctx,env,t)`: `id = canonicalUnitId`; `distance` = the lowest current M (`hookService` stat query, modifiers applied) over the unit's live models; `startReactiveMove(ctx, id, distance, env.stratagem.id, 'phase.end')`. The reactive move never offers embarkation, which satisfies "cannot embark". |
| Mental Fortress (BLO-6.1) | (a) | ability `{trigger:'always', when:{leaderAttached:true}, effect:{invuln:4}, scope:{who:'self'}}` on Marcellos (pattern `sm.a.veil-of-time` + `leaderAttached`) |
| Multi-spectrum Array (BLO-6.2) | (b) | ability `{trigger:'unitSelectedToShoot', code:'multiSpectrumArray'}` on Incursors. New hook **`multiSpectrumArray`** (`kind:'ability'`, `hook:'onUnitSelectedToShoot'`, `pick:{window:'shooting.attacksResolved', topic:'abilityChoice'}`, pattern GSC `masterOfSuppression`): **offer(ctx, window, key)**: `phase === 'shooting'`; `key` unit on board, its canonical unit contains a half holding this ability, owner === `activePlayer`; mark `pick:msa:<round>:<canon>` absent (push it); candidates = enemy canonical units hit this phase by any weapon of that unit (parse `hitBy:<canon>:<weaponId>:<target>` phase marks, local `unitsHitByUnit` helper as in genestealer-cults.ts) still with a half on board. 0 → return false; 1 → apply directly, return false; >1 → `chooseOption` over candidates (no decline — it is pure upside), return true. **apply / handle**: for each board half `h` of the chosen unit `ctx.services.effects.grant(ctx, h, [{when:{attackerKeyword:'ADEPTUS ASTARTES'}, modifyRoll:{roll:'hit', value:1}}], {sourceAbilityId, sourceUnitId: canon, scope:{who:'attacker'}, duration:'untilEndOfPhase', when:null})`; emit `AbilityTriggered` "marked by the multi-spectrum array". |
| Haywire Mine (BLO-6.4) | (b) | ability `{trigger:'always', code:'haywireMine', params:{modelId:'incursor-haywire', range:3, roll:2, damage:'D3', vehicleDamage:'2D3'}}` on Incursors. New hook **`haywireMine`** (`kind:'ability'`, `hook:'onPhaseStart'`, `pick:{window:'command.start', windows:['movement.start','shooting.start','charge.start','fight.start'], topic:'abilityChoice'}`, pattern Tyranid `shadowOffer`): **offer**: for each player (active first) — holder unit on board with a **live model whose `datasheetModelId === params.modelId`**, `oncePerBattleUsed` lacks the ability id, mark `pick:haywire:<round>:<phase>:<player>` absent; candidates = enemy canonical units with any board model within `params.range` (horizontal base-to-base, `geometry.distance`) of the bearer model; none → skip. Raise `chooseOption` (candidates + `decline`). **handle**: `decline` → nothing (offered again next phase). Unit → push ability id to `oncePerBattleUsed`; roll 1D6 (`purpose:'ability'`); on ≥`params.roll` roll the damage expression (`vehicleDamage` when any half has VEHICLE) and `queueMortals(ctx, canon, n, abilityId, mortalCredit(state, bearerUnitId))`; emit `AbilityTriggered`. A 1 still spends the mine. |
| Weapon abilities (Pistol, Assault, Heavy, Rapid Fire, Blast, Torrent, Twin-linked, Ignores Cover, Sustained Hits, Anti-X, Psychic, Devastating Wounds, Hazardous) | (a) | native weapon abilities |
| BATTLELINE, SMOKE, GRAVIS, PSYKER, TACTICUS, PHOBOS | (a) | keywords only (SMOKE gates Smokescreen; GRAVIS excluded from the Impulsor) |

### 7.1 Engine changes (c) — exact signatures

None required. The only engine-side code outside the new faction file is the additive `bagPickRule` param read in the
non-frozen `src/engine/missions.ts`:
```ts
// bagPickRule(ctx, rule, pid, key) — inside, replacing the warlord fallback:
const fallbackKeyword = rule.params?.fallbackKeyword as string | undefined
const fallback: Unit[] = fallbackKeyword
  ? Object.values(s.units).filter((u) => u.player === opp && u.location !== 'destroyed' && keywordsOf(s, u.id).includes(fallbackKeyword))
  : [s.units[s.players[opp].warlordUnitId]].filter((u): u is Unit => !!u)
const candidates = big.length > 0 ? big : fallback
```
New hook objects (in `src/engine/factions/blood-angels.ts`, all typed `EngineCodeHook` from code-hooks.ts):
```ts
export const bloodAngelsHooks: Record<string, EngineCodeHook> // { multiSpectrumArray, haywireMine, rapidStrike }
```
Deferred, not required for playable (recorded as an issue): combined-unit embarkation (Leader + bodyguard as one
passenger) in `transports.ts canCarry`/embark/disembark; non-frozen if built.

## 8. Test IDs

Same list as the `BLO` section of 12-rules-test-checklist. Engine tests: `tests/engine/blood-angels.test.ts`; data tests:
`tests/data/blood-angels.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| BLO-001 | BLO-1 | patrol `ba.cp.strike-force-marcellos` loads under faction `blood-angels`: 5 units, 15 models; Marcellos WARLORD with Baalite Bladesman, attached to the Intercessors; start screen lists Blood Angels as its own faction |
| BLO-002 | BLO-1.3 | data: no existing `sm.*` record changes; reused ids (`sm.a.oath-of-moment`, bolt pistol, Smite ×2, force weapon, ccw, storm bolter) resolve from the `ba` patrol; Octavius and Solarien still load unchanged |
| BLO-003 | BLO-1.1 | Marcellos may attach only to `ba.intercessor-squad` (Incursors / Aggressors refused) |
| BLO-004 | BLO-2.1 | Oath of Moment: Blood Angels player picks a target at own Command start; an Impulsor storm bolter attack against it may re-roll the hit |
| BLO-005 | BLO-3.1 | Baalite Bladesman: attached Intercessor chainsword AP −2, ccw AP −1, Marcellos force weapon AP −2; ranged AP unchanged; unattached Intercessors unaffected |
| BLO-006 | BLO-3.2 | Radiant Wrath: Smite (both profiles) critical-wounds a VEHICLE on 5+; an INFANTRY target still needs the normal roll; force weapon gains nothing |
| BLO-007 | BLO-4.1 | Angelic Wrath: end of opponent's turn, controlled marker 5" from enemy zone → 4 VP; marker 7" away → 0; two qualifying markers → still 4; end of own turn → 0 |
| BLO-008 | BLO-4.2 | Strategic Aggression pick at round 1 start: candidates are enemy MONSTER/VEHICLE models; with none, enemy CHARACTER models (not just the WARLORD); with none of either, no decision |
| BLO-009 | BLO-4.2 | Strategic Aggression score at battle end only: picked model destroyed → 10 VP whoever killed it; alive → 0; Morgrim's Bag the Big 'Un unchanged (no `fallbackKeyword` → WARLORD fallback, 8/12 VP) |
| BLO-010 | BLO-5.1 | Controlled Ferocity: enemy picks the Intercessors in the Fight phase (either turn) → offered; attacks against them −1 to hit; Impulsor not a legal target |
| BLO-011 | BLO-5.2 | Harness the Flaw: not-yet-fought Aggressors re-roll wound 1s; vs a VEHICLE re-roll any failed wound; unit that already fought not offered; Impulsor never a target |
| BLO-012 | BLO-5.3 | Rapid Strike: end of own Shooting, Incursors (or Intercessors + Marcellos) out of Engagement Range → Normal move up to 6"; Aggressors not offered; unit in Engagement Range not offered |
| BLO-013 | BLO-5.3 | Rapid Strike restriction: the moved unit cannot declare a charge that turn; no embark offer at the end of the move |
| BLO-014 | BLO-6 | Datasheet stats exact: Marcellos M6 T4 Sv3+ W4 Ld6+ OC1; Intercessors OC2 BATTLELINE; Aggressors M5 T6 W3; Impulsor M12 T9 W11 OC2 |
| BLO-015 | BLO-6.1 | Mental Fortress: attached Intercessors and Marcellos save on 4+ invuln vs AP −3; unattached Marcellos has no invuln |
| BLO-016 | BLO-6.2 | Multi-spectrum Array: Incursors hit one enemy → it is auto-marked; a later Aggressor/Intercessor attack on it this phase gets +1 to hit; next phase gone |
| BLO-017 | BLO-6.2 | Multi-spectrum Array: two hit units → choice offered; an unhit unit is never a candidate; ±1 cap holds against a −1 to-hit defender; not triggered by Overwatch |
| BLO-018 | BLO-6.3 | Impulsor transport: Intercessors (5) and Incursors (5) may embark; Aggressors (GRAVIS) refused; capacity 6 counts models (Intercessors + Incursors together refused) |
| BLO-019 | BLO-6.3 | Firing Deck 6: Impulsor fires up to 6 embarked models' ranged weapons; those passenger units cannot shoot afterwards |
| BLO-020 | BLO-6.3 | Impulsor Deadly Demise D3: on destruction a 6 deals D3 mortal wounds to each unit within 6"; passengers emergency-disembark |
| BLO-021 | BLO-6.4 | Haywire Mine: start of a phase, enemy within 3" of the haywire Incursor → offer; 2+ deals D3 MW (2D3 to a VEHICLE); a 1 deals nothing and spends it; never offered again |
| BLO-022 | BLO-6.4 | Haywire Mine: decline → offered again next phase; haywire model dead (other Incursors alive) → never offered; enemy 4" away → not offered |
| BLO-023 | BLO-6 | Weapons: flamestorm gauntlets D6+1 Torrent Twin-linked Ignores Cover; bolt rifle Assault + Heavy AP −1; occulus carbine Assault Ignores Cover; paired blades Sustained Hits 1 A3 WS3+ |
| BLO-024 | BLO-6 | Bellicatus array: exactly one of frag (Blast) / icarus (Anti-FLY 2+) / krak (D6 damage) per shooting; twin power fists WS4+ Twin-linked |
| BLO-025 | BLO-6 | Incursor Scouts 6": pre-battle Scout move offered; Intercessors not offered |
| BLO-026 | BLO-7 | Sim: a full Blood Angels vs Space Marines (and vs Orks) game runs to battle end with no invariant errors |

## 9. Figures

The chapter shares the Space Marine figure kits: `src/client/figures/data.ts KNOWN_KIT` maps `ba.librarian-marcellos`,
`ba.intercessor-squad`, `ba.incursor-squad` → `sm-tacticus` and `ba.aggressor-squad` → `sm-terminator` (the bulky
Gravis silhouette), `ba.impulsor` → `generic-vehicle`, until the GLBs below land in `glbModels.ts` under
`ba.<datasheet>/<modelId>` keys. Paint comes from the `blood-angels` `paintScheme` (crimson `#9e1b1b`, gold
`#c9a227`, black `#1a1a1a`), so a shared kit renders red. Heights follow 30-figures (infantry H ≈ 1.1–1.3"); bases
rules-true. No chapter icons, blood-drop emblems or logos.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `librarian-marcellos` | `ba.librarian-marcellos/marcellos` | 1 | 1.2 | 40 mm | A chibi psychic warrior in crimson power armour with gold trim and a pale-blue armoured hood frame rising behind a bare-headed, stern young face, a glowing blue force sword in one hand and a small pistol at the hip. |
| `intercessor-sergeant` | `ba.intercessor-squad/sergeant` | 1 | 1.1 | 32 mm | A chibi armoured soldier in rounded crimson plate with gold-edged shoulder pads and a black-trimmed helmet with a short crest, revving a toothed chainsword in one hand and holding a pistol in the other. |
| `intercessor` | `ba.intercessor-squad/intercessor` | 4 | 1.1 | 32 mm | A chibi armoured soldier in rounded crimson plate with black gauntlets and a smooth helmet with green eye-lenses, holding a long, chunky rifle across the chest. |
| `incursor-sergeant` | `ba.incursor-squad/sergeant` | 1 | 1.1 | 32 mm | A chibi scout trooper in slim crimson armour with a wide multi-lens visor helmet and a tall antenna, a compact carbine raised and two short blades on the thighs. |
| `incursor` | `ba.incursor-squad/incursor` + `/incursor-haywire` | 4 (one with a disc mine on the belt) | 1.1 | 32 mm | A chibi scout trooper in slim crimson armour with a wide glowing visor helmet, a compact carbine with a boxy sight, and short blades on the thighs; the mine variant carries a flat round device clipped to the belt. |
| `aggressor` | `ba.aggressor-squad/aggressor` | 3 | 1.3 | 40 mm | A chibi hulking heavy-armour trooper in oversized crimson plate with a small head sunk between massive shoulders, huge black gauntlets fitted with stubby flame nozzles, and a squat backpack with fuel tanks. |
| `impulsor` | `ba.impulsor/impulsor` | 1 | 2.4 | 100 mm (hover hull) | A chibi rounded hover-transport in crimson armour plates with gold trim, an open-topped rear deck with grab rails, a stubby missile pod on a short mast, two small guns at the front corners and glowing blue anti-grav pads underneath. |

## 10. Other Blood Angels patrols (appendix)

- None other found. Wahapedia's CP Adeptus Astartes list (as recorded by the Solarien spec §10 on the same date) shows
  Strike Force Marcellos as the only Blood Angels Combat Patrol; this run's index fetch was refused (403), so a newer
  Blood Angels box, if one exists, is unconfirmed.
