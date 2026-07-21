# Decision Log

A lightweight record of *why* key technical and design decisions were made. Cheap to keep,
invaluable later — especially across AI-assisted sessions where the "why" is easy to lose.

**Format:** newest at the top. Each entry:

```
## YYYY-MM-DD — Short title
**Decision:** what we chose.
**Why:** the reasoning.
**Alternatives considered:** what we didn't pick, and why not.
```

---

## 2026-07-21 — Vite + TypeScript, plain canvas (no engine yet)
**Decision:** Build the game as a browser app with Vite + TypeScript, using a plain
`<canvas>` 2D context and a hand-written game loop. No game engine (Phaser/Three.js) yet.
**Why:** Lowest commitment while the concept is undefined. Instant hot-reload preview,
shareable via URL, excellent AI-assisted (vibe-coding) workflow, clean git history. Keeps
the door open to any genre. An engine can be dropped in later without restructuring.
**Alternatives considered:** Godot (great engine, but the editor sits between the dev and
the AI — less suited to vibe coding); Python/pygame (simple, but less shareable and no
browser preview); committing to Phaser/Three.js now (premature before the concept is set).

## 2026-07-21 — Solo-optimized project setup (skip team ceremony)
**Decision:** Set up docs, one CI check, and conventions — but skip issue/PR templates,
CONTRIBUTING, and CODEOWNERS.
**Why:** Solo, AI-assisted project. Those artifacts are overhead for a team of one and can
be added retroactively if collaborators appear. Keep every file earning its place.
**Alternatives considered:** Full "pro" GitHub setup (rejected as bloat for now); no
process at all (rejected — loses the documentation/version-control benefits entirely).
