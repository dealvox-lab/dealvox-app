// /functions/_middleware.js
export const onRequest = async (ctx) => {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;

  // Paths that should never be gated
  const publicPaths = [
    "/", "/login", "/signup", "/auth/callback", "/set-session", "/logout",
    "/assets", "/favicon.ico"
  ];
  if (publicPaths.some(p => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // Only protect /account (and subpaths if any)
  if (!path.startsWith("/account")) {
    return next();
  }

  try {
    const cookies = request.headers.get("Cookie") || "";
    const token = (/(?:^|;\s*)sb:token=([^;]+)/.exec(cookies) || [])[1];

    if (!token) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
      });
    }

    // Verify with Supabase
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": env.SUPABASE_ANON_KEY
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
    // Avoid Worker 1101 by catching and redirecting safely
    console.error("Middleware error:", err);
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
    });
  }
};
