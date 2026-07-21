// Fixed-timestep loop driver — no game logic lives here.
//
// Why fixed timestep: simulation updates run in constant-size steps
// (config.timeStep) so behavior is stable and reproducible regardless of the
// player's monitor refresh rate. Rendering happens once per animation frame.
// See: https://gafferongames.com/post/fix_your_timestep/

import { config } from "./config";
import type { Input } from "./input";
import { render } from "./render";
import type { GameState } from "./state";
import { update } from "./update";

export interface LoopHandle {
  stop: () => void;
}

export function startLoop(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  input: Input,
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
    let stepped = false;
    while (accumulator >= config.timeStep) {
      update(state, input, config.timeStep);
      accumulator -= config.timeStep;
      stepped = true;
    }
    // Drop unconsumed key presses only after a frame that actually stepped,
    // so a press between two update steps is never lost.
    if (stepped) input.endFrame();

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
