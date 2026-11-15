# The Wish Garden: frontend

Vite + React + TypeScript site for the deployed Wish Garden contracts on Ethereum (chain 1). It is a
static export in `../dist/` with a relative base (`./`) and hash routing (`#/garden`, `#/candles`,
`#/treasury`, `#/how`), so it runs from an IPFS gateway subpath or an ENS name without a server.

## Configuration: one place

At runtime the app loads **`./imd-deployment.json`** (the attested deployment manifest) and the ABI files
it lists (`./abi/<Contract>.json`). Contract addresses, chain id, ABIs, public RPC URLs, the explorer and
the `wallet_addEthereumChain` parameters all come from that file. The source has no second address/chain map.
`src/config.ts` turns it into the viem chain, the wagmi config (EIP-6963 injected wallets + Coinbase Wallet,
no WalletConnect relay, no project ID), and the public client (RPC fallback across `network.rpcUrls`).
It also re-hashes each ABI in the browser and keeps transactions disabled when a hash does not match.

The manifest is generated, not hand-edited. `scripts/manifest.mjs` takes:

- `deployment/handoff.json`: a verbatim copy of the workflow deployment handoff;
- `deployment/network.json`: a verbatim copy of the network chain table (`network`, `walletAddChain`);
- `../docs/abi/<Contract>.json`: the implementation-derived ABIs at the deployed source commit
  (`fba4372e5a9fd01640eb01f00cd8a25a07ea7cbd`).

It checks each ABI's canonical Keccak (sorted keys, compact JSON) against the handoff's `abiHash`,
copies the ABIs to `dist/abi/`, hashes every exported file (SHA-256) and writes `dist/imd-deployment.json`.
The handoff has no `poolKey` (it is an `evm_contracts` launch), so the manifest has none, and the site has
no swap or liquidity flow. IMD is approved directly to the garden contract, which pulls exactly the
purchase total. The contracts define no Uniswap route.

## Install, build, preview

```sh
cd web
npm ci                 # installs from package-lock.json
npm run build          # tsc typecheck + vite build to ../dist + manifest generation
npm run typecheck
npm test               # vitest: layout, fixtures, manifest integrity, mocked-wallet interaction flows
npm run preview        # serves ../dist locally
node scripts/og-image.mjs   # regenerates public/og.png (only needed if the share image changes)
```

Always commit `../dist` together with the source after `npm run build`. Any change to the export means
the manifest must be regenerated, and the build script does that automatically.

## Rendering fixtures

`#/garden?fixture=0`, `?fixture=100`, `?fixture=3000` and `?fixture=10000` render generated candles under a
visible "Fixture … Not onchain data" banner. They never mix with onchain records.

## What lives where

| Path | Purpose |
| --- | --- |
| `src/config.ts` | runtime manifest loading, chain, wagmi and public client, style constants |
| `src/chain.ts` | contract reads, candle record paging and cache, log paging, NFT scan, transaction runner |
| `src/layout.ts` | stable slot → terrace placement (`section = position / 256`, row, column) |
| `src/garden/GardenCanvas.tsx` | canvas renderer: shared glow sprites, culling, LOD, pan/zoom/select |
| `src/components/Wallet.tsx` | connect sheet, chain switch with `wallet_addEthereumChain` fallback |
| `src/pages/*` | Garden (buy), My candles (history, free claims, wishes), Treasury, How it works |
| `tests/*` | vitest suites |

See `../docs/frontend-validation.md` for validation results and limits, and `../docs/DESIGN.md` for the design system.
