# LiquidRunway

An agent that keeps your USDC liquid enough to spend and act, while putting the rest to work — automatically, on [Arc](https://www.arc.io) (Circle's USDC-native L1, currently testnet).

## Status

Environment setup:

- [x] Node/TypeScript project scaffolded (`package.json`, `tsconfig.json`)
- [x] Circle developer-controlled-wallets SDK + viem installed
- [x] Foundry contracts workspace (`contracts/`) with a mock risk-asset token + owner-priced mock pool, compiling cleanly
- [x] Entity secret generated + registered (recovery file under `./recovery/` — back it up somewhere safe)
- [x] Wallet created on Arc Testnet (address in `.env` as `WALLET_ADDRESS`)
- [x] Wallet funded (60 USDC on Arc Testnet)
- [x] Mock contracts deployed to Arc Testnet (addresses in `.env`)
- [x] Decision loop built and executed end-to-end: DEPLOY then TOP_UP verified on Arc, wallet rebalances to the 25% floor
- [x] Web dashboard (`web/`): live portfolio, allocation-vs-target, current decision with approve/pause, and the decision log

Note: scripts run via plain `node agent/scripts/*.ts` (Node's built-in TypeScript
support), not `tsx` — `tsx`'s CJS/ESM interop currently breaks on this SDK's
named exports when run as a file. Relative imports use explicit `.ts`
extensions (`allowImportingTsExtensions` in `tsconfig.json`) since there's no
build step.

## Setup

1. **Fund the wallet** with testnet USDC from [faucet.circle.com](https://faucet.circle.com):
   ```
   0x2509e5b101b0c1f24ac66c398781cc80d0242d42
   ```
   Then confirm with `npm run balances`.
2. **Deploy the mock risk-asset + pool** to Arc Testnet:
   ```bash
   cd contracts
   forge script script/Deploy.s.sol:Deploy \
     --rpc-url $ARC_TESTNET_RPC_URL \
     --private-key $DEPLOYER_PRIVATE_KEY \
     --broadcast
   ```
   Copy the printed addresses into `.env` as `MOCK_RISK_TOKEN_ADDRESS` / `MOCK_POOL_ADDRESS`. (This needs its own funded EOA + private key to deploy from — separate from the Circle-managed wallet — since Foundry signs locally.)
3. **Run the agent (CLI):**
   ```bash
   npm run agent:status          # portfolio + recent decisions
   npm run agent:tick -- --dry-run  # decide + log, no execution
   npm run agent:tick            # one real cycle (executes if warranted)
   npm run agent:run             # continuous loop (every 30s)
   npm run agent:pause           # stop executing (still reads/logs)
   npm run agent:resume
   ```
4. **Or run the dashboard:**
   ```bash
   npm run web                   # http://localhost:4319
   ```
   Shows live portfolio, allocation vs. the floor/deploy band, the current
   decision (with **Approve & execute** and **Pause**), a **Simulate spend**
   button for the demo, and the full decision log. The server reuses the same
   engine as the CLI, and caches the (rate-limited) Arc RPC reads.

## How the agent decides

Rule: **protect liquidity first, invest second.** Each cycle reads USDC + risk
balances from Arc, values the risk sleeve in USDC via the pool, then:

- Liquidity **below** `liquidityFloorPct` → **TOP_UP** (sell risk → USDC) immediately.
- Liquidity **above** `floor + rebalanceBandPct` → **DEPLOY** idle USDC → risk.
- Otherwise → **HOLD**.

Guardrails (`agent/policy.ts`): `maxTradeSizeUsdc` caps any single trade,
`cooldownSeconds` prevents thrashing, `slippagePct` sets swap `minOut`. Every
decision (executed or not) is appended to `agent/state/decisions.jsonl` with its
reason; cooldown/pause state lives in `agent/state/state.json`.

## Demo flow

1. Wallet starts ~100% USDC → first `agent:tick` **DEPLOYs** idle cash into the risk sleeve (this also seeds the pool with USDC).
2. Bump the risk price down (or simulate a spend) to break the floor:
   ```bash
   cd contracts && cast send $MOCK_POOL_ADDRESS "setPrice(uint256,string)" <newPrice> "price drop" \
     --rpc-url $ARC_TESTNET_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY
   ```
3. Next `agent:tick` sees liquidity below floor → **TOP_UP** in a couple of USDC txs, with the reason logged to the audit trail.

## Project structure

```
LiquidRunway/
├── agent/
│   ├── config.ts           # loads/validates .env
│   ├── circleClient.ts      # shared Circle SDK client
│   ├── arc.ts               # viem client + ERC20/pool read helpers
│   ├── portfolio.ts         # reads balances, values risk sleeve in USDC
│   ├── policy.ts            # floor %, band, max trade size, cooldown, slippage
│   ├── decide.ts            # propose() (pure) + decide() (pause/cooldown-gated)
│   ├── execute.ts           # Circle approve + swap, polls tx to terminal state
│   ├── engine.ts            # shared logic: cached portfolio, snapshot, tick, approve, simulate spend
│   ├── log.ts               # audit trail + cooldown/pause state
│   ├── index.ts             # CLI orchestrator (tick/run/status/pause/resume)
│   ├── scripts/             # one-off setup + demo scripts
│   └── state/                # local audit-log / decision state (gitignored)
├── contracts/               # Foundry: mock risk asset + owner-priced pool
│   ├── src/MockRiskAsset.sol
│   ├── src/MockPool.sol
│   └── script/Deploy.s.sol
├── web/                      # dashboard
│   ├── server.ts            # HTTP API + static serving (wraps engine.ts)
│   └── public/              # index.html, styles.css, app.js
├── .env / .env.example
└── package.json
```

## Network reference (Arc Testnet)

| Field | Value |
|---|---|
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
