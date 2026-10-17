// Full datasheet view shown beside the unit card while a model row (or the unit's name) is hovered: the
// stat line of each model profile involved, the weapons those models actually carry as ranged/melee
// tables, the unit's abilities and its keywords. Read-only; everything comes from GameState.
import type { CSSProperties } from 'react'
import type { GameState, RuntimeWeapon } from '@/engine'
import type { CoreAbility } from '@/data/types'
import { prettifyId } from './labels'
import { abilityLine } from './weaponRules'
import { colors } from './theme'
import { useFormFactor } from './formFactor'

export const DATASHEET_WIDTH = 620

const header: CSSProperties = {
  margin: '-10px -12px 8px',
  padding: '10px 12px 8px',
  borderBottom: `2px solid ${colors.accent}`,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
  borderRadius: '8px 8px 0 0',
}
const titleText: CSSProperties = { fontSize: 17, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.text, lineHeight: 1.15 }
const subText: CSSProperties = { color: colors.muted, fontSize: 11.5, marginTop: 2 }
const heading: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.9,
  textTransform: 'uppercase',
  color: colors.accent,
  margin: '8px 0 3px',
}
const statCell: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 40 }
const statLabel: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: colors.muted }
const statValue: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 5,
  width: 38,
  textAlign: 'center',
  padding: '1px 0',
}
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed' }
// Same column widths for both tables so the ranged and melee stats line up.
const statCols = [44, 34, 30, 28, 30, 42]
const th: CSSProperties = { textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: colors.muted, padding: '3px 4px', textTransform: 'uppercase' }
const td: CSSProperties = { textAlign: 'center', padding: '3px 4px', borderTop: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }
const keywordsLine: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.text }

const plus = (n: number | null | undefined) => (typeof n === 'number' && n < 7 ? `${n}+` : '–')
const ap = (n: number) => (n === 0 ? '0' : n < 0 ? `${n}` : `+${n}`)

function coreAbilityName(c: CoreAbility): string {
  const base = prettifyId(c.ability.toLowerCase())
  if (c.value === undefined) return base
  return c.ability === 'FEEL_NO_PAIN' ? `${base} ${c.value}+` : `${base} ${c.value}`
}

function WeaponTable({ weapons, melee }: { weapons: RuntimeWeapon[]; melee: boolean }) {
  if (weapons.length === 0) return null
  return (
    <table style={table}>
      <colgroup>
        <col />
        {statCols.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: 'left', color: colors.accent, whiteSpace: 'nowrap' }}>{melee ? 'Melee weapons' : 'Ranged weapons'}</th>
          <th style={th}>Range</th>
          <th style={th}>A</th>
          <th style={th}>{melee ? 'WS' : 'BS'}</th>
          <th style={th}>S</th>
          <th style={th}>AP</th>
          <th style={th}>D</th>
        </tr>
      </thead>
      <tbody>
        {weapons.map((w) => (
          <tr key={w.id} data-testid={`datasheet-weapon-${w.id}`}>
            <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>
              <div style={{ fontWeight: 700 }}>{w.name}</div>
              {w.abilities.length > 0 && (
                <div style={{ color: colors.accent, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  [{w.abilities.map((a) => abilityLine(a).name).join(', ')}]
                </div>
              )}
            </td>
            <td style={td}>{melee ? 'Melee' : `${w.range}"`}</td>
            <td style={td}>{w.A}</td>
            <td style={td}>{typeof w.skill === 'number' ? plus(w.skill) : 'N/A'}</td>
            <td style={td}>{w.S}</td>
            <td style={td}>{ap(w.AP)}</td>
            <td style={td}>{w.D}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Datasheet for `unitId`, narrowed to the profiles and wargear of `modelIds` (pass every model for the whole unit). */
export function UnitDatasheet({ state, unitId, modelIds }: { state: GameState; unitId: string; modelIds: string[] }) {
  const { compact } = useFormFactor()
  const unit = state.units[unitId]
  const ds = unit ? state.datasheets[unit.datasheetId] : undefined
  if (!unit || !ds) return <div style={titleText}>{unit?.name ?? prettifyId(unitId)}</div>

  const models = modelIds.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
  const profileIds = Array.from(new Set(models.map((m) => m.datasheetModelId)))
  const profiles = ds.models.filter((p) => profileIds.includes(p.modelId))
  const weapons = Array.from(new Set(models.flatMap((m) => m.weapons)))
    .map((id) => state.weapons[id])
    .filter((w): w is RuntimeWeapon => !!w)
  const ranged = weapons.filter((w) => w.kind !== 'melee')
  const melee = weapons.filter((w) => w.kind === 'melee')
  const title = profiles.length === 1 ? profiles[0].name : ds.name
  // Profiles with identical stats share one stat line, labelled with all their names.
  const statLines: { key: string; names: string[]; stats: (typeof profiles)[number]['stats'] }[] = []
  for (const p of profiles) {
    const key = JSON.stringify(p.stats)
    const line = statLines.find((l) => l.key === key)
    if (line) line.names.push(p.name)
    else statLines.push({ key, names: [p.name], stats: p.stats })
  }

  // Model count per profile across the whole unit, e.g. "1 Karsk, 3 Cadian Veteran Guardsman".
  const allModels = unit.models.map((id) => state.models[id]).filter((m): m is NonNullable<typeof m> => !!m)
  const composition = ds.models
    .map((p) => ({ p, n: allModels.filter((m) => m.datasheetModelId === p.modelId).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${c.p.name}`)
    .join(', ')

  const abilities = [
    ...ds.coreAbilities.map((c, i) => ({ key: `core-${i}`, name: coreAbilityName(c), text: null as string | null })),
    ...ds.abilities.map((aid) => ({ key: aid, name: state.abilities[aid]?.name ?? prettifyId(aid), text: state.abilities[aid]?.text?.trim() || null })),
    ...(ds.leader?.effects ?? []).map((aid) => ({
      key: `leader-${aid}`,
      name: `${state.abilities[aid]?.name ?? prettifyId(aid)} (while leading)`,
      text: state.abilities[aid]?.text?.trim() || null,
    })),
  ]
  const modelKeywords = Array.from(new Set(profiles.flatMap((p) => p.keywords ?? [])))
  const keywords = Array.from(new Set([...ds.keywords, ...modelKeywords]))
  const playerColor = unit.player === 'A' ? colors.playerA : colors.playerB

  return (
    <div data-testid="unit-datasheet">
      {/* Phones show this as a full-screen sheet; keep the title clear of the 48px close button in its corner. */}
      <div style={compact ? { ...header, margin: '0 0 8px', padding: '10px 56px 8px 12px', borderRadius: 8 } : header}>
        <div style={titleText}>{title}</div>
        <div style={subText}>
          {title !== unit.name && (
            <>
              <span style={{ color: playerColor, fontWeight: 700 }}>{unit.name}</span>
              {' · '}
            </>
          )}
          {state.players[unit.player].name}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', ...(compact ? { fontSize: 13 } : null) }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          {statLines.map((p) => (
            <div key={p.key} style={{ marginBottom: 6 }}>
              {statLines.length > 1 && <div style={{ fontWeight: 700, fontSize: 11.5, marginBottom: 2 }}>{p.names.join(', ')}</div>}
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                {(
                  [
                    ['M', `${p.stats.M}"`],
                    ['T', `${p.stats.T}`],
                    ['SV', plus(p.stats.Sv)],
                    ['W', `${p.stats.W}`],
                    ['LD', plus(p.stats.Ld)],
                    ['OC', `${p.stats.OC}`],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} style={statCell}>
                    <span style={statLabel}>{label}</span>
                    <span style={statValue}>{value}</span>
                  </div>
                ))}
                {ds.invuln !== null && (
                  <div style={statCell}>
                    <span style={statLabel}>INV</span>
                    <span style={{ ...statValue, borderColor: colors.accent, color: colors.accent }}>{plus(ds.invuln)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <WeaponTable weapons={ranged} melee={false} />
            <WeaponTable weapons={melee} melee />
          </div>
        </div>

        <div style={{ flex: '1 1 190px', minWidth: 0 }}>
          <div style={{ ...heading, marginTop: 0 }}>Abilities</div>
          {abilities.length === 0 && <div style={{ color: colors.muted }}>No special abilities.</div>}
          {abilities.map((a) => (
            <div key={a.key} style={{ marginBottom: 5, fontSize: 11.5 }}>
              <span style={{ fontWeight: 700 }}>{a.name}</span>
              {a.text && <span style={{ color: colors.muted }}>: {a.text}</span>}
            </div>
          ))}
          <div style={heading}>Unit composition</div>
          <div style={{ fontSize: 11.5 }}>{composition}</div>
          {ds.damaged && (
            <div style={{ fontSize: 11.5, marginTop: 4, color: '#ffb84f' }}>
              Damaged: weakens once a model has {ds.damaged.threshold} wound{ds.damaged.threshold === 1 ? '' : 's'} or fewer left.
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 8, paddingTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ ...statLabel, marginBottom: 1 }}>KEYWORDS</div>
          <div style={keywordsLine}>{keywords.join(', ')}</div>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <div style={{ ...statLabel, marginBottom: 1 }}>FACTION KEYWORDS</div>
          <div style={keywordsLine}>{ds.factionKeywords.join(', ')}</div>
        </div>
      </div>
    </div>
  )
}
