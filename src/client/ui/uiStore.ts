// Client-only interaction state (selection, hover, in-progress placement draft, camera toggle).
// Never touches GameState — every field here is presentational/interaction bookkeeping consumed by
// src/client/interaction/** and src/client/ui/**.
import { create } from 'zustand'
import type { ModelPlacement } from '@/engine'

export interface PlacementDraft {
  /** decision id this draft answers — used to invalidate a stale draft when the decision moves on. */
  decisionId: string
  unitId: string
  anchor: { x: number; z: number }
  placements: ModelPlacement[]
}

interface UiState {
  selectedUnitId: string | null
  hoveredUnitId: string | null
  /** For `deployUnit`: which of context.unitIds the player is currently placing (palette selection). */
  deployTargetUnitId: string | null
  draft: PlacementDraft | null
  topDown: boolean
  selectUnit(id: string | null): void
  hoverUnit(id: string | null): void
  setDeployTarget(id: string | null): void
  setDraft(draft: PlacementDraft | null): void
  toggleTopDown(): void
  /** Clears everything scoped to one decision — call whenever `pending.id` changes. */
  resetForDecision(): void
  /** Clears all interaction state — call when a new game starts. */
  resetAll(): void
}

export const useUiStore = create<UiState>((set) => ({
  selectedUnitId: null,
  hoveredUnitId: null,
  deployTargetUnitId: null,
  draft: null,
  topDown: false,
  selectUnit: (id) => set({ selectedUnitId: id }),
  hoverUnit: (id) => set({ hoveredUnitId: id }),
  setDeployTarget: (id) => set({ deployTargetUnitId: id, draft: null }),
  setDraft: (draft) => set({ draft }),
  toggleTopDown: () => set((s) => ({ topDown: !s.topDown })),
  resetForDecision: () => set({ deployTargetUnitId: null, draft: null }),
  resetAll: () => set({ selectedUnitId: null, hoveredUnitId: null, deployTargetUnitId: null, draft: null }),
}))
