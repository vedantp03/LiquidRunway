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
