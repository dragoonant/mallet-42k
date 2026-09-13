# Engine module contract (W1-A → W1-B…G)

This is the contract every rules module builds against. The core (`reducer.ts`, `state.ts`, `dice.ts`, `geometry.ts`,
`rng.ts`, `modules.ts`) is done; the files listed under "Ownership" are stubs whose **bodies** you fill in. Do not change
the frozen contracts (`types.ts`, `actions.ts`, `events.ts`, `hooks.ts`, `rng.ts`, `decider.ts`, `index.ts`) or the
interfaces in `modules.ts`; extend the interface declared in **your own** file if you need more methods (other modules
import those types, so keep additions backwards compatible).

Specs: `docs/spec/00-architecture.md` (contract), `10-rules-core.md` (rules, `R-x.y`), `11-combat-patrol.md`,
`12-rules-test-checklist.md` (test ids), `60-testing.md`. Fixtures for tests: `tests/fixtures/` (synthetic factions
`red`/`blu`, `makeSetup`, `makeEngine`, `scriptedModule`, `recordingStratagems`, `placeUnit`, `createContext`).

## 1. Ownership

| File | Owner | Fills |
|---|---|---|
| `terrain.ts`, `los.ts` | W1-B | `TerrainService`, `LosService` (placeholders: everything visible, no cover, flat board) |
| `phases/command.ts`, `phases/movement.ts`, `transports.ts` | W1-C | Command + Movement phase modules |
| `phases/shooting.ts`, `attack.ts`, `weapons.ts` | W1-D | Shooting phase, the shared attack sequence, weapon abilities |
| `phases/charge.ts`, `phases/fight.ts` | W1-E | Charge + Fight phase modules (they call `services.attack`) |
| `hooks-impl.ts`, `effects.ts`, `stratagems.ts`, `enhancements.ts`, `leaders.ts`, `setup.ts`, `objectives.ts`, `missions.ts` | W1-F | hook dispatch, active effects, stratagem/reaction windows + Command Re-roll, leader split, deployment/Scouts, objective control, scoring + mission rules, game end |
| `tools/sim` | W1-G | headless simulator over `engine.createGame/step/legalActions` |

Each stub already exports its object (`commandModule`, `terrainService`, …) and is wired into `DEFAULT_MODULES`
(`index.ts`). Replace bodies in place; keep the export names. Never import `./index` from inside `src/engine`
(cycle) — import the sibling file directly.

## 2. Shape of the engine

```
step(state, action, rng?)
  ├─ envelope + schema checks (E_GAME_OVER, E_SCHEMA, E_WRONG_DECISION, E_WRONG_PLAYER, E_PASS_NOT_ALLOWED, E_NOT_AN_OPTION)
  ├─ owner.validate(state, action, pending)            ← your pure domain checks (E_OUT_OF_RANGE, E_COHERENCY, …)
  ├─ draft = cloneForStep(state); draft.pending = null   ← input state is never touched
  ├─ owner.handle(ctx, action, pending)                 ← apply the answer to the draft
  ├─ advanceGame(ctx)                                   ← auto-advance until a decision is pending or the game ends
  └─ finalize: draft.rng = rng.serialize(); hash; log.push({seq, action, hashAfter, diceRollIds})
```

`owner` is the `DecisionHandler` that raised the pending decision:

| `pending.kind` | owner |
|---|---|
| `stratagemWindow`, `reactionWindow`, `commandReroll` | `services.stratagems` |
| `chooseOption` topic `coherencyCull` | core (R-2.6 cull) |
| `chooseOption` topics `oathTarget`, `waaagh`, `abilityChoice` | `services.hooks.handler` |
| `chooseOption` topics `razeObjective`, `recoverObjective`, `stompTarget`, `bagTarget` | `services.missions.handler` |
| everything else (incl. `chooseOption` other topics, `confirm`) | the phase module of `state.phase` (`setup`/`deployment` → `setupModule`) |

`ModuleTable.topics` holds the topic routing; tests build their own table with `createEngine`.

### The auto-advance loop (`advanceGame`)

```
loop:
  if state.pending            → return (the Decider must answer)
  if state.phase === 'ended'  → return
  if state.step === 'none'    → core transition (phase.end window, next phase / turn / round / battle end)
  else                        → ctx.window('<phase>.start', 'start', active-first)   (idempotent)
                                r = module.advance(ctx)
                                r === 'done'    → module.exit?; onPhaseEnd hooks; objectives; effects expire; PhaseEnded; step = 'none'
                                r === 'pending' → a decision must be pending, else EngineInvariantError
```

Core transition after a phase body (`state.step === 'none'`):
`phase.end` window (active, then opponent) → tabled check → next phase, or after Fight: coherency cull (R-2.6) →
`turn.end` window → objectives/turn-end hooks/effects → next player's turn (skipped when `missions.playerHasForces`
says no, R-12.6) → `round.end` window (first-turn player, then second) → `RoundEnded` → round 5 or tabled: `battle.end`
window → `GameEnded`; else `RoundStarted` → `round.start` window → `TurnStarted` → Command phase.

Entering a phase (`enterPhase`): `state.phase`, `state.step = 'none'`, fresh `phaseState` (marks, windows, attack …
all reset), per-phase unit/model flags reset (`shotThisPhase`, `foughtThisPhase`, `surgeMovedThisPhase`,
`allocatedThisPhase`), `PhaseStarted`, `onPhaseStart` hooks, then `module.enter(ctx)` which **must** set
`state.step` to the phase's first step (leaving `'none'` is an invariant error — `'none'` means "body finished").
Per-turn unit state (`unit.turn`) is reset for all units at `TurnStarted`.

## 3. Writing a phase module

```ts
export const movementModule: PhaseModule = {
  name: 'movement',
  enter(ctx) { ctx.state.step = 'select'; ctx.state.phaseState.activated = [] },
  advance(ctx) { /* loop over state.step until a decision is pending ('pending') or the phase is over ('done') */ },
  validate(state, action, pending) { /* pure; every domain check */ },
  handle(ctx, action, pending) { /* mutate ctx.state; emit events; return a Rejection only as a last resort */ },
  legalActions?(state, pending) { /* optional; default = pending.options[].action (+ pass) or null */ },
}
```

Rules of the road:

1. **Everything is a state machine.** `advance` is called again after every answered decision and must resume from
   what `state` says (`state.step`, `phaseState.*`, `unit.turn.*`, `model.flags.*`). Never keep progress in closures
   or module-level variables (the engine is replayed from the log; state is cloned every step).
2. **Raise, then return.** `ctx.decide(spec)` sets `state.pending` and emits `DecisionRequested`; return `'pending'`
   immediately. Exactly one decision may be pending. `spec` is the `PendingDecision` without `id`; the core assigns
   `d:<n>` and stamps `decisionId`/`player` into every `options[].action` (leave `decisionId: ''`).
3. **Windows are re-entrant.** `ctx.window(id, key, order, trigger?)` returns `true` when a decision is now pending —
   return `'pending'`. Called again with the same `(id, key)` it skips what was already offered and returns `false`
   when the occurrence is complete. `key` identifies the occurrence (`unitId`, `roll.id`, `'end'` …). Orderings:
   `ctx.order.active()` (active player first), `ctx.order.defensive(targetOwner)` (R-11.5 defensive windows),
   `ctx.order.first()` (round/battle windows), `ctx.order.only(p)` (Fire Overwatch: opponent only). The core opens
   `<phase>.start`, `phase.end`, `turn.end`, `round.*`, `battle.end` and `any.rollMade` (via `rollOnce`) itself;
   modules open the others listed in 00-arch §4 at the right spot.
4. **Rolls that can be re-rolled go through `ctx.rollOnce(key, spec)`.** It rolls once under `key`, opens
   `any.rollMade` for the roller (Command Re-roll), returns `null` while that decision is pending (return `'pending'`)
   and afterwards the possibly re-rolled `DiceRoll`. Consume it (store the result in state) before rolling again.
   Plain `ctx.roll(spec)` / `ctx.rollExpr(expr, spec)` are for rolls that can never be re-rolled or where the module
   handles offers itself (R-6.24 `rerollOffer` → `ctx.reroll(roll, indexes, source)`). Every roll emits `DiceRolled`.
5. **`ctx.once(key)` / `ctx.marked(key)`** are progress markers in `phaseState.marks` (reset per phase) for one-shot
   steps inside a re-entrant sequence ("hooks already run for this unit", "Advance roll made").
6. **Placements**: validate with `checkPlacements` (geometry.ts) — schema, per-model allowance (`constraints.perModel`
   / `maxDistance`, path length incl. climbs and pivot cost), board edge, `region`, `forbidden`, overlaps
   (`E_OVERLAP`), `mustEndOutsideEngagement` / `minDistanceFromEnemies` / `mustEndInEngagementWith` (`E_ENGAGEMENT`),
   coherency (`E_COHERENCY`). Add terrain (`services.terrain`) and mid-path checks (`pathEntersEngagement`,
   `pathCrossesModels`) yourself. Apply with `setModelPos` (rounds to 1/1000"). Coherency for attached units:
   `unitModelsForCoherency` / `services.leaders.combinedModels`.
7. **Emit an event for every rule effect** (`ctx.emit({ type, ... })`; the envelope `seq/round/turn/phase` is filled
   in, `player` defaults to the active player). The UI and AI only see events + state.
8. **Read data through the runtime tables**: `state.datasheets/weapons/abilities/stratagems` are frozen; per-game
   values live on units/models/players. `modelStats`, `datasheetOf`, `keywordsOf`, `hasKeyword`, `unitModels`,
   `boardModelsOf`, `enemyModelsOnBoard` (state.ts) are the lookups.
9. **Hooks**: `services.hooks.collect(ctx, 'onHitRoll', {attack, roll})` returns modifier results for roll/stat/
   eligibility hooks (you fold them: sum modifiers, clamp per R-6.20/6.21 with `netModifier`/`saveModifier`);
   `services.hooks.run(ctx, 'onPhaseStart', {})` applies side-effect hooks. `services.effects.grant/expire/activeFor`
   store durations. Stratagem windows are opened by `ctx.window` — never call `services.stratagems.openWindow` directly.
10. **Rejections vs. invariants**: illegal player input → `Rejection` from `validate` (state untouched); impossible state
    → `throw new EngineInvariantError(...)`. `handle` may also return a `Rejection` (draft discarded) but should not
    have rolled dice before doing so (an `rng` override would already be consumed).
11. **Unit locations**: every unit starts `'reserves'`; deployment sets `'board'` and model positions; `'destroyed'` is
    set by `removeModel` when the last model goes. Only `'board'` units have meaningful positions.

## 4. Services (what each stub must provide)

See the interface and TODO comments at the top of each file. Summary:

| Service | Called by the core | Called by modules |
|---|---|---|
| `stratagems.openWindow(ctx, window, player, key, trigger)` → bool | `ctx.window` for each player in order (at most once per `(window, player, key)`) | — |
| `stratagems.handle/validate` | decisions `stratagemWindow`/`reactionWindow`/`commandReroll` | — |
| `hooks.run/collect/apply/onWindow/handler` | `onPhaseStart/End`, `onTurnStart/End`; `onWindow` once per window occurrence | every roll/stat/eligibility point |
| `effects.expire(ctx, kind, player)` | phase end, turn end, round end, `nextOwnTurn` at turn start | `grant` from stratagems/abilities |
| `objectives.evaluateControl(ctx, moment)` | turn start (`controllerAtTurnStart` snapshot), phase end, turn end | scoring rules, consolidation fallback |
| `missions.onWindow(ctx, window, key, trigger)` | once per window occurrence, before stratagem windows | — |
| `missions.playerHasForces / isTabled / finalResult` | turn skipping (R-12.6), game end | — |
| `attack.begin/advance/handler/queueMortalWounds/destroyModel` | — | shooting, fight, overwatch, mortal-wound sources |
| `terrain.*`, `los.*`, `weapons.*`, `leaders.*`, `enhancements.*`, `transports.*` | — | movement/charge/fight/shooting |

## 5. Determinism, hashing, cloning

- `cloneForStep` copies `players`, `units`, `models`, `objectives`, `mission.scored/custom`, `phaseState`, `pending`,
  `result`; shares the frozen data tables, `board`, `setup`, and the `log` (append creates a new array). Mutate the
  draft freely — never the tables.
- `state.hash` = fnv1a (two 32-bit variants) of canonical JSON of the state minus `log`, `hash`, and the tables fully
  determined by `(setup, dataVersion)`; recomputed every step and stored in `log[seq].hashAfter`. Anything you keep in
  state must be JSON (no `undefined`-only semantics, no class instances, no `Map`).
- Ids: units `A:<ref>`, models `<unitId>#<n>`, decisions `d:<n>`, rolls `r:<n>`, effects `e:<n>` — all derived from
  state counters so replays reproduce them.
- `ScriptedRng` faces are D6 values; `roll(3)` maps a face with `ceil(face / 2)`. Roll-offs use
  `commandRerollable: false`.
- Event `seq` is the seq of the action being applied (`-1` for `createGame` events).

## 6. Testing your module

```ts
const engine = makeEngine({ phases: { ...pingPhases(), movement: movementModule } })   // real movement, ping elsewhere
const r0 = engine.createGame(makeSetup(), 'seed', bundle)
// or drive a context directly:
const state = freshState(); placeUnit(state, 'A:grunts', { x: -10, z: -12 })
const { ctx, events } = createContext(state, new ScriptedRng([3, 4]), engine.modules)
movementModule.enter(ctx); movementModule.advance(ctx)
```

Name tests with the checklist ids (`it('MOVE-003 …')`), one id per `it`, and put fixtures under `tests/fixtures/`.
`npx vitest run tests/engine/<yours>.test.ts` plus `npm run typecheck` before you return.
