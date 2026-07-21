// Keyboard input tracking. Held keys are polled by the simulation each step;
// presses are edge-triggered and consumed once via takePress(), so a frame
// that runs multiple fixed update sub-steps reacts to a key press exactly once.
// The loop calls endFrame() after a stepped frame to drop unconsumed presses.

const PREVENT_DEFAULT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export interface Vec2 {
  x: number;
  y: number;
}

export interface Input {
  held(code: string): boolean;
  /** Normalized movement vector from WASD / arrow keys. */
  axis(): Vec2;
  /** True once per physical key press; consuming clears it. */
  takePress(code: string): boolean;
  /** Clear leftover presses. Called by the loop after update steps ran. */
  endFrame(): void;
  dispose(): void;
}

export function createInput(target: Window = window): Input {
  const down = new Set<string>();
  const pressed = new Set<string>();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    down.delete(e.code);
  };
  const onBlur = (): void => {
    down.clear();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    held: (code) => down.has(code),
    axis: () => {
      let x = 0;
      let y = 0;
      if (down.has("KeyA") || down.has("ArrowLeft")) x -= 1;
      if (down.has("KeyD") || down.has("ArrowRight")) x += 1;
      if (down.has("KeyW") || down.has("ArrowUp")) y -= 1;
      if (down.has("KeyS") || down.has("ArrowDown")) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    takePress: (code) => pressed.delete(code),
    endFrame: () => pressed.clear(),
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      down.clear();
      pressed.clear();
    },
  };
}
