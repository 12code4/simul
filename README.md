# simul

> Working title. A game project in early development.

`simul` is a browser-based game built with **TypeScript** and **Vite**. It's in the
scaffolding stage: the engine skeleton runs, and the concept is being defined in the
[Game Design Document](docs/GDD.md).

## Status

🌱 **Pre-prototype.** Runnable skeleton (a bouncing placeholder) is in place. Concept,
mechanics, and MVP scope are being written up in the GDD.

## Quick start

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install       # install dependencies
npm run dev       # start the dev server with hot reload, then open the printed URL
```

You should see a ball bouncing in a canvas — that confirms the render + game loop
pipeline works end to end.

### Other commands

```bash
npm run typecheck   # type-check without emitting
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build locally
```

## Project layout

```
src/
  main.ts          # entry point — wires up the canvas and starts the loop
  game/
    loop.ts        # fixed-timestep update + render loop
    state.ts       # game state shape and initial state
    config.ts      # tunable constants
docs/
  GDD.md           # Game Design Document — the vision (start here for the "what")
  DEVLOG.md        # running development journal
```

## Documentation

- **[Game Design Document](docs/GDD.md)** — what we're building and why.
- **[Dev log](docs/DEVLOG.md)** — what changed, session by session.
- **[CLAUDE.md](CLAUDE.md)** — conventions and how-to-run notes (for AI assistants and future me).

## Contributing / workflow

Solo project for now. See [CLAUDE.md](CLAUDE.md) for the commit and branching conventions.

## License

[MIT](LICENSE)
