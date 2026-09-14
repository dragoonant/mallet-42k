// Test module tables: synthetic phase modules and services for exercising the reducer without real rules.
import type { TimingWindowId } from '../../src/data/types'
import {
  DEFAULT_MODULES, createEngine,
  type Action, type BattlePhase, type EngineApi, type EngineContext, type GameState, type ModuleTable, type PendingDecision,
  type PhaseModule, type PhaseStep, type PlayerId, type Services, type StepResult, type StratagemService,
} from '../../src/engine'
import { bundle } from './bundle'

export const FIRST_STEP: Record<BattlePhase, PhaseStep> = {
  setup: 'rollOffSides', deployment: 'deploy', command: 'command', movement: 'select', shooting: 'selectUnit', charge: 'declare', fight: 'fightsFirst',
}

export interface PingOptions {
  // decisions asked per phase visit
  confirms?: number
  // roll a D6 when each confirm is answered (gives the step a DiceRolled event)
  rollOnAnswer?: boolean
  // use ctx.rollOnce before each confirm (opens the any.rollMade window)
  rollOnceBefore?: boolean
}

// asks the active player to confirm `confirms` times per phase, then finishes the phase
export function pingModule(phase: BattlePhase, opts: PingOptions = {}): PhaseModule {
  const confirms = opts.confirms ?? 1
  const answered = (s: GameState) => s.phaseState.marks.filter((m) => m.startsWith('ping-answered:')).length
  return {
    name: `ping-${phase}`,
    enter(ctx) { ctx.state.step = FIRST_STEP[phase] },
    advance(ctx) {
      const s = ctx.state
      const n = answered(s)
      if (n >= confirms) return 'done'
      if (opts.rollOnceBefore && ctx.rollOnce(`ping:${n}`, { purpose: 'random', player: s.activePlayer }) === null) return 'pending'
      const player = s.activePlayer
      ctx.decide({
        kind: 'confirm', player, window: 'phase.end', canPass: false,
        context: { topic: 'info', message: `${phase} ping ${n}`, data: { n } },
        options: [{ id: 'ok', label: 'ok', action: { type: 'confirm', player, decisionId: '' } }],
      })
      return 'pending'
    },
    handle(ctx) {
      const s = ctx.state
      const n = answered(s)
      s.phaseState.marks.push(`ping-answered:${n}`)
      if (opts.rollOnAnswer) ctx.roll({ purpose: 'random', player: s.activePlayer })
    },
  }
}

export function pingPhases(opts: PingOptions = {}): ModuleTable['phases'] {
  return {
    setup: DEFAULT_MODULES.phases.setup,
    deployment: DEFAULT_MODULES.phases.deployment,
    command: pingModule('command', opts),
    movement: pingModule('movement', opts),
    shooting: pingModule('shooting', opts),
    charge: pingModule('charge', opts),
    fight: pingModule('fight', opts),
  }
}

// a phase module driven by callbacks (for one-off scenarios)
export function scriptedModule(phase: BattlePhase, impl: Partial<PhaseModule>): PhaseModule {
  return {
    name: `scripted-${phase}`,
    enter: impl.enter ?? ((ctx) => { ctx.state.step = FIRST_STEP[phase] }),
    advance: impl.advance ?? (() => 'done'),
    handle: impl.handle ?? (() => undefined),
    validate: impl.validate,
    legalActions: impl.legalActions,
    exit: impl.exit,
  }
}

export interface RecordedWindow { window: TimingWindowId; player: PlayerId; key: string; round: number; phase: string; turn: PlayerId }

// records every stratagem-window offer; opens a real `stratagemWindow` decision (pass only) for windows in `open`
export function recordingStratagems(open: TimingWindowId[] = []): StratagemService & { offers: RecordedWindow[] } {
  const offers: RecordedWindow[] = []
  return {
    offers,
    openWindow(ctx: EngineContext, window, player, key) {
      const s = ctx.state
      offers.push({ window, player, key, round: s.round, phase: s.phase, turn: s.activePlayer })
      if (!open.includes(window)) return false
      ctx.decide({
        kind: 'stratagemWindow', player, window, canPass: true,
        context: { trigger: { unitId: null, targetUnitId: null, rollId: null }, usable: [] }, options: [],
      })
      return true
    },
    usable: () => [],
    handle(ctx, action) {
      if (action.type !== 'pass') return { code: 'E_NOT_AN_OPTION', reason: 'test windows accept pass only' }
      ctx.emit({ type: 'StratagemWindowClosed', window: (ctx.state.pending?.window ?? 'phase.end') as TimingWindowId, used: null })
    },
  }
}

export function makeEngine(overrides: { phases?: Partial<ModuleTable['phases']>; services?: Partial<Services>; topics?: ModuleTable['topics'] } = {}): EngineApi {
  return createEngine({
    phases: { ...DEFAULT_MODULES.phases, ...(overrides.phases ?? {}) },
    services: { ...DEFAULT_MODULES.services, ...(overrides.services ?? {}) },
    topics: { ...DEFAULT_MODULES.topics, ...(overrides.topics ?? {}) },
  })
}

export const pingEngine = (opts: PingOptions = {}, services: Partial<Services> = {}) => makeEngine({ phases: pingPhases(opts), services })

// drives the real setup+deployment phases (sides/first-turn preset, no Scouts in the fixture rosters) to completion
// using each decision's own default legal action, so ping-phase tests can get past deployment before asserting on
// the round/turn/phase machinery. Stops as soon as a decision isn't one of setup.ts's own (they all carry window
// 'deployment.unit') — e.g. a round.start stratagem window, which can fire while state.phase is still 'deployment'
// (00-arch §4) and must not be silently swallowed. Returns the intermediate results too, since some tests check the
// full event stream.
export function deployAll(engine: EngineApi, start: StepResult, maxSteps = 50): { results: StepResult[]; final: StepResult } {
  const results: StepResult[] = []
  let r = start
  for (let i = 0; i < maxSteps && r.pending && r.pending.window === 'deployment.unit'; i++) {
    const legal = engine.legalActions(r.state, r.pending)
    if (!legal || legal.length === 0) throw new Error(`deployAll: no legal action for ${r.pending.kind}`)
    r = engine.step(r.state, legal[0])
    if (r.rejection) throw new Error(`deployAll: rejected ${r.rejection.code} ${r.rejection.reason}`)
    results.push(r)
  }
  return { results, final: r }
}

// answer every decision with the first legal action (or `choose`) until the game ends or `maxSteps` is reached
export function autoplay(
  engine: EngineApi,
  start: StepResult,
  maxSteps = 10_000,
  choose: (state: GameState, pending: PendingDecision, legal: Action[] | null) => Action = (_s, p, legal) => {
    if (!legal || legal.length === 0) throw new Error(`no legal action for ${p.kind}`)
    return legal[0]
  },
): { results: StepResult[]; actions: Action[]; final: StepResult } {
  const results: StepResult[] = []
  const actions: Action[] = []
  let r = start
  for (let i = 0; i < maxSteps && r.pending; i++) {
    const legal = engine.legalActions(r.state, r.pending)
    const action = choose(r.state, r.pending, legal)
    r = engine.step(r.state, action)
    if (r.rejection) throw new Error(`autoplay: rejected ${r.rejection.code} ${r.rejection.reason}`)
    results.push(r)
    actions.push(action)
  }
  return { results, actions, final: r }
}

export { bundle }
