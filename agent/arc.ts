import { createPublicClient, http, getAddress, BaseError, type Address } from "viem";
import { arcTestnet } from "viem/chains";
import { config } from "./config.ts";

/** Read-only viem client for Arc Testnet. All balances/prices are read straight
 * from the RPC so we don't depend on Circle indexing our custom mock token. */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(config.arcRpcUrl, {
    batch: { batchSize: 20, wait: 16 },
    retryCount: 0,
  }),
});

/** Public Arc Testnet RPC returns JSON-RPC error code -32011 ("request limit
 * reached") when we're throttled. Viem doesn't retry that code by default, so
 * we detect it here and back off exponentially. */
function isRateLimit(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  const message = `${err.shortMessage ?? ""} ${err.message ?? ""}`;
  if (/request limit|rate limit|too many requests|-32011/i.test(message)) return true;
  return err.walk((e) => (e as { code?: number }).code === -32011) != null;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1_000, 2_500, 5_000, 10_000, 20_000, 30_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimit(err) || attempt === delays.length) throw err;
      const delay = delays[attempt];
      console.warn(`  RPC rate-limited, retrying in ${delay}ms (attempt ${attempt + 1}/${delays.length})...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** All contract reads must go through these wrappers so the retry-on-rate-limit
 * logic is applied uniformly. Delegating to the underlying method preserves
 * viem's rich per-call type inference. */
export const readContract: typeof publicClient.readContract = ((params: unknown) =>
  withRateLimitRetry(() => (publicClient.readContract as (p: unknown) => Promise<unknown>)(params))) as typeof publicClient.readContract;

export const multicall: typeof publicClient.multicall = ((params: unknown) =>
  withRateLimitRetry(() => (publicClient.multicall as (p: unknown) => Promise<unknown>)(params))) as typeof publicClient.multicall;

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
  return readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export async function readAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  return readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

const decimalsCache = new Map<Address, number>();

export async function readDecimals(token: Address): Promise<number> {
  const cached = decimalsCache.get(token);
  if (cached !== undefined) return cached;
  const value = await readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  decimalsCache.set(token, value);
  return value;
}

export async function quoteRiskToUsdc(pool: Address, riskAmountIn: bigint): Promise<bigint> {
  return readContract({
    address: pool,
    abi: poolAbi,
    functionName: "quoteRiskToUsdc",
    args: [riskAmountIn],
  });
}

export async function quoteUsdcToRisk(pool: Address, usdcAmountIn: bigint): Promise<bigint> {
  return readContract({
    address: pool,
    abi: poolAbi,
    functionName: "quoteUsdcToRisk",
    args: [usdcAmountIn],
  });
}
