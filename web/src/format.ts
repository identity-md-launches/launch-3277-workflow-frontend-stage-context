import { formatUnits, getAddress } from "viem";
export const short = (a: string) => { try { a = getAddress(a); } catch { /* fixture ids */ } return `${a.slice(0, 6)}…${a.slice(-4)}`; };
export function fmtToken(v: bigint | undefined, decimals = 18, max = 4) {
  if (v === undefined) return "…";
  const s = formatUnits(v, decimals);
  const [i, f = ""] = s.split(".");
  const fr = f.slice(0, max).replace(/0+$/, "");
  return `${BigInt(i).toLocaleString("en-US")}${fr ? "." + fr : ""}`;
}
export const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
