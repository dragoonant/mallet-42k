// Pre-game setup modal (docs/spec/50-client.md §5 "Setup"). Owner faction picks a side, mission,
// secondary, and opponent, then Start kicks off useGameStore.newGame() — loadBundle() also happens
// there, but this screen loads the same (memoized) bundle itself so the mission/secondary pickers can
// show real names and text before a game exists.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { loadBundle } from '../../data'
import type { DataBundle } from '../../data/types'
import { AI_DIFFICULTY_OPTIONS, DEFAULT_AI_DIFFICULTY, FACTION_ID, useGameStore, type AiDifficulty, type FactionKey, type OpponentKind } from '../store/game'
import { primaryScoringSummary } from './labels'
import { buttonActive, buttonBase, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

const FACTIONS: { key: FactionKey; label: string; blurb: string }[] = [
  { key: 'space-marines', label: 'Space Marines', blurb: 'Elite armoured warriors, few in number, strong in every fight.' },
  { key: 'orks', label: 'Orks', blurb: 'A rowdy green tide that hits harder the more of them are left standing.' },
]

const MISSION_IDS = ['cp-01', 'cp-02', 'cp-03', 'cp-04', 'cp-05', 'cp-06']

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Title art (public/assets/ui/title-bg.webp, 1024x572) carries the logo and subtitle in its top-centre
// ~42%. The art is pinned to the top and sized to cover; the spacer matches where the subtitle ends at
// that size, so the setup panel always starts below it. On portrait screens the art is drawn at 180vw
// wide instead of height-cover, so the whole logo stays on screen rather than being cropped at the sides.
const TITLE_BG = `${import.meta.env.BASE_URL}assets/ui/title-bg.webp`
const layoutCss = `
.ss-overlay { position: fixed; inset: 0; overflow-y: auto; font-family: ${fontStack}; color: ${colors.text};
  background: #08080c url(${TITLE_BG}) center top / cover no-repeat; }
.ss-overlay::before { content: ''; position: fixed; inset: 0; pointer-events: none;
  background: linear-gradient(to bottom, transparent 0%, transparent 38%, rgba(6,6,10,0.55) 60%, rgba(6,6,10,0.85) 100%); }
.ss-spacer { height: max(25.5vw, 46vh); }
.ss-card { position: relative; margin: 0 auto 24px; width: 820px; max-width: calc(100% - 32px); box-sizing: border-box; }
.ss-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; }
.ss-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
@media (max-aspect-ratio: 1/1) {
  .ss-overlay { background-size: 180vw auto; }
  .ss-spacer { height: 46vw; }
}
@media (max-width: 700px) { .ss-grid { grid-template-columns: 1fr; } }
`

const card: CSSProperties = { ...panel, background: 'rgba(12, 12, 18, 0.86)', padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
const label: CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.muted, marginBottom: -6 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const select: CSSProperties = { ...buttonBase, cursor: 'pointer', width: '100%' }
const input: CSSProperties = { ...buttonBase, flex: 1, cursor: 'text' }
const blurb: CSSProperties = { ...mutedText, marginTop: -8 }
const errorText: CSSProperties = { color: colors.danger, fontSize: 13 }
const missionBlurb: CSSProperties = { ...mutedText, marginTop: -6, fontSize: 12 }
const missionList: CSSProperties = { margin: '2px 0 0', paddingLeft: 16, fontSize: 11.5, color: colors.muted }
const secondaryCard: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, textAlign: 'left' as const }

export function StartScreen({ onStarted }: { onStarted: () => void }) {
  const newGame = useGameStore((s) => s.newGame)
  const loading = useGameStore((s) => s.loading)
  const error = useGameStore((s) => s.error)
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [faction, setFaction] = useState<FactionKey>('space-marines')
  const [opponent, setOpponent] = useState<OpponentKind>('bot')
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY)
  const [mission, setMission] = useState('cp-01')
  const [secondaryId, setSecondaryId] = useState<string>('')
  const [seed, setSeed] = useState<string>(() => randomSeed())

  useEffect(() => {
    let cancelled = false
    void loadBundle().then((b) => {
      if (!cancelled) setBundle(b)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const activeFaction = FACTIONS.find((f) => f.key === faction)!
  const missionData = bundle?.missions[`mission.${mission}`]
  const patrol = useMemo(() => {
    if (!bundle) return undefined
    const factionId = FACTION_ID[faction]
    return Object.values(bundle.patrols).find((p) => p.faction === factionId)
  }, [bundle, faction])

  // The secondary picker resets to the patrol's default whenever the faction changes (a previous
  // pick may not exist for the new patrol).
  useEffect(() => {
    setSecondaryId(patrol?.secondaries.find((s) => s.default)?.id ?? patrol?.secondaries[0]?.id ?? '')
  }, [patrol])

  const start = async () => {
    try {
      await newGame({
        playerFaction: faction,
        opponent,
        mission: `mission.${mission}`,
        seed,
        secondaryId: secondaryId || undefined,
        difficulty: opponent === 'bot' ? difficulty : undefined,
      })
      onStarted()
    } catch {
      // error surfaced via store.error below
    }
  }

  return (
    <div className="ss-overlay" data-testid="start-screen">
      <style>{layoutCss}</style>
      <h1 style={srOnly}>Mallet 42,000 — SD Assault: Galaxy in Conflict</h1>
      <div className="ss-spacer" />
      <div className="ss-card" style={card}>
        <div className="ss-grid">
        <div className="ss-col">

        <div style={label}>Your Faction</div>
        <div style={row} data-testid="setup-patrol-A">
          {FACTIONS.map((f) => (
            <button key={f.key} style={f.key === faction ? buttonActive : buttonBase} onClick={() => setFaction(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <p style={blurb}>{activeFaction.blurb}</p>

        <div style={label}>Mission</div>
        <select style={select} value={mission} data-testid="setup-mission" onChange={(e) => setMission(e.target.value)}>
          {MISSION_IDS.map((id) => (
            <option key={id} value={id}>
              {bundle?.missions[`mission.${id}`]?.name ?? `Combat Patrol — ${id.toUpperCase()}`}
            </option>
          ))}
        </select>
        {missionData?.text && <p style={missionBlurb}>{missionData.text}</p>}
        {missionData && (
          <ul style={missionList} data-testid="setup-mission-scoring">
            {primaryScoringSummary(missionData).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}

        </div>
        <div className="ss-col">
        {patrol && patrol.secondaries.length > 0 && (
          <>
            <div style={label}>Your Secondary</div>
            <div style={row} data-testid="setup-secondary">
              {patrol.secondaries.map((s) => (
                <button key={s.id} style={s.id === secondaryId ? buttonActive : buttonBase} onClick={() => setSecondaryId(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
            {patrol.secondaries.find((s) => s.id === secondaryId) && (
              <div style={secondaryCard}>{patrol.secondaries.find((s) => s.id === secondaryId)!.text}</div>
            )}
          </>
        )}

        <div style={label}>Opponent</div>
        <div style={row} data-testid="setup-patrol-B">
          <button style={opponent === 'bot' ? buttonActive : buttonBase} onClick={() => setOpponent('bot')}>
            Bot
          </button>
          <button style={opponent === 'hotseat' ? buttonActive : buttonBase} onClick={() => setOpponent('hotseat')}>
            Hotseat (pass the device)
          </button>
        </div>

        {opponent === 'bot' && (
          <>
            <div style={label}>Bot Strength</div>
            <div style={row} data-testid="setup-difficulty">
              {AI_DIFFICULTY_OPTIONS.map((d) => (
                <button key={d.key} style={d.key === difficulty ? buttonActive : buttonBase} onClick={() => setDifficulty(d.key)}>
                  {d.label}
                </button>
              ))}
            </div>
            <p style={blurb}>{AI_DIFFICULTY_OPTIONS.find((d) => d.key === difficulty)?.blurb}</p>
          </>
        )}

        <div style={label}>Seed</div>
        <div style={row}>
          <input style={input} data-testid="setup-seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button style={buttonBase} onClick={() => setSeed(randomSeed())}>
            Reroll
          </button>
        </div>

        </div>
        </div>

        {error && <p style={errorText}>{error}</p>}

        <button style={{ ...buttonPrimary, marginTop: 8, padding: '12px 16px', fontSize: 15 }} data-testid="start-game" disabled={loading} onClick={() => void start()}>
          {loading ? 'Loading…' : 'Start Battle'}
        </button>
      </div>
    </div>
  )
}
