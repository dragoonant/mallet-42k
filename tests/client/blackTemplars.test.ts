// Black Templars in the client: selectable on either seat, every datasheet/model resolves to its own procedural kit
// (GLB slugs are mapped but not enabled yet, so figures fall back to the procedural kit), the weapons voice as intended,
// and the new rules' prompts read in plain words.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { useGameStore } from '../../src/client/store/game'
import { resolveFigureKit, resolvePaintColors, resolveBase } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND, VEHICLE_CONFIG } from '../../src/client/figures/kitConfigs'
import { glbSlugFor } from '../../src/client/figures/glbModels'
import { weaponSound } from '../../src/client/audio/eventSounds'
import { chooseOptionInfoFor } from '../../src/client/ui/DecisionPrompt'

const bundle = await loadBundle()
const btSheets = Object.values(bundle.datasheets).filter((d) => d.faction === 'black-templars')

describe('black-templars client plumbing', () => {
  it('has four datasheets in the bundle and a patrol the start screen can launch', () => {
    expect(btSheets.length).toBe(4)
    expect(Object.values(bundle.patrols).some((p) => p.faction === 'black-templars')).toBe(true)
  })

  it('every model resolves to its own bt-* kit with a config, not a generic fallback', () => {
    for (const sheet of btSheets) {
      for (const m of sheet.composition) {
        const { kit } = resolveFigureKit(sheet.id, sheet, m.modelId)
        expect(kit, `${sheet.id}/${m.modelId}`).toMatch(/^bt-/)
        if (sheet.id === 'bt.impulsor') {
          expect(BODY_KIND[kit]).toBe('vehicle')
          expect(VEHICLE_CONFIG[kit]?.style).toBe('templar-impulsor')
        } else {
          expect(BODY_KIND[kit]).toBe('biped')
          expect(BIPED_CONFIG[kit], kit).toBeDefined()
        }
      }
    }
  })

  it('the unit types read differently from each other', () => {
    const kits = new Set(btSheets.flatMap((s) => s.composition.map((m) => resolveFigureKit(s.id, s, m.modelId).kit)))
    expect(kits.size).toBe(9)
    expect(BIPED_CONFIG['bt-initiate-pyreblaster']!.rightWeapon).toBe('flamer')
    expect(BIPED_CONFIG['bt-neophyte-firearm']!.bulk).toBeLessThan(BIPED_CONFIG['bt-initiate-rifle']!.bulk)
    expect(BIPED_CONFIG['bt-siguard']!.bulk).toBeGreaterThan(BIPED_CONFIG['bt-sword-brother']!.bulk)
    const impulsor = btSheets.find((s) => s.id === 'bt.impulsor')!
    expect(resolveBase(impulsor, 'vehicle', 'impulsor').height).toBeGreaterThan(2)
  })

  it('figures use the faction paint scheme and every model resolves to an SD GLB', () => {
    expect(resolvePaintColors(bundle.factions['black-templars']).primary).toBe('#141414')
    for (const sheet of btSheets) for (const m of sheet.composition) expect(glbSlugFor(sheet.id, m.modelId), `${sheet.id}/${m.modelId}`).toBeDefined()
  })

  it('every Black Templars weapon has its own firing sound', () => {
    for (const id of Object.keys(bundle.weapons).filter((w) => w.startsWith('bt.'))) expect(weaponSound(id), id).toBeDefined()
  })

  it('newGame seats Black Templars on either side and in a mirror', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'black-templars', opponentFaction: 'orks', opponent: 'hotseat', seed: 'bt-vs-ork' })
    let s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['black-templars', 'ork'])
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponentFaction: 'black-templars', opponent: 'hotseat', seed: 'sm-vs-bt' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['sm', 'black-templars'])
    await useGameStore.getState().newGame({ playerFaction: 'black-templars', opponentFaction: 'black-templars', opponent: 'hotseat', seed: 'bt-mirror' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['black-templars', 'black-templars'])
  }, 60000)

  it('Righteous Defiance and Sacred Vow prompts explain themselves in plain words', () => {
    const rd = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'bt.e.righteous-defiance.shoot', unitId: 'u1', data: { code: 'righteousDefiance' } })
    expect(rd?.title).toMatch(/Righteous Defiance/)
    expect(rd?.hint).toMatch(/4\+/)
    const rdFight = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: null, data: { code: 'righteousDefianceFight' } })
    expect(rdFight?.title).toMatch(/Righteous Defiance/)
    const vow = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'bt.sec.sacred-vow', data: { code: 'sacredVowPick' } })
    expect(vow?.title).toMatch(/Sacred Vow/)
    expect(vow?.hint).toMatch(/3 VP/)
  })
})
