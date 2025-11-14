// /functions/refresh.js
export const onRequestPost = async ({ request, env }) => {
  try {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
      })
    );

    const refresh = cookies["sb_refresh"] || cookies["sb:refresh"];
    if (!refresh) {
      return new Response(JSON.stringify({ error: "no_refresh_token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // MUST send {} as body!
    const res = await fetch(
      `${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${refresh}`,
          "apikey": env.SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({}) // <= REQUIRED
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const newAccess = data.access_token;
    const newRefresh = data.refresh_token;

    const headers = new Headers({
      "Content-Type": "application/json"
    });

    if (newAccess) {
      headers.append(
        "Set-Cookie",
        `sb:token=${newAccess}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
      );
    }

    if (newRefresh) {
      headers.append(
        "Set-Cookie",
        `sb:refresh=${newRefresh}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
