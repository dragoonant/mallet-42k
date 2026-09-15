// M8 — polish: dice animation, VFX, audio (ElevenLabs), walk/attack animation. Fail-fast.
//   Workflow({ scriptPath: '/Users/anthonyescasa/dev/mallet-42k/tools/workflows/w8-polish.js', args: { attribution } })
// Shape: build dice ∥ vfx ∥ audio ∥ animation (Sonnet, disjoint files) → wire into scene/HUD/settings (Sonnet) → ship with screenshots (Sonnet).
export const meta = {
  name: 'w8-polish',
  description: 'M8 polish: dice animation, combat VFX, ElevenLabs sound + voice, figure animation, settings; ship',
  phases: [{ title: 'Build' }, { title: 'Wire' }, { title: 'Ship' }],
}

const ROOT = '/Users/anthonyescasa/dev/mallet-42k'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} (git repo, branch main, PUBLIC on GitHub). Use absolute paths (shell cwd may reset). Orient from ${ROOT}/STATUS.md only. Playable Warhammer 40k Combat Patrol fan game in the browser (Vite + React + TS + @react-three/fiber + drei + zustand), deployed to GitHub Pages. Engine src/engine (read-only), client src/client (store src/client/store/game.ts exposes the engine event log; figures src/client/figures; board src/client/board; UI src/client/ui). Engine events (src/engine/events.ts, grep don't read whole): DiceRolled, HitRolled/WoundRolled/SaveRolled-style events, DamageApplied, ModelDestroyed, UnitDestroyed, ChargeRolled, moves, VpScored, StratagemUsed, PhaseStarted, GameEnded etc. All copy in your own words; no Games Workshop text, audio or imagery. OWNER PRIORITY: visible, fun polish fast; the owner is playtesting the live site. Keep it light on bundle size and CPU (instanced/pooled effects, no heavy libraries; no new npm dependencies unless tiny and essential — never run npm install yourself, list it in issues instead). No unit tests. Concurrent agents share one working tree: edit only files you own, never git commit.`

const BUILD = [
  { key: 'dice', prompt: `${COMMON}
You own ONLY src/client/dice/**. Build a dice presentation layer: export <DiceTray/> (an HTML/CSS or small R3F overlay, bottom-centre, not covering the board centre) and a function playRoll(roll: { purpose: string; dice: number[]; target?: number; rerolled?: number[]; label?: string }) returning a Promise that resolves when the animation ends. Look: chunky d6 cubes with pips that tumble ~500 ms and settle; successes (≥ target) glow, failures dim, criticals (6) pop; groups of many dice (e.g. 20 Ork shots) collapse into a compact summary row ("20 dice: 9 hits") with the dice still shown small; re-rolled dice flip visibly. Speed setting: normal / fast / instant (export a setter). Queue rolls so they play in order; never block the game for more than ~1.2 s per roll at normal speed. Must typecheck.
Return JSON: ok, summary (≤60 words), files, issues.` },
  { key: 'vfx', prompt: `${COMMON}
You own ONLY src/client/vfx/**. Build pooled R3F combat effects: export <VfxLayer/> and an imperative API vfx.shoot(from:{x,y,z}, to:{x,y,z}, kind:'bolter'|'shoota'|'heavy'|'flame'|'psychic'), vfx.hit(at, severity), vfx.save(at) (a small shield flicker), vfx.melee(at, attackerFaction), vfx.death(at), vfx.chargeDust(path points), vfx.objectivePulse(at, colour), vfx.mortal(at). Style: stylised, readable from the default camera — tracers with bright heads, muzzle flash sprites, spark bursts, a dust puff on death, flame cone for flamers, purple arcs for psychic. Use additive-blended sprites/instanced meshes with a fixed pool (no per-effect allocations after warm-up); each effect ≤0.8 s. Must typecheck.
Return JSON: ok, summary (≤60 words), files, issues.` },
  { key: 'audio', prompt: `${COMMON}
You own ONLY tools/gen-audio.ts, tools/audio-manifest.json, public/audio/**, and src/client/audio/**.
ElevenLabs API key: NEVER print it, log it, write it into any repo file, commit it, or put it in client code (the repo and site are public). Get it at runtime in the shell like this and pass it only via env:
  export ELEVENLABS_API_KEY="$(textutil -convert txt -stdout '/Users/anthonyescasa/Library/CloudStorage/OneDrive-Personal/Documents/Mallet 42k/elevenlabs.token.rtf' | grep -oE 'sk_[A-Za-z0-9_-]+' | head -1)"
Account: Starter tier, ~29,000 credits left this month — HARD BUDGET for this task: 9,000 credits. Sound effects: POST https://api.elevenlabs.io/v1/sound-generation (JSON {text, duration_seconds, prompt_influence}; header xi-api-key; returns audio/mpeg) — set duration_seconds explicitly and short (0.5–2 s) to keep cost low. Voice: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_64 with {text, model_id:'eleven_flash_v2_5'} (flash is cheaper); list voices with GET /v1/voices and pick one gruff announcer voice for narration. Check GET /v1/user/subscription (print only character_count/character_limit) before and after, and stop generating if the budget would be exceeded.
1. tools/audio-manifest.json: ~28 SFX (bolter burst, shoota spray, heavy gun, flamer, psychic zap, hit impact, armour save clank, invulnerable shimmer, melee chainsword, power klaw crunch, Ork war cry, Marine shout, model death, vehicle explosion, charge rumble, dice rattle, dice land, objective captured chime, VP scored sting, CP gained click, stratagem used whoosh, battle-shock sting, turn start horn, UI click, UI error, victory fanfare, defeat sting, ambient battlefield loop 20 s) + ~12 short own-words narrator lines ("Battle round one", "Movement phase", "Shooting phase", "Charge!", "Fight phase", "Command phase", "Objective taken", "Unit destroyed", "Stratagem!", "Victory", "Defeat", "Your turn"). tools/gen-audio.ts (run with npx tsx) generates each missing file into public/audio/<id>.mp3, skips files that already exist (so reruns never re-spend), writes a cost log to stdout. Keep each file small (64 kbps mono where possible).
2. src/client/audio/: export an audio manager (Web Audio, lazy-unlocked on first user click; preload small SFX, stream the ambient loop) with play(id, {volume, detune jitter}), master/sfx/voice/music volumes and mute persisted to localStorage, throttling so 20 simultaneous shots become a few layered sounds; paths must respect Vite base '/mallet-42k/' (use import.meta.env.BASE_URL).
Run the generator, confirm files exist and play (ffprobe durations if available), npm run typecheck.
Return JSON: ok, summary (≤60 words incl. credits used and remaining), files (the manifest, generator, manager — not every mp3), issues.` },
  { key: 'anim', prompt: `${COMMON}
You own ONLY src/client/figures/**. Figures already have procedural poses (idle, walk, shoot, melee, death) and the client eases models to new positions. Improve motion so the game feels alive: a real walk cycle (leg swing, body bob, arm swing) while a model is interpolating between positions, facing the direction of travel then turning to face its target when shooting/fighting; shoot recoil synced to a trigger prop; melee lunge + swing; hit flinch; death topple then fade and sink; Deffkopta rotor spin and hover bob; Deff Dread stomping gait. Export a small imperative per-model API or props (e.g. <Figure action={{kind:'shoot', at, t0}} moving facing/>) that the wiring agent can drive from engine events, and document it at the top of src/client/figures/index.ts. Keep per-frame cost low (no per-frame allocations). Must typecheck.
Return JSON: ok, summary (≤60 words incl. the API), files, issues.` },
]

const WIRE = `${COMMON}
Dice (src/client/dice), VFX (src/client/vfx), audio (src/client/audio + public/audio) and figure animation (src/client/figures) now exist — read their index files and top-of-file docs, not every line.
You own src/client/Scene.tsx, src/client/App.tsx, src/client/ui/**, src/client/interaction/**, and a new src/client/presentation/** (an event-to-presentation director). Build the director: subscribe to new engine events from the store and play them in order with sensible pacing — moves drive walk animations + charge dust + charge rumble; shooting declares turn figures and fire vfx.shoot per weapon group with the matching sound; hit/wound/save rolls go through playRoll with dice sounds; damage → vfx.hit + flinch; saves → vfx.save + clank; model destroyed → death anim + vfx.death + sound; phase start → narrator line (not every time for the bot's turn if it becomes spammy — once per phase is fine); VP scored → objectivePulse + sting; stratagem used → whoosh + narrator; game end → fanfare/defeat. Bot turns play through the same director (the store should wait for presentation to finish before the bot's next decision when speed ≠ instant; add that hook in the store only if it's a tiny change and you must — otherwise pace in the director). Add a Settings popover in the HUD: master/sfx/voice/music volume, mute, animation speed (normal/fast/instant), dice animation on/off, ambient on/off. Everything must degrade gracefully if audio fails to load. Run npm run typecheck and npm run build until clean.
Return JSON: ok, summary (≤80 words), files, issues.`

phase('Build')
const built = await parallel(BUILD.map(b => () => agent(b.prompt, { label: `build:${b.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' })))

phase('Wire')
const wired = await agent(WIRE, { label: 'wire:director', phase: 'Wire', schema: RESULT, model: 'sonnet' })

phase('Ship')
const ship = await agent(`${COMMON}
Land M8 polish. Run npm run typecheck, npm test, npm run build — minimal fixes if red (never weaken tests); if the build grew a lot, note the size. Run 'npm run e2e -- play.spec.ts' (set animation speed to instant in the test via the settings or a ?fast query if needed so it doesn't take forever; update selectors only). Take screenshots to e2e-out/: m8-01-shooting.png (tracers/impacts mid-shooting), m8-02-dice.png (dice tray mid-roll), m8-03-melee.png (a fight if reachable, else any action frame), m8-04-settings.png (settings popover). Read them; if an effect is invisible or broken, fix once and retake. Make sure no file contains the ElevenLabs key: run grep -rE 'sk_[A-Za-z0-9_-]{20,}' src tools public tests STATUS.md and abort the commit if anything matches. Update STATUS.md (M8 lines + known gaps). git pull --rebase; git add src public tools tests STATUS.md package.json package-lock.json; commit "M8: dice animation, combat VFX, sound and narration, figure animation" + blank line + "${ATTR}" (retry on .git/index.lock); git push origin main. Do not commit e2e-out/.
Return JSON: ok, summary (≤60 words), files (include absolute screenshot paths), issues.`, { label: 'ship:m8', phase: 'Ship', schema: RESULT, model: 'sonnet' })

return {
  built: built.filter(Boolean).map(b => ({ ok: b.ok, summary: b.summary, issues: b.issues.slice(0, 3) })),
  wired: wired && { ok: wired.ok, summary: wired.summary, issues: wired.issues.slice(0, 5) },
  ship: ship && { ok: ship.ok, summary: ship.summary, screenshots: ship.files.filter(f => f.endsWith('.png')), issues: ship.issues },
}
