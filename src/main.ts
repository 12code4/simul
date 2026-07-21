import "./style.css";
import { config } from "./game/config";
import { createInput } from "./game/input";
import { startLoop, type LoopHandle } from "./game/loop";
import { createInitialState } from "./game/state";

// Entry point: wire up the canvas + input and kick off the game loop.

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) {
  throw new Error("Canvas element #game not found in index.html");
}

canvas.width = config.width;
canvas.height = config.height;

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Could not get a 2D rendering context");
}

const input = createInput(window);
const state = createInitialState();
const handle: LoopHandle = startLoop(ctx, state, input);

// Vite hot-module replacement: tear down the old loop and listeners before a
// new module instance starts, so we don't stack multiple loops in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    handle.stop();
    input.dispose();
  });
}
