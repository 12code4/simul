import { config } from "./config";

// The full mutable game state lives in one object. Keeping state in a single
// serializable shape makes save/load, debugging, and (later) determinism easier.
export interface GameState {
  // Placeholder demo entity: a ball bouncing around the canvas.
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  // Wall-clock-independent elapsed simulation time, in seconds.
  elapsed: number;
}

export function createInitialState(): GameState {
  return {
    ball: {
      x: config.width / 2,
      y: config.height / 2,
      vx: config.demo.speed,
      vy: config.demo.speed * 0.6,
    },
    elapsed: 0,
  };
}
