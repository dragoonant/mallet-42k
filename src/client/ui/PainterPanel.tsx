// Army painter panel: pick a major + minor colour and a base style per army, with a live preview
// figure. Client-only (src/client/figures/paint.ts persists to localStorage); the engine never sees
// any of it. Opened from the Hud's brush button in-game, or "Paint army" on the start screen.
import { useState, type CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { BASE_PRESETS, canonFaction, usePaintStore } from '../figures/paint'
import { Figure } from '../figures/Figure'
import { useDataBundle } from '../figures/data'
import { buttonActive, buttonBase, colors, fontStack, mutedText, panel } from './theme'

export interface PainterFaction {
  id: string
  label: string
}

/** One representative model per army for the preview (datasheet id + model type). */
const PREVIEW: Record<string, { datasheetId: string; modelId?: string }> = {
  sm: { datasheetId: 'sm.terminator-squad', modelId: 'sergeant' },
  ork: { datasheetId: 'ork.boyz', modelId: 'boss-nob' },
  necrons: { datasheetId: 'nec.necron-warriors' },
  'chaos-space-marines': { datasheetId: 'csm.legionaries', modelId: 'champion' },
  tyranids: { datasheetId: 'tyr.termagants', modelId: 'termagant' },
  'adepta-sororitas': { datasheetId: 'ade.battle-sisters-squad', modelId: 'superior' },
  'astra-militarum': { datasheetId: 'am.cadian-shock-troops', modelId: 'sergeant' },
  'grey-knights': { datasheetId: 'gk.strike-squad' },
  'tau-empire': { datasheetId: 'tau.strike-team', modelId: 'fire-warrior-rifle' },
  'genestealer-cults': { datasheetId: 'gsc.acolyte-hybrids', modelId: 'hybrid' },
  'adeptus-custodes': { datasheetId: 'cus.custodian-guard', modelId: 'blade' },
}

const backdrop: CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', zIndex: 60 }
const card: CSSProperties = { ...panel, width: 520, maxWidth: '94vw', padding: 16, display: 'flex', gap: 16, fontSize: 13 }
const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
const title: CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: colors.muted }
const colourInput: CSSProperties = { width: 56, height: 28, padding: 0, border: `1px solid ${colors.border}`, borderRadius: 6, background: 'none', cursor: 'pointer' }
const selectStyle: CSSProperties = { ...buttonBase, width: '100%', cursor: 'pointer', background: colors.bgSolid }

export function PainterPanel({ factions, initialFaction, onClose }: { factions: PainterFaction[]; initialFaction?: string; onClose: () => void }) {
  const [factionId, setFactionId] = useState(canonFaction(initialFaction ?? factions[0]?.id ?? 'sm'))
  const paint = usePaintStore((s) => s.byFaction[factionId])
  const setPaint = usePaintStore((s) => s.setPaint)
  const reset = usePaintStore((s) => s.reset)
  const bundle = useDataBundle()
  const scheme = bundle?.factions[factionId]?.paintScheme
  const preview = PREVIEW[factionId] ?? PREVIEW.sm
  const painted = !!paint && Object.values(paint).some(Boolean)

  return (
    <div style={backdrop} data-testid="painter-panel" onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={col}>
          <div style={{ ...rowStyle, alignItems: 'baseline' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Paint army</div>
            <button style={buttonBase} onClick={onClose} data-testid="painter-close">
              Close
            </button>
          </div>
          {factions.length > 1 && (
            <select style={selectStyle} value={factionId} onChange={(e) => setFactionId(e.target.value)} data-testid="painter-faction">
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {bundle?.factions[f.id]?.name ?? f.label}
                </option>
              ))}
            </select>
          )}
          <div style={title}>Colours</div>
          <label style={rowStyle}>
            <span>Major (armour)</span>
            <input type="color" style={colourInput} value={paint?.major ?? scheme?.primary ?? '#808080'} onChange={(e) => setPaint(factionId, { major: e.target.value })} data-testid="painter-major" />
          </label>
          <label style={rowStyle}>
            <span>Minor (accents)</span>
            <input type="color" style={colourInput} value={paint?.minor ?? scheme?.secondary ?? '#808080'} onChange={(e) => setPaint(factionId, { minor: e.target.value })} data-testid="painter-minor" />
          </label>
          <div style={mutedText}>Until you pick a colour the army keeps its stock look. Greys, metals and skin are left alone.</div>
          <div style={title}>Base</div>
          <select style={selectStyle} value={paint?.base ?? ''} onChange={(e) => setPaint(factionId, { base: e.target.value || undefined })} data-testid="painter-base">
            <option value="">Stock</option>
            {BASE_PRESETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <label style={rowStyle}>
            <span>Rim colour</span>
            <input type="color" style={colourInput} value={paint?.rim ?? BASE_PRESETS.find((b) => b.id === paint?.base)?.rim ?? '#050505'} onChange={(e) => setPaint(factionId, { rim: e.target.value })} data-testid="painter-rim" />
          </label>
          <button style={painted ? buttonActive : buttonBase} disabled={!painted} onClick={() => reset(factionId)} data-testid="painter-reset">
            Reset to stock
          </button>
        </div>
        <div style={{ width: 190, height: 260, borderRadius: 8, overflow: 'hidden', background: '#0a0a10', flex: 'none', fontFamily: fontStack }}>
          <Canvas camera={{ position: [0, 1.4, 7], fov: 38 }}>
            <hemisphereLight intensity={1.0} groundColor="#2a2a34" />
            <directionalLight position={[6, 8, 4]} intensity={1.2} />
            <directionalLight position={[-6, 5, -3]} intensity={0.4} />
            <group scale={[1.5, 1.5, 1.5]} position={[0, -1.1, 0]}>
              <Figure datasheetId={preview.datasheetId} modelId={preview.modelId} faction={factionId} pose="idle" rotationY={Math.PI / 2 - 0.5} />
            </group>
          </Canvas>
        </div>
      </div>
    </div>
  )
}
