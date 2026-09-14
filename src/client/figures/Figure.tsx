// Public entry point: one datasheet's SD figure, procedurally built and posed. Rendering-only —
// the engine never imports this and never sees anything drawn here, only the Model.base/height
// numbers this reads from src/data (docs/spec/30-figures.md, top of file).
import { useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { resolveBase, resolveFigureKit, resolvePaintColors, useDataBundle } from './data'
import { BODY_KIND, BIPED_CONFIG, VEHICLE_CONFIG } from './kitConfigs'
import { BaseDisc, BASE_THICKNESS } from './BaseDisc'
import { BipedBody } from './BipedBody'
import { VehicleBody } from './VehicleBody'
import type { Pose } from './types'

export interface FigureProps {
  /** Datasheet id from the data bundle, e.g. "sm.terminator-squad". Unknown ids still render —
   *  see resolveFigureKit's fallback. */
  datasheetId: string
  /** Faction id, e.g. "sm" | "ork" — resolves the paintScheme. Unknown ids paint neutral grey. */
  faction: string
  pose?: Pose
  selected?: boolean
  highlighted?: boolean
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  position?: readonly [number, number, number]
  rotationY?: number
}

export function Figure({
  datasheetId,
  faction,
  pose = 'idle',
  selected,
  highlighted,
  onClick,
  position = [0, 0, 0],
  rotationY = 0,
}: FigureProps) {
  const bundle = useDataBundle()
  const seedRef = useRef(Math.random() * 100)

  const datasheet = bundle?.datasheets[datasheetId]
  const factionData = bundle?.factions[faction]

  const { archetype, kit } = useMemo(() => resolveFigureKit(datasheetId, datasheet), [datasheetId, datasheet])
  const base = useMemo(() => resolveBase(datasheet, archetype), [datasheet, archetype])
  const colors = useMemo(() => resolvePaintColors(factionData), [factionData])

  const bodyKind = BODY_KIND[kit]

  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]} onClick={onClick}>
      <BaseDisc radiusX={base.radiusX} radiusZ={base.radiusZ} colors={colors} selected={selected} highlighted={highlighted} />
      <group position={[0, BASE_THICKNESS, 0]} scale={[base.height, base.height, base.height]}>
        {bodyKind === 'vehicle' ? (
          <VehicleBody config={VEHICLE_CONFIG[kit] ?? { weapon: 'none', hasRotor: false }} colors={colors} pose={pose} seed={seedRef.current} />
        ) : (
          <BipedBody
            config={
              BIPED_CONFIG[kit] ?? {
                headShape: 'generic-head',
                rightWeapon: 'none',
                leftWeapon: 'none',
                bulk: 1,
                hasBackpack: false,
                shoulderPads: 'none',
                hasCape: false,
                skin: 'none',
              }
            }
            colors={colors}
            pose={pose}
            seed={seedRef.current}
          />
        )}
      </group>
    </group>
  )
}
