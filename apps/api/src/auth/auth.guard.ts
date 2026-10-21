import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.js";

const AUTH_EXEMPT = "csst:owner-auth-exempt";
export const OwnerAuthExempt = () => SetMetadata(AUTH_EXEMPT, true);

@Injectable()
export class OwnerAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(AUTH_EXEMPT, [
        context.getHandler(),
        context.getClass()
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    await this.auth.authorize(request.headers.authorization);
    return true;
  }
}
