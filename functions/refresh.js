// /functions/refresh.js

export const onRequestPost = async ({ request, env }) => {
  try {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => {
          const i = c.indexOf("=");
          return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
        })
        .filter(([k]) => k)
    );

    const access =
      cookies["sb_token"] ||
      cookies["sb:token"] ||
      cookies["sb-token"] ||
      null;

    const refresh =
      cookies["sb_refresh"] ||
      cookies["sb:refresh"] ||
      cookies["sb-refresh"] ||
      null;

    if (!refresh) {
      return new Response(
        JSON.stringify({ error: "no_refresh_token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
    if (!supabaseUrl || !env.SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: "supabase_env_missing" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        // Some examples include Authorization with the *old* access token.
        // It doesn't hurt, so we send it when available:
        ...(access ? { Authorization: `Bearer ${access}` } : {})
      },
      body: JSON.stringify({ refresh_token: refresh })
    });

    const data = await res.json();

    if (!res.ok) {
      // Pass through Supabase error so we can see it in the browser console.
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const newAccess  = data.access_token;
    const newRefresh = data.refresh_token;

    const headers = new Headers({
      "Content-Type": "application/json"
    });

    if (newAccess) {
      headers.append(
        "Set-Cookie",
        `sb:token=${encodeURIComponent(
          newAccess
        )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
      );
    }

    if (newRefresh) {
      headers.append(
        "Set-Cookie",
        `sb:refresh=${encodeURIComponent(
          newRefresh
        )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
