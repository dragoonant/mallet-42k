import { useCallback, useEffect, useRef, useState } from 'react'
import type { RollRequest } from '../types'
import { Scene, type ActiveRoll } from './Scene'
import { TOTALS_CSS, TotalsCard } from './Totals'

interface TableResult {
  faces: number[]
  successes: number
  sum: number
  crits: number
  settled: true
}

declare global {
  interface Window {
    __diceTest?: { roll: (req: Partial<RollRequest> & { dice: number[] }) => void; lastResult: TableResult | null }
  }
}

const PRESETS: { label: string; count: number; target: number; name: string }[] = [
  { label: '10 shots hit on 3+', count: 10, target: 3, name: 'To hit' },
  { label: 'Charge 2D6', count: 2, target: 0, name: 'Charge' },
  { label: 'Save 4+ x6', count: 6, target: 4, name: 'Save' },
  { label: 'Big squad 25 on 4+', count: 25, target: 4, name: 'To hit' },
]

const CSS = TOTALS_CSS + `
.dt{display:flex;height:100%;width:100%}
.dt-panel{width:260px;flex:none;box-sizing:border-box;padding:16px;background:#171a1f;border-right:1px solid #2a2f37;overflow:auto}
.dt-panel h1{font-size:16px;margin:0 0 12px;letter-spacing:.04em;color:#f2c94c}
.dt-panel label{display:block;font-size:12px;color:#9aa3ad;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.06em}
.dt-panel select,.dt-panel input[type=number]{width:100%;box-sizing:border-box;background:#0f1114;color:#e8e6e1;border:1px solid #333a44;border-radius:6px;padding:6px 8px;font:inherit}
.dt-panel input[type=range]{width:100%}
.dt-btn{display:block;width:100%;box-sizing:border-box;text-align:left;background:#222730;color:#e8e6e1;border:1px solid #333a44;border-radius:6px;padding:7px 10px;margin:4px 0;font:inherit;cursor:pointer}
.dt-btn:hover{background:#2b313c}
.dt-roll{background:#f2c94c;color:#1a1a1a;font-weight:700;text-align:center;font-size:17px;padding:11px;margin-top:16px;border-color:#f2c94c}
.dt-roll:hover{background:#ffd966}
.dt-seg{display:flex;gap:4px}.dt-seg .dt-btn{text-align:center;margin:0}
.dt-seg .on{background:#3b4452;border-color:#f2c94c}
.dt-hint{font-size:12px;color:#7d8791;margin-top:10px}
.dt-stage{position:relative;flex:1;min-width:0}
.dt-stage>.dt-tot{position:absolute;top:14px;right:14px;min-width:270px;max-width:340px}
@media (max-width:760px){.dt{flex-direction:column}.dt-panel{width:auto;border-right:0;border-bottom:1px solid #2a2f37;max-height:42%}.dt-stage>.dt-tot{top:auto;bottom:10px;right:10px;left:10px;max-width:none}}
`

export function DiceTableApp() {
  const [count, setCount] = useState(10)
  const [target, setTarget] = useState(3)
  const [fast, setFast] = useState(false)
  const [name, setName] = useState('To hit')
  const [rolls, setRolls] = useState<ActiveRoll[]>([])
  const [shown, setShown] = useState<{ req: RollRequest; result: TableResult } | null>(null)
  const reqs = useRef(new Map<number, RollRequest>())
  const nextId = useRef(1)
  const fastRef = useRef(fast)
  fastRef.current = fast

  const startRoll = useCallback((req: RollRequest) => {
    const now = performance.now() / 1000
    const id = nextId.current++
    reqs.current.set(id, req)
    setShown(null)
    if (window.__diceTest) window.__diceTest.lastResult = null
    setRolls((prev) => {
      for (const r of prev) if (r.leaveAt == null) r.leaveAt = now
      const roll: ActiveRoll = {
        id,
        faces: req.dice,
        target: req.target,
        seed: Math.floor(Math.random() * 4294967296),
        t0: now,
        dur: fastRef.current ? 0.9 : 1.9,
        settled: false,
      }
      return [...prev, roll]
    })
    window.setTimeout(() => setRolls((prev) => prev.filter((r) => r.id === id || r.id > id)), 500)
  }, [])

  const onSettled = useCallback((id: number) => {
    const req = reqs.current.get(id)
    if (!req || id !== nextId.current - 1) return
    const t = req.target
    const result: TableResult = {
      faces: req.dice.slice(),
      successes: t == null ? req.dice.length : req.dice.filter((d) => d >= t).length,
      sum: req.dice.reduce((a, b) => a + b, 0),
      crits: req.dice.filter((d) => d === 6).length,
      settled: true,
    }
    if (window.__diceTest) window.__diceTest.lastResult = result
    setShown({ req, result })
  }, [])

  const rollNow = useCallback(
    (c: number, t: number, label: string) => {
      const dice = Array.from({ length: c }, () => 1 + Math.floor(Math.random() * 6))
      startRoll({
        label: `${label}`,
        purpose: label,
        dice,
        target: t >= 2 ? t : undefined,
      })
    },
    [startRoll],
  )

  const stateRef = useRef({ count, target, name })
  stateRef.current = { count, target, name }

  useEffect(() => {
    window.__diceTest = {
      roll: (req) => startRoll({ purpose: 'test', ...req, dice: req.dice.map((d) => Math.min(6, Math.max(1, Math.round(d)))) }),
      lastResult: null,
    }
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      if (e.repeat) return
      const s = stateRef.current
      rollNow(s.count, s.target, s.name)
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      delete window.__diceTest
    }
  }, [startRoll, rollNow])

  return (
    <div className="dt">
      <style>{CSS}</style>
      <div className="dt-panel">
        <h1>Dice table</h1>
        <label htmlFor="dt-count">Dice: {count}</label>
        <input
          id="dt-count"
          type="range"
          min={1}
          max={30}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <label htmlFor="dt-target">Target</label>
        <select id="dt-target" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
          <option value={0}>None (just sum)</option>
          {[2, 3, 4, 5, 6].map((t) => (
            <option key={t} value={t}>
              {t}+
            </option>
          ))}
        </select>
        <label>Presets</label>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="dt-btn"
            onClick={() => {
              setCount(p.count)
              setTarget(p.target)
              setName(p.name)
              rollNow(p.count, p.target, p.name)
            }}
          >
            {p.label}
          </button>
        ))}
        <label>Speed</label>
        <div className="dt-seg">
          <button className={`dt-btn ${!fast ? 'on' : ''}`} onClick={() => setFast(false)}>
            Normal
          </button>
          <button className={`dt-btn ${fast ? 'on' : ''}`} onClick={() => setFast(true)}>
            Fast
          </button>
        </div>
        <button className="dt-btn dt-roll" onClick={() => rollNow(count, target, name)}>
          Roll (Space)
        </button>
        <div className="dt-hint">Each roll clears the last throw. Highlights: gold = pass, cyan = natural 6, red = natural 1.</div>
      </div>
      <div className="dt-stage">
        <Scene rolls={rolls} onSettled={onSettled} />
        {shown && (
          <TotalsCard
            key={shown.result.faces.join('')}
            title={shown.req.label ?? shown.req.purpose}
            faces={shown.result.faces}
            target={shown.req.target}
            successes={shown.req.target == null ? null : shown.result.successes}
          />
        )}
      </div>
    </div>
  )
}
