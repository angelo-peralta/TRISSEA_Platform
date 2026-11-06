import { randomUUID } from 'node:crypto';
import { importPKCS8,importSPKI,SignJWT,jwtVerify } from 'jose';
import type { SessionProof } from '../policy/authorization-model';
import { uuid,type MobilePurpose } from './primitives';
export class PassengerTokens {
  private constructor(private readonly issuer:string,private readonly audience:string,private readonly kid:string,private readonly privateKey:CryptoKey,private readonly publicKey:CryptoKey,readonly lifetimeSeconds:number,readonly purpose:MobilePurpose) {}
  static async create(issuer:string,audience:string,kid:string,privatePem:string,publicPem:string,lifetimeSeconds=600,purpose:MobilePurpose='PASSENGER'):Promise<PassengerTokens> {
    if(!['PASSENGER','DRIVER'].includes(purpose)||!/^https?:\/\//.test(issuer)||!audience||!/^[\w-]{1,32}$/.test(kid)||!Number.isInteger(lifetimeSeconds)||lifetimeSeconds<60||lifetimeSeconds>600)throw new Error('Invalid JWT configuration');
    const signer=new PassengerTokens(issuer,audience,kid,await importPKCS8(privatePem,'EdDSA'),await importSPKI(publicPem,'EdDSA'),lifetimeSeconds,purpose);
    const probe={userId:randomUUID(),sessionId:randomUUID(),identityId:randomUUID(),expiresAt:Date.now()+60_000};
    if(!await signer.verify(await signer.issue(probe)))throw new Error('Signing key pair mismatch');
    return signer;
  }
  async issue(session:{userId:string;sessionId:string;identityId:string;expiresAt:number}):Promise<string> {
    return (await this.issueWithMetadata(session)).accessToken;
  }
  async issueWithMetadata(session:{userId:string;sessionId:string;identityId:string;expiresAt:number}):Promise<{accessToken:string;accessTokenExpiresAt:string}> {
    const now=Math.floor(Date.now()/1000),exp=Math.min(now+this.lifetimeSeconds,Math.floor(session.expiresAt/1000));
    if(exp<=now)throw new Error('Session expired');
    const accessToken=await new SignJWT({sid:session.sessionId,iid:session.identityId,purpose:this.purpose}).setProtectedHeader({alg:'EdDSA',typ:'at+jwt',kid:this.kid})
      .setIssuer(this.issuer).setAudience(this.audience).setSubject(session.userId).setJti(randomUUID()).setIssuedAt(now).setNotBefore(now).setExpirationTime(exp).sign(this.privateKey);
    return {accessToken,accessTokenExpiresAt:new Date(exp*1000).toISOString()};
  }
  async verify(token:string):Promise<SessionProof|null> {
    try {
      if(token.length>4096)return null;
      const {payload:p,protectedHeader:h}=await jwtVerify(token,this.publicKey,{issuer:this.issuer,audience:this.audience,algorithms:['EdDSA'],typ:'at+jwt',clockTolerance:0,
        requiredClaims:['sub','sid','iid','purpose','jti','iat','nbf','exp']});
      if(h.kid!==this.kid||h.jku||h.jwk||h.x5u||p.aud!==this.audience||p.purpose!==this.purpose||!uuid(p.sub)||!uuid(p.sid)||!uuid(p.iid)||!uuid(p.jti)
        ||!Number.isInteger(p.iat)||!Number.isInteger(p.exp)||!Number.isInteger(p.nbf)||p.exp!<=p.iat!||p.exp!-p.iat!>this.lifetimeSeconds||p.nbf!==p.iat||p.iat!>Math.floor(Date.now()/1000))return null;
      return {userId:p.sub,sessionId:p.sid,identityId:p.iid,purpose:this.purpose,expiresAt:p.exp!*1000};
    } catch { return null; }
  }
}
