# Patrol spec — Genestealer Cults: Claw of Ascension

Own-words data spec for the **second** Genestealer Cults Combat Patrol, same shape as 11-combat-patrol §4. It covers
only this patrol: anything identical to the first patrol is cited by its id from
[genestealer-cults.md](genestealer-cults.md) (Hand of the Magus, rule ids `GEN-…`) and not restated. Rule ids here are
`CLA-<section>.<n>`; test ids `CLA-0nn` (12-rules-test-checklist, section CLA). Mechanics are 1:1 with the source;
every sentence of prose is ours. Data id prefix stays `gsc.` (faction `genestealer-cults`); patrol id
`gsc.cp.claw-of-ascension`, appended to `faction.json` `combatPatrols` (the only faction.json change; the army rule and
detachment entries stay as they are, see CLA-2).

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Genestealer Cults box "Claw of Ascension" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/claw-of-ascension/ | Index, 10th ed, May 2024 |
| Genestealer Cults box "Hand of the Magus" (already specified; read only to diff Cult Ambush) | https://wahapedia.ru/wh40k10ed_cp/factions/hand-of-the-magus/ | Index, 10th ed, June 2023 |
| Matched-play Hybrid Metamorphs datasheet (only to fill the missing FNP value, CLA-6.4) | https://wahapedia.ru/wh40k10ed/factions/genestealer-cults/Hybrid-Metamorphs | 10th ed index/codex page |
| CP faction navigation (enumerates patrols) | menu on the CP pages above | exactly two GSC patrols: Claw of Ascension, Hand of the Magus |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | captured in 11-combat-patrol §1–2; not re-fetched |

Source quirks recorded as found:
- The composition list prints **HYBRID METAMORPHS (5 MODELS) twice** (once with a Metamorphic Spasm note, once with a
  general note). We read it as two units — 5 units, 17 models, as the first spec's appendix already recorded.
- The Metamorph Leader's wargear is called "Leader's bio-weapons" in the composition but the datasheet profile row is
  "Leader's cult weapons" (5 A, WS 3+, S 5, AP −1, D 2). It is a different profile from the Acolyte `gsc.w.leaders-cult-weapons`
  (AP −2, D 1), so it gets its own id `gsc.w.leaders-bio-weapons`.
- Hybrid Metamorphs list "Feel No Pain" **without a value**. The matched-play Metamorph datasheet has Feel No Pain 5+;
  we use **5+** and flag it as unconfirmed on the CP page.
- The datasheet title and keyword are "Achilles Ridgerunner**s**" (plural); the unit is one model. Keyword kept as printed:
  `ACHILLES RIDGERUNNERS`.
- Mining laser and Achilles missile launcher print **no** weapon abilities (no Heavy). Taken as printed.
- Atalan Jackals carry **no Cult Ambush** in this patrol (the page says so explicitly), and nothing in the patrol has
  Deep Strike.

## 1. Roster

5 units, 17 models. Faction keyword GENESTEALER CULTS and keyword GREAT DEVOURER on every datasheet. No invulnerable saves.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `shanus` | Shanus Daskovian (Jackal Alphus) | 1 | autopistol; cult sniper rifle; close combat weapon | **WARLORD**, enhancement Priority Kill Order. Leader → `jackals` (only legal bodyguard) |
| `metamorphs-a` | Hybrid Metamorphs | 5 | Leader ×1: autopistol, Leader's bio-weapons · Metamorph ×1: Metamorph mutations · Metamorph ×3: hand flamer, Metamorph mutations | Cult Ambush (Claw variant) |
| `metamorphs-b` | Hybrid Metamorphs | 5 | identical to `metamorphs-a` | Cult Ambush (Claw variant) |
| `jackals` | Atalan Jackals | 5 | Jackal ×1: Atalan small arms, Atalan power weapon · Jackal ×3: Atalan small arms, close combat weapon · Wolfquad ×1: Atalan small arms, mining laser, close combat weapon | no Cult Ambush |
| `ridgerunner` | Achilles Ridgerunner | 1 | Achilles missile launcher; twin heavy stubber; armoured hull | — |

Note: the Metamorph with "Metamorph mutations" only has **no** ranged weapon (no autopistol). No Patrol Squads ability
(CP-1.8 n/a). No unit choices.

## 2. Faction ability — Cult Ambush, Claw variant (Hybrid Metamorphs only)

Same lifecycle as GEN-2.1–2.7 (pool, 32 mm marker, removal by enemy moves, return at the end of the opponent's
Reinforcements step, characters never return, designer's note on repeat destruction, owner-facing marker grid). This
patrol's printing differs in the points below; it is encoded as a **patrol-scoped ability** `gsc.a.cult-ambush-claw`
(same `code:'cultAmbush'`, different `params`) referenced only by the Hybrid Metamorphs datasheet. `faction.json`
`armyRule` stays `gsc.a.cult-ambush`; the engine reads Cult Ambush parameters per datasheet ability, never from the army rule.

| Id | Rule (differences from GEN-2 only) |
|---|---|
| CLA-2.1 | Roll: one D6, **+1 if the battle round is 1 or 2**; no BATTLELINE bonus. Success on **5+** (so 4+ natural in rounds 1–2, 5+ natural from round 3). Same marker placement as GEN-2.1/2.7 (>9" horizontally from every enemy unit; none if no legal spot). |
| CLA-2.2 | Marker removal: identical to GEN-2.2. |
| CLA-2.3 | Return set-up: every model >9" horizontally from all enemy units, at least one model touching the marker, **and every other model wholly within 3" of the marker** (base wholly within 3" of the marker's edge). The rule text does not say "using Deep Strike"; the constraints are the ones listed (engine still announces `ReinforcementsArrived` with `via:'deepStrike'`, as GEN-2.3). |
| CLA-2.4 | The returning unit is a **new identical unit** at Starting Strength with all wounds; any [ONE SHOT] weapon counts as not yet fired (opposite of GEN-2.5's carry-over). No Metamorph weapon is One Shot, so this is inert for this roster but encoded (`resetOneShot`). Characters attached to the destroyed unit do not come back (none can lead Metamorphs here). |
| CLA-2.5 | While waiting in Cult Ambush the unit **counts as being in Reserves**. Consequences (CP-1.9 / R-5.14): **[interpretation]** (a) no return in battle round 1 (Reserves never arrive in round 1); (b) the Hand variant's "no return in rounds 4–5" clause is absent, but at the R-5.14 moment (end of round 3, once the second player's round-3 reinforcements are done) every Claw-variant unit still in the pool counts as destroyed: it is announced (`UnitLostInReserves`) and counts once more as a destroyed unit for every destroyed-unit rule; that destruction does **not** roll Cult Ambush again (the unit never reached the battlefield and could never return). A Claw unit destroyed after that moment still rolls; on success it waits in Reserves forever (no marker decision, never culled, never counted). |
| CLA-2.6 | No separate Combat Patrol restriction is printed for this patrol; the effective window is rounds 2–3 (CLA-2.5). |

## 3. Enhancements (Shanus Daskovian, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Priority Kill Order (CLA-3.1) | default | at the start of your Shooting phase, pick one enemy unit **visible to the bearer** (Shanus's own model). Until the end of that phase, every attack by a GENESTEALER CULTS model from your army that targets that unit may re-roll its Hit roll (full re-roll). Not mandatory; no pick if nothing is visible. |
| Master of Suppression (CLA-3.2) | optional | in your Shooting phase, after the bearer's unit (Shanus + attached Jackals) has shot, pick one enemy unit hit by at least one of those attacks. Until the start of **your next Shooting phase**, every attack made by a model of that enemy unit takes −1 to its Hit roll (includes Overwatch in your next Movement/Charge phase and its own next turn; ±1 hit cap applies). A newer pick does not cancel an older one still running. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Infiltration Agenda (CLA-4.1) | default | at the end of **your** turn (every round, no round gate): 4 VP if at least one GENESTEALER CULTS unit from your army that is not Battle-shocked is **within** the opponent's deployment zone. "Within" = at least one model's base overlaps the zone (10th-ed "within" = any part; not "wholly"). Flat 4, not per unit. |
| Safeguard the Sanctuary (CLA-4.2) | optional | at the end of the battle: 10 VP if you control the objective marker closest to **your battlefield edge**. **[interpretation]** your battlefield edge = the board edge your deployment zone shares the longest boundary with (cp-01: the long south edge; cp-02/03/05/06: the short west edge; cp-04 triangle: the west edge, 30" vs 22"). Closest = smallest distance from marker centre to that edge line; on a tie, controlling any tied marker scores. Control per CP-2.4 at the battle-end check. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Metamorphic Spasm (CLA-5.1) | 1 | battleTactic | `fight.targetsDeclared` (either player's Fight phase), just after an enemy unit picks its targets | one own HYBRID METAMORPHS unit that is a target of that enemy unit | until end of phase: each time one of its models is destroyed while it has not fought this phase, roll D6; on 4+ the model stays (dead for every other purpose) and fights once the attacking unit has finished all its attacks, then is removed. Identical mechanics to CSM Daemonic Fervour (C5). |
| Point-Blank Ambush (CLA-5.2) | 1 | battleTactic | your Shooting phase (`shooting.start` / `shooting.attacksResolved`, own turn) or either player's Fight phase (`fight.start` / `fight.attacksResolved`) | one own GENESTEALER CULTS unit not yet selected to shoot (Shooting) / to fight (Fight) this phase | until end of phase: that unit's weapons have [LETHAL HITS] for attacks against enemy units within 12" (measured per attack as the attack's range). |
| Swarm the Oppressors (CLA-5.3) | 1 | strategicPloy | `charge.start` of your Charge phase | one or more own GENESTEALER CULTS units, plus one enemy unit you select | until end of phase: each charge declared by one of the chosen units that includes that enemy among its targets gets +1 to the Charge roll. **[interpretation]** choosing units has no cost or downside, so the engine always takes every own GSC unit; the player only picks the enemy. |

Core stratagems: per 10-rules §11 with their own gates (Tank Shock → Ridgerunner; Go to Ground → Metamorphs;
Epic Challenge → Shanus; Fire Overwatch is offered to every unit, the Metamorphs' hand flamers being Torrent).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shanus Daskovian | 1 | 60 × 35 mm oval | 12 | 4 | 5+ | — | 4 | 7+ | 1 | MOUNTED, CHARACTER, GREAT DEVOURER, JACKAL ALPHUS, SHANUS DASKOVIAN | Leader → Atalan Jackals; Scouts 9"; Stealth; Master Outrider (CLA-6.1) |
| Hybrid Metamorphs | 5 | 32 mm | 6 | 4 | 5+ | — | 1 | 7+ | 1 | INFANTRY, GREAT DEVOURER, HYBRID METAMORPHS | Feel No Pain 5+ (value unconfirmed, CLA-6.4); Scouts 6"; Cult Ambush (Claw variant, CLA-2) |
| Atalan Jackals — Jackal ×4 | 4 | 60 × 35 mm oval | 12 | 4 | 5+ | — | 2 | 7+ | 1 | MOUNTED, GREAT DEVOURER, ATALAN JACKALS | Scouts 9"; Stealth |
| Atalan Jackals — Wolfquad ×1 | 1 | 60 mm round | 12 | 4 | 5+ | — | **4** | 7+ | 1 | (same unit) | (same unit) |
| Achilles Ridgerunner | 1 | 120 × 92 mm oval | 12 | 7 | 3+ | — | 8 | 7+ | 3 | VEHICLE, GREAT DEVOURER, ACHILLES RIDGERUNNERS | Deadly Demise 1; Scouts 9"; Crossfire (CLA-6.2). No Damaged profile. |

Faction keyword (all): GENESTEALER CULTS. Ovals: the long axis (60 / 120 mm) runs front-to-back (`base.mm`), the short
one side-to-side (`mm2`). Wolfquad uses `statsOverride:{W:4}` on its composition entry. Nothing here can embark or be led
except Jackals by Shanus.

Wargear per model:
| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Shanus Daskovian | — | autopistol (BS 3+, = `gsc.w.autopistol-magus`), cult sniper rifle | close combat weapon (Shanus) |
| Hybrid Metamorphs | Leader ×1 | autopistol (= `gsc.w.autopistol`) | Leader's bio-weapons |
| Hybrid Metamorphs | Mutant ×1 | — | Metamorph mutations (strike / sweep) |
| Hybrid Metamorphs | Flamer ×3 | hand flamer | Metamorph mutations (strike / sweep) |
| Atalan Jackals | Power-weapon rider ×1 | Atalan small arms | Atalan power weapon |
| Atalan Jackals | Rider ×3 | Atalan small arms | close combat weapon (Jackal) |
| Atalan Jackals | Wolfquad ×1 | Atalan small arms, mining laser | close combat weapon (Jackal) |
| Achilles Ridgerunner | — | Achilles missile launcher, twin heavy stubber | armoured hull |

Weapon profiles (reused ids are not restated; new ids appended to `weapons.json`):
| Weapon (id) | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|
| autopistol, Shanus → reuse `gsc.w.autopistol-magus` | 12" | 1 | 3+ | 3 | 0 | 1 | Pistol |
| autopistol, Metamorph Leader → reuse `gsc.w.autopistol` | 12" | 1 | 4+ | 3 | 0 | 1 | Pistol |
| cult sniper rifle `gsc.w.cult-sniper-rifle` | 36" | 1 | 3+ | 5 | −2 | 3 | Heavy, Precision |
| close combat weapon (Shanus) `gsc.w.ccw-shanus` | melee | 3 | 3+ | 3 | 0 | 1 | — |
| hand flamer `gsc.w.hand-flamer` | 12" | D6 | n/a | 3 | 0 | 1 | Ignores Cover, Pistol, Torrent |
| Leader's bio-weapons `gsc.w.leaders-bio-weapons` | melee | 5 | 3+ | 5 | −1 | 2 | — |
| Metamorph mutations – strike `gsc.w.metamorph-mutations-strike` | melee | 3 | 3+ | 5 | −1 | 2 | — (profileGroup `gsc.w.metamorph-mutations`) |
| Metamorph mutations – sweep `gsc.w.metamorph-mutations-sweep` | melee | 5 | 3+ | 4 | −1 | 1 | — (same profileGroup; pick one profile per fight) |
| Atalan small arms `gsc.w.atalan-small-arms` | 12" | 2 | 4+ | 4 | 0 | 1 | Pistol |
| mining laser `gsc.w.mining-laser` | 24" | 1 | 4+ | 12 | −3 | D6+1 | — |
| Atalan power weapon `gsc.w.atalan-power-weapon` | melee | 2 | 4+ | 4 | −2 | 1 | — |
| close combat weapon (Jackal) `gsc.w.ccw-jackal` | melee | 2 | 4+ | 3 | 0 | 1 | — |
| Achilles missile launcher `gsc.w.achilles-missile-launcher` | 36" | 3 | 4+ | 9 | −2 | 3 | — |
| twin heavy stubber `gsc.w.twin-heavy-stubber` | 36" | 3 | 4+ | 4 | 0 | 1 | Rapid Fire 3, Twin-linked |
| armoured hull `gsc.w.armoured-hull` | melee | 3 | 4+ | 5 | 0 | 1 | — |

Ability ids:
| Id | Rule |
|---|---|
| CLA-6.1 | Master Outrider (`gsc.a.master-outrider`, on Shanus): in your Shooting phase, after his unit (Shanus alone, or Shanus + Jackals) has shot, if no model of it is within Engagement Range of an enemy, it may make a Normal move of up to 6" (as in the Movement phase: no Advance, must end outside Engagement Range, normal terrain rules). If it does, the unit cannot declare a charge for the rest of the turn. Optional, once per activation. |
| CLA-6.2 | Crossfire (`gsc.a.crossfire`, on the Ridgerunner): in your Shooting phase, after this unit has shot, pick one enemy unit hit by at least one of those attacks. Until end of turn, attacks by friendly GENESTEALER CULTS units against it get AP improved by 1 (AP 0 → −1, −2 → −3), ranged and melee alike. Each enemy unit can be the Crossfire target only once per turn. Mandatory pick when a candidate exists. |
| CLA-6.3 | Scouts 9" (Shanus, Jackals, Ridgerunner) / 6" (Metamorphs): pre-battle Scout moves per R-core; an attached Shanus + Jackals unit scouts 9". |
| CLA-6.4 | Feel No Pain 5+ on Hybrid Metamorphs (every wound, any source). Value from the matched-play datasheet — the CP page omits it. |
| CLA-6.5 | Stealth (Shanus, Jackals): −1 to hit for ranged attacks targeting the unit (attached unit keeps it — both halves have it). |
| CLA-6.6 | Deadly Demise 1 on the Ridgerunner. |
| CLA-6.7 | Cult sniper rifle: Precision (hits may be allocated to a visible CHARACTER in an attached unit) and Heavy (+1 to hit if the unit Remained Stationary). |
| CLA-6.8 | Hand flamer: Torrent (auto-hit), Ignores Cover, Pistol (usable in Engagement Range). Twin heavy stubber: Twin-linked (re-roll wound) and Rapid Fire 3 (6 A within 18"). |
| CLA-6.9 | Metamorph mutations: two profiles of one weapon; each model picks strike **or** sweep each time it fights. |
| CLA-6.10 | MOUNTED keyword: plain keyword; terrain treats MOUNTED as non-INFANTRY (no climbing ruins / moving through ruin walls), as every non-INFANTRY/BEAST unit already is. |

Suggested `paintScheme`: unchanged faction scheme (`faction.json`). Ridgerunner / bikes reuse the mustard primary with
violet panels.

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9) or existing hook reused by name; (b) = new code hook
(registered through `genestealerCultsHooks()` in `src/engine/factions/genestealer-cults.ts`); (c) = engine change beyond a
code hook (signatures in §7.1).

| Rule | Enc. | Encoding |
|---|---|---|
| Cult Ambush, Claw variant (CLA-2.1–2.6) | (c)+(a) | new ability `gsc.a.cult-ambush-claw` `{trigger:'unitDestroyed', scope:{who:'self'}, code:'cultAmbush', params:{battlelineBonus:0, earlyRoundBonus:1, earlyRoundsTo:2, success:5, markerGap:9, firstRound:2, lastRound:3, whollyWithin:3, resetOneShot:true, poolIsReserves:true}}` on Hybrid Metamorphs only. The registered `cultAmbush` hook is reused unchanged; the variant behaviour is parameter-driven engine code in `src/engine/cult-ambush.ts` (§7.1). Hand-of-the-Magus params gain the new keys with defaults that keep GEN behaviour identical. |
| Priority Kill Order (CLA-3.1) | (b) | enhancement `gsc.e.priority-kill-order` `{trigger:'hitRoll', effect:{reroll:'all'}, code:'priorityKillOrder', params:{pickWindow:'shooting.start'}}` (no declarative scope on the bearer — the effect lives on the target). Hook `priorityKillOrder` (`kind:'ability', hook:'onPhaseStart', run: noop`, `pick:{window:'shooting.start', topic:'abilityChoice'}`): **offer** when the active player owns a board unit whose half carries the enhancement and mark `pick:pko:<round>:<player>` is absent; options = enemy canonical board units with ≥1 model `ctx.services.los.visible(s, bearerModelId, m)` + `decline`. **handle**: `ctx.services.effects.grant(ctx, enemyCanon, [{reroll:'all'}], {sourceAbilityId, sourceUnitId: bearerUnit, scope:{who:'attacker'}, duration:'untilEndOfPhase', when:{attackerKeyword:'GENESTEALER CULTS'}})` on every half; `gateActive` = attacker's owner is the enhancement owner; emits `AbilityTriggered`. |
| Master of Suppression (CLA-3.2) | (b) | enhancement `gsc.e.master-of-suppression` `{trigger:'always', code:'masterOfSuppression'}`. Hook `masterOfSuppression` (`kind:'ability'`, `pick:{window:'shooting.attacksResolved', topic:'abilityChoice'}`): **offer** when the unit that just shot (window key) is the bearer's canonical unit, own turn, mark `pick:mos:<round>:<canon>` absent; options = enemy canonical units hit this phase by any half of the bearer's unit (read `hitBy:<attackerCanon>:<weaponId>:<target>` marks, any weapon — local helper `unitsHitByUnit`, same parsing as CSM `unitsHitByWeapon`) + `decline`. **handle**: grant on every half of the enemy `[{modifyRoll:{roll:'hit', value:-1}}]`, scope `self` (holder's own attacks), duration `battle`; store `{player, round}` in the effect id map `state.mission.custom.masterOfSuppression[effectId]`. `gateActive(state, entry)` = false (and the effect is treated as expired) once `state.round > grantRound && state.activePlayer === owner && state.phase ∈ {shooting, charge, fight}`; the hook also deletes such effects on its next offer. No frozen change (no new expiry kind). |
| Infiltration Agenda (CLA-4.1) | (b) | secondary `gsc.sec.infiltration-agenda` `scoring:[{id:'infiltration-agenda', when:'turn.end', who:'active', rounds:{from:1,to:5}, rule:'custom', code:'infiltrationAgenda', pointsPer:4, cap:99}]`; `missionHook('infiltrationAgenda','onTurnEnd')` + `case 'infiltrationAgenda'` in `missions.ts customAmount` → `infiltrationAgendaAmount(s, rule, pid)`: 1 if some own board unit (canonical or half) with keyword GENESTEALER CULTS, not `battleShocked`, has a model whose base footprint overlaps `deploymentZone(s, otherPlayer(pid))` (centre inside, or centre-to-polygon distance < base radius), else 0. |
| Safeguard the Sanctuary (CLA-4.2) | (b) | secondary `gsc.sec.safeguard-the-sanctuary` `scoring:[{id:'safeguard-the-sanctuary', when:'battle.end', who:'both', rounds:{from:1,to:5}, rule:'custom', code:'safeguardTheSanctuary', pointsPer:10, cap:10}]`; `missionHook('safeguardTheSanctuary')` + `case` in `customAmount` → `safeguardTheSanctuaryAmount(ctx, rule, pid, controls)`: edge = the board edge (x=±w/2 or z=±h/2) sharing the longest boundary length with `deploymentZone(s, pid)`; candidates = non-removed objectives with minimal |centre − edge| (ties within 0.01"); 1 if `controls(id)` for any candidate. |
| Metamorphic Spasm (CLA-5.1) | (a) | stratagem `gsc.s.metamorphic-spasm` = Daemonic Fervour shape: `window:'fight.targetsDeclared'`, `who:'either'`, `condition:{phase:'fight'}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'HYBRID METAMORPHS'}, state:'targetedByAttack', count:1}]`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'`, **`code:'daemonicFervour'`**, `params:{threshold:4}` — reuses the existing hook and C5 fight-on-death (`grantFightOnDeath`, deferred removal) unchanged. |
| Point-Blank Ambush (CLA-5.2) | (a) | stratagem `gsc.s.point-blank-ambush` = Voracious Assault shape: `window:['shooting.start','shooting.attacksResolved','fight.start','fight.attacksResolved']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:true},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'GENESTEALER CULTS'}, state:'notYetShot', count:1}]`, `params:{stateByPhase:{shooting:'notYetShot', fight:'notYetFought'}}`, `effect:{when:{range:{within:12}}, grantWeaponAbility:{ability:'LETHAL_HITS'}}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `limit:'oncePerPhase'`. `stateByPhase` is generic in stratagems.ts; no `code` needed. |
| Swarm the Oppressors (CLA-5.3) | (b) | stratagem `gsc.s.swarm-the-oppressors` `window:'charge.start'`, `who:'active'`, `targets:[{role:'unit', owner:'enemy', count:1}]`, `effect:{modifyRoll:{roll:'charge', value:1}}`, `duration:'untilEndOfPhase'`, `code:'swarmTheOppressors'`, `limit:'oncePerPhase'`. Hook `swarmTheOppressors` (`kind:'stratagem', hook:'onChargeRoll', hooks:['onChargeRoll'], run: noop, grantsItself:true`): `check` = the enemy is on the board and the user has ≥1 board GSC unit; `apply` = push mark `swarm:<player>:<enemyCanon>`, then grant `{modifyRoll:{roll:'charge', value:1}}` scope `self` untilEndOfPhase to every own board GENESTEALER CULTS unit (all halves); `gateActive(state, entry, data)` = `data.targetUnitIds` (ChargeRollHookContext) contains a unit `sameUnit` with a marked enemy for the holder's player. |
| Master Outrider (CLA-6.1) | (b) | ability `gsc.a.master-outrider` `{trigger:'always', code:'masterOutrider', params:{distance:6}}` on Shanus. Hook `masterOutrider` (`kind:'ability'`, `pick:{window:'shooting.attacksResolved', topic:'abilityChoice'}`): **offer** when the window key's canonical unit has a half with this ability, is on the board, own turn, `!leaderService.inEngagementWithEnemy`, mark `pick:outrider:<canon>` absent; options `move` / `decline`. **handle** `move`: grant `{forbid:'charge'}` scope self `untilEndOfTurn` on every half, emit `AbilityTriggered`, then `startReactiveMove(ctx, canon, 6, abilityId, 'shooting.attacksResolved')` (existing; same call as T'au Rapid Repositioning, which runs at `phase.end` of the Shooting phase). Verify the reactive-move decision is resolved when raised from `shooting.attacksResolved`; if the shooting module does not drain it there, fall back to queueing a `pushReaction` `kind:'surge'`-style request — see issues. |
| Crossfire (CLA-6.2) | (b) | ability `gsc.a.crossfire` `{trigger:'always', code:'crossfire'}` on the Ridgerunner. Hook `crossfire` (`kind:'ability'`, `pick:{window:'shooting.attacksResolved', topic:'abilityChoice'}`, `canPass:false`): **offer** when the window key's unit has this ability, own Shooting phase, mark `pick:crossfire:<canon>` absent; candidates = `unitsHitByUnit(s, canon)` minus enemies with mark `crossfire:<round>:<activePlayer>:<enemyCanon>` (kept in `state.mission.custom.crossfireMarked`, turn-scoped — phase marks would not survive into the Fight phase); no candidate → no decision. **handle**: grant `[{modifyStat:{stat:'AP', value:-1}}]` on every half of the enemy, scope `attacker`, `when:{attackerKeyword:'GENESTEALER CULTS'}`, `untilEndOfTurn`; `gateActive` = attacker owner is the Ridgerunner's owner. (Target-held `scope:'attacker'` modifyStat is resolved at `onStatQuery` with attack context — hooks-impl `partyFor`.) |
| Scouts 9"/6", Stealth, FNP 5+, Deadly Demise 1, Leader | (a) | `coreAbilities`: Shanus `[{LEADER},{SCOUTS,9},{STEALTH}]`, `leader.attachTo:['gsc.atalan-jackals']`, patrol `attachTo:'jackals'`; Metamorphs `[{FEEL_NO_PAIN,5},{SCOUTS,6}]`; Jackals `[{SCOUTS,9},{STEALTH}]`; Ridgerunner `[{DEADLY_DEMISE,1},{SCOUTS,9}]` |
| Weapon abilities | (a) | `PISTOL`, `HEAVY`, `PRECISION`, `TORRENT` (skill null), `IGNORES_COVER`, `RAPID_FIRE` 3, `TWIN_LINKED`; mutations profiles via shared `profileGroup` |
| Wolfquad statline / bases | (a) | composition `statsOverride:{W:4}`; bases `{shape:'oval', mm:60, mm2:35}`, `{shape:'round', mm:60}`, `{shape:'oval', mm:120, mm2:92}` |
| MOUNTED, GREAT DEVOURER, JACKAL ALPHUS… | (a) | plain keywords |

Totals: **7 new code hooks** (`priorityKillOrder`, `masterOfSuppression`, `infiltrationAgenda`, `safeguardTheSanctuary`,
`swarmTheOppressors`, `masterOutrider`, `crossfire`); **reused**: `cultAmbush`, `daemonicFervour`, `stateByPhase`,
`startReactiveMove`, `effects.grant`, `hitBy:` marks, `missionHook`. **1 engine change** (Cult Ambush variant parameters
+ Reserves cull) in non-frozen `src/engine/cult-ambush.ts` and `src/engine/phases/movement.ts`. **No frozen contract
change**: the 3" set-up limit reuses the existing `MoveConstraints.region` (types.ts already has it), the cull reuses
`UnitLostInReserves`, decisions reuse `chooseOption` topic `abilityChoice`. No `00-architecture.md` edit needed.

### 7.1 Engine changes (c) — exact signatures

The (b) hooks do not depend on these; only the Claw ability data does. All in **non-frozen** files.

1. `src/engine/cult-ambush.ts`:
   ```ts
   export interface CultAmbushParams {
     battlelineBonus: number        // Hand 3, Claw 0
     earlyRoundBonus: number        // Hand 0, Claw 1 — added while state.round <= earlyRoundsTo
     earlyRoundsTo: number          // Claw 2
     success: number                // Hand 4, Claw 5
     markerGap: number              // 9
     firstRound: number             // Hand 1, Claw 2 — no return before this round (CLA-2.5a)
     lastRound: number              // 3 for both
     whollyWithin: number | null    // Claw 3: every placed model wholly within this many inches of the marker edge
     resetOneShot: boolean          // Claw true: returned models start with oneShotUsed = [] (CLA-2.4)
     poolIsReserves: boolean        // Claw true: culled at the R-5.14 moment (CLA-2.5b)
   }
   export const DEFAULT_CULT_AMBUSH_PARAMS: CultAmbushParams // Hand values: {3,0,2,4,9,1,3,null,false,false}
   export function cultAmbushParams(state: GameState, unit: Unit): CultAmbushParams // replaces private paramsOf
   // circle of radius (whollyWithin + CULT_AMBUSH_MARKER_RADIUS) as an inscribed 32-gon, clipped to the board rectangle
   export function cultAmbushReturnRegion(state: GameState, markerPos: Vec3, whollyWithin: number): Polygon
   export function cultAmbushArrivalPlacements(state: GameState, models: Model[], player: PlayerId, markerPos: Vec3,
     params?: Pick<CultAmbushParams, 'markerGap' | 'whollyWithin'>): ModelPlacement[] | null // adds region when whollyWithin set
   // R-5.14 moment: for every pool unit whose params.poolIsReserves, remove it from the pool, spawn its copy with
   // spawnDestroyedUnitCopy, set location 'reserves', emit UnitLostInReserves, then destroy it through the cull path;
   // flags the copy so onCultAmbushUnitDestroyed skips it (no re-roll)
   export function cultAmbushCullPool(ctx: EngineContext): void
   ```
   Behaviour changes: `onCultAmbushUnitDestroyed` adds `earlyRoundBonus` as a second roll modifier (`source:'early rounds'`)
   and skips units destroyed while `location === 'reserves'`; `returnStillPossible` uses the unit's `lastRound`;
   `cultAmbushReturnStep` filters options to pool units with `firstRound <= state.round <= lastRound` (per unit params);
   `answerCultAmbush` 'return' copies `oneShotUsed` only when `!resetOneShot`.
2. `src/engine/phases/movement.ts`: `resolveArrival(..., via:'cultAmbush')` sets `constraints.region =
   cultAmbushReturnRegion(...)` when the pool unit's `whollyWithin` is set (else the board polygon, as now);
   `cullStrandedReserves(ctx, endOfRound3)` calls `cultAmbushCullPool(ctx)` exactly once, at the `endOfRound3` moment.
3. Data: `gsc.a.cult-ambush` keeps its four params; the new keys default from `DEFAULT_CULT_AMBUSH_PARAMS`, so GEN-001…037
   stay green.

## 8. Test IDs

Same list as the `CLA` section of 12-rules-test-checklist. Engine/data tests:
`tests/engine/genestealer-cults-claw-of-ascension.test.ts`, `tests/data/genestealer-cults-claw-of-ascension.test.ts`.

| ID | Ref | Scenario → expected |
|---|---|---|
| CLA-001 | CLA-1 | patrol `gsc.cp.claw-of-ascension` loads: 5 units, 17 models; Shanus is WARLORD with Priority Kill Order, attached to `jackals`; default secondary Infiltration Agenda; `faction.json` lists both patrols; Hand of the Magus still loads unchanged |
| CLA-002 | CLA-1 | wargear as built: Metamorph mutant has no ranged weapon; 3 flamers have hand flamer; Wolfquad has mining laser and 4 W, other Jackals 2 W |
| CLA-003 | CLA-2.1 | Metamorphs destroyed in round 2 with D6 = 4 → total 5 → pool + marker decision; D6 = 3 → lost |
| CLA-004 | CLA-2.1 | Metamorphs destroyed in round 3 with D6 = 4 → lost (no bonus); D6 = 5 → pool |
| CLA-005 | CLA-2.1 | Atalan Jackals, Shanus and the Ridgerunner destroyed → no Cult Ambush roll |
| CLA-006 | CLA-2.3 | return: a placement with a model 3.2" beyond the marker edge is rejected; all models wholly within 3", one touching, all >9" from enemies → accepted |
| CLA-007 | CLA-2.3 | marker 1" from a board edge: offered placements stay on the board and inside the 3" region |
| CLA-008 | CLA-2.4 | returned Metamorphs are a new unit at 5 models, full wounds; `oneShotUsed` empty on every model (resetOneShot) |
| CLA-009 | CLA-2.5 | Metamorphs destroyed in round 1 during the GSC player's own first turn (going first) → pool + marker, but no return offered in the opponent's round-1 Movement phase; offered in round 2 |
| CLA-010 | CLA-2.5 | Claw pool unit still waiting when the second player's round-3 reinforcements end → `UnitLostInReserves`, counted once more as destroyed, no Cult Ambush re-roll, pool empty |
| CLA-011 | CLA-2.5 | Metamorphs destroyed in round 4 → roll made; on success no marker decision, never returns, never counted |
| CLA-012 | CLA-2 | regression: Hand of the Magus Neophytes still +3 BATTLELINE / 4+, keep One Shot state, no round-1 restriction change (GEN-002, GEN-015 unchanged) |
| CLA-013 | CLA-3.1 | Priority Kill Order: start of own Shooting phase → decision lists only enemies visible to Shanus; a missed Ridgerunner hit roll vs the picked unit is re-rolled; a successful one may be re-rolled by choice; vs another unit no re-roll; gone at phase end |
| CLA-014 | CLA-3.1 | Priority Kill Order: not offered in the opponent's Shooting phase; no option for an enemy hidden from Shanus's model |
| CLA-015 | CLA-3.2 | Master of Suppression: after Shanus's unit shoots, picks only among units it hit; that unit's attacks −1 to hit in its own next turn and in Overwatch during the GSC player's next Movement phase; gone at the start of the GSC player's next Shooting phase |
| CLA-016 | CLA-3.2 | Master of Suppression stacked with Stealth on the target of the suppressed unit's attacks → still −1 (cap) |
| CLA-017 | CLA-4.1 | Infiltration Agenda: end of own turn with a non-shocked Metamorph model's base overlapping the enemy zone → +4; two units in → still 4; Battle-shocked only → 0; end of opponent's turn → 0 |
| CLA-018 | CLA-4.2 | Safeguard the Sanctuary: cp-01 GSC as player A controls `south` at battle end → +10; controls `north` only → 0 |
| CLA-019 | CLA-4.2 | Safeguard the Sanctuary on cp-04 (triangle zone): closest marker to the west edge (`site-a`) is the one that scores |
| CLA-020 | CLA-5.1 | Metamorphic Spasm: enemy picks Metamorphs in the Fight phase → offered; a model destroyed before the unit fought rolls 4+ → stays, fights after the enemy finishes, then removed; roll 3 → removed at once |
| CLA-021 | CLA-5.1 | Metamorphic Spasm not offered for Jackals or the Ridgerunner |
| CLA-022 | CLA-5.2 | Point-Blank Ambush: Jackals' small-arms critical hits vs a unit 10" away auto-wound; vs a unit 14" away they do not; usable in either player's Fight phase on a unit that has not fought |
| CLA-023 | CLA-5.2 | Point-Blank Ambush not offered for a unit that already shot this phase, nor in the opponent's Shooting phase |
| CLA-024 | CLA-5.3 | Swarm the Oppressors: start of own Charge phase, enemy X picked; a charge declaring X (alone or with others) gets +1 to the roll; a charge not including X gets none; gone after the phase |
| CLA-025 | CLA-6.1 | Master Outrider: after Shanus+Jackals shoot, out of Engagement Range → may move up to 6" (Normal move, must end outside ER); afterwards no charge declaration offered that turn; declining keeps charging legal |
| CLA-026 | CLA-6.1 | Master Outrider not offered when the unit is within Engagement Range after shooting, nor in the opponent's turn (Overwatch) |
| CLA-027 | CLA-6.2 | Crossfire: after the Ridgerunner hits enemy X, X gets −1 AP improvement vs GSC attacks for the rest of the turn (Metamorph strike AP −1 resolves at −2 in the Fight phase); Shanus's ranged attacks vs X later that phase also improved; effect gone at end of turn |
| CLA-028 | CLA-6.2 | Crossfire: no decision when the Ridgerunner hit nothing; a unit already Crossfire-marked this turn is not offered again |
| CLA-029 | CLA-6.3 | Scouts: Shanus+Jackals and the Ridgerunner may Scout 9", Metamorphs 6"; Deep Strike offered to no unit |
| CLA-030 | CLA-6.4 | Metamorphs FNP 5+: each lost wound rolls; Jackals have no FNP |
| CLA-031 | CLA-6.5 | Stealth: ranged attacks vs Shanus+Jackals −1 to hit; melee unchanged |
| CLA-032 | CLA-6.6 | Ridgerunner destroyed → Deadly Demise 1 on a 6 (1 mortal wound to each unit within 6") |
| CLA-033 | CLA-6.7 | cult sniper rifle: Precision lets the hit go to an attached enemy CHARACTER; Heavy +1 to hit when stationary |
| CLA-034 | CLA-6.8 | weapons: hand flamer D6 auto-hits ignoring cover and usable in Engagement Range; twin heavy stubber re-rolls failed wound rolls and fires 6 shots within 18"; mining laser D6+1 damage |
| CLA-035 | CLA-6.9 | Metamorph mutations: each model fights with exactly one profile (strike 3 A or sweep 5 A), never both |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, mounted ≈1.3–1.5, vehicles compressed); bases are rules-true. Every prompt
names each held item exactly once (one weapon per hand). Existing GSC look: mustard work overalls, violet-skinned hybrid
features, rust-red trim, worn steel.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `shanus-daskovian` | `gsc.shanus-daskovian/shanus` | 1 | 1.5 | 60 × 35 mm oval | A chibi cult outrider chief with a slightly ridged violet-tinged brow and long dark coat, riding a chunky mustard-yellow three-wheeled mining bike with rust-red mudguards, holding exactly one long scoped rifle across the handlebars, a small pistol holstered on the hip. |
| `metamorph-leader` | `gsc.hybrid-metamorphs/leader` | 2 | 1.2 | 32 mm | A chibi hunched violet-skinned hybrid boss in a torn mustard vest, one arm ending in a huge curved bony talon and the other holding a single small pistol, a ridged bald head and fierce yellow eyes. |
| `metamorph-mutant` | `gsc.hybrid-metamorphs/mutant` | 2 | 1.2 | 32 mm | A chibi violet-skinned hybrid with one massive crab-like claw arm and one long whipping tentacle arm, mustard work trousers and rust-red wrist wraps, no gun. |
| `metamorph-flamer` | `gsc.hybrid-metamorphs/flamer` | 6 | 1.2 | 32 mm | A chibi violet-skinned hybrid with one oversized bony talon arm and, in the other hand, a single stubby flame pistol with a small glowing pilot light, mustard vest and steel knee pads. |
| `atalan-jackal` | `gsc.atalan-jackals/rider` | 3 | 1.4 | 60 × 35 mm oval | A chibi goggled raider in a mustard duster and rust-red scarf hunched over a rugged dirt bike with knobbly tyres and violet tank panels, one hand on the bars and the other holding a single short club. |
| `atalan-jackal-power` | `gsc.atalan-jackals/power-rider` | 1 | 1.4 | 60 × 35 mm oval | The same chibi raider on a rugged violet-and-mustard dirt bike, swinging a single crackling blue-edged power cleaver over the front wheel. |
| `atalan-wolfquad` | `gsc.atalan-jackals/wolfquad` | 1 | 1.5 | 60 mm | A chibi raider driving a squat four-wheeled quad bike in mustard yellow with violet panels, a heavy mining laser with a glowing red lens mounted on the rear rack and a short club clipped to the side. |
| `achilles-ridgerunner` | `gsc.achilles-ridgerunner/ridgerunner` | 1 | 1.9 | 120 × 92 mm oval | A chibi open-topped four-wheeled scout buggy with huge suspension springs and fat off-road tyres in mustard yellow and violet, a rack of three chunky missile tubes on the back and a twin-barrelled machine gun on a pintle, a goggled driver at the wheel. |

## 10. Other Genestealer Cults patrols (appendix)

- **Hand of the Magus** (Index, June 2023) — already playable, see [genestealer-cults.md](genestealer-cults.md): Magus
  Veridielle (1), Neophyte Hybrids (10) ×2, Acolyte Hybrids (5), Aberrants (5), Goliath Rockgrinder (1) — 6 units, 32 models.
