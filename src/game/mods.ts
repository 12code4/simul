// In-run modifications: after clearing a sector the player drafts one of
// three. All mods are movement/survival themed — this is a movement game.

import { config } from "./config";
import { shuffle, type Rng } from "./rng";
import type { RunState } from "./state";

export type ModId =
  | "coolant"
  | "twincap"
  | "longburn"
  | "overclock"
  | "plating"
  | "nanite"
  | "magnet"
  | "phase"
  | "damper"
  | "fireproof"
  | "hydrojets"
  | "slick"
  | "corrosive"
  | "demolition";

export interface ModDef {
  id: ModId;
  name: string;
  desc: string;
}

export const MODS: Record<ModId, ModDef> = {
  coolant: { id: "coolant", name: "Coolant Loop", desc: "Dash recharges 25% faster" },
  twincap: { id: "twincap", name: "Twin Capacitor", desc: "+1 dash charge" },
  longburn: { id: "longburn", name: "Long Burn", desc: "Dash travels 40% farther" },
  overclock: { id: "overclock", name: "Overclock", desc: "+12% thrust and top speed" },
  plating: { id: "plating", name: "Hull Plating", desc: "+1 max integrity, +1 now" },
  nanite: { id: "nanite", name: "Nanite Purge", desc: "Restore 2 integrity" },
  magnet: { id: "magnet", name: "Magnet Coil", desc: "60% wider pickup radius" },
  phase: { id: "phase", name: "Phase Skin", desc: "50% longer hit protection" },
  damper: { id: "damper", name: "Inertial Damper", desc: "Sharper handling" },
  fireproof: { id: "fireproof", name: "Fireproof Plating", desc: "Fire cannot ignite you" },
  hydrojets: { id: "hydrojets", name: "Hydro Jets", desc: "Coolant no longer slows you" },
  slick: { id: "slick", name: "Slick Coating", desc: "Oil no longer ruins handling" },
  corrosive: { id: "corrosive", name: "Corrosive Wake", desc: "Dashing leaves an acid trail" },
  demolition: { id: "demolition", name: "Demolition Sync", desc: "Explosions can't hurt you" },
};

/** Roll 3 distinct draft options, excluding mods that would be wasted. */
export function rollDraft(rng: Rng, run: RunState): ModId[] {
  const s = run.stats;
  const pool = (Object.keys(MODS) as ModId[]).filter((id) => {
    if (id === "twincap") return s.dashCharges < config.dash.chargeCap;
    if (id === "plating") return run.maxIntegrity < config.player.integrityCap;
    if (id === "nanite") return run.integrity < run.maxIntegrity;
    if (id === "fireproof") return !s.fireproof;
    if (id === "hydrojets") return !s.hydroJets;
    if (id === "slick") return !s.slickCoating;
    if (id === "corrosive") return !s.corrosiveWake;
    if (id === "demolition") return !s.demolition;
    return true;
  });
  return shuffle(rng, pool).slice(0, 3);
}

export function applyMod(run: RunState, id: ModId): void {
  const s = run.stats;
  switch (id) {
    case "coolant":
      s.dashRecharge *= 0.75;
      break;
    case "twincap":
      s.dashCharges += 1;
      run.player.charges += 1;
      break;
    case "longburn":
      s.dashDuration *= 1.4;
      break;
    case "overclock":
      s.maxSpeed *= 1.12;
      s.accel *= 1.12;
      break;
    case "plating":
      run.maxIntegrity += 1;
      run.integrity += 1;
      break;
    case "nanite":
      run.integrity = Math.min(run.maxIntegrity, run.integrity + 2);
      break;
    case "magnet":
      s.pickupRadius *= 1.6;
      break;
    case "phase":
      s.iframeMult *= 1.5;
      break;
    case "damper":
      s.accel *= 1.25;
      s.drag *= 1.35;
      break;
    case "fireproof":
      s.fireproof = true;
      break;
    case "hydrojets":
      s.hydroJets = true;
      break;
    case "slick":
      s.slickCoating = true;
      break;
    case "corrosive":
      s.corrosiveWake = true;
      break;
    case "demolition":
      s.demolition = true;
      break;
  }
  run.mods.push(id);
}
