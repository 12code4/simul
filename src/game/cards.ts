// The card/deck system — Noita's wand architecture, adapted. A Caster is a
// deck: an ordered row of card slots plus a Frame that sets its casting
// personality (slot count, cadence, quirks). Each trigger pull walks the deck
// from a pointer, folding modifier cards into the next payload/utility card,
// then casts it. Trigger payloads carry the NEXT card as cargo and cast it on
// impact (or mid-flight). When the pointer wraps, the caster recharges.
// Cards and frames are pure data; casting logic lives in update.ts.

export type CardId =
  | "bolt"
  | "burst"
  | "slug"
  | "dart"
  | "sparktrigger"
  | "timertrigger"
  | "twin"
  | "haste"
  | "bounce"
  | "pierce"
  | "heavy"
  | "multi"
  | "blink";

export type CardKind = "payload" | "modifier" | "utility";

export interface CardDef {
  id: CardId;
  name: string;
  /** 1–2 char monogram drawn on the card face. */
  glyph: string;
  color: string;
  kind: CardKind;
  desc: string;
  /** Payload fields. */
  dmg: number;
  speed: number;
  /** Projectile lifetime in seconds (range = speed * life). */
  life: number;
  /** Pellets per shot (before modifiers). */
  pellets: number;
  /** Half-spread in radians applied across pellets. */
  spread: number;
  /** Steers toward the nearest agent in flight. */
  homing: boolean;
  /** Trigger payloads carry the next deck card and cast it. */
  trigger: "impact" | "timer" | null;
  /** For timer triggers: seconds of flight before the cargo casts. */
  triggerTime: number;
  /** Added to the caster's base cast delay when this card is the payload. */
  delayAdd: number;
}

function card(partial: Partial<CardDef> & Pick<CardDef, "id" | "name" | "glyph" | "color" | "kind" | "desc">): CardDef {
  return {
    dmg: 0,
    speed: 0,
    life: 0,
    pellets: 1,
    spread: 0,
    homing: false,
    trigger: null,
    triggerTime: 0,
    delayAdd: 0,
    ...partial,
  };
}

export const CARDS: Record<CardId, CardDef> = {
  bolt: card({
    id: "bolt", name: "Bolt", glyph: "B", color: "#dff4ff", kind: "payload",
    desc: "A fast, reliable shot", dmg: 1, speed: 560, life: 0.9,
  }),
  burst: card({
    id: "burst", name: "Burst", glyph: "3x", color: "#dff4ff", kind: "payload",
    desc: "Three pellets, short range", dmg: 1, speed: 500, life: 0.38,
    pellets: 3, spread: 0.16, delayAdd: 0.12,
  }),
  slug: card({
    id: "slug", name: "Slug", glyph: "S", color: "#ffd75b", kind: "payload",
    desc: "Slow, hits like a wall", dmg: 3, speed: 380, life: 1.0, delayAdd: 0.22,
  }),
  dart: card({
    id: "dart", name: "Seeker Dart", glyph: "D", color: "#5bffb0", kind: "payload",
    desc: "Curves toward the nearest agent", dmg: 1, speed: 460, life: 1.1,
    homing: true, delayAdd: 0.1,
  }),
  sparktrigger: card({
    id: "sparktrigger", name: "Spark Trigger", glyph: "T!", color: "#ff9ddd", kind: "payload",
    desc: "Casts the next card where it lands", dmg: 1, speed: 500, life: 0.9,
    trigger: "impact", delayAdd: 0.08,
  }),
  timertrigger: card({
    id: "timertrigger", name: "Timer Trigger", glyph: "T·", color: "#ff9ddd", kind: "payload",
    desc: "Casts the next card mid-flight", dmg: 1, speed: 440, life: 1.2,
    trigger: "timer", triggerTime: 0.35, delayAdd: 0.08,
  }),
  twin: card({
    id: "twin", name: "Twin Cast", glyph: "x2", color: "#c05bff", kind: "modifier",
    desc: "Next card casts twice",
  }),
  haste: card({
    id: "haste", name: "Haste", glyph: ">>", color: "#c05bff", kind: "modifier",
    desc: "Next shot flies 60% faster",
  }),
  bounce: card({
    id: "bounce", name: "Ricochet", glyph: "R", color: "#c05bff", kind: "modifier",
    desc: "Next shot bounces off walls",
  }),
  pierce: card({
    id: "pierce", name: "Pierce", glyph: "P", color: "#c05bff", kind: "modifier",
    desc: "Next shot passes through agents",
  }),
  heavy: card({
    id: "heavy", name: "Heavy Round", glyph: "+1", color: "#c05bff", kind: "modifier",
    desc: "Next shot +1 damage, slower",
  }),
  multi: card({
    id: "multi", name: "Multicast", glyph: "MC", color: "#c05bff", kind: "modifier",
    desc: "Cast the next 2 cards at once",
  }),
  blink: card({
    id: "blink", name: "Blink", glyph: "→", color: "#5bd1ff", kind: "utility",
    desc: "Short teleport toward your aim", delayAdd: 0.15,
  }),
};

/** All card ids, for weighted generation picks. */
export const CARD_IDS = Object.keys(CARDS) as CardId[];

// --- Caster Frames ----------------------------------------------------------
// A frame is the caster's body: slot count, cadence, and a personality quirk.
// Frames are found in the world; the player carries up to two casters and
// swaps with Q. Modeled on Noita's wand stats (incl. shuffle wands).

export type FrameId = "standard" | "lattice" | "snubnose" | "shuffler";

export interface FrameDef {
  id: FrameId;
  name: string;
  desc: string;
  color: string;
  slots: number;
  castDelay: number;
  rechargeTime: number;
  /** Added to every payload's damage cast from this frame. */
  dmgBonus: number;
  /** Casts the deck in a random (seeded) order, reshuffled on each recharge. */
  shuffle: boolean;
}

export const FRAMES: Record<FrameId, FrameDef> = {
  standard: {
    id: "standard", name: "Standard Frame", desc: "The reliable baseline",
    color: "#8b93a7", slots: 5, castDelay: 0.26, rechargeTime: 0.9, dmgBonus: 0, shuffle: false,
  },
  lattice: {
    id: "lattice", name: "Lattice Frame", desc: "7 slots, ponderous recharge",
    color: "#5bd1ff", slots: 7, castDelay: 0.3, rechargeTime: 1.4, dmgBonus: 0, shuffle: false,
  },
  snubnose: {
    id: "snubnose", name: "Snubnose Frame", desc: "3 slots, quick, +1 damage",
    color: "#ffd75b", slots: 3, castDelay: 0.18, rechargeTime: 0.7, dmgBonus: 1, shuffle: false,
  },
  shuffler: {
    id: "shuffler", name: "Shuffler Frame", desc: "Random cast order, very fast",
    color: "#ff9ddd", slots: 5, castDelay: 0.16, rechargeTime: 0.55, dmgBonus: 0, shuffle: true,
  },
};

export const FOUND_FRAMES: readonly FrameId[] = ["lattice", "snubnose", "shuffler"];

/** The player's deck. Slots may be empty (null). Serializable plain object. */
export interface Caster {
  frame: FrameId;
  slots: (CardId | null)[];
  /** Slot-index walk order; identity unless the frame shuffles. */
  order: number[];
  /** Position within `order` the next deck walk starts from. */
  pointer: number;
  /** Time until the next cast is allowed. */
  castTimer: number;
  /** True while the timer running is the full recharge (for the HUD). */
  recharging: boolean;
}

export function createCaster(frame: FrameId): Caster {
  const n = FRAMES[frame].slots;
  return {
    frame,
    slots: new Array<CardId | null>(n).fill(null),
    order: identityOrder(n),
    pointer: 0,
    castTimer: 0,
    recharging: false,
  };
}

export function identityOrder(n: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  return order;
}

export function createStarterCaster(): Caster {
  const c = createCaster("standard");
  c.slots[0] = "bolt";
  return c;
}

/** Accumulated modifier effects folded into a single cast. */
export interface CastMods {
  count: number;
  speedMult: number;
  bounces: number;
  pierce: boolean;
  dmgAdd: number;
  /** Extra simultaneous payloads granted by Multicast. */
  extra: number;
}

export function emptyCastMods(): CastMods {
  return { count: 1, speedMult: 1, bounces: 0, pierce: false, dmgAdd: 0, extra: 0 };
}

export function applyCastModifier(mods: CastMods, id: CardId): void {
  switch (id) {
    case "twin":
      mods.count = Math.min(4, mods.count * 2);
      break;
    case "haste":
      mods.speedMult *= 1.6;
      break;
    case "bounce":
      mods.bounces += 2;
      break;
    case "pierce":
      mods.pierce = true;
      break;
    case "heavy":
      mods.dmgAdd += 1;
      mods.speedMult *= 0.75;
      break;
    case "multi":
      mods.extra = Math.min(2, mods.extra + 1);
      break;
    default:
      break;
  }
}
