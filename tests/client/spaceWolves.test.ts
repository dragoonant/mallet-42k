// Space Wolves in the client: the start screen offers them as their own faction and either seat can face Space Marines.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { resolveFactionId, useGameStore } from '../../src/client/store/game'

const bundle = await loadBundle()

describe('Space Wolves start screen', () => {
  it('SPA-005 start screen lists Space Wolves as its own faction, next to Space Marines', () => {
    // Same filter the StartScreen uses to build its faction buttons.
    const ids = Object.keys(bundle.factions).filter((id) => Object.values(bundle.patrols).some((p) => p.faction === id))
    expect(ids).toContain('space-wolves')
    expect(ids).toContain('sm')
    expect(bundle.factions['space-wolves'].name).not.toBe(bundle.factions['sm'].name)

    // The button order puts Space Wolves right after Space Marines, and it has its own blurb.
    const src = readFileSync('src/client/ui/StartScreen.tsx', 'utf8')
    const order = /const FACTION_ORDER = \[([^\]]*)\]/.exec(src)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(order.indexOf('space-wolves')).toBe(order.indexOf('sm') + 1)
    expect(src).toMatch(/'space-wolves':\s*'/)
    expect(resolveFactionId('space-wolves')).toBe('space-wolves')
  })

  it('SPA-005 a Space Wolves player can face a Space Marines player, on either side and in a mirror', async () => {
    const seat = async (playerFaction: string, opponentFaction: string, seed: string) => {
      await useGameStore.getState().newGame({ playerFaction, opponentFaction, opponent: 'hotseat', seed })
      const s = useGameStore.getState().state!
      return [s.players.A.faction, s.players.B.faction]
    }
    expect(await seat('space-wolves', 'space-marines', 'spa-vs-sm')).toEqual(['space-wolves', 'sm'])
    expect(await seat('space-marines', 'space-wolves', 'sm-vs-spa')).toEqual(['sm', 'space-wolves'])
    expect(await seat('space-wolves', 'space-wolves', 'spa-mirror')).toEqual(['space-wolves', 'space-wolves'])
  }, 60000)
})
