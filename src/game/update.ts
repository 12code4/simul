// The simulation. update() advances the whole game by one fixed step:
// a phase machine (title/playing/draft/paused/end screens) plus the gameplay
// step itself. Mutates state; never draws.

import { config } from "./config";
import type { Input } from "./input";
import { buyUpgrade, META_TRACKS, saveMeta } from "./meta";
import { applyMod, rollDraft } from "./mods";
import { clamp, dist, resolveCircleRect } from "./physics";
import { range, rangeInt } from "./rng";
import { sectorDef, type SectorState } from "./sector";
import { createRun, enterSector, type GameState, type RunState } from "./state";

export function update(state: GameState, input: Input, dt: number): void {
  state.uiTime += dt;
  switch (state.phase) {
    case "title":
      updateTitle(state, input);
      break;
    case "playing":
      if (state.run) updatePlaying(state, state.run, input, dt);
      break;
    case "paused":
      updatePaused(state, input);
      break;
    case "draft":
      updateDraft(state, input, dt);
      break;
    case "gameover":
    case "victory":
      updateEnd(state, input, dt);
      break;
  }
}

// --- run lifecycle ---------------------------------------------------------

function startRun(state: GameState): void {
  // The only nondeterminism in the game: choosing a fresh seed.
  const seed = (Math.random() * 0xffffffff) >>> 0;
  state.meta.runs += 1;
  saveMeta(state.meta);
  state.run = createRun(state.meta, seed);
  state.draftOptions = null;
  state.outcome = null;
  state.menuIndex = 0;
  state.phase = "playing";
}

/** Bank this run's flux into persistent cores. Returns the amount banked. */
function bank(state: GameState, run: RunState, won: boolean): number {
  const banked = run.flux + (won ? config.flux.winBonus : 0);
  const m = state.meta;
  m.cores += banked;
  m.totalFlux += banked;
  if (won) m.wins += 1;
  m.bestSector = Math.max(m.bestSector, run.sectorIndex + 1);
  saveMeta(m);
  return banked;
}

function clearSector(state: GameState, run: RunState): void {
  run.flux += config.flux.sectorClear;
  if (run.sectorIndex >= config.sectors.length - 1) {
    const banked = bank(state, run, true);
    state.outcome = { won: true, banked, sectorReached: config.sectors.length, time: run.time };
    state.phase = "victory";
  } else {
    state.draftOptions = rollDraft(run.rng, run);
    state.menuIndex = 0;
    state.phase = "draft";
  }
}

// --- menu phases -----------------------------------------------------------

function updateTitle(state: GameState, input: Input): void {
  if (input.takePress("Enter") || input.takePress("Space")) {
    startRun(state);
    return;
  }
  META_TRACKS.forEach((track, i) => {
    if (input.takePress(`Digit${i + 1}`)) buyUpgrade(state.meta, track);
  });
}

function updatePaused(state: GameState, input: Input): void {
  if (input.takePress("Escape") || input.takePress("Enter")) {
    state.phase = "playing";
  } else if (input.takePress("KeyQ")) {
    if (state.run) bank(state, state.run, false);
    state.run = null;
    state.outcome = null;
    state.phase = "title";
  }
}

function updateDraft(state: GameState, input: Input, dt: number): void {
  const opts = state.draftOptions;
  const run = state.run;
  if (!opts || !run) {
    state.phase = "title";
    return;
  }
  tickCosmetics(run, dt);

  if (input.takePress("ArrowLeft") || input.takePress("KeyA")) {
    state.menuIndex = (state.menuIndex + opts.length - 1) % opts.length;
  }
  if (input.takePress("ArrowRight") || input.takePress("KeyD")) {
    state.menuIndex = (state.menuIndex + 1) % opts.length;
  }

  let choice = -1;
  for (let i = 0; i < opts.length; i++) {
    if (input.takePress(`Digit${i + 1}`)) choice = i;
  }
  if (input.takePress("Enter") || input.takePress("Space")) choice = state.menuIndex;

  if (choice >= 0 && choice < opts.length) {
    applyMod(run, opts[choice]);
    state.draftOptions = null;
    enterSector(run, run.sectorIndex + 1);
    state.phase = "playing";
  }
}

function updateEnd(state: GameState, input: Input, dt: number): void {
  if (state.run) tickCosmetics(state.run, dt);
  if (input.takePress("Enter")) {
    startRun(state);
  } else if (input.takePress("Escape")) {
    state.run = null;
    state.phase = "title";
  }
}

// --- the gameplay step -----------------------------------------------------

function updatePlaying(state: GameState, run: RunState, input: Input, dt: number): void {
  if (input.takePress("Escape")) {
    state.phase = "paused";
    return;
  }

  const p = run.player;
  const s = run.stats;
  const sec = run.sector;
  const def = sectorDef(sec.index);
  run.time += dt;
  sec.elapsed += dt;

  // Movement + dash.
  const ax = input.axis();
  if (ax.x !== 0 || ax.y !== 0) {
    p.faceX = ax.x;
    p.faceY = ax.y;
  }

  const wantDash =
    input.takePress("Space") || input.takePress("ShiftLeft") || input.takePress("ShiftRight");
  if (wantDash && p.dashTimer <= 0 && p.charges > 0) {
    let dx = ax.x;
    let dy = ax.y;
    if (dx === 0 && dy === 0) {
      const vlen = Math.hypot(p.vx, p.vy);
      if (vlen > 20) {
        dx = p.vx / vlen;
        dy = p.vy / vlen;
      } else {
        dx = p.faceX;
        dy = p.faceY;
      }
    }
    if (p.charges === s.dashCharges) p.recharge = s.dashRecharge; // timer starts when leaving full
    p.charges -= 1;
    p.dashTimer = s.dashDuration;
    p.dashX = dx;
    p.dashY = dy;
  }

  if (p.dashTimer > 0) {
    p.vx = p.dashX * config.dash.speed;
    p.vy = p.dashY * config.dash.speed;
    p.dashTimer -= dt;
    if (p.dashTimer <= 0) {
      p.iframes = Math.max(p.iframes, config.dash.graceIframes);
      // Exit the dash at top speed in the dash direction — keeps flow.
      p.vx = p.dashX * s.maxSpeed;
      p.vy = p.dashY * s.maxSpeed;
    }
    addParticle(run, p.x, p.y, -p.dashX * 40, -p.dashY * 40, 0.25, 4, config.colors.player);
  } else {
    p.vx += ax.x * s.accel * dt;
    p.vy += ax.y * s.accel * dt;
    const damp = Math.exp(-s.drag * dt);
    p.vx *= damp;
    p.vy *= damp;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > s.maxSpeed) {
      const k = s.maxSpeed / sp;
      p.vx *= k;
      p.vy *= k;
    }
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Collide with walls (slide) and arena bounds.
  const pr = config.player.radius;
  for (const wl of sec.walls) {
    const res = resolveCircleRect(p.x, p.y, pr, wl);
    if (res) {
      p.x = res.x;
      p.y = res.y;
      const vn = p.vx * res.nx + p.vy * res.ny;
      if (vn < 0) {
        p.vx -= res.nx * vn;
        p.vy -= res.ny * vn;
      }
    }
  }
  if (p.x < pr) { p.x = pr; if (p.vx < 0) p.vx = 0; }
  if (p.x > sec.w - pr) { p.x = sec.w - pr; if (p.vx > 0) p.vx = 0; }
  if (p.y < pr) { p.y = pr; if (p.vy < 0) p.vy = 0; }
  if (p.y > sec.h - pr) { p.y = sec.h - pr; if (p.vy > 0) p.vy = 0; }

  // Dash recharge and timers.
  if (p.charges < s.dashCharges) {
    p.recharge -= dt;
    if (p.recharge <= 0) {
      p.charges += 1;
      p.recharge = s.dashRecharge;
    }
  }
  p.iframes = Math.max(0, p.iframes - dt);

  updateHazards(run, sec, dt);
  updateHeat(run, sec, def.heatInterval, def.heatCap, dt);
  checkPlayerDamage(state, run);

  if (state.phase === "playing") {
    collectPickups(state, run);
  }

  // Camera follows the player, clamped to the arena.
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const k = 1 - Math.exp(-config.camera.stiffness * dt);
  run.camX += (p.x - run.camX) * k;
  run.camY += (p.y - run.camY) * k;
  run.camX = sec.w <= config.width ? sec.w / 2 : clamp(run.camX, halfW, sec.w - halfW);
  run.camY = sec.h <= config.height ? sec.h / 2 : clamp(run.camY, halfH, sec.h - halfH);

  tickCosmetics(run, dt);
}

// --- hazards ---------------------------------------------------------------

function updateHazards(run: RunState, sec: SectorState, dt: number): void {
  const hz = config.hazards;
  for (const hzd of sec.hazards) {
    switch (hzd.kind) {
      case "drifter": {
        hzd.x += hzd.vx * dt;
        hzd.y += hzd.vy * dt;
        for (const wl of sec.walls) {
          const res = resolveCircleRect(hzd.x, hzd.y, hzd.r, wl);
          if (res) {
            hzd.x = res.x;
            hzd.y = res.y;
            if (res.nx > 0) hzd.vx = Math.abs(hzd.vx);
            else if (res.nx < 0) hzd.vx = -Math.abs(hzd.vx);
            if (res.ny > 0) hzd.vy = Math.abs(hzd.vy);
            else if (res.ny < 0) hzd.vy = -Math.abs(hzd.vy);
          }
        }
        if (hzd.x < hzd.r) { hzd.x = hzd.r; hzd.vx = Math.abs(hzd.vx); }
        if (hzd.x > sec.w - hzd.r) { hzd.x = sec.w - hzd.r; hzd.vx = -Math.abs(hzd.vx); }
        if (hzd.y < hzd.r) { hzd.y = hzd.r; hzd.vy = Math.abs(hzd.vy); }
        if (hzd.y > sec.h - hzd.r) { hzd.y = sec.h - hzd.r; hzd.vy = -Math.abs(hzd.vy); }
        break;
      }
      case "seeker": {
        const p = run.player;
        const dx = p.x - hzd.x;
        const dy = p.y - hzd.y;
        const d = Math.hypot(dx, dy) || 1;
        const desX = (dx / d) * hz.seeker.maxSpeed;
        const desY = (dy / d) * hz.seeker.maxSpeed;
        const ddx = desX - hzd.vx;
        const ddy = desY - hzd.vy;
        const dl = Math.hypot(ddx, ddy);
        if (dl > 0.001) {
          const f = Math.min(1, (hz.seeker.steer * dt) / dl);
          hzd.vx += ddx * f;
          hzd.vy += ddy * f;
        }
        hzd.x += hzd.vx * dt;
        hzd.y += hzd.vy * dt;
        // Seekers slide along walls (emergent: walls work as cover).
        for (const wl of sec.walls) {
          const res = resolveCircleRect(hzd.x, hzd.y, hzd.r, wl);
          if (res) {
            hzd.x = res.x;
            hzd.y = res.y;
            const vn = hzd.vx * res.nx + hzd.vy * res.ny;
            if (vn < 0) {
              hzd.vx -= res.nx * vn;
              hzd.vy -= res.ny * vn;
            }
          }
        }
        hzd.x = clamp(hzd.x, hzd.r, sec.w - hzd.r);
        hzd.y = clamp(hzd.y, hzd.r, sec.h - hzd.r);
        break;
      }
      case "sweeper": {
        hzd.phase += hzd.rate * dt;
        const t = (Math.sin(hzd.phase) + 1) / 2;
        hzd.x = hzd.ax + (hzd.bx - hzd.ax) * t;
        hzd.y = hzd.ay + (hzd.by - hzd.ay) * t;
        break;
      }
      case "pulsar": {
        hzd.timer -= dt;
        if (hzd.timer <= 0) {
          hzd.timer += hz.pulsar.cycle;
          sec.rings.push({ x: hzd.x, y: hzd.y, age: 0 });
        }
        break;
      }
    }
  }

  for (let i = sec.rings.length - 1; i >= 0; i--) {
    const ring = sec.rings[i];
    ring.age += dt;
    if (ring.age >= hz.pulsar.ringDuration) sec.rings.splice(i, 1);
  }
}

/** Escalating pressure: periodically spawn an extra drifter at an arena edge. */
function updateHeat(run: RunState, sec: SectorState, interval: number, cap: number, dt: number): void {
  sec.heatTimer -= dt;
  if (sec.heatTimer > 0) return;
  sec.heatTimer += interval;
  if (sec.heatSpawned >= cap) return;

  const rng = run.rng;
  const hz = config.hazards.drifter;
  for (let attempt = 0; attempt < 8; attempt++) {
    const side = rangeInt(rng, 0, 3);
    let x = 0;
    let y = 0;
    if (side === 0) { x = range(rng, 40, sec.w - 40); y = 20; }
    else if (side === 1) { x = range(rng, 40, sec.w - 40); y = sec.h - 20; }
    else if (side === 2) { x = 20; y = range(rng, 40, sec.h - 40); }
    else { x = sec.w - 20; y = range(rng, 40, sec.h - 40); }
    if (dist(x, y, run.player.x, run.player.y) < 220) continue; // never spawn onto the player

    const tx = sec.w * range(rng, 0.3, 0.7);
    const ty = sec.h * range(rng, 0.3, 0.7);
    const d = dist(x, y, tx, ty) || 1;
    const speed = range(rng, hz.speedMin, hz.speedMax);
    sec.hazards.push({
      kind: "drifter",
      x,
      y,
      vx: ((tx - x) / d) * speed,
      vy: ((ty - y) / d) * speed,
      r: range(rng, hz.rMin, hz.rMax),
    });
    sec.heatSpawned += 1;
    addBurst(run, x, y, config.colors.drifter, 8);
    return;
  }
}

// --- damage & pickups ------------------------------------------------------

function checkPlayerDamage(state: GameState, run: RunState): void {
  const p = run.player;
  if (p.dashTimer > 0 || p.iframes > 0) return; // dashing grants i-frames

  const pr = config.player.radius;
  const sec = run.sector;
  for (const hzd of sec.hazards) {
    const d = dist(hzd.x, hzd.y, p.x, p.y);
    if (d < hzd.r + pr) {
      damagePlayer(state, run, (p.x - hzd.x) / (d || 1), (p.y - hzd.y) / (d || 1));
      return;
    }
  }

  const rc = config.hazards.pulsar;
  for (const ring of sec.rings) {
    const ringR = rc.ringMaxR * (ring.age / rc.ringDuration);
    const d = dist(ring.x, ring.y, p.x, p.y);
    if (Math.abs(d - ringR) < rc.ringBand + pr * 0.5) {
      damagePlayer(state, run, (p.x - ring.x) / (d || 1), (p.y - ring.y) / (d || 1));
      return;
    }
  }
}

function damagePlayer(state: GameState, run: RunState, nx: number, ny: number): void {
  run.integrity -= 1;
  const p = run.player;
  p.iframes = config.player.hitIframes * run.stats.iframeMult;
  p.dashTimer = 0;
  p.vx = nx * config.player.hitKnockback;
  p.vy = ny * config.player.hitKnockback;
  run.shake = 1;
  addBurst(run, p.x, p.y, config.colors.drifter, 18);

  if (run.integrity <= 0) {
    const banked = bank(state, run, false);
    state.outcome = { won: false, banked, sectorReached: run.sectorIndex + 1, time: run.time };
    state.phase = "gameover";
    addBurst(run, p.x, p.y, config.colors.player, 40);
  }
}

function collectPickups(state: GameState, run: RunState): void {
  const p = run.player;
  const sec = run.sector;
  const s = run.stats;

  for (let i = sec.motes.length - 1; i >= 0; i--) {
    const m = sec.motes[i];
    if (dist(m.x, m.y, p.x, p.y) < s.pickupRadius) {
      sec.motes.splice(i, 1);
      run.flux += config.flux.mote;
      addBurst(run, m.x, m.y, config.colors.mote, 4);
    }
  }

  for (let i = sec.shards.length - 1; i >= 0; i--) {
    const sh = sec.shards[i];
    if (dist(sh.x, sh.y, p.x, p.y) < s.pickupRadius + 6) {
      sec.shards.splice(i, 1);
      addBurst(run, sh.x, sh.y, config.colors.shard, 12);
      if (sec.shards.length === 0) {
        sec.gate.open = true;
        addBurst(run, sec.gate.x, sec.gate.y, config.colors.gateOpen, 24);
      }
    }
  }

  const g = sec.gate;
  if (g.open && dist(g.x, g.y, p.x, p.y) < g.r + config.player.radius) {
    clearSector(state, run);
  }
}

// --- particles (cosmetic state; deterministic, never drains run.rng) -------

function addParticle(
  run: RunState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  color: string,
): void {
  if (run.particles.length > config.particleCap) run.particles.shift();
  run.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
}

function addBurst(run: RunState, x: number, y: number, color: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5;
    const sp = 60 + ((i * 37) % 90);
    addParticle(run, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.35 + (i % 5) * 0.06, 2 + (i % 3), color);
  }
}

/** Advance purely cosmetic bits (particles, shake). Safe in any phase. */
function tickCosmetics(run: RunState, dt: number): void {
  run.shake = Math.max(0, run.shake - 3 * dt);
  for (let i = run.particles.length - 1; i >= 0; i--) {
    const pt = run.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      run.particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    const damp = Math.exp(-3.5 * dt);
    pt.vx *= damp;
    pt.vy *= damp;
  }
}
