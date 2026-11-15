import type { CandleRecord } from "./chain";
// Labeled rendering fixtures (0 / 100 / 3000 / 10000). Generated locally and deterministically;
// never presented as onchain data. Purchasers are derived strings, not real addresses.
export const FIXTURE_SIZES = [0, 100, 3000, 10000] as const;
export function makeFixture(n: number, now = 1_763_000_000): CandleRecord[] {
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out: CandleRecord[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: i + 1, position: i, style: Math.floor(rnd() * 7),
      purchaser: `0xf1x7${(i % 997).toString(16).padStart(36, "0")}` as `0x${string}`,
      createdAt: now - Math.floor((n - i) * 600 * rnd()), freeClaim: rnd() < 0.1, nftTokenId: 0n,
    });
  }
  return out;
}
export function fixtureFromLocation(hash = location.hash): number | null {
  const m = /[?&]fixture=(\d+)/.exec(hash);
  if (!m) return null;
  const n = Number(m[1]);
  return (FIXTURE_SIZES as readonly number[]).includes(n) ? n : null;
}
