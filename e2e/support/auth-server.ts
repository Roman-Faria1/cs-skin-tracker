import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { emptyPortfolio, movementFixture } from "../fixtures/market-overview.js";

// Loopback-only identity/API fixture. Never imported by application code.
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const jwt = (id: string, expired = false) =>
  [
    { alg: "HS256", typ: "JWT" },
    { sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600) }
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".") + ".fixture";
const user = (id: string) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: id === owner ? "owner@example.com" : "other@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  is_anonymous: false
});
const session = (id: string) => ({
  access_token: jwt(id),
  token_type: "bearer",
  refresh_token: `${id}-refresh`,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: user(id)
});
const validId = (authorization: string | undefined) => {
  try {
    const token = authorization?.replace(/^Bearer /, "") ?? "";
    const payload = z
      .object({ sub: z.enum([owner, other]), exp: z.number() })
      .parse(JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()));
    return token.endsWith(".fixture") && payload.exp > Date.now() / 1000 ? payload.sub : null;
  } catch {
    return null;
  }
};

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4101");
  const send = (data: unknown, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(data));
  };
  if (url.pathname === "/health") {
    send({ ok: true });
    return;
  }
  if (url.pathname === "/auth/v1/token") {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const parsed = z
      .object({
        email: z.string().optional(),
        password: z.string().optional(),
        refresh_token: z.string().optional()
      })
      .parse(JSON.parse(body));
    if (
      url.searchParams.get("grant_type") === "refresh_token" &&
      parsed.refresh_token === `${owner}-refresh`
    ) {
      send(session(owner));
      return;
    }
    if (
      parsed.password === "fixture-password" &&
      ["owner@example.com", "other@example.com"].includes(parsed.email ?? "")
    ) {
      send(session(parsed.email === "owner@example.com" ? owner : other));
      return;
    }
    send({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    const id = validId(request.headers.authorization);
    send(id ? user(id) : { msg: "Invalid token" }, id ? 200 : 401);
    return;
  }
  if (url.pathname === "/auth/v1/logout") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (validId(request.headers.authorization) !== owner || request.headers.cookie) {
      send({ message: "Owner token required; browser cookies must not be forwarded" }, 401);
      return;
    }
    if (url.pathname === "/api/watchlists/default") {
      send({ id: owner, name: "Default", items: [] });
      return;
    }
    if (url.pathname === "/api/portfolio") {
      send(emptyPortfolio);
      return;
    }
    if (url.pathname === "/api/dashboard/movement") {
      send(movementFixture());
      return;
    }
    send({ message: "Not found" }, 404);
    return;
  }
  send({ message: "Not found" }, 404);
}
const server = createServer((request, response) => {
  void handle(request, response).catch(() => {
    response.writeHead(500);
    response.end();
  });
});
server.listen(4101, "127.0.0.1");
