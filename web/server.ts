/**
 * LiquidRunway dashboard server. Serves the static UI and a small JSON API that
 * wraps the shared agent engine. Run with `npm run web`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { config } from "../agent/config.ts";
import { snapshot, tick, approve, simulateSpend, resetBaseline } from "../agent/engine.ts";
import { setPaused } from "../agent/log.ts";

const PORT = Number(process.env.PORT ?? 4319);
const PUBLIC_DIR = resolve(process.cwd(), "web", "public");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** JSON.stringify that survives bigint values (portfolio.raw holds them). */
function toJson(data: unknown): string {
  return JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = toJson(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = resolve(PUBLIC_DIR, rel);
  // Prevent path traversal outside PUBLIC_DIR.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, search: URLSearchParams): Promise<void> {
  const method = req.method ?? "GET";

  if (method === "GET" && pathname === "/api/snapshot") {
    const fresh = search.get("fresh") === "1";
    const snap = await snapshot(fresh ? 0 : 15_000);
    return sendJson(res, 200, { ...snap, config: { walletAddress: config.walletAddress, explorer: "https://testnet.arcscan.app" } });
  }

  if (method === "POST" && pathname === "/api/pause") {
    return sendJson(res, 200, { state: setPaused(true) });
  }
  if (method === "POST" && pathname === "/api/resume") {
    return sendJson(res, 200, { state: setPaused(false) });
  }

  if (method === "POST" && pathname === "/api/tick") {
    const body = (await readBody(req)) as { dryRun?: boolean };
    const result = await tick({ dryRun: !!body.dryRun });
    return sendJson(res, 200, result);
  }

  if (method === "POST" && pathname === "/api/approve") {
    const result = await approve();
    return sendJson(res, 200, result);
  }

  if (method === "POST" && pathname === "/api/reset-baseline") {
    return sendJson(res, 200, { state: await resetBaseline() });
  }

  if (method === "POST" && pathname === "/api/simulate-spend") {
    const body = (await readBody(req)) as { amountUsdc?: string | number };
    const amount = body.amountUsdc;
    if (amount === undefined || Number(amount) <= 0) {
      return sendJson(res, 400, { error: "amountUsdc must be a positive number" });
    }
    const result = await simulateSpend(String(amount));
    return sendJson(res, 200, result);
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname, url.searchParams);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) sendJson(res, 500, { error: message });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`LiquidRunway dashboard running at http://localhost:${PORT}`);
  if (!config.walletAddress) {
    console.warn("Warning: WALLET_ADDRESS not set — run `npm run setup:wallet` first.");
  }
});
