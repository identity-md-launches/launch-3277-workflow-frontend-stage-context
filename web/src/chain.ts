import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeEventLog, erc20Abi, parseAbi,
  type Abi, type Address, type Hash, type TransactionReceipt,
} from "viem";
import { useAccount, useConfig } from "wagmi";
import { writeContract } from "wagmi/actions";
import type { PublicClient, Runtime } from "./config";

export type CandleRecord = {
  id: number; purchaser: Address; createdAt: number; style: number; freeClaim: boolean; position: number; nftTokenId: bigint;
};

export const RuntimeContext = createContext<{ rt: Runtime; client: PublicClient } | null>(null);
export function useRuntime() {
  const v = useContext(RuntimeContext);
  if (!v) throw new Error("Runtime not loaded");
  return v;
}

const erc721 = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

/** Live contract state, readable with no wallet. */
export function useGardenState() {
  const { rt, client } = useRuntime();
  return useQuery({
    queryKey: ["garden-state", rt.garden.address],
    refetchInterval: 15_000,
    queryFn: async () => {
      const g = { address: rt.garden.address, abi: rt.garden.abi } as const;
      const t = { address: rt.treasury.address, abi: rt.treasury.abi } as const;
      const r = await client.multicall({
        allowFailure: false,
        contracts: [
          { ...g, functionName: "totalCandles" }, { ...g, functionName: "paidCandles" }, { ...g, functionName: "freeCandles" },
          { ...g, functionName: "CANDLE_PRICE" }, { ...g, functionName: "MAX_BATCH_SIZE" }, { ...g, functionName: "IMD" },
          { ...g, functionName: "owner" }, { ...g, functionName: "freeClaimsStatus" }, { ...g, functionName: "OFFICIAL_COLLECTION" },
          { ...t, functionName: "garden" }, { ...g, functionName: "IMD_DECIMALS" }, { ...g, functionName: "treasury" },
          { ...g, functionName: "collectionConfirmed" },
        ] as any,
      });
      const [total, paid, free, price, maxBatch, imd, owner, status, collection, boundGarden, decimals, gardenTreasury, confirmed] = r as any[];
      const bound = (boundGarden as string).toLowerCase() === rt.garden.address.toLowerCase()
        && (gardenTreasury as string).toLowerCase() === rt.treasury.address.toLowerCase();
      return {
        total: Number(total), paid: Number(paid), free: Number(free), price: price as bigint, maxBatch: Number(maxBatch),
        imd: imd as Address, owner: owner as Address, claimsEnabled: status[0] as boolean, claimsReason: status[1] as string,
        collection: collection as Address, boundGarden: boundGarden as Address, purchasesEnabled: bound,
        decimals: Number(decimals), collectionConfirmed: confirmed as boolean,
      };
    },
  });
}
export type GardenState = NonNullable<ReturnType<typeof useGardenState>["data"]>;

const cacheKey = (rt: Runtime) => `wg:records:v1:${rt.chain.id}:${rt.garden.address.toLowerCase()}`;
type Packed = [string, number, number, 0 | 1, string];
function loadCache(rt: Runtime): CandleRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(rt)) ?? "[]") as Packed[];
    return raw.map((p, i) => ({ id: i + 1, position: i, purchaser: p[0] as Address, createdAt: p[1], style: p[2], freeClaim: p[3] === 1, nftTokenId: BigInt(p[4]) }));
  } catch { return []; }
}
function saveCache(rt: Runtime, recs: CandleRecord[]) {
  try {
    localStorage.setItem(cacheKey(rt), JSON.stringify(recs.map((r) => [r.purchaser, r.createdAt, r.style, r.freeClaim ? 1 : 0, r.nftTokenId.toString()])));
  } catch { /* storage full or disabled: the garden still renders from memory */ }
}

/**
 * All candle records, read with getCandles(firstId, 100) pages. Records are append-only and
 * immutable, so pages already cached are reused; the last cached page is always re-read so a
 * reorganised tip is corrected.
 */
export function useCandles(total: number | undefined) {
  const { rt, client } = useRuntime();
  return useQuery({
    queryKey: ["candles", rt.garden.address, total],
    enabled: total !== undefined,
    staleTime: Infinity,
    queryFn: async () => {
      const cached = loadCache(rt).slice(0, total);
      const start = Math.max(1, cached.length - 99);
      const recs = cached.slice(0, start - 1);
      const blockNumber = await client.getBlockNumber();
      const pages: number[] = [];
      for (let id = start; id <= (total ?? 0); id += 100) pages.push(id);
      const results = await Promise.all(pages.map((first) => client.readContract({
        address: rt.garden.address, abi: rt.garden.abi, functionName: "getCandles", args: [BigInt(first), 100n], blockNumber,
      }) as Promise<readonly [readonly any[], bigint]>));
      results.forEach(([page], pi) => page.forEach((c, i) => recs.push({
        id: pages[pi] + i, position: Number(c.position), purchaser: c.purchaser, createdAt: Number(c.createdAt),
        style: Number(c.style), freeClaim: c.freeClaim, nftTokenId: c.nftTokenId,
      })));
      saveCache(rt, recs);
      return recs;
    },
  });
}

/** Candle ids of one purchaser via candleIdsOf pagination. */
export function useCandleIdsOf(owner: Address | undefined) {
  const { rt, client } = useRuntime();
  return useQuery({
    queryKey: ["ids-of", rt.garden.address, owner],
    enabled: !!owner,
    refetchInterval: 20_000,
    queryFn: async () => {
      const ids: number[] = [];
      let offset = 0n;
      for (let guard = 0; guard < 1000; guard++) {
        const [page, next] = (await client.readContract({
          address: rt.garden.address, abi: rt.garden.abi, functionName: "candleIdsOf", args: [owner!, offset, 100n],
        })) as readonly [readonly bigint[], bigint];
        ids.push(...page.map(Number));
        if (page.length < 100) break;
        offset = next;
      }
      return ids;
    },
  });
}

export function useTokenAccount(imd: Address | undefined, spender: Address) {
  const { client } = useRuntime();
  const { address } = useAccount();
  return useQuery({
    queryKey: ["imd-account", imd, address, spender],
    enabled: !!imd && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [balance, allowance] = await client.multicall({
        allowFailure: false,
        contracts: [
          { address: imd!, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
          { address: imd!, abi: erc20Abi, functionName: "allowance", args: [address!, spender] },
        ],
      });
      return { balance, allowance };
    },
  });
}

/** First block where `address` has code: binary search on eth_getCode, cached per address. */
export async function findDeployBlock(client: PublicClient, address: Address): Promise<bigint> {
  const key = `wg:deployblock:${address.toLowerCase()}`;
  const hit = localStorage.getItem(key);
  if (hit) return BigInt(hit);
  let hi = await client.getBlockNumber();
  let lo = 0n;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getCode({ address, blockNumber: mid });
    if (code && code !== "0x") hi = mid; else lo = mid + 1n;
  }
  localStorage.setItem(key, lo.toString());
  return lo;
}

/** getLogs in chunks, halving the chunk when an RPC refuses the range. */
export async function getLogsPaged(client: PublicClient, params: { address: Address; abi: Abi; eventName: string }, from: bigint) {
  const to = await client.getBlockNumber();
  const out: any[] = [];
  let step = 50_000n;
  for (let start = from; start <= to;) {
    const end = start + step - 1n > to ? to : start + step - 1n;
    try {
      const logs = await client.getContractEvents({ address: params.address, abi: params.abi, eventName: params.eventName as any, fromBlock: start, toBlock: end });
      out.push(...logs);
      start = end + 1n;
    } catch (e) {
      if (step <= 500n) throw e;
      step /= 4n;
    }
  }
  const seen = new Set<string>();
  return out.filter((l) => { const k = `${l.transactionHash}:${l.logIndex}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function useWithdrawals() {
  const { rt, client } = useRuntime();
  return useQuery({
    queryKey: ["withdrawals", rt.treasury.address],
    refetchInterval: 60_000,
    queryFn: async () => {
      const from = await findDeployBlock(client, rt.treasury.address);
      const logs = await getLogsPaged(client, { address: rt.treasury.address, abi: rt.treasury.abi, eventName: "BucketWithdrawn" }, from);
      return logs.map((l) => ({
        bucket: Number(l.args.bucket), caller: l.args.caller as Address, destination: l.args.destination as Address,
        amount: l.args.amount as bigint, tx: l.transactionHash as Hash, block: l.blockNumber as bigint,
      })).reverse();
    },
  });
}

/** Which identity.md NFT ids the wallet owns now, and whether each is already consumed. */
export async function scanNfts(client: PublicClient, rt: Runtime, collection: Address, owner: Address) {
  const supply = Number(await client.readContract({ address: collection, abi: erc721, functionName: "totalSupply" }));
  const ids = Array.from({ length: supply }, (_, i) => i);
  const owners = await client.multicall({ allowFailure: true, batchSize: 4096,
    contracts: ids.map((i) => ({ address: collection, abi: erc721, functionName: "ownerOf", args: [BigInt(i)] })) });
  const mine = ids.filter((i) => owners[i].status === "success" && String(owners[i].result).toLowerCase() === owner.toLowerCase());
  const claimed = mine.length ? await client.multicall({ allowFailure: false,
    contracts: mine.map((i) => ({ address: rt.garden.address, abi: rt.garden.abi, functionName: "nftClaimedCandle", args: [BigInt(i)] })) as any }) : [];
  return mine.map((id, k) => ({ id, claimedCandle: Number(claimed[k] as bigint) }));
}

// ---------- transactions ----------
export type TxPhase = "idle" | "simulating" | "wallet" | "pending" | "confirmed" | "reverted" | "rejected" | "failed";
export type TxState = { phase: TxPhase; label?: string; hash?: Hash; message?: string };

const FRIENDLY: Record<string, string> = {
  TreasuryNotConfigured: "Purchases are not open yet: the owner has not bound the garden to the treasury.",
  GardenNotConfigured: "Purchases are not open yet: the owner has not bound the garden to the treasury.",
  CollectionNotConfirmed: "Free claims are not open yet: the owner has not confirmed the NFT collection.",
  NotNFTOwner: "This wallet does not currently own that NFT.",
  NFTAlreadyClaimed: "That NFT has already claimed its free candle.",
  InvalidQuantity: "Choose between 1 and 50 candles per transaction.",
  InvalidStyle: "Choose one of the seven styles.",
  WrongChain: "The contract reports the wrong chain.",
  InsufficientBucketBalance: "The bucket holds less than that amount.",
  UnauthorizedBeneficiary: "Only the fixed recipient can claim this bucket.",
  OwnableUnauthorizedAccount: "Only the owner can do this.",
  GardenAlreadyBound: "The garden is already bound.",
  CollectionAlreadyConfirmed: "The collection is already confirmed.",
  ERC20InsufficientAllowance: "The IMD approval is lower than the total. Approve the exact total first.",
  ERC20InsufficientBalance: "This wallet holds less IMD than the total.",
};

export function describeError(e: unknown): { rejected: boolean; message: string } {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { rejected: true, message: "You rejected the request in your wallet. Nothing was sent." };
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = rev?.data?.errorName ?? rev?.reason;
    if (name) return { rejected: false, message: FRIENDLY[name] ?? `The contract would revert: ${name}.` };
    return { rejected: false, message: e.shortMessage || e.message };
  }
  const code = (e as any)?.code;
  if (code === 4001) return { rejected: true, message: "You rejected the request in your wallet. Nothing was sent." };
  return { rejected: false, message: e instanceof Error ? e.message : String(e) };
}

export function decodeReceipt(receipt: TransactionReceipt, abis: Abi[]) {
  const events: { eventName: string; args: any }[] = [];
  for (const log of receipt.logs) for (const abi of abis) {
    try { events.push(decodeEventLog({ abi, data: log.data, topics: log.topics }) as any); break; } catch { /* not this abi */ }
  }
  return events;
}

export type WriteReq = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/**
 * One transaction: simulate, ask the wallet, wait for the receipt, then report what the receipt's
 * events say. The simulation's return value is never shown as the outcome.
 */
export function useTx() {
  const config = useConfig();
  const { client } = useRuntime();
  const { address } = useAccount();
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const busy = useRef(false);
  const run = useCallback(async (label: string, req: WriteReq, interpret: (r: TransactionReceipt) => string): Promise<TransactionReceipt | null> => {
    if (busy.current || !address) return null;
    busy.current = true;
    try {
      setState({ phase: "simulating", label, message: "Checking the transaction against current chain state…" });
      const sim = await client.simulateContract({ ...req, account: address } as any);
      setState({ phase: "wallet", label, message: "Confirm in your wallet." });
      const hash = await writeContract(config, sim.request as any);
      setState({ phase: "pending", label, hash, message: "Sent. Waiting for the block…" });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") setState({ phase: "confirmed", label, hash, message: interpret(receipt) });
      else setState({ phase: "reverted", label, hash, message: "The transaction reverted onchain. No candles or transfers were recorded; gas was spent." });
      await qc.invalidateQueries();
      return receipt;
    } catch (e) {
      const d = describeError(e);
      setState((s) => ({ phase: d.rejected ? "rejected" : "failed", label, hash: s.hash, message: d.message }));
      return null;
    } finally { busy.current = false; }
  }, [address, client, config, qc]);
  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, run, reset, busy: ["simulating", "wallet", "pending"].includes(state.phase) };
}
