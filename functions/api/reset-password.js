// /functions/api/reset-password.js

export const onRequestPost = async ({ request, env }) => {
  try {
    // 1) Parse request body
    const body = await request.json().catch(() => ({}));
    const accessToken = body.accessToken || "";
    const newPassword = body.newPassword || "";

    if (!accessToken || !newPassword) {
      return new Response(
        JSON.stringify({ error: "missing_parameters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // 2) Supabase config
    const supabaseUrlRaw = env.SUPABASE_URL || "";
    const supabaseUrl = supabaseUrlRaw.replace(/\/+$/, "");
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error("RESET PW: Supabase env missing", {
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

    const endpoint = `${supabaseUrl}/auth/v1/user`;
    console.log("RESET PW: endpoint =", endpoint);

    // 3) Call Supabase Auth to update the user password
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const text = await res.text();
    console.log("RESET PW: Supabase response =", res.status, text);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      console.error("RESET PW: Supabase error", parsed);
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

    // 4) Success
    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err) {
    console.error("RESET PW: function error", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
