/**
 * Entry point for the rebalancing agent loop. Environment/tooling setup is
 * done (Circle client, wallet, mock risk asset + pool) — this is where the
 * actual balance-read -> decide -> execute -> log loop gets built next:
 *
 *   1. balances.ts  — read USDC + risk-asset balances for config.walletId
 *   2. decide.ts     — compare current liquidity % to policy.liquidityFloorPct,
 *                       apply maxTradeSizeUsdc/cooldownSeconds, emit an action + reason
 *   3. execute.ts    — call the Circle SDK to submit the swap against MockPool
 *   4. log.ts        — append {timestamp, action, amount, reason} to an audit trail
 */
import { defaultPolicy } from "./policy.ts";

async function main() {
  console.log("LiquidRunway agent — policy:", defaultPolicy);
  console.log("TODO: wire up balances -> decide -> execute -> log");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
