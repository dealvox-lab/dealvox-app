// ==============================================
// Dealvox Call History + Usage Summary
// - Uses Supabase REST + getAuthInfo()
// - Agent ID resolved per authenticated user
// - Calls fetched via Cloudflare Worker /api/list-calls
// - Billing summary via /api/billing-summary
// ==============================================

const CALL_API_URL          = "/api/list-calls";
const BILLING_SUMMARY_URL   = "/api/billing-summary";
const BILLING_PORTAL_URL    = "/api/billing-portal";

let allCallsCache = [];

// ----------------------------------------------
// Fetch calls (browser → Worker → Retell)
// ----------------------------------------------
async function fetchCalls(agentId) {
  try {
    const response = await fetch(CALL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter_criteria: {
          agent_id: [agentId],
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
    // Retell returns an array of calls
    if (!Array.isArray(data)) {
      console.warn("[CallHistory] Unexpected list-calls payload shape:", data);
      return [];
    }
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
  const time        = new Date(call.start_timestamp).toLocaleString();
  const durationSec = call?.call_cost?.total_duration_seconds ?? 0;

  // Custom pricing – 1.5 $ / minute
  const costMinutes = durationSec / 60;
  const costCalc    = costMinutes * 1.5;
  const cost        = costCalc.toFixed(2);

  const endReason    = call?.disconnection_reason ?? "-";
  const status       = call?.call_status ?? "-";
  const sentiment    = call?.call_analysis?.user_sentiment ?? "-";
  const outcomeFlag  = call?.call_analysis?.call_successful;
  const outcome      = outcomeFlag ? "Success" : "No close";
  const recordingURL = call?.recording_url ?? "";

  const recordingCell = recordingURL
    ? `
      <audio controls preload="none" style="width: 180px;">
        <source src="${recordingURL}" type="audio/wav">
        <a href="${recordingURL}" target="_blank" rel="noopener">Download</a>
      </audio>
    `
    : "-";

  return `
    <tr>
      <td>${time}</td>
      <td>${durationSec}s</td>
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
  const tbody = document.getElementById("callHistoryBody");
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
// Filtering (uses global allCallsCache)
// ----------------------------------------------
function applyFilters() {
  const monthVal   = document.getElementById("filterMonth")?.value ?? "";
  const endVal     = document.getElementById("filterEndReason")?.value ?? "";
  const sentVal    = document.getElementById("filterSentiment")?.value ?? "";
  const outcomeVal = document.getElementById("filterOutcome")?.value ?? "";

  let filtered = [...allCallsCache];

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

  // Outcome
  if (outcomeVal) {
    filtered = filtered.filter((call) => {
      const customType =
        (call?.call_analysis?.custom_analysis_data?.appointment_type ?? "")
          .toLowerCase();
      const success   = call?.call_analysis?.call_successful;
      const voicemail = call?.call_analysis?.in_voicemail === true;

      switch (outcomeVal) {
        case "appointment":
          return customType === "appointment";
        case "payment_link":
          return customType === "payment_link";
        case "warm_transfer":
          return customType === "warm_transfer";
        case "qualified_lead":
          return success === true;
        case "voicemail":
          return voicemail;
        default:
          return true;
      }
    });
  }

  renderCalls(filtered);
}

// ----------------------------------------------
// Usage summary helpers
// ----------------------------------------------
function sumUsedMinutesInPeriod(calls, periodStartMs) {
  if (!periodStartMs) return 0;
  if (!Array.isArray(calls) || !calls.length) return 0;

  const usedSeconds = calls
    .filter((c) => typeof c.start_timestamp === "number" && c.start_timestamp >= periodStartMs)
    .reduce(
      (acc, c) => acc + (c.call_cost?.total_duration_seconds ?? 0),
      0
    );

  return usedSeconds / 60; // minutes
}

async function fetchBillingSummary() {
  const res = await fetch(BILLING_SUMMARY_URL, { method: "GET" });
  if (!res.ok) {
    console.error("[UsageSummary] billing-summary HTTP error:", res.status);
    throw new Error("Billing summary error");
  }
  return res.json();
}

async function initUsageSummary(calls) {
  const card = document.getElementById("usageSummaryCard");
  if (!card) return; // not on this page

  const billingStartEl   = document.getElementById("billingPeriodStart");
  const planMinutesEl    = document.getElementById("planMinutes");
  const usedMinutesEl    = document.getElementById("usedMinutes");
  const remainingMinutesEl = document.getElementById("remainingMinutes");
  const upgradeBtn       = document.getElementById("billingChangePlanBtn");

  let periodStartMs = null;

  try {
    const summary = await fetchBillingSummary();
    const periodStart = summary?.current_plan?.period_start || null;

    if (periodStart) {
      periodStartMs = periodStart;
      if (billingStartEl) {
        billingStartEl.textContent = new Date(periodStartMs).toLocaleString();
      }
    } else if (billingStartEl) {
      billingStartEl.textContent = "Not available";
    }
  } catch (err) {
    console.error("[UsageSummary] Failed to load billing summary:", err);
    if (billingStartEl) billingStartEl.textContent = "Error loading";
  }

  const totalPlanMinutes =
    Number(planMinutesEl?.textContent) || 200;

  const usedMinutes = sumUsedMinutesInPeriod(calls, periodStartMs);
  const remaining   = Math.max(0, totalPlanMinutes - usedMinutes);

  if (usedMinutesEl) {
    usedMinutesEl.textContent = usedMinutes.toFixed(1);
  }
  if (remainingMinutesEl) {
    remainingMinutesEl.textContent = remaining.toFixed(1);
  }

  // Bind Upgrade button directly to Stripe portal
  if (upgradeBtn && !upgradeBtn.dataset.bound) {
    upgradeBtn.dataset.bound = "1";
    upgradeBtn.addEventListener("click", async () => {
      upgradeBtn.disabled = true;
      try {
        const res = await fetch(BILLING_PORTAL_URL, { method: "POST" });
        if (!res.ok) {
          console.error("[UsageSummary] billing-portal HTTP error:", res.status);
          upgradeBtn.disabled = false;
          return;
        }
        const json = await res.json();
        if (json && json.url) {
          window.location.href = json.url;
        } else {
          console.error("[UsageSummary] Missing portal URL in response", json);
          upgradeBtn.disabled = false;
        }
      } catch (e) {
        console.error("[UsageSummary] Failed to open billing portal:", e);
        upgradeBtn.disabled = false;
      }
    });
  }
}

// ----------------------------------------------
// Init
// ----------------------------------------------
async function initCallHistory() {
  const cardEl = document.getElementById("callHistoryCard");
  if (!cardEl) return; // not on this view

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
  if (!agentId) return;

  // Fetch all calls for this agent
  const calls = await fetchCalls(agentId);
  allCallsCache = Array.isArray(calls) ? calls : [];

  // Initial render
  applyFilters(); // uses allCallsCache internally

  // Init usage summary (period start + minutes)
  await initUsageSummary(allCallsCache);

  // Bind filters
  ["filterMonth", "filterEndReason", "filterSentiment", "filterOutcome"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => applyFilters());
      }
    }
  );

  // Optional: pagination placeholders (still no backend pagination)
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
