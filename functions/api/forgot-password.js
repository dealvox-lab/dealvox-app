// /functions/api/forgot-password.js

export const onRequestPost = async ({ request, env }) => {
  try {
    const { email } = await request.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "missing_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey     = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error("Supabase env vars missing");
      return new Response(
        JSON.stringify({ error: "supabase_not_configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/reset-password`;

    console.log("RESET URL:", `${supabaseUrl}/auth/v1/reset-password-for-email`);
    const res = await fetch(`${supabaseUrl}/auth/v1/reset-password-for-email`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, redirect_to: redirectTo }),
    });

    // DEBUG: log full Supabase response
    const text = await res.text();
    console.log("SUPABASE RESET RESPONSE:", res.status, text);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      // surface exact error to the frontend while debugging
      return new Response(
        JSON.stringify({ error: "supabase_error", details: parsed }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

return new Response(
  JSON.stringify({ 
    error: "supabase_error",
    details: parsed,
    debug_url: `${supabaseUrl}/auth/v1/reset-password-for-email`
  }),
    
  } catch (err) {
    console.error("forgot-password function error:", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
