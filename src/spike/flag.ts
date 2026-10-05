// `?spike=incursion` (44x60 board, doubled rosters) or `?spike=cp` (normal game, same bot-vs-bot driver + perf overlay).
// Optional `&a=<faction>&b=<faction>&seed=<text>`. Normal URLs return null and nothing here runs.
export type SpikeMode = 'incursion' | 'cp'
export function spikeMode(): SpikeMode | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('spike')
  return v === 'incursion' || v === 'cp' ? v : null
}
export function spikeParam(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback
}
