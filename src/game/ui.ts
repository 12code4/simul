// Shared UI layout geometry. Both update.ts (mouse hit-testing) and render.ts
// (drawing) read these, so click targets and pixels can never drift apart.
// Pure constants and functions — no state, no drawing.

import { config } from "./config";

export interface UiRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(px: number, py: number, r: UiRect): boolean {
  return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

// --- sector-clear screen (mod draft + deck editing) ------------------------

export const DRAFT_CARD_W = 230;
export const DRAFT_CARD_H = 100;
export const DRAFT_CARD_GAP = 22;
export const DRAFT_CARD_Y = 112;

export function draftCardRect(i: number, count: number): UiRect {
  const total = count * DRAFT_CARD_W + (count - 1) * DRAFT_CARD_GAP;
  return {
    x: config.width / 2 - total / 2 + i * (DRAFT_CARD_W + DRAFT_CARD_GAP),
    y: DRAFT_CARD_Y,
    w: DRAFT_CARD_W,
    h: DRAFT_CARD_H,
  };
}

export const CARD_TILE = 44;
export const CARD_TILE_GAP = 10;

export const DECK_SLOTS_Y = 288;
/** Vertical spacing between caster rows in the editor (up to 3 rows). */
export const DECK_ROW_H = 56;

export function deckSlotRect(casterRow: number, i: number, slotCount: number): UiRect {
  const total = slotCount * CARD_TILE + (slotCount - 1) * CARD_TILE_GAP;
  return {
    x: config.width / 2 - total / 2 + i * (CARD_TILE + CARD_TILE_GAP),
    y: DECK_SLOTS_Y + casterRow * DECK_ROW_H,
    w: CARD_TILE,
    h: CARD_TILE,
  };
}

/** The ✕ button that discards a whole caster (shown when carrying 3). */
export function casterDiscardRect(casterRow: number, slotCount: number): UiRect {
  const total = slotCount * CARD_TILE + (slotCount - 1) * CARD_TILE_GAP;
  return {
    x: config.width / 2 + total / 2 + 12,
    y: DECK_SLOTS_Y + casterRow * DECK_ROW_H + CARD_TILE / 2 - 11,
    w: 22,
    h: 22,
  };
}

export const INV_Y = 468;
export const INV_COLS = 12;

/** Inventory grid tile. Index may be one past the end (the unequip target). */
export function inventoryRect(i: number): UiRect {
  const col = i % INV_COLS;
  const row = Math.floor(i / INV_COLS);
  const total = INV_COLS * CARD_TILE + (INV_COLS - 1) * CARD_TILE_GAP;
  return {
    x: config.width / 2 - total / 2 + col * (CARD_TILE + CARD_TILE_GAP),
    y: INV_Y + row * (CARD_TILE + CARD_TILE_GAP),
    w: CARD_TILE,
    h: CARD_TILE,
  };
}

export const CONTINUE_RECT: UiRect = {
  x: config.width / 2 - 110,
  y: 554,
  w: 220,
  h: 32,
};
