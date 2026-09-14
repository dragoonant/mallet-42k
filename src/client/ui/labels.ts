// Own-words label helpers translating raw engine/data ids (scoring rule ids, mission rule ids,
// VP/CP event sources, secondary/stratagem ids) into text a player can read without cross-referencing
// the JSON. Pure lookups over DataBundle/GameState — no engine/scoring logic duplicated here beyond a
// generic id-to-title-case fallback for whatever id we don't have a curated name for.
import type { GameState, PlayerId } from '@/engine'
import type { DataBundle, MissionData, MissionRule, ScoringRule } from '@/data/types'

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'with', 'in', 'on', 'a', 'an', 'but', 'or', 'to'])

/** "raze-hold1-r2-4" -> "Raze Hold 1", "core.s.command-reroll" -> "Command Reroll" — strips the
 *  round-range suffix most scoring rule ids carry and the faction-prefix stratagems/secondaries use,
 *  then title-cases the rest. A fallback for whatever id isn't covered by the curated lookups below. */
export function prettifyId(id: string): string {
  let s = id.replace(/-r\d+(?:-\d+)?(?:-(?:first|second))?$/i, '')
  s = s.replace(/^[a-z0-9]+(?:\.[a-z0-9]+)*\./i, '')
  s = s.replace(/[-_.]+/g, ' ').replace(/(\d+)/g, ' $1 ').replace(/\s+/g, ' ').trim()
  if (!s) return id
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Objectives only ever carry a bare id ("west", "site-a") — no separate display name in the data —
 *  so this is the one place that turns one into something a player didn't have to decode. */
export function objectiveLabel(id: string): string {
  return `${prettifyId(id)} objective`
}

/** Resolves a VpScored/CpChanged `source` id to an own-words name. The engine emits whatever
 *  descriptor id actually granted the points/CP — a mission scoring rule, a mission special rule, a
 *  secondary's own scoring rule, a stratagem, or an ability — so every one of those is checked. */
export function sourceName(state: GameState, bundle: DataBundle | null, source: string): string {
  if (source === 'commandPhase') return 'Command phase'
  const strat = state.stratagems[source]
  if (strat) return strat.name
  const ability = state.abilities[source]
  if (ability) return ability.name
  const missionRule = state.mission.rules.find((r) => r.id === source)
  if (missionRule) return prettifyId(missionRule.id)
  const scoringRule = state.mission.scoring.find((r) => r.id === source)
  if (scoringRule) return prettifyId(scoringRule.id)
  if (bundle) {
    for (const patrol of Object.values(bundle.patrols)) {
      for (const secondary of patrol.secondaries) {
        if (secondary.id === source || secondary.scoring.some((r) => r.id === source)) return secondary.name
      }
    }
  }
  return prettifyId(source)
}

/** The secondary a player is actually playing this game (from PlayerSetup.secondaryId), with its
 *  name/text for display — null only if the bundle hasn't loaded (shouldn't happen mid-game). */
export function secondaryFor(bundle: DataBundle | null, state: GameState, player: PlayerId): { id: string; name: string; text: string } | null {
  if (!bundle) return null
  const p = state.players[player]
  const patrol = bundle.patrols[p.patrolId]
  const secondary = patrol?.secondaries.find((s) => s.id === p.secondaryId)
  return secondary ? { id: secondary.id, name: secondary.name, text: secondary.text } : null
}

/** The rule ids that belong to a player's own chosen secondary (not the mission's shared primary
 *  scoring or a mission special rule) — the one thing that actually distinguishes "primary" from
 *  "secondary" VP, since a mission special rule can grant VP under its own id (e.g. Scorched Earth's
 *  "raze-and-ruin") that never appears in state.mission.scoring at all. */
export function secondaryScoringIds(bundle: DataBundle | null, state: GameState, player: PlayerId): Set<string> {
  const secondary = secondaryFor(bundle, state, player)
  if (!bundle || !secondary) return new Set()
  const patrol = bundle.patrols[state.players[player].patrolId]
  const rule = patrol?.secondaries.find((s) => s.id === secondary.id)
  return new Set(rule?.scoring.map((r) => r.id) ?? [])
}

function scoringLineFor(rule: ScoringRule): string {
  switch (rule.rule) {
    case 'holdObjectives':
      return `${rule.pointsPer} VP per objective you hold (cap ${rule.cap})`
    case 'holdMore':
      return `${rule.pointsPer} VP if you hold more objectives than your opponent`
    case 'holdHome':
      return `${rule.pointsPer} VP for holding your home objective`
    case 'holdEnemyHome':
      return `${rule.pointsPer} VP for holding the enemy's home objective`
    case 'holdNamed':
      return `${rule.pointsPer} VP for holding a named objective`
    case 'unitsInEnemyZone':
      return `${rule.pointsPer} VP per unit you have in the enemy's deployment zone`
    case 'destroyedUnits':
      return `${rule.pointsPer} VP per enemy unit destroyed (cap ${rule.cap})`
    case 'razedThisTurn':
      return `${rule.pointsPer} VP for razing a marker this turn`
    case 'claimedSite':
      return `${rule.pointsPer} VP for a Character holding a claimed site`
    case 'claimedSiteConsecutive':
      return `${rule.pointsPer} VP for holding a claimed site across turns`
    default:
      return `${prettifyId(rule.id)} (up to ${rule.cap} VP)`
  }
}

/** One line per distinct scoring "family" — folds the r2-4 / r5-first / r5-second split every
 *  mission's primary uses into a single own-words bullet instead of three near-duplicates. */
export function primaryScoringSummary(mission: MissionData): string[] {
  const families = new Map<string, ScoringRule[]>()
  for (const rule of mission.scoring) {
    const family = rule.id.replace(/-r\d+(?:-\d+)?(?:-(?:first|second))?$/i, '')
    const arr = families.get(family)
    if (arr) arr.push(rule)
    else families.set(family, [rule])
  }
  return Array.from(families.values()).map((rules) => {
    const from = Math.min(...rules.map((r) => r.rounds.from))
    const to = Math.max(...rules.map((r) => r.rounds.to))
    return `${scoringLineFor(rules[0])} — rounds ${from}-${to}`
  })
}

const WINDOW_LABEL: Partial<Record<string, string>> = {
  'command.end': 'end of your Command phase',
  'command.start': 'start of your Command phase',
  'turn.end': 'end of your turn',
  'turn.start': 'start of your turn',
  'round.end': 'end of the round',
  'round.start': 'start of the round',
  'phase.end': 'end of every phase',
  'battle.end': 'the end of the battle',
}

/** "Scoring: end of your Command phase (rounds 2-4)" — read off the primary's own-turn scoring
 *  rule, since that's the moment a player actually needs to remember to act before. */
export function primaryScoringWindowHint(mission: MissionData): string | null {
  const rule = mission.scoring.find((r) => r.who === 'active') ?? mission.scoring[0]
  if (!rule) return null
  const windowLabel = WINDOW_LABEL[rule.when] ?? rule.when
  return `Scoring: ${windowLabel} (rounds ${rule.rounds.from}-${rule.rounds.to})`
}

/** Short own-words line for a mission special rule (MissionData.rules[]) — the mission's own `text`
 *  already narrates what it does in prose; this is just a label for the collapsible list. */
export function missionRuleLabel(rule: MissionRule): string {
  return prettifyId(rule.id)
}
