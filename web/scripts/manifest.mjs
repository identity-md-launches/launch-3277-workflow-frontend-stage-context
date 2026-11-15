// Emits dist/abi/*.json and dist/imd-deployment.json after `vite build`.
// Inputs: web/deployment/handoff.json and web/deployment/network.json (verbatim copies of the
// workflow handoff and the network's chain table) and docs/abi/<Contract>.json (implementation-derived
// ABIs at the deployed source commit). Every ABI hash is checked against the handoff before writing.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toHex } from "viem";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(web, "..");
const dist = join(root, "dist");
const handoff = JSON.parse(readFileSync(join(web, "deployment/handoff.json"), "utf8"));
const networkFile = JSON.parse(readFileSync(join(web, "deployment/network.json"), "utf8"));

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
export const canonicalAbiHash = (abi) => keccak256(toHex(JSON.stringify(sortKeys(abi)))).slice(2);

mkdirSync(join(dist, "abi"), { recursive: true });
const contracts = handoff.contracts.map((c) => {
  const bytes = readFileSync(join(root, "docs/abi", `${c.name}.json`));
  const abi = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(abi)) throw new Error(`${c.name}: ABI is not a JSON array`);
  const h = canonicalAbiHash(abi);
  if (h !== c.abiHash) throw new Error(`${c.name}: ABI hash ${h} != handoff ${c.abiHash}`);
  writeFileSync(join(dist, "abi", `${c.name}.json`), bytes);
  return { name: c.name, address: c.address, abiHash: c.abiHash, abiPath: `abi/${c.name}.json` };
});

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const assets = walk(dist)
  .map((p) => relative(dist, p).split(sep).join("/"))
  .filter((p) => p !== "imd-deployment.json")
  .sort()
  .map((path) => {
    const buf = readFileSync(join(dist, path));
    if (buf.length > 8 * 1024 * 1024) throw new Error(`${path} exceeds 8 MiB`);
    return { path, sha256: createHash("sha256").update(buf).digest("hex") };
  });
if (assets.length > 128) throw new Error(`${assets.length} assets exceeds 128`);
if (!assets.some((a) => a.path === "index.html")) throw new Error("index.html missing");

const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: networkFile.network,
  ...(networkFile.walletAddChain ? { walletAddChain: networkFile.walletAddChain } : {}),
};
writeFileSync(join(dist, "imd-deployment.json"), JSON.stringify(manifest, null, 2) + "\n");
const total = assets.reduce((s, a) => s + statSync(join(dist, a.path)).size, 0);
console.log(`imd-deployment.json: ${contracts.length} contracts, ${assets.length} assets, ${total} bytes`);
