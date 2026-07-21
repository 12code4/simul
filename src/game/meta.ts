// Persistent progression ("roguelite" meta layer): cores banked across runs,
// spent on permanent upgrade tracks. Saved to localStorage under a versioned
// key; loading is defensive so a corrupt/old save never crashes the game.

const SAVE_KEY = "simul.save.v1";

export interface MetaState {
  cores: number;
  // Upgrade track tiers, 0–3 each.
  hull: number;
  thrusters: number;
  capacitor: number;
  // Lifetime stats.
  runs: number;
  wins: number;
  bestSector: number;
  totalFlux: number;
}

export type TrackKey = "hull" | "thrusters" | "capacitor";

export interface MetaTrack {
  key: TrackKey;
  name: string;
  desc: string;
  costs: readonly number[];
}

export const META_TRACKS: readonly MetaTrack[] = [
  { key: "hull", name: "Reinforced Hull", desc: "+1 starting integrity per tier", costs: [30, 80, 150] },
  { key: "thrusters", name: "Tuned Thrusters", desc: "+6% thrust and top speed per tier", costs: [25, 60, 120] },
  { key: "capacitor", name: "Capacitor Bank", desc: "faster dash recharge; tier 2 adds a charge", costs: [40, 100, 180] },
];

export function defaultMeta(): MetaState {
  return { cores: 0, hull: 0, thrusters: 0, capacitor: 0, runs: 0, wins: 0, bestSector: 0, totalFlux: 0 };
}

function toInt(v: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(v)));
}

export function loadMeta(): MetaState {
  const d = defaultMeta();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      cores: toInt(p.cores, d.cores),
      hull: toInt(p.hull, d.hull, 3),
      thrusters: toInt(p.thrusters, d.thrusters, 3),
      capacitor: toInt(p.capacitor, d.capacitor, 3),
      runs: toInt(p.runs, d.runs),
      wins: toInt(p.wins, d.wins),
      bestSector: toInt(p.bestSector, d.bestSector, 5),
      totalFlux: toInt(p.totalFlux, d.totalFlux),
    };
  } catch {
    return d;
  }
}

export function saveMeta(meta: MetaState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
  } catch {
    // Storage unavailable (private mode, quota) — play on without persistence.
  }
}

/** Cost of the next tier for a track, or null if maxed. */
export function nextCost(meta: MetaState, track: MetaTrack): number | null {
  const tier = meta[track.key];
  return tier >= track.costs.length ? null : track.costs[tier];
}

export function buyUpgrade(meta: MetaState, track: MetaTrack): boolean {
  const cost = nextCost(meta, track);
  if (cost === null || meta.cores < cost) return false;
  meta.cores -= cost;
  meta[track.key] += 1;
  saveMeta(meta);
  return true;
}
