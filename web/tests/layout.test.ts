import { describe, expect, it } from "vitest";
import { slotPosition, sectionCell, SECTION_SLOTS } from "../src/layout";
import { FIXTURE_SIZES, makeFixture } from "../src/fixtures";

describe("stable layout", () => {
  it("places every slot of a 10,000-candle garden at a distinct point", () => {
    const seen = new Set<string>();
    for (let p = 0; p < 10_000; p++) { const s = slotPosition(p); seen.add(`${s.x},${s.y}`); }
    expect(seen.size).toBe(10_000);
  });
  it("never moves a slot: position depends only on the slot index", () => {
    const before = [0, 1, 255, 256, 3000, 9999].map(slotPosition);
    for (let p = 10_000; p < 12_000; p++) slotPosition(p); // garden grows
    expect([0, 1, 255, 256, 3000, 9999].map(slotPosition)).toEqual(before);
  });
  it("starts at the entrance and expands outward", () => {
    expect(sectionCell(0)).toEqual({ gx: 0, gy: 0 });
    expect(slotPosition(0).section).toBe(0);
    expect(slotPosition(SECTION_SLOTS).section).toBe(1);
    const cells = Array.from({ length: 40 }, (_, i) => sectionCell(i));
    expect(new Set(cells.map((c) => `${c.gx},${c.gy}`)).size).toBe(40);
    expect(cells.every((c) => c.gy >= 0)).toBe(true);
  });
});

describe("labeled fixtures", () => {
  it.each(FIXTURE_SIZES)("fixture %i has exactly that many sequential records", (n) => {
    const f = makeFixture(n);
    expect(f).toHaveLength(n);
    f.forEach((r, i) => { expect(r.id).toBe(i + 1); expect(r.position).toBe(i); expect(r.style).toBeGreaterThanOrEqual(0); expect(r.style).toBeLessThan(7); });
  });
  it("lays out 10,000 fixture candles quickly", () => {
    const f = makeFixture(10_000);
    const t = performance.now();
    for (const r of f) slotPosition(r.position);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
