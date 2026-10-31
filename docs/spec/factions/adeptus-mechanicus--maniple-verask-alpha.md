# Patrol spec — Adeptus Mechanicus: Maniple Verask-Alpha

Own-words data spec for the **second** Adeptus Mechanicus Combat Patrol, in the same shape as 11-combat-patrol §4. It
covers only this patrol. The faction is already playable through Purge Corps Deltic-9
([adeptus-mechanicus.md](adeptus-mechanicus.md), rule ids `ADM-…`); anything identical to that patrol is cited by id and
not restated. This file supersedes the unverified appendix line in adeptus-mechanicus.md §10 wherever the two differ.
Rule ids here are `MVA-<section>.<n>`; test ids `MVA-0nn` (12-rules-test-checklist, section MVA). Mechanics are 1:1 with
the source; every sentence of prose is ours. Data id prefix stays `adm.` (faction `adeptus-mechanicus`, faction keyword
`ADEPTUS MECHANICUS`); patrol id `adm.cp.maniple-verask-alpha`, appended to `faction.json` `combatPatrols` (the only
faction.json change: `armyRule` and the Purge Corps detachment entry stay as they are).

## 0. Sources (accessed 2026-10-16)

| Source | URL | Version shown on page |
|---|---|---|
| Adeptus Mechanicus "Maniple Verask-Alpha" (primary, owner's choice) | https://wahapedia.ru/wh40k10ed_cp/factions/maniple-verask-alpha/ | Index, 10th ed, last update June 2023 |
| Adeptus Mechanicus "Purge Corps Deltic-9" (already specified; not re-fetched) | https://wahapedia.ru/wh40k10ed_cp/factions/purge-corps-deltic-9/ | Index 10, January 2024 |
| CP faction navigation (enumerates patrols) | menu on the CP page above | exactly two Adeptus Mechanicus patrols: Maniple Verask-Alpha, Purge Corps Deltic-9 |
| Combat Patrol format rules | https://wahapedia.ru/wh40k10ed_cp/the-rules/combat-patrol/ | captured in 11-combat-patrol §1–2; not re-fetched |

Every number below was read from the page's raw HTML on 2026-10-16 (not from a summary). Corrections to the
adeptus-mechanicus.md §10 appendix: none of its values were wrong (Rangers Sv 5+ / invuln 6+ and the Dunecrawler carrying
both a Daedalus missile launcher and an Icarus array are confirmed); it lacked every profile, which follow here.

Source quirks recorded as found:
- The Kataphron plasma culverin's supercharge row prints its ability inline as "supercharge hazardous" (wahapedia prints
  every weapon's abilities in lowercase after the name, e.g. "Mechanicus pistol devastating wounds pistol"). Read as
  profile name "supercharge" with [HAZARDOUS]; the standard row has no abilities.
- The composition gives one Ranger an **enhanced data-tether** and the Dunecrawler a **broad spectrum data-tether**. No
  datasheet on the CP page gives either one a rule: they are cosmetic here (figure detail only, no data effect).
- The Protector Imperative text contains a Cyrillic "Е" in its first word (typo, no rules impact).
- The Doctrina Imperatives text says "you **can** select" one imperative (see MVA-2.1).

## 1. Roster

4 units, 15 models. Faction keyword ADEPTUS MECHANICUS and keyword IMPERIUM on every datasheet.

| Ref | Unit | Models | Wargear as built (fixed) | Leader / notes |
|---|---|---|---|---|
| `verask` | Enginseer Verask | 1 | Mechanicus pistol (Verask's, BS 3+); Omnissian axe; servo-arm | **WARLORD**, Omniballistic Data-Tether by default. Leader → `rangers` (the only bodyguard listed) |
| `rangers` | Skitarii Rangers | 10 | Ranger Alpha ×1: Mechanicus pistol, Alpha combat weapon · ×6: galvanic rifle, close combat weapon · ×1: galvanic rifle, close combat weapon, enhanced data-tether (cosmetic) · ×1: arc rifle, close combat weapon · ×1: transuranic arquebus, close combat weapon | BATTLELINE; Scouts 6" |
| `kataphrons` | Kataphron Destroyers | 3 | ×1: heavy grav-cannon, phosphor blaster, close combat weapon (Kataphron) · ×2: Kataphron plasma culverin, cognis flamer, close combat weapon (Kataphron) | — |
| `dunecrawler` | Onager Dunecrawler | 1 | Daedalus missile launcher; cognis heavy stubber; Icarus array; Dunecrawler legs; broad spectrum data-tether (cosmetic) | VEHICLE, WALKER |

No wargear options, no unit choices, no Patrol Squads (CP-1.8 n/a).

| Id | Rule |
|---|---|
| MVA-1.1 | The page names "your TECH-PRIEST ENGINSEER model" as WARLORD: Verask. He carries the chosen enhancement. Patrol data `attachTo: 'rangers'` (default; the setup UI may detach him within `leader.attachTo`, 20-data-schema §combat-patrol). Consequences of attaching **[interpretation, core rules]**: (a) the attached unit cannot make the Scouts move (Scouts needs every model to have it; setup.ts already checks every half), (b) Verask is never a Lone Operative while leading (MVA-6.1). |
| MVA-1.2 | The arquebus Ranger stands on a **60 × 35 mm oval** base; every other Ranger on 25 mm round (per-model `composition[].base`). |

## 2. Faction ability — Doctrina Imperatives

Identical to ADM-2.1–ADM-2.6 (pick, Protector, Conqueror, "within a zone", attached units, ranged-only / mirror). Same
`armyRule` `adm.a.doctrina-imperatives` and the same four effect abilities (`adm.a.doctrina-protector-heavy`,
`adm.a.doctrina-protector-ap`, `adm.a.doctrina-conqueror-assault`, `adm.a.doctrina-conqueror-ap`), listed on the
Skitarii Rangers, Kataphron Destroyers and Onager Dunecrawler datasheets. **Enginseer Verask's datasheet does not have
it** (same shape as Skand, ADM-2.5).

| Id | Rule (differences / additions only) |
|---|---|
| MVA-2.1 | The page says the player "can" pick. The shared `doctrinaImperatives` hook asks with no pass option (ADM-2.1). Kept unchanged **[interpretation]**: both imperatives only ever help their own units (HEAVY never penalises, ASSAULT only allows more shooting, both AP changes favour the holder), so taking neither is never better than taking one, and the behaviour is the same. No patrol-scoped ability needed. |
| MVA-2.2 | The transuranic arquebus already has [HEAVY]; Protector grants nothing more (a weapon ability is present or not; +1 to hit once). |
| MVA-2.3 | The Onager Dunecrawler (VEHICLE) and the Kataphron Destroyers have Doctrina too. Protector's HEAVY +1 and the Dunecrawler's Damaged −1 both apply (net 0 under the ±1 hit cap). |
| MVA-2.4 | When Verask leads the Rangers, the Rangers' Doctrina abilities cover the whole attached unit (ADM-2.5): his Mechanicus pistol gains HEAVY / ASSAULT, and attacks against the combined unit get the Protector AP penalty. Verask alone gets nothing. |

## 3. Enhancements (Enginseer Verask, WARLORD)

| Name | Default? | Effect |
|---|---|---|
| Omniballistic Data-Tether (MVA-3.1) | default | each time the bearer's unit is selected to shoot, while resolving those attacks the player may re-roll **one** Hit roll and **one** Wound roll. |
| Imperative Surge-wafer (MVA-3.2) | optional | once per battle, when the bearer's unit is selected to shoot, the player may activate it: until the end of the phase, ranged weapons of every model in the bearer's unit have [PRECISION]. |

| Id | Rule |
|---|---|
| MVA-3.1a | Data-Tether scope: the bearer's unit = Verask plus his Rangers while attached (one budget for the whole attached unit, not one per half). Ranged attacks only (it triggers on being selected to shoot). Fire Overwatch counts as being selected to shoot, so it gets its own budget. The engine `oneDie` re-roll offers a failed die (a passed die is never worth re-rolling), once per source per attacking unit per phase. |
| MVA-3.2a | Surge-wafer timing **[interpretation]**: the source trigger is "selected to shoot", the same as Data-Tether, so Fire Overwatch counts (see MVA-3.1a). Offered (a) at `shooting.unitSelected` in the owner's own Shooting phase, before targets are picked, and (b) when the bearer's unit is selected to fire Overwatch, before its Overwatch attacks are resolved (the Tyranid `phantomsOverwatchArm`/`Step` pattern, `phantomsOffer(..., overwatch)`; no new window id, frozen contracts untouched). Declining keeps it for later; once used it is spent for the battle. Precision covers the whole attached unit's ranged weapons and lasts until the end of the phase in which it was used (for Overwatch, the phase in which the charge/move occurs). |

## 4. Secondary objectives

| Name | Default? | Scoring |
|---|---|---|
| Explorator Acquisition (MVA-4.1) | default | from battle round 2, at the end of **your** Command phase: roll one D6 and add 1 for each objective marker you control; on **7+** score 4 VP. Max 12 VP from this objective (3 successes). |
| Holy Apparatus (MVA-4.2) | optional | at the end of the battle: 4 VP if your WARLORD is not destroyed; plus 4 VP if your ONAGER DUNECRAWLER model is not destroyed and not Below Half-strength, or 2 VP instead if it is not destroyed but Below Half-strength. Max 8. |

| Id | Rule |
|---|---|
| MVA-4.1a | Control = the CP-2.4 controller at the moment of the roll (`holds`, as Kauyon Lure / Rise Up). Removed markers do not count. No auto-fail on a natural 1 is printed: 6+ controlled markers would always succeed (taken as printed). The die is a mission roll: not Command-Re-rollable (same as every other mission roll in missions.ts). |
| MVA-4.2a | "Not destroyed" = the model is on the battlefield (or embarked) at the battle-end check; a unit still in Reserves at the end counts as destroyed (R-5.16). Verask attached: only his own model matters, not the Rangers. Below Half-strength for the one-model Dunecrawler = wounds remaining below half of W 11, i.e. ≤ 5 (`leaderService.isBelowHalfStrength`). |
| MVA-4.2b | Name clash: Leagues of Votann already use the code names `holyApparatusPick` / `holyApparatusScore` for a different rule. This patrol's secondary gets id `adm.sec.holy-apparatus` and code `mvaHolyApparatus`; the LoV codes stay untouched. |

## 5. Patrol stratagems

| Name | CP | Category | Window | Target | Effect |
|---|---|---|---|---|---|
| Retribution Codes (MVA-5.1) | 1 | strategicPloy | `attack.modelDestroyed`, any phase, either player's turn, just after an enemy model's attack destroys the target | one TECH-PRIEST model of yours just destroyed by that attack (usable even though it is dead) | until the end of the battle, each attack made by an ADEPTUS MECHANICUS model of yours that targets the killer's unit re-rolls a Hit roll of 1 |
| Reactive Field-Shroud (MVA-5.2) | 1 | battleTactic | `shooting.targetsDeclared` (opponent's Shooting phase) or `fight.targetsDeclared` (Fight phase, either turn), just after an enemy unit picks its targets | one TECH-PRIEST **or** SKITARII unit of yours picked as a target by those attacks | until end of phase, models in the unit have a 4+ invulnerable save |
| Retrogradial Targeting (MVA-5.3) | **2** | strategicPloy | `movement.unitMoved`, your Movement phase, just after a TECH-PRIEST unit of yours ends a Fall Back move | that unit | until end of turn, the unit is eligible to shoot although it Fell Back (it still cannot charge) |

| Id | Rule |
|---|---|
| MVA-5.1a | Retribution Codes reuses the death-reaction machinery of Payment in Kind / The Gilded Spear (attack.ts `deathReaction:` request). Only a destruction caused by an enemy **attack** opens it (mortal wounds of a Devastating Wounds attack count; Hazardous, Deadly Demise and other ability mortal wounds do not). The killer's unit is the canonical attacking unit (both halves if it is an attached unit). The re-roll is for every ADEPTUS MECHANICUS model of the stratagem user's army, ranged and melee, for the rest of the battle. The only TECH-PRIEST in this roster is Verask, so it can be used at most once. |
| MVA-5.2a | Eligible in this roster: Verask (alone or leading the Rangers; an attached unit has both halves' keywords), the Rangers, the Dunecrawler (SKITARII). **Not** the Kataphron Destroyers. The 4+ invulnerable save only helps where it beats the unit's own (Rangers 6+, Verask 5+; the Dunecrawler already has 4+, so it gains nothing). |
| MVA-5.3a | TECH-PRIEST unit = Verask alone, or Verask + Rangers (the whole attached unit then may shoot). Kataphrons / Dunecrawler falling back are not eligible. Grants shooting only (unlike Optimised Efficiency, no charge). |

Core stratagems apply per 10-rules §11 with their keyword gates: Verask has Epic Challenge (CHARACTER); Tank Shock is
Dunecrawler-only (VEHICLE, T 10 → 10 dice, max 6 mortal wounds); Heroic Intervention is open to the Dunecrawler (WALKER);
Go to Ground is INFANTRY-only (Verask, Rangers, Kataphrons; not the Dunecrawler). Matches the page's per-datasheet lists.

## 6. Datasheets

All four are new datasheets (no Purge Corps datasheet appears in this patrol).

| Unit | Data id | Models | Base | M | T | Sv | Inv | W | Ld | OC | Keywords | Core / abilities |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Enginseer Verask | `adm.enginseer-verask` | 1 | 32 mm | 6 | 4 | 3+ | 5+ | 3 | 7+ | 1 | INFANTRY, CHARACTER, TECH-PRIEST, IMPERIUM, ENGINSEER, VERASK | Leader → Skitarii Rangers; Enginseer; Omnissiah's Blessing |
| Skitarii Rangers | `adm.skitarii-rangers` | 10 | 25 mm (arquebus model 60 × 35 mm oval) | 6 | 3 | 5+ | 6+ | 1 | 7+ | 2 | INFANTRY, BATTLELINE, IMPERIUM, SKITARII, RANGERS | Scouts 6"; Doctrina Imperatives |
| Kataphron Destroyers | `adm.kataphron-destroyers` | 3 | 60 mm | 5 | 6 | 3+ | 6+ | 3 | 7+ | 1 | INFANTRY, IMPERIUM, KATAPHRON, DESTROYERS | Doctrina Imperatives |
| Onager Dunecrawler | `adm.onager-dunecrawler` | 1 | 130 mm | 8 | 10 | 2+ | 4+ | 11 | 7+ | 3 | VEHICLE, WALKER, IMPERIUM, SKITARII, ONAGER DUNECRAWLER | Deadly Demise D3; Doctrina Imperatives; Damaged 1–4 wounds |

Faction keyword (all): ADEPTUS MECHANICUS.

Abilities:

| Id | Unit | Rule |
|---|---|---|
| MVA-6.1 | Verask — Enginseer | while Verask is **not** leading a unit and is within 3" of at least one friendly ADEPTUS MECHANICUS VEHICLE unit (unit-to-unit, closest models), he has Lone Operative (ranged attacks can only target him from within 12"). Checked live, whenever a target is declared. |
| MVA-6.2 | Verask — Omnissiah's Blessing | in your Command phase, pick one friendly ADEPTUS MECHANICUS model within 3" of Verask: it regains up to D3 lost wounds (never above its W). A model can be picked for this once per Command phase. |
| MVA-6.2a | Blessing details **[interpretation]**: offered once per own Command phase at `command.start` (before Battle-shock tests, so a healed unit can climb back over half-strength first). Candidates = wounded models (wounds remaining < W) on the battlefield within 3" of Verask's model, Verask himself included (a model is within range of itself), attached-unit models included. Only wounds are restored; destroyed models never return. Optional (may decline). Verask must be on the battlefield. |
| MVA-6.3 | Rangers — Scouts 6" | core (setup.ts). Not while led by Verask (MVA-1.1). |
| MVA-6.4 | Dunecrawler — Damaged: 1–4 wounds remaining | while it has 1–4 wounds left, each attack it makes takes −1 to its Hit roll (data `damaged:{threshold:4}`, as other vehicles). |
| MVA-6.5 | Dunecrawler — Deadly Demise D3 | core (D3 rolled per unit within 6" on a 6). |
| MVA-6.6 | Pistols / Big Guns | Verask and the Ranger Alpha carry a Pistol; INFANTRY, so in Engagement Range they fire only the Pistol. The Dunecrawler (VEHICLE) uses Big Guns Never Tire (core). |

Wargear per model (`composition[]`, modelIds in backticks):

| Unit | Model | Ranged | Melee |
|---|---|---|---|
| Enginseer Verask | `verask` ×1 | Mechanicus pistol (Verask) | Omnissian axe, servo-arm |
| Skitarii Rangers | `alpha` ×1 (champion) | Mechanicus pistol | Alpha combat weapon |
| Skitarii Rangers | `ranger` ×6 | galvanic rifle | close combat weapon |
| Skitarii Rangers | `data-tether` ×1 | galvanic rifle | close combat weapon |
| Skitarii Rangers | `arc-rifle` ×1 | arc rifle | close combat weapon |
| Skitarii Rangers | `arquebus` ×1 (60 × 35 mm oval) | transuranic arquebus | close combat weapon |
| Kataphron Destroyers | `grav` ×1 | heavy grav-cannon, phosphor blaster | close combat weapon (Kataphron) |
| Kataphron Destroyers | `plasma` ×2 | Kataphron plasma culverin (2 profiles), cognis flamer | close combat weapon (Kataphron) |
| Onager Dunecrawler | `dunecrawler` ×1 | Daedalus missile launcher, cognis heavy stubber, Icarus array | Dunecrawler legs |

Weapon profiles ("reused" = existing Purge Corps id, values identical; everything else is new and appended to
`weapons.json`):

| Id | Weapon | Range | A | BS/WS | S | AP | D | Abilities |
|---|---|---|---|---|---|---|---|---|
| `adm.w.mechanicus-pistol-verask` (new) | Mechanicus pistol (Verask) | 12" | 1 | **3+** | 6 | −1 | 1 | Devastating Wounds, Pistol (differs from `adm.w.mechanicus-pistol` only in BS) |
| `adm.w.omnissian-axe` | Omnissian axe | melee | 3 | 4+ | 6 | −2 | 2 | — |
| `adm.w.servo-arm` | servo-arm | melee | 1 | 4+ | 6 | −2 | 2 | Extra Attacks |
| `adm.w.mechanicus-pistol` (reused) | Mechanicus pistol | 12" | 1 | 4+ | 6 | −1 | 1 | Devastating Wounds, Pistol |
| `adm.w.arc-rifle` (reused) | arc rifle | 30" | 1 | 4+ | 8 | −1 | D3 | Anti-Vehicle 4+, Devastating Wounds, Rapid Fire 1 |
| `adm.w.galvanic-rifle` | galvanic rifle | 30" | 2 | 4+ | 4 | 0 | 1 | — |
| `adm.w.transuranic-arquebus` | transuranic arquebus | 36" | 1 | 4+ | 7 | −2 | D3 | Heavy, Precision |
| `adm.w.alpha-combat-weapon` (reused) | Alpha combat weapon | melee | 2 | 4+ | 5 | −1 | 1 | — |
| `adm.w.close-combat-weapon` (reused) | close combat weapon (Skitarii) | melee | 1 | 4+ | 3 | 0 | 1 | — |
| `adm.w.cognis-flamer` | cognis flamer | 12" | D6 | n/a | 4 | 0 | 1 | Ignores Cover, Torrent |
| `adm.w.heavy-grav-cannon` | heavy grav-cannon | 30" | 4 | 4+ | 6 | −1 | 2 | Anti-Vehicle 2+ |
| `adm.w.kataphron-plasma-culverin-standard` | Kataphron plasma culverin — standard | 36" | 4 | 4+ | 7 | −2 | 1 | — (profileGroup `adm.w.kataphron-plasma-culverin`) |
| `adm.w.kataphron-plasma-culverin-supercharge` | Kataphron plasma culverin — supercharge | 36" | 4 | 4+ | 8 | −3 | 2 | Hazardous (profileGroup `adm.w.kataphron-plasma-culverin`) |
| `adm.w.phosphor-blaster` | phosphor blaster | 24" | 1 | 4+ | 5 | 0 | 1 | Ignores Cover, Rapid Fire 1 |
| `adm.w.kataphron-close-combat-weapon` | close combat weapon (Kataphron) | melee | 2 | 4+ | 5 | 0 | 1 | — |
| `adm.w.cognis-heavy-stubber` | cognis heavy stubber | 36" | 3 | 4+ | 4 | 0 | 1 | Rapid Fire 3, Sustained Hits 1 |
| `adm.w.daedalus-missile-launcher` | Daedalus missile launcher | 48" | 1 | 4+ | 10 | −2 | D6+1 | Anti-Fly 2+ |
| `adm.w.icarus-array` | Icarus array | 48" | 6 | 4+ | 8 | −1 | 2 | Anti-Fly 4+, Twin-linked |
| `adm.w.dunecrawler-legs` | Dunecrawler legs | melee | 3 | 4+ | 6 | 0 | 1 | — |

## 7. Mechanics mapping

(a) = existing declarative descriptor (20-data-schema §3/§6/§9); (b) = new code hook, added to the existing
`adeptusMechanicusHooks()` factory in `src/engine/factions/adeptus-mechanicus.ts` (already spread into `codeHooks`);
(c) = engine change beyond a code hook. Reused: `doctrinaImperatives` + the four Doctrina abilities (ADM), `justFellBack`
(ADM, Optimised Efficiency), the `oneDie` re-roll (attack.ts E2, T'au Prototype Systems), the death-reaction request
(`pendingDeathReaction` / `consumeDeathReaction`, attack.ts C4) and the Payment in Kind / Gilded Spear apply shape, the
plasmacyte once-per-battle "spend when selected" pick (code-hooks.ts), `grantsCoreAbility` (C5, Gunnery Officer),
`friendlyKeywordWithin` (E-ADM1, hooks-impl.ts), the `WoundsRegained` event (Necrons), `leaderService.isBelowHalfStrength`,
mission `holds` and the `customAmount` dispatch in missions.ts, and the Evaluation of Mettle stratagem shape.

| Rule | Enc. | Encoding |
|---|---|---|
| Doctrina Imperatives (MVA-2) | (a) | Rangers / Kataphrons / Dunecrawler `abilities:['adm.a.doctrina-protector-heavy','adm.a.doctrina-protector-ap','adm.a.doctrina-conqueror-assault','adm.a.doctrina-conqueror-ap']`; no new ability, no hook change (the hook already finds any datasheet carrying `code:'doctrinaImperatives'`) |
| Leader / WARLORD / patrol ids (MVA-1) | (a) | Verask `coreAbilities:[{ability:'LEADER'}]`, `leader:{attachTo:['adm.skitarii-rangers'], effects:[]}`; patrol `adm.cp.maniple-verask-alpha`: units `verask` (size 1, enhancement `adm.e.omniballistic-data-tether`, attachTo `rangers`), `rangers` 10, `kataphrons` 3, `dunecrawler` 1; `warlord:'verask'`; `enhancements:[{id:'adm.e.omniballistic-data-tether', default:true}, {id:'adm.e.imperative-surge-wafer', default:false}]`; secondaries inline (MVA-4); `stratagems:['adm.s.mva-retribution-codes','adm.s.mva-reactive-field-shroud','adm.s.mva-retrogradial-targeting']`. Faction.json: append the patrol id to `combatPatrols` only. |
| Omniballistic Data-Tether (MVA-3.1) | (a) | enhancement `adm.e.omniballistic-data-tether`, `restriction:{keyword:['ENGINSEER']}`, `effect:[{id:'adm.e.omniballistic-data-tether.hit', trigger:'hitRoll', effect:{when:{weaponType:'ranged'}, reroll:'oneDie'}, scope:{who:'self'}}, {id:'adm.e.omniballistic-data-tether.wound', trigger:'woundRoll', effect:{when:{weaponType:'ranged'}, reroll:'oneDie'}, scope:{who:'self'}}]` (Prototype Systems shape; explicit `self` widens it from the bearer to his unit). The `oneDie` mark is keyed by the shooting action's unit id (the canonical attached unit), so the attached pair shares one budget per entry. |
| Imperative Surge-wafer (MVA-3.2) | (a)+(b) | enhancement `adm.e.imperative-surge-wafer`, same restriction, `effect:[{id:'adm.e.imperative-surge-wafer.effect', trigger:'unitSelectedToShoot', code:'imperativeSurgeWafer', limit:'oncePerBattle', scope:{who:'self'}, duration:'untilEndOfPhase', params:{grant:{when:{weaponType:'ranged'}, grantWeaponAbility:{ability:'PRECISION'}}}}]`. (b) `imperativeSurgeWafer`: see §7.1. |
| Explorator Acquisition (MVA-4.1) | (b) | secondary `adm.sec.explorator-acquisition`, `scoring:[{id:'explorator-acquisition', when:'command.end', who:'active', rounds:{from:2,to:5}, rule:'custom', code:'exploratorAcquisition', pointsPer:4, cap:12, params:{threshold:7}}]`. (b) mission hook `exploratorAcquisition` + amount fn, dispatched from `missions.ts customAmount` (§7.1). |
| Holy Apparatus (MVA-4.2) | (b) | secondary `adm.sec.holy-apparatus`, `scoring:[{id:'holy-apparatus', when:'battle.end', rounds:{from:5,to:5}, rule:'custom', code:'mvaHolyApparatus', pointsPer:4, cap:8, params:{warlordPoints:4, fullPoints:4, belowHalfPoints:2, keyword:'ONAGER DUNECRAWLER'}}]`. (b) mission hook `mvaHolyApparatus` + amount fn (§7.1). |
| Retribution Codes (MVA-5.1) | (a)+(b) | stratagem `adm.s.mva-retribution-codes`, cost 1, `category:'strategicPloy'`, `phases:['command','movement','shooting','charge','fight']`, `window:'attack.modelDestroyed'`, `who:'either'`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'TECH-PRIEST'}, state:'justDestroyed', count:1}]`, `effect:{reroll:'ones'}`, `scope:{who:'attacker'}`, `duration:'battle'`, `code:'retributionCodes'`, `limit:'oncePerPhase'` (Payment in Kind shape). (b) `retributionCodes` (§7.1). |
| Reactive Field-Shroud (MVA-5.2) | (a)+(b) | stratagem `adm.s.mva-reactive-field-shroud`, cost 1, `battleTactic`, `window:['shooting.targetsDeclared','fight.targetsDeclared']`, `who:'either'`, `condition:{any:[{phase:'shooting', ownTurn:false},{phase:'fight'}]}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'ADEPTUS MECHANICUS'}, state:'targetedByAttack', count:1}]`, `effect:{invuln:4}`, `scope:{who:'self'}`, `duration:'untilEndOfPhase'`, `code:'keywordAnyOf'`, `params:{keywords:['TECH-PRIEST','SKITARII']}`. (b) `keywordAnyOf` — the TargetSpec filter takes one keyword only (§7.1). |
| Retrogradial Targeting (MVA-5.3) | (a)+reuse | stratagem `adm.s.mva-retrogradial-targeting`, cost **2**, `strategicPloy`, `window:'movement.unitMoved'`, `who:'active'`, `condition:{phase:'movement', ownTurn:true}`, `targets:[{role:'unit', owner:'friendly', filter:{keyword:'TECH-PRIEST'}, count:1}]`, `effect:{shootAfterFallBack:true}`, `scope:{who:'self'}`, `duration:'untilEndOfTurn'`, `code:'justFellBack'` (existing ADM hook, unchanged) |
| Enginseer (MVA-6.1) | (a)+(b) | ability `adm.a.enginseer` `{trigger:'always', code:'enginseerLoneOperative', params:{keyword:'VEHICLE', within:3, factionKeyword:'ADEPTUS MECHANICUS'}, scope:{who:'self'}}` (no `effect`). (b) `enginseerLoneOperative` via the existing `grantsCoreAbility` interface (§7.1); shooting.ts `isLoneOperative` already returns false for an attached unit. |
| Omnissiah's Blessing (MVA-6.2) | (a)+(b) | ability `adm.a.omnissiahs-blessing` `{trigger:'commandPhase', code:'omnissiahsBlessing', params:{within:3, heal:'D3', factionKeyword:'ADEPTUS MECHANICUS'}}`. (b) `omnissiahsBlessing` (§7.1). |
| Scouts 6" (MVA-6.3) | (a) | Rangers `coreAbilities:[{ability:'SCOUTS', value:6}]` |
| Damaged (MVA-6.4) | (a) | Dunecrawler `damaged:{threshold:4, effect:{modifyRoll:{roll:'hit', value:-1}}}` |
| Deadly Demise D3 (MVA-6.5) | (a) | Dunecrawler `coreAbilities:[{ability:'DEADLY_DEMISE', value:'D3'}]` |
| Invulnerable saves | (a) | `invuln`: Verask 5, Rangers 6, Kataphrons 6, Dunecrawler 4 |
| Weapon abilities | (a) | `DEVASTATING_WOUNDS`, `PISTOL`, `EXTRA_ATTACKS`, `ANTI` (`VEHICLE` 4 / `VEHICLE` 2 / `FLY` 2 / `FLY` 4), `RAPID_FIRE` 1/3, `HEAVY`, `PRECISION`, `IGNORES_COVER`, `TORRENT`, `HAZARDOUS`, `SUSTAINED_HITS` 1, `TWIN_LINKED`; culverin modes via `profileGroup` (as `adm.w.plasma-caliver`) |
| Bases | (a) | per-model `composition[].base`: Verask round 32; Rangers round 25, `arquebus` `{shape:'oval', mm:60, mm2:35}`; Kataphrons round 60; Dunecrawler round 130 |

### 7.1 Exact signatures

**No (c) items. No frozen contract (`src/engine/{types,actions,events,hooks,rng,decider,index}.ts`) changes.** Every new
function lives in `src/engine/factions/adeptus-mechanicus.ts` and is returned by `adeptusMechanicusHooks()`, except two
one-line dispatch cases in `src/engine/missions.ts` (non-frozen) and AI scoring lines in `src/ai/utility.ts`.

```ts
// src/engine/factions/adeptus-mechanicus.ts (additions)
import { pendingDeathReaction, consumeDeathReaction } from '../attack'
export function exploratorAcquisitionAmount(ctx: EngineContext, rule: ScoringRule, pid: PlayerId, holds: (id: ObjectiveId) => boolean): number
export function mvaHolyApparatusAmount(state: GameState, rule: ScoringRule, pid: PlayerId): number
// new members of the record returned by adeptusMechanicusHooks():
//   imperativeSurgeWafer, exploratorAcquisition, mvaHolyApparatus, retributionCodes, keywordAnyOf,
//   enginseerLoneOperative, omnissiahsBlessing

// src/engine/missions.ts customAmount(), next to 'prescribedExcoriation':
case 'exploratorAcquisition': return exploratorAcquisitionAmount(ctx, rule, pid, (id) => holds(ctx, id, pid))
case 'mvaHolyApparatus': return mvaHolyApparatusAmount(s, rule, pid)
```

Hook semantics:

1. **`imperativeSurgeWafer`** — `{kind:'ability', hook:'onUnitSelectedToShoot', run:noop, pick:{window:'shooting.unitSelected', topic:'abilityChoice', offer, handle}}`.
   `offer(ctx, window, key)`: key = the selected unit id; return false unless the unit is on the board and either (i) `window === 'shooting.unitSelected'`, `state.phase === 'shooting'` and the unit is owned by the active player, or (ii) the call comes from the Overwatch selection step (the `overwatch` flag set by the arm/step pair, any phase, unit owned by the non-active player). Find the enhancement ability: `Object.values(state.abilities).find(a =>
   a.source === 'enhancement' && a.code === 'imperativeSurgeWafer' && a.bearerModelId` is a live model of any half of
   `key`). Return false if none, if `players[p].oncePerBattleUsed` contains `abilityId`, or if phase mark
   `pick:surge:<canonicalId>` exists. Else push the mark and `ctx.decide({kind:'chooseOption', player, window,
   canPass:false, context:{topic:'abilityChoice', unitId: canonicalId, abilityId, data:{window, key, code:'imperativeSurgeWafer'}},
   options:[use, decline]})`. `handle`: `decline` → nothing; `use` → re-check unused, push `abilityId` to
   `oncePerBattleUsed`, `ctx.services.effects.grant(ctx, canonicalId, [params.grant], {sourceAbilityId: abilityId,
   sourceUnitId: canonicalId, scope:{who:'self'}, duration:'untilEndOfPhase', when:null})`, emit `AbilityTriggered`
   ("Imperative Surge-wafer: ranged weapons gain Precision this phase"). AI (utility.ts, `code === 'imperativeSurgeWafer'`):
   use if any visible enemy attached unit with a CHARACTER half is within the longest ranged weapon range of the unit,
   or in battle round 5; else decline.
2. **`exploratorAcquisition`** — `{kind:'mission', hook:'onPhaseEnd', run:noop}`. `exploratorAcquisitionAmount`: `n =`
   count of non-removed objectives with `holds(id)`; `roll = ctx.roll({purpose:'mission', player:pid, sides:6, count:1,
   mode:'sum', commandRerollable:false})`; return `roll.final[0] + n >= (rule.params.threshold ?? 7) ? rule.pointsPer : 0`
   (the scoring framework applies `cap`; return 0 without rolling once `players[pid].vpBySource[rule.id] >= rule.cap`, so
   no meaningless dice appear in the log).
3. **`mvaHolyApparatus`** — `{kind:'mission', hook:'onPhaseEnd', run:noop}`. `mvaHolyApparatusAmount`: `w =
   state.units[players[pid].warlordUnitId]`; `+warlordPoints` if `w` has a live model (`location === 'board'` or
   embarked, `models.length > 0`). Then the first unit of `pid` with keyword `params.keyword`: if it is not destroyed
   (on the board / embarked, models > 0) add `isBelowHalfStrength ? belowHalfPoints : fullPoints`. Units in Reserves
   count as destroyed. No pick, so not in `PICK_CODES`.
4. **`retributionCodes`** — `{kind:'stratagem', hook:'onModelDestroyed', hooks:['onHitRoll'], run:noop, grantsItself:true, check, apply}`.
   `check(env, t)`: `req = pendingDeathReaction(env.state)`; true iff `req && req.unitId === t.ids[0] && req.player === env.player`.
   `apply(ctx, env, t)`: attacker = `leaderService.canonicalUnitId(s, req.attackerUnitId)`; for each non-destroyed half
   `h` of it: `ctx.services.effects.grant(ctx, h, [{reroll:'ones'}], {sourceAbilityId: env.stratagem.id,
   sourceUnitId:null, scope:{who:'attacker'}, duration:'battle', when:{attackerKeyword:'ADEPTUS MECHANICUS'}})`; emit
   `AbilityTriggered`; `consumeDeathReaction(s, req.modelId)`. (Byte-for-byte the Payment in Kind apply with the keyword
   changed; Payment in Kind itself is not edited.) The re-roll is granted to hit rolls only (the `hooks:['onHitRoll']`
   declaration, as Payment in Kind). AI: use whenever offered and CP ≥ 1.
5. **`keywordAnyOf`** — `{kind:'stratagem', hook:'onTargetsDeclared', run:noop, check}`. `check(env, t)`: `kws =
   env.stratagem.params.keywords as string[]`; true iff some half of `t.ids[0]` has one of `kws` in
   `hookService.keywordsFor`. No `apply` (declarative effect). Generic: any later "X or Y unit" stratagem can use it.
6. **`enginseerLoneOperative`** — `{kind:'ability', hook:'onStatQuery', run:noop, grantsCoreAbility(state, entry, unitId)}`:
   return `[]` unless `unitId === entry.holderUnitId`, `!leaderService.isAttached(state, unitId)`, the unit is on the
   board, and `friendlyKeywordWithin(state, unitId, params.keyword, params.within, params.factionKeyword)`; else
   `['LONE_OPERATIVE']`. No `gate` (the descriptor has no effect to gate).
7. **`omnissiahsBlessing`** — `{kind:'ability', hook:'onCommandPhase', run:noop, pick:{window:'command.start', topic:'abilityChoice', offer, handle}}`.
   `offer(ctx, window, key)`: for each board unit `u` of the **active** player whose datasheet has an ability with
   `code:'omnissiahsBlessing'` (holder = Verask's half; one offer per holder per Command phase, phase mark
   `pick:blessing:<u.id>`): bearer model = `u.models[0]`; candidates = board models `m` of the active player whose unit
   has faction keyword `params.factionKeyword`, `m.woundsRemaining < W(m)` and `distance(bearer, m) <= params.within`
   (base-to-base, Verask himself included). None → skip holder. Else push the mark and `ctx.decide({kind:'chooseOption',
   player, window, canPass:true, context:{topic:'abilityChoice', unitId:u.id, abilityId, data:{window, key,
   code:'omnissiahsBlessing'}}, options: candidates sorted by lost wounds desc then W desc, one option per model id
   (`id: modelId`, label "<unit name> — <model> (n/W)"), then 'decline'})`. The offer has `canPass: true`, so the reducer lists `pass` as legal: `handle` treats a `pass` action exactly like 'decline' (no effect, nothing spent). `handle`: reject unknown ids; re-check the
   candidate and phase mark `blessed:<modelId>` (once per model per Command phase); `roll = ctx.roll({purpose:'ability',
   player, sides:3, count:1, mode:'sum', unitId: u.id})`; `gain = min(roll.final[0], W - woundsRemaining)`;
   `woundsRemaining += gain`; push `blessed:<modelId>`; emit `WoundsRegained{unitId, modelId, amount:gain,
   source:abilityId}` and `AbilityTriggered`. AI: take the first option (most lost wounds) whenever offered.

Test files: `tests/engine/adeptus-mechanicus-maniple-verask-alpha.test.ts` (MVA-003…MVA-019),
`tests/data/adeptus-mechanicus-maniple-verask-alpha.test.ts` (MVA-001, MVA-002), Playwright e2e (MVA-020).
Existing `ADM-` tests must stay green unchanged.

## 8. Test IDs

Same list as the `MVA` section of 12-rules-test-checklist.

| ID | Ref | Scenario → expected |
|---|---|---|
| MVA-001 | MVA-1 | patrol `adm.cp.maniple-verask-alpha` loads (faction `adeptus-mechanicus`): 4 units, 15 models; Verask is WARLORD with Omniballistic Data-Tether, attached to the Rangers; default secondary Explorator Acquisition; stratagems are the three `adm.s.mva-*` ids; `faction.json` lists both patrols; Purge Corps Deltic-9 still loads unchanged |
| MVA-002 | MVA-6 | data: every stat / weapon row of §6 matches; invulns 5+/6+/6+/4+; Verask has no Doctrina ability, the other three carry the four Doctrina ids; the arquebus Ranger base is 60 × 35 oval; reused weapon ids are unchanged; `adm.w.mechanicus-pistol-verask` is BS 3+; Verask's only bodyguard is the Rangers |
| MVA-003 | MVA-2.2, 2.3 | Doctrina on the new units: round-start pick is offered to a Verask-Alpha player; Protector → galvanic rifle and Kataphron culverin have HEAVY (stationary +1 to hit); arquebus stationary gets +1 once, not +2; Conqueror → Icarus array (AP −1) vs a target partly in the enemy DZ → AP −2; enemy AP −2 shot at the Dunecrawler in its own DZ under Protector → AP −1 |
| MVA-004 | MVA-2.4, 2.3 | Verask leading the Rangers under Conqueror → his pistol has ASSAULT; Verask alone → nothing; Damaged Dunecrawler under Protector, stationary → net 0 hit modifier |
| MVA-005 | MVA-3.1 | Data-Tether: Verask + Rangers shoot → one failed hit die and one failed wound die offered for re-roll, no second offer in that activation across both halves; melee attacks get none; budget returns in the next phase; an Overwatch shot gets its own budget; Rangers without Verask → no offer |
| MVA-006 | MVA-3.2 | Surge-wafer chosen: unit selected to shoot → use/decline offered; decline → offered again next Shooting phase; use → ranged weapons have PRECISION this phase (wound allocated to a visible enemy CHARACTER in an attached unit), gone next phase; never offered again; also offered when the bearer's unit is selected to fire Overwatch, Precision lasting until the end of that phase |
| MVA-007 | MVA-4.1 | Explorator Acquisition: round 1 → no roll; round 2 end of own Command phase controlling 2 markers, die 5 → 4 VP, die 4 → 0; no roll at the end of the opponent's Command phase; after 3 successes (12 VP) → no further VP; removed markers do not count |
| MVA-008 | MVA-4.2 | Holy Apparatus at battle end: Verask alive + Dunecrawler at 11 W → 8; Dunecrawler at 5 W → 6; at 6 W → 8; Verask destroyed + Dunecrawler 11 W → 4; Dunecrawler destroyed + Verask alive → 4; nothing scored before the battle ends; Verask attached and the Rangers wiped but Verask alive → warlord 4 |
| MVA-009 | MVA-4.2b | Code-name isolation: `mvaHolyApparatus` never opens a pick; the Leagues of Votann `holyApparatusPick` / `holyApparatusScore` behave as before (LoV regression) |
| MVA-010 | MVA-5.1 | Retribution Codes: an enemy shooting attack kills Verask → offered to the AdMech player in the opponent's turn; used (1 CP) → AdMech hit rolls of 1 against the killer's unit are re-rolled, still in a later round, ranged and melee; attacks against other units are not; a Ranger dying → not offered; Verask killed by ability mortal wounds that are not an attack (e.g. an enemy Deadly Demise) → not offered |
| MVA-011 | MVA-5.2 | Reactive Field-Shroud: opponent shoots the Rangers → offered; used → 4+ invuln this phase (AP −3 attack saved on 4+ instead of 6+), gone next phase; Verask + Rangers and the Dunecrawler eligible; Kataphron Destroyers not eligible; offered in the Fight phase of either turn; not in own Shooting phase |
| MVA-012 | MVA-5.3 | Retrogradial Targeting: costs 2 CP; Verask (alone, or leading the Rangers) Falls Back → offered; used → the unit may shoot this turn but still cannot declare a charge; Kataphrons / Dunecrawler Fall Back → not offered; Verask Normal move → not offered |
| MVA-013 | MVA-6.1 | Enginseer: Verask unattached 2.5" from the Dunecrawler → an enemy ranged attack from 13" is illegal, from 11.5" legal; 3.5" away → targetable from 24"; leading the Rangers → never Lone Operative; an enemy VEHICLE within 3" does not count |
| MVA-014 | MVA-6.2 | Omnissiah's Blessing: own Command phase, Dunecrawler at 4 W within 3" of Verask → offered; D3 = 2 → 6 W and the Damaged −1 is gone; never above W; a wounded model 3.5" away and unwounded models not listed; Verask may pick himself; decline allowed; a `pass` action answers the offer as a decline (not a rejection); not offered in the opponent's Command phase; destroyed Rangers never return |
| MVA-015 | MVA-6.3, 1.1 | Scouts: Rangers unattached make a Scouts move of up to 6" ending > 9" from enemies; Rangers led by Verask → no Scouts move offered |
| MVA-016 | MVA-6.4, 6.5 | Dunecrawler: at 4 W → −1 to hit, at 5 W → none; Deadly Demise D3 on a 6; Icarus array Twin-linked re-rolls failed wound rolls and is Anti-Fly 4+ (crit wound on 4 vs FLY); Daedalus Anti-Fly 2+, D6+1 damage; cognis heavy stubber at ≤ 18" → 6 attacks, Sustained Hits 1 |
| MVA-017 | MVA-6 | Kataphrons: heavy grav-cannon Anti-Vehicle 2+; culverin supercharge triggers a Hazardous test (Kataphron model destroyed on a 1 — not a CHARACTER/VEHICLE), standard does not; cognis flamer auto-hits D6 with Ignores Cover; phosphor blaster at ≤ 12" → 2 attacks |
| MVA-018 | MVA-6 | Verask / Rangers weapons: Verask's pistol hits on 3+; servo-arm (Extra Attacks) adds 1 attack alongside the Omnissian axe; transuranic arquebus Heavy + Precision; galvanic rifle 30" 2 attacks; arc rifle Rapid Fire 1 at ≤ 15" → 2 shots |
| MVA-019 | MVA-3.2, 5.1, 6.2 | AI: Blessing picks the most-wounded candidate; Surge-wafer AI uses it only with an attached enemy CHARACTER in range (or round 5); Retribution Codes used when CP ≥ 1; a full AI-vs-AI game with this patrol (both sides and the mirror vs Purge Corps) finishes without a stuck decision; the sim rotation includes the patrol |
| MVA-020 | MVA-1 | e2e (Playwright): start screen → Adeptus Mechanicus → patrol picker → Maniple Verask-Alpha → deployment shows 15 models (Verask with the Rangers, Kataphrons, Dunecrawler) and the game reaches battle round 1 |
| MVA-021 | MVA-1 | Oversize base vs cp-01 (Rules Commentary: Deploying Units): the Dunecrawler's 130 mm (5.12") base cannot stand wholly inside cp-01's 5" deployment strips, so it is set up with its base touching its player's battlefield edge instead (still wholly on the board, centre inside the zone, gap from the base outline to the edge at most 0.05"). Nothing starts in Reserves. The AI scans along that edge for a clear spot (`edgeDeployPlacement`, `src/engine/setup.ts`); a human drag snaps to the edge (`snapToBattlefieldEdge`); `resolveDeploy` rejects an oversize placement 1" in from the edge and a normal-size model outside the zone. Geometry: `oversizeEdgePlacementOk` / `isOversizeForZone` in `src/engine/geometry.ts`, fit test in `src/data/rosterFit.ts`. Other missions are unaffected. |

## 9. Figures

Heights follow 30-figures (infantry H 1.1, heavy 1.3, monsters/vehicles compressed); bases are rules-true. Faction
palette as adeptus-mechanicus.md §9 (oxidised-red hooded robes, tarnished brass and gunmetal augmetics, teal optic
lenses, no cog-skull or other logos). Rangers add dusty sand-tan scarves to tell them apart from the Vanguard; galvanic
rifles glow pale electric blue; Kataphron plasma glows cyan.

| Slug | Unit / model key | Models needed | Height (in) | Base | Visual prompt (house figure style, original; see docs/FIGURE-STYLE.md) |
|---|---|---|---|---|---|
| `enginseer-verask` | `adm.enginseer-verask/verask` | 1 | 1.25 | 32 mm | A hooded tech-priest in oxidised-red robes with teal lenses glowing under the hood, a big brass mechanical claw arm curling over one shoulder, a toothed power axe in one hand and a short pistol on the belt. |
| `skitarii-ranger-alpha` | `adm.skitarii-rangers/alpha` | 1 | 1.15 | 25 mm | A cyborg squad leader in a rust-red hooded coat with a sand-tan scarf, rebreather mask and teal goggles, a compact energy pistol in one hand and a short humming blade in the other. |
| `skitarii-ranger` | `adm.skitarii-rangers/ranger` | 6 | 1.1 | 25 mm | A hooded cyborg soldier in a rust-red coat and sand-tan scarf with a rebreather mask and teal lenses, holding a long slim rifle with a pale blue glowing coil along the barrel. |
| `skitarii-ranger-data-tether` | `adm.skitarii-rangers/data-tether` | 1 | 1.2 | 25 mm | A hooded cyborg soldier in a rust-red coat with a sand-tan scarf and a long slim blue-glowing rifle, a tall brass antenna mast with a small dish rising from a backpack. |
| `skitarii-ranger-arc-rifle` | `adm.skitarii-rangers/arc-rifle` | 1 | 1.1 | 25 mm | A hooded cyborg soldier in a rust-red coat and sand-tan scarf aiming a rifle whose barrel is wrapped in copper coils sparking blue electricity. |
| `skitarii-ranger-arquebus` | `adm.skitarii-rangers/arquebus` | 1 | 0.9 | 60 × 35 mm oval | A hooded cyborg sniper kneeling low behind an extremely long brass rifle on a bipod with a glowing green core and a big scope, sand-tan scarf trailing behind. |
| `kataphron-destroyer-grav` | `adm.kataphron-destroyers/grav` | 1 | 1.6 | 60 mm | A hulking half-machine servitor torso in gunmetal and rust-red plates riding a chunky tank-track base, a short pale bald head with teal lens, a fat purple-glowing grav cannon arm and a small white-flame blaster on the other shoulder. |
| `kataphron-destroyer-plasma` | `adm.kataphron-destroyers/plasma` | 2 | 1.6 | 60 mm | A hulking servitor torso on a chunky tank-track base in gunmetal and rust-red plates, a huge cyan-glowing plasma cannon arm with heat vents and a small flamer nozzle on the other arm. |
| `onager-dunecrawler` | `adm.onager-dunecrawler/dunecrawler` | 1 | 3.0 | 130 mm | A four-legged walker with tall thin brass spider legs carrying a round rust-red armoured hull, a turret on top with a six-barrel anti-air gun and a single fat missile tube, a small machine gun under the hull and a little antenna dish on the back. |

## 10. Other Adeptus Mechanicus patrols (appendix)

- **Purge Corps Deltic-9** — Index 10, January 2024, already playable (adeptus-mechanicus.md): Manipulus Skand (WARLORD,
  Leader → Skitarii Vanguard) ×1, Skitarii Vanguard ×10, Serberys Sulphurhounds ×3, Pteraxii Sterylizors ×5 — 4 units,
  19 models.
