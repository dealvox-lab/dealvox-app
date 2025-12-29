// /assets/js/account.js

// ----------------------------------------------------
// AUTH + SUPABASE HELPERS
// ----------------------------------------------------

async function getAuthInfo() {
  const res = await fetch("/debug-auth", { credentials: "include" });
  if (!res.ok) throw new Error(`debug-auth HTTP ${res.status}`);
  const data = await res.json();
  return {
    accessToken: data.accessToken || null,
    user: data.userSummary || null,
  };
}

  async function refreshToken() {
    try {
    const res = await fetch("/refresh", {
      method: "POST",
      credentials: "include",
    });
    const body = await res.text();
    console.log("Refresh response:", res.status, body);
    if (!res.ok) return false;
    return true;
  } catch (err) {
    console.error("Refresh error:", err);
    return false;
  }
}

async function handleJwt401(res, label) {
  const body = await res.text();
  console.warn(`401 from Supabase (${label}):`, body);

  const ok = await refreshToken();
  if (!ok) {
    console.warn("Token refresh FAILED");
    return null;
  }

  try {
    const auth = await getAuthInfo();
    if (!auth.accessToken) {
      console.warn("Refresh succeeded but no accessToken returned");
      return null;
    }
    console.log("Token refreshed, new access token via debug-auth.");
    return auth;
  } catch (e) {
    console.error("Failed to reload auth after refresh:", e);
    return null;
  }
}

function supabaseHeaders(accessToken) {
  const url = window.SUPABASE_URL;
  const anon = window.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY missing on window");
  }
  if (!accessToken) {
    throw new Error("accessToken required for Supabase REST");
  }
  return {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

// ----------------------------------------------------
// PROFILE VIEW (Account tab)
// ----------------------------------------------------

async function initAccountProfileView() {
  const form         = document.getElementById("profileForm");
  const statusEl     = document.getElementById("profileStatus");
  const saveBtn      = document.getElementById("profileSaveBtn");
  const emailEl      = document.getElementById("profileEmail");
  const firstNameEl  = document.getElementById("profileFirstName");
  const lastNameEl   = document.getElementById("profileLastName");
  const jobTitleEl   = document.getElementById("profileJobTitle");
  const companyEl    = document.getElementById("profileCompanyName");

  if (!form) {
    console.warn("profileForm not found; skipping profile init");
    return;
  }
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed:", e);
    if (statusEl) statusEl.textContent = "Unable to load profile.";
    return;
  }

  if (!auth.user || !auth.accessToken) {
    if (statusEl) statusEl.textContent = "Session expired. Please log in.";
    return;
  }

  const userId = auth.user.id;
  if (emailEl && auth.user.email) {
    emailEl.value = auth.user.email;
  }

  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles`;

  // ---- LOAD PROFILE ----
  async function loadProfile() {
    if (statusEl) statusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set("select", "first_name,last_name,job_title,company_name,email");
    params.set("id", `eq.${userId}`);

    async function run(currentAuth) {
      return fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken),
      });
    }

    let res = await run(auth);
    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load profile");
      if (!newAuth) {
        if (statusEl) statusEl.textContent = "Session expired. Please log in.";
        return;
      }
      auth = newAuth;
      res = await run(auth);
    }

    if (!res.ok) {
      console.error("Profile load HTTP error:", res.status, await res.text());
      if (statusEl) statusEl.textContent = "Could not load profile.";
      return;
    }

    const rows = await res.json();
    const data = rows[0];
    if (data) {
      if (firstNameEl) firstNameEl.value = data.first_name || "";
      if (lastNameEl)  lastNameEl.value  = data.last_name || "";
      if (jobTitleEl)  jobTitleEl.value  = data.job_title || "";
      if (companyEl)   companyEl.value   = data.company_name || "";
      if (emailEl && !emailEl.value && data.email) {
        emailEl.value = data.email;
      }
    }

    if (statusEl) statusEl.textContent = "";
  }

  // ---- SAVE PROFILE ----
  async function saveProfile() {
    if (!saveBtn) return;
    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";

    const payload = {
      id: auth.user.id,
      email: auth.user.email,
      first_name:  firstNameEl ? firstNameEl.value.trim()  || null : null,
      last_name:   lastNameEl  ? lastNameEl.value.trim()   || null : null,
      job_title:   jobTitleEl  ? jobTitleEl.value.trim()   || null : null,
      company_name: companyEl  ? companyEl.value.trim()    || null : null,
    };

    async function run(currentAuth) {
      return fetch(baseUrl, {
        method: "POST",
        headers: {
          ...supabaseHeaders(currentAuth.accessToken),
          Prefer: "return=minimal, resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });
    }

    try {
      let res = await run(auth);
      if (res.status === 401) {
        const newAuth = await handleJwt401(res, "save profile");
        if (!newAuth) {
          if (statusEl) statusEl.textContent = "Session expired. Please log in.";
          saveBtn.disabled = false;
          return;
        }
        auth = newAuth;
        res = await run(auth);
      }

      if (!res.ok) {
        console.error("Profile save HTTP error:", res.status, await res.text());
        if (statusEl) statusEl.textContent = "Save failed. Try again.";
      } else {
        if (statusEl) statusEl.textContent = "Saved.";
        setTimeout(() => statusEl && (statusEl.textContent = ""), 1500);
      }
    } catch (e) {
      console.error("Profile save error:", e);
      if (statusEl) statusEl.textContent = "Save failed. Try again.";
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveProfile();
  });

  // Load profile (no need to await)
  loadProfile();

  // Check subscription; if no subscription → init pricing sliders
  const hasSub = await initProfileSubscriptionSection(auth);
  if (!hasSub && typeof window.initAccountPricingSection === "function") {
    window.initAccountPricingSection();
  }

  // Wire billing buttons (Change plan / Cancel plan)
  if (typeof wireBillingButtons === "function") {
  wireBillingButtons();
  }
}
//----------------------------------------------------
// SUBSCRIPTION CHECKING PROFILE PART
// ---------------------------------------------------

async function initProfileSubscriptionSection(auth) {
  const pricingCard = document.getElementById("pricingCard");
  const subscriptionCard = document.getElementById("subscriptionCard");

  if (!pricingCard || !subscriptionCard) {
    console.log("[Profile] pricing/subscription cards not found in DOM");
    return false;
  }

  // Default: show pricing, hide subscription
  pricingCard.style.display = "block";
  subscriptionCard.style.display = "none";

  try {
    if (!auth) {
      auth = await getAuthInfo();
    }
  } catch (err) {
    console.error("[Profile] getAuthInfo failed:", err);
    return false;
  }

  const userId = auth?.user?.id;
  if (!userId) {
    console.warn("[Profile] No user id – showing pricing.");
    return false;
  }

  // Supabase subscriptions table
  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/subscriptions`;
  const params = new URLSearchParams({
    select: "*",
    user_id: `eq.${userId}`,
    limit: "1",
  });

  try {
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: supabaseHeaders(auth.accessToken),
    });

    if (!res.ok) {
      console.error("[Profile] subscription HTTP error:", res.status);
      return false; // keep pricing
    }

    const rows = await res.json();
    console.log("[Profile] subscription rows:", rows);

    if (!Array.isArray(rows) || rows.length === 0) {
      // No subscription for this user → keep pricing visible
      return false;
    }

    const sub = rows[0];

    // We have a subscription → fill card & switch visibility
    fillSubscriptionCard(sub);
    subscriptionCard.style.display = "block";
    pricingCard.style.display = "none";

    return true;
  } catch (err) {
    console.error("[Profile] error loading subscription:", err);
    return false;
  }
}
function fillSubscriptionCard(sub) {
  const planNameEl       = document.getElementById("subPlanName");
  const planTypeEl       = document.getElementById("subPlanType");
  const priceEl          = document.getElementById("subPrice");
  const minutesTotalEl   = document.getElementById("subMinutesTotal");
  const minutesSpentEl   = document.getElementById("subMinutesSpent");
  const minutesLeftEl    = document.getElementById("subMinutesLeft");
  const startDateEl      = document.getElementById("subStartDate");
  const statusEl         = document.getElementById("subStatus");
  const addPaymentBtn    = document.getElementById("billingAddPaymentBtn");

  const {
    sub_name,
    sub_type,
    sub_amount,
    minutes_total,
    minutes_spent,
    minutes_to_spend,
    start_date,
    sub_active,
  } = sub;

  const currency = "$";
  const type = (sub_type || "").toLowerCase();

  // ----- Plan name / type -----
  if (planNameEl) planNameEl.textContent = sub_name || "Custom plan";
  if (planTypeEl) planTypeEl.textContent = sub_type || "";

  // ----- Price display -----
  if (priceEl) {
    const rawAmount =
      typeof sub_amount === "number" ? sub_amount : Number(sub_amount);

    if (!Number.isFinite(rawAmount)) {
      priceEl.textContent = "—";
    } else if (type === "week") {
      // PAYG weekly plan → price per minute
      priceEl.textContent = `${currency}${rawAmount.toFixed(2)}/min`;
    } else {
      // month / year (or anything else) → subscription price
      const periodLabel =
        type === "year" || type === "yearly" ? "yr" : "mo";
      priceEl.textContent = `${currency}${rawAmount.toFixed(0)}/${periodLabel}`;
    }
  }

  // ----- Minutes -----
const spent =
  minutes_spent != null
    ? Number(minutes_spent)
    : minutes_total != null && minutes_to_spend != null
    ? Number(minutes_total) - Number(minutes_to_spend)
    : 0;

if (type === "week") {
  // PAYG WEEKLY PLAN → Only show "Used XX.XX min" (large row)
  if (minutesTotalEl) minutesTotalEl.textContent = `Used ${spent.toFixed(2)} min`;

  // Remove small rows
  if (minutesSpentEl) minutesSpentEl.textContent = "";
  if (minutesLeftEl) minutesLeftEl.textContent = "";
} else {
  // NORMAL PLANS
  if (minutesTotalEl) {
    minutesTotalEl.textContent =
      minutes_total != null ? `${minutes_total.toFixed(2)} min` : "—";
  }

  if (minutesSpentEl) minutesSpentEl.textContent = spent.toFixed(2);

  if (minutesLeftEl)
    minutesLeftEl.textContent =
      minutes_to_spend != null ? minutes_to_spend : "—";
}

  // ----- Start date -----
  if (startDateEl) {
    if (start_date) {
      const d = new Date(start_date);
      startDateEl.textContent = isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
    } else {
      startDateEl.textContent = "—";
    }
  }

  // ----- Status + Add payment button -----
  if (statusEl) {
    const active = sub_active !== false; // treat null/undefined as active
    statusEl.textContent = active ? "Active" : "Inactive";

    // Basic colors (tweak with your CSS if needed)
    statusEl.style.background = active ? "#dcfce7" : "#fee2e2";
    statusEl.style.color      = active ? "#166534" : "#991b1b";

    // Show/hide Add payment method button
    if (addPaymentBtn) {
      addPaymentBtn.style.display = active ? "none" : "inline-flex";
    }
  }
}

// ----------------------------------------------------
// ASSISTANT VIEW (Assistant tab) - TWO-STEP FLOW
// ----------------------------------------------------



// GLOBAL: Test Call modal + delegation (SPA-safe)

window.assistantFromNumber = window.assistantFromNumber || "";

window.openTestCallModal = function () {
  const modal = document.getElementById("asstTestCallModal");
  if (!modal) {
    console.warn("[TestCall] Modal not found");
    return;
  }

  const statusEl = document.getElementById("asstTestCallStatus");
  const fromEl   = document.getElementById("asstTestFromNumber");

  if (statusEl) statusEl.textContent = "";
  if (fromEl) fromEl.textContent = (window.assistantFromNumber || "").trim() || "—";

  modal.hidden = false;
};

window.closeTestCallModal = function () {
  const modal = document.getElementById("asstTestCallModal");
  if (!modal) return;
  modal.hidden = true;
};

window.triggerTestCall = async function () {
  const statusEl = document.getElementById("asstTestCallStatus");
  const callBtn  = document.getElementById("asstCallMeBtn");

  const from = (window.assistantFromNumber || "").trim();
  if (!from) {
    if (statusEl) statusEl.textContent = "Buy a phone number first.";
    return;
  }

  const to = document.getElementById("asstTestToNumber")?.value.trim() || "";
  if (!to) {
    if (statusEl) statusEl.textContent = "Please enter destination phone number.";
    return;
  }

  const payload = {
    from_number: from,
    to_number: to,
    retell_llm_dynamic_variables: {
      firstName: document.getElementById("asstVarFirstName")?.value.trim() || "John",
      lastName:  document.getElementById("asstVarLastName")?.value.trim() || "Doe",
      company:   document.getElementById("asstVarCompany")?.value.trim() || "Acme Inc.",
      industry:  document.getElementById("asstVarIndustry")?.value.trim() || "Finance",
    }
  };

  const endpoint =
    "https://dealvox-840984531750.us-east4.run.app/webhook-test/9479a9d6-267e-419d-b583-d12a0f44757f";

  if (statusEl) statusEl.textContent = "Calling…";
  if (callBtn) callBtn.disabled = true;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[TestCall] webhook error:", res.status, txt);
      if (statusEl) statusEl.textContent = "Call failed. Please try again.";
      return;
    }

    if (statusEl) statusEl.textContent = "Call triggered ✅";
  } catch (err) {
    console.error("[TestCall] error:", err);
    if (statusEl) statusEl.textContent = "Call failed. Please try again.";
  } finally {
    if (callBtn) callBtn.disabled = false;
  }
};

// ✅ ONE delegated listener only (works even if HTML is injected later)
if (!window.__dealvox_test_call_delegation_bound) {
  window.__dealvox_test_call_delegation_bound = true;

  document.addEventListener("click", (e) => {
    // Open
    const openBtn = e.target.closest("#asstTestCallBtn");
    if (openBtn) {
      e.preventDefault();
      window.openTestCallModal();
      return;
    }

    // Close
    const closeBtn = e.target.closest("#asstTestCallClose");
    if (closeBtn) {
      e.preventDefault();
      window.closeTestCallModal();
      return;
    }

    // Call me
    const callBtn = e.target.closest("#asstCallMeBtn");
    if (callBtn) {
      e.preventDefault();
      window.triggerTestCall();
      return;
    }

    // Backdrop click closes (optional)
    const modal = document.getElementById("asstTestCallModal");
    if (modal && !modal.hidden && e.target === modal) {
      window.closeTestCallModal();
    }
  });
}


// ----------------------------------------------------
// Desired Outcome UI (no changes needed beyond this)
// ----------------------------------------------------
function initDesiredOutcomeUI() {
  const outcome = document.getElementById("asstDesiredOutcome");
  if (!outcome) {
    console.warn("[Assistant] asstDesiredOutcome not found. Check HTML IDs / partial load.");
    return;
  }

  const book     = document.getElementById("outcomeBookMeeting");
  const transfer = document.getElementById("outcomeTransferCall");
  const send     = document.getElementById("outcomeSendInfo");

  const cold        = document.getElementById("asstTransferCold");
  const warm        = document.getElementById("asstTransferWarm");
  const warmDetails = document.getElementById("outcomeWarmDetails");

  const sms      = document.getElementById("asstSendSms");
  const smsEmail = document.getElementById("asstSendSmsEmail");

  const smsEmailDetails = document.getElementById("outcomeSendSmsEmailDetails");

  const calYes = document.getElementById("asstCalCheckAvailabilityYes");
  const calNo  = document.getElementById("asstCalCheckAvailabilityNo");

  const show = (el, visible) => { if (el) el.hidden = !visible; };

  function syncExclusive(a, b) {
    if (!a || !b) return;
    if (a.checked) b.checked = false;
  }

  function syncNested(v) {
    const isTransfer = (v === "transfer_call");
    const isSend     = (v === "send_information");

    show(warmDetails, isTransfer && !!(warm && warm.checked));
    show(smsEmailDetails, isSend && !!(smsEmail && smsEmail.checked));
  }

  function syncOutcome() {
    let v = (outcome.value || "").trim();
    const isBook = (v === "book_a_meeting" || v === "book_meeting");
    const isTransfer = (v === "transfer_call");
    const isSend = (v === "send_information");

    show(book, isBook);
    show(transfer, isTransfer);
    show(send, isSend);

    syncNested(isBook ? "book_a_meeting" : v);
  }

  if (outcome.dataset.bound === "1") {
    syncOutcome();
    return;
  }
  outcome.dataset.bound = "1";

  outcome.addEventListener("change", syncOutcome);

  cold?.addEventListener("change", () => { syncExclusive(cold, warm); syncOutcome(); });
  warm?.addEventListener("change", () => { syncExclusive(warm, cold); syncOutcome(); });

  sms?.addEventListener("change", () => { syncExclusive(sms, smsEmail); syncOutcome(); });
  smsEmail?.addEventListener("change", () => { syncExclusive(smsEmail, sms); syncOutcome(); });

  calYes?.addEventListener("change", () => syncExclusive(calYes, calNo));
  calNo?.addEventListener("change", () => syncExclusive(calNo, calYes));

  syncOutcome();
}


// ----------------------------------------------------
// Main init
// ----------------------------------------------------
async function initAccountAssistantView() {
  const deploySection = document.getElementById("assistantInitial");
  const manageSection = document.getElementById("assistantManage");

  const buyCard        = document.getElementById("asstBuyCard");
  const buyBtn         = document.getElementById("asstBuyNumberBtn");
  const buyStatusEl    = document.getElementById("asstBuyStatus");
  const buySpinner     = document.getElementById("asstBuySpinner");
  const buySpinnerText = document.getElementById("asstBuySpinnerText");
  const areaSelect     = document.getElementById("asstPhoneAreaSelect");
  const PHONE_AREA_CODES = window.PHONE_AREA_CODES || [];

  const deployForm     = document.getElementById("assistantDeployForm");
  const deployLoader   = document.getElementById("asstDeployLoader");
  const deployNoteEl   = document.getElementById("asstDeployNote");

  const form           = document.getElementById("assistantForm");
  const saveStatusEl   = document.getElementById("asstStatus");
  const saveBtn        = document.getElementById("asstSaveBtn");
  const deleteBtn      = document.getElementById("asstDeleteBtn");

  // Always force modal closed on init (prevents showing on reload)
  const testModal = document.getElementById("asstTestCallModal");
  if (testModal) testModal.hidden = true;

  if (!deploySection || !manageSection) {
    console.warn("Assistant sections not found; skipping assistant init");
    return;
  }

  function syncPhoneUI(phoneNumber) {
  const phoneInput = document.getElementById("asstPhoneNumber");
  const phoneHint  = document.getElementById("asstPhoneHint");
  const testBtnEl  = document.getElementById("asstTestCallBtn");

  const pn = (phoneNumber || "").trim();

  // keep global source of truth for modal
  window.assistantFromNumber = pn;

  // Phone input behavior
  if (phoneInput) {
    phoneInput.value = pn; // empty => clears field
    phoneInput.placeholder = pn ? "" : "Buy a phone number below first";
  }

  // Hint under the phone input
  if (phoneHint) {
    phoneHint.hidden = !!pn; // show hint only when empty
  }

  // Test Call button
  if (testBtnEl) {
    testBtnEl.style.display = pn ? "" : "none";
  }

  // Buy card
  if (buyCard) {
    buyCard.hidden = !!pn; // show buy card when empty
  }
}

  function populatePhoneAreaSelect() {
    if (!areaSelect) return;

    areaSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select area / code…";
    placeholder.disabled = true;
    placeholder.selected = true;
    areaSelect.appendChild(placeholder);

    (PHONE_AREA_CODES || []).forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      areaSelect.appendChild(opt);
    });
  }
  populatePhoneAreaSelect();

  // Prevent double-binding form submit
  const alreadyBound = (form && form.dataset.bound === "1");
  if (form) form.dataset.bound = "1";

  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed:", e);
    if (saveStatusEl) saveStatusEl.textContent = "Unable to load assistant.";
    return;
  }

  if (!auth.user || !auth.accessToken) {
    if (saveStatusEl) saveStatusEl.textContent = "Session expired. Please log in.";
    return;
  }

  const userId  = auth.user.id;
  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/assistants`;

  function setIfExists(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getSupabaseClient() {
    const candidate = window.supabaseClient || window.supabase || null;
    if (!candidate || typeof candidate.from !== "function") {
      console.warn("Supabase client not available or invalid, skipping DB check.");
      return null;
    }
    return candidate;
  }

  async function waitForAssistantUpdate(agentId, previousUpdatedAt, {
    timeoutMs = 120000,
    intervalMs = 5000
  } = {}) {
    const supabase = getSupabaseClient();
    if (!supabase || !agentId) return true;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from("assistants")
        .select("agent_id, updated_at")
        .eq("agent_id", agentId)
        .maybeSingle();

      if (!error && data) {
        if (!previousUpdatedAt && data.updated_at) return true;
        if (previousUpdatedAt && data.updated_at && data.updated_at !== previousUpdatedAt) return true;
      }
      await sleep(intervalMs);
    }
    return false;
  }

  async function waitForPhoneNumber(userId, {
    timeoutMs = 180000,
    intervalMs = 5000
  } = {}) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from("assistants")
        .select("user_id, phone_number")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data?.phone_number) return data.phone_number;
      await sleep(intervalMs);
    }
    return null;
  }

  // -------------------------
  // LOAD ASSISTANT
  // -------------------------
  async function loadAssistant() {
    if (saveStatusEl) saveStatusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("user_id", `eq.${userId}`);
    params.set("limit", "1");

    async function run(currentAuth) {
      return fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken),
      });
    }

    let res = await run(auth);
    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load assistant");
      if (!newAuth) {
        if (saveStatusEl) saveStatusEl.textContent = "Session expired. Please log in.";
        return false;
      }
      auth = newAuth;
      res  = await run(auth);
    }

    if (!res.ok) {
      console.error("Assistant load HTTP error:", res.status, await res.text());
      if (saveStatusEl) saveStatusEl.textContent = "Could not load assistant.";
      return false;
    }

    const rows = await res.json();
    const data = rows[0];

    if (data) {
      deploySection.hidden = true;
      manageSection.hidden = false;

      if (saveBtn) saveBtn.textContent = "Update and Publish";

      setIfExists("asstAgentId", data.agent_id);
      setIfExists("asstAgentName", data.agent_name);
      setIfExists("asstAgentType", data.agent_type);
      setIfExists("asstAgentVoice", data.agent_voice);
      setIfExists("asstPublished", data.is_published ? "true" : "false");
      setIfExists("asstPrompt", data.prompt);
      setIfExists("asstIntroPrompt", data.intro_prompt);
      setIfExists("asstWebhookUrl", data.webhook_url);

      setIfExists("asstDesiredOutcome", data.desired_outcome || "book_a_meeting");
      setIfExists("asstCalApiKey", data.cal_api_key || "");
      setIfExists("asstCalEventTypeId", data.cal_event_type_id || "");

      const yes = document.getElementById("asstCalCheckAvailabilityYes");
      const no  = document.getElementById("asstCalCheckAvailabilityNo");
      if (yes && no) {
        const v = !!data.cal_check_availability;
        yes.checked = v;
        no.checked  = !v;
      }

      const tc = document.getElementById("asstTransferCold");
      const tw = document.getElementById("asstTransferWarm");
      if (tc) tc.checked = !!data.transfer_cold;
      if (tw) tw.checked = !!data.transfer_warm;

      setIfExists("asstTransferPhone", data.transfer_phone || "");
      setIfExists("asstTransferWhisper", data.transfer_whisper || "");

      const ss = document.getElementById("asstSendSms");
      const se = document.getElementById("asstSendSmsEmail");
      if (ss) ss.checked = !!data.send_sms;
      if (se) se.checked = !!data.send_sms_email;

      setIfExists("asstSendMessage", data.send_message || "");
      setIfExists("asstCcEmail", data.cc_email || "");

      // KB file name display
      const kbNameEl = document.getElementById("asstKbSavedName");
      const savedKbName = (data.file_name || "").trim();
      if (kbNameEl) {
        if (savedKbName) {
          kbNameEl.textContent = savedKbName;
          kbNameEl.hidden = false;
          kbNameEl.style.display = "block";
        } else {
          kbNameEl.textContent = "";
          kbNameEl.hidden = true;
          kbNameEl.style.display = "none";
        }
      }

      // Phone UI (button/hint/buy card all in one place)
      syncPhoneUI(data.phone_number);
      // ✅ Enforce Test Call button visibility from DB source of truth
      const pn = (data.phone_number || "").trim();
      window.assistantFromNumber = pn;

const testBtnEl = document.getElementById("asstTestCallBtn");
if (testBtnEl) testBtnEl.hidden = !pn;

     // Force modal closed
      const modal = document.getElementById("asstTestCallModal");
      if (modal) modal.hidden = true;

      initDesiredOutcomeUI();
      if (saveStatusEl) saveStatusEl.textContent = "";
      return true;
    } 
    
    // No assistant yet
    deploySection.hidden = false;
    manageSection.hidden = true;
    if (buyCard) buyCard.hidden = true;

    if (saveBtn) saveBtn.textContent = "Save and Publish";
    window.assistantFromNumber = "";

    if (saveStatusEl) saveStatusEl.textContent = "";
    return false;
  }

  // -------------------------
  // DEPLOY ASSISTANT (STEP 1)
  // -------------------------
  async function deployAssistant() {
    if (!deployForm) return;

    const newNameEl  = document.getElementById("asstNewName");
    const newTypeEl  = document.getElementById("asstNewType");
    const newVoiceEl = document.getElementById("asstNewVoice");

    const agentName  = newNameEl ? newNameEl.value.trim() : "";
    const agentType  = newTypeEl ? newTypeEl.value : "conversation_flow_381392a33119";
    const agentVoice = newVoiceEl ? newVoiceEl.value : "11labs-Billy";

    if (deployLoader) deployLoader.style.display = "inline-flex";
    if (deployNoteEl) deployNoteEl.textContent = "Customizing your model…";

    const notes = [
      "Customizing your model…",
      "Choosing the best conversation flow…",
      "Training assistant on basic prompts…",
      "Preparing voice and routing…",
      "Final checks before going live…"
    ];
    let noteIndex = 0;
    const noteTimer = setInterval(() => {
      noteIndex = (noteIndex + 1) % notes.length;
      if (deployNoteEl) deployNoteEl.textContent = notes[noteIndex];
    }, 20000);

    let failed = false;

    try {
      const res = await fetch(
        "https://dealvox-840984531750.us-east4.run.app/webhook/05020ee1-4a28-4ca7-9603-783e6430934e",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, agentName, agentType, agentVoice }),
        }
      );

      if (!res.ok) {
        failed = true;
        console.error("Assistant deploy webhook error:", res.status, await res.text());
        if (deployNoteEl) deployNoteEl.textContent = "Failed to deploy. Try again.";
      }
    } catch (err) {
      failed = true;
      console.error("Assistant deploy error:", err);
      if (deployNoteEl) deployNoteEl.textContent = "Failed to deploy. Try again.";
    }

    if (failed) {
      clearInterval(noteTimer);
      if (deployLoader) deployLoader.style.display = "none";
      return;
    }

    if (deployNoteEl) deployNoteEl.textContent = "Initializing the custom deployment…";

    let found = false;
    for (let attempt = 1; attempt <= 8; attempt++) {
      await sleep(15000);
      const exists = await loadAssistant();
      if (exists) { found = true; break; }
    }

    clearInterval(noteTimer);
    if (deployLoader) deployLoader.style.display = "none";

    if (!found && deployNoteEl) {
      deployNoteEl.textContent =
        "Assistant is still deploying in the background. Refresh this page in a moment.";
    } else if (found && deployNoteEl) {
      deployNoteEl.textContent = "Assistant ready.";
    }
  }

  // -------------------------
  // BUY PHONE NUMBER
  // -------------------------
  async function handleBuyNumber() {
    if (!buyBtn || !areaSelect) return;

    const agentId = document.getElementById("asstAgentId")?.value.trim() || "";
    const phoneInput = document.getElementById("asstPhoneNumber");

    if (!agentId) {
      if (buyStatusEl) buyStatusEl.textContent = "Deploy an assistant first.";
      return;
    }

    const areaCode = areaSelect.value;
    if (!areaCode) {
      if (buyStatusEl) buyStatusEl.textContent = "Please choose an area / code first.";
      return;
    }

    buyBtn.disabled = true;
    if (buyStatusEl) buyStatusEl.textContent = "";
    if (buySpinner) buySpinner.style.display = "inline-flex";
    if (buySpinnerText) buySpinnerText.textContent = "Processing…";

    try {
      const res = await fetch(
        "https://dealvox-840984531750.us-east4.run.app/webhook-test/ba071c85-bebf-4622-a0f4-27d0bcebb6ab",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            outbound_agent_id: agentId,
            area_code: areaCode
          })
        }
      );

      if (!res.ok) {
        console.error("Buy number webhook error:", res.status, await res.text());
        if (buyStatusEl) buyStatusEl.textContent = "Failed to start purchase. Try again.";
        return;
      }

      if (buySpinnerText) buySpinnerText.textContent = "Provisioning your number…";

      const phoneNumber = await waitForPhoneNumber(userId, {
        timeoutMs: 180000,
        intervalMs: 5000
      });

      if (phoneNumber) {
        syncPhoneUI(phoneNumber);

      if (buyStatusEl) buyStatusEl.textContent = "Number purchased.";
      } else {
            if (buyStatusEl) {
            buyStatusEl.textContent =
            "Still provisioning your number. Refresh this page in a moment.";
            }
        }

    } catch (err) {
      console.error("Buy number error:", err);
      if (buyStatusEl) buyStatusEl.textContent = "Purchase failed. Try again.";
    } finally {
      if (buySpinner) buySpinner.style.display = "none";
      buyBtn.disabled = false;
    }
  }

  // -------------------------
  // SAVE ASSISTANT (STEP 2)
  // -------------------------
  async function saveAssistant() {
    if (!form) return;

    if (saveBtn) saveBtn.disabled = true;
    if (saveStatusEl) saveStatusEl.textContent = "Saving..";

    const agentId    = document.getElementById("asstAgentId")?.value.trim() || "";
    const agentName  = document.getElementById("asstAgentName")?.value.trim() || "";
    const agentVoice = document.getElementById("asstAgentVoice")?.value || "";
    const rawPub     = String(document.getElementById("asstPublished")?.value || "false").trim();
    const isPub      = rawPub === "true";
    const intro      = document.getElementById("asstIntroPrompt")?.value.trim() || "";
    const webhookUrl = document.getElementById("asstWebhookUrl")?.value.trim() || "";

    if (!agentId) {
      if (saveStatusEl) saveStatusEl.textContent = "No assistant ID found.";
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    const TF = (v) => (v ? "TRUE" : "FALSE");
    const Tf = (v) => (v ? "True" : "False");
    const E  = () => "";

    const desiredOutcomeRaw = document.getElementById("asstDesiredOutcome")?.value || "";
    const desiredOutcome =
      (desiredOutcomeRaw === "book_meeting") ? "book_a_meeting" : desiredOutcomeRaw;

    const calApiKey      = document.getElementById("asstCalApiKey")?.value.trim() || "";
    const calEventTypeId = document.getElementById("asstCalEventTypeId")?.value.trim() || "";
    const calCheckAvailability = !!document.getElementById("asstCalCheckAvailabilityYes")?.checked;

    const transferCold    = !!document.getElementById("asstTransferCold")?.checked;
    const transferWarm    = !!document.getElementById("asstTransferWarm")?.checked;
    const transferPhone   = document.getElementById("asstTransferPhone")?.value.trim() || "";
    const transferWhisper = document.getElementById("asstTransferWhisper")?.value.trim() || "";

    const sendSms      = !!document.getElementById("asstSendSms")?.checked;
    const sendSmsEmail = !!document.getElementById("asstSendSmsEmail")?.checked;
    const sendMessage  = document.getElementById("asstSendMessage")?.value.trim() || "";
    const ccEmail      = document.getElementById("asstCcEmail")?.value.trim() || "";

    const sendDoc = document.getElementById("asstSendDoc")?.files?.[0] || null;
    const kbFile  = document.getElementById("asstKnowledgeFile")?.files?.[0] || null;

    const norm = {
      agentName,
      agentVoice,
      isPublished: Tf(isPub),
      intro,
      webhookURL: webhookUrl,
      userId,
      agentId,
      desiredOutcome,

      calApiKey: E(),
      calEventTypeId: E(),
      calCheckAvailability: E(),

      transferCold: E(),
      transferWarm: E(),
      transferPhone: E(),
      transferWhisper: E(),

      sendSms: E(),
      sendSmsEmail: E(),
      sendMessage: E(),
      ccEmail: E(),
    };

    if (desiredOutcome === "book_a_meeting") {
      norm.calApiKey = calApiKey;
      norm.calEventTypeId = calEventTypeId;
      norm.calCheckAvailability = Tf(calCheckAvailability);
    } else if (desiredOutcome === "transfer_call") {
      norm.transferCold = TF(transferCold);
      norm.transferWarm = TF(transferWarm);
      norm.transferPhone = transferPhone;
      norm.transferWhisper = transferWarm ? transferWhisper : E();
    } else if (desiredOutcome === "send_information") {
      norm.sendSms = TF(sendSms);
      norm.sendSmsEmail = TF(sendSmsEmail);
      norm.sendMessage = sendMessage;
      norm.ccEmail = sendSmsEmail ? ccEmail : E();
    }

    const formData = new FormData();
    Object.entries(norm).forEach(([k, v]) => formData.append(k, v));

    if (kbFile) {
      formData.append("data", kbFile, kbFile.name);
      formData.append("knowledgeBase", kbFile, kbFile.name);
    }

    if (desiredOutcome === "send_information" && sendSmsEmail && sendDoc) {
      formData.append("sendDocument", sendDoc, sendDoc.name);
    }

    let previousUpdatedAt = null;
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data } = await supabase
          .from("assistants")
          .select("agent_id, updated_at")
          .eq("agent_id", agentId)
          .maybeSingle();

        if (data?.updated_at) previousUpdatedAt = data.updated_at;
      }
    } catch (e) {
      console.warn("[saveAssistant] could not read previous updated_at:", e);
    }

    const webhookEndpoint =
      "https://dealvox-840984531750.us-east4.run.app/webhook/316d5604-22ab-4285-b0ad-6c2a886d822f";

    try {
      const res = await fetch(webhookEndpoint, { method: "POST", body: formData });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[saveAssistant] webhook error:", res.status, txt);
        if (saveStatusEl) saveStatusEl.textContent = "Save failed. Try again.";
        return;
      }

      const updated = await waitForAssistantUpdate(agentId, previousUpdatedAt, {
        timeoutMs: 100000,
        intervalMs: 3000,
      });

      if (updated) {
        if (saveStatusEl) saveStatusEl.textContent = "Saved. Reloading...";
        setTimeout(() => window.location.reload(), 1200);
      } else {
        if (saveStatusEl) saveStatusEl.textContent =
          "Save failed. Contact support if this persists.";
      }
    } catch (e) {
      console.error("[saveAssistant] error:", e);
      if (saveStatusEl) saveStatusEl.textContent = "Save failed. Try again.";
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // -------------------------
  // DELETE ASSISTANT
  // -------------------------
  async function deleteAssistant() {
    if (!deleteBtn) return;

    const agentId = document.getElementById("asstAgentId")?.value.trim() || "";
    if (!agentId) {
      if (saveStatusEl) saveStatusEl.textContent = "No assistant ID found.";
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete this assistant?");
    if (!confirmed) return;

    deleteBtn.disabled = true;
    if (saveStatusEl) saveStatusEl.textContent = "Deleting…";

    const deleteEndpoint =
      "https://dealvox-840984531750.us-east4.run.app/webhook/40bc6a49-5009-4c66-905f-828e45fe6654";

    try {
      const res = await fetch(deleteEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, agentId }),
      });

      if (!res.ok) {
        console.error("Assistant delete webhook error:", res.status, await res.text());
        if (saveStatusEl) saveStatusEl.textContent = "Delete failed. Try again.";
        return;
      }

      if (saveStatusEl) saveStatusEl.textContent = "Assistant deleted.";

      manageSection.hidden = true;
      deploySection.hidden = false;

      if (saveBtn) saveBtn.textContent = "Save and Publish";
      window.assistantFromNumber = "";

      const testBtn = document.getElementById("asstTestCallBtn");
      if (testBtn) testBtn.hidden = true;

    } catch (err) {
      console.error("Assistant delete error:", err);
      if (saveStatusEl) saveStatusEl.textContent = "Delete failed. Try again.";
    } finally {
      deleteBtn.disabled = false;
    }
  }

  // -------------------------
  // Bind listeners
  // -------------------------
  if (deployForm && !deployForm.dataset.bound) {
    deployForm.dataset.bound = "1";
    deployForm.addEventListener("submit", (e) => {
      e.preventDefault();
      deployAssistant();
    });
  }

  if (form && !alreadyBound) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      saveAssistant();
    });
  }

  if (deleteBtn && !deleteBtn.dataset.bound) {
    deleteBtn.dataset.bound = "1";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      deleteAssistant();
    });
  }

  if (buyBtn && !buyBtn.dataset.bound) {
    buyBtn.dataset.bound = "1";
    buyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleBuyNumber();
    });
  }

  // Initial
  initDesiredOutcomeUI();
  loadAssistant();
}

// ----------------------------------------------------
// API KEY SECTION (API tab)
// ----------------------------------------------------

let currentApiKeyPlain = null; // full key only held in memory

async function initApiKeySection() {
  const card       = document.getElementById("apiKeyCard");
  const copyHintEl = document.getElementById("apiKeyCopyHint");
  if (!card) return; // partial not on this page

  // We need both user and accessToken
  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed (api key):", e);
    card.classList.add("hidden");
    return;
  }

  if (!auth.user || !auth.accessToken) {
    card.classList.add("hidden");
    return;
  }

  const user = auth.user;

  // --- DOM refs for key block ---
  const emptyEl       = document.getElementById("apiKeyEmpty");
  const detailsEl     = document.getElementById("apiKeyDetails");
  const maskedEl      = document.getElementById("apiKeyMasked");
  const lastUpdatedEl = document.getElementById("apiKeyLastUpdated");
  const statusEl      = document.getElementById("apiKeyStatus");

  const generateBtn   = document.getElementById("apiKeyGenerateBtn");
  const copyBtn       = document.getElementById("apiKeyCopyBtn");
  const regenBtn      = document.getElementById("apiKeyRegenerateBtn");

  // --- Webhook / docs elements ---
  const endpointEl        = document.getElementById("apiWebhookEndpoint");
  const endpointCopyBtn   = document.getElementById("apiWebhookEndpointCopy");
  const endpointStatusEl  = document.getElementById("apiWebhookEndpointStatus");

  const headersExampleEl  = document.getElementById("apiHeadersExample");
  const headersCopyBtn    = document.getElementById("apiHeadersCopy");
  const headersStatusEl   = document.getElementById("apiHeadersCopyStatus");
  const apiKeyHintEl      = document.getElementById("apiApiKeyHint");

  const bodyEl            = document.getElementById("apiWebhookBody");
  const bodyCopyBtn       = document.getElementById("apiWebhookBodyCopy");
  const bodyStatusEl      = document.getElementById("apiWebhookBodyCopyStatus");

  const fromNumberHintEl  = document.getElementById("apiFromNumberHint");

  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/api_clients`;
  const rpcUrl  = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/create_user_api_key`;

  let assistantPhone = null; // from assistants.phone_number

  // ---------------- helpers ----------------

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("error", !!isError);
  }

  function maskFromParts(prefix, suffix) {
    if (!prefix || !suffix) return "••••••";
    return `${prefix}•••${suffix}`;
  }

  function flashCopyStatus(el) {
    if (!el) return;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 1800);
  }

  function refreshHeaderExample() {
    if (!headersExampleEl) return;

    const value = currentApiKeyPlain || "INSERT_YOUR_API_KEY_HERE";

    headersExampleEl.textContent = JSON.stringify(
      {
        "Content-Type": "application/json",
        "X-Api-Key": value,
      },
      null,
      2
    );

    if (apiKeyHintEl) {
      apiKeyHintEl.style.display = currentApiKeyPlain ? "none" : "inline";
    }
  }

  function showEmpty() {
    if (emptyEl) {
      emptyEl.classList.remove("hidden");
      emptyEl.style.display = "block";
    }
    if (detailsEl) {
      detailsEl.classList.add("hidden");
      detailsEl.style.display = "none";
    }

    currentApiKeyPlain = null;

    if (maskedEl)      maskedEl.textContent = "••••••";
    if (lastUpdatedEl) lastUpdatedEl.textContent = "";

    if (copyBtn) {
      copyBtn.disabled = true;
      copyBtn.style.display = "none";
    }
    if (copyHintEl) {
      copyHintEl.style.display = "none";
    }

    refreshHeaderExample();
  }

  function showDetails(row, plainKeyMaybe) {
    if (emptyEl) {
      emptyEl.classList.add("hidden");
      emptyEl.style.display = "none";
    }
    if (detailsEl) {
      detailsEl.classList.remove("hidden");
      detailsEl.style.display = "block";
    }

    const prefix = row.key_prefix;
    const suffix = row.key_suffix;

    if (maskedEl) {
      maskedEl.textContent =
        prefix && suffix ? `${prefix}•••${suffix}` : "••••••";
    }

    currentApiKeyPlain = plainKeyMaybe || null;

    if (copyBtn) {
      if (currentApiKeyPlain) {
        copyBtn.style.display = "inline-flex";
        copyBtn.disabled = false;
        if (copyHintEl) copyHintEl.style.display = "block";
      } else {
        copyBtn.style.display = "none";
        copyBtn.disabled = true;
        if (copyHintEl) copyHintEl.style.display = "none";
      }
    }

    if (row.created_at && lastUpdatedEl) {
      const d = new Date(row.created_at);
      lastUpdatedEl.textContent = "Last generated: " + d.toLocaleString();
    }

    refreshHeaderExample();
  }

  function renderWebhookBody() {
    if (!bodyEl) return;

    const from = assistantPhone || "YOUR_ASSISTANT_NUMBER";

    const examplePayload = {
      from_number: from,
      to_number: "+12137774445",
      retell_llm_dynamic_variables: {
        firstName: "John",
        lastName: "Doe",
        company: "Acme Inc.",
        industry: "Finance",
      },
    };

    bodyEl.textContent = JSON.stringify(examplePayload, null, 2);
  }

  // ---------------- Supabase helpers ----------------

  // Load assistant phone_number (for from_number)
  async function loadAssistantPhone() {
    if (!auth.accessToken || !user) return;

    const assistantsUrl = `${window.SUPABASE_URL.replace(
      /\/+$/,
      ""
    )}/rest/v1/assistants`;
    const params = new URLSearchParams();
    params.set("select", "phone_number");
    params.set("user_id", `eq.${user.id}`);
    params.set("limit", "1");

    try {
      const res = await fetch(`${assistantsUrl}?${params.toString()}`, {
        headers: supabaseHeaders(auth.accessToken),
      });

      if (!res.ok) {
        console.warn(
          "assistants phone load error:",
          res.status,
          await res.text()
        );
        assistantPhone = null;
      } else {
        const rows = await res.json();
        const data = rows && rows[0];
        assistantPhone = data && data.phone_number ? data.phone_number : null;
      }
    } catch (err) {
      console.error("assistants phone load error:", err);
      assistantPhone = null;
    }

    if (fromNumberHintEl) {
      fromNumberHintEl.style.display = assistantPhone ? "none" : "block";
    }
    renderWebhookBody();
  }

  // Load existing API key
  async function loadExistingKey() {
    setStatus("Loading API key...");

    const params = new URLSearchParams();
    params.set("select", "id,user_id,key_prefix,key_suffix,created_at,active");
    params.set("user_id", `eq.${user.id}`);
    params.set("active", "eq.true");
    params.set("order", "created_at.desc");
    params.set("limit", "1");

    try {
      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(auth.accessToken),
      });

      if (res.status === 401) {
        setStatus("Session expired. Please log in.", true);
        showEmpty();
        return;
      }

      if (!res.ok) {
        console.error(
          "loadExistingKey HTTP error",
          res.status,
          await res.text()
        );
        setStatus("Could not load API key.", true);
        showEmpty();
        return;
      }

      const rows = await res.json();
      const data = rows && rows[0];

      if (!data) {
        setStatus("");
        showEmpty();
        return;
      }

      // no plaintext on reload
      showDetails(data, null);
      setStatus("");
    } catch (err) {
      console.error("loadExistingKey error", err);
      setStatus("Could not load API key.", true);
      showEmpty();
    }
  }

  // Generate / refresh API key via RPC
  async function generateOrRefreshKey() {
    setStatus("Generating new API key...");
    if (generateBtn) generateBtn.disabled = true;
    if (regenBtn) regenBtn.disabled = true;

    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: supabaseHeaders(auth.accessToken),
        body: JSON.stringify({}), // no args
      });

      if (res.status === 401) {
        setStatus("Session expired. Please log in.", true);
        return;
      }

      if (!res.ok) {
        console.error(
          "create_user_api_key HTTP error",
          res.status,
          await res.text()
        );
        setStatus("Could not generate API key.", true);
        return;
      }

      const data = await res.json();
      const row = {
        id:         data.id,
        user_id:    user.id,
        key_prefix: data.key_prefix,
        key_suffix: data.key_suffix,
        created_at: data.created_at,
        active:     true,
      };

      currentApiKeyPlain = data.api_key || null;
      showDetails(row, currentApiKeyPlain);
      setStatus("New API key generated. Save it in a secure place.");
    } catch (err) {
      console.error("generateOrRefreshKey error", err);
      setStatus("Could not generate API key.", true);
    } finally {
      if (generateBtn) generateBtn.disabled = false;
      if (regenBtn)    regenBtn.disabled = false;
    }
  }

  // Copy full key
  async function copyKey() {
    if (!currentApiKeyPlain) {
      setStatus(
        "For security, the full key is only shown right after generation. " +
          "Click “Refresh key” to create a new one if you’ve lost it.",
        true
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(currentApiKeyPlain);
      setStatus("API key copied to clipboard.");
    } catch (err) {
      console.error("copyKey error", err);
      setStatus("Could not copy to clipboard.", true);
    }
  }

  // ---------------- Wire up buttons ----------------

  generateBtn?.addEventListener("click", () => {
    generateOrRefreshKey();
  });

  regenBtn?.addEventListener("click", () => {
    const ok = window.confirm(
      "Refresh key? Your existing key will stop working."
    );
    if (!ok) return;
    generateOrRefreshKey();
  });

  copyBtn?.addEventListener("click", () => {
    copyKey();
  });

  // Webhook copy: endpoint
  endpointCopyBtn?.addEventListener("click", async () => {
    if (!endpointEl) return;
    try {
      await navigator.clipboard.writeText(endpointEl.textContent.trim());
      flashCopyStatus(endpointStatusEl);
    } catch (err) {
      console.error("Endpoint copy failed", err);
    }
  });

  // Webhook copy: headers JSON
  headersCopyBtn?.addEventListener("click", async () => {
    if (!headersExampleEl) return;
    try {
      await navigator.clipboard.writeText(headersExampleEl.textContent.trim());
      flashCopyStatus(headersStatusEl);
    } catch (err) {
      console.error("Headers copy failed", err);
    }
  });

  // Webhook copy: body JSON
  bodyCopyBtn?.addEventListener("click", async () => {
    if (!bodyEl) return;
    try {
      await navigator.clipboard.writeText(bodyEl.textContent.trim());
      flashCopyStatus(bodyStatusEl);
    } catch (err) {
      console.error("Payload copy failed", err);
    }
  });

  // ---------------- Init ----------------

  refreshHeaderExample();     // initial headers block (placeholder key)
  await loadExistingKey();    // try to load real API key
  await loadAssistantPhone(); // will call renderWebhookBody()
  if (!assistantPhone) renderWebhookBody(); // fallback payload if phone missing
}

// ----------------------------------------------------
// SPA NAV + PARTIAL LOADING
// ----------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl    = document.getElementById("accountView");
  const links     = document.querySelectorAll(".sidebar-nav .nav-link");
  const emailEl   = document.getElementById("sidebarEmail");

  const VIEW_FILES = {
    account:   "/assets/partials/account-profile.html",
    assistant: "/assets/partials/account-assistant.html",
    voices:    "/assets/partials/account-voices.html",
    api:       "/assets/partials/account-api.html",
    calls_history: "/assets/partials/account-calls-history.html",
    billing:   "/assets/partials/account-billing.html",
    help:      "/assets/partials/account-help.html",
  };

  const viewInitializers = {
    account:   initAccountProfileView,
    assistant: initAccountAssistantView,
    api:       initApiKeySection,
    voices:    () => window.initVoicesView && window.initVoicesView(),
      billing:   () => {
        if (typeof initAccountBillingView === "function") {
        console.log("[Billing] initAccountBillingView()");
        initAccountBillingView();
        } else {
      console.warn("[Billing] initAccountBillingView not found");
    }
  },
    calls_history:  initCallHistory,
  };

  function setActiveLink(view) {
    links.forEach(a => a.classList.toggle("active", a.dataset.view === view));
  }

  async function loadView(view) {
    const file = VIEW_FILES[view];
    if (!file) {
      viewEl.innerHTML = `<div class="empty">Unknown section: <strong>${view}</strong></div>`;
      return;
    }

    try {
      contentEl.setAttribute("aria-busy", "true");
      viewEl.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <div>Loading…</div>
        </div>`;

      const res  = await fetch(file, { cache: "no-cache" });
      const text = await res.text();
      console.log("Loaded view:", view, "from", res.url, "status", res.status);
      console.log("First 120 chars:", text.slice(0, 120));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      viewEl.innerHTML = text;
      setActiveLink(view);

      if (viewInitializers[view]) viewInitializers[view]();

      if (location.hash !== "#" + view) {
        history.replaceState(null, "", "#" + view);
      }
      contentEl.focus();
    } catch (err) {
      console.error("Failed to load view", view, err);
      viewEl.innerHTML = `<div class="empty">Could not load this section. Please try again.</div>`;
    } finally {
      contentEl.setAttribute("aria-busy", "false");
    }
  }

  function viewFromHash() {
    const hash = (location.hash || "").replace("#", "");
    return hash && VIEW_FILES[hash] ? hash : "account";
  }

  links.forEach(a =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      loadView(a.dataset.view);
    })
  );

  window.addEventListener("hashchange", () => loadView(viewFromHash()));

  // Sidebar email under logo
  if (emailEl) {
    (async () => {
      try {
        const auth = await getAuthInfo();
        if (auth.user && auth.user.email) {
          emailEl.textContent = auth.user.email;
        } else {
          emailEl.textContent = "";
        }
      } catch (e) {
        console.error("Email load failed:", e);
        emailEl.textContent = "";
      }
    })();
  }

  // Initial view
  loadView(viewFromHash());
});

const yes = document.getElementById("asstCalCheckAvailabilityYes");
const no  = document.getElementById("asstCalCheckAvailabilityNo");
if (yes && no) {
  yes.addEventListener("change", () => { if (yes.checked) no.checked = false; });
  no.addEventListener("change",  () => { if (no.checked)  yes.checked = false; });
}
