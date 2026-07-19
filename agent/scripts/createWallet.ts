/**
 * One-time setup: creates a wallet set + a developer-controlled wallet on
 * Arc Testnet for the agent to operate. Requires CIRCLE_ENTITY_SECRET to
 * already be set (run `npm run setup:entity-secret` first).
 *
 * Run with: npm run setup:wallet
 */
import { appendFileSync } from "node:fs";
import { getCircleClient } from "../circleClient.ts";

async function main() {
  const client = getCircleClient();

  console.log("Creating wallet set...");
  const walletSetResponse = await client.createWalletSet({
    name: "LiquidRunway",
  });

  const walletSet = walletSetResponse.data?.walletSet;
  if (!walletSet?.id) {
    throw new Error("Wallet set creation failed: no ID returned");
  }
  console.log(`Wallet set created: ${walletSet.id}`);

  console.log("Creating wallet on ARC-TESTNET...");
  const walletResponse = await client.createWallets({
    walletSetId: walletSet.id,
    blockchains: ["ARC-TESTNET"],
    count: 1,
    accountType: "EOA",
  });

  const wallet = walletResponse.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error("Wallet creation failed: no wallet returned");
  }

  console.log(`Wallet created: ${wallet.id}`);
  console.log(`Address: ${wallet.address}`);

  appendFileSync(
    ".env",
    `\nWALLET_SET_ID=${walletSet.id}\nWALLET_ID=${wallet.id}\nWALLET_ADDRESS=${wallet.address}\n`,
  );

  console.log("\nWALLET_SET_ID, WALLET_ID, and WALLET_ADDRESS added to .env");
  console.log(`\nNext: fund this address with testnet USDC from https://faucet.circle.com`);
  console.log(`  Address: ${wallet.address}`);
}

main().catch((err) => {
  console.error("Failed to create wallet:", err);
  process.exit(1);
});
