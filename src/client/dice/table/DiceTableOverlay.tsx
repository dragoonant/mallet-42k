// "Dice on the table" presentation for the game: a floating felt mat with 3D dice thrown onto it and a
// totals card. Driven by the same queue as the 2D tray (diceStore.ts) — it only renders the roll that is
// `current`, and the store's timers (throw, then hold with totals up) decide when the roll resolves.
// Click the mat or press Space during the hold to move on early.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TABLE_DURATIONS,
  TABLE_RETHROW_FACTOR,
  TABLE_RETHROW_LEAD_MS,
  isTableActive,
  skipHold,
  useDiceStore,
  type CurrentRoll,
} from '../diceStore'
import { Scene, type ActiveRoll } from './Scene'
import { TOTALS_CSS, TotalsCard } from './Totals'

const CSS =
  TOTALS_CSS +
  `
.dto{position:fixed;left:50%;top:clamp(48px,9vh,120px);z-index:30;width:min(560px,max(300px,calc(100vw - 480px)));aspect-ratio:560/360;
  transform:translateX(-50%);opacity:0;transition:opacity .25s ease-out;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.dto.on{opacity:1;pointer-events:auto;cursor:pointer}
.dto-mat{position:absolute;inset:0 0 0 0;border-radius:18px;
  background:radial-gradient(ellipse at 50% 45%,rgba(31,82,64,.92) 0%,rgba(20,56,44,.9) 55%,rgba(10,24,20,.0) 100%);
  -webkit-mask-image:radial-gradient(ellipse at 50% 50%,#000 58%,transparent 100%);mask-image:radial-gradient(ellipse at 50% 50%,#000 58%,transparent 100%);
  box-shadow:inset 0 0 60px rgba(0,0,0,.45)}
.dto-canvas{position:absolute;left:0;right:0;top:0;bottom:var(--dto-strip)}
.dto{--dto-strip:78px;display:block}
.dto-strip{position:absolute;left:0;right:0;bottom:0;height:var(--dto-strip);display:flex;align-items:flex-end;padding:0 6px 6px}
.dto-strip .dt-tot{width:100%;display:flex;flex-wrap:wrap;align-items:center;gap:2px 14px;padding:6px 12px;background:rgba(14,17,21,.88)}
.dto-strip h2{font-size:13px;margin:0}
.dto-strip .sub{font-size:11px;margin:0}
.dto-strip .dt-big{font-size:24px}
.dto-strip .dt-big small{font-size:12px}
.dto-strip .dt-tally{display:flex;gap:3px;margin:0}
.dto-strip .dt-tally div{display:flex;align-items:center;gap:2px;padding:0 4px}
.dto-strip .dt-tally .ic{font-size:16px}
.dto-strip .dt-tally .n{font-size:11px}
.dto-strip .dt-meta{font-size:11px;gap:10px}.dto-strip .dt-meta b{font-size:13px}
.dto-strip .dt-tot>.sub:last-child{flex-basis:100%;text-align:right}
.dto-title{position:absolute;left:0;right:0;top:4px;text-align:center;font-size:13px;font-weight:700;color:#e8e6e1;text-shadow:0 1px 4px #000;padding:0 12px}
@media (max-width:760px){.dto{top:56px}}
`

const noop = () => {}

export function makeRoll(id: number, cur: CurrentRoll, speed: 'normal' | 'fast'): ActiveRoll {
  const { request, dice } = cur
  const now = performance.now() / 1000
  const throwS = TABLE_DURATIONS[speed].throwMs / 1000
  const judged = dice.some((d) => d.outcome !== 'neutral')
  const base: ActiveRoll = {
    id,
    faces: dice.map((d) => d.value),
    pass: judged ? dice.map((d) => d.outcome === 'success') : undefined,
    seed: Math.floor(Math.random() * 4294967296),
    t0: now,
    dur: throwS,
    settled: false,
  }
  if (!request.skipTumble) return base
  const rethrow = dice.map((d) => d.wasRerolled)
  if (!rethrow.some(Boolean)) return { ...base, t0: now - 100 }
  // Dice the player already saw in the re-roll tray: show them settled, then re-throw only the rerolled ones.
  return {
    ...base,
    rethrow,
    prevFaces: dice.map((d) => d.original),
    t0: now + TABLE_RETHROW_LEAD_MS / 1000,
    dur: throwS * TABLE_RETHROW_FACTOR,
  }
}

export function DiceTableOverlay() {
  const current = useDiceStore((s) => s.current)
  const queued = useDiceStore((s) => s.queue.length)
  const speed = useDiceStore((s) => s.speed)
  const style = useDiceStore((s) => s.style)
  const active = isTableActive(style, speed)

  const [shown, setShown] = useState<CurrentRoll | null>(null)
  const [vis, setVis] = useState(false)
  const [rolls, setRolls] = useState<ActiveRoll[]>([])
  const nextId = useRef(1)
  const lastId = useRef<string | null>(null)
  const hasDice = !!current && current.dice.length > 0

  // Keep the last roll on screen while the panel fades out.
  useEffect(() => {
    if (active && current && current.dice.length > 0) {
      setShown(current)
      setVis(true)
      return
    }
    setVis(false)
    const t = window.setTimeout(() => {
      setShown(null)
      setRolls([])
      lastId.current = null
    }, 300)
    return () => window.clearTimeout(t)
  }, [current, active])

  // A new roll became current: throw it (earlier dice fly off the mat).
  useEffect(() => {
    if (!active || !current || current.dice.length === 0 || lastId.current === current.id) return
    lastId.current = current.id
    const roll = makeRoll(nextId.current++, current, speed as 'normal' | 'fast')
    const now = performance.now() / 1000
    setRolls((prev) => {
      for (const r of prev) if (r.leaveAt == null) r.leaveAt = now
      return [...prev, roll]
    })
    const id = roll.id
    window.setTimeout(() => setRolls((prev) => prev.filter((r) => r.id >= id)), 600)
  }, [current, active, speed])

  const settled = vis && shown?.phase === 'settled'
  const end = useCallback(() => skipHold(), [])

  useEffect(() => {
    if (!settled) return
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      e.preventDefault()
      skipHold()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [settled])

  if (!active && !shown) return null

  const req = shown?.request
  const dice = shown?.dice ?? []
  const judged = dice.some((d) => d.outcome !== 'neutral')
  const successes = judged ? dice.filter((d) => d.outcome === 'success').length : null
  const title = req ? (req.label ?? req.purpose) : ''

  return (
    <div className={`dto ${vis ? 'on' : ''}`} data-testid="dice-table" onClick={end} aria-hidden={!vis}>
      <style>{CSS}</style>
      <div className="dto-mat" />
      <div className="dto-canvas">
        {active && <Scene rolls={rolls} onSettled={noop} overlay idle={!shown || (!hasDice && !vis)} />}
      </div>
            <div className="dto-strip">
        {settled && req && (
          <TotalsCard
            key={shown.id}
            title={title}
            note={req.note}
            faces={dice.map((d) => d.value)}
            target={req.target}
            successes={successes}
            footer="Click or press Space to continue"
          />
        )}
      </div>
    </div>
  )
}
