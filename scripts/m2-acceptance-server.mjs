import configuration from './environment.cjs';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertLocalDatabase,assertDisposableIdentityDatabase} from './migration-policy.mjs';
import {bootstrapClient} from './provision-keycloak-local.mjs';
import {Secret} from 'otpauth';

// Test-only process. No CLI credential output, HTTP fixture/code endpoint, live
// provider or reusable default administrator. The parent alone owns the IPC pipe.
if(!process.send||process.env.NODE_ENV!=='test')throw new Error('An isolated test parent is required');
const req=createRequire(new URL('../services/api/package.json',import.meta.url));req('reflect-metadata');
const options={max:5,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC',statement_timeout:15000,lock_timeout:5000}};
const syntheticPhone=phone=>typeof phone==='string'&&/^\+63998000\d{4}$/.test(phone);
let app,control,owner,mobile,admin,providerApi,authority,city,todaA,todaB;
let stage='configuration';
const connections=[],messages=new Map(),fixtureUsers=new Set(),staffUsers=new Set();
const respond=value=>{if(process.connected)process.send(value,()=>{});};
async function setup(){
 const env=configuration.environmentFor('test'),kc=configuration.loadLocal(),url=new URL(env.M2_TEST_CONTROL_URL);
 assertLocalDatabase(url.href,env.NODE_ENV);if(url.pathname!=='/m2_control'||env.M2_DISPOSABLE_DATABASE!=='true')throw new Error();
 const suffix=randomBytes(6).toString('hex'),database='trissea_m2_test_'+suffix;
 stage='disposable database';control=postgres(url.href,{...options,connection:{...options.connection,statement_timeout:60000}});await control.unsafe(`CREATE DATABASE "${database}"`);url.pathname='/'+database;assertDisposableIdentityDatabase(url.href,env.NODE_ENV,env.M2_DISPOSABLE_DATABASE);owner=postgres(url.href,options);
 await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
 await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO unrelated_preservation VALUES(1,'synthetic-m2-7-preservation')`;
 stage='migrations';await runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:()=>{}});
 const urls={};for(const [name,groups]of [['mobile','trissea_m2_auth,trissea_m2_authorization'],['admin','trissea_m2_admin_auth,trissea_m2_authorization'],['verification','trissea_m2_verification,trissea_m2_authorization']]){
  const login='m2_accept_'+name+'_'+suffix,password=randomBytes(32).toString('hex');await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE ${groups}`);await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);const u=new URL(url);u.username=login;u.password=password;urls[name]=u.href;
 }
 const connection=name=>{const c=postgres(urls[name],options);connections.push(c);return c;};
 stage='mobile runtime';const {PassengerRuntime}=req('./dist/src/auth/passenger/passenger-runtime.js'),{PassengerSecrets,PassengerSettings}=req('./dist/src/auth/passenger/passenger-settings.js'),{PassengerTokens}=req('./dist/src/auth/passenger/token-service.js'),{RedisOtpStore}=req('./dist/src/auth/passenger/redis-otp.js'),{MockSmsGateway}=req('./dist/src/auth/passenger/sms-gateway.js');
 const keys=id=>new PassengerSecrets(id,...Array.from({length:5},()=>randomBytes(32))),pair=generateKeyPairSync('ed25519'),privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'}),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
 const passengerTokens=await PassengerTokens.create('http://127.0.0.1:4104/v1','m2-accept-passenger','m2-accept',privateKey,publicKey),driverTokens=await PassengerTokens.create('http://127.0.0.1:4104/v1','m2-accept-driver','m2-accept',privateKey,publicKey,600,'DRIVER');
 const otp=new RedisOtpStore(env.DEV_REDIS_URL,'acceptance-'+suffix);await otp.connect();if(await otp.client.ping()!=='PONG')throw new Error();
 mobile=new PassengerRuntime(connection('mobile'),new PassengerSettings({NODE_ENV:'test'}),keys('m2-accept-mobile'),otp,new MockSmsGateway('test',message=>{if(!syntheticPhone(message.recipient))throw new Error('Only explicit synthetic destinations are accepted');messages.set(message.challengeId,message);respond({type:'mockSms',message});}),passengerTokens,driverTokens);
 stage='Keycloak discovery';const {AdminRuntime}=req('./dist/src/auth/admin/admin-runtime.js'),{AdminSettings}=req('./dist/src/auth/admin/admin-settings.js'),{KeycloakProvider}=req('./dist/src/auth/admin/keycloak-provider.js'),settings=new AdminSettings({...kc,NODE_ENV:'test'}),provider=new KeycloakProvider(settings);await provider.initialize();admin=new AdminRuntime(connection('admin'),settings,keys('m2-accept-admin'),provider);
 Object.assign(process.env,kc,{NODE_ENV:'test',M2_PASSENGER_AUTH_ENABLED:'true',M2_DRIVER_AUTH_ENABLED:'true',M2_ADMIN_AUTH_ENABLED:'true',M2_VERIFICATION_ENABLED:'true',M2_PASSENGER_DATABASE_URL:urls.mobile,ADMIN_DATABASE_URL:urls.admin,M2_VERIFICATION_DATABASE_URL:urls.verification});
 stage='combined API';const {Test}=req('@nestjs/testing'),{FastifyAdapter}=req('@nestjs/platform-fastify'),{AppModule}=req('./dist/src/app.module.js');
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PassengerRuntime).useValue(mobile).overrideProvider(AdminRuntime).useValue(admin).compile();app=module.createNestApplication(new FastifyAdapter({logger:false,bodyLimit:16384,trustProxy:false}),{logger:false});app.setGlobalPrefix('v1');await app.init();await app.listen(4104,'127.0.0.1');
 authority=(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id;
 city=(await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('SYNTHETIC_ACCEPT','Synthetic acceptance city','ACTIVE') RETURNING id`)[0].id;
 const todas=await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${city},'A','Synthetic A','VERIFIED'),(${city},'B','Synthetic B','VERIFIED') RETURNING id,code`;todaA=todas.find(t=>t.code==='A').id;todaB=todas.find(t=>t.code==='B').id;
 for(const toda of [todaA,todaB])await owner`INSERT INTO identity.driver_intake_scopes(city_tenant_id,toda_id,state,policy_reference,city_label,toda_label) VALUES(${city},${toda},'OPEN',${randomUUID()},'SYNTHETIC_CITY','SYNTHETIC_TODA')`;
 stage='synthetic provider fixtures';providerApi=await bootstrapClient(kc);respond({type:'ready',database,city,todaA,todaB,redis:'PONG'});
}
async function rpc(action,input={}){
 const id=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
 if(action==='registerFixtureUser'){if(!id(input.userId)||(await owner`SELECT id FROM identity.app_users WHERE id=${input.userId} AND id<>${authority}`).length!==1)throw new Error();fixtureUsers.add(input.userId);return true;}
 if(action==='staff'){
  if(!['VERIFICATION_OFFICER','TODA_MANAGER','SUPPORT_AGENT'].includes(input.role)||![todaA,todaB].includes(input.todaId))throw new Error();
  const username='synthetic-accept-'+randomUUID(),password=randomBytes(24).toString('base64url')+'!Aa1',secret=new Secret({size:20});
  await providerApi('/users','POST',{username,email:username+'@example.invalid',emailVerified:true,enabled:true,firstName:'Synthetic',lastName:'Acceptance',credentials:[{type:'password',value:password,temporary:false},{type:'otp',temporary:false,secretData:JSON.stringify({value:secret.base32}),credentialData:JSON.stringify({subType:'totp',digits:6,counter:0,period:30,algorithm:'HmacSHA1',secretEncoding:'BASE32'})}]});
  const [person]=await providerApi('/users?username='+encodeURIComponent(username)+'&exact=true'),user=(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id;
  const [identity]=await owner`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at) VALUES(${user},'KEYCLOAK',${admin.settings.issuer},${admin.secrets.identity.lookup(person.id,'KEYCLOAK')},${admin.secrets.keyId},${admin.secrets.identity.encrypt(person.id,'KEYCLOAK')},now()) RETURNING id`;
  await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state) VALUES(${identity.id},${user},${authority},${randomUUID()},'APPROVED')`;
  await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${user},${city},'ACTIVE')`;const [grant]=await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,expires_at) VALUES(${user},${city},${input.todaId},${input.role},'TODA',${authority},now()+interval '1 hour') RETURNING id`;staffUsers.add(user);
  return {userId:user,grantId:grant.id,username,password,totpSecret:secret.base32};
 }
 if(action==='vehicle'){if(![todaA,todaB].includes(input.todaId))throw new Error();return (await owner`INSERT INTO identity.driver_synthetic_vehicles(city_tenant_id,toda_id,reference_code) VALUES(${city},${input.todaId},${'SYNTHETIC_'+randomBytes(6).toString('hex').toUpperCase()}) RETURNING id`)[0];}
 if(action==='evidence'){
  if(!fixtureUsers.has(input.userId)||!id(input.relationshipId)||!['DRIVER','VEHICLE','TODA_MEMBERSHIP'].includes(input.kind))throw new Error();const [r]=await owner`SELECT * FROM identity.driver_vehicle_relationships WHERE id=${input.relationshipId} AND user_id=${input.userId}`;if(!r)throw new Error();
  const e=randomUUID();await owner.begin(async tx=>{await tx`INSERT INTO identity.verification_evidence_heads(id,user_id,city_tenant_id,toda_id,relationship_id,kind,current_version) VALUES(${e},${r.user_id},${r.city_tenant_id},${r.toda_id},${r.id},${input.kind},1)`;await tx`INSERT INTO identity.verification_evidence_versions(evidence_id,evidence_version,digest,reference_code,seat_capacity,valid_until) VALUES(${e},1,${randomBytes(32).toString('hex')},'SYNTHETIC_ACCEPTANCE',${input.kind==='VEHICLE'?2:null},now()+interval '1 hour')`;});return {evidenceId:e,evidenceVersion:1};
 }
 if(action==='assign'){
  if(!id(input.caseId)||!staffUsers.has(input.reviewerUserId))throw new Error();const [c]=await owner`SELECT * FROM identity.verification_cases WHERE id=${input.caseId}`;if(!c||!fixtureUsers.has(c.user_id))throw new Error();const next=(c.assignment_version??0)+1;
  await owner.begin(async tx=>{await tx`INSERT INTO identity.verification_assignments(case_id,assignment_version,user_id,city_tenant_id,toda_id,relationship_id,kind,reviewer_user_id,assigned_by) VALUES(${c.id},${next},${c.user_id},${c.city_tenant_id},${c.toda_id},${c.relationship_id},${c.kind},${input.reviewerUserId},${authority})`;await tx`UPDATE identity.verification_cases SET assignment_version=${next},version=version+1 WHERE id=${c.id}`;});return true;
 }
 if(action==='nativeSession'){
  if(!id(input.challengeId)||!messages.has(input.challengeId))throw new Error();
  const [s]=await owner`SELECT s.user_id AS "userId",s.id AS "sessionId",s.client_purpose AS purpose,s.state,(SELECT count(*)::int FROM identity.refresh_credentials r WHERE r.session_id=s.id) AS "refreshGenerations" FROM identity.otp_redemptions o JOIN identity.app_sessions s ON s.id=o.session_id WHERE o.challenge_id=${input.challengeId}`;
  if(!s)throw new Error();fixtureUsers.add(s.userId);return s;
 }
 if(action==='nativeChallengeExpiry'){if(!id(input.challengeId)||!messages.has(input.challengeId))throw new Error();const [c]=await owner`SELECT expires_at AS "expiresAt" FROM identity.otp_challenge_metadata WHERE id=${input.challengeId}`;if(!c)throw new Error();return c;}
 if(action==='restrict'){if(!fixtureUsers.has(input.userId))throw new Error();await owner`UPDATE identity.app_users SET state='RESTRICTED',version=version+1 WHERE id=${input.userId}`;return true;}
 if(action==='revokeSession'){if(!fixtureUsers.has(input.userId)||!id(input.sessionId))throw new Error();await owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now(),version=version+1 WHERE id=${input.sessionId} AND user_id=${input.userId}`;return true;}
 if(action==='expireSession'){if(!fixtureUsers.has(input.userId)||!id(input.sessionId))throw new Error();await owner`UPDATE identity.app_sessions SET expires_at=authenticated_at+interval '1 millisecond',version=version+1 WHERE id=${input.sessionId} AND user_id=${input.userId}`;return true;}
 if(action==='revokeStaffGrant'){if(!staffUsers.has(input.userId)||!id(input.grantId))throw new Error();await owner`UPDATE identity.scoped_role_assignments SET revoked_at=now() WHERE id=${input.grantId} AND user_id=${input.userId}`;return true;}
 if(action==='decisionCounts'){if(!id(input.caseId))throw new Error();const [c]=await owner`SELECT user_id FROM identity.verification_cases WHERE id=${input.caseId}`;if(!c||!fixtureUsers.has(c.user_id))throw new Error();const [counts]=await owner`SELECT (SELECT count(*)::int FROM identity.verification_decisions WHERE case_id=${input.caseId}) AS decisions,(SELECT count(*)::int FROM identity.audit_events WHERE resource_id=${input.caseId} AND action='verification.approved') AS approvals,(SELECT count(*)::int FROM identity.outbox_events WHERE aggregate_id=${input.caseId} AND event_type='verification.approved') AS outbox`;return counts;}
 if(action==='redisDown'){await mobile.otp.close();return true;}
 if(action==='redisUp'){await mobile.otp.connect();return true;}
 // Removing an ADB reverse listener alone leaves pooled HTTP connections alive.
 // This private IPC action closes only this disposable test server's clients.
 if(action==='disconnectHttpClients'){app.getHttpServer().closeAllConnections();return true;}
 if(action==='preservation'){return {sentinel:(await owner`SELECT value FROM unrelated_preservation WHERE id=1`)[0].value,migrations:(await owner`SELECT id FROM trissea_migrations ORDER BY id`).map(r=>r.id)};}
 if(action==='shutdown'){setTimeout(()=>{void close().finally(()=>process.disconnect());},25);return true;}
 throw new Error('Unknown isolated fixture action');
}
let chain=Promise.resolve();process.on('message',m=>{chain=chain.then(async()=>{if(!m||typeof m!=='object'||typeof m.id!=='string'||typeof m.action!=='string')return;try{respond({type:'rpc',id:m.id,value:await rpc(m.action,m.input)});}catch{respond({type:'rpc',id:m.id,error:'Isolated synthetic fixture operation failed'});}});});
let closing;function close(){return closing??= (async()=>{await app?.close();await mobile?.otp.close();await Promise.allSettled([...connections.map(c=>c.end()),owner?.end(),control?.end()]);})();}
process.on('disconnect',()=>{void close().finally(()=>process.exit());});
setup().catch(async error=>{respond({type:'failed',stage,code:typeof error.code==='string'&&/^[A-Z0-9_]{2,24}$/.test(error.code)?error.code:'REDACTED'});await close();process.exitCode=1;process.disconnect();});
