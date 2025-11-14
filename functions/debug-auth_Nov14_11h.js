// /functions/debug-auth.js

function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    // Pad with = for base64
    const padded = payload + "===".slice((payload.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

export const onRequestGet = async ({ request, env }) => {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    })
  );

  const token = cookies["sb_token"] || cookies["sb:token"];

  let verifyStatus = null;
  let errorText = null;
  let userSummary = null;
  let email = null;
  let jwtPayload = null;

  if (token) {
    // 1) Try to decode the Supabase JWT directly
    jwtPayload = decodeJwt(token);
    if (jwtPayload) {
      email =
        jwtPayload.email ||
        (jwtPayload.user_metadata && jwtPayload.user_metadata.email) ||
        null;
      userSummary = {
        id: jwtPayload.sub || null,
        email,
      };
    }

    // 2) Optionally, if env vars are set, also verify with Supabase REST
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      try {
        const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: env.SUPABASE_ANON_KEY,
          },
        });
        verifyStatus = resp.status;
        if (resp.ok) {
          const user = await resp.json();
          userSummary = { id: user.id, email: user.email };
          email = user.email;
        } else {
          errorText = await resp.text().catch(() => null);
        }
      } catch (err) {
        errorText = String(err);
      }
    }
  }

  return new Response(
    JSON.stringify(
      {
        has_sb_token: Boolean(token),
        verifyStatus,
        email,
        userSummary,
        jwtPayload,
        errorText,
        supabaseUrlSet: Boolean(env.SUPABASE_URL),
        anonKeySet: Boolean(env.SUPABASE_ANON_KEY),
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
};
