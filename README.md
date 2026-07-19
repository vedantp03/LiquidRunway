# LiquidRunway

An agent that keeps your USDC liquid enough to spend and act, while putting the rest to work — automatically, on [Arc](https://www.arc.io) (Circle's USDC-native L1, currently testnet).

## Status

Environment setup:

- [x] Node/TypeScript project scaffolded (`package.json`, `tsconfig.json`)
- [x] Circle developer-controlled-wallets SDK + viem installed
- [x] Foundry contracts workspace (`contracts/`) with a mock risk-asset token + owner-priced mock pool, compiling cleanly
- [x] Entity secret generated + registered (recovery file under `./recovery/` — back it up somewhere safe)
- [x] Wallet created on Arc Testnet (address in `.env` as `WALLET_ADDRESS`)
- [ ] Wallet funded from the faucet
- [ ] Mock contracts deployed to Arc Testnet
- [ ] Decision loop (`agent/balances.ts`, `decide.ts`, `execute.ts`, `log.ts`) — not yet written

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
3. **Build the decision loop** in `agent/`: balance reader → drift/policy check → executor → audit log (see `agent/index.ts` for the outline).

## Project structure

```
LiquidRunway/
├── agent/
│   ├── config.ts          # loads/validates .env
│   ├── circleClient.ts     # shared Circle SDK client
│   ├── policy.ts           # floor %, max trade size, cooldown
│   ├── index.ts             # agent loop entry point (TODO: wire up)
│   ├── scripts/             # one-off setup scripts
│   └── state/                # local audit-log / decision state (gitignored)
├── contracts/               # Foundry: mock risk asset + owner-priced pool
│   ├── src/MockRiskAsset.sol
│   ├── src/MockPool.sol
│   └── script/Deploy.s.sol
├── web/                      # UI (not yet scaffolded)
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
