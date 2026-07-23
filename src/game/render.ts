// Drawing only. Must stay read-only with respect to state — all animation
// derives from values the simulation already stores (times, phases, ages).

import { CARDS, FRAMES, type CardId, type Caster } from "./cards";
import { config } from "./config";
import { ANOMALIES, CONTRACTS } from "./flavor";
import { META_TRACKS, nextCost } from "./meta";
import { MODS, type ModId } from "./mods";
import { sectorDef } from "./sector";
import type { GameState, RunState } from "./state";
import { cellHash, MAT, type Substrate } from "./substrate";
import {
  CARD_TILE,
  CONTINUE_RECT,
  CONTRACT_RECT,
  deckSlotRect,
  draftCardRect,
  inventoryRect,
  INV_Y,
  type UiRect,
} from "./ui";

const C = config.colors;

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, config.width, config.height);

  const run = state.run;
  if (run && state.phase !== "title") drawWorld(ctx, run);

  switch (state.phase) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "playing":
      if (run) {
        drawHud(ctx, run);
        drawEdgeArrows(ctx, run);
      }
      break;
    case "paused":
      if (run) drawHud(ctx, run);
      drawPaused(ctx);
      break;
    case "draft":
      if (run && state.draftOptions) {
        drawDraft(ctx, state, run, state.draftOptions);
      }
      break;
    case "gameover":
      drawEnd(ctx, state, false);
      break;
    case "victory":
      drawEnd(ctx, state, true);
      break;
  }
}

// --- helpers ---------------------------------------------------------------

function setFont(ctx: CanvasRenderingContext2D, size: number, mono = false, weight = 600): void {
  ctx.font = mono
    ? `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
    : `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
  mono = false,
  weight = 600,
): void {
  setFont(ctx, size, mono, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
}

function dim(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.fillStyle = `rgba(10, 12, 16, ${alpha})`;
  ctx.fillRect(0, 0, config.width, config.height);
}

function fillCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width: number,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- world -----------------------------------------------------------------

function drawWorld(ctx: CanvasRenderingContext2D, run: RunState): void {
  const sec = run.sector;
  ctx.save();
  const shakeX = run.shake * 5 * Math.sin(run.time * 61.7);
  const shakeY = run.shake * 5 * Math.cos(run.time * 53.3);
  const originX = Math.round(config.width / 2 - run.camX + shakeX);
  const originY = Math.round(config.height / 2 - run.camY + shakeY);
  ctx.translate(originX, originY);

  // Arena floor.
  ctx.fillStyle = C.arena;
  ctx.fillRect(0, 0, sec.w, sec.h);

  // Substrate layer — only the camera-visible cell range.
  drawSubstrate(ctx, sec.substrate, run);

  // Grid on top of floor materials, very faint.
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  const viewX0 = run.camX - config.width / 2;
  const viewY0 = run.camY - config.height / 2;
  for (let gx = Math.max(80, Math.floor(viewX0 / 80) * 80); gx < Math.min(sec.w, viewX0 + config.width + 80); gx += 80) {
    ctx.moveTo(gx + 0.5, Math.max(0, viewY0));
    ctx.lineTo(gx + 0.5, Math.min(sec.h, viewY0 + config.height));
  }
  for (let gy = Math.max(80, Math.floor(viewY0 / 80) * 80); gy < Math.min(sec.h, viewY0 + config.height + 80); gy += 80) {
    ctx.moveTo(Math.max(0, viewX0), gy + 0.5);
    ctx.lineTo(Math.min(sec.w, viewX0 + config.width), gy + 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Sweeper patrol tracks (faint), under everything that moves.
  for (const hzd of sec.hazards) {
    if (hzd.kind === "sweeper") {
      ctx.strokeStyle = C.wallEdge;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(hzd.ax, hzd.ay);
      ctx.lineTo(hzd.bx, hzd.by);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Flux motes.
  for (const m of sec.motes) {
    ctx.globalAlpha = 0.25;
    fillCircle(ctx, m.x, m.y, 5, C.mote);
    ctx.globalAlpha = 1;
    fillCircle(ctx, m.x, m.y, 1.8, C.mote);
  }

  // Card pickups: floating card tiles.
  for (const node of sec.cardNodes) {
    const def = CARDS[node.card];
    const bob = Math.sin(run.time * 2.2 + node.x * 0.01) * 3;
    ctx.globalAlpha = 0.18;
    fillCircle(ctx, node.x, node.y + bob, 18, def.color);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.panel;
    ctx.fillRect(node.x - 11, node.y + bob - 14, 22, 28);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(node.x - 11, node.y + bob - 14, 22, 28);
    text(ctx, def.glyph, node.x, node.y + bob, 11, def.color, "center", true, 700);
  }

  // Caster-frame pickups: hexagonal chips.
  for (const node of sec.frameNodes) {
    const def = FRAMES[node.frame];
    const bob = Math.sin(run.time * 1.8 + node.y * 0.01) * 3;
    ctx.globalAlpha = 0.2;
    fillCircle(ctx, node.x, node.y + bob, 22, def.color);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 - Math.PI / 2;
      const px = node.x + Math.cos(a) * 14;
      const py = node.y + bob + Math.sin(a) * 14;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, def.name[0], node.x, node.y + bob, 12, def.color, "center", true, 800);
  }

  // Data shards: rotating diamonds.
  sec.shards.forEach((sh, i) => {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(run.time * 1.5 + i * 1.3);
    ctx.globalAlpha = 0.15;
    fillCircle(ctx, 0, 0, 15, C.shard);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.shard;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  // Exit gate.
  const g = sec.gate;
  if (g.open) {
    const rr = g.r + Math.sin(run.time * 5) * 3;
    ctx.globalAlpha = 0.18;
    fillCircle(ctx, g.x, g.y, rr, C.gateOpen);
    ctx.globalAlpha = 1;
    strokeCircle(ctx, g.x, g.y, rr, C.gateOpen, 3);
    fillCircle(ctx, g.x, g.y, 5, C.gateOpen);
  } else {
    ctx.setLineDash([6, 6]);
    strokeCircle(ctx, g.x, g.y, g.r, C.gateLocked, 2);
    ctx.setLineDash([]);
    ctx.fillStyle = C.gateLocked;
    ctx.fillRect(g.x - 4, g.y - 4, 8, 8);
  }

  // Canisters (blink fast while the fuse burns).
  for (const can of sec.canisters) {
    const fused = can.fuse >= 0;
    const blink = fused && Math.floor(run.time * 16) % 2 === 0;
    ctx.fillStyle = blink ? C.blast : C.canister;
    ctx.fillRect(can.x - can.r * 0.7, can.y - can.r, can.r * 1.4, can.r * 2);
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(can.x - can.r * 0.7, can.y - can.r, can.r * 1.4, can.r * 2);
    ctx.fillStyle = C.bg;
    ctx.fillRect(can.x - can.r * 0.7, can.y - 2, can.r * 1.4, 4);
  }

  // Pulsar rings.
  const rc = config.hazards.pulsar;
  for (const ring of sec.rings) {
    const ringR = rc.ringMaxR * (ring.age / rc.ringDuration);
    ctx.globalAlpha = 1 - ring.age / rc.ringDuration;
    strokeCircle(ctx, ring.x, ring.y, ringR, C.pulsar, 3);
    ctx.globalAlpha = 1;
  }

  // Projectiles. Cargo-carrying trigger shots get a telltale ring.
  for (const pr of sec.projectiles) {
    const def = CARDS[pr.card];
    ctx.globalAlpha = 0.25;
    fillCircle(ctx, pr.x, pr.y, pr.r + 4, def.color);
    ctx.globalAlpha = 1;
    fillCircle(ctx, pr.x, pr.y, pr.r, def.color);
    if (pr.cargoCard !== null) {
      strokeCircle(ctx, pr.x, pr.y, pr.r + 6, CARDS[pr.cargoCard].color, 1.5);
    }
  }

  // Hazards.
  for (const hzd of sec.hazards) {
    switch (hzd.kind) {
      case "drifter":
        fillCircle(ctx, hzd.x, hzd.y, hzd.r, C.drifter);
        fillCircle(ctx, hzd.x, hzd.y, hzd.r * 0.45, C.arena);
        break;
      case "seeker": {
        const angle = Math.atan2(hzd.vy, hzd.vx);
        ctx.save();
        ctx.translate(hzd.x, hzd.y);
        ctx.rotate(angle);
        ctx.fillStyle = C.seeker;
        ctx.beginPath();
        ctx.moveTo(hzd.r + 5, 0);
        ctx.lineTo(-hzd.r, hzd.r * 0.9);
        ctx.lineTo(-hzd.r, -hzd.r * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case "sweeper":
        fillCircle(ctx, hzd.x, hzd.y, hzd.r, C.sweeper);
        strokeCircle(ctx, hzd.x, hzd.y, hzd.r * 0.55, C.arena, 2);
        break;
      case "pulsar": {
        fillCircle(ctx, hzd.x, hzd.y, hzd.r, C.pulsar);
        const frac = 1 - hzd.timer / rc.cycle;
        ctx.beginPath();
        ctx.arc(hzd.x, hzd.y, hzd.r + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = C.pulsar;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
    }
  }

  // Particles.
  for (const pt of run.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
    fillCircle(ctx, pt.x, pt.y, pt.size, pt.color);
  }
  ctx.globalAlpha = 1;

  // The Remora orbitals — little diamond friends.
  for (const orb of run.orbitals) {
    const ox = run.player.x + Math.cos(orb.angle) * config.orbital.radius;
    const oy = run.player.y + Math.sin(orb.angle) * config.orbital.radius;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(orb.angle);
    ctx.globalAlpha = 0.25;
    fillCircle(ctx, 0, 0, 9, CARDS.remora.color);
    ctx.globalAlpha = 1;
    ctx.fillStyle = CARDS.remora.color;
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(4.5, 0);
    ctx.lineTo(0, 5.5);
    ctx.lineTo(-4.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Player (blinks while hit i-frames are active), with an expressive eye
  // that tracks the aim, blinks now and then, and goes wide on a graze.
  const p = run.player;
  const invulnBlink = p.iframes > 0 && p.dashTimer <= 0 && Math.floor(run.time * 18) % 2 === 0;
  const alpha = invulnBlink ? 0.35 : 1;
  const prad = config.player.radius;
  ctx.globalAlpha = alpha * 0.2;
  fillCircle(ctx, p.x, p.y, prad + 9, C.player);
  ctx.globalAlpha = alpha;
  fillCircle(ctx, p.x, p.y, prad, C.player);
  {
    const aimA = Math.atan2(run.aimY - p.y, run.aimX - p.x);
    const ex = p.x + Math.cos(aimA) * 3;
    const ey = p.y + Math.sin(aimA) * 3;
    const wide = run.grazeFlash > 0;
    const blinkNow = !wide && Math.sin(run.time * 1.7 + run.seed % 7) > 0.985;
    const eyeR = wide ? prad * 0.62 : prad * 0.45;
    if (blinkNow) {
      ctx.strokeStyle = C.playerCore;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex - eyeR, ey);
      ctx.lineTo(ex + eyeR, ey);
      ctx.stroke();
    } else {
      fillCircle(ctx, ex, ey, eyeR, C.playerCore);
      fillCircle(ctx, ex + Math.cos(aimA) * 1.5, ey + Math.sin(aimA) * 1.5, eyeR * 0.45, C.bg);
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

/** Draw the visible window of the material grid. */
function drawSubstrate(ctx: CanvasRenderingContext2D, sub: Substrate, run: RunState): void {
  const c = sub.cell;
  const x0 = Math.max(0, Math.floor((run.camX - config.width / 2) / c));
  const y0 = Math.max(0, Math.floor((run.camY - config.height / 2) / c));
  const x1 = Math.min(sub.cols - 1, Math.ceil((run.camX + config.width / 2) / c));
  const y1 = Math.min(sub.rows - 1, Math.ceil((run.camY + config.height / 2) / c));

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const i = cy * sub.cols + cx;
      const m = sub.mat[i];
      if (m === MAT.empty) continue;
      const px = cx * c;
      const py = cy * c;
      if (m === MAT.wall) {
        // Deterministic per-cell shade so terrain reads textured.
        const shade = cellHash(i, 3);
        ctx.fillStyle = shade < 0.5 ? C.wall : C.wallEdge;
        ctx.fillRect(px, py, c, c);
        ctx.fillStyle = C.wall;
        ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
      } else if (m === MAT.rubble) {
        ctx.fillStyle = C.rubble;
        ctx.fillRect(px, py, c, c);
      }
    }
  }
}

// --- HUD -------------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, run: RunState): void {
  const sec = run.sector;
  const p = run.player;
  const s = run.stats;

  // Integrity pips.
  for (let i = 0; i < run.maxIntegrity; i++) {
    const x = 16 + i * 20;
    if (i < run.integrity) {
      ctx.fillStyle = C.player;
      ctx.fillRect(x, 16, 14, 14);
    } else {
      ctx.strokeStyle = C.hudDim;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, 16.5, 13, 13);
    }
  }

  // Dash charge bars (the recharging one fills up).
  for (let i = 0; i < s.dashCharges; i++) {
    const x = 16 + i * 26;
    ctx.strokeStyle = C.hudDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, 40.5, 22, 6);
    let frac = 0;
    if (i < p.charges) frac = 1;
    else if (i === p.charges) frac = 1 - p.recharge / s.dashRecharge;
    if (frac > 0) {
      ctx.fillStyle = C.playerCore;
      ctx.fillRect(x + 1, 41, Math.max(0, Math.min(1, frac)) * 21, 5);
    }
  }

  const def = sectorDef(run.sectorIndex);
  text(ctx, `SECTOR ${run.sectorIndex + 1} / ${config.sectors.length}`, config.width / 2, 20, 14, C.hudText, "center", true);
  text(ctx, def.name, config.width / 2, 38, 10, C.hudDim, "center", true, 400);
  if (sec.anomaly !== null) {
    text(ctx, `⚠ ${ANOMALIES[sec.anomaly].name}`, config.width / 2, 54, 10, C.canister, "center", true, 700);
  }
  text(ctx, `flux ${run.flux}`, config.width - 16, 24, 14, C.mote, "right", true);
  if (run.contract !== null) {
    text(ctx, `contract: ${CONTRACTS[run.contract].name}`, config.width - 16, 42, 10, C.shard, "right", true, 700);
  }

  // Graze streak, next to the dash bars.
  if (run.grazeStreak > 1) {
    text(ctx, `graze ×${run.grazeStreak}`, 16 + run.stats.dashCharges * 26 + 8, 44, 11, C.playerCore, "left", true, 700);
  }

  // The simulation speaks — typewriter toasts, newest last.
  run.toasts.forEach((toast, i) => {
    const chars = Math.min(toast.text.length, Math.floor(toast.age * 45));
    const fade = Math.min(1, (config.announcer.toastLife - toast.age) / 0.8);
    ctx.globalAlpha = Math.max(0, fade) * 0.9;
    text(ctx, `» ${toast.text.slice(0, chars)}`, 16, 70 + i * 16, 11, C.hudText, "left", true, 400);
    ctx.globalAlpha = 1;
  });

  const collected = sec.shardTotal - sec.shards.length;
  if (sec.shards.length > 0) {
    text(ctx, `shards ${collected} / ${sec.shardTotal}`, 16, config.height - 22, 14, C.shard, "left", true);
  } else {
    text(ctx, "EXIT OPEN — reach the gate", 16, config.height - 22, 14, C.gateOpen, "left", true);
  }

  drawCasterStrip(ctx, run);

  text(
    ctx,
    `t=${sec.elapsed.toFixed(1)}s  agents=${sec.hazards.length}  kills=${run.kills}  seed=${run.seed.toString(16).padStart(8, "0")}`,
    config.width - 16,
    config.height - 22,
    11,
    C.hudDim,
    "right",
    true,
    400,
  );
}

/** The deck readout: active caster's tiles, pointer, cast bar — plus a small
 * holstered-caster strip with the Q hint when a second frame is carried. */
function drawCasterStrip(ctx: CanvasRenderingContext2D, run: RunState): void {
  const caster = run.casters[run.activeCaster];
  const frame = FRAMES[caster.frame];
  const tile = 26;
  const gap = 6;
  const n = caster.slots.length;
  const total = n * tile + (n - 1) * gap;
  const x0 = config.width / 2 - total / 2;
  const y = config.height - 44;

  text(ctx, frame.name.toUpperCase(), x0 - 10, y + tile / 2, 9, frame.color, "right", true, 700);

  caster.slots.forEach((card, i) => {
    const x = x0 + i * (tile + gap);
    ctx.fillStyle = C.panel;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, tile, tile);
    ctx.globalAlpha = 1;
    // Highlight where the NEXT walk starts (order-aware for shufflers).
    const isNext = i === caster.order[caster.pointer];
    ctx.strokeStyle = isNext ? C.player : C.wallEdge;
    ctx.lineWidth = isNext ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    if (card !== null) {
      const def = CARDS[card];
      text(ctx, def.glyph, x + tile / 2, y + tile / 2 + 0.5, 10, def.color, "center", true, 700);
    }
  });

  // Cast/recharge progress under the strip.
  const denom = caster.recharging ? frame.rechargeTime : Math.max(0.001, frame.castDelay);
  const frac = 1 - Math.min(1, caster.castTimer / Math.max(0.001, denom));
  ctx.strokeStyle = C.hudDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y + tile + 4.5, total, 4);
  ctx.fillStyle = caster.recharging ? C.canister : C.playerCore;
  ctx.fillRect(x0 + 1, y + tile + 5, Math.max(0, frac) * (total - 1), 3);

  // Holstered caster: mini strip above, with the swap hint.
  if (run.casters.length > 1) {
    const other = run.casters[1 - run.activeCaster];
    const oframe = FRAMES[other.frame];
    const mini = 14;
    const mtotal = other.slots.length * (mini + 3) - 3;
    const mx0 = config.width / 2 - mtotal / 2;
    const my = y - 22;
    ctx.globalAlpha = 0.55;
    other.slots.forEach((card, i) => {
      const x = mx0 + i * (mini + 3);
      ctx.fillStyle = C.panel;
      ctx.fillRect(x, my, mini, mini);
      ctx.strokeStyle = oframe.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, my + 0.5, mini - 1, mini - 1);
      if (card !== null) {
        text(ctx, CARDS[card].glyph, x + mini / 2, my + mini / 2 + 0.5, 6.5, CARDS[card].color, "center", true, 700);
      }
    });
    text(ctx, "Q", mx0 - 10, my + mini / 2, 10, C.hudText, "right", true, 800);
    ctx.globalAlpha = 1;
  }
}

/** Off-screen objective hints: nearest shard (gold) and the open gate (green). */
function drawEdgeArrows(ctx: CanvasRenderingContext2D, run: RunState): void {
  const sec = run.sector;
  const targets: { x: number; y: number; color: string }[] = [];
  if (sec.shards.length > 0) {
    let best = sec.shards[0];
    let bestD = Infinity;
    for (const sh of sec.shards) {
      const d = Math.hypot(sh.x - run.player.x, sh.y - run.player.y);
      if (d < bestD) {
        bestD = d;
        best = sh;
      }
    }
    targets.push({ x: best.x, y: best.y, color: C.shard });
  } else {
    targets.push({ x: sec.gate.x, y: sec.gate.y, color: C.gateOpen });
  }

  for (const t of targets) {
    const sx = t.x - run.camX + config.width / 2;
    const sy = t.y - run.camY + config.height / 2;
    const marginPx = 26;
    if (sx > -20 && sx < config.width + 20 && sy > -20 && sy < config.height + 20) continue;
    const cx = Math.max(marginPx, Math.min(config.width - marginPx, sx));
    const cy = Math.max(marginPx, Math.min(config.height - marginPx, sy));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(sy - config.height / 2, sx - config.width / 2));
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-4, 6);
    ctx.lineTo(-4, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// --- screens ---------------------------------------------------------------

function drawTitle(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = config.width / 2;
  const meta = state.meta;

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 40; gx < config.width; gx += 80) {
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, config.height);
  }
  for (let gy = 40; gy < config.height; gy += 80) {
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(config.width, gy + 0.5);
  }
  ctx.stroke();

  text(ctx, "S I M U L", cx, 96, 52, C.player, "center", true, 800);
  text(ctx, "a sandbox roguelite — five simulated sectors, one fragile probe", cx, 140, 14, C.hudDim, "center");

  const pulse = 0.6 + 0.4 * Math.sin(state.uiTime * 4);
  ctx.globalAlpha = pulse;
  text(ctx, "ENTER — begin run", cx, 188, 17, C.hudText, "center", true);
  ctx.globalAlpha = 1;

  const panelW = 560;
  const panelX = cx - panelW / 2;
  const panelY = 220;
  const panelH = 218;
  ctx.fillStyle = C.panel;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = C.wallEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

  text(ctx, "UPGRADES", panelX + 18, panelY + 24, 14, C.hudText, "left", true, 700);
  text(ctx, `cores ${meta.cores}`, panelX + panelW - 18, panelY + 24, 14, C.mote, "right", true);

  META_TRACKS.forEach((track, i) => {
    const y = panelY + 62 + i * 52;
    const tier = meta[track.key];
    const cost = nextCost(meta, track);
    const dots = "●".repeat(tier) + "○".repeat(track.costs.length - tier);
    text(ctx, `[${i + 1}] ${track.name}`, panelX + 18, y, 15, C.hudText);
    text(ctx, track.desc, panelX + 18, y + 19, 12, C.hudDim);
    text(ctx, dots, panelX + panelW - 108, y, 14, C.player, "right", true);
    if (cost === null) {
      text(ctx, "MAX", panelX + panelW - 18, y, 13, C.hudDim, "right", true);
    } else {
      text(ctx, `◆ ${cost}`, panelX + panelW - 18, y, 13, meta.cores >= cost ? C.mote : C.hudDim, "right", true);
    }
  });

  text(ctx, "WASD move · MOUSE aim & cast · SPACE/SHIFT dash (invulnerable) · ESC pause", cx, 482, 13, C.hudDim, "center");
  text(ctx, "find cards, build your caster · fire spreads on oil, coolant quenches, acid melts walls", cx, 504, 13, C.hudDim, "center");
  text(ctx, "collect shards to open the exit · flux banks into cores when a run ends", cx, 526, 13, C.hudDim, "center");
  text(
    ctx,
    `runs ${meta.runs} · wins ${meta.wins} · best sector ${meta.bestSector}/5 · lifetime flux ${meta.totalFlux}`,
    cx,
    564,
    12,
    C.hudDim,
    "center",
    true,
    400,
  );
}

function drawCardTile(
  ctx: CanvasRenderingContext2D,
  r: UiRect,
  card: CardId | null,
  selected: boolean,
  pointer: boolean,
): void {
  ctx.fillStyle = C.panel;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = selected ? C.shard : pointer ? C.player : C.wallEdge;
  ctx.lineWidth = selected || pointer ? 2 : 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (card !== null) {
    const def = CARDS[card];
    text(ctx, def.glyph, r.x + r.w / 2, r.y + r.h / 2 - 6, 13, def.color, "center", true, 700);
    text(ctx, def.name, r.x + r.w / 2, r.y + r.h - 10, 7.5, C.hudDim, "center", true, 400);
  }
}

function drawDraft(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  run: RunState,
  options: ModId[],
): void {
  dim(ctx, 0.72);
  const cx = config.width / 2;
  text(ctx, `SECTOR ${run.sectorIndex + 1} CLEARED`, cx, 54, 24, C.gateOpen, "center", true, 800);
  const nextDef = sectorDef(run.sectorIndex + 1);
  text(ctx, `next: ${nextDef.name}`, cx, 82, 12, C.hudDim, "center", true);

  text(ctx, "choose one modification", cx, 112, 12, C.hudDim, "center");
  options.forEach((id, i) => {
    const r = draftCardRect(i, options.length);
    const mod = MODS[id];
    const picked = state.chosenMod === i;
    const hovered = state.menuIndex === i;
    ctx.fillStyle = C.panel;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = picked ? C.gateOpen : hovered ? C.player : C.wallEdge;
    ctx.lineWidth = picked || hovered ? 2 : 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(ctx, `[${i + 1}]`, r.x + 12, r.y + 18, 11, C.hudDim, "left", true);
    if (picked) text(ctx, "✓", r.x + r.w - 14, r.y + 18, 13, C.gateOpen, "center", true, 800);
    text(ctx, mod.name, r.x + r.w / 2, r.y + 48, 16, picked ? C.gateOpen : C.hudText, "center", false, 700);
    text(ctx, mod.desc, r.x + r.w / 2, r.y + 76, 11.5, C.hudDim, "center");
  });

  // Optional contract wager.
  if (state.contractOffer !== null) {
    const cdef = CONTRACTS[state.contractOffer];
    const cr = CONTRACT_RECT;
    ctx.fillStyle = C.panel;
    ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
    ctx.strokeStyle = state.contractAccepted ? C.shard : C.wallEdge;
    ctx.lineWidth = state.contractAccepted ? 2 : 1;
    ctx.strokeRect(cr.x + 0.5, cr.y + 0.5, cr.w - 1, cr.h - 1);
    const mark = state.contractAccepted ? "☑" : "☐";
    text(
      ctx,
      `${mark} CONTRACT — ${cdef.name}: ${cdef.desc} (+${cdef.bonus} flux)`,
      cx,
      cr.y + cr.h / 2,
      11,
      state.contractAccepted ? C.shard : C.hudDim,
      "center",
      true,
      state.contractAccepted ? 700 : 400,
    );
  }

  // Deck editor — one row per carried caster.
  text(ctx, "CASTERS — click a card, then a destination (deck order = cast order)", cx, 278, 12, C.hudText, "center", true);
  run.casters.forEach((caster: Caster, row: number) => {
    const frame = FRAMES[caster.frame];
    const first = deckSlotRect(row, 0, caster.slots.length);
    const label = row === run.activeCaster ? `${frame.name} · ACTIVE` : `${frame.name} · Q`;
    text(ctx, label.toUpperCase(), first.x - 12, first.y + first.h / 2, 9, frame.color, "right", true, 700);
    caster.slots.forEach((card, i) => {
      const r = deckSlotRect(row, i, caster.slots.length);
      const sel = state.editSel;
      drawCardTile(ctx, r, card, sel !== null && sel.zone === "slot" && sel.caster === row && sel.index === i, false);
    });
  });

  text(ctx, `inventory (${run.inventory.length})`, cx, INV_Y - 12, 11, C.hudDim, "center", true);
  const invTiles = Math.max(run.inventory.length + 1, 1);
  for (let i = 0; i < invTiles; i++) {
    const r = inventoryRect(i);
    const card = i < run.inventory.length ? run.inventory[i] : null;
    const sel = state.editSel;
    drawCardTile(ctx, r, card, sel !== null && sel.zone === "inv" && sel.index === i, false);
  }
  if (state.editSel?.zone === "slot") {
    text(ctx, "click an empty inventory tile to unequip", cx, INV_Y + CARD_TILE + 22, 10.5, C.hudDim, "center", true, 400);
  }

  // Continue button.
  const cr = CONTINUE_RECT;
  const ready = state.chosenMod !== null;
  ctx.fillStyle = C.panel;
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
  ctx.strokeStyle = ready ? C.gateOpen : C.wallEdge;
  ctx.lineWidth = ready ? 2 : 1;
  ctx.strokeRect(cr.x + 0.5, cr.y + 0.5, cr.w - 1, cr.h - 1);
  text(
    ctx,
    ready ? "CONTINUE  (ENTER)" : "pick a modification first",
    cx,
    cr.y + cr.h / 2,
    ready ? 14 : 11,
    ready ? C.gateOpen : C.hudDim,
    "center",
    true,
    ready ? 700 : 400,
  );
}

function drawPaused(ctx: CanvasRenderingContext2D): void {
  dim(ctx, 0.55);
  const cx = config.width / 2;
  text(ctx, "PAUSED", cx, 250, 30, C.hudText, "center", true, 800);
  text(ctx, "ESC — resume · Q — abandon run (flux still banks)", cx, 300, 14, C.hudDim, "center");
}

function drawEnd(ctx: CanvasRenderingContext2D, state: GameState, won: boolean): void {
  dim(ctx, 0.66);
  const cx = config.width / 2;
  const o = state.outcome;
  if (won) {
    text(ctx, "SIMULATION CLEARED", cx, 190, 34, C.gateOpen, "center", true, 800);
  } else {
    text(ctx, "SIGNAL LOST", cx, 190, 34, C.drifter, "center", true, 800);
  }
  if (o) {
    text(
      ctx,
      won ? `all 5 sectors · ${fmtTime(o.time)}` : `reached sector ${o.sectorReached} of 5 · ${fmtTime(o.time)}`,
      cx,
      244,
      15,
      C.hudText,
      "center",
      true,
    );
    text(ctx, `${o.kills} agents destroyed`, cx, 272, 14, C.seeker, "center", true);
    text(ctx, `+${o.banked} flux banked · ${state.meta.cores} cores total`, cx, 300, 15, C.mote, "center", true);
  }
  text(ctx, "ENTER — run again · ESC — title", cx, 360, 14, C.hudDim, "center");
}
