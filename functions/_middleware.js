// /functions/_middleware.js
export const onRequest = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Public routes that should never be gated
  const publicPrefixes = [
    "/", "/login", "/signup", "/auth", "/set-session", "/logout", "/assets"
  ];
  if (publicPrefixes.some(p => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // Only protect /account (and subpaths if any)
  if (!path.startsWith("/account")) {
    return next();
  }

  try {
    const cookieHeader = request.headers.get("Cookie") || "";

    // Parse cookies into a map
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map(c => {
        const i = c.indexOf("=");
        return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
      })
    );

    // ✅ Accept BOTH naming styles
    const token = cookies["sb_token"] || cookies["sb:token"];

    if (!token) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
      });
    }

    // Verify the token with Supabase
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
