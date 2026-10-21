import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { authFetch } from "@csst/shared";
import { loadApiEnv } from "../config/env.js";

@Injectable()
export class AuthService {
  private readonly config = loadApiEnv().auth;
  private readonly client = this.config.enabled
    ? createClient(this.config.supabaseUrl, this.config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: authFetch }
      })
    : null;

  async authorize(authorization: string | undefined): Promise<void> {
    if (!this.config.enabled || this.client === null) return;
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Sign in required");
    const result = await this.client.auth.getUser(token).catch(() => {
      throw new ServiceUnavailableException("Identity service unavailable");
    });
    if (result.error) {
      if (result.error.status === 429 || (result.error.status ?? 0) >= 500)
        throw new ServiceUnavailableException("Identity service unavailable");
      throw new UnauthorizedException("Session is invalid or expired");
    }
    if (!result.data.user) throw new UnauthorizedException("Sign in required");
    if (result.data.user.id !== this.config.ownerId || result.data.user.is_anonymous)
      throw new ForbiddenException("Owner access required");
  }
}
