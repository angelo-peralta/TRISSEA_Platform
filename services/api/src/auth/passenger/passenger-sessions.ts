import { randomBytes,randomUUID } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import * as b from '../../database/identity-schema';
import * as p from '../../database/passenger-schema';
import type { SessionProof } from '../policy/authorization-model';
import { PassengerDatabase,authNow,authAudit,passengerContext,type AuthTransaction } from './passenger-database';
import { PassengerSecrets,PassengerSettings } from './passenger-settings';
import { PassengerTokens } from './token-service';
import { PhoneAuthError,clientBinding,equalDigest,idempotency,objectInput,type MobilePurpose } from './primitives';

export type MobileAuthResult = Omit<import('../../contracts/generated/mvp').Schemas['MobileAuthResult'],'clientPurpose'> & {clientPurpose:MobilePurpose};
export async function hasPassengerConsent(tx:AuthTransaction,userId:string,settings:PassengerSettings,purpose:MobilePurpose='PASSENGER'):Promise<boolean>{
  const rows=await tx.execute(sql`SELECT DISTINCT ON(document_code,document_version) document_code,document_version,decision
    FROM identity.account_consents WHERE user_id=${userId}::uuid AND purpose=${purpose}
    ORDER BY document_code,document_version,recorded_at DESC,id DESC`);
  return rows.some(r=>r.document_code==='NOTICE'&&r.document_version===settings.noticeVersion&&r.decision==='ACKNOWLEDGED')
    &&rows.some(r=>r.document_code==='TERMS'&&r.document_version===settings.termsVersion&&r.decision==='ACCEPTED');
}
export class PassengerSessions {
  constructor(readonly database:PassengerDatabase,readonly secrets:PassengerSecrets,readonly settings:PassengerSettings,readonly tokens:PassengerTokens){}
  get purpose():MobilePurpose{return this.tokens.purpose;}
  binding(deviceId:string,clientProof:string):string{return this.secrets.coordinate('session-binding',deviceId,clientProof,this.purpose);}
  async current(tx:AuthTransaction,proof:SessionProof):Promise<boolean>{
    if(proof.purpose!==this.purpose)return false;
    const s=b.appSessions,u=b.appUsers,i=b.authIdentities,m=p.mobileSessionBindings,persona=b.userPersonas;
    const [row]=await tx.select({id:s.id}).from(s).innerJoin(u,eq(u.id,s.userId)).innerJoin(i,and(eq(i.id,s.identityId),eq(i.userId,u.id)))
      .innerJoin(m,and(eq(m.sessionId,s.id),eq(m.userId,u.id),eq(m.purpose,s.clientPurpose)))
      .innerJoin(persona,and(eq(persona.userId,u.id),eq(persona.purpose,s.clientPurpose)))
      .where(and(eq(s.id,proof.sessionId),eq(u.id,proof.userId),eq(i.id,proof.identityId),eq(s.clientPurpose,this.purpose),eq(i.kind,'PHONE_OTP'),eq(i.state,'ACTIVE'),eq(s.authVersion,u.authVersion),
        sql`${u.state} IN ('ACTIVE','CONSENT_REQUIRED') AND ${s.state} IN ('ACTIVE','CONSENT_REQUIRED') AND (${u.state}<>'CONSENT_REQUIRED' OR ${s.state}='CONSENT_REQUIRED') AND ${persona.state} IN ('ACTIVE','PENDING') AND ${s.expiresAt}>clock_timestamp() AND ${m.expiresAt}>clock_timestamp()`));
    return !!row;
  }
  async isCurrent(proof:SessionProof):Promise<boolean>{return this.database.transaction(tx=>this.current(tx,proof));}
  private async cached(tx:AuthTransaction,scopeId:string,operation:'VERIFY'|'REFRESH',key:string,request:string,binding:string):Promise<MobileAuthResult|null>{
    const [row]=await tx.select().from(p.authOperationResults).where(and(eq(p.authOperationResults.scopeId,scopeId),eq(p.authOperationResults.operation,operation),eq(p.authOperationResults.idempotencyDigest,key),
      sql`${p.authOperationResults.expiresAt}>clock_timestamp()`));
    if(!row||!equalDigest(row.requestDigest,request)||!equalDigest(row.bindingDigest,binding))return null;
    return JSON.parse(this.secrets.identity.decrypt(row.resultCiphertext,`result:${scopeId}:${operation}:${key}`)) as MobileAuthResult;
  }
  private async cache(tx:AuthTransaction,scopeId:string,operation:'VERIFY'|'REFRESH',key:string,request:string,binding:string,result:MobileAuthResult):Promise<void>{
    const now=await authNow(tx);
    await tx.insert(p.authOperationResults).values({scopeId,operation,idempotencyDigest:key,requestDigest:request,bindingDigest:binding,
      resultCiphertext:this.secrets.identity.encrypt(JSON.stringify(result),`result:${scopeId}:${operation}:${key}`),createdAt:new Date(now),expiresAt:new Date(now+this.settings.retrySeconds*1000)});
  }
  private async cachedCredentialCurrent(tx:AuthTransaction,result:MobileAuthResult):Promise<boolean>{
    const [row]=await tx.select({id:b.refreshCredentials.id}).from(b.refreshCredentials).where(and(eq(b.refreshCredentials.digest,this.secrets.refresh(result.refreshToken)),eq(b.refreshCredentials.sessionId,result.sessionId),
      sql`${b.refreshCredentials.usedAt} IS NULL AND ${b.refreshCredentials.revokedAt} IS NULL AND ${b.refreshCredentials.expiresAt}>clock_timestamp()`));return !!row;
  }
  private async result(userId:string,sessionId:string,identityId:string,expiresAt:number,refreshToken:string):Promise<MobileAuthResult>{
    return {...await this.tokens.issueWithMetadata({userId,sessionId,identityId,expiresAt}),refreshToken,tokenType:'Bearer',userId,sessionId,clientPurpose:this.purpose};
  }
  async completeVerification(challengeId:string,receipt:string,phone:string,deviceId:string,clientProof:string,key:string,request:string,challengeBinding:string):Promise<MobileAuthResult>{
    return this.database.transaction(async tx=>{
      const [challenge]=await tx.select().from(b.otpChallengeMetadata).where(eq(b.otpChallengeMetadata.id,challengeId)).for('update');
      const now=await authNow(tx);
      if(!challenge||challenge.purpose!==this.purpose||challenge.keyId!==this.secrets.keyId||challenge.expiresAt.getTime()<=now
        ||!equalDigest(challenge.bindingDigest,challengeBinding)||!equalDigest(challenge.destinationDigest,this.secrets.identity.lookup(phone,'otp-destination')))throw new PhoneAuthError('AUTH_FAILED');
      const [accepted]=await tx.select().from(b.otpRedemptions).where(eq(b.otpRedemptions.challengeId,challengeId));
      if(accepted){
        if(!equalDigest(accepted.receiptDigest,receipt))throw new PhoneAuthError('AUTH_FAILED');
        const result=await this.cached(tx,challengeId,'VERIFY',key,request,challengeBinding);
        if(!result||!await this.cachedCredentialCurrent(tx,result)||!await this.current(tx,{userId:result.userId,sessionId:result.sessionId,identityId:(await tx.select({id:b.appSessions.identityId}).from(b.appSessions).where(eq(b.appSessions.id,result.sessionId)))[0]?.id??'',purpose:this.purpose,expiresAt:now+1}))throw new PhoneAuthError('AUTH_FAILED');
        return result;
      }
      if(!['SENDING','SENT','UNKNOWN'].includes(challenge.state))throw new PhoneAuthError('AUTH_FAILED');
      const subjectDigest=this.secrets.identity.lookup(phone,'PHONE_OTP');
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`phone:${subjectDigest}`},0))`);
      let [identity]=await tx.select().from(b.authIdentities).where(and(eq(b.authIdentities.issuer,'trissea:phone'),eq(b.authIdentities.kind,'PHONE_OTP'),eq(b.authIdentities.keyId,this.secrets.keyId),eq(b.authIdentities.subjectDigest,subjectDigest)));
      if(!identity){
        const [user]=await tx.insert(b.appUsers).values({}).returning();if(!user)throw new Error('Account creation failed');
        [identity]=await tx.insert(b.authIdentities).values({userId:user.id,kind:'PHONE_OTP',issuer:'trissea:phone',keyId:this.secrets.keyId,subjectDigest,
          subjectCiphertext:this.secrets.identity.encrypt(phone,'PHONE_OTP'),verifiedAt:new Date(now)}).returning();
      }
      if(!identity||identity.state!=='ACTIVE')throw new PhoneAuthError('AUTH_FAILED');
      const [user]=await tx.select().from(b.appUsers).where(eq(b.appUsers.id,identity.userId)).for('update');
      if(!user||!['ACTIVE','CONSENT_REQUIRED'].includes(user.state))throw new PhoneAuthError('AUTH_FAILED');
      await passengerContext(tx,user.id,this.purpose);
      await tx.insert(b.userPersonas).values({userId:user.id,purpose:this.purpose}).onConflictDoNothing();
      const [persona]=await tx.select().from(b.userPersonas).where(and(eq(b.userPersonas.userId,user.id),eq(b.userPersonas.purpose,this.purpose)));
      if(!persona||persona.state==='RESTRICTED')throw new PhoneAuthError('AUTH_FAILED');
      if(this.purpose==='PASSENGER')await tx.insert(p.passengerProfiles).values({userId:user.id}).onConflictDoNothing();
      else await tx.execute(sql`INSERT INTO identity.driver_profiles(user_id) VALUES(${user.id}::uuid) ON CONFLICT DO NOTHING`);
      const active=user.state==='ACTIVE'&&await hasPassengerConsent(tx,user.id,this.settings,this.purpose),sessionId=randomUUID(),expiresAt=now+this.settings.sessionSeconds*1000;
      await tx.insert(b.appSessions).values({id:sessionId,userId:user.id,identityId:identity.id,identityKind:'PHONE_OTP',clientPurpose:this.purpose,state:active?'ACTIVE':'CONSENT_REQUIRED',authVersion:user.authVersion,authenticatedAt:new Date(now),lastSeenAt:new Date(now),expiresAt:new Date(expiresAt)});
      await tx.insert(p.mobileSessionBindings).values({sessionId,userId:user.id,purpose:this.purpose,keyId:this.secrets.keyId,bindingDigest:this.binding(deviceId,clientProof),expiresAt:new Date(expiresAt)});
      const refreshToken=randomBytes(48).toString('base64url');
      await tx.insert(b.refreshCredentials).values({sessionId,generation:0,keyId:this.secrets.keyId,digest:this.secrets.refresh(refreshToken),expiresAt:new Date(expiresAt)});
      await tx.insert(b.otpRedemptions).values({challengeId,purpose:this.purpose,userId:user.id,sessionId,receiptDigest:receipt});
      await tx.update(b.otpChallengeMetadata).set({state:'REDEEMED',version:sql`${b.otpChallengeMetadata.version}+1`}).where(eq(b.otpChallengeMetadata.id,challengeId));
      await authAudit(tx,`${this.purpose.toLowerCase()}.authenticated`,sessionId,user.id,sessionId);
      const result=await this.result(user.id,sessionId,identity.id,expiresAt,refreshToken);
      await this.cache(tx,challengeId,'VERIFY',key,request,challengeBinding,result);return result;
    });
  }
  async refresh(raw:unknown,keyHeader:unknown):Promise<MobileAuthResult>{
    const input=objectInput(raw,['clientPurpose','clientProof','deviceId','refreshToken']),binding=clientBinding(input,this.purpose),key=idempotency(keyHeader);
    if(typeof input.refreshToken!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(input.refreshToken))throw new PhoneAuthError('AUTH_FAILED');
    const token=input.refreshToken,bindingDigest=this.binding(binding.deviceId,binding.clientProof),idem=this.secrets.coordinate('refresh-idempotency',key,bindingDigest),request=this.secrets.coordinate('refresh-request',token,bindingDigest);
    const outcome=await this.database.transaction(async tx=>{
      const [located]=await tx.select().from(b.refreshCredentials).where(and(eq(b.refreshCredentials.digest,this.secrets.refresh(token)),eq(b.refreshCredentials.keyId,this.secrets.keyId)));
      if(!located)return null;
      const [locatedSession]=await tx.select().from(b.appSessions).where(eq(b.appSessions.id,located.sessionId));
      if(!locatedSession||locatedSession.clientPurpose!==this.purpose)return null;
      await tx.execute(sql`SELECT id FROM identity.app_users WHERE id=${locatedSession.userId}::uuid FOR UPDATE`);
      const [session]=await tx.select().from(b.appSessions).where(eq(b.appSessions.id,located.sessionId)).for('update');
      const [credential]=await tx.select().from(b.refreshCredentials).where(eq(b.refreshCredentials.id,located.id)).for('update');
      const [client]=await tx.select().from(p.mobileSessionBindings).where(eq(p.mobileSessionBindings.sessionId,located.sessionId));
      if(!session||!credential||!client||!equalDigest(client.bindingDigest,bindingDigest)||client.keyId!==this.secrets.keyId||credential.revokedAt||credential.expiresAt.getTime()<=await authNow(tx))return null;
      const proof:SessionProof={userId:session.userId,sessionId:session.id,identityId:session.identityId,purpose:this.purpose,expiresAt:session.expiresAt.getTime()};
      if(!await this.current(tx,proof))return null;
      await passengerContext(tx,session.userId,this.purpose);
      if(credential.usedAt){
        const cached=await this.cached(tx,credential.id,'REFRESH',idem,request,bindingDigest);
        if(cached)return await this.cachedCredentialCurrent(tx,cached)?cached:null;
        await tx.update(b.appSessions).set({state:'REVOKED',revokedAt:sql`statement_timestamp()`,version:sql`${b.appSessions.version}+1`}).where(eq(b.appSessions.id,session.id));
        await authAudit(tx,`${this.purpose.toLowerCase()}.refresh_reuse`,session.id,session.userId,session.id,'REFRESH_REUSE');return null;
      }
      const now=await authNow(tx),refreshToken=randomBytes(48).toString('base64url');
      await tx.update(b.refreshCredentials).set({usedAt:new Date(now)}).where(eq(b.refreshCredentials.id,credential.id));
      await tx.insert(b.refreshCredentials).values({sessionId:session.id,generation:credential.generation+1,digest:this.secrets.refresh(refreshToken),keyId:this.secrets.keyId,expiresAt:session.expiresAt});
      await tx.update(b.appSessions).set({lastSeenAt:new Date(now),version:sql`${b.appSessions.version}+1`}).where(eq(b.appSessions.id,session.id));
      const result=await this.result(session.userId,session.id,session.identityId,session.expiresAt.getTime(),refreshToken);
      await this.cache(tx,credential.id,'REFRESH',idem,request,bindingDigest,result);
      await authAudit(tx,`${this.purpose.toLowerCase()}.refreshed`,session.id,session.userId,session.id);return result;
    });
    if(!outcome)throw new PhoneAuthError('AUTH_FAILED');return outcome;
  }
  async purgeExpiredResults():Promise<void>{await this.database.transaction(async tx=>{await tx.execute(sql`DELETE FROM identity.auth_operation_results WHERE ctid IN(SELECT ctid FROM identity.auth_operation_results WHERE expires_at<=clock_timestamp() LIMIT 500)`);});}
}
