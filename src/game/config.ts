// Central place for tunable constants.
// Keep gameplay "magic numbers" here so they're easy to find and adjust.

export const config = {
  // Logical canvas size (rendering resolution).
  width: 960,
  height: 600,

  // Fixed simulation timestep, in seconds (60 updates per second).
  timeStep: 1 / 60,

  colors: {
    bg: "#0f1115",
    arena: "#12151c",
    grid: "#181d28",
    panel: "#161b26",
    wall: "#1b2130",
    wallEdge: "#2a3346",
    rubble: "#0c0e12",
    player: "#5bd1ff",
    playerCore: "#dff4ff",
    shard: "#ffd75b",
    mote: "#9dff5b",
    gateLocked: "#44506a",
    gateOpen: "#5bffb0",
    drifter: "#ff5b7f",
    seeker: "#ff8c5b",
    sweeper: "#c05bff",
    pulsar: "#ff5bd1",
    canister: "#ff9d3d",
    blast: "#ffd23d",
    hudText: "#e6e6e6",
    hudDim: "#8b93a7",
  },

  player: {
    radius: 10,
    accel: 2600,
    drag: 5.2, // exponential damping per second
    maxSpeed: 340,
    baseIntegrity: 3,
    integrityCap: 6,
    hitIframes: 1.0,
    hitKnockback: 460,
    pickupRadius: 30,
  },

  dash: {
    speed: 980,
    duration: 0.16,
    graceIframes: 0.06, // brief protection after the dash ends
    charges: 2,
    chargeCap: 4,
    rechargeTime: 1.5,
  },

  canister: {
    r: 11,
    fuse: 0.4, // blink time between trigger and detonation
    chainFuse: 0.15,
    damageRadius: 95,
    carveRadius: 55, // terrain destruction radius
  },

  hazards: {
    drifter: { rMin: 9, rMax: 13, speedMin: 110, speedMax: 190, hp: 2 },
    // Seeker top speed stays below player max speed: outrunnable, dash for emergencies.
    seeker: { r: 8, maxSpeed: 240, steer: 340, hp: 2 },
    sweeper: { r: 14, spanMin: 130, spanMax: 280, rateMin: 1.4, rateMax: 2.2, hp: 3 },
    pulsar: { r: 12, cycle: 2.6, ringDuration: 0.95, ringMaxR: 150, ringBand: 9, hp: 3 },
  },

  // The Caster (card deck) baseline; per-card adjustments live in cards.ts.
  caster: {
    slots: 5,
    projectileCap: 80,
    blinkRange: 140,
    /** Homing payloads steer toward agents within this range. */
    homingRange: 260,
    /** Homing turn authority (higher = tighter curves). */
    homingSteer: 5.5,
    /** Flux motes dropped by a destroyed hazard (min, and +1 for big ones). */
    killDrop: 1,
  },

  // One entry per sector of a run; difficulty escalates down the table.
  // "heat" spawns an extra drifter at the arena edge every heatInterval seconds
  // (up to heatCap). cardNodes are card pickups scattered in the open; caches
  // are card pickups sealed inside a destructible wall ring — every cache gets
  // a canister placed within reach as its key.
  sectors: [
    { name: "CALIBRATION FIELD", w: 1800, h: 1300, walls: 8,  shards: 4, motes: 18, drifters: 5,  seekers: 0, sweepers: 0, pulsars: 0, canisters: 2, cardNodes: 2, caches: 0, frames: 0, heatInterval: 12, heatCap: 4 },
    { name: "RELAY GRID",        w: 2000, h: 1400, walls: 9,  shards: 5, motes: 21, drifters: 6,  seekers: 1, sweepers: 1, pulsars: 0, canisters: 3, cardNodes: 2, caches: 1, frames: 1, heatInterval: 11, heatCap: 5 },
    { name: "SHATTER YARD",      w: 2200, h: 1500, walls: 10, shards: 6, motes: 24, drifters: 8,  seekers: 2, sweepers: 2, pulsars: 1, canisters: 6, cardNodes: 3, caches: 1, frames: 0, heatInterval: 10, heatCap: 6 },
    { name: "SENTINEL WORKS",    w: 2400, h: 1650, walls: 11, shards: 7, motes: 27, drifters: 9,  seekers: 3, sweepers: 3, pulsars: 3, canisters: 4, cardNodes: 3, caches: 2, frames: 1, heatInterval: 9,  heatCap: 7 },
    { name: "TERMINUS",          w: 2600, h: 1800, walls: 12, shards: 8, motes: 30, drifters: 10, seekers: 5, sweepers: 4, pulsars: 4, canisters: 6, cardNodes: 4, caches: 2, frames: 0, heatInterval: 8,  heatCap: 8 },
  ],

  flux: {
    mote: 1,
    sectorClear: 10,
    winBonus: 40,
  },

  camera: {
    stiffness: 8, // higher = snappier follow
  },

  particleCap: 400,
} as const;
