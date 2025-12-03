// ==============================================
// Dealvox Call History + Subscription Usage
// - Uses Supabase REST + getAuthInfo()
// - Agent ID resolved per authenticated user
// - Calls loaded via Cloudflare Worker → Retell
// ==============================================

// ----------------------------------------------
// API endpoints
// ----------------------------------------------

// Worker route that proxies to Retell list-calls
const CALL_API_URL = "/api/list-calls";

// Billing summary → Stripe via CF function
const BILLING_SUMMARY_URL = "/api/billing-summary";

// ----------------------------------------------
// Usage summary state (Subscription limits & spendings)
// ----------------------------------------------
let usagePlanMinutes = 200;     // placeholder for included minutes
let usagePeriodStartMs = null;  // Stripe billing period start (ms)
let usageCallsCache = [];       // latest full calls array (unfiltered)

/**
 * Recompute & render usage summary:
 * - used minutes in current billing period
 * - minutes left
 */
function updateUsageSummary() {
  const startEl     = document.getElementById("billingPeriodStart");
  const planEl      = document.getElementById("planMinutes");
  const usedEl      = document.getElementById("usedMinutes");
  const remainingEl = document.getElementById("remainingMinutes");

  if (!startEl || !planEl || !usedEl || !remainingEl) return;

  // Always show plan minutes (even if we don't yet know period/calls)
  planEl.textContent = usagePlanMinutes.toString();

  if (!usagePeriodStartMs || !Array.isArray(usageCallsCache)) {
    return;
  }

  const nowMs = Date.now();

  const usedSeconds = usageCallsCache
    .filter((c) => {
      const ts = typeof c.start_timestamp === "number" ? c.start_timestamp : null;
      return ts && ts >= usagePeriodStartMs && ts <= nowMs;
    })
    .reduce((sum, c) => {
      const sec =
        c?.call_cost?.total_duration_seconds ??
        (c.duration_ms ? c.duration_ms / 1000 : 0);
      return sum + (sec || 0);
    }, 0);

  const usedMinutes = usedSeconds / 60;
  const remaining   = Math.max(usagePlanMinutes - usedMinutes, 0);

  usedEl.textContent      = usedMinutes.toFixed(1);
  remainingEl.textContent = remaining.toFixed(1);
}

/**
 * Load Stripe billing summary:
 * - current plan
 * - billing period start
 */
async function loadSubscriptionSummary() {
  try {
    const res = await fetch(BILLING_SUMMARY_URL);
    if (!res.ok) {
      console.error("[Usage] billing-summary HTTP error:", res.status);
      return;
    }

    const data = await res.json();
    const plan = data.current_plan;
    if (!plan) return;

    // Plan minutes from Stripe, fallback to 200
    usagePlanMinutes = plan.included_minutes || 200;

    // Billing period start
    if (plan.period_start) {
      usagePeriodStartMs = plan.period_start;
    } else if (plan.renews_at) {
      // crude fallback: 30 days before renew
      usagePeriodStartMs = plan.renews_at - 30 * 24 * 60 * 60 * 1000;
    }

    const startEl = document.getElementById("billingPeriodStart");
    if (startEl && usagePeriodStartMs) {
      startEl.textContent = new Date(usagePeriodStartMs).toLocaleString();
    }

    updateUsageSummary();
  } catch (err) {
    console.error("[Usage] billing-summary error:", err);
  }
}

// ----------------------------------------------
// Fetch calls (browser → Worker → Retell)
// ----------------------------------------------
async function fetchCalls(agentId, startLower, startUpper) {
  try {
    const response = await fetch(CALL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter_criteria: {
          agent_id: [agentId],
          // You can extend filter_criteria with time windows if your Worker supports it
          // start_timestamp_lower: startLower,
          // start_timestamp_upper: startUpper,
        },
      }),
    });

    if (!response.ok) {
      console.error(
        "[CallHistory] list-calls HTTP error via Worker:",
        response.status
      );
      return [];
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[CallHistory] list-calls network/JSON error:", err);
    return [];
  }
}

// ----------------------------------------------
// Resolve agent_id from Supabase for this user
// (same style as Assistant view loader)
// ----------------------------------------------
async function getAgentIdForUser(auth) {
  const userId = auth.user.id;
  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/assistants`;

  const params = new URLSearchParams();
  params.set("select", "agent_id");
  params.set("user_id", `eq.${userId}`);
  params.set("limit", "1");

  async function run(currentAuth) {
    return fetch(`${baseUrl}?${params.toString()}`, {
      headers: supabaseHeaders(currentAuth.accessToken),
    });
  }

  let res = await run(auth);

  if (res.status === 401) {
    // reuse the same helper you already use in assistant view
    const newAuth = await handleJwt401(res, "load agent_id for calls");
    if (!newAuth) {
      console.warn("[CallHistory] Session expired while loading agent_id");
      return null;
    }
    auth = newAuth;
    res = await run(auth);
  }

  if (!res.ok) {
    console.error(
      "[CallHistory] assistants load HTTP error:",
      res.status,
      await res.text()
    );
    return null;
  }

  const rows = await res.json();
  const data = rows[0];

  if (!data || !data.agent_id) {
    console.warn("[CallHistory] No assistant row / agent_id for user");
    return null;
  }

  return data.agent_id;
}

// ----------------------------------------------
// Row → HTML
// ----------------------------------------------
function rowHTML(call) {
  const tsRaw = call.start_timestamp;
  const tsMs =
    typeof tsRaw === "number" && tsRaw < 1e12 ? tsRaw : tsRaw; // Retell uses ms already
  const time = tsMs ? new Date(tsMs).toLocaleString() : "-";

  const durationSec =
    call?.call_cost?.total_duration_seconds ??
    (call.duration_ms ? call.duration_ms / 1000 : 0) ??
    0;

  // Custom pricing (in $) → durationSec / 60 * 1.5
  const costMin  = durationSec / 60;
  const costCalc = costMin * 1.5;
  const cost     = costCalc.toFixed(2);

  const endReason    = call?.disconnection_reason ?? "-";
  const status       = call?.call_status ?? "-";
  const sentiment    = call?.call_analysis?.user_sentiment ?? "-";
  const outcomeFlag  = call?.call_analysis?.call_successful;
  const outcome      = outcomeFlag ? "Success" : "No close";
  const recordingURL = call?.recording_url ?? "";

  const recordingCell = recordingURL
    ? `
    <audio controls preload="none" style="width: 160px;">
      <source src="${recordingURL}" type="audio/wav">
      <a href="${recordingURL}" target="_blank">Download</a>
    </audio>
  `
    : "-";

  return `
    <tr>
      <td>${time}</td>
      <td>${durationSec.toFixed(0)}s</td>
      <td>$${cost}</td>
      <td>${endReason}</td>
      <td>${status}</td>
      <td>${sentiment}</td>
      <td>${outcome}</td>
      <td>${recordingCell}</td>
    </tr>
  `;
}

// ----------------------------------------------
// Render table
// ----------------------------------------------
function renderCalls(calls) {
  const tbody =
    document.getElementById("callHistoryTableBody") ||
    document.getElementById("callHistoryBody"); // fallback for old markup
  if (!tbody) return;

  if (!calls.length) {
    tbody.innerHTML = `
      <tr class="calls-table-empty">
        <td colspan="8">No calls yet for this assistant.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = "";
  calls.forEach((call) => {
    tbody.insertAdjacentHTML("beforeend", rowHTML(call));
  });
}

// ----------------------------------------------
// Filtering (uses global usageCallsCache as source)
// ----------------------------------------------
function applyFilters() {
  const monthVal   = document.getElementById("filterMonth")?.value ?? "";
  const endVal     = document.getElementById("filterEndReason")?.value ?? "";
  const sentVal    = document.getElementById("filterSentiment")?.value ?? "";
  const outcomeVal = document.getElementById("filterOutcome")?.value ?? "";

  let filtered = Array.isArray(usageCallsCache) ? [...usageCallsCache] : [];

  // Month-year
  if (monthVal) {
    const [year, month] = monthVal.split("-");
    filtered = filtered.filter((call) => {
      const d = new Date(call.start_timestamp);
      return (
        d.getFullYear() === parseInt(year, 10) &&
        d.getMonth() + 1 === parseInt(month, 10)
      );
    });
  }

  // End reason
  if (endVal) {
    filtered = filtered.filter(
      (call) =>
        (call.disconnection_reason ?? "").toLowerCase() ===
        endVal.toLowerCase()
    );
  }

  // User sentiment
  if (sentVal) {
    filtered = filtered.filter(
      (call) =>
        (call?.call_analysis?.user_sentiment ?? "").toLowerCase() ===
        sentVal.toLowerCase()
    );
  }

  // Outcome (for current UI: "success" / "no_close")
  if (outcomeVal) {
    filtered = filtered.filter((call) => {
      const success = call?.call_analysis?.call_successful === true;
      if (outcomeVal === "success") return success;
      if (outcomeVal === "no_close") return !success;
      return true;
    });
  }

  renderCalls(filtered);
}

// ----------------------------------------------
// Init
// ----------------------------------------------
async function initCallHistory() {
  const cardEl = document.getElementById("callHistoryCard");
  if (!cardEl) return; // not on this page

  // Fire-and-forget: load Stripe billing summary
  loadSubscriptionSummary().catch((err) =>
    console.error("[CallHistory] loadSubscriptionSummary error:", err)
  );

  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("[CallHistory] getAuthInfo failed:", e);
    return;
  }

  if (!auth.user || !auth.accessToken) {
    console.warn("[CallHistory] No auth user / token");
    return;
  }

  const agentId = await getAgentIdForUser(auth);
  if (!agentId) {
    // Nothing to show yet (no assistant for this user)
    return;
  }

  // Default period: last 30 days
  const now       = Date.now();
  const thirtyAgo = now - 30 * 24 * 60 * 60 * 1000;

  const allCalls = await fetchCalls(agentId, thirtyAgo, now) || [];

  // Cache full calls list for filters + usage summary
  usageCallsCache = Array.isArray(allCalls) ? allCalls : [];

  // Render initial table & usage
  renderCalls(usageCallsCache);
  updateUsageSummary();

  // Filter buttons
  const applyBtn = document.getElementById("applyCallFiltersBtn");
  const resetBtn = document.getElementById("resetCallFiltersBtn");

  if (applyBtn) {
    applyBtn.addEventListener("click", () => applyFilters());
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      ["filterMonth", "filterEndReason", "filterSentiment", "filterOutcome"].forEach(
        (id) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.tagName === "SELECT" || el.tagName === "INPUT") {
            el.value = "";
          }
        }
      );
      applyFilters();
    });
  }

  // Optional: also re-filter on change for more reactive UX
  ["filterMonth", "filterEndReason", "filterSentiment", "filterOutcome"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => applyFilters());
      }
    }
  );

  // (Optional) pagination buttons (no-op for now)
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  const pageIdx = document.getElementById("pageIndex");

  if (prevBtn && nextBtn && pageIdx) {
    prevBtn.addEventListener("click", () => {
      console.log("[CallHistory] Prev page clicked (not implemented yet)");
    });
    nextBtn.addEventListener("click", () => {
      console.log("[CallHistory] Next page clicked (not implemented yet)");
    });
  }
}

// ----------------------------------------------
// Run on DOM ready
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", initCallHistory);
