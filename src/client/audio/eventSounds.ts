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
import { SFX_IDS, type SfxId, type SoundId, type VoiceId } from './manifest'

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

/** Every weapon in the bundle has its own sound (public/audio/wpn-<slug>.mp3). A weapon id matches the
 *  longest slug it contains, so 'am.w.plasma-gun-supercharge' is the plasma gun and 'tyr.w.leapers-talons'
 *  is the talons; profile variants share their weapon's sound. Chainswords and the power klaw keep the
 *  original assets (the owner likes them). An id that matches nothing falls back to its flavour sound.
 *  Trims pull the loudest generated assets back toward the rest of the palette (decoded RMS, see
 *  WEAPON_TRIM); re-measure if an asset is regenerated. */
const WEAPON_SLUGS: readonly (readonly [string, SfxId])[] = [
  ...SFX_IDS.filter((id) => id.startsWith('wpn-')).map((id) => [id.slice(4), id] as const),
  ['chainsword', 'melee-chainsword'] as const,
  ['power-klaw', 'power-klaw-crunch'] as const,
  // Grey Knights have their own generated sounds (public/audio: purge-soul, psilencer-burst, psycannon-burst, nemesis-force-swing).
  ['purge-soul', 'purge-soul'] as const,
  ['psilencer', 'psilencer-burst'] as const,
  ['heavy-psycannon', 'psycannon-burst'] as const,
  ['psycannon', 'psycannon-burst'] as const,
  ['greatsword', 'nemesis-force-swing'] as const,
  // T'au have their own generated sounds; the missile, stave and fists still borrow.
  ['pulse-rifle', 'pulse-rifle-shot'] as const,
  ['pulse-carbine', 'pulse-carbine-burst'] as const,
  ['pulse-pistol', 'pulse-rifle-shot'] as const,
  ['burst-cannon', 'burst-cannon-whir'] as const,
  ['fusion-blaster', 'fusion-blast'] as const,
  ['cyclic-ion-raker', 'ion-raker'] as const,
  ['support-turret-missile', 'wpn-hunter-killer-missile'] as const,
  ['honour-stave', 'wpn-force-weapon'] as const,
  ['battlesuit-fists', 'wpn-power-fist'] as const,
  ['ghostkeel-fists', 'wpn-power-fist'] as const,
  // Genestealer Cults borrow too: mining gear and improvised bludgeons crunch like fists, cult claws rend like talons.
  ['hybrid-firearm', 'cult-autogun-burst'] as const,
  ['leader-pistol', 'wpn-laspistol'] as const,
  ['heavy-stubber', 'wpn-big-shoota'] as const,
  ['seismic-cannon', 'seismic-cannon'] as const,
  ['webber', 'webber-spray'] as const,
  ['demolition-charge', 'wpn-grenade-launcher'] as const,
  ['clearance-incinerator', 'wpn-heavy-flamer'] as const,
  ['magus-stave', 'wpn-staff-of-possession'] as const,
  ['cult-claws-and-knife', 'wpn-claws-and-teeth'] as const,
  ['heavy-mining-tool', 'rock-drill-grind'] as const,
  ['leaders-cult-weapons', 'wpn-power-weapon'] as const,
  ['heavy-improvised-weapon', 'wpn-brutal-assault-weapon'] as const,
  ['hypermorph-tail', 'wpn-talons'] as const,
  ['drilldozer-blade', 'rock-drill-grind'] as const,
].sort((a, b) => b[0].length - a[0].length)

const WEAPON_TRIM: Partial<Record<SfxId, number>> = {
  'pulse-rifle-shot': 0.75,
  'pulse-carbine-burst': 0.7,
  'burst-cannon-whir': 0.72,
  'fusion-blast': 0.65,
  'ion-raker': 0.55,
  'cult-autogun-burst': 0.65,
  'webber-spray': 0.9,
  'wpn-autopistol': 0.66,
  'wpn-boltgun': 0.8,
  'wpn-assault-cannon': 0.3,
  'wpn-autogun': 0.73,
  'wpn-barblauncher': 0.75,
  'wpn-big-choppa': 0.64,
  'wpn-big-shoota': 0.57,
  'wpn-bombast-field-gun': 0.41,
  'wpn-close-combat-weapon': 0.64,
  'wpn-doomsday-blaster': 0.35,
  'wpn-flamer': 0.44,
  'wpn-force-weapon': 0.68,
  'wpn-gauss-flayer': 0.68,
  'wpn-gauss-reaper': 0.65,
  'wpn-grenade-launcher': 0.72,
  'wpn-heavy-bolter': 0.39,
  'wpn-heavy-flamer': 0.41,
  'wpn-hunter-killer-missile': 0.38,
  'wpn-lasgun': 0.72,
  'wpn-malleus-rocket-launcher': 0.62,
  'wpn-meltagun': 0.59,
  'wpn-plasma-cannon': 0.69,
  'wpn-plasma-gun': 0.67,
  'wpn-plasma-pistol': 0.69,
  'wpn-psychoclastic-torrent': 0.33,
  'wpn-pyreblaster': 0.59,
  'wpn-rite-of-possession': 0.7,
  'wpn-rokkit-launcha': 0.47,
  'wpn-shoota': 0.39,
  'wpn-uge-choppa': 0.8,
}

export function weaponSound(weaponId: string): { id: SfxId; volume?: number } | undefined {
  const name = weaponId.slice(weaponId.indexOf('.w.') + 1)
  const hit = WEAPON_SLUGS.find(([slug]) => name.includes(slug))
  if (!hit) return undefined
  const volume = WEAPON_TRIM[hit[1]]
  return volume === undefined ? { id: hit[1] } : { id: hit[1], volume }
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
    const { id, volume = 1 } =
      weaponSound(target.weaponId) ?? FLAVOUR_SOUND[weaponFlavour(target.weaponId, lookup?.weapon(target.weaponId), faction)]
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
  'grey-knights': 'death-grey-knights',
  'tau-empire': 'death-tau',
  'genestealer-cults': 'death-genestealer-cults',
}

/** Measured decoded RMS runs 0.05-0.40 across these; the loud three are pulled back toward ~0.15. */
const DEATH_TRIM: Partial<Record<SfxId, number>> = {
  'death-adepta-sororitas': 0.7,
  'death-astra-militarum': 0.45,
  'death-chaos-space-marines': 0.4,
  'death-orks': 0.5,
  'death-tyranids': 0.5,
  'death-space-marines': 0.6,
  'death-tau': 0.65,
}

function deathSound(faction: string): EventSound {
  const id = DEATH_SOUND[faction] ?? 'model-death'
  const volume = DEATH_TRIM[id]
  return volume === undefined ? { id } : { id, opts: { volume } }
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
