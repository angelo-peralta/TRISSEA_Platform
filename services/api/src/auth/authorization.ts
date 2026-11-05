import { ForbiddenException } from '@nestjs/common';
import type { Principal } from './identity-provider';
import { isAuthorized, type ResourceScope } from './authorization-policy';
export type { ResourceScope } from './authorization-policy';

/** Example M1 boundary. Resource scope must be loaded from DB, not a request claim.
 * Additional owner, duty, verification, case and maker/checker checks belong to M2+.
 * A TODA grant can never authorize a city-wide request. No implicit platform bypass. */
export function authorize(principal: Principal, scope: ResourceScope, permission: string, admin = true): void {
  if (admin && !principal.mfa) throw new ForbiddenException('MFA required');
  if (!isAuthorized(principal, scope, permission, admin)) throw new ForbiddenException('Resource access denied');
}
