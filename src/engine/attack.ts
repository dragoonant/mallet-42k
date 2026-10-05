// Attack sequence (10-rules §6.2–§6.4, §7 weapon abilities, R-10.4/R-10.5). Owner: W1-D. Shared by the shooting phase,
// the fight phase (WS, melee) and Fire Overwatch (overwatch: true, R-6.22). State lives in phaseState.attack
// (AttackSequenceState); `advance` is a re-entrant state machine and must use ctx.rollOnce so Command Re-roll and
// rerollOffer (R-6.24) can interrupt. M9 fast-roll: the hit dice, then the wound dice (then, when the defender's models
// are interchangeable, the save dice) of a merge run are each ONE DiceRoll with one decision per batch; the resulting
// wounding attacks are queued (GroupBatch.queue) and then allocated / saved / damaged one at a time (CurrentAttack).
//
// Design notes (documented interpretations — see STATUS/issues):
// - One AttackGroup per (attacker model, weapon, target) declared entry (attackerModelIds always length 1 here);
//   groups are ordered target-major then weapon-major so R-6.6 "all attacks vs one target before the next; same
//   profile together" holds without needing to merge multiple models' rolls into one bucket (Rapid Fire/Melta are
//   measured per firing model, WEAP-004).
// - [DEVASTATING WOUNDS] critical wounds are deferred to the end of their OWN group (not the whole unit-vs-target,
//   which would need cross-group bookkeeping the frozen AttackGroup shape has no room for) via `devastatingPending`.
// - [BLAST] attacks use a per-target model-count snapshot taken in `begin` ("blastCount:<targetUnitId>=<n>" marks,
//   counting both halves of an attached target via leaderService.combinedModels) so target selection is the single
//   source of truth even when an earlier group in the SAME sequence has since thinned the same target.
// - `queueMortalWounds`/`destroyModel` are also the generic path other modules use for mortal wounds outside an
//   active sequence (Tank Shock, Grenade, Deadly Demise chains): `queueMortalWounds` opens a throwaway sequence via
//   `begin` when none is active so it never has to reject the call; the caller must still pump `advance()` to drain
//   it (the shooting/fight modules do this as part of their own resolve loop). Each batch gets a unique ordinal
//   folded into its `source` (marks-based counter) so two same-size batches on the same unit in one phase never
//   share a `mortalAlloc:` key.
// - Every `rollOnce`/`hazardous:`/`groupTouched:`/`mortalAlloc:`/`blastCount:`/`pendingDetach:` mark is scoped to
//   ONE attack sequence: `begin` wipes any leftovers of those prefixes first, so a second unit's sequence in the
//   same phase never reuses the first unit's cached rolls or per-target snapshots (SHOOT-046-dice).
// - R-10.1: a bodyguard that dies mid-volley is NOT detached immediately — `destroyModel` defers it via a
//   `pendingDetach:<unitId>` mark, and `advance` runs the real `leaderService.detach` only once the whole sequence
//   (including any mortal-wound queue) has finished, so the rest of the volley still allocates against the combined
//   halves and any queued mortal wounds still spill onto the attached CHARACTER (SHOOT-048, LEAD-014).
// - [BIG GUNS NEVER TIRE] R-6.3's -1 to hit is "if the unit was in ER when targets were selected", and [INDIRECT
//   FIRE]'s -1/auto-fail (R-6.23) is likewise about the target's visibility when it was declared — neither may be
//   re-evaluated live at each hit roll, or an engaging enemy dying (or a blocking model dying) mid-volley would
//   retroactively change an already-declared attack's modifier (SHOOT-005-timing). `begin` snapshots both into
//   `bgntAttacker=1` / `bgntTarget:<targetUnitId>=1` / `indirectNoLos:<modelId>:<targetUnitId>=1` marks the instant
//   the sequence starts (which for the Shooting phase is the instant targets are declared), and `doHitBatch` reads
//   only those marks — never `leaderService`/`los` live — for these two modifiers.
import type { DiceExpr, WeaponAbilityName } from '../data/types'
import { canReroll, clampHitWoundModifier, clampStat, dieSucceeds, netModifier, parseDiceExpr, rollSum, woundRollNeeded } from './dice'
import type { RollSpec } from './dice'
import { distance } from './geometry'
import type { AttackContext, EffectRequest, RollModifierResult } from './hooks'
import { leaderService } from './leaders'
import type { AdvanceResult, DecisionHandler, EngineContext } from './modules'
import { datasheetOf, hasKeyword, keywordsOf, modelStats, removeModel, unitModels } from './state'
import { weaponService } from './weapons'
import type { AttackRollContext } from './events'
import {
  EngineInvariantError,
  type AttackGroup, type AttackKind, type AttackSequenceState, type CurrentAttack, type DeclaredTarget, type DiceRoll, type GameState, type GroupBatch,
  type Model, type ModelId, type PlayerId, type RuntimeWeapon, type UnitId, type WeaponId, type WoundSlot,
} from './types'

export interface AttackBegin { kind: AttackKind; attackerUnitId: UnitId; overwatch: boolean; targets: DeclaredTarget[] }

export interface DestroyedBy { player: PlayerId | null; unitId: UnitId | null; modelId: ModelId | null; kind: AttackKind | 'mortal' | 'other' }

export interface AttackService {
  begin(ctx: EngineContext, spec: AttackBegin): void
  advance(ctx: EngineContext): AdvanceResult
  readonly handler: DecisionHandler
  queueMortalWounds(ctx: EngineContext, targetUnitId: UnitId, count: number, source: string, lostOnDeath: boolean): void
  destroyModel(ctx: EngineContext, modelId: ModelId, by: DestroyedBy): void
}

// ---------- small local helpers ----------

const MAX_TICKS = 200_000

function isRoll(r: RollModifierResult | EffectRequest): r is RollModifierResult { return r.kind === 'roll' }

// a RollContext-shaped stand-in for hook queries that need no real die (invuln/FNP grants, ignoreCover flags): none
// of the descriptive keys resultFor() resolves for these hooks read the die value, only ability `when` conditions on
// `Condition.roll` could (documented interpretation gap, see module header).
function fakeRoll(purpose: DiceRoll['purpose'], player: PlayerId, unitId: UnitId | null = null, modelId: ModelId | null = null): DiceRoll {
  return {
    id: 'fake', purpose, sides: 6, dice: [0], rerolled: null, modifiers: [], final: [0], player, unitId, modelId,
    weaponId: null, targetUnitId: null, commandRerollable: false,
  }
}

function toNumber(v: DiceExpr | undefined): number {
  if (v === undefined) return 0
  return typeof v === 'number' ? v : parseDiceExpr(v).flat
}

function rollAttackCtx(actx: AttackContext): AttackRollContext {
  return { attackerUnitId: actx.attackerUnitId, attackerModelId: actx.attackerModelId, weaponId: actx.weapon.id, targetUnitId: actx.targetUnitId }
}

function hasAbility(weapon: RuntimeWeapon, ability: WeaponAbilityName): boolean { return weaponService.hasAbility(weapon, ability) }

function attackSeq(ctx: EngineContext) {
  const a = ctx.state.phaseState.attack
  if (!a) throw new EngineInvariantError('attack: no active sequence')
  return a
}

// ---------- context building ----------

function buildAttackContext(ctx: EngineContext, attackerUnitId: UnitId, overwatch: boolean, kind: AttackKind, attackerModelId: ModelId, weapon: RuntimeWeapon, targetUnitId: UnitId, targetModelId: ModelId | null, inCover: boolean): AttackContext {
  const s = ctx.state
  const attackerUnit = s.units[attackerUnitId]
  const attackerModel = s.models[attackerModelId]
  let range = Infinity
  if (attackerModel) {
    const targetModels = leaderService.halves(s, targetUnitId).flatMap((id) => s.units[id]?.location === 'board' ? unitModels(s, id) : [])
    for (const tm of targetModels) range = Math.min(range, distance(attackerModel, tm))
  }
  const halfRange = kind === 'ranged' && Number.isFinite(range) && range <= weapon.range / 2 + 1e-6
  return {
    kind, overwatch, attackerUnitId, attackerModelId, weapon, targetUnitId, targetModelId, range,
    halfRange, inCover, charged: attackerUnit?.turn.chargedThisTurn ?? false,
    oathTarget: ctx.services.hooks.isOathTarget ? ctx.services.hooks.isOathTarget(s, attackerUnitId, targetUnitId) : false,
    attackerInEngagement: leaderService.inEngagementWithEnemy ? leaderService.inEngagementWithEnemy(s, attackerUnitId) : false,
  }
}

// a shapeless AttackContext for mortal-wound sources with no originating weapon attack (Deadly Demise, generic
// ability mortal wounds): only used to query Feel No Pain, which never reads `weapon` fields in this fixture set.
function nullAttackContext(targetUnitId: UnitId, targetModelId: ModelId): AttackContext {
  const placeholderWeapon: RuntimeWeapon = { id: '', name: '', kind: 'ranged', range: 0, A: 0, skill: null, S: 0, AP: 0, D: 0, abilities: [], profileGroup: null }
  return {
    kind: 'ranged', overwatch: false, attackerUnitId: targetUnitId, attackerModelId: '', weapon: placeholderWeapon,
    targetUnitId, targetModelId, range: Infinity, halfRange: false, inCover: false, charged: false, oathTarget: false,
    attackerInEngagement: false,
  }
}

// ---------- attacks count (R-6.5, Rapid Fire, Blast, Heavy is a hit-roll modifier not an attack-count one) ----------

function computeAttackCount(ctx: EngineContext, gi: number, group: AttackGroup, declared: DeclaredTarget | undefined): number | 'pending' {
  const s = ctx.state
  const attackerModelId = group.attackerModelIds[0]
  const attackerUnit = s.units[attackSeq(ctx).attackerUnitId]
  const weapon = weaponService.effectiveWeapon(s, attackerModelId, group.weaponId)
  let base: number
  if (declared?.attacks != null) {
    base = declared.attacks
  } else {
    const parsed = parseDiceExpr(weapon.A)
    if (parsed.count === 0) {
      base = parsed.flat
    } else {
      const modifiers = parsed.flat !== 0 ? [{ source: 'flat', value: parsed.flat }] : []
      const roll = ctx.rollOnce(`attacks:${gi}`, {
        purpose: 'attacks', player: attackerUnit.player, sides: parsed.sides ?? 6, count: parsed.count, mode: 'sum',
        modifiers, unitId: attackSeq(ctx).attackerUnitId, modelId: attackerModelId, weaponId: group.weaponId, commandRerollable: true,
      })
      if (!roll) return 'pending'
      base = rollSum(roll)
    }
  }
  const actx = buildAttackContext(ctx, attackSeq(ctx).attackerUnitId, attackSeq(ctx).overwatch, attackSeq(ctx).kind, attackerModelId, weapon, group.targetUnitId, null, false)
  const rf = weaponService.abilityValue(weapon, 'RAPID_FIRE')
  if (rf != null && actx.halfRange) base += toNumber(rf) || 1
  if (hasAbility(weapon, 'BLAST')) {
    const prefix = `blastCount:${group.targetUnitId}=`
    const snapshot = s.phaseState.marks.find((m) => m.startsWith(prefix))
    const targetSize = snapshot ? Number(snapshot.slice(prefix.length)) : unitModels(s, group.targetUnitId).length
    base += Math.floor(targetSize / 5)
  }
  for (const { result } of ctx.services.hooks.collect(ctx, 'onAttackCount', { attack: actx, attacks: base })) {
    if (result.kind === 'attacks' && result.delta) base += result.delta
  }
  return clampStat('A', base)
}

// ---------- current-attack lifecycle ----------

// item 10 (owner): attacks aimed at a target with no models left are lost — never rolled, never offered to a re-roll
// window. Every model of every half of an attached unit has to be gone (halves() is [] for a unit that no longer exists).
function targetGone(ctx: EngineContext, targetUnitId: UnitId): boolean {
  const s = ctx.state
  return leaderService.halves(s, targetUnitId).every((id) => !s.units[id] || unitModels(s, id).length === 0)
}

function freshDevastatingAttack(gi: number, attackerModelId: ModelId): CurrentAttack {
  return {
    groupIndex: gi, attackerModelId, stage: 'allocate', hit: null,
    wound: { die: 0, final: 0, critical: true, auto: false }, allocatedModelId: null,
    save: { kind: 'none', die: 0, final: 0, passed: false }, saveTargets: null, damage: null, cover: false,
  }
}

function isDevastatingSlot(cur: CurrentAttack): boolean { return cur.save?.kind === 'none' && cur.hit === null }

// one queued wounding attack becomes the attack currently being allocated / saved / damaged
function currentFromSlot(w: WoundSlot): CurrentAttack {
  return {
    groupIndex: w.groupIndex, attackerModelId: w.attackerModelId, stage: 'allocate', hit: { ...w.hit }, wound: { ...w.wound }, allocatedModelId: null,
    save: null, saveTargets: null, damage: null, cover: false, slot: w.slot, ...(w.saveDie !== undefined ? { saveDie: w.saveDie } : {}),
  }
}

function finishSlot(ctx: EngineContext, _gi: number, group: AttackGroup): void {
  const a = attackSeq(ctx)
  const cur = a.current
  if (!cur) return
  if (isDevastatingSlot(cur)) group.devastatingPending = Math.max(0, group.devastatingPending - 1)
  a.current = null
}

function groupHasNormalWork(g: AttackGroup): boolean {
  return g.attacks === 0 || g.resolved < g.attacks || (g.batch?.queue.length ?? 0) > 0
}

// ---------- merge runs (M9) ----------
// Consecutive groups against the same target with the same weapon profile (different firing models of one unit) are
// fast-rolled as ONE batch: one hit roll, one wound roll, one save roll, one decision per step. The first group of a run
// is its `runLead` and holds the `batch`; each die still knows its own firing model (range, Rapid Fire, cover, events).

function assignRuns(ctx: EngineContext, a: AttackSequenceState): void {
  if (a.groups.every((g) => g.runLead !== undefined)) return
  const s = ctx.state
  let lead = 0
  let prevKey = ''
  a.groups.forEach((g, j) => {
    const w = weaponService.effectiveWeapon(s, g.attackerModelIds[0], g.weaponId)
    const key = `${g.targetUnitId}|${g.weaponId}|${JSON.stringify(w)}`
    if (j === 0 || key !== prevKey) lead = j
    g.runLead = lead
    prevKey = key
  })
}

function runMembers(a: AttackSequenceState, lead: number): number[] {
  const out: number[] = []
  a.groups.forEach((g, j) => { if ((g.runLead ?? j) === lead) out.push(j) })
  return out
}

function leadBatch(a: AttackSequenceState, gi: number): GroupBatch | undefined {
  return a.groups[a.groups[gi].runLead ?? gi]?.batch
}

// ---------- fast-rolled hit / wound batches (M9) ----------
// Order inside a batch: roll → automatic ability re-rolls (one ctx.reroll) → at most one optional `rerollOffer` →
// one Command Re-roll window (rollOnce) → per-die evaluation. A die is never re-rolled twice (R-1.6).

interface D6Eval { unmodified: number; final: number; success: boolean; critical: boolean; kinds: Set<string> }

interface D6Opts { manualMods?: number[]; manualRerolls?: ('ones' | 'fails' | 'all')[]; overwatchAutoSix?: boolean; critBase?: number; source: 'hit' | 'wound'; autoFailAtOrBelow?: number }

// everything needed to judge ONE die of a batch (each die belongs to one firing model's attack)
interface DieCtx { actx: AttackContext; needed: number; opts: D6Opts }

function collectRollMods(ctx: EngineContext, hook: 'onHitRoll' | 'onWoundRoll', actx: AttackContext, roll: DiceRoll, dieIndex: number) {
  return ctx.services.hooks.collect(ctx, hook, {
    attack: actx, roll: { purpose: hook === 'onHitRoll' ? 'hit' : 'wound', roll, dieIndex, unmodified: roll.dice[dieIndex], rerolled: (roll.rerolled ?? []).includes(dieIndex) },
  }).map((r) => r.result).filter(isRoll)
}

function evalD6Die(ctx: EngineContext, hook: 'onHitRoll' | 'onWoundRoll', d: DieCtx, roll: DiceRoll, i: number): D6Eval {
  const { actx, needed, opts } = d
  const unmodified = roll.dice[i]
  const results = collectRollMods(ctx, hook, actx, roll, i)
  const ignoreMods = results.some((r) => r.ignoreModifiers)
  const net = ignoreMods ? 0 : clampHitWoundModifier(netModifier([
    ...results.filter((r) => r.modifier !== undefined).map((r) => ({ source: 'hook', value: r.modifier as number })),
    ...(opts.manualMods ?? []).map((v) => ({ source: 'manual', value: v })),
  ], null))
  const critThreshold = results.reduce((acc, r) => (r.critThreshold !== undefined ? Math.min(acc, r.critThreshold) : acc), opts.critBase ?? 6)
  const kinds = new Set<string>([...results.map((r) => r.reroll).filter((x): x is NonNullable<typeof x> => !!x), ...(opts.manualRerolls ?? [])])
  const autoPass = results.some((r) => r.autoPass)
  const autoFail = results.some((r) => r.autoFail)
  // a critical (unmodified 6, or an Anti-X threshold on a wound roll) always succeeds, regardless of modifiers
  const critical = opts.overwatchAutoSix ? unmodified === 6 : unmodified !== 1 && unmodified >= critThreshold
  const final = unmodified + net
  let success: boolean
  if (autoFail) success = false
  // SHOOT-041/WEAP-020: Indirect Fire vs an unseen target auto-fails an unmodified roll at or below this threshold
  else if (opts.autoFailAtOrBelow !== undefined && unmodified <= opts.autoFailAtOrBelow) success = false
  else if (autoPass || critical) success = true
  else if (opts.overwatchAutoSix) success = false
  else success = dieSucceeds(unmodified, final, needed, false)
  return { unmodified, final, success, critical, kinds }
}

function rollBatchD6(ctx: EngineContext, key: string, hook: 'onHitRoll' | 'onWoundRoll', dies: DieCtx[]): { evals: D6Eval[]; rollId: string } | 'pending' {
  const s = ctx.state
  const first = dies[0].actx
  const source = dies[0].opts.source
  const player = s.units[first.attackerUnitId].player
  const sameModel = dies.every((d) => d.actx.attackerModelId === first.attackerModelId)
  const sameNeeded = dies.every((d) => d.needed === dies[0].needed)
  const spec: RollSpec = {
    purpose: source, player, sides: 6, count: dies.length, mode: 'perDie', unitId: first.attackerUnitId, modelId: sameModel ? first.attackerModelId : null,
    weaponId: first.weapon.id, targetUnitId: first.targetUnitId, commandRerollable: true, ...(sameNeeded ? { needed: dies[0].needed } : {}),
  }
  const prefix = `roll:${key}=`
  if (!s.phaseState.marks.some((m) => m.startsWith(prefix))) {
    const fresh = ctx.roll(spec)
    s.phaseState.marks.push(prefix + fresh.id)
  }
  if (ctx.once(`autoReroll:${key}`)) {
    let roll = s.phaseState.lastRoll as DiceRoll
    const evals = roll.dice.map((_, i) => evalD6Die(ctx, hook, dies[i], roll, i))
    const auto: number[] = []
    evals.forEach((e, i) => {
      if (!canReroll(roll, i)) return
      if ((e.kinds.has('ones') && e.unmodified === 1) || ((e.kinds.has('fails') || e.kinds.has('all')) && !e.success)) auto.push(i)
    })
    if (auto.length > 0) roll = ctx.reroll(roll, auto, source)
    // R-6.24: whatever is still un-rerolled, passes, and may be re-rolled by an `all` source is offered (once per batch)
    const offer: number[] = []
    evals.forEach((e, i) => { if (canReroll(roll, i) && e.kinds.has('all') && e.success) offer.push(i) })
    if (offer.length > 0 && ctx.once(`rerollOffered:${key}`)) {
      ctx.decide({
        kind: 'chooseOption', player, window: 'any.rollMade', canPass: false,
        context: { topic: 'rerollOffer', unitId: first.attackerUnitId, abilityId: null, data: { rollId: roll.id, dieIndexes: offer, needed: dies[offer[0]].needed, purpose: source, key } },
        options: [
          { id: 'reroll', label: 'Re-roll', action: { type: 'chooseOption', player, decisionId: '', optionId: 'reroll' } },
          { id: 'keep', label: 'Keep', action: { type: 'chooseOption', player, decisionId: '', optionId: 'keep' } },
        ],
      })
      return 'pending'
    }
  }
  const roll = ctx.rollOnce(key, spec)
  if (!roll) return 'pending'
  return { evals: roll.dice.map((_, i) => evalD6Die(ctx, hook, dies[i], roll, i)), rollId: roll.id }
}

function newBatch(stage: GroupBatch['stage']): GroupBatch { return { stage, hits: [], queue: [], saveRoll: null, nextSlot: 0 } }

// ---------- hit batch ----------

function hitOpts(ctx: EngineContext, a: AttackSequenceState, group: AttackGroup, weapon: RuntimeWeapon, attackerModelId: ModelId): D6Opts {
  const s = ctx.state
  const manualMods: number[] = []
  const attackerUnit = s.units[a.attackerUnitId]
  if (hasAbility(weapon, 'HEAVY') && attackerUnit.turn.moveType === 'stationary' && !attackerUnit.turn.arrivedThisTurn) manualMods.push(1)
  let indirectNoLos = false
  if (a.kind === 'ranged') {
    // SHOOT-036-attached (R-6.8): Stealth only if EVERY model of the (possibly attached) target has it
    const targetHalves = leaderService.halves(s, group.targetUnitId).filter((id) => s.units[id]?.location === 'board' && unitModels(s, id).length > 0)
    const stealthHalves = targetHalves.length > 0 ? targetHalves : [group.targetUnitId]
    if (stealthHalves.every((id) => datasheetOf(s, id).coreAbilities.some((c) => c.ability === 'STEALTH'))) manualMods.push(-1)
    // SHOOT-041/WEAP-020: Indirect Fire vs a target with no visible model — -1 to hit, and (below) an unmodified
    // roll of 3 or less always fails; the target still counts as being in cover (R-3.14, applied at allocation).
    // Frozen at `attack.begin` (target declaration), not re-evaluated live here — see module header.
    if (hasAbility(weapon, 'INDIRECT_FIRE') && s.phaseState.marks.includes(`indirectNoLos:${attackerModelId}:${group.targetUnitId}=1`)) {
      indirectNoLos = true
      manualMods.push(-1)
    }
    // SHOOT-005/007 Big Guns Never Tire: see module header (snapshotted at `attack.begin`).
    if (!hasAbility(weapon, 'PISTOL')) {
      const attackerEngaged = s.phaseState.marks.includes('bgntAttacker=1')
      const targetEngaged = s.phaseState.marks.includes(`bgntTarget:${group.targetUnitId}=1`)
      if (attackerEngaged || targetEngaged) manualMods.push(-1)
    }
  }
  return { manualMods, overwatchAutoSix: a.overwatch, source: 'hit', autoFailAtOrBelow: indirectNoLos ? 3 : undefined }
}

function doHitBatch(ctx: EngineContext, lead: number): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  const s = ctx.state
  const attackerUnit = s.units[a.attackerUnitId]
  const batch = newBatch('wound')
  const dies: DieCtx[] = []
  const meta: { gi: number; model: ModelId; weapon: RuntimeWeapon }[] = []
  for (const j of runMembers(a, lead)) {
    const g = a.groups[j]
    const model = g.attackerModelIds[0]
    const weapon = weaponService.effectiveWeapon(s, model, g.weaponId)
    const actx = buildAttackContext(ctx, a.attackerUnitId, a.overwatch, a.kind, model, weapon, g.targetUnitId, null, false)
    if (hasAbility(weapon, 'TORRENT')) {
      for (let i = 0; i < g.attacks; i++) {
        batch.hits.push({ groupIndex: j, attackerModelId: model, die: 0, final: 0, critical: false, lethal: false, extra: false })
        ctx.emit({ type: 'HitRolled', attack: rollAttackCtx(actx), die: 0, final: 0, hit: true, critical: false, extraHits: 0, auto: true })
      }
      continue
    }
    const opts = hitOpts(ctx, a, g, weapon, model)
    // Overwatch hits only on an unmodified 6, so the roll (and the tray/log reading it) must say 6+, not the weapon's skill
    const needed = a.overwatch ? 6 : weapon.skill ?? 7
    for (let i = 0; i < g.attacks; i++) { dies.push({ actx, needed, opts }); meta.push({ gi: j, model, weapon }) }
  }
  if (dies.length > 0) {
    const res = rollBatchD6(ctx, `hit:${lead}`, 'onHitRoll', dies)
    if (res === 'pending') return 'pending'
    res.evals.forEach((r, i) => {
      const { gi, model, weapon } = meta[i]
      let extraHits = 0
      if (r.success && r.critical) {
        const sh = weaponService.abilityValue(weapon, 'SUSTAINED_HITS')
        if (sh != null) extraHits = Math.max(0, ctx.rollExpr(sh, { purpose: 'ability', player: attackerUnit.player, unitId: a.attackerUnitId }).total)
      }
      ctx.emit({ type: 'HitRolled', attack: rollAttackCtx(dies[i].actx), die: r.unmodified, final: r.final, hit: r.success, critical: r.critical, extraHits, auto: false, rollId: res.rollId, dieIndex: i })
      if (!r.success) return
      const lethal = r.critical && hasAbility(weapon, 'LETHAL_HITS')
      batch.hits.push({ groupIndex: gi, attackerModelId: model, die: r.unmodified, final: r.final, critical: r.critical, lethal, extra: false })
      if (lethal) ctx.emit({ type: 'WoundRolled', attack: rollAttackCtx(dies[i].actx), die: 0, final: 0, needed: 0, wounded: true, critical: false, auto: true })
      // WEAP-008-dice/WEAP-011: Sustained Hits bonus hits are ordinary hits (never critical, so never Lethal) that follow their source
      for (let e = 0; e < extraHits; e++) batch.hits.push({ groupIndex: gi, attackerModelId: model, die: r.unmodified, final: r.final, critical: false, lethal: false, extra: true })
    })
  }
  a.groups[lead].batch = batch
  return 'progress'
}

// ---------- wound batch ----------

function woundDie(ctx: EngineContext, a: AttackSequenceState, group: AttackGroup): DieCtx & { weapon: RuntimeWeapon } {
  const s = ctx.state
  const model = group.attackerModelIds[0]
  const weapon = weaponService.effectiveWeapon(s, model, group.weaponId)
  const actx = buildAttackContext(ctx, a.attackerUnitId, a.overwatch, a.kind, model, weapon, group.targetUnitId, null, false)
  const statFor = ctx.services.hooks.statFor
  // SHOOT-018-statmod: effectiveWeapon already folded S modifiers in — applying statFor again would double them
  const S = weapon.S
  const bodyguardId = s.units[group.targetUnitId]?.bodyguardUnitId ?? group.targetUnitId
  const tModel = s.units[bodyguardId]?.models[0]
  const baseT = leaderService.toughnessFor ? leaderService.toughnessFor(s, group.targetUnitId) : modelStats(s, s.models[tModel ?? ''])?.T ?? 4
  const T = statFor && tModel ? statFor(s, { unitId: bodyguardId, modelId: tModel, weapon: null, stat: 'T' }, baseT) : baseT
  const needed = woundRollNeeded(S, T)

  const manualMods: number[] = []
  if (hasAbility(weapon, 'LANCE') && actx.charged) manualMods.push(1)
  const manualRerolls: ('all' | 'fails')[] = []
  if (hasAbility(weapon, 'TWIN_LINKED')) manualRerolls.push('all')

  const targetKeywords = ctx.services.hooks.keywordsFor ? ctx.services.hooks.keywordsFor(s, group.targetUnitId) : keywordsOf(s, group.targetUnitId)
  let critBase = 6
  for (const ab of weapon.abilities) {
    if (ab.ability === 'ANTI' && ab.keyword && targetKeywords.includes(ab.keyword)) critBase = Math.min(critBase, toNumber(ab.value) || 6)
  }
  return { actx, needed, opts: { manualMods, manualRerolls, critBase, source: 'wound' }, weapon }
}

function doWoundBatch(ctx: EngineContext, lead: number): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  const batch = a.groups[lead].batch as GroupBatch
  const perGroup = new Map<number, DieCtx & { weapon: RuntimeWeapon }>()
  const dieFor = (j: number) => { let d = perGroup.get(j); if (!d) { d = woundDie(ctx, a, a.groups[j]); perGroup.set(j, d) } return d }

  const rolled = batch.hits.filter((h) => !h.lethal)
  let evals: D6Eval[] = []
  let rollId: string | undefined
  if (rolled.length > 0) {
    const r = rollBatchD6(ctx, `wound:${lead}`, 'onWoundRoll', rolled.map((h) => dieFor(h.groupIndex)))
    if (r === 'pending') return 'pending'
    evals = r.evals
    rollId = r.rollId
  }
  let k = 0
  for (const h of batch.hits) {
    const hitInfo = { die: h.die, final: h.final, critical: h.critical, extraHits: 0 }
    if (h.lethal) {
      batch.queue.push({ slot: batch.nextSlot++, groupIndex: h.groupIndex, attackerModelId: h.attackerModelId, hit: hitInfo, wound: { die: 0, final: 0, critical: false, auto: true } })
      continue
    }
    const idx = k++
    const r = evals[idx]
    const d = dieFor(h.groupIndex)
    ctx.emit({ type: 'WoundRolled', attack: rollAttackCtx(d.actx), die: r.unmodified, final: r.final, needed: d.needed, wounded: r.success, critical: r.critical, auto: false, rollId, dieIndex: idx })
    if (!r.success) continue
    if (r.critical && hasAbility(d.weapon, 'DEVASTATING_WOUNDS')) { a.groups[h.groupIndex].devastatingPending += 1; continue }
    batch.queue.push({ slot: batch.nextSlot++, groupIndex: h.groupIndex, attackerModelId: h.attackerModelId, hit: hitInfo, wound: { die: r.unmodified, final: r.final, critical: r.critical, auto: false } })
  }
  batch.stage = 'save'
  for (const j of runMembers(a, lead)) a.groups[j].resolved = a.groups[j].attacks
  return 'progress'
}

function doBatchStages(ctx: EngineContext, lead: number): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  if (!a.groups[lead].batch) return doHitBatch(ctx, lead)
  return doWoundBatch(ctx, lead)
}

// ---------- allocation (R-6.13, R-10.1 leaders/Precision) ----------

function priorityPool(s: GameState, eligible: ModelId[]): ModelId[] {
  const priority = eligible.filter((id) => {
    const m = s.models[id]
    return m && (m.woundsRemaining < modelStats(s, m).W || m.flags.allocatedThisPhase)
  })
  return priority.length > 0 ? priority : eligible
}

// one allocation slot's identity (a queued wounding attack, or a deferred Devastating critical)
function precisionDeclinedKey(cur: CurrentAttack, gi: number, group: AttackGroup): string {
  return isDevastatingSlot(cur) ? `precisionDeclined:dev:${gi}:${group.devastatingPending}` : `precisionDeclined:${gi}:${cur.slot ?? 0}`
}

// R-3.14 benefit of cover for `modelId` against this group's weapon (before the Ignores-Cover save hook, applied in saveSetup)
function coverFor(ctx: EngineContext, group: AttackGroup, attackerModelId: ModelId, modelId: ModelId): boolean {
  const a = attackSeq(ctx)
  const s = ctx.state
  const model = s.models[modelId]
  const weapon = weaponService.effectiveWeapon(s, attackerModelId, group.weaponId)
  // R-3.14: terrain-derived cover (los.benefitOfCover, which already denies itself for melee/[IGNORES COVER]) OR a
  // granted Benefit of Cover (Go to Ground, Smokescreen) — the latter isn't weapon-aware, so gate it on Ignores Cover here
  const terrainCover = ctx.services.los.benefitOfCover(s, modelId, a.attackerUnitId, weapon)
  const grantedCover = weapon.kind === 'ranged' && !hasAbility(weapon, 'IGNORES_COVER') && !!ctx.services.hooks.hasBenefitOfCover?.(s, group.targetUnitId)
  // SHOOT-041/WEAP-020: firing Indirect at a target with no visible model always grants it the benefit of cover.
  // Frozen at `attack.begin` (target declaration) via the `indirectNoLos` mark, not re-evaluated live here — same
  // snapshot the -1 to-hit modifier above reads (SHOOT-041-cover-snapshot; see module header).
  const indirectCover = a.kind === 'ranged' && hasAbility(weapon, 'INDIRECT_FIRE') && s.phaseState.marks.includes(`indirectNoLos:${attackerModelId}:${group.targetUnitId}=1`)
  let cover = terrainCover || grantedCover || indirectCover
  // SHOOT-041-sv3 (R-3.12): a Sv 3+ or better model gets no cover bonus against AP 0, whatever the cover's source
  if (cover && model && weapon.AP === 0) {
    const baseSv = modelStats(s, model).Sv
    const sv = ctx.services.hooks.statFor ? ctx.services.hooks.statFor(s, { unitId: model.unitId, modelId, weapon: null, stat: 'Sv' }, baseSv) : baseSv
    if (sv <= 3) cover = false
  }
  return cover
}

// `markAllocated` false = a fast-rolled save that already passed, allocated to an arbitrary interchangeable model: the
// R-6.13 "must keep allocating to it" flag is only set when the allocation is a real choice the defender made
function finalizeAllocation(ctx: EngineContext, gi: number, group: AttackGroup, modelId: ModelId, markAllocated = true): void {
  const a = attackSeq(ctx)
  const cur = a.current as CurrentAttack
  const s = ctx.state
  const model = s.models[modelId]
  cur.allocatedModelId = modelId
  if (model && markAllocated) model.flags.allocatedThisPhase = true
  const weapon = weaponService.effectiveWeapon(s, cur.attackerModelId, group.weaponId)
  const cover = coverFor(ctx, group, cur.attackerModelId, modelId)
  cur.cover = cover
  const actx = buildAttackContext(ctx, a.attackerUnitId, a.overwatch, a.kind, cur.attackerModelId, weapon, group.targetUnitId, modelId, cover)
  ctx.emit({ type: 'AttackAllocated', attack: rollAttackCtx(actx), modelId, cover })
  cur.stage = isDevastatingSlot(cur) ? 'damage' : 'save'
}

function doAllocateStage(ctx: EngineContext, gi: number, group: AttackGroup): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  const cur = a.current as CurrentAttack
  const s = ctx.state
  const weapon = weaponService.effectiveWeapon(s, cur.attackerModelId, group.weaponId)
  const targetUnitId = group.targetUnitId
  const precision = hasAbility(weapon, 'PRECISION')
  const eligible = leaderService.allocatableModels
    ? leaderService.allocatableModels(s, targetUnitId)
    : unitModels(s, targetUnitId).map((m) => m.id)
  if (precision && !ctx.marked(precisionDeclinedKey(cur, gi, group))) {
    // WEAP-025/026 (R-7 [PRECISION]): the ATTACKING player may put this attack (or its Devastating Wounds mortal
    // wounds) on a visible attached CHARACTER that normal allocation would shield. Offered as an allocateAttack
    // decision to the attacker (options = those CHARACTER models; pass = allocate normally). A CHARACTER picked this
    // way bypasses the R-6.13 wounded/allocated-first rule, which governs only the defender's normal allocation.
    const chars = leaderService.halves(s, targetUnitId).flatMap((id) => unitModels(s, id)).filter((m) => hasKeyword(s, m.unitId, 'CHARACTER'))
    const visibleCharacterIds = chars.filter((m) => !eligible.includes(m.id) && ctx.services.los.visible(s, cur.attackerModelId, m.id)).map((m) => m.id)
    if (visibleCharacterIds.length > 0) {
      const attacker = s.units[a.attackerUnitId].player
      ctx.decide({
        kind: 'allocateAttack', player: attacker, window: s.phase === 'fight' ? 'fight.targetsDeclared' : 'shooting.start',
        canPass: true,
        context: { targetUnitId, attackerUnitId: a.attackerUnitId, eligibleModels: visibleCharacterIds, precision: true, damage: isDevastatingSlot(cur) ? 1 : null, mortal: isDevastatingSlot(cur) },
        options: visibleCharacterIds.map((id) => ({ id, label: `precision: allocate to ${id}`, action: { type: 'allocateAttack', player: attacker, decisionId: '', modelId: id } })),
      })
      return 'pending'
    }
  }
  const pool = priorityPool(s, eligible)
  if (pool.length === 0) { finishSlot(ctx, gi, group); return 'progress' }
  // fast-rolled save that already PASSED: the choice of model is meaningless (every candidate saves identically), so
  // don't ask the defender — only failed saves open an allocation decision (when there is a real choice to make)
  const saveRoll = leadBatch(a, gi)?.saveRoll
  if (pool.length > 1 && cur.saveDie !== undefined && saveRoll && !isDevastatingSlot(cur)) {
    const probe = pool[0]
    const setup = saveSetup(ctx, group, cur.attackerModelId, probe, coverFor(ctx, group, cur.attackerModelId, probe))
    if (setup && !setup.impossible && evaluateSave(ctx, setup, saveRoll, cur.saveDie).saved) {
      finalizeAllocation(ctx, gi, group, probe, pool !== eligible)
      return 'progress'
    }
  }
  if (pool.length === 1) { finalizeAllocation(ctx, gi, group, pool[0]); return 'progress' }
  const owner = s.units[targetUnitId].player
  const isMortal = isDevastatingSlot(cur)
  ctx.decide({
    kind: 'allocateAttack', player: owner, window: s.phase === 'fight' ? 'fight.targetsDeclared' : 'shooting.start',
    canPass: false,
    context: { targetUnitId, attackerUnitId: a.attackerUnitId, eligibleModels: pool, precision, damage: isMortal ? 1 : null, mortal: isMortal },
    options: pool.map((id) => ({ id, label: `allocate to ${id}`, action: { type: 'allocateAttack', player: owner, decisionId: '', modelId: id } })),
  })
  return 'pending'
}

// ---------- save stage (R-6.14, R-3.11-3.14 cover, R-6.21 modifier caps) ----------

/** The d6 a save of this kind has to beat, given the modifiers in force (R-6.14, R-6.21).
 *
 *  The engine resolves a save as `die + ap + min(1, positive) + negative >= needed`, with an
 *  unmodified 1 always failing, so the number the player actually has to roll is that inequality
 *  rearranged. Positive modifiers are capped at +1 in total (the cover bonus is one of them);
 *  negatives are not, matching the comparison in `evaluateSave`. A result above 6 means the save
 *  cannot be made at all — `saveSetup`'s impossibility check (`bestPossible`) is this same arithmetic.
 *
 *  The automatic armour-or-invulnerable pick and the numbers published on the attack both read
 *  from here, so what a UI shows can never differ from what the dice are judged against. */
function saveTarget(needed: number, ap: number, positive: number, negative: number): number {
  return Math.max(2, needed - ap - Math.min(1, positive) - negative)
}

function collectSaveMods(ctx: EngineContext, actx: AttackContext, roll: DiceRoll, dieIndex = 0) {
  return ctx.services.hooks.collect(ctx, 'onSaveRoll', { attack: actx, roll: { purpose: 'save', roll, dieIndex, unmodified: roll.dice[dieIndex], rerolled: (roll.rerolled ?? []).includes(dieIndex) } })
    .map((r) => r.result).filter(isRoll)
}

interface SaveSetup {
  actx: AttackContext
  kind: 'armour' | 'invuln'
  needed: number
  ap: number
  cover: boolean
  /** even an unmodified 6 cannot make the save (R-6.14/SHOOT-026) */
  impossible: boolean
  /** the d6 the chosen (lower-roll) save has to beat */
  targetRoll: number
  saveTargets: NonNullable<CurrentAttack['saveTargets']>
}

// Everything about how `modelId` saves against this group's weapon, minus the die. The engine picks the save that
// needs the LOWER roll (a tie goes to armour) — the old armour-or-invulnerable prompt is gone (M9).
function saveSetup(ctx: EngineContext, group: AttackGroup, attackerModelId: ModelId, modelId: ModelId, rawCover: boolean): SaveSetup | null {
  const a = attackSeq(ctx)
  const s = ctx.state
  const model = s.models[modelId]
  if (!model) return null
  const weapon = weaponService.effectiveWeapon(s, attackerModelId, group.weaponId)
  const actx = buildAttackContext(ctx, a.attackerUnitId, a.overwatch, a.kind, attackerModelId, weapon, group.targetUnitId, modelId, rawCover)
  const preFake = fakeRoll('save', s.units[model.unitId].player, model.unitId, modelId)
  const preResults = collectSaveMods(ctx, actx, preFake)
  const ignoreCoverHook = preResults.some((r) => r.ignoreCover)
  const cover = rawCover && !ignoreCoverHook
  let invuln: number | null = datasheetOf(s, model.unitId).invuln
  for (const r of preResults) if (r.invuln !== undefined) invuln = invuln === null ? r.invuln : Math.min(invuln, r.invuln)

  // Modifiers from the pre-pass. These don't depend on the die's value (the impossibility check relies on the same thing).
  let hookPositive = 0
  let preNegative = 0
  for (const r of preResults) {
    if (r.modifier === undefined) continue
    if (r.modifier > 0) hookPositive += r.modifier
    else preNegative += r.modifier
  }
  const sv = ctx.services.hooks.statFor ? ctx.services.hooks.statFor(s, { unitId: model.unitId, modelId, weapon: null, stat: 'Sv' }, modelStats(s, model).Sv) : modelStats(s, model).Sv
  // Cover only ever helps an armour save (R-3.11); AP only ever hurts one.
  const armourTarget = saveTarget(sv, weapon.AP, hookPositive + (cover ? 1 : 0), preNegative)
  const invulnTarget = invuln === null ? null : saveTarget(invuln, 0, hookPositive, preNegative)
  const kind: 'armour' | 'invuln' = invulnTarget !== null && invulnTarget < armourTarget ? 'invuln' : 'armour'
  const needed = kind === 'armour' ? sv : (invuln as number)
  const ap = kind === 'armour' ? weapon.AP : 0
  const prePositive = hookPositive + (kind === 'armour' && cover ? 1 : 0)
  const bestPossible = 6 + ap + Math.min(1, prePositive) + preNegative
  return {
    actx, kind, needed, ap, cover, impossible: bestPossible < needed,
    targetRoll: kind === 'armour' ? armourTarget : (invulnTarget as number),
    saveTargets: { sv, ap: weapon.AP, cover, armour: armourTarget, invuln: invulnTarget },
  }
}

function evaluateSave(ctx: EngineContext, setup: SaveSetup, roll: DiceRoll, dieIndex: number): { unmodified: number; final: number; saved: boolean } {
  const unmodified = roll.dice[dieIndex]
  const results = collectSaveMods(ctx, setup.actx, roll, dieIndex)
  let positive = setup.kind === 'armour' && setup.cover ? 1 : 0
  let negative = 0
  for (const r of results) {
    if (r.modifier === undefined) continue
    if (r.modifier > 0) positive += r.modifier
    else negative += r.modifier
  }
  const final = unmodified + setup.ap + Math.min(1, positive) + negative
  return { unmodified, final, saved: unmodified !== 1 && final >= setup.needed }
}

function doSaveStage(ctx: EngineContext, gi: number, group: AttackGroup): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  const cur = a.current as CurrentAttack
  const s = ctx.state
  const weapon = weaponService.effectiveWeapon(s, cur.attackerModelId, group.weaponId)
  const modelId = cur.allocatedModelId as ModelId
  const model = s.models[modelId]
  if (!model) { finishSlot(ctx, gi, group); return 'progress' }
  const setup = saveSetup(ctx, group, cur.attackerModelId, modelId, cur.cover)
  if (!setup) { finishSlot(ctx, gi, group); return 'progress' }
  const { actx, kind, needed } = setup
  // Published on the attack so the client can show the real numbers (also for a Command Re-roll offer on an
  // individually rolled save, which opens before SaveRolled is emitted). Recomputed from scratch on every re-entry.
  cur.saveTargets = setup.saveTargets

  // R-6.14/SHOOT-026: when even an unmodified 6 could not reach `needed`, the save is impossible — record it as
  // failed without rolling (modifiers here don't depend on the die's value, so the pre-pass numbers already apply).
  if (setup.impossible) {
    ctx.emit({ type: 'SaveRolled', attack: rollAttackCtx(actx), modelId, kind, die: 0, final: 0, needed, saved: false })
    cur.save = { kind, die: 0, final: 0, passed: false }
    cur.stage = 'damage'
    return 'progress'
  }

  let roll: DiceRoll
  let dieIndex = 0
  const batchRoll = leadBatch(a, gi)?.saveRoll
  if (cur.saveDie !== undefined && batchRoll) {
    roll = batchRoll
    dieIndex = cur.saveDie
  } else {
    // WEAP-008-dice/WEAP-011: per-slot key so a Sustained Hits extra hit's save never reuses the primary attack's roll
    const r = ctx.rollOnce(`save:${gi}:${cur.slot ?? 0}`, { purpose: 'save', player: s.units[model.unitId].player, sides: 6, count: 1, mode: 'perDie', unitId: model.unitId, modelId, weaponId: weapon.id, targetUnitId: group.targetUnitId, commandRerollable: true, needed: setup.targetRoll })
    if (!r) return 'pending'
    roll = r
  }
  const ev = evaluateSave(ctx, setup, roll, dieIndex)
  ctx.emit({ type: 'SaveRolled', attack: rollAttackCtx(actx), modelId, kind, die: ev.unmodified, final: ev.final, needed, saved: ev.saved, ...(cur.saveDie !== undefined && batchRoll ? { rollId: roll.id, dieIndex } : {}) })
  cur.save = { kind, die: ev.unmodified, final: ev.final, passed: ev.saved }
  if (ev.saved) { finishSlot(ctx, gi, group); return 'progress' }
  cur.stage = 'damage'
  return 'progress'
}

// Fast-rolled saves (M9): ONE DiceRoll (one Command Re-roll window) for every wounding attack of the merge run when the
// defender cannot tell its candidate models apart — every (firing model, candidate model) pair needs the same d6 (after AP,
// cover, invuln and modifiers) and the candidates share one Feel No Pain. Returns that shared target, or null = keep
// per-attack rolls (Precision, impossible saves, or a mixed pool such as a Leader with a better save).
function saveBatchTarget(ctx: EngineContext, lead: number): number | null {
  const s = ctx.state
  const a = attackSeq(ctx)
  const group = a.groups[lead]
  const b = group.batch as GroupBatch
  const weapon = weaponService.effectiveWeapon(s, group.attackerModelIds[0], group.weaponId)
  if (hasAbility(weapon, 'PRECISION')) return null
  const eligible = leaderService.allocatableModels ? leaderService.allocatableModels(s, group.targetUnitId) : unitModels(s, group.targetUnitId).map((m) => m.id)
  if (eligible.length === 0) return null
  const attackers = [...new Set(b.queue.map((w) => w.attackerModelId))]
  let sig: string | null = null
  let target: number | null = null
  for (const id of eligible) {
    const model = s.models[id]
    if (!model) return null
    for (const attackerModelId of attackers) {
      const setup = saveSetup(ctx, group, attackerModelId, id, coverFor(ctx, group, attackerModelId, id))
      if (!setup || setup.impossible) return null
      const key = `${setup.targetRoll}|${bestFeelNoPain(ctx, model, setup.actx)}`
      if (sig === null) { sig = key; target = setup.targetRoll } else if (sig !== key) return null
    }
  }
  return target
}

function doSaveBatch(ctx: EngineContext, lead: number): 'pending' | 'progress' {
  const s = ctx.state
  const a = attackSeq(ctx)
  const group = a.groups[lead]
  const b = group.batch as GroupBatch
  const target = saveBatchTarget(ctx, lead)
  if (target === null) { b.stage = 'apply'; return 'progress' }
  const player = s.units[group.targetUnitId].player
  const roll = ctx.rollOnce(`save:${lead}:b`, {
    purpose: 'save', player, sides: 6, count: b.queue.length, mode: 'perDie', unitId: group.targetUnitId, weaponId: group.weaponId,
    targetUnitId: group.targetUnitId, commandRerollable: true, needed: target,
  })
  if (!roll) return 'pending'
  b.saveRoll = roll
  b.queue.forEach((slot, j) => { slot.saveDie = j })
  b.stage = 'apply'
  return 'progress'
}

// ---------- Feel No Pain (R-10.5) ----------

function bestFeelNoPain(ctx: EngineContext, model: Model, actx: AttackContext): number | null {
  const s = ctx.state
  const ds = datasheetOf(s, model.unitId)
  let best: number | null = null
  const core = ds.coreAbilities.find((c) => c.ability === 'FEEL_NO_PAIN')
  if (core) best = toNumber(core.value) || 6
  const fake = fakeRoll('fnp', s.units[model.unitId].player, model.unitId, model.id)
  const results = ctx.services.hooks.collect(ctx, 'onFeelNoPainRoll', { attack: actx, roll: { purpose: 'fnp', roll: fake, dieIndex: 0, unmodified: 0, rerolled: false } })
    .map((r) => r.result).filter(isRoll)
  for (const r of results) if (r.feelNoPain !== undefined) best = best === null ? r.feelNoPain : Math.min(best, r.feelNoPain)
  return best
}

// applies one point of damage to `model` (FNP first); returns true if the point was actually lost (not ignored) and
// whether the model died. FNP rolls are not Command-Reroll-eligible (not in the core stratagem's roll list) so a
// plain, non-reentrant roll is safe here.
function applyOnePoint(ctx: EngineContext, model: Model, actx: AttackContext, source: AttackRollContext | { abilityId: string } | { stratagemId: string }, mortal: boolean): boolean {
  const s = ctx.state
  const threshold = bestFeelNoPain(ctx, model, actx)
  let ignored = false
  if (threshold !== null) {
    const roll = ctx.roll({ purpose: 'fnp', player: s.units[model.unitId].player, sides: 6, count: 1, mode: 'perDie', unitId: model.unitId, modelId: model.id, commandRerollable: false })
    const die = roll.dice[0]
    ignored = die >= threshold
    ctx.emit({ type: 'FeelNoPainRolled', unitId: model.unitId, modelId: model.id, die, needed: threshold, ignored })
  }
  if (ignored) return false
  model.woundsRemaining -= 1
  ctx.emit({ type: 'DamageApplied', unitId: model.unitId, modelId: model.id, amount: 1, mortal, woundsRemaining: Math.max(0, model.woundsRemaining), source })
  return model.woundsRemaining <= 0
}

// ---------- damage stage (normal attack, R-6.15; devastating-wound mortal batch, R-7) ----------

function doDamageStage(ctx: EngineContext, gi: number, group: AttackGroup): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  const cur = a.current as CurrentAttack
  const s = ctx.state
  const weapon = weaponService.effectiveWeapon(s, cur.attackerModelId, group.weaponId)
  const modelId = cur.allocatedModelId as ModelId
  const devastating = isDevastatingSlot(cur)
  const actx = buildAttackContext(ctx, a.attackerUnitId, a.overwatch, a.kind, cur.attackerModelId, weapon, group.targetUnitId, modelId, cur.cover)

  if (cur.damage === null) {
    const parsed = parseDiceExpr(weapon.D)
    let dmg: number
    if (parsed.count === 0) {
      dmg = parsed.flat
    } else {
      const modifiers = parsed.flat !== 0 ? [{ source: 'flat', value: parsed.flat }] : []
      // WEAP-012-dmg: each deferred Devastating Wounds critical is its own damage roll — key it by the slot's own
      // pending index (which counts strictly down, see finishSlot) instead of `group.resolved` (already pinned at
      // `attacks` for every deferred critical in the group, which made them all reuse the first one's roll).
      // WEAP-008-dice/WEAP-011: normal attacks get the same per-slot suffix as wound/save, for the same reason.
      const key = devastating ? `devdmg:${gi}:${group.devastatingPending}` : `damage:${gi}:${cur.slot ?? 0}`
      const player = s.units[a.attackerUnitId].player
      const roll = ctx.rollOnce(key, { purpose: 'damage', player, sides: parsed.sides ?? 6, count: parsed.count, mode: 'sum', modifiers, unitId: a.attackerUnitId, modelId: cur.attackerModelId, weaponId: weapon.id, targetUnitId: group.targetUnitId, commandRerollable: true })
      if (!roll) return 'pending'
      dmg = rollSum(roll)
    }
    if (!devastating) {
      const melta = weaponService.abilityValue(weapon, 'MELTA')
      if (melta != null && actx.halfRange) dmg += toNumber(melta)
      for (const { source, result } of ctx.services.hooks.collect(ctx, 'onDamage', { attack: actx, targetUnitId: group.targetUnitId, targetModelId: modelId, damage: dmg, mortal: false })) {
        if (result.kind === 'request') { ctx.services.hooks.apply(ctx, source, result); continue }
        if (result.kind !== 'damage') continue
        if (result.delta) dmg += result.delta
        // WEAP-037-min (20-data damageReduction min 1): reduction can never take a still-live attack (dmg >= 1)
        // below 1 point of damage — only an attack that was already 0 stays at 0.
        if (result.reduction) dmg = dmg > 0 ? Math.max(1, dmg - result.reduction) : 0
        if (result.halve) dmg = Math.ceil(dmg / 2)
        if (result.set !== undefined) dmg = result.set
      }
    }
    cur.damage = Math.max(0, Math.round(dmg))
  }

  const model = s.models[modelId]
  if (!model || cur.damage <= 0) { finishSlot(ctx, gi, group); return 'progress' }
  const died = applyOnePoint(ctx, model, actx, rollAttackCtx(actx), devastating)
  cur.damage -= 1
  if (died) {
    attackService.destroyModel(ctx, model.id, { player: s.units[a.attackerUnitId]?.player ?? null, unitId: a.attackerUnitId, modelId: cur.attackerModelId, kind: a.kind })
    cur.damage = 0 // R-6.15/6.17: excess from a single attack (normal or devastating) is lost, never spills
    finishSlot(ctx, gi, group)
    return 'progress'
  }
  if (cur.damage <= 0) { finishSlot(ctx, gi, group); return 'progress' }
  return 'progress'
}

// ---------- mortal-wound queue (R-6.16-6.19): generic path for abilities, Deadly Demise, Hazardous spillover ----------

// disambiguates one "point" of a mortal-wound batch: stable across the decide()/handle() pair for that point (nothing
// else mutates entry.count in between), distinct from the next point once count has been decremented
function mortalAllocKey(entry: { source: string; targetUnitId: UnitId; count: number }): string {
  return `mortalAlloc:${entry.source}:${entry.targetUnitId}:${entry.count}`
}

function drainOneMortalPoint(ctx: EngineContext): 'pending' | 'progress' {
  const a = attackSeq(ctx)
  const s = ctx.state
  const entry = a.mortalQueue[0]
  if (!entry) return 'progress'
  const unit = s.units[entry.targetUnitId]
  // LEAD-014: `entry.targetUnitId` names the bodyguard record, and it flips to 'destroyed' the instant its last
  // model dies — but while the detach is deferred (see destroyModel) the attached CHARACTER is still reachable
  // through leaderService.halves, and R-10.1 spillover must still reach it. Only drop the batch once BOTH halves
  // (or the lone unit, if unattached) are gone.
  const halves = leaderService.halves ? leaderService.halves(s, entry.targetUnitId) : [entry.targetUnitId]
  const anyAlive = halves.some((id) => s.units[id] && s.units[id].location !== 'destroyed')
  if (!unit || !anyAlive || entry.count <= 0) { a.mortalQueue = a.mortalQueue.slice(1); return 'progress' }
  const eligible = leaderService.allocatableModels ? leaderService.allocatableModels(s, entry.targetUnitId) : unitModels(s, entry.targetUnitId).map((m) => m.id)
  const pool = priorityPool(s, eligible)
  if (pool.length === 0) { a.mortalQueue = a.mortalQueue.slice(1); return 'progress' }
  let modelId = pool[0]
  if (pool.length > 1) {
    const markKey = mortalAllocKey(entry)
    if (!ctx.marked(markKey)) {
      ctx.once(markKey)
      const owner = unit.player
      ctx.decide({
        kind: 'allocateAttack', player: owner, window: 'any.rollMade', canPass: false,
        context: { targetUnitId: entry.targetUnitId, attackerUnitId: a.attackerUnitId, eligibleModels: pool, precision: false, damage: 1, mortal: true },
        options: pool.map((id) => ({ id, label: `allocate to ${id}`, action: { type: 'allocateAttack', player: owner, decisionId: '', modelId: id } })),
      })
      return 'pending'
    }
    // decision already answered this exact point via the handler, which stashed the chosen id under `markKey`
    const chosen = s.phaseState.marks.find((m) => m.startsWith(`${markKey}=`))
    if (chosen) modelId = chosen.slice(markKey.length + 1) as ModelId
  }
  const model = s.models[modelId]
  if (!model) { a.mortalQueue = a.mortalQueue.slice(1); return 'progress' }
  const actx = nullAttackContext(entry.targetUnitId, modelId)
  const died = applyOnePoint(ctx, model, actx, { abilityId: entry.source }, true)
  entry.count -= 1
  if (died) {
    attackService.destroyModel(ctx, model.id, { player: null, unitId: null, modelId: null, kind: 'mortal' })
    if (entry.lostOnDeath) entry.count = 0 // R-6.17: Hazardous/Devastating batches don't spill; generic ones do (next tick re-picks a model)
  }
  if (entry.count <= 0) a.mortalQueue = a.mortalQueue.slice(1)
  return 'progress'
}

// ---------- Hazardous (R-7) ----------

// hazardousPending entries are `${firingModelId}::${weaponId}` composites (still typed WeaponId, a plain string
// alias) so WEAP-024-per-model can dedupe/roll per (model, weapon) without a frozen-types.ts change.
function splitHazardousId(hazId: WeaponId): { firingModelId: ModelId; weaponId: WeaponId } {
  const raw = hazId as unknown as string
  const i = raw.indexOf('::')
  if (i < 0) return { firingModelId: '' as ModelId, weaponId: hazId }
  return { firingModelId: raw.slice(0, i) as ModelId, weaponId: raw.slice(i + 2) as WeaponId }
}

function tickHazardous(ctx: EngineContext): 'pending' | 'progress' | 'none' {
  const a = attackSeq(ctx)
  const s = ctx.state
  if (a.hazardousPending.length === 0) return 'none'
  const hazId = a.hazardousPending[0]
  const { firingModelId, weaponId } = splitHazardousId(hazId)
  const player = s.units[a.attackerUnitId].player
  const roll = ctx.rollOnce(`hazardous:${hazId}`, { purpose: 'hazardous', player, sides: 6, count: 1, mode: 'perDie', unitId: a.attackerUnitId, modelId: firingModelId || null, weaponId, commandRerollable: true })
  if (!roll) return 'pending'
  const die = roll.dice[0]
  const failed = die === 1
  if (!failed) {
    ctx.emit({ type: 'HazardousTested', unitId: a.attackerUnitId, weaponId, die, failed: false, modelId: null })
    a.hazardousPending = a.hazardousPending.slice(1)
    return 'progress'
  }
  const candidates = (leaderService.combinedModels ? leaderService.combinedModels(s, a.attackerUnitId) : unitModels(s, a.attackerUnitId)).filter((m) => m.weapons.includes(weaponId))
  const wounded = candidates.filter((m) => m.woundsRemaining < modelStats(s, m).W)
  const nonChar = candidates.filter((m) => !hasKeyword(s, m.unitId, 'CHARACTER'))
  const pool = wounded.length > 0 ? wounded : nonChar.length > 0 ? nonChar : candidates
  if (pool.length === 0) {
    ctx.emit({ type: 'HazardousTested', unitId: a.attackerUnitId, weaponId, die, failed: true, modelId: null })
    a.hazardousPending = a.hazardousPending.slice(1)
    return 'progress'
  }
  if (pool.length > 1) {
    ctx.decide({
      kind: 'chooseOption', player, window: 'any.rollMade', canPass: false,
      context: { topic: 'hazardousCasualty', unitId: a.attackerUnitId, abilityId: null, data: { weaponId, die } },
      options: pool.map((m) => ({ id: m.id, label: `hazardous casualty ${m.id}`, action: { type: 'chooseOption', player, decisionId: '', optionId: m.id } })),
    })
    return 'pending'
  }
  applyHazardousCasualty(ctx, weaponId, die, pool[0].id)
  return 'progress'
}

function applyHazardousCasualty(ctx: EngineContext, weaponId: WeaponId, die: number, modelId: ModelId): void {
  const a = attackSeq(ctx)
  const s = ctx.state
  ctx.emit({ type: 'HazardousTested', unitId: a.attackerUnitId, weaponId, die, failed: true, modelId })
  let model: Model | undefined = s.models[modelId]
  const actx = buildAttackContext(ctx, a.attackerUnitId, false, a.kind, modelId, s.weapons[weaponId], a.attackerUnitId, modelId, false)
  for (let i = 0; i < 3 && model; i++) {
    const died = applyOnePoint(ctx, model, actx, { abilityId: `hazardous:${weaponId}` }, true)
    if (died) { attackService.destroyModel(ctx, model.id, { player: null, unitId: null, modelId: null, kind: 'mortal' }); model = undefined; break }
  }
  a.hazardousPending = a.hazardousPending.slice(1)
}

// ---------- Deadly Demise (R-10.4) ----------

function rollDeadlyDemise(ctx: EngineContext, model: Model, valueExpr: DiceExpr): void {
  const s = ctx.state
  const owner = s.units[model.unitId]?.player ?? 'A'
  const trigger = ctx.roll({ purpose: 'deadlyDemise', player: owner, sides: 6, count: 1, mode: 'perDie', unitId: model.unitId, modelId: model.id, commandRerollable: false })
  const exploded = trigger.dice[0] === 6
  const affected: UnitId[] = []
  if (exploded) {
    // SHOOT-044-attached: an attached Leader+bodyguard is ONE unit — canonical id, combined models, one batch.
    // SHOOT-044-own: "every unit within 6"" includes the destroyed model's own unit (its other models), not just enemies.
    const canon = (id: UnitId): UnitId => (leaderService.canonicalUnitId ? leaderService.canonicalUnitId(s, id) : id)
    for (const u of Object.values(s.units)) {
      if (u.location !== 'board') continue
      const unitId = canon(u.id)
      if (affected.includes(unitId)) continue
      const models = leaderService.combinedModels ? leaderService.combinedModels(s, unitId) : unitModels(s, unitId)
      if (models.some((m) => m.id !== model.id && distance(model, m) <= 6 + 1e-6)) affected.push(unitId)
    }
    for (const unitId of affected) {
      const roll = ctx.rollExpr(valueExpr, { purpose: 'deadlyDemise', player: s.units[unitId].player, unitId })
      if (roll.total > 0) attackService.queueMortalWounds(ctx, unitId, roll.total, 'deadlyDemise', false)
    }
  }
  ctx.emit({ type: 'DeadlyDemiseRolled', unitId: model.unitId, modelId: model.id, die: trigger.dice[0], exploded, affected })
}

// ---------- service ----------

// prefixes that only ever mean something WITHIN the one attack sequence that wrote them — stale entries left over
// from an earlier, already-finished sequence in the same phase must never leak into a new one (SHOOT-046-dice)
const SEQUENCE_SCOPED_MARK_PREFIXES = ['roll:', 'rerollOffered:', 'autoReroll:', 'precisionDeclined:','hazardous:', 'groupTouched:', 'mortalAlloc:', 'mortalBatchSeq:', 'blastCount:', 'pendingDetach:', 'bgntAttacker', 'bgntTarget:', 'indirectNoLos:']

export const attackService: AttackService = {
  begin(ctx, spec) {
    ctx.state.phaseState.marks = ctx.state.phaseState.marks.filter((m) => !SEQUENCE_SCOPED_MARK_PREFIXES.some((p) => m.startsWith(p)))
    const targetUnitIds = [...new Set(spec.targets.map((t) => t.targetUnitId))]
    const groups: AttackGroup[] = []
    // SHOOT-005-timing (R-6.3): Big Guns Never Tire's -1 to hit is decided once, right now — "when targets were
    // selected" — not re-derived from live board state at every hit roll (see module header).
    const attackerKeywords = keywordsOf(ctx.state, spec.attackerUnitId)
    const attackerBig = attackerKeywords.includes('MONSTER') || attackerKeywords.includes('VEHICLE')
    if (attackerBig && leaderService.inEngagementWithEnemy(ctx.state, spec.attackerUnitId)) {
      ctx.state.phaseState.marks.push('bgntAttacker=1')
    }
    const attackerPlayer = ctx.state.units[spec.attackerUnitId]?.player
    for (const targetUnitId of targetUnitIds) {
      const entries = spec.targets.filter((t) => t.targetUnitId === targetUnitId)
      const order: WeaponId[] = []
      for (const e of entries) if (!order.includes(e.weaponId)) order.push(e.weaponId)
      for (const weaponId of order) {
        for (const e of entries.filter((x) => x.weaponId === weaponId)) {
          groups.push({ weaponId, targetUnitId, attackerModelIds: [e.modelId], attacks: e.attacks ?? 0, resolved: 0, devastatingPending: 0 })
        }
      }
      // WEAP-006-selection/attached: snapshot the combined (both-halves) model count now, at target selection, so
      // BLAST stays correct even after an earlier group in this same sequence has thinned the target
      const count = leaderService.combinedModels ? leaderService.combinedModels(ctx.state, targetUnitId).length : unitModels(ctx.state, targetUnitId).length
      ctx.state.phaseState.marks.push(`blastCount:${targetUnitId}=${count}`)
      // SHOOT-007 (R-6.3): the target-side half of Big Guns Never Tire — a MONSTER/VEHICLE target engaged with ANY
      // unit of the attacker's army — snapshotted the same way.
      const targetKeywords = keywordsOf(ctx.state, targetUnitId)
      const targetBig = targetKeywords.includes('MONSTER') || targetKeywords.includes('VEHICLE')
      const targetEngaged = targetBig && Object.values(ctx.state.units).some((u) =>
        u.player === attackerPlayer && u.location === 'board' && leaderService.unitsInEngagement(ctx.state, u.id, targetUnitId))
      if (targetEngaged) ctx.state.phaseState.marks.push(`bgntTarget:${targetUnitId}=1`)
    }
    // SHOOT-041/WEAP-020 (R-6.23): Indirect Fire's -1-to-hit/auto-fail is likewise about visibility "when [the
    // target] was selected" — snapshotted per (firing model, target) here rather than re-checked live per roll.
    for (const t of spec.targets) {
      const w = weaponService.effectiveWeapon(ctx.state, t.modelId, t.weaponId)
      if (w && hasAbility(w, 'INDIRECT_FIRE') && !ctx.services.los.unitVisible(ctx.state, t.modelId, t.targetUnitId)) {
        ctx.state.phaseState.marks.push(`indirectNoLos:${t.modelId}:${t.targetUnitId}=1`)
      }
    }
    ctx.state.phaseState.attack = {
      kind: spec.kind, attackerUnitId: spec.attackerUnitId, overwatch: spec.overwatch, targets: spec.targets, groups, current: null,
      mortalQueue: [], hazardousPending: [], targetUnitIds,
    }
    ctx.emit({ type: 'AttackSequenceStarted', unitId: spec.attackerUnitId, kind: spec.kind, overwatch: spec.overwatch })
    ctx.emit({ type: 'TargetsDeclared', unitId: spec.attackerUnitId, targets: spec.targets.map((t) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId })) })
    ctx.services.hooks.run(ctx, 'onTargetsDeclared', { attackerUnitId: spec.attackerUnitId, targetUnitIds, kind: spec.kind })
  },

  advance(ctx) {
    for (let i = 0; i < MAX_TICKS; i++) {
      const a = ctx.state.phaseState.attack
      if (!a) throw new EngineInvariantError('attack.advance: no active sequence')
      if (a.mortalQueue.length > 0 && !a.current) {
        const r = drainOneMortalPoint(ctx)
        if (r === 'pending') return 'pending'
        continue
      }
      // WEAP-013-order/SHOOT-014-dev (R-6.6): within one target's groups, deferred Devastating Wounds criticals wait
      // until every group AGAINST THAT TARGET has finished its normal attacks — so mortal wounds from model 1 never
      // resolve ahead of model 2's still-pending save against the same target — but they must still resolve before
      // any attack (even a normal one) against a DIFFERENT target. Groups are pushed target-by-target (`begin`), so
      // find the earliest group with any work left (normal attacks or a deferred critical), then within that
      // target's groups prefer normal attacks first and only fall back to devastatingPending once none remain.
      assignRuns(ctx, a)
      let gi = a.current ? a.current.groupIndex : -1
      if (gi === -1) {
        const firstUnfinished = a.groups.findIndex((g) => groupHasNormalWork(g) || g.devastatingPending > 0)
        if (firstUnfinished !== -1) {
          const target = a.groups[firstUnfinished].targetUnitId
          gi = a.groups.findIndex((g) => g.targetUnitId === target && groupHasNormalWork(g))
          if (gi === -1) gi = a.groups.findIndex((g) => g.targetUnitId === target && g.devastatingPending > 0)
        }
      }
      if (gi === -1) {
        if (a.mortalQueue.length > 0) { const r = drainOneMortalPoint(ctx); if (r === 'pending') return 'pending'; continue }
        const hz = tickHazardous(ctx)
        if (hz === 'pending') return 'pending'
        if (hz === 'progress') continue
        // R-10.1: only now, with the whole sequence (attacks + mortal-wound queue + Hazardous) finished, is it safe
        // to actually split any bodyguard that died mid-volley (see destroyModel).
        const pendingDetachPrefix = 'pendingDetach:'
        const pendingDetach = ctx.state.phaseState.marks.filter((m) => m.startsWith(pendingDetachPrefix)).map((m) => m.slice(pendingDetachPrefix.length) as UnitId)
        for (const unitId of pendingDetach) if (leaderService.detach) leaderService.detach(ctx, unitId)
        ctx.emit({ type: 'AttackSequenceEnded', unitId: a.attackerUnitId, kind: a.kind })
        ctx.state.phaseState.attack = null
        return 'done'
      }
      const group = a.groups[gi]
      // one-time per-group bookkeeping (One Shot / Hazardous) — independent of whether `attacks` still needs
      // computing, since a melee group's attacks are already known at `begin` (declared.attacks non-null)
      // M9: a merge run (same target + weapon profile, several firing models) is picked up as a whole via its lead group
      const members = !a.current && group.runLead === gi ? runMembers(a, gi) : [gi]
      for (const mj of members) {
      const mg = a.groups[mj]
      if (ctx.once(`groupTouched:${a.attackerUnitId}:${mj}`)) {
        const attackerModel = ctx.state.models[mg.attackerModelIds[0]]
        const eff = weaponService.effectiveWeapon(ctx.state, mg.attackerModelIds[0], mg.weaponId)
        if (attackerModel && hasAbility(eff, 'ONE_SHOT') && !attackerModel.oneShotUsed.includes(mg.weaponId)) attackerModel.oneShotUsed.push(mg.weaponId)
        // WEAP-024-per-model: one Hazardous test per (firing model, weapon) — dedup used to be by weaponId alone,
        // so two different models firing the same Hazardous weapon wrongly shared a single test. The composite id
        // still dedupes the same model+weapon appearing in more than one group (e.g. split across two targets).
        if (hasAbility(eff, 'HAZARDOUS')) {
          const hazId = `${mg.attackerModelIds[0]}::${mg.weaponId}`
          if (!a.hazardousPending.includes(hazId as WeaponId)) a.hazardousPending.push(hazId as WeaponId)
        }
      }
      }
      // item 10: the target is already wiped out — the rest of this group's (run's) attacks are lost: nothing rolled, no
      // windows, no events. Hazardous (touched above) and groups against other living targets still resolve.
      if (!a.current && (groupHasNormalWork(group) || group.devastatingPending > 0) && targetGone(ctx, group.targetUnitId)) {
        for (const mj of members) {
          const mg = a.groups[mj]
          mg.attacks = Math.max(1, mg.attacks)
          mg.resolved = mg.attacks
          mg.devastatingPending = 0
        }
        group.batch = newBatch('apply')
        continue
      }
      const unknown = members.find((mj) => a.groups[mj].attacks === 0)
      if (unknown !== undefined) {
        const ug = a.groups[unknown]
        const declared = a.targets.find((t) => t.modelId === ug.attackerModelIds[0] && t.weaponId === ug.weaponId && t.targetUnitId === ug.targetUnitId)
        const computed = computeAttackCount(ctx, unknown, ug, declared)
        if (computed === 'pending') return 'pending'
        ug.attacks = computed
        continue
      }
      if (!a.current) {
        if (group.resolved < group.attacks) {
          // hit + wound dice for the whole run, rolled as batches (M9)
          if (doBatchStages(ctx, gi) === 'pending') return 'pending'
          continue
        }
        const b = group.batch
        if (b && b.queue.length > 0) {
          if (b.stage === 'save') {
            if (doSaveBatch(ctx, gi) === 'pending') return 'pending'
            continue
          }
          a.current = currentFromSlot(b.queue.shift() as WoundSlot)
          continue
        }
        a.current = freshDevastatingAttack(gi, group.attackerModelIds[0])
      }
      const cur = a.current
      let r: 'pending' | 'progress'
      switch (cur.stage) {
        case 'allocate': r = doAllocateStage(ctx, gi, group); break
        case 'save': r = doSaveStage(ctx, gi, group); break
        case 'damage': r = doDamageStage(ctx, gi, group); break
        default: finishSlot(ctx, gi, group); r = 'progress'; break
      }
      if (r === 'pending') return 'pending'
    }
    throw new EngineInvariantError('attack.advance did not settle')
  },

  handler: {
    validate(state, action, pending) {
      if (pending.kind === 'allocateAttack') {
        if (action.type === 'pass') return pending.canPass ? null : { code: 'E_PASS_NOT_ALLOWED', reason: 'this allocation cannot be passed' }
        if (action.type !== 'allocateAttack') return { code: 'E_NOT_AN_OPTION', reason: 'expected allocateAttack' }
        if (!pending.options.some((o) => o.id === action.modelId)) return { code: 'E_NOT_AN_OPTION', reason: 'model is not eligible' }
        return null
      }
      if (pending.kind === 'chooseOption') {
        if (action.type !== 'chooseOption' || !pending.options.some((o) => o.id === action.optionId)) return { code: 'E_NOT_AN_OPTION', reason: 'answer is not offered' }
        return null
      }
      return null
    },
    handle(ctx, action, pending) {
      const s = ctx.state
      const a = s.phaseState.attack
      if (!a) return { code: 'E_NOT_AN_OPTION', reason: 'attack: no active sequence' }
      // WEAP-025: the attacker declining a Precision allocation (canPass decision) -> normal defender allocation
      if (pending.kind === 'allocateAttack' && action.type === 'pass') {
        if (!pending.canPass || !a.current) return { code: 'E_PASS_NOT_ALLOWED', reason: 'this allocation cannot be passed' }
        ctx.once(precisionDeclinedKey(a.current, a.current.groupIndex, a.groups[a.current.groupIndex]))
        return
      }
      if (pending.kind === 'allocateAttack' && action.type === 'allocateAttack') {
        if (a.current) {
          finalizeAllocation(ctx, a.current.groupIndex, a.groups[a.current.groupIndex], action.modelId)
        } else {
          const entry = a.mortalQueue[0]
          if (entry) ctx.state.phaseState.marks.push(`${mortalAllocKey(entry)}=${action.modelId}`)
        }
        return
      }
      if (pending.kind === 'chooseOption' && action.type === 'chooseOption') {
        const topic = pending.context.topic
        if (topic === 'hazardousCasualty') {
          const data = pending.context.data as { weaponId: WeaponId; die: number }
          applyHazardousCasualty(ctx, data.weaponId, data.die, action.optionId)
          return
        }
        if (topic === 'rerollOffer') {
          if (action.optionId === 'reroll') {
            const data = pending.context.data as { rollId: string; dieIndexes: number[] }
            const roll = s.phaseState.lastRoll
            if (!roll || roll.id !== data.rollId) throw new EngineInvariantError('rerollOffer: roll is no longer current', { rollId: data.rollId })
            // M9: the player may pick a subset of the offered dice (validated in the reducer); absent = every offered die
            ctx.reroll(roll, action.dieIndexes ?? data.dieIndexes, 'rerollOffer')
          }
          return
        }
        return { code: 'E_NOT_AN_OPTION', reason: `attack: unknown chooseOption topic ${topic}` }
      }
      return { code: 'E_NOT_AN_OPTION', reason: 'attack: cannot answer this decision' }
    },
  },

  queueMortalWounds(ctx, targetUnitId, count, source, lostOnDeath) {
    if (count <= 0) return
    if (!ctx.state.phaseState.attack) {
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: targetUnitId, overwatch: false, targets: [] })
    }
    // SHOOT-029-batches: mortalAllocKey is source:target:count, so two batches enqueued in the same phase with the
    // same (source, target, count) — e.g. two equal-size mortal-wound hits on one unit — would share an allocation
    // key and the second batch's allocation would silently reuse the first's stale answer. Fold a fresh per-batch
    // ordinal into `source` (nothing outside this queue ever compares it against the caller's original string).
    const n = ctx.state.phaseState.marks.filter((m) => m.startsWith('mortalBatchSeq:')).length
    ctx.state.phaseState.marks.push(`mortalBatchSeq:${n}`)
    ctx.state.phaseState.attack!.mortalQueue.push({ targetUnitId, count, source: `${source}#${n}`, lostOnDeath })
  },

  destroyModel(ctx, modelId, by) {
    const s = ctx.state
    const model = s.models[modelId]
    if (!model) return
    const unit = s.units[model.unitId]
    const ds = datasheetOf(s, model.unitId)
    const demise = ds.coreAbilities.find((c) => c.ability === 'DEADLY_DEMISE')
    if (demise) rollDeadlyDemise(ctx, model, demise.value ?? 'D3')
    const nowDestroyed = removeModel(s, modelId)
    ctx.emit({ type: 'ModelDestroyed', unitId: unit.id, modelId, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
    ctx.services.hooks.run(ctx, 'onModelDestroyed', { destroyedUnitId: unit.id, destroyedModelId: modelId, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
    // secondaries (e.g. Wrath of the Emperor) key off which of the killer's own models scored the kill; only a
    // model-attributed kill counts (mortal wounds / self-inflicted losses carry by.player/by.modelId null).
    // Reset once per phase by the scoring rule that reads it (missions.ts wrathOfTheEmperorAmount).
    if (by.player && by.modelId) {
      const secondaryState = s.players[by.player].secondaryState
      const killsThisPhase = (secondaryState.killsThisPhase as Record<string, number> | undefined) ?? {}
      killsThisPhase[by.modelId] = (killsThisPhase[by.modelId] ?? 0) + 1
      secondaryState.killsThisPhase = killsThisPhase
    }
    if (nowDestroyed) {
      unit.destroyedBy = { player: by.player ?? s.activePlayer, kind: by.kind, round: s.round, unitId: by.unitId, modelId: by.modelId }
      ctx.emit({ type: 'UnitDestroyed', unitId: unit.id, byPlayer: by.player, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
      ctx.services.hooks.run(ctx, 'onUnitDestroyed', { destroyedUnitId: unit.id, destroyedModelId: null, byUnitId: by.unitId, byModelId: by.modelId, kind: by.kind })
      if (leaderService.isAttached(s, unit.id) && leaderService.detach) {
        // SHOOT-048/LEAD-014/R-10.1: the leader/bodyguard split happens only once the attacking unit's WHOLE
        // sequence has finished — detaching now would immediately break leaderService.halves()/allocatableModels()
        // for the rest of this same volley (and any still-queued mortal wounds), throwing the remainder away
        // instead of routing it onto the attached CHARACTER. Defer to a mark; advance() detaches at sequence end.
        if (ctx.state.phaseState.attack) ctx.once(`pendingDetach:${unit.id}`)
        else leaderService.detach(ctx, unit.id)
      }
    }
  },
}
