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
import { catchUpPresented, setPresentedSeq } from './presentedStore'
import { modelsAnchor } from '../interaction/geometry'
import { useCueStore } from './cueStore'
import { setPresentationIdle } from './idleStore'
import { usePresentationSettings, type AnimSpeed } from './settings'
import { announcementHoldMs, clearAnnouncement, holdAnnouncement, type AnnouncementKind } from './announceStore'
import { playRoll, rerollTrayShown, type RollRequest } from '../dice'
import { vfx } from '../vfx'
import { planVolleys } from './volleys'
import { audio, playEventSounds, type SoundLookup } from '../audio'
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
  for (const e of group) {
    if (e.type === 'HitRolled') { if (!e.auto) entries.push({ index: e.dieIndex, die: e.die, passed: e.hit }) }
    else if (e.type === 'WoundRolled') { if (!e.auto) { entries.push({ index: e.dieIndex, die: e.die, passed: e.wounded }); needed.add(e.needed) } }
    else if (e.type === 'SaveRolled') { if (e.kind !== 'none') { entries.push({ index: e.dieIndex, die: e.die, passed: e.saved }); needed.add(e.needed) } }
    else if (e.type === 'FeelNoPainRolled') { entries.push({ index: undefined, die: e.die, passed: e.ignored }); needed.add(e.needed) }
    else if (e.type === 'HazardousTested') entries.push({ index: undefined, die: e.die, passed: !e.failed })
  }
  if (entries.length === 0) return null
  // A batch's dice read left to right in the order they were rolled.
  if (entries.every((en) => en.index !== undefined)) entries.sort((a, b) => (a.index as number) - (b.index as number))
  const first = group[0]
  const rollId = first.type === 'HitRolled' || first.type === 'WoundRolled' || first.type === 'SaveRolled' ? first.rollId : undefined
  const { dice, rerolled } = withRerolls(rollId, entries)
  const passed = entries.map((en) => en.passed)
  const target = needed.size === 1 ? [...needed][0] : undefined
  const flip = rerolled ? { rerolled } : {}
  const skipTumble = rollId !== undefined && rerollTrayShown.has(rollId)
  const common = { dice, passed, ...flip, ...(skipTumble ? { skipTumble } : {}) }
  const e = first
  switch (e.type) {
    case 'HitRolled': return { label: attackLabel(state, e.attack, 'To hit'), purpose: 'hit', ...common }
    case 'WoundRolled': return { label: attackLabel(state, e.attack, 'To wound'), purpose: 'wound', target, ...common }
    case 'SaveRolled': {
      const label = e.kind === 'invuln' ? 'Invulnerable save' : 'Armour save'
      return { label: attackLabel(state, e.attack, label), purpose: 'save', target, ...common }
    }
    case 'FeelNoPainRolled': return { label: `${unitLabel(state, e.unitId)} — Feel No Pain`, purpose: 'fnp', target, ...common }
    case 'HazardousTested': return { label: `${unitLabel(state, e.unitId)} — Hazardous`, purpose: 'hazardous', ...common }
    default: return null
  }
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

// ---------- TargetsDeclared: turn the firing/attacking figures and fire vfx ----------

function playTargetsDeclared(e: EventOf<'TargetsDeclared'>, from: GameState, to: GameState, bundle: DataBundle | null, rest: GameEvent[]): void {
  const cues = useCueStore.getState()
  const attackerFaction = factionOf(to, e.unitId)

  if (e.phase === 'shooting') {
    // One staggered volley per weapon+target group, a projectile per attack (hit/miss from the attack's own
    // hit rolls when they are in this batch, else estimated from the weapon's skill — see volleys.ts).
    for (const v of planVolleys(e, rest, from, to, bundle, attackerFaction)) {
      vfx.volley({ family: v.family, shots: v.shots })
    }
    for (const t of e.targets) {
      const firer = modelPoint(from, to, t.modelId)
      const targetModels = unitModels(to, t.targetUnitId)
      if (!firer || targetModels.length === 0) continue
      const anchor = modelsAnchor(targetModels)
      cues.setModelFacing(t.modelId, bearing(firer, { x: anchor.x, z: anchor.z }), CUE_MS.facing)
    }
    return
  }

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
  rest: GameEvent[] = [],
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

    case 'AttackSequenceStarted':
      if (event.kind === 'melee') return // melee lunges are per attacking model, cued from TargetsDeclared
      cues.setUnitAction(event.unitId, 'shoot', event.seq, CUE_MS.shoot)
      return

    case 'TargetsDeclared':
      playTargetsDeclared(event, from, to, bundle, rest)
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

async function playBatch(from: GameState, to: GameState, events: GameEvent[], announcedPhases: Set<Phase>): Promise<void> {
  const { humanSeat, bundle } = useGameStore.getState()
  const lookup = soundLookup(to, bundle)
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
        // Gather every same-key roll left in this attack sequence and show them as one window — a
        // fast-rolled batch shares one roll id; per-attack saves share attacker+weapon+target.
        const group = [event]
        for (let j = i + 1; j < events.length; j++) {
          const e = events[j]
          if (e.type === 'AttackSequenceStarted' || e.type === 'AttackSequenceEnded') break
          if (rollGroupKey(e) === key) { group.push(e); grouped.add(j) }
        }
        playEventSounds(audio, [event], humanSeat, lookup)
        const req = usePresentationSettings.getState().diceOn ? groupRequest(to, group) : null
        if (req) await playRoll(req)
      }
      await playEvent(event, from, to, bundle, humanSeat, announcedPhases, lookup, key === null, event.type === 'TargetsDeclared' ? events.slice(i + 1) : [])
    } catch (err) {
      console.warn('[presentation] failed to play event', event.type, err)
    }
    // Engine seq is per *step* (every event of one step() shares it), so the cursor may only reach a
    // seq once that step's last event has played — otherwise its first event would reveal the whole
    // step's outcome (feed, counters, deaths, prompt) before the rest of its dice are shown.
    if (i === events.length - 1 || events[i + 1].seq !== event.seq) setPresentedSeq(event.seq)
    // Someone (bot or human) is already sitting on a live Command Re-roll offer — skip the decorative
    // pacing gap between events so the batch flushes straight through to the roll they're actually being
    // asked about, instead of making a human re-roll decision wait behind unrelated event pacing.
    const midCommandReroll = useGameStore.getState().pending?.kind === 'commandReroll'
    if (!absorbed && !midCommandReroll) await sleep(gapFor(event.type, usePresentationSettings.getState().animSpeed))
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
