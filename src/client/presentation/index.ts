// Event-to-presentation director (docs: see director.ts's top-of-file comment). Public surface for
// the rest of src/client: mount <PresentationDirector/> once (App.tsx), read cues from useCueStore
// (src/client/interaction/UnitsLayer.tsx), and read/write animation-speed + dice/ambient toggles
// from usePresentationSettings (src/client/ui/SettingsPanel.tsx).
export { PresentationDirector } from './PresentationDirector'
export { startDirector } from './director'
export { useCueStore } from './cueStore'
export type { CueKind } from './cueStore'
export { usePresentationSettings } from './settings'
export type { AnimSpeed, PresentationSettings } from './settings'
export { isPresentationIdle, waitForPresentationIdle } from './idleStore'
