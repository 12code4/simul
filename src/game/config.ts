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
    igniter: "#ffb25b",
    corroder: "#a8e34d",
    canister: "#ff9d3d",
    hudText: "#e6e6e6",
    hudDim: "#8b93a7",
    // Substrate materials.
    coolant: "#1e4a6e",
    coolantLit: "#2f6da0",
    oil: "#3a3226",
    oilLit: "#54452e",
    acid: "#3f7a1e",
    acidLit: "#5da62c",
    fire: "#ff7a2d",
    fireHot: "#ffd23d",
    steam: "#9aa7b8",
    scorch: "#0c0e12",
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

  // Material/status effects on entities.
  materials: {
    coolantSpeedMult: 0.55, // for the player and ground hazards alike
    oilAccelMult: 0.45, // slippery: weak thrust...
    oilDragMult: 0.3, // ...and barely any braking
    wetDuration: 4.0, // fireproof + slightly slow after touching coolant
    oiledDuration: 6.0, // flammable + slippery residue
    burnDuration: 2.5, // player burn timer; extinguish in coolant to survive
    burnDamageAt: 1.6, // countdown value at which burning deals its damage
    acidDamageInterval: 0.8, // standing in acid re-damages at this cadence
    hazardBurnTime: 1.2, // burning hazards die after this long
    steamSeekerMult: 0.15, // seeker steering strength when player is in steam
  },

  canister: {
    r: 11,
    fuse: 0.4, // blink time between trigger and detonation
    chainFuse: 0.15,
    damageRadius: 95,
    carveRadius: 55, // terrain destruction radius
    igniteRadius: 115,
  },

  hazards: {
    drifter: { rMin: 9, rMax: 13, speedMin: 110, speedMax: 190, hp: 2 },
    // Seeker top speed stays below player max speed: outrunnable, dash for emergencies.
    seeker: { r: 8, maxSpeed: 240, steer: 340, hp: 2 },
    sweeper: { r: 14, spanMin: 130, spanMax: 280, rateMin: 1.4, rateMax: 2.2, hp: 3 },
    pulsar: { r: 12, cycle: 2.6, ringDuration: 0.95, ringMaxR: 150, ringBand: 9, hp: 3 },
    // Substrate agents.
    igniter: { r: 10, speedMin: 70, speedMax: 120, hp: 1 }, // fire trail; dies in coolant
    corroder: { r: 12, speed: 55, turnEvery: 1.6, hp: 2 }, // acid trail; dissolves the level
  },

  // The Caster (card deck) baseline; per-card adjustments live in cards.ts.
  caster: {
    slots: 5,
    projectileCap: 80,
    /** Radius of the material splash written by material payload cards. */
    splashRadius: 30,
    blinkRange: 140,
    /** Flux motes dropped by a destroyed hazard (min, and +1 for big ones). */
    killDrop: 1,
  },

  // One entry per sector of a run; difficulty and material chaos escalate.
  // "heat" spawns an extra drifter at the arena edge every heatInterval seconds
  // (up to heatCap). Pools are painted blobs of the named material. cardNodes
  // are card pickups scattered in the open; caches are card pickups sealed
  // inside a destructible wall ring (acid/explosions are the key).
  sectors: [
    { name: "CALIBRATION FIELD", w: 1800, h: 1300, walls: 8,  shards: 4, motes: 18, drifters: 5, seekers: 0, sweepers: 0, pulsars: 0, igniters: 0, corroders: 0, canisters: 2, coolantPools: 2, oilPools: 2, acidPools: 0, cardNodes: 2, caches: 0, heatInterval: 12, heatCap: 4 },
    { name: "COOLANT BASIN",     w: 2000, h: 1400, walls: 9,  shards: 5, motes: 21, drifters: 6, seekers: 1, sweepers: 1, pulsars: 0, igniters: 0, corroders: 0, canisters: 3, coolantPools: 5, oilPools: 2, acidPools: 0, cardNodes: 2, caches: 1, heatInterval: 11, heatCap: 5 },
    { name: "FUEL DEPOT",        w: 2200, h: 1500, walls: 10, shards: 6, motes: 24, drifters: 7, seekers: 2, sweepers: 2, pulsars: 1, igniters: 1, corroders: 0, canisters: 6, coolantPools: 2, oilPools: 6, acidPools: 1, cardNodes: 3, caches: 1, heatInterval: 10, heatCap: 6 },
    { name: "CORROSION WORKS",   w: 2400, h: 1650, walls: 11, shards: 7, motes: 27, drifters: 8, seekers: 3, sweepers: 3, pulsars: 2, igniters: 1, corroders: 2, canisters: 4, coolantPools: 3, oilPools: 3, acidPools: 5, cardNodes: 3, caches: 2, heatInterval: 9,  heatCap: 7 },
    { name: "CRUCIBLE",          w: 2600, h: 1800, walls: 12, shards: 8, motes: 30, drifters: 9, seekers: 5, sweepers: 4, pulsars: 3, igniters: 3, corroders: 2, canisters: 6, coolantPools: 3, oilPools: 6, acidPools: 3, cardNodes: 4, caches: 2, heatInterval: 8,  heatCap: 8 },
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
