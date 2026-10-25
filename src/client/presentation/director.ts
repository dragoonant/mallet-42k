// Event-to-presentation director (owner priority: "visible, fun polish fast"). Subscribes to the
// game store's event log and plays each fresh batch of engine events — dice, vfx, sound, figure
// action cues — in order, paced by the player's animation-speed setting (settings.ts). The engine
// itself already resolved everything by the time an event batch arrives; this module's only job is
// to make that resolution *read* as a sequence of beats instead of a state jump-cut.
//
// Mount once via <PresentationDirector/> (Director.tsx) — nothing here is a React component, so it
// can run its subscription/queue entirely outside the render cycle.
import type { GameEvent, GameState, Phase, PlayerId } from '@/engine'
import { unitModels } from '@/engine'
import type { DataBundle, WeaponData } from '@/data/types'
import { useGameStore, vpToastFrom } from '../store/game'
import { catchUpPresented, pickDisplaySnapshot, revealUnitsAhead, setPresentedSeq, usePresentedStore } from './presentedStore'
import { modelsAnchor } from '../interaction/geometry'
import { useCueStore } from './cueStore'
import { setPresentationIdle } from './idleStore'
import { usePresentationSettings, type AnimSpeed } from './settings'
import { cameraApi, type CameraView } from '../board/cameraApi'
import { clusterOf, type Cluster, type Pt } from './framing'
import { closeupViewClear, cinematicOn, closingBeat, damagedUnitOf, shoulderViewClear, shotTimes, speedFactor, type SolidPiece } from './shotCamera'
import { deployBeats, deployTimes, returnView, visitFlush, visitView, type DeployBeat } from './deployCamera'
import { announcementHoldMs, clearAnnouncement, holdAnnouncement, type AnnouncementKind } from './announceStore'
import { playRoll, rerollTrayShown, type RollRequest } from '../dice'
import { vfx } from '../vfx'
import { planVolleys, type StruckModel } from './volleys'
import { audio, playEventSounds, type SoundLookup } from '../audio'
import { colors } from '../ui/theme'
import { dieTarget } from '../ui/eventSummary'
import { unitToughness } from '../ui/labels'

type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

// How long a figure holds its shoot/melee/hit cue and shoot/melee facing turn, in ms — a little
// longer than Figure's own internal windows (700/300ms, figures/Figure.tsx ACTION_MS) so the cue
// object outlives the pose it drove; Figure reverts its own pose on its own timer regardless.
const CUE_MS = { shoot: 900, melee: 900, hit: 400, facing: 900 } as const

// Fixed gaps between events the director itself waits out (skipped entirely at 'instant' speed),
// scaled down at 'fast'. Dice rolls pace themselves via playRoll's own promise instead of this table.
const EVENT_GAP_MS: Partial<Record<GameEvent['type'], number>> = {
  PhaseStarted: 300,
  ChargeDeclared: 250,
  AttackSequenceStarted: 150,
  TargetsDeclared: 150,
  DamageApplied: 120,
  ModelDestroyed: 250,
  ObjectiveSecured: 250,
  VpScored: 200,
  StratagemUsed: 250,
  GameEnded: 400,
}

function gapFor(type: GameEvent['type'], speed: AnimSpeed): number {
  if (speed === 'instant') return 0
  const base = EVENT_GAP_MS[type] ?? 0
  return speed === 'fast' ? Math.round(base * 0.35) : base
}

// ---------- lookups shared by several handlers ----------

function unitLabel(state: GameState, id: string | null | undefined): string {
  if (!id) return ''
  return state.units[id]?.name ?? id
}

function attackLabel(state: GameState, attack: { attackerUnitId: string; targetUnitId: string }, suffix: string): string {
  const attacker = unitLabel(state, attack.attackerUnitId)
  const target = unitLabel(state, attack.targetUnitId)
  return target ? `${attacker} vs ${target} — ${suffix}` : `${attacker} — ${suffix}`
}

/** Best-known position for a model right now: the live (post-batch) state if it's still on the
 *  board, else its last known (pre-batch) position — the only way to place a vfx burst for a model
 *  that this same batch just destroyed, since it's already gone from `to.models`. */
function modelPoint(from: GameState, to: GameState, modelId: string): { x: number; y: number; z: number } | null {
  return to.models[modelId]?.pos ?? from.models[modelId]?.pos ?? null
}

function factionOf(state: GameState, unitId: string): string {
  const unit = state.units[unitId]
  return unit ? state.players[unit.player].faction : ''
}

function playerColor(player: PlayerId | null): string {
  if (player === 'A') return colors.playerA
  if (player === 'B') return colors.playerB
  return colors.muted
}

function bearing(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.z - from.z, to.x - from.x)
}

// ---------- dice-roll request builders (only for rolls that are cleanly single/paired d6s) ----------

/** Rolls that share a tray window. Fast-rolled attack dice carry the id of the one batch roll they came
 *  from, so a whole batch (a squad's hits, wounds or saves) is one window. Dice rolled one at a time
 *  (a per-attack save, say) have no roll id and fall back to attacker+weapon+target within the attack
 *  sequence. Null = not groupable. */
function rollGroupKey(e: GameEvent): string | null {
  switch (e.type) {
    case 'HitRolled':
    case 'WoundRolled':
      if (e.rollId) return `${e.type}|roll|${e.rollId}`
      return `${e.type}|${e.attack.attackerUnitId}|${e.attack.weaponId}|${e.attack.targetUnitId}`
    case 'SaveRolled':
      if (e.rollId) return `${e.type}|roll|${e.rollId}`
      return `${e.type}|${e.attack.attackerUnitId}|${e.attack.weaponId}|${e.attack.targetUnitId}|${e.kind}`
    case 'FeelNoPainRolled':
    case 'HazardousTested':
      return `${e.type}|${e.unitId}`
    default:
      return null
  }
}

/** Longest the director holds attack rolls back waiting for their sequence to end (a safety cap). */
const ATTACK_WAIT_MAX_MS = 4000

/** True when the buffer has hit/wound/save rolls whose attack sequence hasn't ended yet. */
function hasOpenAttackRolls(events: GameEvent[]): boolean {
  let open = false
  for (const e of events) {
    if (e.type === 'HitRolled' || e.type === 'WoundRolled' || e.type === 'SaveRolled') open = true
    else if (e.type === 'AttackSequenceEnded') open = false
  }
  return open
}

/** Dice re-rolled so far, by roll id: the face each die showed before and the one it landed on. Filled as
 *  DiceRerolled events play (they always precede the per-die events of the same roll), read when the
 *  roll's tray window is built so the re-rolled dice flip to their new face. */
const rerolledDice = new Map<string, Map<number, { before: number; after: number }>>()
const REROLL_MEMORY = 60

function noteReroll(e: EventOf<'DiceRerolled'>): void {
  const forRoll = rerolledDice.get(e.rollId) ?? new Map<number, { before: number; after: number }>()
  const indexes = e.indexes ?? e.before.map((_, i) => i)
  indexes.forEach((idx, k) => {
    if (e.before[k] !== undefined && e.after[k] !== undefined) forRoll.set(idx, { before: e.before[k], after: e.after[k] })
  })
  rerolledDice.delete(e.rollId)
  rerolledDice.set(e.rollId, forRoll)
  while (rerolledDice.size > REROLL_MEMORY) rerolledDice.delete(rerolledDice.keys().next().value as string)
}

/** The most recent charge roll seen (DiceRolled), so the ChargeRolled that follows can find its re-roll. */
let lastChargeRollId: string | null = null

/** Faces + re-roll flips for a window: `dice` are the first faces, `rerolled` the final ones (see RollRequest). */
function withRerolls(rollId: string | undefined, entries: { index: number | undefined; die: number }[]): { dice: number[]; rerolled?: number[] } {
  const info = rollId ? rerolledDice.get(rollId) : undefined
  const dice = entries.map((en) => (en.index !== undefined ? info?.get(en.index)?.before : undefined) ?? en.die)
  if (!info) return { dice }
  const rerolled = entries.map((en) => en.die)
  return rerolled.some((v, i) => v !== dice[i]) ? { dice, rerolled } : { dice }
}

/** One tray window for a group of same-key roll events. Auto hits/wounds and "no save possible"
 *  carry no die, so they're left out; null when nothing is left to show. Faces are the unmodified dice
 *  (a modified total can be 0 or 7, which no d6 face shows); pass/fail comes from the engine's verdict. */
function groupRequest(state: GameState, group: GameEvent[]): RollRequest | null {
  const entries: { index: number | undefined; die: number; passed: boolean }[] = []
  const needed = new Set<number>()
  const impossible: EventOf<'SaveRolled'>[] = []
  for (const e of group) {
    if (e.type === 'HitRolled') { if (!e.auto) entries.push({ index: e.dieIndex, die: e.die, passed: e.hit }) }
    // `needed` on these events is what the MODIFIED total must reach (e.g. Sv 3+); the tray shows the die face needed
    else if (e.type === 'WoundRolled') { if (!e.auto) { entries.push({ index: e.dieIndex, die: e.die, passed: e.wounded }); needed.add(dieTarget(e)) } }
    else if (e.type === 'SaveRolled') {
      // die 0 = the engine skipped an impossible save (even a 6 can't make it): no die to show, a note instead
      if (e.kind !== 'none' && e.die === 0) impossible.push(e)
      else if (e.kind !== 'none') { entries.push({ index: e.dieIndex, die: e.die, passed: e.saved }); needed.add(dieTarget(e)) }
    }
    else if (e.type === 'FeelNoPainRolled') { entries.push({ index: undefined, die: e.die, passed: e.ignored }); needed.add(e.needed) }
    else if (e.type === 'HazardousTested') entries.push({ index: undefined, die: e.die, passed: !e.failed })
  }
  let note = impossible.length > 0 ? impossibleSaveNote(state, impossible) : undefined
  if (entries.length === 0) {
    if (!note) return null
    const e = impossible[0]
    const label = e.kind === 'invuln' ? 'Invulnerable save' : 'Armour save'
    return { label: attackLabel(state, e.attack, label), purpose: 'save', dice: [], note }
  }
  // A batch's dice read left to right in the order they were rolled.
  if (entries.every((en) => en.index !== undefined)) entries.sort((a, b) => (a.index as number) - (b.index as number))
  const first = group[0]
  const rollId = first.type === 'HitRolled' || first.type === 'WoundRolled' || first.type === 'SaveRolled' ? first.rollId : undefined
  const { dice, rerolled } = withRerolls(rollId, entries)
  const passed = entries.map((en) => en.passed)
  const target = needed.size === 1 ? [...needed][0] : undefined
  // the working behind the target, e.g. "Armour 4+ − 1 AP = 5+ to save" — only when the whole group shares it
  const rolled = group.find((g) => (g.type === 'SaveRolled' && g.kind !== 'none' && g.die !== 0) || (g.type === 'WoundRolled' && !g.auto))
  const math = target !== undefined && rolled ? rollMath(state, rolled as EventOf<'SaveRolled'> | EventOf<'WoundRolled'>) : undefined
  if (math) note = note ? `${math}. ${note}` : math
  const flip = rerolled ? { rerolled } : {}
  const skipTumble = rollId !== undefined && rerollTrayShown.has(rollId)
  const common = { dice, passed, ...flip, ...(skipTumble ? { skipTumble } : {}) }
  const e = first
  switch (e.type) {
    case 'HitRolled': return { label: attackLabel(state, e.attack, 'To hit'), purpose: 'hit', ...common }
    case 'WoundRolled': return { label: attackLabel(state, e.attack, 'To wound'), purpose: 'wound', target, ...common, ...(note ? { note } : {}) }
    case 'SaveRolled': {
      const label = e.kind === 'invuln' ? 'Invulnerable save' : 'Armour save'
      return { label: attackLabel(state, e.attack, label), purpose: 'save', target, ...common, ...(note ? { note } : {}) }
    }
    case 'FeelNoPainRolled': return { label: `${unitLabel(state, e.unitId)} — Feel No Pain`, purpose: 'fnp', target, ...common }
    case 'HazardousTested': return { label: `${unitLabel(state, e.unitId)} — Hazardous`, purpose: 'hazardous', ...common }
    default: return null
  }
}

/** The target as a sum the player can check: "Armour 4+ − 1 AP + 1 cover/bonus = 4+ to save",
 *  "S 4 vs T 5 = 5+, + 1 bonus = 4+ to wound". `final - die` is every modifier the engine applied; for an armour
 *  save the weapon's AP is split out of it and whatever is left is cover or an ability. */
function rollMath(state: GameState, e: EventOf<'SaveRolled'> | EventOf<'WoundRolled'>): string | undefined {
  const mods = e.final - e.die
  const target = dieTarget(e)
  const term = (n: number, what: string): string => (n === 0 ? '' : ` ${n > 0 ? '+' : '−'} ${Math.abs(n)} ${what}`)
  // a positive modifier lowers the roll needed, so it reads as "+ 1 bonus" and an AP of -1 as "− 1 AP"
  const floor = e.needed - mods < 2 ? ' (a 1 always fails)' : ''
  if (e.type === 'SaveRolled') {
    const weaponAp = state.weapons[e.attack.weaponId]?.AP ?? 0
    if (e.kind === 'invuln') {
      const ignored = weaponAp !== 0 ? ` (ignores ${Math.abs(weaponAp)} AP)` : ''
      return `Invulnerable ${e.needed}+${ignored}${term(mods, mods > 0 ? 'bonus' : 'penalty')} = ${target}+ to save${floor}`
    }
    const other = mods - weaponAp
    return `Armour ${e.needed}+${term(weaponAp, 'AP')}${term(other, other > 0 ? 'cover/bonus' : 'penalty')} = ${target}+ to save${floor}`
  }
  const S = state.weapons[e.attack.weaponId]?.S
  const T = unitToughness(state, e.attack.targetUnitId)
  const base = typeof S === 'number' && T !== null ? `S ${S} vs T ${T} = ${e.needed}+` : `${e.needed}+`
  return mods === 0 ? `${base} to wound` : `${base},${term(mods, mods > 0 ? 'bonus' : 'penalty')} = ${target}+ to wound${floor}`
}

/** "No save possible: needs 7+ (AP -2)" — for saves the engine skipped because even a 6 couldn't make them. */
function impossibleSaveNote(state: GameState, events: EventOf<'SaveRolled'>[]): string {
  const e = events[0]
  const ap = e.kind === 'armour' ? state.weapons[e.attack.weaponId]?.AP ?? 0 : 0
  const face = e.needed - ap
  const count = events.length > 1 ? ` (${events.length} attacks)` : ''
  return face > 6 && ap !== 0
    ? `No save possible: needs ${face}+ (AP ${ap})${count}`
    : `No save possible${count}`
}

function chargeRequest(state: GameState, e: EventOf<'ChargeRolled'>): RollRequest {
  // The charge distance is a measured gap; the roll that clears it is the next whole number.
  const target = e.needed == null ? undefined : Math.ceil(e.needed)
  const { dice, rerolled } = withRerolls(lastChargeRollId ?? undefined, e.dice.map((die, index) => ({ index, die })))
  const skipTumble = lastChargeRollId !== null && rerollTrayShown.has(lastChargeRollId)
  return { label: `${unitLabel(state, e.unitId)} — Charge`, purpose: 'charge', dice, target, ...(rerolled ? { rerolled } : {}), ...(skipTumble ? { skipTumble } : {}) }
}
function deadlyDemiseRequest(state: GameState, e: EventOf<'DeadlyDemiseRolled'>): RollRequest {
  return { label: `${unitLabel(state, e.unitId)} — Deadly Demise`, purpose: 'deadlyDemise', dice: [e.die] }
}

// ---------- held shooting volley ----------
//
// A ranged attack's shots wait for its dice. The hit, wound and save windows play first; then the unit
// fires, each model the attack struck gets a shot that lands on it, and that model's save shimmer, damage
// flinch or fall plays the moment its shot lands. Until the volley has played, the presented-seq cursor is
// held back from any step whose damage is still held, so the board can't drop a model before it is shot.

/** Events held back until the volley lands: what a shot does when it arrives. */
const HELD_EVENTS = new Set<GameEvent['type']>(['SaveRolled', 'DamageApplied', 'ModelDestroyed', 'UnitDestroyed'])

/** Longest the director waits for a volley's shots to land before playing what's left (vfx layer not
 *  running, projectile pool full). A volley's own stagger caps at 1.8s plus at most 1.5s of flight. */
const VOLLEY_WAIT_MAX_MS = 3800

/** How long firing models keep facing their target — the whole volley, not just the recoil. */
const VOLLEY_FACING_MS = 2600

/** Pause after a volley's last shot lands, before whatever comes next. */
const VOLLEY_SETTLE_MS = 550

interface HeldVolley {
  unitId: string
  /** Cue token for the shoot pose (one per firing, so a second firing in the same sequence replays it). */
  token: string
  declared: EventOf<'TargetsDeclared'>[]
  /** Hit rolls since the last firing (planVolleys reads hits and misses from them). */
  rolls: GameEvent[]
  held: GameEvent[]
  /** A held event changes the board (damage or a death), so the cursor must wait for the volley. */
  damaging: boolean
  fired: number
  /** State from before the sequence: where every target model stood, killed ones included. */
  from: GameState
}

/** One landing: the held events a single shot plays when it reaches its model. */
interface Landing {
  key: string | null
  modelId: string | null
  events: GameEvent[]
  played: boolean
}

let heldVolley: HeldVolley | null = null

function attackKey(a: { weaponId: string; targetUnitId: string }): string {
  return `${a.weaponId}|${a.targetUnitId}`
}

/** Splits held events into landings: an allocated wound's save with the damage and death it led to, a
 *  mortal wound with its death, and anything not tied to a shot (a unit-destroyed line) on its own. */
function landingsOf(events: GameEvent[]): Landing[] {
  const out: Landing[] = []
  const latest = new Map<string, Landing>() // last landing per model
  for (const e of events) {
    if (e.type === 'SaveRolled') {
      const l: Landing = { key: attackKey(e.attack), modelId: e.modelId, events: [e], played: false }
      out.push(l)
      latest.set(e.modelId, l)
    } else if (e.type === 'DamageApplied') {
      const src = 'weaponId' in e.source ? e.source : null
      const prev = latest.get(e.modelId)
      const sameShot = prev && src && prev.key === attackKey(src) && !prev.events.some((x) => x.type === 'ModelDestroyed')
        && (e.mortal ? prev.events.every((x) => x.type === 'DamageApplied' && x.mortal) : prev.events[0].type === 'SaveRolled')
      if (sameShot) { prev.events.push(e); continue }
      const l: Landing = { key: src ? attackKey(src) : null, modelId: e.modelId, events: [e], played: false }
      out.push(l)
      latest.set(e.modelId, l)
    } else if (e.type === 'ModelDestroyed') {
      const prev = latest.get(e.modelId)
      if (prev) prev.events.push(e)
      else out.push({ key: null, modelId: e.modelId, events: [e], played: false })
    } else {
      out.push({ key: null, modelId: null, events: [e], played: false })
    }
  }
  return out
}

function playLanding(l: Landing, from: GameState, to: GameState, humanSeat: PlayerId, lookup: SoundLookup, onDamage?: (unitId: string) => void): void {
  if (l.played) return
  l.played = true
  const cues = useCueStore.getState()
  for (const e of l.events) {
    try {
      playEventSounds(audio, [e], humanSeat, lookup)
      if (e.type === 'SaveRolled' && e.saved) {
        const at = modelPoint(from, to, e.modelId)
        if (at) vfx.save(at)
      } else if (e.type === 'DamageApplied') {
        const at = modelPoint(from, to, e.modelId)
        if (at) {
          if (e.mortal) vfx.mortal(at)
          else vfx.hit(at, Math.min(1, e.amount / 3))
        }
        cues.setModelAction(e.modelId, 'hit', e.seq, CUE_MS.hit)
      } else if (e.type === 'ModelDestroyed') {
        const at = modelPoint(from, to, e.modelId)
        if (at) vfx.death(at)
        cues.fell(e.modelId)
      }
    } catch (err) {
      console.warn('[presentation] failed to play landing', e.type, err)
    }
  }
  // the first landing that gets through on a unit sends the cinematic camera in on it
  const hurt = damagedUnitOf(l.events)
  if (hurt && onDamage) {
    try {
      onDamage(hurt)
    } catch (err) {
      console.warn('[presentation] shot camera close-up failed', err)
    }
  }
}

// ---------- cinematic camera ----------
//
// Two beats borrow the camera from the player and give it back (owner setting "Cinematic camera", on by default;
// skipped at instant speed and in hot-seat; any camera input from the player cancels the rest of the beat):
//  - a ranged attack (shooting phase and Overwatch): over the shoulder of the whole firing unit while the volley
//    flies, then a close-up of each target unit when its first damaging shot lands, then back to the player's view
//  - the bot's deployment: a visit to every unit it sets up (and every reserve unit it brings in later)
// The camera API (board/cameraApi.ts) does the flying; the pure framing lives in shotCamera.ts and deployCamera.ts.

/** Re-arms the presented cursor's stall guard (it would otherwise show results mid-flight): the cursor does not move. */
const petStall = (): void => setPresentedSeq(-1)

/** Longest the heartbeat keeps the stall guard quiet while the cursor does not move (a presentation that is hung, not playing). */
export const HEARTBEAT_MAX_MS = 20_000

// Dice windows and volleys that are really playing right now (see startHeartbeat).
let playing = 0
let playingSince = 0

/** Runs a dice window or volley, noting that one is playing so the heartbeat covers its long stretch without a step boundary. */
async function whilePlaying<T>(run: () => Promise<T>): Promise<T> {
  if (playing++ === 0) playingSince = Date.now()
  try {
    return await run()
  } finally {
    playing--
  }
}

/**
 * A big volley's dice alone run past the cursor's stall guard (PRESENTED_STALL_MS), and the guard showed the next phase's
 * chip and prompt mid-volley. While a dice window or volley is actually playing (whilePlaying), this pets the guard once a
 * second, until the cursor has not moved for HEARTBEAT_MAX_MS. Outside those, and past that cap, the guard is the failsafe
 * again, so a presentation that hangs can never freeze the game for more than that. Returns the stop function.
 */
function startHeartbeat(): () => void {
  let seen = usePresentedStore.getState().presentedSeq
  let since = Date.now()
  let seenPlayingSince = playingSince
  const id = setInterval(() => {
    const now = usePresentedStore.getState().presentedSeq
    if (now !== seen || playingSince !== seenPlayingSince) {
      seen = now
      seenPlayingSince = playingSince
      since = Date.now()
    }
    if (playing > 0 && Date.now() - since < HEARTBEAT_MAX_MS) petStall()
  }, 1000)
  return () => clearInterval(id)
}

/** Where a unit's models stand in the first of `states` that has any (killed models are only in the older state). */
function pointsOf(unitId: string, ...states: GameState[]): Pt[] {
  for (const st of states) {
    try {
      const models = unitModels(st, unitId)
      if (models.length > 0) return models.map((m) => ({ x: m.pos.x, y: m.pos.y, z: m.pos.z, radius: Math.max(m.base.radius, m.base.radius2 ?? 0) }))
    } catch {
      // unknown unit or missing model in this state: try the next
    }
  }
  return []
}

const currentFactor = (): number => speedFactor(usePresentationSettings.getState().animSpeed)

/** The cinematic camera is allowed to move at all right now. */
function cameraWanted(): boolean {
  return cinematicOn(usePresentationSettings.getState().cinematicCamera, currentFactor(), !!cameraApi.current, useGameStore.getState().botSeat !== null)
}

interface Cine {
  /** the player's view, taken when the cinematic began */
  saved: CameraView
  /** cameraApi.inputCount() then; a different count later means the player took the camera */
  stamp: number
  shooters: Cluster
  targets: Cluster
  pieces: SolidPiece[]
  aspect: number
  /** state from before the attack: close-ups frame the target units where they stood */
  from: GameState
  to: GameState
  /** target units already closed in on during this volley */
  closedUp: Set<string>
  /** close-ups waiting for the camera, one after another */
  chain: Promise<void>
  waiting: number
}

let cine: Cine | null = null
/** The player took the camera during this attack sequence: no more cinematic until it is over. */
let cineDeclined = false
/** The player's camera at their last deployment: where a visit to a bot unit returns to. */
let lastPlayerView: CameraView | null = null
/** A deployment visit in progress: where to return to, and the input count it started at. */
let trip: { back: CameraView; stamp: number } | null = null

function cineAlive(): boolean {
  const c = cine
  if (!c) return false
  const cam = cameraApi.current
  if (!cam || cam.inputCount() !== c.stamp) {
    cine = null
    cineDeclined = true
    return false
  }
  return true
}

/** Flies the cinematic camera; a cancelled flight (the player moved the camera) drops the rest of the cinematic. */
async function cineFly(view: CameraView, ms: number): Promise<boolean> {
  const cam = cameraApi.current
  const c = cine
  if (!cam || !c || !cineAlive()) return false
  const arrived = await cam.flyTo(view, ms)
  petStall()
  if (!arrived) {
    if (cine === c) cine = null
    cineDeclined = true
    return false
  }
  return cineAlive()
}

/** Sends the camera in on one target unit, after any close-up still under way. */
function queueCloseup(unitId: string): void {
  const c = cine
  if (!c || !cineAlive() || c.closedUp.has(unitId)) return
  c.closedUp.add(unitId)
  c.waiting++
  const times = shotTimes(currentFactor())
  c.chain = c.chain
    .then(async () => {
      const target = clusterOf(pointsOf(unitId, c.from, c.to))
      const arrived = cine === c && target ? await cineFly(closeupViewClear(c.pieces, c.shooters, target, c.aspect), times.closeup) : false
      c.waiting--
      if (arrived && c.waiting > 0) await sleep(times.dwell) // more targets to visit: a beat on this one first
    })
    .catch((err) => {
      c.waiting = Math.max(0, c.waiting - 1)
      console.warn('[presentation] shot camera close-up failed', err)
    })
}

/** Over the shoulder of the firing unit; the first volley of an attack sequence also saves the player's view. */
async function beginCine(h: HeldVolley, to: GameState): Promise<void> {
  try {
    const cam = cameraApi.current
    if (!cam) return
    if (!cine) {
      const shooters = clusterOf(pointsOf(h.unitId, h.from, to))
      const targetIds = new Set(h.declared.flatMap((d) => d.targets.map((t) => t.targetUnitId)))
      const targets = clusterOf([...targetIds].flatMap((id) => pointsOf(id, h.from, to)))
      if (!shooters || !targets) return
      cine = {
        saved: cam.getView(),
        stamp: cam.inputCount(),
        shooters,
        targets,
        pieces: Object.values(to.board?.pieces ?? {}),
        aspect: cam.aspect(),
        from: h.from,
        to,
        closedUp: new Set(),
        chain: Promise.resolve(),
        waiting: 0,
      }
    }
    const c = cine
    c.closedUp.clear()
    petStall()
    await cineFly(shoulderViewClear(c.pieces, c.shooters, c.targets, c.aspect), shotTimes(currentFactor()).shoulder)
  } catch (err) {
    console.warn('[presentation] failed to frame the shot', err)
  }
}

/** After a volley's last landing: stay on the last target when something got through, else a short hold on the shoulder view. */
async function holdCine(): Promise<void> {
  const c = cine
  if (!c) return
  try {
    await c.chain
    if (!cineAlive()) return
    const times = shotTimes(currentFactor())
    await sleep(closingBeat(c.closedUp.size) === 'closeup-hold' ? times.hold : times.beat)
    petStall()
    cineAlive() // notices a player who moved the camera during the hold
  } catch (err) {
    console.warn('[presentation] shot camera hold failed', err)
  }
}

/** Back to the player's view. Safe when no cinematic runs. */
async function cineEnd(): Promise<void> {
  const c = cine
  cine = null
  cineDeclined = false
  const cam = cameraApi.current
  if (!c || !cam || cam.inputCount() !== c.stamp) return
  petStall()
  await cam.flyTo(c.saved, shotTimes(currentFactor()).back)
}

/**
 * The bot set units up (or brought reserves in): fly to each, hold, and show the step's result as the camera arrives at
 * the first so the unit appears under the lens. The trip's way back is flown once the batch ends (endTrip).
 */
async function deployVisits(visits: Extract<DeployBeat, { kind: 'visit' }>[], reveal: () => void): Promise<void> {
  let revealed = false
  const showOnce = (): void => {
    if (revealed) return
    revealed = true
    reveal()
  }
  try {
    const cam = cameraApi.current
    if (!cam || visits.length === 0) return
    const times = deployTimes(currentFactor())
    if (!trip) {
      const before = cam.getView()
      // a reserve unit arriving mid-game: the player is looking wherever they were; a set-up unit: their last deployment view
      trip = { back: visits.some((v) => v.arrival) ? before : returnView(lastPlayerView, cam.homeView(), before), stamp: cam.inputCount() }
    }
    for (const v of visits) {
      if (!trip || cam.inputCount() !== trip.stamp) break
      const arrived = await cam.flyTo(visitView(cam.getView(), v, cam.aspect()), times.fly)
      petStall()
      if (!arrived) {
        trip = null
        break
      }
      showOnce()
      await sleep(times.hold)
      petStall()
    }
  } catch (err) {
    console.warn('[presentation] deploy camera failed', err)
  } finally {
    showOnce()
  }
}

async function endTrip(): Promise<void> {
  const t = trip
  trip = null
  const cam = cameraApi.current
  if (!t || !cam || cam.inputCount() !== t.stamp) return
  petStall()
  await cam.flyTo(t.back, deployTimes(currentFactor()).fly)
}

function resetCamera(): void {
  cine = null
  cineDeclined = false
  lastPlayerView = null
  trip = null
}

/** Fires the held volley: the unit's shoot pose and firing sound, one volley per weapon+target, and each
 *  landing as its shot arrives; resolves once every shot has landed (or the wait cap runs out). Called at
 *  the end of the attack sequence, or earlier when held damage would otherwise sit behind a decision. */
function fireHeldVolley(to: GameState, bundle: DataBundle | null, humanSeat: PlayerId, lookup: SoundLookup): Promise<void> {
  return whilePlaying(() => fireHeldVolleyBody(to, bundle, humanSeat, lookup))
}

async function fireHeldVolleyBody(to: GameState, bundle: DataBundle | null, humanSeat: PlayerId, lookup: SoundLookup): Promise<void> {
  const h = heldVolley
  if (!h) return
  // Taken up front so a failure below can never leave the cursor held.
  const held = h.held
  const rolls = h.rolls
  const fired = h.fired++
  h.held = []
  h.rolls = []
  h.damaging = false
  const cues = useCueStore.getState()
  const speed = usePresentationSettings.getState().animSpeed
  const landings = landingsOf(held)
  const struck = new Map<string, StruckModel[]>()
  // set once the shot camera is up: a landing that gets through on a unit sends the camera in on it
  let onDamage: ((unitId: string) => void) | undefined
  const landOn = (l: Landing): void => playLanding(l, h.from, to, humanSeat, lookup, onDamage)
  for (const l of landings) {
    if (!l.key || !l.modelId) continue
    const list = struck.get(l.key) ?? []
    list.push({ modelId: l.modelId, onImpact: () => landOn(l) })
    struck.set(l.key, list)
  }

  const faction = factionOf(to, h.unitId) || factionOf(h.from, h.unitId)
  // After the first firing only groups with fresh hit rolls fire again; with no rolls at all (dice not in
  // the log) the first firing estimates its shots from the weapons instead.
  const rolledOnly = fired > 0 || rolls.length > 0
  const volleys = h.declared.flatMap((d) => planVolleys(d, rolls, h.from, to, bundle, faction, { struck, rolledOnly }))

  let pending = 0
  let allLanded: () => void = () => {}
  const landed = new Promise<void>((resolve) => { allLanded = resolve })
  let camOn = false
  if (volleys.length > 0) {
    // the firing models turn to the target first, so they are already facing it while the camera swings round
    for (const d of h.declared) {
      for (const t of d.targets) {
        const firer = modelPoint(h.from, to, t.modelId)
        const targetModels = unitModels(to, t.targetUnitId).length > 0 ? unitModels(to, t.targetUnitId) : unitModels(h.from, t.targetUnitId)
        if (!firer || targetModels.length === 0) continue
        const anchor = modelsAnchor(targetModels)
        cues.setModelFacing(t.modelId, bearing(firer, { x: anchor.x, z: anchor.z }), VOLLEY_FACING_MS)
      }
    }
    // The dice have all played by now, so the shoulder view starts with the volley and never covers the dice tray.
    camOn = !cineDeclined && cameraWanted()
    if (camOn) {
      await beginCine(h, to)
      camOn = cine !== null
      if (camOn) onDamage = queueCloseup
    }
    cues.setUnitAction(h.unitId, 'shoot', `${h.token}:${fired}`, CUE_MS.shoot)
    if (fired === 0) playEventSounds(audio, h.declared, humanSeat, lookup)
    for (const v of volleys) {
      for (const s of v.shots) {
        const own = s.onImpact
        pending++
        s.onImpact = () => {
          own?.()
          if (--pending === 0) allLanded()
        }
      }
      vfx.volley({ family: v.family, shots: v.shots })
    }
  }
  if (pending > 0 && speed !== 'instant') await Promise.race([landed, sleep(VOLLEY_WAIT_MAX_MS)])
  // Whatever hasn't landed yet (no shot aimed at it, a unit-destroyed line, the wait ran out) plays now.
  for (const l of landings) landOn(l)
  // A beat for the last fall and shimmer to read before the next banner or roll.
  if (volleys.length > 0 && speed !== 'instant') await sleep(speed === 'fast' ? VOLLEY_SETTLE_MS * 0.35 : VOLLEY_SETTLE_MS)
  if (camOn) await holdCine()
}

/** Shows everything held off-board as presented, then lets fallen models go once the board has dropped them. */
function revealThrough(seq: number): void {
  setPresentedSeq(seq)
  pruneFallen()
}

function pruneFallen(): void {
  const { snapshots, presentedSeq } = usePresentedStore.getState()
  const shown = pickDisplaySnapshot(snapshots, presentedSeq)
  useCueStore.getState().pruneFallen((id) => !!shown?.models[id])
}

// ---------- TargetsDeclared: turn the attacking figures and fire vfx ----------

function playTargetsDeclared(e: EventOf<'TargetsDeclared'>, from: GameState, to: GameState): void {
  const cues = useCueStore.getState()
  const attackerFaction = factionOf(to, e.unitId)

  if (e.phase === 'fight') {
    const seenTargets = new Set<string>()
    const lunged = new Set<string>()
    for (const t of e.targets) {
      const attacker = modelPoint(from, to, t.modelId)
      const targetModels = unitModels(to, t.targetUnitId)
      if (!attacker || targetModels.length === 0) continue
      const anchor = modelsAnchor(targetModels)
      cues.setModelFacing(t.modelId, bearing(attacker, anchor), CUE_MS.facing)
      if (!lunged.has(t.modelId)) { lunged.add(t.modelId); cues.setModelAction(t.modelId, 'melee', `${e.seq}:${t.modelId}`, CUE_MS.melee) } // only attacking models lunge
      if (seenTargets.has(t.targetUnitId)) continue
      seenTargets.add(t.targetUnitId)
      vfx.melee({ x: (attacker.x + anchor.x) / 2, y: attacker.y + 0.3, z: (attacker.z + anchor.z) / 2 }, attackerFaction)
    }
  }
}

// ---------- narration pauses ----------

// Own words, matching the HUD's phase chips (src/client/ui/Hud.tsx PHASES).
const PHASE_TITLE: Partial<Record<Phase, string>> = {
  command: 'Command Phase',
  movement: 'Movement Phase',
  shooting: 'Shooting Phase',
  charge: 'Charge Phase',
  fight: 'Fight Phase',
}

/** Shows the banner for `kind` and waits out its pause (announceStore.ts). The wait is why a phase
 *  nothing happens in no longer flashes past under a pile-up of overlapping narrator lines: the
 *  events after it stay queued until the player has had a beat to read it (or clicked through). */
function announce(kind: AnnouncementKind, title: string, subtitle: string, player: PlayerId): Promise<void> {
  const durationMs = announcementHoldMs(kind, usePresentationSettings.getState().animSpeed)
  return holdAnnouncement({ kind, title, subtitle, player, durationMs })
}

// ---------- one event ----------

/** Weapon/faction lookups the sound map needs to pick a weapon-accurate firing sound. Rebuilt per
 *  batch against that batch's post-state, so a unit destroyed later in the same batch still resolves. */
function soundLookup(state: GameState, bundle: DataBundle | null): SoundLookup {
  return {
    weapon: (weaponId) => bundle?.weapons[weaponId],
    factionOfUnit: (unitId) => factionOf(state, unitId),
  }
}

async function playEvent(
  event: GameEvent,
  from: GameState,
  to: GameState,
  bundle: DataBundle | null,
  humanSeat: PlayerId,
  announcedPhases: Set<Phase>,
  lookup: SoundLookup,
  sounds = true,
): Promise<void> {
  const settings = usePresentationSettings.getState()
  const cues = useCueStore.getState()

  if (event.type === 'RoundStarted') announcedPhases.clear()

  // Narrator phase lines: at most once per phase per round (10-rules turns repeat every phase for
  // both players every round — announcing it twice a round reads as spammy, not helpful).
  if (event.type === 'PhaseStarted') {
    if (announcedPhases.has(event.phase)) return
    announcedPhases.add(event.phase)
  }

  // Sound: src/client/audio/eventSounds.ts already maps almost every event type below to a sound
  // (dice rattle, hit/save clanks, deaths, charge rumble, objective/VP/CP/stratagem/battle-shock
  // stings, phase/turn narrator lines, victory/defeat) — one call here covers all of it.
  // Grouped roll events are silenced here: playBatch plays one sound for the whole window.
  if (sounds) playEventSounds(audio, [event], humanSeat, lookup)

  switch (event.type) {
    // The two narrated beats (see `announce`). PhaseStarted only reaches here when it is the round's
    // first announcement of that phase — the early return above already dropped the repeat.
    case 'PhaseStarted': {
      const title = PHASE_TITLE[event.phase]
      if (!title) return
      const who = to.players[event.turn]?.name ?? ''
      await announce('phase', title, who ? `Round ${event.round} · ${who}` : `Round ${event.round}`, event.turn)
      return
    }

    case 'TurnStarted': {
      // Only the human's turn is narrated (eventSounds.ts plays 'narr-your-turn' for that seat only),
      // so only that one gets a pause — the bot's turn starts straight into its command phase beat.
      if (event.turn !== humanSeat) return
      const who = to.players[event.turn]?.name ?? ''
      await announce('turn', 'Your Turn', who ? `Round ${event.round} · ${who}` : `Round ${event.round}`, event.turn)
      return
    }

    // Melee lunges are per attacking model, cued from TargetsDeclared; a ranged attack's shoot pose waits
    // for its dice and is cued by fireHeldVolley (playBatch keeps those events from reaching here).
    case 'AttackSequenceStarted':
      return

    case 'TargetsDeclared':
      playTargetsDeclared(event, from, to)
      return

    // HitRolled / WoundRolled / FeelNoPainRolled / HazardousTested dice are shown by playBatch as
    // one grouped window per batch roll (see rollGroupKey).
    case 'SaveRolled': {
      if (event.saved) {
        const at = modelPoint(from, to, event.modelId)
        if (at) vfx.save(at)
      }
      return
    }

    case 'DiceRolled':
      if (event.roll.purpose === 'charge') lastChargeRollId = event.roll.id
      return

    case 'DiceRerolled':
      noteReroll(event)
      return

    case 'ChargeRolled':
      if (settings.diceOn) await whilePlaying(() => playRoll(chargeRequest(to, event)))
      return

    case 'DeadlyDemiseRolled':
      if (settings.diceOn) await whilePlaying(() => playRoll(deadlyDemiseRequest(to, event)))
      return

    case 'DamageApplied': {
      const at = modelPoint(from, to, event.modelId)
      if (at) {
        if (event.mortal) vfx.mortal(at)
        else vfx.hit(at, Math.min(1, event.amount / 3))
      }
      cues.setModelAction(event.modelId, 'hit', event.seq, CUE_MS.hit)
      return
    }

    case 'ModelDestroyed': {
      const at = modelPoint(from, to, event.modelId)
      if (at) vfx.death(at)
      return
    }

    case 'ChargeMoved':
    case 'PiledIn':
    case 'Consolidated':
      for (const path of Object.values(event.paths)) if (path.length > 0) vfx.chargeDust(path)
      return

    case 'ObjectiveSecured': {
      const obj = to.objectives[event.objectiveId]
      if (obj) vfx.objectivePulse({ x: obj.pos.x, y: 0.05, z: obj.pos.z }, playerColor(event.by))
      return
    }

    case 'VpScored': {
      // Raised here (not when the engine step lands) so the "+N VP" pop-up matches the beat on screen.
      const toast = vpToastFrom(to, bundle, [event])
      if (toast) useGameStore.setState({ vpToast: toast })
      return
    }

    default:
      return
  }
}

// ---------- batch queue ----------

/** Plays one batch; a shot camera or deployment trip it started always goes back to the player's view before control returns. */
async function playBatch(from: GameState, to: GameState, events: GameEvent[], announcedPhases: Set<Phase>): Promise<void> {
  const stopHeartbeat = startHeartbeat()
  try {
    await playBatchBody(from, to, events, announcedPhases)
  } finally {
    stopHeartbeat()
    try {
      await cineEnd()
    } catch (err) {
      console.warn('[presentation] shot camera return failed', err)
    }
    try {
      await endTrip()
    } catch (err) {
      console.warn('[presentation] deploy camera return failed', err)
    }
  }
}

async function playBatchBody(from: GameState, to: GameState, events: GameEvent[], announcedPhases: Set<Phase>): Promise<void> {
  const { humanSeat, botSeat, bundle } = useGameStore.getState()
  const lookup = soundLookup(to, bundle)
  // Deployment beats: the human's own set-up records their view; a bot's set-up (or arrival from reserves) is visited.
  const beats = new Map<number, DeployBeat>()
  if (usePresentationSettings.getState().cinematicCamera && cameraApi.current) {
    for (const b of deployBeats(events, { humanSeat, botSeat, factor: currentFactor(), footprint: (id) => pointsOf(id, to) })) beats.set(b.index, b.beat)
  }
  let visits: Extract<DeployBeat, { kind: 'visit' }>[] = []
  // Indices of roll events whose dice already played inside an earlier grouped window.
  const grouped = new Set<number>()
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const key = rollGroupKey(event)
    const absorbed = grouped.has(i)
    // A ranged attack's declaration and outcome wait in the held volley (see fireHeldVolley).
    let deferred = false
    // A presentation glitch (a stale reference in an unusual game state, say) should never take down
    // the rest of the game's presentation for the whole session — the queue keeps going either way.
    try {
      if (event.type === 'AttackSequenceStarted' && event.kind === 'ranged') {
        if (heldVolley) await fireHeldVolley(to, bundle, humanSeat, lookup) // a sequence that never closed
        heldVolley = { unitId: event.unitId, token: `${event.seq}:${i}`, declared: [], rolls: [], held: [], damaging: false, fired: 0, from }
      } else if (event.type === 'DeadlyDemiseRolled' && heldVolley?.damaging) {
        await fireHeldVolley(to, bundle, humanSeat, lookup) // the vehicle is shot down before its demise roll
      }
      const held = heldVolley
      if (held) {
        if (event.type === 'TargetsDeclared') held.declared.push(event)
        else if (event.type === 'HitRolled') held.rolls.push(event)
        else if (HELD_EVENTS.has(event.type)) {
          held.held.push(event)
          if (event.type === 'DamageApplied' || event.type === 'ModelDestroyed') held.damaging = true
        }
        deferred = event.type === 'AttackSequenceStarted' || event.type === 'TargetsDeclared' || HELD_EVENTS.has(event.type)
      }
      if (key !== null && !absorbed) {
        // Gather every same-key roll left in this attack sequence and show them as one window — a
        // fast-rolled batch shares one roll id; per-attack saves share attacker+weapon+target.
        const group = [event]
        for (let j = i + 1; j < events.length; j++) {
          const e = events[j]
          if (e.type === 'AttackSequenceStarted' || e.type === 'AttackSequenceEnded') break
          if (rollGroupKey(e) === key) { group.push(e); grouped.add(j) }
        }
        // A held save's clank (or the thud of a failed one) waits for its shot to land.
        if (!(deferred && event.type === 'SaveRolled')) playEventSounds(audio, [event], humanSeat, lookup)
        const req = usePresentationSettings.getState().diceOn ? groupRequest(to, group) : null
        if (req) await whilePlaying(() => playRoll(req))
      }
      if (!deferred) await playEvent(event, from, to, bundle, humanSeat, announcedPhases, lookup, key === null)
      if (heldVolley && event.type === 'AttackSequenceEnded') {
        await fireHeldVolley(to, bundle, humanSeat, lookup)
        heldVolley = null
        await cineEnd() // the whole attack is over: back to the player's view, once
      }
      const beat = beats.get(i)
      if (beat?.kind === 'record') lastPlayerView = cameraApi.current?.getView() ?? lastPlayerView
      else if (beat?.kind === 'visit') visits.push(beat)
    } catch (err) {
      console.warn('[presentation] failed to play event', event.type, err)
    }
    // The bot's last set-up shares its step with what follows (the first-turn roll-off, the phase banner): the visit
    // plays now, before those, with its units shown ahead of the cursor; the camera is home again when they start.
    if (visits.length > 0 && visitFlush(events, i) === 'now') {
      const toVisit = visits
      visits = []
      try {
        await deployVisits(toVisit, () => revealUnitsAhead(toVisit.flatMap((v) => v.unitIds), event.seq))
      } catch (err) {
        console.warn('[presentation] deploy visit failed', err)
      }
      try {
        await endTrip()
      } catch (err) {
        console.warn('[presentation] deploy camera return failed', err)
      }
    }
    // Engine seq is per *step* (every event of one step() shares it), so the cursor may only reach a
    // seq once that step's last event has played — otherwise its first event would reveal the whole
    // step's outcome (feed, counters, deaths, prompt) before the rest of its dice are shown. While a
    // volley holds damage it doesn't move at all; setPresentedSeq(-1) only re-arms the stall net.
    if (i === events.length - 1 || events[i + 1].seq !== event.seq) {
      const reveal = (): void => {
        if (heldVolley?.damaging) setPresentedSeq(-1)
        else revealThrough(event.seq)
      }
      if (visits.length > 0) {
        // the camera flies to the new unit first and the step's result appears as it arrives
        const toVisit = visits
        visits = []
        await deployVisits(toVisit, reveal)
      } else reveal()
    }
    // Someone (bot or human) is already sitting on a live Command Re-roll offer — skip the decorative
    // pacing gap between events so the batch flushes straight through to the roll they're actually being
    // asked about, instead of making a human re-roll decision wait behind unrelated event pacing.
    const midCommandReroll = useGameStore.getState().pending?.kind === 'commandReroll'
    if (!absorbed && !deferred && !midCommandReroll) await sleep(gapFor(event.type, usePresentationSettings.getState().animSpeed))
  }
  // The batch ran out mid-attack with damage held: a decision is waiting on it (the defender picking which
  // model takes the next wound, say), so what's been rolled fires now; later wounds get shots of their own.
  if (heldVolley?.damaging && events.length > 0) {
    try {
      await fireHeldVolley(to, bundle, humanSeat, lookup)
    } catch (err) {
      console.warn('[presentation] failed to fire held volley', err)
    }
    revealThrough(events[events.length - 1].seq)
  }
}

/** Subscribes to the game store and starts the playback queue; returns an unsubscribe function.
 *  Safe to call once per app lifetime (Director.tsx does this in a mount-only effect). */
export function startDirector(): () => void {
  let prevState: GameState | null = null
  // Last event already queued, tracked by reference: seq can't be used (one seq per step, and an
  // ActionRejected reuses the seq the next accepted step will carry, which would hide that step).
  let lastEvent: GameEvent | null = null
  // Events not yet played, and the state from before the first of them.
  let buffered: GameEvent[] = []
  let bufferedFrom: GameState | null = null
  let pumping = false
  const announcedPhases = new Set<Phase>()

  function reset(): void {
    prevState = null
    lastEvent = null
    buffered = []
    bufferedFrom = null
    heldVolley = null
    resetCamera()
    announcedPhases.clear()
    catchUpPresented()
    clearAnnouncement()
    useCueStore.getState().reset()
    setPresentationIdle(true)
  }

  // One attack still reaches the store as several updates (a batch of hits, then wounds, then saves, with a
  // Command Re-roll window before each). While the bot is answering those (play carries on by itself), hold
  // attack rolls until their sequence ends so per-attack saves group into one window. When the human
  // owns the pending decision, play what's buffered — the interactive re-roll tray shows the dice itself.
  async function waitForAttackToClose(): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < ATTACK_WAIT_MAX_MS && hasOpenAttackRolls(buffered)) {
      const { pending, botSeat, state } = useGameStore.getState()
      if (!state || !pending || !botSeat || pending.player !== botSeat) return
      await sleep(60)
    }
  }

  async function pump(): Promise<void> {
    if (pumping) return
    pumping = true
    try {
      while (buffered.length > 0 && prevState) {
        await waitForAttackToClose()
        const events = buffered
        const from = bufferedFrom ?? prevState
        const to = prevState
        buffered = []
        bufferedFrom = null
        if (events.length === 0 || !to) break
        try {
          await playBatch(from, to, events, announcedPhases)
        } catch (err) {
          console.warn('[presentation] batch failed', err)
        }
      }
    } finally {
      pumping = false
      // Nothing left buffered and no batch still playing — report idle immediately so a bot loop
      // waiting on it (src/client/store/game.ts) proceeds right away instead of sitting on its own
      // watchdog. Re-checked against the live `buffered` (not just "the while loop ended") since the
      // store's subscribe callback below can push new events onto it between the last iteration and
      // this line running.
      if (buffered.length === 0) {
        catchUpPresented()
        pruneFallen()
        setPresentationIdle(true)
      }
    }
  }

  const unsubscribe = useGameStore.subscribe((s) => {
    const state = s.state
    if (!state) {
      reset()
      return
    }
    const events = s.events
    let start = 0
    if (lastEvent) {
      const idx = events.lastIndexOf(lastEvent)
      // The log no longer holds what we last queued: a new game or a load replaced it under us.
      if (idx === -1) reset()
      else start = idx + 1
    }
    const fresh = events.slice(start)
    if (fresh.length === 0) {
      prevState = state
      return
    }
    lastEvent = events[events.length - 1]
    if (buffered.length === 0) bufferedFrom = prevState ?? state
    buffered = [...buffered, ...fresh]
    prevState = state
    // Report busy the instant something is queued (not just once pump() gets around to consuming it) —
    // a bot decision scheduled right after this dispatch must see "not idle yet" even before pump's own
    // async chain has had a turn to run.
    setPresentationIdle(false)
    void pump()
  })

  return () => {
    unsubscribe()
  }
}
