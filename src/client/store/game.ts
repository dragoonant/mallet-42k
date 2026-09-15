// Client game store (docs/spec/50-client.md §2). Owns the one GameState the UI renders from, drives it through
// engine.step(), and auto-plays the bot seat with src/ai/random.ts. The client never mutates GameState directly —
// every change here comes from a step() result.
import { create } from 'zustand'
import {
  createGame,
  legalActions as engineLegalActions,
  load as engineLoad,
  save as engineSave,
  step,
  registerDataBundle,
  view as engineView,
  type Action,
  type GameEvent,
  type GameSetup,
  type GameState,
  type Id,
  type PendingDecision,
  type PlayerId,
  type PlayerSetup,
  type RejectionCode,
  type SaveFile,
  type DiceRoll,
  type Unit,
  type Vec3,
} from '../../engine'
import type { Decider } from '../../engine/decider'
import type { CombatPatrolData, DataBundle, EnhancementData } from '../../data/types'
import { loadBundle } from '../../data'
import { RandomDecider } from '../../ai/random'
import { UtilityDecider } from '../../ai/utility'
import { sourceName } from '../ui/labels'

// ---------- setup defaults ----------
export type FactionKey = 'space-marines' | 'orks'
export type OpponentKind = 'bot' | 'hotseat'
/** Bot opponent strength, own-words-labelled on the start screen (AI_DIFFICULTY_OPTIONS below).
 *  'random' keeps the pre-M5 uniform-random bot as an explicit easy option; 'easy'/'normal' drive
 *  src/ai/utility.ts's UtilityDecider (docs/spec/40-ai.md §7, simplified per its own header). */
export type AiDifficulty = 'random' | 'easy' | 'normal'
export const DEFAULT_AI_DIFFICULTY: AiDifficulty = 'normal'
export const AI_DIFFICULTY_OPTIONS: { key: AiDifficulty; label: string; blurb: string }[] = [
  { key: 'random', label: 'Random (easy)', blurb: 'Picks any legal move at random — great for learning the rules.' },
  { key: 'easy', label: 'Casual', blurb: 'Weighs its options but plays a bit loose — good for a relaxed game.' },
  { key: 'normal', label: 'Standard', blurb: 'Always takes what it judges the best move — a real fight.' },
]

function makeBotDecider(difficulty: AiDifficulty, seed: string): Decider {
  if (difficulty === 'random') return new RandomDecider(seed)
  return new UtilityDecider(difficulty, seed)
}

export const FACTION_ID: Record<FactionKey, Id> = { 'space-marines': 'sm', orks: 'ork' }
const FACTION_LABEL: Record<FactionKey, string> = { 'space-marines': 'Space Marines', orks: 'Orks' }
const otherFaction = (f: FactionKey): FactionKey => (f === 'space-marines' ? 'orks' : 'space-marines')

const DEFAULT_MISSION_ID = 'mission.cp-01'
const BOT_DELAY_MS = 400
// Watchdogs for the bot loop (client-owned defense-in-depth — the engine's own legalActions() contract already
// guarantees a non-empty list per decision, but a bad heuristic, a slow scorer, or a genuinely stuck decision
// must never be able to leave the HUD showing "Opponent is thinking…" forever; see docs on runBotDecision below).
const BOT_DECISION_TIMEOUT_MS = 3000 // absolute cap on how long we wait for decide() (covers any stall, presentation included)
const UTILITY_SLOW_MS = 500 // UtilityDecider budget; over this we don't trust the pick and redo it with RandomDecider

function botDebugEnabled(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')
  } catch {
    return false
  }
}

function botDebug(...args: unknown[]): void {
  if (botDebugEnabled()) console.debug('[bot]', ...args)
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new Error(`bot decision timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function resolveMissionId(bundle: DataBundle, mission?: string): Id {
  if (mission) {
    if (bundle.missions[mission]) return mission
    const prefixed = `mission.${mission}`
    if (bundle.missions[prefixed]) return prefixed
  }
  if (bundle.missions[DEFAULT_MISSION_ID]) return DEFAULT_MISSION_ID
  const first = Object.keys(bundle.missions)[0]
  if (!first) throw new Error('newGame: data bundle has no missions')
  return first
}

// Tellyporta-style enhancement choice: name the first friendly unit carrying the required keyword.
function enhancementChoiceFor(
  bundle: DataBundle,
  patrol: CombatPatrolData,
  enhancement: EnhancementData | undefined,
): { unitRef: string } | undefined {
  if (!enhancement?.choice) return undefined
  const kw = enhancement.choice.unitKeyword
  const match = patrol.units.find((u) => {
    const ds = bundle.datasheets[u.datasheet]
    return !!ds && ((ds.keywords as string[]).includes(kw) || (ds.factionKeywords as string[]).includes(kw))
  })
  return match ? { unitRef: match.ref } : undefined
}

// Attach every LEADER-capable datasheet in the patrol to a bodyguard it may join (R-10.1), one leader per bodyguard.
// Prefers the patrol data's own `attachTo` hint when present, otherwise infers from the datasheet's `leader.attachTo`.
function defaultAttachments(bundle: DataBundle, patrol: CombatPatrolData): PlayerSetup['attachments'] {
  const used = new Set<string>()
  const attachments: PlayerSetup['attachments'] = []
  for (const u of patrol.units) {
    const ds = bundle.datasheets[u.datasheet]
    if (!ds?.leader) continue
    let bodyguardRef = u.attachTo && patrol.units.some((b) => b.ref === u.attachTo && !used.has(b.ref)) ? u.attachTo : undefined
    if (!bodyguardRef) {
      const candidate = patrol.units.find((b) => b.ref !== u.ref && !used.has(b.ref) && ds.leader!.attachTo.includes(b.datasheet))
      bodyguardRef = candidate?.ref
    }
    if (bodyguardRef) {
      attachments.push({ leaderRef: u.ref, bodyguardRef })
      used.add(bodyguardRef)
    }
  }
  return attachments
}

function buildPlayerSetup(bundle: DataBundle, factionKey: FactionKey, secondaryId?: string): PlayerSetup {
  const factionId = FACTION_ID[factionKey]
  const patrol = Object.values(bundle.patrols).find((p) => p.faction === factionId)
  if (!patrol) throw new Error(`newGame: no Combat Patrol data for faction "${factionId}"`)
  const enhancement = patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]
  const chosen = secondaryId ? patrol.secondaries.find((s) => s.id === secondaryId) : undefined
  const secondary = chosen ?? patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]
  const enhancementData = enhancement ? bundle.enhancements[enhancement.id] : undefined
  return {
    name: FACTION_LABEL[factionKey],
    faction: factionId,
    patrolId: patrol.id,
    enhancementId: enhancement?.id ?? '',
    enhancementChoice: enhancementChoiceFor(bundle, patrol, enhancementData),
    secondaryId: secondary?.id ?? '',
    attachments: defaultAttachments(bundle, patrol),
    reserves: [], // no reserves unless a unit requires them (handled by the deployment decision itself)
    battleReadyVp: 0,
  }
}

function buildSetup(bundle: DataBundle, opts: NewGameOptions): GameSetup {
  const missionId = resolveMissionId(bundle, opts.mission)
  const mission = bundle.missions[missionId]
  const terrainLayoutId = mission.terrainLayouts[0]
  if (!terrainLayoutId) throw new Error(`newGame: mission "${missionId}" lists no terrain layouts`)
  const opponentFaction = otherFaction(opts.playerFaction)
  return {
    missionId,
    terrainLayoutId,
    players: {
      A: buildPlayerSetup(bundle, opts.playerFaction, opts.secondaryId),
      B: buildPlayerSetup(bundle, opponentFaction),
    },
    sides: 'rollOff',
    firstTurn: 'rollOff',
    dataVersion: bundle.version,
  }
}

// ---------- store ----------
export interface NewGameOptions {
  mission?: string
  playerFaction: FactionKey
  opponent: OpponentKind
  seed: string
  /** Player A's chosen secondary (patrol.secondaries[].id); falls back to the patrol's default. */
  secondaryId?: string
  /** Bot opponent strength; ignored for 'hotseat'. Defaults to DEFAULT_AI_DIFFICULTY ('normal'). */
  difficulty?: AiDifficulty
}

export interface ToastMessage {
  id: number
  text: string
  code?: RejectionCode
}

export interface VpToastMessage {
  id: number
  text: string
}

export interface GameStore {
  bundle: DataBundle | null
  setup: GameSetup | null
  state: GameState | null
  pending: PendingDecision | null
  legal: Action[] | null
  events: GameEvent[]
  diceLog: DiceRoll[]
  actionLog: Action[]
  toast: ToastMessage | null
  /** Latest "+N VP — Reason" pop-up (M6 gap: scoring was invisible outside the Events list). */
  vpToast: VpToastMessage | null
  opponent: OpponentKind | null
  humanSeat: PlayerId
  botSeat: PlayerId | null
  /** Bot strength for the current game (null when there is no bot seat), for HUD/EndScreen display. */
  difficulty: AiDifficulty | null
  loading: boolean
  error: string | null

  newGame(opts: NewGameOptions): Promise<void>
  dispatch(action: Action): void
  clearToast(): void
  clearVpToast(): void
  saveToLocalStorage(key?: string): void
  loadFromLocalStorage(key?: string): void
}

const EVENT_LOG_LIMIT = 200
const DICE_LOG_LIMIT = 200

// Bot scheduling lives outside reactive state (timer handles/decider instances aren't state); reset on every newGame.
let botTimer: ReturnType<typeof setTimeout> | null = null
let botDecider: Decider | null = null

function clearBotTimer(): void {
  if (botTimer !== null) {
    clearTimeout(botTimer)
    botTimer = null
  }
}

function diceRollsFrom(events: GameEvent[]): DiceRoll[] {
  return events.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled').map((e) => e.roll)
}

/** The most recent VpScored in this batch of events, as a ready-to-show "+10 VP — Raze and Ruin"
 *  pop-up — null when nothing scored this step. */
function vpToastFrom(state: GameState, bundle: DataBundle | null, events: GameEvent[]): VpToastMessage | null {
  const scored = events.filter((e): e is Extract<GameEvent, { type: 'VpScored' }> => e.type === 'VpScored')
  const last = scored[scored.length - 1]
  if (!last) return null
  return { id: Date.now(), text: `+${last.amount} VP — ${sourceName(state, bundle, last.source)}` }
}

export const useGameStore = create<GameStore>()((set, get) => {
  function scheduleBotIfNeeded(): void {
    clearBotTimer()
    const { state, pending, opponent, botSeat } = get()
    if (!state || !pending || opponent !== 'bot' || !botSeat) return
    if (pending.player !== botSeat || state.phase === 'ended') return
    const decisionId = pending.id
    // Mid-attack decisions (the Command Re-roll offer after each die) are answered at once: the pause
    // reads as "thinking" nowhere on screen, and it would stall the director's grouped dice windows.
    const last = get().events[get().events.length - 1]
    const midAttack = !!last && /Rolled$|Tested$/.test(last.type)
    botTimer = setTimeout(() => {
      botTimer = null
      void runBotDecision(decisionId)
    }, midAttack ? 0 : BOT_DELAY_MS)
  }

  // Last-resort action picker: doesn't go through a Decider at all (a Decider throwing is exactly the failure
  // this exists to survive), just re-reads legalActions() fresh and takes the first non-pass option so the
  // decision always advances instead of leaving the bot's turn stuck forever.
  function anyLegalAction(state: GameState, pending: PendingDecision): Action | null {
    const options = engineLegalActions(state, pending)
    if (!options || options.length === 0) return null
    return options.find((a) => a.type !== 'pass') ?? options[0]
  }

  async function runBotDecision(expectedDecisionId: string): Promise<void> {
    const { state, pending, legal, botSeat } = get()
    if (!state || !pending || !botSeat || pending.id !== expectedDecisionId || !botDecider) return
    const decider = botDecider
    const view = engineView(state, botSeat)
    const kind = pending.kind
    let timedOut = false
    let action: Action | null = null
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    try {
      action = await withTimeout(decider.decide(view, pending, legal), BOT_DECISION_TIMEOUT_MS, () => {
        timedOut = true
        console.error(`[bot] decision ${pending.id} (${kind}) exceeded ${BOT_DECISION_TIMEOUT_MS}ms — falling back to RandomDecider`)
      })
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
      botDebug(`decide kind=${kind} id=${pending.id} ms=${elapsed.toFixed(1)} waitedOnPresentation=false`)
      if (decider instanceof UtilityDecider && elapsed > UTILITY_SLOW_MS) {
        console.error(`[bot] UtilityDecider took ${elapsed.toFixed(1)}ms (> ${UTILITY_SLOW_MS}ms) on decision ${pending.id} (${kind}) — redoing with RandomDecider`)
        action = null // discard the slow pick; fall through to the RandomDecider fallback below
      }
    } catch (err) {
      if (!timedOut) console.error(`[bot] decide() threw on decision ${pending.id} (${kind}):`, err)
      action = null
    }
    if (get().pending?.id !== expectedDecisionId) return // human acted (or game ended) while the bot "thought"
    if (!action) {
      try {
        action = await new RandomDecider(`${pending.id}:fallback`).decide(view, pending, legal)
      } catch (err) {
        console.error(`[bot] RandomDecider fallback also threw on decision ${pending.id} (${kind}):`, err)
        action = null
      }
    }
    if (!action) {
      // Both the real decider and the random fallback failed on the same decision — legalActions() itself
      // is empty (a violation of the engine's own contract; see src/engine/phases/legal.ts). Grab anything
      // legal one more time rather than leave the HUD stuck on "Opponent is thinking…" forever.
      const fresh = get().state
      action = fresh ? anyLegalAction(fresh, pending) : null
    }
    if (!action) {
      console.error(`[bot] no legal action available at all for decision ${pending.id} (${kind}) — giving up on this decision`)
      return
    }
    if (get().pending?.id !== expectedDecisionId) return
    try {
      get().dispatch(action)
    } catch (err) {
      console.error(`[bot] dispatch() threw on decision ${pending.id} (${kind}):`, err)
    }
  }

  function applyResult(result: { state: GameState; events: GameEvent[]; pending: PendingDecision | null; rejection?: { code: RejectionCode; reason: string } }, dispatched?: Action): void {
    set((s) => ({
      state: result.state,
      pending: result.pending,
      legal: result.pending ? engineLegalActions(result.state, result.pending) : null,
      events: [...s.events, ...result.events].slice(-EVENT_LOG_LIMIT),
      diceLog: [...s.diceLog, ...diceRollsFrom(result.events)].slice(-DICE_LOG_LIMIT),
      actionLog: dispatched && !result.rejection ? [...s.actionLog, dispatched].slice(-EVENT_LOG_LIMIT) : s.actionLog,
      toast: result.rejection ? { id: Date.now(), text: result.rejection.reason, code: result.rejection.code } : s.toast,
      vpToast: vpToastFrom(result.state, s.bundle, result.events) ?? s.vpToast,
    }))
    scheduleBotIfNeeded()
  }

  return {
    bundle: null,
    setup: null,
    state: null,
    pending: null,
    legal: null,
    events: [],
    diceLog: [],
    actionLog: [],
    toast: null,
    vpToast: null,
    opponent: null,
    humanSeat: 'A',
    botSeat: null,
    difficulty: null,
    loading: false,
    error: null,

    async newGame(opts) {
      clearBotTimer()
      botDecider = null
      set({ loading: true, error: null, toast: null })
      try {
        const bundle = await loadBundle()
        registerDataBundle(bundle)
        const setup = buildSetup(bundle, opts)
        const result = createGame(setup, opts.seed, bundle)
        const botSeat: PlayerId | null = opts.opponent === 'bot' ? 'B' : null
        const difficulty = opts.difficulty ?? DEFAULT_AI_DIFFICULTY
        botDecider = botSeat ? makeBotDecider(difficulty, `${opts.seed}:ai:${botSeat}`) : null
        set({
          bundle,
          setup,
          state: result.state,
          pending: result.pending,
          legal: result.pending ? engineLegalActions(result.state, result.pending) : null,
          events: result.events.slice(-EVENT_LOG_LIMIT),
          diceLog: diceRollsFrom(result.events).slice(-DICE_LOG_LIMIT),
          actionLog: [],
          toast: null,
          vpToast: null,
          opponent: opts.opponent,
          humanSeat: 'A',
          botSeat,
          difficulty: botSeat ? difficulty : null,
          loading: false,
          error: null,
        })
        scheduleBotIfNeeded()
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : String(err) })
        throw err
      }
    },

    dispatch(action) {
      const { state } = get()
      if (!state) return
      clearBotTimer()
      const result = step(state, action)
      applyResult(result, action)
    },

    clearToast() {
      set({ toast: null })
    },

    clearVpToast() {
      set({ vpToast: null })
    },

    saveToLocalStorage(key = 'mallet42k:save') {
      const { state } = get()
      if (!state || typeof localStorage === 'undefined') return
      try {
        const file: SaveFile = engineSave(state)
        localStorage.setItem(key, JSON.stringify(file))
      } catch {
        // best-effort only (quota, private browsing, no storage) — nothing to surface to the player here
      }
    },

    loadFromLocalStorage(key = 'mallet42k:save') {
      if (typeof localStorage === 'undefined') return
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return
        const file = JSON.parse(raw) as SaveFile
        const { bundle } = get()
        clearBotTimer()
        const result = engineLoad(file, bundle ?? undefined)
        set({
          setup: file.setup,
          state: result.state,
          pending: result.pending,
          legal: result.pending ? engineLegalActions(result.state, result.pending) : null,
        })
        scheduleBotIfNeeded()
      } catch {
        // corrupt/missing save — leave the current game running
      }
    },
  }
})

// ---------- selectors (docs/spec/50-client.md §2) ----------
export function unitsOnBoard(state: GameState | null): Unit[] {
  if (!state) return []
  return Object.values(state.units).filter((u) => u.location === 'board')
}

export function modelPositions(state: GameState | null): Record<string, Vec3> {
  const out: Record<string, Vec3> = {}
  if (!state) return out
  for (const m of Object.values(state.models)) out[m.id] = m.pos
  return out
}

export function activePlayer(state: GameState | null): PlayerId | null {
  return state?.activePlayer ?? null
}

export function phase(state: GameState | null): GameState['phase'] | null {
  return state?.phase ?? null
}

export function round(state: GameState | null): number | null {
  return state?.round ?? null
}

export function cp(state: GameState | null, player: PlayerId): number {
  return state?.players[player]?.cp ?? 0
}

export function vp(state: GameState | null, player: PlayerId): number {
  return state?.players[player]?.vp ?? 0
}
