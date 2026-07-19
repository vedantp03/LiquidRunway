import { createPublicClient, http, getAddress, type Address } from "viem";
import { arcTestnet } from "viem/chains";
import { config } from "./config.ts";

/** Read-only viem client for Arc Testnet. All balances/prices are read straight
 * from the RPC so we don't depend on Circle indexing our custom mock token. */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(config.arcRpcUrl),
});

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const poolAbi = [
  {
    type: "function",
    name: "price",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteUsdcToRisk",
    stateMutability: "view",
    inputs: [{ name: "usdcAmountIn", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteRiskToUsdc",
    stateMutability: "view",
    inputs: [{ name: "riskAmountIn", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Throws a clear error if the mock contracts haven't been deployed / wired into .env yet. */
export function requireAddresses(): { usdc: Address; riskToken: Address; pool: Address } {
  if (!config.mockRiskTokenAddress || !config.mockPoolAddress) {
    throw new Error(
      "MOCK_RISK_TOKEN_ADDRESS / MOCK_POOL_ADDRESS are not set in .env. " +
        "Deploy the contracts (see contracts/README-style steps in README.md) and add the addresses first.",
    );
  }
  return {
    usdc: getAddress(config.usdcAddress),
    riskToken: getAddress(config.mockRiskTokenAddress),
    pool: getAddress(config.mockPoolAddress),
  };
}

export const USDC_DECIMALS = 6;

export async function readBalance(token: Address, owner: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export async function readAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function readDecimals(token: Address): Promise<number> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export async function quoteRiskToUsdc(pool: Address, riskAmountIn: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "quoteRiskToUsdc",
    args: [riskAmountIn],
  });
}

export async function quoteUsdcToRisk(pool: Address, usdcAmountIn: bigint): Promise<bigint> {
  return publicClient.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "quoteUsdcToRisk",
    args: [usdcAmountIn],
  });
}
