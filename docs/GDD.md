# Game Design Document — simul

> Living document. This is the source of truth for *what* we're building and *why*.
> Update it when a mechanic or scope firms up.

_Last updated: 2026-07-21 · Status: **v1 concept locked — first playable shipped**_

---

## 1. One-line pitch

A keyboard-only roguelite about pure movement: dash a fragile probe through five
escalating simulated sectors, harvesting data shards while autonomous hazards hunt,
sweep, and pulse around you.

## 2. Concept & fantasy

You are a probe inside a hostile simulation. You have no weapons — only thrust and a
short invulnerable dash. Everything that threatens you is an autonomous agent following
simple rules, not a scripted pattern; survival is about *reading the system* and routing
through it. The fantasy: being fast, precise, and untouchable in a world that is
indifferent, mechanical, and escalating.

Runs are short (5–10 minutes). Death ends the run but banks your flux — the roguelite
contract: every run makes the next one a little stronger.

## 3. Design pillars

Every feature is checked against these:

1. **Movement is the only verb.** No shooting, no combat. If a mechanic doesn't make
   moving more interesting, it doesn't go in.
2. **Systems, not scripts.** Hazards are agents with simple autonomous behaviors
   (bounce, seek, patrol, pulse). Difficulty comes from density and interaction, never
   from choreographed sequences.
3. **Death is progress.** Flux always banks into permanent cores. A failed run is never
   wasted time.
4. **Always readable.** The player should always be able to see why they got hit:
   telegraphs (pulsar charge arcs, sweeper tracks, heat spawn bursts), clean silhouettes,
   one screen-space of information.

## 4. Core loop

**Seconds (15–60s):** scan the sector → plan a route → weave/dash between agents →
grab a shard → heat rises → repeat until all shards are collected → sprint to the gate.

**Minutes (per run):** clear sector → draft 1 of 3 movement mods → deeper sector with
more/nastier agents → win at sector 5 or die trying.

**Hours (meta):** bank flux as cores → buy permanent upgrades (hull/thrusters/capacitor)
→ push further → clear the simulation → chase faster/cleaner clears.

## 5. Mechanics & systems

**Player:** momentum movement (thrust + drag), top speed ~340 px/s. Dash: 980 px/s for
0.16s with full invulnerability, 2 charges (rechargeable), i-frames on hit with knockback.
Integrity (HP) starts at 3, capped at 6.

**Sector objective:** collect all data shards → the exit gate opens → touch it to clear.

**Heat:** every N seconds (10s in sector 1, down to 6s in sector 5) an extra drifter
spawns at the arena edge, up to a cap. Lingering is a real cost; greed for flux motes is
a real choice.

**Hazard bestiary (all autonomous):**

| Agent | Behavior | Introduced |
|---|---|---|
| Drifter | Constant velocity, bounces off walls (billiards) | Sector 1 |
| Seeker | Steers toward the player; slower than you, walls work as cover | Sector 2 |
| Sweeper | Patrols a fixed track sinusoidally, fast | Sector 2 |
| Pulsar | Stationary; emits an expanding damage ring on a telegraphed cycle | Sector 3 |

**In-run drafts (choose 1 of 3 after sectors 1–4):** Coolant Loop, Twin Capacitor,
Long Burn, Overclock, Hull Plating, Nanite Purge, Magnet Coil, Phase Skin, Inertial
Damper. All movement/survival-flavored; wasted picks (heal at full HP) are excluded
from the roll.

**Meta shop (spend cores on the title screen):** Reinforced Hull (+1 starting integrity
per tier), Tuned Thrusters (+6% speed/thrust per tier), Capacitor Bank (faster dash
recharge; tier 2 adds a charge). Three tiers each.

**Determinism & seeds:** every sector is generated from a seeded PRNG stored in run
state; the seed is shown in the HUD. The simulation runs on a fixed 60 Hz timestep.

## 6. Controls & input

| Input | Action |
|---|---|
| WASD / arrows | Thrust |
| Space or Shift | Dash (invulnerable) |
| Esc | Pause / resume |
| Enter | Confirm / start / retry |
| 1–3 | Buy upgrade (title) / pick draft card |
| Q (paused) | Abandon run (flux still banks) |

Keyboard-only is deliberate: it keeps the game about movement, not aiming.

## 7. Progression & goals

- **Win condition:** clear sector 5 → "SIMULATION CLEARED" + win bonus flux.
- **Lose condition:** integrity hits 0 → "SIGNAL LOST"; flux still banks.
- **Difficulty curve:** the sector table in `config.ts` scales arena size, agent counts,
  agent types, shard count, and heat rate per sector.
- **Long-term:** lifetime stats (runs, wins, best sector, total flux) + maxing the three
  meta tracks. Post-v1 candidates: daily seed, clear-time chasing.

## 8. Look & feel

**"Clinical neon lab."** Dark grid arenas, glowing geometric entities, particle bursts
for every event (pickup, hit, dash trail, gate opening). Color is information: blue =
player, gold = objective, green = currency/exit, warm hues = hazards. The HUD includes a
small "sim readout" (elapsed time, agent count, seed) to lean into the simulation frame.
No audio yet — planned post-v1.

## 9. Scope — v1 vs. later

**v1 (shipped as first playable):**
- 5-sector run structure, 4 hazard types, heat pressure, shard→gate objective
- Dash/i-frame movement kit, 9 draft mods, 3 meta tracks, localStorage persistence
- Procedural sectors from seeds, full menu flow, particles/screenshake juice

**Later / explicitly out of v1:**
- Audio (SFX + music) — biggest missing juice
- Gamepad support; remappable keys
- More hazard/agent types, sector biomes with distinct rules, a boss-style sector 5 twist
- Daily seed runs, run-history stats, speedrun timer surfacing
- Accessibility: reduced-flash mode, colorblind-safe palette audit
- Balance pass driven by real playtesting

## 10. Target & platform

Desktop browser, keyboard. Ships as a static Vite build (deployable to GitHub Pages).

## 11. Open questions

- Is the sector-5 difficulty spike right? (Needs playtesting.)
- Should heat eventually spawn seekers instead of drifters in late sectors?
- Do drafts need rarity tiers, or is a flat pool cleaner?
- Deploy target: GitHub Pages now, or wait until after a balance pass?
