export async function onRequest(context) {
  const { request, env } = context;

  // 1) Only allow POST from the frontend
  if (request.method !== "POST") {
    return new Response("Method Not Allowed (list-calls expects POST)", {
      status: 405,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 2) Get secret from Cloudflare env
  const secret = env.RETELL_SECRET_KEY;
  if (!secret) {
    return new Response("Missing RETELL_SECRET_KEY", {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 3) Read JSON payload from browser
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 4) Proxy to Retell
  const retellRes = await fetch("https://api.retellai.com/v2/list-calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await retellRes.text();

  // 5) Return exactly what Retell sent (status + body)
  return new Response(text, {
    status: retellRes.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
