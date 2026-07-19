import { getAddress, formatUnits, type Address } from "viem";
import { config } from "./config.ts";
import {
  requireAddresses,
  readBalance,
  readDecimals,
  quoteRiskToUsdc,
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

  const [usdcRaw, riskRaw, riskDecimals] = await Promise.all([
    readBalance(usdcAddr, owner),
    readBalance(riskToken, owner),
    readDecimals(riskToken),
  ]);

  const riskValueRaw = riskRaw > 0n ? await quoteRiskToUsdc(pool, riskRaw) : 0n;

  const usdc = Number(formatUnits(usdcRaw, USDC_DECIMALS));
  const riskUnits = Number(formatUnits(riskRaw, riskDecimals));
  const riskValueUsdc = Number(formatUnits(riskValueRaw, USDC_DECIMALS));
  const totalValueUsdc = usdc + riskValueUsdc;
  const liquidityPct = totalValueUsdc > 0 ? usdc / totalValueUsdc : 1;

  return {
    raw: { usdc: usdcRaw, risk: riskRaw, riskValueUsdc: riskValueRaw },
    riskDecimals,
    usdc,
    riskUnits,
    riskValueUsdc,
    totalValueUsdc,
    liquidityPct,
    walletAddress: owner,
  };
}
