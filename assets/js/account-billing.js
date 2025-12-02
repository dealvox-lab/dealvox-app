/* ----------------------------------------------------
   BILLING VIEW (Billing tab)
   ---------------------------------------------------- */

const BILLING_SUMMARY_ENDPOINT = "/api/billing-summary";
const BILLING_PORTAL_ENDPOINT  = "/api/billing-portal";

async function initAccountBillingView() {
  console.log("[Billing] initAccountBillingView called");

  try {
    console.log("[Billing] calling", BILLING_SUMMARY_ENDPOINT);

    const res = await fetch(BILLING_SUMMARY_ENDPOINT, {
      credentials: "include",
    });

    console.log("[Billing] summary response status:", res.status);

    if (!res.ok) {
      throw new Error(`Failed to load billing data: HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("[Billing] summary data:", data);

    renderCurrentPlan(data.current_plan);
    renderPaymentMethods(data.payment_methods);
    renderInvoices(data.invoices);
  } catch (err) {
    console.error("[Billing] summary error:", err);
    const nameEl = document.getElementById("billingPlanName");
    if (nameEl) {
      nameEl.textContent = "Unable to load billing info.";
    }
  }

  wireBillingButtons();
}

/* --------------------------
   EVENT WIRING
--------------------------- */

function wireBillingButtons() {
  const changeBtn = document.getElementById("billingChangePlanBtn");
  const cancelBtn = document.getElementById("billingCancelPlanBtn");
  const addPaymentBtn = document.getElementById("billingAddPaymentBtn");

  if (changeBtn) changeBtn.addEventListener("click", openStripeCustomerPortal);
  if (cancelBtn) cancelBtn.addEventListener("click", openStripeCustomerPortal);
  if (addPaymentBtn)
    addPaymentBtn.addEventListener("click", openStripeCustomerPortal);
}

/* --------------------------
   RENDER HELPERS
--------------------------- */

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

  nameEl.textContent = plan.name || "Current plan";

  const amount = (plan.amount / 100).toFixed(2);
  const currency = (plan.currency || "usd").toUpperCase();
  priceEl.innerHTML = `${amount} ${currency} <span>/${plan.interval}</span>`;

  if (plan.renews_at) {
    const d = new Date(plan.renews_at);
    renewEl.textContent = `Renews on ${d.toLocaleDateString()}.`;
  } else {
    renewEl.textContent = "";
  }
}

function renderPaymentMethods(methods) {
  const container = document.getElementById("billingPaymentMethod");
  if (!container) return;

  container.innerHTML = "";

  if (!methods || !methods.length) {
    container.innerHTML =
      '<p class="text-muted">No payment method on file.</p>';
    return;
  }

  const pm = methods[0];

  const wrapper = document.createElement("div");
  wrapper.className = "billing-payment-card";

  const meta = document.createElement("div");
  meta.className = "billing-payment-meta";
  meta.innerHTML = `
    <div>**** **** **** ${pm.last4}</div>
    <div class="text-muted">Expires ${pm.exp_month}/${pm.exp_year}</div>
  `;

  const label = document.createElement("span");
  label.className = "billing-payment-label";
  label.textContent = "Default";

  wrapper.appendChild(meta);
  wrapper.appendChild(label);

  container.appendChild(wrapper);
}

function renderInvoices(invoices) {
  const body = document.getElementById("billingHistoryBody");
  if (!body) return;

  body.innerHTML = "";

  if (!invoices || !invoices.length) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="3" class="text-muted">No invoices yet.</td>';
    body.appendChild(row);
    return;
  }

  invoices.forEach((inv) => {
    const row = document.createElement("tr");

    const date = new Date(inv.created * 1000);
    const amount = (inv.amount_paid / 100).toFixed(2);
    const currency = (inv.currency || "usd").toUpperCase();

    const dateCell = document.createElement("td");
    if (inv.hosted_invoice_url) {
      const link = document.createElement("a");
      link.href = inv.hosted_invoice_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = date.toLocaleDateString();
      dateCell.appendChild(link);
    } else {
      dateCell.textContent = date.toLocaleDateString();
    }

    const amountCell = document.createElement("td");
    amountCell.textContent = `${amount} ${currency}`;

    const descCell = document.createElement("td");
    descCell.textContent = inv.description || "Subscription";

    row.appendChild(dateCell);
    row.appendChild(amountCell);
    row.appendChild(descCell);

    body.appendChild(row);
  });
}

/* --------------------------
   STRIPE PORTAL
--------------------------- */

async function openStripeCustomerPortal() {
  console.log("[Billing] opening portal:", BILLING_PORTAL_ENDPOINT);

  try {
    const res = await fetch(BILLING_PORTAL_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    console.log("[Billing] portal response status:", res.status);

    if (!res.ok) throw new Error(`Failed to open billing portal: HTTP ${res.status}`);

    const { url } = await res.json();
    console.log("[Billing] portal URL:", url);
    if (url) window.location.href = url;
  } catch (err) {
    console.error("[Billing] portal error:", err);
    alert("Unable to open billing portal. Please try again later.");
  }
}
