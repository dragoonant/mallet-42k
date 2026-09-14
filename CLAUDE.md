# Mallet 42k — agent orientation

Read in this order, nothing else up front: `HANDOFF.md` (current state, next steps, how to run the
workflows) → `STATUS.md` (what exists) → `PLAN.md` (scope, decisions, milestones) → `docs/spec/`
(rules, contracts, schemas — read only the sections a task names).

## Owner priority: playable first (2026-09-13)
- Something the owner can open and play beats test coverage. Run workflow stages lean (`args.lean: true`):
  implement + commit, no adversarial verify loops, no whole-engine audit, unless the owner asks.
- Tests only protect a working build: typecheck, a smoke test, one Playwright playthrough. No chasing
  checklist coverage. Every stage should end in something visible on Pages or in screenshots.

## Token rules (the owner is on a metered plan — these are not optional)
- The main loop never reads whole source files or hand-writes bulk code. It writes workflow scripts,
  reads structured results, and checks in with the owner in ≤10 lines.
- Implementation and data entry run on Sonnet subagents (`model: 'sonnet'`); verification and spec
  work run on the session model at `effort: 'high'`. Agents return schema-validated JSON, ≤300 tokens.
- One workflow stage at a time (`tools/workflows/`), ≤8 agents per stage, commit + push after each
  stage so an interrupted run never loses finished work. Workflow resume is same-session only.
- Verification is automated: `npm run typecheck`, `npm test`, `npm run validate:data`,
  `npm run sim` (once it exists), Playwright E2E. Verify agents read test output and diffs.

## Conventions
- 1 world unit = 1 inch, y up, 44"×30" Combat Patrol board centred at the origin.
- Engine contracts are frozen: `src/engine/{types,actions,events,hooks,rng,decider,index}.ts`. Any
  change needs a matching edit to `docs/spec/00-architecture.md` and a note in the agent's `issues`.
- Every engine test is named with its checklist ID from `docs/spec/12-rules-test-checklist.md`
  (e.g. `it('SHOOT-012 ...')`). Coverage is measured by test names.
- Concurrent agents share one working tree: each owns only the files its prompt lists, never edits
  `STATUS.md` unless told to, never runs `git commit`/`npm install` unless told to.
- Commit messages: `M<n>: <what>` + blank line + the Co-Authored-By line for the current model.
  Pushing to `main` after each stage is pre-approved by the owner. Pages deploys from `main`.

## IP rule
Mechanics are ported 1:1 from Warhammer 40k 10th edition Combat Patrol. All prose (ability text,
lore, UI copy, docs) is written in our own words — never copy Games Workshop text. Unit/weapon/ability
names may match. Figures are original SD designs, not copies of GW sculpts.
