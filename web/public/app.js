const $ = (id) => document.getElementById(id);
const usd = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

let latest = null;
let busy = false;

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("err", isError);
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.classList.add("hidden"), 250);
  }, 3200);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function render(snap) {
  latest = snap;
  const { portfolio, policy, state, proposal, gatedDecision, deployThresholdPct } = snap;

  // Status pill + pause button
  const pill = $("statusPill");
  pill.textContent = state.paused ? "Paused" : "Active";
  pill.className = `pill ${state.paused ? "pill-paused" : "pill-active"}`;
  $("pauseBtn").textContent = state.paused ? "Resume" : "Pause";

  // Banner for portfolio read errors
  const banner = $("banner");
  if (snap.portfolioError) {
    banner.textContent = `Couldn't read portfolio: ${snap.portfolioError}`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  renderPortfolioPnl(snap.portfolioPnl);

  if (portfolio) {
    $("totalValue").textContent = usd(portfolio.totalValueUsdc);
    $("usdcValue").textContent = usd(portfolio.usdc);
    $("usdcPct").textContent = `${pct(portfolio.liquidityPct)} of portfolio`;
    $("riskValue").textContent = usd(portfolio.riskValueUsdc);
    $("riskSymbol").textContent = portfolio.riskSymbol || "RISK";
    $("riskSymbol").title = portfolio.riskName || "";
    const unitPrice = usd(portfolio.riskPriceUsdc);
    $("riskUnits").textContent = `${portfolio.riskUnits} ${portfolio.riskSymbol || "units"} @ ${unitPrice}`;
    $("legendUsdc").textContent = pct(portfolio.liquidityPct);
    $("legendRisk").textContent = pct(1 - portfolio.liquidityPct);
    renderPnl(snap.riskPnl);

    // Allocation bar
    $("usdcFill").style.width = `${Math.min(100, portfolio.liquidityPct * 100)}%`;
    $("floorMarker").style.left = `${policy.liquidityFloorPct * 100}%`;
    $("bandMarker").style.left = `${deployThresholdPct * 100}%`;
  }

  if (snap.config?.walletAddress) {
    $("walletAddr").textContent = shorten(snap.config.walletAddress);
  }

  renderDecision(proposal, gatedDecision, state, snap.cachedAt);
  renderLog(snap.audit, snap.config?.explorer);

  $("lastUpdated").textContent = snap.cachedAt ? `Updated ${relTime(snap.cachedAt)}` : "";
}

function setPnlBadge(el, pnlUsdc, pnlPct, title) {
  const up = pnlUsdc > 0.005;
  const down = pnlUsdc < -0.005;
  const arrow = up ? "▲" : down ? "▼" : "•";
  const sign = pnlUsdc >= 0 ? "+" : "−";
  const pctPart = pnlPct === null || pnlPct === undefined ? "" : ` (${sign}${Math.abs(pnlPct * 100).toFixed(1)}%)`;
  el.textContent = `${arrow} ${sign}${usd(Math.abs(pnlUsdc)).slice(1)}${pctPart}`;
  el.className = `pnl ${up ? "up" : down ? "down" : "flat"}`;
  el.title = title || "";
}

function renderPnl(pnl) {
  const el = $("riskPnl");
  if (!pnl) {
    el.textContent = "";
    el.className = "pnl";
    el.title = "";
    return;
  }
  setPnlBadge(
    el,
    pnl.pnlUsdc,
    pnl.pnlPct,
    `Cost basis ${usd(pnl.netInvestedUsdc)} (deployed ${usd(pnl.deployedUsdc)}, withdrawn ${usd(pnl.withdrawnUsdc)}) · now ${usd(pnl.currentValueUsdc)}`,
  );
}

function renderPortfolioPnl(pnl) {
  const badge = $("portfolioPnl");
  const sub = $("pnlBaseline");
  if (!pnl) {
    badge.textContent = "";
    badge.className = "pnl";
    badge.title = "";
    sub.textContent = "";
    return;
  }
  setPnlBadge(
    badge,
    pnl.pnlUsdc,
    pnl.pnlPct,
    `Baseline ${usd(pnl.baselineValueUsdc)} − spends ${usd(pnl.externalOutflowUsdc)} = capital ${usd(pnl.investedCapitalUsdc)} · now ${usd(pnl.currentValueUsdc)}`,
  );
  const spends = pnl.externalOutflowUsdc > 0.005 ? `, ${usd(pnl.externalOutflowUsdc)} spent` : "";
  sub.textContent = `vs ${usd(pnl.investedCapitalUsdc)} capital since ${new Date(pnl.baselineAt).toLocaleDateString()}${spends}`;
}

function renderDecision(proposal, gated, state, cachedAt) {
  const badge = $("decisionBadge");
  const reason = $("decisionReason");
  const note = $("decisionNote");
  const approveBtn = $("approveBtn");

  const shown = proposal || gated;
  if (!shown) {
    badge.textContent = "—";
    badge.className = "badge";
    reason.textContent = "Portfolio unavailable.";
    approveBtn.classList.add("hidden");
    return;
  }

  badge.textContent = shown.action.replace("_", " ");
  badge.className = `badge badge-${shown.action}`;
  reason.textContent = shown.reason;

  const actionable = proposal && proposal.action !== "HOLD";
  approveBtn.classList.toggle("hidden", !actionable);

  // If the ungated proposal wants to act but the gated (autonomous) decision holds,
  // explain why the loop isn't acting on its own.
  if (actionable && gated && gated.action === "HOLD") {
    note.textContent = state.paused ? "Loop is paused — approve to run this now." : gated.reason;
  } else {
    note.textContent = "";
  }
}

function renderLog(audit, explorer) {
  const list = $("logList");
  if (!audit || audit.length === 0) {
    list.innerHTML = '<li class="log-empty">No decisions yet.</li>';
    return;
  }
  list.innerHTML = audit
    .map((e) => {
      const cls = e.executed ? "ok" : e.error ? "err" : "info";
      const icon = e.executed ? "✓" : e.error ? "✗" : "·";
      const amount = e.amountUsdc ? ` · ${usd(e.amountUsdc)}` : "";
      const txs = (e.txIds || []).map((t) => `<span class="tx mono">${shorten(t)}</span>`).join(" ");
      const meta = e.error
        ? `<span style="color:var(--danger)">${escapeHtml(truncate(e.error, 140))}</span>`
        : txs
          ? `tx ${txs}`
          : `${e.action}${amount}`;
      return `<li class="log-item">
        <span class="log-icon ${cls}">${icon}</span>
        <div class="log-main">
          <div class="log-reason">${escapeHtml(e.reason)}</div>
          <div class="log-meta">${meta}</div>
        </div>
        <div class="log-time">${new Date(e.timestamp).toLocaleTimeString()}</div>
      </li>`;
    })
    .join("");
}

function shorten(s) {
  return s && s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
function truncate(s, n) {
  const str = String(s).replace(/\s+/g, " ").trim();
  return str.length > n ? `${str.slice(0, n)}…` : str;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function refresh(fresh = false) {
  try {
    const snap = await api(`/api/snapshot${fresh ? "?fresh=1" : ""}`);
    render(snap);
  } catch (err) {
    toast(err.message, true);
  }
}

async function withBusy(btn, label, fn) {
  if (busy) return;
  busy = true;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span>${label}`;
  try {
    await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    busy = false;
    btn.disabled = false;
    btn.innerHTML = original;
    await refresh(true);
  }
}

// --- Wire up controls ---
$("refreshBtn").addEventListener("click", () => refresh(true));

$("pauseBtn").addEventListener("click", async () => {
  const paused = latest?.state?.paused;
  try {
    await api(paused ? "/api/resume" : "/api/pause", { method: "POST" });
    toast(paused ? "Agent resumed" : "Agent paused");
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

$("tickBtn").addEventListener("click", (e) =>
  withBusy(e.currentTarget, "Running…", async () => {
    const r = await api("/api/tick", { method: "POST", body: {} });
    toast(r.executed ? `Executed ${r.decision.action}` : `Decision: ${r.decision.action}`);
  }),
);

$("approveBtn").addEventListener("click", (e) =>
  withBusy(e.currentTarget, "Executing…", async () => {
    const r = await api("/api/approve", { method: "POST" });
    if (r.error) throw new Error(r.error);
    toast(r.executed ? `Executed ${r.decision.action}` : "Nothing to do");
  }),
);

$("spendBtn").addEventListener("click", (e) =>
  withBusy(e.currentTarget, "Sending…", async () => {
    const amountUsdc = Number($("spendAmount").value);
    if (!(amountUsdc > 0)) throw new Error("Enter a positive amount");
    await api("/api/simulate-spend", { method: "POST", body: { amountUsdc } });
    toast(`Spent ${usd(amountUsdc)} — floor may now be broken`);
  }),
);

$("resetBaselineBtn").addEventListener("click", (e) =>
  withBusy(e.currentTarget, "Resetting…", async () => {
    await api("/api/reset-baseline", { method: "POST" });
    toast("P&L baseline reset to current value");
  }),
);

// Initial load + light auto-refresh (server caches the RPC read).
refresh(true);
setInterval(() => {
  if (!busy) refresh(false);
}, 30_000);
