// Drawing only. Must stay read-only with respect to state — all animation
// derives from values the simulation already stores (times, phases, ages).

import { CARDS, type CardId } from "./cards";
import { config } from "./config";
import { META_TRACKS, nextCost } from "./meta";
import { MODS, type ModId } from "./mods";
import { sectorDef } from "./sector";
import type { GameState, RunState } from "./state";
import { cellHash, MAT, SUB, type Substrate } from "./substrate";
import {
  CARD_TILE,
  CONTINUE_RECT,
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
    ctx.fillStyle = blink ? C.fireHot : C.canister;
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

  // Projectiles.
  for (const pr of sec.projectiles) {
    const def = CARDS[pr.card];
    ctx.globalAlpha = 0.25;
    fillCircle(ctx, pr.x, pr.y, pr.r + 4, def.color);
    ctx.globalAlpha = 1;
    fillCircle(ctx, pr.x, pr.y, pr.r, def.color);
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
      case "igniter": {
        const flick = 1 + 0.2 * Math.sin(run.time * 21 + hzd.id);
        ctx.globalAlpha = 0.3;
        fillCircle(ctx, hzd.x, hzd.y, hzd.r * 1.8 * flick, C.fire);
        ctx.globalAlpha = 1;
        fillCircle(ctx, hzd.x, hzd.y, hzd.r * flick, C.igniter);
        fillCircle(ctx, hzd.x, hzd.y, hzd.r * 0.4, C.fireHot);
        break;
      }
      case "corroder":
        fillCircle(ctx, hzd.x, hzd.y, hzd.r, C.corroder);
        fillCircle(ctx, hzd.x - 3, hzd.y - 2, 2.2, C.arena);
        fillCircle(ctx, hzd.x + 3, hzd.y - 2, 2.2, C.arena);
        break;
    }
    // Burning marker.
    if ((hzd.kind === "drifter" || hzd.kind === "seeker" || hzd.kind === "corroder") && hzd.burn > 0) {
      fillCircle(ctx, hzd.x, hzd.y - hzd.r - 4, 3 + Math.sin(run.time * 25) * 1.2, C.fireHot);
    }
  }

  // Particles.
  for (const pt of run.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
    fillCircle(ctx, pt.x, pt.y, pt.size, pt.color);
  }
  ctx.globalAlpha = 1;

  // Player (blinks while hit i-frames are active; status rings).
  const p = run.player;
  const invulnBlink = p.iframes > 0 && p.dashTimer <= 0 && Math.floor(run.time * 18) % 2 === 0;
  const alpha = invulnBlink ? 0.35 : 1;
  const prad = config.player.radius;
  ctx.globalAlpha = alpha * 0.2;
  fillCircle(ctx, p.x, p.y, prad + 9, C.player);
  ctx.globalAlpha = alpha;
  fillCircle(ctx, p.x, p.y, prad, C.player);
  fillCircle(ctx, p.x, p.y, prad * 0.45, C.playerCore);
  fillCircle(ctx, p.x + p.faceX * (prad + 4), p.y + p.faceY * (prad + 4), 2.5, C.playerCore);
  if (p.wet > 0) strokeCircle(ctx, p.x, p.y, prad + 4, C.coolantLit, 1.5);
  if (p.oiled > 0) strokeCircle(ctx, p.x, p.y, prad + 6.5, C.oilLit, 1.5);
  if (p.burning > 0) {
    fillCircle(ctx, p.x, p.y - prad - 6, 4 + Math.sin(run.time * 25) * 1.5, C.fireHot);
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
      switch (m) {
        case MAT.wall: {
          // Deterministic per-cell shade so terrain reads textured.
          const shade = cellHash(i, 3);
          ctx.fillStyle = shade < 0.5 ? C.wall : C.wallEdge;
          ctx.fillRect(px, py, c, c);
          ctx.fillStyle = C.wall;
          ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
          break;
        }
        case MAT.coolant:
          ctx.fillStyle = cellHash(i, 5) < 0.3 ? C.coolantLit : C.coolant;
          ctx.fillRect(px, py, c, c);
          break;
        case MAT.oil:
          ctx.fillStyle = cellHash(i, 5) < 0.3 ? C.oilLit : C.oil;
          ctx.fillRect(px, py, c, c);
          break;
        case MAT.acid: {
          ctx.fillStyle = cellHash(i, sub.tick >> 3) < 0.4 ? C.acidLit : C.acid;
          ctx.fillRect(px, py, c, c);
          break;
        }
        case MAT.fire: {
          const hot = cellHash(i, sub.tick) < 0.45;
          ctx.fillStyle = hot ? C.fireHot : C.fire;
          ctx.fillRect(px, py, c, c);
          break;
        }
        case MAT.steam:
          ctx.globalAlpha = 0.4 * Math.min(1, sub.fuel[i] / SUB.steamLife + 0.3);
          ctx.fillStyle = C.steam;
          ctx.fillRect(px - 2, py - 2, c + 4, c + 4);
          ctx.globalAlpha = 1;
          break;
        case MAT.scorch:
          ctx.fillStyle = C.scorch;
          ctx.fillRect(px, py, c, c);
          break;
        default:
          break;
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
  text(ctx, `flux ${run.flux}`, config.width - 16, 24, 14, C.mote, "right", true);

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

/** The deck readout: slot tiles, deck pointer, and the cast/recharge bar. */
function drawCasterStrip(ctx: CanvasRenderingContext2D, run: RunState): void {
  const caster = run.caster;
  const tile = 26;
  const gap = 6;
  const n = caster.slots.length;
  const total = n * tile + (n - 1) * gap;
  const x0 = config.width / 2 - total / 2;
  const y = config.height - 44;

  caster.slots.forEach((card, i) => {
    const x = x0 + i * (tile + gap);
    ctx.fillStyle = C.panel;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, tile, tile);
    ctx.globalAlpha = 1;
    const active = i === caster.pointer;
    ctx.strokeStyle = active ? C.player : C.wallEdge;
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    if (card !== null) {
      const def = CARDS[card];
      text(ctx, def.glyph, x + tile / 2, y + tile / 2 + 0.5, 10, def.color, "center", true, 700);
    }
  });

  // Cast/recharge progress under the strip.
  const barW = total;
  const denom = caster.recharging ? caster.rechargeTime : Math.max(0.001, caster.castDelay);
  const frac = 1 - Math.min(1, caster.castTimer / Math.max(0.001, denom));
  ctx.strokeStyle = C.hudDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y + tile + 4.5, barW, 4);
  ctx.fillStyle = caster.recharging ? C.canister : C.playerCore;
  ctx.fillRect(x0 + 1, y + tile + 5, Math.max(0, frac) * (barW - 1), 3);
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

  // Deck editor.
  text(ctx, "CASTER — click a card, then a destination (deck order = cast order)", cx, 300, 12, C.hudText, "center", true);
  run.caster.slots.forEach((card, i) => {
    const r = deckSlotRect(i, run.caster.slots.length);
    const sel = state.editSel;
    drawCardTile(ctx, r, card, sel !== null && sel.zone === "slot" && sel.index === i, false);
  });

  text(ctx, `inventory (${run.inventory.length})`, cx, INV_Y - 14, 11, C.hudDim, "center", true);
  const invTiles = Math.max(run.inventory.length + 1, 1);
  for (let i = 0; i < invTiles; i++) {
    const r = inventoryRect(i);
    const card = i < run.inventory.length ? run.inventory[i] : null;
    const sel = state.editSel;
    drawCardTile(ctx, r, card, sel !== null && sel.zone === "inv" && sel.index === i, false);
  }
  if (state.editSel?.zone === "slot") {
    text(ctx, "click an empty inventory tile to unequip", cx, INV_Y + CARD_TILE + 26, 10.5, C.hudDim, "center", true, 400);
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
