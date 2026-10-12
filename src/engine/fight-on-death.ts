// C5 (Chaos Space Marines, Daemonic Fervour): a model destroyed in the Fight phase by an enemy attack may be kept on the board at 0
// wounds ("deferred") when its unit has been granted fight-on-death and has not fought yet. It is dead for every purpose except
// one last melee attack, made once the attacking enemy unit has finished its own attacks; it is then removed via
// `attackService.finishDestroy`. All state lives in phase-scoped marks: `fightOnDeath:<canonicalUnitId>:<threshold>` and
// `deferredDeath:<json DeferredDeath>`. The deferral roll + mark push is in `attack.ts` `destroyModel`; `state.ts` `unitModels`
// skips deferred models, which keeps them out of every allocation pool, OC count, coherency check and targeting query.
import { leaderService } from './leaders'
import type { EngineContext } from './modules'
import { attackService, type DestroyedBy } from './attack'
import { deferredPileInStep, deferredWeapons } from './phases/fight'
import { isDeferredDead } from './state'
import type { GameState, ModelId, UnitId } from './types'

export { isDeferredDead }

export interface DeferredDeath { modelId: ModelId; unitId: UnitId; attackerUnitId: UnitId; by: DestroyedBy }

const FOD_PREFIX = 'fightOnDeath:'
const DEFERRED_PREFIX = 'deferredDeath:'

export function grantFightOnDeath(state: GameState, unitId: UnitId, threshold: number): void {
  const mark = `${FOD_PREFIX}${leaderService.canonicalUnitId(state, unitId)}:${threshold}`
  if (!state.phaseState.marks.includes(mark)) state.phaseState.marks.push(mark)
}

// the best (lowest) threshold granted to the unit this phase, or null
export function fightOnDeathThreshold(state: GameState, unitId: UnitId): number | null {
  const prefix = `${FOD_PREFIX}${leaderService.canonicalUnitId(state, unitId)}:`
  let best: number | null = null
  for (const m of state.phaseState.marks) {
    if (!m.startsWith(prefix)) continue
    const n = Number(m.slice(prefix.length))
    if (best === null || n < best) best = n
  }
  return best
}

export function deferredDeaths(state: GameState, attackerUnitId?: UnitId): DeferredDeath[] {
  const want = attackerUnitId ? leaderService.canonicalUnitId(state, attackerUnitId) : null
  const out: DeferredDeath[] = []
  for (const m of state.phaseState.marks) {
    if (!m.startsWith(DEFERRED_PREFIX)) continue
    const d = JSON.parse(m.slice(DEFERRED_PREFIX.length)) as DeferredDeath
    if (want === null || leaderService.canonicalUnitId(state, d.attackerUnitId) === want) out.push(d)
  }
  return out
}

function dropMarks(state: GameState, pred: (m: string) => boolean): void {
  state.phaseState.marks = state.phaseState.marks.filter((m) => !pred(m))
}

// remove every deferred model of `canon` (its marks first, so the removal sees ordinary dead models)
function finishUnit(ctx: EngineContext, canon: UnitId): void {
  const s = ctx.state
  const mine = deferredDeaths(s).filter((d) => leaderService.canonicalUnitId(s, d.unitId) === canon)
  const ids = new Set<string>(mine.map((d) => d.modelId))
  dropMarks(s, (m) => m === `fod:decl:${canon}` || m === `fod:pile:${canon}` || m === `fi:declared:${canon}` || (m.startsWith(DEFERRED_PREFIX) && ids.has((JSON.parse(m.slice(DEFERRED_PREFIX.length)) as DeferredDeath).modelId)))
  for (const d of mine) attackService.finishDestroy(ctx, d.modelId, d.by)
}

// Raise one melee declareTargets per owning unit (weapons = the deferred models only), resolve it as an ordinary melee attack
// sequence, then remove them. 'pending' while a decision is open; re-entrant (the fight module re-calls it after each answer).
// A deferred model that, after its optional pile-in, may attack nothing (normal R-9.8 eligibility) is removed at once.
// Every deferred model is drained, not just those the current attacker killed: a deferred unit's own last attacks can defer
// models of an enemy fight-on-death unit (mirror match), and those have the deferred unit as their `attackerUnitId`.
export function resolveDeferredDeaths(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  for (let guard = 0; guard < 64; guard++) {
    const list = deferredDeaths(s)
    if (list.length === 0) return 'done'
    const canon = leaderService.canonicalUnitId(s, list[0].unitId)
    const models = list.filter((d) => leaderService.canonicalUnitId(s, d.unitId) === canon)
    const declKey = `fod:decl:${canon}`
    if (ctx.marked(declKey)) {
      // the declared sequence was started by the fight module's declareTargets handler; run it to the end
      if (s.phaseState.attack && s.phaseState.attack.attackerUnitId === canon) {
        if (attackService.advance(ctx) === 'pending') return 'pending'
      }
      finishUnit(ctx, canon)
      continue
    }
    const player = s.units[models[0].unitId].player
    // CSM-09: the deferred models may pile in first (Fight on Death), then attack by the normal R-9.8 eligibility (CSM-10)
    const live = models.map((d) => s.models[d.modelId]).filter((m): m is NonNullable<typeof m> => !!m)
    if (deferredPileInStep(ctx, `fod:pile:${canon}`, canon, live.map((m) => m.id)) === 'pending') return 'pending'
    const weapons = deferredWeapons(ctx, canon, live)
    if (weapons === 'pending') return 'pending'
    if (weapons.length === 0) { finishUnit(ctx, canon); continue }
    ctx.once(declKey)
    const engagedWith = [...new Set(weapons.flatMap((w) => w.legalTargets))]
    ctx.decide({
      kind: 'declareTargets', player, window: 'fight.unitSelected', canPass: false,
      context: { unitId: canon, attackKind: 'melee', overwatch: false, weapons, engagedWith },
    })
    return 'pending'
  }
  return 'done'
}

// Fight-phase exit safety net: any model still marked deferred is removed now (no further attacks), so finishDestroy, the
// UnitDestroyed event and kill credit always run before the phase-scoped marks are cleared.
export function purgeDeferredDeaths(ctx: EngineContext): void {
  const s = ctx.state
  for (let guard = 0; guard < 256; guard++) {
    const list = deferredDeaths(s)
    if (list.length === 0) return
    finishUnit(ctx, leaderService.canonicalUnitId(s, list[0].unitId))
  }
}
