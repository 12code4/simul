# simul

> A keyboard-only movement roguelite. Five simulated sectors. Don't get touched.

You pilot an unarmed probe through a hostile simulation: thrust, dash (brief
invulnerability), and nothing else. Collect data shards to open each sector's exit gate
while autonomous hazards — drifters, seekers, sweepers, pulsars — run their simple rules
around you and pressure escalates the longer you stay. Clear five sectors to beat the
run; die and your flux still banks into permanent upgrades.

Built with **TypeScript + Vite** on a plain `<canvas>` — no game engine.

## Status

🎮 **First playable.** The full run loop works end to end: procedural sectors, drafts,
meta-progression, win/lose flow. Balance and audio are still to come — see the
[GDD](docs/GDD.md) for scope.

## Quick start

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install
npm run dev       # start the dev server, open the printed URL, press ENTER to run
```

### How to play

| Input | Action |
|---|---|
| WASD / arrows | Thrust |
| Space or Shift | Dash — invulnerable while dashing |
| Esc | Pause |
| Enter / 1–3 | Menus: confirm / buy upgrades / pick draft cards |

Collect all **gold shards** to open the **exit gate**. Green motes are flux — currency
that banks into **cores** when the run ends (win *or* lose) and buys permanent upgrades
on the title screen. After each cleared sector, draft one of three movement mods.

### Other commands

```bash
npm run typecheck   # type-check without emitting
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build locally
```

## Project layout

```
src/
  main.ts          # entry point — canvas + input wiring, starts the loop
  game/
    config.ts      # every tunable: physics, hazard stats, sector table, colors
    state.ts       # GameState/RunState shapes — one serializable object tree
    update.ts      # the simulation: phase machine + fixed-step gameplay logic
    render.ts      # canvas drawing: world, HUD, menus (read-only w.r.t. state)
    loop.ts        # fixed-timestep driver
    sector.ts      # seeded procedural sector generation
    physics.ts     # circle/AABB collision helpers
    rng.ts         # deterministic PRNG (mulberry32), state lives in RunState
    input.ts       # keyboard tracking (held keys + edge-triggered presses)
    mods.ts        # in-run draft modifications
    meta.ts        # persistent progression (localStorage)
docs/
  GDD.md           # Game Design Document — pillars, systems, scope
  DEVLOG.md        # dev journal + the "why" behind decisions
```

## Documentation

- **[Game Design Document](docs/GDD.md)** — what the game is and why.
- **[Dev log](docs/DEVLOG.md)** — what changed, session by session, decisions included.
- **[CLAUDE.md](CLAUDE.md)** — conventions and how-to-run notes (for AI assistants and future me).

## License

[MIT](LICENSE)
