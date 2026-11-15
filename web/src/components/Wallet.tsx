import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { WALLET_ICONS } from "./wallet-icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";
import { useRuntime } from "../chain";
import { short } from "../format";

/** wallet_switchEthereumChain, falling back to wallet_addEthereumChain with the manifest's parameters. */
export async function switchToChain(connector: Connector, params: { chainId: string } & Record<string, unknown>) {
  const provider = (await connector.getProvider()) as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
  const sw = () => provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: params.chainId }] });
  try { await sw(); } catch (e: any) {
    const code = e?.code ?? e?.data?.originalError?.code ?? e?.cause?.code;
    if (code === 4902 || /unrecognized|unknown chain|not been added|not added/i.test(String(e?.message))) {
      await provider.request({ method: "wallet_addEthereumChain", params: [params] });
      await sw();
    } else throw e;
  }
}

export function useNetworkStatus() {
  const { rt } = useRuntime();
  const { isConnected, chainId, connector, address } = useAccount();
  return { isConnected, address, connector, wrongChain: isConnected && chainId !== rt.chain.id, chainName: rt.network.name };
}

export function SwitchButton({ className = "btn btn-primary" }: { className?: string }) {
  const { rt } = useRuntime();
  const { connector } = useAccount();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={busy || !connector} onClick={async () => {
        setErr(null); setBusy(true);
        try { await switchToChain(connector!, rt.walletAddChain as any); } catch (e: any) { setErr(e?.code === 4001 ? "Switch rejected in the wallet." : "The wallet could not switch networks."); }
        finally { setBusy(false); }
      }}>{busy ? "Switching…" : `Switch to ${rt.network.name}`}</button>
      {err && <span className="note warn" role="status">{err}</span>}
    </>
  );
}

/** One connect control: EIP-6963 wallets, "Open in" rows on phones, Coinbase Smart Wallet. */
export function ConnectSheet({ compact = false }: { compact?: boolean }) {
  const mobile = isMobileBrowser();
  const { address, isConnected } = useAccount();
  const { wrongChain } = useNetworkStatus();
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!open && !menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setMenu(false); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, menu]);
  useEffect(() => { if (isConnected) setOpen(false); }, [isConnected]);

  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")]
    .filter((c) => !(c.id === "injected" && named));
  const label = (c: Connector) => (c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name);
  const icon = (c: Connector) => c.icon ?? WALLET_ICONS[c.id];

  if (isConnected && address) {
    if (wrongChain) return <SwitchButton className="btn btn-primary" />;
    return (
      <div className="acct">
        <button type="button" className="btn btn-quiet" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{short(address)}</button>
        {menu && <div className="acct-menu"><button type="button" className="btn btn-quiet" onClick={() => { setMenu(false); disconnect(); }}>Disconnect</button></div>}
      </div>
    );
  }
  return (
    <>
      <button type="button" className={compact ? "btn btn-primary" : "btn btn-primary btn-wide"} onClick={() => { reset(); setOpen(true); }}>Connect</button>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Connect a wallet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><h2>Connect a wallet</h2><button type="button" className="x" aria-label="Close" autoFocus onClick={() => setOpen(false)}>×</button></div>
            {mobile && OPEN_IN.map((w) => (
              <a key={w.id} className="row" href={w.href(location.href)}>
                <span className="ic"><img width={28} height={28} src={WALLET_ICONS[w.id]} alt="" /></span>
                <span>Open in {w.name}</span>
              </a>
            ))}
            {listed.filter((c) => !mobile || c.type !== "injected").map((c) => (
              <button type="button" className="row" key={c.uid} onClick={() => connect({ connector: c })} disabled={isPending}>
                <span className="ic">{icon(c) ? <img width={28} height={28} src={icon(c)} alt="" /> : <span className="ic-blank" aria-hidden="true" />}</span>
                <span>{label(c)}{isPending && variables?.connector === c ? " · opening…" : ""}</span>
              </button>
            ))}
            {error && <p className="note warn" role="status">{/reject|denied/i.test(error.message) ? "Connection rejected in the wallet." : "That wallet did not connect. Try another."}</p>}
          </div>
        </div>
      )}
    </>
  );
}
