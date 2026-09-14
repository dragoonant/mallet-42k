// Top-level screen switch (docs/spec/50-client.md). Start screen until a game exists, then the 3D
// scene with the HUD/prompt overlays on top; the end screen layers over the (still-rendered) board
// so the final position stays visible behind it.
import { useState, type CSSProperties } from 'react'
import { Scene } from './Scene'
import { useGameStore } from './store/game'
import { useUiStore } from './ui/uiStore'
import { StartScreen, Hud, UnitCard, DiceLog, EventFeed, Toast, EndScreen, DecisionPrompt } from './ui'

const overlayLayer: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

export function App() {
  const [screen, setScreen] = useState<'start' | 'game'>('start')
  const state = useGameStore((s) => s.state)
  const resetAll = useUiStore((s) => s.resetAll)

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
      <Scene />
      <div style={overlayLayer}>
        <Hud />
        <UnitCard />
        <DiceLog />
        <EventFeed />
        <DecisionPrompt />
        <Toast />
      </div>
      <EndScreen onPlayAgain={() => setScreen('start')} />
    </div>
  )
}
