// The simulation. update() advances the whole game by one fixed step:
// a phase machine (title/playing/draft/paused/end screens) plus the gameplay
// step itself. Mutates state; never draws.

import {
  applyCastModifier,
  CARDS,
  createCaster,
  emptyCastMods,
  FRAMES,
  identityOrder,
  type CardId,
  type CastMods,
  type Caster,
  type FrameId,
} from "./cards";
import { config } from "./config";
import { ANOMALIES, CONTRACT_IDS, CONTRACTS, LINES, pickLine } from "./flavor";
import type { Input } from "./input";
import { buyUpgrade, META_TRACKS, saveMeta } from "./meta";
import { applyMod, rollDraft, type ModId } from "./mods";
import { clamp, dist } from "./physics";
import { nextFloat, pick, range, rangeInt, shuffle } from "./rng";
import { sectorDef, type Hazard, type SectorState } from "./sector";
import { createRun, enterSector, MAX_CASTERS, type GameState, type RunState } from "./state";
import { detonate, MAT, matAt, resolveCircleSubstrate } from "./substrate";
import { CONTINUE_RECT, CONTRACT_RECT, deckSlotRect, draftCardRect, inRect, inventoryRect, shopRect } from "./ui";
import { CARD_IDS } from "./cards";
import { makeElite } from "./sector";

/** Queue a deadpan line from the simulation. */
function pushToast(run: RunState, text: string): void {
  run.toasts.push({ text, age: 0 });
  if (run.toasts.length > config.announcer.maxToasts) run.toasts.shift();
}

export function update(state: GameState, input: Input, dt: number): void {
  state.uiTime += dt;
  switch (state.phase) {
    case "title":
      updateTitle(state, input);
      break;
    case "playing":
      if (state.run) updatePlaying(state, state.run, input, dt);
      break;
    case "paused":
      updatePaused(state, input);
      break;
    case "draft":
      updateDraft(state, input, dt);
      break;
    case "gameover":
    case "victory":
      updateEnd(state, input, dt);
      break;
  }
}

// --- run lifecycle ---------------------------------------------------------

function startRun(state: GameState): void {
  // The only nondeterminism in the game: choosing a fresh seed. Dev hooks
  // (?seed=hex&sector=n) pin it for reproducible testing.
  const seed = state.dev.seed ?? (Math.random() * 0xffffffff) >>> 0;
  state.meta.runs += 1;
  saveMeta(state.meta);
  state.run = createRun(state.meta, seed);
  if (state.dev.sector !== null && state.dev.sector > 1) {
    enterSector(state.run, state.dev.sector - 1);
  }
  if (state.dev.deck !== null) {
    const slots = state.run.casters[0].slots;
    state.dev.deck.slice(0, slots.length).forEach((card, i) => {
      slots[i] = card;
    });
  }
  if (state.dev.boss && state.run.sectorIndex === config.sectors.length - 1) {
    state.run.sector.shards = [];
    summonWarden(state.run, state.run.sector);
  }
  state.draftOptions = null;
  state.outcome = null;
  state.menuIndex = 0;
  state.chosenMod = null;
  state.editSel = null;
  state.phase = "playing";
}

/** Bank this run's flux into persistent cores. Returns the amount banked. */
function bank(state: GameState, run: RunState, won: boolean): number {
  const banked = run.flux + (won ? config.flux.winBonus : 0);
  const m = state.meta;
  m.cores += banked;
  m.totalFlux += banked;
  if (won) {
    m.wins += 1;
    // Winning at your max depth unlocks the next rung of the ladder.
    if (run.depth === m.unlockedDepth && m.unlockedDepth < config.depth.max) {
      m.unlockedDepth += 1;
    }
  }
  m.bestSector = Math.max(m.bestSector, run.sectorIndex + 1);
  saveMeta(m);
  return banked;
}

function clearSector(state: GameState, run: RunState): void {
  run.flux += config.flux.sectorClear;
  settleContract(run);
  if (run.sectorIndex >= config.sectors.length - 1) {
    const banked = bank(state, run, true);
    state.outcome = { won: true, banked, sectorReached: config.sectors.length, time: run.time, kills: run.kills };
    state.phase = "victory";
  } else {
    state.draftOptions = rollDraft(run.rng, run);
    // Offer a fresh optional wager for the next sector.
    state.contractOffer = pick(run.rng, CONTRACT_IDS);
    state.contractAccepted = false;
    state.menuIndex = 0;
    state.chosenMod = null;
    state.editSel = null;
    state.phase = "draft";
  }
}

/** Judge the sector's contract, pay out or void it, and clear it. */
function settleContract(run: RunState): void {
  const id = run.contract;
  if (id === null) return;
  run.contract = null;
  const sec = run.sector;
  let met = false;
  if (id === "spotless") met = !run.tookHitThisSector;
  else if (id === "swift") met = sec.elapsed < 75;
  else if (id === "pacifist") met = run.kills === run.killsAtSectorStart;
  else if (id === "greedy") met = sec.motes.length === 0;
  if (met) {
    run.flux += CONTRACTS[id].bonus;
    pushToast(run, pickLine(LINES.contractMet, run.seed + run.sectorIndex));
  } else {
    pushToast(run, pickLine(LINES.contractFailed, run.seed + run.sectorIndex));
  }
}

// --- menu phases -----------------------------------------------------------

function updateTitle(state: GameState, input: Input): void {
  if (input.takePress("Enter") || input.takePress("Space")) {
    startRun(state);
    return;
  }
  META_TRACKS.forEach((track, i) => {
    if (input.takePress(`Digit${i + 1}`)) buyUpgrade(state.meta, track);
  });
  // Sim Depth selection (unlocked by winning at the current max depth).
  if (input.takePress("KeyD") && state.meta.unlockedDepth > 0) {
    state.meta.chosenDepth = (state.meta.chosenDepth + 1) % (state.meta.unlockedDepth + 1);
    saveMeta(state.meta);
  }
}

function updatePaused(state: GameState, input: Input): void {
  if (input.takePress("Escape") || input.takePress("Enter")) {
    state.phase = "playing";
  } else if (input.takePress("KeyQ")) {
    if (state.run) bank(state, state.run, false);
    state.run = null;
    state.outcome = null;
    state.phase = "title";
  }
}

/**
 * The sector-clear screen: pick one mod (required), optionally rearrange the
 * caster deck (click a card, click a destination), then continue.
 */
function updateDraft(state: GameState, input: Input, dt: number): void {
  const opts = state.draftOptions;
  const run = state.run;
  if (!opts || !run) {
    state.phase = "title";
    return;
  }
  tickCosmetics(run, dt);

  // Keyboard: digits pick a mod, arrows move the highlight, Enter continues.
  if (input.takePress("ArrowLeft") || input.takePress("KeyA")) {
    state.menuIndex = (state.menuIndex + opts.length - 1) % opts.length;
  }
  if (input.takePress("ArrowRight") || input.takePress("KeyD")) {
    state.menuIndex = (state.menuIndex + 1) % opts.length;
  }
  for (let i = 0; i < opts.length; i++) {
    if (input.takePress(`Digit${i + 1}`)) {
      state.chosenMod = i;
      state.menuIndex = i;
    }
  }

  if (input.takeClick()) {
    handleDraftClick(state, run, opts, input.mouse().x, input.mouse().y);
    if (state.phase !== "draft") return; // continue button advanced the run
  }

  const confirm = input.takePress("Enter") || input.takePress("Space");
  if (confirm) {
    if (state.chosenMod === null) state.chosenMod = state.menuIndex;
    advanceFromDraft(state, run, opts[state.chosenMod]);
  }
}

function advanceFromDraft(state: GameState, run: RunState, mod: ModId): void {
  applyMod(run, mod);
  run.contract = state.contractAccepted && state.contractOffer !== null ? state.contractOffer : null;
  state.contractOffer = null;
  state.contractAccepted = false;
  state.purging = false;
  state.draftOptions = null;
  state.chosenMod = null;
  state.editSel = null;
  // Deck edits may have moved cards; deal fresh walk orders for the new sector.
  for (const c of run.casters) {
    refreshOrder(run, c);
    c.pointer = 0;
  }
  enterSector(run, run.sectorIndex + 1);
  state.phase = "playing";
}

function handleDraftClick(
  state: GameState,
  run: RunState,
  opts: ModId[],
  mx: number,
  my: number,
): void {
  // Mod cards.
  for (let i = 0; i < opts.length; i++) {
    if (inRect(mx, my, draftCardRect(i, opts.length))) {
      state.chosenMod = i;
      state.menuIndex = i;
      return;
    }
  }
  if (inRect(mx, my, CONTINUE_RECT) && state.chosenMod !== null) {
    advanceFromDraft(state, run, opts[state.chosenMod]);
    return;
  }
  // Contract wager toggle.
  if (state.contractOffer !== null && inRect(mx, my, CONTRACT_RECT)) {
    state.contractAccepted = !state.contractAccepted;
    return;
  }
  // The Waystation shop.
  for (let i = 0; i < 4; i++) {
    if (inRect(mx, my, shopRect(i))) {
      shopBuy(state, run, i);
      return;
    }
  }
  // Deck slots — one row per carried caster.
  for (let row = 0; row < run.casters.length; row++) {
    const caster = run.casters[row];
    for (let i = 0; i < caster.slots.length; i++) {
      if (inRect(mx, my, deckSlotRect(row, i, caster.slots.length))) {
        clickDeckSlot(state, run, row, i);
        return;
      }
    }
  }
  // Inventory tiles (one extra tile acts as the unequip target).
  for (let i = 0; i <= run.inventory.length; i++) {
    if (inRect(mx, my, inventoryRect(i))) {
      clickInventory(state, run, i);
      return;
    }
  }
  state.editSel = null;
}

/** Waystation services: pack / repair / purge / reroll. Flux is the price. */
function shopBuy(state: GameState, run: RunState, item: number): void {
  const bz = config.bazaar;
  if (item === 0 && run.flux >= run.packCost) {
    run.flux -= run.packCost;
    run.packCost += bz.packCostStep;
    const card = pick(run.rng, CARD_IDS);
    run.inventory.push(card);
    pushToast(run, pickLine(LINES.shopPurchase, run.flux));
  } else if (item === 1 && run.flux >= bz.repairCost && run.integrity < run.maxIntegrity) {
    run.flux -= bz.repairCost;
    run.integrity += 1;
    pushToast(run, "hull patched. do stop getting hit.");
  } else if (item === 2 && run.flux >= bz.purgeCost && !state.purging) {
    run.flux -= bz.purgeCost;
    state.purging = true;
    state.editSel = null;
  } else if (item === 3 && run.flux >= run.rerollCost && state.draftOptions !== null) {
    run.flux -= run.rerollCost;
    run.rerollCost += bz.rerollCostStep;
    state.draftOptions = rollDraft(run.rng, run);
    state.chosenMod = null;
    state.menuIndex = 0;
  }
}

function clickDeckSlot(state: GameState, run: RunState, row: number, i: number): void {
  // PURGE mode: this click destroys the card instead of selecting it.
  if (state.purging) {
    const slots = run.casters[row].slots;
    if (slots[i] !== null) {
      slots[i] = null;
      state.purging = false;
      pushToast(run, "card purged. the deck breathes easier.");
    }
    return;
  }
  const sel = state.editSel;
  const slots = run.casters[row].slots;
  if (sel === null) {
    if (slots[i] !== null) state.editSel = { zone: "slot", caster: row, index: i };
    return;
  }
  if (sel.zone === "slot") {
    // Swap between any two slots, same caster or across casters.
    const from = run.casters[sel.caster].slots;
    if (!(sel.caster === row && sel.index === i)) {
      const tmp = from[sel.index];
      from[sel.index] = slots[i];
      slots[i] = tmp;
    }
    state.editSel = null;
  } else {
    // Place (or swap) an inventory card into this slot.
    const card = run.inventory[sel.index];
    if (card !== undefined) {
      const displaced = slots[i];
      slots[i] = card;
      run.inventory.splice(sel.index, 1);
      if (displaced !== null) run.inventory.push(displaced);
    }
    state.editSel = null;
  }
}

function clickInventory(state: GameState, run: RunState, i: number): void {
  // PURGE mode: destroy the clicked inventory card.
  if (state.purging) {
    if (i < run.inventory.length) {
      run.inventory.splice(i, 1);
      state.purging = false;
      pushToast(run, "card purged. the deck breathes easier.");
    }
    return;
  }
  const sel = state.editSel;
  if (sel === null) {
    if (i < run.inventory.length) state.editSel = { zone: "inv", caster: 0, index: i };
    return;
  }
  if (sel.zone === "slot") {
    // Unequip the selected slot card into the inventory.
    const slots = run.casters[sel.caster].slots;
    const card = slots[sel.index];
    if (card !== null) {
      run.inventory.push(card);
      slots[sel.index] = null;
    }
  }
  state.editSel = null;
}

function updateEnd(state: GameState, input: Input, dt: number): void {
  if (state.run) tickCosmetics(state.run, dt);
  if (input.takePress("Enter")) {
    startRun(state);
  } else if (input.takePress("Escape")) {
    state.run = null;
    state.phase = "title";
  }
}

// --- the gameplay step -----------------------------------------------------

function updatePlaying(state: GameState, run: RunState, input: Input, dt: number): void {
  if (input.takePress("Escape")) {
    state.phase = "paused";
    return;
  }

  const p = run.player;
  const s = run.stats;
  const sec = run.sector;
  const def = sectorDef(sec.index);
  run.time += dt;
  sec.elapsed += dt;

  // Sector intro: the sim announces itself, and any house rule in effect.
  if (!run.sectorIntroDone) {
    run.sectorIntroDone = true;
    if (sec.index === 0 && run.time < 1) pushToast(run, pickLine(LINES.runStart, run.seed));
    if (sec.anomaly !== null) pushToast(run, ANOMALIES[sec.anomaly].intro);
    if (run.contract !== null) {
      pushToast(run, `contract active: ${CONTRACTS[run.contract].name.toLowerCase()}. no pressure.`);
    }
  }

  // The sim gets bored of statues.
  const axPeek = input.axis();
  if (axPeek.x === 0 && axPeek.y === 0 && Math.hypot(p.vx, p.vy) < 15) {
    run.idleTime += dt;
    if (run.idleTime > config.announcer.idleAfter) {
      run.idleTime = -6; // repeat offenders get a longer fuse
      pushToast(run, pickLine(LINES.idle, Math.floor(run.time)));
      spawnEdgeDrifter(run, sec);
    }
  } else {
    run.idleTime = 0;
  }

  // The probe's eye tracks the real aim point.
  {
    const m = input.mouse();
    run.aimX = run.camX + (m.x - config.width / 2);
    run.aimY = run.camY + (m.y - config.height / 2);
  }

  // Movement + dash.
  const ax = input.axis();
  if (ax.x !== 0 || ax.y !== 0) {
    p.faceX = ax.x;
    p.faceY = ax.y;
  }

  const wantDash =
    input.takePress("Space") || input.takePress("ShiftLeft") || input.takePress("ShiftRight");
  if (wantDash && p.dashTimer <= 0 && p.charges > 0) {
    let dx = ax.x;
    let dy = ax.y;
    if (dx === 0 && dy === 0) {
      const vlen = Math.hypot(p.vx, p.vy);
      if (vlen > 20) {
        dx = p.vx / vlen;
        dy = p.vy / vlen;
      } else {
        dx = p.faceX;
        dy = p.faceY;
      }
    }
    if (p.charges === s.dashCharges) p.recharge = s.dashRecharge; // timer starts when leaving full
    p.charges -= 1;
    p.dashTimer = s.dashDuration;
    p.dashX = dx;
    p.dashY = dy;
  }

  if (p.dashTimer > 0) {
    p.vx = p.dashX * config.dash.speed;
    p.vy = p.dashY * config.dash.speed;
    p.dashTimer -= dt;
    if (p.dashTimer <= 0) {
      p.iframes = Math.max(p.iframes, config.dash.graceIframes);
      // Exit the dash at top speed in the dash direction — keeps flow.
      p.vx = p.dashX * s.maxSpeed;
      p.vy = p.dashY * s.maxSpeed;
    }
    addParticle(run, p.x, p.y, -p.dashX * 40, -p.dashY * 40, 0.25, 4, config.colors.player);
  } else {
    // SLICK FLOORS house rule: everyone drifts.
    const dragMult = sec.anomaly === "slick" ? 0.35 : 1;
    p.vx += ax.x * s.accel * dt;
    p.vy += ax.y * s.accel * dt;
    const damp = Math.exp(-s.drag * dragMult * dt);
    p.vx *= damp;
    p.vy *= damp;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > s.maxSpeed) {
      const k = s.maxSpeed / sp;
      p.vx *= k;
      p.vy *= k;
    }
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Collide with terrain (wall cells) — slide along contacts.
  const pr = config.player.radius;
  const hit = resolveCircleSubstrate(sec.substrate, p.x, p.y, pr);
  if (hit) {
    p.x = hit.x;
    p.y = hit.y;
    const vn = p.vx * hit.nx + p.vy * hit.ny;
    if (vn < 0) {
      p.vx -= hit.nx * vn;
      p.vy -= hit.ny * vn;
    }
  }
  p.x = clamp(p.x, pr, sec.w - pr);
  p.y = clamp(p.y, pr, sec.h - pr);

  // Dash recharge and timers.
  if (p.charges < s.dashCharges) {
    p.recharge -= dt;
    if (p.recharge <= 0) {
      p.charges += 1;
      p.recharge = s.dashRecharge;
    }
  }
  p.iframes = Math.max(0, p.iframes - dt);

  // Q swaps casters. Each caster keeps its own cast/recharge timer, so
  // weaving between two decks to cover a recharge is intended tech.
  if (input.takePress("KeyQ") && run.casters.length > 1) {
    run.activeCaster = 1 - run.activeCaster;
    addBurst(run, p.x, p.y, FRAMES[run.casters[run.activeCaster].frame].color, 6);
  }

  // Casting: hold the mouse to fire at the active caster's cadence.
  // (Both casters' timers tick down — the holstered one recharges too.)
  for (const cst of run.casters) {
    cst.castTimer = Math.max(0, cst.castTimer - dt);
  }
  const active = run.casters[run.activeCaster];
  if (input.mouseHeld() && active.castTimer <= 0) {
    const m = input.mouse();
    const aimX = run.camX + (m.x - config.width / 2);
    const aimY = run.camY + (m.y - config.height / 2);
    castFromDeck(run, active, aimX, aimY);
  }

  updateProjectiles(run, sec, dt);
  updateOrbitals(run, sec, dt);
  updateHazards(run, sec, dt);
  updateCanisters(state, run, sec, dt);
  updateWarden(state, run, sec, dt);
  if (state.phase !== "playing") return;
  updateEnemyShots(state, run, sec, dt);
  if (state.phase !== "playing") return;
  // ABUNDANCE house rule: richer floor, faster pressure. Sim Depth compounds.
  const heatInterval =
    (sec.anomaly === "abundance" ? def.heatInterval * 0.7 : def.heatInterval) *
    Math.pow(config.depth.heatPerLevel, run.depth);
  updateHeat(run, sec, heatInterval, def.heatCap, dt);
  checkPlayerDamage(state, run);

  // Graze timers.
  run.grazeCooldown = Math.max(0, run.grazeCooldown - dt);
  run.grazeFlash = Math.max(0, run.grazeFlash - dt);
  run.grazeTimeout -= dt;
  if (run.grazeTimeout <= 0 && run.grazeStreak > 0) run.grazeStreak = 0;

  if (state.phase === "playing") {
    collectPickups(state, run);
  }

  // Camera follows the player, clamped to the arena.
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const k = 1 - Math.exp(-config.camera.stiffness * dt);
  run.camX += (p.x - run.camX) * k;
  run.camY += (p.y - run.camY) * k;
  run.camX = sec.w <= config.width ? sec.w / 2 : clamp(run.camX, halfW, sec.w - halfW);
  run.camY = sec.h <= config.height ? sec.h / 2 : clamp(run.camY, halfH, sec.h - halfH);

  tickCosmetics(run, dt);
}

// --- casting & projectiles -------------------------------------------------

interface DeckWalk {
  idx: number;
  scanned: number;
  wrapped: boolean;
}

/** One resolved cast: a payload plus its folded modifiers and any cargo. */
interface CastEntry {
  card: CardId;
  mods: CastMods;
  cargoCard: CardId | null;
  cargoMods: CastMods | null;
}

/**
 * Advance the walk to the next payload/utility card, folding every modifier
 * passed over into `mods`. Returns null when the whole deck has been scanned.
 */
function takePayload(c: Caster, walk: DeckWalk, mods: CastMods): CardId | null {
  const len = c.order.length;
  while (walk.scanned < len) {
    const slotIdx = c.order[walk.idx];
    walk.idx += 1;
    walk.scanned += 1;
    if (walk.idx >= len) {
      walk.idx = 0;
      walk.wrapped = true;
    }
    const card = c.slots[slotIdx];
    if (card === null) continue;
    const def = CARDS[card];
    if (def.kind === "modifier") {
      applyCastModifier(mods, card);
      continue;
    }
    return card;
  }
  return null;
}

/** Shuffler frames re-deal their walk order on every recharge. */
function refreshOrder(run: RunState, c: Caster): void {
  c.order = FRAMES[c.frame].shuffle
    ? shuffle(run.rng, identityOrder(c.slots.length))
    : identityOrder(c.slots.length);
}

/**
 * Walk the deck from the pointer and cast. Modifiers fold into the next
 * payload; Multicast pulls extra payloads into the same cast; trigger
 * payloads consume the FOLLOWING card (with its modifiers) as cargo, cast
 * when the trigger lands. Wrapping the deck costs the recharge delay.
 */
function castFromDeck(run: RunState, c: Caster, aimX: number, aimY: number): void {
  const frame = FRAMES[c.frame];
  const walk: DeckWalk = { idx: c.pointer, scanned: 0, wrapped: false };

  const baseMods = emptyCastMods();
  const first = takePayload(c, walk, baseMods);
  if (first === null) {
    // Deck holds no castable card (empty or modifiers only): brief idle spin.
    c.pointer = 0;
    c.castTimer = frame.rechargeTime;
    c.recharging = true;
    refreshOrder(run, c);
    return;
  }

  const casts: CastEntry[] = [{ card: first, mods: baseMods, cargoCard: null, cargoMods: null }];
  for (let k = 0; k < baseMods.extra && casts.length < 3; k++) {
    const m2 = emptyCastMods();
    const p2 = takePayload(c, walk, m2);
    if (p2 === null) break;
    casts.push({ card: p2, mods: m2, cargoCard: null, cargoMods: null });
  }

  // Trigger payloads pick up their cargo (one nesting level deep).
  let maxDelay = 0;
  for (const entry of casts) {
    const def = CARDS[entry.card];
    maxDelay = Math.max(maxDelay, def.delayAdd);
    if (def.trigger !== null) {
      const cm = emptyCastMods();
      const cargo = takePayload(c, walk, cm);
      if (cargo !== null) {
        entry.cargoCard = cargo;
        entry.cargoMods = cm;
      }
    }
  }

  c.pointer = walk.idx;
  c.castTimer = (walk.wrapped ? frame.rechargeTime : frame.castDelay) + maxDelay;
  c.recharging = walk.wrapped;
  if (walk.wrapped) refreshOrder(run, c);

  const p = run.player;
  const baseAngle = Math.atan2(aimY - p.y, aimX - p.x);
  for (const entry of casts) {
    if (entry.card === "blink") {
      blinkPlayer(run, baseAngle);
    } else if (entry.card === "remora") {
      summonOrbital(run);
    } else {
      spawnShots(run, p.x, p.y, baseAngle, entry, frame.dmgBonus);
    }
  }
  addBurst(run, p.x + Math.cos(baseAngle) * 14, p.y + Math.sin(baseAngle) * 14, CARDS[first].color, 3);
}

/** Spawn the projectiles for one cast entry from (x, y) toward `angle`. */
function spawnShots(
  run: RunState,
  x: number,
  y: number,
  angle: number,
  entry: CastEntry,
  dmgBonus: number,
): void {
  const def = CARDS[entry.card];
  const mods = entry.mods;
  const sec = run.sector;
  const shots = def.pellets * mods.count;
  const halfSpread = def.spread * (def.pellets - 1) + (mods.count > 1 ? 0.05 : 0);
  for (let i = 0; i < shots; i++) {
    if (sec.projectiles.length >= config.caster.projectileCap) break;
    const t = shots === 1 ? 0 : (i / (shots - 1)) * 2 - 1; // -1 .. 1 across the fan
    const a = angle + t * halfSpread;
    const speed = def.speed * mods.speedMult;
    // Only the first pellet of a trigger shot carries the cargo — one bomb,
    // not a bomb per pellet.
    const carry = i === 0 ? entry.cargoCard : null;
    // RICOCHET FIELD house rule: every shot bounces at least once.
    const fieldBounce = sec.anomaly === "ricochetfield" ? 1 : 0;
    sec.projectiles.push({
      x: x + Math.cos(a) * (config.player.radius + 6),
      y: y + Math.sin(a) * (config.player.radius + 6),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 4,
      dmg: def.dmg + mods.dmgAdd + dmgBonus,
      card: entry.card,
      life: def.life,
      bounces: mods.bounces + fieldBounce,
      pierce: mods.pierce,
      homing: def.homing,
      cargoCard: carry,
      cargoMods: carry !== null ? entry.cargoMods : null,
      returning: false,
      split: false,
      triggerTimer: def.trigger === "timer" ? def.triggerTime : -1,
      dmgBonus,
      hitIds: [],
    });
  }
}

/** Remora: summon (or refresh) a little orbiting friend for this sector. */
function summonOrbital(run: RunState): void {
  if (run.orbitals.length >= config.orbital.cap) {
    run.orbitals.forEach((o) => {
      o.hitCooldown = 0;
    });
    return;
  }
  run.orbitals.push({ angle: run.orbitals.length * Math.PI, hitCooldown: 0 });
  addBurst(run, run.player.x, run.player.y, CARDS.remora.color, 10);
}

function updateOrbitals(run: RunState, sec: SectorState, dt: number): void {
  const cfg = config.orbital;
  const p = run.player;
  for (const orb of run.orbitals) {
    orb.angle += cfg.speed * dt;
    orb.hitCooldown = Math.max(0, orb.hitCooldown - dt);
    if (orb.hitCooldown > 0) continue;
    const ox = p.x + Math.cos(orb.angle) * cfg.radius;
    const oy = p.y + Math.sin(orb.angle) * cfg.radius;
    for (let h = sec.hazards.length - 1; h >= 0; h--) {
      const hzd = sec.hazards[h];
      if (dist(hzd.x, hzd.y, ox, oy) < hzd.r + 7) {
        damageHazard(run, sec, h, cfg.dmg);
        addBurst(run, ox, oy, CARDS.remora.color, 5);
        orb.hitCooldown = cfg.hitCooldown;
        break;
      }
    }
  }
}

/** Release a trigger projectile's cargo at (x, y), continuing along `angle`. */
function releaseCargo(
  run: RunState,
  x: number,
  y: number,
  angle: number,
  cargoCard: CardId,
  cargoMods: CastMods | null,
  dmgBonus: number,
): void {
  addBurst(run, x, y, CARDS[cargoCard].color, 8);
  if (cargoCard === "remora") {
    summonOrbital(run);
    return;
  }
  if (cargoCard === "blink") {
    // Teleport-bolt tech: blink as cargo moves the player to the impact point.
    const p = run.player;
    addBurst(run, p.x, p.y, config.colors.player, 8);
    p.x = clamp(x, config.player.radius, run.sector.w - config.player.radius);
    p.y = clamp(y, config.player.radius, run.sector.h - config.player.radius);
    p.iframes = Math.max(p.iframes, 0.15);
    return;
  }
  const entry: CastEntry = {
    card: cargoCard,
    mods: cargoMods ?? emptyCastMods(),
    // Cargo never nests another trigger — one level deep, by design.
    cargoCard: null,
    cargoMods: null,
  };
  spawnShots(run, x, y, angle, entry, dmgBonus);
}

/** Short teleport toward the aim, stopped by terrain. */
function blinkPlayer(run: RunState, angle: number): void {
  const p = run.player;
  const sec = run.sector;
  const step = 8;
  const max = config.caster.blinkRange;
  let bx = p.x;
  let by = p.y;
  for (let d = step; d <= max; d += step) {
    const nx = p.x + Math.cos(angle) * d;
    const ny = p.y + Math.sin(angle) * d;
    if (nx < 20 || ny < 20 || nx > sec.w - 20 || ny > sec.h - 20) break;
    if (matAt(sec.substrate, nx, ny) === MAT.wall) break;
    bx = nx;
    by = ny;
  }
  addBurst(run, p.x, p.y, config.colors.player, 8);
  p.x = bx;
  p.y = by;
  p.iframes = Math.max(p.iframes, 0.1);
  addBurst(run, p.x, p.y, config.colors.player, 8);
}

function updateProjectiles(run: RunState, sec: SectorState, dt: number): void {
  for (let i = sec.projectiles.length - 1; i >= 0; i--) {
    const pr = sec.projectiles[i];
    const heading = Math.atan2(pr.vy, pr.vx);

    pr.life -= dt;
    if (pr.life <= 0) {
      if (pr.cargoCard !== null) {
        releaseCargo(run, pr.x, pr.y, heading, pr.cargoCard, pr.cargoMods, pr.dmgBonus);
      }
      addBurst(run, pr.x, pr.y, CARDS[pr.card].color, 4);
      sec.projectiles.splice(i, 1);
      continue;
    }

    // Timer triggers release their cargo mid-flight and are spent doing it.
    if (pr.triggerTimer > 0) {
      pr.triggerTimer -= dt;
      if (pr.triggerTimer <= 0 && pr.cargoCard !== null) {
        releaseCargo(run, pr.x, pr.y, heading, pr.cargoCard, pr.cargoMods, pr.dmgBonus);
        sec.projectiles.splice(i, 1);
        continue;
      }
    }

    // Yoyo: past its apex it turns around, homes back to you, and re-arms
    // (fresh hit list on the return pass). Catching it resets the cast delay.
    if (pr.card === "yoyo") {
      if (!pr.returning && pr.life < CARDS.yoyo.life * 0.55) {
        pr.returning = true;
        pr.hitIds = [];
        addBurst(run, pr.x, pr.y, CARDS.yoyo.color, 4);
      }
      if (pr.returning) {
        const p = run.player;
        const d = dist(p.x, p.y, pr.x, pr.y) || 1;
        const speed = Math.hypot(pr.vx, pr.vy);
        pr.vx = ((p.x - pr.x) / d) * speed;
        pr.vy = ((p.y - pr.y) / d) * speed;
        if (d < config.player.radius + 8) {
          const active = run.casters[run.activeCaster];
          if (active.castTimer > 0.2) pushToast(run, pickLine(LINES.yoyoCatch, Math.floor(run.time * 7)));
          active.castTimer = 0;
          active.recharging = false;
          addBurst(run, p.x, p.y, CARDS.yoyo.color, 8);
          sec.projectiles.splice(i, 1);
          continue;
        }
      }
    }

    // Homing payloads curve toward the nearest agent in range.
    if (pr.homing && sec.hazards.length > 0) {
      let best: Hazard | null = null;
      let bestD: number = config.caster.homingRange;
      for (const hzd of sec.hazards) {
        if (pr.hitIds.includes(hzd.id)) continue;
        const d = dist(hzd.x, hzd.y, pr.x, pr.y);
        if (d < bestD) {
          bestD = d;
          best = hzd;
        }
      }
      if (best) {
        const speed = Math.hypot(pr.vx, pr.vy);
        const want = Math.atan2(best.y - pr.y, best.x - pr.x);
        const cur = Math.atan2(pr.vy, pr.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = clamp(diff, -config.caster.homingSteer * dt, config.caster.homingSteer * dt);
        pr.vx = Math.cos(cur + turn) * speed;
        pr.vy = Math.sin(cur + turn) * speed;
      }
    }

    // Substep the motion so fast (hasted) shots can't tunnel through
    // single-cell walls: never advance more than ~half a cell per check.
    const oldX = pr.x;
    const oldY = pr.y;
    const stepLen = Math.hypot(pr.vx, pr.vy) * dt;
    const steps = Math.max(1, Math.ceil(stepLen / 8));
    let blocked = false;
    for (let sStep = 0; sStep < steps && !blocked; sStep++) {
      pr.x += (pr.vx * dt) / steps;
      pr.y += (pr.vy * dt) / steps;
      blocked =
        matAt(sec.substrate, pr.x, pr.y) === MAT.wall ||
        pr.x < 0 || pr.y < 0 || pr.x > sec.w || pr.y > sec.h;
    }
    // A returning yoyo phases through terrain — it WILL come back to you.
    if (blocked && pr.card === "yoyo" && pr.returning) blocked = false;

    // Terrain hit — bounce (axis-aligned reflection) or impact.
    if (blocked) {
      // Prism: the first wall touch refracts it into a fan of three bolts.
      if (pr.card === "prism" && !pr.split) {
        const hitX = matAt(sec.substrate, pr.x, oldY) === MAT.wall || pr.x < 0 || pr.x > sec.w;
        const hitY = matAt(sec.substrate, oldX, pr.y) === MAT.wall || pr.y < 0 || pr.y > sec.h;
        const rvx = hitX || !hitY ? -pr.vx : pr.vx;
        const rvy = hitY || !hitX ? -pr.vy : pr.vy;
        const base = Math.atan2(rvy, rvx);
        addBurst(run, oldX, oldY, CARDS.prism.color, 10);
        for (let k = -1; k <= 1; k++) {
          if (sec.projectiles.length >= config.caster.projectileCap) break;
          const a = base + k * 0.45;
          sec.projectiles.push({
            x: oldX, y: oldY,
            vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
            r: 3.5, dmg: pr.dmg, card: "bolt", life: 0.55,
            bounces: 0, pierce: false, homing: false,
            cargoCard: null, cargoMods: null, returning: false, split: true,
            triggerTimer: -1, dmgBonus: pr.dmgBonus, hitIds: [],
          });
        }
        sec.projectiles.splice(i, 1);
        continue;
      }
      if (pr.bounces > 0) {
        pr.bounces -= 1;
        const hitX = matAt(sec.substrate, pr.x, oldY) === MAT.wall || pr.x < 0 || pr.x > sec.w;
        const hitY = matAt(sec.substrate, oldX, pr.y) === MAT.wall || pr.y < 0 || pr.y > sec.h;
        if (hitX || !hitY) pr.vx = -pr.vx;
        if (hitY || !hitX) pr.vy = -pr.vy;
        pr.x = oldX;
        pr.y = oldY;
        addBurst(run, pr.x, pr.y, CARDS[pr.card].color, 3);
      } else {
        if (pr.cargoCard !== null) {
          releaseCargo(run, oldX, oldY, heading, pr.cargoCard, pr.cargoMods, pr.dmgBonus);
        }
        addBurst(run, oldX, oldY, CARDS[pr.card].color, 5);
        sec.projectiles.splice(i, 1);
      }
      continue;
    }

    // Canister hit — light the fuse.
    for (const can of sec.canisters) {
      if (can.fuse < 0 && dist(can.x, can.y, pr.x, pr.y) < can.r + pr.r) {
        can.fuse = config.canister.fuse;
      }
    }

    // Hazard hits.
    let consumed = false;
    for (let h = sec.hazards.length - 1; h >= 0; h--) {
      const hzd = sec.hazards[h];
      if (pr.hitIds.includes(hzd.id)) continue;
      if (dist(hzd.x, hzd.y, pr.x, pr.y) >= hzd.r + pr.r) continue;
      pr.hitIds.push(hzd.id);
      damageHazard(run, sec, h, pr.dmg);
      addBurst(run, pr.x, pr.y, CARDS[pr.card].color, 5);
      if (!pr.pierce) {
        if (pr.cargoCard !== null) {
          releaseCargo(run, pr.x, pr.y, heading, pr.cargoCard, pr.cargoMods, pr.dmgBonus);
        }
        sec.projectiles.splice(i, 1);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    // The Warden and its shield nodes.
    if (sec.warden && hitWarden(run, sec, pr)) {
      if (pr.cargoCard !== null) {
        releaseCargo(run, pr.x, pr.y, heading, pr.cargoCard, pr.cargoMods, pr.dmgBonus);
      }
      sec.projectiles.splice(i, 1);
    }
  }
}

/** Apply card damage to a hazard. */
function damageHazard(run: RunState, sec: SectorState, index: number, dmg: number): void {
  const hzd = sec.hazards[index];
  hzd.hp -= dmg;
  if (hzd.hp <= 0) destroyHazard(run, sec, index);
}

/** Remove a hazard: credit the kill, burst, and drop flux where it died. */
function destroyHazard(run: RunState, sec: SectorState, index: number): void {
  const hzd = sec.hazards[index];
  run.kills += 1;
  const color = hazardColor(hzd);
  addBurst(run, hzd.x, hzd.y, color, 14);
  if (hzd.elite) {
    addBurst(run, hzd.x, hzd.y, config.colors.shard, 16);
    pushToast(run, pickLine(LINES.eliteDown, run.kills));
  }
  // OVERCLOCKED AGENTS house rule: hazard pay. Elites carry a bounty.
  const bonus = (sec.anomaly === "overclock" ? 1 : 0) + (hzd.elite ? config.elite.extraDrops : 0);
  const drops = config.caster.killDrop + bonus + (hzd.kind === "sweeper" || hzd.kind === "pulsar" ? 1 : 0);
  for (let d = 0; d < drops; d++) {
    sec.motes.push({ x: hzd.x + (d - drops / 2) * 10, y: hzd.y + ((d * 7) % 13) - 6 });
  }
  sec.hazards.splice(index, 1);
  if (!run.saidFirstKill) {
    run.saidFirstKill = true;
    pushToast(run, pickLine(LINES.firstKill, run.seed + 1));
  } else if (run.kills % 10 === 0) {
    pushToast(run, pickLine(LINES.killStreak, run.kills));
  }
}

function hazardColor(hzd: Hazard): string {
  switch (hzd.kind) {
    case "drifter": return config.colors.drifter;
    case "seeker": return config.colors.seeker;
    case "sweeper": return config.colors.sweeper;
    case "pulsar": return config.colors.pulsar;
  }
}

// --- hazards ---------------------------------------------------------------

function updateHazards(run: RunState, sec: SectorState, dt: number): void {
  const hz = config.hazards;
  const p = run.player;

  for (const hzd of sec.hazards) {
    // OVERCLOCKED AGENTS house rule × Sim Depth.
    const spd = (sec.anomaly === "overclock" ? 1.25 : 1) * (1 + config.depth.speedPerLevel * run.depth);
    switch (hzd.kind) {
      case "drifter": {
        hzd.x += hzd.vx * spd * dt;
        hzd.y += hzd.vy * spd * dt;
        bounceOffTerrain(sec, hzd);
        break;
      }
      case "seeker": {
        const dx = p.x - hzd.x;
        const dy = p.y - hzd.y;
        const d = Math.hypot(dx, dy) || 1;
        const desX = (dx / d) * hz.seeker.maxSpeed;
        const desY = (dy / d) * hz.seeker.maxSpeed;
        const eliteMult = hzd.elite ? config.elite.speedMult : 1;
        const ddx = desX * eliteMult - hzd.vx;
        const ddy = desY * eliteMult - hzd.vy;
        const dl = Math.hypot(ddx, ddy);
        if (dl > 0.001) {
          const f = Math.min(1, (hz.seeker.steer * eliteMult * dt) / dl);
          hzd.vx += ddx * f;
          hzd.vy += ddy * f;
        }
        hzd.x += hzd.vx * spd * dt;
        hzd.y += hzd.vy * spd * dt;
        // Seekers slide along walls (emergent: walls work as cover).
        const hit = resolveCircleSubstrate(sec.substrate, hzd.x, hzd.y, hzd.r);
        if (hit) {
          hzd.x = hit.x;
          hzd.y = hit.y;
          const vn = hzd.vx * hit.nx + hzd.vy * hit.ny;
          if (vn < 0) {
            hzd.vx -= hit.nx * vn;
            hzd.vy -= hit.ny * vn;
          }
        }
        hzd.x = clamp(hzd.x, hzd.r, sec.w - hzd.r);
        hzd.y = clamp(hzd.y, hzd.r, sec.h - hzd.r);
        break;
      }
      case "sweeper": {
        hzd.phase += hzd.rate * dt;
        const t = (Math.sin(hzd.phase) + 1) / 2;
        hzd.x = hzd.ax + (hzd.bx - hzd.ax) * t;
        hzd.y = hzd.ay + (hzd.by - hzd.ay) * t;
        break;
      }
      case "pulsar": {
        hzd.timer -= dt;
        if (hzd.timer <= 0) {
          hzd.timer += hz.pulsar.cycle;
          sec.rings.push({ x: hzd.x, y: hzd.y, age: 0 });
        }
        break;
      }
    }
  }

  const rc = config.hazards.pulsar;
  for (let i = sec.rings.length - 1; i >= 0; i--) {
    const ring = sec.rings[i];
    ring.age += dt;
    if (ring.age >= rc.ringDuration) sec.rings.splice(i, 1);
  }
}

/** Drifter-style terrain response: reflect off wall cells and arena bounds. */
function bounceOffTerrain(
  sec: SectorState,
  hzd: { x: number; y: number; vx: number; vy: number; r: number },
): void {
  const hit = resolveCircleSubstrate(sec.substrate, hzd.x, hzd.y, hzd.r);
  if (hit) {
    hzd.x = hit.x;
    hzd.y = hit.y;
    if (hit.nx > 0) hzd.vx = Math.abs(hzd.vx);
    else if (hit.nx < 0) hzd.vx = -Math.abs(hzd.vx);
    if (hit.ny > 0) hzd.vy = Math.abs(hzd.vy);
    else if (hit.ny < 0) hzd.vy = -Math.abs(hzd.vy);
  }
  if (hzd.x < hzd.r) { hzd.x = hzd.r; hzd.vx = Math.abs(hzd.vx); }
  if (hzd.x > sec.w - hzd.r) { hzd.x = sec.w - hzd.r; hzd.vx = -Math.abs(hzd.vx); }
  if (hzd.y < hzd.r) { hzd.y = hzd.r; hzd.vy = Math.abs(hzd.vy); }
  if (hzd.y > sec.h - hzd.r) { hzd.y = sec.h - hzd.r; hzd.vy = -Math.abs(hzd.vy); }
}

// --- canisters -------------------------------------------------------------

function updateCanisters(state: GameState, run: RunState, sec: SectorState, dt: number): void {
  const p = run.player;
  const cfg = config.canister;
  for (let i = sec.canisters.length - 1; i >= 0; i--) {
    const can = sec.canisters[i];
    if (can.fuse < 0) {
      // Armed: a dashing (invulnerable) player triggers it deliberately;
      // projectiles trigger it in updateProjectiles.
      const dashTouch = p.dashTimer > 0 && dist(p.x, p.y, can.x, can.y) < can.r + config.player.radius;
      if (dashTouch) can.fuse = cfg.fuse;
      continue;
    }
    can.fuse -= dt;
    if (can.fuse > 0) continue;

    sec.canisters.splice(i, 1);
    // FRAGILE WALLS house rule: bigger craters.
    const carve = sec.anomaly === "fragile" ? cfg.carveRadius * 1.4 : cfg.carveRadius;
    detonate(sec.substrate, can.x, can.y, carve);
    run.shake = 1.6;
    addBurst(run, can.x, can.y, config.colors.canister, 26);
    addBurst(run, can.x, can.y, config.colors.blast, 18);

    // Chain other canisters with a short stagger.
    for (const other of sec.canisters) {
      if (other.fuse < 0 && dist(other.x, other.y, can.x, can.y) < cfg.damageRadius + 20) {
        other.fuse = cfg.chainFuse;
      }
    }
    // Damage everything in the blast.
    for (let h = sec.hazards.length - 1; h >= 0; h--) {
      const hzd = sec.hazards[h];
      if (dist(hzd.x, hzd.y, can.x, can.y) < cfg.damageRadius + hzd.r) {
        destroyHazard(run, sec, h);
      }
    }
    const pd = dist(p.x, p.y, can.x, can.y);
    if (pd < cfg.damageRadius + config.player.radius && !run.stats.demolition) {
      if (p.iframes <= 0 && p.dashTimer <= 0) {
        damagePlayer(state, run, (p.x - can.x) / (pd || 1), (p.y - can.y) / (pd || 1));
        if (state.phase !== "playing") return;
      }
    }
  }
}

/** Escalating pressure: periodically spawn an extra drifter at an arena edge. */
function updateHeat(run: RunState, sec: SectorState, interval: number, cap: number, dt: number): void {
  sec.heatTimer -= dt;
  if (sec.heatTimer > 0) return;
  sec.heatTimer += interval;
  if (sec.heatSpawned >= cap) return;
  if (spawnEdgeDrifter(run, sec)) sec.heatSpawned += 1;
}

/** Spawn a drifter at an arena edge, away from the player. Also the sim's
 * corrective measure for idle subjects. Returns false if no spot was found. */
function spawnEdgeDrifter(run: RunState, sec: SectorState): boolean {
  const rng = run.rng;
  const hz = config.hazards.drifter;
  for (let attempt = 0; attempt < 8; attempt++) {
    const side = rangeInt(rng, 0, 3);
    let x = 0;
    let y = 0;
    if (side === 0) { x = range(rng, 40, sec.w - 40); y = 26; }
    else if (side === 1) { x = range(rng, 40, sec.w - 40); y = sec.h - 26; }
    else if (side === 2) { x = 26; y = range(rng, 40, sec.h - 40); }
    else { x = sec.w - 26; y = range(rng, 40, sec.h - 40); }
    if (dist(x, y, run.player.x, run.player.y) < 220) continue; // never spawn onto the player

    const tx = sec.w * range(rng, 0.3, 0.7);
    const ty = sec.h * range(rng, 0.3, 0.7);
    const d = dist(x, y, tx, ty) || 1;
    const speed = range(rng, hz.speedMin, hz.speedMax);
    const drifter: Hazard = {
      kind: "drifter",
      id: sec.nextId++,
      hp: hz.hp,
      elite: false,
      x,
      y,
      vx: ((tx - x) / d) * speed,
      vy: ((ty - y) / d) * speed,
      r: range(rng, hz.rMin, hz.rMax),
    };
    // Heat spawns roll for elite; Sim Depth raises the odds.
    const eliteChance = config.elite.heatChance + config.depth.eliteChancePerLevel * run.depth;
    if (nextFloat(rng) < eliteChance) makeElite(drifter);
    sec.hazards.push(drifter);
    addBurst(run, x, y, config.colors.drifter, 8);
    return true;
  }
  return false;
}

// --- damage & pickups ------------------------------------------------------

function checkPlayerDamage(state: GameState, run: RunState): void {
  const p = run.player;
  if (p.dashTimer > 0 || p.iframes > 0) return; // dashing grants i-frames

  const pr = config.player.radius;
  const sec = run.sector;
  const band = config.graze.band;
  let nearMiss = false;

  for (const hzd of sec.hazards) {
    const d = dist(hzd.x, hzd.y, p.x, p.y);
    if (d < hzd.r + pr) {
      damagePlayer(state, run, (p.x - hzd.x) / (d || 1), (p.y - hzd.y) / (d || 1));
      return;
    }
    if (d < hzd.r + pr + band) nearMiss = true;
  }

  const rc = config.hazards.pulsar;
  for (const ring of sec.rings) {
    const ringR = rc.ringMaxR * (ring.age / rc.ringDuration);
    const d = dist(ring.x, ring.y, p.x, p.y);
    const gap = Math.abs(d - ringR);
    if (gap < rc.ringBand + pr * 0.5) {
      damagePlayer(state, run, (p.x - ring.x) / (d || 1), (p.y - ring.y) / (d || 1));
      return;
    }
    if (gap < rc.ringBand + pr * 0.5 + band) nearMiss = true;
  }

  // Graze: shaved past danger without touching it. Risk pays the dash bill.
  if (nearMiss && run.grazeCooldown <= 0) {
    run.grazeCooldown = config.graze.cooldown;
    run.grazeTimeout = config.graze.streakTimeout;
    run.grazeStreak += 1;
    run.grazeFlash = 0.5;
    if (p.charges < run.stats.dashCharges) {
      p.recharge = Math.max(0, p.recharge - config.graze.rechargeBonus);
    }
    addBurst(run, p.x, p.y, config.colors.playerCore, 3);
    if (run.grazeStreak === 5 || run.grazeStreak === 12) {
      pushToast(run, pickLine(LINES.grazeStreak, run.grazeStreak + Math.floor(run.time)));
    }
  }
}

function damagePlayer(state: GameState, run: RunState, nx: number, ny: number): void {
  run.integrity -= 1;
  run.tookHitThisSector = true;
  run.grazeStreak = 0;
  const p = run.player;
  p.iframes = config.player.hitIframes * run.stats.iframeMult;
  p.dashTimer = 0;
  p.vx = nx * config.player.hitKnockback;
  p.vy = ny * config.player.hitKnockback;
  run.shake = 1;
  addBurst(run, p.x, p.y, config.colors.drifter, 18);
  if (run.integrity === 1) pushToast(run, pickLine(LINES.lowIntegrity, Math.floor(run.time)));

  if (run.integrity <= 0) {
    const banked = bank(state, run, false);
    state.outcome = { won: false, banked, sectorReached: run.sectorIndex + 1, time: run.time, kills: run.kills };
    state.phase = "gameover";
    addBurst(run, p.x, p.y, config.colors.player, 40);
  }
}

/**
 * A found frame becomes a second caster; with both hands full it replaces the
 * HOLSTERED caster, returning that deck's cards to the inventory.
 */
function pickUpFrame(run: RunState, frame: FrameId): void {
  if (run.casters.length < MAX_CASTERS) {
    run.casters.push(createCaster(frame));
    return;
  }
  const idx = 1 - run.activeCaster;
  for (const card of run.casters[idx].slots) {
    if (card !== null) run.inventory.push(card);
  }
  run.casters[idx] = createCaster(frame);
}

function collectPickups(state: GameState, run: RunState): void {
  const p = run.player;
  const sec = run.sector;
  const s = run.stats;

  for (let i = sec.motes.length - 1; i >= 0; i--) {
    const m = sec.motes[i];
    if (dist(m.x, m.y, p.x, p.y) < s.pickupRadius) {
      sec.motes.splice(i, 1);
      run.flux += config.flux.mote;
      addBurst(run, m.x, m.y, config.colors.mote, 4);
    }
  }

  for (let i = sec.cardNodes.length - 1; i >= 0; i--) {
    const node = sec.cardNodes[i];
    if (dist(node.x, node.y, p.x, p.y) < s.pickupRadius + 4) {
      sec.cardNodes.splice(i, 1);
      run.inventory.push(node.card);
      addBurst(run, node.x, node.y, CARDS[node.card].color, 16);
    }
  }

  for (let i = sec.frameNodes.length - 1; i >= 0; i--) {
    const node = sec.frameNodes[i];
    if (dist(node.x, node.y, p.x, p.y) < s.pickupRadius + 6) {
      sec.frameNodes.splice(i, 1);
      pickUpFrame(run, node.frame);
      addBurst(run, node.x, node.y, FRAMES[node.frame].color, 20);
      pushToast(run, pickLine(LINES.framePickup, Math.floor(run.time * 3)));
    }
  }

  // Blood shrines: pay 1 integrity, take a strong card. Refused at 1 hull.
  for (let i = sec.shrines.length - 1; i >= 0; i--) {
    const shrine = sec.shrines[i];
    if (dist(shrine.x, shrine.y, p.x, p.y) < s.pickupRadius + 8 && run.integrity > 1) {
      sec.shrines.splice(i, 1);
      run.integrity -= 1;
      run.inventory.push(shrine.card);
      run.shake = 0.8;
      addBurst(run, shrine.x, shrine.y, config.colors.drifter, 20);
      addBurst(run, shrine.x, shrine.y, CARDS[shrine.card].color, 12);
      pushToast(run, pickLine(LINES.shrine, Math.floor(run.time * 5)));
    }
  }

  for (let i = sec.shards.length - 1; i >= 0; i--) {
    const sh = sec.shards[i];
    if (dist(sh.x, sh.y, p.x, p.y) < s.pickupRadius + 6) {
      sec.shards.splice(i, 1);
      addBurst(run, sh.x, sh.y, config.colors.shard, 12);
      if (sec.shards.length === 0) {
        // Terminus: the last shard summons the Warden — the gate stays shut
        // until its guardian is destroyed.
        if (sec.index === config.sectors.length - 1) {
          summonWarden(run, sec);
        } else {
          sec.gate.open = true;
          addBurst(run, sec.gate.x, sec.gate.y, config.colors.gateOpen, 24);
        }
      }
    }
  }

  const g = sec.gate;
  if (g.open && dist(g.x, g.y, p.x, p.y) < g.r + config.player.radius) {
    clearSector(state, run);
  }
}

// --- the Warden ------------------------------------------------------------
// Sector 5's gate guardian: shield nodes must fall before its hull takes
// damage (Pierce and Ricochet earn their keep here). Three phases by hp:
// radial bursts → adds charge dashes → adds summons and faster bursts.

function summonWarden(run: RunState, sec: SectorState): void {
  const cfg = config.warden;
  const x = clamp(sec.gate.x - 260, 200, sec.w - 200);
  const y = clamp(sec.gate.y, 200, sec.h - 200);
  detonate(sec.substrate, x, y, 130); // its arrival carves its own arena
  const nodes: { offset: number; hp: number }[] = [];
  for (let i = 0; i < cfg.nodeCount; i++) {
    nodes.push({ offset: (i / cfg.nodeCount) * Math.PI * 2, hp: cfg.nodeHp });
  }
  sec.warden = {
    x, y, hp: cfg.hp, maxHp: cfg.hp,
    angle: 0, burstTimer: cfg.burstEvery, summonTimer: cfg.summonEvery,
    chargeCooldown: cfg.chargeCooldown, charge: null, nodeAngle: 0, nodes,
  };
  run.shake = 2;
  addBurst(run, x, y, config.colors.pulsar, 30);
  pushToast(run, pickLine(LINES.wardenIntro, run.seed));
}

function wardenPhase(wd: { hp: number; maxHp: number }): number {
  if (wd.hp > wd.maxHp * (2 / 3)) return 1;
  if (wd.hp > wd.maxHp * (1 / 3)) return 2;
  return 3;
}

function updateWarden(state: GameState, run: RunState, sec: SectorState, dt: number): void {
  const wd = sec.warden;
  if (!wd) return;
  const cfg = config.warden;
  const p = run.player;
  const phase = wardenPhase(wd);

  wd.nodeAngle += cfg.nodeOrbitSpeed * dt;

  // Movement: drift around the arena's far half — unless charging.
  if (wd.charge) {
    const ch = wd.charge;
    if (ch.telegraph > 0) {
      ch.telegraph -= dt;
    } else {
      ch.t += dt;
      wd.x += ch.dx * cfg.chargeSpeed * dt;
      wd.y += ch.dy * cfg.chargeSpeed * dt;
      addParticle(run, wd.x, wd.y, -ch.dx * 60, -ch.dy * 60, 0.3, 5, config.colors.pulsar);
      if (ch.t >= cfg.chargeDuration) {
        wd.charge = null;
        wd.chargeCooldown = cfg.chargeCooldown;
      }
    }
  } else {
    wd.angle += cfg.orbitSpeed * dt;
    const tx = sec.w * 0.72 + Math.cos(wd.angle) * 150;
    const ty = sec.h / 2 + Math.sin(wd.angle) * 200;
    const d = dist(wd.x, wd.y, tx, ty) || 1;
    const speed = Math.min(120, d);
    wd.x += ((tx - wd.x) / d) * speed * dt;
    wd.y += ((ty - wd.y) / d) * speed * dt;

    // Phase 2+: charge at the player after a telegraph.
    wd.chargeCooldown -= dt;
    if (phase >= 2 && wd.chargeCooldown <= 0) {
      const cd = dist(wd.x, wd.y, p.x, p.y) || 1;
      wd.charge = { dx: (p.x - wd.x) / cd, dy: (p.y - wd.y) / cd, t: 0, telegraph: cfg.chargeTelegraph };
    }
  }
  wd.x = clamp(wd.x, 60, sec.w - 60);
  wd.y = clamp(wd.y, 60, sec.h - 60);

  // Radial bursts (faster and denser in phase 3).
  wd.burstTimer -= dt;
  if (wd.burstTimer <= 0) {
    wd.burstTimer = phase === 3 ? cfg.burstEvery * 0.6 : cfg.burstEvery;
    const shots = phase === 3 ? 12 : cfg.burstShots;
    for (let i = 0; i < shots; i++) {
      const a = (i / shots) * Math.PI * 2 + wd.nodeAngle;
      sec.enemyShots.push({
        x: wd.x, y: wd.y,
        vx: Math.cos(a) * cfg.shotSpeed, vy: Math.sin(a) * cfg.shotSpeed,
        life: cfg.shotLife,
      });
    }
    addBurst(run, wd.x, wd.y, config.colors.pulsar, 8);
  }

  // Phase 3: summon reinforcements.
  if (phase === 3) {
    wd.summonTimer -= dt;
    if (wd.summonTimer <= 0) {
      wd.summonTimer = cfg.summonEvery;
      spawnEdgeDrifter(run, sec);
    }
  }

  // Contact damage: body and nodes alike.
  if (p.dashTimer <= 0 && p.iframes <= 0) {
    const pr = config.player.radius;
    if (dist(wd.x, wd.y, p.x, p.y) < cfg.contactR + pr) {
      damagePlayer(state, run, (p.x - wd.x) / (dist(wd.x, wd.y, p.x, p.y) || 1), (p.y - wd.y) / (dist(wd.x, wd.y, p.x, p.y) || 1));
      return;
    }
    for (const node of wd.nodes) {
      const nx = wd.x + Math.cos(wd.nodeAngle + node.offset) * cfg.nodeOrbitR;
      const ny = wd.y + Math.sin(wd.nodeAngle + node.offset) * cfg.nodeOrbitR;
      const nd = dist(nx, ny, p.x, p.y);
      if (nd < cfg.nodeR + pr) {
        damagePlayer(state, run, (p.x - nx) / (nd || 1), (p.y - ny) / (nd || 1));
        return;
      }
    }
  }
}

/** Player projectile vs the Warden. Returns true if the shot was consumed. */
function hitWarden(run: RunState, sec: SectorState, pr: { x: number; y: number; r: number; dmg: number; pierce: boolean }): boolean {
  const wd = sec.warden;
  if (!wd) return false;
  const cfg = config.warden;

  for (let n = wd.nodes.length - 1; n >= 0; n--) {
    const node = wd.nodes[n];
    const nx = wd.x + Math.cos(wd.nodeAngle + node.offset) * cfg.nodeOrbitR;
    const ny = wd.y + Math.sin(wd.nodeAngle + node.offset) * cfg.nodeOrbitR;
    if (dist(nx, ny, pr.x, pr.y) < cfg.nodeR + pr.r) {
      node.hp -= pr.dmg;
      addBurst(run, nx, ny, config.colors.sweeper, 6);
      if (node.hp <= 0) {
        wd.nodes.splice(n, 1);
        addBurst(run, nx, ny, config.colors.sweeper, 14);
      }
      return !pr.pierce;
    }
  }

  if (wd.nodes.length === 0 && dist(wd.x, wd.y, pr.x, pr.y) < cfg.r + pr.r) {
    const before = wardenPhase(wd);
    wd.hp -= pr.dmg;
    addBurst(run, pr.x, pr.y, config.colors.pulsar, 8);
    if (wd.hp <= 0) {
      killWarden(run, sec);
      return true;
    }
    // Crossing a phase threshold re-shields it with fresh nodes.
    if (wardenPhase(wd) > before) {
      for (let i = 0; i < 2; i++) {
        wd.nodes.push({ offset: (i / 2) * Math.PI * 2, hp: config.warden.nodeHp });
      }
      run.shake = 1.2;
      addBurst(run, wd.x, wd.y, config.colors.sweeper, 20);
    }
    return !pr.pierce;
  }
  return false;
}

function killWarden(run: RunState, sec: SectorState): void {
  const wd = sec.warden;
  if (!wd) return;
  sec.warden = null;
  run.kills += 5;
  detonate(sec.substrate, wd.x, wd.y, 90);
  run.shake = 2;
  addBurst(run, wd.x, wd.y, config.colors.pulsar, 40);
  addBurst(run, wd.x, wd.y, config.colors.blast, 24);
  for (let i = 0; i < 12; i++) {
    sec.motes.push({ x: wd.x + ((i * 41) % 90) - 45, y: wd.y + ((i * 29) % 70) - 35 });
  }
  sec.gate.open = true;
  addBurst(run, sec.gate.x, sec.gate.y, config.colors.gateOpen, 24);
  pushToast(run, pickLine(LINES.wardenDown, run.kills));
}

function updateEnemyShots(state: GameState, run: RunState, sec: SectorState, dt: number): void {
  const p = run.player;
  const pr = config.player.radius;
  for (let i = sec.enemyShots.length - 1; i >= 0; i--) {
    const shot = sec.enemyShots[i];
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (shot.life <= 0 || matAt(sec.substrate, shot.x, shot.y) === MAT.wall) {
      sec.enemyShots.splice(i, 1);
      continue;
    }
    if (p.dashTimer <= 0 && p.iframes <= 0 && dist(shot.x, shot.y, p.x, p.y) < 5 + pr) {
      sec.enemyShots.splice(i, 1);
      damagePlayer(state, run, (p.x - shot.x) / (dist(shot.x, shot.y, p.x, p.y) || 1), (p.y - shot.y) / (dist(shot.x, shot.y, p.x, p.y) || 1));
      if (state.phase !== "playing") return;
    }
  }
}

// --- particles (cosmetic state; deterministic, never drains run.rng) -------

function addParticle(
  run: RunState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
  size: number,
  color: string,
): void {
  if (run.particles.length > config.particleCap) run.particles.shift();
  run.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
}

function addBurst(run: RunState, x: number, y: number, color: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5;
    const sp = 60 + ((i * 37) % 90);
    addParticle(run, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.35 + (i % 5) * 0.06, 2 + (i % 3), color);
  }
}

/** Advance purely cosmetic bits (particles, shake, toasts). Safe in any phase. */
function tickCosmetics(run: RunState, dt: number): void {
  run.shake = Math.max(0, run.shake - 3 * dt);
  for (let i = run.toasts.length - 1; i >= 0; i--) {
    run.toasts[i].age += dt;
    if (run.toasts[i].age > config.announcer.toastLife) run.toasts.splice(i, 1);
  }
  for (let i = run.particles.length - 1; i >= 0; i--) {
    const pt = run.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      run.particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    const damp = Math.exp(-3.5 * dt);
    pt.vx *= damp;
    pt.vy *= damp;
  }
}
