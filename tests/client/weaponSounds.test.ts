// Firing sounds are per weapon (owner playtest: "the shooting sound should correspond to the weapon
// being used" — every ranged attack used to play one generic 'bolter-burst', and every melee one
// 'melee-chainsword'). The classification lives in src/client/weaponFlavour.ts and is shared by the
// sound map (src/client/audio/eventSounds.ts) and the tracer look, so this pins BOTH: every weapon in
// the real data bundle, by id, and the events that voice them.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { weaponFlavour, isRangedFlavour, type WeaponFlavour } from '../../src/client/weaponFlavour'
import { soundsForEvent, weaponSound, type SoundLookup } from '../../src/client/audio/eventSounds'
import { SFX_IDS } from '../../src/client/audio/manifest'
import { existsSync } from 'node:fs'
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
const AM = 'astra-militarum'

/** The engine faction id a weapon's own id prefix belongs to. */
const factionOfWeapon = (id: string): string => (id.startsWith('ork') ? ORK : id.startsWith('nec') ? NEC : id.startsWith('csm') ? CSM : id.startsWith('tyr') ? TYR : id.startsWith('ade') ? ADE : id.startsWith('am.') ? AM : SM)

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
  'am.w.bolt-pistol': 'bolter',
  'am.w.lasgun': 'bolter',
  'am.w.laspistol': 'bolter',
  'am.w.plasma-pistol': 'heavy',
  'am.w.plasma-pistol-supercharge': 'heavy',
  'am.w.drum-fed-autogun': 'bolter',
  'am.w.flamer': 'flame',
  'am.w.grenade-launcher-frag': 'heavy',
  'am.w.grenade-launcher-krak': 'heavy',
  'am.w.meltagun': 'flame',
  'am.w.plasma-gun': 'heavy',
  'am.w.plasma-gun-supercharge': 'heavy',
  'am.w.bombast-field-gun': 'heavy',
  'am.w.malleus-rocket-launcher': 'heavy',
  'am.w.hunter-killer-missile': 'heavy',
  'am.w.plasma-cannon': 'heavy',
  'am.w.plasma-cannon-supercharge': 'heavy',
  'am.w.power-weapon': 'chain',
  'am.w.power-fist': 'crush',
  'am.w.close-combat-weapon-command': 'chain',
  'am.w.chainsword': 'chain',
  'am.w.close-combat-weapon': 'chain',
  'am.w.battery-close-combat-weapons': 'chain',
  'am.w.close-combat-weapon-sentinel': 'crush',
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
    for (const id of [NEC, ORK, SM, CSM, TYR, ADE, AM]) expect(Object.keys(bundle.factions), id).toContain(id)
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
    expect(weaponFlavour('mystery.gun', undefined, AM)).toBe('bolter')
    // the store's own setup keys ('orks'/'space-marines') classify the same way, in case a caller
    // ever passes one of those instead
    expect(weaponFlavour('mystery.gun', undefined, 'orks')).toBe('shoota')
    // ...and on the id alone when there's no faction either — a stale id still describes itself.
    expect(weaponFlavour('ork.w.rokkit-launcha', undefined, '')).toBe('heavy')
    expect(weaponFlavour('sm.w.pyreblaster', undefined, '')).toBe('flame')
  })
})

describe('firing sounds', () => {
  it('every weapon in the data bundle has its own sound, and the file exists', () => {
    for (const id of Object.keys(bundle.weapons)) {
      const sound = weaponSound(id)
      expect(sound, id).toBeDefined()
      expect(SFX_IDS).toContain(sound!.id)
      expect(existsSync(`public/audio/${sound!.id}.mp3`), sound!.id).toBe(true)
    }
  })

  it('bolt weapons are explosive shells, each with its own report', () => {
    expect(soundIds(declared(['sm.w.storm-bolter']), SM)).toEqual(['wpn-storm-bolter'])
    expect(soundIds(declared(['csm.w.boltgun', 'csm.w.boltgun']), CSM)).toEqual(['wpn-boltgun'])
    expect(soundIds(declared(['csm.w.heavy-bolter']), CSM)).toEqual(['wpn-heavy-bolter'])
    expect(soundIds(declared(['ade.w.condemnor-boltgun']), ADE)).toEqual(['wpn-condemnor-boltgun'])
    expect(soundIds(declared(['csm.w.bolt-pistol-cultist-champion']), CSM)).toEqual(['wpn-bolt-pistol'])
  })

  it('choppas swing like blades, chainswords keep the chainsword, flamers roar', () => {
    expect(soundIds(declared(['ork.w.choppa'], 'fight'), ORK)).toEqual(['wpn-choppa'])
    expect(soundIds(declared(['ork.w.big-choppa'], 'fight'), ORK)).toEqual(['wpn-big-choppa'])
    expect(soundIds(declared(['ork.w.uge-choppa'], 'fight'), ORK)).toEqual(['wpn-uge-choppa'])
    expect(soundIds(declared(['am.w.chainsword'], 'fight'), AM)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['ade.w.hallowed-chainsword'], 'fight'), ADE)).toEqual(['melee-chainsword'])
    expect(soundIds(declared(['ade.w.ministorum-flamer']), ADE)).toEqual(['wpn-flamer'])
    expect(soundIds(declared(['ade.w.ministorum-heavy-flamer']), ADE)).toEqual(['wpn-heavy-flamer'])
    expect(soundIds(declared(['sm.w.pyreblaster']), SM)).toEqual(['wpn-pyreblaster'])
  })

  it('profile variants share their weapon\'s sound', () => {
    expect(soundIds(declared(['am.w.plasma-gun-supercharge']), AM)).toEqual(['wpn-plasma-gun'])
    expect(soundIds(declared(['nec.w.twin-gauss-flayer']), NEC)).toEqual(['wpn-gauss-flayer'])
    expect(soundIds(declared(['tyr.w.leapers-talons'], 'fight'), TYR)).toEqual(['wpn-talons'])
    expect(soundIds(declared(['ork.w.power-klaw'], 'fight'), ORK)).toEqual(['power-klaw-crunch'])
  })

  it('an unknown weapon falls back to its flavour sound', () => {
    expect(soundIds(declared(['mystery.w.flame-thing']), SM)).toEqual(['flamer'])
  })

  it('ten models firing the same gun is one shot sound, not ten', () => {
    const tenBoyz = declared(Array.from({ length: 10 }, () => 'ork.w.shoota'))
    expect(soundIds(tenBoyz, ORK)).toEqual(['wpn-shoota'])
  })

  it('a squad firing two different weapons plays both, with the second ducked', () => {
    const mixed = soundsForEvent(declared(['sm.w.storm-bolter', 'sm.w.pyreblaster']), 'A', lookupFor(SM))
    expect(mixed.map((s) => s.id)).toEqual(['wpn-storm-bolter', 'wpn-pyreblaster'])
    expect(mixed[1].opts?.volume).toBeLessThan(mixed[0].opts?.volume ?? 1)
  })

  it('AttackSequenceStarted no longer voices the shot itself (TargetsDeclared does)', () => {
    const started = { type: 'AttackSequenceStarted', seq: 1, round: 1, turn: 'A', phase: 'shooting', player: 'A', unitId: 'u1', kind: 'ranged', overwatch: false } as GameEvent
    expect(soundsForEvent(started, 'A', lookupFor(SM))).toEqual([])
  })

  it('without a lookup, firing still makes the weapon\'s own sound', () => {
    expect(soundsForEvent(declared(['ork.w.big-shoota']), 'A').map((s) => s.id)).toEqual(['wpn-big-shoota'])
  })
})

describe('death sounds', () => {
  const died = (unitId: string) => ({ type: 'ModelDestroyed', seq: 1, round: 1, turn: 'A', phase: 'shooting', unitId, modelId: 'm1', byPlayer: 'B', byUnitId: null, byModelId: null, kind: 'ranged' }) as unknown as GameEvent
  const lookup = (faction: string): SoundLookup => ({ weapon: () => undefined, factionOfUnit: () => faction })
  it('each faction dies in its own voice', () => {
    expect(soundsForEvent(died('u'), 'A', lookup(ADE))[0].id).toBe('death-adepta-sororitas')
    expect(soundsForEvent(died('u'), 'A', lookup(ORK))[0].id).toBe('death-orks')
    expect(soundsForEvent(died('u'), 'A', lookup(SM))[0].id).toBe('death-space-marines')
    expect(soundsForEvent(died('u'), 'A', lookup(NEC))[0].id).toBe('death-necrons')
  })
  it('an unknown faction falls back to the generic death', () => {
    expect(soundsForEvent(died('u'), 'A')[0].id).toBe('model-death')
  })
})
