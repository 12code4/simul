# Game Design Document — simul

> Living document. This is the source of truth for *what* we're building and *why*.
> Update it when a mechanic or scope firms up.

_Last updated: 2026-07-21 · Status: **v2 concept — "Substrate & Casters" (Noita-inspired) shipped as first playable v0.3**_

---

## 1. One-line pitch

A sandbox roguelite in a simulated world: pilot a fragile probe through five big open
sectors where fire spreads across oil, acid melts the walls, and your weapon is a
deck of cards — harvest data shards, build your caster, and let the simulation fight
for you.

## 2. Concept & fantasy

You are a probe inside a hostile simulation. The world runs on simple material rules —
fire ignites oil, coolant quenches fire into steam, acid dissolves terrain — and
**everything obeys them equally**: you, the hazards, and the level itself. Your defense
is movement (thrust + an invulnerable dash). Your offense is a **Caster**: a deck of
found cards cast in order, Noita-wand style. The fantasy: mastering a chaotic but fair
physical system — turning its own rules into your weapon.

Runs are 8–15 minutes. Death banks your flux — every run makes the next stronger.

## 3. Design pillars

1. **Movement is king.** The dash and momentum kit is the heart of survival. Casting
   never roots you; no mechanic may make standing still optimal.
   *(Revised in v0.3: was "movement is the only verb" — combat was added by design
   direction, but movement remains the primary skill.)*
2. **Systems, not scripts.** Hazards are autonomous agents; materials follow cellular
   rules; difficulty is density and interaction, never choreography. If a feature can
   be expressed as a simulation rule instead of a special case, it must be.
3. **One set of rules for everyone.** Fire burns hazards too. Explosions carve terrain
   for anyone. The player's strongest plays come from turning the world's rules against
   its agents.
4. **Death is progress.** Flux always banks into permanent cores.
5. **Always readable.** Telegraphs (pulsar arcs, canister fuses, sweeper tracks),
   color-as-information, edge arrows to objectives. You can always see why you died.

## 4. Core loop

**Seconds:** scan → route → weave/dash → cast into the environment (ignite the oil the
seeker is crossing) → grab a shard or card → heat rises → repeat → gate.

**Minutes (per run):** clear sector → draft a mod + edit your deck → bigger, wilder
sector → win at sector 5 or die trying.

**Hours (meta):** bank flux → permanent upgrades → deeper, faster, cleaner; hunt better
deck builds from world drops.

## 5. Mechanics & systems

### The substrate (the Noita-inspired layer)
Every sector floor is a 16px material grid simulated as a cellular automaton (10 Hz):

| Material | Effect on entities | Interactions |
|---|---|---|
| Coolant | Slows; makes you **wet** (fireproof 4s); extinguishes burning | Quenches adjacent fire → steam |
| Oil | Slippery (weak thrust/brakes); makes you **oiled** | Fire spreads across it cell-to-cell |
| Fire | Ignites the unprotected → **burning** | Burns out to scorch; beaten by coolant |
| Acid | Damage tick while standing in it | **Dissolves wall cells** — terrain is destructible |
| Steam | Breaks seeker tracking | Fades in ~3s |
| Walls | Solid terrain — lives IN the grid | Carved by acid and explosions (border ring is indestructible) |

**Statuses apply to hazards too**: drifters/seekers/corroders ignite, burn for 1.2s,
and die — kiting enemies through fire is real offense. Burning agents drip fire onto
oil they cross. Coolant slows them just like you.

### The Caster (card/deck weapon system)
Noita's wand system is internally a card/deck architecture — ours is explicitly that:

- **Caster = deck**: 5 ordered slots, a cast delay (~0.26s), and a recharge (~0.9s)
  when the deck pointer wraps.
- **Cast = deck walk**: each trigger pull reads from the pointer; **modifier cards
  fold into the next payload** (Twin, Haste, Ricochet, Pierce), which then fires.
- **Payload cards**: Bolt, Burst (3 pellets), Firebolt, Waterball, Acid Spit,
  Oil Slick — material payloads splash their material into the substrate on impact.
  **Blink** (utility) teleports toward the aim.
- **Acquisition**: cards are **found in the world** — floating card nodes, plus
  **caches** sealed inside destructible wall rings (acid, canisters, or Corrosive
  Wake crack them). Deck editing happens **between sectors** (holy-mountain style).
- Starting deck: a single Bolt. Everything else is found.

### Enemies, props, objective
- All hazards have HP and can be destroyed by cards, fire, coolant (igniters), or
  explosions; kills drop flux where the agent died.
- Bestiary: Drifter (2hp, bounces), Seeker (2hp, hunts, blinded by steam, mushy in
  oil), Sweeper (3hp, patrols), Pulsar (3hp, ring emitter — now snipeable), **Igniter**
  (1hp, fire trail, dies instantly in coolant), **Corroder** (2hp, acid trail that
  eats the level, ruptures into acid on death).
- **Canisters** explode (carve terrain, ignite, chain) when shot, cooked by fire, or
  triggered by a dashing (invulnerable) player.
- Objective per sector: collect all shards → gate opens → touch it. Heat still spawns
  extra drifters over time; edge arrows point to offscreen objectives.
- 5 sectors, big and open (1800×1300 → 2600×1800), each with a material identity:
  **Calibration Field → Coolant Basin → Fuel Depot → Corrosion Works → Crucible**.

### Player kit & progression
- Thrust + dash (2 charges, i-frames) unchanged; 3 base integrity, cap 6.
- Mod draft (1 of 3) after each sector — now includes material mods: Fireproof
  Plating, Hydro Jets, Slick Coating, **Corrosive Wake** (dash leaves acid),
  Demolition Sync (explosion-immune).
- Meta shop unchanged: Reinforced Hull / Tuned Thrusters / Capacitor Bank via cores.

### Determinism
Fixed 60 Hz step. World generation flows from the seeded run RNG (seed in HUD; dev
hooks `?seed=<hex>&sector=<1-5>`). The material CA and cosmetics use position/tick
hashes instead of the run RNG, so chaos never perturbs generation.

## 6. Controls & input

| Input | Action |
|---|---|
| WASD / arrows | Thrust |
| **Mouse** | **Aim; hold left button to cast** |
| Space or Shift | Dash (invulnerable) |
| Esc | Pause / resume |
| Enter | Confirm / start / retry / continue |
| 1–3 | Buy upgrade (title) / pick draft mod |
| Click | Pick mods; deck editing (card → destination) |
| Q (paused) | Abandon run (flux still banks) |

*(v0.3: mouse aim replaced keyboard-only input — a deliberate pillar revision for the
sandbox direction.)*

## 7. Progression & goals

Win: clear sector 5. Lose: integrity 0. Both bank flux. Difficulty scales via the
sector table in `config.ts` (arena size, agent counts/types, material pools, heat).
Stats tracked: runs, wins, best sector, lifetime flux, kills per run.

## 8. Look & feel

"Clinical neon lab, now with weather." Dark grid arenas; chunky 16px material cells
with deterministic texture; fire flickers, steam drifts, scorch stains persist — the
floor is a record of the run. Color is information: blue player/coolant family, gold
objectives, green currency/acid family (distinct shades), warm hazards, purple
modifiers. No audio yet — top post-v0.3 priority.

## 9. Scope — shipped vs. later

**Shipped in v0.3 ("Substrate & Casters"):**
- Material CA + destructible terrain + statuses for everyone
- Card/deck caster, 11 cards, world drops + caches, between-sector deck editor
- Enemy HP/kills/flux drops, canisters, Igniter + Corroder, 5 biome-flavored
  open sectors, mouse aim, edge arrows, 5 new mods

**Later:**
- **Audio** (SFX + music) — biggest missing juice
- Trigger cards (cast-on-impact payloads — the deepest Noita combo mechanic)
- More materials (lava? conductive shock?), more agents, boss-sector twist
- Minimap or zoom-out pulse; gamepad; remappable keys; accessibility pass
  (reduced flash, colorblind-safe audit)
- Daily seed, run history, speedrun timer
- Balance pass from real playtesting (economy: card density, HP curves, heat)

## 10. Target & platform

Desktop browser, keyboard + mouse. Static Vite build on GitHub Pages.

## 11. Open questions

- Is starter-deck-[Bolt] too thin for sector 1, or a clean teaching moment?
- Should caches guarantee a nearby tool (canister within N px), or is scarcity fun?
- Do modifier stacks need caps (Twin×Twin×Burst = 12 pellets)?
- When do trigger cards land, and do they need a mana-like constraint?
