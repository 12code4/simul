// The simulation. update() advances the whole game by one fixed step:
// a phase machine (title/playing/draft/paused/end screens) plus the gameplay
// step itself. Mutates state; never draws.

import { applyCastModifier, CARDS, emptyCastMods, type CardId } from "./cards";
import { config } from "./config";
import type { Input } from "./input";
import { buyUpgrade, META_TRACKS, saveMeta } from "./meta";
import { applyMod, rollDraft, type ModId } from "./mods";
import { clamp, dist } from "./physics";
import { range, rangeInt } from "./rng";
import { sectorDef, type Hazard, type SectorState } from "./sector";
import { createRun, enterSector, type GameState, type RunState } from "./state";
import { detonate, MAT, matAt, resolveCircleSubstrate } from "./substrate";
import { CONTINUE_RECT, deckSlotRect, draftCardRect, inRect, inventoryRect } from "./ui";

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
  // The only nondeterminism in the game: choosing a fresh seed. Dev hooks
  // (?seed=hex&sector=n) pin it for reproducible testing.
  const seed = state.dev.seed ?? (Math.random() * 0xffffffff) >>> 0;
  state.meta.runs += 1;
  saveMeta(state.meta);
  state.run = createRun(state.meta, seed);
  if (state.dev.sector !== null && state.dev.sector > 1) {
    enterSector(state.run, state.dev.sector - 1);
  }
  state.draftOptions = null;
  state.outcome = null;
  state.menuIndex = 0;
  state.chosenMod = null;
  state.editSel = null;
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
    state.outcome = { won: true, banked, sectorReached: config.sectors.length, time: run.time, kills: run.kills };
    state.phase = "victory";
  } else {
    state.draftOptions = rollDraft(run.rng, run);
    state.menuIndex = 0;
    state.chosenMod = null;
    state.editSel = null;
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

/**
 * The sector-clear screen: pick one mod (required), optionally rearrange the
 * caster deck (click a card, click a destination), then continue.
 */
function updateDraft(state: GameState, input: Input, dt: number): void {
  const opts = state.draftOptions;
  const run = state.run;
  if (!opts || !run) {
    state.phase = "title";
    return;
  }
  tickCosmetics(run, dt);

  // Keyboard: digits pick a mod, arrows move the highlight, Enter continues.
  if (input.takePress("ArrowLeft") || input.takePress("KeyA")) {
    state.menuIndex = (state.menuIndex + opts.length - 1) % opts.length;
  }
  if (input.takePress("ArrowRight") || input.takePress("KeyD")) {
    state.menuIndex = (state.menuIndex + 1) % opts.length;
  }
  for (let i = 0; i < opts.length; i++) {
    if (input.takePress(`Digit${i + 1}`)) {
      state.chosenMod = i;
      state.menuIndex = i;
    }
  }

  if (input.takeClick()) {
    handleDraftClick(state, run, opts, input.mouse().x, input.mouse().y);
    if (state.phase !== "draft") return; // continue button advanced the run
  }

  const confirm = input.takePress("Enter") || input.takePress("Space");
  if (confirm) {
    if (state.chosenMod === null) state.chosenMod = state.menuIndex;
    advanceFromDraft(state, run, opts[state.chosenMod]);
  }
}

function advanceFromDraft(state: GameState, run: RunState, mod: ModId): void {
  applyMod(run, mod);
  state.draftOptions = null;
  state.chosenMod = null;
  state.editSel = null;
  enterSector(run, run.sectorIndex + 1);
  state.phase = "playing";
}

function handleDraftClick(
  state: GameState,
  run: RunState,
  opts: ModId[],
  mx: number,
  my: number,
): void {
  // Mod cards.
  for (let i = 0; i < opts.length; i++) {
    if (inRect(mx, my, draftCardRect(i, opts.length))) {
      state.chosenMod = i;
      state.menuIndex = i;
      return;
    }
  }
  if (inRect(mx, my, CONTINUE_RECT) && state.chosenMod !== null) {
    advanceFromDraft(state, run, opts[state.chosenMod]);
    return;
  }
  // Deck slots.
  const caster = run.caster;
  for (let i = 0; i < caster.slots.length; i++) {
    if (inRect(mx, my, deckSlotRect(i, caster.slots.length))) {
      clickDeckSlot(state, run, i);
      return;
    }
  }
  // Inventory tiles (one extra tile acts as the unequip target).
  for (let i = 0; i <= run.inventory.length; i++) {
    if (inRect(mx, my, inventoryRect(i))) {
      clickInventory(state, run, i);
      return;
    }
  }
  state.editSel = null;
}

function clickDeckSlot(state: GameState, run: RunState, i: number): void {
  const sel = state.editSel;
  const slots = run.caster.slots;
  if (sel === null) {
    if (slots[i] !== null) state.editSel = { zone: "slot", index: i };
    return;
  }
  if (sel.zone === "slot") {
    if (sel.index !== i) {
      const tmp = slots[sel.index];
      slots[sel.index] = slots[i];
      slots[i] = tmp;
    }
    state.editSel = null;
  } else {
    // Place (or swap) an inventory card into this slot.
    const card = run.inventory[sel.index];
    if (card !== undefined) {
      const displaced = slots[i];
      slots[i] = card;
      run.inventory.splice(sel.index, 1);
      if (displaced !== null) run.inventory.push(displaced);
    }
    state.editSel = null;
  }
}

function clickInventory(state: GameState, run: RunState, i: number): void {
  const sel = state.editSel;
  if (sel === null) {
    if (i < run.inventory.length) state.editSel = { zone: "inv", index: i };
    return;
  }
  if (sel.zone === "slot") {
    // Unequip the selected slot card into the inventory.
    const card = run.caster.slots[sel.index];
    if (card !== null) {
      run.inventory.push(card);
      run.caster.slots[sel.index] = null;
    }
  }
  state.editSel = null;
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

  // Collide with terrain (wall cells) — slide along contacts.
  const pr = config.player.radius;
  const hit = resolveCircleSubstrate(sec.substrate, p.x, p.y, pr);
  if (hit) {
    p.x = hit.x;
    p.y = hit.y;
    const vn = p.vx * hit.nx + p.vy * hit.ny;
    if (vn < 0) {
      p.vx -= hit.nx * vn;
      p.vy -= hit.ny * vn;
    }
  }
  p.x = clamp(p.x, pr, sec.w - pr);
  p.y = clamp(p.y, pr, sec.h - pr);

  // Dash recharge and timers.
  if (p.charges < s.dashCharges) {
    p.recharge -= dt;
    if (p.recharge <= 0) {
      p.charges += 1;
      p.recharge = s.dashRecharge;
    }
  }
  p.iframes = Math.max(0, p.iframes - dt);

  // Casting: hold the mouse to fire at the caster's cadence.
  run.caster.castTimer = Math.max(0, run.caster.castTimer - dt);
  if (input.mouseHeld() && run.caster.castTimer <= 0) {
    const m = input.mouse();
    const aimX = run.camX + (m.x - config.width / 2);
    const aimY = run.camY + (m.y - config.height / 2);
    castFromDeck(run, aimX, aimY);
  }

  updateProjectiles(run, sec, dt);
  updateHazards(run, sec, dt);
  updateCanisters(state, run, sec, dt);
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

// --- casting & projectiles -------------------------------------------------

/**
 * Walk the deck from the pointer: fold consecutive modifier cards into the
 * next payload/utility card, cast it, and advance. Wrapping past the end of
 * the deck triggers the recharge delay instead of the (short) cast delay.
 */
function castFromDeck(run: RunState, aimX: number, aimY: number): void {
  const c = run.caster;
  const len = c.slots.length;
  const mods = emptyCastMods();
  let payload: CardId | null = null;
  let idx = c.pointer;
  let wrapped = false;

  for (let scanned = 0; scanned < len; scanned++) {
    const card = c.slots[idx];
    idx += 1;
    if (idx >= len) {
      idx = 0;
      wrapped = true;
    }
    if (card === null) continue;
    const def = CARDS[card];
    if (def.kind === "modifier") {
      applyCastModifier(mods, card);
      continue;
    }
    payload = card;
    break;
  }

  c.pointer = idx;
  if (payload === null) {
    // Deck holds no castable card (empty or modifiers only): brief idle spin.
    c.castTimer = c.rechargeTime;
    c.recharging = true;
    return;
  }

  const def = CARDS[payload];
  c.castTimer = wrapped ? c.rechargeTime + def.delayAdd : c.castDelay + def.delayAdd;
  c.recharging = wrapped;

  const p = run.player;
  const baseAngle = Math.atan2(aimY - p.y, aimX - p.x);

  if (payload === "blink") {
    blinkPlayer(run, baseAngle);
    return;
  }

  const shots = def.pellets * mods.count;
  const halfSpread = def.spread * (def.pellets - 1) + (mods.count > 1 ? 0.05 : 0);
  const sec = run.sector;
  for (let i = 0; i < shots; i++) {
    if (sec.projectiles.length >= config.caster.projectileCap) break;
    const t = shots === 1 ? 0 : (i / (shots - 1)) * 2 - 1; // -1 .. 1 across the fan
    const angle = baseAngle + t * halfSpread;
    const speed = def.speed * mods.speedMult;
    sec.projectiles.push({
      x: p.x + Math.cos(angle) * (config.player.radius + 6),
      y: p.y + Math.sin(angle) * (config.player.radius + 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 4,
      dmg: def.dmg + mods.dmgAdd,
      card: payload,
      life: def.life,
      bounces: mods.bounces,
      pierce: mods.pierce,
      homing: def.homing,
      hitIds: [],
    });
  }
  addBurst(run, p.x + Math.cos(baseAngle) * 14, p.y + Math.sin(baseAngle) * 14, def.color, 3);
}

/** Short teleport toward the aim, stopped by terrain. */
function blinkPlayer(run: RunState, angle: number): void {
  const p = run.player;
  const sec = run.sector;
  const step = 8;
  const max = config.caster.blinkRange;
  let bx = p.x;
  let by = p.y;
  for (let d = step; d <= max; d += step) {
    const nx = p.x + Math.cos(angle) * d;
    const ny = p.y + Math.sin(angle) * d;
    if (nx < 20 || ny < 20 || nx > sec.w - 20 || ny > sec.h - 20) break;
    if (matAt(sec.substrate, nx, ny) === MAT.wall) break;
    bx = nx;
    by = ny;
  }
  addBurst(run, p.x, p.y, config.colors.player, 8);
  p.x = bx;
  p.y = by;
  p.iframes = Math.max(p.iframes, 0.1);
  addBurst(run, p.x, p.y, config.colors.player, 8);
}

function updateProjectiles(run: RunState, sec: SectorState, dt: number): void {
  for (let i = sec.projectiles.length - 1; i >= 0; i--) {
    const pr = sec.projectiles[i];
    pr.life -= dt;
    if (pr.life <= 0) {
      addBurst(run, pr.x, pr.y, CARDS[pr.card].color, 4);
      sec.projectiles.splice(i, 1);
      continue;
    }

    // Homing payloads curve toward the nearest agent in range.
    if (pr.homing && sec.hazards.length > 0) {
      let best: Hazard | null = null;
      let bestD: number = config.caster.homingRange;
      for (const hzd of sec.hazards) {
        if (pr.hitIds.includes(hzd.id)) continue;
        const d = dist(hzd.x, hzd.y, pr.x, pr.y);
        if (d < bestD) {
          bestD = d;
          best = hzd;
        }
      }
      if (best) {
        const speed = Math.hypot(pr.vx, pr.vy);
        const want = Math.atan2(best.y - pr.y, best.x - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = clamp(diff, -config.caster.homingSteer * dt, config.caster.homingSteer * dt);
        pr.vx = Math.cos(cur + turn) * speed;
        pr.vy = Math.sin(cur + turn) * speed;
      }
    }

    // Substep the motion so fast (hasted) shots can't tunnel through
    // single-cell walls: never advance more than ~half a cell per check.
    const oldX = pr.x;
    const oldY = pr.y;
    const stepLen = Math.hypot(pr.vx, pr.vy) * dt;
    const steps = Math.max(1, Math.ceil(stepLen / 8));
    let blocked = false;
    for (let sStep = 0; sStep < steps && !blocked; sStep++) {
      pr.x += (pr.vx * dt) / steps;
      pr.y += (pr.vy * dt) / steps;
      blocked =
        matAt(sec.substrate, pr.x, pr.y) === MAT.wall ||
        pr.x < 0 || pr.y < 0 || pr.x > sec.w || pr.y > sec.h;
    }

    // Terrain hit — bounce (axis-aligned reflection) or impact.
    if (blocked) {
      if (pr.bounces > 0) {
        pr.bounces -= 1;
        const hitX = matAt(sec.substrate, pr.x, oldY) === MAT.wall || pr.x < 0 || pr.x > sec.w;
        const hitY = matAt(sec.substrate, oldX, pr.y) === MAT.wall || pr.y < 0 || pr.y > sec.h;
        if (hitX || !hitY) pr.vx = -pr.vx;
        if (hitY || !hitX) pr.vy = -pr.vy;
        pr.x = oldX;
        pr.y = oldY;
        addBurst(run, pr.x, pr.y, CARDS[pr.card].color, 3);
      } else {
        addBurst(run, oldX, oldY, CARDS[pr.card].color, 5);
        sec.projectiles.splice(i, 1);
      }
      continue;
    }

    // Canister hit — light the fuse.
    for (const can of sec.canisters) {
      if (can.fuse < 0 && dist(can.x, can.y, pr.x, pr.y) < can.r + pr.r) {
        can.fuse = config.canister.fuse;
      }
    }

    // Hazard hits.
    for (let h = sec.hazards.length - 1; h >= 0; h--) {
      const hzd = sec.hazards[h];
      if (pr.hitIds.includes(hzd.id)) continue;
      if (dist(hzd.x, hzd.y, pr.x, pr.y) >= hzd.r + pr.r) continue;
      pr.hitIds.push(hzd.id);
      damageHazard(run, sec, h, pr.dmg);
      addBurst(run, pr.x, pr.y, CARDS[pr.card].color, 5);
      if (!pr.pierce) {
        sec.projectiles.splice(i, 1);
        break;
      }
    }
  }
}

/** Apply card damage to a hazard. */
function damageHazard(run: RunState, sec: SectorState, index: number, dmg: number): void {
  const hzd = sec.hazards[index];
  hzd.hp -= dmg;
  if (hzd.hp <= 0) destroyHazard(run, sec, index);
}

/** Remove a hazard: credit the kill, burst, and drop flux where it died. */
function destroyHazard(run: RunState, sec: SectorState, index: number): void {
  const hzd = sec.hazards[index];
  run.kills += 1;
  const color = hazardColor(hzd);
  addBurst(run, hzd.x, hzd.y, color, 14);
  const drops = config.caster.killDrop + (hzd.kind === "sweeper" || hzd.kind === "pulsar" ? 1 : 0);
  for (let d = 0; d < drops; d++) {
    sec.motes.push({ x: hzd.x + (d - drops / 2) * 10, y: hzd.y + ((d * 7) % 13) - 6 });
  }
  sec.hazards.splice(index, 1);
}

function hazardColor(hzd: Hazard): string {
  switch (hzd.kind) {
    case "drifter": return config.colors.drifter;
    case "seeker": return config.colors.seeker;
    case "sweeper": return config.colors.sweeper;
    case "pulsar": return config.colors.pulsar;
  }
}

// --- hazards ---------------------------------------------------------------

function updateHazards(run: RunState, sec: SectorState, dt: number): void {
  const hz = config.hazards;
  const p = run.player;

  for (const hzd of sec.hazards) {
    switch (hzd.kind) {
      case "drifter": {
        hzd.x += hzd.vx * dt;
        hzd.y += hzd.vy * dt;
        bounceOffTerrain(sec, hzd);
        break;
      }
      case "seeker": {
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
        const hit = resolveCircleSubstrate(sec.substrate, hzd.x, hzd.y, hzd.r);
        if (hit) {
          hzd.x = hit.x;
          hzd.y = hit.y;
          const vn = hzd.vx * hit.nx + hzd.vy * hit.ny;
          if (vn < 0) {
            hzd.vx -= hit.nx * vn;
            hzd.vy -= hit.ny * vn;
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

  const rc = config.hazards.pulsar;
  for (let i = sec.rings.length - 1; i >= 0; i--) {
    const ring = sec.rings[i];
    ring.age += dt;
    if (ring.age >= rc.ringDuration) sec.rings.splice(i, 1);
  }
}

/** Drifter-style terrain response: reflect off wall cells and arena bounds. */
function bounceOffTerrain(
  sec: SectorState,
  hzd: { x: number; y: number; vx: number; vy: number; r: number },
): void {
  const hit = resolveCircleSubstrate(sec.substrate, hzd.x, hzd.y, hzd.r);
  if (hit) {
    hzd.x = hit.x;
    hzd.y = hit.y;
    if (hit.nx > 0) hzd.vx = Math.abs(hzd.vx);
    else if (hit.nx < 0) hzd.vx = -Math.abs(hzd.vx);
    if (hit.ny > 0) hzd.vy = Math.abs(hzd.vy);
    else if (hit.ny < 0) hzd.vy = -Math.abs(hzd.vy);
  }
  if (hzd.x < hzd.r) { hzd.x = hzd.r; hzd.vx = Math.abs(hzd.vx); }
  if (hzd.x > sec.w - hzd.r) { hzd.x = sec.w - hzd.r; hzd.vx = -Math.abs(hzd.vx); }
  if (hzd.y < hzd.r) { hzd.y = hzd.r; hzd.vy = Math.abs(hzd.vy); }
  if (hzd.y > sec.h - hzd.r) { hzd.y = sec.h - hzd.r; hzd.vy = -Math.abs(hzd.vy); }
}

// --- canisters -------------------------------------------------------------

function updateCanisters(state: GameState, run: RunState, sec: SectorState, dt: number): void {
  const p = run.player;
  const cfg = config.canister;
  for (let i = sec.canisters.length - 1; i >= 0; i--) {
    const can = sec.canisters[i];
    if (can.fuse < 0) {
      // Armed: a dashing (invulnerable) player triggers it deliberately;
      // projectiles trigger it in updateProjectiles.
      const dashTouch = p.dashTimer > 0 && dist(p.x, p.y, can.x, can.y) < can.r + config.player.radius;
      if (dashTouch) can.fuse = cfg.fuse;
      continue;
    }
    can.fuse -= dt;
    if (can.fuse > 0) continue;

    sec.canisters.splice(i, 1);
    detonate(sec.substrate, can.x, can.y, cfg.carveRadius);
    run.shake = 1.6;
    addBurst(run, can.x, can.y, config.colors.canister, 26);
    addBurst(run, can.x, can.y, config.colors.blast, 18);

    // Chain other canisters with a short stagger.
    for (const other of sec.canisters) {
      if (other.fuse < 0 && dist(other.x, other.y, can.x, can.y) < cfg.damageRadius + 20) {
        other.fuse = cfg.chainFuse;
      }
    }
    // Damage everything in the blast.
    for (let h = sec.hazards.length - 1; h >= 0; h--) {
      const hzd = sec.hazards[h];
      if (dist(hzd.x, hzd.y, can.x, can.y) < cfg.damageRadius + hzd.r) {
        destroyHazard(run, sec, h);
      }
    }
    const pd = dist(p.x, p.y, can.x, can.y);
    if (pd < cfg.damageRadius + config.player.radius && !run.stats.demolition) {
      if (p.iframes <= 0 && p.dashTimer <= 0) {
        damagePlayer(state, run, (p.x - can.x) / (pd || 1), (p.y - can.y) / (pd || 1));
        if (state.phase !== "playing") return;
      }
    }
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
    if (side === 0) { x = range(rng, 40, sec.w - 40); y = 26; }
    else if (side === 1) { x = range(rng, 40, sec.w - 40); y = sec.h - 26; }
    else if (side === 2) { x = 26; y = range(rng, 40, sec.h - 40); }
    else { x = sec.w - 26; y = range(rng, 40, sec.h - 40); }
    if (dist(x, y, run.player.x, run.player.y) < 220) continue; // never spawn onto the player

    const tx = sec.w * range(rng, 0.3, 0.7);
    const ty = sec.h * range(rng, 0.3, 0.7);
    const d = dist(x, y, tx, ty) || 1;
    const speed = range(rng, hz.speedMin, hz.speedMax);
    sec.hazards.push({
      kind: "drifter",
      id: sec.nextId++,
      hp: hz.hp,
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
    state.outcome = { won: false, banked, sectorReached: run.sectorIndex + 1, time: run.time, kills: run.kills };
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

  for (let i = sec.cardNodes.length - 1; i >= 0; i--) {
    const node = sec.cardNodes[i];
    if (dist(node.x, node.y, p.x, p.y) < s.pickupRadius + 4) {
      sec.cardNodes.splice(i, 1);
      run.inventory.push(node.card);
      addBurst(run, node.x, node.y, CARDS[node.card].color, 16);
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
