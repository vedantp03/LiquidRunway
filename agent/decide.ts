import type { Policy } from "./policy.ts";
import type { Portfolio } from "./portfolio.ts";

export type Action = "TOP_UP" | "DEPLOY" | "HOLD";

export interface Decision {
  action: Action;
  /** Size of the intended trade, in USDC. 0 for HOLD. */
  amountUsdc: number;
  /** Human-readable justification for the audit trail. */
  reason: string;
  /** Snapshot of the inputs that drove the decision. */
  liquidityPct: number;
  floorPct: number;
  totalValueUsdc: number;
}

export interface DecideContext {
  now: number;
  /** Epoch ms of the last executed rebalance, or undefined if none yet. */
  lastActionAt?: number;
  paused?: boolean;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;

/**
 * Pure, ungated proposal: what the agent *would* do given the portfolio,
 * ignoring pause and cooldown. Rule of the product: protect liquidity first,
 * invest second.
 *  - Below the floor  -> TOP_UP (sell risk -> USDC back to the floor).
 *  - Comfortably above the floor (> floor + band) -> DEPLOY idle USDC into risk.
 *  - Otherwise HOLD.
 * The only guardrail applied here is the max trade size cap.
 */
export function propose(portfolio: Portfolio, policy: Policy): Decision {
  const { liquidityPct, totalValueUsdc, usdc } = portfolio;
  const floor = policy.liquidityFloorPct;
  const base = {
    liquidityPct,
    floorPct: floor,
    totalValueUsdc,
  };

  if (totalValueUsdc <= 0) {
    return { action: "HOLD", amountUsdc: 0, reason: "Portfolio is empty.", ...base };
  }

  const targetUsdc = floor * totalValueUsdc;
  const deployThreshold = floor + policy.rebalanceBandPct;

  if (liquidityPct < floor) {
    const rawAmount = targetUsdc - usdc;
    const amountUsdc = Math.min(rawAmount, policy.maxTradeSizeUsdc);
    const capNote = rawAmount > policy.maxTradeSizeUsdc ? ` (capped at ${usd(policy.maxTradeSizeUsdc)})` : "";
    return {
      action: "TOP_UP",
      amountUsdc,
      reason:
        `Liquidity ${pct(liquidityPct)} is below the ${pct(floor)} floor. ` +
        `Selling ${usd(amountUsdc)} of risk to restore the buffer${capNote}.`,
      ...base,
    };
  }

  if (liquidityPct > deployThreshold) {
    const rawAmount = usdc - targetUsdc;
    const amountUsdc = Math.min(rawAmount, policy.maxTradeSizeUsdc);
    const capNote = rawAmount > policy.maxTradeSizeUsdc ? ` (capped at ${usd(policy.maxTradeSizeUsdc)})` : "";
    return {
      action: "DEPLOY",
      amountUsdc,
      reason:
        `Liquidity ${pct(liquidityPct)} is above the ${pct(deployThreshold)} deploy band. ` +
        `Putting ${usd(amountUsdc)} of idle USDC to work${capNote}.`,
      ...base,
    };
  }

  return {
    action: "HOLD",
    amountUsdc: 0,
    reason: `Liquidity ${pct(liquidityPct)} is within target band [${pct(floor)}, ${pct(deployThreshold)}].`,
    ...base,
  };
}

/**
 * The autonomous decision: the proposal with the pause and cooldown gates
 * applied on top. Used by the loop; the UI uses `propose()` directly so it can
 * show (and manually approve) an action even while paused or in cooldown.
 */
export function decide(portfolio: Portfolio, policy: Policy, ctx: DecideContext): Decision {
  const { liquidityPct, totalValueUsdc } = portfolio;
  const floor = policy.liquidityFloorPct;
  const base = { liquidityPct, floorPct: floor, totalValueUsdc };

  if (ctx.paused) {
    return { action: "HOLD", amountUsdc: 0, reason: "Agent is paused.", ...base };
  }

  const proposal = propose(portfolio, policy);
  if (proposal.action === "HOLD") return proposal;

  const cooldownRemaining = remainingCooldown(policy, ctx);
  if (cooldownRemaining > 0) {
    const deployThreshold = floor + policy.rebalanceBandPct;
    const reason =
      proposal.action === "TOP_UP"
        ? `Below floor (${pct(liquidityPct)} < ${pct(floor)}) but in cooldown for ${cooldownRemaining}s.`
        : `Above deploy band (${pct(liquidityPct)} > ${pct(deployThreshold)}) but in cooldown for ${cooldownRemaining}s.`;
    return { action: "HOLD", amountUsdc: 0, reason, ...base };
  }

  return proposal;
}

function remainingCooldown(policy: Policy, ctx: DecideContext): number {
  if (ctx.lastActionAt === undefined) return 0;
  const elapsedSec = (ctx.now - ctx.lastActionAt) / 1000;
  return Math.max(0, Math.ceil(policy.cooldownSeconds - elapsedSec));
}
