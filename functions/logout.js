// /functions/logout.js
export const onRequestGet = async () => {
  const headers = new Headers();
  const expired = "Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax";

  // Clear all relevant cookies
  headers.append("Set-Cookie", `sb_token=; ${expired}`);
  headers.append("Set-Cookie", `sb:token=; ${expired}`);
  headers.append("Set-Cookie", `sb-refresh=; ${expired}`);
  headers.append("Set-Cookie", `sb_refresh=; ${expired}`);
  headers.append("Set-Cookie", `sb:refresh=; ${expired}`);
  headers.append("Set-Cookie", `sb_dbg=; Max-Age=0; Path=/; Secure; SameSite=Lax`);

  // Redirect to /login
  headers.set("Location", "/login");

  return new Response(null, {
    status: 302,
    headers,
  });
};
