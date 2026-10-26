// Save-game envelope + localStorage plumbing (one game in progress per browser, this device only).
// The engine's SaveFile (setup + seed + action list + final hash) is wrapped with the few client-side
// choices the engine does not know about (bot or hot-seat, bot strength, the opponent's random paint)
// and a little display metadata for the Continue card. Everything here is best-effort: storage can be
// missing, full or blocked, and a stored value can be anything, so no function throws.
import type { PlayerId, SaveFile, GameState } from '../../engine'
import { save as engineSave } from '../../engine'
import type { ArmyPaint } from '../figures/paint'
import type { AiDifficulty, OpponentKind } from './game'

export const SAVE_KEY = 'mallet42k:save'
export const SAVE_ENVELOPE_VERSION = 1

/** Shown on the start screen when a stored game could not be restored exactly and was thrown away. */
export const SAVE_DISCARDED_MESSAGE = "Your saved game was made by an older version of the game and can't be continued, so it has been cleared."

export interface SaveMeta {
  opponent: OpponentKind
  difficulty: AiDifficulty | null
  humanSeat: PlayerId
  /** Faction display names per seat, for the Continue card. */
  factions: { A: string; B: string }
  round: number
  phase: string
  /** The opponent's per-game random colours (not part of the engine state); omitted when none. */
  paint?: Partial<Record<PlayerId, ArmyPaint>>
}

export interface SaveEnvelope {
  kind: 'mallet42k-save'
  v: typeof SAVE_ENVELOPE_VERSION
  /** Epoch ms of the last autosave. */
  savedAt: number
  meta: SaveMeta
  file: SaveFile
}

export type ReadResult = { status: 'none' } | { status: 'ok'; envelope: SaveEnvelope } | { status: 'invalid'; reason: string }

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface SaveContext {
  opponent: OpponentKind
  difficulty: AiDifficulty | null
  humanSeat: PlayerId
  paint?: Partial<Record<PlayerId, ArmyPaint>>
}

export function buildEnvelope(state: GameState, ctx: SaveContext, now: number = Date.now()): SaveEnvelope {
  const meta: SaveMeta = {
    opponent: ctx.opponent,
    difficulty: ctx.difficulty,
    humanSeat: ctx.humanSeat,
    factions: { A: factionName(state, 'A'), B: factionName(state, 'B') },
    round: state.round,
    phase: state.phase,
  }
  if (ctx.paint && (ctx.paint.A || ctx.paint.B)) meta.paint = ctx.paint
  return { kind: 'mallet42k-save', v: SAVE_ENVELOPE_VERSION, savedAt: now, meta, file: engineSave(state) }
}

function factionName(state: GameState, seat: PlayerId): string {
  const p = state.players[seat]
  return (p as { name?: string } | undefined)?.name || (p as { faction?: string } | undefined)?.faction || seat
}

/** The autosave rule: a finished game clears the save, anything else is written (once per accepted action). */
export function persistAfterAction(state: GameState, ctx: SaveContext, now: number = Date.now()): void {
  if (state.result || state.phase === 'ended') clearSave()
  else writeEnvelope(buildEnvelope(state, ctx, now))
}

/** Serialises once and stores it. Returns false when storage refused (quota, private mode, no storage). */
export function writeEnvelope(envelope: SaveEnvelope): boolean {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(SAVE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY)
  } catch {
    /* storage blocked: nothing to clear */
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Shape check only (no replay): is this something we could hand to the engine? */
export function parseEnvelope(raw: string): ReadResult {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return { status: 'invalid', reason: 'unparsable' }
  }
  if (!isObj(v) || v.kind !== 'mallet42k-save') return { status: 'invalid', reason: 'not a save' }
  if (v.v !== SAVE_ENVELOPE_VERSION) return { status: 'invalid', reason: 'envelope version' }
  if (typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt)) return { status: 'invalid', reason: 'savedAt' }
  const m = v.meta
  if (!isObj(m) || (m.opponent !== 'bot' && m.opponent !== 'hotseat') || (m.humanSeat !== 'A' && m.humanSeat !== 'B')) return { status: 'invalid', reason: 'meta' }
  if (!isObj(m.factions) || typeof m.factions.A !== 'string' || typeof m.factions.B !== 'string') return { status: 'invalid', reason: 'meta.factions' }
  if (typeof m.round !== 'number' || typeof m.phase !== 'string') return { status: 'invalid', reason: 'meta.round' }
  const f = v.file
  if (!isObj(f) || f.version !== 1 || typeof f.engineVersion !== 'string' || typeof f.seed !== 'string' || typeof f.finalHash !== 'string' || !isObj(f.setup) || !Array.isArray(f.actions)) {
    return { status: 'invalid', reason: 'file' }
  }
  return { status: 'ok', envelope: v as unknown as SaveEnvelope }
}

export function readSave(): ReadResult {
  const s = storage()
  if (!s) return { status: 'none' }
  let raw: string | null
  try {
    raw = s.getItem(SAVE_KEY)
  } catch {
    return { status: 'none' }
  }
  if (raw === null) return { status: 'none' }
  return parseEnvelope(raw)
}

/** True when starting a new game would replace a game that can still be continued. */
export function shouldConfirmReplace(): boolean {
  return readSave().status === 'ok'
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function relativeTime(savedAt: number, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - savedAt) / 1000))
  if (secs < 45) return 'just now'
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return plural(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (hours < 24) return plural(hours, 'hour')
  return plural(Math.round(hours / 24), 'day')
}

const PHASE_LABEL: Record<string, string> = {
  setup: 'Setup',
  deployment: 'Deployment',
  command: 'Command phase',
  movement: 'Movement phase',
  shooting: 'Shooting phase',
  charge: 'Charge phase',
  fight: 'Fight phase',
}
export function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase.charAt(0).toUpperCase() + phase.slice(1)
}
