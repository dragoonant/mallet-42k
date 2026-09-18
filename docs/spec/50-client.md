# 50 — Client

React + R3F. The client never mutates `GameState`; it dispatches `Action`s through `GameRunner`, which
calls `engine.step` and pushes events into the store. Rendering derives from the store only.

## 1. Modules

```
src/client/
  runner/GameRunner.ts   owns state, deciders, rng; the only caller of engine.step; exposes dispatch(), undo(), save(), load()
  store/                 zustand: game slice (state, events, pending), ui slice, settings slice
  scene/                 R3F components: Board, Terrain, Units, Model, Rings, Rulers, LosLines, Camera, Effects
  ui/                    panels (§5), prompts (§6)
  interaction/           per-phase controllers (§3), picking, drag, keyboard
  testing/               window.__mallet test API (§7)
```

`GameRunner` loop: `pending` → if `pending.player` is human, UI controller answers; else `AiDecider` (worker) answers. Human Decider = a promise resolved by the interaction layer.

## 2. Scene graph and state binding

```
<Canvas>
  <Camera/> <Lights/> <Environment/>
  <Board/>                       44×30 plane, grid overlay (toggle), deployment zones, objective markers (+ control state colour)
  <Terrain/>                     pieces from terrain layout; ruins with walls/floors; instanced crates
  <Units>                        one <Unit> per unit in state; <Model> per model → Figure (30-figures)
    <Model> = figure group + <SelectionRing/> <TargetRing/> <EngagementDisc/> <WoundPips/>
  <Overlays>                     <MoveRangePreview/> <Ruler/> <LosLines/> <ChargePathPreview/> <CoherencyLinks/>
  <Effects>                      muzzle flashes, impacts, dice (later)
```

Store shape (zustand, immutable updates):

| Slice | Contents |
|---|---|
| `game` | `state: GameState`, `view: PlayerView` (for the human seat), `pending`, `events: GameEvent[]` (ring buffer 2 000), `log: Action[]`, `seed`, `hash` |
| `anim` | queue of visual events derived from `GameEvent`s (moves to interpolate, attacks to play); the scene consumes and clears |
| `ui` | `selectedUnitId`, `hoveredUnitId`, `tool: none|measure|los`, `phaseController`, `draft` (positions being edited), `panelOpen`, `cameraPreset` |
| `settings` | quality, camera speed, show grid, animation speed, seat (A/B/hotseat), difficulty |

Binding rules: `Model` positions come from `state` except while a `draft` move exists for that unit (then draft positions) or an `anim` move is in progress (interpolated). Every `GameEvent` is mapped once in `events→anim` (e.g. `UnitMoved` → path anim per model; `ModelDestroyed` → `death` clip; `HitRolled`/`WoundRolled`/`SaveRolled` → dice log rows). Wounds shown from `state` (never from anim).

## 3. Interaction model per phase

Common: click a friendly unit → select (all its models highlighted); click enemy → inspect card; right-drag orbit; scroll zoom; `Esc` cancels draft; `Enter`/Space confirms; hover shows unit tooltip. Measure tool (`M`) and LoS tool (`L`) available in all phases.

| Phase / decision | Controller | Preview + legality | Confirm produces |
|---|---|---|---|
| Deployment `deployUnit` | drag unit ghost into zone; models placed as a formation (line/blob presets, rotate with Q/E) | zone highlight; red when outside zone or overlapping; coherency links | `deployUnit` |
| Movement `chooseUnitToActivate` | click unit; buttons Normal / Advance / Fall Back / Remain Stationary | | `moveUnit` or `pass` |
| Movement `moveUnit` | drag the unit's anchor; models follow formation; per-model drag for fine placement; path shown along terrain | move-range disc (M or M+advance roll after rolling), engagement-range red discs around enemies, terrain traversal cost, coherency links green/red, legality from `engine.validate` on each drag frame (throttled 30 Hz) — illegal = red ghost + reason tooltip | `moveUnit` |
| Shooting `declareTargets` | select shooter; weapon list; click enemy unit to assign selected weapon (Shift-click assigns all weapons); LoS lines drawn from models | targets in range and visible highlighted; out-of-range dimmed; expected damage hint from `ai/damage` (togglable) | `declareTargets` |
| Allocation `allocateAttack` | click a model in the target unit | eligible models pulse | `allocateAttack` |
| Charge `declareCharge` | select unit; click one or more enemies; needed distance shown | 12" reach ring; probability hint | `declareCharge` |
| Charge `chargeMove` | as moveUnit with remaining charge distance; must end in engagement | ghost turns green when engagement with all targets reached | `chargeMove` |
| Fight `chooseFightUnit` | click eligible unit | eligible units pulse | `chooseFightUnit` |
| Fight `pileIn` / `consolidate` | per-model drag within 3"; "auto" button uses the AI's pile-in | must end closer to nearest enemy | `pileIn` / `consolidate` |
| Any `stratagemWindow` / `reactionWindow` | prompt (§6) | shows only stratagems returned in `pending.options` | `useStratagem` / `pass` |
| Any `commandReroll` | prompt with the roll | | `commandReroll` / `pass` |

Measure tool: click A then B (points or models); shows base-to-base horizontal and 3D distance; sticky measurements until cleared.
LoS visualiser: select a model, hover enemy model → sample-point rays green/red; summary "visible / not visible / fully visible / benefit of cover".

## 4. Rings and discs (all client meshes, world units)

| Element | Geometry | Colour |
|---|---|---|
| selection ring | torus at base radius + 0.05 | accent |
| target ring | ring at base radius + 0.1, dashed | red |
| engagement disc | disc radius `base + 1` around enemy models while moving/charging | red 25 % |
| move-range disc | disc radius `M` (+advance) around unit anchor, clipped by impassable terrain | blue 20 % |
| objective control | ring radius 3 + marker; owner colour | A/B colour |
| coherency link | line between models ≤ 2" apart | green / red when broken |

## 5. UI panels

| Panel | Location | Content |
|---|---|---|
| Phase tracker | top | round, turn owner, phase chips (current highlighted), "End phase" button (only when `canPass`) |
| HUD | top corners | CP, VP per player, objectives held, seed/hash (debug) |
| Unit card | left | selected/hovered unit: stats, weapons (select for shooting), abilities (own-words text), wounds, status flags (battle-shocked, advanced, fell back, in engagement) |
| Dice log | right, collapsible | rows from `DiceRolled`/`HitRolled`/… with purpose, dice faces, modifiers, result; filter by phase; click a row → highlights the attacker/target |
| Action log | right tab | actions with seq; click to jump camera; undo button (hotseat / no-dice actions) |
| Stratagem tray | bottom | usable stratagems for the current window, cost, greyed when unaffordable |
| Phase banner | centre, upper third | the phase/turn the director is announcing, the round and whose turn it is, a "click anywhere to continue" hint and a countdown bar. Shown only while a narration pause is running (§5.1) |
| Decision prompt | centre-bottom | §6 |
| End screen | modal | VP breakdown per scoring rule, kills, save replay button |
| Setup | pre-game modal | mission, terrain layout, faction/patrol per side, seat (human A/B/hotseat/AI vs AI), difficulty, seed |

### 5.1 Narration pauses

Each phase the director narrates (one voice line per phase per round) and each "your turn" hand-over
holds the presentation queue for a beat before the events after it play: 2.4s for a phase, 1.6s for a
turn, scaled ×0.35 at `fast` and dropped entirely at `instant`. Without it a phase in which nothing
happens starts and ends inside a few hundred ms, so its voice line plays over the next one's and the
player never sees which phase went by.

The pause is deliberate dead time, not a stall: the bot loop's presentation idle-wait extends past its
own cap while one is on screen, and the store's no-progress watchdog holds its stall clock, so neither
acts over the top of the banner. Any click or key anywhere ends the pause early (it never swallows the
input that ended it), and it is always bounded by its own timer.

## 6. Decision prompts

`pending` drives a single `<DecisionPrompt>` component that switches on `kind`:

| kind | Prompt |
|---|---|
| `stratagemWindow` | title from `window`, list of `options` (stratagem name, cost, one-line own-words effect, target picker when needed), Pass |
| `reactionWindow` | "Enemy unit X is starting a charge move — Overwatch with …?" (or Heroic Intervention / Rapid Ingress / Counter-offensive wording per `context.reaction`) list + Pass |
| `commandReroll` | shows dice faces, "Re-roll for 1 CP" / Keep |
| `chooseOption` | generic radio list from `options` |
| `confirm` | message + OK (battle-shock result, unit destroyed, game end) |
| others | inline in the 3D scene via the controllers; prompt shows a one-line instruction ("Move Intercessors: 6\" — drag the unit") and Confirm/Cancel/Pass |

AI turns: prompt shows "Opponent is thinking…" with a progress dot; AI actions play at animation speed; a "skip animations" toggle fast-forwards.

## 7. Camera

Orbit camera (`OrbitControls`-like, custom): target on board plane, distance 8–60, polar 15°–80°, pan with WASD/middle-drag, clamp target inside board ± 6. Presets: `overview` (default, from player's edge), `topDown`, `focus(unit)` (smooth dolly to unit, 12" distance). Auto-focus on the acting unit during AI turns and on charge/fight resolution (toggle). Camera never blocks input; all transitions ≤ 600 ms and interruptible.

## 8. E2E hooks

`data-testid` convention: `<area>-<element>[-<id>]`, kebab-case.

| Test id | Element |
|---|---|
| `phase-tracker`, `phase-chip-<phase>`, `btn-end-phase` | phase UI |
| `hud-cp-<A|B>`, `hud-vp-<A|B>`, `hud-round` | HUD |
| `unit-card`, `unit-card-weapon-<weaponId>`, `unit-card-ability-<id>` | unit card |
| `dice-log`, `dice-row-<seq>` | dice log |
| `prompt`, `prompt-option-<id>`, `btn-confirm`, `btn-cancel`, `btn-pass` | decision prompt |
| `strat-<stratagemId>` | stratagem tray button |
| `setup-mission`, `setup-patrol-<A|B>`, `setup-seed`, `btn-start` | setup modal |
| `end-screen`, `end-vp-<A|B>` | end screen |
| `phase-banner` | narration-pause banner; carries `data-announcement-id` (per announcement) and `data-announcement-duration` (its length in ms) so a test can time a pause across back-to-back announcements, which reuse the element |
| `model-<modelId>` | invisible DOM proxy per model (position in board inches as `data-x`/`data-z`) for asserting positions without WebGL picking |

Test API on `window.__mallet` (enabled when `?test=1` or `import.meta.env.MODE === 'test'`):
`{ getState(), getPending(), dispatch(action), autoAnswer(kind, strategy), setSeed(seed), skipAnimations(true), loadSave(json), aiStep() }`.
Playwright drives the game through the UI for the scripted scenario (60-testing §3) and uses `dispatch`/`autoAnswer` only to fast-forward uninteresting decisions.

## 9. Performance rules

Selectors are memoised per unit (`useUnit(id)`), models re-render only when their unit's slice changes; the scene reads animations from refs not React state; `events` ring buffer capped; heavy work (AI, Monte Carlo, replay validation) in a worker; LoS visualiser rays computed via the engine's LoS function on the main thread but throttled to 20 Hz.
