// /functions/api/billing-portal.js

/**
 * Step 1 - requests a user email from a Supabase
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

async function findStripeCustomerIdByEmail(env, email) {
  const list = await stripeRequest(
    env,
    "GET",
    `/v1/customers?email=${encodeURIComponent(email)}&limit=1`
  );

  if (list.data && list.data.length > 0) {
    return list.data[0].id;
  }

  const created = await stripeRequest(env, "POST", "/v1/customers", {
    email,
    "metadata[source]": "dealvox-app",
  });

  return created.id;
}

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

    const returnUrl =
      (env.CLIENT_ORIGIN || "https://dealvox-app.pages.dev") +
      "/account#billing";

    const session = await stripeRequest(
      env,
      "POST",
      "/v1/billing_portal/sessions",
      {
        customer: customerId,
        return_url: returnUrl,
      }
    );

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Portal error:", err);
    return new Response(
      JSON.stringify({ error: "Portal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
