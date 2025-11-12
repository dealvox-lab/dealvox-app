// /functions/_middleware.js
export const onRequest = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Never gate these routes
  const publicPrefixes = [
    "/", "/login", "/signup", "/auth", "/set-session", "/logout", "/assets"
  ];
  if (publicPrefixes.some(p => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // Only protect /account
  if (!path.startsWith("/account")) {
    return next();
  }

  try {
    const cookie = request.headers.get("Cookie") || "";
    const tokenMatch = /(?:^|;\s*)sb_token=([^;]+)/.exec(cookie);
    const token = tokenMatch?.[1];

    if (!token) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
      });
    }

    // Verify with Supabase
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY
      }
    });

    if (!res.ok) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
      });
    }

    return next();
  } catch (err) {
    console.error("Middleware error:", err);
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
    });
  }
};
