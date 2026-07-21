# Dev Log

A running journal of development. Short, dated entries: what changed, what was learned,
what's next. A classic indie-dev habit — it keeps momentum visible and doubles as raw
material for devlogs or social posts later.

**Newest entry at the top.**

---

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
