# Dev Log

A running journal of development. Short, dated entries: what changed, what was learned,
what's next. A classic indie-dev habit — it keeps momentum visible and doubles as raw
material for devlogs or social posts later.

**Newest entry at the top.**

---

## 2026-07-23 — v0.8 "The Director": playtest-driven fixes for main

- First batch of changes driven directly by playtest feedback (the good kind of
  backlog). Numbered 0.8 to leave 0.6/0.7 to the beta channel's experiments.
- **Spawn director** replaces "heat": Risk of Rain-style saturation curve
  (70% grace for 20s → 100% @1:00 → 150% @2:00 → 250% cap @4:00, linear
  between). The sector table's counts became both the 100% baseline and the
  spawn-mix weights — one table drives composition, initial population, and
  ongoing pressure. Mobile agents spawn at edges; sweepers/pulsars materialize
  at chokepoints (found by sampling clear points flanked by terrain on
  opposite sides — the same finder used at generation).
- **3 casters carried, 2 to enter**: the end-of-sector discard choice is a real
  decision now (Noita's "which wands do I keep" moment). Continue is blocked
  until you're down to two.
- **Tooltips** (deck editor hover + world proximity labels) — glyphs alone were
  unreadable for new players; hover state lives in GameState so render stays
  read-only.
- **Terrain shapes**: bars/L-shapes/blobs/pillar fields via new stamp helpers;
  bounding rects still drive spacing so clearance rules survived unchanged.
- **Next:** fold beta learnings + this together after playtest verdicts.

## 2026-07-22 — v0.5 "Trigger Protocol": the deck gets its depth

- First update built ON the deck system per the new pillar, and it's the most
  mechanically dense one yet:
  - **Trigger cards** (Noita's defining mechanic): Spark Trigger casts the next
    deck card — with its folded modifiers — where it lands; Timer Trigger casts it
    mid-flight. One nesting level by design (cargo triggers act as plain payloads).
    Cargo rides only the first pellet of a multi-pellet trigger (one bomb, not
    twelve). **Blink as cargo teleports you to the impact point** — the classic
    Noita teleport-bolt, and instantly the most fun card interaction in the game.
  - **Multicast** modifier: the next 2 payloads cast simultaneously (stacks to 3).
  - **Caster Frames**: casters are now loot. Standard / Lattice (7 slots, slow
    recharge) / Snubnose (3 slots, fast, +1 dmg) / Shuffler (seeded-random cast
    order re-dealt each recharge, very fast — Noita shuffle wands). Carry two, swap
    with Q; each caster keeps its own timers, so covering a recharge by weaving
    decks is intended tech, not an exploit.
- Implementation notes: the cast path is now a reusable "deck walk" (takePayload
  folds modifiers and advances a cursor) that casting, multicast collection, and
  cargo collection all share; shuffler order lives in `Caster.order` (identity for
  ordered frames) and re-deals through `RunState.rng`. New dev hook `?deck=a,b,c`
  rigs the starting deck — that's how triggers/multicast got scripted browser
  tests (cargo ring visible in flight; bolt+slug flying side by side).
- **Next:** playtest the frame economy (is Shuffler too strong?), then audio.

## 2026-07-22 — v0.4 "The Caster": materials cut, deck doubled down

- **Creative direction call (from the human side): the liquid/material layer didn't
  land.** Fire, oil, coolant, acid, steam — all removed, one day after shipping.
  The lesson worth recording: the substrate was technically satisfying but it
  competed with the card system for the game's identity, and split the player's
  attention across two rule systems. One deep system beats two shallow-ish ones.
  The card/deck system is now the explicit core, and future features build on it.
- **Kept from v0.3** (not liquids, and they serve the deck): destructible cell-grid
  terrain, explosive canisters (shoot or dash-trigger; they chain and carve), card
  world-drops and caches, mouse aim, big open sectors, enemy HP/kills/flux drops.
- **Deck deepened to fill the gap** — the card pool is 10, all kinetic/energy:
  - New payloads: **Slug** (3 dmg, slow, +0.22s delay) and **Seeker Dart** (homing —
    steers toward the nearest agent, turn-rate limited).
  - New modifier: **Heavy Round** (+1 dmg, ×0.75 speed) — first damage modifier.
  - Removed: Firebolt, Waterball, Acid Spit, Oil Slick, and the four material mods
    (Fireproof/Hydro Jets/Slick Coating/Corrosive Wake). Demolition Sync stays.
- **Cache fix that matters:** every cache now generates with a canister placed just
  outside its wall ring — the key is always in the lock, no tool-luck required.
- Biomes renamed (no liquid flavor): Calibration Field, Relay Grid, Shatter Yard,
  Sentinel Works, Terminus. Substrate.ts shrank to a static-but-destructible
  terrain grid (no CA, no per-cell fuel); bundle dropped 50 → 42 kB.
- Verified in headless Chromium: casting/soak with zero errors; death-screen flow
  incidentally confirmed when the input-mashing bot died in Shatter Yard in 11s.
- **Next:** trigger cards (cast-on-impact) as the first build-on-the-deck feature;
  balance pass from real playtests; audio.

## 2026-07-21 — v0.3 "Substrate & Casters": the Noita-inspired big update

- **Direction change, and a good one:** the original plan for this update was a
  materials-only layer with movement staying the only verb. Mid-build, the project
  direction (from the human side of this collaboration) pivoted it bigger: open
  sandbox sectors, the player fights back, and the weapon system borrows Noita's
  internal card/deck architecture outright. Pillar #1 revised from "movement is the
  only verb" to "movement is king" — recorded in the GDD.
- **The substrate:** every sector floor is now a 16px material cell grid run as a
  cellular automaton at 10 Hz — coolant, oil, fire, acid, steam, scorch, and walls
  *as cells*, so terrain is destructible (acid erodes it, explosions carve it; the
  arena border ring is exempt so the world stays sealed). Fire spreads across oil,
  coolant quenches to steam (which blinds seekers), and every status applies to
  hazards too — kiting a seeker through fire kills it. Burning agents drip fire.
- **The Caster:** a deck of 5 ordered card slots; casting walks the deck from a
  pointer, folds modifier cards (Twin/Haste/Ricochet/Pierce) into the next payload
  (Bolt/Burst/Firebolt/Waterball/Acid Spit/Oil Slick/Blink), and recharges on wrap.
  Material payloads splash their material into the substrate — fire cards into oil
  fields is the whole point. Cards are found in the world (some sealed in
  destructible caches); the deck is edited between sectors, holy-mountain style.
- Enemies got HP + flux drops; canisters explode/chain/carve; two new agents
  (Igniter, Corroder) actively rewrite the floor; sectors grew ~40% and opened up;
  mouse aim (twin-stick) replaced keyboard-only; edge arrows point offscreen.
- **Technical decisions:**
  - CA + cosmetics use position/tick hashes, never `RunState.rng` — material chaos
    can't perturb procedural generation, runs stay seed-reproducible.
  - Grid arrays are plain `number[]` (not typed arrays) to keep the state tree
    JSON-serializable per our own rules.
  - Projectiles substep at ≤8px per collision check so Haste stacks can't tunnel
    through single-cell walls (caught in self-review before ship).
  - Shared UI geometry lives in `ui.ts` so mouse hit-testing and rendering can't
    drift apart.
  - Dev hooks: `?seed=<hex>&sector=<1-5>` for reproducible testing of any sector.
- Verified in headless Chromium: casting, fire-trail emergence in the Fuel Depot,
  kills, and a 30-action mouse+keyboard soak — zero runtime errors.
- **Next:** playtest the economy (card density, HP, heat), then audio. Trigger
  cards are the next big caster feature (see GDD open questions).

## 2026-07-21 — First playable: the full roguelite loop

- `simul` is now an actual game: a keyboard-only **movement roguelite**. Five procedural
  sectors per run; collect data shards to open the exit gate; dash (with i-frames) is the
  whole defensive kit. Concept locked in the GDD.
- Systems shipped: momentum movement + dash charges, 4 autonomous hazard types (drifter/
  seeker/sweeper/pulsar), escalating "heat" spawns, 1-of-3 mod drafts between sectors,
  flux → cores meta-progression with a 3-track upgrade shop, localStorage save, seeded
  deterministic generation, particles/screenshake, full menu flow (title/pause/draft/
  death/victory).
- Verified in headless Chromium: title, gameplay, pause, plus a 30s random-input soak —
  no runtime errors; heat spawning and damage/i-frames confirmed on screen.
- **Key decisions:**
  - **Keyboard-only, no aiming.** Keeps the game purely about movement (pillar #1) and
    dodges mouse/camera coupling entirely.
  - **Plain canvas held up — no engine.** The hand-rolled fixed-timestep loop + 2D
    context comfortably handles ~30 agents + 400 particles. Phaser/Three.js stay out.
  - **All randomness flows through a seeded PRNG stored in run state** (mulberry32);
    `Math.random` only picks new-run seeds. Runs are reproducible; the seed shows in the
    HUD. Cosmetic particles deliberately *don't* drain the RNG so juice never changes
    generation.
  - **Particles/shake live in game state** (updated in `update`, drawn in `render`) to
    honor the "render is read-only" rule while keeping state serializable.
  - **Save format versioned** under the localStorage key `simul.save.v1`, loaded
    defensively so a corrupt save can never brick the game.
- **Next:** playtest & tune the difficulty curve (esp. sectors 4–5), then audio. Add
  Vitest for `sector.ts`/`physics.ts`/`rng.ts` once numbers stop moving daily.
- **Later same day:** added a GitHub Pages deploy workflow (`deploy.yml`) — builds and
  publishes `dist/` on every push to `main`, so the game is playable at
  <https://12code4.github.io/simul/>. Vite's relative `base` was set up for this from
  day one. Deploys are decoupled from CI: CI checks every branch, Pages only ships
  what lands on `main`.

## 2026-07-21 — Project kickoff & scaffolding

- Set up the repo as a lean, solo-optimized game project.
- Added a minimal runnable skeleton: a fixed-timestep loop bouncing a placeholder ball —
  proves the update/render pipeline works end to end.
- Kept the doc set intentionally small: this Devlog + the GDD, plus README, `CLAUDE.md`,
  license, and one CI check (typecheck + build).
- **Key decisions (the "why", kept here instead of a separate log):**
  - **Vite + TypeScript, plain canvas, no engine yet.** Lowest commitment while the
    concept is undefined: instant hot-reload preview, shareable via URL, great AI-assisted
    workflow, any genre stays open. Can drop in Phaser (2D) / Three.js (3D) later without
    restructuring. Passed over Godot (editor sits between dev and AI) and pygame (less
    shareable, no browser preview).
  - **Skip team ceremony** (issue/PR templates, CONTRIBUTING, roadmap/changelog files) —
    overhead for a team of one; add retroactively if collaborators appear.
- **Next:** fill in the GDD — decide what `simul` actually *is* (genre, core loop, MVP).
