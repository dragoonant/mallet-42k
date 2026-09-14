// Headless simulator CLI: `npm run sim -- --games N --seed S`
import { DATA_VERSION, loadBundle } from '../src/data/index'
import { runGame, type Violation } from './sim-core'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

async function main(): Promise<void> {
  const games = Number(arg('games', '10'))
  const seed = arg('seed', '1')
  const verbose = process.argv.includes('--verbose')
  const bundle = await loadBundle()
  const started = Date.now()
  const wins: Record<string, number> = {}
  let draws = 0, rounds = 0, actions = 0
  const violations: Violation[] = []
  for (let g = 0; g < games; g++) {
    const t0 = Date.now()
    let run
    try {
      run = runGame(bundle, seed, g, DATA_VERSION)
    } catch (err) {
      const v = (err as { violations?: Violation[] }).violations ?? [{ seed: `sim-${seed}-${g}`, actionIndex: -1, message: (err as Error).message }]
      violations.push(...v)
      continue
    }
    violations.push(...run.violations)
    rounds += run.rounds
    actions += run.actions.length
    if (run.winner === 'draw') draws++
    else if (run.winner) wins[run.factions[run.winner]] = (wins[run.factions[run.winner]] ?? 0) + 1
    if (verbose) {
      console.log(`game ${g} ${run.setup.missionId} A=${run.factions.A} B=${run.factions.B}: ${run.winner ?? 'unfinished'} (${run.reason}) VP ${run.vp.A}-${run.vp.B}, rounds ${run.rounds}, actions ${run.actions.length}, ${Date.now() - t0}ms${run.violations.length ? `, ${run.violations.length} violation(s)` : ''}`)
    }
  }
  console.log(`sim: ${games} games, seed ${seed}, ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`wins: ${Object.entries(wins).map(([f, n]) => `${f} ${n}`).join(', ') || 'none'}; draws: ${draws}`)
  console.log(`mean rounds: ${(rounds / Math.max(games, 1)).toFixed(2)}; mean actions/game: ${(actions / Math.max(games, 1)).toFixed(1)}`)
  console.log(`violations: ${violations.length}`)
  for (const v of violations.slice(0, 50)) console.log(`  [${v.seed} #${v.actionIndex}] ${v.message}`)
  process.exit(violations.length > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
