# Repository Guidelines

## Git Conventions
- Do not include attribution to Claude in commit messages.
- Never add a "Co-Authored-By: Claude" footer to any Git commit.
- Do not include AI attribution text in pull request descriptions.
- Write all commit messages using conventional commit format (e.g., "feat: add login button").

## Architecture
- `src/aero/` is pure TypeScript: no React, no Three.js, no DOM. It is unit-tested
  on its own and will later be called directly by WebMCP tools. Keep it that way.
- `src/aero/params.ts` is the single source of truth for what can change and how far.
  Sliders, tests and the future agent schema all read those bounds - add a parameter
  there, not in three places.
- Everything else (`scene/`, `charts/`, `ui/`, `geometry/`) consumes the core; nothing
  writes back into it.
- State lives in one zustand store. Parameters go in through its setters, which clamp
  to the declared bounds; results only ever come out.

## Units
- SI throughout (m, kg, s, N, Pa). The single exception is angles, which are stored in
  degrees at the parameter layer because that is what a person reads, and converted to
  radians at each solver boundary.

## Physics honesty
- Where a model stops being valid, say so in the UI rather than drawing a confident
  line. Lifting-line theory has no stall model and cannot see sweep or dihedral.
- Prefer estimates that are checkable against published results, and pin them with
  tests that cite the expected value.
