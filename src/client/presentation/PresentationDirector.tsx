// Mounts the presentation director for the lifetime of the game screen. Renders nothing — see
// director.ts for what actually happens once this is mounted.
import { useEffect } from 'react'
import { startDirector } from './director'

export function PresentationDirector() {
  useEffect(() => startDirector(), [])
  return null
}
