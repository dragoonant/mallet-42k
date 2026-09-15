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
import { useGameStore } from '../store/game'
import { modelsAnchor } from '../interaction/geometry'
import { useCueStore } from './cueStore'
import { setPresentationIdle } from './idleStore'
import { usePresentationSettings, type AnimSpeed } from './settings'
import { playRoll, type RollRequest } from '../dice'
import { vfx, type ShotKind } from '../vfx'
import { audio, playEventSounds } from '../audio'
import { colors } from '../ui/theme'

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

/** Loose weapon-name/keyword sniff for a tracer look — the engine doesn't expose a client-facing
 *  "weapon look" concept, and per-datasheet sound/vfx variety isn't worth the data-modelling cost
 *  yet (see audio/eventSounds.ts's own note on the same simplification). */
function shotKindFor(weaponId: string, weapon: WeaponData | undefined, faction: string): ShotKind {
  const s = `${weaponId} ${weapon?.name ?? ''}`.toLowerCase()
  if (s.includes('flame') || s.includes('torrent')) return 'flame'
  if (s.includes('psy') || s.includes('smite') || s.includes('warp')) return 'psychic'
  if (s.includes('heavy') || s.includes('las') || s.includes('kannon') || s.includes('rokkit') || s.includes('mega') || s.includes('missile')) return 'heavy'
  return faction === 'ork' ? 'shoota' : 'bolter'
}

function bearing(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.z - from.z, to.x - from.x)
}

// ---------- dice-roll request builders (only for rolls that are cleanly single/paired d6s) ----------

/** Rolls that share a tray window: every hit (or wound, save…) for one attacker+weapon+target in
 *  an attack sequence plays as one window, however many models rolled. Null = not groupable. */
function rollGroupKey(e: GameEvent): string | null {
  switch (e.type) {
    case 'HitRolled':
    case 'WoundRolled':
      return `${e.type}|${e.attack.attackerUnitId}|${e.attack.weaponId}|${e.attack.targetUnitId}`
    case 'SaveRolled':
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

/** One tray window for a group of same-key roll events. Auto hits/wounds and "no save possible"
 *  carry no die, so they're left out; null when nothing is left to show. */
function groupRequest(state: GameState, group: GameEvent[]): RollRequest | null {
  const dice: number[] = []
  const passed: boolean[] = []
  const needed = new Set<number>()
  for (const e of group) {
    if (e.type === 'HitRolled') { if (!e.auto) { dice.push(e.final); passed.push(e.hit) } }
    else if (e.type === 'WoundRolled') { if (!e.auto) { dice.push(e.final); passed.push(e.wounded); needed.add(e.needed) } }
    else if (e.type === 'SaveRolled') { if (e.kind !== 'none') { dice.push(e.final); passed.push(e.saved); needed.add(e.needed) } }
    else if (e.type === 'FeelNoPainRolled') { dice.push(e.die); passed.push(e.ignored); needed.add(e.needed) }
    else if (e.type === 'HazardousTested') { dice.push(e.die); passed.push(!e.failed) }
  }
  if (dice.length === 0) return null
  const target = needed.size === 1 ? [...needed][0] : undefined
  const e = group[0]
  switch (e.type) {
    case 'HitRolled': return { label: attackLabel(state, e.attack, 'To hit'), purpose: 'hit', dice, passed }
    case 'WoundRolled': return { label: attackLabel(state, e.attack, 'To wound'), purpose: 'wound', dice, passed, target }
    case 'SaveRolled': {
      const label = e.kind === 'invuln' ? 'Invulnerable save' : 'Armour save'
      return { label: attackLabel(state, e.attack, label), purpose: 'save', dice, passed, target }
    }
    case 'FeelNoPainRolled': return { label: `${unitLabel(state, e.unitId)} — Feel No Pain`, purpose: 'fnp', dice, passed, target }
    case 'HazardousTested': return { label: `${unitLabel(state, e.unitId)} — Hazardous`, purpose: 'hazardous', dice, passed }
    default: return null
  }
}

function chargeRequest(state: GameState, e: EventOf<'ChargeRolled'>): RollRequest {
  return { label: `${unitLabel(state, e.unitId)} — Charge`, purpose: 'charge', dice: [...e.dice], target: e.needed ?? undefined }
}
function deadlyDemiseRequest(state: GameState, e: EventOf<'DeadlyDemiseRolled'>): RollRequest {
  return { label: `${unitLabel(state, e.unitId)} — Deadly Demise`, purpose: 'deadlyDemise', dice: [e.die] }
}

// ---------- TargetsDeclared: turn the firing/attacking figures and fire vfx ----------

function playTargetsDeclared(e: EventOf<'TargetsDeclared'>, from: GameState, to: GameState, bundle: DataBundle | null): void {
  const cues = useCueStore.getState()
  const attackerFaction = factionOf(to, e.unitId)

  if (e.phase === 'shooting') {
    for (const t of e.targets) {
      const firer = modelPoint(from, to, t.modelId)
      const targetUnit = to.units[t.targetUnitId]
      if (!firer || !targetUnit) continue
      const targetModels = unitModels(to, t.targetUnitId)
      if (targetModels.length === 0) continue
      const anchor = modelsAnchor(targetModels)
      const to3 = { x: anchor.x, y: firer.y, z: anchor.z }
      const weapon = bundle?.weapons[t.weaponId]
      vfx.shoot(firer, to3, shotKindFor(t.weaponId, weapon, attackerFaction))
      cues.setModelFacing(t.modelId, bearing(firer, to3), CUE_MS.facing)
    }
    return
  }

  if (e.phase === 'fight') {
    const seenTargets = new Set<string>()
    for (const t of e.targets) {
      const attacker = modelPoint(from, to, t.modelId)
      const targetModels = unitModels(to, t.targetUnitId)
      if (!attacker || targetModels.length === 0) continue
      const anchor = modelsAnchor(targetModels)
      cues.setModelFacing(t.modelId, bearing(attacker, anchor), CUE_MS.facing)
      if (seenTargets.has(t.targetUnitId)) continue
      seenTargets.add(t.targetUnitId)
      vfx.melee({ x: (attacker.x + anchor.x) / 2, y: attacker.y + 0.3, z: (attacker.z + anchor.z) / 2 }, attackerFaction)
    }
  }
}

// ---------- one event ----------

async function playEvent(
  event: GameEvent,
  from: GameState,
  to: GameState,
  bundle: DataBundle | null,
  humanSeat: PlayerId,
  announcedPhases: Set<Phase>,
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
  if (sounds) playEventSounds(audio, [event], humanSeat)

  switch (event.type) {
    case 'AttackSequenceStarted':
      cues.setUnitAction(event.unitId, event.kind === 'melee' ? 'melee' : 'shoot', event.seq, CUE_MS[event.kind === 'melee' ? 'melee' : 'shoot'])
      return

    case 'TargetsDeclared':
      playTargetsDeclared(event, from, to, bundle)
      return

    // HitRolled / WoundRolled / FeelNoPainRolled / HazardousTested dice are shown by playBatch as
    // one grouped window per squad+weapon+target (see rollGroupKey).
    case 'SaveRolled': {
      if (event.saved) {
        const at = modelPoint(from, to, event.modelId)
        if (at) vfx.save(at)
      }
      return
    }

    case 'ChargeRolled':
      if (settings.diceOn) await playRoll(chargeRequest(to, event))
      return

    case 'DeadlyDemiseRolled':
      if (settings.diceOn) await playRoll(deadlyDemiseRequest(to, event))
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

    default:
      return
  }
}

// ---------- batch queue ----------

async function playBatch(from: GameState, to: GameState, events: GameEvent[], announcedPhases: Set<Phase>): Promise<void> {
  const { humanSeat, bundle } = useGameStore.getState()
  // Indices of roll events whose dice already played inside an earlier grouped window.
  const grouped = new Set<number>()
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const key = rollGroupKey(event)
    const absorbed = grouped.has(i)
    // A presentation glitch (a stale reference in an unusual game state, say) should never take down
    // the rest of the game's presentation for the whole session — the queue keeps going either way.
    try {
      if (key !== null && !absorbed) {
        // Gather every same-key roll left in this attack sequence (the engine interleaves hit → wound
        // → save per model) and show them as one window, like fast-dice at the table.
        const group = [event]
        for (let j = i + 1; j < events.length; j++) {
          const e = events[j]
          if (e.type === 'AttackSequenceStarted' || e.type === 'AttackSequenceEnded') break
          if (rollGroupKey(e) === key) { group.push(e); grouped.add(j) }
        }
        playEventSounds(audio, [event], humanSeat)
        const req = usePresentationSettings.getState().diceOn ? groupRequest(to, group) : null
        if (req) await playRoll(req)
      }
      await playEvent(event, from, to, bundle, humanSeat, announcedPhases, key === null)
    } catch (err) {
      console.warn('[presentation] failed to play event', event.type, err)
    }
    // Someone (bot or human) is already sitting on a live Command Re-roll offer — skip the decorative
    // pacing gap between events so the batch flushes straight through to the roll they're actually being
    // asked about, instead of making a human re-roll decision wait behind unrelated event pacing while
    // the die they need to see is still buried a few events back in this same buffered batch.
    const midCommandReroll = useGameStore.getState().pending?.kind === 'commandReroll'
    if (!absorbed && !midCommandReroll) await sleep(gapFor(event.type, usePresentationSettings.getState().animSpeed))
  }
}

/** Subscribes to the game store and starts the playback queue; returns an unsubscribe function.
 *  Safe to call once per app lifetime (Director.tsx does this in a mount-only effect). */
export function startDirector(): () => void {
  let prevState: GameState | null = null
  let lastSeq = -1
  // Events not yet played, and the state from before the first of them.
  let buffered: GameEvent[] = []
  let bufferedFrom: GameState | null = null
  let pumping = false
  const announcedPhases = new Set<Phase>()

  function reset(): void {
    prevState = null
    lastSeq = -1
    buffered = []
    bufferedFrom = null
    announcedPhases.clear()
    useCueStore.getState().reset()
    setPresentationIdle(true)
  }

  // The engine pauses for a Command Re-roll decision after almost every die, so one attack reaches the
  // store as many one-roll updates. While the bot is answering those (play carries on by itself), hold
  // attack rolls until their sequence ends so playBatch can group the whole squad's dice. When the human
  // owns the pending decision, play what's buffered — they may need to see the die to decide.
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
      if (buffered.length === 0) setPresentationIdle(true)
    }
  }

  const unsubscribe = useGameStore.subscribe((s) => {
    const state = s.state
    if (!state) {
      reset()
      return
    }
    const events = s.events
    const latestSeq = events.length > 0 ? events[events.length - 1].seq : -1
    // A lower seq than we've already seen means a new game started under us.
    if (latestSeq < lastSeq) reset()
    const fresh = events.filter((e) => e.seq > lastSeq)
    if (fresh.length === 0) {
      prevState = state
      return
    }
    lastSeq = latestSeq
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
