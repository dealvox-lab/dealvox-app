// /functions/reset-password.js

export const onRequestPost = async ({ request, env }) => {
  try {
    const { accessToken, newPassword } = await request.json();

    if (!accessToken || !newPassword) {
      return new Response(
        JSON.stringify({ error: "missing parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey     = env.SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Reset password error:", data);
      return new Response(JSON.stringify({ error: "supabase_error" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("reset-password function error:", err);
    return new Response(
      JSON.stringify({ error: "server_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
