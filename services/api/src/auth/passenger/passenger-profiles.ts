import { and,desc,eq,sql } from 'drizzle-orm';
import * as b from '../../database/identity-schema';
import { passengerProfiles as p } from '../../database/passenger-schema';
import { authAudit,type AuthTransaction } from './passenger-database';
import { PassengerSecrets,PassengerSettings } from './passenger-settings';
import { hasPassengerConsent } from './passenger-sessions';
import { PhoneAuthError,equalDigest,idempotency,objectInput } from './primitives';
export class PassengerProfiles {
  constructor(readonly secrets:PassengerSecrets,readonly settings:PassengerSettings){}
  async me(tx:AuthTransaction,userId:string,sessionId:string){
    const [profile]=await tx.select().from(p).where(eq(p.userId,userId));
    if(!profile)throw new PhoneAuthError('AUTH_FAILED');
    const consent=await hasPassengerConsent(tx,userId,this.settings);
    return {userId,sessionId,clientPurpose:'PASSENGER' as const,state:consent?'ACTIVE' as const:'CONSENT_REQUIRED' as const,
      displayName:profile.displayNameCiphertext?this.secrets.identity.decrypt(profile.displayNameCiphertext,`display-name:${userId}`):null,profileVersion:profile.version,
      requiredNoticeVersion:this.settings.noticeVersion,requiredTermsVersion:this.settings.termsVersion,operationsEnabled:false as const,environment:'LOCAL_SYNTHETIC' as const};
  }
  async update(tx:AuthTransaction,userId:string,sessionId:string,raw:unknown,keyHeader:unknown){
    const input=objectInput(raw,['displayName','expectedVersion']),key=idempotency(keyHeader);
    if((input.displayName!==null&&typeof input.displayName!=='string')||!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<1)throw new PhoneAuthError('INVALID_REQUEST');
    const name=typeof input.displayName==='string'?input.displayName.normalize('NFC').trim():null;
    if(name!==null&&(!name||[...name].length>80||[...name].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)))throw new PhoneAuthError('INVALID_REQUEST');
    const mutation=this.secrets.coordinate('profile-update',userId,key,input.expectedVersion,name),[current]=await tx.select().from(p).where(eq(p.userId,userId));
    if(!current)throw new PhoneAuthError('AUTH_FAILED');
    if(current.mutationDigest&&equalDigest(current.mutationDigest,mutation))return this.me(tx,userId,sessionId);
    if(current.version!==input.expectedVersion)throw new PhoneAuthError('CONFLICT');
    await tx.update(p).set({displayNameCiphertext:name===null?null:this.secrets.identity.encrypt(name,`display-name:${userId}`),keyId:name===null?null:this.secrets.keyId,mutationDigest:mutation,
      version:sql`${p.version}+1`,updatedAt:sql`statement_timestamp()`}).where(and(eq(p.userId,userId),eq(p.version,current.version)));
    await authAudit(tx,'passenger.profile_updated',userId,userId,sessionId);return this.me(tx,userId,sessionId);
  }
  async consent(tx:AuthTransaction,userId:string,sessionId:string,raw:unknown,keyHeader:unknown){
    idempotency(keyHeader);const input=objectInput(raw,['noticeVersion','termsVersion','noticeAcknowledged','termsAccepted']);
    if(input.noticeVersion!==this.settings.noticeVersion||input.termsVersion!==this.settings.termsVersion||input.noticeAcknowledged!==true||input.termsAccepted!==true)throw new PhoneAuthError('INVALID_REQUEST');
    await tx.insert(b.accountConsents).values([{userId,purpose:'PASSENGER',documentCode:'NOTICE',documentVersion:this.settings.noticeVersion,decision:'ACKNOWLEDGED'},
      {userId,purpose:'PASSENGER',documentCode:'TERMS',documentVersion:this.settings.termsVersion,decision:'ACCEPTED'}]).onConflictDoNothing();
    if(!await hasPassengerConsent(tx,userId,this.settings))throw new PhoneAuthError('CONFLICT');
    await tx.update(b.appUsers).set({state:'ACTIVE',version:sql`${b.appUsers.version}+1`}).where(and(eq(b.appUsers.id,userId),eq(b.appUsers.state,'CONSENT_REQUIRED')));
    await tx.update(b.userPersonas).set({state:'ACTIVE'}).where(and(eq(b.userPersonas.userId,userId),eq(b.userPersonas.purpose,'PASSENGER'),eq(b.userPersonas.state,'PENDING')));
    await tx.update(b.appSessions).set({state:'ACTIVE',version:sql`${b.appSessions.version}+1`}).where(and(eq(b.appSessions.userId,userId),eq(b.appSessions.clientPurpose,'PASSENGER'),eq(b.appSessions.state,'CONSENT_REQUIRED')));
    await authAudit(tx,'passenger.consent_recorded',userId,userId,sessionId);return this.me(tx,userId,sessionId);
  }
  async listSessions(tx:AuthTransaction,userId:string,sessionId:string){
    const rows=await tx.select({id:b.appSessions.id,state:b.appSessions.state,lastSeenAt:b.appSessions.lastSeenAt,expiresAt:b.appSessions.expiresAt}).from(b.appSessions)
      .where(and(eq(b.appSessions.userId,userId),eq(b.appSessions.clientPurpose,'PASSENGER'))).orderBy(desc(b.appSessions.createdAt)).limit(50);
    return {sessions:rows.map(row=>({...row,lastSeenAt:row.lastSeenAt.toISOString(),expiresAt:row.expiresAt.toISOString(),current:row.id===sessionId}))};
  }
  async revoke(tx:AuthTransaction,userId:string,actorSessionId:string,targetSessionId:string,keyHeader:unknown):Promise<void>{
    idempotency(keyHeader);
    const [target]=await tx.select().from(b.appSessions).where(and(eq(b.appSessions.id,targetSessionId),eq(b.appSessions.userId,userId),eq(b.appSessions.clientPurpose,'PASSENGER')));
    if(!target)throw new PhoneAuthError('AUTH_FAILED');
    if(!['REVOKED','EXPIRED'].includes(target.state))await tx.update(b.appSessions).set({state:'REVOKED',revokedAt:sql`statement_timestamp()`,version:sql`${b.appSessions.version}+1`}).where(eq(b.appSessions.id,targetSessionId));
    await authAudit(tx,'passenger.session_revoked',targetSessionId,userId,actorSessionId);
  }
}
