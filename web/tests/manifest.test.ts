import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalAbiHash } from "../src/config";

const dist = join(__dirname, "../../dist");
const handoff = JSON.parse(readFileSync(join(__dirname, "../deployment/handoff.json"), "utf8"));
const net = JSON.parse(readFileSync(join(__dirname, "../deployment/network.json"), "utf8"));

describe.skipIf(!existsSync(join(dist, "imd-deployment.json")))("dist/imd-deployment.json", () => {
  const m = JSON.parse(readFileSync(join(dist, "imd-deployment.json"), "utf8"));
  it("has exactly the allowed top-level keys", () => {
    const allowed = ["version", "launchId", "chainId", "sourceCommit", "attestationHash", "contracts", "assets", "network", "walletAddChain", ...(handoff.poolKey ? ["poolKey"] : [])];
    expect(Object.keys(m).sort()).toEqual(allowed.sort());
    expect(m.version).toBe(1);
  });
  it("copies identifiers and the contract set from the handoff", () => {
    for (const k of ["launchId", "chainId", "sourceCommit", "attestationHash"]) expect(m[k]).toBe(handoff[k]);
    expect(m.contracts.map((c: any) => [c.name, c.address, c.abiHash])).toEqual(handoff.contracts.map((c: any) => [c.name, c.address, c.abiHash]));
  });
  it("copies network and walletAddChain unchanged", () => {
    expect(JSON.stringify(m.network)).toBe(JSON.stringify(net.network));
    expect(JSON.stringify(m.walletAddChain)).toBe(JSON.stringify(net.walletAddChain));
  });
  it("binds each ABI file to its hash", () => {
    for (const c of m.contracts) {
      expect(c.abiPath).toMatch(/^abi\/[A-Za-z]+\.json$/);
      expect(canonicalAbiHash(JSON.parse(readFileSync(join(dist, c.abiPath), "utf8")))).toBe(c.abiHash);
    }
  });
  it("lists every exported file with its sha256", () => {
    expect(m.assets.length).toBeLessThanOrEqual(128);
    expect(m.assets.some((a: any) => a.path === "index.html")).toBe(true);
    for (const a of m.assets) {
      expect(a.path).not.toMatch(/^\/|\.\.|:\/\//);
      expect(createHash("sha256").update(readFileSync(join(dist, a.path))).digest("hex")).toBe(a.sha256);
    }
  });
  it("index.html uses relative asset paths and share metadata", () => {
    const html = readFileSync(join(dist, "index.html"), "utf8");
    expect(html).not.toMatch(/(src|href)="\/(?!\/)/);
    for (const re of [/<title>[^<]+<\/title>/, /rel="icon"/, /name="description"/, /og:title/, /og:image/]) expect(html).toMatch(re);
  });
});
