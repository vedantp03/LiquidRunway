/**
 * Demo helper: sends USDC out of the agent wallet to a burn address to
 * simulate a real-world "spend" that eats into the liquidity buffer.
 *
 * Usage:
 *   node agent/scripts/simulateSpend.ts <amountUsdc>
 * e.g.
 *   node agent/scripts/simulateSpend.ts 10
 *
 * After this runs, the next `npm run agent:tick` should see liquidity below
 * the floor and emit a TOP_UP.
 */
import { getCircleClient } from "../circleClient.ts";
import { config } from "../config.ts";

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TERMINAL_SUCCESS = new Set(["CONFIRMED", "COMPLETE"]);
const TERMINAL_FAILURE = new Set(["FAILED", "DENIED", "CANCELLED"]);

async function waitForTx(id: string, timeoutMs = 90_000): Promise<void> {
  const client = getCircleClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await client.getTransaction({ id });
    const state = response.data?.transaction?.state;
    if (state && TERMINAL_SUCCESS.has(state)) return;
    if (state && TERMINAL_FAILURE.has(state)) {
      throw new Error(`Transaction ${id} reached terminal state ${state}`);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Transaction ${id} did not confirm within ${timeoutMs}ms`);
}

async function main() {
  const amount = process.argv[2];
  if (!amount) {
    console.error("Usage: node agent/scripts/simulateSpend.ts <amountUsdc>");
    process.exit(1);
  }

  const client = getCircleClient();
  console.log(`Sending ${amount} USDC from wallet to ${BURN_ADDRESS} (simulated spend)...`);

  if (!config.walletAddress) throw new Error("WALLET_ADDRESS is not set in .env.");
  const response = await client.createTransaction({
    walletAddress: config.walletAddress,
    blockchain: "ARC-TESTNET",
    tokenAddress: config.usdcAddress,
    destinationAddress: BURN_ADDRESS,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const id = response.data?.id;
  if (!id) throw new Error("createTransaction returned no id");
  console.log(`  Transaction id: ${id}`);
  await waitForTx(id);
  console.log("  Confirmed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
