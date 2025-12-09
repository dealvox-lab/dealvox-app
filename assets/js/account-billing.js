/* ----------------------------------------------------
   BILLING VIEW (Billing tab)
   ---------------------------------------------------- */

const BILLING_SUMMARY_ENDPOINT = "/api/billing-summary";
const BILLING_PORTAL_ENDPOINT  = "/api/billing-portal";


/* ----------------------------------------------------
   #3 — EMAIL RESOLUTION (Required)
---------------------------------------------------- */

/**
 * Returns the current user's email string
 * using:
 *  - Supabase Auth (preferred)
 *  - Profiles table fallback (same style as loadProfile)
 */
async function getCurrentUserEmail() {
  let auth;
  try {
    auth = await getAuthInfo();   // <-- existing global helper
  } catch (err) {
    console.error("[Billing] getAuthInfo failed:", err);
    return null;
  }

  // 1) Preferred: Supabase Auth user.email
  if (auth?.user?.email) {
    return auth.user.email;
  }

  // 2) Fallback to profiles table
  try {
    const userId = auth.user.id;
    const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles`;

    const params = new URLSearchParams();
    params.set("select", "email");
    params.set("id", `eq.${userId}`);
    params.set("limit", "1");

    async function run(currentAuth) {
      return fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken),
      });
    }

    let res = await run(auth);

    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load billing email");
      if (!newAuth) return null;
      auth = newAuth;
      res = await run(auth);
    }

    if (!res.ok) {
      console.error("[Billing] profiles email HTTP error:", res.status);
      return null;
    }

    const rows = await res.json();
    return rows?.[0]?.email ?? null;
  } catch (err) {
    console.error("[Billing] error loading email fallback:", err);
    return null;
  }
}


/* ----------------------------------------------------
   INIT
---------------------------------------------------- */

async function initAccountBillingView() {
  console.log("[Billing] initAccountBillingView called");

  try {
    const email = await getCurrentUserEmail();
    if (!email) throw new Error("No email available for billing");

    const res = await fetch(BILLING_SUMMARY_ENDPOINT, {
      method: "GET",
      credentials: "include",
      headers: {
        "x-user-email": email
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to load billing data: HTTP ${res.status}`);
    }

    const data = await res.json();
    renderCurrentPlan(data.current_plan);
    renderPaymentMethods(data.payment_methods);
    renderInvoices(data.invoices);

  } catch (err) {
    console.error("[Billing] summary error:", err);
    const nameEl = document.getElementById("billingPlanName");
    if (nameEl) nameEl.textContent = "Unable to load billing info.";
  }

  wireBillingButtons();
}


/* ----------------------------------------------------
   EVENT WIRING
---------------------------------------------------- */

function wireBillingButtons() {
  const actionContainer = document.querySelector(".billing-actions");
  if (actionContainer?.dataset.bound === "1") return;
  if (actionContainer) actionContainer.dataset.bound = "1";
   
  const changeBtn = document.getElementById("billingChangePlanBtn");
  const cancelBtn = document.getElementById("billingCancelPlanBtn");
  const addPaymentBtn = document.getElementById("billingAddPaymentBtn");

  if (changeBtn) changeBtn.addEventListener("click", openStripeCustomerPortal);
  if (cancelBtn) cancelBtn.addEventListener("click", openStripeCustomerPortal);
  if (addPaymentBtn) addPaymentBtn.addEventListener("click", openStripeCustomerPortal);
}

/* ----------------------------------------------------
   RENDER HELPERS (unchanged)
---------------------------------------------------- */

function renderCurrentPlan(plan) {
  const nameEl = document.getElementById("billingPlanName");
  const priceEl = document.getElementById("billingPlanPrice");
  const renewEl = document.getElementById("billingPlanRenewal");

  if (!nameEl || !priceEl || !renewEl) return;

  if (!plan) {
    nameEl.textContent = "No active subscription";
    priceEl.textContent = "";
    renewEl.textContent = "Choose a plan to start using Dealvox AI.";
    return;
  }

  nameEl.textContent = plan.name;

  const amount = (plan.amount / 100).toFixed(2);
  const currency = plan.currency.toUpperCase();
  priceEl.innerHTML = `${amount} ${currency} <span>/${plan.interval}</span>`;

  if (plan.renews_at) {
    const d = new Date(plan.renews_at);
    renewEl.textContent = `Renews on ${d.toLocaleDateString()}`;
  } else {
    renewEl.textContent = "";
  }
}

function renderPaymentMethods(methods) {
  const container = document.getElementById("billingPaymentMethod");
  if (!container) return;

  container.innerHTML = "";

  if (!methods || !methods.length) {
    container.innerHTML = `<p class="text-muted">No payment method on file.</p>`;
    return;
  }

  const pm = methods[0];
  const wrapper = document.createElement("div");
  wrapper.className = "billing-payment-card";

  wrapper.innerHTML = `
    <div class="billing-payment-meta">
      <div>**** **** **** ${pm.last4}</div>
      <div class="text-muted">Expires ${pm.exp_month}/${pm.exp_year}</div>
    </div>
    <span class="billing-payment-label">Default</span>
  `;

  container.appendChild(wrapper);
}

function renderInvoices(invoices) {
  const body = document.getElementById("billingHistoryBody");
  if (!body) return;

  body.innerHTML = "";

  if (!invoices || !invoices.length) {
    body.innerHTML = `<tr><td colspan="3" class="text-muted">No invoices yet.</td></tr>`;
    return;
  }

  invoices.forEach((inv) => {
    const row = document.createElement("tr");

    const date = new Date(inv.created * 1000);
    const amount = (inv.amount_paid / 100).toFixed(2);
    const currency = (inv.currency || "usd").toUpperCase();

    row.innerHTML = `
      <td>
        <a href="${inv.hosted_invoice_url}" target="_blank" rel="noopener">
          ${date.toLocaleDateString()}
        </a>
      </td>
      <td>${amount} ${currency}</td>
      <td>${inv.description || "Subscription"}</td>
    `;

    body.appendChild(row);
  });
}


/* ----------------------------------------------------
   STRIPE PORTAL
---------------------------------------------------- */

async function openStripeCustomerPortal() {
  try {
    const email = await getCurrentUserEmail();
    if (!email) throw new Error("No email for portal");

    const res = await fetch(BILLING_PORTAL_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": email
      },
      body: JSON.stringify({})
    });

    if (!res.ok) throw new Error(`Portal error ${res.status}`);

    const { url } = await res.json();
    if (url) window.location.href = url;

  } catch (err) {
    console.error("[Billing] portal error:", err);
    alert("Unable to open billing portal.");
  }
}
