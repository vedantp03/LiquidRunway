import { getAddress, formatUnits, type Address } from "viem";
import { config } from "./config.ts";
import {
  requireAddresses,
  quoteRiskToUsdc,
  multicall,
  erc20Abi,
  poolAbi,
  USDC_DECIMALS,
} from "./arc.ts";

export interface Portfolio {
  /** Raw base-unit balances (needed for on-chain execution). */
  raw: {
    usdc: bigint;
    risk: bigint;
    riskValueUsdc: bigint;
  };
  riskDecimals: number;
  /** What the risk sleeve is currently allocated to. */
  riskSymbol: string;
  riskName: string;
  riskTokenAddress: Address;
  /** Current price of one whole risk unit, in USDC. */
  riskPriceUsdc: number;
  /** Human-readable USDC values (for decisions / logging). */
  usdc: number;
  riskUnits: number;
  riskValueUsdc: number;
  totalValueUsdc: number;
  /** Fraction of the portfolio currently held in USDC (0..1). */
  liquidityPct: number;
  walletAddress: Address;
}

/** Reads the agent wallet's balances from Arc and values the risk sleeve in USDC. */
export async function readPortfolio(): Promise<Portfolio> {
  const { usdc: usdcAddr, riskToken, pool } = requireAddresses();
  if (!config.walletAddress) {
    throw new Error("WALLET_ADDRESS is not set in .env. Run `npm run setup:wallet` first.");
  }
  const owner = getAddress(config.walletAddress);

  // Bundle the reads into one RPC call via Multicall3 (deployed on Arc at
  // 0xcA11bde05977b3631167028862bE2a173976CA11). The public Arc Testnet RPC
  // hard-limits us per-call, so batching at the network layer isn't enough.
  const [usdcRaw, riskRaw, riskDecimals, riskSymbol, riskName, priceRaw] = await multicall({
    allowFailure: false,
    contracts: [
      { address: usdcAddr, abi: erc20Abi, functionName: "balanceOf", args: [owner] },
      { address: riskToken, abi: erc20Abi, functionName: "balanceOf", args: [owner] },
      { address: riskToken, abi: erc20Abi, functionName: "decimals" },
      { address: riskToken, abi: erc20Abi, functionName: "symbol" },
      { address: riskToken, abi: erc20Abi, functionName: "name" },
      { address: pool, abi: poolAbi, functionName: "price" },
    ],
  });

  const riskValueRaw = riskRaw > 0n ? await quoteRiskToUsdc(pool, riskRaw) : 0n;

  const usdc = Number(formatUnits(usdcRaw, USDC_DECIMALS));
  const riskUnits = Number(formatUnits(riskRaw, riskDecimals));
  const riskValueUsdc = Number(formatUnits(riskValueRaw, USDC_DECIMALS));
  // Pool price is expressed in USDC's 6-decimal base units per whole risk unit.
  const riskPriceUsdc = Number(formatUnits(priceRaw, USDC_DECIMALS));
  const totalValueUsdc = usdc + riskValueUsdc;
  const liquidityPct = totalValueUsdc > 0 ? usdc / totalValueUsdc : 1;

  return {
    raw: { usdc: usdcRaw, risk: riskRaw, riskValueUsdc: riskValueRaw },
    riskDecimals,
    riskSymbol,
    riskName,
    riskTokenAddress: riskToken,
    riskPriceUsdc,
    usdc,
    riskUnits,
    riskValueUsdc,
    totalValueUsdc,
    liquidityPct,
    walletAddress: owner,
  };
}
