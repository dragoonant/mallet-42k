# 00 — Architecture

Source of truth for module boundaries, the engine contract, the decision model and determinism.
Rules content lives in 10/11/12; data shapes in 20; figures 30; AI 40; client 50; testing 60.
`src/engine/types.ts` is the code form of §3–§7 and must not diverge from this file.

## 1. Modules

| Module | Path | May import | Must not | Runtime |
|---|---|---|---|---|
| engine | `src/engine/` | nothing outside itself (+ JSON types from `src/data/types`) | DOM, React, Three, timers, `Math.random`, `Date` | node + browser |
| data | `src/data/` | schemas only | code with side effects | build-time JSON, validated by `tools/validate-data` |
| ai | `src/ai/` | engine (read-only API), data | client, Three | node + worker |
| client | `src/client/` | engine, ai, data, assets | mutate `GameState` | browser |
| assets | `src/assets/` | Three | engine, ai | browser |
| tools | `tools/` | anything (node scripts) | be imported by src | node |
| tests | `tests/` | everything | — | vitest / playwright |

Path aliases: `@engine/*`, `@ai/*`, `@data/*`, `@client/*`, `@assets/*`. Enforced by an eslint `no-restricted-imports` rule per module (checked in CI).

Dependency direction: `data ← engine ← ai ← client`, `assets ← client`. Engine and ai are headless and run unchanged in the headless simulator (`npm run sim`) and in a web worker.

## 2. Engine contract

```ts
step(state: GameState, action: Action, rng?: Rng): StepResult
interface StepResult {
  state: GameState;              // new state, or the SAME reference when rejected
  events: GameEvent[];           // ordered; empty except [ActionRejected] when rejected
  pending: PendingDecision | null; // what must happen next; null only when phase === 'ended'
  rejection?: Rejection;         // present iff the action was illegal
}
```

| Function | Purpose |
|---|---|
| `createGame(setup: GameSetup, seed: string, bundle?: DataBundle): StepResult` | builds initial state; first `pending` is a deployment decision. The engine never imports data: `bundle` (or one registered once via `registerDataBundle`) supplies it; `replay`/`load` take the same optional argument. Validates the setup (patrol/enhancement/secondary ids, `attachments`, `enhancementChoice.unitRef` present iff the enhancement data has `choice`, keyword matches, same player) and throws `EngineInvariantError` on failure — setup comes from the UI/sim, not from a Decider |
| `step(state, action, rng?)` | pure reducer; never throws for illegal actions (see §8); throws only on programmer error (corrupt state). The RNG is restored from `state.rng`; `rng` is an optional test override (§6) |
| `legalActions(state, pending): Action[] \| null` | enumerates answers when `pending.options` is finite; `null` for continuous decisions (moves) |
| `validate(state, action): Rejection \| null` | same checks `step` performs, no mutation |
| `replay(setup, seed, actions: Action[]): StepResult` | folds `step` from `createGame`; used by load, undo, multiplayer sync, tests |
| `view(state, player): PlayerView` | redacts hidden info (opponent reserves, unrevealed stratagem intent); Deciders only ever see a `PlayerView` |

Rules of the reducer:
1. `state` is immutable; `step` returns structurally new objects (Immer or hand-written spreads; no in-place mutation).
2. No I/O, no clock, no `Math.random`. All randomness through the `Rng` restored from `state.rng` (or the override).
3. One action → zero or more events → exactly one new `pending`. The engine never waits; it *describes* what it needs.
4. Every rule effect emits an event. The client and the AI rebuild everything they show or score from events + state; they never infer from diffs.

## 3. Decision model

The engine never blocks. Whenever the rules need a choice it returns a `PendingDecision`; the next `Action` must answer it (`action.decisionId === pending.id`) or be rejected with `E_WRONG_DECISION`.

```ts
interface PendingDecision {
  id: string;                 // "d:<monotonic int>" unique for the game
  player: PlayerId;           // who must answer ('A' | 'B')
  kind: DecisionKind;         // see table
  window: TimingWindowId;     // where in the sequence (§4)
  context: DecisionContext;   // unit/weapon/target ids relevant to the choice
  options?: DecisionOption[]; // finite legal choices, each with a ready-made Action
  constraints?: MoveConstraints; // continuous decisions: max distance, forbidden regions, coherency
  canPass: boolean;           // whether { type:'pass' } is a legal answer
  deadlineHint?: number;      // ms; advisory for AI/timeouts, engine ignores
}
```

| DecisionKind | Answered by | Typical payload |
|---|---|---|
| `deployUnit` | active player | unit id, model positions |
| `chooseUnitToActivate` | active | unit id or pass (movement, shooting, charge, fight) |
| `declareMove` | active | move type (normal/advance/fallBack/stationary) for the activated unit; the Advance die is rolled on accept; then window `movement.moveStarted` opens |
| `moveUnit` | active | model positions for the declared move type |
| `declareTargets` | active | per-weapon target unit ids |
| `allocateAttack` | defender | model id to take the next unsaved wound (only when a choice exists) |
| `declareCharge` | active | charging unit, target unit ids |
| `chargeMove` | active | model positions after successful roll |
| `pileIn` / `consolidate` | fighting player | model positions |
| `chooseFightUnit` | alternating | unit id |
| `stratagemWindow` | the player the window is offered to | stratagem id + targets, or pass |
| `reactionWindow` | reacting player | Fire Overwatch / Heroic Intervention / Rapid Ingress / Counter-offensive as `useStratagem` actions, or pass (10-rules R-11.5) |
| `chooseOption` | any | generic enumerated choice (side, oath target, Waaagh!, `rerollOffer` per 10-rules R-6.24, mission picks, …) |
| `commandReroll` | either | use CP reroll on the roll just made, or pass |
| `confirm` | any | acknowledge (battle-shock result, end of game) — `options` = [ok] |

Stratagem and reaction interrupt windows are ordinary `PendingDecision`s of kind `stratagemWindow`/`reactionWindow` offered to the *reacting* player. The engine opens a window only when the reacting player has ≥1 affordable, legal stratagem for that `TimingWindowId` (or a legal reaction); otherwise it skips the window and emits no decision. This keeps human play snappy and bounds AI decisions.

Window ordering when both players could act in the same window: active player first, then the opponent (a fresh `PendingDecision` each) — except the defensive windows `shooting.targetsDeclared` and `fight.targetsDeclared`, where the player whose unit was targeted goes first (10-rules R-11.5). Outside a turn (`round.*`, `battle.end`) the first-turn player goes first **[interp: replaces the R-1.3 roll-off; no conflicting simultaneous triggers exist in scope]**.

### Decider

Human UI and AI implement the same interface:

```ts
interface Decider {
  decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action>;
  cancel?(): void; // abort an in-flight decision (UI teardown, game reset)
}
```

The game loop (client `GameRunner`, or `tools/sim`) is: `pending = result.pending; action = await deciders[pending.player].decide(...); result = step(state, action, rng)`. Nothing else ever calls `step`. A rejected action is fed back to the same Decider with the `Rejection` attached to the next call (`view.lastRejection`).

## 4. Timing windows

Shared enum used by engine (to open windows), data (stratagem `window`), AI and UI. Prefix = phase.

| TimingWindowId | Opened for | Notes |
|---|---|---|
| `deployment.unit` | active | per unit placement |
| `round.start` | first-turn player, then second | before either turn: Waaagh! call, Stomp 'Em pick, Bag the Big 'Un pick (round 1), Archeotech marker selection (rounds 3–5); `ScoringRule.when` may use it |
| `command.start` | active, then opponent | before CP gain |
| `command.battleShock` | active | before tests are taken |
| `command.end` | active, then opponent | after battle-shock; primary/secondary scoring and end-of-command stratagems |
| `movement.start` | active, then opponent | |
| `movement.moveStarted` | opponent | after `declareMove` (type chosen, Advance rolled), before placements: Fire Overwatch "starts a move" |
| `movement.unitMoved` | active, then opponent | after each unit's move; opponent: Fire Overwatch "ends a move" |
| `movement.reinforcements` | active, then opponent | after each reserves arrival; opponent: Fire Overwatch "set up" |
| `movement.end` | active, then opponent | |
| `shooting.start` | active, then opponent | |
| `shooting.targetsDeclared` | opponent, then active | after targets declared, before hits are rolled (defensive stratagems) |
| `shooting.attacksResolved` | active, then opponent | after one unit finished shooting |
| `charge.start` | active, then opponent | |
| `charge.declared` | opponent | after targets declared, before the roll; no core or patrol stratagem uses it (kept for data) |
| `charge.rolled` | active | after 2D6, before move (rerolls) |
| `charge.moveStarted` | opponent | after a successful roll, before the charge move: Fire Overwatch; afterwards R-8.4 feasibility is re-checked and the charge may fail |
| `charge.moveEnded` | opponent, then active | Heroic Intervention (opponent, `reactionWindow`); Tank Shock (active, `stratagemWindow`) |
| `fight.start` | active, then opponent | |
| `fight.unitSelected` | owner of unit, then opponent | before pile-in |
| `fight.targetsDeclared` | opponent of the fighting unit, then owner | after melee targets declared (FightSubStep `declareTargets`), before attacks: Gene-wrought Resilience, Tough as Squig-hide |
| `fight.attacksResolved` | owner, then opponent | after consolidation; Counter-offensive (opponent, `reactionWindow`) |
| `any.unitDestroyed` | owner of destroyed unit, then opponent | |
| `any.rollMade` | roller | command re-roll window; only opened when CP ≥ 1 |
| `phase.end` | active, then opponent | end of every phase (both turns); used by scoring rules, rarely by stratagems |
| `turn.end` | active, then opponent | after the Fight phase and the coherency cull |
| `round.end` | first-turn player, then second | after the second turn's `turn.end`; Stomp 'Em scoring; `untilEndOfRound` effects expire after it |
| `battle.end` | first-turn player, then second | after round 5's `round.end` (or immediately when tabled): end-of-battle VP (Archeotech, Sweeping Raid, Bag the Big 'Un); then `GameEnded` |

## 5. Actions and events

Action envelope: `{ type, player, decisionId, seq, payload }`. `seq` is assigned by the engine on accept (= index in the action log). Payload types are per `type`; full list in `src/engine/types.ts`; the set of `type` strings equals the DecisionKind answers plus `pass`, `useStratagem`, `commandReroll`, `resign`. `declareTargets.targets[]` may repeat a (model, weapon) pair with `attacks` to split one melee weapon between units (R-9.7).

Event families (all events carry `seq`, `turn`, `phase`, `player`):

| Family | Events |
|---|---|
| game | `GameCreated`, `RoundStarted`, `RoundEnded`, `TurnStarted`, `PhaseStarted`, `PhaseEnded`, `GameEnded` |
| command | `CpChanged`, `BattleShockTested`, `BattleShocked`, `BattleShockRecovered` |
| movement | `MoveDeclared` (moveType), `UnitMoved` (moveType, path per model), `UnitAdvanced` (roll), `UnitFellBack`, `ReinforcementsArrived` |
| shooting/fight | `AttackSequenceStarted`, `TargetsDeclared`, `HitRolled`, `WoundRolled`, `SaveRolled`, `DamageApplied`, `FeelNoPainRolled`, `ModelDestroyed`, `UnitDestroyed` (both carry `byUnitId` **and** `byModelId`; null for mortal wounds / Deadly Demise / culls — Wrath of the Emperor and Bag the Big 'Un key on the model), `AttackSequenceEnded` |
| charge | `ChargeDeclared`, `ChargeRolled`, `ChargeFailed`, `ChargeMoved`, `PiledIn`, `Consolidated` |
| stratagem | `StratagemUsed`, `StratagemWindowOpened`, `StratagemWindowClosed`, `AbilityTriggered` (id, source, effect summary) |
| dice | `DiceRolled` { purpose, dice: number[], modifiers, final } — one per physical roll, always emitted even when also covered by a family event |
| objectives | `ObjectiveControlChanged`, `VpScored` (source, amount) |
| meta | `ActionRejected` { code, reason }, `DecisionRequested` { pending } |

Events are the only channel to the UI (zustand store subscribes) and the dice log. Events are serialisable JSON.

## 6. Determinism, log, replay, save

| Concern | Rule |
|---|---|
| RNG | `Rng { next(): number /* [0,1) */; roll(sides: 3\|6): number; serialize(): string }`. Reference impl: xoshiro128** seeded from `sha256(seedString)`. **`state.rng` is authoritative**: `step` calls `restoreRng(state.rng)`, uses it, and writes `serialize()` back, so `step` is a pure function of (state, action) and a game is replayable from the action log alone. The optional `rng` parameter is a test override; its `serialize()` output is written back the same way (`ScriptedRng` serialises its remaining queue as `scripted:<dice>`). |
| Roll logging | every call to `rng.roll` inside `step` produces a `DiceRolled` event with `purpose` (e.g. `hit`, `wound`, `save`, `charge`, `advance`, `battleShock`, `damage`, `fnp`, `firstTurn`). |
| Action log | `state.log: Action[]` append-only (seq order). `state.hash` = fnv1a of canonical JSON of state minus `log`, recomputed per step (cheap, used by replay/multiplayer asserts). |
| Replay | `replay(setup, seed, log)` must reproduce `state.hash` at every seq. CI runs this on every recorded sim game. |
| Save | `SaveFile { version: 1, engineVersion, setup, seed, actions, finalHash }`. Load = replay (a save made with a `ScriptedRng` override replays only with the same override). Optional `snapshot` for fast resume; a mismatch between snapshot hash and replay hash is a hard error. |
| Undo (hotseat) | replay to `seq - 1`. Vs AI: undo allowed only for actions that emitted no `DiceRolled` event (prevents re-rolling by undo). |
| Versioning | `engineVersion` semver; a save with a different major is refused. Data files carry `dataVersion`; the hash includes it. |

## 7. Space and models

| Item | Definition |
|---|---|
| Unit of length | 1.0 = 1 inch, everywhere (engine, data, client). Millimetre base sizes are converted once at data load (`mm / 25.4`). |
| Axes | Y up. Board plane is XZ. Right-handed (Three.js convention). |
| Board | 44 × 30: x ∈ [−22, 22] (long edge), z ∈ [−15, 15]. Origin at centre. Player A's long table edge is z = −15, B's is z = +15 unless the mission says otherwise. |
| Facing | radians around Y; cosmetic only (no facing rules in 10th). |
| Model | `{ id, unitId, datasheetModelId, pos: {x,y,z}, facing, base: { shape:'round'\|'oval', radius, radius2? }, height, woundsRemaining, flags }`. `pos` is the base centre at ground contact; `y` = terrain surface height under the base. |
| Base-to-base distance | horizontal gap `h = max(0, dist2D(a,b) − ra − rb)` (oval: ellipse gap approximated by sampled edge points), vertical gap `v = |ya − yb|`; reported distance = `sqrt(h² + v²)`. Engagement range test uses `h ≤ 1 && v ≤ 5` (10-rules defines). |
| Sample points for LoS | base centre at heights {0.2, height/2, height} plus 4 base-edge points at height/2; details in 11-rules. |
| Terrain | polygons in XZ with height; ruins have wall segments (thin boxes) used by raycasts. |
| Precision | positions rounded to 1/1000 inch on write to keep hashes stable across platforms. |

## 8. Error handling

`step` never throws on bad input from a Decider. Illegal → `rejection: { code, reason, details? }`, `state` is the same object, `pending` unchanged, `events = [ActionRejected]`.

| Code | Meaning |
|---|---|
| `E_WRONG_DECISION` | `decisionId` does not match `pending.id` |
| `E_WRONG_PLAYER` | action.player ≠ pending.player |
| `E_NOT_AN_OPTION` | finite decision, answer not in `options` |
| `E_OUT_OF_RANGE` | move/charge/pile-in exceeds allowed distance |
| `E_COHERENCY` | unit would end out of coherency |
| `E_OVERLAP` | base overlaps model or impassable terrain |
| `E_ENGAGEMENT` | ends within engagement range illegally, or leaves it illegally |
| `E_NO_LOS` / `E_NOT_IN_RANGE` | target not visible / not in range |
| `E_INVALID_TARGET` | target keyword/ownership/eligibility fails |
| `E_INSUFFICIENT_CP` | stratagem cost |
| `E_STRATAGEM_USED` | once-per-phase/turn/battle limit |
| `E_PASS_NOT_ALLOWED` | `canPass` false |
| `E_GAME_OVER` | phase is `ended` |
| `E_SCHEMA` | payload shape wrong (validated with the JSON schema in 20) |

Programmer errors (corrupt state, missing datasheet) throw `EngineInvariantError`; the sim treats these as test failures.

## 9. Performance budgets

| Target | Budget |
|---|---|
| `step` (no LoS) | p50 < 0.5 ms, p99 < 3 ms (node, M1) |
| `step` with LoS raycasts (declare targets) | < 10 ms for 20 vs 20 models |
| `legalActions` | < 5 ms |
| headless sim | ≥ 5 full games/s single-threaded, ≥ 100 games in CI < 60 s |
| AI tier 1 decision | p50 < 50 ms, p99 < 300 ms; Monte Carlo decisions ≤ 1.5 s (in a worker, cancellable) |
| client | 60 fps on an M1 laptop with 40 models + terrain; ≤ 150 draw calls; ≤ 1.0 M triangles on screen |
| bundle | ≤ 2.5 MB gzip JS (excl. glTF); first interactive < 3 s on Pages |
| memory | `GameState` JSON < 200 KB; event log for a full game < 5 MB |

## 10. Settled items

- LoS sample point set and ruins "wholly within": 10-rules §3.
- `reactionWindow` vs `stratagemWindow` and window ordering: 10-rules R-11.5.
