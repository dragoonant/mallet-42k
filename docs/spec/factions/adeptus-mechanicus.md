# Faction spec — Adeptus Mechanicus: Purge Corps Deltic-9

Own-words data spec for the Adeptus Mechanicus Combat Patrol, same shape as 11-combat-patrol §4. Rule ids
`ADM-<section>.<n>` are cited by the `ADM-` rows of 12-rules-test-checklist. Mechanics are 1:1 with the source; every
sentence of prose here is ours. Data id prefix: `adm.` (faction id `adeptus-mechanicus`, faction keyword
`ADEPTUS MECHANICUS`).

Test-id prefix is **`ADM-`**, not `ADE-`: `ADE-001…ADE-039` already belong to Adepta Sororitas (12-rules-test-checklist
§ADE, `tests/data/adepta-sororitas.test.ts`), and coverage is measured by test names, so a shared prefix would collide.

## 0. Sources (accessed 2026-10-15)

| Source | URL | Version shown on page |
|---|---|---|
| Adeptus Mechanicus "Purge Corps Deltic-9" (primary) | https://wahapedia.ru/wh40k10ed_cp/factions/purge-corps-deltic-9/ | Index 10, 10th ed, last update January 2024 |
| Adeptus Mechanicus "Maniple Verask-Alpha" (appendix only) | https://wahapedia.ru/wh40k10ed_cp/factions/maniple-verask-alpha/ | Index 10, 10th ed, June 2023 |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | already captured in 11-combat-patrol §1–2; not re-fetched |

Patrol selection: wahapedia lists two Adeptus Mechanicus patrols. **Purge Corps Deltic-9** (January 2024) is the newer
one and is the roster of the current boxed Combat Patrol (Tech-Priest Manipulus, 10 Skitarii, 3 Serberys, 5 Pteraxii),
so it is primary. **Maniple Verask-Alpha** (June 2023, the launch-era box) is the alternate roster (§10), to be added
later in add-patrol mode.

## 1. Roster

4 units, 19 models. Faction keyword ADEPTUS MECHANICUS on every datasheet; all IMPERIUM.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `skand` | Manipulus Skand | 1 | transonic cannon; Omnissian staff | **WARLORD** (Aspergilla of Tarentum by default). Leader → Skitarii Vanguard (the only bodyguard listed); starts attached |
| `vanguard` | Skitarii Vanguard | 10 | Vanguard Alpha: Mechanicus pistol, Alpha combat weapon. 1×: arc rifle, close combat weapon. 1×: plasma caliver, close combat weapon. 7×: radium carbine, close combat weapon | BATTLELINE |
| `sulphurhounds` | Serberys Sulphurhounds | 3 | Sulphurhound Alpha: Mechanicus pistol, sulphur breath, cavalry arc maul, clawed limbs. 1×: phosphor blast carbine, phosphor pistol, sulphur breath, clawed limbs. 1×: two phosphor pistols, sulphur breath, clawed limbs | — |
| `pteraxii` | Pteraxii Sterylizors | 5 | every model: phosphor torch, Pteraxii talons; the Sterylizor Alpha also has a flechette blaster and a taser goad | Deep Strike |

No wargear options in the box build. Two phosphor pistols on one model are merged into one A2 weapon
`adm.w.paired-phosphor-pistols` **[interpretation: same as the Penitent Host paired bolt pistols — data has no
duplicated weapon ids; splitting the two pistols between targets is lost]**.

| Id | Rule |
|---|---|
| ADM-1.1 | Skand's only bodyguard is the Skitarii Vanguard; the patrol deploys them attached (Skand + 10 Vanguard = one 11-model unit). Skand is the WARLORD and carries the chosen enhancement. |

## 2. Faction ability — Doctrina Imperatives

Carried by the Skitarii Vanguard, Serberys Sulphurhounds and Pteraxii Sterylizors. **Manipulus Skand's datasheet does
not have it.**

| Id | Rule |
|---|---|
| ADM-2.1 | At the start of every battle round, the player picks one imperative: **Protector** or **Conqueror**. It is active until the end of that battle round for every unit of theirs that has this ability. A pick is required each round (no "none" option; the source gives none). |
| ADM-2.2 | **Protector**: ranged weapons of models in the unit gain [HEAVY]. In addition, while the unit is within its own player's deployment zone, every ranged attack that targets it has its AP worsened by 1 (−2 → −1, −1 → 0; AP 0 stays 0). |
| ADM-2.3 | **Conqueror**: ranged weapons of models in the unit gain [ASSAULT]. In addition, every ranged attack a model in the unit makes against a target unit that is within the opponent's deployment zone has its AP improved by 1 (0 → −1). |
| ADM-2.4 | "Within a deployment zone" for a unit = at least one of its models is at least partly inside the zone polygon (`partlyWithinPolygon`, as Kauyon Lure). Checked per attack when the AP is computed. **[interpretation]** |
| ADM-2.5 | Attached unit **[interpretation]**: the engine treats the bodyguard's "this unit" abilities as covering the whole attached unit (20-data-schema `scope.who: self`), so while Skand leads the Vanguard his transonic cannon also gains [HEAVY]/[ASSAULT] (no effect on a Torrent weapon's hit roll, since there is none), and attacks against the combined unit get the Protector AP penalty. Skand on his own gets nothing. |
| ADM-2.6 | Both modifiers touch ranged attacks only; melee is never affected. Mirror match: each player's imperative is independent; an attacker's Conqueror (−1) and a defender's Protector (+1, never past 0) both apply. |

## 3. Enhancements (Manipulus Skand, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Aspergilla of Tarentum | default | every attack that targets the bearer's unit (the attached unit included; Skand alone too) gets −1 to its wound roll (subject to the ±1 wound-modifier cap). Ranged and melee. |
| Overcharged Electropositors | optional | ranged weapons of every model in the bearer's unit get +6" Range and gain [IGNORES COVER]. Melee weapons unchanged. |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Targeted Purge | default | at the start of battle round 1 your **opponent** picks one unit of **their own** army that is not a MONSTER or VEHICLE (an attached pair is one candidate; it is excluded if either half has one of those keywords; Reserves allowed). At the end of the battle you score 12 VP if that unit is destroyed. |
| Prescribed Excoriation | optional | from battle round 2 onwards, at the end of **your** turn: 5 VP if no enemy unit (Battle-shocked units ignored) is within 6" of your deployment zone; otherwise 3 VP if no enemy unit (Battle-shocked ignored) is within your deployment zone; otherwise 0. No cap given on the page (max 4 × 5 = 20). |

| Id | Rule |
|---|---|
| ADM-4.1 | Targeted Purge "destroyed" = every half `location === 'destroyed'`; a unit still in Reserves at battle end counts as destroyed (R-5.16), exactly as Ethereal Edict (SDC-4.3). If the opponent has no eligible unit at the pick, no pick and no VP. |
| ADM-4.2 | Prescribed Excoriation counts enemy units on the battlefield only (embarked and Reserves units are not within anything). An attached enemy pair is one unit; it is ignored if it is Battle-shocked (either half flagged). "Within the zone" = any model partly inside it; "within 6" of the zone" = any model partly inside the zone grown by 6" (`growConvexPolygon(zone, 6)`, the Infiltrators helper; every CP deployment zone is convex). **[interpretation]** |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| An Evaluation of Mettle | 1 | battleTactic | `shooting.targetsDeclared` (opponent's Shooting) or `fight.targetsDeclared` (Fight phase, either turn), just after an enemy unit picks its targets | own ADEPTUS MECHANICUS unit that is a target of those attacks | until end of phase, models in the unit have Feel No Pain 5+ |
| Optimised Efficiency | 1 | strategicPloy | `movement.unitMoved` (your Movement phase), just after one of your ADEPTUS MECHANICUS units ends a Fall Back move | that unit | until end of turn, the unit can shoot and can declare a charge even though it Fell Back |
| Acceptable Risk Ratio | 1 | battleTactic | your Shooting phase, between activations (`shooting.start` … `shooting.attacksResolved`) | own ADEPTUS MECHANICUS unit not yet selected to shoot this phase | until end of phase, the unit's ranged weapons improve AP by 1 and gain [HAZARDOUS] |

| Id | Rule |
|---|---|
| ADM-5.1 | An Evaluation of Mettle timing: the page reads "opponent's Shooting phase or Fight phase"; we use the Gene-wrought Resilience shape (opponent's Shooting, or the Fight phase of either turn). The FNP also applies to mortal wounds suffered during that phase. |
| ADM-5.2 | Acceptable Risk Ratio's [HAZARDOUS]: after the unit has shot, one Hazardous test per model that fired an affected weapon (core R-rules: a 1 destroys a non-CHARACTER model; a CHARACTER — Skand — suffers 3 mortal wounds instead). Torrent weapons count. |

Core stratagems apply per 10-rules §11 with their keyword gates. Note **[interpretation]**: wahapedia's per-datasheet
list for Skand omits Go to Ground, but Skand has INFANTRY; the engine applies the keyword gate (INFANTRY) and does not
special-case him. Tank Shock: no VEHICLE → nobody. Epic Challenge: Skand only (CHARACTER).

## 6. Datasheets

| Unit | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Manipulus Skand | 1 | 50 mm | 6 | 4 | 2+ | 5+ | 4 | 7+ | 1 | INFANTRY, CHARACTER, IMPERIUM, CULT MECHANICUS, TECH-PRIEST, MANIPULUS, MANIPULUS SKAND | Leader → Skitarii Vanguard; Galvanic Field |
| Skitarii Vanguard | 10 | 25 mm | 6 | 3 | 4+ | 5+ | 1 | 7+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, SKITARII, VANGUARD | Doctrina Imperatives; Rad-saturation (Aura) |
| Serberys Sulphurhounds | 3 | 60 × 35 mm oval | 12 | 4 | 4+ | 5+ | 2 | 7+ | 2 | MOUNTED, IMPERIUM, SKITARII, SERBERYS SULPHURHOUNDS | Doctrina Imperatives; Line-breakers |
| Pteraxii Sterylizors | 5 | 40 mm | 12 | 4 | 4+ | 5+ | 2 | 7+ | 1 | INFANTRY, FLY, JUMP PACK, IMPERIUM, SKITARII, PTERAXII, STERYLIZORS | Deep Strike; Doctrina Imperatives; Searing Conflagration |

Faction keyword (all): ADEPTUS MECHANICUS.

Abilities:

| Id | Unit | Rule |
|---|---|---|
| ADM-6.1 | Skand — Galvanic Field | while Skand leads a unit, every weapon (ranged and melee) of every model in that unit — Skand's own included — has [LETHAL HITS]. Torrent weapons make no hit roll, so it never triggers on them. |
| ADM-6.2 | Vanguard — Rad-saturation (Aura) | while an enemy unit that is not a VEHICLE is within 3" of this unit, each model in that enemy unit has −1 OC (never below 0). Applies while this unit is Battle-shocked too. Not cumulative from the same unit. |
| ADM-6.3 | Sulphurhounds — Line-breakers | each time this unit ends a Charge move, pick one enemy unit within Engagement Range of it; roll one D6 for each model of this unit within Engagement Range of that enemy unit, adding 2 to each roll if this unit started that Charge move within 6" of one or more friendly ADEPTUS MECHANICUS BATTLELINE units; each result of 4+ = 1 mortal wound on that enemy unit. |
| ADM-6.4 | Pteraxii — Searing Conflagration | each time a model of this unit attacks with a **phosphor torch** and the target is an enemy unit within range of an objective marker, re-roll a wound roll of 1. If this unit is also within 6" of one or more friendly ADEPTUS MECHANICUS BATTLELINE units, such an attack may instead re-roll the wound roll (any result). |
| ADM-6.5 | Line-breakers start position **[interpretation]**: the "started within 6"" test is taken once, just before the Charge move begins (after Overwatch), at unit-to-unit distance (closest models). A Heroic Intervention charge move also triggers Line-breakers; if no start snapshot was recorded for it, no +2. |
| ADM-6.6 | Pistols (core): MOUNTED is not MONSTER/VEHICLE, so a Sulphurhound fires either its Pistol weapons (sulphur breath, phosphor/Mechanicus pistols) or its other ranged weapons (phosphor blast carbine), not both. The Pteraxii Alpha likewise chooses flechette blaster (Pistol) or phosphor torch. |

Wargear per model:

| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Manipulus Skand | — | transonic cannon | Omnissian staff |
| Skitarii Vanguard | Vanguard Alpha | Mechanicus pistol | Alpha combat weapon |
| Skitarii Vanguard | ×1 | arc rifle | close combat weapon |
| Skitarii Vanguard | ×1 | plasma caliver (2 profiles) | close combat weapon |
| Skitarii Vanguard | ×7 | radium carbine | close combat weapon |
| Serberys Sulphurhounds | Sulphurhound Alpha | Mechanicus pistol, sulphur breath | cavalry arc maul, clawed limbs |
| Serberys Sulphurhounds | ×1 | phosphor blast carbine, phosphor pistol, sulphur breath | clawed limbs |
| Serberys Sulphurhounds | ×1 | paired phosphor pistols, sulphur breath | clawed limbs |
| Pteraxii Sterylizors | Sterylizor Alpha | flechette blaster, phosphor torch | taser goad, Pteraxii talons |
| Pteraxii Sterylizors | ×4 | phosphor torch | Pteraxii talons |

Weapon profiles:

| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `adm.w.transonic-cannon` | transonic cannon | 12" | D6 | n/a | 4 | 0 | 2 | Torrent, Devastating Wounds |
| `adm.w.omnissian-staff` | Omnissian staff | melee | 4 | 3+ | 6 | −1 | 2 | — |
| `adm.w.mechanicus-pistol` | Mechanicus pistol | 12" | 1 | 4+ | 6 | −1 | 1 | Pistol, Devastating Wounds |
| `adm.w.arc-rifle` | arc rifle | 30" | 1 | 4+ | 8 | −1 | D3 | Rapid Fire 1, Anti-Vehicle 4+, Devastating Wounds |
| `adm.w.plasma-caliver-standard` | plasma caliver — standard | 30" | 2 | 4+ | 7 | −2 | 1 | — (profileGroup `adm.w.plasma-caliver`) |
| `adm.w.plasma-caliver-supercharge` | plasma caliver — supercharge | 30" | 2 | 4+ | 8 | −3 | 2 | Hazardous (profileGroup `adm.w.plasma-caliver`) |
| `adm.w.radium-carbine` | radium carbine | 18" | 3 | 4+ | 3 | 0 | 1 | Anti-Infantry 4+ |
| `adm.w.alpha-combat-weapon` | Alpha combat weapon | melee | 2 | 4+ | 5 | −1 | 1 | — |
| `adm.w.close-combat-weapon` | close combat weapon (Skitarii) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| `adm.w.phosphor-blast-carbine` | phosphor blast carbine | 18" | D6 | 4+ | 6 | 0 | 1 | Blast, Ignores Cover |
| `adm.w.phosphor-pistol` | phosphor pistol | 12" | 1 | 4+ | 4 | 0 | 1 | Pistol, Ignores Cover |
| `adm.w.paired-phosphor-pistols` | paired phosphor pistols | 12" | 2 | 4+ | 4 | 0 | 1 | Pistol, Ignores Cover (two phosphor pistols merged) |
| `adm.w.sulphur-breath` | sulphur breath | 9" | D6 | n/a | 3 | −1 | 1 | Torrent, Pistol, Ignores Cover |
| `adm.w.cavalry-arc-maul` | cavalry arc maul | melee | 1 | 4+ | 5 | −1 | 1 | Extra Attacks, Anti-Vehicle 4+, Devastating Wounds |
| `adm.w.clawed-limbs` | clawed limbs | melee | 4 | 4+ | 4 | 0 | 1 | — |
| `adm.w.flechette-blaster` | flechette blaster | 12" | 5 | 4+ | 3 | 0 | 1 | Pistol |
| `adm.w.phosphor-torch` | phosphor torch | 12" | D6 | n/a | 4 | 0 | 1 | Torrent, Ignores Cover |
| `adm.w.pteraxii-talons` | Pteraxii talons | melee | 2 | 4+ | 4 | 0 | 1 | — |
| `adm.w.taser-goad` | taser goad | melee | 3 | 4+ | 6 | 0 | 1 | Sustained Hits 2 |

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook (registered in
`src/engine/code-hooks.ts` `codeHooks` via a new `adeptusMechanicusHooks` factory in new
`src/engine/factions/adeptus-mechanicus.ts`); (c) = engine change beyond a code hook. Reused: the `round.start` pick
pattern (Waaagh! / Hateful Exhortation), Ethereal Edict's opponent-picks-a-unit machinery (`tau-empire.ts`), the
Tank Shock / Teeming Broods mortal-wound queue (`attack.queueMortalWounds`, `mortalCredit`), `growConvexPolygon` /
`partlyWithinPolygon` (geometry.ts), `defenderOfTheFaithOc`-style OC modifiers (statFor clamps OC ≥ 0), the Sworn
Protectors defender-side `scope.who:'attacker'` pattern, and the onStatQuery `cap` logic (C6) for "never past AP 0".

| Rule | Enc. | Encoding |
|---|---|---|
| Doctrina Imperatives — pick (ADM-2.1) | (b) | `doctrinaImperatives` — ability hook `hook:'onStatQuery'`, `pick:{window:'round.start', topic:'abilityChoice'}`. `offer(ctx, window, key)`: for each player in order (first player, then the other), skip if mark `pick:doctrina:<round>:<player>` exists or the player has no non-destroyed unit owning an ability with `code:'doctrinaImperatives'`; else push the mark and `ctx.decide({kind:'chooseOption', player, window, canPass:false, context:{topic:'abilityChoice', unitId:null, abilityId:<first such ability id>, data:{window, key, code:'doctrinaImperatives'}}, options:[{id:'protector', label:'Protector Imperative'}, {id:'conqueror', label:'Conqueror Imperative'}]})`, return true. `handle`: reject anything but those two ids; write `state.players[p].secondaryState['adm:imperative'] = { round: state.round, choice }`; emit `AbilityTriggered{abilityId, summary:'Doctrina Imperatives: <Protector\|Conqueror> this round'}`. AI: Conqueror if any enemy board unit is partly within the enemy deployment zone and within 18" of a friendly Doctrina unit, else Protector. |
| Doctrina — effects (ADM-2.2–2.6) | (a)+(b) | four abilities on each Doctrina datasheet, all `trigger:'always'`, `code:'doctrinaImperatives'`: `adm.a.doctrina-protector-heavy` `{params:{imperative:'protector'}, effect:{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'HEAVY'}}, scope:{who:'self'}}`; `adm.a.doctrina-protector-ap` `{params:{imperative:'protector', zone:'holderInOwnZone'}, effect:{when:{weaponType:'ranged'}, modifyStat:{stat:'AP', value:1, cap:0}}, scope:{who:'attacker'}}`; `adm.a.doctrina-conqueror-assault` `{params:{imperative:'conqueror'}, effect:{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'ASSAULT'}}, scope:{who:'self'}}`; `adm.a.doctrina-conqueror-ap` `{params:{imperative:'conqueror', zone:'targetInEnemyZone'}, effect:{when:{weaponType:'ranged'}, modifyStat:{stat:'AP', value:-1}}, scope:{who:'self'}}`. The hook's `gate(state, holder, entry, data)`: `ss = state.players[holder.player].secondaryState['adm:imperative']`; false unless `ss.round === state.round && ss.choice === entry.params.imperative`. `zone:'holderInOwnZone'` additionally needs `data.attack` (no attack context → false, so a UI preview of the unit's own weapons is never touched), `leaderService.sameUnit(state, data.attack.targetUnitId, holder.id)`, and any board model of the holder's halves `partlyWithinPolygon(m, deploymentZone(state, holder.player))`. `zone:'targetInEnemyZone'` needs `data.attack` and any board model of the target's halves `partlyWithinPolygon(m, deploymentZone(state, otherPlayer(holder.player)))`. AP is stored ≤ 0: `+1, cap 0` = worsen and never past 0 (statFor C6 cap logic); `−1` = improve. |
| Aspergilla of Tarentum | (a) | enhancement `adm.e.aspergilla-of-tarentum`, `restriction:{keyword:['MANIPULUS SKAND']}`, effect `{trigger:'woundRoll', effect:{modifyRoll:{roll:'wound', value:-1}}, scope:{who:'attacker'}}` (explicit scope overrides the enhancement default `bearer`; same shape as `ade.a.sworn-protectors`, matches the attached unit via `sameUnit`) |
| Overcharged Electropositors | (a) | enhancement `adm.e.overcharged-electropositors`, same restriction, effect `{trigger:'always', scope:{who:'self'}, effect:[{when:{weaponType:'ranged'}, modifyStat:{stat:'range', value:6}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'IGNORES_COVER'}}]}` (`effectiveWeapon` already queries `range`) |
| Targeted Purge (ADM-4.1) | (b) | secondary `adm.sec.targeted-purge`, `scoring:[{id:'targeted-purge-pick', when:'round.start', rounds:{from:1,to:1}, rule:'custom', code:'targetedPurgePick', pointsPer:0, cap:0, params:{excludeKeywords:['MONSTER','VEHICLE']}}, {id:'targeted-purge', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', code:'targetedPurgeScore', pointsPer:12, cap:12}]`. Reuse Ethereal Edict: generalise `etherealEdictOffer` with an optional `opts` (§7.1 item 2); `targetedPurgePick = {name:'targetedPurgePick', kind:'mission', hook:'onPhaseStart', run:noop, answer: answerEdict}` (answerEdict re-checks the exclusion, reads `abilityId`/`label` from `pending.context.data`); `targetedPurgeScore` mission hook → `etherealEdictAmount` (same `secondaryState['tau:edict']` storage; a player has one secondary). Add `targetedPurgePick` to `missions.ts PICK_CODES`, dispatch `rule.code === 'targetedPurgePick'` → `etherealEdictOffer(ctx, pid, rule.when, key, {code:'targetedPurgePick', abilityId:'adm.sec.targeted-purge', label:'Targeted Purge', excludeKeywords: rule.params.excludeKeywords})`, and `case 'targetedPurgeScore': return etherealEdictAmount(s, rule, pid)`. AI picker: as Ethereal Edict (highest `sum(W) × T`). |
| Prescribed Excoriation (ADM-4.2) | (b) | secondary `adm.sec.prescribed-excoriation`, `scoring:[{id:'prescribed-excoriation', when:'turn.end', who:'active', rounds:{from:2,to:5}, rule:'custom', code:'prescribedExcoriation', pointsPer:3, params:{nearInches:6, nearPoints:5}}]`; `prescribedExcoriation = missionHook('prescribedExcoriation','onTurnEnd')`; amount fn `prescribedExcoriationAmount(state, rule, pid)` in adeptus-mechanicus.ts, dispatched from `missions.ts`: `zone = deploymentZone(s, pid)`, `grown = growConvexPolygon(zone, nearInches)`; enemy canonical board units whose halves are all not Battle-shocked; if none has a board model `partlyWithinPolygon(m, grown)` → `nearPoints`; else if none `partlyWithinPolygon(m, zone)` → `pointsPer`; else 0. |
| An Evaluation of Mettle | (a) | stratagem `adm.s.pcd-evaluation-of-mettle`, `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS MECHANICUS'}, state:'targetedByAttack', count:1}]`, `effect:{feelNoPain:5}`, `scope:{who:'self'}`, `untilEndOfPhase` |
| Optimised Efficiency | (a)+(b) | stratagem `adm.s.pcd-optimised-efficiency`, `window:'movement.unitMoved'`, `who:'active'`, `condition:{phase:'movement', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS MECHANICUS'}, count:1}]`, `effect:[{shootAfterFallBack:true}, {chargeAfterFallBack:true}]`, `scope:{who:'self'}`, `untilEndOfTurn`, `code:'justFellBack'`. (b) `justFellBack` — stratagem hook, `hook:'onMove'`, `check(env, t)`: `leaderService.sameUnit(state, t.ids[0], env.trigger.unitId)` and the unit's `turn.moveType === 'fallBack'` (first non-null over its halves); no `apply` (declarative effect). Reusable for Retrogradial Targeting (appendix patrol). |
| Acceptable Risk Ratio (ADM-5.2) | (a) | stratagem `adm.s.pcd-acceptable-risk-ratio`, `window:['shooting.start','shooting.attacksResolved']`, `who:'active'`, `condition:{phase:'shooting', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS MECHANICUS'}, state:'notYetShot', count:1}]`, `effect:[{when:{weaponType:'ranged'}, modifyStat:{stat:'AP', value:-1}}, {when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'HAZARDOUS'}}]`, `scope:{who:'self'}`, `untilEndOfPhase` (Hazardous tests are native) |
| Galvanic Field (ADM-6.1) | (a) | Skand `leader.effects:[{id:'adm.a.galvanic-field', trigger:'always', when:{leaderAttached:true}, effect:{grantWeaponAbility:{ability:'LETHAL_HITS'}}, scope:{who:'self'}}]` (Veil of Time shape; ranged + melee) |
| Rad-saturation (ADM-6.2) | (b) | ability `adm.a.rad-saturation` `{trigger:'always', code:'radSaturation', effect:{modifyStat:{stat:'OC', value:-1}}, scope:{who:'enemy', within:3}, params:{excludeKeyword:'VEHICLE'}}`. (b) `radSaturation` — ability hook `hook:'onStatQuery'`, `gate(state, holder, entry, data)`: holder on the board, `data.stat === 'OC'`, `data.queryUnitId` set and no half of that unit has keyword `VEHICLE` (`hookService.keywordsFor`). Distance via the existing `scope.within` (unit distance ≤ 3"); `clampStat` floors OC at 0. |
| Line-breakers (ADM-6.3, 6.5) | (b)+(c) | ability `adm.a.line-breakers` `{trigger:'always', code:'lineBreakers', params:{keyword:'BATTLELINE', within:6, bonus:2, threshold:4}}` (marker, no `effect`). (b) `lineBreakers` — ability hook `hook:'onCharge'`, `pick:{window:'charge.moveStarted', windows:['charge.moveEnded'], topic:'abilityChoice'}`. `offer` at `charge.moveStarted` (key = charging unit id): if that unit (sameUnit) owns a `lineBreakers` ability, write `secondaryState['adm:lb:<canonicalId>'] = { round, near: friendlyKeywordWithin(state, unitId, 'BATTLELINE', 6, 'ADEPTUS MECHANICUS') }` (idempotent if the window re-enters) and return false (no decision). At `charge.moveEnded`: same holder check, mark `lb:<round>:<activePlayer>:<unitId>` absent; candidates = enemy canonical board units within Engagement Range of any holder model; 0 → nothing; 1 → resolve; ≥2 → `chooseOption` to the holder's owner (topic `abilityChoice`, `data.code:'lineBreakers'`). Resolve: n = holder models within ER of any model of the chosen unit; roll nD6 (`purpose:'ability'`); each die + (snapshot.near ? 2 : 0) ≥ 4 counts; `ctx.services.attack.queueMortalWounds(ctx, enemyCanon, count, abilityId, false, mortalCredit(s, holderId))`; emit `AbilityTriggered`; delete the snapshot. The queued mortals drain in `drainOneMoveEndedStep` like Tank Shock. (c) uses `friendlyKeywordWithin` (§7.1 item 1). AI: pick the candidate with the fewest wounds remaining. |
| Searing Conflagration (ADM-6.4) | (a)+(c) | ability `adm.a.searing-conflagration` `{trigger:'woundRoll', when:{weaponId:'adm.w.phosphor-torch', targetOnObjective:true}, effect:[{when:{friendlyKeywordWithin:{keyword:'BATTLELINE', within:6, factionKeyword:'ADEPTUS MECHANICUS'}}, reroll:'all'}, {reroll:'ones'}], scope:{who:'self'}}` — first matching entry wins for `reroll`. `targetOnObjective` already = target unit within range of any marker (hooks-impl `unitOnObjective`). (c) new Condition key (§7.1 item 1). |
| Leader / WARLORD / patrol ids | (a) | Skand `coreAbilities:[{ability:'LEADER'}]`, `leader:{attachTo:['adm.skitarii-vanguard'], effects:[…Galvanic Field]}`; patrol `adm.cp.purge-corps-deltic-9`, `warlord:'skand'`, `enhancements:[{id:'adm.e.aspergilla-of-tarentum', default:true}, {id:'adm.e.overcharged-electropositors', default:false}]`, secondaries `[{id:'adm.sec.targeted-purge', default:true}, {id:'adm.sec.prescribed-excoriation', default:false}]`, stratagems the three `adm.s.pcd-*` ids, attachments `[{leader:'skand', bodyguard:'vanguard'}]` |
| Deep Strike (Pteraxii) | (a) | `coreAbilities:[{ability:'DEEP_STRIKE'}]` |
| Invulnerable saves 5+ (all four) | (a) | datasheet `invuln:'5+'` |
| Torrent / Devastating Wounds / Pistol / Rapid Fire 1 / Anti-Vehicle 4+ / Anti-Infantry 4+ / Hazardous / Blast / Ignores Cover / Extra Attacks / Sustained Hits 2 / supercharge profiles | (a) | weapon abilities `TORRENT`, `DEVASTATING_WOUNDS`, `PISTOL`, `RAPID_FIRE` 1, `ANTI` (`VEHICLE` 4 / `INFANTRY` 4), `HAZARDOUS`, `BLAST`, `IGNORES_COVER`, `EXTRA_ATTACKS`, `SUSTAINED_HITS` 2; plasma caliver modes via `profileGroup` (as `am.w.plasma-pistol`) |
| FLY, JUMP PACK, MOUNTED, BATTLELINE, SKITARII, CULT MECHANICUS, TECH-PRIEST | (a) | plain keywords (FLY engine-native) |

### 7.1 Engine changes (c) — exact signatures

The (b) hooks are written against these before they exist. **No frozen contract
(`src/engine/{types,actions,events,hooks,rng,decider,index}.ts`) changes.**

1. **E-ADM1 — Condition key `friendlyKeywordWithin`** — non-frozen: `src/data/types.ts`, `docs/spec/schemas/common.schema.json`
   (Condition properties), `src/engine/hooks-impl.ts` (`evaluateCondition` + exported helper), and one line in
   20-data-schema §3 Condition keys.
   ```ts
   // src/data/types.ts — interface Condition
   // holder unit (attached halves included) is within `within` inches (unit-to-unit, closest models) of at least one
   // OTHER friendly unit on the battlefield that has `keyword` (any half) and, when given, `factionKeyword` (Searing Conflagration, Line-breakers)
   friendlyKeywordWithin?: { keyword: Keyword; within: number; factionKeyword?: Keyword }

   // src/engine/hooks-impl.ts
   export function friendlyKeywordWithin(state: GameState, unitId: UnitId, keyword: string, within: number, factionKeyword?: string): boolean
   ```
   Semantics: false if `unitId` has no board model; candidates = units of the same player, `location === 'board'`, not
   `leaderService.sameUnit(state, other, unitId)`, with `keyword` in `unitKeywordsAny` (and `factionKeyword` in the
   datasheet faction keywords when set); true iff any candidate has `leaderService.unitDistance(state, other, unitId) <= within + 1e-6`.
   In `evaluateCondition`: `if (c.friendlyKeywordWithin !== undefined && !(h && friendlyKeywordWithin(state, h.id, c.friendlyKeywordWithin.keyword, c.friendlyKeywordWithin.within, c.friendlyKeywordWithin.factionKeyword))) return false`.
   `tools/validate-data.ts` must accept the key (it is schema-driven).

2. **Ethereal Edict generalisation** (owned by the (b) hooks agent, listed here because it changes an exported signature in
   `src/engine/factions/tau-empire.ts`; existing callers keep working):
   ```ts
   export interface CondemnPickOptions {
     code: string            // decision data.code, e.g. 'targetedPurgePick' (default 'etherealEdictPick')
     abilityId: string       // AbilityTriggered id (default 'tau.sec.ethereal-edict')
     label: string           // log summary prefix (default 'Ethereal Edict')
     excludeKeywords?: string[] // a candidate is skipped (and rejected in answerEdict) if any half has one of these
   }
   export function etherealEdictOffer(ctx: EngineContext, owner: PlayerId, window: TimingWindowId, key: string, opts?: CondemnPickOptions): void
   ```
   `context.data` gains `abilityId`, `label`, `excludeKeywords`; `answerEdict` reads them (defaults = today's Ethereal Edict values).

3. **New file** `src/engine/factions/adeptus-mechanicus.ts` (non-frozen), hoisted factory like `genestealerCultsHooks`:
   ```ts
   export function adeptusMechanicusHooks(): Record<string, EngineCodeHook> // doctrinaImperatives, radSaturation, lineBreakers, justFellBack, targetedPurgePick, targetedPurgeScore, prescribedExcoriation
   export const IMPERATIVE_KEY = 'adm:imperative'
   export type Imperative = 'protector' | 'conqueror'
   export function activeImperative(state: GameState, player: PlayerId): Imperative | null // stored choice if stored.round === state.round
   export function prescribedExcoriationAmount(state: GameState, rule: ScoringRule, pid: PlayerId): number
   ```
   Registered in `codeHooks` with `...adeptusMechanicusHooks()`.

## 8. Test IDs

Same list as the `ADM` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| ADM-001 | ADM-1 | patrol `adm.cp.purge-corps-deltic-9` loads (faction `adeptus-mechanicus`): 4 units, 19 models; Skand is WARLORD with Aspergilla of Tarentum, attached to the Skitarii Vanguard; default secondary Targeted Purge; stratagems are the three `adm.s.pcd-*` ids; the start screen lists Adeptus Mechanicus |
| ADM-002 | ADM-6 | data: every stat/weapon row of §6 matches; every datasheet has faction keyword ADEPTUS MECHANICUS and a 5+ invuln; Skand has no Doctrina ability; Skand's only bodyguard is the Vanguard |
| ADM-003 | ADM-2.1 | start of every battle round: the AdMech player gets a `chooseOption` Protector/Conqueror (no pass); the choice is stored for that round only; a player without Doctrina units is not asked; AdMech mirror → both players asked, first player first |
| ADM-004 | ADM-2.2–2.3 | Protector: Vanguard radium carbines have HEAVY (stationary → +1 to hit); Conqueror: they have ASSAULT (may shoot after Advancing); under Protector an Advanced Vanguard cannot shoot |
| ADM-005 | ADM-2.2, 2.4 | Protector: enemy AP −1 ranged attack vs Vanguard partly in own DZ → AP 0 at the save; AP 0 stays 0; Vanguard wholly outside its DZ → AP unchanged; melee attack → unchanged; the Vanguard's own weapon profile (no attack context) is never modified |
| ADM-006 | ADM-2.3, 2.4 | Conqueror: radium carbine (AP 0) vs a target with one model partly in the enemy DZ → AP −1; target wholly outside → AP 0; melee unchanged |
| ADM-007 | ADM-2.5, 2.6 | Doctrina expires at the end of the round (round 2 effects need the round-2 choice); Skand alone: no HEAVY/ASSAULT; Skand attached: attacks vs the combined unit in own DZ get the Protector AP penalty; Conqueror (−1) vs Protector (+1 cap 0) mirror: AP −1 weapon vs Protector unit in DZ → −1 |
| ADM-008 | ADM-3 | Aspergilla: S3 attack vs Skand + Vanguard (T3) wounds on 5+ instead of 4+, ranged and melee; Skand alone also; Sulphurhounds unaffected; ±1 cap holds with another −1 |
| ADM-009 | ADM-3 | Overcharged Electropositors: Vanguard radium carbine range 24" (target at 23.5" legal, 24.5" not), Ignores Cover (no cover bonus); melee unchanged; other units unchanged |
| ADM-010 | ADM-6.1 | Galvanic Field: Skand leading → an unmodified hit 6 from a Vanguard radium carbine or close combat weapon auto-wounds; Skand detached / alone → no Lethal Hits; Sulphurhounds never |
| ADM-011 | ADM-4.1 | Targeted Purge: start of round 1 the OPPONENT gets a `chooseOption`; MONSTER/VEHICLE units (and an attached pair with such a half) are not listed; the picked unit destroyed at battle end → 12 VP; alive → 0; still in Reserves at the end → 12 |
| ADM-012 | ADM-4.1 | Targeted Purge: answering with a VEHICLE unit id is rejected; opponent with only MONSTER/VEHICLE units → no pick, 0 VP; Prescribed Excoriation chosen → no pick; Ethereal Edict still lists every unit (regression) |
| ADM-013 | ADM-4.2 | Prescribed Excoriation: round 1 → 0; round 2 end of own turn, closest enemy 6.5" from the DZ → 5 VP; enemy 4" from the DZ but outside it → 3 VP; enemy model partly inside the DZ → 0; end of the opponent's turn → 0 |
| ADM-014 | ADM-4.2 | Prescribed Excoriation: the only enemy unit inside the DZ is Battle-shocked → 5 VP (if nothing else within 6"); embarked / Reserves enemy units ignored; attached enemy pair with one half Battle-shocked → ignored |
| ADM-015 | ADM-5.1 | An Evaluation of Mettle: opponent shoots the Vanguard → offered; used → each lost wound (mortal wounds too) ignored on a 5+; expires at the end of the phase; offered in the Fight phase of either turn; not offered in own Shooting phase or for an untargeted unit |
| ADM-016 | ADM-5 | Optimised Efficiency: Sulphurhounds Fall Back → offered; used → eligible to shoot and to declare a charge that turn; not offered after a Normal move or Advance, nor for a unit other than the one that just fell back; expires at end of turn |
| ADM-017 | ADM-5.2 | Acceptable Risk Ratio: own Shooting, Vanguard not yet shot → radium carbine AP −1, supercharge caliver AP −4; after shooting, Hazardous test per firing model: a 1 destroys a Vanguard model, Skand rolling a 1 takes 3 mortal wounds; not offered for a unit that already shot or in the opponent's turn |
| ADM-018 | ADM-6.2 | Rad-saturation: enemy INFANTRY with OC 2 within 3" of the Vanguard counts 1 OC per model on a marker; OC 1 model → 0; enemy VEHICLE unaffected; enemy at 3.1" unaffected; friendly units unaffected |
| ADM-019 | ADM-6.3 | Line-breakers: 3 Sulphurhounds end a charge in ER of one enemy, started 8" from the Vanguard → 3 D6, each 4+ = 1 mortal wound; started 5" from the Vanguard → +2 per die (2+ succeeds); two enemies in ER → owner chooses one |
| ADM-020 | ADM-6.3, 6.5 | Line-breakers: failed charge → no roll; a Sulphurhound not in ER of the chosen unit rolls no die; only Skand (not BATTLELINE) within 6" at the start → no bonus; Heroic Intervention charge move still triggers it |
| ADM-021 | ADM-6.4 | Searing Conflagration: phosphor torch vs enemy on an objective → wound roll 1 re-rolled, a failed 2 not; Pteraxii within 6" of the Vanguard → any wound roll may be re-rolled (re-roll offer); target not on an objective → no re-roll; flechette blaster / taser goad → no re-roll |
| ADM-022 | E-ADM1 | Condition `friendlyKeywordWithin`: true at 5.9" from another friendly BATTLELINE unit, false at 6.1"; a BATTLELINE holder does not satisfy it by itself; enemy BATTLELINE never counts; existing conditions unchanged |
| ADM-023 | ADM-6 | Skand / Vanguard weapons: transonic cannon auto-hits D6 times, a wound 6 is a 2-damage mortal (Devastating Wounds); arc rifle Rapid Fire 1 at half range → 2 shots, Anti-Vehicle 4+; radium carbine Anti-Infantry 4+ crit on a 4; plasma caliver supercharge Hazardous |
| ADM-024 | ADM-6.6 | Sulphurhound weapons: sulphur breath (Torrent, Pistol) fires while in Engagement Range; the carbine model fires either its pistols or the carbine, never both; carbine Blast +2 A vs a 10-model unit (+1 per 5 models, rounded down); arc maul (Extra Attacks) adds 1 attack alongside the clawed limbs |
| ADM-025 | ADM-6 | Pteraxii: Deep Strike from round 2 more than 9" from enemies; FLY moves over models; taser goad Sustained Hits 2 → 2 extra hits on a 6; Alpha's flechette blaster (Pistol) fired in Engagement Range |
| ADM-026 | ADM-2.1, 4.1 | AI: Doctrina AI picks Conqueror only when an enemy unit in its own DZ is within 18" of a Doctrina unit, else Protector; Targeted Purge AI picker chooses the highest sum(W)×T eligible unit; a full AI-vs-AI game with this patrol finishes without a stuck decision |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3, monsters/cavalry compressed); bases are rules-true. Palette for the
whole faction (original design, no cog-skull or other logos): oxidised-red hooded robes, tarnished brass and gunmetal
augmetics, teal optic lenses, sickly-green radium glow on Vanguard weapons, white-hot phosphor glow on Serberys/Pteraxii
weapons.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (chibi/SD, original) |
|---|---|---|---|---|---|
| `manipulus-skand` | `adm.manipulus-skand/skand` | 1 | 1.5 | 50 mm | A chibi towering robed tech-priest in an oxidised-red hooded cloak with a hidden face lit by three teal lenses, brass mechanical tendrils fanning behind his back, a tall brass staff topped with a crackling blue coil in one hand and a bell-mouthed sonic cannon on the other arm. |
| `skitarii-vanguard-alpha` | `adm.skitarii-vanguard/alpha` | 1 | 1.15 | 25 mm | A chibi cyborg soldier leader in a rust-red hooded coat over gunmetal armour, a rebreather mask with teal goggle lenses, a stubby energy pistol in one hand and a short humming power blade in the other, with a small brass crest on the hood. |
| `skitarii-vanguard-arc-rifle` | `adm.skitarii-vanguard/arc-rifle` | 1 | 1.1 | 25 mm | A chibi hooded cyborg soldier in a rust-red coat and gunmetal armour with a rebreather mask, aiming a long rifle whose barrel is wrapped in copper coils sparking blue electricity. |
| `skitarii-vanguard-plasma-caliver` | `adm.skitarii-vanguard/plasma-caliver` | 1 | 1.1 | 25 mm | A chibi hooded cyborg soldier in a rust-red coat with a rebreather mask, bracing a chunky rifle with glowing cyan plasma coils and a vented heat shroud. |
| `skitarii-vanguard` | `adm.skitarii-vanguard/vanguard` | 7 | 1.1 | 25 mm | A chibi hooded cyborg soldier in a rust-red coat and gunmetal armour with a rebreather mask and teal lenses, holding a compact carbine with a glowing sickly-green radioactive canister. |
| `sulphurhound-alpha` | `adm.serberys-sulphurhounds/alpha` | 1 | 1.5 | 60 × 35 mm oval | A chibi cyborg rider in a rust-red hood mounted on a stocky four-legged brass-and-gunmetal robotic hound whose snout vents yellow flame, the rider raising a crackling electric maul and holding a small pistol. |
| `sulphurhound-carbine` | `adm.serberys-sulphurhounds/carbine` | 1 | 1.45 | 60 × 35 mm oval | A chibi hooded cyborg rider on a squat four-legged robot hound breathing yellow flame, the rider levelling a stubby carbine glowing white-hot phosphor with a small pistol on the hip. |
| `sulphurhound-pistols` | `adm.serberys-sulphurhounds/pistols` | 1 | 1.45 | 60 × 35 mm oval | A chibi hooded cyborg rider on a squat four-legged robot hound breathing yellow flame, firing a white-glowing pistol in each hand. |
| `pteraxii-sterylizor-alpha` | `adm.pteraxii-sterylizors/alpha` | 1 | 1.35 | 40 mm | A chibi gaunt cyborg in a rust-red hood with large brass-ribbed membrane wings on its back, bird-like clawed metal legs, a white-flame torch in one hand and a jagged electric goad in the other. |
| `pteraxii-sterylizor` | `adm.pteraxii-sterylizors/sterylizor` | 4 | 1.3 | 40 mm | A chibi gaunt hooded cyborg hovering on brass-ribbed membrane wings with talon-like metal feet, sweeping a nozzle torch that spits white-hot phosphor fire. |

## 10. Other Adeptus Mechanicus patrols (appendix)

- **Maniple Verask-Alpha** — Index 10, June 2023 (launch box, to be added in add-patrol mode): Enginseer Verask
  (WARLORD, Leader → Skitarii Rangers) ×1, Skitarii Rangers ×10, Kataphron Destroyers ×3, Onager Dunecrawler ×1 —
  4 units, 15 models; faction ability Doctrina Imperatives; enhancements Omniballistic Data-Tether (default) /
  Imperative Surge-wafer; secondaries Explorator Acquisition (default) / Holy Apparatus; stratagems Retribution Codes,
  Reactive Field-Shroud, Retrogradial Targeting (reuses `justFellBack`). Stats summarised once on 2026-10-15 and not
  re-verified (e.g. Rangers Sv 5+ / invuln 6+ and the Dunecrawler carrying both a Daedalus launcher and an Icarus
  array) — re-fetch before building it.
