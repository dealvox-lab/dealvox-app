export async function onRequest({ request, params, env }) {
  // Allow only POST from your UI (optional hardening)
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Build target URL: your n8n base + the dynamic path part
  const base = "https://dealvox-840984531750.us-east4.run.app/webhook/";
  const tail = (params.path || []).join("/"); // [...path]
  const target = base + tail;

  const upstream = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // secret to prove it came via your proxy
      "x-dealvox-proxy-secret": env.N8N_PROXY_SECRET,
    },
    body: await request.text(),
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    },
  });
}
