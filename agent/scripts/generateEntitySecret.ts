/**
 * One-time setup: generates a 32-byte entity secret and registers it with
 * Circle so it can authorize signing on our developer-controlled wallets.
 *
 * Run with: npm run setup:entity-secret
 *
 * On success this:
 *  - writes a recovery file to ./recovery/ (back this up somewhere safe —
 *    it's the only way to reset the entity secret if it's ever lost)
 *  - appends CIRCLE_ENTITY_SECRET to .env
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import { config as loadEnv } from "dotenv";

loadEnv();

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is not set in .env");
  }

  if (process.env.CIRCLE_ENTITY_SECRET) {
    console.log(
      "CIRCLE_ENTITY_SECRET is already set in .env — skipping generation.\n" +
        "Delete it from .env first if you really want to register a new one " +
        "(this will invalidate signing for any wallets tied to the old one).",
    );
    return;
  }

  const entitySecret = randomBytes(32).toString("hex");
  const recoveryFilePath = "./recovery";
  mkdirSync(recoveryFilePath, { recursive: true });

  console.log("Registering new entity secret with Circle...");
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryFilePath,
  });

  appendFileSync(".env", `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`);

  console.log("\nEntity secret registered and added to .env as CIRCLE_ENTITY_SECRET.");
  console.log(`Recovery file saved under: ${recoveryFilePath}/`);
  console.log(
    "Back up that recovery file somewhere safe (password manager, secure " +
      "storage) — it's the ONLY way to recover access if the entity secret " +
      "is lost, and Circle cannot regenerate it for you.",
  );
  if (response?.data) {
    console.log("\nCircle response:", JSON.stringify(response.data, null, 2));
  }
}

main().catch((err) => {
  console.error("Failed to generate/register entity secret:", err);
  process.exit(1);
});
