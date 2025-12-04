// /functions/api/billing-summary.js

/**
 * Helper: read user email (replace with Supabase-based auth)
 */
async function getUserEmail(request, env) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[billing-portal] No bearer token");
      return null;
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Step 1: validate auth token → extract user ID
    const validateRes = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!validateRes.ok) {
      console.error("[billing-portal] validate user failed:", validateRes.status);
      return null;
    }

    const authUser = await validateRes.json();
    const userId = authUser?.id;
    if (!userId) {
      console.warn("[billing-portal] No user ID in auth response");
      return null;
    }

    // Step 2: get full user from auth admin (requires SERVICE ROLE key)
    const adminRes = await fetch(
      `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!adminRes.ok) {
      console.error("[billing-portal] admin users lookup failed:", adminRes.status);
      return null;
    }

    const adminUser = await adminRes.json();
    const email = adminUser?.email;

    if (!email) {
      console.warn("[billing-portal] No email on admin user record");
      return null;
    }

    return email;
  } catch (err) {
    console.error("[billing-portal] getUserEmail ERR:", err);
    return null;
  }
}

/**
 * Helper: make a request to Stripe API (using fetch)
 */
async function stripeRequest(env, method, path, body) {
  const url = "https://api.stripe.com" + path;

  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
  };

  let fetchOptions = { method, headers };

  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchOptions.body = new URLSearchParams(body);
  }

  const res = await fetch(url, fetchOptions);
  const json = await res.json();

  if (!res.ok) {
    console.error("Stripe error:", json);
    throw new Error(json.error?.message || "Stripe API error");
  }

  return json;
}

/**
 * Helper: find or create a Stripe customer by email
 */
async function findStripeCustomerIdByEmail(env, email) {
  // 1) Try to find an existing customer
  const list = await stripeRequest(
    env,
    "GET",
    `/v1/customers?email=${encodeURIComponent(email)}&limit=1`
  );

  if (list.data && list.data.length > 0) {
    return list.data[0].id;
  }

  // 2) If not found, create a new one
  const created = await stripeRequest(env, "POST", "/v1/customers", {
    email,
    "metadata[source]": "dealvox-app",
  });

  return created.id;
}

/**
 * Cloudflare Pages Function handler
 */
export async function onRequest(context) {
  const { request, env } = context;

  try {
    const email = await getUserEmail(request, env);
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: no email" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const customerId = await findStripeCustomerIdByEmail(env, email);

    const subs = await stripeRequest(
  env,
  "GET",
  `/v1/subscriptions?customer=${encodeURIComponent(
    customerId
  )}&limit=1&status=all`
);

const subscription = subs.data && subs.data[0];
let current_plan = null;

if (subscription) {
  const item  = subscription.items?.data?.[0] || null;
  const price = item?.price || item?.plan || subscription.plan || null;

  // Stripe sends period timestamps in several places.
  // Try the most accurate ones in order:
  const periodStartSec =
    item?.current_period_start ??
    subscription.current_period_start ??
    subscription.billing_cycle_anchor ??
    subscription.start_date ??
    null;

  const periodEndSec =
    item?.current_period_end ??
    subscription.current_period_end ??
    null;

  current_plan = {
    name:     price?.nickname || "Dealvox AI plan",
    amount:   price?.unit_amount ?? price?.amount ?? null,
    currency: price?.currency ?? subscription.currency ?? "usd",
    interval:
      price?.recurring?.interval ||
      subscription.plan?.interval ||
      "month",

    // ✅ what the frontend needs
    period_start: periodStartSec ? periodStartSec * 1000 : null, // ms
    period_end:   periodEndSec   ? periodEndSec   * 1000 : null, // ms
    renews_at:    periodEndSec   ? periodEndSec   * 1000 : null, // kept for compatibility

    // Optional: minutes included in plan (fallback 200)
    included_minutes:
      price?.metadata?.included_minutes
        ? Number(price.metadata.included_minutes)
        : 200,
  };
}


    // 2) Payment methods
    const pms = await stripeRequest(
      env,
      "GET",
      `/v1/payment_methods?customer=${encodeURIComponent(
        customerId
      )}&type=card`
    );

    const payment_methods =
      (pms.data || []).map((pm) => ({
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        default: true,
      })) || [];

    // 3) Invoices
    const invs = await stripeRequest(
      env,
      "GET",
      `/v1/invoices?customer=${encodeURIComponent(
        customerId
      )}&limit=10`
    );

    const invoices =
      (invs.data || []).map((inv) => ({
        id: inv.id,
        created: inv.created,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        description:
          inv.lines.data[0]?.description || "Dealvox AI subscription",
        hosted_invoice_url: inv.hosted_invoice_url,
      })) || [];

    const responseBody = {
      current_plan,
      payment_methods,
      invoices,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Billing summary error:", err);
    return new Response(
      JSON.stringify({ error: "Billing summary error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
