// ==============================================
// Dealvox Call History
// Fetch + Render + Filter (v1)
// ==============================================

const CALL_API_URL = "https://api.retellai.com/v2/list-calls";

// ----------------------------------------------
// CONFIG: Replace these server-side
// ----------------------------------------------
const RETELL_SECRET_KEY = "{{ RETELL_SECRET_KEY }}";
const USER_AGENT_ID     = "{{ USER_AGENT_ID }}";


// ----------------------------------------------
// FETCH CALLS
// ----------------------------------------------
async function fetchCalls(startLower, startUpper) {
  try {
    const response = await fetch(CALL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RETELL_SECRET_KEY}`
      },
      body: JSON.stringify({
        agent_id: USER_AGENT_ID,
        start_timestamp: {
          lower_threshold: startLower,
          upper_threshold: startUpper
        }
      })
    });

    if (!response.ok) {
      console.error("Failed to fetch calls:", response.status);
      return [];
    }

    return await response.json();

  } catch (err) {
    console.error("Network or JSON error:", err);
    return [];
  }
}


// ----------------------------------------------
// RENDER ROW
// ----------------------------------------------
function rowHTML(call) {
  // Safe access / defaults
  const time         = new Date(call.start_timestamp).toLocaleString();
  const durationSec  = call?.call_cost?.total_duration_seconds ?? 0;
  const cost         = call?.call_cost?.combined_cost?.toFixed(2) ?? "0.00";
  const endReason    = call?.disconnection_reason ?? "-";
  const status       = call?.call_status ?? "-";
  const sentiment    = call?.call_analysis?.user_sentiment ?? "-";
  const outcomeFlag  = call?.call_analysis?.call_successful;
  const outcome      = outcomeFlag ? "Success" : "No Close";
  const recordingURL = call?.recording_url ?? "";

  const recordLink = recordingURL
    ? `<a href="${recordingURL}" target="_blank" class="btn small">Play</a>`
    : "";

  return `
    <tr>
      <td>${time}</td>
      <td>${durationSec}s</td>
      <td>$${cost}</td>
      <td>${endReason}</td>
      <td>${status}</td>
      <td>${sentiment}</td>
      <td>${outcome}</td>
      <td>${recordLink}</td>
    </tr>
  `;
}


// ----------------------------------------------
// RENDER TABLE
// ----------------------------------------------
function renderCalls(calls) {
  const tbody = document.getElementById("callHistoryBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  calls.forEach(call => {
    tbody.insertAdjacentHTML("beforeend", rowHTML(call));
  });
}


// ----------------------------------------------
// FILTER HANDLERS (to extend later)
// ----------------------------------------------
function applyFilters(calls) {
  const monthVal    = document.getElementById("filterMonth")?.value ?? "";
  const endVal      = document.getElementById("filterEndReason")?.value ?? "";
  const sentVal     = document.getElementById("filterSentiment")?.value ?? "";
  const outcomeVal  = document.getElementById("filterOutcome")?.value ?? "";

  let filtered = [...calls];

  // Month-Year filter
  if (monthVal) {
    const [year, month] = monthVal.split("-");
    filtered = filtered.filter(call => {
      const d = new Date(call.start_timestamp);
      return (
        d.getFullYear() === parseInt(year) &&
        (d.getMonth() + 1) === parseInt(month)
      );
    });
  }

  // End Reason filter
  if (endVal) {
    filtered = filtered.filter(call =>
      (call.disconnection_reason ?? "").toLowerCase() === endVal.toLowerCase()
    );
  }

  // Sentiment filter
  if (sentVal) {
    filtered = filtered.filter(call =>
      (call?.call_analysis?.user_sentiment ?? "").toLowerCase() === sentVal.toLowerCase()
    );
  }

  // Outcome filter
  if (outcomeVal) {
    // TODO: adjust for your exact custom outcomes
    filtered = filtered.filter(call =>
      (call?.call_analysis?.appointment_type ?? "").toLowerCase() === outcomeVal.toLowerCase()
    );
  }

  renderCalls(filtered);
}


// ----------------------------------------------
// INIT
// ----------------------------------------------
async function initCallHistory() {
  // 1) Load 30 days by default
  const now       = Date.now();
  const thirtyDay = now - (30 * 24 * 60 * 60 * 1000);

  // Convert to thresholds (Retell wants ms timestamps)
  const calls = await fetchCalls(thirtyDay, now);

  // Render initial list
  renderCalls(calls);

  // Bind filter listeners
  [
    "filterMonth",
    "filterEndReason",
    "filterSentiment",
    "filterOutcome"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => applyFilters(calls));
    }
  });
}


// ----------------------------------------------
// RUN
// ----------------------------------------------
document.addEventListener("DOMContentLoaded", initCallHistory);
