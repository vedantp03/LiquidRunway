/** Policy config for the rebalancing agent — the "two numbers" from the pitch, plus guardrails. */
export interface Policy {
  /** Minimum fraction of total portfolio value that must stay in USDC, e.g. 0.25 for 25%. */
  liquidityFloorPct: number;
  /** Largest single rebalancing trade the agent may place, in USDC. */
  maxTradeSizeUsdc: number;
  /** Minimum seconds between two rebalancing actions, to avoid thrashing. */
  cooldownSeconds: number;
}

export const defaultPolicy: Policy = {
  liquidityFloorPct: 0.25,
  maxTradeSizeUsdc: 500,
  cooldownSeconds: 60,
};
