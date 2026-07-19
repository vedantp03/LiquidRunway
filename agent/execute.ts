import { parseUnits, maxUint256, type Address } from "viem";
import { getCircleClient } from "./circleClient.ts";
import { config } from "./config.ts";
import type { Policy } from "./policy.ts";
import type { Decision } from "./decide.ts";
import type { Portfolio } from "./portfolio.ts";
import {
  requireAddresses,
  readAllowance,
  quoteUsdcToRisk,
  quoteRiskToUsdc,
  USDC_DECIMALS,
} from "./arc.ts";

const TERMINAL_SUCCESS = new Set(["CONFIRMED", "COMPLETE"]);
const TERMINAL_FAILURE = new Set(["FAILED", "DENIED", "CANCELLED"]);

export interface ExecutionResult {
  txIds: string[];
}

function applySlippage(amount: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round((1 - slippagePct) * 10_000));
  return (amount * bps) / 10_000n;
}

/**
 * Executes a rebalancing decision on Arc via the Circle Wallets API:
 * ensures the pool is approved to pull the input token, then submits the swap.
 * Each on-chain tx is polled to a terminal state before returning.
 */
export async function executeDecision(
  decision: Decision,
  portfolio: Portfolio,
  policy: Policy,
): Promise<ExecutionResult> {
  if (decision.action === "HOLD") return { txIds: [] };

  const { riskToken, pool, usdc } = requireAddresses();
  const txIds: string[] = [];

  const usdcBaseUnits = parseUnits(decision.amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);

  if (decision.action === "DEPLOY") {
    // USDC -> risk. Don't spend more USDC than we hold.
    const amountIn = usdcBaseUnits > portfolio.raw.usdc ? portfolio.raw.usdc : usdcBaseUnits;
    const expectedOut = await quoteUsdcToRisk(pool, amountIn);
    const minOut = applySlippage(expectedOut, policy.slippagePct);

    await ensureAllowance(usdc, pool, amountIn, txIds);
    const swapId = await execContract(pool, "swapUsdcForRisk(uint256,uint256)", [
      amountIn.toString(),
      minOut.toString(),
    ]);
    txIds.push(swapId);
    await waitForTx(swapId);
    return { txIds };
  }

  // TOP_UP: risk -> USDC. Size the risk to sell so we recover ~amountUsdc.
  // With the mock pool's linear, fee-less price, quoteUsdcToRisk(x) is exactly
  // the risk needed to realize x USDC.
  let riskAmountIn = await quoteUsdcToRisk(pool, usdcBaseUnits);
  if (riskAmountIn > portfolio.raw.risk) riskAmountIn = portfolio.raw.risk;
  const expectedUsdcOut = await quoteRiskToUsdc(pool, riskAmountIn);
  const minOut = applySlippage(expectedUsdcOut, policy.slippagePct);

  await ensureAllowance(riskToken, pool, riskAmountIn, txIds);
  const swapId = await execContract(pool, "swapRiskForUsdc(uint256,uint256)", [
    riskAmountIn.toString(),
    minOut.toString(),
  ]);
  txIds.push(swapId);
  await waitForTx(swapId);
  return { txIds };
}

async function ensureAllowance(token: Address, spender: Address, needed: bigint, txIds: string[]): Promise<void> {
  const current = await readAllowance(token, portfolioOwner(), spender);
  if (current >= needed) return;
  const approveId = await execContract(token, "approve(address,uint256)", [spender, maxUint256.toString()]);
  txIds.push(approveId);
  await waitForTx(approveId);
}

function portfolioOwner(): Address {
  if (!config.walletAddress) throw new Error("WALLET_ADDRESS is not set in .env.");
  return config.walletAddress as Address;
}

async function execContract(contractAddress: Address, abiFunctionSignature: string, abiParameters: unknown[]): Promise<string> {
  const client = getCircleClient();
  const response = await client.createContractExecutionTransaction({
    walletId: config.walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = response.data?.id;
  if (!id) throw new Error(`Contract execution (${abiFunctionSignature}) returned no transaction id`);
  return id;
}

async function waitForTx(id: string, timeoutMs = 90_000, intervalMs = 3_000): Promise<void> {
  const client = getCircleClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await client.getTransaction({ id });
    const state = response.data?.transaction?.state;
    if (state && TERMINAL_SUCCESS.has(state)) return;
    if (state && TERMINAL_FAILURE.has(state)) {
      throw new Error(`Transaction ${id} reached terminal state ${state}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Transaction ${id} did not confirm within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
