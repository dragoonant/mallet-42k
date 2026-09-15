// Client-only interaction state (selection, hover, in-progress placement draft, camera toggle,
// Measure/LoS tools — M2 battlefield gaps). Never touches GameState — every field here is
// presentational/interaction bookkeeping consumed by src/client/interaction/** and src/client/ui/**.
import { create } from 'zustand'
import type { ModelPlacement } from '@/engine'

export interface PlacementDraft {
  /** decision id this draft answers — used to invalidate a stale draft when the decision moves on. */
  decisionId: string
  unitId: string
  anchor: { x: number; z: number }
  placements: ModelPlacement[]
}

export interface Vec2 {
  x: number
  z: number
}

/** A resolved Measure-tool line ready to render — already base-edge-to-base-edge when the drag
 *  started on a model and landed on an enemy one (src/client/interaction/measure.ts). */
export interface MeasureLine {
  a: Vec2
  b: Vec2
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
  /** Measure tool (HUD toggle + key M): click-drag on the board draws a ruler. `measureAnchor` is
   *  the live drag's raw start point; `measureLine` is the resolved a/b to draw, kept after
   *  pointer-up so the last measurement stays visible until Esc or a new drag starts. */
  measureOn: boolean
  measureAnchor: Vec2 | null
  measureLine: MeasureLine | null
  /** Line-of-sight view (HUD toggle + key L): with a unit selected, tints enemy units by
   *  visible/cover/hidden (src/client/interaction/lineOfSight.ts). */
  losOn: boolean
  /** "Keys" help popover (src/client/ui/ToolsBar.tsx). */
  helpOpen: boolean
  /** Settings popover (src/client/ui/SettingsPanel.tsx) — audio mix + animation-speed/dice/ambient. */
  settingsOpen: boolean
  /** Board point the camera should smoothly centre on next — a fresh object every call so
   *  CameraRig's effect fires even when re-focusing the same spot (src/client/board/CameraRig.tsx). */
  focusTarget: Vec2 | null
  selectUnit(id: string | null): void
  hoverUnit(id: string | null): void
  hoverObjective(id: string | null): void
  setDeployTarget(id: string | null): void
  setDraft(draft: PlacementDraft | null): void
  setPreviewDraft(draft: PlacementDraft | null): void
  toggleTopDown(): void
  toggleMeasure(): void
  setMeasureAnchor(p: Vec2 | null): void
  setMeasureLine(line: MeasureLine | null): void
  /** Esc: clears the current/last measurement without turning the tool off. */
  clearMeasure(): void
  toggleLos(): void
  toggleHelp(): void
  toggleSettings(): void
  focusCamera(pos: Vec2): void
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
  measureOn: false,
  measureAnchor: null,
  measureLine: null,
  losOn: false,
  helpOpen: false,
  settingsOpen: false,
  focusTarget: null,
  selectUnit: (id) => set({ selectedUnitId: id }),
  hoverUnit: (id) => set({ hoveredUnitId: id }),
  hoverObjective: (id) => set({ hoveredObjectiveId: id }),
  setDeployTarget: (id) => set({ deployTargetUnitId: id, draft: null }),
  setDraft: (draft) => set({ draft }),
  setPreviewDraft: (previewDraft) => set({ previewDraft }),
  toggleTopDown: () => set((s) => ({ topDown: !s.topDown })),
  toggleMeasure: () =>
    set((s) => (s.measureOn ? { measureOn: false, measureAnchor: null, measureLine: null } : { measureOn: true })),
  setMeasureAnchor: (p) => set({ measureAnchor: p }),
  setMeasureLine: (measureLine) => set({ measureLine }),
  clearMeasure: () => set({ measureAnchor: null, measureLine: null }),
  toggleLos: () => set((s) => ({ losOn: !s.losOn })),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  focusCamera: (pos) => set({ focusTarget: { x: pos.x, z: pos.z } }),
  resetForDecision: () => set({ deployTargetUnitId: null, draft: null, previewDraft: null, hoveredUnitId: null, hoveredObjectiveId: null }),
  resetAll: () =>
    set({
      selectedUnitId: null,
      hoveredUnitId: null,
      hoveredObjectiveId: null,
      deployTargetUnitId: null,
      draft: null,
      previewDraft: null,
      measureOn: false,
      measureAnchor: null,
      measureLine: null,
      losOn: false,
      focusTarget: null,
    }),
}))
