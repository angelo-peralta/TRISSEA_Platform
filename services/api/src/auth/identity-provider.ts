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
  verifyRequest?(credentials:{authorization?:string;cookie?:string}):Promise<Principal|null>;
}

export class CompositeIdentityProvider extends IdentityProvider {
  constructor(readonly mobile:IdentityProvider,readonly browser?:IdentityProvider){super();}
  verifyAccessToken(token:string){return this.mobile.verifyAccessToken(token);}
  async verifyRequest(credentials:{authorization?:string;cookie?:string}){
    if(credentials.cookie){if(credentials.authorization)return null;return await this.browser?.verifyRequest?.(credentials)??null;}
    const match=/^Bearer ([^\s]+)$/i.exec(credentials.authorization??'');return match?.[1]?this.mobile.verifyAccessToken(match[1]):null;
  }
}

/** M1 has no live login. M2 will bind a reviewed identity adapter. */
export class DenyIdentityProvider extends IdentityProvider {
  async verifyAccessToken(): Promise<null> { return null; }
}
