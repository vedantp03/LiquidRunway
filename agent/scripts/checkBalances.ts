/**
 * Reads the agent wallet's USDC + mock risk-asset balances on Arc Testnet.
 * Useful for sanity-checking setup before wiring up the decision loop.
 *
 * Run with: npm run balances
 */
import { getCircleClient } from "../circleClient.ts";
import { config } from "../config.ts";

async function main() {
  const client = getCircleClient();

  const response = await client.getWalletTokenBalance({
    id: config.walletId,
  });

  const balances = response.data?.tokenBalances ?? [];
  if (balances.length === 0) {
    console.log("No token balances found. Has this wallet been funded from the faucet yet?");
    console.log("Faucet: https://faucet.circle.com");
    return;
  }

  console.log(`Balances for wallet ${config.walletId}:`);
  for (const balance of balances) {
    console.log(`  ${balance.token?.symbol ?? balance.token?.name ?? "?"}: ${balance.amount}`);
  }
}

main().catch((err) => {
  console.error("Failed to read balances:", err);
  process.exit(1);
});
