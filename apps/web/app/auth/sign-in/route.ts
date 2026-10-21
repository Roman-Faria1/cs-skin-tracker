import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requestAuth, sameOrigin, readBody } from "../../../src/lib/auth/server";

const credentials = z
  .object({ email: z.string().email().max(320), password: z.string().min(1).max(1024) })
  .strict();

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  const auth = requestAuth(request);
  if (!auth.client || !auth.config.enabled)
    return auth.finish(
      NextResponse.json({ message: "Authentication is not configured" }, { status: 503 })
    );
  let input: z.infer<typeof credentials>;
  try {
    input = credentials.parse(JSON.parse(await readBody(request, 8192)));
  } catch {
    return auth.finish(
      NextResponse.json({ message: "Enter a valid email and password" }, { status: 400 })
    );
  }
  try {
    const { data, error } = await auth.client.auth.signInWithPassword(input);
    if (error || !data.user) {
      auth.clear();
      const unavailable = error?.status === 429 || (error?.status ?? 0) >= 500;
      return auth.finish(
        NextResponse.json(
          {
            message: unavailable
              ? "Sign-in temporarily unavailable"
              : "Unable to sign in with these credentials"
          },
          { status: unavailable ? 503 : 401 }
        )
      );
    }
    if (data.user.id !== auth.config.ownerId || data.user.is_anonymous) {
      await auth.client.auth.signOut({ scope: "local" });
      auth.clear();
      return auth.finish(NextResponse.json({ message: "Owner access required" }, { status: 403 }));
    }
    return auth.finish(NextResponse.json({ ok: true }));
  } catch {
    auth.clear();
    return auth.finish(
      NextResponse.json({ message: "Sign-in temporarily unavailable" }, { status: 503 })
    );
  }
}
