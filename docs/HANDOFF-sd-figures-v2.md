# Handoff: SD figure models v2 (all factions)

Owner's request (2026-10-04): new master grade SD concept images, made in Google Gemini, for every army except
the Necrons (already done). That includes the Space Marines and Orks, which get replaced. Turn each image into a
Hunyuan3D model, wire the models into the game, and archive the old Space Marine and Ork GLBs. **Do all of it on
the Windows PC (the one with the GPU). Do not route anything through the owner's Mac or its Claude session.**

## Prerequisite: a browser on the PC that's signed in to Gemini
Last session, Claude in Chrome was attached only to the Chrome on the owner's **Mac**
(`list_connected_browsers` showed one browser, macOS). Files saved there never reach the PC. Before starting:
1. Run `mcp__claude-in-chrome__list_connected_browsers`. You need a browser whose platform is Windows. If there
   isn't one, stop and ask the owner to open Chrome **on the PC** with the Claude extension connected and signed
   in to Google (anthony.j.escasa@gmail.com), then `select_browser` it. Do not use the Mac browser.
2. Its downloads land in `C:\Users\antho\Downloads`. Check where Chrome actually saves before relying on that.

## The images already exist; don't regenerate them
All 36 images are in the owner's Gemini history. Open each chat in the PC's Chrome and pull the images out.
Gemini picture N is the Nth `model-response` element on the page.

| Faction | Chat URL | Response → slug |
|---|---|---|
| Space Marines | gemini.google.com/app/c57dad0b8db121f2 | 2 captain-octavius, 3 librarian-tantus, 4 infernus-sergeant, 5 infernus-marine, 6 terminator-sergeant, 7 terminator (1 = rejected, too realistic) |
| Orks | gemini.google.com/app/2bc42be457164048 | 1 warboss-gordrang, 2 boss-nob, 3 boy, 4 deff-dread, 5 deffkopta |
| Chaos Space Marines | gemini.google.com/app/61beb5a3086205eb | 2 aranis-zarkan, 3 possessed, 4 legionary-champion, 5 legionary, 6 cultist-champion, 7 cultist (1 = rejected, two figures) |
| Tyranids | gemini.google.com/app/fd29557a31d19547 | 1 terror-of-vardenghast, 2 psychophage, 3 termagant, 4 barbgaunt, 5 von-ryan-leaper |
| Adepta Sororitas | gemini.google.com/app/4112f2c5d4a6c0e2 | 6 canoness-adalya, 2 sister-superior, 3 battle-sister, 4 celestian-sacresant, 5 arco-flagellant (1 = rejected, two figures) |
| Astra Militarum | gemini.google.com/app/c08c847ee068b25b | 1 cadian-sergeant, 2 cadian-trooper, 3 lord-marshal-karsk, 4 cadian-veteran, 5 cadian-medic, 6 cadian-standard-bearer, 7 bombast-field-gun, 8 malleus-rocket-battery, 9 armoured-sentinel |

Slugs match `GLB_SLUG_BY_MODEL` in `src/client/figures/glbModels.ts`. Nobody has looked at cultist (CSM #7) or
armoured-sentinel (AM #9) yet, so check them first. If an image is unusable (two figures, cropped, a base that
isn't round), regenerate it in the same chat with "Same style... exactly ONE single figure, centred...". The
prompt wording that gives MG SD proportions: *"noticeably oversized head (about a third of total height), short
compact torso, short sturdy legs, oversized hands and weapons, like a master grade SD Gundam kit, not chibi.
Full body, front three-quarter view, plain round black base, plain white background, no shadows, no text."*

### Getting the image files (Gemini gotchas, learned the hard way)
- **Gemini's "Download full size image" button is unreliable.** Clicks from page scripts and `ref` clicks do
  nothing, and even real clicks often hang on "Downloading full size…". Don't depend on it.
- **This works:** in the chat tab, run JS (javascript_tool) that collects every image and triggers a *single*
  download of a JSON bundle `{slug: dataURL}`:
  - If `img.src` starts with `blob:`, draw it to a canvas and call `toDataURL('image/png')`.
  - If `img.src` is `https://lh3.googleusercontent.com/gg/...=s1024-rj`, run
    `fetch(src.split('?')[0] + '?alr=yes', {credentials:'include'})`, then convert to a data URL with FileReader.
    Without `?alr=yes` the fetch fails. Canvas on an lh3 `<img>` is tainted. `=s0` and `=s2816` are blocked, so
    you get 1024×559 images, which is fine for Hunyuan (it shrinks input to about 512 px).
  - Scroll each response into view and wait ~800 ms first, or the image won't have loaded.
  - Then `a.download = 'mallet-concepts-<faction>.json'; a.click()` once per tab. Chrome allows one automatic
    download per tab without a prompt.
- Decode each bundle on the PC (PowerShell or Python) into `art/unit-concepts/<slug>.png`.
- javascript_tool calls time out after 45 s, so start long loops without awaiting them and poll a `window._log`.
- Background tabs are throttled and their `<img>`s may never upgrade to blobs. Screenshotting a tab brings it
  forward. A Gemini chat can get stuck showing "Stop response" with no Send button. Reload the tab, then type and
  click the round send button with real `computer` actions.

## Building the models (local pipeline, see memory `hunyuan3d-model-pipeline`)
Folders: `C:\Users\antho\Hunyuan3D-2` (2.0 venv: cutout, paint) and `C:\Users\antho\Hunyuan3D-2.1` (2.1 venv:
shape, finalize). Defaults are already 10k faces and a 1024 texture, the same as the Necrons.
1. Add each slug to `Hunyuan3D-2\units.json` (`{prompt, height (inches), base (mm)}`) and `picks.json`
   (`slug: "<absolute path to png>"`). **Write the JSON without a BOM.** PowerShell 5.1's `Out-File` adds one and
   breaks Python's json.load. The 11 Space Marine and Ork entries already exist; repoint their picks to the new
   PNGs. Suggested values (base mm comes from the datasheets):
   - CSM: aranis-zarkan 1.8/40, possessed 1.8/40, legionary-champion 1.55/32, legionary 1.55/32,
     cultist-champion 1.2/25, cultist 1.15/25
   - Tyranids: terror-of-vardenghast 2.4/50, psychophage 3.0/120, termagant 1.0/28, barbgaunt 1.3/40,
     von-ryan-leaper 1.6/40
   - Sororitas: canoness-adalya 1.4/32, sister-superior 1.3/32, battle-sister 1.3/32, celestian-sacresant 1.4/32,
     arco-flagellant 1.3/25
   - Astra Militarum: cadian-sergeant 1.15/25, cadian-trooper 1.15/25, lord-marshal-karsk 1.25/28,
     cadian-veteran 1.2/28, cadian-medic 1.2/28, cadian-standard-bearer 1.8/28 (banner), bombast-field-gun
     1.6/100, malleus-rocket-battery 1.6/100, armoured-sentinel 2.8/80
2. `cd Hunyuan3D-2; .\.venv\Scripts\python.exe stage_cutout.py <slugs>`
3. `cd Hunyuan3D-2.1; .\.venv\Scripts\python.exe stage_shape.py --only <slugs> [--nocut <slug>]`. Use
   `--nocut` only for floor-length capes or robes. Takes ~90 s per model, so run it in the background.
4. `cd Hunyuan3D-2; .\.venv\Scripts\python.exe stage_paint.py --only <slugs>` (~20 s each)
5. `cd Hunyuan3D-2; ..\Hunyuan3D-2.1\.venv\Scripts\python.exe stage_finalize.py <repo>\public\assets\models <slugs>`
   writes `<slug>.glb` plus `outputs\final_contact_*.png` preview sheets. **Look at the sheets** before wiring.
Do one faction per batch (≤9 models): finalize, wire, commit, push, then start the next.

## Wiring, archive, commit
- Before overwriting, `git mv` the 11 current Space Marine and Ork GLBs from `public/assets/models/` to
  `art/archive/models-v1/` (captain-octavius, librarian-tantus, infernus-sergeant, infernus-marine,
  terminator-sergeant, terminator, warboss-gordrang, boss-nob, boy, deff-dread, deffkopta). Do it in the same
  commit as their replacements, so `main` never has those slugs enabled without a file.
- Add every new slug to `ENABLED_GLB_SLUGS` in `src/client/figures/glbModels.ts`. Space Marine and Ork slugs are
  already listed.
- Commit the concept PNGs too (`art/unit-concepts/`), and add a section per faction to
  `art/unit-concepts/PROMPTS.md`.
- `npm run typecheck`, then commit `M10: <faction> SD figures v2` with the Co-Authored-By line, then push to
  `main` (pre-approved by the owner). Pages deploys from `main`.
- Send the owner the contact sheets.

## IP note
Owner's standing choice: GW iconography in the images is an acceptable playtest placeholder. Replace it with
original markings before release (see memory `hunyuan3d-model-pipeline`).
