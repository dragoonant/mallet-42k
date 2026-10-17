// Selected-unit inspector (docs/spec/50-client.md §5 "Unit card"). Selection comes from
// src/client/interaction/UnitsLayer.tsx clicking a Figure; this file only reads state.
import { judgementCount, judgementLine } from './judgement'
import { useEffect, useState, type CSSProperties } from 'react'
import { modelStats } from '@/engine'
import type { GameState, Model, RuntimeWeapon } from '@/engine'
import { transportService } from '@/engine/transports'
import { groupLabel, groupUnitIds } from '../interaction/embarkGroup'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore } from './uiStore'
import { prettifyId } from './labels'
import { anchorBesideCard, FullScreenSheet, TipItem, TipPopup, tipMuted, tipTitle, useTipTrigger, type Anchor } from './UnitCardTooltip'
import { useFormFactor } from './formFactor'
import { DATASHEET_WIDTH, UnitDatasheet } from './UnitDatasheet'
import { WeaponIcon, weaponIconKind } from './weaponIcons'
import { abilityLine } from './weaponRules'
import { colors, mutedText, panel } from './theme'

const wrap: CSSProperties = { ...panel, position: 'absolute', left: 12, top: 70, width: 220, padding: 14, pointerEvents: 'auto' }
const closeButton: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 8,
  background: 'transparent',
  border: 'none',
  color: colors.muted,
  fontSize: 15,
  cursor: 'pointer',
  padding: 4,
  lineHeight: 1,
}
// Compact (phone) layout: the card is a 44px chip under the top bar that opens into the full card as an overlay.
const chipPos: CSSProperties = {
  position: 'absolute',
  left: 'calc(var(--safe-left, 0px) + 8px)',
  top: 'calc(var(--safe-top, 0px) + 48px)',
  pointerEvents: 'auto',
  zIndex: 40,
  boxSizing: 'border-box',
}
const chipWrap: CSSProperties = { ...panel, ...chipPos, display: 'flex', alignItems: 'stretch', width: 'min(280px, calc(100vw - var(--safe-left, 0px) - var(--safe-right, 0px) - 16px))', height: 44, padding: 0, overflow: 'hidden' }
const chipMain: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 10px',
  background: 'transparent',
  border: 'none',
  color: colors.text,
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
  touchAction: 'manipulation',
}
const chipClose: CSSProperties = { flex: '0 0 44px', width: 44, background: 'transparent', border: 'none', borderLeft: `1px solid ${colors.border}`, color: colors.muted, fontSize: 16, cursor: 'pointer', touchAction: 'manipulation' }
const compactWrap: CSSProperties = {
  ...panel,
  ...chipPos,
  width: 'min(300px, calc(100vw - var(--safe-left, 0px) - var(--safe-right, 0px) - 16px))',
  maxHeight: '60dvh',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  touchAction: 'pan-y',
  padding: '8px 12px 12px',
  zIndex: 41,
}
const compactBtn: CSSProperties = { ...closeButton, top: 0, minWidth: 44, minHeight: 44, fontSize: 18, position: 'absolute' }
const sectionTitle: CSSProperties = { ...mutedText, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 2 }
const list: CSSProperties = { margin: 0, paddingLeft: 16, fontSize: 12.5 }
const warn: CSSProperties = { color: '#ffb84f', fontSize: 12, fontWeight: 600, marginTop: 4 }

// ---------- wounds breakdown ----------

interface WoundRow {
  key: string
  name: string
  count: number
  wounds: number
  max: number
  /** The models this row stands for — they glow on the board while the row is hovered. */
  modelIds: string[]
}

/** Max wounds for one model: the engine's resolved profile (datasheet + overrides), falling back to the
 *  datasheet model's own W if the profile can't be resolved. */
function maxWoundsOf(state: GameState, model: Model): number {
  try {
    return modelStats(state, model).W
  } catch {
    const unit = state.units[model.unitId]
    const profile = unit ? state.datasheets[unit.datasheetId]?.models.find((p) => p.modelId === model.datasheetModelId) : undefined
    return profile?.stats.W ?? Math.max(1, model.woundsRemaining)
  }
}

/** One row per alive model, except that undamaged models of the same kind collapse into "8× Boy 1/1" so a
 *  ten-model mob stays a couple of lines. Damaged models are always listed alone, and numbered when the
 *  unit has several of that kind so you can tell which is which. */
function woundRows(state: GameState, models: Model[], datasheetId: string): WoundRow[] {
  const datasheet = state.datasheets[datasheetId]
  const nameOf = (m: Model) => datasheet?.models.find((p) => p.modelId === m.datasheetModelId)?.name ?? prettifyId(m.datasheetModelId)
  const sameKind = new Map<string, number>()
  for (const m of models) sameKind.set(m.datasheetModelId, (sameKind.get(m.datasheetModelId) ?? 0) + 1)

  const rows: WoundRow[] = []
  const seen = new Map<string, number>()
  for (const m of models) {
    const max = maxWoundsOf(state, m)
    const idx = (seen.get(m.datasheetModelId) ?? 0) + 1
    seen.set(m.datasheetModelId, idx)
    if (m.woundsRemaining >= max) {
      const key = `${m.datasheetModelId}|full|${max}`
      const existing = rows.find((r) => r.key === key)
      if (existing) {
        existing.count++
        existing.modelIds.push(m.id)
      } else rows.push({ key, name: nameOf(m), count: 1, wounds: m.woundsRemaining, max, modelIds: [m.id] })
    } else {
      const suffix = (sameKind.get(m.datasheetModelId) ?? 0) > 1 ? ` #${idx}` : ''
      rows.push({ key: m.id, name: `${nameOf(m)}${suffix}`, count: 1, wounds: m.woundsRemaining, max, modelIds: [m.id] })
    }
  }
  return rows
}

const woundsBox: CSSProperties = { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }
const woundRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '1px 4px', borderRadius: 4 }
const barTrack: CSSProperties = { width: 38, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.14)', overflow: 'hidden', flexShrink: 0 }

function barColor(fraction: number): string {
  if (fraction >= 1) return '#5fd08a'
  return fraction > 0.5 ? '#e8c85a' : '#ff6a5f'
}

/** Hover state for a datasheet popup: which models it covers and where it sits. */
interface SheetHover {
  key: string
  modelIds: string[]
  anchor: Anchor
}

function DatasheetPopup({ state, unitId, hover, onClose }: { state: GameState; unitId: string; hover: SheetHover | null; onClose: () => void }) {
  const { compact } = useFormFactor()
  if (!hover) return null
  // Phones: the datasheet is a full-screen, scrollable sheet with its own close button.
  if (compact) {
    return (
      <FullScreenSheet onClose={onClose}>
        <UnitDatasheet state={state} unitId={unitId} modelIds={hover.modelIds} />
      </FullScreenSheet>
    )
  }
  return (
    <TipPopup anchor={hover.anchor} width={DATASHEET_WIDTH} testId="unit-datasheet-popup">
      <UnitDatasheet state={state} unitId={unitId} modelIds={hover.modelIds} />
    </TipPopup>
  )
}

function WoundRowItem({ state, unitId, r }: { state: GameState; unitId: string; r: WoundRow }) {
  const glowModels = useUiStore((s) => s.glowModels)
  const [sheet, setSheet] = useState<SheetHover | null>(null)
  const closeSheet = () => {
    glowModels([])
    setSheet(null)
  }
  const trigger = useTipTrigger(
    sheet !== null,
    (el) => {
      glowModels(r.modelIds)
      setSheet({ key: r.key, modelIds: r.modelIds, anchor: anchorBesideCard(el) })
    },
    closeSheet,
  )
  const { compact } = useFormFactor()
  const fraction = r.max > 0 ? r.wounds / r.max : 1
  const damaged = r.wounds < r.max
  return (
    <div
      data-testid="unit-card-wound-row"
      {...trigger}
      style={{
        ...woundRowStyle,
        ...(compact ? { minHeight: 44, padding: '4px 4px' } : null),
        cursor: 'help',
        background: sheet ? 'rgba(255,255,255,0.1)' : damaged ? 'rgba(255,106,95,0.14)' : 'transparent',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: damaged ? colors.text : colors.muted }}>
        {r.count > 1 ? `${r.count}× ` : ''}
        {r.name}
      </span>
      <span style={barTrack} aria-hidden="true">
        <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: barColor(fraction) }} />
      </span>
      <span style={{ width: 28, textAlign: 'right', fontWeight: 600, color: damaged ? barColor(fraction) : colors.text }}>
        {r.wounds}/{r.max}
      </span>
      <DatasheetPopup state={state} unitId={unitId} hover={sheet} onClose={closeSheet} />
    </div>
  )
}

function WoundRows({ state, unitId, rows }: { state: GameState; unitId: string; rows: WoundRow[] }) {
  return (
    <div style={woundsBox}>
      {rows.map((r) => (
        <WoundRowItem key={r.key} state={state} unitId={unitId} r={r} />
      ))}
    </div>
  )
}

function UnitNameLabel({ state, unit, color }: { state: GameState; unit: { id: string; name: string; models: string[] }; color: string }) {
  const glowModels = useUiStore((s) => s.glowModels)
  const [sheet, setSheet] = useState<SheetHover | null>(null)
  // Never leave figures glowing once the card closes.
  useEffect(() => () => glowModels([]), [glowModels])
  const closeSheet = () => {
    glowModels([])
    setSheet(null)
  }
  const trigger = useTipTrigger(
    sheet !== null,
    (el) => {
      glowModels(unit.models)
      setSheet({ key: 'unit', modelIds: unit.models, anchor: anchorBesideCard(el) })
    },
    closeSheet,
  )
  const { compact } = useFormFactor()
  return (
    <>
      <div
        style={{ color, fontWeight: 700, cursor: 'help', paddingRight: compact ? 96 : 18, ...(compact ? { minHeight: 44, display: 'flex', alignItems: 'center' } : null) }}
        data-testid="unit-card-name"
        {...trigger}
      >
        {unit.name}
      </div>
      <DatasheetPopup state={state} unitId={unit.id} hover={sheet} onClose={closeSheet} />
    </>
  )
}

// ---------- weapon and ability tooltips ----------

const iconBox: CSSProperties = {
  width: 56,
  height: 56,
  flexShrink: 0,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${colors.border}`,
}
const statGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 1 }

function apText(ap: number): string {
  if (ap === 0) return '0 (target keeps its full armour save)'
  return ap < 0 ? `${ap} (armour save worsened by ${-ap})` : `+${ap}`
}

function statRows(w: RuntimeWeapon): [string, string][] {
  const melee = w.kind === 'melee'
  const hits = typeof w.skill === 'number' ? `hits on ${w.skill}+` : 'always hits (no roll)'
  return [
    ['Range', melee ? 'Melee (fights in engagement range)' : `${w.range}"`],
    ['Attacks', `${w.A} per model`],
    [melee ? 'Weapon Skill' : 'Ballistic Skill', hits],
    ['Strength', `${w.S}`],
    ['Armour Penetration', apText(w.AP)],
    ['Damage', `${w.D} per unsaved wound`],
  ]
}

function WeaponTip({ state, wid }: { state: GameState; wid: string }) {
  const w = state.weapons[wid]
  if (!w) return <div style={tipTitle}>{wid}</div>
  // Weapons that share a profileGroup (e.g. a psychic power's normal and focused forms) are one choice
  // with several profiles; show them all, the hovered one first.
  const profiles = [w, ...(w.profileGroup ? Object.values(state.weapons).filter((o) => o.id !== w.id && o.profileGroup === w.profileGroup) : [])]
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <div style={iconBox}>
          <WeaponIcon kind={weaponIconKind(w)} size={56} color={colors.accent} />
        </div>
        <div>
          <div style={tipTitle}>{w.name}</div>
          <div style={tipMuted}>{w.kind === 'melee' ? 'Melee weapon' : 'Ranged weapon'}</div>
        </div>
      </div>
      {profiles.map((p, i) => (
        <div key={p.id} style={{ marginTop: i === 0 ? 0 : 8, paddingTop: i === 0 ? 0 : 6, borderTop: i === 0 ? 'none' : `1px solid ${colors.border}` }}>
          {profiles.length > 1 && <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.name}</div>}
          <div style={statGrid}>
            {statRows(p).map(([label, value]) => (
              <div key={label} style={{ display: 'contents' }}>
                <span style={tipMuted}>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
          {p.abilities.length > 0 ? (
            <div style={{ marginTop: 5 }}>
              {p.abilities.map((a, j) => {
                const line = abilityLine(a)
                return (
                  <div key={j} style={{ marginTop: 3 }}>
                    <span style={{ fontWeight: 600, color: colors.accent }}>{line.name}</span>
                    <span style={tipMuted}> — {line.text}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ ...tipMuted, marginTop: 5 }}>No special weapon rules.</div>
          )}
        </div>
      ))}
    </div>
  )
}

function AbilityTip({ state, aid }: { state: GameState; aid: string }) {
  const a = state.abilities[aid]
  return (
    <div>
      <div style={tipTitle}>{a?.name ?? prettifyId(aid)}</div>
      <div style={{ ...tipMuted, marginTop: 3 }}>{a?.text?.trim() || 'A special rule of this unit.'}</div>
    </div>
  )
}

export function UnitCard() {
  const state = useDisplayState()
  const selectedUnitId = useUiStore((s) => s.selectedUnitId)
  const selectUnit = useUiStore((s) => s.selectUnit)
  const phase = state?.phase
  const { touch, compact } = useFormFactor()
  const [expanded, setExpanded] = useState(false)
  // Each newly selected unit starts as a chip again.
  useEffect(() => setExpanded(false), [selectedUnitId])

  // A card left open from a previous phase (e.g. selected mid-deployment) stayed put forever with no
  // way to dismiss it — clear the selection whenever the phase moves on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => selectUnit(null), [phase])

  if (!state || !selectedUnitId) return null
  const unit = state.units[selectedUnitId]
  if (!unit) return null

  const datasheet = state.datasheets[unit.datasheetId]
  const models = unit.models.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
  const rows = woundRows(state, models, unit.datasheetId)
  const weaponIds = Array.from(new Set(models.flatMap((m) => m.weapons)))
  const color = unit.player === 'A' ? colors.playerA : colors.playerB
  // Distinct Move / Toughness values across the unit (a led unit can mix a leader's profile with its bodyguard's).
  const distinctStat = (key: 'M' | 'T') =>
    Array.from(
      new Set(
        models.flatMap((m) => {
          try {
            return [modelStats(state, m)[key]]
          } catch {
            return []
          }
        }),
      ),
    ).sort((a, b) => a - b)
  const move = distinctStat('M')
  const toughness = distinctStat('T')

  if (compact && !expanded) {
    // Status dot: red = battle-shocked, amber = has taken damage, green = healthy.
    const woundsNow = rows.reduce((n, r) => n + r.count * r.wounds, 0)
    const woundsMax = rows.reduce((n, r) => n + r.count * r.max, 0)
    const dot = unit.battleShocked ? '#ff6a5f' : woundsNow < woundsMax ? '#e8c85a' : '#5fd08a'
    const status = unit.battleShocked ? 'battle-shocked' : woundsNow < woundsMax ? 'damaged' : 'healthy'
    return (
      <div style={chipWrap} data-testid="unit-card" data-compact="chip">
        <button type="button" style={chipMain} data-testid="unit-card-chip" aria-expanded={false} aria-label={`${unit.name}, ${models.length} of ${unit.startingStrength} models, ${status}. Open unit card`} onClick={() => setExpanded(true)}>
          <span data-testid="unit-card-status" data-status={status} style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flex: '0 0 auto', boxShadow: `0 0 6px ${dot}` }} aria-hidden="true" />
          <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color }}>{unit.name}</span>
          <span style={{ flex: '0 0 auto', ...mutedText, whiteSpace: 'nowrap' }}>
            {models.length}/{unit.startingStrength} · {woundsNow}/{woundsMax}W
          </span>
        </button>
        <button type="button" style={chipClose} data-testid="unit-card-close" aria-label="Close" onClick={() => selectUnit(null)}>
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={compact ? compactWrap : wrap} data-testid="unit-card" data-compact={compact ? 'open' : undefined}>
      {/* Phones: the card scrolls, so its collapse / close buttons ride in a zero-height sticky row. */}
      <div style={compact ? { position: 'sticky', top: 0, height: 0, zIndex: 3 } : undefined}>
        {compact && (
          <button style={{ ...compactBtn, top: -8, right: 32 }} data-testid="unit-card-collapse" aria-label="Collapse unit card" onClick={() => setExpanded(false)}>
            ▴
          </button>
        )}
        <button
          style={compact ? { ...compactBtn, top: -8, right: -12 } : touch ? { ...closeButton, top: 0, right: 0, minWidth: 44, minHeight: 44, fontSize: 18 } : closeButton}
          data-testid="unit-card-close"
          aria-label="Close"
          onClick={() => selectUnit(null)}
        >
          ✕
        </button>
      </div>
      <UnitNameLabel state={state} unit={unit} color={color} />
      <div style={mutedText}>{state.players[unit.player].name}</div>
      {(() => {
        const aboard = transportService.embarkedIn(state, unit.id)
        const host = transportService.transportOf(state, unit.id)
        if (aboard.length > 0) {
          // an attached Leader + bodyguard ride as one passenger: list the pair once
          const seen = new Set<string>()
          const rows = aboard.flatMap((id) => {
            if (seen.has(id)) return []
            const group = groupUnitIds(state, id)
            group.forEach((g) => seen.add(g))
            return [`${groupLabel(state, id)} (${group.reduce((n, g) => n + (state.units[g]?.models.length ?? 0), 0)})`]
          })
          return <div style={{ fontSize: 13, marginTop: 4 }} data-testid="unit-card-embarked">Embarked: {rows.join(', ')}</div>
        }
        if (host) {
          const group = groupUnitIds(state, unit.id)
          return <div style={{ fontSize: 13, marginTop: 4 }} data-testid="unit-card-embarked-in">Embarked in {state.units[host]?.name ?? host}{group.length > 1 ? ` (with ${state.units[group.find((g) => g !== unit.id) ?? '']?.name ?? 'its Leader'})` : ''}</div>
        }
        return null
      })()}
      <div style={{ fontSize: 13, marginTop: 6 }}>
        {models.length}/{unit.startingStrength} models
      </div>
      {move.length > 0 && (
        <div style={{ fontSize: 13 }} data-testid="unit-card-move">
          Move {move.map((m) => `${m}"`).join(' / ')}
        </div>
      )}
      {toughness.length > 0 && (
        <div style={{ fontSize: 13 }} data-testid="unit-card-toughness">
          Toughness {toughness.join(' / ')}
        </div>
      )}
      <div data-testid="unit-card-wounds">
        <WoundRows state={state} unitId={unit.id} rows={rows} />
      </div>
      {unit.battleShocked && <div style={warn}>Battle-shocked — its objective control counts as 0</div>}
      {(() => {
        const line = judgementLine(judgementCount(state, unit.id))
        return line ? <div style={warn} data-testid="unit-card-judgement">{line}</div> : null
      })()}

      {weaponIds.length > 0 && (
        <>
          <div style={sectionTitle}>Weapons</div>
          <ul style={list}>
            {weaponIds.map((wid) => (
              <TipItem key={wid} testId={`unit-card-weapon-${wid}`} tip={<WeaponTip state={state} wid={wid} />}>
                {state.weapons[wid]?.name ?? wid}
                {state.weapons[wid] && <span style={mutedText}> · Strength {state.weapons[wid].S}</span>}
              </TipItem>
            ))}
          </ul>
        </>
      )}

      {datasheet && datasheet.abilities.length > 0 && (
        <>
          <div style={sectionTitle}>Abilities</div>
          <ul style={list}>
            {datasheet.abilities.map((aid) => (
              <TipItem key={aid} testId={`unit-card-ability-${aid}`} tip={<AbilityTip state={state} aid={aid} />}>
                {state.abilities[aid]?.name ?? aid}
              </TipItem>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
