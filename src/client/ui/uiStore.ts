// Client-only interaction state (selection, hover, in-progress placement draft, camera toggle,
// Measure/LoS tools — M2 battlefield gaps). Never touches GameState — every field here is
// presentational/interaction bookkeeping consumed by src/client/interaction/** and src/client/ui/**.
import { create } from 'zustand'
import type { ModelPlacement } from '@/engine'
import type { FormationKind } from '../interaction/formations'

const BATTLEFIELD_COUNT = 6
const BATTLEFIELD_KEY = 'mallet42k.battlefield'
const BATTLEFIELD_SLUGS = ['aerialrock', 'dirt', 'dryrocks', 'rocks08', 'crackmud', 'laterite']

/** `?board=<1-6 or slug>` forces a battlefield (for screenshots); null when absent/invalid. */
function forcedBattlefield(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('board')
    if (!v) return null
    const n = Number(v)
    if (Number.isInteger(n) && n >= 1 && n <= BATTLEFIELD_COUNT) return n - 1
    const i = BATTLEFIELD_SLUGS.indexOf(v)
    return i >= 0 ? i : null
  } catch {
    return null
  }
}
const FORCED_BATTLEFIELD = forcedBattlefield()

function storedBattlefield(): number {
  try {
    const n = Number(window.localStorage.getItem(BATTLEFIELD_KEY))
    if (window.localStorage.getItem(BATTLEFIELD_KEY) !== null && Number.isInteger(n) && n >= 0 && n < BATTLEFIELD_COUNT) return n
  } catch {
    /* storage unavailable */
  }
  // Last-used index; the first new game advances from here, so start one before 0.
  return BATTLEFIELD_COUNT - 1
}

function saveBattlefield(i: number): void {
  try {
    window.localStorage.setItem(BATTLEFIELD_KEY, String(i))
  } catch {
    /* storage unavailable */
  }
}

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

/** Per-unit "last formation used" memory (M4 gap #5) — session-lifetime only (cleared on a new
 *  game), keyed by unitId. Read by src/client/interaction/boardClick.ts to default a unit's next
 *  move-family decision to `kind: 'keep'` at the remembered facing, per the owning instruction. */
export interface FormationMemoryEntry {
  kind: FormationKind
  facing: number
}

/** In-progress model-nudge drag (M4 #3): dragging one ghost after a draft is placed moves just that
 *  model; Shift+drag moves the whole drafted formation. Read/written by
 *  src/client/interaction/useBoardClick.ts (the drag math) and started by a pointer-down on a ghost
 *  marker in PlacementOverlay.tsx. */
export interface NudgeState {
  decisionId: string
  mode: 'model' | 'formation'
  /** 'model' mode: the one model being dragged. 'formation' mode: null (every placement moves). */
  modelId: string | null
  /** 'model' mode: pointer-minus-model offset at drag start, so the model doesn't jump to the
   *  cursor. 'formation' mode: the drag's start point itself, so a delta can be computed. */
  grab: Vec2
  /** Placements as they were the instant the drag started — 'formation' mode diffs against these
   *  every move rather than accumulating drift from a running total. */
  basePlacements: ModelPlacement[]
}

/** A resolved Measure-tool line ready to render — already base-edge-to-base-edge when the drag
 *  started on a model and landed on an enemy one (src/client/interaction/measure.ts). */
export interface MeasureLine {
  a: Vec2
  b: Vec2
}

interface UiState {
  /** Index into BATTLEFIELDS (src/client/board/terrainAssets.ts) of the ground texture in use. */
  battlefieldIndex: number
  selectedUnitId: string | null
  hoveredUnitId: string | null
  /** Every unit the hovered prompt option names (a charge can declare several targets; a stratagem can
   *  name two units). `hoveredUnitId` is always the first of these — UnitsLayer reads this list. */
  hoveredUnitIds: readonly string[]
  /** One model, for prompts that choose between models of the same unit (allocateAttack) — the
   *  unit-level hover would light up all ten Boyz when the choice is which one takes the hit. */
  hoveredModelId: string | null
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
  /** M4 formation picker: the shape currently selected for the pending placement decision, and its
   *  facing (radians). `formationFacingAuto` is true until the player explicitly rotates (Q/E,
   *  wheel, R, or a remembered facing from a previous formation) — while true, a fresh board click
   *  keeps re-deriving facing from the direction of travel instead of using the stale stored value. */
  formationKind: FormationKind
  formationFacing: number
  formationFacingAuto: boolean
  formationMemory: Record<string, FormationMemoryEntry>
  nudge: NudgeState | null
  selectUnit(id: string | null): void
  /** One unit id, several (all lit together), or null to clear. */
  hoverUnit(ids: string | readonly string[] | null): void
  hoverModel(id: string | null): void
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
  /** Advances to the next battlefield texture (HUD button); persisted. */
  cycleBattlefield(): void
  focusCamera(pos: Vec2): void
  /** Sets the formation picker's shape/facing for the decision that just became pending — `auto`
   *  true means "keep re-deriving facing from travel direction until the player rotates manually"
   *  (see `formationFacingAuto` above). Called once per decision (DecisionPrompt's pending-id
   *  effect), seeded from `recallFormation` when the unit has a remembered shape. */
  primeFormation(kind: FormationKind, facing: number, auto: boolean): void
  setFormationKind(kind: FormationKind): void
  /** Used both by the rotate/flip controls (explicit, `auto: false`) and by boardClick.ts's
   *  direction-of-travel default while `formationFacingAuto` is still true (kept true). */
  setFormationFacing(facing: number, auto: boolean): void
  rotateFormation(deltaRad: number): void
  flipFormation(): void
  rememberFormation(unitId: string, kind: FormationKind, facing: number): void
  recallFormation(unitId: string): FormationMemoryEntry | undefined
  startNudge(n: NudgeState): void
  clearNudge(): void
  /** Clears everything scoped to one decision — call whenever `pending.id` changes. */
  resetForDecision(): void
  /** Clears all interaction state — call when a new game starts. */
  resetAll(): void
}

export const useUiStore = create<UiState>((set, get) => ({
  battlefieldIndex: FORCED_BATTLEFIELD ?? storedBattlefield(),
  selectedUnitId: null,
  hoveredUnitId: null,
  hoveredUnitIds: [],
  hoveredModelId: null,
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
  formationKind: 'line',
  formationFacing: 0,
  formationFacingAuto: true,
  formationMemory: {},
  nudge: null,
  selectUnit: (id) => set({ selectedUnitId: id }),
  hoverUnit: (ids) => {
    const list = ids === null ? [] : typeof ids === 'string' ? [ids] : [...ids]
    set({ hoveredUnitId: list[0] ?? null, hoveredUnitIds: list })
  },
  hoverModel: (id) => set({ hoveredModelId: id }),
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
  cycleBattlefield: () =>
    set((s) => {
      const i = (s.battlefieldIndex + 1) % BATTLEFIELD_COUNT
      saveBattlefield(i)
      return { battlefieldIndex: i }
    }),
  focusCamera: (pos) => set({ focusTarget: { x: pos.x, z: pos.z } }),
  primeFormation: (kind, facing, auto) => set({ formationKind: kind, formationFacing: facing, formationFacingAuto: auto }),
  setFormationKind: (kind) => set({ formationKind: kind }),
  setFormationFacing: (facing, auto) => set({ formationFacing: facing, formationFacingAuto: auto }),
  rotateFormation: (deltaRad) => set((s) => ({ formationFacing: s.formationFacing + deltaRad, formationFacingAuto: false })),
  flipFormation: () => set((s) => ({ formationFacing: s.formationFacing + Math.PI, formationFacingAuto: false })),
  rememberFormation: (unitId, kind, facing) => set((s) => ({ formationMemory: { ...s.formationMemory, [unitId]: { kind, facing } } })),
  recallFormation: (unitId) => get().formationMemory[unitId],
  startNudge: (n) => set({ nudge: n }),
  clearNudge: () => set({ nudge: null }),
  resetForDecision: () =>
    set({ deployTargetUnitId: null, draft: null, previewDraft: null, hoveredUnitId: null, hoveredUnitIds: [], hoveredModelId: null, hoveredObjectiveId: null, nudge: null }),
  resetAll: () => {
    // New game: rotate to the next battlefield unless ?board= forces one.
    let battlefieldIndex = get().battlefieldIndex
    if (FORCED_BATTLEFIELD === null) {
      battlefieldIndex = (battlefieldIndex + 1) % BATTLEFIELD_COUNT
      saveBattlefield(battlefieldIndex)
    }
    set({
      battlefieldIndex,
      selectedUnitId: null,
      hoveredUnitId: null,
      hoveredUnitIds: [],
      hoveredModelId: null,
      hoveredObjectiveId: null,
      deployTargetUnitId: null,
      draft: null,
      previewDraft: null,
      measureOn: false,
      measureAnchor: null,
      measureLine: null,
      losOn: false,
      focusTarget: null,
      formationKind: 'line',
      formationFacing: 0,
      formationFacingAuto: true,
      formationMemory: {},
      nudge: null,
    })
  },
}))
