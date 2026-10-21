import { NextResponse, type NextRequest } from "next/server";
import { requestAuth, sameOrigin, readBody } from "../../../src/lib/auth/server";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (
    !path.every((part) => /^[a-zA-Z0-9_-]+$/.test(part)) ||
    !["watchlists", "portfolio", "alerts", "dashboard"].includes(path[0] ?? "")
  )
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  const readOnly = request.method === "GET" || request.method === "HEAD";
  if (!readOnly && !sameOrigin(request))
    return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const auth = requestAuth(request);
  const headers = new Headers({ Accept: "application/json" });
  if (auth.config.enabled && auth.client) {
    // This only transports the token. The API independently verifies identity and owner access.
    const { data, error } = await auth.client.auth.getSession();
    if (error || !data.session)
      return auth.finish(NextResponse.json({ message: "Sign in required" }, { status: 401 }));
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  let body: string | undefined;
  if (!readOnly) {
    try {
      body = await readBody(request);
    } catch {
      return auth.finish(NextResponse.json({ message: "Request body too large" }, { status: 413 }));
    }
    headers.set("Content-Type", "application/json");
  }
  try {
    const base = new URL(process.env.API_BASE_URL ?? "http://localhost:4000");
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const url = new URL(`${path.join("/")}${request.nextUrl.search}`, base);
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180000)])
    });
    const response = new NextResponse(upstream.body, { status: upstream.status });
    response.headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ?? "application/json"
    );
    return auth.finish(response);
  } catch {
    return auth.finish(NextResponse.json({ message: "App API unavailable" }, { status: 503 }));
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
