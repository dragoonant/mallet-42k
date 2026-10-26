# 11th edition gap analysis: missions, objectives, terrain, deployment, patrol data

Date: 2026-10-26. Planning only; nothing in the engine or data has changed.

**What was compared.** The 11th edition Core Rules (88 pages, `docs/sources/core-rules-11th.pdf`, gitignored) and
the one-page Universal Rules Updates v1.1 (in `docs/sources/` beside it), against how Mallet 42k plays 10th edition
Combat Patrol today: `docs/spec/10-rules-core.md`, `docs/spec/11-combat-patrol.md`, `docs/spec/20-data-schema.md`,
`src/engine/{missions,objectives,terrain,setup}.ts` and the JSON under `src/data/`. Page numbers below are the
printed page numbers of the core rules PDF. Rule names are GW's, everything else is our own summary.

**Scope.** Core-loop rules (shooting, fighting, movement, stratagem mechanics) are covered by a separate
analysis. They show up here only where they force a data or schema change.

**Headline.** The core rules never mention Combat Patrol, board sizes or points-free play. Mission content
(deployment maps, scoring, secondaries, turn order, which terrain goes where) is pushed out to mission decks and
GW's app. So the parts of 11th we can see change *how* objectives, terrain and cover work. They do not tell us
*what* an 11th Combat Patrol game looks like.

**Data counted** (34 patrols across 24 faction folders): 142 datasheets, 411 weapon profiles (234 ranged, 177
melee), 150 faction abilities, 102 patrol stratagems + 11 core, 68 enhancements, 68 secondaries, 6 missions with
25 objective markers, 4 terrain layouts with 46 pieces.

Impact key: **S** = a day or less / one agent; **M** = one workflow stage; **L** = more than one stage, or a
model change that touches engine, data, renderer and AI together.

---

## 1. Objectives

### O1. Objectives become terrain areas, not markers (L)
- **Now:** every objective is a 40 mm marker point, `mission.objectives: {id, x, z}[]` (`src/data/missions/cp-0*.json`,
  25 markers). Range is 3" horizontal / 5" vertical from the disc edge (`OBJECTIVE_RANGE`, `OBJECTIVE_MARKER_RADIUS`
  in `src/engine/geometry.ts`, used by `src/engine/objectives.ts` and `missions.ts`). CP-3.3 deliberately keeps
  ruin walls and crates more than 1" away from every marker.
- **11th (p.52, 14.01):** a mission's map gives objective *points*, and each point is meant to sit on a terrain
  area. The whole area is then the objective (a "terrain objective"). A model counts as in range while it is
  inside that area, with no 3" halo and no vertical limit. Upper floors count.
- **Fallback (p.88, appendix):** a point that does not fall on a terrain area still uses a 40 mm marker with the
  same 3"/5" range we use today. Models may now *end* a move on a marker (R-12.1 currently forbids it).
- **Data/schema:** the `mission.objectives[]` entry gains `area?: Id` (a terrain-area id) or `kind: terrain|marker`.
  `objectiveRange` and `objectiveMarkerRadius` stay for markers only. `withinObjectiveRange` needs a second path
  (point-in-area polygon test for "within", meaning any part of the base). The renderer has to draw an area
  highlight instead of a disc. The AI's objective heuristics (`40-ai`) measure distance to a point and would need
  to measure to an area.
- **Affected:** all 6 missions (25 objective entries). It also flips CP-3.3: layouts must put an area *on* each
  point, where today they keep terrain *off* it.

### O2. Control timing and Level of Control (S)
- **Now:** R-12.3 re-checks control at the start of every turn, the end of every phase and turn, and on request.
  It snapshots `controllerAtTurnStart` (used by Shock Tactics and Duty and Honour).
- **11th (p.52, 14.02):** control is fixed at the end of each phase and each turn. Summing OC and "highest wins,
  tie = nobody" are unchanged. The start-of-turn check is gone, but the snapshot equals the previous turn-end
  result, so behaviour barely moves.
- **Data/schema:** none. Engine: drop the separate turn-start evaluation and keep the snapshot.
- **Affected:** 0 data entries. Check 1 secondary (Shock Tactics) and 1 stratagem (Duty and Honour).

### O3. "Secured" is now a core rule with a different break condition (M)
- **Now:** CP-2.4–2.6. At the end of each Command phase, a marker held by a non-Battle-shocked BATTLELINE unit
  becomes secured. The flag clears only at the end of a later Command phase, if the opponent's LoC is higher
  (`objectives.ts` lines ~117–140). Duty and Honour is a separate sticky flag.
- **11th (p.52, 14.03):** securing is a core concept, but *which* rules secure is left to unit abilities. The
  example datasheet on p.11 gives Boyz a secure-at-end-of-Command-phase ability. A secured objective is lost at
  the end of *any* phase where the opponent's LoC is higher, not just the Command phase.
- **Data/schema:** move the blanket BATTLELINE rule out of the mission layer into a reusable ability
  (`core.a.secure-objective`, trigger `phaseEnd`, phase `command`). Change the break check to every phase end.
  Whether 11th CP keeps a "BATTLELINE secures" mission rule is unknown (see U1).
- **Affected:** 33 BATTLELINE datasheets, plus 3 faction entries that already secure or stick objectives
  (Auto-choral Resonators, Duty and Honour, Pheromonal Trace).

### O4. Battle-shock now starts at half strength (S, data-visible)
- **Now:** units test when below half strength.
- **11th (p.30, 08.03; p.86):** units test at *or* below half. A unit that cannot split evenly can never be
  exactly at half. Battle-shocked units have OC "-", cannot start actions, and cannot be targeted by their own
  stratagems (p.9).
- **Data/schema:** none. This is core loop, listed because it shifts objective control. Re-check entries that
  test `unitBelowHalf` / `targetBelowHalf` (2 condition uses) and the 19 abilities whose text mentions
  Battle-shock.

### O5. Abilities that key off "on an objective" (S–M)
- **Now:** condition keys `targetOnObjective` (4 uses), `targetOnObjectiveControlledBy` (1), `unitOnObjective` (1),
  `unitOnObjectiveControlledBy` (1), and the stratagem filter `within.of: objective|controlledObjective` (3
  stratagems). All are measured from markers.
- **11th:** same meaning, but "within range" becomes "inside the area" for terrain objectives.
- **Data/schema:** no new keys if the condition evaluator calls one shared `inRangeOfObjective()` that knows
  areas. Text rewording ("near the marker" becomes "on the objective") in 19 abilities, 7 stratagems and
  9 enhancements.
- **Affected:** 10 descriptors functionally, about 35 text fields cosmetically.

### O6. Mission rules that remove or mark objectives (M)
- **Now:** Raze and Ruin removes markers, Irradiated Power Cells removes Gamma/Beta, Claim Sites and Proper
  Lootin' tag markers (`Objective.removed`, `claimedBy`, `lootedBy`).
- **11th:** if the objective *is* a terrain area, "removing" it can't mean picking it up off the table. The
  terrain stays, so the rule has to switch off its objective status instead. Unknown how GW handles this (U1).
- **Data/schema:** keep `Objective.removed` as "no longer an objective". The renderer must hide the area
  highlight but keep the terrain.
- **Affected:** 2 mission rules (cp-02, cp-04), 2+ secondaries.

---

## 2. Terrain

### T1. Terrain areas as a first-class object (L)
- **Now:** `terrain-layout = {id, board, pieces[]}`. Each piece has a `footprint` polygon, `walls`, `floors` and
  `traits` (`obscuring|cover|scalable|breachable|…`). Footprints double as the "area" for wholly-within tests
  (R-3.6). There are 4 layouts (`src/data/terrain/`) with 46 pieces: 32 ruins, 10 crates, 2 barricades and 2
  craters.
- **11th (p.46, 13.01; p.47):** a *terrain area* is a boundary (a mat, one feature's outline, or an agreed shape
  around several features). Each feature inside it has its own category. A deployment map may fix where areas
  go and which categories each should hold.
- **Data/schema:** add `areas: [{id, polygon, objectiveAnchor?}]` to the terrain layout, and add `area: Id` and
  `category` to each piece. Today's ruin footprint is a natural first-cut area. Free-standing crates need an
  area drawn around them (or one shared area per crate pair). Re-run `tools/terrain/wtc-to-cp.mjs` to emit areas.
- **Affected:** 4 layouts, 46 pieces. Lane tests (`terrainLanes.test.ts`) and floor tests stay valid.

### T2. Three terrain categories replace our trait mix (M)
- **Now:** kinds `ruin|crate|barricade|crater|wall|forest` with per-kind rules (10-rules §3.2 table: crater,
  barricade, debris, hill/container, woods, ruins).
- **11th (p.46, 13.02–13.05):** only *exposed*, *light* and *dense*. Examples: craters/razorwire are exposed,
  barricades/low walls light, buildings/ruins/containers/woods dense.
- **Data/schema:** add `category: exposed|light|dense` per piece. The mapping is direct: ruin, crate and forest
  become dense, barricade and wall light, crater exposed. `traits` `obscuring`/`cover` become derived and can be
  dropped. `scalable` stays as a renderer hint.
- **Affected:** 46 pieces. The engine's barricade-specific rules (R-3.9 cross-the-barricade charge) have no 11th
  counterpart in the core (core-loop item).

### T3. Movement through dense terrain (M, engine; S, data)
- **Now:** `terrain.ts` `crossesImpassable` blocks non-INFANTRY at ruin walls. Crates are solid at ground level
  for everyone. Only INFANTRY/BEAST/FLY may end on upper floors.
- **11th (p.48, 13.06):** INFANTRY, BEASTS, SWARM and **MOBILE** models move horizontally through dense
  features. Others may cross only the parts that are 2" tall or less, and may climb taller parts but not end on
  top. Vertical distance counts toward the move. Ending on a non-ground surface needs INFANTRY, BEASTS, SWARM,
  FLY or MONSTER, plus a stable, non-overhanging base. The "Solid" note means no model may end a move with any
  part inside an enclosed section 3" or less above ground.
- **Data/schema:** walls already carry `height`. Crates need to be treated as dense features with a height (they
  have it), so INFANTRY can now pass *through* a container but not stop in it. MONSTER joins the
  may-end-on-upper-floors list. New keyword MOBILE (see D5).
- **Affected:** 46 pieces need no new numbers. The engine has 3 functions in `terrain.ts` (`canEndAt`,
  `crossesImpassable`, `canPassWalls`).

### T4. Cover becomes −1 BS and is granted by being in any area (L, cross-cutting)
- **Now:** R-3.11–3.14. Cover gives +1 to the armour save against ranged attacks. There is no bonus for a 3+
  save against AP 0, the save improvement is capped at +1 in total, and cover is judged per piece.
- **11th (p.50, 13.08; p.51):** a unit has cover if *every* model either is INFANTRY/BEASTS/SWARM inside *any*
  terrain area (exposed included) or is not fully visible because of terrain features or obscuring areas in the
  way. Cover worsens the attack's BS by 1; it is no longer a save bonus. Stealth (p.85) now simply grants cover.
  Indirect shooting always grants it (p.35).
- **Data/schema:** the `stealth` effect key (currently "−1 to hit") becomes "grants cover". The `targetInCover`
  condition keeps its meaning. Any ability that "improves saves vs ranged" no longer competes with cover for the
  +1 cap, so the `armourOnly` interplay needs a re-read.
- **Affected:** 8 datasheets with STEALTH, 20 [IGNORES COVER] weapons (no change needed), about 12
  abilities/stratagems/enhancements whose text mentions cover or stealth, and 1 `ignoreCover` effect. The engine
  side belongs to the core-loop analysis.

### T5. Obscuring areas, Solid and Hidden (L, engine; S, data)
- **Now:** R-3.7. Ruin footprints block sight lines that start and end outside them. Walls are raycast. Crates
  and barricades block only by geometry (`los.ts`, `terrain.ts`).
- **11th (p.50, 13.09–13.11; p.51):**
  - **Obscuring:** any area holding a light or dense feature blocks every sight line that crosses it, except
    areas either model is inside.
  - **Solid:** dense features block sight through any opening 3" or less above ground (doors, windows, gaps).
    The height can be adjusted by mission.
  - **Hidden:** INFANTRY/BEASTS/SWARM inside an area with a dense feature, whose unit has not shot this turn or
    last turn, can only be seen from within 15" ("detection range").
- **Data/schema:** obscuring is derived from category, so no field is needed. Add `solidHeight` (default 3) to
  missions. Add a per-unit "fired last turn" flag to the engine (not data). Detection range is a model property
  that rules can change: add `detectionRange?` to the datasheet only if GW data shows variants (U3).
- **Affected:** all 4 layouts. A barricade area becomes sight-blocking, which today it is not, so cp-01 changes
  most. Lone Operative (3 datasheets) now overlaps with Hidden.

### T6. Plunging Fire changes trigger and payoff (S)
- **Now:** R-3.8. A model wholly within a ruin and at least 6" up gets +1 AP against ground-level targets.
- **11th (p.73, 22.05):** a model standing on any terrain section at least 3" high, or a TOWERING model within
  12", gets +1 BS against a unit with models on ground level.
- **Data/schema:** none for terrain. Our three-storey floors sit at 3" and crates are 3" tall, so both qualify;
  two-storey floors at 2" do not. Expect plunging fire to be common. TOWERING appears on 0 datasheets now; check
  against GW data (U3).
- **Affected:** 4 layouts (no edits), 0 datasheets today.

### T7. Terrain guidance per deployment map (M)
- **Now:** CP-3.2 uses three scaled WTC layouts shared across missions (`cp-short-edges` serves missions 2, 3, 5
  and 6, whose objective points all differ).
- **11th (p.46):** a deployment map may define each area's position, size and required categories. Objective
  points should land on areas (p.52).
- **Data/schema:** a layout shared by four missions cannot put areas on four different sets of points. Either
  (a) build one layout per mission (6 instead of 3), or (b) keep the shared layouts and let off-area points fall
  back to markers (p.88). Owner call N2.
- **Affected:** 3 played layouts (+1 test layout), 6 missions.

---

## 3. Missions and deployment

### M1. No Combat Patrol content in the core rules (L, blocking)
- **Now:** `docs/spec/11-combat-patrol.md` §1–2 fixes a 44"×30" board, 5 rounds, six missions, their maps,
  scoring schedules and mission rules (`src/data/missions/cp-01..06.json`).
- **11th (p.4–5):** the core rules point to a mission deck and the app for battlefield size, deployment, terrain
  volume, first player and number of rounds. The book only says a battle "usually" lasts five rounds (p.4). The
  extracted text has no mention of Combat Patrol, Incursion, board sizes or battle sizes by name.
- **Data/schema:** nothing yet. `mission.format`, `board`, `rounds` and `firstTurn` already parameterise all of
  this.
- **Affected:** 6 missions, all unknown (U1).

### M2. Mission-rule ordering at shared trigger points (S)
- **Now:** `missions.ts` `runScoring` fires at its window. The relative order against other rules at the same
  window is whatever the hook registry does.
- **11th (p.28–30, 07.03, end-of-turn step, 08.05):** at the end of a battle round, the end of a turn and the end
  of the Command phase, every non-mission rule resolves *first*, then mission scoring and mission rules.
- **Data/schema:** none. Engine: make sure mission hooks run last in those three windows (one ordering test).
- **Affected:** 6 missions, 68 secondaries (all `custom` scoring).

### M3. Actions are a core mechanic (M–L)
- **Now:** no action system. Mission interactions (Retrieve Intelligence, Raze and Ruin, Claim Sites, Proper
  Lootin') are `code` hooks with `chooseOption` decisions.
- **11th (p.58, 16.01):** an action declares when it starts, which units may do it, a use limit, when it
  completes, and its effect. Starting one stops the unit from shooting or charging that turn. Moving or leaving
  the battlefield cancels it. Battle-shocked units, OC-0 units and units that advanced or fell back cannot start
  one. The page's example (illustration only) is done inside a terrain area outside your own zone, which is a
  strong hint that 11th missions are built on actions plus areas.
- **Data/schema:** new `action.schema.json` `{id, name, text, starts: TimingWindowId, units: TargetSpec, useLimit,
  completes: TimingWindowId, effect|code, requires?: {inArea?, notInOwnZone?}}`. Add `mission.actions: Id[]` and
  patrol-level `actions` for secondaries. Engine: unit state `performingAction`, cancel on move, plus a UI
  button.
- **Affected:** 0 entries today. Likely most 11th missions and some secondaries (U1).

### M4. Deployment set-up distances drop from 9" to 8" (S)
- **Now:** `setup.ts` uses 9" for Infiltrators (lines ~49–56), and the same 9" constant covers Deep Strike and
  Scouts (R-10.7, R-5.14).
- **11th:** Deep Strike sets up more than 8" from enemies (p.80, 24.09). Infiltrators sets up more than 8" from
  the enemy zone and enemy units (p.82, 24.20). A scout move must end more than 8" away (p.84, 24.32). The new
  "Scouts" option can also deploy a reserve unit inside your own zone.
- **Data/schema:** an engine constant, plus text in 6 abilities and 3 stratagems that quote 9".
- **Affected:** 25 Deep Strike, 9 Infiltrators and 12 Scouts datasheets (no data edit). About 9 text fields.

### M5. Strategic reserves are open to any unit (M)
- **Now:** CP-1.9. Only Deep Strike (and Tellyporta-style) units start off the board. They arrive from round 2
  and are destroyed if still off the board at the end of round 3.
- **11th (p.68–69, 20.01–20.04):** any non-FORTIFICATION unit may go into strategic reserves at Declare Battle
  Formations, capped at 50% of the battle size's points. An ingress move sets up within 6" of a battlefield edge
  and more than 8" from enemies, and stays out of the enemy zone before round 3. The unit then cannot move again
  until the next Charge phase. Rapid Ingress lets a unit arrive at the end of the opponent's Movement phase
  (p.57).
- **Data/schema:** Combat Patrol has no points (all `points` entries are 0), so the 50% cap has no input. The
  likely replacement is a unit- or model-count cap from the CP rules (U2). The mission needs `reservesCap?`. The
  setup UI needs a "to reserves" choice for every unit.
- **Affected:** 34 patrols (setup flow). No datasheet edits.

### M6. Turn count, first player, CP economy (S)
- **Now:** 5 rounds, roll-off for first turn, both players gain 1 CP per Command phase, and at most +1 extra CP
  per round (CP-1.7, R-4.2).
- **11th (p.28, 07.02–07.03; p.30, 08.02):** the mission says who goes first and how many rounds there are. Both
  players gain 1 "Core CP" every Command phase, as now. The extra-CP cap is not in the core book.
- **Data/schema:** none (`rounds`, `firstTurn` exist). Keep the +1 cap behind a mission flag until the CP rules
  confirm it (U2).
- **Affected:** 6 missions.

### M7. Secondaries (M, unknown content)
- **Now:** every patrol ships a default and an optional secondary. That is 68 in total, all scored with `custom`
  code in `missions.ts`, and 27 of them refer to objectives.
- **11th:** the core rules say nothing about secondaries. The 27 objective-based ones inherit O1/O5 semantics
  automatically if they go through the shared range helper. The rest keep working unchanged.
- **Data/schema:** none until GW data is visible.
- **Affected:** 27 re-tests (objective based), 68 total at risk if 11th CP swaps the secondaries (U1).

---

## 4. Patrol data

### D1. [CLOSE-QUARTERS] supersedes [PISTOL] (S)
- **Now:** weapon ability enum `PISTOL`, on 57 ranged profiles.
- **11th (p.80, 24.07; p.83, 24.27):** the two are the same rule. PISTOL is kept for older data and will be
  phased out. A new *close-quarters shooting* type (p.35, 10.06) lets engaged units fire them, and lets
  MONSTER/VEHICLE fire anything at −1.
- **Data/schema:** add `CLOSE_QUARTERS` to the enum and treat `PISTOL` as an alias. A mechanical rename of the 57
  profiles is optional; doing it keeps the UI label current. The 11th example datasheet (p.11) already shows a
  slugga with the new name.
- **Affected:** 57 weapons, plus 2 stratagems and 1 enhancement whose text says "pistol".

### D2. New [CLEAVE X] melee ability (M, data unknown)
- **Now:** no equivalent.
- **11th (p.79, 24.06):** extra attack dice per five models in the target unit, if the weapon's attacks all go
  at one target.
- **Data/schema:** add `CLEAVE` (with `value`) to the enum. Engine: reuse the BLAST dice counter.
- **Affected:** unknown which weapons get it. The candidate pool is 177 melee profiles, of which 122 carry no
  ability today. Expect a minority, probably the sweeping big weapons and monster talons (U3).

### D3. [BLAST X] and keyword-scoped weapon abilities (S)
- **Now:** `WeaponAbility = {ability, value?, keyword?, ref?}`. `value` is allowed for RAPID_FIRE, SUSTAINED_HITS
  and MELTA; `keyword` is used only by ANTI.
- **11th (p.78, 24.01; p.79, 24.05):** BLAST may carry a number. Any weapon ability may be limited to targets
  with given keywords (for example lethal hits only against vehicles). Duplicated abilities never stack (p.78,
  24.02).
- **Data/schema:** allow `value` on BLAST and CLEAVE. Generalise `keyword` into `targetKeywords?: Keyword[]` for
  every ability. Add a duplicate-resolution rule in the engine.
- **Affected:** 26 BLAST profiles (default value 1, no edit). Keyword-scoped abilities: 0 today, unknown in 11th
  data.

### D4. [HEAVY] and other changed weapon-ability triggers (S, data)
- **Now:** 20 HEAVY profiles, engine bonus for "remained stationary". 1 ability uses the `unitStationary`
  condition.
- **11th (p.82, 24.16):** the +1 to hit applies if the unit is unengaged, was not set up this turn, and no model
  moved more than 3". Other changes are rules only, with no data edit: [PSYCHIC] may ignore BS/WS and hit
  modifiers (p.84), [INDIRECT FIRE] gets the new indirect shooting type (p.35), [HAZARDOUS] uses hazard rolls
  that fail on 1–2 (p.24), [EXTRA ATTACKS] also forces one normal melee weapon (p.81), and [DEVASTATING WOUNDS]
  is capped at one model per critical wound (p.80).
- **Data/schema:** none for the 20 HEAVY profiles. Expect GW to add HEAVY to more big guns (55 ranged profiles
  are S8+ today). Re-check the 1 `unitStationary` ability.
- **Affected:** 20 HEAVY, 24 PSYCHIC, 4 INDIRECT, 22 HAZARDOUS, 7 EXTRA_ATTACKS, 20 DEVASTATING_WOUNDS profiles
  (all engine-side).

### D5. New and renamed unit keywords (M)
- **Now (keyword counts on 142 datasheets):** INFANTRY 108, BATTLELINE 33, CHARACTER 36, VEHICLE 20 (12 WALKER),
  FLY 17, MOUNTED 9, PSYKER 12, SMOKE 6, BEAST 1, SWARM 1, MONSTER 2. GRENADES, EXPLOSIVES, MOBILE, FRAME and
  TOWERING all appear 0 times.
- **11th:**
  - **MOBILE** lets a unit walk through dense terrain (p.48). Likely cavalry, bikes and jetbikes.
  - **BEASTS** is spelled plural throughout (p.48, p.50).
  - **EXPLOSIVES / GRENADES** gate the new Explosives stratagem (p.56). The p.11 Boyz carry EXPLOSIVES.
  - **FRAME** marks base-less models measured from the hull (p.62, 17.02).
  - **TOWERING** feeds Plunging Fire (p.73).
  - **SMOKE** still gates Smokescreen.
- **Data/schema:** keyword strings only, no schema change. FRAME needs a hull footprint for the 9 non-walker
  vehicles, which today sit on large oval or round bases. Without GRENADES/EXPLOSIVES data, the Explosives core
  stratagem would never be legal for anyone.
- **Affected:** 1 rename (BEAST), roughly 9–17 MOBILE candidates, roughly 30–60 EXPLOSIVES/GRENADES candidates
  among the 108 INFANTRY sheets, 9 FRAME candidates. Exact lists unknown (U3).

### D6. Datasheet shape (S)
- **Now:** `stats {M,T,Sv,W,Ld,OC}` plus optional `invuln` (62 datasheets), `coreAbilities`, `leader`, `damaged`,
  `transport` and `points` (all 0 in CP).
- **11th (p.10–11, 02.01–02.07):** the same blocks. The invulnerable save is now printed as a profile
  characteristic (InSv). Movement, OC or Ld may be "-". Leader units may be joined by a separate *Support* unit
  (p.66, 19.01): each bodyguard takes one leader *and* one support unit. New core abilities are SUPPORT, HOVER
  and SUPER-HEAVY WALKER (p.81–85). Lone Operative may carry a distance (p.83).
- **Data/schema:** add `SUPPORT`, `HOVER` and `SUPER_HEAVY_WALKER` to the `coreAbilities` enum. Add
  `support: {attachTo: Id[], effects}` beside `leader`. Allow `"-"` for M/OC/Ld (a nullable int). Keep `invuln`
  where it is (no reason to move it). The patrol `attachTo` gains a second slot.
- **Affected:** 30 leader datasheets to re-check for Support status. 3 Lone Operative sheets may gain a value.

### D7. Engagement range widens to 2" (S, data text)
- **Now:** 1" ER is used throughout; ability, stratagem and enhancement texts say "within Engagement Range".
- **11th (p.13, 03.04):** 2" horizontal and 5" vertical, renamed "engaged" / "unengaged".
- **Data/schema:** no field changes. Wording pass on about 30 text fields (11 abilities, 16 stratagems, 3
  enhancements). Re-check any `within: 1` numeric params against the new wording.
- **Affected:** about 30 texts.

### D8. Core stratagem set changes (M, data)
- **Now:** `src/data/core/stratagems.json` holds 11: Command Re-roll, Counter-offensive, Epic Challenge, Insane
  Bravery, Grenade, Tank Shock, Rapid Ingress, Fire Overwatch, Go to Ground, Smokescreen, Heroic Intervention.
- **11th (p.55–57, 15.02–15.12):** 11 core stratagems again, but not the same set.
  - Grenade is replaced by **Explosives** (EXPLOSIVES/GRENADES unit, 8").
  - Tank Shock is replaced by **Crushing Impact** (the dice count follows T and the unit can hurt itself).
  - **Go to Ground is gone.**
  - Fire Overwatch now uses snap shooting at a single target within 24", and only at the end of the opponent's
    Movement phase.
  - Smokescreen is used at the start of the opponent's Shooting phase and grants cover.
  - Heroic Intervention has two modes and an optional +1 CP upgrade.
  - Counteroffensive must be the next unit to fight.
  - Insane Bravery is limited to once per battle.
  - Command Re-roll now also covers hazard rolls.
- **Data/schema:** rewrite 9 entries, delete 1 (Go to Ground), add 2. Re-check patrol stratagems or abilities
  that name core ones (1 stratagem, 3 abilities and 2 enhancements mention Overwatch; 1+1 mention Heroic
  Intervention).
- **Affected:** 11 core entries, about 8 faction entries by reference.

### D9. Stratagem format: Restrictions and paid upgrades (S–M)
- **Now:** `stratagem = {cost, category, phases, window, who, condition, when, targets, effect, scope, duration,
  limit}`. 102 patrol stratagems: 97 cost 1 CP, 5 cost 2 CP, 96 `oncePerPhase`, 2 `oncePerBattle`.
- **11th (p.54–55, 15.01):** each stratagem lists cost, When, Target, Effect and an optional **Restrictions**
  line. A stratagem may have an optional extra section bought with additional CP. The "used in" marker
  (yours / opponent's / either) matches our `who`. The book shows no battle-tactic / strategic-ploy categories.
  Core limits: one use per stratagem per phase, and (new to us) **one stratagem per unit per phase** unless a
  rule says otherwise.
- **Data/schema:** add `restrictions?: {oncePerBattle?, notInRound?: int[], …}` (or fold into `limit`). Add
  `upgrades?: [{extraCost, when?, effect}]`. Make `category` optional or informational. The engine enforces the
  per-unit-per-phase limit.
- **Affected:** 102 + 11 entries. The schema is additive, so no re-entry is needed until GW data is visible.

### D10. Universal Rules Updates v1.1 errata (S)
- **What it changes:**
  1. Unnamed "use for 0 CP" effects become "1 CP cheaper".
  2. Effects that allow a repeat use of a stratagem only work if they name the stratagem.
  3. Stratagem effects that protect a unit from shooting beyond 12" now use 18".
  4. Stratagems that bring back an identical destroyed unit become once per battle.
  5. Disembarking after the transport advanced or made a normal move uses the new shock / assault disembark
     moves.
- **Data:** about 4 entries hit by item 1 (Foresight, Ferocious, Cabal of Sorcerers, Pouncing Leap; to verify one
  by one). 1 entry hit by item 3 (Protocol of Resonant Focus). Items 2 and 4 hit 0 entries. Item 5 is engine
  only (5 transports).
- **Affected:** about 5 entries.

### D11. Enhancements (S, unknown content)
- **Now:** 68 enhancements (2 per patrol), each with `cost (pts)` (always 0 in CP) and a WARLORD-only default.
- **11th:** the core book mentions enhancements only in passing (p.67: abilities that affect a single model stay
  on that model inside an attached unit). Nothing structural changes.
- **Data/schema:** none. Text re-check for the words that change: 9 mention objectives, 3 ER, 4 Deep Strike, 4
  stealth, 2 Overwatch.
- **Affected:** about 20 texts.

---

## Unknown until GW's 11th Combat Patrol data is visible

GW's 11th Combat Patrol rules reportedly live only in the app, and only current boxes are supported at launch.
None of the following can be settled from the core book:

- **U1. Missions.** Whether CP keeps 44"×30", 5 rounds, these six deployment maps, the BATTLELINE-secures rule,
  the round-5 scoring split, and the current mission rules (Raze, Gamma/Beta, Supply Lines). Whether missions
  switch to actions (M3) and terrain-area objectives (O1), and where areas and categories go on each map.
- **U2. CP format rules.** The reserves cap without points (M5), the +1 CP per round cap (M6), Patrol Squads (11
  patrols use them), how enhancements and secondaries are chosen, and whether 11th CP still has one fixed army
  rule per patrol.
- **U3. Per-datasheet changes.** Which weapons gain CLEAVE, HEAVY or keyword-scoped abilities. Which units gain
  MOBILE, EXPLOSIVES/GRENADES, FRAME, TOWERING or Support. Changed profiles and points-free wargear. Detection
  range variants.
- **U4. Box coverage.** Which of our 34 patrols are "current boxes" at launch. Older boxes may never get 11th CP
  data, which leaves them on 10th rules or needing our own conversion.

## Needs owner call

- **N1. One ruleset or two.** Keep 10th CP playable beside 11th (a `rulesEdition` switch on missions and the
  bundle), or replace it outright. Running both roughly doubles test surface on O1, T4 and T5.
- **N2. Objective model before GW data lands.** Either (a) build our own area-on-every-point layouts per mission
  (6 layouts, true to 11th intent), or (b) keep the shared layouts and rely on the p.88 marker fallback (cheap,
  legal, and plays almost like today).
- **N3. Old boxes.** For patrols with no 11th CP data, convert them ourselves (own-words, own judgement) or freeze
  them on 10th.
- **N4. PISTOL rename.** Rename the 57 profiles to CLOSE_QUARTERS now (UI matches 11th), or alias silently.
- **N5. Missing keywords.** Add GRENADES/SMOKE-style keywords from 10th sources now so Explosives is usable, or
  wait for GW's lists.

## Rough effort

| Block | Size | Stages (≤8 agents each) | Blocked on GW data? |
|---|---|---|---|
| Schema additions (areas, category, objective `area`, actions, Support, enum values, stratagem restrictions/upgrades, nullable stats) | M | 1 | no |
| Terrain areas + categories in the 4 layouts, generator update, area rendering | M–L | 1–2 | no (N2) |
| Objective engine: areas, secured rule, timing, AI distance-to-area | M | 1 | no |
| Core-stratagem data rewrite + text/wording passes (ER, 9"→8", objective wording, errata) | M | 1 | no |
| Actions system + mission conversions | M–L | 1–2 | partly (U1) |
| Re-entry of 11th CP missions and secondaries | L | 1–2 | yes |
| Re-entry of patrol datasheets, weapons, stratagems, enhancements for current boxes | L | 4–5 (34 patrols ÷ 8) | yes |

**Total:** about 5–7 stages of work that can start now, plus about 5–7 more once GW's 11th CP data is visible. That
is roughly 10–14 stages end to end. It excludes the core-loop rework (cover maths, visibility, shooting types,
engagement range), which the other analysis covers and on which T4, T5 and D4 depend.
