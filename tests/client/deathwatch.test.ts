// Deathwatch in the client: the start screen offers them as their own faction, either seat can face any other faction,
// every datasheet has a dedicated procedural figure kit, and the new rules have readable prompt text.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { resolveFactionId, useGameStore } from '../../src/client/store/game'
import { resolveFigureKit } from '../../src/client/figures/data'
import { BIPED_CONFIG, BODY_KIND } from '../../src/client/figures/kitConfigs'

const bundle = await loadBundle()

describe('Deathwatch start screen', () => {
  it('DEA-CL-001 start screen lists Deathwatch as its own faction, next to Space Marines, with a blurb', () => {
    const ids = Object.keys(bundle.factions).filter((id) => Object.values(bundle.patrols).some((p) => p.faction === id))
    expect(ids).toContain('deathwatch')
    expect(bundle.factions['deathwatch'].name).not.toBe(bundle.factions['sm'].name)
    const src = readFileSync('src/client/ui/StartScreen.tsx', 'utf8')
    const order = /const FACTION_ORDER = \[([^\]]*)\]/.exec(src)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(order).toContain('deathwatch')
    expect(src).toMatch(/deathwatch:\s*'/)
    expect(resolveFactionId('deathwatch')).toBe('deathwatch')
  })

  it('DEA-CL-002 a Deathwatch player can face Space Marines, Orks and a mirror, on either side', async () => {
    const seat = async (playerFaction: string, opponentFaction: string, seed: string) => {
      await useGameStore.getState().newGame({ playerFaction, opponentFaction, opponent: 'hotseat', seed })
      const s = useGameStore.getState().state!
      return [s.players.A.faction, s.players.B.faction]
    }
    expect(await seat('deathwatch', 'space-marines', 'dw-vs-sm')).toEqual(['deathwatch', 'sm'])
    expect(await seat('orks', 'deathwatch', 'ork-vs-dw')).toEqual(['ork', 'deathwatch'])
    expect(await seat('deathwatch', 'deathwatch', 'dw-mirror')).toEqual(['deathwatch', 'deathwatch'])
  }, 60000)
})

describe('Deathwatch split squad', () => {
  it('DEA-1.1 splitting the Intercessor Squad in the start screen keeps both leaders attached, one per half', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'deathwatch', opponentFaction: 'space-marines', opponent: 'hotseat', seed: 'dw-split', splitSquads: true })
    const s = useGameStore.getState().state!
    const units = Object.values(s.units).filter((u) => u.player === 'A')
    const halves = units.filter((u) => u.ref === 'intercessor-squad-a' || u.ref === 'intercessor-squad-b')
    expect(halves).toHaveLength(2)
    expect(units.some((u) => u.ref === 'intercessor-squad')).toBe(false)
    expect(halves.every((h) => h.attachedLeaderId !== null)).toBe(true)
    expect(new Set(halves.map((h) => h.attachedLeaderId)).size).toBe(2)
  }, 60000)
})

describe('Deathwatch figures', () => {
  it('DEA-CL-003 every Deathwatch model resolves to its own procedural kit, not the generic fallback', () => {
    for (const ds of Object.values(bundle.datasheets).filter((d) => d.faction === 'deathwatch')) {
      for (const c of ds.composition) {
        const { kit } = resolveFigureKit(ds.id, ds, c.modelId)
        expect(kit, `${ds.id}/${c.modelId}`).toMatch(/^dw-/)
        expect(BODY_KIND[kit]).toBe('biped')
        expect(BIPED_CONFIG[kit], kit).toBeDefined()
      }
    }
  })

  it('DEA-CL-004 the paint scheme is black plate with silver trim', () => {
    expect(bundle.factions['deathwatch'].paintScheme.primary).toBe('#17181b')
    expect(bundle.factions['deathwatch'].paintScheme.secondary).toBe('#b9bec4')
  })
})

describe('Deathwatch decision text', () => {
  it('DEA-CL-005 the new rules have own-words prompt text in the decision prompt', () => {
    const src = readFileSync('src/client/ui/DecisionPrompt.tsx', 'utf8')
    for (const name of ['Narthecium', 'Special-Issue Ammunition', "Hunters' Insight", 'Deathwatch Teleportarium']) expect(src).toContain(name)
  })
})
