// The simulation's personality, as data: announcer lines, sector anomalies
// ("house rules"), and contracts. Logic lives in update.ts; this stays
// declarative. Line picks use a time-hash, never the run RNG — flavor must
// not perturb generation.

export function pickLine(lines: readonly string[], salt: number): string {
  const x = Math.sin(salt * 127.1 + lines.length * 311.7) * 43758.5453;
  return lines[Math.floor((x - Math.floor(x)) * lines.length)];
}

export const LINES = {
  runStart: [
    "specimen deployed. try to be interesting.",
    "simulation online. do keep up.",
    "subject inserted. observation begins.",
  ],
  firstKill: [
    "agent terminated. noted, with mild surprise.",
    "first termination logged. the committee is watching.",
    "oh. it fights back.",
  ],
  killStreak: [
    "efficient. recalibrating expectations.",
    "aggression spike logged. impressive, statistically.",
    "the other agents have filed a complaint.",
  ],
  grazeStreak: [
    "near-miss chain detected. showing off, are we.",
    "margin analysis: reckless. effective, but reckless.",
    "your insurer has been notified.",
  ],
  idle: [
    "idle subject detected. deploying motivation.",
    "stillness noted. correcting.",
    "the simulation abhors a statue.",
  ],
  lowIntegrity: [
    "hull critical. statistically, this is the exciting part.",
    "one hit remains. make it a good story.",
  ],
  framePickup: [
    "unlicensed hardware acquired. we saw nothing.",
    "new frame registered. warranty void.",
  ],
  sectorClear: [
    "sector archived. proceeding to worse.",
    "objective met. enthusiasm noted and ignored.",
  ],
  contractMet: [
    "contract fulfilled. payment processed, reluctantly.",
    "terms satisfied. the auditors are stunned.",
  ],
  contractFailed: [
    "contract voided. we expected nothing and were still let down.",
    "terms breached. no payout. do read the fine print.",
  ],
  yoyoCatch: [
    "projectile retrieved. juggling is not in the test plan.",
    "clean catch. recorded under 'anomalous dexterity'.",
  ],
  shrine: [
    "blood accepted. the shrine says thank you. sort of.",
    "integrity exchanged for power. a classic mistake. enjoy.",
  ],
  shopPurchase: [
    "transaction logged. the waystation thanks you for your flux.",
    "purchase complete. no refunds. the sim is not a charity.",
  ],
  eliteDown: [
    "elite terminated. the committee is uncomfortable.",
    "gilded agent destroyed. someone paid extra for that.",
  ],
  wardenIntro: [
    "warden online. the exit disagrees with you.",
    "custodian deployed. do try to make it interesting.",
  ],
  wardenDown: [
    "warden decommissioned. the exit is yours. reluctantly.",
    "custodian archived. we'll bill you for it later.",
  ],
} as const;

// --- sector anomalies (house rules) ----------------------------------------

export type AnomalyId = "slick" | "overclock" | "ricochetfield" | "abundance" | "fragile";

export interface AnomalyDef {
  id: AnomalyId;
  name: string;
  desc: string;
  intro: string;
}

export const ANOMALIES: Record<AnomalyId, AnomalyDef> = {
  slick: {
    id: "slick", name: "SLICK FLOORS", desc: "friction reduced — drift, everyone",
    intro: "anomaly: floor polish over-applied. skate responsibly.",
  },
  overclock: {
    id: "overclock", name: "OVERCLOCKED AGENTS", desc: "agents faster; drops richer",
    intro: "anomaly: agents overclocked. hazard pay included.",
  },
  ricochetfield: {
    id: "ricochetfield", name: "RICOCHET FIELD", desc: "all your shots bounce once",
    intro: "anomaly: elastic geometry. mind your own bullets.",
  },
  abundance: {
    id: "abundance", name: "ABUNDANCE", desc: "more flux; pressure builds faster",
    intro: "anomaly: budget surplus detected. spend it fast.",
  },
  fragile: {
    id: "fragile", name: "FRAGILE WALLS", desc: "more canisters; bigger craters",
    intro: "anomaly: structural integrity waived. demolition encouraged.",
  },
};

export const ANOMALY_IDS = Object.keys(ANOMALIES) as AnomalyId[];

// --- contracts (optional wagers, picked between sectors) --------------------

export type ContractId = "spotless" | "swift" | "pacifist" | "greedy";

export interface ContractDef {
  id: ContractId;
  name: string;
  desc: string;
  bonus: number;
}

export const CONTRACTS: Record<ContractId, ContractDef> = {
  spotless: { id: "spotless", name: "SPOTLESS", desc: "take no damage next sector", bonus: 25 },
  swift: { id: "swift", name: "SWIFT", desc: "clear the next sector under 75s", bonus: 20 },
  pacifist: { id: "pacifist", name: "PACIFIST", desc: "destroy no agents next sector", bonus: 20 },
  greedy: { id: "greedy", name: "GREEDY", desc: "collect every flux mote", bonus: 15 },
};

export const CONTRACT_IDS = Object.keys(CONTRACTS) as ContractId[];
