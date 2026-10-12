# Faction spec — Genestealer Cults: Hand of the Magus

Own-words data spec for the Genestealer Cults Combat Patrol, same shape as 11-combat-patrol §4. Rule ids
`GEN-<section>.<n>` are cited by the `GEN-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose here is ours. Data id prefix: `gsc.` (faction id `genestealer-cults`, faction keyword
`GENESTEALER CULTS`).

## 0. Sources (accessed 2026-10-05)

| Source | URL | Version shown on page |
|---|---|---|
| Genestealer Cults box "Hand of the Magus" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/hand-of-the-magus/ | Index, 10th ed, June 2023 |
| Genestealer Cults box "Claw of Ascension" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/claw-of-ascension/ | Index, 10th ed, May 2024 |
| CP faction navigation (used to enumerate patrols) | menu on the two pages above | lists exactly two GSC patrols |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Source quirks recorded as found:
- The composition list labels the vehicle entry "HYBRID METAMORPHS (5 MODELS)" but lists the Goliath Rockgrinder's
  wargear under it; the datasheet section has a 1-model Goliath Rockgrinder and no Metamorphs. We treat it as
  **Goliath Rockgrinder (1 model)** — a page typo.
- Neophyte base reads "25mm (32mm if equipped with Heavy Mining Weapon)"; no Neophyte in this box has one → 25 mm.
- The Rockgrinder lists Firing Deck 6 but has no TRANSPORT keyword or capacity, so Firing Deck is inert (GEN-6.9).
- Aberrants print 32 mm and **no** abilities block at all (no Deep Strike, no Cult Ambush, no damage reduction).

## 1. Roster

6 units, 32 models. Faction keyword GENESTEALER CULTS on every datasheet; every datasheet also has GREAT DEVOURER.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `magus` | Magus Veridielle | 1 | autopistol; Magus stave | **WARLORD**. Leader → `neophytes-a` (default attachment); may instead lead `neophytes-b` or `acolytes` |
| `neophytes-a` | Neophyte Hybrids | 10 | Leader: autopistol, leader pistol, power weapon · 5× autopistol, hybrid firearm, close combat weapon · 1× same + cult icon · 1× autopistol, heavy stubber, ccw · 1× autopistol, seismic cannon, ccw · 1× autopistol, webber, ccw | BATTLELINE |
| `neophytes-b` | Neophyte Hybrids | 10 | identical to `neophytes-a` | BATTLELINE |
| `acolytes` | Acolyte Hybrids | 5 | Leader: leader's cult weapons, autopistol · 2× autopistol, cult claws and knife · 1× demolition charges, cult claws and knife · 1× heavy mining tool (no pistol) | — |
| `aberrants` | Aberrants | 5 | Hypermorph: heavy improvised weapon, hypermorph tail · 4× heavy power weapon | — |
| `rockgrinder` | Goliath Rockgrinder | 1 | clearance incinerator; demolition charge cache; heavy stubber; drilldozer blade | — |

The cult icon has no rules on this datasheet (cosmetic wargear only). No Patrol Squads ability anywhere (CP-1.8 n/a).

## 2. Faction ability — Cult Ambush (Neophyte Hybrids, Acolyte Hybrids only)

| Id | Rule |
|---|---|
| GEN-2.1 | Whenever a unit with Cult Ambush is destroyed, its owner rolls one D6, +3 if the unit is BATTLELINE (so Neophytes always succeed). On 4+ the unit goes into the owner's **Cult Ambush pool** and the owner may place one Cult Ambush marker (32 mm round) anywhere on the battlefield more than 9" horizontally from every enemy unit. If no legal spot exists, no marker is placed (the unit still enters the pool). |
| GEN-2.2 | Whenever an enemy model (not AIRCRAFT) ends any kind of move within 9" of one of your markers, that marker is removed. Distance is horizontal, base edge to marker edge. **[interpretation]** "Any kind of move" = Normal, Advance, Fall Back, charge, pile-in, consolidate, reactive moves (Skulking Horrors, Return to the Shadows…), and set-up from Reserves (reinforcements count as having made a Normal move). |
| GEN-2.3 | At the end of the Reinforcements step of each of your opponent's Movement phases, for every marker of yours still on the battlefield you may pick one unit from your pool and set it up again using Deep Strike rules (every model >9" horizontally from all enemy models, wholly on the battlefield, not overlapping), at full model count with full wounds, with at least one model touching that marker. The marker is then removed and the unit leaves the pool. Optional; one unit per marker. |
| GEN-2.4 | Markers and pool entries persist until used or removed **[interpretation]** — the rule names the opponent's *next* Movement phase but has no expiry clause; a marker placed during the opponent's own Movement phase after its Reinforcements step is first usable in the following opponent Movement phase. Any pool unit may use any of its owner's markers (not tied to the marker it created). |
| GEN-2.5 | Characters attached to the destroyed unit never come back with it — only the bodyguard returns, unled. The returning unit is a fresh full-strength copy (engine: new unit id `${src}~n`, same datasheet, per-model loadouts, not Battle-shocked, no attachment; it is the same unit returning, so it keeps the One Shot state of its original and the engine copy carries over the one-shot-used flags); the original stays destroyed, so being destroyed again counts as another unit destroyed for every rule (source designer's note). The copy has Cult Ambush and can ambush again. |
| GEN-2.6 | Combat Patrol restriction: in battle rounds 4 and 5 no unit can be set up from Cult Ambush. **[engine shortcut]** a unit destroyed after the last possible return (round ≥ 4, or round 3 after the opponent's Reinforcements step) still rolls but places no marker (no decision is raised). |
| GEN-2.7 | Marker placement **[interpretation, owner-facing simplification]**: the owner chooses among engine-generated candidate points — a 4" grid (x = −20…20, z = −12…12, 77 points) plus the destroyed unit's last centroid — filtered to legal points (>9" from enemy units, marker wholly on the board, not inside impassable terrain). The AI picks the legal candidate nearest the closest objective marker it does not control. |

## 3. Enhancements (Magus Veridielle, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Psionic Shield | default | while the bearer leads a unit, +1 to the saving throw against every ranged attack allocated to a model of that unit (bearer included). No effect while the Magus is alone. Applies to armour and invulnerable saves; existing save-modifier rules of 10-rules apply. |
| Resonance Stave | optional | the bearer's melee weapons (the Magus stave) gain [ANTI-INFANTRY 5+] and [DEVASTATING WOUNDS]. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Rise Up | default | from battle round 2 on, at the end of the **opponent's** turn: for each objective marker you control that has ≥1 of your NEOPHYTE HYBRIDS units (not Battle-shocked) within range, roll one D6 — 1–3: 1 VP, 4+: 3 VP. No stated cap. An attached Magus+Neophytes unit is a NEOPHYTE HYBRIDS unit. Returned Neophyte copies count. |
| Will of the Patriarch | optional | at the end of the battle: 15 VP if your MAGUS model is on the battlefield within 3" (horizontal, base edge) of the board centre (0,0). Destroyed Magus → 0. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Defend the Magus | 1 | epicDeed | `shooting.start` (your Shooting phase) or `fight.start` (either player's Fight phase) | one own MAGUS unit (attached unit included) **and** one enemy unit within Engagement Range of it | until end of phase: every attack by a GENESTEALER CULTS model from your army that targets that enemy unit re-rolls a hit roll of 1 and a wound roll of 1 |
| Lurking Killers | 1 | battleTactic | `shooting.targetsDeclared` (opponent's Shooting phase), just after an enemy unit picks targets | own GENESTEALER CULTS INFANTRY unit, not ABERRANTS, that is a target of that enemy unit | until end of phase: −1 to the hit roll of every attack that targets your unit (from any enemy unit, not only the one that triggered it) |
| Return to the Shadows | 1 | strategicPloy | `movement.unitMoved` (opponent's Movement phase), just after an enemy unit ends a Normal, Advance or Fall Back move | own GENESTEALER CULTS INFANTRY unit within 9" of that enemy unit | your unit makes a Normal move of up to D6"; if it has the MAGUS keyword (Magus alone or a unit she leads) it is a flat 6" instead. **[interpretation]** a unit in Engagement Range cannot make a Normal move → not a legal target (same as Skulking Horrors). |

Core stratagems: per 10-rules §11 with their own gates (Tank Shock → Rockgrinder; Go to Ground → INFANTRY;
Fire Overwatch needs a ranged weapon — Aberrants have none).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Magus Veridielle | 1 | 32 mm | 6 | 3 | 5+ | — | 4 | 6+ | 1 | INFANTRY, CHARACTER, PSYKER, GREAT DEVOURER, MAGUS, VERIDIELLE | Deep Strike; Leader → Acolyte Hybrids or Neophyte Hybrids; Spiritual Leader: while leading, models in her unit have Feel No Pain 5+ against Psychic Attacks |
| Neophyte Hybrids | 10 | 25 mm | 6 | 3 | 5+ | — | 1 | 7+ | 2 | INFANTRY, BATTLELINE, GREAT DEVOURER, NEOPHYTE HYBRIDS | Deep Strike; Cult Ambush |
| Acolyte Hybrids | 5 | 32 mm | 6 | 4 | 5+ | — | 1 | 7+ | 2 | INFANTRY, GREAT DEVOURER, ACOLYTE HYBRIDS | Deep Strike; Cult Ambush; Vile Insurrectionists: every attack by a model in this unit re-rolls a hit roll of 1; if the target is within range of an objective marker it also re-rolls a wound roll of 1 |
| Aberrants | 5 | 32 mm | 6 | 6 | 5+ | — | 3 | 7+ | 1 | INFANTRY, GREAT DEVOURER, ABERRANTS | none |
| Goliath Rockgrinder | 1 | hull (≈150 × 90 mm oval, "use model") | 12 | 10 | 3+ | — | 10 | 7+ | 3 | VEHICLE, GREAT DEVOURER, GOLIATH ROCKGRINDER | Deadly Demise D3; Firing Deck 6 (inert, GEN-6.9); Damaged (1–3 wounds left): −1 to every hit roll this model makes |

Faction keyword (all): GENESTEALER CULTS. Leader note: the Magus can lead one of the three INFANTRY units with Cult
Ambush; Aberrants and the Rockgrinder cannot be led. Psychic note: GEN-6.1 FNP covers every Psychic Attack (a [PSYCHIC] weapon attack or a wound from a Psychic-tagged ability).

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Magus Veridielle | — | autopistol (BS 3+) | Magus stave |
| Neophyte Hybrids | Leader ×1 | autopistol, leader pistol | power weapon |
| Neophyte Hybrids | Hybrid (firearm) ×5 | autopistol, hybrid firearm | close combat weapon |
| Neophyte Hybrids | Icon bearer ×1 | autopistol, hybrid firearm | close combat weapon |
| Neophyte Hybrids | Heavy stubber ×1 | autopistol, heavy stubber | close combat weapon |
| Neophyte Hybrids | Seismic cannon ×1 | autopistol, seismic cannon | close combat weapon |
| Neophyte Hybrids | Webber ×1 | autopistol, webber | close combat weapon |
| Acolyte Hybrids | Leader ×1 | autopistol | leader's cult weapons |
| Acolyte Hybrids | Hybrid ×2 | autopistol | cult claws and knife |
| Acolyte Hybrids | Demolitions ×1 | demolition charges | cult claws and knife |
| Acolyte Hybrids | Mining tool ×1 | — | heavy mining tool |
| Aberrants | Hypermorph ×1 | — | heavy improvised weapon, hypermorph tail |
| Aberrants | Aberrant ×4 | — | heavy power weapon |
| Goliath Rockgrinder | — | clearance incinerator, demolition charge cache, heavy stubber | drilldozer blade |

Weapon profiles:
| Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| autopistol (Magus) | 12" | 1 | 3+ | 3 | 0 | 1 | Pistol |
| autopistol (others) | 12" | 1 | 4+ | 3 | 0 | 1 | Pistol |
| hybrid firearm | 24" | 1 | 4+ | 3 | 0 | 1 | Rapid Fire 1 |
| leader pistol | 12" | 1 | 4+ | 4 | 0 | 1 | Pistol |
| heavy stubber (Neophyte & Rockgrinder) | 36" | 3 | 4+ | 4 | 0 | 1 | Rapid Fire 3 |
| seismic cannon | 24" | 4 | 5+ | 6 | −1 | D3 | Heavy, Rapid Fire 2 |
| webber | 12" | D6 | n/a | 2 | 0 | 1 | Devastating Wounds, Torrent |
| demolition charges (Acolyte) | 6" | D6+3 | 5+ | 12 | −2 | 2 | Assault, Blast, Hazardous, One Shot |
| clearance incinerator | 12" | 2D6 | n/a | 6 | −1 | 1 | Ignores Cover, Torrent |
| demolition charge cache | 6" | D6+3 | 5+ | 12 | −2 | 2 | Assault, Blast, Hazardous (no One Shot) |
| Magus stave | melee | 3 | 3+ | 5 | −1 | D3 | Psychic (+Anti-Infantry 5+, Devastating Wounds with Resonance Stave) |
| power weapon (Neophyte Leader) | melee | 1 | 4+ | 4 | −2 | 1 | — |
| close combat weapon (Neophyte) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| cult claws and knife | melee | 3 | 3+ | 4 | −1 | 1 | — |
| heavy mining tool | melee | 2 | 3+ | 10 | −2 | 3 | — |
| leader's cult weapons | melee | 5 | 3+ | 5 | −2 | 1 | — |
| heavy improvised weapon | melee | 5 | 3+ | 6 | 0 | 2 | — |
| heavy power weapon | melee | 3 | 3+ | 8 | −2 | 3 | — |
| hypermorph tail | melee | 1 | 3+ | 5 | 0 | 1 | Extra Attacks |
| drilldozer blade | melee | 6 | 3+ | 10 | −2 | 2 | Sustained Hits 1 |

Ability ids:
| Id | Rule |
|---|---|
| GEN-6.1 | Spiritual Leader: FNP 5+ against every wound lost to a Psychic Attack, meaning an attack made with a [PSYCHIC] weapon (including its Devastating Wounds mortal wounds) or a wound caused by a Psychic-tagged ability (e.g. mortal wounds from an enemy Psychic ability). Applies only while attached. |
| GEN-6.2 | Vile Insurrectionists — applies to every model of the unit, so a leading Magus benefits too (R-10.1 attached unit). "Within range of an objective marker" = any target model within the mission's objective range of any marker (CP-2.4), checked per attack. |
| GEN-6.3 | Demolition charges are One Shot (once per battle for that model); the Rockgrinder's cache is not. |
| GEN-6.4 | Hypermorph tail has Extra Attacks: used in addition to the heavy improvised weapon, never instead. |
| GEN-6.5 | Rockgrinder Damaged 1–3: −1 to hit on its attacks. |
| GEN-6.6 | Rockgrinder Deadly Demise D3. |
| GEN-6.7 | Deep Strike on Magus, Neophytes, Acolytes (none on Aberrants or Rockgrinder). |
| GEN-6.8 | Assault (demolition weapons) allows shooting after Advancing; Heavy (seismic cannon) +1 to hit if the unit Remained Stationary. |
| GEN-6.9 | Firing Deck 6 on the Rockgrinder has no effect: no unit can embark (no TRANSPORT capacity on the datasheet). Data still lists it for fidelity; the engine never offers embarking. |

Suggested `paintScheme` (original): primary `#c79a2e` (mustard work overalls), secondary `#5d3a8c` (deep violet
chitin), trim `#a8492f` (rust red), metal `#8b8f94` (worn steel), decal `#e9e2c8` (bone).

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks`, logic in `src/engine/factions/genestealer-cults.ts`); (c) = engine change
beyond a code hook (exact signatures in §7.1).

| Rule | Enc. | Encoding |
|---|---|---|
| Cult Ambush roll, pool, marker (GEN-2.1, 2.6, 2.7) | (c)+(b) | (b) `cultAmbush` — marker hook like `deathBlow` (`kind:'ability', hook:'onUnitDestroyed', run: noop`, plus `answer` for the two chooseOptions below); datasheet ability `{trigger:'unitDestroyed', code:'cultAmbush', params:{battlelineBonus:3, success:4, markerGap:9, lastRound:3}}` on Neophytes and Acolytes. (c) `onCultAmbushUnitDestroyed` called from the `ctx.emit` interceptor in `reducer.ts` (same spot as `onOwnUnitDestroyed`): rolls D6 `purpose:'ability'`, on success adds to the pool and queues a marker placement; the reducer raises queued placements via `raisePendingCultAmbushMarker` before asking any phase module for its next decision (chooseOption topic `abilityChoice`, `data.code:'cultAmbush', data.step:'marker'`, one option per candidate point `pt:<x>,<z>` + `decline`). |
| Cult Ambush marker removal (GEN-2.2) | (c) | `cultAmbushOnMoveEnded(ctx, movedUnitId)` called by `phases/movement.ts`, `phases/charge.ts`, `phases/fight.ts` (pile-in/consolidate) and the reactive-move / reinforcement resolvers right after a unit's placements are committed; removes every marker of the other player within 9" of any moved model (AIRCRAFT excepted); emits `AbilityTriggered`. |
| Cult Ambush return (GEN-2.3–2.5) | (c)+(b) | `cultAmbushReturnStep(ctx)` called by `phases/movement.ts` at the end of the active player's Reinforcements step, before Rapid Ingress, for the **non-active** player (skipped in rounds ≥ 4). Per marker: chooseOption (`data.step:'return'`, options = pool units with a legal placement + `decline`). On a pick: `spawnDestroyedUnitCopy(ctx, unitId)` (existing, Astra Militarum C3), then `pushReaction(ctx, {kind:'cultAmbush', …})` and the existing reaction-placement path with `resolveArrival(..., via:'cultAmbush')` = Deep Strike constraints (`minDistanceFromEnemies: 9`) + new `MoveConstraints.mustTouch` (marker). Emits `ReinforcementsArrived` with `via:'deepStrike'` (the rule says "using Deep Strike" → no events.ts change). Pool entry and marker removed. |
| Psionic Shield | (a) | enhancement `{trigger:'saveRoll', when:{weaponType:'ranged', leaderAttached:true}, effect:{modifyRoll:{roll:'save', value:1}}, scope:{who:'self'}}` (explicit `self` — enhancements default to `bearer`) |
| Resonance Stave | (a) | enhancement `{trigger:'always', when:{weaponType:'melee'}, effect:[{grantWeaponAbility:{ability:'ANTI', keyword:'INFANTRY', value:5}}, {grantWeaponAbility:{ability:'DEVASTATING_WOUNDS'}}], scope:{who:'bearer'}}` |
| Rise Up | (b) | secondary `scoring:[{when:'turn.end', who:'opponent', rounds:{from:2,to:5}, rule:'custom', code:'riseUp', pointsPer:1}]`; `riseUp` = `missionHook('riseUp','onTurnEnd')` + `case 'riseUp'` in `missions.ts customAmount` → `riseUpAmount(ctx, rule, pid, controls)`: for each marker `controls(id)` with ≥1 own canonical board unit carrying keyword NEOPHYTE HYBRIDS (any half), not `battleShocked`, with a model within objective range: roll D6 (`purpose:'mission'`), add 1 on 1–3 or 3 on 4+; return the sum (`pointsPer` 1 multiplies by 1). |
| Will of the Patriarch | (b) | secondary `scoring:[{when:'battle.end', rule:'custom', code:'willOfThePatriarch', pointsPer:15}]`; amount 1 iff an own board model whose unit has keyword MAGUS has horizontal base-edge distance ≤ 3 from (0,0). `missionHook('willOfThePatriarch')`. |
| Defend the Magus | (a)+(b) | stratagem `window:['shooting.start','fight.start']`, `who:'either'`, `condition` = active-player only in Shooting; `targets:[{role:'unit', owner:'friendly', filter:{keyword:'MAGUS'}}, {role:'unit', owner:'enemy', state:'inEngagement'}]`, `effect:{reroll:'ones'}`, `when:{attackerKeyword:'GENESTEALER CULTS'}`, `scope:{who:'attacker'}`, `duration:'untilEndOfPhase'`, `code:'defendTheMagus'`. Hook `defendTheMagus` (`kind:'stratagem', hook:'onHitRoll', hooks:['onHitRoll','onWoundRoll'], grantsItself:true`): `check` = the enemy (`t.ids[1]`) has a board model within Engagement Range of a board model of the MAGUS unit (`t.ids[0]`, canonical, both halves); `apply` grants the declarative effect as an ActiveEffect on the **enemy** unit `t.ids[1]` (all halves) with scope `attacker` — so it re-rolls hit 1s and wound 1s of GSC attackers that target it; `gateActive` = attacker owner is the stratagem user. The effect survives the Magus dying mid-phase. |
| Lurking Killers | (a) | `window:'shooting.targetsDeclared'`, `who:'reactive'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY', notKeyword:'ABERRANTS'}, state:'targetedByAttack'}]` (every own unit is GENESTEALER CULTS), `effect:{modifyRoll:{roll:'hit', value:-1}}`, `scope:{who:'attacker'}` (effect is stored on the targeted unit and changes the rolls of units attacking it; same shape as Gene-wrought Resilience), `duration:'untilEndOfPhase'`. ±1 hit cap (R-6) still applies (stacked with Stealth it is still −1). |
| Return to the Shadows | (b) | stratagem `window:'movement.unitMoved'`, `who:'reactive'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'INFANTRY'}}]`, `code:'returnToTheShadows'`, `params:{range:9, magusKeyword:'MAGUS', magusDistance:6, dice:'D6'}`. Hook `returnToTheShadows` (`kind:'stratagem', hook:'onMove'`): `check` = trigger unit is an enemy board unit whose `turn.moveType` ∈ normal/advance/fallBack (any half), target is on the board, within 9" (`leaderService.unitDistance`) of it and not in Engagement Range; `apply` = distance 6 if any half has MAGUS else roll D6 (`purpose:'stratagem'`), emit `AbilityTriggered`, then `startReactiveMove(ctx, unitId, distance, stratagemId)` (existing, Skulking Horrors). The resulting move counts for GEN-2.2 only against the other player's markers (it is your own unit). |
| Spiritual Leader | (a) | `leader.effects:[{trigger:'feelNoPainRoll', when:{weaponAbility:'PSYCHIC'}, effect:{feelNoPain:5}, scope:{who:'self'}}]` (leader effects exist only while attached). Same shape and same gap as GRE-6.1 Sanctic Hood: covers weapon-sourced wounds only; wounds from an enemy Psychic-tagged ability need a small engine flag (e.g. `when:{sourcePsychic:true}` on ability-sourced damage). Record as an engine gap (b hook) until added. |
| Vile Insurrectionists | (a) | two descriptors, scope `self`: `{trigger:'hitRoll', effect:{reroll:'ones'}}` and `{trigger:'woundRoll', when:{targetOnObjective:true}, effect:{reroll:'ones'}}` |
| Leader (Magus → Neophytes/Acolytes) | (a) | `coreAbilities:[{ability:'LEADER'},{ability:'DEEP_STRIKE'}]`, `leader.attachTo:['gsc.neophyte-hybrids','gsc.acolyte-hybrids']`; patrol `attachTo:'neophytes-a'` |
| Deep Strike (Neophytes, Acolytes) | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]` |
| Deadly Demise D3 / Firing Deck 6 / Damaged 1–3 | (a) | `DEADLY_DEMISE` value `'D3'`; `FIRING_DECK` value 6 (inert: no `transport` block → engine never offers embark, GEN-6.9); `damaged:{threshold:3, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| Weapon abilities | (a) | `PISTOL`, `RAPID_FIRE` 1/2/3, `HEAVY`, `DEVASTATING_WOUNDS`, `TORRENT` (skill null), `ASSAULT`, `BLAST`, `HAZARDOUS`, `ONE_SHOT`, `IGNORES_COVER`, `SUSTAINED_HITS` 1, `EXTRA_ATTACKS`, `PSYCHIC` |
| Cult icon | (a) | no rule: wargear id `gsc.w.cult-icon` omitted from weapons, recorded only as a figure part |
| BATTLELINE, GREAT DEVOURER, PSYKER | (a) | plain keywords (BATTLELINE read by `cultAmbush` for the +3) |

Totals: **5 new code hooks** (`cultAmbush`, `defendTheMagus`, `returnToTheShadows`, `riseUp`, `willOfThePatriarch`);
**1 engine change** (Cult Ambush lifecycle), touching **1 frozen contract**: `src/engine/types.ts`
`MoveConstraints.mustTouch` (optional, additive). No `actions.ts`, `events.ts`, `hooks.ts`, `rng.ts`, `decider.ts` or
`index.ts` change: state lives in `state.mission.custom.cultAmbush` (precedent: C5 `attackedModelIds`), decisions reuse
`chooseOption` topic `abilityChoice`, announcements reuse `AbilityTriggered` / `UnitDeployed` /
`ReinforcementsArrived(via:'deepStrike')`. Matching `docs/spec/00-architecture.md` edit required for `mustTouch`.
Reused, not re-proposed: `spawnDestroyedUnitCopy` (state.ts), `pushReaction`/`pendingReactions` (code-hooks.ts),
`startReactiveMove` (phases/movement.ts), `resolveArrival`/`checkPlacements` (movement.ts), `autoDeployPlacements`.

### 7.1 Engine changes (c) — exact signatures

The (b) hooks are written against these before they exist.

1. **Frozen** `src/engine/types.ts`:
   ```ts
   export interface MoveConstraints {
     /* …existing… */
     // Cult Ambush (GEN-2.3): at least one placed model's base must touch (edge distance ≤ 0.05") this circle
     mustTouch?: { pos: Vec3; radius: number } | null
   }
   ```
   `checkPlacements` (geometry/movement) rejects with `E_NOT_AN_OPTION` "one model must touch the Cult Ambush marker"
   when set and unmet; `emptyMoveConstraints` leaves it `null`. AI placement (`autoDeployPlacements`) seeds the first
   model tangent to the marker when `mustTouch` is set.
2. **New module** `src/engine/factions/genestealer-cults.ts` (non-frozen):
   ```ts
   export const CULT_AMBUSH_CODE = 'cultAmbush'
   export const CULT_AMBUSH_MARKER_RADIUS = 0.63 // 32 mm marker
   export interface CultAmbushMarker { id: string; player: PlayerId; pos: Vec3; placedRound: number; sourceUnitId: UnitId }
   export interface CultAmbushState {
     markers: CultAmbushMarker[]
     pool: Record<PlayerId, UnitId[]>            // destroyed (original) unit ids waiting in Cult Ambush
     pendingMarkers: { player: PlayerId; unitId: UnitId }[] // successful rolls awaiting a placement decision
     seq: number                                  // marker id counter → `ca:<seq>`
   }
   export function cultAmbushState(state: GameState): CultAmbushState // lazily creates state.mission.custom.cultAmbush
   export function cultAmbushAbilityId(state: GameState, unit: Unit): string | null
   export function onCultAmbushUnitDestroyed(ctx: EngineContext, unitId: UnitId): void
   export function cultAmbushMarkerCandidates(state: GameState, player: PlayerId, sourceUnitId: UnitId): Vec3[]
   export function raisePendingCultAmbushMarker(ctx: EngineContext): boolean // true = a decision was raised
   export function cultAmbushOnMoveEnded(ctx: EngineContext, movedUnitId: UnitId): void
   export function cultAmbushReturnStep(ctx: EngineContext): 'pending' | 'done'
   export function cultAmbushPlacementPossible(state: GameState, poolUnitId: UnitId, marker: CultAmbushMarker): boolean
   export function answerCultAmbush(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void
   // GEN-4 scoring helpers, called from missions.ts customAmount
   export function riseUpAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, controls: (objectiveId: string) => boolean): number
   export function willOfThePatriarchAmount(s: GameState, rule: ScoringRule, pid: PlayerId): number
   ```
3. **Non-frozen call sites**: `reducer.ts` emit interceptor (`if (e.type === 'UnitDestroyed') onCultAmbushUnitDestroyed(ctx, e.unitId)`)
   and decision loop (`if (raisePendingCultAmbushMarker(ctx)) return` before the phase module's next step);
   `phases/movement.ts` (`cultAmbushReturnStep` after the active player's reinforcements, `resolveArrival` gains
   `via: … | 'cultAmbush'` mapping to Deep Strike constraints + `mustTouch`, emitting `via:'deepStrike'`; the R-5.14
   cull skips units with a pending `cultAmbush` reaction, as for `nextWave`); move resolvers call
   `cultAmbushOnMoveEnded`; `code-hooks.ts` `ReactionRequest.kind` gains `'cultAmbush'`.

## 8. Test IDs

Same list as the `GEN` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| GEN-001 | GEN-1 | patrol loads: 6 units, 32 models; Magus is WARLORD with Psionic Shield, attached to `neophytes-a`; default secondary Rise Up; Rockgrinder has 1 model |
| GEN-002 | GEN-2.1 | Neophytes destroyed → D6 +3 always ≥ 4: unit enters the pool and a marker-placement chooseOption is raised for its owner |
| GEN-003 | GEN-2.1 | Acolytes destroyed with D6 = 3 → no pool entry, no marker decision; D6 = 4 → pool + decision |
| GEN-004 | GEN-2.1 | Aberrants and Rockgrinder destroyed → no Cult Ambush roll at all |
| GEN-005 | GEN-2.7 | every offered marker point is >9" from all enemy models and wholly on the board; with enemies covering the board → no decision, unit still in pool |
| GEN-006 | GEN-2.2 | enemy unit ends a Normal move with a model 8.9" from a marker → marker removed; ending at 9.1" → kept |
| GEN-007 | GEN-2.2 | marker removed by an enemy charge move, pile-in and consolidate; own units moving near it never remove it |
| GEN-008 | GEN-2.3 | opponent's next Movement phase, after their reinforcements: return offered per marker; unit returns at full model count, full wounds, original loadouts, one model touching the marker, all >9" from enemies; marker gone |
| GEN-009 | GEN-2.3 | placement with no model touching the marker is rejected (`mustTouch`) |
| GEN-010 | GEN-2.3 | owner declines → marker and pool entry persist; usable at the following opponent Movement phase (GEN-2.4) |
| GEN-011 | GEN-2.3 | return is not offered in the owner's own Movement phase |
| GEN-012 | GEN-2.4 | two markers, one pool unit → only one return; pool unit may use a marker created by a different unit |
| GEN-013 | GEN-2.5 | Magus leading Neophytes; whole unit destroyed → only the 10 Neophytes return, unled; Magus stays destroyed |
| GEN-014 | GEN-2.5 | returned copy destroyed again → opponent's destroyed-unit counts rise twice; copy rolls Cult Ambush again |
| GEN-015 | GEN-2.5 | returned Acolytes whose demolition charges were already fired cannot fire them again; charges not yet fired are still available (One Shot state carried over) |
| GEN-016 | GEN-2.6 | round 4 opponent Movement phase: no return offered even with markers and pool units |
| GEN-017 | GEN-2.6 | unit destroyed in round 4 → roll emitted, no marker decision |
| GEN-018 | GEN-3 | Psionic Shield: Magus-led Neophytes (Sv 5+) save an AP 0 ranged attack on 4+ and an AP −1 one on 5+; melee attacks unchanged (5+ / 6+); Magus alone → no bonus |
| GEN-019 | GEN-3 | Resonance Stave: stave vs INFANTRY critical wounds on 5+; a critical wound becomes mortal wounds (Devastating Wounds); vs VEHICLE wounds normally |
| GEN-020 | GEN-4 | Rise Up: end of opponent's round-1 turn → no roll; round 2 with 2 controlled markers holding Neophytes → 2 D6 rolled, VP = Σ(1 on 1–3, 3 on 4+) |
| GEN-021 | GEN-4 | Rise Up: marker held only by Acolytes, or by Battle-shocked Neophytes → no roll for it; end of own turn → no scoring |
| GEN-022 | GEN-4 | Will of the Patriarch: Magus base edge 2.9" from centre at battle end → +15 VP; 3.2" or destroyed → 0 |
| GEN-023 | GEN-5 | Defend the Magus: offered at start of own Shooting only if an enemy is in ER of the MAGUS unit; Neophyte hit roll of 1 vs that enemy re-rolled, wound 1 re-rolled; vs another enemy no re-roll |
| GEN-024 | GEN-5 | Defend the Magus at start of the opponent's Fight phase works; gone at phase end; persists if the Magus dies mid-phase |
| GEN-025 | GEN-5 | Lurking Killers: offered after enemy targets declared vs own Acolytes; attacks against them −1 to hit until phase end, including from a second enemy unit |
| GEN-026 | GEN-5 | Lurking Killers not offered for Aberrants or the Rockgrinder |
| GEN-027 | GEN-5 | Return to the Shadows: enemy ends a Normal move 8" from Neophytes → offered; D6 rolled; Normal move up to that distance; not offered if enemy only Remained Stationary or unit is in ER |
| GEN-028 | GEN-5 | Return to the Shadows on Magus-led unit → flat 6", no roll |
| GEN-029 | GEN-6.1 | Spiritual Leader: led unit gets FNP 5+ vs Smite (PSYCHIC) damage; none vs a bolter; Magus alone → none |
| GEN-030 | GEN-6.2 | Vile Insurrectionists: hit 1s re-rolled always; wound 1s re-rolled only when the target is within range of an objective marker |
| GEN-031 | GEN-6.2 | Vile Insurrectionists applies to a leading Magus's attacks |
| GEN-032 | GEN-6.3 | demolition charges usable once per battle and trigger Hazardous; Rockgrinder cache can fire every turn |
| GEN-033 | GEN-6.4 | Hypermorph fights with heavy improvised weapon (5 A) plus tail (1 A) |
| GEN-034 | GEN-6.5 | Rockgrinder at 3 W: −1 to hit; at 4 W: none; destroyed → Deadly Demise D3 on a 6 |
| GEN-035 | GEN-6.7 | Deep Strike: Magus, Neophytes, Acolytes may start in Reserves; Aberrants and Rockgrinder may not |
| GEN-036 | GEN-6.9 | Rockgrinder offers no embark option to any unit |
| GEN-037 | GEN-6 | weapons: webber auto-hits D6 with Devastating Wounds; seismic cannon Heavy +1 to hit when stationary and Rapid Fire 2 at ≤12"; clearance incinerator Torrent Ignores Cover |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3, vehicles compressed); bases are rules-true. Every prompt names
each held item exactly once — single weapon per hand, **one stave only** for the Magus (image QC: generated concepts
have shown duplicated staves).

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `magus-veridielle` | `gsc.magus-veridielle/magus` | 1 | 1.2 | 32 mm | A chibi pale-skinned psychic priestess with a high bald domed head, faint violet veins and glowing violet eyes, in long deep-violet robes with mustard trim, holding exactly one tall carved bone stave in her right hand and a small pistol in her left. |
| `neophyte-leader` | `gsc.neophyte-hybrids/leader` | 2 | 1.1 | 25 mm | A chibi miner-militia sergeant in mustard overalls and a rust-red bandana, slightly ridged violet-tinged brow, one sturdy pistol raised and a single short glowing power blade in the other hand. |
| `neophyte-firearm` | `gsc.neophyte-hybrids/hybrid` | 10 | 1.1 | 25 mm | A chibi grim mine worker in mustard overalls, steel helmet with goggles and a violet sash, holding one compact rifle at the ready. |
| `neophyte-icon` | `gsc.neophyte-hybrids/icon` | 2 | 1.1 | 25 mm | The same chibi mine worker with one rifle slung on the back, holding up a single tall pole topped by an original three-pronged violet claw emblem. |
| `neophyte-stubber` | `gsc.neophyte-hybrids/heavy-stubber` | 2 | 1.1 | 25 mm | A chibi mine worker in mustard overalls bracing one oversized belt-fed machine gun at the hip, ammo belt across the chest. |
| `neophyte-seismic` | `gsc.neophyte-hybrids/seismic-cannon` | 2 | 1.1 | 25 mm | A chibi mine worker hefting one bulky drill-like cannon with a ribbed rust-red barrel and humming yellow coils. |
| `neophyte-webber` | `gsc.neophyte-hybrids/webber` | 2 | 1.1 | 25 mm | A chibi mine worker aiming one stubby wide-nozzled sprayer gun with a glass tank of glossy white goo on top. |
| `acolyte-leader` | `gsc.acolyte-hybrids/leader` | 1 | 1.1 | 32 mm | A chibi hunched hybrid with violet skin, a ridged bald head and three arms, wearing a torn mustard work vest, gripping one curved bone-hilted blade and one hooked claw, with a pistol holstered. |
| `acolyte-hybrid` | `gsc.acolyte-hybrids/hybrid` | 2 | 1.1 | 32 mm | A chibi hunched violet-skinned hybrid with an extra clawed arm, mustard vest and rust-red wrist wraps, holding one pistol and one curved knife. |
| `acolyte-demolitions` | `gsc.acolyte-hybrids/demolitions` | 1 | 1.1 | 32 mm | A chibi violet-skinned hybrid hugging one bundle of red-and-yellow striped mining charges with a blinking fuse, a short claw on its third arm. |
| `acolyte-mining-tool` | `gsc.acolyte-hybrids/mining-tool` | 1 | 1.2 | 32 mm | A chibi broad violet-skinned hybrid swinging one massive two-handed rock drill with a steel bit and yellow hazard stripes. |
| `aberrant-hypermorph` | `gsc.aberrants/hypermorph` | 1 | 1.4 | 32 mm | A chibi hulking brute with a tiny head, lumpy violet hide, iron-plated shoulders and a long whip-like bony tail, gripping one huge rust-red sledgehammer. |
| `aberrant` | `gsc.aberrants/aberrant` | 4 | 1.3 | 32 mm | A chibi hulking violet-skinned brute in a torn mustard apron with steel shoulder pads, holding one heavy glowing power pickaxe in both hands. |
| `goliath-rockgrinder` | `gsc.goliath-rockgrinder/rockgrinder` | 1 | 2.0 | ≈150 × 90 mm oval hull | A chibi stubby mining truck in mustard yellow with violet panels and rust streaks, a giant spinning drill-drum blade on the front, an open cab with a mounted machine gun, a flame nozzle and a crate of striped charges on the back. |

## 10. Other Genestealer Cults patrols (appendix)

- **Claw of Ascension** (Index, May 2024): Shanus Daskovian (Jackal Alphus, 1), Hybrid Metamorphs (5) ×2,
  Atalan Jackals (5: 3 riders, 1 power-weapon rider, 1 Wolfquad), Achilles Ridgerunner (1) — 5 units, 17 models.
