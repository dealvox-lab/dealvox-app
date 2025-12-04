// ==============================================
// Dealvox Call History + Usage Summary
// ==============================================

// Global cache so filters & usage summary share the same data
let ALL_CALLS = [];

// ----------------------------------------------
// Call History – frontend fetch via Cloudflare Worker
// ----------------------------------------------

// We call the Worker route, NOT Retell directly
const CALL_API_URL = "/api/list-calls";

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
        // new Retell filter-style payload
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

    const raw = await response.json();

    // Defensive: support both `[...]` and `{ data: [...] }`
    let calls;
    if (Array.isArray(raw)) {
      calls = raw;
    } else if (raw && Array.isArray(raw.data)) {
      calls = raw.data;
    } else {
      console.warn("[CallHistory] Unexpected list-calls shape:", raw);
      calls = [];
    }

    console.log("[CallHistory] Loaded calls:", calls.length);
    return calls;
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
  const baseUrl = `${window.SUPABASE_URL.replace(
    /\/+$/,
    ""
  )}/rest/v1/assistants`;

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
  const time = new Date(call.start_timestamp).toLocaleString();

  // Duration: seconds from Retell
  const durationSec = call?.call_cost?.total_duration_seconds ?? 0;

  // Display duration in seconds (you can switch to minutes if you prefer)
  const durationLabel = `${durationSec}s`;

  // Custom pricing (in $): durationSec / 60 * 1.5
  const costMin = durationSec / 60;
  const costCalc = costMin * 1.5;
  const cost = costCalc.toFixed(2);

  const endReason = call?.disconnection_reason ?? "-";
  const status = call?.call_status ?? "-";
  const sentiment = call?.call_analysis?.user_sentiment ?? "-";
  const outcomeFlag = call?.call_analysis?.call_successful;
  const outcome = outcomeFlag ? "Success" : "No close";
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
      <td>${durationLabel}</td>
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
// Filters
// ----------------------------------------------
function getFilterElements() {
  return {
    monthEl: document.getElementById("filterMonth"),
    endEl: document.getElementById("filterEndReason"),
    sentEl: document.getElementById("filterSentiment"),
    outcomeEl: document.getElementById("filterOutcome"),
  };
}

function applyFilters() {
  const { monthEl, endEl, sentEl, outcomeEl } = getFilterElements();

  let filtered = [...ALL_CALLS];

  // Month-year
  const monthVal = monthEl?.value ?? "";
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
  const endVal = endEl?.value ?? "";
  if (endVal) {
    filtered = filtered.filter(
      (call) =>
        (call.disconnection_reason ?? "").toLowerCase() ===
        endVal.toLowerCase()
    );
  }

  // User sentiment
  const sentVal = sentEl?.value ?? "";
  if (sentVal) {
    filtered = filtered.filter(
      (call) =>
        (call?.call_analysis?.user_sentiment ?? "").toLowerCase() ===
        sentVal.toLowerCase()
    );
  }

  // Outcome (map from custom_analysis_data / flags)
  const outcomeVal = outcomeEl?.value ?? "";
  if (outcomeVal) {
    filtered = filtered.filter((call) => {
      const customType =
        (
          call?.call_analysis?.custom_analysis_data?.appointment_type ?? ""
        ).toLowerCase();
      const success = call?.call_analysis?.call_successful;
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

function resetFilters() {
  const { monthEl, endEl, sentEl, outcomeEl } = getFilterElements();
  if (monthEl) monthEl.value = "";
  if (endEl) endEl.value = "";
  if (sentEl) sentEl.value = "";
  if (outcomeEl) outcomeEl.value = "";
  renderCalls(ALL_CALLS);
}

// ----------------------------------------------
// Usage Summary (Stripe + calls)
// ----------------------------------------------
async function initUsageSummary(calls) {
  const card = document.getElementById("usageSummaryCard");
  if (!card) return;

  const billingStartEl = document.getElementById("billingPeriodStart");
  const planMinutesEl = document.getElementById("planMinutes");
  const usedMinutesEl = document.getElementById("usedMinutes");
  const remainingMinutesEl = document.getElementById("remainingMinutes");

  // 1) Fetch billing summary (same worker as billing page)
  let summary;
  try {
    const res = await fetch("/api/billing-summary");
    if (!res.ok) {
      console.error("[UsageSummary] billing-summary HTTP error:", res.status);
      return;
    }
    summary = await res.json();
  } catch (err) {
    console.error("[UsageSummary] billing-summary error:", err);
    return;
  }

  const currentPlan = summary.current_plan || {};
  const periodStartMs =
    currentPlan.period_start != null
      ? currentPlan.period_start * 1000
      : null; // Stripe seconds → ms

  // If we don’t have period_start in worker, show “N/A”
  if (!periodStartMs) {
    console.warn("[UsageSummary] No billing period info available");
    if (billingStartEl) billingStartEl.textContent = "N/A";
  } else {
    if (billingStartEl) {
      billingStartEl.textContent = new Date(periodStartMs).toLocaleString();
    }
  }

  // 2) Plan minutes (placeholder or from metadata later)
  const totalPlanMinutes = 200; // TODO: wire to Stripe metadata if needed
  if (planMinutesEl) planMinutesEl.textContent = totalPlanMinutes.toString();

  // 3) Used minutes this period (sum duration where start >= period start)
  let usedSeconds = 0;
  if (periodStartMs) {
    for (const call of calls) {
      const started = call.start_timestamp;
      const durationSec =
        call?.call_cost?.total_duration_seconds ??
        Math.floor((call.end_timestamp - call.start_timestamp) / 1000) ??
        0;

      if (started >= periodStartMs) {
        usedSeconds += durationSec;
      }
    }
  }

  const usedMinutes = usedSeconds / 60;
  const remainingMinutes = totalPlanMinutes - usedMinutes;

  if (usedMinutesEl) usedMinutesEl.textContent = usedMinutes.toFixed(1);
  if (remainingMinutesEl)
    remainingMinutesEl.textContent = remainingMinutes.toFixed(1);

  // 4) Upgrade button → Stripe portal
  const upgradeBtn =
    document.getElementById("billingChangePlanBtn") ||
    document.getElementById("billingChangePlan");

  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        upgradeBtn.disabled = true;
        const originalText = upgradeBtn.textContent;
        upgradeBtn.textContent = "Opening…";

        const res = await fetch("/api/billing-portal", { method: "POST" });
        const json = await res.json();
        if (json && json.url) {
          window.location.href = json.url;
        } else {
          console.error("[UsageSummary] Invalid billing-portal response:", json);
          upgradeBtn.disabled = false;
          upgradeBtn.textContent = originalText;
        }
      } catch (err) {
        console.error("[UsageSummary] billing-portal error:", err);
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = "Upgrade plan";
      }
    });
  }
}

// ----------------------------------------------
// Init Call History
// ----------------------------------------------
async function initCallHistory() {
  const cardEl = document.getElementById("callHistoryCard");
  if (!cardEl) return; // not on this page

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
    // nothing to show yet
    return;
  }

  // Fetch all calls for this agent
  ALL_CALLS = await fetchCalls(agentId);
  renderCalls(ALL_CALLS);

  // Init usage summary with same calls
  initUsageSummary(ALL_CALLS);

  // Hook filter buttons
  const applyBtn =
    document.getElementById("callFiltersApplyBtn") ||
    document.getElementById("applyFiltersBtn");
  const resetBtn =
    document.getElementById("callFiltersResetBtn") ||
    document.getElementById("resetFiltersBtn");

  if (applyBtn) {
    applyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      applyFilters();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      resetFilters();
    });
  }
}

// ----------------------------------------------
// Run on DOM ready
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", initCallHistory);
