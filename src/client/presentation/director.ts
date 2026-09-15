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

function hitRequest(state: GameState, e: EventOf<'HitRolled'>): RollRequest {
  return { label: attackLabel(state, e.attack, 'To hit'), purpose: 'hit', dice: [e.final] }
}
function woundRequest(state: GameState, e: EventOf<'WoundRolled'>): RollRequest {
  return { label: attackLabel(state, e.attack, 'To wound'), purpose: 'wound', dice: [e.final], target: e.needed }
}
function saveRequest(state: GameState, e: EventOf<'SaveRolled'>): RollRequest {
  const label = e.kind === 'invuln' ? 'Invulnerable save' : e.kind === 'armour' ? 'Armour save' : 'Save'
  return { label: attackLabel(state, e.attack, label), purpose: 'save', dice: [e.final], target: e.needed }
}
function fnpRequest(state: GameState, e: EventOf<'FeelNoPainRolled'>): RollRequest {
  return { label: `${unitLabel(state, e.unitId)} — Feel No Pain`, purpose: 'fnp', dice: [e.die], target: e.needed }
}
function chargeRequest(state: GameState, e: EventOf<'ChargeRolled'>): RollRequest {
  return { label: `${unitLabel(state, e.unitId)} — Charge`, purpose: 'charge', dice: [...e.dice], target: e.needed ?? undefined }
}
function hazardousRequest(state: GameState, e: EventOf<'HazardousTested'>): RollRequest {
  return { label: `${unitLabel(state, e.unitId)} — Hazardous`, purpose: 'hazardous', dice: [e.die] }
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
  playEventSounds(audio, [event], humanSeat)

  switch (event.type) {
    case 'AttackSequenceStarted':
      cues.setUnitAction(event.unitId, event.kind === 'melee' ? 'melee' : 'shoot', event.seq, CUE_MS[event.kind === 'melee' ? 'melee' : 'shoot'])
      return

    case 'TargetsDeclared':
      playTargetsDeclared(event, from, to, bundle)
      return

    case 'HitRolled':
      if (settings.diceOn) await playRoll(hitRequest(to, event))
      return

    case 'WoundRolled':
      if (settings.diceOn) await playRoll(woundRequest(to, event))
      return

    case 'SaveRolled': {
      if (settings.diceOn) await playRoll(saveRequest(to, event))
      if (event.saved) {
        const at = modelPoint(from, to, event.modelId)
        if (at) vfx.save(at)
      }
      return
    }

    case 'FeelNoPainRolled':
      if (settings.diceOn) await playRoll(fnpRequest(to, event))
      return

    case 'ChargeRolled':
      if (settings.diceOn) await playRoll(chargeRequest(to, event))
      return

    case 'HazardousTested':
      if (settings.diceOn) await playRoll(hazardousRequest(to, event))
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
  for (const event of events) {
    // A presentation glitch (a stale reference in an unusual game state, say) should never take down
    // the rest of the game's presentation for the whole session — the queue keeps going either way.
    try {
      await playEvent(event, from, to, bundle, humanSeat, announcedPhases)
    } catch (err) {
      console.warn('[presentation] failed to play event', event.type, err)
    }
    await sleep(gapFor(event.type, usePresentationSettings.getState().animSpeed))
  }
}

/** Subscribes to the game store and starts the playback queue; returns an unsubscribe function.
 *  Safe to call once per app lifetime (Director.tsx does this in a mount-only effect). */
export function startDirector(): () => void {
  let prevState: GameState | null = null
  let lastSeq = -1
  let queue: Promise<void> = Promise.resolve()
  const announcedPhases = new Set<Phase>()

  const unsubscribe = useGameStore.subscribe((s) => {
    const state = s.state
    if (!state) {
      prevState = null
      lastSeq = -1
      announcedPhases.clear()
      useCueStore.getState().reset()
      return
    }
    const events = s.events
    const latestSeq = events.length > 0 ? events[events.length - 1].seq : -1
    if (latestSeq < lastSeq) {
      // A lower seq than we've already seen means a new game started under us.
      prevState = null
      lastSeq = -1
      announcedPhases.clear()
      useCueStore.getState().reset()
    }
    const fresh = events.filter((e) => e.seq > lastSeq)
    if (fresh.length === 0) {
      prevState = state
      return
    }
    lastSeq = latestSeq
    const from = prevState ?? state
    const to = state
    prevState = state
    queue = queue.then(() => playBatch(from, to, fresh, announcedPhases)).catch((err) => {
      console.warn('[presentation] batch failed', err)
    })
  })

  return () => {
    unsubscribe()
  }
}
