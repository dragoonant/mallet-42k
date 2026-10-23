// Top-level screen switch (docs/spec/50-client.md). Start screen until a game exists, then the 3D
// scene with the HUD/prompt overlays on top; the end screen layers over the (still-rendered) board
// so the final position stays visible behind it.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Scene } from './Scene'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { StartScreen, Hud, UnitCard, DiceLog, EventFeed, Toast, VpToast, PhaseBanner, EndScreen, DecisionPrompt, StratagemPanel, SettingsPanel, PainterPanel } from './ui'
import { FigureGalleryStage } from './figures'
import { applyPaintFromUrl } from './figures/paint'
import type { Pose } from './figures'
import { DiceTray, DiceTableOverlay } from './dice'
import { audio } from './audio'
import { PresentationDirector } from './presentation'
import { scenarioFromUrl, startScenario } from './dev/scenarios'
import { spikeMode } from '../spike/flag'
import { startSpikeGame } from '../spike/driver'
import { PerfOverlay } from '../spike/PerfOverlay'
import { RotatePrompt } from './ui/RotatePrompt'
import { TouchActionBar } from './ui/TouchActionBar'
import { useFormFactor } from './ui/formFactor'

// zIndex 10 puts every HUD panel above the board's drei <Html> labels (their zIndexRange is capped at 5).
// Inset by the device safe areas (notch / home indicator; all 0px on desktop) so HUD panels anchored to the
// edges stay out of those zones.
const overlayLayer: CSSProperties = {
  position: 'absolute',
  top: 'var(--safe-top, 0px)',
  right: 'var(--safe-right, 0px)',
  bottom: 'var(--safe-bottom, 0px)',
  left: 'var(--safe-left, 0px)',
  pointerEvents: 'none',
  zIndex: 10,
}

// Right-hand rail: the Dice Log with the dice tray stacked directly under it. The tray used to sit
// bottom-centre, i.e. behind the decision prompt — owner playtest: "dice rolls are being done behind
// the choice box at the bottom of the screen". Stacking them in one flex column (rather than giving
// the tray a fixed `top`) keeps the tray under the log whether the log is collapsed or expanded.
// Its `top` is not a constant: the right-hand player badge above it grows with the army's pools (Pain
// tokens, Cabal points, Miracle dice — a four-line Drukhari badge is taller than a two-line Marine one),
// and a fixed 70px put the Dice Log over the badge's VP line. `useRightRailTop` measures the badge and
// keeps the rail just beneath it, so it also drops out of the way when the VP breakdown is open.
const RIGHT_RAIL_MIN_TOP = 70
const RIGHT_RAIL_GAP = 8
const rightRail: CSSProperties = {
  position: 'absolute',
  right: 12,
  top: RIGHT_RAIL_MIN_TOP,
  width: 200,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 8,
  pointerEvents: 'none',
  zIndex: 20,
}

/** Top offset for the right rail: the bottom edge of the right-hand player badge (`data-hud-badge="B"`
 *  in Hud.tsx) plus a gap, measured against the rail's own containing layer; never above the old
 *  fixed 70px. Re-measured whenever the badge resizes (pool lines appear, VP breakdown opens) or the
 *  window does. Falls back to 70px until the badge exists. */
function useRightRailTop(railRef: { current: HTMLDivElement | null }): number {
  const [top, setTop] = useState(RIGHT_RAIL_MIN_TOP)
  useEffect(() => {
    const rail = railRef.current
    const badge = document.querySelector<HTMLElement>('[data-hud-badge="B"]')
    const layer = rail?.offsetParent as HTMLElement | null
    if (!rail || !badge || !layer) return
    const measure = () => {
      const bottom = badge.getBoundingClientRect().bottom - layer.getBoundingClientRect().top
      setTop(Math.max(RIGHT_RAIL_MIN_TOP, Math.round(bottom + RIGHT_RAIL_GAP)))
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(badge)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  })
  return top
}

/** Desktop right rail: Dice Log over dice tray, anchored under the right-hand player badge. */
function RightRail() {
  const ref = useRef<HTMLDivElement>(null)
  // Re-render (and so re-find the badge) when a new game swaps the B badge out, or its pools change.
  useGameStore((s) => s.state?.players.B)
  const top = useRightRailTop(ref)
  return (
    <div ref={ref} style={{ ...rightRail, top }} data-testid="right-rail">
      <DiceLog />
      <DiceTray />
    </div>
  )
}

// Compact (phone) layout: no right rail. The dice log moves into a drawer (it renders itself there) and the
// dice tray stays on screen as a small panel under the top bar, top-centre: clear of the unit chip
// (top-left), the camera buttons (top-right), the toasts and the bottom sheet (full width, bottom).
const compactDiceSlot: CSSProperties = {
  position: 'absolute',
  top: 50,
  left: '50%',
  width: 240,
  transform: 'translateX(-50%) scale(0.85)',
  transformOrigin: 'top center',
  pointerEvents: 'none',
  zIndex: 20,
}

// Full-bleed layer for dialogs whose backdrop must reach the true screen edges: the overlay layer above is
// inset by the safe areas, so a backdrop inside it would leave notch-width strips. This sits just above it.
const fullBleedLayer: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11 }

// e2e/dev hook: exposes the two client stores on `window` so Playwright can drive/inspect the game
// directly (e.g. dispatch deployment actions, read deployed model positions) instead of simulating
// fragile mouse gestures. Harmless in production — just two store references, no behaviour change.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __mallet?: { useGameStore: typeof useGameStore; useUiStore: typeof useUiStore } }).__mallet = {
    useGameStore,
    useUiStore,
  }
}

const VALID_POSES: Pose[] = ['idle', 'walk', 'shoot', 'melee', 'death']

/** Dev/QA-only view: `?gallery` (optionally `&pose=<idle|walk|shoot|melee|death>` and
 *  `&faction=<sm|ork|necrons|astra-militarum>`) renders every figure archetype in a row instead of the normal app, so the
 *  procedural SD figure kit (src/client/figures) can be eyeballed without starting a game. */
function useGalleryQuery(): { active: boolean; pose?: Pose; faction?: string } {
  if (typeof window === 'undefined') return { active: false }
  const params = new URLSearchParams(window.location.search)
  if (!params.has('gallery')) return { active: false }
  const poseParam = params.get('pose')
  const pose = VALID_POSES.includes(poseParam as Pose) ? (poseParam as Pose) : undefined
  const faction = params.get('faction') ?? undefined
  return { active: true, pose, faction }
}

export function App() {
  const spike = spikeMode()
  const [screen, setScreen] = useState<'start' | 'game'>(spike ? 'game' : 'start')
  const state = useGameStore((s) => s.state)
  const resetAll = useUiStore((s) => s.resetAll)
  const painterOpen = useUiStore((s) => s.painterOpen)
  const { compact } = useFormFactor()
  const togglePainter = useUiStore((s) => s.togglePainter)
  const painterFactions = state ? [...new Set(Object.values(state.players).map((pl) => pl.faction))].map((id) => ({ id, label: id })) : []

  // Unlocks audio on the player's first click/tap/key, anywhere in the app — harmless to call more
  // than once and safe to call before a game exists (the manager just preloads and waits).
  useEffect(() => {
    audio.attachAutoUnlock()
  }, [])

  useEffect(() => {
    if (spike) void startSpikeGame()
  }, [spike])

  // Dev/QA: `?scenario=<name>` opens straight into a test position (src/client/dev/scenarios.ts).
  useEffect(() => {
    const name = scenarioFromUrl()
    if (!name) return
    startScenario(name).then(() => { resetAll(); setScreen('game') }, (e) => console.error('[scenario]', e))
  }, [resetAll])

  const gallery = useGalleryQuery()
  if (gallery.active) {
    applyPaintFromUrl()
    return (
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        <FigureGalleryStage pose={gallery.pose} faction={gallery.faction} />
      </div>
    )
  }

  if (spike && !state) return null
  if (screen === 'start' || !state) {
    return (
      <StartScreen
        onStarted={() => {
          resetAll()
          setScreen('game')
        }}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <PresentationDirector />
      <Scene />
      {spike && <PerfOverlay />}
      <div style={overlayLayer}>
        <Hud />
        <UnitCard />
        {compact ? (
          <>
            <DiceLog />
            <div style={compactDiceSlot}>
              <DiceTray />
            </div>
          </>
        ) : (
          <RightRail />
        )}
        <EventFeed />
        <DiceTableOverlay />
        <StratagemPanel />
        <DecisionPrompt />
        <TouchActionBar />
        <Toast />
        <VpToast />
        <PhaseBanner />
        <SettingsPanel />
      </div>
      {painterOpen && (
        <div style={fullBleedLayer}>
          <PainterPanel factions={painterFactions} initialFaction={painterFactions[0]?.id} onClose={togglePainter} />
        </div>
      )}
      <EndScreen onPlayAgain={() => setScreen('start')} />
      <RotatePrompt />
    </div>
  )
}
