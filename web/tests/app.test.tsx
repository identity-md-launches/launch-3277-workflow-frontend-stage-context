// Interaction tests with a mocked wallet and a mocked RPC client: no real funds or broadcasts.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import {
  ContractFunctionRevertedError, UserRejectedRequestError, encodeAbiParameters, encodeErrorResult, encodeEventTopics, erc20Abi, type Abi,
} from "viem";

const acct: any = { isConnected: false };
vi.mock("wagmi", async (orig) => ({ ...(await orig<any>()), useAccount: () => acct }));
const writeContract = vi.fn();
vi.mock("wagmi/actions", async (orig) => ({ ...(await orig<any>()), writeContract: (...a: any[]) => writeContract(...a) }));

import { runtimeFrom, type Runtime } from "../src/config";
import { RuntimeContext } from "../src/chain";
import { App } from "../src/App";

const dist = join(__dirname, "../../dist");
const manifest = JSON.parse(readFileSync(join(dist, "imd-deployment.json"), "utf8"));
const abis: Record<string, Abi> = Object.fromEntries(manifest.contracts.map((c: any) => [c.name, JSON.parse(readFileSync(join(dist, c.abiPath), "utf8"))]));
const rt: Runtime = runtimeFrom(manifest, abis);
const G = rt.garden.address, T = rt.treasury.address;
const IMD = "0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7";
const USER = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";
const E18 = 10n ** 18n;

function encodeEventLog({ abi, eventName, args }: any) {
  const ev = (abi as any[]).find((e) => e.type === "event" && e.name === eventName);
  const plain = ev.inputs.filter((i: any) => !i.indexed);
  return { topics: encodeEventTopics({ abi, eventName, args } as any), data: encodeAbiParameters(plain, plain.map((i: any) => args[i.name])) };
}
let chainState: Record<string, any>;
let receipt: any;
const client: any = {
  multicall: vi.fn(async ({ contracts }: any) => contracts.map((c: any) => chainState[c.functionName])),
  readContract: vi.fn(async ({ functionName }: any) => (functionName === "getCandles" || functionName === "candleIdsOf" ? [[], 0n] : chainState[functionName])),
  getBlockNumber: vi.fn(async () => 100n),
  getBlock: vi.fn(async () => ({ number: 100n, timestamp: 1_763_200_000n })),
  getCode: vi.fn(async () => "0x60"),
  getContractEvents: vi.fn(async () => []),
  simulateContract: vi.fn(async (req: any) => ({ request: req, result: 999n })),
  waitForTransactionReceipt: vi.fn(async () => receipt),
};

beforeAll(() => {
  (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
  (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  (HTMLCanvasElement.prototype as any).getContext = () => null;
});
beforeEach(() => {
  location.hash = "#/garden";
  localStorage.clear();
  Object.assign(acct, { isConnected: false, address: undefined, chainId: undefined, connector: undefined });
  chainState = {
    totalCandles: 0n, paidCandles: 0n, freeCandles: 0n, CANDLE_PRICE: E18, MAX_BATCH_SIZE: 50n, IMD, owner: "0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9",
    freeClaimsStatus: [false, "Owner has not confirmed the verified official NFT collection"], OFFICIAL_COLLECTION: "0x0000eC93127BAA929E58E97dd0095A2BFb38ec1D",
    garden: ZERO, IMD_DECIMALS: 18, treasury: T, collectionConfirmed: false, balanceOf: 20n * E18, allowance: 0n,
  };
  writeContract.mockReset(); writeContract.mockResolvedValue("0x" + "ab".repeat(32));
  client.simulateContract.mockClear();
});
afterEach(cleanup);

function renderApp() {
  const config = createConfig({ chains: [rt.chain], connectors: [], transports: { [rt.chain.id]: http("http://127.0.0.1:1") } as any });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <WagmiProvider config={config}><QueryClientProvider client={qc}>
      <RuntimeContext.Provider value={{ rt, client }}><App /></RuntimeContext.Provider>
    </QueryClientProvider></WagmiProvider>,
  );
}
const connect = (chainId = rt.chain.id) => Object.assign(acct, { isConnected: true, address: USER, chainId, connector: { getProvider: async () => provider } });
let provider: any;
const buyPanel = () => within(screen.getByRole("region", { name: "Light candles" }));

describe("walletless viewing", () => {
  it("shows live reads, the empty garden and a Connect control without a wallet", async () => {
    renderApp();
    expect(await screen.findByText(/No candles lit yet/)).toBeTruthy();
    expect(buyPanel().getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(screen.getByText(/1 IMD per candle/)).toBeTruthy();
  });
  it("labels rendering fixtures as not onchain", async () => {
    location.hash = "#/garden?fixture=3000";
    renderApp();
    expect(await screen.findByText(/Fixture: 3,000 generated candles for rendering tests. Not onchain data./)).toBeTruthy();
    expect(screen.getByText(/3,000 candles lit/)).toBeTruthy();
  });
});

describe("purchase flow", () => {
  it("keeps purchase disabled until the owner binds the garden", async () => {
    connect(); renderApp();
    const b = await buyPanel().findByRole("button", { name: "Purchases not open yet" });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/bindGarden/)).toBeTruthy();
  });
  it("approves exactly the total and reports the receipt's Approval event", async () => {
    chainState.garden = G; connect(); renderApp();
    await userEvent.click(await buyPanel().findByRole("button", { name: "10" }));
    const approve = await buyPanel().findByRole("button", { name: "Approve exactly 10 IMD" });
    receipt = { status: "success", blockNumber: 101n, logs: [encodeEventLog({ abi: erc20Abi, eventName: "Approval", args: { owner: USER, spender: G, value: 10n * E18 } })] };
    await userEvent.click(approve);
    await screen.findByText(/may now spend exactly 10 IMD/);
    const call = client.simulateContract.mock.calls[0][0];
    expect(call.functionName).toBe("approve");
    expect(call.address).toBe(IMD);
    expect(call.args).toEqual([G, 10n * E18]);
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
  it("lights candles and reports ids from the receipt, not the simulation", async () => {
    chainState.garden = G; chainState.allowance = 2n * E18; connect(); renderApp();
    await userEvent.click(await buyPanel().findByRole("button", { name: "One more" }));
    const ev = (id: bigint) => encodeEventLog({ abi: rt.garden.abi, eventName: "CandleCreated", args: { candleId: id, purchaser: USER, position: id - 1n, style: 0, createdAt: 1n, freeClaim: false, nftTokenId: 0n } } as any);
    receipt = { status: "success", blockNumber: 102n, logs: [ev(7n), ev(8n)] };
    await userEvent.click(await buyPanel().findByRole("button", { name: "Light 2 candles" }));
    await screen.findByText(/Block 102: candles #7 to #8 lit in Purity/);
    expect(client.simulateContract.mock.calls[0][0].args).toEqual([2n, 0]);
    expect(screen.queryByText(/999/)).toBeNull();
  });
  it("reports a reverted receipt as reverted", async () => {
    chainState.garden = G; chainState.allowance = E18; connect(); renderApp();
    receipt = { status: "reverted", blockNumber: 103n, logs: [] };
    await userEvent.click(await buyPanel().findByRole("button", { name: "Light 1 candle" }));
    await screen.findByText(/reverted onchain/);
  });
  it("handles wallet rejection without claiming success", async () => {
    chainState.garden = G; chainState.allowance = E18; connect(); renderApp();
    writeContract.mockRejectedValue(new UserRejectedRequestError(new Error("denied")));
    await userEvent.click(await buyPanel().findByRole("button", { name: "Light 1 candle" }));
    await screen.findByText(/You rejected the request in your wallet. Nothing was sent./);
    expect(client.waitForTransactionReceipt).not.toHaveBeenCalledWith(expect.anything());
  });
  it("shows a decoded revert from simulation and never asks the wallet", async () => {
    chainState.garden = G; chainState.allowance = E18; connect(); renderApp();
    client.simulateContract.mockRejectedValueOnce(new ContractFunctionRevertedError({ abi: rt.garden.abi, functionName: "buyCandles", data: encodeErrorResult({ abi: rt.garden.abi, errorName: "TreasuryNotConfigured" }) } as any));
    await userEvent.click(await buyPanel().findByRole("button", { name: "Light 1 candle" }));
    await screen.findByText(/Purchases are not open yet: the owner has not bound/);
    expect(writeContract).not.toHaveBeenCalled();
  });
  it("disables purchase when the balance is short", async () => {
    chainState.garden = G; chainState.balanceOf = 0n; connect(); renderApp();
    expect(((await buyPanel().findByRole("button", { name: "Not enough IMD" })) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("network switching", () => {
  it("offers Switch to Ethereum and falls back to wallet_addEthereumChain on 4902", async () => {
    const calls: any[] = [];
    let added = false;
    provider = { request: vi.fn(async (a: any) => { calls.push(a); if (a.method === "wallet_switchEthereumChain" && !added) throw Object.assign(new Error("Unrecognized chain"), { code: 4902 }); if (a.method === "wallet_addEthereumChain") added = true; return null; }) };
    connect(11155111); renderApp();
    const btns = await screen.findAllByRole("button", { name: "Switch to Ethereum" });
    await userEvent.click(btns[0]);
    await waitFor(() => expect(calls.map((c) => c.method)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]));
    expect(calls[0].params[0]).toEqual({ chainId: "0x1" });
    expect(calls[1].params[0]).toEqual(manifest.walletAddChain);
  });
});

describe("other pages", () => {
  it("My Candles shows the contract's exact free-claim reason", async () => {
    location.hash = "#/candles"; connect(); renderApp();
    expect(await screen.findByText(/Free claims are closed: Owner has not confirmed the verified official NFT collection/)).toBeTruthy();
  });
  it("Treasury labels locked IMD and shows market cap as unavailable", async () => {
    location.hash = "#/treasury"; Object.assign(chainState, { ecosystemBalance: 5n * E18, operationsBalance: E18, founderBalance: E18, totalEcosystemWithdrawn: 0n, totalOperationsClaimed: 0n, totalFounderClaimed: 0n,
      totalPayments: 10n * E18, totalIMDLocked: 3n * E18, totalSupplyBurned: 0n, accountedBalance: 7n * E18, unallocatedBalance: 0n, operationsRecipient: USER, founderRecipient: USER, lockedBalance: 3n * E18, SUPPLY_REDUCING: false, totalSupply: 1000n * E18 });
    renderApp();
    expect(await screen.findByText("Permanently locked")).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBe(2);
    await screen.findByText(/sink reports supply reducing: no/);
  });
});
