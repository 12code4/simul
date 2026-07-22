// The card/deck system — Noita's wand architecture, adapted. A Caster is a
// deck: an ordered row of card slots plus casting cadence. Each trigger pull
// walks the deck from a pointer, folding any modifier cards into the next
// payload/utility card, then casts it. When the pointer wraps, the caster
// recharges (a longer delay). Cards are pure data; casting logic lives in
// update.ts so this module stays declarative.

export type CardId =
  | "bolt"
  | "burst"
  | "firebolt"
  | "waterball"
  | "acidspit"
  | "oilslick"
  | "twin"
  | "haste"
  | "bounce"
  | "pierce"
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
  /** Material splashed on impact (see substrate splash rules), or null. */
  splash: "fire" | "coolant" | "acid" | "oil" | null;
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
    splash: null,
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
  firebolt: card({
    id: "firebolt", name: "Firebolt", glyph: "F", color: "#ff7a2d", kind: "payload",
    desc: "Ignites what it touches", dmg: 1, speed: 480, life: 0.9,
    splash: "fire", delayAdd: 0.06,
  }),
  waterball: card({
    id: "waterball", name: "Waterball", glyph: "W", color: "#2f6da0", kind: "payload",
    desc: "Splashes coolant, quenches fire", dmg: 1, speed: 430, life: 0.85,
    splash: "coolant", delayAdd: 0.08,
  }),
  acidspit: card({
    id: "acidspit", name: "Acid Spit", glyph: "A", color: "#5da62c", kind: "payload",
    desc: "Heavy hit; melts terrain", dmg: 2, speed: 440, life: 0.85,
    splash: "acid", delayAdd: 0.14,
  }),
  oilslick: card({
    id: "oilslick", name: "Oil Slick", glyph: "O", color: "#54452e", kind: "payload",
    desc: "Paints oil. Pairs with fire", dmg: 0, speed: 400, life: 0.8,
    splash: "oil", delayAdd: 0.04,
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
  blink: card({
    id: "blink", name: "Blink", glyph: "→", color: "#5bd1ff", kind: "utility",
    desc: "Short teleport toward your aim", delayAdd: 0.15,
  }),
};

/** All card ids, for weighted generation picks. */
export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** The player's deck. Slots may be empty (null). Serializable plain object. */
export interface Caster {
  slots: (CardId | null)[];
  /** Next slot the deck walk starts from. */
  pointer: number;
  /** Time until the next cast is allowed. */
  castTimer: number;
  /** True while the timer running is the full recharge (for the HUD). */
  recharging: boolean;
  castDelay: number;
  rechargeTime: number;
}

export function createStarterCaster(): Caster {
  return {
    slots: ["bolt", null, null, null, null],
    pointer: 0,
    castTimer: 0,
    recharging: false,
    castDelay: 0.26,
    rechargeTime: 0.9,
  };
}

/** Accumulated modifier effects folded into a single cast. */
export interface CastMods {
  count: number;
  speedMult: number;
  bounces: number;
  pierce: boolean;
}

export function emptyCastMods(): CastMods {
  return { count: 1, speedMult: 1, bounces: 0, pierce: false };
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
    default:
      break;
  }
}
