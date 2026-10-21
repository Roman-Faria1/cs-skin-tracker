import { NextResponse, type NextRequest } from "next/server";
import { requestAuth, sameOrigin } from "../../../src/lib/auth/server";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const auth = requestAuth(request);
  try {
    await auth.client?.auth.signOut({ scope: "local" });
  } catch {
    // Always remove this browser's credentials, including during an identity-provider outage.
  } finally {
    auth.clear();
  }
  return auth.finish(NextResponse.json({ ok: true }));
}
