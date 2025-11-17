// /functions/forgot-password.js

export const onRequest = async ({ request, env }) => {
  // Only allow POST for now
  if (request.method !== "POST") {
    return new Response("Not found", { status: 404 });
  }

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

    // Where the user lands AFTER clicking the email link
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/reset-password`;

    const res = await fetch(`${supabaseUrl}/auth/v1/reset-password-for-email`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, redirect_to: redirectTo }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Supabase reset error:", res.status, data);
      return new Response(
        JSON.stringify({ error: "supabase_error" }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("forgot-password function error:", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
