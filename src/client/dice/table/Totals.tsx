import { useEffect, useState } from 'react'

const FACE_ICON = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

export const TOTALS_CSS = `
.dt-tot{box-sizing:border-box;padding:14px 16px;background:rgba(14,17,21,.88);border:1px solid #333a44;border-radius:10px;backdrop-filter:blur(4px);animation:dtin .25s ease-out}
@keyframes dtin{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.dt-tot h2{margin:0;font-size:14px;color:#c4cbd3;font-weight:600}
.dt-tot .sub{font-size:12px;color:#8a949f;margin-bottom:6px}
.dt-big{font-size:42px;font-weight:800;line-height:1.1;color:#f2c94c}
.dt-big small{font-size:20px;color:#9aa3ad;font-weight:600}
.dt-big.sum{color:#7df9ff}
.dt-tally{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:10px 0 8px;text-align:center}
.dt-tally div{background:#1c2027;border-radius:6px;padding:3px 0}
.dt-tally .ic{font-size:26px;line-height:1.1}
.dt-tally .n{font-size:13px;color:#c4cbd3}
.dt-tally .win .ic{color:#f2c94c}.dt-tally .lose .ic{color:#6c7580}.dt-tally .ace .ic{color:#e07272}
.dt-meta{display:flex;gap:16px;font-size:13px;color:#aeb6bf}.dt-meta b{color:#e8e6e1;font-size:15px}
`

function useCountUp(value: number, active: boolean): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!active) {
      setV(0)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 600)
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, active])
  return v
}


export interface TotalsProps {
  title: string
  /** Optional extra line under the title (e.g. a roll note). */
  note?: string
  /** Final face values. */
  faces: number[]
  target?: number
  /** Dice that count as a success; null for a roll with no pass/fail (shows the sum instead). */
  successes: number | null
  className?: string
  onClick?: () => void
  footer?: string
}

/** Totals card shared by the test page and the in-game table overlay: successes/N or total, per-face tally, sum, crits. */
export function TotalsCard({ title, note, faces, target, successes, className, onClick, footer }: TotalsProps) {
  const n = faces.length
  const sum = faces.reduce((a, b) => a + b, 0)
  const crits = faces.filter((d) => d === 6).length
  const judged = successes !== null
  const big = useCountUp(judged ? successes : sum, true)
  const sumShown = useCountUp(sum, true)
  const tally = [1, 2, 3, 4, 5, 6].map((f) => faces.filter((d) => d === f).length)
  return (
    <div className={`dt-tot ${className ?? ''}`} data-testid="totals" onClick={onClick}>
      <h2>{title}</h2>
      <div className="sub">
        {note ?? `${n} ${n === 1 ? 'die' : 'dice'}, ${target != null ? `target ${target}+` : judged ? 'pass or fail' : 'no target'}`}
      </div>
      {judged ? (
        <div className="dt-big">
          {big} <small>successes / {n}</small>
        </div>
      ) : (
        <div className="dt-big sum">
          {big} <small>total</small>
        </div>
      )}
      <div className="dt-tally">
        {tally.map((c, i) => {
          const f = i + 1
          const cls = target != null ? (f === 1 ? 'ace' : f >= target ? 'win' : 'lose') : ''
          return (
            <div key={f} className={cls}>
              <div className="ic">{FACE_ICON[i]}</div>
              <div className="n">x{c}</div>
            </div>
          )
        })}
      </div>
      <div className="dt-meta">
        <span>
          Sum <b>{sumShown}</b>
        </span>
        {judged && (
          <span>
            Crits (6) <b>{crits}</b>
          </span>
        )}
      </div>
      {footer && <div className="sub" style={{ marginTop: 8, marginBottom: 0 }}>{footer}</div>}
    </div>
  )
}
