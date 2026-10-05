// Selected-unit inspector (docs/spec/50-client.md §5 "Unit card"). Selection comes from
// src/client/interaction/UnitsLayer.tsx clicking a Figure; this file only reads state.
import { useEffect, type CSSProperties } from 'react'
import { modelStats } from '@/engine'
import type { GameState, Model, RuntimeWeapon } from '@/engine'
import { useDisplayState } from '../presentation/presentedStore'
import { useUiStore } from './uiStore'
import { prettifyId } from './labels'
import { TipItem, tipMuted, tipTitle } from './UnitCardTooltip'
import { WeaponIcon, weaponIconKind } from './weaponIcons'
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
      if (existing) existing.count++
      else rows.push({ key, name: nameOf(m), count: 1, wounds: m.woundsRemaining, max })
    } else {
      const suffix = (sameKind.get(m.datasheetModelId) ?? 0) > 1 ? ` #${idx}` : ''
      rows.push({ key: m.id, name: `${nameOf(m)}${suffix}`, count: 1, wounds: m.woundsRemaining, max })
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

function WoundRows({ rows }: { rows: WoundRow[] }) {
  return (
    <div style={woundsBox}>
      {rows.map((r) => {
        const fraction = r.max > 0 ? r.wounds / r.max : 1
        const damaged = r.wounds < r.max
        return (
          <div
            key={r.key}
            data-testid="unit-card-wound-row"
            style={{ ...woundRowStyle, background: damaged ? 'rgba(255,106,95,0.14)' : 'transparent' }}
          >
            <span
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: damaged ? colors.text : colors.muted }}
            >
              {r.count > 1 ? `${r.count}× ` : ''}
              {r.name}
            </span>
            <span style={barTrack} aria-hidden="true">
              <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: barColor(fraction) }} />
            </span>
            <span style={{ width: 28, textAlign: 'right', fontWeight: 600, color: damaged ? barColor(fraction) : colors.text }}>
              {r.wounds}/{r.max}
            </span>
          </div>
        )
      })}
    </div>
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

/** Plain-English line for one weapon keyword, in our own words. */
function abilityLine(a: RuntimeWeapon['abilities'][number]): { name: string; text: string } {
  const v = a.value
  switch (a.ability) {
    case 'ASSAULT': return { name: 'Assault', text: 'May still be fired after the unit Advances.' }
    case 'HEAVY': return { name: 'Heavy', text: 'Gets +1 to hit if the unit did not move this turn.' }
    case 'RAPID_FIRE': return { name: `Rapid Fire ${v ?? ''}`.trim(), text: `Adds ${v ?? 'extra'} attack(s) per model when the target is within half range.` }
    case 'TORRENT': return { name: 'Torrent', text: 'A spray of fire: every attack hits automatically.' }
    case 'BLAST': return { name: 'Blast', text: 'Gains an extra attack for every five models in the target unit; cannot be aimed at a unit locked in combat with your own.' }
    case 'SUSTAINED_HITS': return { name: `Sustained Hits ${v ?? ''}`.trim(), text: `Each critical hit scores ${v ?? 'extra'} additional hit(s).` }
    case 'LETHAL_HITS': return { name: 'Lethal Hits', text: 'Each critical hit wounds automatically, skipping the wound roll.' }
    case 'DEVASTATING_WOUNDS': return { name: 'Devastating Wounds', text: 'Each critical wound deals its damage straight through: no armour or invulnerable save is allowed.' }
    case 'ANTI': return { name: `Anti-${a.keyword ?? '?'} ${v ?? ''}+`.trim(), text: `Against ${a.keyword ?? 'the named'} targets, a wound roll of ${v ?? 'the listed number'}+ is a critical wound.` }
    case 'TWIN_LINKED': return { name: 'Twin-linked', text: 'Two barrels working together: wound rolls may be re-rolled.' }
    case 'LANCE': return { name: 'Lance', text: 'Gets +1 to wound if the bearer charged this turn.' }
    case 'MELTA': return { name: `Melta ${v ?? ''}`.trim(), text: `Within half range, each unsaved wound does ${v ?? 'extra'} more damage.` }
    case 'IGNORES_COVER': return { name: 'Ignores Cover', text: 'The target gets no armour bonus from cover.' }
    case 'INDIRECT_FIRE': return { name: 'Indirect Fire', text: 'Can be fired at targets that are out of sight, with a penalty to hit.' }
    case 'PISTOL': return { name: 'Pistol', text: 'May be fired even when the unit is in engagement range, but only at an enemy it is locked with.' }
    case 'HAZARDOUS': return { name: 'Hazardous', text: 'Risky to use: after firing, the bearer may be hurt by its own weapon.' }
    case 'PRECISION': return { name: 'Precision', text: 'Successful hits may be allocated to a Character leading the target unit.' }
    case 'EXTRA_ATTACKS': return { name: 'Extra Attacks', text: "Used in addition to the model's other melee weapon rather than instead of it." }
    case 'ONE_SHOT': return { name: 'One Shot', text: 'Can only be used once per battle.' }
    case 'PSYCHIC': return { name: 'Psychic', text: 'A psychic attack; rules that affect psychic powers apply to it.' }
    default: return { name: prettifyId(a.ref ?? a.ability), text: 'A special rule specific to this weapon.' }
  }
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
  // Distinct Toughness values across the unit (a led unit can mix a leader's profile with its bodyguard's).
  const toughness = Array.from(
    new Set(
      models.flatMap((m) => {
        try {
          return [modelStats(state, m).T]
        } catch {
          return []
        }
      }),
    ),
  ).sort((a, b) => a - b)

  return (
    <div style={wrap} data-testid="unit-card">
      <button style={closeButton} data-testid="unit-card-close" aria-label="Close" onClick={() => selectUnit(null)}>
        ✕
      </button>
      <div style={{ color, fontWeight: 700 }}>{unit.name}</div>
      <div style={mutedText}>{state.players[unit.player].name}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>
        {models.length}/{unit.startingStrength} models
      </div>
      {toughness.length > 0 && (
        <div style={{ fontSize: 13 }} data-testid="unit-card-toughness">
          Toughness {toughness.join(' / ')}
        </div>
      )}
      <div data-testid="unit-card-wounds">
        <WoundRows rows={rows} />
      </div>
      {unit.battleShocked && <div style={warn}>Battle-shocked — its objective control counts as 0</div>}

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
