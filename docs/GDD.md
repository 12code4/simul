# Game Design Document — simul

> Living document. This is the source of truth for *what* we're building and *why*.
> Update it when a mechanic or scope firms up.

_Last updated: 2026-07-22 · Status: **v3 concept — "The Caster" focus (v0.4). Material/liquid simulation removed by design.**_

---

## 1. One-line pitch

A sandbox roguelite about movement and deck-building: dash a fragile probe through
five big open sectors, harvesting data shards and cards while your Caster — an
ordered deck cast Noita-wand style — does the fighting.

## 2. Concept & fantasy

You are a probe inside a hostile simulation. Your defense is movement — thrust and an
invulnerable dash. Your offense is a **Caster**: a deck of found cards cast in order,
where modifier cards wrap the shots that follow them. The fantasy is *building a
machine*: every card you find and every slot you reorder changes how your weapon
behaves, and mastery means piloting hard while your deck design pays off.

The card/deck system is the core system of the game and the platform for future
features (triggers, multi-deck builds, deck-defined movement). Runs are 8–15 minutes.
Death banks your flux — every run makes the next stronger.

## 3. Design pillars

1. **Movement is king.** The dash and momentum kit is the heart of survival. Casting
   never roots you; no mechanic may make standing still optimal.
2. **The deck is the build.** Player power and expression flow through cards and deck
   order, not stat sticks. New features should be new cards or new deck rules first.
3. **Systems, not scripts.** Hazards are autonomous agents; difficulty is density and
   interaction, never choreography.
4. **Death is progress.** Flux always banks into permanent cores.
5. **Always readable.** Telegraphs (pulsar arcs, canister fuses, sweeper tracks),
   color-as-information, edge arrows to objectives. You can always see why you died.

*(History: v0.3 added a liquid/material cellular automaton — fire/oil/coolant/acid.
It was **removed in v0.4 by creative direction**: it competed with the deck for the
game's identity. Destructible terrain and explosions stayed; liquids did not. See
DEVLOG 2026-07-22.)*

## 4. Core loop

**Seconds:** scan → route → weave/dash → cast → grab a shard or card → crack a cache
open with a canister → heat rises → gate.

**Minutes (per run):** clear sector → draft a mod + rebuild your deck → bigger, harder
sector → win at sector 5 or die trying.

**Hours (meta):** bank flux → permanent upgrades → chase better deck builds and
cleaner clears.

## 5. Mechanics & systems

### The Caster (the core system)
- **Caster = Frame + deck**: a Frame sets slot count and cadence; slots hold cards
  in cast order. **Cast = deck walk**: modifier cards fold into the next payload,
  which then fires; wrapping the deck costs the recharge. Modifiers stack.
- **Frames (v0.5)** — casters are loot, Noita-wand style. Standard (5 slots,
  baseline), Lattice (7 slots, ponderous recharge), Snubnose (3 slots, quick,
  +1 dmg), Shuffler (random seeded cast order re-dealt each recharge, very fast).
  Carry **two casters, swap with Q** — each keeps its own timers, so weaving
  between decks to cover a recharge is intended tech. Frames found in sectors 2 & 4;
  picking up a third replaces the holstered caster (its cards return to inventory).
- **Trigger cards (v0.5)** — the Noita mechanic: a trigger payload consumes the
  NEXT deck card (with its modifiers) as cargo and casts it on arrival. Spark
  Trigger (on impact), Timer Trigger (mid-flight, 0.35s). One nesting level.
  **Blink as cargo teleports you to the impact point** — the teleport bolt.
- **Multicast (v0.5)**: modifier that casts the next 2 payloads simultaneously.
- **Payloads**: Bolt (starter), Burst (3-pellet fan), Slug (3 dmg, slow), Seeker
  Dart (homing), Spark/Timer Trigger. **Utility**: Blink. **Modifiers**: Twin Cast
  (×2), Haste (×1.6 speed), Ricochet (+2 bounces), Pierce, Heavy Round (+1 dmg,
  slower), Multicast. Pool: 13 cards + 4 frames.
- **Acquisition**: cards are found in the world — open nodes, plus **caches** sealed
  in destructible wall rings. *Every cache spawns with a canister beside it* — the
  key is always in the lock. Deck editing happens between sectors (both casters).
- Projectiles substep (≤8px/check) so hasted shots can't tunnel through walls.

### World & objective
- **Destructible terrain**: walls live in a cell grid; canister explosions carve it
  (chain reactions, rubble stains). Trigger canisters by shooting them or dash-touching
  them (you're invulnerable while dashing — it's a tool, not a trap).
- Objective per sector: collect all shards → gate opens → touch it. Heat spawns extra
  drifters over time; edge arrows point to offscreen objectives.
- 5 sectors, big and open (1800×1300 → 2600×1800): **Calibration Field → Relay Grid →
  Shatter Yard → Sentinel Works → Terminus.** Identity comes from hazard mix and
  canister/cache density.

### Enemies
All hazards have HP, die to cards and explosions, and drop flux where they die.
Bestiary: Drifter (2hp, bounces), Seeker (2hp, hunts; slower than you; walls are
cover), Sweeper (3hp, patrols a visible track), Pulsar (3hp, telegraphed expanding
rings — snipeable).

### Player kit & progression
- Thrust + dash (2 charges, full i-frames); 3 base integrity, cap 6.
- Mod draft (1 of 3) after each sector — 10 mods (movement/survival + Demolition
  Sync for explosion immunity).
- Meta shop: Reinforced Hull / Tuned Thrusters / Capacitor Bank, bought with cores.

### Determinism
Fixed 60 Hz step; world generation flows from the seeded run RNG (seed in HUD; dev
hooks `?seed=<hex>&sector=<1-5>`). Cosmetic variation uses position hashes, never the
run RNG.

## 6. Controls & input

| Input | Action |
|---|---|
| WASD / arrows | Thrust |
| Mouse | Aim; hold left button to cast |
| Space or Shift | Dash (invulnerable) |
| Q | Swap casters (when carrying two) |
| Esc | Pause / resume |
| Enter | Confirm / start / retry / continue |
| 1–3 / click | Buy upgrades, pick draft mods, edit the deck |
| Q (paused) | Abandon run (flux still banks) |

## 7. Progression & goals

Win: clear sector 5. Lose: integrity 0. Both bank flux. Difficulty scales via the
sector table in `config.ts`. Stats: runs, wins, best sector, lifetime flux, kills.

## 8. Look & feel

"Clinical neon lab." Dark grid arenas, chunky destructible cell walls with
deterministic texture, rubble scars where explosions landed, glowing card tiles,
particle bursts for every event. Color is information: blue player, gold objective/
Slug, green currency/Dart, warm hazards/canisters, purple modifiers. No audio yet.

## 9. Scope — shipped vs. later

**Shipped (v0.4, "The Caster"):**
- Card/deck caster with 10 cards incl. homing and damage-modifier archetypes
- World card drops + canister-keyed caches, between-sector deck editing
- Destructible terrain via explosions; chaining canisters
- Enemy HP/kills/flux drops; 5 big open sectors; mouse aim; edge arrows

**Shipped in v0.5 ("Trigger Protocol"):** trigger cards (Spark/Timer, incl. the
Blink teleport-bolt), Multicast, and Caster Frames with two-caster carry + Q swap.

**Later (deck-first roadmap):**
- Deeper nesting for triggers (trigger-in-trigger), orbitals, delayed/echo casts,
  deck-cycling utilities; more frames (a mana-like constraint frame?)
- Audio (SFX + music); gamepad; accessibility pass; daily seed; balance from playtests

## 10. Target & platform

Desktop browser, keyboard + mouse. Static Vite build on GitHub Pages.

## 11. Open questions

- Do modifier stacks need caps (Twin+Twin+Burst = 12 pellets)?
- Should caster stats (slot count, cast delay) be upgradeable, and where — drafts,
  meta shop, or found "caster frames"?
- Is Slug's 0.22s delay add enough cost for 3 damage?
- When trigger cards land, do they need a resource constraint (mana-like) or is
  cast/recharge tempo enough?
