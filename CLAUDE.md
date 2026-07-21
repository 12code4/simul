# CLAUDE.md

Guidance for AI assistants (and future me) working in this repo. Read this before making
changes.

## What this project is

`simul` is a browser game built with TypeScript + Vite. It's in early scaffolding; the
concept is still being defined in `docs/GDD.md`. When in doubt about *what* to build,
check the GDD.

## How to run

```bash
npm install
npm run dev        # dev server + hot reload
npm run typecheck  # type-check only
npm run build      # type-check + production build
```

There is no test suite yet (nothing worth testing until real game logic exists). Add
[Vitest](https://vitest.dev/) when pure logic modules appear, and wire it into CI.

## Code structure & conventions

- **Entry:** `src/main.ts` sets up the canvas and starts the loop. Keep it thin.
- **Game code lives in `src/game/`:**
  - `config.ts` — tunable constants. Put gameplay "magic numbers" here, not inline.
  - `state.ts` — the `GameState` shape and `createInitialState()`. State is one
    serializable object (helps future save/load and debugging).
  - `loop.ts` — fixed-timestep `update()` + `render()`. `update` mutates state;
    `render` must be read-only w.r.t. state.
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
