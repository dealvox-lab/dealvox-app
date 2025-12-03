// ==============================================
// Dealvox Call History
// - Uses Supabase REST + getAuthInfo()
// - Agent ID resolved per authenticated user
// - Also shows subscription usage card
// ==============================================

// ----------------------------------------------
// Call History – frontend fetch via Cloudflare Worker
// ----------------------------------------------

// Now we call the Worker route, NOT Retell directly
const CALL_API_URL = "/api/list-calls";

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
      // Using filter_criteria per new list-calls API
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
    return Array.isArray(data) ? data : [];
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
  const time = new Date(call.start_timestamp).toLocaleString();

  const durationSec = call?.call_cost?.total_duration_seconds ?? 0;

  // Custom pricing: durationSec / 60 * 1.5  (USD)
  const minutes = durationSec / 60;
  const costCalc = minutes * 1.5;
  const cost = costCalc.toFixed(2);

  const endReason = call?.disconnection_reason ?? "-";
  const status = call?.call_status ?? "-";
  const sentiment = call?.call_analysis?.user_sentiment ?? "-";
  const outcomeFlag = call?.call_analysis?.call_successful;
  const outcome = outcomeFlag ? "Success" : "No close";
  const recordingURL = call?.recording_url ?? "";

  // Audio player – will *play* in browser instead of direct download
  const recordingCell = recordingURL
    ? `
      <audio controls preload="none" style="width: 160px;">
        <source src="${recordingURL}" type="audio/wav">
        <a href="${recordingURL}" target="_blank" rel="noopener">Open</a>
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
// Filtering
// ----------------------------------------------
function applyFilters(allCalls) {
  const monthVal = document.getElementById("filterMonth")?.value ?? "";
  const endVal = document.getElementById("filterEndReason")?.value ?? "";
  const sentVal = document.getElementById("filterSentiment")?.value ?? "";
  const outcomeVal = document.getElementById("filterOutcome")?.value ?? "";

  let filtered = [...allCalls];

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

// ----------------------------------------------
// Billing helpers for usage card
// ----------------------------------------------
async function getBillingSummary() {
  try {
    const res = await fetch("/api/billing-summary", { method: "GET" });
    if (!res.ok) {
      console.error("[UsageSummary] billing-summary HTTP error:", res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[UsageSummary] billing-summary network/JSON error:", err);
    return null;
  }
}

function secondsToMinutes(sec) {
  return sec / 60;
}

/**
 * Update the “Subscription limits and spendings, in minutes” card.
 * - Uses /api/billing-summary for period start/end (or renews_at fallback)
 * - Uses already-loaded call list to compute used minutes in the period
 */
async function initUsageSummary(allCalls) {
  const card = document.getElementById("usageSummaryCard");
  if (!card) return; // card not on this page

  const billingPeriodEl = document.getElementById("billingPeriodStart");
  const planMinutesEl = document.getElementById("planMinutes");
  const usedMinutesEl = document.getElementById("usedMinutes");
  const remainingMinutesEl = document.getElementById("remainingMinutes");

  const planTotalMinutes =
    parseFloat(planMinutesEl?.textContent || "200") || 200;

  const billing = await getBillingSummary();
  if (!billing || !billing.current_plan) {
    console.warn("[UsageSummary] No current_plan in billing summary");
    if (billingPeriodEl) billingPeriodEl.textContent = "Unknown";
    if (usedMinutesEl) usedMinutesEl.textContent = "0.0";
    if (remainingMinutesEl)
      remainingMinutesEl.textContent = planTotalMinutes.toFixed(1);
    return;
  }

  const plan = billing.current_plan;

  // Prefer explicit period_start/period_end (if you added them in the CF function)
  let periodStartMs = plan.period_start || null;
  let periodEndMs = plan.period_end || null;

  // Fallback: derive a 30-day window ending at renews_at
  if (!periodStartMs || !periodEndMs) {
    if (plan.renews_at) {
      periodEndMs = plan.renews_at;
      periodStartMs = plan.renews_at - 30 * 24 * 60 * 60 * 1000;
    }
  }

  if (!periodStartMs || !periodEndMs) {
    console.warn("[UsageSummary] No billing period info available");
    if (billingPeriodEl) billingPeriodEl.textContent = "Unknown";
    if (usedMinutesEl) usedMinutesEl.textContent = "0.0";
    if (remainingMinutesEl)
      remainingMinutesEl.textContent = planTotalMinutes.toFixed(1);
    return;
  }

  // Display billing period start
  if (billingPeriodEl) {
    billingPeriodEl.textContent = new Date(periodStartMs).toLocaleString();
  }

  // Sum used seconds for calls within the billing period
  const usedSeconds = allCalls.reduce((acc, call) => {
    const ts = call.start_timestamp;
    if (typeof ts !== "number") return acc;
    if (ts < periodStartMs || ts >= periodEndMs) return acc;

    const dur = call?.call_cost?.total_duration_seconds ?? 0;
    return acc + (typeof dur === "number" ? dur : 0);
  }, 0);

  const usedMinutes = secondsToMinutes(usedSeconds);
  const remainingMinutes = Math.max(planTotalMinutes - usedMinutes, 0);

  if (usedMinutesEl) usedMinutesEl.textContent = usedMinutes.toFixed(1);
  if (remainingMinutesEl)
    remainingMinutesEl.textContent = remainingMinutes.toFixed(1);

  // Wire up the Upgrade button on this page as well
  const changePlanBtn = document.getElementById("billingChangePlanBtn");
  if (changePlanBtn) {
    changePlanBtn.addEventListener("click", async () => {
      try {
        changePlanBtn.disabled = true;
        const originalText = changePlanBtn.textContent;
        changePlanBtn.textContent = "Opening…";

        const res = await fetch("/api/billing-portal", { method: "POST" });
        if (!res.ok) {
          console.error(
            "[UsageSummary] billing-portal HTTP error:",
            res.status
          );
          changePlanBtn.textContent = originalText;
          changePlanBtn.disabled = false;
          return;
        }

        const json = await res.json();
        if (json && json.url) {
          window.location.href = json.url;
        } else {
          console.error("[UsageSummary] billing-portal: missing url", json);
          changePlanBtn.textContent = originalText;
          changePlanBtn.disabled = false;
        }
      } catch (err) {
        console.error("[UsageSummary] billing-portal error:", err);
        changePlanBtn.disabled = false;
        changePlanBtn.textContent = "Upgrade plan";
      }
    });
  }
}

// ----------------------------------------------
// Init
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

  // Default period: last 30 days for initial fetch
  const now = Date.now();
  const thirtyAgo = now - 30 * 24 * 60 * 60 * 1000;

  const allCalls = await fetchCalls(agentId, thirtyAgo, now);
  renderCalls(allCalls);

  // Init usage summary card with these calls
  initUsageSummary(allCalls);

  // Bind filters
  ["filterMonth", "filterEndReason", "filterSentiment", "filterOutcome"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => applyFilters(allCalls));
      }
    }
  );

  // (Optional) pagination buttons currently just placeholders
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  const pageIdx = document.getElementById("pageIndex");

  if (prevBtn && nextBtn && pageIdx) {
    prevBtn.addEventListener("click", () => {
      // TODO: hook into Retell pagination if needed
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
