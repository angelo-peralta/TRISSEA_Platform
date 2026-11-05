import assert from 'node:assert/strict';
import { generateKeyPairSync,randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT,importPKCS8 } from 'jose';
import { formatOtp,generateOtp,normalizePhone,clientBinding,objectInput,digest,equalDigest } from '../src/auth/passenger/primitives';
import { PassengerSettings,PassengerSecrets } from '../src/auth/passenger/passenger-settings';
import { PassengerTokens } from '../src/auth/passenger/token-service';
import { MockSmsGateway,PhilSmsGateway,type SmsTransport } from '../src/auth/passenger/sms-gateway';

test('PH E.164 normalization, leading-zero CSPRNG OTP, allowlists and keyed purpose separation',()=>{
 for(const value of ['09990000001','639990000001','+63 (999) 000-0001'])assert.equal(normalizePhone(value),'+639990000001');
 for(const value of ['+12025550123','+6309990000001','+63999a000001','09990000001\nsecret',null,1])assert.throws(()=>normalizePhone(value));
 assert.equal(formatOtp(0),'000000');assert.equal(formatOtp(999999),'999999');assert.throws(()=>formatOtp(1_000_000));
 const codes=Array.from({length:1000},generateOtp);assert.equal(codes.every(code=>/^\d{6}$/.test(code)),true);assert.equal(new Set(codes).size>900,true);
 assert.throws(()=>clientBinding({clientPurpose:'DRIVER',deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')}));
 assert.throws(()=>objectInput({role:'PLATFORM_ADMIN'},['phone']));
 const key=randomBytes(32),a=digest(key,'a','synthetic');assert.equal(equalDigest(a,digest(key,'a','synthetic')),true);assert.equal(equalDigest(a,digest(key,'b','synthetic')),false);assert.equal(equalDigest('bad','bad'),false);
});
test('configuration cannot weaken owner settings or enable live/recovery/production capabilities',()=>{
 const settings=new PassengerSettings({NODE_ENV:'test'});assert.equal(settings.policy.otpMaxAttempts,5);assert.equal(settings.policy.otpTtlSeconds,300);assert.equal(settings.policy.otpResendSeconds,60);assert.equal(settings.retrySeconds,15);
 for(const change of [{NODE_ENV:'production'},{SMS_PROVIDER:'philsms'},{SMS_LIVE_ENABLED:'true'},{RECOVERY_ENABLED:'true'},{REAL_DOCUMENTS_ENABLED:'true'},{OPERATIONAL_SERVICES_ENABLED:'true'},{OTP_MAX_ATTEMPTS:'6'},{OTP_RESEND_SECONDS:'59'},{MOBILE_JWT_SECONDS:'601'},{MOBILE_SESSION_SECONDS:'86401'},{AUTH_RETRY_SECONDS:'31'}])assert.throws(()=>new PassengerSettings({NODE_ENV:'test',...change}));
 const key=randomBytes(32);assert.throws(()=>new PassengerSecrets('test',key,key,key,key,key));assert.throws(()=>new MockSmsGateway('production'));
 assert.throws(()=>new PassengerSettings({NODE_ENV:'test',OTP_GLOBAL_DAILY_LIMIT:'101'}));assert.equal(new PassengerSettings({NODE_ENV:'test',OTP_IP_HOURLY_LIMIT:'10'}).ipHourlyLimit,10);
});
test('Ed25519 JWT validates signature, exact claims/header, lifetime, issuer and audience',async()=>{
 const pair=generateKeyPairSync('ed25519'),privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicPem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
 const issuer='http://127.0.0.1:4100/v1',audience='synthetic-passenger',kid='unit-test',tokens=await PassengerTokens.create(issuer,audience,kid,privatePem,publicPem);
 const session={userId:randomUUID(),sessionId:randomUUID(),identityId:randomUUID(),expiresAt:Date.now()+3600_000};
 const token=await tokens.issue(session);assert.equal((await tokens.verify(token))?.userId,session.userId);
 const signer=await importPKCS8(privatePem,'EdDSA'),now=Math.floor(Date.now()/1000);
 async function forged(claims:Record<string,unknown>={},header:Record<string,unknown>={}){
  const value=await new SignJWT({sub:session.userId,sid:session.sessionId,iid:session.identityId,purpose:'PASSENGER',jti:randomUUID(),iss:issuer,aud:audience,iat:now,nbf:now,exp:now+600,...claims}).setProtectedHeader({alg:'EdDSA',typ:'at+jwt',kid,...header}).sign(signer);
  assert.equal(await tokens.verify(value),null);
 }
 for(const claims of [{iss:'https://evil.invalid'},{aud:'driver'},{purpose:'DRIVER'},{sub:'not-uuid'},{exp:now-1},{iat:now+60,nbf:now+60},{exp:now+601},{nbf:now-1}])await forged(claims);
 for(const header of [{kid:'unknown'},{typ:'JWT'},{jku:'https://evil.invalid/key'},{jwk:{kty:'OKP'}}])await forged({},header);
 assert.equal(await tokens.verify(token.slice(0,-10)+'invalid'),null);assert.equal(await tokens.verify('x'.repeat(5000)),null);
 const wrong=generateKeyPairSync('ed25519');await assert.rejects(PassengerTokens.create(issuer,audience,kid,privatePem,wrong.publicKey.export({type:'spki',format:'pem'}).toString()));
});
test('mock never uses network; PhilSMS adapter fails closed, reports uncertainty and never retries/falls back',async()=>{
 let calls=0,captures=0;const message={recipient:'+639990000001',code:'000007',challengeId:randomUUID()};
 const mock=new MockSmsGateway('test',()=>captures++);assert.equal(await mock.send(message),'ACCEPTED');assert.equal(captures,1);assert.equal(calls,0);
 const config={liveEnabled:false,approvalReference:null as string|null,endpoint:'https://app.philsms.com/api/v3/sms/send',senderId:'TRISSEA',bearerToken:'synthetic-contract-only-token'};
 const transport:SmsTransport=async()=>{calls++;return {status:200,json:async()=>({status:'success'})};};
 await assert.rejects(new PhilSmsGateway(config,transport).send(message));assert.equal(calls,0);
 const approved={...config,liveEnabled:true,approvalReference:'SYNTHETIC-STUB-ONLY'};
 assert.equal(await new PhilSmsGateway(approved,transport).send(message),'ACCEPTED');assert.equal(calls,1);
 assert.equal(await new PhilSmsGateway(approved,async()=>({status:400,json:async()=>({})})).send(message),'REJECTED');
 assert.equal(await new PhilSmsGateway(approved,async()=>({status:503,json:async()=>({})})).send(message),'UNKNOWN');
 assert.equal(await new PhilSmsGateway(approved,async()=>{throw new Error('synthetic network failure');}).send(message),'UNKNOWN');
 await assert.rejects(new PhilSmsGateway(approved).send(message));assert.equal(calls,1);
});
