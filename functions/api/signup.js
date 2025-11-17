// /functions/api/signup.js

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
      console.error("SIGNUP: Missing Supabase env", {
        supabaseUrlRaw,
        hasAnonKey: !!anonKey,
      });
      return new Response(
        JSON.stringify({ error: "supabase_not_configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1) Call Supabase sign-up
    const signupRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const signupData = await signupRes.json().catch(() => ({}));
    console.log("SIGNUP: Supabase response =", signupRes.status, signupData);

    if (!signupRes.ok) {
      return new Response(
        JSON.stringify({
          error: signupData.error_description || signupData.message || "signup_failed",
        }),
        { status: signupRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Supabase behaviour differs depending on email confirmation settings:
    // - If "email confirmation OFF": returns access_token + refresh_token
    // - If "email confirmation ON": returns user, but no session/tokens
    const accessToken = signupData.access_token;
    const refreshToken = signupData.refresh_token;

    // Case A: user needs to confirm email (no tokens yet)
    if (!accessToken || !refreshToken) {
      return new Response(
        JSON.stringify({
          ok: true,
          needsConfirmation: true,
          user: signupData.user || null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Case B: user is fully registered AND logged in immediately
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    const cookieBase = "Path=/; Secure; HttpOnly; SameSite=Lax";

    headers.append(
      "Set-Cookie",
      `sb_token=${accessToken}; Max-Age=3600; ${cookieBase}`
    );
    headers.append(
      "Set-Cookie",
      `sb_refresh=${refreshToken}; Max-Age=2592000; ${cookieBase}`
    );
    headers.append(
      "Set-Cookie",
      `sb_dbg=1; Path=/; Secure; SameSite=Lax`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        needsConfirmation: false,
        user: signupData.user || null,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("SIGNUP: function error", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
