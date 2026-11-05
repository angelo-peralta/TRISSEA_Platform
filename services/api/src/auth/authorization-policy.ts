import type { Principal } from './identity-provider';

export interface ResourceScope { cityId: string; todaId?: string }

/** The caller must obtain resource scope from authoritative server records. */
export function isAuthorized(principal: Principal, scope: ResourceScope, permission: string, admin = true): boolean {
  if (admin && !principal.mfa) return false;
  return principal.grants.some(grant =>
    grant.cityId === scope.cityId &&
    (grant.todaId === undefined || grant.todaId === scope.todaId) &&
    grant.permissions.includes(permission),
  );
}
