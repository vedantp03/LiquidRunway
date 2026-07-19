import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "./config.ts";

let client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | undefined;

/**
 * Shared Circle developer-controlled-wallets client. Lazily created so that
 * scripts which don't need the entity secret (e.g. before it's registered)
 * can still import config.ts without throwing.
 */
export function getCircleClient() {
  if (!client) {
    client = initiateDeveloperControlledWalletsClient({
      apiKey: config.circleApiKey,
      entitySecret: config.circleEntitySecret,
    });
  }
  return client;
}
