# Frontend validation: The Wish Garden

Worker report for the frontend stage. This is not an independent certification. Export: `dist/` (12 files plus
`imd-deployment.json`, about 0.87 MiB). Source: `web/`. Design system: `docs/DESIGN.md`.

## 1. Scope and assumptions

- Pages: Garden (`#/garden`, live canvas + buy panel), My candles (`#/candles`, history by connected or pasted
  address, free NFT claims, private wishes), Treasury (`#/treasury`, buckets, locked IMD, withdrawals, owner and
  recipient controls, custody, Road to $1B), How it works (`#/how`).
- Deployment: `evm_contracts` handoff, Ethereum chain 1, launch `91ad2891-dbb6-4e23-9d17-0e213faa2264`, source commit
  `fba4372e…`. Contracts: WishGardenBurnSink `0x8417…8e91`, WishGardenTreasury `0x929a…07aa`, WishGarden `0xaabd…4ca2`.
  The handoff has no `poolKey` and the contracts define no swap. IMD is approved straight to the garden for exactly the
  order total. No Uniswap route, quote or Permit2 step exists to build; the `network` block is still copied unchanged.
- The live site URL, IPFS CID and GitHub publication come after this assignment (publisher). None is claimed here.

## 2. Chain state read on this worker (eth_call via `https://ethereum-rpc.publicnode.com`, block 26421132)

| Read | Result |
| --- | --- |
| `eth_chainId` | 1 |
| code size: garden / treasury / sink | 7854 / 6508 / 324 bytes (nonempty) |
| ABI canonical keccak vs handoff `abiHash` | all three match (sorted-key compact JSON) |
| `treasury.garden()` | `0x0000…0000`: **not bound yet**, so purchases revert `TreasuryNotConfigured` |
| `garden.freeClaimsStatus()` | `(false, "Owner has not confirmed the verified official NFT collection")` |
| `totalCandles` | 0 |
| owner (both), operations and founder recipients | `0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9` |
| `CANDLE_PRICE` / `MAX_BATCH_SIZE` / `MAX_PAGE_SIZE` | 1e18 / 50 / 100 |
| IMD `decimals` / `symbol` / `totalSupply` | 18 / IMD / 4,233,074.86 IMD |
| sink `SUPPLY_REDUCING` | false: the UI says "permanently locked", never "burned" |
| official NFT `name` / `totalSupply` | identity.md / 2000 |

**Pending owner setup (reported honestly in the UI):** the owner must call `bindGarden` and
`confirmOfficialCollection`. When the connected wallet is the owner, the Treasury page shows one control for each.
Visitors see "Purchases not open yet" and the contract's exact free-claim reason.

## 3. Commands and results (final source)

| Command | Result |
| --- | --- |
| `npm run build` (`tsc -p .` + `vite build` + `scripts/manifest.mjs`) | pass; "3 contracts, 12 assets, 887863 bytes" |
| `npm run typecheck` | pass (TypeScript 7.0.2, strict) |
| `npm test` (vitest 5, jsdom) | **26 passed / 26** |
| static smoke (`dist/` served under `/ipfs/cid/` by a one-shot Node server) | every relative reference in index.html and all 12 manifest assets returned 200; the bundle contains no contract address and fetches `imd-deployment.json` |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | **did not run**: Playwright 1.x installed into the scratch area, but Chromium cannot start on this machine (`libglib-2.0.so.0` and 19 other system libraries missing; no root and no apt index to fetch them). No probe result exists. |

Test coverage (`web/tests/`):

- `layout.test.ts`: 10,000 slots map to distinct points; slot positions never change as the garden grows; sections
  expand from the entrance; the 0/100/3000/10000 fixtures have exact sequential records; 10k layout runs in under 200 ms.
- `manifest.test.ts`: exact top-level keys; launchId/chainId/sourceCommit/attestationHash and the contract set copied
  from the handoff; `network` and `walletAddChain` byte-equal to network.json; ABI hashes; SHA-256 of every listed asset;
  relative paths; title, favicon, description, og:title, og:image.
- `app.test.tsx` (mocked wallet account, mocked `writeContract`, mocked RPC client):
  walletless reads plus Connect; fixture banner; purchase disabled while unbound, with the `bindGarden` reason;
  **exact approval** (`approve(garden, 10e18)` on IMD) reported from the receipt's `Approval` event;
  purchase reports candle ids **from receipt logs** while the simulation returned 999 (never shown);
  reverted receipt; wallet rejection ("Nothing was sent"); decoded simulation revert with no wallet prompt;
  insufficient balance; wrong chain then `wallet_switchEthereumChain`, then on 4902 `wallet_addEthereumChain` with exactly
  the manifest's `walletAddChain`, then switch again; My candles shows the contract's claim reason; Treasury labels
  locked IMD and shows market cap and FDV as unavailable.

## 4. Better Interface review (six domains)

The rendered checks could not run (no working browser, see above). The coverage below is source review plus jsdom.

| Domain | Status | Evidence / not verified |
| --- | --- | --- |
| Accessibility | Checked (source + jsdom roles) | Native buttons, radios, checkboxes and labels. Named icon buttons. Skip link. `:focus-visible` ring. Stable `role=status` live region. Dialog closes on Escape. 44px targets. Reduced-motion guard (CSS + canvas loop). The canvas is focusable with an aria-label and arrow/± keys. **Not verified:** tab order in a real browser, focus return after closing the sheet, an automated audit, screen reader. |
| Layout | Checked (source) | Mobile-first stacking under 900px, nav as a second row under 820px, logical properties for the fixed parts, `minmax(0,…)` on grid tracks. **Not verified:** rendered overflow at 320/390/1440, 200% zoom, RTL. |
| Writing | Checked | Verb-first actions ("Approve exactly 10 IMD", "Light 2 candles", "Claim 1 free candle", "Switch to Ethereum"). Errors say what happened and what to do. "Locked", never "burned". Market cap is "Unavailable", never estimated. |
| Typography | Checked (source) | 5-step scale, 3 weights, 2 families + mono for code, `balance`/`pretty`, tabular numbers. **Not verified:** that the loaded font renders, wrapping at real widths. |
| Colors | Checked (declared tokens only) | Role-named tokens. **Not verified:** rendered contrast (no measured ratios are claimed). |
| UI | Checked (source) | States: hover (gated), active, focus, disabled, loading ("Reading…"), empty, error with Retry, all tx phases. No `transition: all`. Flat panels. **Not verified:** motion replay. |

### Findings and fixes

| Sev | Location | Finding | Fix / recheck |
| --- | --- | --- | --- |
| High | `web/src/garden/GardenCanvas.tsx:12` | Without a 2D canvas context, sprite creation threw and blanked the whole app (reproduced in jsdom: 10 tests failed) | Guard; the renderer draws nothing and the rest of the page works. Tests pass. |
| Medium | `web/src/styles.css:115` | Selected swatch had border plus inset shadow on one surface (design-critic "chrome") | Border plus background tint only |
| Medium | `web/src/styles.css:106` | Desktop fixture banner at `bottom:64px` could cover the zoom buttons | Moved to the top of the stage, below the heading |
| Medium | `web/src/pages/Garden.tsx:105` | "Show in garden" / `?candle=` selected a candle but did not move the camera | Focus the camera on the selected record |
| Low | `web/src/styles.css:120` | Physical `margin-left:auto` on the total | `margin-inline-start` |
| Low | `tsconfig.json` | Tests lacked Node types, so the typecheck failed | `@types/node` added |

## 5. Not performed / limits (stated, not failed silently)

- **Browser:** no screenshots, no 320/390/1440 rendered overflow check, no first-screen confirmation at 390, no console
  or resource inspection in a real engine, no WebKit run, no physical device. Chromium could not launch (missing system
  libraries). The first-screen layout at 390×844 is estimated from CSS only (header ≈100px + canvas 320px + stage footer +
  style row + quantity + button ≈ 700px) and is **unverified**.
- **Live chain writes:** no transaction was broadcast (none is authorized). Purchases, approvals, free claims,
  withdrawals and owner setup were exercised only against mocked receipts. Purchases and claims are currently closed
  onchain pending owner setup, so no live end-to-end purchase is possible yet.
- **Event indexing:** candle records are read with `getCandles` pages (immutable, cached in localStorage, last page
  re-read for reorgs). Withdrawals use `getContractEvents` from the treasury's deploy block, found by an `eth_getCode`
  binary search (~25 calls once, cached). This needs an archive-capable RPC. Not exercised live with nonzero data.
- **Free-claim discovery** reads `ownerOf` for every NFT id up to the collection's `totalSupply()` (2000) through multicall.
  Not run live.
- **Gas:** the page sets no gas limit; wallet estimates are used. No `gasleft()` dependent path was identified in the ABI
  surface; not tested on a local fork.
- **Wallet rows:** Rabby "Open in" is omitted because the pinned connector reference gives no exact Rabby link format.
  WalletConnect is not wired (no project ID supplied, by design).
- **Market cap / FDV:** no price source is configured, so both are shown as unavailable. Supply is read live with its block and time.
- **Visual reference:** followed in palette and motifs. The garden art is drawn procedurally on canvas (original frogs,
  arch, terraces, moon). It is not a painted illustration like the mockup.
- **DESIGN.md** lives in `docs/` because the repository root is outside this assignment's write scope.

## 6. Completion

**Incomplete for the stated scope.** The functional app, export, manifest, tests and documentation are delivered and
pass build, typecheck, 26 interaction tests and the static smoke test. The required rendered browser checks and the
taste probe could not run on this machine (missing Chromium system libraries). Purchases and claims await the owner's
onchain setup. Publication (live URL, CID, GitHub) happens after this assignment.
