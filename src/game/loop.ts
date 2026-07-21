import { config } from "./config";
import type { GameState } from "./state";

// A fixed-timestep game loop with a variable render rate.
//
// Why fixed timestep: gameplay/simulation updates run in constant-size steps
// (config.timeStep) so behavior is stable and reproducible regardless of the
// player's monitor refresh rate. Rendering still happens once per animation
// frame. See: https://gafferongames.com/post/fix_your_timestep/

export interface LoopHandle {
  stop: () => void;
}

/**
 * Advance the simulation by exactly one fixed step. This is where game logic
 * goes. Currently it just bounces the demo ball off the canvas edges.
 */
export function update(state: GameState, dt: number): void {
  state.elapsed += dt;

  const b = state.ball;
  const r = config.demo.radius;

  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x - r < 0) {
    b.x = r;
    b.vx = Math.abs(b.vx);
  } else if (b.x + r > config.width) {
    b.x = config.width - r;
    b.vx = -Math.abs(b.vx);
  }

  if (b.y - r < 0) {
    b.y = r;
    b.vy = Math.abs(b.vy);
  } else if (b.y + r > config.height) {
    b.y = config.height - r;
    b.vy = -Math.abs(b.vy);
  }
}

/**
 * Draw the current state. Rendering should be read-only with respect to state.
 */
export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = config.clearColor;
  ctx.fillRect(0, 0, config.width, config.height);

  const b = state.ball;
  ctx.beginPath();
  ctx.arc(b.x, b.y, config.demo.radius, 0, Math.PI * 2);
  ctx.fillStyle = config.demo.color;
  ctx.fill();
}

/**
 * Start the loop. Returns a handle so callers can stop it (e.g. on hot reload).
 */
export function startLoop(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): LoopHandle {
  let running = true;
  let rafId = 0;
  let previous = performance.now();
  let accumulator = 0;

  const frame = (now: number): void => {
    if (!running) return;

    // Convert ms to seconds; clamp to avoid a "spiral of death" after the tab
    // was backgrounded and a huge delta arrives.
    let frameTime = (now - previous) / 1000;
    if (frameTime > 0.25) frameTime = 0.25;
    previous = now;

    accumulator += frameTime;
    while (accumulator >= config.timeStep) {
      update(state, config.timeStep);
      accumulator -= config.timeStep;
    }

    render(ctx, state);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
