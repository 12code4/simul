// Central place for tunable constants.
// Keep gameplay "magic numbers" here so they're easy to find and adjust.

export const config = {
  // Logical canvas size (rendering resolution).
  width: 800,
  height: 600,

  // Fixed simulation timestep, in seconds (60 updates per second).
  // The loop advances the simulation in steps of this size so game logic
  // behaves identically regardless of display refresh rate.
  timeStep: 1 / 60,

  // Background clear color.
  clearColor: "#12151c",

  // Placeholder demo entity (proves the render pipeline works).
  demo: {
    color: "#5b9dff",
    radius: 24,
    speed: 180, // pixels per second
  },
} as const;
