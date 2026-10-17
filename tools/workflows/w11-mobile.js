// M11 — phones and tablets (touch, small landscape screens). One stage per run, lean (implement + ship).
//   Workflow({ scriptPath: 'tools/workflows/w11-mobile.js', args: { stage: 'shell'|'touch'|'hud', root, branch, attribution } })
// Owner decisions (2026-10-16): design for iPhone Pro landscape (852x393), must also work on iPhone SE (667x375),
// Pro Max (932x430) and Android phones; battle is landscape-only (portrait shows a rotate prompt, menus work in
// portrait); camera is two-finger only, one finger always belongs to the game; GLB compression only if phones crash.
export const meta = {
  name: 'w11-mobile',
  description: 'M11 mobile: phone shell, touch input, compact HUD — one stage per run, then ship to main',
  phases: [{ title: 'Build' }, { title: 'Follow-up' }, { title: 'Ship' }],
}

const STAGE = (args && args.stage) || 'shell'
const ROOT = (args && args.root) || '<repo-root>'
const BRANCH = (args && args.branch) || 'main'
const ATTR = (args && args.attribution) || 'Co-Authored-By: Claude <noreply@anthropic.com>'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }

const COMMON = `Project root: ${ROOT} — a git worktree on branch ${BRANCH} (PUBLIC repo). Use absolute paths (shell cwd may reset). Browser 3D Warhammer 40k Combat Patrol fan game: Vite + React 19 + TS + @react-three/fiber 9 + drei 10 + zustand; all styling is inline CSSProperties (src/client/ui/theme.ts) plus a few <style> strings — keep that idiom, no CSS frameworks, no new npm dependencies. Read only what your task needs (grep, read excerpts; never whole 1000+ line files at once).
GOAL OF M11: make the game playable on phones (iPhone Pro landscape 852x393 is the design target; must also work on iPhone SE 667x375, Pro Max 932x430, Android ~915x412) WITHOUT changing the desktop experience. Battle is landscape-only. Camera: two fingers only (pinch zoom, two-finger drag pan, twist rotate); one finger always belongs to the game (tap select, drag models, drag to measure).
Form-factor API (created in the shell stage, src/client/ui/formFactor.ts): getFormFactor() / useFormFactor() -> { touch, compact, portrait, phone }. compact = the small-touch-screen layout; desktop (compact false) must look and behave exactly as before. URL override ?ff=compact|desktop forces it for testing. Safe areas: CSS vars --safe-top/--safe-right/--safe-bottom/--safe-left on :root (from env(safe-area-inset-*)). Touch targets in compact are >= 44px. No native title= tooltips (use src/client/ui/Tooltip.tsx). All copy in our own words.
Concurrent agents share one working tree: edit ONLY the files you own, never git commit, never npm install. Run npm run typecheck before returning (errors in files you don't own that another agent is mid-edit on can be listed in issues).`

const SHIP = (title, extra) => `${COMMON}
You are the ship agent for M11 stage "${STAGE}". Land it:
1. npm run typecheck, npm test, npm run build — minimal fixes if red (never weaken or delete tests).
2. E2E on a private port so other worktrees' preview servers are never reused: pick a port P in 4400-4499 that netstat -ano shows unused, then in bash PW_PORT=P npx playwright test --project=iphone-se --project=iphone-pro --project=pixel ; then PW_PORT=P npx playwright test --project=chromium with the quickest existing spec that boots a battle (not the 12-minute full-game spec; home.spec.ts is known-stale) to prove desktop still works. Restore any tracked screenshots/ files the tests rewrite (git checkout -- screenshots). Fix failures with minimal changes (selectors/timeouts in tests, real bugs in src). ${extra}
3. Read every screenshot the mobile specs wrote to e2e-out/ (Read tool shows images). If something in this stage's scope is visibly broken (clipped under the notch, unreachable button, overlapping panels that block play), fix once and re-run.
4. Update STATUS.md: an "M11 mobile" section (create if missing) with one line for this stage and known gaps.
5. Privacy: grep the staged diff for the home path or a Windows username (C:\\Users\\, /Users/) and remove any.
6. git add -A src tests tools public index.html playwright.config.ts STATUS.md HANDOFF.md .gitignore (never e2e-out/, never node_modules); commit "M11: ${title}" + blank line + "${ATTR}" (retry on .git/index.lock). Then: git fetch origin && git merge origin/main (resolve conflicts keeping both sides' intent; re-run typecheck after a non-trivial merge); git push origin HEAD:${BRANCH} && git push origin HEAD:main. Do not switch branches.
Return JSON: ok, summary (<=60 words, what a phone player now sees), files (absolute screenshot paths only), issues (<=6, most important first).`

const STAGES = {
  shell: {
    title: 'phone shell — safe areas, Home Screen install, rotate prompt, auto low graphics, mobile E2E projects',
    build: [
      { key: 'shell', prompt: `${COMMON}
You own ONLY: index.html, vfx.html, dice.html, public/manifest.webmanifest (new), public/icons/** (new), tools/gen-icons.mjs (new), src/client/ui/formFactor.ts (new), src/client/ui/RotatePrompt.tsx (new), src/client/App.tsx, src/client/Scene.tsx, src/client/presentation/settings.ts, src/client/ui/StartScreen.tsx.
1. index.html (and vfx.html/dice.html viewport only): viewport "width=device-width, initial-scale=1, viewport-fit=cover"; apple-mobile-web-app-capable + mobile-web-app-capable yes, apple-mobile-web-app-status-bar-style black-translucent, apple-mobile-web-app-title "Mallet 42k", theme-color #0a0a10, apple-touch-icon, manifest link (paths must work under Vite base /mallet-42k/ — use relative or %BASE_URL%-safe paths Vite rewrites; verify in the built dist/index.html). In the <style>: :root safe-area vars (--safe-top etc = env(safe-area-inset-*, 0px)); html,body,#root height:100% / 100dvh, overflow hidden, overscroll-behavior none, -webkit-tap-highlight-color transparent, -webkit-text-size-adjust 100%; canvas { touch-action:none; -webkit-user-select:none; -webkit-touch-callout:none }. Block iOS page pinch-zoom/double-tap-zoom on the game (gesturestart/gesturechange preventDefault and a dblclick/touchend double-tap guard) but keep scrolling inside scrollable panels working.
2. public/manifest.webmanifest: name/short_name, display "fullscreen" (fallback standalone via display_override), orientation "landscape", background/theme #0a0a10, start_url and scope "./", icons 192/512 (+ maskable). tools/gen-icons.mjs: renders an original simple SVG mark (an SD-style mallet/hammer over a dark disc in the game's accent colours — read theme.ts) to public/icons/icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png using Playwright's chromium (import { chromium } from 'playwright' or '@playwright/test') screenshotting an inline-SVG page. Run it.
3. src/client/ui/formFactor.ts: export type FormFactor = { touch: boolean; compact: boolean; portrait: boolean; phone: boolean }. touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches. phone = touch && Math.min(innerWidth, innerHeight) < 500. compact = phone (tablets keep the desktop layout). portrait = innerHeight > innerWidth. URL ?ff=compact forces touch/compact/phone true; ?ff=desktop forces all false. Export getFormFactor(), useFormFactor() (React hook, updates on resize/orientationchange/visualViewport resize, cheap — one shared listener + useSyncExternalStore), and set document.documentElement.dataset.ff = 'compact'|'desktop' on change. Document it at the top of the file.
4. RotatePrompt.tsx: full-screen overlay (data-testid="rotate-prompt") shown when phone && portrait while a game is in progress (not on the start screen / army picker, which must work in portrait): a phone-rotating icon drawn in CSS/SVG + "Turn your phone sideways to play". Mount it in App.tsx.
5. App.tsx: the in-game overlay layer and right rail must respect safe areas (pad by the --safe-* vars) — no layout redesign yet (that is a later stage), just keep everything out of the notch/home-indicator zones.
6. Scene.tsx: on phone, cap dpr at [1, 2] only when lowGraphics is off and otherwise 1 (keep desktop exactly as is); handle webglcontextlost (preventDefault) / webglcontextrestored (invalidate) on the canvas so iOS memory pressure doesn't leave a black screen; ensure the canvas element gets touch-action:none.
7. settings.ts: when there is NO stored setting yet, default lowGraphics to true on a phone (getFormFactor().phone); stored settings always win.
8. StartScreen.tsx: replace 100vh with 100dvh, add safe-area padding, make sure its existing @media rules work in iPhone portrait (375 wide) and landscape (393 tall — panels must scroll, nothing cut off).
Run npm run typecheck and npm run build.
Return JSON: ok, summary (<=60 words), files, issues.` },
      { key: 'tests', prompt: `${COMMON}
You own ONLY: playwright.config.ts and tests/e2e/mobile-smoke.spec.ts (new). Another agent is concurrently adding src/client/ui/formFactor.ts (?ff=compact|desktop override) and a rotate prompt with data-testid="rotate-prompt" (shown on a phone in portrait during a game) — write tests against that contract; you cannot run them to green until it lands, so make them correct by reading the app.
1. playwright.config.ts: PORT = Number(process.env.PW_PORT ?? 4173). Keep the 'chromium' project (Desktop Chrome) and make it testIgnore /mobile-.*\\.spec\\.ts/. Add projects matching only /mobile-.*\\.spec\\.ts/: 'iphone-se' = devices['iPhone SE landscape'], 'iphone-pro' = devices['iPhone 15 Pro landscape'], 'pixel' = devices['Pixel 7 landscape']. (iPhone devices run WebKit — it is installed.) Don't change anything else about desktop runs.
2. tests/e2e/mobile-smoke.spec.ts: (a) start screen loads, no horizontal page overflow (document.documentElement.scrollWidth <= innerWidth + 1), screenshot e2e-out/mobile-<projectName>-01-start.png; (b) start a game the same way the existing desktop specs do (read tests/e2e/play.spec.ts or another simple spec for the start flow and any ?scenario= / window.__mallet hooks — reuse, don't invent), wait for the board canvas (non-zero size) and the HUD, screenshot e2e-out/mobile-<projectName>-02-battle.png; (c) set the viewport to portrait (swap width/height) mid-game and expect [data-testid=rotate-prompt] visible, screenshot -03-portrait.png, then back to landscape and expect it hidden. Use testInfo.project.name in filenames. Generous timeouts for WebKit model loading (90s).
Run npm run typecheck (the config/spec must typecheck if tests are included in tsconfig).
Return JSON: ok, summary (<=60 words), files, issues.` },
    ],
    followUp: null,
    shipExtra: '',
  },
  touch: {
    title: 'touch controls — two-finger camera, one-finger select/drag/measure, commit/cancel bar, on-screen formation and floor controls',
    build: [
      { key: 'camera', prompt: `${COMMON}
You own ONLY: src/client/board/CameraRig.tsx, src/client/board/cameraModifiers.ts, src/client/board/touchCamera.ts (new).
Today drei OrbitControls (CameraRig.tsx) is remapped for mouse (LEFT none, MIDDLE pan, RIGHT orbit) and touch is unconfigured, so one-finger touch rotates and fights board drags. On touch devices:
1. Disable OrbitControls' own touch handling (controls.touches ONE/TWO set to a no-op value, cast as needed) and implement src/client/board/touchCamera.ts: a two-finger gesture handler on the canvas element (pointer events with pointerType 'touch', tracking active pointers): pinch = dolly toward the pinch midpoint (respect existing min/max distance), midpoint drag = pan on the ground plane (y=0) so the board stays under the fingers, twist = rotate azimuth around the target, two-finger vertical drag while not pinching may tilt polar angle within the existing limits. Smooth, no per-frame allocations, invalidate() the demand frameloop on change, clamp target to the board area like the mouse controls do.
2. Export from touchCamera.ts: isMultiTouchActive(): boolean; onMultiTouchStart(cb: () => void): () => void (fires the moment a second finger lands, so board interactions can cancel their one-finger gesture); and a small imperative camera API usable by on-screen buttons: cameraNudge = { rotate(deg: number), zoom(factor: number), topDown(), reset() } (reuse existing top-down / focus logic in CameraRig if present). Document the exports at the top of the file.
3. Mouse behaviour on desktop must be byte-for-byte unchanged.
Return JSON: ok, summary (<=60 words incl. the exported API), files, issues.` },
      { key: 'controls', prompt: `${COMMON}
You own ONLY: src/client/ui/FormationPicker.tsx (find its real path with grep), src/client/board/FloorSelector.tsx, src/client/ui/UnitCard.tsx, src/client/ui/UnitCardTooltip.tsx.
Make every key/hover-only control reachable by touch, shown only when useFormFactor().touch (desktop unchanged):
1. FormationPicker: keys 1-7/0 pick a shape, Q/E rotate 15 deg, R flip, mouse wheel rotates. Add on-screen 44px buttons (rotate left, rotate right, flip) next to the shape choices if they don't already exist; make sure shape choices are tappable; the window-level wheel handler must not swallow touch scrolling.
2. FloorSelector: PageUp/PageDown change floor — add on-screen up/down floor buttons (44px) when a multi-floor building is relevant (reuse its existing visibility condition).
3. UnitCard / UnitCardTooltip: onMouseEnter/Leave hover details — on touch, a tap toggles the same details (tap elsewhere closes), mirroring how Tooltip.tsx handles touch (read it).
Return JSON: ok, summary (<=60 words), files, issues.` },
    ],
    followUp: { key: 'input', prompt: `${COMMON}
src/client/board/touchCamera.ts now exists (read its top-of-file doc): isMultiTouchActive(), onMultiTouchStart(cb), cameraNudge.
You own ONLY: src/client/board/Board.tsx, src/client/interaction/**, src/client/board/PlacementOverlay.tsx, src/client/board/CultAmbushMarkers.tsx, src/client/ui/TouchActionBar.tsx (new), and the one line in src/client/App.tsx that mounts TouchActionBar.
Board input today (Board.tsx emit ~:100-127): a buttonless pointermove is "hover" and drives the live move preview (interaction/moveHover.ts); button 0 drives down/move/up; Measure and nudge use left-drag; placement drag in PlacementOverlay; Shift+drag grabs a whole formation; Enter commits a move, Esc cancels; onPointerOver for markers. Make one finger work on touch (pointerType 'touch'), desktop unchanged:
1. Tap = select / choose (same as a click). Finger-down + drag on a model = drag it (move preview follows the finger exactly like hover does with a mouse; offset the dragged model ~60px above the finger so the finger doesn't hide it); finger-up leaves the previewed move pending instead of committing. Drag on empty ground with the Measure tool = measure. A second finger landing (onMultiTouchStart) cancels the one-finger gesture and restores the pre-drag state.
2. TouchActionBar.tsx (data-testid="touch-action-bar"): when touch && a move/placement preview is pending, show a bottom-centre bar (above --safe-bottom) with 44px+ "Confirm" (= Enter) and "Cancel" (= Esc) buttons, plus a "Whole unit" toggle that replaces Shift+drag for the next drag. Wire it to the same functions the keys call (no duplicated logic).
3. Long-press (450 ms, < 10 px movement) on a model opens the same unit info a desktop hover/right-click would (find the existing path); it must not also start a drag.
4. Hover-only highlights (onPointerOver) get a tap equivalent where they gate a choice.
Return JSON: ok, summary (<=60 words), files, issues.` },
    shipExtra: 'Also add tests/e2e/mobile-touch.spec.ts run on the pixel project only (test.skip otherwise): use a CDP session (page.context().newCDPSession(page), Input.dispatchTouchEvent with touchStart/touchMove x12/touchEnd) to start a game, tap-select one of the player\'s units, drag a model a short distance, expect [data-testid=touch-action-bar] visible, tap Confirm, assert the model moved (window.__mallet store / __malletProject — see tests/e2e/scenario-pile-in.spec.ts for the hooks). Screenshot e2e-out/mobile-pixel-04-touch-move.png before Confirm.',
  },
  hud: {
    title: 'compact HUD for phones — slim top bar, bottom-sheet decisions, drawers, unit chip, 44px targets',
    build: [
      { key: 'hud', prompt: `${COMMON}
COMPACT LAYOUT ZONES (all three agents follow these; desktop untouched): top bar (<= 44px + --safe-top, full width) — bottom sheet for DecisionPrompt (full width between safe areas, max 45dvh, collapsible to a one-line summary) — right-edge drawers (slide over the board from the right, width min(320px, 46vw), max one open at a time, closed by default) — unit chip (top-left under the top bar) — camera buttons (right edge, vertically centred, small 44px column).
You own ONLY: src/client/ui/Hud.tsx, src/client/App.tsx, src/client/ui/compactSheets.ts (new), src/client/ui/DiceLog.tsx, src/client/ui/DiceTray.tsx (or the dice tray's real path), src/client/ui/EventFeed.tsx, src/client/ui/PhaseBanner.tsx, src/client/ui/Toast.tsx, src/client/ui/VpToast.tsx, src/client/ui/SettingsPanel.tsx, src/client/ui/MissionPanel.tsx, src/client/ui/StratagemPanel.tsx, src/client/ui/WeaponPanel.tsx, src/client/ui/RerollTray.tsx, src/client/ui/EndScreen.tsx (grep for real paths; skip ones that don't exist).
When useFormFactor().compact:
1. compactSheets.ts: tiny zustand store { open: 'mission'|'stratagems'|'log'|'feed'|'settings'|null, toggle(id), close() } and a <CompactDrawer id title> wrapper component (slide-in, close button, scrolls internally, respects safe areas).
2. Hud: slim top bar — round/phase/CP/VP badges compact (abbreviate), tools always in the existing "..." menu (TOOLS_COLLAPSE_PX logic), menu items 44px; buttons that open Mission/Stratagems/Log/Settings toggle drawers. Add the camera button column using cameraNudge from src/client/board/touchCamera.ts (rotate left/right, zoom in/out, top-down).
3. Right rail (App.tsx DiceLog + DiceTray), EventFeed, MissionPanel, StratagemPanel, SettingsPanel -> render inside drawers; DiceTray stays visible but compact (it's the roll animation — keep it on screen, small, not covering the bottom sheet). Toasts/PhaseBanner/VpToast: smaller and placed so they never cover the bottom sheet's buttons. WeaponPanel/RerollTray: if they are decision-time panels, fit within the bottom-sheet zone (full width, internal scroll, 44px rows). EndScreen fits 852x393 and 667x375.
4. App.tsx's overlay layer is inset by the --safe-* vars, so full-screen backdrops inside it (e.g. DiceTableOverlay) leave notch-width strips — make such backdrops extend to the true edges (negative safe-area margins or render them outside the inset layer) while their content stays inside the safe area.
Return JSON: ok, summary (<=60 words), files, issues.` },
      { key: 'prompt', prompt: `${COMMON}
COMPACT LAYOUT ZONES (all three agents follow these; desktop untouched): top bar (<= 44px + --safe-top) — bottom sheet for DecisionPrompt (full width between safe areas, max 45dvh, collapsible) — right-edge drawers (another agent) — unit chip top-left — camera buttons right edge.
You own ONLY: src/client/ui/DecisionPrompt.tsx (1800+ lines — grep and read sections; do not rewrite wholesale) and any small new file src/client/ui/BottomSheet.tsx.
When useFormFactor().compact: DecisionPrompt (width 460, maxWidth calc(100vw-440px) ~:1060; side panels 230 and 300 wide ~:1093/:1125) renders as a bottom sheet: full width inside safe areas, max-height 45dvh with internal scroll, a drag handle / chevron that collapses it to a one-line summary (title + primary action) so the board is visible, side panels become tabs or stacked sections inside the sheet, all choice buttons >= 44px tall, primary action always visible (sticky at the sheet bottom). Hover-to-highlight (~:1783-1791, highlights a unit/objective on the board and shows delayed help cards) gets a touch equivalent: first tap on a choice highlights + shows help, a second tap (or an explicit button) chooses — only on touch; desktop keeps hover + click.
Return JSON: ok, summary (<=60 words), files, issues.` },
      { key: 'cards', prompt: `${COMMON}
COMPACT LAYOUT ZONES (all three agents follow these; desktop untouched): top bar (<= 44px + --safe-top) — bottom sheet for decisions — right-edge drawers — unit chip top-left under the top bar — camera buttons right edge.
You own ONLY: src/client/ui/UnitCard.tsx, src/client/ui/UnitCardTooltip.tsx, src/client/ui/UnitDatasheet.tsx, src/client/ui/FormationPicker.tsx, src/client/ui/StartScreen.tsx and the army picker / pre-game setup components it renders (grep for their paths; take ownership of those files only).
When useFormFactor().compact: UnitCard (left:12 top:70 width:220) becomes a chip (name + wounds/models remaining + a status dot) that expands on tap into the full card as an overlay (max 60dvh, scroll); UnitDatasheet opens full-screen with a 44px close button and scrolls; FormationPicker fits the bottom zone without covering the confirm bar (data-testid touch-action-bar, bottom-centre). Pre-game screens (army picker, mission/deployment setup, formation choice): usable in phone portrait AND landscape at 667x375 — single column, scrollable, 44px targets, nothing cut off.
Return JSON: ok, summary (<=60 words), files, issues.` },
    ],
    followUp: null,
    shipExtra: 'Extend tests/e2e/mobile-smoke.spec.ts: in battle, open and close each drawer from the top bar, collapse/expand the decision sheet, and take e2e-out/mobile-<project>-05-drawer.png and -06-sheet-collapsed.png. Also take a desktop screenshot e2e-out/desktop-hud.png in the chromium run and compare it by eye with the layout described in STATUS.md — desktop must be unchanged. Add a two-finger camera check to tests/e2e/mobile-touch.spec.ts (pixel only): CDP Input.dispatchTouchEvent with two touchPoints doing a pinch-out then a twist; assert window.__malletCamera / the camera distance and azimuth changed and that no board selection or move started.',
  },
  polish: {
    title: 'phone polish — tidier staged-move stack, camera buttons, label sizes, full-turn phone playthrough',
    build: [
      { key: 'stack', prompt: `${COMMON}
The compact HUD exists (top bar, BottomSheet DecisionPrompt, right drawers in compactSheets.ts, a 2x3 camera button grid top-right, TouchActionBar bottom-centre, FormationPicker strip). Known problems from phone screenshots (852x393 and 667x375):
- With a staged move, FormationPicker strip + collapsed sheet + TouchActionBar stack up to ~half of a 375px-tall screen, and the strip overlaps the camera grid's bottom-right button.
- The 2x3 camera grid is bulky.
- TouchActionBar applies --safe-bottom twice (it sits inside App.tsx's already-inset overlay layer).
- On 667x375 the DecisionPrompt info block takes ~84px of the ~123px sheet body, clipping WeaponPanel's Fire row.
You own ONLY: src/client/ui/FormationPicker.tsx, src/client/ui/Hud.tsx, src/client/ui/TouchActionBar.tsx, src/client/ui/DecisionPrompt.tsx (grep, don't read whole), src/client/ui/BottomSheet.tsx, src/client/ui/WeaponPanel.tsx.
In compact only: (1) while a move/placement is staged, auto-collapse the sheet to its one-line summary and merge the formation controls INTO the TouchActionBar row or a single slim (<= 52px) horizontally-scrolling strip directly above it — total bottom stack <= 120px on 375px-tall screens; (2) camera buttons: a slim vertical column (rotate L, rotate R, zoom in, zoom out, top-down; ~40px wide, 44px tall targets) on the right edge below the top bar, hidden while a drawer is open and never overlapped by bottom UI (shrink to rotate+top-down when height < 400); (3) fix the double safe-bottom; (4) collapse the DecisionPrompt info block to one line with a "more" toggle whenever WeaponPanel (or any action panel) is open so the action row is fully visible at 667x375. Desktop unchanged.
Return JSON: ok, summary (<=60 words), files, issues.` },
      { key: 'labels', prompt: `${COMMON}
You own ONLY: the in-world label/status components that use drei <Html> (grep '<Html' under src/client/board and src/client/figures; take ownership of those files only), src/client/ui/UnitDatasheet.tsx, src/client/ui/PainterPanel.tsx.
(1) Unit name labels ("Terminator Squad · 9 wounds") grow huge when a phone camera zooms in close: clamp their on-screen size (e.g. distanceFactor with a min/max scale, or a fixed pixel size) so they stay readable but never exceed ~1/3 of screen width; in compact, shorten them (name truncation, smaller font) and keep status icons tappable (>= 32px hit area, they're secondary). Desktop look unchanged at the default camera distance. (2) Open UnitDatasheet and PainterPanel at 852x393 and 667x375 with ?ff=compact (Playwright script in your scratch area, not committed, chromium is fine) — fix anything clipped, unscrollable or under the notch. Keep perf: no per-frame React state.
Return JSON: ok, summary (<=60 words), files, issues.` },
    ],
    followUp: null,
    shipExtra: 'Then do ONE phone playthrough: add tests/e2e/mobile-playthrough.spec.ts (iphone-pro project only; test.skip on others) that starts a game vs Bot with fast/instant animations, and drives the human side through deployment and at least one full battle round (command, movement, shooting, charge, fight) using only taps/clicks on visible UI in the compact layout (page.mouse clicks are fine on WebKit; use the bottom sheet, TouchActionBar Confirm and End phase). Screenshot each phase to e2e-out/mobile-play-<nn>-<phase>.png. Every point where the player could not proceed using visible UI is a blocker: fix up to 4 blockers in src (minimal, compact-only), list the rest in issues. Also re-run the iphone-se smoke and confirm its battle screenshot shows the board (not black) — wait for the canvas to render before the screenshot.',
  },
  polish2: {
    title: 'phone polish 2 — labels stay under the HUD, overview camera after deployment, label de-overlap',
    build: [
      { key: 'labels2', prompt: `${COMMON}
You own ONLY: src/client/interaction/UnitLabels.tsx, src/client/interaction/UnitStatusIcons.tsx, src/client/interaction/labelScale.ts, objective label component(s) (grep '<Html' for the objective name/score labels; own those files only), src/client/board/CameraRig.tsx, src/client/ui/DecisionPrompt.tsx (only the compact deploy focusCamera call — grep focusCamera).
1. drei <Html> labels (unit names, objective "South A4 B0") currently draw OVER the HUD top bar and bottom sheet on phones. Make every in-world label render beneath all HUD UI on every form factor (drei Html zIndexRange e.g. [5, 0] while the HUD overlay is zIndex 10+, or equivalent) and, in compact, hide labels whose screen position is inside the top bar or bottom stack zones.
2. In compact, picking a unit to deploy calls focusCamera on the zone centroid and leaves the camera ~16" out for the rest of the game. When the deployment phase ends (or the human's last unit is deployed), ease back to the default overview framing — compact only.
3. In compact, when two unit labels overlap on screen, keep the selected/nearer one and fade the other to 25% (cheap screen-space check, throttled to a few times a second, no per-frame React state). Desktop unchanged.
Return JSON: ok, summary (<=60 words), files, issues.` },
    ],
    followUp: null,
    shipExtra: 'Also: add tests/e2e/__shots__/ to .gitignore; add a w11-mobile.js row to the HANDOFF.md workflow table (stages shell/touch/hud/polish/polish2 done, args { stage, root, branch, attribution }) and a short "Phones (M11)" note in HANDOFF.md: compact layout gated by src/client/ui/formFactor.ts (?ff=compact to force on desktop), touch camera in src/client/board/touchCamera.ts, mobile Playwright projects iphone-se/iphone-pro/pixel, GLB compression deferred until a real phone crashes. Include HANDOFF.md and .gitignore in the commit. Re-run mobile-playthrough.spec.ts on iphone-pro and confirm no label draws over the top bar in its screenshots.',
  },
}

const S = STAGES[STAGE]
if (!S) throw new Error(`unknown stage ${STAGE}`)

phase('Build')
const built = await parallel(S.build.map(b => () => agent(b.prompt, { label: `build:${b.key}`, phase: 'Build', schema: RESULT, model: 'sonnet' })))

let follow = null
if (S.followUp) {
  phase('Follow-up')
  follow = await agent(S.followUp.prompt, { label: `build:${S.followUp.key}`, phase: 'Follow-up', schema: RESULT, model: 'sonnet' })
}

phase('Ship')
const ship = await agent(SHIP(S.title, S.shipExtra), { label: `ship:${STAGE}`, phase: 'Ship', schema: RESULT, model: 'sonnet' })

return {
  stage: STAGE,
  built: [...built, follow].filter(Boolean).map(b => ({ ok: b.ok, summary: b.summary, issues: b.issues.slice(0, 3) })),
  ship: ship && { ok: ship.ok, summary: ship.summary, screenshots: ship.files.filter(f => f.endsWith('.png')), issues: ship.issues },
}
