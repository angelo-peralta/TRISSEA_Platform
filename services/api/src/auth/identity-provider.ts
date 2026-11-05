export interface Principal {
  readonly subject: string;
  readonly mfa: boolean;
  readonly grants: readonly {
    readonly cityId: string;
    readonly todaId?: string;
    readonly permissions: readonly string[];
  }[];
}

/** Providers must validate token signature, issuer, audience, expiry and revocation.
 * Roles/scopes are resolved server-side, never from caller-supplied scope headers. */
export abstract class IdentityProvider {
  abstract verifyAccessToken(token: string): Promise<Principal | null>;
}

/** M1 has no live login. M2 will bind a reviewed identity adapter. */
export class DenyIdentityProvider extends IdentityProvider {
  async verifyAccessToken(): Promise<null> { return null; }
}
