// /functions/api/billing-portal.js

async function getUserEmail(request, env) {
  const email = request.headers.get("x-user-email");
  if (!email) {
    console.warn("[BillingWorker] x-user-email header missing");
    return null;
  }
  return email;
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
    console.error("Billing portal error:", err);
    return new Response(
      JSON.stringify({ error: "Billing portal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
