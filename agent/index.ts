/**
 * LiquidRunway rebalancing agent.
 *
 * Loop: read balances -> decide (protect liquidity first) -> execute swaps on
 * Arc via Circle -> log why each move happened.
 *
 * Usage:
 *   npm run agent:tick             one decision cycle (executes if warranted)
 *   npm run agent:tick -- --dry-run  decide + log, but never execute
 *   npm run agent:run              continuous loop
 *   npm run agent:status          show portfolio + recent decisions
 *   npm run agent:pause / :resume toggle execution
 */
import { defaultPolicy, type Policy } from "./policy.ts";
import { readPortfolio, type Portfolio } from "./portfolio.ts";
import { decide } from "./decide.ts";
import { executeDecision } from "./execute.ts";
import {
  appendAudit,
  readState,
  recordAction,
  setPaused,
  readAudit,
  type AuditEntry,
} from "./log.ts";

const policy: Policy = defaultPolicy;
const LOOP_INTERVAL_SEC = 30;

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}
function usd(x: number) {
  return `$${x.toFixed(2)}`;
}

function printPortfolio(p: Portfolio) {
  console.log(
    `Portfolio: ${usd(p.totalValueUsdc)} total | ${usd(p.usdc)} USDC (${pct(p.liquidityPct)}) | ` +
      `${p.riskUnits} risk ≈ ${usd(p.riskValueUsdc)}`,
  );
}

async function tick(dryRun: boolean): Promise<void> {
  const state = readState();
  const portfolio = await readPortfolio();
  printPortfolio(portfolio);

  const decision = decide(portfolio, policy, {
    now: Date.now(),
    lastActionAt: state.lastActionAt,
    paused: state.paused,
  });

  console.log(`Decision: ${decision.action}${decision.amountUsdc > 0 ? ` ${usd(decision.amountUsdc)}` : ""}`);
  console.log(`  ${decision.reason}`);

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action: decision.action,
    amountUsdc: decision.amountUsdc,
    reason: decision.reason,
    liquidityPct: decision.liquidityPct,
    floorPct: decision.floorPct,
    totalValueUsdc: decision.totalValueUsdc,
    executed: false,
  };

  if (decision.action === "HOLD") {
    appendAudit(entry);
    return;
  }

  if (dryRun) {
    console.log("  (dry-run: not executing)");
    appendAudit({ ...entry, reason: `${decision.reason} [dry-run]` });
    return;
  }

  try {
    console.log("  Executing on Arc via Circle...");
    const result = await executeDecision(decision, portfolio, policy);
    recordAction(Date.now());
    appendAudit({ ...entry, executed: true, txIds: result.txIds });
    console.log(`  Done. tx: ${result.txIds.join(", ")}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendAudit({ ...entry, error: message });
    console.error(`  Execution failed: ${message}`);
  }
}

async function showStatus(): Promise<void> {
  const state = readState();
  console.log(`Agent ${state.paused ? "PAUSED" : "ACTIVE"} | policy floor ${pct(policy.liquidityFloorPct)}`);
  try {
    printPortfolio(await readPortfolio());
  } catch (err) {
    console.log(`(portfolio unavailable: ${err instanceof Error ? err.message : String(err)})`);
  }
  const audit = readAudit(10);
  if (audit.length === 0) {
    console.log("No decisions logged yet.");
    return;
  }
  console.log("\nRecent decisions:");
  for (const e of audit) {
    const tag = e.executed ? "✓" : e.error ? "✗" : "·";
    console.log(`  ${tag} ${e.timestamp} ${e.action}${e.amountUsdc ? ` ${usd(e.amountUsdc)}` : ""} — ${e.reason}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (args.includes("--pause")) {
    setPaused(true);
    console.log("Agent paused. It will read + log but not execute.");
    return;
  }
  if (args.includes("--resume")) {
    setPaused(false);
    console.log("Agent resumed.");
    return;
  }
  if (args.includes("--status")) {
    await showStatus();
    return;
  }

  if (args.includes("--loop")) {
    console.log(`Starting loop (every ${LOOP_INTERVAL_SEC}s). Ctrl+C to stop.`);
    for (;;) {
      await tick(dryRun);
      console.log(`--- sleeping ${LOOP_INTERVAL_SEC}s ---`);
      await new Promise((r) => setTimeout(r, LOOP_INTERVAL_SEC * 1000));
    }
  }

  await tick(dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
