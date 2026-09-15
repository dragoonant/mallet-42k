// Top-level screen switch (docs/spec/50-client.md). Start screen until a game exists, then the 3D
// scene with the HUD/prompt overlays on top; the end screen layers over the (still-rendered) board
// so the final position stays visible behind it.
import { useEffect, useState, type CSSProperties } from 'react'
import { Scene } from './Scene'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { StartScreen, Hud, UnitCard, DiceLog, EventFeed, Toast, VpToast, EndScreen, DecisionPrompt, StratagemPanel, SettingsPanel } from './ui'
import { FigureGalleryStage } from './figures'
import type { Pose } from './figures'
import { DiceTray } from './dice'
import { audio } from './audio'
import { PresentationDirector } from './presentation'

const overlayLayer: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

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
 *  `&faction=<sm|ork>`) renders every figure archetype in a row instead of the normal app, so the
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
  const [screen, setScreen] = useState<'start' | 'game'>('start')
  const state = useGameStore((s) => s.state)
  const resetAll = useUiStore((s) => s.resetAll)

  // Unlocks audio on the player's first click/tap/key, anywhere in the app — harmless to call more
  // than once and safe to call before a game exists (the manager just preloads and waits).
  useEffect(() => {
    audio.attachAutoUnlock()
  }, [])

  const gallery = useGalleryQuery()
  if (gallery.active) {
    return (
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        <FigureGalleryStage pose={gallery.pose} faction={gallery.faction} />
      </div>
    )
  }

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
      <div style={overlayLayer}>
        <Hud />
        <UnitCard />
        <DiceLog />
        <EventFeed />
        <StratagemPanel />
        <DecisionPrompt />
        <Toast />
        <VpToast />
        <DiceTray />
        <SettingsPanel />
      </div>
      <EndScreen onPlayAgain={() => setScreen('start')} />
    </div>
  )
}
