// Maps engine GameEvents (src/engine/events.ts) to sounds from the manifest. Pure/no side effects —
// playEventSounds is the only function that actually calls the AudioManager, so this stays easy to
// unit-test and easy for whoever wires the store (src/client/store/game.ts, not owned by this task)
// to drop into their event-handling: something like
//   useEffect(() => { for (const e of newEvents) playEventSounds(audio, e, humanSeat) }, [events])
//
// Firing sounds are per weapon, not per attack kind: TargetsDeclared is the event that names the
// weapons (AttackSequenceStarted only says ranged/melee), so that is where the shot SFX come from —
// one per distinct weapon flavour in the declaration, so a ten-model squad firing one gun is one
// sound, and a squad firing a bolter and a flamer at once is two. The classification is shared with
// the tracer look; see src/client/weaponFlavour.ts. Callers that have the data bundle pass a
// `SoundLookup`; without one the firing sounds fall back to the attacker's faction alone.

import type { GameEvent } from '../../engine/events'
import type { PlayerId, Phase } from '../../engine/types'
import type { WeaponData } from '../../data/types'
import { weaponFlavour, type WeaponFlavour } from '../weaponFlavour'
import type { AudioManager, PlayOptions } from './manager'
import type { SfxId, SoundId, VoiceId } from './manifest'

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

/** The per-weapon SFX for each flavour, with a playback trim where the asset itself is much louder
 *  than the rest of the palette. 'force' shares the psychic zap: a force weapon reads as a crackle in
 *  melee the same way Smite does at range.
 *
 *  The trims are measured, not guessed: decoded RMS across these seven assets runs from 0.09
 *  (power-klaw-crunch) to 0.31 (shoota-spray), so an ork mob firing shootas came out roughly three
 *  times louder than marines firing bolters at the same master volume — very audible now that each
 *  weapon has its own sound rather than everything sharing one. These pull the loud ones back to the
 *  ~0.15-0.18 RMS the others already sit at. Re-measure if an asset is regenerated. */
const FLAVOUR_SOUND: Record<WeaponFlavour, { id: SfxId; volume?: number }> = {
  bolter: { id: 'bolter-burst' },
  shoota: { id: 'shoota-spray', volume: 0.55 },
  heavy: { id: 'heavy-gun' },
  flame: { id: 'flamer', volume: 0.58 },
  psychic: { id: 'psychic-zap', volume: 0.9 },
  chain: { id: 'melee-chainsword' },
  crush: { id: 'power-klaw-crunch' },
  force: { id: 'psychic-zap', volume: 0.9 },
}

/** What a caller with the data bundle and game state can offer for weapon-accurate firing sounds
 *  (src/client/presentation/director.ts builds one per event batch). Both members are optional-safe:
 *  an unknown weapon or unit just classifies on what's left. */
export interface SoundLookup {
  weapon(weaponId: string): WeaponData | undefined
  factionOfUnit(unitId: string): string
}

/** The distinct weapon sounds for one TargetsDeclared, in declaration order. Deduped by sound, so a
 *  squad whose models all fire the same gun gets one shot sound rather than ten stacked (the manager
 *  would throttle them anyway — see MAX_CONCURRENT_PER_ID — but then the *count* would depend on
 *  throttle timing rather than on what was fired). */
function firingSounds(event: Extract<GameEvent, { type: 'TargetsDeclared' }>, lookup?: SoundLookup): EventSound[] {
  const faction = lookup?.factionOfUnit(event.unitId) ?? ''
  const seen = new Set<SfxId>()
  const out: EventSound[] = []
  for (const target of event.targets) {
    const { id, volume = 1 } = FLAVOUR_SOUND[weaponFlavour(target.weaponId, lookup?.weapon(target.weaponId), faction)]
    if (seen.has(id)) continue
    seen.add(id)
    // Second and later weapons in the same declaration duck further, so two guns firing together
    // read as one volley rather than two sounds competing at full level.
    const level = seen.size === 1 ? volume : volume * 0.7
    out.push(level === 1 ? { id } : { id, opts: { volume: level } })
  }
  return out
}

/** Each faction dies in its own voice: a Sister's cry, an Ork's bellow, a Necron's power-down whine.
 *  Unknown factions (or no lookup) fall back to the original generic soldier death. */
const DEATH_SOUND: Record<string, SfxId> = {
  sm: 'death-space-marines',
  'space-marines': 'death-space-marines',
  ork: 'death-orks',
  orks: 'death-orks',
  necrons: 'death-necrons',
  tyranids: 'death-tyranids',
  'astra-militarum': 'death-astra-militarum',
  'adepta-sororitas': 'death-adepta-sororitas',
  'chaos-space-marines': 'death-chaos-space-marines',
}

function deathSound(faction: string): EventSound {
  return { id: DEATH_SOUND[faction] ?? 'model-death' }
}

/** Sounds to play for one engine event. `perspective` (the human seat) is optional — omit it to get
 *  every sound regardless of whose turn it is; pass it to also get "your turn"/victory-or-defeat
 *  lines correct for that seat. `lookup` is what makes firing sounds weapon-accurate. */
export function soundsForEvent(event: GameEvent, perspective?: PlayerId, lookup?: SoundLookup): EventSound[] {
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

    // The shot itself is voiced by TargetsDeclared, which the engine emits immediately after this
    // one (src/engine/attack.ts) and which names the weapons — see firingSounds.
    case 'AttackSequenceStarted':
      return []

    case 'TargetsDeclared':
      return firingSounds(event, lookup)

    case 'SaveRolled':
      if (event.saved) return [{ id: event.kind === 'invuln' ? 'invuln-shimmer' : 'armour-save-clank' }]
      return [{ id: 'hit-impact' }]

    case 'ModelDestroyed':
      return [deathSound(lookup?.factionOfUnit(event.unitId) ?? '')]

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
export function playEventSounds(audio: AudioManager, events: readonly GameEvent[], perspective?: PlayerId, lookup?: SoundLookup): void {
  for (const event of events) {
    for (const sound of soundsForEvent(event, perspective, lookup)) audio.play(sound.id, sound.opts)
  }
}

/** Victory/defeat narrator line for a finished game, from a given seat's perspective — split out
 *  from soundsForEvent's GameEnded case for callers that already have the GameResult on hand (e.g.
 *  the end screen) rather than the raw event. */
export function endGameVoiceLine(winner: PlayerId | 'draw', perspective: PlayerId): VoiceId | null {
  if (winner === 'draw') return null
  return winner === perspective ? 'narr-victory' : 'narr-defeat'
}
