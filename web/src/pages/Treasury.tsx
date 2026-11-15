import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi, isAddress, isHex, parseUnits, type Address } from "viem";
import { decodeReceipt, useRuntime, useTx, useWithdrawals, type GardenState } from "../chain";
import { useNetworkStatus, SwitchButton } from "../components/Wallet";
import { TxStatus } from "../components/TxStatus";
import { fmtDate, fmtToken, short } from "../format";

const BUCKETS = ["Ecosystem", "Operations", "Founder"];
// Keccak-256 of docs/evidence/ethereum-dependencies.json as documented in the repository README.
const DOCUMENTED_EVIDENCE_HASH = "0x65ef8a042de0fb6fe40f2174fd7e4d13857f884c61912e56b20c38a122c8ee18";

function useTreasury(imd: Address | undefined) {
  const { rt, client } = useRuntime();
  return useQuery({
    queryKey: ["treasury", rt.treasury.address, imd],
    enabled: !!imd,
    refetchInterval: 20_000,
    queryFn: async () => {
      const t = { address: rt.treasury.address, abi: rt.treasury.abi } as const;
      const block = await client.getBlock();
      const names = ["ecosystemBalance", "operationsBalance", "founderBalance", "totalEcosystemWithdrawn", "totalOperationsClaimed", "totalFounderClaimed",
        "totalPayments", "totalIMDLocked", "totalSupplyBurned", "accountedBalance", "unallocatedBalance", "owner", "operationsRecipient", "founderRecipient", "garden"] as const;
      const r = await client.multicall({
        allowFailure: false, blockNumber: block.number,
        contracts: [
          ...names.map((functionName) => ({ ...t, functionName })),
          { address: rt.sink.address, abi: rt.sink.abi, functionName: "lockedBalance" },
          { address: rt.sink.address, abi: rt.sink.abi, functionName: "SUPPLY_REDUCING" },
          { address: imd!, abi: erc20Abi, functionName: "balanceOf", args: [rt.treasury.address] },
          { address: imd!, abi: erc20Abi, functionName: "totalSupply" },
        ] as any,
      });
      const o: Record<string, any> = {};
      names.forEach((n, i) => (o[n] = r[i]));
      return { ...o, sinkLocked: r[names.length] as bigint, supplyReducing: r[names.length + 1] as boolean, rawBalance: r[names.length + 2] as bigint,
        imdSupply: r[names.length + 3] as bigint, block: block.number, timestamp: Number(block.timestamp) } as any;
    },
  });
}

function OwnerPanel({ state, data }: { state: GardenState; data: any }) {
  const { rt } = useRuntime();
  const net = useNetworkStatus();
  const tx = useTx();
  const [dest, setDest] = useState("");
  const [amt, setAmt] = useState("");
  const [evidence, setEvidence] = useState(DOCUMENTED_EVIDENCE_HASH);
  const me = net.address?.toLowerCase();
  const isTreasuryOwner = me === String(data.owner).toLowerCase();
  const isGardenOwner = me === state.owner.toLowerCase();
  const isOps = me === String(data.operationsRecipient).toLowerCase();
  const isFounder = me === String(data.founderRecipient).toLowerCase();
  if (!net.isConnected || !(isTreasuryOwner || isGardenOwner || isOps || isFounder)) return null;
  if (net.wrongChain) return <section className="panel"><h2>Owner setup</h2><SwitchButton /></section>;
  let amount: bigint | null = null;
  try { amount = amt ? parseUnits(amt, state.decimals) : null; } catch { amount = null; }
  const withdrawn = (label: string) => (r: any) => {
    const ev = decodeReceipt(r, [rt.treasury.abi]).find((e) => e.eventName === "BucketWithdrawn");
    return ev ? `${label}: ${fmtToken(ev.args.amount)} IMD sent to ${short(ev.args.destination)} in block ${r.blockNumber}.` : "Succeeded with no withdrawal event.";
  };
  return (
    <section className="panel owner" aria-labelledby="own-h">
      <h2 id="own-h">Owner and recipient controls</h2>
      {isTreasuryOwner && data.garden === "0x0000000000000000000000000000000000000000" && (
        <div className="setup">
          <p>Purchases stay closed until the treasury is bound to the deployed garden {short(rt.garden.address)}. This can be done once.</p>
          <button type="button" className="btn btn-primary" disabled={tx.busy} onClick={() => tx.run("Bind garden", { address: rt.treasury.address, abi: rt.treasury.abi, functionName: "bindGarden", args: [rt.garden.address] },
            (r) => decodeReceipt(r, [rt.treasury.abi]).some((e) => e.eventName === "GardenBound") ? `Garden bound in block ${r.blockNumber}. Purchases are open.` : "Succeeded without a GardenBound event.")}>Bind garden to treasury</button>
        </div>
      )}
      {isGardenOwner && !state.collectionConfirmed && (
        <div className="setup">
          <label className="field">Evidence hash for the official collection (Keccak-256 of the reviewed evidence file; the value shown is the one documented in the README)
            <input value={evidence} onChange={(e) => setEvidence(e.target.value.trim())} spellCheck={false} />
          </label>
          <button type="button" className="btn btn-primary" disabled={tx.busy || !(isHex(evidence) && evidence.length === 66)} onClick={() => tx.run("Confirm NFT collection",
            { address: rt.garden.address, abi: rt.garden.abi, functionName: "confirmOfficialCollection", args: [evidence] },
            (r) => decodeReceipt(r, [rt.garden.abi]).some((e) => e.eventName === "OfficialCollectionConfirmed") ? `Collection confirmed in block ${r.blockNumber}. Free claims are open.` : "Succeeded without a confirmation event.")}>Confirm official collection</button>
        </div>
      )}
      {(isTreasuryOwner || isOps || isFounder) && (
        <div className="setup">
          <label className="field">Amount (IMD)<input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.trim())} /></label>
          {isTreasuryOwner && <label className="field">Ecosystem destination address<input value={dest} onChange={(e) => setDest(e.target.value.trim())} spellCheck={false} /></label>}
          <div className="row-actions">
            {isTreasuryOwner && <button type="button" className="btn btn-quiet" disabled={tx.busy || !amount || !isAddress(dest)} onClick={() => tx.run("Withdraw ecosystem", { address: rt.treasury.address, abi: rt.treasury.abi, functionName: "withdrawEcosystem", args: [dest, amount] }, withdrawn("Ecosystem withdrawal"))}>Withdraw ecosystem</button>}
            {isOps && <button type="button" className="btn btn-quiet" disabled={tx.busy || !amount} onClick={() => tx.run("Claim operations", { address: rt.treasury.address, abi: rt.treasury.abi, functionName: "claimOperations", args: [amount] }, withdrawn("Operations claim"))}>Claim operations</button>}
            {isFounder && <button type="button" className="btn btn-quiet" disabled={tx.busy || !amount} onClick={() => tx.run("Claim founder", { address: rt.treasury.address, abi: rt.treasury.abi, functionName: "claimFounder", args: [amount] }, withdrawn("Founder claim"))}>Claim founder</button>}
          </div>
        </div>
      )}
      <TxStatus state={tx.state} />
    </section>
  );
}

export function TreasuryPage({ state }: { state: GardenState | undefined }) {
  const { rt } = useRuntime();
  const q = useTreasury(state?.imd);
  const w = useWithdrawals();
  const d = q.data;
  const row = (label: string, v: bigint | undefined, note?: string) => (
    <tr><th scope="row">{label}{note && <span className="muted"> · {note}</span>}</th><td className="num">{fmtToken(v)} IMD</td></tr>
  );
  return (
    <div className="page">
      <h1>Treasury</h1>
      {q.isError && <p className="warn">Unable to read the treasury. <button type="button" className="link" onClick={() => q.refetch()}>Retry</button></p>}
      <div className="grid2">
        <section className="panel" aria-labelledby="b-h">
          <h2 id="b-h">Bucket balances</h2>
          <table className="kv"><tbody>
            {row("Ecosystem", d?.ecosystemBalance, "50% of each payment")}
            {row("Operations", d?.operationsBalance, "10%")}
            {row("Founder", d?.founderBalance, "10%")}
            {row("Ecosystem withdrawn", d?.totalEcosystemWithdrawn)}
            {row("Operations claimed", d?.totalOperationsClaimed)}
            {row("Founder claimed", d?.totalFounderClaimed)}
          </tbody></table>
          <p className="hint">{d ? `Read at block ${d.block} (${fmtDate(d.timestamp)}).` : "Reading…"}</p>
        </section>
        <section className="panel" aria-labelledby="l-h">
          <h2 id="l-h">Payments and locked IMD</h2>
          <table className="kv"><tbody>
            {row("Total paid", d?.totalPayments, "gross")}
            {row("Permanently locked", d?.totalIMDLocked, "30% of payments")}
            {row("Burn sink balance", d?.sinkLocked, "includes direct donations")}
            {row("Supply burned", d?.totalSupplyBurned)}
            {row("Treasury IMD held", d?.rawBalance)}
            {row("Unallocated", d?.unallocatedBalance, "unsolicited deposits")}
          </tbody></table>
          <p className="hint">IMD on Ethereum has no public burn. The 30% allocation is locked forever in the burn sink, which cannot send it anywhere; it still counts in IMD total supply{d ? ` (sink reports supply reducing: ${d.supplyReducing ? "yes" : "no"})` : ""}.</p>
        </section>
      </div>
      {state && d && <OwnerPanel state={state} data={d} />}
      <section className="panel" aria-labelledby="w-h">
        <h2 id="w-h">Withdrawals and claims</h2>
        {w.isError ? <p className="warn">Unable to read withdrawal events. <button type="button" className="link" onClick={() => w.refetch()}>Retry</button></p>
          : !w.data ? <p className="muted">Reading withdrawal events…</p>
          : w.data.length === 0 ? <p className="muted">No withdrawals or claims yet.</p>
          : <ul className="candle-list">{w.data.map((x) => (
              <li key={x.tx + x.bucket + x.amount}><span>{BUCKETS[x.bucket]}: {fmtToken(x.amount)} IMD to {short(x.destination)} · block {x.block.toString()}</span>
                <a href={rt.explorer("tx", x.tx)} target="_blank" rel="noreferrer">Transaction</a></li>))}</ul>}
      </section>
      <section className="panel" aria-labelledby="h-h">
        <h2 id="h-h">Holdings and custody</h2>
        <p>The owner withdraws ecosystem funds by hand to a destination they choose; every withdrawal is public above. What happens after withdrawal is manual custody outside these contracts. Investments made from it can lose value. Candle holders receive no financial claim, yield or return.</p>
        <p>Holdings held after withdrawal are not tracked onchain, so this page shows only the contract balances and the withdrawal record.</p>
      </section>
      <section className="panel" aria-labelledby="r-h">
        <h2 id="r-h">Road to $1B</h2>
        <p>A community aspiration, not a promise or a forecast.</p>
        <table className="kv"><tbody>
          <tr><th scope="row">IMD total supply</th><td className="num">{fmtToken(d?.imdSupply, 18, 0)} IMD</td></tr>
          <tr><th scope="row">Market cap</th><td>Unavailable</td></tr>
          <tr><th scope="row">FDV</th><td>Unavailable</td></tr>
        </tbody></table>
        <p className="hint">Supply is <code>totalSupply()</code> read from the IMD contract{d ? ` at block ${d.block}, ${fmtDate(d.timestamp)}` : ""}; it includes IMD locked in the burn sink. No price source is configured for this site, so market cap (price × circulating supply) and FDV (price × total supply) are not shown rather than estimated.</p>
      </section>
    </div>
  );
}
