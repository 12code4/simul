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

  camera: {
    stiffness: 8, // higher = snappier follow
  },

  flux: {
    mote: 1,
    sectorClear: 10,
    winBonus: 40,
  },

  hazards: {
    drifter: { rMin: 9, rMax: 13, speedMin: 110, speedMax: 190 },
    // Seeker top speed stays below player max speed: outrunnable, dash for emergencies.
    seeker: { r: 8, maxSpeed: 240, steer: 340 },
    sweeper: { r: 14, spanMin: 130, spanMax: 280, rateMin: 1.4, rateMax: 2.2 },
    pulsar: { r: 12, cycle: 2.6, ringDuration: 0.95, ringMaxR: 150, ringBand: 9 },
  },

  // One entry per sector of a run; difficulty escalates down the table.
  // "heat" spawns an extra drifter at the arena edge every heatInterval seconds
  // (up to heatCap), so lingering gets progressively more dangerous.
  sectors: [
    { w: 1400, h: 1000, walls: 7,  shards: 4, motes: 14, drifters: 5, seekers: 0, sweepers: 0, pulsars: 0, heatInterval: 10, heatCap: 4 },
    { w: 1550, h: 1080, walls: 8,  shards: 5, motes: 16, drifters: 6, seekers: 1, sweepers: 1, pulsars: 0, heatInterval: 9,  heatCap: 5 },
    { w: 1700, h: 1160, walls: 9,  shards: 6, motes: 18, drifters: 7, seekers: 2, sweepers: 2, pulsars: 1, heatInterval: 8,  heatCap: 6 },
    { w: 1850, h: 1240, walls: 10, shards: 7, motes: 20, drifters: 8, seekers: 3, sweepers: 3, pulsars: 2, heatInterval: 7,  heatCap: 7 },
    { w: 2000, h: 1320, walls: 11, shards: 8, motes: 22, drifters: 9, seekers: 5, sweepers: 4, pulsars: 3, heatInterval: 6,  heatCap: 8 },
  ],

  particleCap: 400,
} as const;
