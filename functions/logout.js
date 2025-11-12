// GET /logout
export const onRequestGet = async () => {
  const headers = new Headers();
  const base = "Path=/; Secure; HttpOnly; SameSite=Lax";
  headers.append("Set-Cookie", `sb:token=; Max-Age=0; ${base}`);
  headers.append("Set-Cookie", `sb:refresh=; Max-Age=0; ${base}`);
  headers.set("Location", "/login");
  return new Response(null, { status: 302, headers });
};
