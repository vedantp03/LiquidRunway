# LiquidRunway

An agent that keeps your USDC liquid enough to spend and act, while putting the rest to work — automatically.

**Rule:** protect liquidity first, invest second.

Built on [Arc](https://www.arc.io) (Circle’s USDC-native L1, **testnet**), using Circle Developer-Controlled Wallets.

## Live on Arc Testnet

| Resource | Link |
|---|---|
| Agent wallet | [0x2509…2d42](https://testnet.arcscan.app/address/0x2509e5b101b0c1f24ac66c398781cc80d0242d42) |
| Mock risk token (`mBTC`) | [0x2415…1ED8](https://testnet.arcscan.app/address/0x2415Ce27094A88c37A03e851Dd807a71fFfC1ED8) |
| Mock pool | [0x887B…a8AA](https://testnet.arcscan.app/address/0x887B6D722FE7350de2b8a7930acBF7210393a8AA) |
| Network | Arc Testnet · chain ID `5042002` · [RPC](https://rpc.testnet.arc.network) · [Faucet](https://faucet.circle.com) |

## What it does

You set a **liquidity floor** (e.g. keep 25% in USDC). The agent watches the wallet and:

1. **TOP_UP** — sells risk → USDC when the buffer is thin  
2. **DEPLOY** — puts idle USDC into the risk sleeve when above the floor + band  
3. **Logs why** each move happened (drift, spend, cooldown, etc.)

The MVP includes a CLI agent, on-chain mock risk sleeve (deterministic demo pricing), and a local dashboard (portfolio, allocation vs target, pause/approve, simulate spend, P&L).

## Quick start

```bash
git clone https://github.com/vedantp03/LiquidRunway.git
cd LiquidRunway
npm install
cp .env.example .env
```

Fill `.env` with Circle credentials and wallet/contract addresses (see [Setup](#setup)). **Never commit `.env` or `recovery/`.**

```bash
npm run balances          # confirm USDC on Arc
npm run agent:status      # portfolio + recent decisions
npm run agent:tick        # one rebalance cycle
npm run web               # dashboard → http://localhost:4319
```

Foundry contracts (optional, if re-deploying):

```bash
cd contracts
forge install   # if libs are missing
forge build
```

## Setup

1. Create a Circle API key + register an entity secret (`npm run setup:entity-secret`). Back up the recovery file offline — do not commit it.
2. Create an Arc Testnet wallet (`npm run setup:wallet`) and fund it from [faucet.circle.com](https://faucet.circle.com).
3. Deploy the mock risk asset + pool (needs a separate funded EOA for Foundry):

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

Copy addresses into `.env` as `MOCK_RISK_TOKEN_ADDRESS` / `MOCK_POOL_ADDRESS`.

## Agent commands

```bash
npm run agent:status
npm run agent:tick -- --dry-run
npm run agent:tick
npm run agent:run
npm run agent:pause
npm run agent:resume
npm run web
```

## How decisions work

Each cycle reads USDC + risk balances on Arc, values the risk sleeve via the pool, then:

- Liquidity **below** `liquidityFloorPct` → **TOP_UP**
- Liquidity **above** `floor + rebalanceBandPct` → **DEPLOY**
- Otherwise → **HOLD**

Guardrails in `agent/policy.ts`: max trade size, cooldown, slippage. Audit trail: `agent/state/decisions.jsonl` (local only).

## Demo story

1. Wallet starts ~100% USDC → `agent:tick` **DEPLOYs** idle cash into `mBTC`.
2. Simulate a spend (dashboard **Spend** button, or `node agent/scripts/simulateSpend.ts 10`) to break the floor.
3. Next cycle **TOP_UPs** and logs the reason.

Optional: change the mock price from the deployer key:

```bash
cast send $MOCK_POOL_ADDRESS "setPrice(uint256,string)" <newPrice> "price move" \
  --rpc-url https://rpc.testnet.arc.network --private-key $DEPLOYER_PRIVATE_KEY
```

(`price` is USDC with 6 decimals per whole risk unit, e.g. `65000000000` = $65,000.)

## Project structure

```
LiquidRunway/
├── agent/           # decision loop, Circle execution, audit log
├── contracts/       # MockRiskAsset + MockPool (Foundry)
├── web/             # dashboard (API + static UI)
├── .env.example
├── SECURITY.md
└── package.json
```

## Security

See [SECURITY.md](./SECURITY.md). Rotate any credentials that were ever committed or shared.

## License

MIT (hackathon MVP — use at your own risk on testnet only).
