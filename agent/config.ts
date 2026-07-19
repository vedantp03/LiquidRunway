import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Check your .env file.`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const config = {
  circleApiKey: required("CIRCLE_API_KEY"),
  get circleEntitySecret(): string {
    return required("CIRCLE_ENTITY_SECRET");
  },
  arcRpcUrl: process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network",
  arcChainId: Number(process.env.ARC_TESTNET_CHAIN_ID ?? 5042002),
  usdcAddress: process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000",
  get walletId(): string {
    return required("WALLET_ID");
  },
  walletSetId: optional("WALLET_SET_ID"),
  walletAddress: optional("WALLET_ADDRESS"),
  mockRiskTokenAddress: optional("MOCK_RISK_TOKEN_ADDRESS"),
  mockPoolAddress: optional("MOCK_POOL_ADDRESS"),
};
