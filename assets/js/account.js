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

function initDesiredOutcomeUI() {
  const outcome = document.getElementById("asstDesiredOutcome");
  if (!outcome) {
    console.warn("[Assistant] asstDesiredOutcome not found. Check HTML IDs / partial load.");
    return;
  }

  // Prevent double-binding (SPA)
  if (outcome.dataset.bound === "1") return;
  outcome.dataset.bound = "1";

  const book     = document.getElementById("outcomeBookMeeting");
  const transfer = document.getElementById("outcomeTransferCall");
  const send     = document.getElementById("outcomeSendInfo");

  const cold        = document.getElementById("asstTransferCold");
  const warm        = document.getElementById("asstTransferWarm");
  const warmDetails = document.getElementById("outcomeWarmDetails");

  const sms      = document.getElementById("asstSendSms");
  const smsEmail = document.getElementById("asstSendSmsEmail");

  // NEW: only for SMS+email extras
  const smsEmailDetails = document.getElementById("outcomeSendSmsEmailDetails");

  const calYes = document.getElementById("asstCalCheckAvailabilityYes");
  const calNo  = document.getElementById("asstCalCheckAvailabilityNo");

  const show = (el, visible) => { if (el) el.hidden = !visible; };

  function syncExclusive(a, b) {
    if (!a || !b) return;
    if (a.checked) b.checked = false;
  }

  function syncNested() {
    // Transfer: whisper only for warm; phone is always visible via HTML (no toggling)
    show(warmDetails, !!(warm && warm.checked));

    // Send info: upload+CC only if SMS+email checked
    show(smsEmailDetails, !!(smsEmail && smsEmail.checked));
  }

  function syncOutcome() {
    const v = outcome.value;

    show(book, v === "book_meeting");
    show(transfer, v === "transfer_call");
    show(send, v === "send_information");

    // When switching outcomes, refresh nested UI
    syncNested();
  }

  outcome.addEventListener("change", syncOutcome);

  cold?.addEventListener("change", () => {
    syncExclusive(cold, warm);
    syncNested();
  });

  warm?.addEventListener("change", () => {
    syncExclusive(warm, cold);
    syncNested();
  });

  sms?.addEventListener("change", () => {
    syncExclusive(sms, smsEmail);
    syncNested();
  });

  smsEmail?.addEventListener("change", () => {
    syncExclusive(smsEmail, sms);
    syncNested();
  });

  calYes?.addEventListener("change", () => syncExclusive(calYes, calNo));
  calNo?.addEventListener("change", () => syncExclusive(calNo, calYes));

  // Initial state
  syncOutcome();
}

async function initAccountAssistantView() {
  const deploySection = document.getElementById("assistantInitial");
  const manageSection = document.getElementById("assistantManage");

  const buyCard        = document.getElementById("asstBuyCard");
  const buyBtn         = document.getElementById("asstBuyNumberBtn");
  const buyStatusEl    = document.getElementById("asstBuyStatus");
  const buySpinner     = document.getElementById("asstBuySpinner");
  const buySpinnerText = document.getElementById("asstBuySpinnerText");
  const areaSelect     = document.getElementById("asstPhoneAreaSelect");

  const deployForm     = document.getElementById("assistantDeployForm");
  const deployLoader   = document.getElementById("asstDeployLoader");
  const deployNoteEl   = document.getElementById("asstDeployNote");

  const form           = document.getElementById("assistantForm");
  const saveStatusEl   = document.getElementById("asstStatus");
  const saveBtn        = document.getElementById("asstSaveBtn");
  const deleteBtn      = document.getElementById("asstDeleteBtn");

  const PHONE_AREA_CODES = [ { label: "Alabama (251)", value: "251" }, { label: "Alabama (256)", value: "256" }, { label: "Alabama (334)", value: "334" }, { label: "Alaska (907)", value: "907" }, { label: "Arizona (480)", value: "480" }, { label: "Arizona (520)", value: "520" }, { label: "Arizona (602)", value: "602" }, { label: "Arizona (623)", value: "623" }, { label: "Arizona (928)", value: "928" }, { label: "Arkansas (479)", value: "479" }, { label: "Arkansas (501)", value: "501" }, { label: "Arkansas (870)", value: "870" }, { label: "California (209)", value: "209" }, { label: "California (213)", value: "213" }, { label: "California (310)", value: "310" }, { label: "California (323)", value: "323" }, { label: "California (408)", value: "408" }, { label: "California (415)", value: "415" }, { label: "California (424)", value: "424" }, { label: "California (442)", value: "442" }, { label: "California (530)", value: "530" }, { label: "California (559)", value: "559" }, { label: "California (562)", value: "562" }, { label: "California (619)", value: "619" }, { label: "California (626)", value: "626" }, { label: "California (650)", value: "650" }, { label: "California (657)", value: "657" }, { label: "California (661)", value: "661" }, { label: "California (669)", value: "669" }, { label: "California (707)", value: "707" }, { label: "California (714)", value: "714" }, { label: "California (747)", value: "747" }, { label: "California (760)", value: "760" }, { label: "California (805)", value: "805" }, { label: "California (818)", value: "818" }, { label: "California (820)", value: "820" }, { label: "California (831)", value: "831" }, { label: "California (840)", value: "840" }, { label: "California (858)", value: "858" }, { label: "California (909)", value: "909" }, { label: "California (916)", value: "916" }, { label: "California (925)", value: "925" }, { label: "California (949)", value: "949" }, { label: "California (951)", value: "951" }, { label: "Colorado (303)", value: "303" }, { label: "Colorado (719)", value: "719" }, { label: "Colorado (720)", value: "720" }, { label: "Colorado (970)", value: "970" }, { label: "Connecticut (203)", value: "203" }, { label: "Connecticut (475)", value: "475" }, { label: "Connecticut (860)", value: "860" }, { label: "Connecticut (959)", value: "959" }, { label: "Delaware (302)", value: "302" }, { label: "District of Columbia (202)", value: "202" }, { label: "Florida (239)", value: "239" }, { label: "Florida (305)", value: "305" }, { label: "Florida (321)", value: "321" }, { label: "Florida (352)", value: "352" }, { label: "Florida (386)", value: "386" }, { label: "Florida (407)", value: "407" }, { label: "Florida (448)", value: "448" }, { label: "Florida (561)", value: "561" }, { label: "Florida (689)", value: "689" }, { label: "Florida (727)", value: "727" }, { label: "Florida (754)", value: "754" }, { label: "Florida (772)", value: "772" }, { label: "Florida (786)", value: "786" }, { label: "Florida (813)", value: "813" }, { label: "Florida (850)", value: "850" }, { label: "Florida (863)", value: "863" }, { label: "Florida (904)", value: "904" }, { label: "Florida (927)", value: "927" }, { label: "Florida (941)", value: "941" }, { label: "Florida (954)", value: "954" }, { label: "Georgia (229)", value: "229" }, { label: "Georgia (404)", value: "404" }, { label: "Georgia (470)", value: "470" }, { label: "Georgia (478)", value: "478" }, { label: "Georgia (678)", value: "678" }, { label: "Georgia (706)", value: "706" }, { label: "Georgia (762)", value: "762" }, { label: "Georgia (770)", value: "770" }, { label: "Georgia (912)", value: "912" }, { label: "Hawaii (808)", value: "808" }, { label: "Idaho (208)", value: "208" }, { label: "Idaho (986)", value: "986" }, { label: "Illinois (217)", value: "217" }, { label: "Illinois (224)", value: "224" }, { label: "Illinois (309)", value: "309" }, { label: "Illinois (312)", value: "312" }, { label: "Illinois (331)", value: "331" }, { label: "Illinois (464)", value: "464" }, { label: "Illinois (618)", value: "618" }, { label: "Illinois (630)", value: "630" }, { label: "Illinois (708)", value: "708" }, { label: "Illinois (730)", value: "730" }, { label: "Illinois (773)", value: "773" }, { label: "Illinois (779)", value: "779" }, { label: "Illinois (815)", value: "815" }, { label: "Illinois (847)", value: "847" }, { label: "Indiana (219)", value: "219" }, { label: "Indiana (260)", value: "260" }, { label: "Indiana (317)", value: "317" }, { label: "Indiana (463)", value: "463" }, { label: "Indiana (574)", value: "574" }, { label: "Indiana (765)", value: "765" }, { label: "Indiana (812)", value: "812" }, { label: "Indiana (930)", value: "930" }, { label: "Iowa (319)", value: "319" }, { label: "Iowa (515)", value: "515" }, { label: "Iowa (563)", value: "563" }, { label: "Iowa (641)", value: "641" }, { label: "Iowa (712)", value: "712" }, { label: "Kansas (316)", value: "316" }, { label: "Kansas (620)", value: "620" }, { label: "Kansas (785)", value: "785" }, { label: "Kansas (913)", value: "913" }, { label: "Kentucky (270)", value: "270" }, { label: "Kentucky (364)", value: "364" }, { label: "Kentucky (502)", value: "502" }, { label: "Kentucky (606)", value: "606" }, { label: "Kentucky (859)", value: "859" }, { label: "Louisiana (225)", value: "225" }, { label: "Louisiana (318)", value: "318" }, { label: "Louisiana (337)", value: "337" }, { label: "Louisiana (504)", value: "504" }, { label: "Louisiana (985)", value: "985" }, { label: "Maine (207)", value: "207" }, { label: "Maryland (240)", value: "240" }, { label: "Maryland (301)", value: "301" }, { label: "Maryland (410)", value: "410" }, { label: "Maryland (443)", value: "443" }, { label: "Maryland (667)", value: "667" }, { label: "Massachusetts (339)", value: "339" }, { label: "Massachusetts (351)", value: "351" }, { label: "Massachusetts (413)", value: "413" }, { label: "Massachusetts (508)", value: "508" }, { label: "Massachusetts (617)", value: "617" }, { label: "Massachusetts (774)", value: "774" }, { label: "Massachusetts (781)", value: "781" }, { label: "Massachusetts (857)", value: "857" }, { label: "Michigan (231)", value: "231" }, { label: "Michigan (248)", value: "248" }, { label: "Michigan (269)", value: "269" }, { label: "Michigan (313)", value: "313" }, { label: "Michigan (517)", value: "517" }, { label: "Michigan (586)", value: "586" }, { label: "Michigan (616)", value: "616" }, { label: "Michigan (734)", value: "734" }, { label: "Michigan (810)", value: "810" }, { label: "Michigan (906)", value: "906" }, { label: "Michigan (947)", value: "947" }, { label: "Michigan (989)", value: "989" }, { label: "Minnesota (218)", value: "218" }, { label: "Minnesota (320)", value: "320" }, { label: "Minnesota (507)", value: "507" }, { label: "Minnesota (612)", value: "612" }, { label: "Minnesota (651)", value: "651" }, { label: "Minnesota (763)", value: "763" }, { label: "Minnesota (952)", value: "952" }, { label: "Mississippi (228)", value: "228" }, { label: "Mississippi (601)", value: "601" }, { label: "Mississippi (662)", value: "662" }, { label: "Missouri (314)", value: "314" }, { label: "Missouri (417)", value: "417" }, { label: "Missouri (557)", value: "557" }, { label: "Missouri (573)", value: "573" }, { label: "Missouri (636)", value: "636" }, { label: "Missouri (660)", value: "660" }, { label: "Missouri (816)", value: "816" }, { label: "Montana (406)", value: "406" }, { label: "Nebraska (308)", value: "308" }, { label: "Nebraska (402)", value: "402" }, { label: "Nebraska (531)", value: "531" }, { label: "Nevada (702)", value: "702" }, { label: "Nevada (725)", value: "725" }, { label: "Nevada (775)", value: "775" }, { label: "New Hampshire (603)", value: "603" }, { label: "New Jersey (201)", value: "201" }, { label: "New Jersey (551)", value: "551" }, { label: "New Jersey (609)", value: "609" }, { label: "New Jersey (640)", value: "640" }, { label: "New Jersey (732)", value: "732" }, { label: "New Jersey (848)", value: "848" }, { label: "New Jersey (856)", value: "856" }, { label: "New Jersey (862)", value: "862" }, { label: "New Jersey (973)", value: "973" }, { label: "New Mexico (505)", value: "505" }, { label: "New Mexico (575)", value: "575" }, { label: "New York (212)", value: "212" }, { label: "New York (315)", value: "315" }, { label: "New York (332)", value: "332" }, { label: "New York (347)", value: "347" }, { label: "New York (516)", value: "516" }, { label: "New York (518)", value: "518" }, { label: "New York (585)", value: "585" }, { label: "New York (607)", value: "607" }, { label: "New York (631)", value: "631" }, { label: "New York (646)", value: "646" }, { label: "New York (680)", value: "680" }, { label: "New York (716)", value: "716" }, { label: "New York (718)", value: "718" }, { label: "New York (838)", value: "838" }, { label: "New York (845)", value: "845" }, { label: "New York (914)", value: "914" }, { label: "New York (917)", value: "917" }, { label: "New York (929)", value: "929" }, { label: "New York (934)", value: "934" }, { label: "North Carolina (252)", value: "252" }, { label: "North Carolina (336)", value: "336" }, { label: "North Carolina (704)", value: "704" }, { label: "North Carolina (743)", value: "743" }, { label: "North Carolina (828)", value: "828" }, { label: "North Carolina (910)", value: "910" }, { label: "North Carolina (919)", value: "919" }, { label: "North Carolina (980)", value: "980" }, { label: "North Dakota (701)", value: "701" }, { label: "Ohio (216)", value: "216" }, { label: "Ohio (220)", value: "220" }, { label: "Ohio (234)", value: "234" }, { label: "Ohio (283)", value: "283" }, { label: "Ohio (330)", value: "330" }, { label: "Ohio (380)", value: "380" }, { label: "Ohio (419)", value: "419" }, { label: "Ohio (440)", value: "440" }, { label: "Ohio (513)", value: "513" }, { label: "Ohio (567)", value: "567" }, { label: "Ohio (614)", value: "614" }, { label: "Ohio (740)", value: "740" }, { label: "Ohio (937)", value: "937" }, { label: "Oklahoma (405)", value: "405" }, { label: "Oklahoma (539)", value: "539" }, { label: "Oklahoma (572)", value: "572" }, { label: "Oklahoma (580)", value: "580" }, { label: "Oklahoma (918)", value: "918" }, { label: "Oregon (458)", value: "458" }, { label: "Oregon (503)", value: "503" }, { label: "Oregon (541)", value: "541" }, { label: "Oregon (971)", value: "971" }, { label: "Pennsylvania (215)", value: "215" }, { label: "Pennsylvania (223)", value: "223" }, { label: "Pennsylvania (267)", value: "267" }, { label: "Pennsylvania (272)", value: "272" }, { label: "Pennsylvania (412)", value: "412" }, { label: "Pennsylvania (445)", value: "445" }, { label: "Pennsylvania (484)", value: "484" }, { label: "Pennsylvania (570)", value: "570" }, { label: "Pennsylvania (582)", value: "582" }, { label: "Pennsylvania (610)", value: "610" }, { label: "Pennsylvania (717)", value: "717" }, { label: "Pennsylvania (724)", value: "724" }, { label: "Pennsylvania (814)", value: "814" }, { label: "Rhode Island (401)", value: "401" }, { label: "South Carolina (803)", value: "803" }, { label: "South Carolina (839)", value: "839" }, { label: "South Carolina (843)", value: "843" }, { label: "South Carolina (854)", value: "854" }, { label: "South Carolina (864)", value: "864" }, { label: "South Dakota (605)", value: "605" }, { label: "Tennessee (423)", value: "423" }, { label: "Tennessee (615)", value: "615" }, { label: "Tennessee (629)", value: "629" }, { label: "Tennessee (731)", value: "731" }, { label: "Tennessee (865)", value: "865" }, { label: "Tennessee (901)", value: "901" }, { label: "Tennessee (931)", value: "931" }, { label: "Texas (210)", value: "210" }, { label: "Texas (214)", value: "214" }, { label: "Texas (254)", value: "254" }, { label: "Texas (281)", value: "281" }, { label: "Texas (325)", value: "325" }, { label: "Texas (346)", value: "346" }, { label: "Texas (361)", value: "361" }, { label: "Texas (409)", value: "409" }, { label: "Texas (430)", value: "430" }, { label: "Texas (432)", value: "432" }, { label: "Texas (469)", value: "469" }, { label: "Texas (512)", value: "512" }, { label: "Texas (682)", value: "682" }, { label: "Texas (713)", value: "713" }, { label: "Texas (726)", value: "726" }, { label: "Texas (737)", value: "737" }, { label: "Texas (806)", value: "806" }, { label: "Texas (817)", value: "817" }, { label: "Texas (830)", value: "830" }, { label: "Texas (832)", value: "832" }, { label: "Texas (903)", value: "903" }, { label: "Texas (915)", value: "915" }, { label: "Texas (936)", value: "936" }, { label: "Texas (940)", value: "940" }, { label: "Texas (956)", value: "956" }, { label: "Texas (972)", value: "972" }, { label: "Texas (979)", value: "979" }, { label: "Utah (385)", value: "385" }, { label: "Utah (435)", value: "435" }, { label: "Utah (801)", value: "801" }, { label: "Vermont (802)", value: "802" }, { label: "Virginia (276)", value: "276" }, { label: "Virginia (434)", value: "434" }, { label: "Virginia (540)", value: "540" }, { label: "Virginia (571)", value: "571" }, { label: "Virginia (703)", value: "703" }, { label: "Virginia (757)", value: "757" }, { label: "Virginia (804)", value: "804" }, { label: "Washington (206)", value: "206" }, { label: "Washington (253)", value: "253" }, { label: "Washington (360)", value: "360" }, { label: "Washington (425)", value: "425" }, { label: "Washington (509)", value: "509" }, { label: "West Virginia (681)", value: "681" }, { label: "West Virginia (304)", value: "304" }, { label: "Wisconsin (262)", value: "262" }, { label: "Wisconsin (414)", value: "414" }, { label: "Wisconsin (608)", value: "608" }, { label: "Wisconsin (715)", value: "715" }, { label: "Wisconsin (920)", value: "920" }, { label: "Wyoming (307)", value: "307" } ];

  if (!deploySection || !manageSection) {
    console.warn("Assistant sections not found; skipping assistant init");
    return;
  }

    // Populate Buy-phone area select
  function populatePhoneAreaSelect() {
    if (!areaSelect) return;

    areaSelect.innerHTML = "";

    // Optional placeholder
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select area / code…";
    placeholder.disabled = true;
    placeholder.selected = true;
    areaSelect.appendChild(placeholder);

    PHONE_AREA_CODES.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.value;
      opt.textContent = item.label;
      areaSelect.appendChild(opt);
    });
  }

  populatePhoneAreaSelect();
  
  // Prevent double-binding on reloads
  if (form && form.dataset.bound === "1") return;
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

  // helper setters
  function setIfExists(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---- LOAD ASSISTANT (detect existing vs new) ----
  // Returns true if an assistant row exists for this user, false otherwise.
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

    console.log("[assistants] loadAssistant rows:", rows);

    if (data) {
      // Existing assistant → show manage section
      deploySection.hidden = true;
      manageSection.hidden = false;

      setIfExists("asstAgentId", data.agent_id);
      setIfExists("asstAgentName", data.agent_name);
      setIfExists("asstAgentType", data.agent_type);
      setIfExists("asstPhoneNumber", data.phone_number);
      setIfExists("asstAgentVoice", data.agent_voice);
      setIfExists("asstPublished", data.is_published ? "true" : "false");
      setIfExists("asstPrompt", data.prompt);
      setIfExists("asstIntroPrompt", data.intro_prompt);
      setIfExists("asstWebhookUrl", data.webhook_url);

      const phoneInput = document.getElementById("asstPhoneNumber");
      if (phoneInput && !phoneInput.value) {
        phoneInput.placeholder = "Buy a phone number below first";
      }

      if (buyCard) {
        // If assistant exists but no phone yet → show Buy card
        if (data.phone_number) {
          buyCard.hidden = true;
        } else {
          buyCard.hidden = false;
        }
      }
      
      if (saveStatusEl) saveStatusEl.textContent = "";
      return true;
    } else {
      // No assistant yet → initial deploy flow
      deploySection.hidden = false;
      manageSection.hidden = true;
      if (buyCard) buyCard.hidden = true;  
      if (saveStatusEl) saveStatusEl.textContent = "";
      return false;
    }
  }

  // ---- DEPLOY ASSISTANT (STEP 1) ----
  async function deployAssistant() {
    if (!deployForm) return;

    const newNameEl  = document.getElementById("asstNewName");
    const newTypeEl  = document.getElementById("asstNewType");
    const newVoiceEl = document.getElementById("asstNewVoice");

    const agentName  = newNameEl ? newNameEl.value.trim() : "";
    const agentType  = newTypeEl ? newTypeEl.value : "conversation_flow_381392a33119";
    const agentVoice = newVoiceEl ? newVoiceEl.value : "11labs-Billy";

    //debug
    console.log("Sending to Webhook -> Name:", agentName, "Voice:", agentVoice);

    // SHOW LOADER
    if (deployLoader) deployLoader.style.display = "inline-flex";
    if (deployNoteEl) deployNoteEl.textContent = "Customizing your model…";

    // ROTATING NOTES
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
          body: JSON.stringify({
            userId,
            agentName,
            agentType,
            agentVoice,
          }),
        }
      );

      if (!res.ok) {
        failed = true;
        console.error(
          "Assistant deploy webhook error:",
          res.status,
          await res.text()
        );
        if (deployNoteEl) {
          deployNoteEl.textContent = "Failed to deploy. Try again.";
        }
      }
    } catch (err) {
      failed = true;
      console.error("Assistant deploy error:", err);
      if (deployNoteEl) {
        deployNoteEl.textContent = "Failed to deploy. Try again.";
      }
    }

    if (failed) {
      clearInterval(noteTimer);
      if (deployLoader) deployLoader.style.display = "none";
      return;
    }

    // Success path: poll Supabase every 15s, up to ~2 minutes
    if (deployNoteEl) {
      deployNoteEl.textContent = "Initializing the custom deployment…";
    }

    let found = false;
    const maxAttempts = 8;      // 8 * 15s = 2 minutes
    const delayMs     = 15000;  // 15 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[assistants] polling attempt ${attempt}/${maxAttempts}`);
      await sleep(delayMs);
      const exists = await loadAssistant();
      if (exists) {
        found = true;
        break;
      }
    }

    clearInterval(noteTimer);
    if (deployLoader) deployLoader.style.display = "none";

    if (found) {
      if (deployNoteEl) deployNoteEl.textContent = "Assistant ready.";
    } else {
      if (deployNoteEl) {
        deployNoteEl.textContent =
          "Assistant is still deploying in the background. Refresh this page in a moment.";
      }
    }
  }

// ---- SAVE ASSISTANT (STEP 2) – webhook + Supabase check ----
// Small helper to safely get a Supabase client instance
function getSupabaseClient() {
  const candidate = window.supabaseClient || window.supabase || null;

  if (!candidate || typeof candidate.from !== "function") {
    console.warn("Supabase client not available or invalid, skipping DB check.");
    return null;
  }

  return candidate;
}

// Helper: wait for Supabase row update
async function waitForAssistantUpdate(agentId, previousUpdatedAt, {
  timeoutMs = 120000,    // 2 minutes
  intervalMs = 5000      // 5 seconds
} = {}) {
  const supabase = getSupabaseClient();
  if (!supabase || !agentId) {
    // No usable client → don't block save, treat as "updated"
    return true;
  }

  const AGENT_TABLE_NAME = "assistants"; // 🔧 change to your real table name
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from(AGENT_TABLE_NAME)
      .select("agent_id, updated_at")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (!error && data) {
      if (!previousUpdatedAt && data.updated_at) {
        return true;
      }
      if (previousUpdatedAt && data.updated_at && data.updated_at !== previousUpdatedAt) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

  // Helper: wait until phone_number is written for this user
  async function waitForPhoneNumber(userId, {
    timeoutMs = 180000,   // 3 minutes
    intervalMs = 5000     // 5 seconds
  } = {}) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) {
      console.warn("Supabase client not available, cannot poll phone_number.");
      return null;
    }

    const AGENT_TABLE_NAME = "assistants";
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const { data, error } = await supabase
        .from(AGENT_TABLE_NAME)
        .select("user_id, phone_number")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data && data.phone_number) {
        return data.phone_number;
      }

      await sleep(intervalMs);
    }

    return null;
  }

  // ---- BUY PHONE NUMBER ----
  async function handleBuyNumber() {
    if (!buyBtn || !areaSelect) return;

    const agentIdEl = document.getElementById("asstAgentId");
    const phoneInput = document.getElementById("asstPhoneNumber");

    const agentId = agentIdEl ? agentIdEl.value.trim() : "";
    if (!agentId) {
      if (buyStatusEl) buyStatusEl.textContent = "Deploy an assistant first.";
      return;
    }

    const areaCode = areaSelect.value;
    if (!areaCode) {
      if (buyStatusEl) buyStatusEl.textContent = "Please choose an area / code first.";
      return;
    }

    // UI: start processing
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
            user_id: userId,           // [auth_id]
            outbound_agent_id: agentId, // user's agent ID
            area_code: areaCode
          })
        }
      );

      if (!res.ok) {
        console.error("Buy number webhook error:", res.status, await res.text());
        if (buyStatusEl) buyStatusEl.textContent = "Failed to start purchase. Try again.";
        return;
      }

      // Webhook ok – start polling Supabase for phone_number
      if (buySpinnerText) buySpinnerText.textContent = "Provisioning your number…";

      const phoneNumber = await waitForPhoneNumber(userId, {
        timeoutMs: 180000,
        intervalMs: 5000
      });

      if (phoneNumber) {
        if (phoneInput) {
          phoneInput.value = phoneNumber;
          phoneInput.placeholder = "";
        }
        if (buyStatusEl) buyStatusEl.textContent = "Number purchased.";
        if (buyCard) buyCard.hidden = true;      // hide block when number is set
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
  
// ---- SAVE ASSISTANT (STEP 2) – webhook + Supabase check ----
async function saveAssistant() {
  if (!form || !saveBtn) return;

  saveBtn.disabled = true;
  if (saveStatusEl) saveStatusEl.textContent = "Saving..";

  const agentIdEl     = document.getElementById("asstAgentId");
  const agentNameEl   = document.getElementById("asstAgentName");
  const agentVoiceEl  = document.getElementById("asstAgentVoice");

  const publishedEl   = document.getElementById("asstPublished");
  const introPromptEl = document.getElementById("asstIntroPrompt");
  const webhookUrlEl  = document.getElementById("asstWebhookUrl");
  const kbFileEl      = document.getElementById("asstKnowledgeFile");

  const agentId   = agentIdEl   ? agentIdEl.value.trim()       : "";
  const agentName = agentNameEl ? agentNameEl.value.trim()     : "";
  const agentVoice = agentVoiceEl ? agentVoiceEl.value         : "";

  const rawPub    = publishedEl ? publishedEl.value            : "false";
  const isPub     = rawPub === "true";
  const intro         = introPromptEl ? introPromptEl.value.trim() : "";
  const webhookUrl    = webhookUrlEl  ? webhookUrlEl.value.trim()  : "";

  const kbFile = kbFileEl && kbFileEl.files && kbFileEl.files[0]
    ? kbFileEl.files[0]
    : null;

  const webhookEndpoint =
    "https://dealvox-840984531750.us-east4.run.app/webhook/316d5604-22ab-4285-b0ad-6c2a886d822f";

  const desiredOutcome = document.getElementById("asstDesiredOutcome")?.value;
  const calApiKey = document.getElementById("asstCalApiKey")?.value.trim() || "";
  const calEventTypeId = document.getElementById("asstCalEventTypeId")?.value.trim() || "";
  const calCheckAvailability =
  document.getElementById("asstCalCheckAvailabilityYes")?.checked
    ? true
    : false;
  const transferCold = document.getElementById("asstTransferCold")?.checked || false;
  const transferWarm = document.getElementById("asstTransferWarm")?.checked || false;
  const transferPhone = document.getElementById("asstTransferPhone")?.value.trim() || "";
  const transferWhisper = document.getElementById("asstTransferWhisper")?.value.trim() || "";
  const sendSms = document.getElementById("asstSendSms")?.checked || false;
  const sendSmsEmail = document.getElementById("asstSendSmsEmail")?.checked || false;
  const sendMessage = document.getElementById("asstSendMessage")?.value.trim() || "";
  const ccEmail = document.getElementById("asstCcEmail")?.value.trim() || "";

  const sendDocEl = document.getElementById("asstSendDoc");
  const sendDoc =
    sendDocEl && sendDocEl.files && sendDocEl.files[0]
      ? sendDocEl.files[0]
      : null;

  let previousUpdatedAt = null;

  // 1) Read current updated_at before sending webhook (if possible)
  try {
    const supabase = getSupabaseClient();
    if (supabase && agentId) {
      const AGENT_TABLE_NAME = "assistants"; // 🔧 change if needed

      const { data, error } = await supabase
        .from(AGENT_TABLE_NAME)
        .select("agent_id, updated_at")
        .eq("agent_id", agentId)
        .maybeSingle();

      if (!error && data && data.updated_at) {
        previousUpdatedAt = data.updated_at;
      }
    }
  } catch (e) {
    console.warn("Could not read previous updated_at:", e);
  }

  try {
    const formData = new FormData();
    formData.append("agentName", agentName);
    formData.append("agentVoice", agentVoice);
    formData.append("isPublished", String(isPub));
    formData.append("intro", intro);
    formData.append("webhookURL", webhookUrl);
    formData.append("userId", userId);
    formData.append("agentId", agentId);
    formData.append("desiredOutcome", desiredOutcome);
    formData.append("calApiKey", calApiKey);
    formData.append("calEventTypeId", calEventTypeId);
    formData.append("calCheckAvailability", String(calCheckAvailability));
    formData.append("transferCold", String(transferCold));
    formData.append("transferWarm", String(transferWarm));
    formData.append("transferPhone", transferPhone);
    formData.append("transferWhisper", transferWhisper);
    formData.append("sendSms", String(sendSms));  
    formData.append("sendSmsEmail", String(sendSmsEmail));
    formData.append("sendMessage", sendMessage);
    formData.append("ccEmail", ccEmail);
    if (sendDoc) {
      formData.append("sendDocument", sendDoc, sendDoc.name);
    }
    if (kbFile) {
      formData.append("knowledgeBase", kbFile, kbFile.name);
    }

    const res = await fetch(webhookEndpoint, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      console.error("Assistant save webhook error:", res.status, await res.text());
      if (saveStatusEl) saveStatusEl.textContent = "Save failed. Try again.";
    } else {

       // 2) Webhook OK – wait for Supabase to confirm via updated_at
   const updated = await waitForAssistantUpdate(agentId, previousUpdatedAt, {
    timeoutMs: 100000, // 🟢 Set timeout to 100 seconds (10,000 ms)
    intervalMs: 3000  // 🟢 Check every 3 second
   });

   if (updated) {
    // 1. Show Success Message
    if (saveStatusEl) saveStatusEl.textContent = "Saved. Reloading...";
    
    // 2. Wait 2 seconds, then Reload
    setTimeout(() => {
     window.location.reload();
    }, 2000);

   } else {
    // 🔴 Failure case (Timeout reached)
    console.error("Database update timed out after 10 seconds");
    if (saveStatusEl) {
      // Set your specific error message here
      saveStatusEl.textContent = "Save failed. Contact support if this persists.";
       }
     }
    }
  }
  catch (e) {
    console.error("Assistant save error:", e);
    if (saveStatusEl) saveStatusEl.textContent = "Save failed. Try again.";
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

  // ---- DELETE ASSISTANT (STEP 2) – webhook only ----
  async function deleteAssistant() {
    if (!deleteBtn) return;

    const agentIdEl = document.getElementById("asstAgentId");
    const agentId   = agentIdEl ? agentIdEl.value.trim() : "";

    if (!agentId) {
      if (saveStatusEl) saveStatusEl.textContent = "No assistant ID found.";
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this assistant?"
    );
    if (!confirmed) return;

    deleteBtn.disabled = true;
    if (saveStatusEl) saveStatusEl.textContent = "Deleting…";

    const deleteEndpoint =
      "https://dealvox-840984531750.us-east4.run.app/webhook/40bc6a49-5009-4c66-905f-828e45fe6654";

    try {
      const res = await fetch(deleteEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          agentId,
        }),
      });

      if (!res.ok) {
        console.error("Assistant delete webhook error:", res.status, await res.text());
        if (saveStatusEl) saveStatusEl.textContent = "Delete failed. Try again.";
        deleteBtn.disabled = false;
        return;
      }

      if (saveStatusEl) saveStatusEl.textContent = "Assistant deleted.";

      // Locally reset UI to Step 1
      manageSection.hidden = true;
      deploySection.hidden = false;

      const clearIds = [
        "asstAgentId",
        "asstAgentName",
        "asstAgentType",
        "asstPhoneNumber",
        "asstAgentVoice",
        "asstPrompt",
        "asstIntroPrompt",
        "asstWebhookUrl",
      ];
      clearIds.forEach(id => setIfExists(id, ""));

      deleteBtn.disabled = false;
    } catch (err) {
      console.error("Assistant delete error:", err);
      if (saveStatusEl) saveStatusEl.textContent = "Delete failed. Try again.";
      deleteBtn.disabled = false;
    }
  }

  // Bind listeners
  if (deployForm && !deployForm.dataset.bound) {
    deployForm.dataset.bound = "1";
    deployForm.addEventListener("submit", (e) => {
      e.preventDefault();
      deployAssistant();
    });
  }

  if (form) {
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

  // NEW: Buy number button
  if (buyBtn && !buyBtn.dataset.bound) {
    buyBtn.dataset.bound = "1";
    buyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleBuyNumber();
    });
  }

  initDesiredOutcomeUI();

  // Initial load
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
