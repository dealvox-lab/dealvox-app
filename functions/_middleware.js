// /functions/_middleware.js

export const onRequest = async ({ request, env, next }) => {
  const url  = new URL(request.url);
  const path = url.pathname;
  const debug = url.searchParams.get("debug") === "1";

  // ---- parse cookies & detect session ----
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map(c => {
        const i = c.indexOf("=");
        if (i === -1) return ["", ""];
        return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
      })
      .filter(([k]) => k)
  );

  const hasSession = Boolean(
    cookies["sb_token"] ||
    cookies["sb:token"] ||
    cookies["sb-token"]
  );

  // Optional debug view: /anything?debug=1
  if (debug) {
    return new Response(
      JSON.stringify(
        {
          path,
          hasSession,
          cookieKeys: Object.keys(cookies),
        },
        null,
        2
      ),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Routes that must always stay public / untouched by auth logic
  const alwaysPublicPrefixes = [
    "/assets",
    "/partials",        // HTML partials
    "/auth",            // includes /auth/callback
    "/set-session",
    "/logout",
    "/debug-auth",
    "/favicon.ico",
    "/robots.txt",
    "/forgot-password", // password reset request page
    "/reset-password",  // password reset form page
    "/api",             // all API routes (login, forgot, reset, etc.)
  ];

  if (alwaysPublicPrefixes.some(p => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  // ---- redirect signed-in users away from auth pages ----
  if (hasSession && (path === "/login" || path === "/signup")) {
    url.pathname = "/account";
    url.search = "";
    url.hash = "";
    return Response.redirect(url.toString(), 302);
  }

  // ---- protect /account when signed out ----
  if (path.startsWith("/account") && !hasSession) {
    url.pathname = "/login";
    url.search = "";
    url.hash = "";
    return Response.redirect(url.toString(), 302);
  }

  // Root, login, signup stay public when not redirected above
  if (path === "/" || path === "/login" || path === "/signup") {
    return next();
  }

  // Everything else: just continue
  return next();
};
