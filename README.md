# simul

> A sandbox roguelite about movement and deck-building. Five big open sectors,
> a dash with i-frames, and a weapon that is literally a deck of cards.

**▶ Play in your browser: <https://12code4.github.io/simul/>**

You pilot a fragile probe through a hostile simulation. Your defense is movement —
thrust and an invulnerable dash. Your offense is a **Caster**: an ordered deck of
cards found in the world, cast Noita-wand style — modifier cards fold into the next
shot, deck order is cast order, and the deck recharges when it wraps. Find cards,
crack open sealed caches with explosive canisters, rebuild your deck between sectors,
and carve the destructible terrain while you're at it.

Built with **TypeScript + Vite** on a plain `<canvas>` — no game engine.

## Status

🎮 **v0.4 "The Caster".** Full run loop, card combat, deck editing, and destructible
terrain all work end to end. Trigger cards, balance, and audio are the current
frontier — see the [GDD](docs/GDD.md).

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
| Mouse | Aim — hold left button to cast |
| Space or Shift | Dash — invulnerable while dashing |
| Esc | Pause |
| Enter / 1–3 / click | Menus: confirm, buy upgrades, pick mods, edit your deck |

Collect all **gold shards** to open the **exit gate**. Pick up **cards** — some are
sealed in destructible caches, and every cache has a canister next to it: shoot it or
dash into it (you're invulnerable while dashing). Between sectors: draft a mod and
reorder your deck — **deck order is cast order**. Green motes are flux; kills drop
more; it all banks into **cores** for permanent upgrades when the run ends, win or
lose. Dev hooks for testing: `?seed=<hex>&sector=<1-5>`.

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
    config.ts      # every tunable: physics, materials, hazards, sector/biome table
    state.ts       # GameState/RunState shapes — one serializable object tree
    update.ts      # the simulation: phase machine, casting, combat, deck editing
    render.ts      # canvas drawing: terrain, world, HUD, menus (read-only)
    substrate.ts   # the destructible terrain cell grid
    cards.ts       # the card/deck system data: payloads, modifiers, the Caster
    sector.ts      # seeded procedural generation: terrain, agents, caches
    ui.ts          # shared menu geometry (render and hit-testing stay in sync)
    loop.ts        # fixed-timestep driver
    physics.ts     # circle/AABB collision helpers
    rng.ts         # deterministic PRNG (mulberry32), state lives in RunState
    input.ts       # keyboard + mouse (canvas-mapped aim, consumed presses)
    mods.ts        # between-sector draft modifications
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
