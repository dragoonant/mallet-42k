// Transient per-unit/per-model presentation cues (src/client/presentation/**), read by
// src/client/interaction/UnitsLayer.tsx to drive each live Figure's `action`/`rotationY` props.
// Nothing here touches GameState — every field is a short-lived visual cue set by the director
// (director.ts) as it plays engine events, and cleared automatically after its own duration so a
// caller never has to remember to tidy up.
import { create } from 'zustand'
import type { FigureAction, FigureActionKind } from '../figures'

/** Cues driven by this store never include 'death' — a destroyed model leaves state.models
 *  entirely and is handled by src/client/interaction/DeathGhosts.tsx instead. */
export type CueKind = Exclude<FigureActionKind, 'death'>

interface CueState {
  /** Shoot/melee pose cue for every model in an activated unit, keyed by unitId. */
  unitAction: Record<string, FigureAction>
  /** Hit-flinch cue for the specific model that took damage, keyed by modelId. Takes priority over
   *  a unit-level cue when both are present (a defender flinching mid-return-fire, say). */
  modelAction: Record<string, FigureAction>
  /** Brief "turn to face the target" facing override (radians, engine facing convention) while a
   *  model's shoot/melee cue is active, keyed by modelId. */
  modelFacing: Record<string, number>
  setUnitAction(unitId: string, kind: CueKind, token: number | string, ms: number): void
  setModelAction(modelId: string, kind: CueKind, token: number | string, ms: number): void
  setModelFacing(modelId: string, angle: number, ms: number): void
  reset(): void
}

// Timer handles live outside reactive state (they're bookkeeping, not something to render) — one
// map per cue kind, keyed the same way as the cue records above.
let unitTimers: Record<string, ReturnType<typeof setTimeout>> = {}
let modelTimers: Record<string, ReturnType<typeof setTimeout>> = {}
let facingTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export const useCueStore = create<CueState>((set) => ({
  unitAction: {},
  modelAction: {},
  modelFacing: {},

  setUnitAction(unitId, kind, token, ms) {
    clearTimeout(unitTimers[unitId])
    set((s) => ({ unitAction: { ...s.unitAction, [unitId]: { kind, t0: token } } }))
    unitTimers[unitId] = setTimeout(() => {
      set((s) => {
        if (s.unitAction[unitId]?.t0 !== token) return s
        const next = { ...s.unitAction }
        delete next[unitId]
        return { unitAction: next }
      })
    }, ms)
  },

  setModelAction(modelId, kind, token, ms) {
    clearTimeout(modelTimers[modelId])
    set((s) => ({ modelAction: { ...s.modelAction, [modelId]: { kind, t0: token } } }))
    modelTimers[modelId] = setTimeout(() => {
      set((s) => {
        if (s.modelAction[modelId]?.t0 !== token) return s
        const next = { ...s.modelAction }
        delete next[modelId]
        return { modelAction: next }
      })
    }, ms)
  },

  setModelFacing(modelId, angle, ms) {
    clearTimeout(facingTimers[modelId])
    set((s) => ({ modelFacing: { ...s.modelFacing, [modelId]: angle } }))
    facingTimers[modelId] = setTimeout(() => {
      set((s) => {
        const next = { ...s.modelFacing }
        delete next[modelId]
        return { modelFacing: next }
      })
    }, ms)
  },

  reset() {
    for (const t of Object.values(unitTimers)) clearTimeout(t)
    for (const t of Object.values(modelTimers)) clearTimeout(t)
    for (const t of Object.values(facingTimers)) clearTimeout(t)
    unitTimers = {}
    modelTimers = {}
    facingTimers = {}
    set({ unitAction: {}, modelAction: {}, modelFacing: {} })
  },
}))
