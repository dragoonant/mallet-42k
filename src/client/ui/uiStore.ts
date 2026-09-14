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
  /** Objective a chooseOption/stratagem prompt option is naming — highlighted on the board while its
   *  button is hovered (src/client/ui/DecisionPrompt.tsx, src/client/board/Objectives.tsx). */
  hoveredObjectiveId: string | null
  /** For `deployUnit`: which of context.unitIds the player is currently placing (palette selection). */
  deployTargetUnitId: string | null
  draft: PlacementDraft | null
  /** A suggested-placement option's would-be result, shown as a ghost marker while its button is
   *  hovered — never dispatched, purely a preview (src/client/ui/DecisionPrompt.tsx). */
  previewDraft: PlacementDraft | null
  topDown: boolean
  selectUnit(id: string | null): void
  hoverUnit(id: string | null): void
  hoverObjective(id: string | null): void
  setDeployTarget(id: string | null): void
  setDraft(draft: PlacementDraft | null): void
  setPreviewDraft(draft: PlacementDraft | null): void
  toggleTopDown(): void
  /** Clears everything scoped to one decision — call whenever `pending.id` changes. */
  resetForDecision(): void
  /** Clears all interaction state — call when a new game starts. */
  resetAll(): void
}

export const useUiStore = create<UiState>((set) => ({
  selectedUnitId: null,
  hoveredUnitId: null,
  hoveredObjectiveId: null,
  deployTargetUnitId: null,
  draft: null,
  previewDraft: null,
  topDown: false,
  selectUnit: (id) => set({ selectedUnitId: id }),
  hoverUnit: (id) => set({ hoveredUnitId: id }),
  hoverObjective: (id) => set({ hoveredObjectiveId: id }),
  setDeployTarget: (id) => set({ deployTargetUnitId: id, draft: null }),
  setDraft: (draft) => set({ draft }),
  setPreviewDraft: (previewDraft) => set({ previewDraft }),
  toggleTopDown: () => set((s) => ({ topDown: !s.topDown })),
  resetForDecision: () => set({ deployTargetUnitId: null, draft: null, previewDraft: null, hoveredUnitId: null, hoveredObjectiveId: null }),
  resetAll: () => set({ selectedUnitId: null, hoveredUnitId: null, hoveredObjectiveId: null, deployTargetUnitId: null, draft: null, previewDraft: null }),
}))
