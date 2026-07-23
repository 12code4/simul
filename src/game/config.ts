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

  // Graze: shaving past danger charges the dash. Risk is a resource.
  graze: {
    band: 16, // extra distance beyond a hit within which a pass counts
    rechargeBonus: 0.35, // seconds shaved off the dash recharge per graze
    cooldown: 0.35, // min seconds between graze events
    streakTimeout: 6,
  },

  orbital: {
    radius: 46, // orbit distance from the player
    speed: 3.2, // radians per second
    dmg: 1,
    hitCooldown: 0.5,
    cap: 2,
  },

  announcer: {
    toastLife: 4.5,
    maxToasts: 3,
    idleAfter: 8, // seconds of standing still before the sim intervenes
  },

  // The Waystation: spend run-flux between sectors. Prices scale per purchase.
  bazaar: {
    packCost: 15,
    packCostStep: 5,
    repairCost: 20,
    purgeCost: 10,
    rerollCost: 8,
    rerollCostStep: 4,
  },

  // Elite agents: gilded, tougher, faster, richer. Heat spawns roll for elite.
  elite: {
    hpBonusMult: 2, // hp = base * mult + 1
    speedMult: 1.25,
    extraDrops: 3,
    heatChance: 0.2,
  },

  // The Warden: sector 5's gate guardian.
  warden: {
    r: 26,
    hp: 40,
    contactR: 34,
    orbitSpeed: 0.25, // radians/s around the arena's far half
    nodeCount: 3,
    nodeHp: 3,
    nodeOrbitR: 70,
    nodeOrbitSpeed: 2,
    nodeR: 9,
    burstEvery: 2.5,
    burstShots: 8,
    shotSpeed: 260,
    shotLife: 3.5,
    chargeTelegraph: 0.6,
    chargeSpeed: 900,
    chargeDuration: 0.35,
    chargeCooldown: 3.5,
    summonEvery: 5,
  },

  // Sim Depth (post-win difficulty ladder): per depth level, agents move
  // +8% faster, heat drips 8% faster, and elite chance rises +5%.
  depth: {
    max: 5,
    speedPerLevel: 0.08,
    heatPerLevel: 0.92, // heatInterval multiplier per level
    eliteChancePerLevel: 0.05,
  },

  camera: {
    stiffness: 8, // higher = snappier follow
  },

  particleCap: 400,
} as const;
