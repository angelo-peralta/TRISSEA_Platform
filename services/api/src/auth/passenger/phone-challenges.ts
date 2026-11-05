import { randomBytes,randomUUID } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import { otpChallengeMetadata as m } from '../../database/identity-schema';
import { phoneRequestBindings as r } from '../../database/passenger-schema';
import { PassengerDatabase,authAudit,authNow } from './passenger-database';
import { PassengerSettings,PassengerSecrets } from './passenger-settings';
import { RedisOtpStore } from './redis-otp';
import { SmsGateway } from './sms-gateway';
import { PassengerSessions } from './passenger-sessions';
import { PhoneAuthError,clientBinding,equalDigest,generateOtp,idempotency,normalizePhone,objectInput,uuid } from './primitives';

export class PhoneChallenges {
  constructor(readonly database:PassengerDatabase,readonly secrets:PassengerSecrets,readonly settings:PassengerSettings,readonly otp:RedisOtpStore,readonly sms:SmsGateway,readonly sessions:PassengerSessions){}
  private description(row:typeof m.$inferSelect){return {challengeId:row.id,expiresAt:row.expiresAt.toISOString(),resendAfter:row.resendAfter.toISOString(),clientPurpose:'PASSENGER' as const,deliveryMode:'MOCK' as const};}
  binding(id:string,deviceId:string,clientProof:string):string{return this.secrets.coordinate('challenge-binding',id,deviceId,clientProof,'PASSENGER');}
  async request(raw:unknown,keyHeader:unknown,ip:string){
    const input=objectInput(raw,['phone','clientPurpose','clientProof','deviceId']),client=clientBinding(input),phone=normalizePhone(input.phone),key=idempotency(keyHeader);
    const destination=this.secrets.identity.lookup(phone,'otp-destination'),ipDigest=this.secrets.coordinate('ip',ip),deviceDigest=this.secrets.coordinate('device',client.deviceId);
    const requestKey=this.secrets.coordinate('phone-request-key',key,client.deviceId,client.clientProof,'PASSENGER'),request=this.secrets.coordinate('phone-request',phone,client.deviceId,client.clientProof,'PASSENGER');
    const prepared=await this.database.transaction(async tx=>{
      // Durable development send budget/cooldown survives loss of ephemeral Redis state.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(71503001)`);
      const [previous]=await tx.select({metadata:m,request:r.requestDigest}).from(m).innerJoin(r,eq(m.id,r.challengeId)).where(eq(r.requestKeyDigest,requestKey));
      const now=await authNow(tx);
      if(previous){
        if(!equalDigest(previous.request,request)||previous.metadata.expiresAt.getTime()<=now)throw new PhoneAuthError('CONFLICT');
        if(previous.metadata.state==='FAILED')throw new PhoneAuthError('UNAVAILABLE');
        return {row:previous.metadata,reused:true};
      }
      const [budget]=await tx.execute(sql`SELECT
        count(*) FILTER(WHERE c.destination_digest=${destination} AND c.created_at>clock_timestamp()-interval '1 hour')::int AS destination_hour,
        count(*) FILTER(WHERE c.destination_digest=${destination})::int AS destination_day,
        count(*) FILTER(WHERE b.ip_digest=${ipDigest} AND c.created_at>clock_timestamp()-interval '1 hour')::int AS ip_hour,
        count(*) FILTER(WHERE b.device_digest=${deviceDigest} AND c.created_at>clock_timestamp()-interval '1 hour')::int AS device_hour,
        count(*) FILTER(WHERE b.device_digest=${deviceDigest})::int AS device_day,count(*)::int AS global_day,
        count(*) FILTER(WHERE c.destination_digest=${destination} AND c.created_at>clock_timestamp()-(${this.settings.policy.otpResendSeconds}*interval '1 second'))::int AS cooldown
        FROM identity.otp_challenge_metadata c JOIN identity.phone_request_bindings b ON b.challenge_id=c.id WHERE c.created_at>clock_timestamp()-interval '1 day'`);
      const limits=this.settings.limits;
      if(!budget||Number(budget.cooldown)>0||Number(budget.destination_hour)>=limits.otpHourlyLimit||Number(budget.destination_day)>=limits.otpDailyLimit
        ||Number(budget.ip_hour)>=limits.ipHourlyLimit||Number(budget.device_hour)>=limits.deviceHourlyLimit||Number(budget.device_day)>=limits.deviceDailyLimit||Number(budget.global_day)>=limits.globalDailyLimit)throw new PhoneAuthError('RATE_LIMITED');
      const id=randomUUID(),bindingDigest=this.binding(id,client.deviceId,client.clientProof);
      await tx.update(m).set({state:'SUPERSEDED',version:sql`${m.version}+1`}).where(and(eq(m.destinationDigest,destination),eq(m.purpose,'PASSENGER'),sql`${m.state} IN ('PREPARED','SENDING','SENT','UNKNOWN')`));
      const [row]=await tx.insert(m).values({id,purpose:'PASSENGER',destinationDigest:destination,bindingDigest,keyId:this.secrets.keyId,
        createdAt:new Date(now),expiresAt:new Date(now+limits.otpTtlSeconds*1000),resendAfter:new Date(now+limits.otpResendSeconds*1000)}).returning();
      if(!row)throw new Error('Challenge preparation failed');
      await tx.insert(r).values({challengeId:id,requestKeyDigest:requestKey,requestDigest:request,ipDigest,deviceDigest,keyId:this.secrets.keyId,createdAt:new Date(now)});
      await authAudit(tx,'passenger.otp_requested',id);return {row,reused:false};
    });
    if(prepared.reused)return this.description(prepared.row);
    const row=prepared.row,code=generateOtp(),hash=this.secrets.otp(row.id,destination,row.bindingDigest,'PASSENGER',code);
    try {
      await this.otp.register(row.id,hash,row.bindingDigest,destination,ipDigest,deviceDigest,this.settings.limits);
      const moved=await this.database.transaction(tx=>tx.update(m).set({state:'SENDING'}).where(and(eq(m.id,row.id),eq(m.state,'PREPARED'))).returning({id:m.id}));
      if(moved.length!==1)throw new PhoneAuthError('AUTH_FAILED');
      const outcome=await this.sms.send({recipient:phone,code,challengeId:row.id});
      await this.database.transaction(tx=>tx.update(m).set({state:outcome==='ACCEPTED'?'SENT':outcome==='UNKNOWN'?'UNKNOWN':'FAILED'}).where(and(eq(m.id,row.id),sql`${m.state} IN ('PREPARED','SENDING')`)));
      if(outcome==='REJECTED')throw new PhoneAuthError('UNAVAILABLE');
      return this.description(row);
    } catch(error){
      try {await this.database.transaction(tx=>tx.update(m).set({state:'FAILED'}).where(and(eq(m.id,row.id),sql`${m.state} IN ('PREPARED','SENDING')`)));}catch{/* fail closed; never resend or reconstruct code */}
      if(error instanceof PhoneAuthError)throw error;throw new PhoneAuthError('UNAVAILABLE');
    }
  }
  async verify(id:unknown,raw:unknown,keyHeader:unknown,ip:string){
    if(!uuid(id))throw new PhoneAuthError('AUTH_FAILED');
    const input=objectInput(raw,['phone','code','clientPurpose','clientProof','deviceId']),client=clientBinding(input),phone=normalizePhone(input.phone),key=idempotency(keyHeader);
    if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new PhoneAuthError('AUTH_FAILED');
    await this.otp.limitVerification(this.secrets.coordinate('ip',ip));
    const binding=this.binding(id,client.deviceId,client.clientProof),destination=this.secrets.identity.lookup(phone,'otp-destination');
    const metadata=await this.database.transaction(async tx=>{
      const [row]=await tx.select().from(m).where(eq(m.id,id));
      if(!row||row.purpose!=='PASSENGER'||row.expiresAt.getTime()<=await authNow(tx)||!equalDigest(row.bindingDigest,binding)||!equalDigest(row.destinationDigest,destination))throw new PhoneAuthError('AUTH_FAILED');
      return row;
    });
    const snapshot=await this.otp.inspect(id),candidate=this.secrets.otp(id,destination,binding,'PASSENGER',input.code),request=this.secrets.coordinate('verify-request',id,key,phone,input.code,binding);
    const receipt=await this.otp.consume(id,destination,binding,snapshot.hash??'',request,equalDigest(snapshot.hash??'',candidate),this.secrets.coordinate('receipt',randomBytes(32).toString('hex')),this.settings.policy.otpMaxAttempts);
    if(!receipt||metadata.keyId!==this.secrets.keyId)throw new PhoneAuthError('AUTH_FAILED');
    return this.sessions.completeVerification(id,receipt,phone,client.deviceId,client.clientProof,this.secrets.coordinate('verify-idempotency',key,binding),request,binding);
  }
  async status(id:unknown,deviceId:unknown,clientProof:unknown,ip:string){
    if(!uuid(id))throw new PhoneAuthError('AUTH_FAILED');
    const client=clientBinding({clientPurpose:'PASSENGER',deviceId,clientProof});
    await this.otp.limitVerification(this.secrets.coordinate('ip',ip));
    return this.database.transaction(async tx=>{
      const [row]=await tx.select().from(m).where(eq(m.id,id));
      if(!row||row.purpose!=='PASSENGER'||!equalDigest(row.bindingDigest,this.binding(id,client.deviceId,client.clientProof)))throw new PhoneAuthError('AUTH_FAILED');
      const proof=await this.otp.inspect(id);
      const state=row.expiresAt.getTime()<=await authNow(tx)||['FAILED','EXPIRED','SUPERSEDED'].includes(row.state)||proof.state==='LOCKED'||(!Object.keys(proof).length&&row.state!=='PREPARED'&&row.state!=='REDEEMED')?'EXPIRED':row.state==='REDEEMED'?'COMPLETED':'PENDING';
      return {...this.description(row),state};
    });
  }
}
