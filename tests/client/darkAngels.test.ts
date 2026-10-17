// Dark Angels in the client: selectable on either seat, every datasheet/model resolves to its own procedural kit
// (GLB slugs are mapped but not enabled yet, so figures fall back to the procedural kit), and the weapons voice as intended.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { useGameStore } from '../../src/client/store/game'
import { resolveFigureKit, resolvePaintColors } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND } from '../../src/client/figures/kitConfigs'
import { glbSlugFor } from '../../src/client/figures/glbModels'
import { weaponSound } from '../../src/client/audio/eventSounds'

const bundle = await loadBundle()
const daSheets = Object.values(bundle.datasheets).filter((d) => d.faction === 'dark-angels')

describe('dark-angels client plumbing', () => {
  it('has datasheets in the bundle and a patrol the start screen can launch', () => {
    expect(daSheets.length).toBe(8)
    expect(Object.values(bundle.patrols).filter((p) => p.faction === 'dark-angels').length).toBe(2)
  })

  it('every model resolves to a da-* biped kit with a config, not a generic fallback', () => {
    for (const sheet of daSheets) {
      for (const m of sheet.composition) {
        const { kit } = resolveFigureKit(sheet.id, sheet, m.modelId)
        expect(kit, `${sheet.id}/${m.modelId}`).toMatch(/^da-/)
        expect(BODY_KIND[kit]).toBe('biped')
        expect(BIPED_CONFIG[kit], kit).toBeDefined()
      }
    }
  })

  it('the unit types read differently from each other', () => {
    const kits = new Set(daSheets.flatMap((s) => s.composition.map((m) => resolveFigureKit(s.id, s, m.modelId).kit)))
    expect(kits.size).toBe(8)
    expect(BIPED_CONFIG['da-inceptor']!.jumpPack).toBe(true)
    // The Vengeful Brethren: Zacharial, Hellblasters and Bladeguard each have their own look.
    expect(BIPED_CONFIG['da-hellblaster']!.rightWeapon).toBe('plasma-cannon')
    expect(BIPED_CONFIG['da-bladeguard']!.rightWeapon).toBe('power-sword')
    expect(BIPED_CONFIG['da-zacharial']!.hasCape).toBe(true)
    expect(resolveFigureKit('da.vb.intercessor-squad', undefined, 'intercessor').kit).toBe('da-intercessor')
  })

  it('figures use the faction paint scheme and every model resolves to an SD GLB', () => {
    expect(resolvePaintColors(bundle.factions['dark-angels']).primary).toBe('#1f3b2a')
    for (const sheet of daSheets) for (const m of sheet.composition) expect(glbSlugFor(sheet.id, m.modelId), `${sheet.id}/${m.modelId}`).toBeDefined()
  })

  it('every Dark Angels weapon has its own firing sound', () => {
    for (const id of Object.keys(bundle.weapons).filter((w) => w.startsWith('da.'))) expect(weaponSound(id), id).toBeDefined()
  })

  it('newGame seats Dark Angels on either side and in a mirror', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'dark-angels', opponentFaction: 'orks', opponent: 'hotseat', seed: 'da-vs-ork' })
    let s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['dark-angels', 'ork'])
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponentFaction: 'dark-angels', opponent: 'hotseat', seed: 'sm-vs-da' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['sm', 'dark-angels'])
    await useGameStore.getState().newGame({ playerFaction: 'dark-angels', opponentFaction: 'dark-angels', opponent: 'hotseat', seed: 'da-mirror' })
    s = useGameStore.getState().state!
    expect([s.players.A.faction, s.players.B.faction]).toEqual(['dark-angels', 'dark-angels'])
  }, 60000)
})
