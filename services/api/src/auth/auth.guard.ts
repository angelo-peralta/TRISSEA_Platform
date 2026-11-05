import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityProvider, type Principal } from './identity-provider';

export const Public = () => SetMetadata('trissea:public', true);
export interface AuthenticatedRequest {
  headers: { authorization?: string };
  principal?: Principal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly identity: IdentityProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('trissea:public', [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw new UnauthorizedException('Authentication required');
    let principal: Principal | null;
    try { principal = await this.identity.verifyAccessToken(match[1]); }
    catch { throw new UnauthorizedException('Authentication required'); }
    if (!principal) throw new UnauthorizedException('Authentication required');
    request.principal = principal;
    return true;
  }
}
