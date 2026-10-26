// Save / Continue (src/client/store/saveGame.ts + the store's autosave and continueSavedGame). Not a rules test:
// it checks the browser-side envelope, the exact-restore check, and that storage trouble never reaches the game.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../src/client/store/game'
import { SAVE_DISCARDED_MESSAGE, SAVE_KEY, buildEnvelope, persistAfterAction, readSave, relativeTime, shouldConfirmReplace } from '../../src/client/store/saveGame'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null }
  setItem(k: string, v: string) { this.data.set(k, String(v)) }
  removeItem(k: string) { this.data.delete(k) }
}
const g = globalThis as unknown as { localStorage?: unknown }
let mem: MemoryStorage

beforeEach(() => {
  mem = new MemoryStorage()
  g.localStorage = mem
  useGameStore.setState({ saveNotice: null })
})
afterEach(() => {
  delete g.localStorage
})

/** Starts a hot-seat game (no bot timer) and plays `n` accepted actions through the store. */
async function startAndPlay(seed: string, n: number, opponent: 'hotseat' | 'bot' = 'hotseat') {
  await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponent, seed })
  for (let i = 0; i < n; i++) {
    const { legal, pending } = useGameStore.getState()
    if (!pending || !legal?.length) break
    useGameStore.getState().dispatch(legal[0])
  }
  return useGameStore.getState()
}

describe('save game', () => {
  it('SAVE envelope round-trip: one autosave per accepted action, readable back with the client choices', async () => {
    const s = await startAndPlay('save-roundtrip', 4)
    const r = readSave()
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.envelope.kind).toBe('mallet42k-save')
    expect(r.envelope.v).toBe(1)
    expect(r.envelope.file.actions).toHaveLength(s.state!.log.length)
    expect(r.envelope.file.finalHash).toBe(s.state!.hash)
    expect(r.envelope.meta).toMatchObject({ opponent: 'hotseat', humanSeat: 'A', round: s.state!.round, phase: s.state!.phase })
    // JSON round-trip is lossless
    expect(JSON.parse(JSON.stringify(r.envelope))).toEqual(r.envelope)
  })

  it('SAVE restore gives the same state hash and the bot seat back', async () => {
    const before = await startAndPlay('save-restore', 5, 'bot')
    const hash = before.state!.hash
    const round = before.state!.round
    const positions = JSON.stringify(Object.values(before.state!.models).map((m) => [m.id, m.pos]))
    useGameStore.setState({ state: null, pending: null, legal: null, botSeat: null, opponent: null, difficulty: null })
    const ok = await useGameStore.getState().continueSavedGame()
    const after = useGameStore.getState()
    expect(ok).toBe(true)
    expect(after.state!.hash).toBe(hash)
    expect(after.state!.round).toBe(round)
    expect(JSON.stringify(Object.values(after.state!.models).map((m) => [m.id, m.pos]))).toBe(positions)
    expect(after.opponent).toBe('bot')
    expect(after.botSeat).toBe('B')
    expect(after.difficulty).toBe(before.difficulty)
    expect(after.events).toEqual([]) // nothing queued for presentation: the board opens on the current position
    expect(after.pending?.id).toBe(before.pending?.id)
  }, 60000)

  it('SAVE a corrupt, tampered or unrecognised save is discarded with the start-screen message', async () => {
    // unparsable JSON: discarded when the start screen looks
    mem.setItem(SAVE_KEY, '{not json')
    expect(useGameStore.getState().inspectSave()).toBeNull()
    expect(mem.getItem(SAVE_KEY)).toBeNull()
    expect(useGameStore.getState().saveNotice).toBe(SAVE_DISCARDED_MESSAGE)

    // a real save whose final hash no longer matches the replay (older rules / changed data): rejected on Continue, cleared
    useGameStore.setState({ saveNotice: null })
    await startAndPlay('save-tampered', 3)
    const env = JSON.parse(mem.getItem(SAVE_KEY)!)
    env.file.finalHash = 'deadbeef'
    mem.setItem(SAVE_KEY, JSON.stringify(env))
    useGameStore.setState({ state: null, pending: null })
    expect(await useGameStore.getState().continueSavedGame()).toBe(false)
    expect(mem.getItem(SAVE_KEY)).toBeNull()
    expect(useGameStore.getState().saveNotice).toBe(SAVE_DISCARDED_MESSAGE)
    expect(useGameStore.getState().state).toBeNull()

    // a save naming data that no longer exists
    useGameStore.setState({ saveNotice: null })
    await startAndPlay('save-missing-data', 2)
    const env2 = JSON.parse(mem.getItem(SAVE_KEY)!)
    env2.file.setup.missionId = 'mission.does-not-exist'
    mem.setItem(SAVE_KEY, JSON.stringify(env2))
    useGameStore.setState({ state: null, pending: null })
    expect(await useGameStore.getState().continueSavedGame()).toBe(false)
    expect(mem.getItem(SAVE_KEY)).toBeNull()
    expect(useGameStore.getState().saveNotice).toBe(SAVE_DISCARDED_MESSAGE)
  }, 60000)

  it('SAVE an older engine major is discarded unless it replays to the same hash', async () => {
    await startAndPlay('save-old-engine', 3)
    const env = JSON.parse(mem.getItem(SAVE_KEY)!)
    const goodHash = env.file.finalHash
    // different engine version, wrong hash -> discarded
    env.file.engineVersion = '0.9.0'
    env.file.finalHash = 'not-the-hash'
    mem.setItem(SAVE_KEY, JSON.stringify(env))
    expect(await useGameStore.getState().continueSavedGame()).toBe(false)
    expect(mem.getItem(SAVE_KEY)).toBeNull()
    // different engine version, same hash -> loads
    env.file.finalHash = goodHash
    mem.setItem(SAVE_KEY, JSON.stringify(env))
    useGameStore.setState({ saveNotice: null })
    expect(await useGameStore.getState().continueSavedGame()).toBe(true)
    expect(useGameStore.getState().state!.hash).toBe(goodHash)
  }, 60000)

  it('SAVE is cleared when the game ends, and a new game replaces it', async () => {
    const s = await startAndPlay('save-ended', 3)
    expect(readSave().status).toBe('ok')
    const ctx = { opponent: s.opponent!, difficulty: s.difficulty, humanSeat: s.humanSeat }
    // an unfinished state keeps being saved; one carrying a result clears the save
    persistAfterAction(s.state!, ctx)
    expect(readSave().status).toBe('ok')
    persistAfterAction({ ...s.state!, result: { winner: 'A', reason: 'rounds' } } as typeof s.state & object, ctx)
    expect(readSave().status).toBe('none')
    // starting a new game while a save exists wipes the old one until the new game's first action
    persistAfterAction(s.state!, ctx)
    expect(readSave().status).toBe('ok')
    await useGameStore.getState().newGame({ playerFaction: 'space-marines', opponent: 'hotseat', seed: 'save-replaced' })
    expect(readSave().status).toBe('none')
  }, 60000)

  it('SAVE starting a new game asks first only when a continuable save exists', async () => {
    expect(shouldConfirmReplace()).toBe(false)
    const s = await startAndPlay('save-confirm', 2)
    expect(shouldConfirmReplace()).toBe(true)
    mem.setItem(SAVE_KEY, 'garbage')
    expect(shouldConfirmReplace()).toBe(false) // nothing worth protecting
    mem.setItem(SAVE_KEY, JSON.stringify(buildEnvelope(s.state!, { opponent: 'hotseat', difficulty: null, humanSeat: 'A' })))
    expect(shouldConfirmReplace()).toBe(true)
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5 minutes ago')
    expect(relativeTime(Date.now() - 3 * 3600_000)).toBe('3 hours ago')
  }, 60000)

  it('SAVE storage that throws never breaks dispatch', async () => {
    g.localStorage = {
      getItem() { throw new Error('blocked') },
      setItem() { throw new DOMException('quota', 'QuotaExceededError') },
      removeItem() { throw new Error('blocked') },
    }
    const s = await startAndPlay('save-throwing', 4)
    expect(s.state!.log.length).toBeGreaterThan(0)
    expect(readSave().status).toBe('none')
    expect(shouldConfirmReplace()).toBe(false)
    expect(await useGameStore.getState().continueSavedGame()).toBe(false)
  }, 60000)
})
