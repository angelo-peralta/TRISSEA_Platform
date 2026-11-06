import assert from 'node:assert/strict';
import { randomBytes,randomUUID,generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { before,after,test as nodeTest } from 'node:test';
import postgres from 'postgres';
import { runMigrations } from './migration-runner.mjs';
import { assertLocalDatabase,assertDisposableIdentityDatabase } from './migration-policy.mjs';
const req=createRequire(new URL('../services/api/package.json',import.meta.url));req('reflect-metadata');
const {Test}=req('@nestjs/testing'),{FastifyAdapter}=req('@nestjs/platform-fastify');
const load=name=>req(`./dist/src/auth/passenger/${name}.js`);
const {PassengerRuntime}=load('passenger-runtime'),{PassengerSettings,PassengerSecrets}=load('passenger-settings');
const {RedisOtpStore}=load('redis-otp'),{MockSmsGateway}=load('sms-gateway'),{PassengerTokens}=load('token-service');
const suffix=randomBytes(6).toString('hex'),database=`trissea_m2_test_${suffix}`;
const options={max:6,onnotice:()=>{},connect_timeout:3,connection:{timezone:'UTC',statement_timeout:15000,lock_timeout:5000}};
let control,owner,connection,runtime,app,otp,ownerUrl;
const fixture={};
const messages=new Map(),report={database,executedAt:new Date().toISOString(),syntheticOnly:true,checks:[]};
const note=message=>{report.checks.push(message);console.info(message);};
const test=(name,body)=>nodeTest(name,{timeout:30000},body);
let address=1,phoneCounter=1;
const client=()=>({clientPurpose:'DRIVER',deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')});
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
 await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO unrelated_preservation VALUES(1,'synthetic-driver-preservation')`;
});
after(async()=>{
 await app?.close();await otp?.close();await Promise.allSettled([connection?.end(),owner?.end(),control?.end()]);
 await mkdir(new URL('../.cache/m2-driver/',import.meta.url),{recursive:true});await writeFile(new URL('../.cache/m2-driver/results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
});

test('M2.4 migrations preserve prior ledger, synthetic user and unrelated data on failure/down/reapply',async()=>{
 await runMigrations(owner,'up',{through:'0004_passenger_auth',allowIdentity:true,report:()=>{}});
 fixture.ledger=await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`;
 await owner`INSERT INTO identity.app_users DEFAULT VALUES`;
 const failed={begin:callback=>owner.begin(async tx=>{await callback(tx);await tx`SELECT 1/0`;})};
 await assert.rejects(runMigrations(failed,'up',{through:'0005_driver_identity',allowIdentity:true,report:()=>{}}));assert.equal((await owner`SELECT to_regclass('identity.driver_profiles') AS t`)[0].t,null);
 await runMigrations(owner,'up',{through:'0005_driver_identity',allowIdentity:true,report:note});await runMigrations(owner,'up',{through:'0005_driver_identity',allowIdentity:true,report:note});await runMigrations(owner,'down',{through:'0005_driver_identity',allowIdentity:true,report:note});
 assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,fixture.ledger);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,1);assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-driver-preservation');
 await runMigrations(owner,'up',{through:'0005_driver_identity',allowIdentity:true,report:note});assert.equal((await owner`SELECT count(*)::int AS n FROM identity.driver_intake_scopes`)[0].n,0);
 note('0005 fresh/no-op/transaction failure/down/reapply preserves M1-M2.3 ledger, prior synthetic user and unrelated table; no intake or driver seeds');
});
test('all Drizzle columns, PK/unique/FK/check/index definitions match PostgreSQL', async () => {
  const {getTableConfig,PgDialect}=req('drizzle-orm/pg-core'),{is,SQL}=req('drizzle-orm');
  const tables=Object.values(req('./dist/src/database/driver-schema.js')).filter(x=>x && x[Symbol.for('drizzle:IsDrizzleTable')]);
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


test('real root Nest app accepts purpose-bound driver and passenger proofs using a non-owner database login',async()=>{
 const password=randomBytes(32).toString('hex'),login=`m2_driver_${suffix}`;
 await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_auth,trissea_m2_authorization`);
 const url=new URL(ownerUrl);url.username=login;url.password=password;connection=postgres(url.href,options);
 otp=new RedisOtpStore('redis://127.0.0.1:16380',`driver-test-${suffix}`);await otp.connect();assert.equal(await otp.client.ping(),'PONG');
 const keys=generateKeyPairSync('ed25519'),privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicPem=keys.publicKey.export({type:'spki',format:'pem'});
 const passenger=await PassengerTokens.create('http://127.0.0.1:4101/v1','trissea-passenger-local','driver-test',privatePem,publicPem),driver=await PassengerTokens.create('http://127.0.0.1:4101/v1','trissea-driver-local','driver-test',privatePem,publicPem,600,'DRIVER');
 runtime=new PassengerRuntime(connection,new PassengerSettings({NODE_ENV:'test'}),new PassengerSecrets('driver-test',...Array.from({length:5},()=>randomBytes(32))),otp,new MockSmsGateway('test',message=>messages.set(message.challengeId,message)),passenger,driver);
 process.env.M2_PASSENGER_AUTH_ENABLED='true';process.env.M2_DRIVER_AUTH_ENABLED='true';const {AppModule}=req('./dist/src/app.module.js');
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PassengerRuntime).useValue(runtime).compile();
 app=module.createNestApplication(new FastifyAdapter({logger:false,bodyLimit:16384,trustProxy:false}),{logger:false});app.setGlobalPrefix('v1');await app.init();await app.getHttpAdapter().getInstance().ready();
 await http('GET','/driver/me',undefined,null,401);note('Real AppModule + global authentication/policy guards, non-owner auth/resolver login and isolated Redis PONG');
});
async function consent(user){
 const profile=await http('GET','/driver/me',undefined,user.auth.accessToken);
 return http('POST','/driver/me/consents',{noticeVersion:profile.requiredNoticeVersion,termsVersion:profile.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true},user.auth.accessToken);
}
async function activeDriver(){const user=await login();await consent(user);return user;}
async function ageCooldown(p){
 const dest=runtime.secrets.identity.lookup(p,'otp-destination');
 await owner`UPDATE identity.otp_challenge_metadata SET created_at=created_at-interval '61 seconds',expires_at=expires_at-interval '61 seconds',resend_after=resend_after-interval '61 seconds' WHERE destination_digest=${dest}`;
 await otp.client.del(otp.key('cooldown',dest));
}
test('new driver authenticates, accepts separate consent and remains pending/offline with no personal documents',async()=>{
 const user=await login(),profile=await http('GET','/driver/me',undefined,user.auth.accessToken);
 assert.equal(user.auth.clientPurpose,'DRIVER');assert.equal(profile.state,'CONSENT_REQUIRED');assert.equal(profile.driverStatus,'PENDING');assert.equal(profile.canGoOnline,false);assert.equal(profile.realDocumentsEnabled,false);
 await http('GET','/driver/onboarding/options',undefined,user.auth.accessToken,403);assert.equal((await owner`SELECT count(*)::int AS n FROM identity.passenger_profiles WHERE user_id=${user.auth.userId}`)[0].n,0);
 const accepted=await consent(user);assert.equal(accepted.state,'ACTIVE');assert.equal(accepted.driverStatus,'PENDING');
 for(const path of ['/driver/shifts','/driver/locations'])await http('POST',path,{},user.auth.accessToken,403);
 await http('GET','/driver/offers',undefined,user.auth.accessToken,403);await http('PATCH','/driver/me',{state:'VERIFIED'},user.auth.accessToken,404);
 await http('POST','/driver/auth/logout',{},user.auth.accessToken,204);await http('GET','/driver/me',undefined,user.auth.accessToken,401);
 note('Driver mock OTP succeeds; required driver consent gates intake; profile stays PENDING; shifts/GPS/dispatch denied server-side; logout revokes');
});
test('verified global phone identity has separate personas, consent, OTP proof, token audiences and sessions',async()=>{
 const p=phone(),passengerClient={...client(),clientPurpose:'PASSENGER'},passengerChallenge=await challenge(passengerClient,p);
 await verify(passengerChallenge,401,randomUUID(),{clientPurpose:'DRIVER'});const pass=await verify(passengerChallenge);
 const pp=await http('GET','/me',undefined,pass.accessToken);await http('POST','/me/consents',{noticeVersion:pp.requiredNoticeVersion,termsVersion:pp.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true},pass.accessToken);
 await http('POST','/auth/phone/challenges',{...client(),phone:p},null,429);
 await ageCooldown(p);const driverChallenge=await challenge(client(),p);await verify(driverChallenge,401,randomUUID(),{clientPurpose:'PASSENGER'});const driver=await verify(driverChallenge);
 assert.equal(driver.userId,pass.userId);assert.notEqual(driver.sessionId,pass.sessionId);assert.equal((await http('GET','/driver/me',undefined,driver.accessToken)).state,'CONSENT_REQUIRED');
 await http('GET','/driver/me',undefined,pass.accessToken,403);await http('GET','/me',undefined,driver.accessToken,403);
 await http('GET','/driver/me',undefined,pass.accessToken,403,{'x-client-purpose':'DRIVER','x-city-tenant-id':randomUUID(),'x-admin':'true'});
 await http('POST','/auth/mobile/refresh',{...driverChallenge.c,refreshToken:pass.refreshToken},null,401);await http('GET','/me',undefined,pass.accessToken);
 await http('POST',`/driver/auth/sessions/${pass.sessionId}/revoke`,{},driver.accessToken,401);await http('GET','/me',undefined,pass.accessToken);
 const sessions=await http('GET','/driver/auth/sessions',undefined,driver.accessToken);assert.equal(sessions.sessions.length,1);assert.equal(sessions.sessions[0].id,driver.sessionId);
 await http('POST','/driver/auth/logout',{},driver.accessToken,204);await http('GET','/me',undefined,pass.accessToken);
 fixture.shared={pass,userId:pass.userId};note('One verified user; no cross-purpose OTP redemption, consent inheritance, token validation, refresh, profile access, session listing or revocation; driver logout leaves passenger session valid');
});
test('concurrent first passenger and driver verification converges without invalidating either purpose proof',async()=>{
 const p=phone(),passenger=await challenge({...client(),clientPurpose:'PASSENGER'},p);await ageCooldown(p);const driver=await challenge(client(),p);
 const [a,b]=await Promise.all([verify(passenger),verify(driver)]);assert.equal(a.userId,b.userId);assert.notEqual(a.sessionId,b.sessionId);assert.equal(a.clientPurpose,'PASSENGER');assert.equal(b.clientPurpose,'DRIVER');
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.auth_identities WHERE subject_digest=${runtime.secrets.identity.lookup(p,'PHONE_OTP')}`)[0].n,1);
 fixture.concurrent={pass:a,driver:b,userId:a.userId,driverClient:driver.c,passengerClient:passenger.c};
 note('Concurrent passenger/driver first verification uses independent active-proof keys but one global identity; shared destination cooldown cannot be bypassed by purpose');
});
test('only explicitly configured current city/TODA scopes and synthetic vehicles are offered',async()=>{
 const cities=await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('SYNTHETIC_CITY_A','Synthetic city A','ACTIVE'),('SYNTHETIC_CITY_B','Synthetic city B','ACTIVE') RETURNING id`;
 fixture.city=cities[0].id;fixture.otherCity=cities[1].id;
 const todas=await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${fixture.city},'SYN_A','Synthetic TODA A','VERIFIED'),(${fixture.city},'SYN_B','Synthetic TODA B','VERIFIED'),(${fixture.otherCity},'SYN_C','Synthetic TODA C','VERIFIED'),(${fixture.city},'SYN_PENDING','Synthetic pending TODA','PENDING') RETURNING id`;
 [fixture.todaA,fixture.todaB,fixture.todaC,fixture.pendingToda]=todas.map(row=>row.id);fixture.policy=randomUUID();
 for(const [city,toda] of [[fixture.city,fixture.todaA],[fixture.city,fixture.todaB],[fixture.otherCity,fixture.todaC],[fixture.city,fixture.pendingToda]])await owner`INSERT INTO identity.driver_intake_scopes(city_tenant_id,toda_id,state,policy_reference,city_label,toda_label) VALUES(${city},${toda},'OPEN',${fixture.policy},'SYNTHETIC_CITY','SYNTHETIC_TODA')`;
 const vehicles=await owner`INSERT INTO identity.driver_synthetic_vehicles(city_tenant_id,toda_id,reference_code) VALUES(${fixture.city},${fixture.todaA},'SYNTHETIC_VEHICLE_A'),(${fixture.city},${fixture.todaB},'SYNTHETIC_VEHICLE_B') RETURNING id`;fixture.vehicleA=vehicles[0].id;fixture.vehicleB=vehicles[1].id;
 fixture.driver=await activeDriver();const options=await http('GET','/driver/onboarding/options',undefined,fixture.driver.auth.accessToken);assert.equal(options.scopes.length,3);assert.equal(options.scopes.some(s=>s.todaId===fixture.pendingToda),false);
 const vehiclesResult=await http('GET',`/driver/cities/${fixture.city}/todas/${fixture.todaA}/synthetic-vehicles`,undefined,fixture.driver.auth.accessToken);assert.equal(vehiclesResult.vehicles[0].id,fixture.vehicleA);
 await http('POST','/driver/toda-affiliation-requests',{cityTenantId:fixture.otherCity,todaId:fixture.todaA},fixture.driver.auth.accessToken,403);
 note('Owner-only synthetic scope configuration; pending organizations omitted; caller cannot combine a TODA with another city');
});
test('pending affiliation/vehicle requests are durable, idempotent, concurrent and resource scoped',async()=>{
 const token=fixture.driver.auth.accessToken,body={cityTenantId:fixture.city,todaId:fixture.todaA},key=randomUUID();
 const requests=await Promise.all(Array.from({length:3},()=>http('POST','/driver/toda-affiliation-requests',body,token,200,{'idempotency-key':key})));assert.equal(new Set(requests.map(r=>r.id)).size,1);fixture.affiliation=requests[0].id;assert.equal(requests[0].state,'PENDING');
 await http('POST','/driver/toda-affiliation-requests',{...body,todaId:fixture.todaB},token,409,{'idempotency-key':key});await http('POST','/driver/toda-affiliation-requests',{...body,state:'VERIFIED'},token,400);
 await http('POST','/driver/vehicle-relationships',{affiliationId:fixture.affiliation,vehicleId:fixture.vehicleB},token,403);
 const vehicleBody={affiliationId:fixture.affiliation,vehicleId:fixture.vehicleA},vehicleKey=randomUUID();
 const relationships=await Promise.all(Array.from({length:3},()=>http('POST','/driver/vehicle-relationships',vehicleBody,token,200,{'idempotency-key':vehicleKey})));assert.equal(new Set(relationships.map(r=>r.id)).size,1);fixture.relationship=relationships[0].id;assert.equal(relationships[0].state,'PENDING');
 const other=await activeDriver();await http('POST','/driver/vehicle-relationships',vehicleBody,other.auth.accessToken,403);assert.equal((await http('GET','/driver/verification-status',undefined,other.auth.accessToken)).affiliations.length,0);
 const status=await http('GET','/driver/verification-status',undefined,token);assert.equal(status.affiliations.length,1);assert.equal(status.vehicleRelationships.length,1);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.city_memberships WHERE user_id=${fixture.driver.auth.userId}`)[0].n,0);assert.equal((await owner`SELECT count(*)::int AS n FROM identity.scoped_role_assignments`)[0].n,0);
 const eligibility=await http('GET',`/driver/cities/${fixture.city}/todas/${fixture.todaA}/eligibility`,undefined,token);assert.equal(eligibility.identityEligible,false);assert.equal(eligibility.canGoOnline,false);
 await http('GET',`/driver/cities/${fixture.otherCity}/todas/${fixture.todaA}/eligibility`,undefined,token,403);
 note('Concurrent/idempotent requests produce one pending affiliation and relationship; changed payload, foreign driver/city/TODA and self-approval fields denied; no city membership or staff grant created');
});
test('database constraints and least-privilege RLS prevent self approval and cross-scope writes',async()=>{
 const fails=(promise,code)=>assert.rejects(promise,e=>e.code===code||e.cause?.code===code);
 await fails(connection`UPDATE identity.driver_profiles SET state='VERIFIED'`,'42501');await fails(connection`INSERT INTO identity.driver_profiles(user_id,state) VALUES(${fixture.driver.auth.userId},'VERIFIED')`,'42501');
 await fails(connection`INSERT INTO identity.driver_intake_scopes(city_tenant_id,toda_id,policy_reference) VALUES(${fixture.city},${fixture.todaA},${randomUUID()})`,'42501');await fails(connection`INSERT INTO identity.driver_scope_assertions(user_id) VALUES(${fixture.driver.auth.userId})`,'42501');
 await fails(connection`SET ROLE trissea_m2_driver_lock`,'42501');await fails(connection`SELECT identity.lock_driver_context(${fixture.driver.auth.userId},${fixture.city},${fixture.todaA})`,'42501');
 const [fn]=await owner`SELECT p.prosecdef,p.proconfig,r.rolname,r.rolsuper,r.rolbypassrls,r.rolcanlogin FROM pg_proc p JOIN pg_roles r ON p.proowner=r.oid WHERE p.oid='identity.lock_driver_context(uuid,uuid,uuid)'::regprocedure`;
 assert.equal(fn.prosecdef,true);assert.equal(fn.rolname,'trissea_m2_driver_lock');assert.equal(fn.rolsuper,false);assert.equal(fn.rolbypassrls,false);assert.equal(fn.rolcanlogin,false);assert.equal(fn.proconfig.includes('search_path=pg_catalog, pg_temp'),true);
 await fails(owner`INSERT INTO identity.driver_toda_affiliations(user_id,city_tenant_id,toda_id) VALUES(${fixture.driver.auth.userId},${fixture.otherCity},${fixture.todaA})`,'23503');
 await fails(owner`UPDATE identity.driver_profiles SET state='VERIFIED',version=version+1 WHERE user_id=${fixture.driver.auth.userId}`,'23514');
 await fails(owner`UPDATE identity.driver_toda_affiliations SET toda_id=${fixture.todaB},version=version+1 WHERE id=${fixture.affiliation}`,'23514');
 const {sql}=req('drizzle-orm');for(const purpose of ['PASSENGER','DRIVER'])await runtime.database.transaction(async tx=>{await tx.execute(sql`SELECT set_config('trissea.user_id',${fixture.driver.auth.userId},true),set_config('trissea.client_purpose',${purpose},true)`);assert.equal((await tx.execute(sql`SELECT user_id FROM identity.driver_profiles`)).length,purpose==='DRIVER'?1:0);});
 assert.equal((await connection`SELECT user_id FROM identity.driver_profiles`).length,0);assert.equal((await connection`SELECT id FROM identity.driver_toda_affiliations`).length,0);
 note('Real column grants deny approval/config/assertion writes; composite FKs and immutable/versioned bindings enforced; purpose+owner RLS and pool cleanup passed');
});
async function makeVerified(){
 const uid=fixture.driver.auth.userId,until=new Date(Date.now()+3600_000),reference=randomUUID();
 const [profile]=await owner`UPDATE identity.driver_profiles SET state='VERIFIED',verification_reference=${reference},valid_until=${until},version=version+1 WHERE user_id=${uid} RETURNING version`;
 const [affiliation]=await owner`UPDATE identity.driver_toda_affiliations SET state='VERIFIED',verification_reference=${reference},valid_until=${until},version=version+1 WHERE id=${fixture.affiliation} RETURNING version`;
 const [vehicle]=await owner`UPDATE identity.driver_synthetic_vehicles SET state='VERIFIED',seat_capacity=1,verification_reference=${reference},valid_until=${until},version=version+1 WHERE id=${fixture.vehicleA} RETURNING version`;
 const [relationship]=await owner`UPDATE identity.driver_vehicle_relationships SET state='VERIFIED',verification_reference=${reference},valid_until=${until},version=version+1 WHERE id=${fixture.relationship} RETURNING version`;
 const [intake]=await owner`SELECT version,policy_reference FROM identity.driver_intake_scopes WHERE city_tenant_id=${fixture.city} AND toda_id=${fixture.todaA}`;
 await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${uid},${fixture.city},'ACTIVE') ON CONFLICT(user_id,city_tenant_id) DO UPDATE SET state='ACTIVE',version=identity.city_memberships.version+1`;
 await owner`INSERT INTO identity.driver_scope_assertions(user_id,city_tenant_id,toda_id,relationship_id,profile_version,affiliation_version,vehicle_version,relationship_version,intake_version,permit_reference,policy_reference,policy_version,effective_from,expires_at)
 VALUES(${uid},${fixture.city},${fixture.todaA},${fixture.relationship},${profile.version},${affiliation.version},${vehicle.version},${relationship.version},${intake.version},${reference},${intake.policy_reference},${intake.version},now()-interval '1 minute',${until})
 ON CONFLICT(user_id,city_tenant_id,toda_id) DO UPDATE SET profile_version=EXCLUDED.profile_version,affiliation_version=EXCLUDED.affiliation_version,vehicle_version=EXCLUDED.vehicle_version,relationship_version=EXCLUDED.relationship_version,intake_version=EXCLUDED.intake_version,policy_version=EXCLUDED.policy_version,permit_reference=EXCLUDED.permit_reference,policy_reference=EXCLUDED.policy_reference,effective_from=EXCLUDED.effective_from,expires_at=EXCLUDED.expires_at,revoked_at=NULL,version=identity.driver_scope_assertions.version+1`;
}
test('real database synthetic eligibility has positive and stale/expired/suspended/revoked negative cases; operations always denied',async()=>{
 const token=fixture.driver.auth.accessToken,path=`/driver/cities/${fixture.city}/todas/${fixture.todaA}/eligibility`;
 await makeVerified();let result=await http('GET',path,undefined,token);assert.equal(result.identityEligible,true);assert.equal(result.realDriverApproved,false);assert.equal(result.canGoOnline,false);
 const mutations=[
  ()=>owner`UPDATE identity.driver_profiles SET state='SUSPENDED',version=version+1 WHERE user_id=${fixture.driver.auth.userId}`,
  ()=>owner`UPDATE identity.driver_synthetic_vehicles SET valid_until=now()-interval '1 second',version=version+1 WHERE id=${fixture.vehicleA}`,
  ()=>owner`UPDATE identity.driver_toda_affiliations SET state='SUSPENDED',version=version+1 WHERE id=${fixture.affiliation}`,
  ()=>owner`UPDATE identity.driver_scope_assertions SET revoked_at=clock_timestamp(),version=version+1 WHERE user_id=${fixture.driver.auth.userId}`,
  ()=>owner`UPDATE identity.driver_scope_assertions SET expires_at=now()-interval '1 second',version=version+1 WHERE user_id=${fixture.driver.auth.userId}`,
  ()=>owner`UPDATE identity.driver_vehicle_relationships SET version=version+1 WHERE id=${fixture.relationship}`,
  ()=>owner`UPDATE identity.city_memberships SET state='SUSPENDED',version=version+1 WHERE user_id=${fixture.driver.auth.userId}`,
 ];
 for(const mutate of mutations){await mutate();result=await http('GET',path,undefined,token);assert.equal(result.identityEligible,false);assert.equal(result.canGoOnline,false);await makeVerified();assert.equal((await http('GET',path,undefined,token)).identityEligible,true);}
 for(const operation of ['/driver/shifts','/driver/locations'])await http('POST',operation,{},token,403);await http('GET','/driver/offers',undefined,token,403);
 note('Owner-provisioned synthetic facts produce identityEligible=true in real API; current suspension/expiry/revocation/stale versions/membership removal deny immediately; even positive fixtures cannot create shifts, GPS or dispatch');
});
test('eligibility read locks serialize a concurrent verification downgrade',async()=>{
 await makeVerified();const {AuthorizationService}=req('./dist/src/auth/policy/authorization.service.js'),service=app.get(AuthorizationService),uid=fixture.driver.auth.userId;
 let ready,release;const locked=new Promise(resolve=>{ready=resolve;}),held=new Promise(resolve=>{release=resolve;});
 const read=service.execute({authorization:`Bearer ${fixture.driver.auth.accessToken}`},'DRIVER_READ_SELF',uid,async context=>{const result=await runtime.driver.accounts.eligibility(context.tx,uid,fixture.city,fixture.todaA);assert.equal(result.identityEligible,true);ready();await held;return result;});
 await locked;let writing;
 try{
  writing=owner`UPDATE identity.driver_profiles SET state='SUSPENDED',version=version+1 WHERE user_id=${uid}`.then(()=>undefined);
  let waiting=false;const deadline=Date.now()+2000;
  while(Date.now()<deadline){waiting=Number((await owner`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=${database} AND wait_event_type='Lock' AND query LIKE 'UPDATE identity.driver_profiles SET state=%'`)[0].n)>0;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(waiting,true);
 }finally{release();await read;await writing;}
 assert.equal((await http('GET',`/driver/cities/${fixture.city}/todas/${fixture.todaA}/eligibility`,undefined,fixture.driver.auth.accessToken)).identityEligible,false);await makeVerified();
 note('Measured PostgreSQL lock wait: concurrent downgrade waits for authoritative eligibility read; subsequent API evaluation denies');
});
test('driver OTP lockout/concurrent verification and bound rotating refresh remain fail-closed',async()=>{
 const ch=await challenge(),wrong=ch.code==='000000'?'000001':'000000';for(let i=0;i<5;i++)await verify(ch,401,randomUUID(),{code:wrong});await verify(ch,401);
 const race=await challenge(),key=randomUUID();const [a,b]=await Promise.all([verify(race,200,key),verify(race,200,key)]);assert.equal(a.refreshToken===b.refreshToken,true);await verify(race,401);
 const user={...race,auth:a},rk=randomUUID();const [r1,r2]=await Promise.all([refresh(user,a.refreshToken,rk),refresh(user,a.refreshToken,rk)]);assert.equal(r1.refreshToken===r2.refreshToken,true);
 await refresh(user,a.refreshToken,randomUUID(),401);await http('GET','/driver/me',undefined,r1.accessToken,401);
 await owner`UPDATE identity.app_users SET state='RESTRICTED',version=version+1 WHERE id=${fixture.shared.userId}`;await http('GET','/me',undefined,fixture.shared.pass.accessToken,401);
 await owner`UPDATE identity.app_users SET state='RESTRICTED',version=version+1 WHERE id=${fixture.concurrent.userId}`;
 await http('GET','/me',undefined,fixture.concurrent.pass.accessToken,401);await http('GET','/driver/me',undefined,fixture.concurrent.driver.accessToken,401);
 await http('POST','/auth/mobile/refresh',{...fixture.concurrent.driverClient,refreshToken:fixture.concurrent.driver.refreshToken},null,401);
 note('Driver five-attempt lockout, one concurrent redemption/session, bound refresh race and stale reuse revocation; global restriction invalidates remaining passenger session');
});
test('all fifteen generated driver client contracts operate against actual API',async()=>{
 const {createDriverClient}=req('../../.cache/contract-tests/src/driver-client.js');
 const sdk=createDriverClient('http://127.0.0.1:4101/v1',async(url,init)=>{const response=await app.inject({method:init.method,url:new URL(url).pathname,headers:init.headers,payload:init.body,remoteAddress:ip()});return new Response(response.statusCode===204?null:response.body,{status:response.statusCode,headers:response.headers});});
 const c=client(),p=phone(),ch=await sdk.request('requestDriverOtp',{body:{...c,phone:p},idempotencyKey:randomUUID()});assert.equal((await sdk.request('getDriverChallengeStatus',{challengeId:ch.challengeId,deviceId:c.deviceId,clientProof:c.clientProof})).state,'PENDING');
 const auth=await sdk.request('verifyDriverOtp',{challengeId:ch.challengeId,body:{...c,phone:p,code:messages.get(ch.challengeId).code},idempotencyKey:randomUUID()}),accessToken=auth.accessToken;
 const me=await sdk.request('getDriverMe',{accessToken});await sdk.request('recordDriverConsent',{accessToken,idempotencyKey:randomUUID(),body:{noticeVersion:me.requiredNoticeVersion,termsVersion:me.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true}});
 assert.equal((await sdk.request('listDriverSessions',{accessToken})).sessions.length,1);await sdk.request('getDriverIntakeOptions',{accessToken});
 const scope={cityTenantId:fixture.city,todaId:fixture.todaA};await sdk.request('getDriverSyntheticVehicles',{accessToken,...scope});
 const affiliation=await sdk.request('requestDriverAffiliation',{accessToken,body:scope,idempotencyKey:randomUUID()});await sdk.request('requestDriverVehicle',{accessToken,body:{affiliationId:affiliation.id,vehicleId:fixture.vehicleA},idempotencyKey:randomUUID()});
 await sdk.request('getDriverVerificationStatus',{accessToken});assert.equal((await sdk.request('getDriverEligibility',{accessToken,...scope})).identityEligible,false);
 const rotated=await sdk.request('refreshDriverSession',{body:{...c,refreshToken:auth.refreshToken},idempotencyKey:randomUUID()});await sdk.request('revokeDriverSession',{accessToken:rotated.accessToken,sessionId:auth.sessionId,body:{},idempotencyKey:randomUUID()});
 const other=await activeDriver();await sdk.request('logoutDriver',{accessToken:other.auth.accessToken,body:{},idempotencyKey:randomUUID()});
 note('Generated driver transport exercises all 15 typed operations, automatic DRIVER status header, runtime response validation, synthetic intake and empty 204');
});
test('Redis and PostgreSQL transport loss cannot issue driver credentials or send SMS',async()=>{
 await otp.close();const count=messages.size;await http('POST','/auth/mobile/refresh',{...client(),refreshToken:randomBytes(48).toString('base64url')},null,503);assert.equal(messages.size,count);
 await connection.end();await http('POST','/auth/phone/challenges',{...client(),phone:phone()},null,503);assert.equal(messages.size,count);
 note('Closed Redis and PostgreSQL transports fail closed without mock SMS or token issuance');
});
test('populated driver rollback/reapply preserves prior auth records, audit, ledger and unrelated sentinel',async()=>{
 await app.close();app=undefined;
 const counts=await owner`SELECT (SELECT count(*) FROM identity.app_users)::int AS users,(SELECT count(*) FROM identity.app_sessions)::int AS sessions,(SELECT count(*) FROM identity.audit_events)::int AS audits,(SELECT count(*) FROM identity.refresh_credentials)::int AS refresh`;
 await runMigrations(owner,'down',{through:'0005_driver_identity',allowIdentity:true,report:note});assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,fixture.ledger);
 assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-driver-preservation');
 assert.deepEqual(await owner`SELECT (SELECT count(*) FROM identity.app_users)::int AS users,(SELECT count(*) FROM identity.app_sessions)::int AS sessions,(SELECT count(*) FROM identity.audit_events)::int AS audits,(SELECT count(*) FROM identity.refresh_credentials)::int AS refresh`,counts);
 await runMigrations(owner,'up',{through:'0005_driver_identity',allowIdentity:true,report:note});assert.equal((await owner`SELECT count(*)::int AS n FROM identity.driver_profiles`)[0].n,0);
 note('Disposable populated 0005 down/reapply preserves all earlier auth users/sessions/audit/refresh, M1-M2.3 ledger and unrelated data');
});
