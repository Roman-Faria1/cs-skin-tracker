import { NextResponse, type NextRequest } from "next/server";
import { requestAuth, webOrigin } from "./src/lib/auth/server";

export async function middleware(request: NextRequest) {
  try {
    const auth = requestAuth(request);
    if (!auth.config.enabled || auth.client === null) return auth.finish(NextResponse.next());
    const { data, error } = await auth.client.auth.getUser();
    if (error?.status === 429 || (error?.status ?? 0) >= 500)
      return auth.finish(
        NextResponse.json({ message: "Authentication unavailable" }, { status: 503 })
      );
    const owner = !error && data.user?.id === auth.config.ownerId && !data.user.is_anonymous;
    const login = request.nextUrl.pathname === "/login";
    if (!owner && !login) {
      if (request.nextUrl.pathname.startsWith("/api/"))
        return auth.finish(NextResponse.json({ message: "Sign in required" }, { status: 401 }));
      const destination = new URL("/login", webOrigin());
      return auth.finish(NextResponse.redirect(destination));
    }
    if (owner && login) return auth.finish(NextResponse.redirect(new URL("/", webOrigin())));
    // Propagate refreshed cookies to the route as well as back to the browser.
    return auth.finish(NextResponse.next({ request: { headers: request.headers } }));
  } catch {
    return NextResponse.json(
      { message: "Authentication unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/).*)"],
  runtime: "nodejs"
};
