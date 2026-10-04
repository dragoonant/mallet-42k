// Firing sounds are per weapon (owner playtest: "the shooting sound should correspond to the weapon
// being used" — every ranged attack used to play one generic 'bolter-burst', and every melee one
// 'melee-chainsword'). The classification lives in src/client/weaponFlavour.ts and is shared by the
// sound map (src/client/audio/eventSounds.ts) and the tracer look, so this pins BOTH: every weapon in
// the real data bundle, by id, and the events that voice them.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { weaponFlavour, isRangedFlavour, type WeaponFlavour } from '../../src/client/weaponFlavour'
import { soundsForEvent, type SoundLookup } from '../../src/client/audio/eventSounds'
import type { GameEvent } from '../../src/engine/events'

const bundle = await loadBundle()

// The faction string the client actually passes is the ENGINE's faction id (GameState.players[].faction,
// i.e. what faction.json declares), not the store's 'space-marines'/'orks' setup key — pinned here so a
// rename can't silently turn every ork gun back into a bolter.
const ORK = 'ork'
const SM = 'sm'
const NEC = 'necrons'
const CSM = 'chaos-space-marines'
const TYR = 'tyranids'
const ADE = 'adepta-sororitas'

/** The engine faction id a weapon's own id prefix belongs to. */
const factionOfWeapon = (id: string): string => (id.startsWith('ork') ? ORK : id.startsWith('nec') ? NEC : id.startsWith('csm') ? CSM : id.startsWith('tyr') ? TYR : id.startsWith('ade') ? ADE : SM)

function lookupFor(faction: string): SoundLookup {
  return { weapon: (id) => bundle.weapons[id], factionOfUnit: () => faction }
}

/** A TargetsDeclared for one attacking unit firing `weaponIds` (one model each). */
function declared(weaponIds: string[], phase: 'shooting' | 'fight' = 'shooting'): GameEvent {
  return {
    type: 'TargetsDeclared',
    seq: 1, round: 1, turn: 'A', phase, player: 'A',
    unitId: 'u1',
    targets: weaponIds.map((weaponId, i) => ({ modelId: `m${i}`, weaponId, targetUnitId: 'u2' })),
  } as GameEvent
}

const soundIds = (event: GameEvent, faction: string): string[] =>
  soundsForEvent(event, 'A', lookupFor(faction)).map((s) => s.id)

// Every weapon id in the bundle with the flavour it must classify as. Written out rather than
// derived so a datasheet edit that changes what a gun sounds like has to be an explicit change here.
const EXPECTED: Record<string, WeaponFlavour> = {
  'sm.w.storm-bolter': 'bolter',
  'sm.w.storm-bolter-captain': 'bolter',
  'sm.w.bolt-pistol': 'bolter',
  'sm.w.assault-cannon': 'heavy',
  'sm.w.pyreblaster': 'flame',
  'sm.w.smite': 'psychic',
  'sm.w.smite-focused': 'psychic',
  'sm.w.relic-weapon': 'chain',
  'sm.w.power-weapon': 'chain',
  'sm.w.close-combat-weapon': 'chain',
  'sm.w.power-fist': 'crush',
  'sm.w.force-weapon': 'force',
  'ork.w.shoota': 'shoota',
  'ork.w.big-shoota': 'shoota',
  'ork.w.big-shoota-gordrang': 'shoota',
  'ork.w.slugga': 'shoota',
  'ork.w.rokkit-launcha': 'heavy',
  'ork.w.kopta-rokkits': 'heavy',
  'ork.w.kustom-mega-blasta': 'heavy',
  'ork.w.choppa': 'chain',
  'ork.w.big-choppa': 'chain',
  'ork.w.uge-choppa': 'chain',
  'ork.w.spinnin-blades': 'chain',
  'ork.w.close-combat-weapon': 'chain',
  'ork.w.power-klaw': 'crush',
  'ork.w.dread-klaw': 'crush',
  'nec.w.tachyon-arrow': 'heavy',
  'nec.w.gauss-flayer': 'psychic',
  'nec.w.gauss-reaper': 'psychic',
  'nec.w.twin-gauss-flayer': 'psychic',
  'nec.w.doomsday-blaster': 'heavy',
  'nec.w.overlords-blade': 'chain',
  'nec.w.close-combat-weapon': 'chain',
  'nec.w.skorpekh-hyperphase-weapons': 'chain',
  'nec.w.feeder-mandibles': 'chain',
  'nec.w.doomstalker-limbs': 'crush',
  'csm.w.bolt-pistol': 'bolter',
  'csm.w.rite-of-possession': 'psychic',
  'csm.w.rite-of-possession-focused': 'psychic',
  'csm.w.boltgun': 'bolter',
  'csm.w.heavy-bolter': 'heavy',
  'csm.w.meltagun': 'flame',
  'csm.w.plasma-pistol': 'heavy',
  'csm.w.plasma-pistol-supercharge': 'heavy',
  'csm.w.autopistol': 'shoota',
  'csm.w.bolt-pistol-cultist-champion': 'bolter',
  'csm.w.staff-of-possession': 'force',
  'csm.w.hideous-mutations': 'crush',
  'csm.w.accursed-weapon': 'chain',
  'csm.w.close-combat-weapon': 'chain',
  'csm.w.brutal-assault-weapon': 'chain',
  'tyr.w.psychoclastic-torrent': 'flame',
  'tyr.w.fleshborer': 'shoota',
  'tyr.w.barblauncher': 'heavy',
  'tyr.w.prime-talons': 'chain',
  'tyr.w.talons-and-betentacled-maw': 'chain',
  'tyr.w.chitinous-claws-and-teeth-termagant': 'chain',
  'tyr.w.chitinous-claws-and-teeth-barbgaunt': 'chain',
  'tyr.w.leapers-talons': 'chain',
}

// Adepta Sororitas weapons, by datasheet NAME (lower-cased) so the check holds whatever id spelling the data uses.
// Exhaustive over the faction's weapons once its data is in the bundle: a new weapon has to be classified here.
const ADE_BY_NAME: Record<string, WeaponFlavour> = {
  'condemnor boltgun': 'bolter',
  'bolt pistol': 'bolter',
  boltgun: 'bolter',
  'combi-weapon': 'bolter',
  'ministorum flamer': 'flame',
  'ministorum heavy flamer': 'flame',
  'hallowed chainsword': 'chain',
  'power weapon': 'chain',
  'close combat weapon': 'chain',
  'hallowed mace': 'crush',
  'arco-flails': 'chain',
}
const adeWeapons = Object.entries(bundle.weapons).filter(([id]) => id.startsWith('ade.'))

describe('weapon flavour', () => {
  it('covers every weapon in the data bundle (a new weapon has to be classified here)', () => {
    const known = Object.keys(EXPECTED).concat(adeWeapons.map(([id]) => id))
    expect(known.sort()).toEqual(Object.keys(bundle.weapons).sort())
  })

  it('the faction ids this classifier is tuned for are the ones the data actually declares', () => {
    for (const id of [NEC, ORK, SM, CSM, TYR, ADE]) expect(Object.keys(bundle.factions), id).toContain(id)
  })

  it('every adepta-sororitas weapon is classified, by name', () => {
    for (const [id, weapon] of adeWeapons) {
      const expected = ADE_BY_NAME[weapon.name.toLowerCase()]
      expect(expected, `${id} (${weapon.name}) needs an entry in ADE_BY_NAME`).toBeDefined()
      expect(weaponFlavour(id, weapon, ADE), id).toBe(expected)
    }
  })

  it("a sister's flamer and mace voice as themselves even with no datasheet to read", () => {
    expect(weaponFlavour('ade.w.ministorum-flamer', undefined, ADE)).toBe('flame')
    expect(weaponFlavour('ade.w.hallowed-mace', undefined, ADE)).toBe('crush')
    expect(weaponFlavour('ade.w.boltgun', undefined, ADE)).toBe('bolter')
  })

  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(`classifies ${id} as ${expected}`, () => {
      expect(weaponFlavour(id, bundle.weapons[id], factionOfWeapon(id))).toBe(expected)
    })
  }

  it('every melee weapon gets a melee flavour and every ranged one a tracer-capable flavour', () => {
    for (const [id, weapon] of Object.entries(bundle.weapons)) {
      const flavour = weaponFlavour(id, weapon, factionOfWeapon(id))
      expect(isRangedFlavour(flavour), `${id} (${weapon.type})`).toBe(weapon.type === 'ranged')
    }
  })

  it('falls back on the firing unit\'s faction when the weapon is unknown to the bundle', () => {
    expect(weaponFlavour('mystery.gun', undefined, ORK)).toBe('shoota')
    expect(weaponFlavour('mystery.gun', undefined, SM)).toBe('bolter')
    expect(weaponFlavour('mystery.gun', undefined, NEC)).toBe('psychic')
    expect(weaponFlavour('mystery.gun', undefined, TYR)).toBe('shoota')
    // the store's own setup keys ('orks'/'space-marines') classify the same way, in case a caller
    // ever passes one of those instead
    expect(weaponFlavour('mystery.gun', undefined, 'orks')).toBe('shoota')
    // ...and on the id alone when there's no faction either — a stale id still describes itself.
    expect(weaponFlavour('ork.w.rokkit-launcha', undefined, '')).toBe('heavy')
    expect(weaponFlavour('sm.w.pyreblaster', undefined, '')).toBe('flame')
  })
})

describe('firing sounds', () => {
  it('a marine squad firing bolters is the bolt-gun sound, not the generic one', () => {
    expect(soundIds(declared(['sm.w.storm-bolter']), SM)).toEqual(['bolter-burst'])
  })

  it('an ork mob firing shootas is the ork gun sound', () => {
    expect(soundIds(declared(['ork.w.shoota', 'ork.w.shoota']), ORK)).toEqual(['shoota-spray'])
  })

  it('a necron gauss line is the energy sound, its big guns the heavy one', () => {
    expect(soundIds(declared(['nec.w.gauss-flayer', 'nec.w.gauss-flayer']), NEC)).toEqual(['psychic-zap'])
    expect(soundIds(declared(['nec.w.doomsday-blaster']), NEC)).toEqual(['heavy-gun'])
    expect(soundIds(declared(['nec.w.doomstalker-limbs'], 'fight'), NEC)).toEqual(['power-klaw-crunch'])
  })

  it('chaos marines: bolters thump, autoguns rattle, the staff crackles, meltaguns burn', () => {
    expect(soundIds(declared(['csm.w.boltgun', 'csm.w.boltgun']), CSM)).toEqual(['bolter-burst'])
    expect(soundIds(declared(['csm.w.autopistol', 'csm.w.autopistol']), CSM)).toEqual(['shoota-spray'])
    expect(soundIds(declared(['csm.w.meltagun']), CSM)).toEqual(['flamer'])
    expect(soundIds(declared(['csm.w.heavy-bolter']), CSM)).toEqual(['heavy-gun'])
    expect(soundIds(declared(['csm.w.rite-of-possession']), CSM)).toEqual(['psychic-zap'])
    expect(soundIds(declared(['csm.w.staff-of-possession'], 'fight'), CSM)).toEqual(['psychic-zap'])
    expect(soundIds(declared(['csm.w.hideous-mutations'], 'fight'), CSM)).toEqual(['power-klaw-crunch'])
  })

  it('a tyranid brood spits a wet spray, lobs barbs heavily and slashes in melee', () => {
    expect(soundIds(declared(['tyr.w.fleshborer', 'tyr.w.fleshborer']), TYR)).toEqual(['shoota-spray'])
    expect(soundIds(declared(['tyr.w.barblauncher']), TYR)).toEqual(['heavy-gun'])
    expect(soundIds(declared(['tyr.w.psychoclastic-torrent']), TYR)).toEqual(['flamer'])
    expect(soundIds(declared(['tyr.w.chitinous-claws-and-teeth-termagant'], 'fight'), TYR)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['tyr.w.leapers-talons'], 'fight'), TYR)).toEqual(['melee-chainsword'])
  })

  it('each weapon type sounds like itself', () => {
    expect(soundIds(declared(['sm.w.pyreblaster']), SM)).toEqual(['flamer'])
    expect(soundIds(declared(['sm.w.assault-cannon']), SM)).toEqual(['heavy-gun'])
    expect(soundIds(declared(['sm.w.smite']), SM)).toEqual(['psychic-zap'])
    expect(soundIds(declared(['sm.w.force-weapon'], 'fight'), SM)).toEqual(['psychic-zap'])
    expect(soundIds(declared(['sm.w.power-fist'], 'fight'), SM)).toEqual(['power-klaw-crunch'])
    expect(soundIds(declared(['ork.w.rokkit-launcha']), ORK)).toEqual(['heavy-gun'])
    expect(soundIds(declared(['ork.w.power-klaw'], 'fight'), ORK)).toEqual(['power-klaw-crunch'])
    expect(soundIds(declared(['ork.w.choppa'], 'fight'), ORK)).toEqual(['melee-chainsword'])
  })

  it('ten models firing the same gun is one shot sound, not ten', () => {
    const tenBoyz = declared(Array.from({ length: 10 }, () => 'ork.w.shoota'))
    expect(soundIds(tenBoyz, ORK)).toEqual(['shoota-spray'])
  })

  it('a squad firing two different weapons plays both, with the second ducked', () => {
    const mixed = soundsForEvent(declared(['sm.w.storm-bolter', 'sm.w.pyreblaster']), 'A', lookupFor(SM))
    expect(mixed.map((s) => s.id)).toEqual(['bolter-burst', 'flamer'])
    expect(mixed[0].opts?.volume).toBeUndefined() // first weapon, no trim of its own
    expect(mixed[1].opts?.volume).toBeLessThan(0.58) // flamer's own trim, ducked again for being second
  })

  it('the loud assets are trimmed so one faction\'s guns do not drown the other\'s', () => {
    const ork = soundsForEvent(declared(['ork.w.shoota']), 'A', lookupFor(ORK))[0]
    const marine = soundsForEvent(declared(['sm.w.storm-bolter']), 'A', lookupFor(SM))[0]
    expect(ork.opts?.volume).toBeLessThan(1)
    expect(marine.opts?.volume ?? 1).toBe(1)
  })

  it('AttackSequenceStarted no longer voices the shot itself (TargetsDeclared does)', () => {
    const started = { type: 'AttackSequenceStarted', seq: 1, round: 1, turn: 'A', phase: 'shooting', player: 'A', unitId: 'u1', kind: 'ranged', overwatch: false } as GameEvent
    expect(soundsForEvent(started, 'A', lookupFor(SM))).toEqual([])
  })

  it('without a lookup, firing still makes a sound (faction-less fallback)', () => {
    expect(soundsForEvent(declared(['sm.w.storm-bolter']), 'A').map((s) => s.id)).toEqual(['bolter-burst'])
    expect(soundsForEvent(declared(['ork.w.big-shoota']), 'A').map((s) => s.id)).toEqual(['shoota-spray'])
  })
})
