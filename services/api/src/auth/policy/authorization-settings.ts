import { readIdentityPolicy } from '../../database/identity-policy';

export interface AuthorizationLimits { readonly adminIdleMilliseconds: number; readonly adminReauthMilliseconds: number }
/** Local defaults remain bounded by the owner directive. Production activation is still gated. */
export class AuthorizationSettings implements AuthorizationLimits {
  readonly adminIdleMilliseconds: number;
  readonly adminReauthMilliseconds: number;
  constructor(environment: Readonly<Record<string,string | undefined>> = process.env) {
    const policy = readIdentityPolicy({ ...environment, NODE_ENV: environment.NODE_ENV ?? 'development' });
    this.adminIdleMilliseconds = policy.adminIdleSeconds * 1000;
    this.adminReauthMilliseconds = policy.adminReauthSeconds * 1000;
    Object.freeze(this);
  }
}
