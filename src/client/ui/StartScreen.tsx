// Pre-game setup modal (docs/spec/50-client.md §5 "Setup"). Owner faction picks a side, mission,
// secondary, and opponent, then Start kicks off useGameStore.newGame() — loadBundle() also happens
// there, but this screen loads the same (memoized) bundle itself so the mission/secondary pickers can
// show real names and text before a game exists.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { loadBundle } from '../../data'
import type { DataBundle } from '../../data/types'
import { AI_DIFFICULTY_OPTIONS, DEFAULT_AI_DIFFICULTY, resolveFactionId, patrolsForFaction, resolvePatrol, splittablePatrolRefs, patrolUnitChoices, embarkOptions, RANDOM_UNIT_CHOICE, useGameStore, type AiDifficulty, type FactionKey, type OpponentKind } from '../store/game'
import { primaryScoringSummary } from './labels'
import { phaseLabel, relativeTime, shouldConfirmReplace, type SaveEnvelope } from '../store/saveGame'
import { randomArmyPaint, usePaintStore } from '../figures/paint'
import { PainterPanel } from './PainterPanel'
import { buttonActive, buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

// Own-words one-liners per faction id. A faction with no entry here still appears (name only), so a new
// faction in the data bundle is selectable before anyone writes it a blurb.
const FACTION_BLURBS: Record<string, string> = {
  sm: 'Elite armoured warriors, few in number, strong in every fight.',
  ork: 'A rowdy green tide that hits harder the more of them are left standing.',
  necrons: 'Ancient metal soldiers that shrug off damage and climb back to their feet turn after turn.',
  'chaos-space-marines': 'Fallen warriors who bargain with dark powers: stronger shots and blows, paid for in their own blood.',
  'world-eaters': 'Frenzied axe-and-chain-blade zealots of Khorne: they hit hard the moment they arrive, and each round the Blood God grants blessings that harden them and sharpen their blows.',
  tyranids: 'A ravenous swarm that leaps, spits and keeps coming — losing a few hundred claws never slows the brood.',
  'adepta-sororitas': 'Armoured battle-nuns who pray for lucky dice: save Miracle dice and swap them in for a crucial roll.',
  'tau-empire': 'Sleek gunline soldiers and stealthy battlesuits who mark a target, then pour precise fire into it from afar.',
  'genestealer-cults': 'A secret brood of hooded workers and four-armed hybrids who spring from hiding, led by a psychic magus.',
  'adeptus-custodes': 'Towering golden bodyguards of the Emperor: few in number, nearly unbreakable, and each fight they choose a stance to strike harder.',
  'leagues-of-votann': 'Stocky Kin warriors who keep a grudge ledger: every Votann unit you cut down marks its killer, and marked enemies are easier to hit and wound.',
  aeldari: 'Graceful, fragile seers and skimmers who read the threads of fate: save Fate dice in advance and spend them as the battle unfolds.',
  'grey-knights': 'A small band of silver-armoured psykers who blink across the board and punish anything that lingers.',
  drukhari: 'Cruel raiders on skimmers who feed on the pain they cause: the more your enemy suffers, the better your units fight.',
  'death-guard': 'Plodding, plague-ridden Space Marines and a shambling horde of the infected: hard to kill, and the closer you stand, the worse they make it for you.',
  'adeptus-mechanicus': 'Hooded cyborg skirmishers and sulphur-breathing hounds led by a tech-priest: each round you pick a stance that sharpens either their guns or their advance.',
  'thousand-sons': 'Blue-and-gold sorcerers, armoured Rubric warriors and horned mutants: pool sorcerous power each round and spend it on rituals that bend the odds.',
  'space-wolves': 'Grey-armoured Astartes hunters led by a fierce battle leader: a strong core of rifles and a hard-hitting walker, backed by ambush tactics and sharp senses.',
  'dark-angels': 'Green-armoured Space Marines led by a grim Chaplain: Oath of Moment on a chosen target, jump-pack Inceptors, and a Redemptor Dreadnought to anchor the line. Or take The Vengeful Brethren: Master Zacharial, plasma Hellblasters and stance-switching Bladeguard Veterans.',
  'blood-angels': 'Crimson-armoured sons of Sanguinius: a steady Intercessor line backed by stealthy Incursors, hulking Aggressors and a psychic Librarian, who strike hard whenever a fight turns bloody.',
  deathwatch: 'Black-armoured alien hunters with silver pauldrons: veteran riflemen, a flame-wielding Gravis squad and a battlefield medic, backed by special ammunition and a one-time teleport strike.',
  'black-templars': 'Black-armoured crusaders led by a zealous Marshal: Oath of Moment on a chosen target, a mixed squad of veterans and eager neophytes, and a fast Impulsor that charges its passengers into the fight.',
  'chaos-daemons': 'Red-skinned Khorne daemons who bring a creeping Shadow of Chaos with them: your units in its shade steady and heal, while enemies caught inside it falter and bleed.',
}

// Button order for the factions the game ships; any other faction in the bundle follows alphabetically.
const FACTION_ORDER = ['sm', 'space-wolves', 'deathwatch', 'ork', 'necrons', 'chaos-space-marines', 'world-eaters', 'tyranids', 'adepta-sororitas', 'astra-militarum', 'grey-knights', 'tau-empire', 'genestealer-cults', 'adeptus-custodes', 'leagues-of-votann', 'drukhari', 'aeldari', 'adeptus-mechanicus', 'death-guard', 'thousand-sons', 'chaos-daemons', 'dark-angels', 'blood-angels', 'black-templars']

interface FactionChoice {
  id: string
  label: string
  blurb: string
}

const MISSION_IDS = ['cp-01', 'cp-02', 'cp-03', 'cp-04', 'cp-05', 'cp-06']

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Title art (public/assets/ui/title-bg.webp, 1024x572) fills the whole screen (cover, anchored a little
// above centre so the logo survives cropping). It shows alone for INTRO_MS — a click or key skips it —
// then a dark scrim and the setup card fade in over it. The card is centred and scrolls inside itself
// with Start Battle pinned at the bottom, so the page never needs scrolling. Portrait screens show the
// whole art at full width over a blurred fill instead, since cover would crop the logo away.
const TITLE_BG = `${import.meta.env.BASE_URL}assets/ui/title-bg.webp`
const INTRO_MS = 3000
const layoutCss = `
.ss-overlay { position: fixed; inset: 0; overflow: hidden; font-family: ${fontStack};
  color: ${colors.text}; background: #08080c; display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; padding: var(--safe-top, 0px) var(--safe-right, 0px) var(--safe-bottom, 0px) var(--safe-left, 0px); }
.ss-overlay::before { content: ''; position: fixed; inset: -40px; pointer-events: none;
  background: url(${TITLE_BG}) center / cover no-repeat; filter: blur(18px) brightness(0.45); }
.ss-overlay::after { content: ''; position: fixed; inset: 0; pointer-events: none;
  background: url(${TITLE_BG}) center 30% / cover no-repeat; }
.ss-scrim { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: rgba(4, 4, 8, 0.55);
  opacity: 0; transition: opacity 900ms ease; }
.ss-card { position: relative; z-index: 2; width: 1180px; max-width: calc(100% - 32px); box-sizing: border-box;
  max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px - var(--safe-top, 0px) - var(--safe-bottom, 0px)); opacity: 0; visibility: hidden; transform: translateY(14px);
  transition: opacity 900ms ease, transform 900ms ease, visibility 0s linear 900ms; }
.ss-ready .ss-scrim { opacity: 1; }
.ss-ready .ss-card { opacity: 1; visibility: visible; transform: none; transition: opacity 900ms ease, transform 900ms ease; }
.ss-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 26px; overflow-y: auto;
  min-height: 0; flex: 1 1 auto; padding-right: 4px; }
.ss-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@media (max-width: 1100px) { .ss-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px) { .ss-grid { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .ss-card { max-width: calc(100% - 16px); } }
@media (max-height: 460px) {
  .ss-card { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px - var(--safe-top, 0px) - var(--safe-bottom, 0px)); }
}
@media (max-aspect-ratio: 1/1) {
  .ss-overlay::after { background-size: 100vw auto; background-position: center 30%; }
}
/* Phones (html[data-ff=compact], set by formFactor.ts): one scrolling column, 44px targets, 16px form text so iOS
   does not zoom on focus. Works in portrait and in landscape down to 667x375. */
html[data-ff="compact"] .ss-card { max-width: calc(100% - 16px); padding: 12px !important; gap: 10px !important;
  max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); }
html[data-ff="compact"] .ss-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow-y: auto; overflow-x: hidden;
  overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; padding-right: 0; }
html[data-ff="compact"] .ss-col { gap: 10px; }
html[data-ff="compact"] .ss-card button { min-height: 44px; white-space: normal; text-align: center; touch-action: manipulation; }
html[data-ff="compact"] .ss-card select,
html[data-ff="compact"] .ss-card input[type="text"] { min-height: 44px; font-size: 16px; box-sizing: border-box; }
html[data-ff="compact"] .ss-card input[type="checkbox"] { width: 24px; height: 24px; flex: none; margin: 0; }
html[data-ff="compact"] .ss-check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
html[data-ff="compact"] .ss-field { display: flex; flex-direction: column; gap: 6px; }
html[data-ff="compact"] .ss-card button[aria-pressed] { font-size: 12px !important; }
html[data-ff="compact"] .ss-secondary { font-size: 13px; }
`

// Automated browsers (Playwright) skip the intro so E2E runs don't wait on it.
const skipIntro = typeof navigator !== 'undefined' && navigator.webdriver

const card: CSSProperties = { ...panel, background: 'rgba(12, 12, 18, 0.86)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
const label: CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.muted, marginBottom: -6 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const select: CSSProperties = { ...buttonBase, cursor: 'pointer', width: '100%' }
const input: CSSProperties = { ...buttonBase, flex: 1, cursor: 'text' }
const blurb: CSSProperties = { ...mutedText, marginTop: -8 }
const factionGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }
const factionCard: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 5, fontSize: 11, lineHeight: 1.15, textAlign: 'center', whiteSpace: 'normal', minWidth: 0, overflowWrap: 'anywhere' }
const factionImg: CSSProperties = { width: '100%', maxWidth: 76, aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 4, background: '#f2f2f4', display: 'block' }
const factionRandom: CSSProperties = { ...factionImg, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', color: colors.text, fontSize: 40, fontWeight: 700 }
// Leader portraits (tools/make-leader-portraits.py). Factions without a file show a name-only card.
// Portrait file per runtime faction id; two ids differ from their data folder names (sm, ork).
const LEADER_PORTRAITS: Record<string, string> = {
  sm: 'space-marines', ork: 'orks', necrons: 'necrons', 'adepta-sororitas': 'adepta-sororitas', 'adeptus-custodes': 'adeptus-custodes',
  'astra-militarum': 'astra-militarum', 'genestealer-cults': 'genestealer-cults', 'grey-knights': 'grey-knights',
  'chaos-space-marines': 'chaos-space-marines', 'tau-empire': 'tau-empire', tyranids: 'tyranids',
  'adeptus-mechanicus': 'adeptus-mechanicus', aeldari: 'aeldari', 'black-templars': 'black-templars', 'blood-angels': 'blood-angels',
  'chaos-daemons': 'chaos-daemons', 'dark-angels': 'dark-angels', 'death-guard': 'death-guard', deathwatch: 'deathwatch', drukhari: 'drukhari',
  'leagues-of-votann': 'leagues-of-votann', 'space-wolves': 'space-wolves', 'thousand-sons': 'thousand-sons', 'world-eaters': 'world-eaters',
}
const portraitUrl = (id: string) => `${import.meta.env.BASE_URL}assets/ui/leaders/${LEADER_PORTRAITS[id]}.webp`

function FactionCard({ id, name, active, onPick }: { id: string; name: string; active: boolean; onPick: () => void }) {
  return (
    <button type="button" style={{ ...(active ? buttonActive : buttonBase), ...factionCard }} aria-pressed={active} onClick={onPick}>
      {id === '' ? <span style={factionRandom} aria-hidden="true">?</span>
        : LEADER_PORTRAITS[id] ? <img src={portraitUrl(id)} alt="" style={factionImg} draggable={false} />
          : <span style={{ ...factionRandom, fontSize: 30 }} aria-hidden="true">{name.charAt(0)}</span>}
      <span>{name}</span>
    </button>
  )
}

const saveCard: CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 6, border: `1px solid ${colors.accent}`, background: 'rgba(255,255,255,0.05)' }
const noticeText: CSSProperties = { flex: 'none', margin: 0, padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.05)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }
const confirmBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
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
  // '' = random (any faction with a patrol, your own included, rolled on Start); otherwise a faction id,
  // which may equal your own (mirror match).
  const [opponentFaction, setOpponentFaction] = useState<string>('')
  const [opponent, setOpponent] = useState<OpponentKind>('bot')
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY)
  const [mission, setMission] = useState('cp-01')
  const [secondaryId, setSecondaryId] = useState<string>('')
  const [seed, setSeed] = useState<string>(() => randomSeed())
  const [splitA, setSplitA] = useState(false)
  const [splitB, setSplitB] = useState(false)
  const [ready, setReady] = useState(skipIntro)
  // The game saved on this device (autosaved after every action), if it can still be continued.
  const [saved, setSaved] = useState<SaveEnvelope | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const saveNotice = useGameStore((s) => s.saveNotice)
  const dismissSaveNotice = useGameStore((s) => s.dismissSaveNotice)
  const inspectSave = useGameStore((s) => s.inspectSave)
  const continueSavedGame = useGameStore((s) => s.continueSavedGame)

  useEffect(() => {
    setSaved(inspectSave())
  }, [inspectSave])

  const resume = async () => {
    const ok = await continueSavedGame()
    if (ok) onStarted()
    else setSaved(null) // bad saves were discarded by the store (the notice explains); a data-load failure keeps it
  }

  useEffect(() => {
    if (ready) return
    const show = () => setReady(true)
    const timer = window.setTimeout(show, INTRO_MS)
    window.addEventListener('keydown', show)
    window.addEventListener('pointerdown', show)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', show)
      window.removeEventListener('pointerdown', show)
    }
  }, [ready])

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
  const [patrolId, setPatrolId] = useState('')
  const [opponentPatrolId, setOpponentPatrolId] = useState('')
  const patrolsA = useMemo(() => (bundle ? patrolsForFaction(bundle, faction) : []), [bundle, faction])
  const patrol = useMemo(() => (bundle ? resolvePatrol(bundle, faction, patrolId) : undefined), [bundle, faction, patrolId])
  const patrolsB = useMemo(() => (bundle && opponentFaction ? patrolsForFaction(bundle, opponentFaction) : []), [bundle, opponentFaction])
  // Changing faction resets the patrol to that faction's default.
  useEffect(() => { setPatrolId('') }, [faction])
  useEffect(() => { setOpponentPatrolId('') }, [opponentFaction])

  // The secondary picker resets to the patrol's default whenever the faction changes (a previous
  // pick may not exist for the new patrol).
  useEffect(() => {
    setSecondaryId(patrol?.secondaries.find((s) => s.default)?.id ?? patrol?.secondaries[0]?.id ?? '')
  }, [patrol])

  // Either/or unit slots in the patrol (Grey Knights: Terminators or Dreadknight). A pick is kept per group id; unset = patrol default.
  const [pickA, setPickA] = useState<Record<string, string>>({})
  const [pickB, setPickB] = useState<Record<string, string>>({})
  const choicesA = bundle ? patrolUnitChoices(bundle, faction, patrol?.id) : []
  const choicesB = bundle && opponentFaction ? patrolUnitChoices(bundle, opponentFaction, opponentPatrolId || undefined) : []
  // Start-embarked picks (transport ref -> unit ref), per seat. Only hotseat Player B chooses; a bot seat deploys everything.
  const [embarkA, setEmbarkA] = useState<Record<string, string>>({})
  const [embarkB, setEmbarkB] = useState<Record<string, string>>({})
  const embarkOptsA = bundle ? embarkOptions(bundle, faction, patrol?.id, (splitA && !!bundle && splittablePatrolRefs(bundle, faction, patrol?.id).length > 0)) : []
  const embarkOptsB = bundle && opponent === 'hotseat' && opponentFaction ? embarkOptions(bundle, opponentFaction, opponentPatrolId || undefined, (splitB && splittablePatrolRefs(bundle, opponentFaction, opponentPatrolId || undefined).length > 0)) : []
  useEffect(() => { setEmbarkA({}) }, [faction, patrolId, splitA])
  useEffect(() => { setEmbarkB({}) }, [opponentFaction, opponentPatrolId, splitB])
  const embarkRow = (opts: ReturnType<typeof embarkOptions>, pick: Record<string, string>, setPick: (v: Record<string, string>) => void, who: string) => {
    const transports = [...new Set(opts.map((o) => o.transportRef))]
    return transports.map((t) => {
      const mine = opts.filter((o) => o.transportRef === t)
      const taken = new Set(Object.entries(pick).filter(([k]) => k !== t).map(([, v]) => v))
      return (
        <label key={t} className="ss-field" style={blurb} data-testid={`setup-embark-${who}-${t}`}>
          Start the battle inside your {mine[0].transportName}:{' '}
          <select style={select} value={pick[t] ?? ''} onChange={(e) => { const n = { ...pick }; if (e.target.value) n[t] = e.target.value; else delete n[t]; setPick(n) }}>
            <option value="">Nobody (deploy normally)</option>
            {mine.filter((o) => !taken.has(o.unitRef)).map((o) => <option key={o.unitRef} value={o.unitRef}>{o.unitName} ({o.models} models)</option>)}
          </select>
        </label>
      )
    })
  }
  const embarkList = (pick: Record<string, string>, opts: ReturnType<typeof embarkOptions>) => Object.entries(pick).filter(([t, u]) => opts.some((o) => o.transportRef === t && o.unitRef === u)).map(([transportRef, unitRef]) => ({ unitRef, transportRef }))
  useEffect(() => { setPickA({}) }, [faction, patrolId])
  useEffect(() => { setPickB({}) }, [opponentFaction, opponentPatrolId])
  const refName = (factionKey: string, ref: string, pid?: string): string => {
    const p = bundle ? resolvePatrol(bundle, factionKey, pid) : undefined
    const ds = p?.units.find((u) => u.ref === ref)?.datasheet
    return (ds && bundle?.datasheets[ds]?.name) || ref
  }
  const unitChoiceRow = (factionKey: string, pid: string | undefined, choices: { id: string; refs: string[]; default: string }[], pick: Record<string, string>, setPick: (v: Record<string, string>) => void, who: string) =>
    choices.map((g) => (
      <label key={g.id} className="ss-field" style={blurb} data-testid={`setup-unit-choice-${who}-${g.id}`}>
        {who === 'A' ? 'Your' : opponent === 'bot' ? "The bot's" : "Player B's"} patrol fields:{' '}
        <select style={select} value={pick[g.id] ?? (who === 'B' && opponent === 'bot' ? RANDOM_UNIT_CHOICE : g.default)} onChange={(e) => setPick({ ...pick, [g.id]: e.target.value })}>
          {g.refs.map((r) => <option key={r} value={r}>{refName(factionKey, r, pid)}</option>)}
          <option value={RANDOM_UNIT_CHOICE}>Random</option>
        </select>
      </label>
    ))

  // Patrol Squads that are split at setup (Sororitas); AM/Tyranids get the engine's own prompt at deployment instead.
  const canSplitA = !!bundle && splittablePatrolRefs(bundle, faction, patrol?.id).length > 0
  const splitName = (fk: string, pid?: string): string => { const r = bundle ? splittablePatrolRefs(bundle, fk as FactionKey, pid)[0] : undefined; const u = r ? resolvePatrol(bundle!, fk as FactionKey, pid)?.units.find((x) => x.ref === r) : undefined; return (u && bundle?.datasheets[u.datasheet]?.name) || 'squad' }
  // "two units of 5" / "two units of 3": read from the patrol's own Patrol Squads halves.
  const splitSizes = (fk: string, pid?: string): string => {
    const r = bundle ? splittablePatrolRefs(bundle, fk as FactionKey, pid)[0] : undefined
    const sizes = (r ? resolvePatrol(bundle!, fk as FactionKey, pid)?.units.find((x) => x.ref === r)?.patrolSquads : undefined)?.map((h) => h.size) ?? []
    return sizes.length === 2 && sizes[0] === sizes[1] ? `two units of ${sizes[0]}` : sizes.length ? `${sizes.length} units (${sizes.join(' + ')})` : 'two units'
  }
  const canSplitB = !!bundle && opponent === 'hotseat' && !!opponentFaction && splittablePatrolRefs(bundle, opponentFaction, opponentPatrolId || undefined).length > 0

  // Starting over an existing save asks first (the start button opens the question; "Start new game" runs start()).
  const requestStart = () => {
    if (shouldConfirmReplace()) setConfirmReplace(true)
    else void start()
  }

  const start = async () => {
    setConfirmReplace(false)
    const randomFaction = factions.length ? factions[Math.floor(Math.random() * factions.length)].id : undefined
    const oppFactionId = opponentFaction || randomFaction
    // Automatic opponent: a random patrol of the (chosen or random) faction.
    const allOppPatrols = bundle && oppFactionId ? patrolsForFaction(bundle, oppFactionId) : []
    const oppPatrolId = opponentFaction ? opponentPatrolId || undefined : allOppPatrols.length > 1 ? allOppPatrols[Math.floor(Math.random() * allOppPatrols.length)].id : undefined
    // The opponent gets a fresh random colour scheme every game (game-only; your saved paint is untouched).
    usePaintStore.getState().setSeatPaint('B', randomArmyPaint())
    try {
      await newGame({
        playerFaction: faction,
        opponentFaction: oppFactionId,
        patrolId: patrol?.id,
        opponentPatrolId: oppPatrolId,
        opponent,
        mission: `mission.${mission}`,
        seed,
        secondaryId: secondaryId || undefined,
        splitSquads: canSplitA && splitA,
        opponentSplitSquads: canSplitB && splitB,
        embark: embarkList(embarkA, embarkOptsA),
        opponentEmbark: opponent === 'hotseat' ? embarkList(embarkB, embarkOptsB) : undefined,
        unitChoices: Object.keys(pickA).length ? pickA : undefined,
        opponentUnitChoices: Object.keys(pickB).length ? pickB : undefined,
        difficulty: opponent === 'bot' ? difficulty : undefined,
      })
      onStarted()
    } catch {
      // error surfaced via store.error below
    }
  }

  return (
    <div className={ready ? 'ss-overlay ss-ready' : 'ss-overlay'} data-testid="start-screen">
      <style>{layoutCss}</style>
      <h1 style={srOnly}>Mallet 42,000 — SD Assault: Galaxy in Conflict</h1>
      <div className="ss-scrim" />
      <div className="ss-card" style={card}>
        {saveNotice && (
          <p style={noticeText} data-testid="save-notice" role="status">
            <span>{saveNotice}</span>
            <button style={buttonBase} onClick={dismissSaveNotice}>OK</button>
          </p>
        )}
        {saved && (
          <div style={saveCard} data-testid="continue-card">
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }} data-testid="continue-factions">{saved.meta.factions.A} vs {saved.meta.factions.B}</div>
              <div style={mutedText} data-testid="continue-detail">
                {saved.meta.phase === 'ended' ? 'Finished' : `Round ${saved.meta.round} · ${phaseLabel(saved.meta.phase)}`} ·{' '}
                {saved.meta.opponent === 'bot'
                  ? `vs bot${saved.meta.difficulty ? ` (${AI_DIFFICULTY_OPTIONS.find((d) => d.key === saved.meta.difficulty)?.label ?? saved.meta.difficulty})` : ''}`
                  : 'hot-seat'}
              </div>
              <div style={mutedText} data-testid="continue-time">Last played {relativeTime(saved.savedAt)}</div>
            </div>
            <button style={{ ...buttonPrimary, padding: '10px 18px' }} data-testid="continue-game" disabled={loading} onClick={() => void resume()}>
              {loading ? 'Loading…' : 'Continue'}
            </button>
          </div>
        )}
        <div className="ss-grid">
        <div className="ss-col">

        <div style={label}>Your Faction</div>
        <div style={factionGrid} data-testid="setup-patrol-A">
          {factions.map((f) => (
            <FactionCard key={f.id} id={f.id} name={f.label} active={f.id === factionId} onPick={() => setFaction(f.id)} />
          ))}
        </div>
        {activeFaction?.blurb && <p style={blurb}>{activeFaction.blurb}</p>}

{patrolsA.length > 1 && (
          <>
            <div style={label}>Your Combat Patrol</div>
            <div style={row} data-testid="setup-patrol-pick-A">
              {patrolsA.map((p) => (
                <button key={p.id} style={p.id === (patrolId || patrolsA[0].id) ? buttonActive : buttonBase} onClick={() => setPatrolId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

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
              <div className="ss-secondary" style={secondaryCard}>{patrol.secondaries.find((s) => s.id === secondaryId)!.text}</div>
            )}
          </>
        )}

        {unitChoiceRow(faction, patrol?.id, choicesA, pickA, setPickA, 'A')}
        {embarkRow(embarkOptsA, embarkA, setEmbarkA, 'A')}
        {canSplitA && (
          <label className="ss-check" style={blurb} data-testid="setup-split-A">
            <input type="checkbox" checked={splitA} onChange={(e) => setSplitA(e.target.checked)} /> Split your {splitName(faction, patrol?.id)} into {splitSizes(faction, patrol?.id)} (Patrol Squads)
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
        <div style={factionGrid} data-testid="setup-opponent-faction">
          <FactionCard id="" name="Random" active={opponentFaction === ''} onPick={() => setOpponentFaction('')} />
          {factions.map((f) => (
            <FactionCard key={f.id} id={f.id} name={f.label} active={f.id === opponentFaction} onPick={() => setOpponentFaction(f.id)} />
          ))}
        </div>

{patrolsB.length > 1 && (
          <>
            <div style={label}>Opponent's Combat Patrol</div>
            <div style={row} data-testid="setup-patrol-pick-B">
              {patrolsB.map((p) => (
                <button key={p.id} style={p.id === (opponentPatrolId || patrolsB[0].id) ? buttonActive : buttonBase} onClick={() => setOpponentPatrolId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}

        {opponentFaction && unitChoiceRow(opponentFaction, opponentPatrolId || undefined, choicesB, pickB, setPickB, 'B')}
        {embarkRow(embarkOptsB, embarkB, setEmbarkB, 'B')}
        {canSplitB && (
          <label className="ss-check" style={blurb} data-testid="setup-split-B">
            <input type="checkbox" checked={splitB} onChange={(e) => setSplitB(e.target.checked)} /> Split Player B's {splitName(opponentFaction, opponentPatrolId || undefined)} into {splitSizes(opponentFaction, opponentPatrolId || undefined)} (Patrol Squads)
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
          <button style={{ ...buttonPrimary, flex: 1, padding: '12px 16px', fontSize: 15 }} data-testid="start-game" disabled={loading} onClick={requestStart}>
            {loading ? 'Loading…' : 'Start Battle'}
          </button>
        </div>
      </div>
      {confirmReplace && (
        <div style={confirmBackdrop} data-testid="replace-save-confirm" role="alertdialog" aria-modal="true" aria-label="Replace saved game">
          <div style={{ ...card, maxWidth: 420 }}>
            <strong>Start a new game?</strong>
            <p style={{ margin: 0, fontSize: 13 }}>
              You have a game in progress{saved ? ` (${saved.meta.factions.A} vs ${saved.meta.factions.B}, round ${saved.meta.round})` : ''}. Starting a new battle replaces it, and the old one cannot be brought back.
            </p>
            <div style={row}>
              <button style={{ ...buttonPrimary, flex: 1 }} data-testid="replace-save-keep" onClick={() => setConfirmReplace(false)}>Keep my saved game</button>
              <button style={{ ...buttonDanger, flex: 1 }} data-testid="replace-save-confirm-start" onClick={() => void start()}>Start new game</button>
            </div>
          </div>
        </div>
      )}
      {painting && <PainterPanel factions={factions} initialFaction={factionId} onClose={() => setPainting(false)} />}
    </div>
  )
}
