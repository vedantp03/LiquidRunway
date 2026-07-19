/** Policy config for the rebalancing agent — the "two numbers" from the pitch, plus guardrails. */
export interface Policy {
  /** Minimum fraction of total portfolio value that must stay in USDC, e.g. 0.25 for 25%. */
  liquidityFloorPct: number;
  /**
   * Deadband above the floor before idle USDC gets deployed into the risk sleeve.
   * Liquidity is protected immediately when it dips below the floor, but we only
   * invest excess cash once it's comfortably above (floor + band) to avoid thrashing.
   */
  rebalanceBandPct: number;
  /** Largest single rebalancing trade the agent may place, in USDC. */
  maxTradeSizeUsdc: number;
  /** Minimum seconds between two rebalancing actions, to avoid thrashing. */
  cooldownSeconds: number;
  /** Slippage tolerance applied to swap minOut, e.g. 0.01 for 1%. */
  slippagePct: number;
}

export const defaultPolicy: Policy = {
  liquidityFloorPct: 0.25,
  rebalanceBandPct: 0.05,
  maxTradeSizeUsdc: 500,
  cooldownSeconds: 60,
  slippagePct: 0.01,
};
