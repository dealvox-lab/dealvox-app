// /functions/logout.js
export const onRequestGet = async () => {
  const headers = new Headers({ "Content-Type": "text/plain" });
  const expired = "Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax";

  headers.append("Set-Cookie", `sb_token=; ${expired}`);
  headers.append("Set-Cookie", `sb_refresh=; ${expired}`);
  headers.append("Set-Cookie", `sb_dbg=; Max-Age=0; Path=/; Secure; SameSite=Lax`);

  return new Response("Logged out", {
    status: 302,
    headers: { ...Object.fromEntries(headers), Location: "/login" }
  });
};
