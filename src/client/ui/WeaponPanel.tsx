// Weapon selection for a ranged declareTargets decision (normal shooting and Overwatch). Clicking an enemy on
// the board stages "every weapon that can reach it -> that unit"; this panel then lets the player hold some
// weapon groups, aim others at different enemies, pick profiles and settle Pistol conflicts before Fire
// (button or Enter). The rules are checked locally by interaction/shootPlan.ts with the same tests the engine
// uses; if the engine still refuses, its reason arrives as the usual toast and the panel stays open.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Action, GameState } from '@/engine'
import { useUiStore } from './uiStore'
import { buttonBase, buttonPrimary, colors, mutedText } from './theme'
import { Tooltip } from './Tooltip'
import { useFormFactor } from './formFactor'
import {
  groupWeapons, initialPlan, deckCap, deckFiring, resolvePlan, retarget, reachingEntries, setRowFire, weaponTags, modeOf, weaponHasAbility,
  type DeclarePending, type ShootPlan, type WeaponGroup,
} from '../interaction/shootPlan'

const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }
const rowBase: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '5px 7px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.04)' }
const line: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }
const tag: CSSProperties = { fontSize: 10.5, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,217,90,0.14)', color: colors.accent, cursor: 'help' }
// Compact (phone) variants: 44px rows/controls. The bottom sheet's body (DecisionPrompt, <= 45dvh) is the
// scroller; this panel keeps its natural height (flexShrink 0) and puts Fire / Fire nothing / Back first, pinned to
// the top of the scroll area, so they are never below the fold.
const TOUCH = 44
const rowCompact: CSSProperties = { ...rowBase, minHeight: TOUCH, padding: '6px 8px', gap: 4 }
const lineCompact: CSSProperties = { ...line, minHeight: TOUCH - 12, gap: 8, fontSize: 13 }
const selectCompact: CSSProperties = { fontSize: 13, background: colors.bgSolid, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '0 6px', minHeight: TOUCH, maxWidth: '100%' }
const boxCompact: CSSProperties = { width: 24, height: 24, margin: 10, flex: '0 0 auto' }
const btnCompact: CSSProperties = { minHeight: TOUCH, padding: '0 16px' }
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
  const { compact } = useFormFactor()

  const groups = useMemo(() => groupWeapons(state, pending.context.weapons, pending.context.unitId), [state, pending])
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
    const firing = resolved.firing[g.key] ?? 0
    // the tick shows what will actually fire, not what was last clicked
    const ticked = c.fire && firing > 0
    const isPistolRow = weaponHasAbility(state, c.variant, 'PISTOL')
    const isDeck = !!g.deckModelId
    const deckFull = isDeck && !ticked && deckFiring(groups, plan) >= deckCap(state, pending.context.unitId)
    const blind = reach === 0 || deckFull
    const reason = deckFull
      ? `Firing Deck: only ${deckCap(state, pending.context.unitId)} embarked models can fire. Untick another passenger first.`
      : blind
      ? `No model can see ${unitName(c.target)} with this one.`
      : c.fire && lost > 0 && firing === 0
        ? `Not firing: ${lost === 1 ? 'that model uses' : 'those models use'} their ${isPistolRow ? 'other weapons' : 'Pistol'} instead. Tick to switch.`
        : c.fire && lost > 0
          ? `${lost} not firing: using their ${isPistolRow ? 'other weapons' : 'Pistol'} instead.`
          : null
    const tags = weaponTags(state, c.variant)
    const selected = plan.selectedKey === g.key
    return (
      <div key={g.key} style={{ ...(compact ? rowCompact : rowBase), borderColor: selected ? colors.accent : colors.border, opacity: ticked ? 1 : 0.6 }} data-testid={`weapon-row-${g.key}`} onClick={() => setPlan((p) => ({ ...p, selectedKey: g.key }))}>
        <div style={compact ? lineCompact : line}>
          <input style={compact ? boxCompact : undefined} type="checkbox" checked={ticked} disabled={blind} data-testid={`weapon-fire-${g.key}`} aria-label={`Fire ${g.name}`} onChange={(e) => setPlan((cur) => setRowFire(state, pending, groups, cur, g.key, e.target.checked))} />
          <strong data-testid={`weapon-name-${g.key}`}>{g.variants.length > 1 ? state.weapons[c.variant]?.name ?? g.name : g.name}</strong>
          <span style={mutedText}>×{firing === total ? total : `${firing}/${total}`} · {state.weapons[c.variant]?.range ?? g.range}&quot; · →</span>
          <select style={compact ? selectCompact : select} value={c.target} data-testid={`weapon-target-${g.key}`} aria-label={`Target for ${g.name}`} onChange={(e) => {
            const target = e.target.value
            const variantOk = g.entries.some((x) => x.weaponId === c.variant && x.legalTargets.includes(target))
            const variant = variantOk ? c.variant : g.variants.find((v) => g.entries.some((x) => x.weaponId === v.weaponId && x.legalTargets.includes(target)))?.weaponId ?? c.variant
            patch(g.key, { target, variant })
          }}>
            {g.legalTargets.map((t) => <option key={t} value={t}>{unitName(t)}</option>)}
          </select>
        </div>
        {(tags.length > 0 || reason || reach < total) && (
          <div style={compact ? lineCompact : line}>
            {tags.map((t) => <Tooltip key={t.label} title={t.label} body={t.tip}><span style={tag}>{t.label}</span></Tooltip>)}
            {reach < total && reach > 0 && <span style={{ ...mutedText, fontSize: 11 }}>{total - reach} can&apos;t see {unitName(c.target)}</span>}
            {reason && <span style={{ ...mutedText, fontSize: 11, color: colors.accent }} data-testid={`weapon-reason-${g.key}`}>{reason}</span>}
          </div>
        )}
        {g.variants.length > 1 && (
          <div style={compact ? lineCompact : line} role="radiogroup" aria-label={`${g.name} profile`}>
            {g.variants.map((v) => {
              const ok = g.entries.some((x) => x.weaponId === v.weaponId && x.legalTargets.includes(c.target))
              return (
                <label key={v.weaponId} style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: ok ? 1 : 0.5, minHeight: compact ? TOUCH : undefined }}>
                  <input style={compact ? boxCompact : undefined} type="radio" name={`profile-${g.key}`} checked={c.variant === v.weaponId} disabled={!ok} data-testid={`weapon-variant-${v.weaponId}`} onChange={() => patch(g.key, { variant: v.weaponId })} />
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
    <div
      style={compact
        ? { display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }
        : { display: 'flex', flexDirection: 'column', gap: 5 }}
      data-testid="weapon-panel"
    >
      {!compact && (
        <div style={{ ...mutedText, fontSize: 11.5 }}>
          Tick the weapons that fire and pick a target for each. Click another enemy on the board to retarget the highlighted row.
        </div>
      )}
      <div style={compact ? { ...list, maxHeight: 'none', overflowY: 'visible' } : list}>{groups.filter((g) => !g.deckModelId).map(renderRow)}</div>
      {groups.some((g) => g.deckModelId) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="firing-deck-section">
          <div style={{ ...mutedText, fontSize: 11.5 }}>
            Firing Deck: up to {deckCap(state, pending.context.unitId)} embarked models ({deckFiring(groups, plan)} chosen) may fire one ranged weapon each through this transport.
          </div>
          <div style={compact ? { ...list, maxHeight: 'none', overflowY: 'visible' } : list}>{groups.filter((g) => g.deckModelId).map(renderRow)}</div>
        </div>
      )}
      {resolved.conflicts.length > 0 && (
        <div style={{ ...mutedText, background: 'rgba(245,217,90,0.08)', borderRadius: 6, padding: '5px 7px', fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="pistol-conflict">
          <div>A model fires either its Pistol or its other guns in one activation, never both. Pick which for:</div>
          {resolved.conflicts.map((cf) => {
            const mode = modeOf(plan, cf.sig)
            const many = resolved.conflicts.length > 1
            return (
              <div key={cf.sig} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} data-testid={`pistol-group-${cf.sig}`}>
                {many && <strong style={{ color: colors.text }}>{cf.label}:</strong>}
                <button style={{ ...(mode === 'pistol' ? buttonPrimary : buttonBase), ...(compact ? btnCompact : null) }} data-testid="pistol-mode-pistol" onClick={() => setPlan((p) => ({ ...p, pistolMode: { ...p.pistolMode, [cf.sig]: 'pistol' } }))}>Pistol ({cf.pistolNames.join(', ')})</button>
                <button style={{ ...(mode === 'other' ? buttonPrimary : buttonBase), ...(compact ? btnCompact : null) }} data-testid="pistol-mode-other" onClick={() => setPlan((p) => ({ ...p, pistolMode: { ...p.pistolMode, [cf.sig]: 'other' } }))}>Other ({cf.otherNames.join(', ')})</button>
              </div>
            )
          })}
        </div>
      )}
      {resolved.errors.map((e) => <div key={e} style={{ ...mutedText, color: colors.danger, order: compact ? -1 : undefined }} data-testid="weapon-error">{e}</div>)}
      <div style={compact ? { display: 'flex', gap: 8, flexWrap: 'wrap', position: 'sticky', top: 0, order: -1, background: colors.bgSolid, padding: '2px 0 6px', zIndex: 1 } : { display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...(canFire ? buttonPrimary : { ...buttonPrimary, opacity: 0.5, cursor: 'not-allowed' }), ...(compact ? btnCompact : null) }} disabled={!canFire} data-testid="btn-fire" onClick={fire}>
          Fire ({resolved.targets.length}){!compact && <> <span style={{ opacity: 0.7, fontWeight: 400 }}>Enter</span></>}
        </button>
        {passAction && <button style={compact ? { ...buttonBase, ...btnCompact } : buttonBase} data-testid="btn-fire-nothing" onClick={() => dispatch(passAction)}>Fire nothing</button>}
        <button style={compact ? { ...buttonBase, ...btnCompact } : buttonBase} data-testid="btn-weapon-cancel" onClick={() => useUiStore.setState({ shootStage: null })}>Back</button>
      </div>
    </div>
  )
}
