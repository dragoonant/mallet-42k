# Mallet 42k — Development Plan

Fan game: 3D Warhammer 40k (10th edition rules, 1:1 mechanics) with Super Deformed (SD) figures.
Player vs AI first, multiplayer later. Hosted on GitHub Pages.

## Decisions
| Topic | Decision |
|---|---|
| Rules | 10th edition, mechanics ported 1:1 (rules/datasheet text written in our own words) |
| Factions | Space Marines vs Orks |
| First target | Combat Patrol (fixed small forces), scale to 1000/2000 pts later |
| Models | Phase A: procedural SD figures in code. Phase B: AI-generated (Meshy/Tripo API) + Blender cleanup, glTF |
| Stack | Vite + TypeScript + React Three Fiber (Three.js), Vitest, GitHub Actions → Pages |
| Opponent | AI first; multiplayer via action-log sync later |

## Architecture
```
/engine   pure TS rules engine: (GameState, Action) -> GameState; seeded RNG; action log
/ai       consumes GameState, emits Actions via same API as a human
/data     factions, datasheets, weapons, stratagems, missions (JSON)
/client   R3F renderer + UI; never mutates state directly
/assets   figures: procedural kits now, glTF later (same part/slot interface)
/tools    asset pipeline scripts (Meshy/Tripo generation, glTF optimization)
```
Principles: engine is headless and unit-tested; deterministic RNG + action log enables
replays, undo, bug repro and later lockstep multiplayer; AI is just another player.

## Rules engine scope
- Measurement: 3D inches, base-to-base; engagement range 1" horizontal / 5" vertical; coherency
- Line of sight: raycasts model-to-model sample points; visible / fully visible; Benefit of Cover; ruins rules
- Phases: Command (CP, Battle-shock) → Movement (normal, advance, fall back, reserves) →
  Shooting (hit → wound → save → damage, weapon abilities) → Charge → Fight (fights first, pile in, consolidate)
- Weapon/unit abilities as hooks: onHitRoll, onWoundRoll, onSave, onDamage, etc.
- Stratagems: event bus with interrupt windows (human or AI can respond)
- Missions: deployment maps, objectives, OC control, primary/secondary scoring

## SD figure system
- Proportions ~2.5 heads; skeletons per archetype: Infantry, Heavy, Monster, Vehicle
- Modular slots: head, torso, backpack, L arm/weapon, R arm/weapon, pauldrons, base
- Paint via shader masks (primary / secondary / trim / decal) → one mesh, many schemes
- Shared animations per skeleton: idle, walk, shoot, melee, hit, death
- Phase A (procedural): figures assembled from sculpted primitives in Three.js, same slot interface
- Phase B (generated): Meshy/Tripo image-to-3D per part or per figure → auto-rig → Blender cleanup →
  glTF + Draco/meshopt compression → drop-in replacement for procedural parts

## AI opponent
1. Utility AI per phase (expected damage math, objective value, threat, cover)
2. Role-based planning (hold / screen / strike), multi-phase lookahead
3. Monte Carlo sampling for high-variance decisions (charges, stratagems)
Difficulty = scoring noise + lookahead depth.

## Milestones
| # | Milestone | Exit criteria |
|---|---|---|
| M0 | Skeleton | Vite+TS+R3F app deploys to GitHub Pages via Actions |
| M1 | Engine core | Units, measurement, seeded dice, full shooting sequence, unit tests |
| M2 | Battlefield | 44"×30" Combat Patrol board, ruins, camera, selection, measure tool, LoS visualization |
| M3 | Procedural SD kit | Marine + Ork boy figures, slot system, shader paint, basic animation |
| M4 | Turn loop | All 5 phases playable hotseat, Combat Patrol forces |
| M5 | AI tier 1 | Complete game vs AI |
| M6 | Missions & stratagems | Scoring, CP, core stratagems, end-of-game screen |
| M7 | Generated models | Meshy/Tripo pipeline, replace procedural figures |
| M8 | Content & polish | Full Combat Patrol rosters, VFX, audio, dice animation |
| M9 | Scale up | 1000/2000 pt army builder, more factions |
| Later | Multiplayer | Action-log sync (WebRTC or small relay) |

---

# Build strategy — M0→M5 on a token budget (Fable main loop)

## Principles
1. **Fable decides, Sonnet types, tests judge.** The main loop only writes contracts and workflow
   scripts, reads structured results, and checks in. Implementation and data-entry agents run on
   Sonnet. Fable-tier agents are reserved for spec authoring and adversarial verification.
2. **Specs on disk, not in context.** `docs/spec/*.md` + `src/engine/types.ts` are written once.
   Every agent prompt is "read spec X, build Y, make its tests pass" — ~100 tokens, nothing pasted.
3. **Interfaces frozen before fan-out.** GameState / Action / ability-hook / event contracts are
   fixed in W0 so parallel agents never produce incompatible pieces (the #1 rework sink).
4. **Tests are the reviewer.** `vitest` + `tsc` + headless full-game sim (`npm run sim`) +
   Playwright E2E. Verify agents read test output and diffs and return a JSON verdict. No whole
   files are ever read into the main loop.
5. **Structured outputs.** Every agent returns a schema-validated object ≤300 tokens.
6. **One workflow per milestone, resumable.** A failure resumes from the cached prefix; passed
   work never reruns. Agent count per workflow is capped (~14).
7. **`STATUS.md` maintained by agents.** Later agents orient from one file, no codebase exploring.
8. **Cheap visibility.** Playwright screenshots sent to you at each milestone. Only one stop for
   approval: the M3 figure look (art rework later is the most expensive kind).

## Workflow sequence
| W | Scope | Agents | Est. tokens |
|---|---|---|---|
| W0 | Repo wiring, Vite/TS/R3F/Vitest/Playwright, Actions→Pages, contracts + specs + JSON schemas | 1–2 | 0.3M |
| W1 | Rules engine: 7 modules × (implement → adversarial verify → fix) + headless sim | ~14 | 2.5M |
| W2 | Combat Patrol data: SM + Ork datasheets, weapons, abilities, 6 stratagems + 3 enhancements each, CP missions | ~6 | 0.8M |
| W3 | Client: board/terrain, camera, procedural SD kit, state→scene binding, interaction, UI, hotseat | ~12 | 2.5M |
| W4 | AI: expected-damage math, per-phase utility deciders, role planner, Monte Carlo charges, difficulty, tuning harness | ~6 | 1.2M |
| W5 | QA: sim fuzz + E2E playthrough + rules-fidelity audit, loop-until-dry (max 2 dry rounds), final deploy | ~10 | 1.5M |
| — | Main-loop overhead | | 0.5M |

**Total ≈ 9M (range 7–12M).** W2 and W3 run concurrently. Fallback if the budget runs short:
ship AI tier 1 only and defer tiers 2–3.

## W1 engine modules (each: implement → verify vs spec → fix)
A. core — seeded RNG, dice (D3/D6/2D6, re-rolls, ±1 modifier cap), state, action reducer, action log, replay
B. terrain, LoS (raycast model→model), visibility, Benefit of Cover, ruins rules
C. command phase, battle-shock, movement (normal / advance / fall back / stationary / reserves / deep strike), terrain traversal
D. shooting sequence + weapon abilities (Assault, Heavy, Rapid Fire, Torrent, Blast, Sustained/Lethal Hits,
   Devastating Wounds, Anti-X, Twin-linked, Lance, Melta, Ignores Cover, Indirect Fire, Pistol, Hazardous,
   Precision, Extra Attacks, One Shot), invuln, Feel No Pain
E. charge (2D6, engagement, Overwatch and Heroic Intervention windows) + fight (Fights First, alternating
   activations, pile in 3", consolidate 3")
F. ability-hook system, stratagem interrupt windows, CP economy, missions (deployment, objectives, OC,
   primary scoring, 5 rounds, game end / victory)
G. headless simulator — random-legal-move bot, N games, invariant checks (no NaN, wounds ≥ 0, games end)

## W3 client modules
1. Board 44"×30", SD-style ruins/crates, lighting, orbit camera, picking
2. Procedural SD figure kit: skeleton + slots, Marine + Ork parts, weapons, shader paint scheme,
   procedural animation (idle / walk / shoot / melee / death)
3. State→scene binding with instancing
4. Interaction: select, move with range preview + legality, measure tool, LoS visualizer, target picking
5. UI: phase tracker, unit card, dice log, CP/VP HUD, stratagem prompt, battle-shock prompts, end screen
6. Hotseat flow (validates the full loop before the AI is dropped in)

## Definition of done for M5
A human can play a complete Combat Patrol game (all phases, stratagems, battle-shock, scoring) vs the AI
in the browser on GitHub Pages; the headless sim plays 100 games with zero invariant failures; the AI beats
the random bot ≥95% of the time.
