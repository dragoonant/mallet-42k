# Handoff: where the local SDXL + Hunyuan3D install lives (Windows PC)

For the agent building a front-end UI for figure generation. Everything below is on the owner's Windows PC
(RTX 5080, 16 GB VRAM). It sits **outside the repo and outside OneDrive**, so a session rooted in the repo can't
see it. Ask the owner to add `C:\Users\antho\Hunyuan3D-2`, `C:\Users\antho\Hunyuan3D-2.1` and
`C:\Users\antho\.cache\hy3dgen` to the session (Claude desktop: add a folder; CLI: `--add-dir`).

## Two installs, two venvs
| Folder | Python venv | What runs there |
|---|---|---|
| `C:\Users\antho\Hunyuan3D-2` | `.venv\Scripts\python.exe`: Python 3.11, torch 2.11 cu128, diffusers 0.32.2, transformers 4.48.3 | SDXL concept images, background cutout, **Hunyuan3D 2.0 texture (paint)**, model viewer. Also holds the shared data files (`units.json`, `picks.json`, `outputs\`). |
| `C:\Users\antho\Hunyuan3D-2.1` | `.venv\Scripts\python.exe`: Python 3.10, torch 2.11 cu128, includes `bpy` (Blender) | **Hunyuan3D 2.1 shape**, plus GLB finalize/render (finalize needs bpy). |

The pipeline is **2.1 shape → 2.0 texture**. Each stage must run in its own venv. The UI should shell out to the
right `python.exe` and not import the libraries into one process.

## Model weights (plain files, no Hugging Face symlinks)
Root: `C:\Users\antho\.cache\hy3dgen\`
- `sdxl\base\`: SDXL 1.0 base (diffusers layout, fp16)
- `sdxl\vae-fp16-fix\`: SDXL VAE fp16 fix
- `sdxl\ip-adapter\sdxl_models\`: IP-Adapter SDXL plus its image encoder, used as a style reference
- `tencent\Hunyuan3D-2\`, `tencent\Hunyuan3D-2.1\`: Hunyuan shape/paint weights. Loaded as
  `from_pretrained('tencent/Hunyuan3D-2.1')`, which resolves to this cache.
- `Tencent-Hunyuan\HunyuanDiT-v1.1-Diffusers-Distilled\`: text-to-image (older concept path, unused now)
- No LoRAs are installed yet. If any get added, put them in `sdxl\lora\` (planned, doesn't exist yet).
They're plain files because HF-cache symlinks fail on this PC without Developer Mode. Don't let anything
re-download through the HF cache.

## Data files (in `C:\Users\antho\Hunyuan3D-2`)
- `units.json`: `{slug: {prompt, height (inches), base (mm)}}`, one entry per figure. Slugs match
  `GLB_SLUG_BY_MODEL` in the repo's `src/client/figures/glbModels.ts`.
- `picks.json`: `{slug: seed number | "absolute path to image"}`. That's either the chosen SDXL candidate or an
  external concept image (e.g. Gemini PNGs in the repo's `art/unit-concepts/`). Env var `PICKS` picks another file.
- **Write both without a UTF-8 BOM.** PowerShell 5.1 `Out-File` adds one and Python's json.load then fails.
- `refs\librarian.webp`: the owner's reference for the house SD look (IP-Adapter style image).
- `outputs\<slug>\`: per-figure working folder: `concepts\s<seed>.png` + `sheet.png`, `cutout.png`,
  `shape.glb`, `textured.glb`, `final.glb`, `final_front/side/back.png`, `final_sheet.png`.
  `outputs\final_contact_<n>.png` is a sheet of 6 figures per image.

## Stages (run each from its folder; scripts use relative paths)
| # | Command (cwd) | Reads → writes | Time |
|---|---|---|---|
| 1 | `Hunyuan3D-2> .venv\Scripts\python.exe concepts_sdxl.py [--units slug ...] [--seeds n ...] [--style 0.2] [--steps n] [--avoid "blue armour"] [--file units.json] [--prefix p] [--ref <img>]` (default `--ref` is `outputs\ultramarine_librarian\cutout.png`) | units.json → `outputs\<slug>\concepts\` (6 candidates) | ~10 s/image |
| 2 | `Hunyuan3D-2> .venv\Scripts\python.exe stage_cutout.py [slug ...]` | picks.json + image → `cutout.png` | seconds |
| 3 | `Hunyuan3D-2.1> .venv\Scripts\python.exe stage_shape.py [--faces 10000] [--only slug ...] [--nocut slug ...]` | `cutout.png` → `shape.glb` (auto-cuts the display base; `--nocut` for floor-length capes) | ~90 s |
| 4 | `Hunyuan3D-2> .venv\Scripts\python.exe stage_paint.py [--texture 1024] [--only slug ...]` | `shape.glb` + `cutout.png` → `textured.glb` | ~20 s |
| 5 | `Hunyuan3D-2> ..\Hunyuan3D-2.1\.venv\Scripts\python.exe stage_finalize.py <repo>\public\assets\models [slug ...]` | `textured.glb` → `<repo>\public\assets\models\<slug>.glb` (scaled to inches, black base, matte) + preview PNGs | ~10 s |
Run `concepts_sdxl.py --help` for its full flags. Use `--style 0.2 --avoid "blue armour"` for non-Space-Marine
factions, or the librarian reference turns everything blue. Game side: a GLB only shows up once its slug is in
`ENABLED_GLB_SLUGS` in `glbModels.ts`.

## Existing tools a UI can reuse
- **Model viewer:** `Hunyuan3D-2\viewer.py` (2.0 venv) serves http://localhost:8765. It lists every GLB under
  `outputs\` with orbit controls. `view_models.bat` launches it.
- Tencent's upstream `gradio_app.py` and `api_server.py` are in both folders (2.1 also has `model_worker.py`,
  `api_models.py`). Our pipeline doesn't use them and they're untested here, but they're the obvious backend
  if the UI wants an HTTP API instead of shelling out.

## Constraints the UI must respect
- **One GPU job at a time.** SDXL, shape and paint each want most of the 16 GB VRAM, so queue the jobs; don't
  run them in parallel.
- Don't `pip install`/upgrade anything in the 2.0 venv (transformers 4.48.3 and diffusers 0.32.2 are pinned for
  Hunyuan paint).
- uv is at `C:\Users\antho\.local\bin\uv.exe`. Set `UV_SYSTEM_CERTS=1` for any install, because this PC
  re-signs HTTPS.
- License: Hunyuan3D is under Tencent's Hunyuan **non-commercial** community license.
- Concept images for the game come from Gemini through Claude in Chrome **on this PC**, never the owner's Mac
  (see `docs/HANDOFF-sd-figures-v2.md`).
