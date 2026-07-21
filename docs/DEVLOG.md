# Dev Log

A running journal of development. Short, dated entries: what changed, what was learned,
what's next. A classic indie-dev habit — it keeps momentum visible and doubles as raw
material for devlogs or social posts later.

**Newest entry at the top.**

---

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
