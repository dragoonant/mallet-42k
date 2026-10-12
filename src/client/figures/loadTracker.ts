// In-flight figure model loads (glbLoader.ts is the sole writer). Kept free of three/React so the game
// store can read it: the bot loop holds off until freshly deployed figures have actually appeared
// instead of racing through whole phases with the procedural stand-ins still on screen.
const inFlight = new Set<Promise<unknown>>()

/** glbLoader-only: track a load until it settles. */
export function trackFigureLoad(p: Promise<unknown>): void {
  inFlight.add(p)
  const done = () => {
    inFlight.delete(p)
  }
  p.then(done, done)
}

export function figureModelsLoading(): boolean {
  return inFlight.size > 0
}

/** Resolves once every figure model requested so far has finished loading (or failed) — immediately
 *  if none are in flight — or after `timeoutMs`, whichever comes first. */
export function waitForFigureModels(timeoutMs: number): Promise<void> {
  if (inFlight.size === 0) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        resolve()
      }
    }
    setTimeout(finish, timeoutMs)
    const check = () => {
      if (done) return
      // A short beat after the last load settles so the swapped-in model is drawn before play moves on.
      if (inFlight.size === 0) setTimeout(finish, 50)
      else void Promise.allSettled([...inFlight]).then(check)
    }
    check()
  })
}
