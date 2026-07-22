// Keyboard + mouse input tracking. Held keys are polled by the simulation each
// step; presses are edge-triggered and consumed once via takePress(), so a
// frame that runs multiple fixed update sub-steps reacts to a press exactly
// once. The loop calls endFrame() after a stepped frame to drop unconsumed
// presses. Mouse coordinates are mapped from CSS pixels into canvas logical
// pixels so aiming stays correct however the canvas is scaled.

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
  /** Aim position in canvas logical pixels. */
  mouse(): Vec2;
  /** True while the primary mouse button is down. */
  mouseHeld(): boolean;
  /** True once per primary-button press; consuming clears it. */
  takeClick(): boolean;
  /** Clear leftover presses. Called by the loop after update steps ran. */
  endFrame(): void;
  dispose(): void;
}

export function createInput(canvas: HTMLCanvasElement, target: Window = window): Input {
  const down = new Set<string>();
  const pressed = new Set<string>();
  const mousePos: Vec2 = { x: canvas.width / 2, y: canvas.height / 2 };
  let mouseDown = false;
  let clicked = false;

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
    mouseDown = false;
  };
  const toCanvas = (e: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    mousePos.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    mousePos.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  };
  const onMouseMove = (e: MouseEvent): void => {
    toCanvas(e);
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    toCanvas(e);
    mouseDown = true;
    clicked = true;
  };
  const onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    mouseDown = false;
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  target.addEventListener("mousemove", onMouseMove);
  target.addEventListener("mousedown", onMouseDown);
  target.addEventListener("mouseup", onMouseUp);

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
    mouse: () => ({ x: mousePos.x, y: mousePos.y }),
    mouseHeld: () => mouseDown,
    takeClick: () => {
      const was = clicked;
      clicked = false;
      return was;
    },
    endFrame: () => {
      pressed.clear();
      clicked = false;
    },
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("mousemove", onMouseMove);
      target.removeEventListener("mousedown", onMouseDown);
      target.removeEventListener("mouseup", onMouseUp);
      down.clear();
      pressed.clear();
    },
  };
}
