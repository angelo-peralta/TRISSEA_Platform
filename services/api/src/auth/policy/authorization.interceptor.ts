import { applyDecorators, type CallHandler, type ExecutionContext, ForbiddenException, Injectable, type NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { ActionKey } from './authorization-model';
import { AuthorizationService, type AuthorizedWork, type RequestCredentials } from './authorization.service';

const metadataKey = 'trissea:authorization-policy';
const contexts = new WeakMap<object, AuthorizedWork>();
export function authorizedRequestContext(request: object): AuthorizedWork {
  const context = contexts.get(request);
  if (!context) throw new ForbiddenException('Resource access denied');
  return context;
}
interface PolicyMetadata { action: ActionKey; resourceParam: string }

/** Future controller integration. The handler must use the supplied tx for DB work.
 * No streaming/external side effects within this transaction. No controller is added in M2.2. */
@Injectable()
export class AuthorizationInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly reflector: Reflector, private readonly authorization: AuthorizationService) {}
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const policy = this.reflector.get<PolicyMetadata | undefined>(metadataKey,context.getHandler());
    if (!policy) throw new ForbiddenException('Resource access denied');
    const request = context.switchToHttp().getRequest<{ headers: Record<string,string | string[] | undefined>; params?: Record<string,unknown> }>();
    const id = policy.resourceParam==='@self'?'@self':request.params?.[policy.resourceParam];
    if (typeof id !== 'string') throw new ForbiddenException('Resource access denied');
    const credentials: { -readonly [K in keyof RequestCredentials]: RequestCredentials[K] } = {};
    for (const [header,key] of [['authorization','authorization'],['cookie','cookie'],['origin','origin'],['x-csrf-token','csrf']] as const) {
      const value = request.headers[header];
      if (typeof value === 'string') credentials[key] = value;
    }
    return from(this.authorization.execute(credentials,policy.action,id,async work => {
      contexts.set(request,work);
      try { return await lastValueFrom(next.handle(), { defaultValue: undefined }); }
      finally { contexts.delete(request); }
    }));
  }
}
export function ProtectedPolicy(action: ActionKey, resourceParam: string): MethodDecorator {
  return applyDecorators(SetMetadata(metadataKey,Object.freeze({ action,resourceParam })),UseInterceptors(AuthorizationInterceptor));
}
