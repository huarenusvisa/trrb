const PUBLIC_ORIGINS = new Set([
  "https://trrb.net",
  "https://www.trrb.net"
]);

export const config = { path: "/.netlify/functions/ice-report" };

function normalizedOrigin(value: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function runtimeOrigins(): Set<string> {
  const allowed = new Set(PUBLIC_ORIGINS);
  for (const key of ["URL", "DEPLOY_URL", "DEPLOY_PRIME_URL"]) {
    const value = normalizedOrigin(Deno.env.get(key) || "");
    if (value) allowed.add(value);
  }
  return allowed;
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: "请求来源不允许" }), {
    status: 403,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-trrb-ice-report-origin": "blocked-v1"
    }
  });
}

export default async (request: Request, context: any) => {
  const origin = normalizedOrigin(request.headers.get("origin"));
  const allowed = runtimeOrigins();

  // Direct server-to-server requests without Origin still pass to the function,
  // where rate limiting and payload validation remain authoritative. Browser
  // cross-origin traffic must match this project's exact public/deploy origin.
  if (origin && !allowed.has(origin)) return forbidden();

  if (request.method === "OPTIONS") {
    if (!origin) return forbidden();
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "600",
        "vary": "Origin",
        "cache-control": "no-store",
        "x-trrb-ice-report-origin": "allowed-v1"
      }
    });
  }

  return context.next();
};
