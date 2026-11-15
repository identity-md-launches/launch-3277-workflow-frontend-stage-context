import { useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { STYLES } from "../config";
import { decodeReceipt, scanNfts, useCandleIdsOf, useRuntime, useTx, type CandleRecord, type GardenState } from "../chain";
import { ConnectSheet, SwitchButton, useNetworkStatus } from "../components/Wallet";
import { StylePicker } from "../components/StylePicker";
import { TxStatus } from "../components/TxStatus";
import { fmtDate, plural } from "../format";
import { exportWishes, importWishes, loadWishes } from "../wish";
import { slotPosition } from "../layout";

function FreeClaims({ state }: { state: GardenState | undefined }) {
  const { rt, client } = useRuntime();
  const net = useNetworkStatus();
  const tx = useTx();
  const [nfts, setNfts] = useState<{ id: number; claimedCandle: number }[] | null>(null);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [style, setStyle] = useState(0);
  const scan = async () => {
    if (!net.address || !state) return;
    setScanning(true); setScanErr(null);
    try { const r = await scanNfts(client, rt, state.collection, net.address); setNfts(r); setPicked(new Set(r.filter((n) => !n.claimedCandle).slice(0, state.maxBatch).map((n) => n.id))); }
    catch { setScanErr("Unable to read NFT ownership from the RPC. Try again."); }
    finally { setScanning(false); }
  };
  const claim = async () => {
    const ids = [...picked].slice(0, state?.maxBatch ?? 50);
    const req = ids.length === 1
      ? { address: rt.garden.address, abi: rt.garden.abi, functionName: "claimFreeCandle", args: [BigInt(ids[0]), style] }
      : { address: rt.garden.address, abi: rt.garden.abi, functionName: "claimFreeCandles", args: [ids.map(BigInt), style] };
    const r = await tx.run(`Claim ${plural(ids.length, "free candle", "free candles")}`, req, (rc) => {
      const ev = decodeReceipt(rc, [rt.garden.abi]).filter((e) => e.eventName === "FreeCandleClaimed");
      return ev.length ? `Block ${rc.blockNumber}: ${ev.map((e) => `NFT #${e.args.tokenId} lit candle #${e.args.candleId}`).join(", ")}.` : "The transaction succeeded but recorded no claim events.";
    });
    if (r) await scan();
  };
  return (
    <section className="panel" aria-labelledby="free-h">
      <h2 id="free-h">Free candle for identity.md NFT holders</h2>
      <p>Each identity.md NFT token ID claims one free candle, once, for life. Gas is paid in ETH; no IMD is charged.</p>
      {!state ? <p className="muted">Reading claim status…</p>
        : !state.claimsEnabled ? <p className="note">Free claims are closed: {state.claimsReason}.</p>
        : <p className="ok">Free claims are open.</p>}
      {!net.isConnected ? <ConnectSheet /> : net.wrongChain ? <SwitchButton /> : (
        <>
          <button type="button" className="btn btn-quiet" disabled={scanning || !state} onClick={scan}>{scanning ? "Checking NFTs…" : "Check my NFTs"}</button>
          {scanErr && <p className="warn" role="status">{scanErr}</p>}
          {nfts && (nfts.length === 0 ? <p className="muted">This wallet holds no identity.md NFT right now.</p> : (
            <>
              <ul className="nft-list">
                {nfts.map((n) => (
                  <li key={n.id}>
                    <label>
                      <input type="checkbox" disabled={!!n.claimedCandle} checked={picked.has(n.id)} onChange={(e) => {
                        const s = new Set(picked); if (e.target.checked) s.add(n.id); else s.delete(n.id); setPicked(s);
                      }} />
                      NFT #{n.id} {n.claimedCandle ? <span className="muted">· used for candle #{n.claimedCandle}</span> : <span className="ok">· eligible</span>}
                    </label>
                  </li>
                ))}
              </ul>
              <StylePicker value={style} onChange={setStyle} />
              <button type="button" className="btn btn-primary" disabled={!state?.claimsEnabled || !picked.size || tx.busy || !rt.abiVerified} onClick={claim}>
                {state?.claimsEnabled ? `Claim ${plural(Math.min(picked.size, state.maxBatch), "free candle", "free candles")}` : "Free claims closed"}
              </button>
            </>
          ))}
        </>
      )}
      <TxStatus state={tx.state} />
    </section>
  );
}

export function MyCandlesPage({ state, records, onShow }: { state: GardenState | undefined; records: CandleRecord[]; onShow: (id: number) => void }) {
  const net = useNetworkStatus();
  const [view, setView] = useState("");
  const viewAddr = isAddress(view) ? (view as Address) : undefined;
  const who = viewAddr ?? net.address;
  const ids = useCandleIdsOf(who);
  const wishes = loadWishes();
  const file = useRef<HTMLInputElement>(null);
  const [wishMsg, setWishMsg] = useState<string | null>(null);
  return (
    <div className="page">
      <h1>My candles</h1>
      <div className="grid2">
        <section className="panel" aria-labelledby="hist-h">
          <h2 id="hist-h">Confirmed candles</h2>
          <label className="field">View any address (no wallet needed)
            <input value={view} onChange={(e) => setView(e.target.value.trim())} placeholder={net.address ?? "0x…"} spellCheck={false} autoComplete="off" />
          </label>
          {!who ? <p className="muted">Connect a wallet or paste an address to see its candles.</p>
            : ids.isError ? <p className="warn">Unable to read candles for this address. <button type="button" className="link" onClick={() => ids.refetch()}>Retry</button></p>
            : !ids.data ? <p className="muted">Reading candles…</p>
            : ids.data.length === 0 ? <p className="muted">No confirmed candles for this address yet.</p>
            : (
              <ul className="candle-list">
                {ids.data.map((id) => {
                  const r = records[id - 1];
                  const p = r ? slotPosition(r.position) : null;
                  return (
                    <li key={id}>
                      <span className="dot" style={{ background: r ? STYLES[r.style].wax : "#333" }} aria-hidden="true" />
                      <span><strong>#{id}</strong> {r ? `${STYLES[r.style].name} · ${fmtDate(r.createdAt)} · ${r.freeClaim ? `free, NFT #${r.nftTokenId}` : "paid"} · terrace ${p!.section + 1}, row ${p!.row + 1}` : "loading record…"}
                        {wishes[id] && <span className="wish-text"> · “{wishes[id]}”</span>}</span>
                      <button type="button" className="link" onClick={() => onShow(id)}>Show in garden</button>
                    </li>
                  );
                })}
              </ul>
            )}
          <div className="row-actions">
            <button type="button" className="btn btn-quiet" onClick={exportWishes}>Export wishes</button>
            <button type="button" className="btn btn-quiet" onClick={() => file.current?.click()}>Import wishes</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try { await importWishes(f); setWishMsg("Wishes imported into this browser."); } catch { setWishMsg("That file is not a wish export."); }
            }} />
          </div>
          <p className="hint">Wishes live only in this browser. Export them before clearing site data or changing devices.</p>
          {wishMsg && <p className="hint" role="status">{wishMsg}</p>}
        </section>
        <FreeClaims state={state} />
      </div>
    </div>
  );
}
