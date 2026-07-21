// Drawing only. Must stay read-only with respect to state — all animation
// derives from values the simulation already stores (times, phases, ages).

import { config } from "./config";
import { META_TRACKS, nextCost } from "./meta";
import { MODS, type ModId } from "./mods";
import type { GameState, RunState } from "./state";

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
      if (run) drawHud(ctx, run);
      break;
    case "paused":
      if (run) drawHud(ctx, run);
      drawPaused(ctx);
      break;
    case "draft":
      if (run && state.draftOptions) {
        drawHud(ctx, run);
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
  ctx.translate(
    Math.round(config.width / 2 - run.camX + shakeX),
    Math.round(config.height / 2 - run.camY + shakeY),
  );

  // Arena floor + grid.
  ctx.fillStyle = C.arena;
  ctx.fillRect(0, 0, sec.w, sec.h);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 80; gx < sec.w; gx += 80) {
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, sec.h);
  }
  for (let gy = 80; gy < sec.h; gy += 80) {
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(sec.w, gy + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = C.wallEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, sec.w - 2, sec.h - 2);

  // Walls.
  for (const wl of sec.walls) {
    ctx.fillStyle = C.wall;
    ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    ctx.strokeStyle = C.wallEdge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wl.x, wl.y, wl.w, wl.h);
  }

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

  // Pulsar rings.
  const rc = config.hazards.pulsar;
  for (const ring of sec.rings) {
    const ringR = rc.ringMaxR * (ring.age / rc.ringDuration);
    ctx.globalAlpha = 1 - ring.age / rc.ringDuration;
    strokeCircle(ctx, ring.x, ring.y, ringR, C.pulsar, 3);
    ctx.globalAlpha = 1;
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
        // Charge arc telegraphs the next pulse.
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

  // Player (blinks while hit i-frames are active).
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
  ctx.globalAlpha = 1;

  ctx.restore();
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

  text(ctx, `SECTOR ${run.sectorIndex + 1} / ${config.sectors.length}`, config.width / 2, 24, 14, C.hudText, "center", true);
  text(ctx, `flux ${run.flux}`, config.width - 16, 24, 14, C.mote, "right", true);

  const collected = sec.shardTotal - sec.shards.length;
  if (sec.shards.length > 0) {
    text(ctx, `shards ${collected} / ${sec.shardTotal}`, 16, config.height - 22, 14, C.shard, "left", true);
  } else {
    text(ctx, "EXIT OPEN — reach the gate", 16, config.height - 22, 14, C.gateOpen, "left", true);
  }

  text(
    ctx,
    `t=${sec.elapsed.toFixed(1)}s  agents=${sec.hazards.length}  seed=${run.seed.toString(16).padStart(8, "0")}`,
    config.width - 16,
    config.height - 22,
    11,
    C.hudDim,
    "right",
    true,
    400,
  );
}

// --- screens ---------------------------------------------------------------

function drawTitle(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = config.width / 2;
  const meta = state.meta;

  // Faint backdrop grid.
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

  text(ctx, "S I M U L", cx, 100, 52, C.player, "center", true, 800);
  text(ctx, "a movement roguelite — five sectors, don't get touched", cx, 145, 14, C.hudDim, "center");

  const pulse = 0.6 + 0.4 * Math.sin(state.uiTime * 4);
  ctx.globalAlpha = pulse;
  text(ctx, "ENTER — begin run", cx, 196, 17, C.hudText, "center", true);
  ctx.globalAlpha = 1;

  // Upgrade shop.
  const panelW = 560;
  const panelX = cx - panelW / 2;
  const panelY = 232;
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

  text(ctx, "move WASD/arrows · dash SPACE or SHIFT (invulnerable) · pause ESC", cx, 496, 13, C.hudDim, "center");
  text(ctx, "collect shards to open the exit · flux banks into cores when a run ends", cx, 518, 13, C.hudDim, "center");
  text(
    ctx,
    `runs ${meta.runs} · wins ${meta.wins} · best sector ${meta.bestSector}/5 · lifetime flux ${meta.totalFlux}`,
    cx,
    560,
    12,
    C.hudDim,
    "center",
    true,
    400,
  );
}

function drawDraft(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  run: RunState,
  options: ModId[],
): void {
  dim(ctx, 0.62);
  const cx = config.width / 2;
  text(ctx, `SECTOR ${run.sectorIndex + 1} CLEARED`, cx, 140, 26, C.gateOpen, "center", true, 800);
  text(ctx, "choose one modification", cx, 176, 13, C.hudDim, "center");

  const cardW = 260;
  const cardH = 130;
  const gap = 24;
  const total = options.length * cardW + (options.length - 1) * gap;
  options.forEach((id, i) => {
    const x = cx - total / 2 + i * (cardW + gap);
    const y = 220;
    const mod = MODS[id];
    const selected = state.menuIndex === i;
    ctx.fillStyle = C.panel;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x, y, cardW, cardH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = selected ? C.player : C.wallEdge;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);
    text(ctx, `[${i + 1}]`, x + 14, y + 22, 12, C.hudDim, "left", true);
    text(ctx, mod.name, x + cardW / 2, y + 58, 18, selected ? C.player : C.hudText, "center", false, 700);
    text(ctx, mod.desc, x + cardW / 2, y + 88, 12.5, C.hudDim, "center");
  });

  text(ctx, "←/→ select · ENTER confirm · or press 1-3", cx, 420, 13, C.hudDim, "center");
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
    text(ctx, "SIMULATION CLEARED", cx, 200, 34, C.gateOpen, "center", true, 800);
  } else {
    text(ctx, "SIGNAL LOST", cx, 200, 34, C.drifter, "center", true, 800);
  }
  if (o) {
    text(
      ctx,
      won ? `all 5 sectors · ${fmtTime(o.time)}` : `reached sector ${o.sectorReached} of 5 · ${fmtTime(o.time)}`,
      cx,
      252,
      15,
      C.hudText,
      "center",
      true,
    );
    text(ctx, `+${o.banked} flux banked · ${state.meta.cores} cores total`, cx, 282, 15, C.mote, "center", true);
  }
  text(ctx, "ENTER — run again · ESC — title", cx, 350, 14, C.hudDim, "center");
}
