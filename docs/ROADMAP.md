# Roadmap — simul

A phased view of where the project is headed. This is the human-readable summary; use
**GitHub Issues + Milestones** for the live task board (see `CLAUDE.md`). Check items off
as they land.

_Last updated: 2026-07-21_

---

## Phase 0 — Setup ✅ (in progress)

Get the project organized and runnable.

- [x] Repo structure, `.gitignore`, license
- [x] Vite + TypeScript build
- [x] Minimal game loop (renders a placeholder)
- [x] Documentation system (README, GDD, roadmap, decision log, dev log, CLAUDE.md)
- [x] CI (typecheck + build)
- [ ] Fill in the GDD: lock the concept, core loop, and MVP scope

## Phase 1 — Prototype

Prove the core idea is fun. Ugly is fine; throwaway code is fine.

- [ ] Implement the core loop from the GDD
- [ ] First real player input
- [ ] Decide: stay on plain canvas, or adopt an engine (Phaser / Three.js) — log in DECISIONS.md
- [ ] Playtest: is the core loop actually engaging?

## Phase 2 — Vertical slice

One small piece of the game, built to near-final quality — a proof of the real experience.

- [ ] One complete, polished slice of gameplay
- [ ] Basic art/audio direction applied
- [ ] Save/load or persistence if relevant
- [ ] Add a test framework once there's logic worth testing

## Phase 3 — MVP

The smallest genuinely playable/shippable version.

- [ ] All MVP-scope mechanics from the GDD
- [ ] Win/lose or session structure
- [ ] Onboarding so a new player understands it
- [ ] `v0.1.0` release + deploy (e.g. GitHub Pages)

## Phase 4 — Polish & beyond

- [ ] Feedback-driven iteration
- [ ] Post-MVP features from the GDD's "later" list
- [ ] Performance, accessibility, feel

---

> **Tip:** keep phases honest. Moving something to "later" is a design decision — jot the
> reasoning in `docs/DECISIONS.md`.
