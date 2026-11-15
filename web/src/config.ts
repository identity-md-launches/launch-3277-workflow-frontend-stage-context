// The site's single configuration point. Addresses, chain id, ABIs, public RPC URLs and the
// wallet_addEthereumChain parameters are NOT written here: they are loaded at runtime from
// ./imd-deployment.json (the attested deployment manifest) and the ABI files it references.
// Only site metadata and cosmetic constants live in source.
import { createConfig, fallback, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { createPublicClient, defineChain, keccak256, toHex, type Abi, type Address, type Chain } from "viem";
import { mainnet } from "viem/chains";

export const SITE = {
  name: "The Wish Garden",
  description: "Light a permanent onchain candle with IMD on Ethereum. Viewing is free and needs no wallet.",
};

/** No WalletConnect relay or project ID is used (see docs/frontend-validation.md). */
export const walletConnectProjectId = "";

export const STYLES = [
  { name: "Purity", color: "white", flame: "#fff6df", wax: "#efe6d2" },
  { name: "Hope", color: "blue", flame: "#9cc8ff", wax: "#3b64c8" },
  { name: "Love", color: "red", flame: "#ff8f86", wax: "#c42f35" },
  { name: "Success", color: "gold", flame: "#ffd36b", wax: "#d9a12b" },
  { name: "Health", color: "purple", flame: "#d9a2ff", wax: "#8a3fc0" },
  { name: "Wealth", color: "green", flame: "#9df0a8", wax: "#2f9a4a" },
  { name: "Happiness", color: "pink", flame: "#ffb3d6", wax: "#e978a8" },
] as const;

export type ManifestContract = { name: string; address: Address; abiHash: string; abiPath: string };
export type Network = {
  chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  pairToken?: { address: Address; symbol: string; name: string; decimals: number };
  uniswapV4?: Record<string, unknown>;
};
export type WalletAddChain = {
  chainId: string; chainName: string; rpcUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[];
};
export type Manifest = {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: ManifestContract[]; assets: { path: string; sha256: string }[];
  network: Network; walletAddChain?: WalletAddChain;
};
export type Bound = { address: Address; abi: Abi };
export type Runtime = {
  manifest: Manifest;
  chain: Chain;
  garden: Bound;
  treasury: Bound;
  sink: Bound;
  network: Network;
  walletAddChain: WalletAddChain;
  /** false when an ABI file does not hash to the manifest's abiHash: transactions stay disabled */
  abiVerified: boolean;
  explorer: (kind: "address" | "tx" | "block", v: string | bigint) => string;
};

const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as any)[k])])) : v;
export const canonicalAbiHash = (abi: unknown) => keccak256(toHex(JSON.stringify(sortKeys(abi)))).slice(2);

export function runtimeFrom(manifest: Manifest, abis: Record<string, Abi>): Runtime {
  const net = manifest.network;
  if (net.chainId !== manifest.chainId) throw new Error("Manifest chainId and network.chainId differ");
  let abiVerified = true;
  const bind = (name: string): Bound => {
    const c = manifest.contracts.find((x) => x.name === name);
    if (!c) throw new Error(`Manifest has no ${name}`);
    const abi = abis[name];
    if (!abi) throw new Error(`ABI for ${name} not loaded`);
    if (canonicalAbiHash(abi) !== c.abiHash) abiVerified = false;
    return { address: c.address, abi };
  };
  const known = net.chainId === mainnet.id ? mainnet : undefined;
  const chain = defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: { default: { http: net.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: net.explorer } },
    contracts: known?.contracts,
    testnet: net.testnet,
  });
  const walletAddChain: WalletAddChain = manifest.walletAddChain ?? {
    chainId: `0x${net.chainId.toString(16)}`, chainName: net.name, rpcUrls: net.rpcUrls,
    nativeCurrency: net.nativeCurrency, blockExplorerUrls: [net.explorer],
  };
  return {
    manifest, chain, network: net, walletAddChain,
    garden: bind("WishGarden"), treasury: bind("WishGardenTreasury"), sink: bind("WishGardenBurnSink"),
    abiVerified,
    explorer: (kind, v) => `${net.explorer.replace(/\/$/, "")}/${kind}/${v.toString()}`,
  };
}

export async function loadRuntime(base: string = document.baseURI): Promise<Runtime> {
  const get = async (path: string) => {
    const r = await fetch(new URL(path, base), { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  };
  const manifest = (await get("imd-deployment.json")) as Manifest;
  const abis: Record<string, Abi> = {};
  await Promise.all(manifest.contracts.map(async (c) => {
    if (/^[a-z]+:|\.\./i.test(c.abiPath)) throw new Error(`Refusing ABI path ${c.abiPath}`);
    abis[c.name] = (await get(c.abiPath)) as Abi;
  }));
  return runtimeFrom(manifest, abis);
}

export function transportFor(rt: Runtime) {
  return fallback(rt.network.rpcUrls.map((u) => http(u, { batch: true, retryCount: 1 })));
}

export function makeWagmiConfig(rt: Runtime) {
  return createConfig({
    chains: [rt.chain] as [Chain],
    multiInjectedProviderDiscovery: true,
    connectors: [injected(), coinbaseWallet({ appName: SITE.name })],
    transports: { [rt.chain.id]: transportFor(rt) } as any,
  });
}

export function makePublicClient(rt: Runtime) {
  return createPublicClient({ chain: rt.chain, transport: transportFor(rt), batch: { multicall: { wait: 16 } } });
}
export type PublicClient = ReturnType<typeof makePublicClient>;
