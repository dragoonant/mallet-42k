# 30 — SD figure kit

Rendering-only. Nothing here affects rules; the engine sees only `base` and `height` (00-architecture §7).
Code lives in `src/assets/` (kits, parts, materials, animation) and is consumed by `src/client/` only.

## 1. Style and scale

| Item | Value |
|---|---|
| Proportion | ~2.5 heads tall; head ≈ 40% of height, torso 30%, legs 30%; hands and weapons oversized ×1.4 |
| World scale | 1 unit = 1 inch. Infantry figure height `H = 1.1` (head top to sole, not counting base) |
| Base | Rules-true diameter (§7); base disc thickness 0.12, figure stands on top |
| Heavy infantry | H = 1.3 (Terminator, Nob, Mega-armour) |
| Monster | H = 2.2 – 3.5 (by datasheet `figure.scale`) |
| Vehicle | Footprint matches real model footprint ×0.9; height compressed to 60 % of true proportion |
| Silhouette | Chunky, rounded primitives, no thin parts < 0.03 (aliasing at distance) |
| Poly budget (LOD0) | infantry ≤ 3 000 tris, heavy ≤ 4 000, monster ≤ 8 000, vehicle ≤ 8 000, weapon ≤ 400 |

Segment lengths as a fraction of H (infantry): head 0.40, neck 0.02, torso 0.30, hips 0.05, thigh 0.12, shin 0.11, foot 0.03 (overlaps); upper arm 0.14, forearm 0.12, hand 0.08; shoulder width 0.45 H.

## 2. Skeleton archetypes

Bone names are fixed strings; procedural (Phase A) and glTF (Phase B) rigs must use them exactly. `root` sits at the base centre on the ground plane; +Z is forward, +Y up.

| Archetype | Bones (parent → child) |
|---|---|
| `infantry` | `root` → `hips` → `spine` → `chest` → `neck` → `head`; `chest` → `shoulder.L` → `upperArm.L` → `forearm.L` → `hand.L` (mirror `.R`); `hips` → `thigh.L` → `shin.L` → `foot.L` (mirror `.R`); `chest` → `backpackMount` |
| `heavy` | `infantry` + `chest` → `shoulderMount.L`/`.R` (shoulder-mounted weapons), `hips` → `cape` (optional) |
| `monster` | `root` → `hips` → `spine1` → `spine2` → `chest` → `neck` → `head` → `jaw`; arms/legs as infantry; `hips` → `tail1` → `tail2` → `tail3` (optional) |
| `vehicle` | `root` → `hull` → `turret` → `gunMount`; `hull` → `sponson.L`/`.R`; `hull` → `track.L`/`.R` (or `wheel.FL/FR/RL/RR`); `hull` → `hatch` |

Bone rest pose: A-pose for bipeds (arms 30° down), all rotations identity, bind at scale 1. Animation authored against the rest pose of `infantry`; `heavy` reuses the infantry clips retargeted by bone name.

## 3. Slots

A figure = skeleton + one part per filled slot. Every slot has a socket (bone + local offset) defined by the kit, not by the part.

| Slot | Parent bone | Required | Notes |
|---|---|---|---|
| `base` | `root` | yes | disc sized from datasheet base; `base` part also carries the selection ring |
| `torso` | `chest` | yes | includes hips/legs mesh for infantry (legs are not separate parts in Phase A) |
| `head` | `head` | yes | |
| `backpack` | `backpackMount` | no | |
| `armL` / `armR` | `shoulder.L` / `.R` | yes | arm mesh incl. hand; skinned to upperArm/forearm/hand |
| `weaponL` / `weaponR` | `hand.L` / `hand.R` | no | from `weapon.figure.part`; two-handed weapons fill `weaponR` and set `armL` to the `.grip` pose |
| `pauldronL` / `pauldronR` | `upperArm.L` / `.R` | no | |
| `shoulderMountL` / `shoulderMountR` | `shoulderMount.L` / `.R` | no | heavy only |
| `hull`, `turret`, `sponsonL`, `sponsonR` | vehicle bones | vehicle | |

```ts
interface Part {
  id: string;                     // e.g. "sm.head.sergeant", "sm.weapon.bolt-rifle"
  slot: Slot;
  archetypes: Archetype[];        // where it may be mounted
  build(ctx: PartBuildCtx): PartMesh;   // procedural: returns geometry+skin; glTF: loads and returns the same shape
  masks: MaskUsage;               // which paint channels the part uses (for material batching)
  sockets?: Record<string, Transform>; // extra attach points a part exposes (e.g. weapon muzzle for VFX)
}
interface PartMesh { geometry: BufferGeometry; skinIndex?: ...; skinWeight?: ...; lods: BufferGeometry[]; }
```

`Kit` = `{ id, archetype, sockets: Record<Slot, {bone, offset, rotation, scale}>, defaults: Record<Slot, PartId> }`.
`assembleFigure(kit, parts, scheme) → Figure { group, skeleton, mixer, setScheme(), setLod(), play(clip) }`.
The same `Part` interface is used by Phase A (`build` generates primitives) and Phase B (`build` loads a glTF and remaps bone names); the client never knows which it got. Selecting parts: `datasheet.figure.parts` overrides `kit.defaults`; weapons come from the model's equipped weapon ids.

## 4. Paint masks

One material for all figures. Per-vertex mask weights in `color` (RGBA) + optional second mask channel:

| Channel | Meaning | Typical use |
|---|---|---|
| R `primary` | main armour colour | armour plates, hull |
| G `secondary` | contrast colour | helmet, pauldron insets, cloth |
| B `trim` | edging | pauldron rims, belts, aquila |
| A `metal` | metallic weight | weapons, joints, backpack vents; drives `metalness` and a metal tint |
| `uv2`-driven `decal` | squad/faction marking | one decal atlas; `decal` colour tints it |

Shader: `MeshStandardMaterial` with `onBeforeCompile` injecting uniforms `uPrimary, uSecondary, uTrim, uMetal, uDecal, uDecalIndex`.
`albedo = R·primary + G·secondary + B·trim + A·metal + (1−R−G−B−A)·baseGrey`, then decal overlay from the atlas. `metalness = A`, `roughness = mix(0.7, 0.35, A)`. Toon-ish look: a 3-step ramp on N·L via `onBeforeCompile` (toggleable).

Scheme mapping: `faction.paintScheme` → uniforms per figure. Overrides in priority order: unit champion (`trim` → `secondary` swap), leader (`decal` index), user custom scheme (later). Colours are per-instance attributes when instancing (§8), so one material serves both factions.

## 5. Animation

Clip names and lengths are fixed so procedural and glTF clips are interchangeable. Loop flags and event markers (named times the client listens to for VFX/sound) included.

| Clip | Length (s) | Loop | Markers | Used by |
|---|---|---|---|---|
| `idle` | 2.0 | yes | — | default; randomised phase offset per model |
| `walk` | 1.0 | yes | `step` @0.25, 0.75 | normal move ≤ 6"/s playback |
| `run` | 0.6 | yes | `step` @0.15, 0.45 | advance, charge move, fall back |
| `shoot` | 0.8 | no | `fire` @0.25 | ranged attack start; re-triggered per weapon |
| `melee` | 0.9 | no | `impact` @0.45 | fight attack |
| `hit` | 0.4 | no | — | wound taken, not slain |
| `death` | 1.2 | no | `ground` @1.0 | model destroyed; hold last frame, then sink 0.5 s and remove |
| `charge` | alias of `run` | | | |

Phase A implements clips as code-defined keyframe tracks (`AnimationClip` built from bone rotation curves), Phase B loads them from the glTF; both are registered through `getClip(archetype, name)`. Movement speed: figures traverse the engine's `UnitMoved` path at 6 in/s (walk) or 10 in/s (run); the client interpolates, the engine already holds the final positions. Vehicles use `idle` (engine rumble bob) and `walk`/`run` (track scroll via UV offset) only; `hit`/`death` are shake + smoke.

## 6. Base and selection ring

`base` part: cylinder radius from datasheet, height 0.12, rim `trim` channel, top `secondary`. Selection ring, target ring and engagement-range disc are separate client meshes parented to `root` (50-client §4), never baked into the part.

## 7. Base sizes (inches; from mm / 25.4)

| Unit type | mm | inches (dia) |
|---|---|---|
| Ork Boy, Grot | 32 / 25 | 1.26 / 0.98 |
| Space Marine infantry (Tacticus/Phobos) | 32 | 1.26 |
| Marine with heavy weapon / Terminator / Ork Nob | 40 | 1.57 |
| Character on foot | 40 | 1.57 |
| Bike / Warbike, Deffkopta | 90 × 52 oval | 3.54 × 2.05 |
| Dreadnought, Meganobz, Killa Kan | 50 / 60 | 1.97 / 2.36 |
| Monster (Deff Dread, Redemptor) | 80 / 90 | 3.15 / 3.54 |
| Vehicle without base (Rhino, Trukk) | hull footprint | engine uses `base.shape: oval` with hull dims |

Data is authoritative (`datasheet.composition[].base`); this table is the lookup for data entry.

## 8. LOD and instancing

| Level | Distance (camera to model) | Content |
|---|---|---|
| LOD0 | < 18 | full parts, skinned, animated |
| LOD1 | 18 – 40 | merged decimated mesh (≤ 35 % tris), skinned, animation at 15 Hz |
| LOD2 | > 40 | static merged mesh in `idle` pose, no skinning |

Combat Patrol scale (≤ 40 models) renders each figure as its own `SkinnedMesh` group sharing geometry (per part) and one material; ≤ 150 draw calls is met by merging each figure's parts into one skinned geometry at assembly time (`mergeFigureGeometry`, one draw call per figure). Per-figure uniforms go through a small `UniformsGroup` or per-mesh `material.onBeforeRender` override.

At 1000/2000 pts (M9) switch to `InstancedMesh` per (kit, LOD) with: instanced attributes for the five scheme colours + decal index, and skinned instancing via a bone-texture array (each instance has its own row; animation state updated on CPU at 30 Hz for LOD0, 10 Hz for LOD1). Selection/target rings stay non-instanced.

## 9. Asset pipeline hooks (Phase B)

`tools/gen-part.ts <partId> <prompt>` → Meshy/Tripo → `tools/clean.py` (Blender: decimate to budget, orient +Z forward, bake vertex masks from material names `primary|secondary|trim|metal`, rename bones to §2) → glTF + meshopt. Output `public/parts/<partId>.glb`; the kit registry loads it when present and falls back to the procedural builder when not.
