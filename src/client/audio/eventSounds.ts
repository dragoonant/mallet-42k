// Maps engine GameEvents (src/engine/events.ts) to sounds from the manifest. Pure/no side effects —
// playEventSounds is the only function that actually calls the AudioManager, so this stays easy to
// unit-test and easy for whoever wires the store (src/client/store/game.ts, not owned by this task)
// to drop into their event-handling: something like
//   useEffect(() => { for (const e of newEvents) playEventSounds(audio, e, humanSeat) }, [events])
//
// AttackKind only distinguishes 'ranged' vs 'melee' (no per-weapon-datasheet sound yet), so this
// picks one representative SFX per kind; a later pass can special-case specific weapons once the
// client threads datasheet info through to the event (or alongside it).

import type { GameEvent } from '../../engine/events'
import type { PlayerId, Phase } from '../../engine/types'
import type { AudioManager, PlayOptions } from './manager'
import type { SoundId, VoiceId } from './manifest'

export interface EventSound {
  id: SoundId
  opts?: PlayOptions
}

const PHASE_VOICE_LINE: Partial<Record<Phase, VoiceId>> = {
  command: 'narr-command-phase',
  movement: 'narr-movement-phase',
  shooting: 'narr-shooting-phase',
  charge: 'narr-charge',
  fight: 'narr-fight-phase',
}

/** Sounds to play for one engine event. `perspective` (the human seat) is optional — omit it to get
 *  every sound regardless of whose turn it is; pass it to also get "your turn"/victory-or-defeat
 *  lines correct for that seat. */
export function soundsForEvent(event: GameEvent, perspective?: PlayerId): EventSound[] {
  switch (event.type) {
    case 'RoundStarted':
      return event.round === 1 ? [{ id: 'narr-battle-round-one' }] : [{ id: 'turn-start-horn' }]

    case 'TurnStarted':
      return perspective && event.turn === perspective ? [{ id: 'narr-your-turn' }] : []

    case 'PhaseStarted': {
      const line = PHASE_VOICE_LINE[event.phase]
      return line ? [{ id: line }] : []
    }

    case 'DiceRolled':
      return [{ id: 'dice-rattle' }, { id: 'dice-land', opts: { volume: 0.8 } }]

    case 'AttackSequenceStarted':
      return [{ id: event.kind === 'melee' ? 'melee-chainsword' : 'bolter-burst' }]

    case 'SaveRolled':
      if (event.saved) return [{ id: event.kind === 'invuln' ? 'invuln-shimmer' : 'armour-save-clank' }]
      return [{ id: 'hit-impact' }]

    case 'ModelDestroyed':
      return [{ id: 'model-death' }]

    case 'UnitDestroyed':
      return [{ id: 'narr-unit-destroyed' }]

    case 'DeadlyDemiseRolled':
      return event.exploded ? [{ id: 'vehicle-explosion' }] : []

    case 'ChargeDeclared':
      return [{ id: 'charge-rumble' }]

    case 'ObjectiveSecured':
      return [{ id: 'objective-captured-chime' }, { id: 'narr-objective-taken' }]

    case 'VpScored':
      return [{ id: 'vp-scored-sting' }]

    case 'CpChanged':
      return event.delta > 0 ? [{ id: 'cp-gained-click' }] : []

    case 'StratagemUsed':
      return [{ id: 'stratagem-whoosh' }, { id: 'narr-stratagem' }]

    case 'BattleShocked':
      return [{ id: 'battle-shock-sting' }]

    case 'ActionRejected':
      return [{ id: 'ui-error' }]

    case 'GameEnded': {
      if (!perspective) return []
      if (event.result.winner === 'draw') return []
      return [{ id: event.result.winner === perspective ? 'victory-fanfare' : 'defeat-sting' }]
    }

    default:
      return []
  }
}

/** Plays every sound mapped from a batch of events (e.g. the events a single step() call returned)
 *  through the given AudioManager. */
export function playEventSounds(audio: AudioManager, events: readonly GameEvent[], perspective?: PlayerId): void {
  for (const event of events) {
    for (const sound of soundsForEvent(event, perspective)) audio.play(sound.id, sound.opts)
  }
}

/** Victory/defeat narrator line for a finished game, from a given seat's perspective — split out
 *  from soundsForEvent's GameEnded case for callers that already have the GameResult on hand (e.g.
 *  the end screen) rather than the raw event. */
export function endGameVoiceLine(winner: PlayerId | 'draw', perspective: PlayerId): VoiceId | null {
  if (winner === 'draw') return null
  return winner === perspective ? 'narr-victory' : 'narr-defeat'
}
