// /functions/set-session.js
export const onRequestPost = async ({ request }) => {
  let access_token, refresh_token;
  try {
    ({ access_token, refresh_token } = await request.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!access_token) return new Response("Missing token", { status: 400 });

  const headers = new Headers({ "Content-Type": "application/json" });

  const base   = "Path=/; Secure; HttpOnly; SameSite=Lax";
  const max7d  = 60 * 60 * 24 * 7;
  const max30d = 60 * 60 * 24 * 30;

  // Safer cookie names (no colon)
  headers.append("Set-Cookie", `sb_token=${access_token}; Max-Age=${max7d}; ${base}`);
  if (refresh_token) {
    headers.append("Set-Cookie", `sb_refresh=${refresh_token}; Max-Age=${max30d}; ${base}`);
  }

  // Optional non-HttpOnly cookie to quickly confirm cookies are being set
  headers.append("Set-Cookie", `sb_dbg=1; Max-Age=${max7d}; Path=/; Secure; SameSite=Lax`);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
