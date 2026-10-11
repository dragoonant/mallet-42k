// Weapon selection for a ranged declareTargets decision (normal shooting and Overwatch). Clicking an enemy on
// the board stages "every weapon that can reach it -> that unit"; this panel then lets the player hold some
// weapon groups, aim others at different enemies, pick profiles and settle Pistol conflicts before Fire
// (button or Enter). The rules are checked locally by interaction/shootPlan.ts with the same tests the engine
// uses; if the engine still refuses, its reason arrives as the usual toast and the panel stays open.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Action, GameState } from '@/engine'
import { useUiStore } from './uiStore'
import { buttonBase, buttonPrimary, colors, mutedText } from './theme'
import {
  groupWeapons, initialPlan, resolvePlan, retarget, reachingEntries, weaponTags,
  type DeclarePending, type ShootPlan, type WeaponGroup,
} from '../interaction/shootPlan'

const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }
const rowBase: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '5px 7px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.04)' }
const line: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }
const tag: CSSProperties = { fontSize: 10.5, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,217,90,0.14)', color: colors.accent, cursor: 'help' }
const select: CSSProperties = { fontSize: 12, background: colors.bgSolid, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 5, padding: '2px 4px' }

interface Props {
  state: GameState
  pending: DeclarePending
  passAction: Action | null
  dispatch: (a: Action) => void
}

export function WeaponPanel({ state, pending, passAction, dispatch }: Props) {
  const stage = useUiStore((s) => s.shootStage)
  const hoverUnit = useUiStore((s) => s.hoverUnit)
  const unitName = (id: string) => state.units[id]?.name ?? id

  const groups = useMemo(() => groupWeapons(state, pending.context.weapons), [state, pending])
  const [plan, setPlan] = useState<ShootPlan>(() => initialPlan(groups, stage!.targetUnitId))
  const lastNonce = useRef(stage?.nonce ?? 0)

  // A later board click retargets the selected row (or every row that can reach the clicked unit).
  useEffect(() => {
    if (!stage || stage.nonce === lastNonce.current) return
    lastNonce.current = stage.nonce
    setPlan((p) => retarget(groups, p, stage.targetUnitId))
  }, [stage, groups])

  const resolved = useMemo(() => resolvePlan(state, pending, groups, plan), [state, pending, groups, plan])
  const canFire = resolved.errors.length === 0

  // Light up the units currently assigned on the board.
  const assigned = useMemo(() => [...new Set(resolved.targets.map((t) => t.targetUnitId))], [resolved])
  useEffect(() => { hoverUnit(assigned) }, [assigned, hoverUnit])
  useEffect(() => () => hoverUnit(null), [hoverUnit])

  const patch = (key: string, p: Partial<ShootPlan['groups'][string]>) =>
    setPlan((cur) => ({ ...cur, selectedKey: key, groups: { ...cur.groups, [key]: { ...cur.groups[key], ...p } } }))

  const fire = () => {
    if (!canFire) return
    useUiStore.getState().hoverUnit(null)
    dispatch({ type: 'declareTargets', player: pending.player, decisionId: pending.id, unitId: pending.context.unitId, targets: resolved.targets })
  }
  const fireRef = useRef(fire)
  fireRef.current = fire

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key === 'Enter') {
        if (el && (el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA')) return
        e.preventDefault()
        fireRef.current()
      } else if (e.key === 'Escape') {
        useUiStore.setState({ shootStage: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const renderRow = (g: WeaponGroup) => {
    const c = plan.groups[g.key]
    if (!c) return null
    const reach = reachingEntries(g, c).length
    const total = g.entries.filter((e) => e.weaponId === c.variant).length
    const lost = resolved.dropped[g.key] ?? 0
    const tags = weaponTags(state, c.variant)
    const selected = plan.selectedKey === g.key
    return (
      <div key={g.key} style={{ ...rowBase, borderColor: selected ? colors.accent : colors.border, opacity: c.fire ? 1 : 0.6 }} data-testid={`weapon-row-${g.key}`} onClick={() => setPlan((p) => ({ ...p, selectedKey: g.key }))}>
        <div style={line}>
          <input type="checkbox" checked={c.fire} data-testid={`weapon-fire-${g.key}`} aria-label={`Fire ${g.name}`} onChange={(e) => patch(g.key, { fire: e.target.checked })} />
          <strong data-testid={`weapon-name-${g.key}`}>{g.variants.length > 1 ? state.weapons[c.variant]?.name ?? g.name : g.name}</strong>
          <span style={mutedText}>×{reach === total ? total : `${reach}/${total}`} · {state.weapons[c.variant]?.range ?? g.range}&quot; · →</span>
          <select style={select} value={c.target} data-testid={`weapon-target-${g.key}`} aria-label={`Target for ${g.name}`} onChange={(e) => {
            const target = e.target.value
            const variantOk = g.entries.some((x) => x.weaponId === c.variant && x.legalTargets.includes(target))
            const variant = variantOk ? c.variant : g.variants.find((v) => g.entries.some((x) => x.weaponId === v.weaponId && x.legalTargets.includes(target)))?.weaponId ?? c.variant
            patch(g.key, { target, variant })
          }}>
            {g.legalTargets.map((t) => <option key={t} value={t}>{unitName(t)}</option>)}
          </select>
        </div>
        {(tags.length > 0 || lost > 0 || reach < total) && (
          <div style={line}>
            {tags.map((t) => <span key={t.label} style={tag} title={t.tip}>{t.label}</span>)}
            {reach < total && <span style={{ ...mutedText, fontSize: 11 }}>{total - reach} can&apos;t see {unitName(c.target)}</span>}
            {lost > 0 && c.fire && <span style={{ ...mutedText, fontSize: 11, color: colors.accent }}>{lost} held back (Pistol rule)</span>}
          </div>
        )}
        {g.variants.length > 1 && (
          <div style={line} role="radiogroup" aria-label={`${g.name} profile`}>
            {g.variants.map((v) => {
              const ok = g.entries.some((x) => x.weaponId === v.weaponId && x.legalTargets.includes(c.target))
              return (
                <label key={v.weaponId} style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: ok ? 1 : 0.5 }}>
                  <input type="radio" name={`profile-${g.key}`} checked={c.variant === v.weaponId} disabled={!ok} data-testid={`weapon-variant-${v.weaponId}`} onChange={() => patch(g.key, { variant: v.weaponId })} />
                  {v.name}
                </label>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }} data-testid="weapon-panel">
      <div style={{ ...mutedText, fontSize: 11.5 }}>
        Tick the weapons that fire and pick a target for each. Click another enemy on the board to retarget the highlighted row.
      </div>
      <div style={list}>{groups.map(renderRow)}</div>
      {resolved.conflicts.map((cf, i) => (
        <div key={i} style={{ ...mutedText, background: 'rgba(245,217,90,0.08)', borderRadius: 6, padding: '5px 7px', fontSize: 11.5 }} data-testid="pistol-conflict">
          {cf.modelIds.length} model{cf.modelIds.length === 1 ? '' : 's'} carry both {cf.pistolNames.join(', ')} (Pistol) and {cf.otherNames.join(', ')}. A model uses one kind per activation, so{' '}
          <strong style={{ color: colors.text }}>{plan.pistolMode === 'pistol' ? cf.pistolNames.join(', ') : cf.otherNames.join(', ')}</strong> will fire.
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button style={plan.pistolMode === 'pistol' ? buttonPrimary : buttonBase} data-testid="pistol-mode-pistol" onClick={() => setPlan((p) => ({ ...p, pistolMode: 'pistol' }))}>Pistols</button>
            <button style={plan.pistolMode === 'other' ? buttonPrimary : buttonBase} data-testid="pistol-mode-other" onClick={() => setPlan((p) => ({ ...p, pistolMode: 'other' }))}>Other weapons</button>
          </div>
        </div>
      ))}
      {resolved.errors.map((e) => <div key={e} style={{ ...mutedText, color: colors.danger }} data-testid="weapon-error">{e}</div>)}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={canFire ? buttonPrimary : { ...buttonPrimary, opacity: 0.5, cursor: 'not-allowed' }} disabled={!canFire} data-testid="btn-fire" onClick={fire}>
          Fire ({resolved.targets.length}) <span style={{ opacity: 0.7, fontWeight: 400 }}>Enter</span>
        </button>
        {passAction && <button style={buttonBase} data-testid="btn-fire-nothing" onClick={() => dispatch(passAction)}>Fire nothing</button>}
        <button style={buttonBase} data-testid="btn-weapon-cancel" onClick={() => useUiStore.setState({ shootStage: null })}>Back</button>
      </div>
    </div>
  )
}
