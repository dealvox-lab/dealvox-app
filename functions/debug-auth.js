// /functions/debug-auth.js

export const onRequestGet = async ({ request, env }) => {
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

  const token =
    cookies["sb_token"] ||
    cookies["sb:token"] ||
    cookies["sb-token"] ||
    null;

  let verifyStatus = null;
  let userSummary  = null;
  let errorText    = null;

  if (token && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const supabaseUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
      const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_ANON_KEY
        }
      });

      verifyStatus = resp.status;

      if (resp.ok) {
        const user = await resp.json();
        userSummary = { id: user.id, email: user.email };
      } else {
        errorText = await resp.text().catch(() => null);
      }
    } catch (e) {
      errorText = String(e);
    }
  }

  return new Response(
    JSON.stringify(
      {
        // what account.js needs:
        accessToken: token,
        userSummary,

        // debug info
        has_sb_token: Boolean(cookies["sb_token"]),
        has_sb_colon_token: Boolean(cookies["sb:token"]),
        verifyStatus,
        errorText,
        supabaseUrlSet: Boolean(env.SUPABASE_URL),
        anonKeySet: Boolean(env.SUPABASE_ANON_KEY)
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
};
