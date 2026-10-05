# Spike: can a 1000-pt Incursion game run in the browser?

Measurement only. Nothing here is a feature; all code lives in `src/spike/`, `tools/spike-incursion.ts`
and `tests/e2e/spike-incursion.spec.ts`. Engine contracts and data files were not changed.

## Method
- **Incursion scale** (`src/spike/incursion.ts`): both rosters doubled (every unit copied with a `-ii` ref;
  the copy's leader attaches to the copy's bodyguard; enhancements stay on the originals), mission cp-01 cloned
  onto a 44"x60" board (zones and objectives stretched 2x in depth), cp-01 terrain copied twice (-15" / +15").
- **Headless** (`npm run spike:incursion`): 7 seeded games per scale, one per faction as seat A, UtilityDecider
  on both seats. A game is capped at 60 s wall-clock and then counted as unfinished.
- **Render** (`?spike=cp` / `?spike=incursion`, then `npx playwright test spike-incursion`): bot vs bot through
  deployment, then frozen. The render loop is forced to `always` in spike mode so frames are really drawn.
  Two views, 10 s each: default camera and a wide camera (distance 110"). Headless Chromium on SwiftShader
  (CPU), 1280x720, so absolute FPS is meaningless; read the ratios and the counts.

## Results
| | Combat Patrol | Incursion |
|---|---|---|
| Models per side, mean / max | 23.2 / 28 | 47.1 / 60 |
| Decisions per game (finished games) | 514 | 634 |
| AI decision ms, mean / p95 / max | 3.9 / 22.9 / 84 | 21.7 / 118.6 / 421 |
| Engine (non-AI) ms per game | 11,300 | 12,700 |
| AI ms per game | 2,000 | 13,700 |
| Wall clock per game, mean / max | 13.3 s / 27 s | 26.4 s / 43 s |
| Rejections | 0 | 0 |
| Games finished | 5 of 7 | 7 of 7 |
| Draw calls, default / wide view | 162 / 165 | 222 / 399 |
| Triangles, default / wide view | 606k / 616k | 890k / 1.20M |
| Geometries / textures (default) | 117 / 33 | 137 / 27 |
| Models on board at sampling | 37 | 74 |
| FPS (SwiftShader), default / wide | 2.4 / 2.1 | 2.0 / 1.5 |
| JS heap, MB | 46-59 | 47-48 |
| Long tasks (>50 ms) in 10 s | 0 | 0 default; 1 (2.1 s) wide |

Caveats: two CP games (game indices 5 and 6) hit the 60 s cap after ~3,700 decisions
without finishing, so CP columns use the five finished games. The same pairings finished at Incursion scale.
This looks like an existing AI/engine stall, not something this spike introduced; it was not investigated.
Model counts are at game creation (headless) and on-board after deployment (render).

## Hotspots observed
1. **AI decision time scales worse than model count.** 2x models gave 5.6x mean and 5x p95 decision time;
   the worst single decision was 421 ms, which blocks the main thread if the AI runs there. A whole game of AI
   thinking is ~14 s vs ~2 s. Engine time per game was roughly flat. Still unmeasured: how much of the AI cost is
   line-of-sight/geometry (not instrumented).
2. **Triangles, not draw calls, dominate.** Even Combat Patrol draws ~600k triangles with 37 models plus terrain;
   Incursion adds ~50-95% depending on view. In the wide view draw calls rise 2.4x (165 to 399) because frustum
   culling stops helping; with about 2 calls per model plus per-ruin meshes that is the per-figure cost.
3. **Frame cost on software GL is fill/vertex bound, and one wide-view frame stall appeared** (one 2 s long
   task). On real GPUs triangle count is far less of a problem; the open question is low-end integrated GPUs.

## What instancing / merging would likely save (estimates, not measured)
- Draw calls: identical figure parts (same base, same body mesh per faction) could go through `InstancedMesh`;
  at ~2 calls per model that bounds the wide-view 399 calls to a few dozen. Terrain copies share geometry already.
- Triangles: instancing does not reduce them; only LOD for distant figures would.
- Memory: geometry and texture counts grew by 20 geometries only, so memory is not the constraint.
- AI cost is separate from rendering; it needs a Web Worker or a cheaper candidate cull, not instancing.
