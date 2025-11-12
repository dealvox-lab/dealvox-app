// POST /functions/set-session
export const onRequestPost = async ({ request }) => {
  const { access_token, refresh_token } = await request.json().catch(() => ({}));
  if (!access_token) return new Response("Bad request", { status: 400 });

  const headers = new Headers({ "Content-Type": "application/json" });

  // 7 days for access, 30 days for refresh (tune as you like)
  const cookieBase = "Path=/; Secure; HttpOnly; SameSite=Lax";
  headers.append("Set-Cookie", `sb:token=${access_token}; Max-Age=604800; ${cookieBase}`);
  if (refresh_token) {
    headers.append("Set-Cookie", `sb:refresh=${refresh_token}; Max-Age=2592000; ${cookieBase}`);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
