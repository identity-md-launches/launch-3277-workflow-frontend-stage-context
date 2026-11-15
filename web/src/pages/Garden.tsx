import { useEffect, useMemo, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { STYLES } from "../config";
import { decodeReceipt, useRuntime, useTokenAccount, useTx, type CandleRecord, type GardenState } from "../chain";
import { GardenCanvas, type Quality } from "../garden/GardenCanvas";
import { ConnectSheet, SwitchButton, useNetworkStatus } from "../components/Wallet";
import { StylePicker } from "../components/StylePicker";
import { TxStatus } from "../components/TxStatus";
import { fmtDate, fmtToken, plural, short } from "../format";
import { saveWish } from "../wish";

function BuyPanel({ state }: { state: GardenState | undefined }) {
  const { rt } = useRuntime();
  const net = useNetworkStatus();
  const [qty, setQty] = useState(1);
  const [style, setStyle] = useState(0);
  const [wish, setWish] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const tx = useTx();
  const acct = useTokenAccount(state?.imd, rt.garden.address);
  const price = state?.price;
  const total = price !== undefined ? price * BigInt(qty) : undefined;
  const maxBatch = state?.maxBatch ?? 50;
  const batches = Math.ceil(qty / maxBatch);
  const needsApproval = acct.data && total !== undefined && acct.data.allowance < total;
  const short_ = acct.data && total !== undefined && acct.data.balance < total;

  const approve = () => tx.run(`Approve ${fmtToken(total)} IMD`,
    { address: state!.imd, abi: erc20Abi, functionName: "approve", args: [rt.garden.address, total!] },
    (r) => {
      const ev = decodeReceipt(r, [erc20Abi]).find((e) => e.eventName === "Approval");
      return ev ? `The garden may now spend exactly ${fmtToken(ev.args.value)} IMD from this wallet.` : "Receipt has no Approval event; allowance re-read below.";
    });

  const buy = async () => {
    let left = qty, done = 0;
    const lit: number[] = [];
    for (let b = 1; left > 0; b++) {
      const n = Math.min(left, maxBatch);
      setProgress(batches > 1 ? `Transaction ${b} of ${batches}` : null);
      const receipt = await tx.run(`Light ${plural(n, "candle", "candles")}`,
        { address: rt.garden.address, abi: rt.garden.abi, functionName: "buyCandles", args: [BigInt(n), style] },
        (r) => {
          const ids = decodeReceipt(r, [rt.garden.abi]).filter((e) => e.eventName === "CandleCreated").map((e) => Number(e.args.candleId));
          lit.push(...ids);
          return ids.length
            ? `Block ${r.blockNumber}: ${ids.length === 1 ? `candle #${ids[0]}` : `candles #${ids[0]} to #${ids[ids.length - 1]}`} lit in ${STYLES[style].name}.`
            : "The transaction succeeded but created no candle events.";
        });
      if (!receipt || receipt.status !== "success") break;
      done += n; left -= n;
    }
    saveWish(lit, wish);
    setProgress(done && done < qty ? `${done} of ${qty} candles confirmed; the rest were not sent.` : null);
  };

  let action: React.ReactNode;
  if (!net.isConnected) action = <ConnectSheet />;
  else if (net.wrongChain) action = <SwitchButton className="btn btn-primary btn-wide" />;
  else if (!rt.abiVerified) action = <button className="btn btn-primary btn-wide" disabled>ABI check failed</button>;
  else if (!state) action = <button className="btn btn-primary btn-wide" disabled>Reading the garden…</button>;
  else if (!state.purchasesEnabled) action = <button className="btn btn-primary btn-wide" disabled>Purchases not open yet</button>;
  else if (!acct.data) action = <button className="btn btn-primary btn-wide" disabled>Reading your IMD…</button>;
  else if (short_) action = <button className="btn btn-primary btn-wide" disabled>Not enough IMD</button>;
  else if (needsApproval) action = <button className="btn btn-primary btn-wide" disabled={tx.busy} onClick={approve}>Approve exactly {fmtToken(total)} IMD</button>;
  else action = <button className="btn btn-primary btn-wide" disabled={tx.busy} onClick={buy}>Light {plural(qty, "candle", "candles")}</button>;

  return (
    <section className="panel buy" aria-labelledby="buy-h">
      <h2 id="buy-h" className="sr-only">Light candles</h2>
      <StylePicker value={style} onChange={setStyle} />
      <div className="qty-row">
        <div className="stepper" role="group" aria-label="Quantity">
          <button type="button" className="icon-btn" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <input aria-label="Number of candles" inputMode="numeric" value={qty}
            onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); setQty(Number.isFinite(n) ? Math.min(Math.max(n, 1), 1000) : 1); }} />
          <button type="button" className="icon-btn" aria-label="One more" disabled={qty >= 1000} onClick={() => setQty((q) => Math.min(1000, q + 1))}>+</button>
        </div>
        <button type="button" className={`chip ${qty === 10 ? "on" : ""}`} aria-pressed={qty === 10} onClick={() => setQty(10)}>10</button>
        <p className="total"><span className="num">{total !== undefined ? fmtToken(total) : "…"}</span> IMD</p>
      </div>
      <p className="hint">1 IMD per candle, any style. ETH pays gas only.{batches > 1 ? ` Sent as ${batches} transactions of up to ${maxBatch}.` : ""}</p>
      {action}
      {state && !state.purchasesEnabled && <p className="note">The owner has not yet bound this garden to its treasury (<code>bindGarden</code>). Purchases open after that transaction.</p>}
      {net.isConnected && acct.data && <p className="hint">Wallet: {fmtToken(acct.data.balance)} IMD · approved for the garden: {fmtToken(acct.data.allowance)} IMD</p>}
      {progress && <p className="hint" role="status">{progress}</p>}
      <TxStatus state={tx.state} />
      <details className="wish">
        <summary>Add a private wish (optional)</summary>
        <label htmlFor="wish-text">Wish text stays in this browser only. It never goes onchain. Clearing site data or losing this device erases it; export it from My Candles.</label>
        <textarea id="wish-text" maxLength={500} rows={2} value={wish} onChange={(e) => setWish(e.target.value)} />
      </details>
    </section>
  );
}

export function GardenPage(props: { state: GardenState | undefined; records: CandleRecord[]; loading: boolean; error: string | null; fixture: number | null; selected: number | null; onSelect: (id: number | null) => void; retry: () => void }) {
  const { state, records, loading, error, fixture, selected, onSelect, retry } = props;
  const { address } = useNetworkStatus();
  const reduced = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const [quality, setQuality] = useState<Quality>(() => (typeof innerWidth !== "undefined" && innerWidth < 700 ? "mobile" : "full"));
  const [focus, setFocus] = useState<{ ids: number[]; nonce: number } | null>(null);
  const mine = useMemo(() => new Set(address && fixture === null ? records.filter((r) => r.purchaser.toLowerCase() === address.toLowerCase()).map((r) => r.id) : []), [address, records, fixture]);
  const sel = selected ? records[selected - 1] : undefined;
  // a deep link (#/garden?candle=12, "Show in garden") centres the camera on that candle once loaded
  useEffect(() => { if (sel) setFocus({ ids: [sel.id], nonce: Date.now() }); }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [findMsg, setFindMsg] = useState<string | null>(null);
  const label = fixture !== null ? `Rendering fixture with ${records.length} generated candles` : `The Wish Garden with ${plural(records.length, "confirmed candle", "confirmed candles")}. Drag to pan, scroll or pinch to zoom, arrow keys to move.`;
  return (
    <div className="garden-page">
      <div className="stage">
        {fixture !== null && <p className="fixture-banner" role="note">Fixture: {fixture.toLocaleString("en-US")} generated candles for rendering tests. Not onchain data.</p>}
        <div className="stage-head">
          <h1>Light a candle that stays</h1>
          <p>Permanent onchain candles on Ethereum, 1 IMD each.</p>
        </div>
        <GardenCanvas records={records} selectedId={selected} onSelect={onSelect} highlight={mine} focus={focus} quality={quality} reducedMotion={reduced} label={label} />
        <div className="stage-foot">
          <p className="count">
            {error ? <span className="warn">Unable to read the garden. <button type="button" className="link" onClick={retry}>Retry</button></span>
              : loading ? "Reading candles…"
              : records.length === 0 ? "No candles lit yet. The first confirmed candle lights the entrance."
              : `${plural(records.length, "candle", "candles")} lit${fixture === null && state ? ` · ${state.paid.toLocaleString("en-US")} paid · ${state.free.toLocaleString("en-US")} free` : ""}`}
          </p>
          <div className="stage-tools">
            <button type="button" className="btn btn-quiet" disabled={!address || fixture !== null} onClick={() => {
              if (!mine.size) { setFindMsg("This wallet has no confirmed candles yet."); return; }
              setFindMsg(null); setFocus({ ids: [...mine], nonce: Date.now() });
            }}>Find my candles</button>
            <button type="button" className="btn btn-quiet" aria-pressed={quality === "mobile"} onClick={() => setQuality((q) => (q === "full" ? "mobile" : "full"))}>
              {quality === "mobile" ? "Battery saver on" : "Battery saver off"}
            </button>
          </div>
          {findMsg && <p className="hint" role="status">{findMsg}</p>}
          {sel && (
            <div className="selected" role="status">
              <strong>Candle #{sel.id}</strong> · {STYLES[sel.style].name} · {fixture !== null ? "fixture" : short(sel.purchaser)} · lit {fmtDate(sel.createdAt)} · {sel.freeClaim ? `free claim, NFT #${sel.nftTokenId}` : "paid"} · slot {sel.position + 1}
              <button type="button" className="x" aria-label="Clear selection" onClick={() => onSelect(null)}>×</button>
            </div>
          )}
        </div>
      </div>
      <BuyPanel state={state} />
    </div>
  );
}
export type { Address };
