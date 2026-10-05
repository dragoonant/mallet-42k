// Pre-game setup modal (docs/spec/50-client.md §5 "Setup"). Owner faction picks a side, mission,
// secondary, and opponent, then Start kicks off useGameStore.newGame() — loadBundle() also happens
// there, but this screen loads the same (memoized) bundle itself so the mission/secondary pickers can
// show real names and text before a game exists.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { loadBundle } from '../../data'
import type { DataBundle } from '../../data/types'
import { AI_DIFFICULTY_OPTIONS, DEFAULT_AI_DIFFICULTY, resolveFactionId, splittablePatrolRefs, useGameStore, type AiDifficulty, type FactionKey, type OpponentKind } from '../store/game'
import { primaryScoringSummary } from './labels'
import { PainterPanel } from './PainterPanel'
import { buttonActive, buttonBase, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

// Own-words one-liners per faction id. A faction with no entry here still appears (name only), so a new
// faction in the data bundle is selectable before anyone writes it a blurb.
const FACTION_BLURBS: Record<string, string> = {
  sm: 'Elite armoured warriors, few in number, strong in every fight.',
  ork: 'A rowdy green tide that hits harder the more of them are left standing.',
  necrons: 'Ancient metal soldiers that shrug off damage and climb back to their feet turn after turn.',
  'chaos-space-marines': 'Fallen warriors who bargain with dark powers: stronger shots and blows, paid for in their own blood.',
  tyranids: 'A ravenous swarm that leaps, spits and keeps coming — losing a few hundred claws never slows the brood.',
  'adepta-sororitas': 'Armoured battle-nuns who pray for lucky dice: save Miracle dice and swap them in for a crucial roll.',
}

// Button order for the factions the game ships; any other faction in the bundle follows alphabetically.
const FACTION_ORDER = ['sm', 'ork', 'necrons', 'chaos-space-marines', 'tyranids', 'adepta-sororitas', 'astra-militarum']

interface FactionChoice {
  id: string
  label: string
  blurb: string
}

const MISSION_IDS = ['cp-01', 'cp-02', 'cp-03', 'cp-04', 'cp-05', 'cp-06']

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Title art (public/assets/ui/title-bg.webp, 1024x572) carries the logo and subtitle between ~8% and
// ~42% of its height. The art is drawn at height --art (whole image visible, never wider-than-screen
// scaling), shifted up 8% to drop the empty sky, with a blurred copy filling any side gutters. The
// spacer ends just under the subtitle and the setup panel fills the rest of the screen, scrolling
// inside itself with Start Battle pinned at the bottom, so the page never needs scrolling.
// Portrait screens draw the art at 180vw wide so the logo stays large enough to read.
const TITLE_BG = `${import.meta.env.BASE_URL}assets/ui/title-bg.webp`
const layoutCss = `
.ss-overlay { --art: min(100vh, 55.86vw); position: fixed; inset: 0; overflow-y: auto; font-family: ${fontStack};
  color: ${colors.text}; background: #08080c; display: flex; flex-direction: column; }
.ss-overlay::before { content: ''; position: fixed; inset: -40px; pointer-events: none;
  background: url(${TITLE_BG}) center / cover no-repeat; filter: blur(18px) brightness(0.45); }
.ss-overlay::after { content: ''; position: fixed; inset: 0; pointer-events: none;
  background: url(${TITLE_BG}) center calc(var(--art) * -0.08) / auto var(--art) no-repeat; }
.ss-spacer { flex: none; height: calc(var(--art) * 0.36); }
.ss-card { position: relative; z-index: 1; margin: 0 auto 16px; width: 1180px; max-width: calc(100% - 32px);
  box-sizing: border-box; flex: 1 1 auto; min-height: 300px; max-height: calc(100vh - var(--art) * 0.36 - 16px); }
.ss-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 26px; overflow-y: auto;
  min-height: 0; flex: 1 1 auto; padding-right: 4px; }
.ss-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@media (max-width: 1100px) { .ss-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px) { .ss-grid { grid-template-columns: 1fr; } }
@media (max-aspect-ratio: 1/1) {
  .ss-overlay { --art: 100vw; }
  .ss-overlay::after { background-size: 180vw auto; }
  .ss-card { max-height: none; overflow: visible; }
  .ss-grid { overflow: visible; }
}
`

const card: CSSProperties = { ...panel, background: 'rgba(12, 12, 18, 0.86)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }
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
  // '' = automatic (the first other faction); otherwise a faction id, which may equal your own (mirror match).
  const [opponentFaction, setOpponentFaction] = useState<string>('')
  const [opponent, setOpponent] = useState<OpponentKind>('bot')
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY)
  const [mission, setMission] = useState('cp-01')
  const [secondaryId, setSecondaryId] = useState<string>('')
  const [seed, setSeed] = useState<string>(() => randomSeed())
  const [splitA, setSplitA] = useState(false)
  const [splitB, setSplitB] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadBundle().then((b) => {
      if (!cancelled) setBundle(b)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Every faction in the bundle that has a Combat Patrol, known ones first in a fixed order.
  const factions = useMemo<FactionChoice[]>(() => {
    if (!bundle) return []
    const ids = Object.keys(bundle.factions).filter((id) => Object.values(bundle.patrols).some((p) => p.faction === id))
    ids.sort((x, y) => {
      const ix = FACTION_ORDER.indexOf(x)
      const iy = FACTION_ORDER.indexOf(y)
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y)
    })
    return ids.map((id) => ({ id, label: bundle.factions[id].name, blurb: FACTION_BLURBS[id] ?? '' }))
  }, [bundle])
  const [painting, setPainting] = useState(false)
  const factionId = resolveFactionId(faction)
  const activeFaction = factions.find((f) => f.id === factionId)
  const missionData = bundle?.missions[`mission.${mission}`]
  const patrol = useMemo(() => {
    if (!bundle) return undefined
    return Object.values(bundle.patrols).find((p) => p.faction === factionId)
  }, [bundle, factionId])

  // The secondary picker resets to the patrol's default whenever the faction changes (a previous
  // pick may not exist for the new patrol).
  useEffect(() => {
    setSecondaryId(patrol?.secondaries.find((s) => s.default)?.id ?? patrol?.secondaries[0]?.id ?? '')
  }, [patrol])

  // Patrol Squads that are split at setup (Sororitas); AM/Tyranids get the engine's own prompt at deployment instead.
  const canSplitA = !!bundle && splittablePatrolRefs(bundle, faction).length > 0
  const canSplitB = !!bundle && opponent === 'hotseat' && !!opponentFaction && splittablePatrolRefs(bundle, opponentFaction).length > 0

  const start = async () => {
    try {
      await newGame({
        playerFaction: faction,
        opponentFaction: opponentFaction || undefined,
        opponent,
        mission: `mission.${mission}`,
        seed,
        secondaryId: secondaryId || undefined,
        splitSquads: canSplitA && splitA,
        opponentSplitSquads: canSplitB && splitB,
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
          {factions.map((f) => (
            <button key={f.id} style={f.id === factionId ? buttonActive : buttonBase} onClick={() => setFaction(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {activeFaction?.blurb && <p style={blurb}>{activeFaction.blurb}</p>}

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

        {canSplitA && (
          <label style={blurb} data-testid="setup-split-A">
            <input type="checkbox" checked={splitA} onChange={(e) => setSplitA(e.target.checked)} /> Split your Battle Sisters Squad into two units of 5 (Patrol Squads)
          </label>
        )}

        </div>
        <div className="ss-col">
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
        <div style={label}>Opponent</div>
        <div style={row} data-testid="setup-patrol-B">
          <button style={opponent === 'bot' ? buttonActive : buttonBase} onClick={() => setOpponent('bot')}>
            Bot
          </button>
          <button style={opponent === 'hotseat' ? buttonActive : buttonBase} onClick={() => setOpponent('hotseat')}>
            Hotseat (pass the device)
          </button>
        </div>

        <div style={label}>Opponent's Faction</div>
        <select style={select} value={opponentFaction} data-testid="setup-opponent-faction" onChange={(e) => setOpponentFaction(e.target.value)}>
          <option value="">Automatic</option>
          {factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>

        {canSplitB && (
          <label style={blurb} data-testid="setup-split-B">
            <input type="checkbox" checked={splitB} onChange={(e) => setSplitB(e.target.checked)} /> Split Player B's Battle Sisters Squad into two units of 5 (Patrol Squads)
          </label>
        )}

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

        <div style={{ ...row, flex: 'none', flexWrap: 'nowrap' }}>
          <button style={{ ...buttonBase, padding: '12px 16px' }} data-testid="open-painter" onClick={() => setPainting(true)}>
            Paint army
          </button>
          <button style={{ ...buttonPrimary, flex: 1, padding: '12px 16px', fontSize: 15 }} data-testid="start-game" disabled={loading} onClick={() => void start()}>
            {loading ? 'Loading…' : 'Start Battle'}
          </button>
        </div>
      </div>
      {painting && <PainterPanel factions={factions} initialFaction={factionId} onClose={() => setPainting(false)} />}
    </div>
  )
}
