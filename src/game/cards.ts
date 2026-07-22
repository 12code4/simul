// The card/deck system — Noita's wand architecture, adapted. A Caster is a
// deck: an ordered row of card slots plus casting cadence. Each trigger pull
// walks the deck from a pointer, folding any modifier cards into the next
// payload/utility card, then casts it. When the pointer wraps, the caster
// recharges (a longer delay). Cards are pure data; casting logic lives in
// update.ts so this module stays declarative.

export type CardId =
  | "bolt"
  | "burst"
  | "slug"
  | "dart"
  | "twin"
  | "haste"
  | "bounce"
  | "pierce"
  | "heavy"
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
  dmgAdd: number;
}

export function emptyCastMods(): CastMods {
  return { count: 1, speedMult: 1, bounces: 0, pierce: false, dmgAdd: 0 };
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
    default:
      break;
  }
}
