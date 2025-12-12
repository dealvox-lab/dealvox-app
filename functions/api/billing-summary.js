// /functions/api/billing-summary.js

// ------------------------------
// Headers
// ------------------------------
async function getUserId(request) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    console.warn("[BillingWorker] x-user-id header missing");
    return null;
  }
  return userId.trim();
}

async function getUserEmail(request) {
  const email = request.headers.get("x-user-email");
  return email ? email.trim().toLowerCase() : null;
}

// ------------------------------
// Stripe helpers
// ------------------------------
async function stripeRequest(env, method, path, body) {
  const url = "https://api.stripe.com" + path;

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
  };

  const fetchOptions = { method, headers };

  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchOptions.body = new URLSearchParams(body);
  }

  const res = await fetch(url, fetchOptions);
  const json = await res.json();

  if (!res.ok) {
    console.error("[BillingWorker] Stripe error:", json);
    throw new Error(json.error?.message || "Stripe API error");
  }

  return json;
}

async function findStripeCustomerIdByEmail(env, email) {
  const list = await stripeRequest(
    env,
    "GET",
    `/v1/customers?email=${encodeURIComponent(email)}&limit=1`
  );

  if (list.data && list.data.length > 0) return list.data[0].id;

  const created = await stripeRequest(env, "POST", "/v1/customers", {
    email,
    "metadata[source]": "dealvox-app",
  });

  return created.id;
}

// ------------------------------
// Supabase helpers (Service Role)
// ------------------------------
async function supabaseGet(env, path) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();

  if (!res.ok) {
    console.error("[BillingWorker] Supabase error:", json);
    throw new Error("Supabase API error");
  }

  return json;
}

/**
 * Fallback: if frontend didn't send x-user-email, attempt to get it from your Users table.
 * Assumption: table "users" has uid (or id) and email columns.
 *
 * If your table uses "uid" as in your earlier notes, keep as-is.
 * If it uses "id", switch select=uid -> select=id and read row.id.
 */
async function getEmailByUserId(env, userId) {
  // Try uid first
  const rows = await supabaseGet(
    env,
    `users?select=email,uid&uid=eq.${encodeURIComponent(userId)}&limit=1`
  );
  if (rows?.[0]?.email) return String(rows[0].email).trim().toLowerCase();

  // Optional fallback if your column is "id" instead of "uid"
  const rows2 = await supabaseGet(
    env,
    `users?select=email,id&id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  if (rows2?.[0]?.email) return String(rows2[0].email).trim().toLowerCase();

  return null;
}

/**
 * Get latest ACTIVE subscription row from subscriptions by user_id
 */
async function getActiveSubscriptionByUserId(env, userId) {
  const rows = await supabaseGet(
    env,
    `subscriptions?select=sub_name,sub_type,sub_amount,start_date,minutes_total,minutes_spent,minutes_to_spend,sub_active` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&sub_active=eq.true` +
      `&order=start_date.desc&limit=1`
  );

  return rows?.[0] || null;
}

function buildCurrentPlanFromSupabase(subRow) {
  if (!subRow) return null;

  const subType = String(subRow.sub_type || "").toLowerCase(); // "month" | "year" | "payg" | "week" etc.
  const amount = Number(subRow.sub_amount ?? 0);

  const interval =
    subType === "month" ? "month" :
    subType === "year"  ? "year"  :
    null;

  // Minutes rule: PAYG -> Unlimited, otherwise show minutes_total if available
  const isPayg = subType === "payg" || subType === "week";
  const minutes = isPayg ? "Unlimited" : (subRow.minutes_total ?? null);

  return {
    name: subRow.sub_name || "Dealvox AI plan",
    sub_type: subType,
    sub_active: !!subRow.sub_active,

    amount,          // dollars (e.g., 239 or 8999)
    currency: "usd",
    interval,        // month/year/null
    start_date: subRow.start_date || null,

    minutes, // "Unlimited" for PAYG
    // keep extra fields available for your UI if needed:
    minutes_spent: subRow.minutes_spent ?? null,
    minutes_to_spend: subRow.minutes_to_spend ?? null,
  };
}

// ------------------------------
// Pages Function
// ------------------------------
export async function onRequest(context) {
  const { request, env } = context;

  try {
    const userId = await getUserId(request);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized: no user id" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 1) Supabase subscription is source of truth
    const subRow = await getActiveSubscriptionByUserId(env, userId);
    const current_plan = buildCurrentPlanFromSupabase(subRow);

    // 2) Billing history always (Stripe invoices)
    // Need email to find Stripe customer. Prefer header; fallback to Supabase users table.
    let email = await getUserEmail(request);
    if (!email) email = await getEmailByUserId(env, userId);

    let invoices = [];
    let payment_methods = [];

    if (email) {
      const customerId = await findStripeCustomerIdByEmail(env, email);

      // Invoices always
      const invs = await stripeRequest(
        env,
        "GET",
        `/v1/invoices?customer=${encodeURIComponent(customerId)}&limit=10`
      );

      invoices = (invs.data || []).map((inv) => ({
        id: inv.id,
        created: inv.created,         // seconds
        amount_paid: inv.amount_paid, // cents
        currency: inv.currency,
        description: inv.lines?.data?.[0]?.description || "Dealvox AI subscription",
        hosted_invoice_url: inv.hosted_invoice_url,
      }));

      // Payment methods ONLY if subscription identified
      if (current_plan) {
        const pms = await stripeRequest(
          env,
          "GET",
          `/v1/payment_methods?customer=${encodeURIComponent(customerId)}&type=card`
        );

        payment_methods = (pms.data || []).map((pm) => ({
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
          default: true,
        }));
      }
    } else {
      console.warn("[BillingWorker] No email available; invoices/payment methods skipped.");
    }

    return new Response(
      JSON.stringify({ current_plan, payment_methods, invoices }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    console.error("[BillingWorker] Billing summary error:", err);
    return new Response(JSON.stringify({ error: "Billing summary error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
