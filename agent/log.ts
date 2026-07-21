import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Decision } from "./decide.ts";

const STATE_DIR = resolve(process.cwd(), "agent", "state");
const LOG_PATH = resolve(STATE_DIR, "decisions.jsonl");
const STATE_PATH = resolve(STATE_DIR, "state.json");

export interface AgentState {
  /** Epoch ms of the last successfully executed rebalance. */
  lastActionAt?: number;
  /** When true, the loop reads/decides/logs but never executes. */
  paused: boolean;
  /** Reference point for portfolio-wide P&L: total account value when tracking
   * started (or was last reset). */
  baseline?: { valueUsdc: number; at: number };
  /** Cumulative USDC intentionally withdrawn from the wallet (simulated spends)
   * since the baseline. Excluded from P&L so spends don't look like losses. */
  externalOutflowUsdc?: number;
}

export interface AuditEntry {
  timestamp: string;
  action: Decision["action"];
  amountUsdc: number;
  reason: string;
  liquidityPct: number;
  floorPct: number;
  totalValueUsdc: number;
  executed: boolean;
  /** Circle transaction id(s) if this decision was executed. */
  txIds?: string[];
  /** Error message if execution failed. */
  error?: string;
}

function ensureDir(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

export function readState(): AgentState {
  if (!existsSync(STATE_PATH)) return { paused: false };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as AgentState;
  } catch {
    return { paused: false };
  }
}

export function writeState(state: AgentState): void {
  ensureDir(STATE_PATH);
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function setPaused(paused: boolean): AgentState {
  const state = { ...readState(), paused };
  writeState(state);
  return state;
}

export function recordAction(at: number): void {
  writeState({ ...readState(), lastActionAt: at });
}

/** Sets the P&L baseline only if one isn't already set. */
export function ensureBaseline(valueUsdc: number, at = Date.now()): AgentState {
  const state = readState();
  if (state.baseline) return state;
  const updated = { ...state, baseline: { valueUsdc, at }, externalOutflowUsdc: state.externalOutflowUsdc ?? 0 };
  writeState(updated);
  return updated;
}

/** Re-anchors the P&L baseline to the given value and clears tracked outflows. */
export function resetBaseline(valueUsdc: number, at = Date.now()): AgentState {
  const updated = { ...readState(), baseline: { valueUsdc, at }, externalOutflowUsdc: 0 };
  writeState(updated);
  return updated;
}

export function addExternalOutflow(amountUsdc: number): AgentState {
  const state = readState();
  const updated = { ...state, externalOutflowUsdc: (state.externalOutflowUsdc ?? 0) + amountUsdc };
  writeState(updated);
  return updated;
}

export function appendAudit(entry: AuditEntry): void {
  ensureDir(LOG_PATH);
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
}

export function readAudit(limit = 50): AuditEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  const lines = readFileSync(LOG_PATH, "utf8").trim().split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => JSON.parse(l) as AuditEntry)
    .reverse();
}
