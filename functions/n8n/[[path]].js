export async function onRequest({ request, env }) {
  // Only allow POST (webhook calls)
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // The request path will look like:
  // /n8n/webhook/<anything after webhook>
  // Example: /n8n/webhook/9479a9d6-...  OR /n8n/webhook/abc/extra
  const url = new URL(request.url);

  const prefix = "/n8n/webhook/";
  if (!url.pathname.startsWith(prefix)) {
    return new Response("Bad request", { status: 400 });
  }

  const tail = url.pathname.slice(prefix.length); // everything after "/n8n/webhook/"
  if (!tail) {
    return new Response("Missing webhook path", { status: 400 });
  }

  // Your n8n webhook base:
  const target = `https://dealvox-840984531750.us-east4.run.app/webhook/${tail}`;

  const upstream = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dealvox-proxy-secret": env.N8N_PROXY_SECRET,
    },
    body: await request.text(),
  });

  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    },
  });
}
