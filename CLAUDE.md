# CLAUDE.md

Guidance for AI assistants (and future me) working in this repo. Read this before making
changes.

## What this project is

`simul` is a browser game built with TypeScript + Vite: a keyboard-only movement
roguelite (5 procedural sectors per run, dash with i-frames, draft mods, meta-
progression). The design source of truth is `docs/GDD.md` — when in doubt about *what*
to build or whether a feature fits, check the GDD's pillars.

## How to run

```bash
npm install
npm run dev        # dev server + hot reload
npm run typecheck  # type-check only
npm run build      # type-check + production build
```

There is no test suite yet. Pure-logic modules now exist (`sector.ts`, `physics.ts`,
`rng.ts`) — add [Vitest](https://vitest.dev/) and wire it into CI once gameplay numbers
stabilize.

## Code structure & conventions

- **Entry:** `src/main.ts` wires canvas + input and starts the loop. Keep it thin.
- **Game code lives in `src/game/`:**
  - `config.ts` — every tunable (physics, hazard stats, the per-sector difficulty
    table, colors). Put gameplay "magic numbers" here, not inline.
  - `state.ts` — `GameState`/`RunState` shapes and constructors. All game state is one
    serializable object tree — no classes/closures in state (save/load and debugging
    depend on this).
  - `update.ts` — the simulation: phase machine + fixed-step gameplay. Mutates state.
  - `render.ts` — draws state to canvas. Must stay read-only w.r.t. state (cosmetics
    like particles/shake are *state*, updated in `update.ts`).
  - `loop.ts` — fixed-timestep driver only; no game logic.
  - `sector.ts` — seeded procedural generation. `physics.ts`, `rng.ts` — pure helpers.
  - `input.ts` — keyboard (held keys + consumed edge presses). `mods.ts` — draft mods.
    `meta.ts` — persistent progression, localStorage key `simul.save.v1`.
- **Determinism:** all in-run randomness flows through `RunState.rng` (seeded
  mulberry32); `Math.random` is only for picking new-run seeds. Don't add stray
  randomness to update/render — cosmetic variation derives from stored times/indices.
- **TypeScript is strict.** No `any` without a written reason. Prefer small pure functions.
- **Rendering vs. simulation are separate.** Don't put game logic in render code, and
  don't draw from update code.
- Keep new modules small and single-purpose; match the style of the file you're editing.

## Git & workflow conventions

- **Commits: [Conventional Commits](https://www.conventionalcommits.org/).**
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `perf:`. Imperative, present tense.
- **Branches:** short-lived feature branches off `main` for non-trivial work; small doc
  fixes can go straight to the working branch. Keep `main` in a runnable state.
- **Releases:** tag milestones (`v0.1.0`, …); add a `CHANGELOG.md` when the first one lands.
- **Keep docs in sync with code.** When you change how something runs or is structured,
  update this file and the README in the same commit.

## Documentation habits (do these as you work)

Deliberately minimal — two docs, kept current:

- Finished a chunk of work, or made a notable technical/design choice? Add a short dated
  entry to `docs/DEVLOG.md` (record the "why" of decisions here).
- Firmed up a mechanic or scope? Update `docs/GDD.md`.

## Things not set up yet (intentionally)

Issue/PR templates, CONTRIBUTING, a changelog, a roadmap file, a test framework, and any
game engine (Phaser/Three.js). Add these when the project actually needs them, not
preemptively — e.g. a `CHANGELOG.md` once you cut your first tagged release.
