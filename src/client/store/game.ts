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
import type { CombatPatrolData, DataBundle, EnhancementData } from '../../data/types'
import { loadBundle } from '../../data'
import { RandomDecider } from '../../ai/random'

// ---------- setup defaults ----------
export type FactionKey = 'space-marines' | 'orks'
export type OpponentKind = 'bot' | 'hotseat'

const FACTION_ID: Record<FactionKey, Id> = { 'space-marines': 'sm', orks: 'ork' }
const FACTION_LABEL: Record<FactionKey, string> = { 'space-marines': 'Space Marines', orks: 'Orks' }
const otherFaction = (f: FactionKey): FactionKey => (f === 'space-marines' ? 'orks' : 'space-marines')

const DEFAULT_MISSION_ID = 'mission.cp-01'
const BOT_DELAY_MS = 400

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

function buildPlayerSetup(bundle: DataBundle, factionKey: FactionKey): PlayerSetup {
  const factionId = FACTION_ID[factionKey]
  const patrol = Object.values(bundle.patrols).find((p) => p.faction === factionId)
  if (!patrol) throw new Error(`newGame: no Combat Patrol data for faction "${factionId}"`)
  const enhancement = patrol.enhancements.find((e) => e.default) ?? patrol.enhancements[0]
  const secondary = patrol.secondaries.find((s) => s.default) ?? patrol.secondaries[0]
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
      A: buildPlayerSetup(bundle, opts.playerFaction),
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
}

export interface ToastMessage {
  id: number
  text: string
  code?: RejectionCode
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
  opponent: OpponentKind | null
  humanSeat: PlayerId
  botSeat: PlayerId | null
  loading: boolean
  error: string | null

  newGame(opts: NewGameOptions): Promise<void>
  dispatch(action: Action): void
  clearToast(): void
  saveToLocalStorage(key?: string): void
  loadFromLocalStorage(key?: string): void
}

const EVENT_LOG_LIMIT = 200
const DICE_LOG_LIMIT = 200

// Bot scheduling lives outside reactive state (timer handles/decider instances aren't state); reset on every newGame.
let botTimer: ReturnType<typeof setTimeout> | null = null
let botDecider: RandomDecider | null = null

function clearBotTimer(): void {
  if (botTimer !== null) {
    clearTimeout(botTimer)
    botTimer = null
  }
}

function diceRollsFrom(events: GameEvent[]): DiceRoll[] {
  return events.filter((e): e is Extract<GameEvent, { type: 'DiceRolled' }> => e.type === 'DiceRolled').map((e) => e.roll)
}

export const useGameStore = create<GameStore>()((set, get) => {
  function scheduleBotIfNeeded(): void {
    clearBotTimer()
    const { state, pending, opponent, botSeat } = get()
    if (!state || !pending || opponent !== 'bot' || !botSeat) return
    if (pending.player !== botSeat || state.phase === 'ended') return
    const decisionId = pending.id
    botTimer = setTimeout(() => {
      botTimer = null
      void runBotDecision(decisionId)
    }, BOT_DELAY_MS)
  }

  async function runBotDecision(expectedDecisionId: string): Promise<void> {
    const { state, pending, legal, botSeat } = get()
    if (!state || !pending || !botSeat || pending.id !== expectedDecisionId || !botDecider) return
    const decider = botDecider
    const action = await decider.decide(engineView(state, botSeat), pending, legal)
    // the human may have acted (or the game may have ended) while the bot "thought" — dispatch re-validates anyway
    if (get().pending?.id === expectedDecisionId) get().dispatch(action)
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
    opponent: null,
    humanSeat: 'A',
    botSeat: null,
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
        botDecider = botSeat ? new RandomDecider(`${opts.seed}:ai:${botSeat}`) : null
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
          opponent: opts.opponent,
          humanSeat: 'A',
          botSeat,
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
