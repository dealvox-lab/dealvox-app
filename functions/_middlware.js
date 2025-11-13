// /functions/_middleware.js
export const onRequest = async ({ request, env, next }) => {
  const url  = new URL(request.url);
  const path = url.pathname;
  const debug = url.searchParams.get("debug") === "1";

  // Public routes (never gated)
  const publicPrefixes = [
    "/",
    "/login",
    "/signup",
    "/auth",
    "/set-session",
    "/logout",
    "/assets",
    "/partials",   // 👈 make sure partials are public
    "/debug-auth"  // 👈 your email helper
  ];

  if (publicPrefixes.some(p => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // Only guard /account
  if (!path.startsWith("/account")) {
    return next();
  }

  // ---- auth check for /account below ----
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const i = c.indexOf("=");
      return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    })
  );

  const token = cookies["sb_token"] || cookies["sb:token"];
  if (!token) {
    // redirect to login if no token
    return Response.redirect("/login", 302);
  }

  // Optionally verify via Supabase like you already had
  // then:
  return next();
};
