import assert from 'node:assert/strict';
import { randomBytes,randomUUID,generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { before,after,test } from 'node:test';
import postgres from 'postgres';
import { runMigrations as runAllMigrations } from './migration-runner.mjs';
import { assertLocalDatabase,assertDisposableIdentityDatabase } from './migration-policy.mjs';
const runMigrations=(connection,command,options={})=>runAllMigrations(connection,command,{...options,through:options.through??'0004_passenger_auth'});
const req=createRequire(new URL('../services/api/package.json',import.meta.url));req('reflect-metadata');
const {Test}=req('@nestjs/testing'),{FastifyAdapter}=req('@nestjs/platform-fastify');
const load=name=>req(`./dist/src/auth/passenger/${name}.js`);
const {PassengerRuntime}=load('passenger-runtime'),{PassengerSettings,PassengerSecrets}=load('passenger-settings');
const {RedisOtpStore}=load('redis-otp'),{MockSmsGateway}=load('sms-gateway'),{PassengerTokens}=load('token-service');
const suffix=randomBytes(6).toString('hex'),database=`trissea_m2_test_${suffix}`;
const options={max:6,onnotice:()=>{},connect_timeout:3,connection:{timezone:'UTC',statement_timeout:15000,lock_timeout:5000}};
let control,owner,connection,runtime,app,otp,ownerUrl;
const messages=new Map(),report={database,executedAt:new Date().toISOString(),syntheticOnly:true,checks:[]};
const note=message=>{report.checks.push(message);console.info(message);};
let address=1,phoneCounter=1;
const client=()=>({clientPurpose:'PASSENGER',deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')});
const phone=()=>`+63999${String(phoneCounter++).padStart(7,'0')}`;
const ip=()=>`127.1.${Math.floor(address/250)}.${address++%250+1}`;
async function http(method,path,payload,token,expected=200,headers={}){
 const response=await app.inject({method,url:`/v1${path}`,remoteAddress:ip(),headers:{...(token?{authorization:`Bearer ${token}`}:{ }),'idempotency-key':randomUUID(),...headers},...(payload===undefined?{}:{payload})});
 assert.equal(response.statusCode,expected,`${method} ${path}: status ${response.statusCode}, expected ${expected}`);
 if(response.statusCode!==204)assert.equal(response.headers['cache-control'],'no-store');
 return response.statusCode===204?null:response.json();
}
async function challenge(c=client(),p=phone()){
 const body={...c,phone:p},idempotencyKey=randomUUID(),result=await http('POST','/auth/phone/challenges',body,null,202,{'idempotency-key':idempotencyKey});
 assert.equal(result.deliveryMode,'MOCK');assert.equal('code' in result,false);assert.equal(messages.has(result.challengeId),true);
 return {c,p,body,idempotencyKey,id:result.challengeId,code:messages.get(result.challengeId).code};
}
async function verify(ch,expected=200,key=randomUUID(),change={}){return http('POST',`/auth/phone/challenges/${ch.id}/verify`,{...ch.body,code:ch.code,...change},null,expected,{'idempotency-key':key});}
async function login(){const ch=await challenge();return {...ch,auth:await verify(ch)};}
const refresh=(login,token=login.auth.refreshToken,key=randomUUID(),expected=200,change={})=>http('POST','/auth/mobile/refresh',{...login.c,refreshToken:token,...change},null,expected,{'idempotency-key':key});
before(async()=>{
 const url=new URL(process.env.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,process.env.NODE_ENV);
 assert.equal(url.pathname,'/m2_control');assert.equal(process.env.M2_DISPOSABLE_DATABASE,'true');control=postgres(url.href,options);
 await control.unsafe(`CREATE DATABASE "${database}"`);url.pathname=`/${database}`;ownerUrl=url.href;
 assertDisposableIdentityDatabase(ownerUrl,process.env.NODE_ENV,process.env.M2_DISPOSABLE_DATABASE);owner=postgres(ownerUrl,options);
 await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
 await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO unrelated_preservation VALUES(1,'synthetic-passenger-preservation')`;
});
after(async()=>{
 await app?.close();await otp?.close();await Promise.allSettled([connection?.end(),owner?.end(),control?.end()]);
 await mkdir(new URL('../.cache/m2-passenger/',import.meta.url),{recursive:true});await writeFile(new URL('../.cache/m2-passenger/results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
});
test('incremental migration, transaction failure, repeat, rollback and preservation',async()=>{
 await runMigrations(owner,'up',{through:'0003_authorization',allowIdentity:true,report:()=>{}});
 const ledger=await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`;
 const failed={begin:callback=>owner.begin(async tx=>{await callback(tx);await tx`SELECT 1/0`;})};
 await assert.rejects(runMigrations(failed,'up',{allowIdentity:true,report:()=>{}}));
 assert.equal((await owner`SELECT to_regclass('identity.passenger_profiles') AS t`)[0].t,null);
 await runMigrations(owner,'up',{allowIdentity:true,report:note});await runMigrations(owner,'up',{allowIdentity:true,report:note});
 await runMigrations(owner,'down',{allowIdentity:true,report:note});
 assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,ledger);
 assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-passenger-preservation');
 await runMigrations(owner,'up',{allowIdentity:true,report:note});
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,0);
 note('Fresh/repeated/failed transaction/down/reapply preserve M1-M2.2 ledger and unrelated table; no seeded identities');
});
test('all Drizzle columns, PK/unique/FK/check/index definitions match PostgreSQL', async () => {
  const {getTableConfig,PgDialect}=req('drizzle-orm/pg-core'),{is,SQL}=req('drizzle-orm');
  const tables=Object.values(req('./dist/src/database/passenger-schema.js')).filter(x=>x && x[Symbol.for('drizzle:IsDrizzleTable')]);
  const dialect=new PgDialect();
  for(const table of tables) {
    const cfg=getTableConfig(table);
    const [security]=await owner`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=${`identity.${cfg.name}`}::regclass`;
    assert.equal(security.relrowsecurity,cfg.enableRLS,`${cfg.name} RLS flag`);
    if(cfg.enableRLS) assert.equal(security.relforcerowsecurity,true);
    const columns=await owner`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='identity' AND table_name=${cfg.name} ORDER BY ordinal_position`;
    assert.equal(columns.length,cfg.columns.length,cfg.name);
    for(const [index,col] of cfg.columns.entries()) {
      const actual=columns[index];
      assert.equal(actual.column_name,col.name); assert.equal(actual.data_type,col.getSQLType());
      assert.equal(actual.is_nullable,col.notNull?'NO':'YES');
      if(col.default!==undefined) {
        const expected=is(col.default,SQL)?dialect.sqlToQuery(col.default).sql:String(col.default);
        assert.ok(actual.column_default?.includes(expected),`${cfg.name}.${col.name} default`);
      } else assert.equal(actual.column_default,null);
    }
    const constraints=await owner`SELECT conname,contype,conkey,confkey,confrelid::regclass::text AS target,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=${`identity.${cfg.name}`}::regclass`;
    const columnIndexes=xs=>xs.map(c=>cfg.columns.findIndex(x=>x.name===c.name)+1);
    for(const pk of cfg.primaryKeys) assert.ok(constraints.some(c=>c.contype==='p'&&JSON.stringify(c.conkey)===JSON.stringify(columnIndexes(pk.columns))));
    for(const col of cfg.columns.filter(c=>c.primary)) assert.ok(constraints.some(c=>c.contype==='p'&&c.conkey[0]===cfg.columns.indexOf(col)+1));
    for(const u of cfg.uniqueConstraints) {
      const actual=constraints.find(c=>c.conname===u.getName().slice(0,63));
      assert.equal(actual?.contype,'u'); assert.deepEqual(actual.conkey,columnIndexes(u.columns));
      assert.equal(actual.definition.includes('NULLS NOT DISTINCT'),Boolean(u.nullsNotDistinct));
    }
    for(const col of cfg.columns.filter(c=>c.isUnique)) assert.ok(constraints.some(c=>c.contype==='u'&&c.conkey[0]===cfg.columns.indexOf(col)+1));
    for(const fk of cfg.foreignKeys) {
      const ref=fk.reference(), target=getTableConfig(ref.foreignTable);
      const actual=constraints.find(c=>c.conname===fk.getName().slice(0,63));
      assert.equal(actual?.contype,'f'); assert.deepEqual(actual.conkey,columnIndexes(ref.columns));
      assert.equal(actual.target,`identity.${target.name}`);
      assert.deepEqual(actual.confkey,ref.foreignColumns.map(c=>target.columns.findIndex(x=>x.name===c.name)+1));
    }
    // Ask PostgreSQL to normalize the independent Drizzle expressions, then compare
    // actual stored SQL. Merely comparing constraint names would miss weakened checks.
    await owner.unsafe(`CREATE TEMP TABLE schema_check_probe (LIKE identity."${cfg.name}")`);
    try {
      for(const ck of cfg.checks) {
        const expression=dialect.sqlToQuery(ck.value).sql.replaceAll(`"identity"."${cfg.name}".`,'');
        await owner.unsafe(`ALTER TABLE schema_check_probe ADD CONSTRAINT "${ck.name}" CHECK (${expression})`);
        const [expected]=await owner`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='schema_check_probe'::regclass AND conname=${ck.name}`;
        assert.equal(constraints.find(c=>c.contype==='c'&&c.conname===ck.name)?.definition,expected.definition,`${cfg.name}.${ck.name}`);
      }
    } finally { await owner`DROP TABLE schema_check_probe`; }
    const indexes=await owner`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='identity' AND tablename=${cfg.name}`;
    for(const idx of cfg.indexes) {
      const actual=indexes.find(i=>i.indexname===idx.config.name);
      assert.ok(actual); for(const col of idx.config.columns) assert.ok(actual.indexdef.includes(col.name));
    }
  }
  note(`Drizzle/PostgreSQL consistency: ${tables.length} tables, columns/defaults/nullability and all declared constraints/indexes`);
});

test('actual Nest/Fastify application uses non-owner auth role, Ed25519 and isolated Redis',async()=>{
 const password=randomBytes(32).toString('hex'),login=`m2_passenger_${suffix}`;
 await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_auth,trissea_m2_authorization`);
 await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);
 const url=new URL(ownerUrl);url.username=login;url.password=password;connection=postgres(url.href,options);
 otp=new RedisOtpStore('redis://127.0.0.1:16380',`passenger-test-${suffix}`);await otp.connect();assert.equal(await otp.client.ping(),'PONG');
 const keys=generateKeyPairSync('ed25519'),settings=new PassengerSettings({NODE_ENV:'test',SMS_PROVIDER:'mock',SMS_LIVE_ENABLED:'false'});
 const tokens=await PassengerTokens.create('http://127.0.0.1:4100/v1','trissea-passenger-local','synthetic-test',keys.privateKey.export({type:'pkcs8',format:'pem'}),keys.publicKey.export({type:'spki',format:'pem'}));
 runtime=new PassengerRuntime(connection,settings,new PassengerSecrets('synthetic-test',...Array.from({length:5},()=>randomBytes(32))),otp,new MockSmsGateway('test',message=>messages.set(message.challengeId,message)),tokens);
 process.env.M2_PASSENGER_AUTH_ENABLED='true';const {AppModule}=req('./dist/src/app.module.js');
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PassengerRuntime).useValue(runtime).compile();
 app=module.createNestApplication(new FastifyAdapter({logger:false,bodyLimit:16384,trustProxy:false}),{logger:false});app.setGlobalPrefix('v1');await app.init();await app.getHttpAdapter().getInstance().ready();
 assert.equal((await app.inject('/v1/health')).statusCode,200);await http('GET','/me',undefined,null,401);
 await assert.rejects(connection`UPDATE identity.role_permissions SET permission_code='driver.verify'`,error=>error.code==='42501');
 note('Real PostgreSQL non-owner login and Redis PONG; real AppModule global default-deny guard and registered passenger routes');
});
test('mock OTP authentication, consent, encrypted profile, sessions and logout',async()=>{
 const user=await login(),token=user.auth.accessToken;
 assert.equal((await runtime.tokens.verify(token)).userId,user.auth.userId);
 let profile=await http('GET','/me',undefined,token);assert.equal(profile.state,'CONSENT_REQUIRED');assert.equal(profile.operationsEnabled,false);
 await http('POST','/me/consents',{noticeVersion:'unapproved',termsVersion:'unapproved',noticeAcknowledged:true,termsAccepted:true},token,400);
 profile=await http('POST','/me/consents',{noticeVersion:profile.requiredNoticeVersion,termsVersion:profile.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true},token);
 assert.equal(profile.state,'ACTIVE');assert.equal(profile.environment,'LOCAL_SYNTHETIC');
 const update={displayName:'Synthetic Passenger',expectedVersion:profile.profileVersion},key=randomUUID();
 const results=await Promise.all([http('PATCH','/me',update,token,200,{'idempotency-key':key}),http('PATCH','/me',update,token,200,{'idempotency-key':key})]);
 assert.equal(results[0].profileVersion,2);assert.equal(results[1].profileVersion,2);
 await http('PATCH','/me',{...update,displayName:'Stale synthetic'},token,409);
 await http('PATCH','/me',{...update,role:'PLATFORM_ADMIN'},token,400);
 const stored=(await owner`SELECT display_name_ciphertext FROM identity.passenger_profiles WHERE user_id=${user.auth.userId}`)[0];assert.equal(stored.display_name_ciphertext.includes('Synthetic Passenger'),false);
 assert.equal((await http('GET','/auth/sessions',undefined,token)).sessions.filter(s=>s.current).length,1);
 await http('POST','/auth/logout',{},token,204);await http('GET','/me',undefined,token,401);await refresh(user,user.auth.refreshToken,randomUUID(),401);
 note('Positive mock OTP -> signed JWT -> own profile -> required synthetic consent -> encrypted/CAS/idempotent profile -> session list -> logout/revocation');
});
test('OTP attempts, expiry, binding, purpose and consumed receipt are fail-closed',async()=>{
 const ch=await challenge(),wrong=ch.code==='000000'?'000001':'000000';
 await verify(ch,400,randomUUID(),{clientPurpose:'DRIVER'});await verify(ch,401,randomUUID(),{clientProof:randomBytes(32).toString('base64url')});
 for(let i=0;i<5;i++)await verify(ch,401,randomUUID(),{code:wrong});await verify(ch,401);
 assert.equal((await otp.inspect(ch.id)).state,'LOCKED');
 assert.equal((await http('GET',`/auth/phone/challenges/${ch.id}`,undefined,null,200,{'x-device-id':ch.c.deviceId,'x-client-proof':ch.c.clientProof})).state,'EXPIRED');
 const expired=await challenge();await otp.client.pExpire(otp.key('challenge',expired.id),1);await new Promise(resolve=>setTimeout(resolve,20));await verify(expired,401);
 const concurrent=await challenge(),key=randomUUID();const [a,b]=await Promise.all([verify(concurrent,200,key),verify(concurrent,200,key)]);
 assert.equal(a.refreshToken===b.refreshToken,true);assert.equal(a.accessToken===b.accessToken,true);await verify(concurrent,401);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.otp_redemptions WHERE challenge_id=${concurrent.id}`)[0].n,1);
 assert.equal((await otp.inspect(concurrent.id)).hash,undefined);
 const status=await http('GET',`/auth/phone/challenges/${concurrent.id}`,undefined,null,200,{'x-device-id':concurrent.c.deviceId,'x-client-proof':concurrent.c.clientProof});assert.equal(status.state,'COMPLETED');
 note('Five invalid attempts lock; expired Redis proof denied; wrong purpose/proof denied; concurrent identical verification returns one session/redemption; changed retry denied');
});
test('idempotent send, cooldown, durable rate budget and Redis-loss safety',async()=>{
 const ch=await challenge(),sent=messages.size;
 const again=await http('POST','/auth/phone/challenges',ch.body,null,202,{'idempotency-key':ch.idempotencyKey});assert.equal(again.challengeId,ch.id);assert.equal(messages.size,sent);
 await http('POST','/auth/phone/challenges',{...ch.body,phone:phone()},null,409,{'idempotency-key':ch.idempotencyKey});
 await http('POST','/auth/phone/challenges',ch.body,null,429);
 await otp.client.del(otp.key('challenge',ch.id));await otp.client.del(otp.key('cooldown',runtime.secrets.identity.lookup(ch.p,'otp-destination')));
 await verify(ch,401);await http('POST','/auth/phone/challenges',ch.body,null,429);
 const dest=runtime.secrets.identity.lookup(ch.p,'otp-destination');
 // Controlled synthetic fixture timestamps simulate cooldown passage without lowering policy.
 for(let i=1;i<5;i++){
  await owner`UPDATE identity.otp_challenge_metadata SET created_at=created_at-interval '61 seconds',expires_at=expires_at-interval '61 seconds',resend_after=resend_after-interval '61 seconds' WHERE destination_digest=${dest}`;
  await otp.client.del(otp.key('cooldown',dest));await http('POST','/auth/phone/challenges',ch.body,null,202);
 }
 await owner`UPDATE identity.otp_challenge_metadata SET created_at=created_at-interval '61 seconds',expires_at=expires_at-interval '61 seconds',resend_after=resend_after-interval '61 seconds' WHERE destination_digest=${dest}`;
 await otp.client.del(otp.key('cooldown',dest));await http('POST','/auth/phone/challenges',ch.body,null,429);
 note('Same-key request sends once; payload conflict/cooldown/hourly destination limit enforced; Redis proof loss cannot authenticate or reset durable send budget');
});
test('verified identity converges across fresh challenges without duplicate account',async()=>{
 const ch=await challenge(),a=await verify(ch),dest=runtime.secrets.identity.lookup(ch.p,'otp-destination');
 await owner`UPDATE identity.otp_challenge_metadata SET created_at=created_at-interval '61 seconds',expires_at=expires_at-interval '61 seconds',resend_after=resend_after-interval '61 seconds' WHERE id=${ch.id}`;await otp.client.del(otp.key('cooldown',dest));
 const next=await challenge(client(),ch.p),b=await verify(next);assert.equal(a.userId,b.userId);assert.notEqual(a.sessionId,b.sessionId);
 const foreign=await login();await http('POST',`/auth/sessions/${foreign.auth.sessionId}/revoke`,{},a.accessToken,403);
 await http('POST',`/auth/sessions/${b.sessionId}/revoke`,{},a.accessToken,204);await http('GET','/me',undefined,b.accessToken,401);
 note('Verified phone maps to one global user with separate sessions; cross-account session access denied; own other-session revocation immediate');
});
test('refresh rotation races, bound retry, theft/reuse, expired receipt and account revocation',async()=>{
 const user=await login(),key=randomUUID();const [a,b]=await Promise.all([refresh(user,user.auth.refreshToken,key),refresh(user,user.auth.refreshToken,key)]);
 assert.equal(a.refreshToken===b.refreshToken,true);assert.equal(a.refreshToken!==user.auth.refreshToken,true);
 await refresh(user,a.refreshToken,randomUUID(),401,{clientProof:randomBytes(32).toString('base64url')});await http('GET','/me',undefined,a.accessToken);
 await refresh(user,user.auth.refreshToken,randomUUID(),401);await http('GET','/me',undefined,a.accessToken,401);
 const expired=await login(),rotated=await refresh(expired),expiryKey=randomUUID();
 await owner`UPDATE identity.auth_operation_results SET created_at=created_at-interval '31 seconds',expires_at=expires_at-interval '31 seconds' WHERE scope_id IN(SELECT id FROM identity.refresh_credentials WHERE session_id=${expired.auth.sessionId})`;
 await refresh(expired,expired.auth.refreshToken,expiryKey,401);await http('GET','/me',undefined,rotated.accessToken,401);
 const restricted=await login();await owner`UPDATE identity.app_users SET state='RESTRICTED',version=version+1 WHERE id=${restricted.auth.userId}`;
 await http('GET','/me',undefined,restricted.auth.accessToken,401);await refresh(restricted,restricted.auth.refreshToken,randomUUID(),401);
 note('Concurrent same-key refresh creates one successor; wrong client proof does not revoke; changed/expired old-token reuse revokes family; account restriction immediately denies JWT/refresh');
});
test('database failure after OTP consume permits only bounded original retry',async()=>{
 const ch=await challenge(),key=randomUUID(),complete=runtime.sessions.completeVerification.bind(runtime.sessions);let fail=true;
 runtime.sessions.completeVerification=async(...args)=>{if(fail){fail=false;throw new Error('simulated database unavailable after Redis consume');}return complete(...args);};
 try {await verify(ch,503,key);await verify(ch,401);await verify(ch,200,key);}finally{runtime.sessions.completeVerification=complete;}
 note('Injected post-consume DB outage yields 503; changed request cannot redeem receipt; original retry succeeds once after recovery');
});
test('generated typed client exercises all ten HTTP contracts without storing credentials',async()=>{
 const {createPassengerClient}=req('../../.cache/contract-tests/src/passenger-client.js');
 const fetcher=async(url,init)=>{const response=await app.inject({method:init.method,url:new URL(url).pathname,headers:init.headers,payload:init.body,remoteAddress:ip()});return new Response(response.statusCode===204?null:response.body,{status:response.statusCode,headers:response.headers});};
 const sdk=createPassengerClient('http://127.0.0.1:4100/v1',fetcher),c=client(),p=phone();
 const ch=await sdk.request('requestPassengerOtp',{body:{...c,phone:p},idempotencyKey:randomUUID()});
 assert.equal((await sdk.request('getPassengerChallengeStatus',{challengeId:ch.challengeId,deviceId:c.deviceId,clientProof:c.clientProof})).state,'PENDING');
 const auth=await sdk.request('verifyPassengerOtp',{challengeId:ch.challengeId,body:{...c,phone:p,code:messages.get(ch.challengeId).code},idempotencyKey:randomUUID()});
 const token=auth.accessToken,profile=await sdk.request('getMe',{accessToken:token});
 await sdk.request('recordPassengerConsent',{accessToken:token,idempotencyKey:randomUUID(),body:{noticeVersion:profile.requiredNoticeVersion,termsVersion:profile.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true}});
 await sdk.request('updatePassengerProfile',{accessToken:token,idempotencyKey:randomUUID(),body:{displayName:'Synthetic contract',expectedVersion:profile.profileVersion}});
 assert.equal((await sdk.request('listPassengerSessions',{accessToken:token})).sessions.length,1);
 const refreshed=await sdk.request('refreshPassengerSession',{body:{...c,refreshToken:auth.refreshToken},idempotencyKey:randomUUID()});
 await sdk.request('revokePassengerSession',{accessToken:refreshed.accessToken,sessionId:auth.sessionId,idempotencyKey:randomUUID(),body:{}});
 const other=await login();await sdk.request('logoutPassenger',{accessToken:other.auth.accessToken,idempotencyKey:randomUUID(),body:{}});
 note('Generated stateless typed client: all ten implemented operations exercised with runtime request/response schema validation, including empty 204');
});
test('sensitive response leakage, mixed credentials, blocked features',async()=>{
 const ch=await challenge();await http('POST','/auth/phone/challenges',ch.body,'untrusted',401);await http('POST','/auth/phone/challenges',ch.body,null,401,{cookie:'session=untrusted'});
 const malformed=await app.inject({method:'POST',url:'/v1/auth/phone/challenges',headers:{'content-type':'application/json'},payload:'{"clientProof":"synthetic-private-marker",BROKEN'});
 assert.equal(malformed.statusCode,400);assert.equal(malformed.body.includes('synthetic-private-marker'),false);
 const oversized=await app.inject({method:'POST',url:'/v1/auth/phone/challenges',headers:{'content-type':'application/json'},payload:JSON.stringify({phone:'x'.repeat(17000)})});assert.equal(oversized.statusCode,413);
 await http('POST','/auth/driver/login',{},null,404);await http('POST','/rides',{},null,404);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.audit_events a JOIN identity.outbox_events o ON o.audit_event_id=a.id`)[0].n>0,true);

 note('Malformed/oversize payloads bounded and sanitized; mixed credentials denied; driver/booking unavailable; audit/outbox present');
});
test('RLS context stays within transactions; plaintext credentials do not persist; verification IP limit is atomic',async()=>{
 const one=await login(),two=await login(),{sql}=req('drizzle-orm');
 for(const user of [one,two])await runtime.database.transaction(async tx=>{
  await tx.execute(sql`SELECT set_config('trissea.user_id',${user.auth.userId},true)`);
  const rows=await tx.execute(sql`SELECT user_id FROM identity.passenger_profiles`);assert.equal(rows.length,1);assert.equal(rows[0].user_id,user.auth.userId);
 });
 assert.equal((await connection`SELECT user_id FROM identity.passenger_profiles`).length,0);
 const dump=JSON.stringify(await owner`SELECT row_to_json(i)::text AS identity FROM identity.auth_identities i`);
 assert.equal(dump.includes(one.p),false);
 const persisted=JSON.stringify(await owner`SELECT row_to_json(r)::text AS row FROM identity.refresh_credentials r UNION ALL SELECT row_to_json(r)::text FROM identity.auth_operation_results r UNION ALL SELECT row_to_json(r)::text FROM identity.audit_events r UNION ALL SELECT row_to_json(r)::text FROM identity.outbox_events r`);
 for(const value of [one.auth.refreshToken,one.auth.accessToken,one.c.clientProof])assert.equal(persisted.includes(value),false);
 const ch=await challenge(),address=ip();
 const responses=await Promise.all(Array.from({length:32},()=>app.inject({method:'GET',url:`/v1/auth/phone/challenges/${ch.id}`,remoteAddress:address,headers:{'x-device-id':ch.c.deviceId,'x-client-proof':ch.c.clientProof}})));
 assert.equal(responses.filter(r=>r.statusCode===200).length,30);assert.equal(responses.filter(r=>r.statusCode===429).length,2);
 note('Forced profile RLS and pooled context cleanup; no raw phones/JWT/refresh/proof in persisted identity/session/audit/outbox rows; concurrent verification-IP limit 30/min');
});
test('concurrent sends and independent hourly/daily/device/IP/global limits retain configured bounds',async()=>{
 const c=client(),p=phone(),body={...c,phone:p},key=randomUUID();
 const same=await Promise.all(Array.from({length:4},()=>http('POST','/auth/phone/challenges',body,null,202,{'idempotency-key':key})));
 assert.equal(new Set(same.map(x=>x.challengeId)).size,1);
 const seed=async({p=phone(),device=randomUUID(),address=ip(),count=1,age=7200})=>{
  const dest=runtime.secrets.identity.lookup(p,'otp-destination'),deviceDigest=runtime.secrets.coordinate('device',device),ipDigest=runtime.secrets.coordinate('ip',address);
  for(let i=0;i<count;i++){
   const id=randomUUID(),hash=()=>randomBytes(32).toString('hex');
   await owner`INSERT INTO identity.otp_challenge_metadata(id,purpose,destination_digest,binding_digest,key_id,state,created_at,expires_at,resend_after)
    VALUES(${id},'PASSENGER',${dest},${hash()},${runtime.secrets.keyId},'EXPIRED',statement_timestamp()-(${age}*interval '1 second'),statement_timestamp()-(${age-300}*interval '1 second'),statement_timestamp()-(${age-60}*interval '1 second'))`;
   await owner`INSERT INTO identity.phone_request_bindings(challenge_id,request_key_digest,request_digest,ip_digest,device_digest,key_id,created_at) VALUES(${id},${hash()},${hash()},${ipDigest},${deviceDigest},${runtime.secrets.keyId},statement_timestamp()-(${age}*interval '1 second'))`;
  }
 };
 const daily=phone();await seed({p:daily,count:10});await http('POST','/auth/phone/challenges',{...client(),phone:daily},null,429);
 const dev=client();await seed({device:dev.deviceId,count:10,age:120});await http('POST','/auth/phone/challenges',{...dev,phone:phone()},null,429);
 const devDay=client();await seed({device:devDay.deviceId,count:20});await http('POST','/auth/phone/challenges',{...devDay,phone:phone()},null,429);
 const source=ip();await seed({address:source,count:20,age:120});const limited=await app.inject({method:'POST',url:'/v1/auth/phone/challenges',remoteAddress:source,headers:{'idempotency-key':randomUUID()},payload:{...client(),phone:phone()}});assert.equal(limited.statusCode,429);
 const current=(await owner`SELECT count(*)::int AS n FROM identity.phone_request_bindings`)[0].n;await seed({count:Math.max(0,100-current)});
 await http('POST','/auth/phone/challenges',{...client(),phone:phone()},null,429);
 note('Concurrent request idempotency; destination 10/day, device 10/hour and 20/day, IP 20/hour and global 100/day durable limits enforced using synthetic aged fixtures');
});

test('Redis outage denies authentication without a mock send',async()=>{await otp.close();const before=messages.size;await http('POST','/auth/mobile/refresh',{...client(),refreshToken:randomBytes(48).toString('base64url')},null,503);assert.equal(messages.size,before);note('Closed Redis transport: 503, no credential issuance or SMS');});

test('closed PostgreSQL transport denies a new challenge without SMS or account creation',async()=>{await connection.end();const before=messages.size;await http('POST','/auth/phone/challenges',{...client(),phone:phone()},null,503);assert.equal(messages.size,before);note('Closed PostgreSQL transport: new challenge 503, no mock delivery');});
