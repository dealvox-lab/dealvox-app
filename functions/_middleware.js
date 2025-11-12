// /functions/_middleware.js
export const onRequest = async ({ request, env, next }) => {
  const url = new URL(request.url);

  // Only guard these paths:
  const protectedPaths = ["/account"];
  const needsAuth = protectedPaths.some(p => url.pathname.startsWith(p));
  if (!needsAuth) return next();

  // Get token from HttpOnly cookie
  const cookie = request.headers.get("Cookie") || "";
  const match = /(?:^|;\s*)sb:token=([^;]+)/.exec(cookie);
  const token = match?.[1];

  if (!token) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?redirect=${encodeURIComponent(url.pathname)}` }
    });
  }

  // Verify token with Supabase Auth (no service key needed)
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "apikey": env.SUPABASE_ANON_KEY
    }
  });

  if (res.ok) return next();

  // Optional: Try refresh if you want to be fancy (not required at first).
  return new Response(null, {
    status: 302,
    headers: { Location: `/login?redirect=${encodeURIComponent(url.pathname)}` }
  });
};
