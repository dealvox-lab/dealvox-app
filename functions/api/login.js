// /functions/api/login.js

export const onRequestPost = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || "").trim();
    const password = (body.password || "").trim();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "missing_parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrlRaw = env.SUPABASE_URL || "";
    const supabaseUrl = supabaseUrlRaw.replace(/\/+$/, "");
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error("LOGIN: Missing Supabase env", { supabaseUrlRaw, hasAnonKey: !!anonKey });
      return new Response(
        JSON.stringify({ error: "supabase_not_configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1) Supabase password login
    const loginRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const loginData = await loginRes.json().catch(() => ({}));
    console.log("LOGIN: Supabase response =", loginRes.status, loginData);

    if (!loginRes.ok) {
      return new Response(
        JSON.stringify({ error: loginData.error_description || "login_failed" }),
        { status: loginRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const accessToken = loginData.access_token;
    const refreshToken = loginData.refresh_token;

    if (!accessToken || !refreshToken) {
      return new Response(
        JSON.stringify({ error: "missing_tokens" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2) Set cookies (CRITICAL)
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    const cookieBase = "Path=/; Secure; HttpOnly; SameSite=Lax";

    // Short-lived access token
    headers.append(
      "Set-Cookie",
      `sb_token=${accessToken}; Max-Age=3600; ${cookieBase}`
    );

    // Long-lived refresh token
    headers.append(
      "Set-Cookie",
      `sb_refresh=${refreshToken}; Max-Age=2592000; ${cookieBase}`
    );

    // Optional non-HttpOnly debug flag
    headers.append(
      "Set-Cookie",
      `sb_dbg=1; Path=/; Secure; SameSite=Lax`
    );

    return new Response(
      JSON.stringify({ ok: true, user: loginData.user }),
      { status: 200, headers }
    );

  } catch (err) {
    console.error("LOGIN: function error", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
