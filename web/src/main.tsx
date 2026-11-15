import "@fontsource/cormorant-garamond/latin-600.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { loadRuntime, makePublicClient, makeWagmiConfig } from "./config";
import { RuntimeContext } from "./chain";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);
loadRuntime().then((rt) => {
  const wagmi = makeWagmiConfig(rt);
  const client = makePublicClient(rt);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } } });
  root.render(
    <StrictMode>
      <WagmiProvider config={wagmi}>
        <QueryClientProvider client={qc}>
          <RuntimeContext.Provider value={{ rt, client }}>
            <App />
          </RuntimeContext.Provider>
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>,
  );
}).catch((e) => {
  root.render(<main className="page"><h1>Unable to load the garden</h1><p>The deployment configuration could not be read: {String(e?.message ?? e)}</p></main>);
});
