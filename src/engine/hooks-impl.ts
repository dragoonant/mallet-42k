// Hook dispatch (20-data §3, hooks.ts): evaluates every active AbilityDescriptor / stratagem effect / code hook at a
// hook point and applies EffectRequests. Owner: W1-F. Modules never iterate abilities themselves — they call
// services.hooks.collect (for modifiers) or services.hooks.run (for side effects) and pass the hook-specific data.
import type { TimingWindowId } from '../data/types'
import type { EffectRequest, EffectSource, HookContextBase, HookContextFor, HookName, HookRegistry, HookResultFor } from './hooks'
import type { DecisionHandler, EngineContext, WindowTrigger } from './modules'
import { notImplementedHandle } from './modules'

// the hook-specific part of a HookContext; the service fills in state/phase/activePlayer/source/unitId/hook per descriptor
export type HookData<K extends HookName> = Omit<HookContextFor<K>, keyof HookContextBase | 'hook'>

export interface HookService {
  // bespoke `code` hooks by name (20-data §12 validates data against these keys)
  readonly registry: HookRegistry
  // evaluate all sources for a hook; returns their results without applying side effects (roll/stat/eligibility hooks)
  collect<K extends HookName>(ctx: EngineContext, hook: K, data: HookData<K>): { source: EffectSource; result: HookResultFor<K> }[]
  // collect and apply every EffectRequest (phase/turn/destroyed hooks); may raise decisions (topic 'abilityChoice')
  run<K extends HookName>(ctx: EngineContext, hook: K, data: HookData<K>): void
  // apply one EffectRequest (mortal wounds via services.attack, cp/vp via players, grantEffect via services.effects, …)
  apply(ctx: EngineContext, source: EffectSource, request: EffectRequest): void
  // called once per timing-window occurrence by ctx.window (before stratagem windows): window-keyed code abilities
  // such as Oath of Moment's pick (`params.pickWindow`), Waaagh! at round.start
  onWindow(ctx: EngineContext, window: TimingWindowId, key: string, trigger?: WindowTrigger): void
  // answers chooseOption topics oathTarget / waaagh / abilityChoice
  readonly handler: DecisionHandler
}

export const hookService: HookService = {
  registry: {},
  // TODO(W1-F): iterate state.abilities × units (scope, when, limits, bearerModelId) + ActiveEffects + registry code hooks
  collect: () => [],
  // TODO(W1-F)
  run: () => undefined,
  // TODO(W1-F)
  apply: () => { throw new Error('hooks.apply not implemented') },
  // TODO(W1-F)
  onWindow: () => undefined,
  handler: { handle: notImplementedHandle('hooks') },
}
