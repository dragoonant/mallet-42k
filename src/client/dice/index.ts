// Dice presentation layer. Renders <DiceTray/> once anywhere in the overlay tree; call playRoll()
// from wherever a roll happens (store glue, an ability handler, a test) to animate it — rolls are
// queued and play in order, never overlapping. setSpeed() controls tumble/hold duration globally.
export { DiceTray } from './DiceTray'
export { DiceTableOverlay } from './table/DiceTableOverlay'
export { playRoll, setSpeed, getSpeed, setDiceStyle, getDiceStyle } from './playRoll'
export { Die } from './Die'
export { DURATIONS, rerollTrayShown, useDiceStore } from './diceStore'
export type { DiceSpeed, DiceStyle, RollRequest, DieResult } from './types'
