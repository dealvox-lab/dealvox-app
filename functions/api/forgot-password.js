// /functions/api/forgot-password.js

export const onRequestPost = async ({ request, env }) => {
  try {
    // 1) Read email from JSON body
    const body = await request.json().catch(() => ({}));
    const email = (body && body.email || "").trim();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "missing_email" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // 2) Read Supabase env vars
    const supabaseUrlRaw = env.SUPABASE_URL || "";
    const supabaseUrl = supabaseUrlRaw.replace(/\/+$/, ""); // strip trailing slash
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error("Supabase env vars missing", {
        supabaseUrlRaw,
        hasAnonKey: Boolean(anonKey),
      });

      return new Response(
        JSON.stringify({ error: "supabase_not_configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // 3) Build redirect URL and endpoint
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/reset-password`;

    // 🔑 Supabase expects redirect_to as QUERY PARAM on /auth/v1/recover
    const endpoint =
      `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`;

    console.log("FORGOT PW: endpoint =", endpoint);
    console.log("FORGOT PW: redirect_to =", redirectTo);

    // 4) Call Supabase Auth – ONLY email in body
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const text = await res.text();
    console.log("FORGOT PW: Supabase response =", res.status, text);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: "supabase_error",
          details: parsed,
          debug_url: endpoint,
        }),
        {
          status: res.status,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // 5) Success
    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err) {
    console.error("FORGOT PW: function error", err);

    return new Response(
      JSON.stringify({ error: "server_error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
