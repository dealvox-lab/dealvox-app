// /functions/forgot-password.js

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

    // Where the user lands after clicking the email link
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

// DEBUGGING — capture everything
const text = await res.text();
console.log("SUPABASE RESET RESPONSE:", res.status, text);

let data1 = null;
try {
  data1 = JSON.parse(text);
} catch (_) {
  data1 = text;
}

if (!res.ok) {
  return new Response(
    JSON.stringify({ error: "supabase_error", details: data }),
    { status: res.status, headers: { "Content-Type": "application/json" } }
  );
}

return new Response(
  JSON.stringify({ ok: true }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);

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
