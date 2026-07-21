/**
 * Shared agent engine used by both the CLI (`index.ts`) and the web server
 * (`web/server.ts`), so decisions, execution, and the audit trail behave
 * identically no matter what triggers them.
 */
import { defaultPolicy, type Policy } from "./policy.ts";
import { readPortfolio, type Portfolio } from "./portfolio.ts";
import { decide, propose, type Decision } from "./decide.ts";
import { executeDecision } from "./execute.ts";
import { getCircleClient } from "./circleClient.ts";
import { config } from "./config.ts";
import {
  appendAudit,
  readState,
  recordAction,
  readAudit,
  ensureBaseline,
  resetBaseline as resetBaselineState,
  addExternalOutflow,
  type AuditEntry,
  type AgentState,
} from "./log.ts";

export const policy: Policy = defaultPolicy;

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TERMINAL_SUCCESS = new Set(["CONFIRMED", "COMPLETE"]);
const TERMINAL_FAILURE = new Set(["FAILED", "DENIED", "CANCELLED"]);

// --- Portfolio cache (the RPC reads are heavily rate-limited on Arc testnet) ---
let portfolioCache: { portfolio: Portfolio; at: number } | undefined;
let inFlight: Promise<Portfolio> | undefined;

export interface PortfolioResult {
  portfolio: Portfolio;
  cachedAt: number;
  fromCache: boolean;
}

/** Returns a cached portfolio if it's younger than maxAgeMs, otherwise reads
 * fresh. Concurrent callers share a single in-flight read. */
export async function getPortfolio(maxAgeMs = 0): Promise<PortfolioResult> {
  if (portfolioCache && maxAgeMs > 0 && Date.now() - portfolioCache.at <= maxAgeMs) {
    return { portfolio: portfolioCache.portfolio, cachedAt: portfolioCache.at, fromCache: true };
  }
  if (!inFlight) {
    inFlight = readPortfolio()
      .then((p) => {
        portfolioCache = { portfolio: p, at: Date.now() };
        return p;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  const portfolio = await inFlight;
  return { portfolio, cachedAt: portfolioCache!.at, fromCache: false };
}

export function invalidatePortfolio(): void {
  portfolioCache = undefined;
}

function auditFromDecision(decision: Decision, extra: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    action: decision.action,
    amountUsdc: decision.amountUsdc,
    reason: decision.reason,
    liquidityPct: decision.liquidityPct,
    floorPct: decision.floorPct,
    totalValueUsdc: decision.totalValueUsdc,
    executed: false,
    ...extra,
  };
}

export interface CycleResult {
  portfolio: Portfolio;
  decision: Decision;
  executed: boolean;
  txIds?: string[];
  error?: string;
  dryRun: boolean;
}

/** One autonomous decision cycle: decide (pause/cooldown-gated) -> maybe
 * execute -> log. */
export async function tick(opts: { dryRun?: boolean } = {}): Promise<CycleResult> {
  const dryRun = !!opts.dryRun;
  const state = readState();
  const { portfolio } = await getPortfolio();
  const decision = decide(portfolio, policy, {
    now: Date.now(),
    lastActionAt: state.lastActionAt,
    paused: state.paused,
  });

  if (decision.action === "HOLD") {
    appendAudit(auditFromDecision(decision));
    return { portfolio, decision, executed: false, dryRun };
  }

  if (dryRun) {
    appendAudit(auditFromDecision(decision, { reason: `${decision.reason} [dry-run]` }));
    return { portfolio, decision, executed: false, dryRun };
  }

  return runAndLog(decision, portfolio);
}

/** Manual approval: execute the current proposal regardless of pause/cooldown.
 * Used by the UI's "Approve & Execute" button. */
export async function approve(): Promise<CycleResult> {
  const { portfolio } = await getPortfolio();
  const decision = propose(portfolio, policy);
  if (decision.action === "HOLD") {
    return { portfolio, decision, executed: false, dryRun: false };
  }
  return runAndLog(decision, portfolio, "[approved]");
}

async function runAndLog(decision: Decision, portfolio: Portfolio, note?: string): Promise<CycleResult> {
  const reason = note ? `${decision.reason} ${note}` : decision.reason;
  try {
    const result = await executeDecision(decision, portfolio, policy);
    recordAction(Date.now());
    appendAudit(auditFromDecision(decision, { executed: true, txIds: result.txIds, reason }));
    invalidatePortfolio();
    return { portfolio, decision, executed: true, txIds: result.txIds, dryRun: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendAudit(auditFromDecision(decision, { error: message, reason }));
    return { portfolio, decision, executed: false, error: message, dryRun: false };
  }
}

export interface RiskPnl {
  /** Total USDC ever deployed into the sleeve (executed DEPLOYs). */
  deployedUsdc: number;
  /** Total USDC pulled back out (executed TOP_UPs). */
  withdrawnUsdc: number;
  /** deployed - withdrawn: the current cost basis of the sleeve. */
  netInvestedUsdc: number;
  /** Current mark-to-market value of the risk holdings. */
  currentValueUsdc: number;
  /** currentValue - netInvested (realized + unrealized). */
  pnlUsdc: number;
  /** pnl / netInvested, or null when there's no basis to compare against. */
  pnlPct: number | null;
}

export interface PortfolioPnl {
  /** Total account value when tracking started (or was last reset). */
  baselineValueUsdc: number;
  baselineAt: number;
  /** USDC intentionally spent (burned) since the baseline — excluded from P&L. */
  externalOutflowUsdc: number;
  /** baseline - outflow: the capital the agent is actually responsible for. */
  investedCapitalUsdc: number;
  currentValueUsdc: number;
  /** currentValue - investedCapital: gains/losses from market moves + fees. */
  pnlUsdc: number;
  pnlPct: number | null;
}

export interface Snapshot {
  portfolio: Portfolio | null;
  portfolioError?: string;
  cachedAt?: number;
  policy: Policy;
  state: AgentState;
  proposal: Decision | null;
  gatedDecision: Decision | null;
  targetUsdc: number | null;
  deployThresholdPct: number;
  riskPnl: RiskPnl | null;
  portfolioPnl: PortfolioPnl | null;
  audit: AuditEntry[];
}

function computePortfolioPnl(state: AgentState, currentValueUsdc: number): PortfolioPnl | null {
  if (!state.baseline) return null;
  const externalOutflowUsdc = state.externalOutflowUsdc ?? 0;
  const investedCapitalUsdc = state.baseline.valueUsdc - externalOutflowUsdc;
  const pnlUsdc = currentValueUsdc - investedCapitalUsdc;
  const pnlPct = investedCapitalUsdc > 0 ? pnlUsdc / investedCapitalUsdc : null;
  return {
    baselineValueUsdc: state.baseline.valueUsdc,
    baselineAt: state.baseline.at,
    externalOutflowUsdc,
    investedCapitalUsdc,
    currentValueUsdc,
    pnlUsdc,
    pnlPct,
  };
}

/** Reconstructs the risk sleeve's P&L from the executed trades in the audit
 * log. Because the mock pool is fee-less and linearly priced, the intended
 * `amountUsdc` on each executed trade is a faithful proxy for USDC in/out, so
 * (currentValue - netInvested) captures the sleeve's realized + unrealized P&L. */
function computeRiskPnl(audit: AuditEntry[], currentValueUsdc: number): RiskPnl | null {
  let deployedUsdc = 0;
  let withdrawnUsdc = 0;
  for (const e of audit) {
    if (!e.executed) continue;
    if (e.action === "DEPLOY") deployedUsdc += e.amountUsdc;
    else if (e.action === "TOP_UP") withdrawnUsdc += e.amountUsdc;
  }
  if (deployedUsdc <= 0) return null;

  const netInvestedUsdc = deployedUsdc - withdrawnUsdc;
  const pnlUsdc = currentValueUsdc - netInvestedUsdc;
  const pnlPct = netInvestedUsdc > 0 ? pnlUsdc / netInvestedUsdc : null;
  return { deployedUsdc, withdrawnUsdc, netInvestedUsdc, currentValueUsdc, pnlUsdc, pnlPct };
}

/** Full read-only view for the dashboard. */
export async function snapshot(maxAgeMs = 15_000): Promise<Snapshot> {
  let state = readState();
  const audit = readAudit(25);
  const fullAudit = readAudit(10_000);

  let portfolio: Portfolio | null = null;
  let portfolioError: string | undefined;
  let cachedAt: number | undefined;
  try {
    const r = await getPortfolio(maxAgeMs);
    portfolio = r.portfolio;
    cachedAt = r.cachedAt;
  } catch (err) {
    portfolioError = err instanceof Error ? err.message : String(err);
  }

  // Anchor the P&L baseline the first time we can see the portfolio.
  if (portfolio && !state.baseline) {
    state = ensureBaseline(portfolio.totalValueUsdc);
  }

  const proposal = portfolio ? propose(portfolio, policy) : null;
  const gatedDecision = portfolio
    ? decide(portfolio, policy, { now: Date.now(), lastActionAt: state.lastActionAt, paused: state.paused })
    : null;
  const riskPnl = portfolio ? computeRiskPnl(fullAudit, portfolio.riskValueUsdc) : null;
  const portfolioPnl = portfolio ? computePortfolioPnl(state, portfolio.totalValueUsdc) : null;

  return {
    portfolio,
    portfolioError,
    cachedAt,
    policy,
    state,
    proposal,
    gatedDecision,
    targetUsdc: portfolio ? policy.liquidityFloorPct * portfolio.totalValueUsdc : null,
    deployThresholdPct: policy.liquidityFloorPct + policy.rebalanceBandPct,
    riskPnl,
    portfolioPnl,
    audit,
  };
}

/** Re-anchors portfolio P&L to the current total value and clears tracked spends. */
export async function resetBaseline(): Promise<AgentState> {
  const { portfolio } = await getPortfolio();
  return resetBaselineState(portfolio.totalValueUsdc);
}

/** Demo helper: send USDC to a burn address to simulate a real-world spend
 * that eats into the liquidity buffer. */
export async function simulateSpend(amountUsdc: string): Promise<{ id: string }> {
  if (!config.walletAddress) throw new Error("WALLET_ADDRESS is not set in .env.");
  const client = getCircleClient();
  const response = await client.createTransaction({
    walletAddress: config.walletAddress,
    blockchain: "ARC-TESTNET",
    tokenAddress: config.usdcAddress,
    destinationAddress: BURN_ADDRESS,
    amount: [amountUsdc],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = response.data?.id;
  if (!id) throw new Error("createTransaction returned no id");
  await waitForTx(id);
  addExternalOutflow(Number(amountUsdc));
  invalidatePortfolio();
  return { id };
}

async function waitForTx(id: string, timeoutMs = 90_000): Promise<void> {
  const client = getCircleClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await client.getTransaction({ id });
    const state = response.data?.transaction?.state;
    if (state && TERMINAL_SUCCESS.has(state)) return;
    if (state && TERMINAL_FAILURE.has(state)) {
      throw new Error(`Transaction ${id} reached terminal state ${state}`);
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Transaction ${id} did not confirm within ${timeoutMs}ms`);
}
