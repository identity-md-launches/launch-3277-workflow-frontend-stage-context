import { STYLES } from "../config";
import { useRuntime, type GardenState } from "../chain";
import { short } from "../format";

export function HowPage({ state }: { state: GardenState | undefined }) {
  const { rt } = useRuntime();
  const links: [string, string][] = [
    ["Wish Garden", rt.garden.address], ["Treasury", rt.treasury.address], ["Burn sink", rt.sink.address],
    ...(state ? ([["IMD token", state.imd], ["identity.md NFT", state.collection]] as [string, string][]) : []),
  ];
  return (
    <div className="page prose">
      <h1>How it works</h1>
      <section className="panel">
        <h2>Price</h2>
        <p>One candle costs exactly 1 IMD, in any of the seven styles: {STYLES.map((s) => `${s.name} (${s.color})`).join(", ")}. Ten candles cost 10 IMD. There is no app fee. ETH pays only the network gas.</p>
        <p>Buying takes two steps the first time: approve the garden to spend exactly your total, then light the candles. Up to 50 candles fit in one transaction; larger orders are sent as several.</p>
      </section>
      <section className="panel">
        <h2>Where each IMD goes</h2>
        <table className="kv"><tbody>
          <tr><th scope="row">30% locked forever</th><td>Sent to the burn sink, a contract with no way to move tokens out. IMD has no public burn, so this does not reduce total supply.</td></tr>
          <tr><th scope="row">50% ecosystem</th><td>Treasury bucket the owner manages for projects built on IMD.</td></tr>
          <tr><th scope="row">10% operations</th><td>Garden development; only the fixed operations address can claim it.</td></tr>
          <tr><th scope="row">10% founder</th><td>Only the fixed founder address can claim it.</td></tr>
        </tbody></table>
        <p>The split happens in the same transaction as the purchase, with checked transfers and public events.</p>
      </section>
      <section className="panel">
        <h2>Free candles for NFT holders</h2>
        <p>Each identity.md NFT token ID can claim one free candle, once, ever. The contract checks current ownership when you claim, and a used token ID stays used after it is sold. Several NFTs in one wallet can each claim. Claims cost no IMD.</p>
        <p>Status now: {state ? (state.claimsEnabled ? "open." : `closed. ${state.claimsReason}.`) : "reading…"}</p>
      </section>
      <section className="panel">
        <h2>Permanence</h2>
        <p>Each candle is an onchain record with an ID, the buyer's address, its style, the time and a fixed garden slot. Candles never expire and cannot be sold or transferred. New candles fill the next slots outward from the entrance; earlier candles never move. A candle glows brighter for its first day, then burns calmly.</p>
        <p>The page reads the garden directly from public Ethereum RPCs. No server, account or wallet is needed to look around.</p>
      </section>
      <section className="panel">
        <h2>Custody and risk</h2>
        <p>The owner holds the ecosystem bucket and withdraws it manually. Anything done with withdrawn funds is outside these contracts and can lose value. Candles carry no financial claim, prize, yield or return.</p>
      </section>
      <section className="panel">
        <h2>Contracts on {rt.network.name}</h2>
        <ul className="candle-list">
          {links.map(([n, a]) => <li key={a}><span>{n}</span><a href={rt.explorer("address", a)} target="_blank" rel="noreferrer"><code className="addr">{short(a)}</code></a></li>)}
        </ul>
        <p className="hint">Chain ID {rt.manifest.chainId}. Deployed from source commit <code className="addr">{rt.manifest.sourceCommit.slice(0, 10)}</code>. ABI hashes {rt.abiVerified ? "match" : "do not match"} the deployment manifest.</p>
      </section>
    </div>
  );
}
