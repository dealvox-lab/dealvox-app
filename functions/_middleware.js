export const onRequest = async ({ request, env, next }) => {
  const url  = new URL(request.url);
  const path = url.pathname;
  const debug = url.searchParams.get("debug") === "1";

  // Public routes (never gated)
  const publicPrefixes = ["/", "/login", "/signup", "/auth", "/set-session", "/logout", "/assets"];
  if (publicPrefixes.some(p => path === p || path.startsWith(p + "/"))) return next();

  // Only guard /account
  if (!path.startsWith("/account")) return next();

  // Parse cookies safely
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const i = c.indexOf("=");
      if (i === -1) return [c.trim(), ""];
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    })
  );

  // Accept BOTH naming styles
  const token = cookies["sb_token"] || cookies["sb:token"] || null;

  // If debug=1, show exactly what the Worker sees
  if (debug) {
    const body = {
      path,
      has_sb_token: Boolean(cookies["sb_token"]),
      has_sb_colon_token: Boolean(cookies["sb:token"]),
      env_present: {
        SUPABASE_URL: Boolean(env.SUPABASE_URL),
        SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY),
      },
      token_length: token?.length || 0,
      cookie_keys: Object.keys(cookies),
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // No token? go login
  if (!token) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
    });
  }

  // Verify with Supabase
  
  window.SUPABASE_URL = "https://rtidfgnigtsxdszypkwr.supabase.co";
  window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0aWRmZ25pZ3RzeGRzenlwa3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MjM5NjEsImV4cCI6MjA3ODQ5OTk2MX0.DtqhhfZlFOnQLYGy6qTtgaia38bTPB_pvNEQGhLt4T0";
  let verifyStatus = 0;
  try {
    const supabaseUrl = (window.SUPABASE_URL || "").replace(/\/+$/,"");
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: window.SUPABASE_ANON_KEY || ""
      }
    });
    verifyStatus = res.status;

    if (!res.ok) {
      // Optional: enable one-time bypass for troubleshooting
      if (url.searchParams.get("allow") === "1") return next();
      return new Response(null, {
        status: 302,
        headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
      });
    }
  } catch (e) {
    // Optional: allow bypass with ?allow=1 to isolate the issue
    if (url.searchParams.get("allow") === "1") return next();
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?redirect=${encodeURIComponent(path)}` }
    });
  }

  return next();
};
