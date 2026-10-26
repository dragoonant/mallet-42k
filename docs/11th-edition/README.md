# 11th edition gap check (2026-10-26)

Planning only. Nothing in the engine or data has changed. These pages compare the free 11th edition
core rules (June 2026, plus the one-page universal rules update) against our 10th edition Combat
Patrol build. The PDFs live in `docs/sources/` (gitignored): `core-rules-11th.pdf`,
`universal-rules-updates-11th.pdf`.

- [engine-gaps.md](engine-gaps.md): the core game loop (movement, shooting, fighting, leaders,
  stratagem rules). 87 items: 6 large, 30 medium, 46 small, 5 with no change.
- [missions-data-gaps.md](missions-data-gaps.md): objectives, terrain, missions, deployment and
  patrol data. 31 items.

## Headline findings

- **The core rules say nothing about Combat Patrol.** The 11th patrol rosters, missions, board size
  and round count are only in GW's app. All six of our missions are unconfirmed under 11th until
  that data is visible.
- **Objectives become terrain areas.** Every mission, and all 25 objective markers in them, need
  rework. Markers stay legal as a fallback.
- **Terrain becomes area-based**, and cover changes from +1 to the save to -1 to the attacker's BS.
  All 4 layouts (46 pieces) need area outlines.
- **Engagement range doubles to 2"**. This ripples into charging, fighting, the AI and many test
  fixtures.
- **Big engine rewrites:** the movement phase (each unit is picked once, and disembarking and
  arriving from reserves become move types), pooled saves with damage allocation groups, attached
  units that never split, and a fight phase split into pile-in, fight and consolidate steps.
- **Frozen contracts would change:** `types.ts`, `actions.ts`, `events.ts`, likely `hooks.ts`.
- **Patrol data:** new weapon and unit keywords, a rewritten core stratagem set (Go to Ground is
  gone), and schema additions for terrain areas, actions and stratagem restrictions.

## Rough size

- Missions, terrain and data: about 5-7 stages could start now, plus 5-7 more once GW's 11th Combat
  Patrol data is visible.
- Core engine: about 40-55 lean stages, plus a follow-up sweep of faction hooks, the AI and the
  client.
- In total, a major version, not a patch.

## Decisions for the owner

1. **Target:** 11th core rules on our current 10th patrols and missions now, or wait for GW's 11th
   Combat Patrol data?
2. **Shape:** a ruleset switch so 10th and 11th sit side by side, or a hard cut over to 11th?
3. **Rules the core PDF leaves open:** the hit/wound modifier cap and whether it includes the BS
   changes, and whether to keep the 10th cap on extra CP per round.
