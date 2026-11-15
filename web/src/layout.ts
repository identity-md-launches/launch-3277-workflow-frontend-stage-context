// Stable garden placement. A candle's slot is its permanent onchain `position` (= id - 1).
// section = position / 256, row = (position % 256) / 16, column = position % 16.
// Sections are terraces laid out from the entrance outward in a fixed order, so a section's place
// never depends on how many candles exist: earlier candles never move when new ones arrive.
export const SECTION_SLOTS = 256;
export const COLS = 16;
export const SLOT = 22; // world units between pedestals
export const TERRACE = COLS * SLOT + 60; // terrace footprint incl. path margin

/** Grid cell (gx, gy) of section index s. gy = 0 is the entrance row; rows grow away from it. */
export function sectionCell(s: number): { gx: number; gy: number } {
  // Ring k holds cells with max(|gx|, gy) === k, ordered centre-first then alternating sides.
  if (s === 0) return { gx: 0, gy: 0 };
  let k = 1, start = 1;
  for (;;) {
    const ring = ringCells(k);
    if (s < start + ring.length) return ring[s - start];
    start += ring.length; k++;
  }
}
const ringCache = new Map<number, { gx: number; gy: number }[]>();
function ringCells(k: number) {
  const hit = ringCache.get(k);
  if (hit) return hit;
  const cells: { gx: number; gy: number }[] = [];
  for (let gy = 0; gy <= k; gy++) for (let gx = -k; gx <= k; gx++)
    if (Math.max(Math.abs(gx), gy) === k) cells.push({ gx, gy });
  cells.sort((a, b) => (a.gy - b.gy) || (Math.abs(a.gx) - Math.abs(b.gx)) || (a.gx - b.gx));
  ringCache.set(k, cells);
  return cells;
}

/** World coordinates of a slot. y grows downward on screen; the entrance is at the bottom (y = 0). */
export function slotPosition(position: number): { x: number; y: number; section: number; row: number; col: number } {
  const section = Math.floor(position / SECTION_SLOTS);
  const within = position % SECTION_SLOTS;
  const row = Math.floor(within / COLS);
  const col = within % COLS;
  const { gx, gy } = sectionCell(section);
  const cx = gx * TERRACE;
  const top = -gy * TERRACE - TERRACE + 30;
  // row 0 sits nearest the entrance, so early candles cluster near the gate
  return { x: cx + (col - (COLS - 1) / 2) * SLOT, y: top + (COLS - 1 - row) * SLOT + 10, section, row, col };
}

export function sectionRect(section: number) {
  const { gx, gy } = sectionCell(section);
  return { x: gx * TERRACE - TERRACE / 2, y: -gy * TERRACE - TERRACE, w: TERRACE, h: TERRACE };
}
