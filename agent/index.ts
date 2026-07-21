/**
 * LiquidRunway rebalancing agent (CLI).
 *
 * Loop: read balances -> decide (protect liquidity first) -> execute swaps on
 * Arc via Circle -> log why each move happened. Shared logic lives in engine.ts.
 *
 * Usage:
 *   npm run agent:tick               one decision cycle (executes if warranted)
 *   npm run agent:tick -- --dry-run  decide + log, but never execute
 *   npm run agent:run                continuous loop
 *   npm run agent:status             show portfolio + recent decisions
 *   npm run agent:pause / :resume    toggle execution
 */
import type { Portfolio } from "./portfolio.ts";
import { policy, tick, snapshot } from "./engine.ts";
import { setPaused } from "./log.ts";

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

async function runTick(dryRun: boolean): Promise<void> {
  const result = await tick({ dryRun });
  printPortfolio(result.portfolio);
  console.log(`Decision: ${result.decision.action}${result.decision.amountUsdc > 0 ? ` ${usd(result.decision.amountUsdc)}` : ""}`);
  console.log(`  ${result.decision.reason}`);
  if (result.decision.action === "HOLD") return;
  if (dryRun) {
    console.log("  (dry-run: not executing)");
    return;
  }
  if (result.executed) {
    console.log(`  Done. tx: ${result.txIds?.join(", ")}`);
  } else if (result.error) {
    console.error(`  Execution failed: ${result.error}`);
  }
}

async function showStatus(): Promise<void> {
  const snap = await snapshot(0);
  console.log(`Agent ${snap.state.paused ? "PAUSED" : "ACTIVE"} | policy floor ${pct(policy.liquidityFloorPct)}`);
  if (snap.portfolio) {
    printPortfolio(snap.portfolio);
  } else {
    console.log(`(portfolio unavailable: ${snap.portfolioError})`);
  }
  if (snap.audit.length === 0) {
    console.log("No decisions logged yet.");
    return;
  }
  console.log("\nRecent decisions:");
  for (const e of snap.audit.slice(0, 10)) {
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
      await runTick(dryRun);
      console.log(`--- sleeping ${LOOP_INTERVAL_SEC}s ---`);
      await new Promise((r) => setTimeout(r, LOOP_INTERVAL_SEC * 1000));
    }
  }

  await runTick(dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
