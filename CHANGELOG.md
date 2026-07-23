# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

_Nothing yet._

## [0.5.0] - 2026-07-22 — "Trigger Protocol"

The first update built on the deck-first pillar: casting depth.

### Added
- **Trigger cards**: Spark Trigger casts the next deck card (with its modifiers)
  where it lands; Timer Trigger casts it mid-flight. Blink as cargo teleports
  you to the impact point.
- **Multicast** modifier: the next two payloads cast simultaneously.
- **Caster Frames** — casters are now loot: Standard, Lattice (7 slots, slow
  recharge), Snubnose (3 slots, fast, +1 damage), Shuffler (random seeded cast
  order, very fast). Carry two casters and swap with **Q**; each keeps its own
  cast/recharge timers. Frames are found in sectors 2 and 4.
- Deck editor handles both casters (swap cards between decks); HUD shows the
  active frame plus a mini strip for the holstered one.
- Dev hook `?deck=a,b,c` to rig the starting deck for testing.

## [0.4.0] - 2026-07-22 — "The Caster"

A focus redesign one day after 0.3.0: the material/liquid simulation was removed by
creative direction, and the card/deck system is now the explicit core of the game.

### Added
- New payload cards: **Slug** (3 damage, slow) and **Seeker Dart** (homing).
- New modifier card: **Heavy Round** (+1 damage, slower shot).
- Every card cache now generates with a canister beside it — the key is always
  in the lock.

### Changed
- Sector biomes renamed and re-identified around hazard/canister density:
  Calibration Field, Relay Grid, Shatter Yard, Sentinel Works, Terminus.
- Terrain remains destructible (explosions carve wall cells, leaving rubble),
  but is now static — no cellular automaton.

### Removed
- All materials/liquids: fire, oil, coolant, acid, steam, and their statuses
  (burning/wet/oiled), spread/quench/dissolve rules, and seeker-blinding steam.
- Material payload cards (Firebolt, Waterball, Acid Spit, Oil Slick) and
  material mods (Fireproof Plating, Hydro Jets, Slick Coating, Corrosive Wake).
- Material agents: Igniter and Corroder.

## [0.3.0] - 2026-07-21 — "Substrate & Casters"

The Noita-inspired big update. (There is no 0.2.0 — the materials-only update was
absorbed into this one when the direction grew to include combat.)

### Added
- **The substrate**: every sector floor is a simulated material grid (cellular
  automaton) — coolant, oil, fire, acid, steam, scorch. Fire spreads across oil;
  coolant quenches fire into seeker-blinding steam; acid dissolves terrain.
  **Walls are cells — terrain is destructible** (the arena border is not).
- **The Caster**: a card/deck weapon system modeled on Noita's wand architecture.
  5 ordered slots; modifier cards (Twin, Haste, Ricochet, Pierce) fold into the
  next payload (Bolt, Burst, Firebolt, Waterball, Acid Spit, Oil Slick, Blink);
  the deck recharges when its pointer wraps. Material payloads splash into the
  substrate.
- Cards are found in the world, including caches sealed behind destructible wall
  rings; the deck is edited between sectors (deck order = cast order).
- Statuses for player and hazards alike: burning, wet, oiled; hazards die from
  burning and drip fire onto oil.
- Enemy HP; kills drop flux. Explosive canisters (chain, carve terrain, ignite).
- New agents: Igniter (fire trail; dies in coolant) and Corroder (acid trail;
  ruptures into acid on death).
- Mouse aim (twin-stick controls); crosshair cursor; off-screen objective arrows.
- Five new draft mods: Fireproof Plating, Hydro Jets, Slick Coating, Corrosive
  Wake, Demolition Sync.
- Sectors ~40% bigger and more open, each with a material/biome identity:
  Calibration Field, Coolant Basin, Fuel Depot, Corrosion Works, Crucible.
- Dev hooks for reproducible testing: `?seed=<hex>&sector=<1-5>`.

### Changed
- Design pillar revised: "movement is the only verb" → "movement is king" —
  combat added by project direction; casting never roots you.
- Keyboard-only input retired in favor of WASD + mouse.

## [0.1.0] - 2026-07-21 — First playable

### Added
- Keyboard-only movement roguelite: 5 seeded procedural sectors per run; collect
  data shards to open the exit gate.
- Momentum movement + dash with i-frames (charges, recharge).
- Four autonomous hazards: drifter, seeker, sweeper, pulsar; escalating "heat"
  edge-spawns.
- 1-of-3 mod draft between sectors (9 mods); flux → cores meta-progression with
  three permanent upgrade tracks (localStorage save `simul.save.v1`).
- Full menu flow, HUD, particles, screenshake; deterministic runs from a seed.
- Project scaffolding: Vite + TypeScript strict, docs system (GDD + Devlog +
  CLAUDE.md), CI (typecheck + build), GitHub Pages deploy on `main`.
