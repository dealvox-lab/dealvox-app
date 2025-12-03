// ==============================================
// Dealvox Call History
// - Uses Supabase REST + getAuthInfo()
// - Agent ID resolved per authenticated user
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
      body: JSON.stringify({
        filter_criteria: {
    agent_id: [agentId]
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
    console.error("[CallHistory] assistants load HTTP error:", res.status, await res.text());
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
  const time         = new Date(call.start_timestamp).toLocaleString();
const durationSec  = call?.call_cost?.total_duration_seconds ?? 0;

// Custom pricing (in $)
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
  const monthVal   = document.getElementById("filterMonth")?.value ?? "";
  const endVal     = document.getElementById("filterEndReason")?.value ?? "";
  const sentVal    = document.getElementById("filterSentiment")?.value ?? "";
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

  // Outcome (you can refine mapping to your exact states)
  if (outcomeVal) {
    filtered = filtered.filter((call) => {
      const customType =
        (call?.call_analysis?.custom_analysis_data?.appointment_type ?? "")
          .toLowerCase();
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

  // Default period: last 30 days
  const now       = Date.now();
  const thirtyAgo = now - 30 * 24 * 60 * 60 * 1000;

  const allCalls = await fetchCalls(agentId, thirtyAgo, now);
  renderCalls(allCalls);

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
