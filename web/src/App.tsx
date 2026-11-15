import { useEffect, useMemo, useState } from "react";
import { useCandles, useGardenState } from "./chain";
import { ConnectSheet } from "./components/Wallet";
import { GardenPage } from "./pages/Garden";
import { MyCandlesPage } from "./pages/MyCandles";
import { TreasuryPage } from "./pages/Treasury";
import { HowPage } from "./pages/How";
import { fixtureFromLocation, makeFixture } from "./fixtures";

const ROUTES = [["garden", "Garden"], ["candles", "My candles"], ["treasury", "Treasury"], ["how", "How it works"]] as const;
type Route = (typeof ROUTES)[number][0];
const parse = (): Route => { const m = /^#\/(\w+)/.exec(location.hash); return (ROUTES.find((r) => r[0] === m?.[1])?.[0] ?? "garden") as Route; };

export function App() {
  const [route, setRoute] = useState<Route>(parse);
  const [fixture, setFixture] = useState<number | null>(() => fixtureFromLocation());
  const [selected, setSelected] = useState<number | null>(() => { const m = /[?&]candle=(\d+)/.exec(location.hash); return m ? Number(m[1]) : null; });
  useEffect(() => {
    const on = () => { setRoute(parse()); setFixture(fixtureFromLocation()); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { document.getElementById("main")?.focus({ preventScroll: true }); }, [route]);
  const gs = useGardenState();
  const candles = useCandles(fixture === null ? gs.data?.total : undefined);
  const fixtureRecords = useMemo(() => (fixture !== null ? makeFixture(fixture) : null), [fixture]);
  const records = fixtureRecords ?? candles.data ?? [];
  const error = fixture !== null ? null : gs.isError || candles.isError ? "rpc" : null;
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="top">
        <a className="brand" href="#/garden" aria-label="The Wish Garden, home">
          <img src="./favicon.svg" width="28" height="28" alt="" />
          <span>The Wish Garden</span>
        </a>
        <nav aria-label="Pages">
          {ROUTES.map(([id, label]) => <a key={id} href={`#/${id}`} aria-current={route === id ? "page" : undefined}>{label}</a>)}
        </nav>
        <div className="wallet"><ConnectSheet compact /></div>
      </header>
      <main id="main" tabIndex={-1}>
        {route === "garden" && <GardenPage state={gs.data} records={records} loading={fixture === null && (gs.isLoading || candles.isLoading)} error={error}
          fixture={fixture} selected={selected} onSelect={setSelected} retry={() => { gs.refetch(); candles.refetch(); }} />}
        {route === "candles" && <MyCandlesPage state={gs.data} records={records} onShow={(id) => { setSelected(id); location.hash = `#/garden?candle=${id}`; }} />}
        {route === "treasury" && <TreasuryPage state={gs.data} />}
        {route === "how" && <HowPage state={gs.data} />}
      </main>
      <footer className="foot">
        <span>Permanent candles</span><span>Private wishes</span><span>Onchain records</span><span>Free to explore</span>
      </footer>
    </>
  );
}
