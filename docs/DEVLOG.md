# Dev Log

A running journal of development. Short, dated entries: what changed, what was learned,
what's next. A classic indie-dev habit — it keeps momentum visible and doubles as raw
material for devlogs or social posts later.

**Newest entry at the top.**

---

## 2026-07-21 — Project kickoff & scaffolding

- Set up the repo as an organized, solo-optimized game project.
- Chose Vite + TypeScript with a plain-canvas game loop (see `DECISIONS.md` for why).
- Added a minimal runnable skeleton: a fixed-timestep loop bouncing a placeholder ball —
  proves the update/render pipeline works end to end.
- Established the documentation system: README, `CLAUDE.md`, GDD template, roadmap,
  decision log, this dev log, plus a changelog and CI.
- **Next:** fill in the GDD — decide what `simul` actually *is* (genre, core loop, MVP).
