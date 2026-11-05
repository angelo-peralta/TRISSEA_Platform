import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { before,after,test as nodeTest } from 'node:test';
import postgres from 'postgres';
import { runMigrations } from './migration-runner.mjs';
import { assertLocalDatabase,assertDisposableIdentityDatabase } from './migration-policy.mjs';

const req=createRequire(new URL('../services/api/package.json',import.meta.url));
req('reflect-metadata');
const {sql}=req('drizzle-orm');
const {Controller,Get,Req,UseInterceptors}=req('@nestjs/common');
const {Test}=req('@nestjs/testing');
const {FastifyAdapter}=req('@nestjs/platform-fastify');
const {AuthorizationService,SessionProofVerifier,DenySessionProofVerifier}=req('./dist/src/auth/policy/authorization.service.js');
const {AuthorizationDatabase,PostgresAuthorizationDatabase,AuthorizationResources}=req('./dist/src/auth/policy/authorization-database.js');
const {AuthorizationModule}=req('./dist/src/auth/policy/authorization.module.js');
const {ProtectedPolicy,AuthorizationInterceptor,authorizedRequestContext}=req('./dist/src/auth/policy/authorization.interceptor.js');
const {IdentityCrypto}=req('./dist/src/database/identity-crypto.js');
const suffix=randomBytes(6).toString('hex'), database=`trissea_m2_test_${suffix}`;
const options={max:1,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC',statement_timeout:15000,lock_timeout:5000}};
const crypto=new IdentityCrypto('policy-test',randomBytes(32),randomBytes(32));
const proofs=new Map(), removedFactors=new Set();
const report={database,executedAt:new Date().toISOString(),syntheticOnly:true,checkpoints:[]};
const note=message=>{report.checkpoints.push(message);console.info(message);};
let control,owner,runtime,runtimeUrl,ownerUrl,app,service;
const fixture={};
const dbError=(promise,code)=>assert.rejects(promise,error=>error.code===code||error.cause?.code===code);
const denied=(promise,status=403)=>assert.rejects(promise,error=>error.getStatus?.()===status);
const credentials=subject=>({authorization:`Bearer ${subject.token}`});
const work=async context=>({resourceId:context.resource.id,userId:context.userId});
const test=(name,body)=>nodeTest(name,{timeout:30_000},body);

class FixtureVerifier extends SessionProofVerifier {
  async verify(input) {
    if(input.authorization==='Bearer failing-proof-adapter')throw new Error('private-provider-error');
    const value=proofs.get(input.authorization?.replace(/^Bearer /,''));
    if(!value)return null;
    const copy={...value};
    if(value.adminMfa)copy.adminMfa={...value.adminMfa,currentUntil:Math.min(Date.now()+30_000,value.expiresAt)};
    if(removedFactors.has(value.identityId))delete copy.adminMfa;
    return copy;
  }
}
class FixtureResources extends AuthorizationResources {
  async load(tx,kind,id) {
    if(['ACCOUNT','SESSION','TODA'].includes(kind))return super.load(tx,kind,id);
    const [row]=await tx.execute(sql`SELECT id,kind,version,city_tenant_id,toda_id,owner_user_id,maker_user_id,assigned_user_id
      FROM policy_test_resources WHERE id=${id}::uuid AND kind=${kind} FOR SHARE`);
    return row?{id:row.id,kind:row.kind,version:row.version,cityTenantId:row.city_tenant_id,todaId:row.toda_id,
      ownerUserId:row.owner_user_id,makerUserId:row.maker_user_id,assignedUserId:row.assigned_user_id}:null;
  }
}
const verifier=new FixtureVerifier(), resources=new FixtureResources();
class ProbeController {
  async own(request){return work(authorizedRequestContext(request));}
  async toda(request){return work(authorizedRequestContext(request));}
  async missing(){return {unexpected:true};}
}
Controller('policy-probe')(ProbeController);
for(const [method,path,action] of [['own','accounts/:id','ACCOUNT_READ_SELF'],['toda','todas/:id','TODA_MEMBERS_MANAGE']]) {
  const descriptor=Object.getOwnPropertyDescriptor(ProbeController.prototype,method);
  Get(path)(ProbeController.prototype,method,descriptor);
  Req()(ProbeController.prototype,method,0);
  ProtectedPolicy(action,'id')(ProbeController.prototype,method,descriptor);
}
const missing=Object.getOwnPropertyDescriptor(ProbeController.prototype,'missing');
Get('missing/:id')(ProbeController.prototype,'missing',missing);
UseInterceptors(AuthorizationInterceptor)(ProbeController.prototype,'missing',missing);

before(async()=>{
  const url=new URL(process.env.M2_TEST_CONTROL_URL);
  assertLocalDatabase(url.href,process.env.NODE_ENV);assert.equal(url.pathname,'/m2_control');assert.equal(url.search,'');
  assert.equal(process.env.M2_DISPOSABLE_DATABASE,'true');
  control=postgres(url.href,options);
  await control.unsafe(`CREATE DATABASE "${database}"`);
  url.pathname=`/${database}`;ownerUrl=url.href;
  assertDisposableIdentityDatabase(ownerUrl,process.env.NODE_ENV,process.env.M2_DISPOSABLE_DATABASE);
  owner=postgres(ownerUrl,options);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;
  await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
  await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;
  await owner`INSERT INTO unrelated_preservation VALUES(1,'synthetic-policy-preservation')`;
});
after(async()=>{
  await app?.close();
  await Promise.allSettled([runtime?.end(),owner?.end(),control?.end()]);
  await mkdir(new URL('../.cache/m2-authorization/',import.meta.url),{recursive:true});
  await writeFile(new URL('../.cache/m2-authorization/database-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
});

test('authorization migration is incremental, transactional, repeatable and seeds no users/grants',async()=>{
  await runMigrations(owner,'up',{through:'0002_identity_foundation',allowIdentity:true,report:note});
  fixture.previousLedger=await owner`SELECT id,checksum,applied_at::text AS applied_at FROM trissea_migrations ORDER BY id`;
  const failBeforeCommit={begin:callback=>owner.begin(async tx=>{await callback(tx);await tx`SELECT 1/0`;})};
  await assert.rejects(runMigrations(failBeforeCommit,'up',{allowIdentity:true,report:()=>{}}),error=>error.code==='22012');
  assert.equal((await owner`SELECT to_regprocedure('identity.lock_authorization_context(uuid,uuid,uuid,uuid,text)') AS f`)[0].f,null);
  await runMigrations(owner,'up',{allowIdentity:true,report:note});await runMigrations(owner,'up',{allowIdentity:true,report:note});
  assert.equal((await owner`SELECT count(*)::int AS n FROM trissea_migrations`)[0].n,3);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.role_permissions`)[0].n,11);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,0);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.scoped_role_assignments`)[0].n,0);
  assert.deepEqual(await owner`SELECT id,checksum,applied_at::text AS applied_at FROM trissea_migrations WHERE id<>'0003_authorization' ORDER BY id`,fixture.previousLedger);
  note('M2.2 apply/no-op/failed-commit rollback; M1/M2.1 ledger retained; catalog edges only, no accounts or grants');
});

async function makeSubject(purpose='ADMIN',change={}) {
  const subject=randomUUID(), kind=purpose==='ADMIN'?'KEYCLOAK':'PHONE_OTP';
  const [u]=await owner`INSERT INTO identity.app_users(state) VALUES(${change.userState??'ACTIVE'}) RETURNING id`;
  const [i]=await owner`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at)
    VALUES(${u.id},${kind},${purpose==='ADMIN'?'https://keycloak.invalid/realms/synthetic-policy':'trissea:phone'},${crypto.lookup(subject,kind)},${crypto.keyId},${crypto.encrypt(subject,kind)},now()) RETURNING id`;
  if(purpose==='ADMIN')await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state)
    VALUES(${i.id},${u.id},${fixture.authority},${randomUUID()},'APPROVED')`;
  else await owner`INSERT INTO identity.user_personas(user_id,purpose,state) VALUES(${u.id},${purpose},${change.personaState??'ACTIVE'})`;
  const [s]=await owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,mfa_verified_at,last_seen_at,expires_at)
    VALUES(${u.id},${i.id},${kind},${purpose},${change.sessionState??'ACTIVE'},1,now()-(${change.authAgeSeconds??0}*interval '1 second'),
    CASE WHEN ${purpose==='ADMIN' && change.withMfa!==false} THEN now()-(${change.mfaAgeSeconds??change.authAgeSeconds??0}*interval '1 second') ELSE NULL END,
    now()-(${change.idleSeconds??0}*interval '1 second'),now()+(${change.expiresSeconds??3600}*interval '1 second')) RETURNING id,authenticated_at,mfa_verified_at`;
  const token=randomBytes(24).toString('hex');
  const proof={userId:u.id,identityId:i.id,sessionId:s.id,purpose,expiresAt:Date.now()+600_000,
    ...(s.mfa_verified_at?{adminMfa:{authenticatedAt:new Date(s.authenticated_at).getTime(),verifiedAt:new Date(s.mfa_verified_at).getTime(),currentUntil:Date.now()+30_000}}:{})};
  proofs.set(token,proof);
  return {userId:u.id,identityId:i.id,sessionId:s.id,token,proof};
}

test('dedicated non-owner resolver has metadata-only permissions and hardened lock-function ownership',async()=>{
  const password=randomBytes(32).toString('hex'),login=`m2_policy_${suffix}`;
  try {await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_authorization`);}
  catch {throw new Error('Unable to provision isolated policy login');}
  const url=new URL(ownerUrl);url.username=login;url.password=password;runtimeUrl=url.href;
  runtime=postgres(runtimeUrl,options);
  const [fn]=await owner`SELECT p.prosecdef,p.proconfig,r.rolname,r.rolsuper,r.rolbypassrls,r.rolcanlogin
    FROM pg_proc p JOIN pg_roles r ON p.proowner=r.oid WHERE p.oid='identity.lock_authorization_context(uuid,uuid,uuid,uuid,text)'::regprocedure`;
  assert.equal(fn.prosecdef,true);assert.equal(fn.rolname,'trissea_m2_policy_lock');assert.equal(fn.rolsuper,false);assert.equal(fn.rolbypassrls,false);assert.equal(fn.rolcanlogin,false);
  assert.ok(fn.proconfig.includes('search_path=pg_catalog, pg_temp'));
  await dbError(runtime`SELECT subject_ciphertext FROM identity.auth_identities`,'42501');
  await dbError(runtime`SELECT name FROM identity.toda_organizations`,'42501');
  await dbError(runtime`SELECT digest FROM identity.refresh_credentials`,'42501');
  await dbError(runtime`UPDATE identity.scoped_role_assignments SET role_code='PLATFORM_ADMIN'`,'42501');
  await dbError(runtime`UPDATE identity.role_permissions SET permission_code='driver.verify'`,'42501');
  await dbError(runtime`SET ROLE trissea_m2_policy_lock`,'42501');
  await dbError(runtime`SELECT identity.lock_authorization_context(${randomUUID()},${randomUUID()},NULL,NULL,NULL)`,'42501');
  await assert.rejects(new PostgresAuthorizationDatabase(owner).transaction(async()=>true),/Invalid authorization database role/);
  note('Real non-owner LOGIN; encrypted PII/refresh/role mutation/lock-owner impersonation denied; hardened non-superuser function');
});

async function assign(subject,roleCode,scopeKind='TODA',todaId=fixture.todaA,cityTenantId=fixture.city,change={}) {
  await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${subject.userId},${cityTenantId},'ACTIVE') ON CONFLICT DO NOTHING`;
  const [row]=await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,starts_at,expires_at)
    VALUES(${subject.userId},${cityTenantId},${scopeKind==='TODA'?todaId:null},${roleCode},${scopeKind},${fixture.authority},
    now()+(${change.startsSeconds??-60}*interval '1 second'),now()+(${change.expiresSeconds??3600}*interval '1 second')) RETURNING id`;
  return row.id;
}
async function caseResource(kind,{ownerUserId=null,makerUserId=null,assignedUserId=null,cityTenantId=fixture.city,todaId=fixture.todaA}={}) {
  const [row]=await owner`INSERT INTO policy_test_resources(kind,city_tenant_id,toda_id,owner_user_id,maker_user_id,assigned_user_id)
    VALUES(${kind},${cityTenantId},${todaId},${ownerUserId},${makerUserId},${assignedUserId}) RETURNING id`;
  return row.id;
}
const call=(subject,action,id,callback=work)=>service.execute(credentials(subject),action,id,callback);

test('Nest default verifier denies; isolated fixture module proves actual positive own-account and scoped HTTP cases',async()=>{
  const [authority]=await owner`INSERT INTO identity.app_users DEFAULT VALUES RETURNING id`;fixture.authority=authority.id;
  const cities=await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('TUGUEGARAO','Tuguegarao synthetic','ACTIVE'),('SYNTHETIC_OTHER','Synthetic other city','ACTIVE') RETURNING id,code`;
  fixture.city=cities.find(c=>c.code==='TUGUEGARAO').id;fixture.otherCity=cities.find(c=>c.code==='SYNTHETIC_OTHER').id;
  const todas=await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state)
    VALUES(${fixture.city},'A','Synthetic A','VERIFIED'),(${fixture.city},'B','Synthetic B','VERIFIED'),(${fixture.otherCity},'C','Synthetic C','VERIFIED') RETURNING id,code`;
  fixture.todaA=todas.find(t=>t.code==='A').id;fixture.todaB=todas.find(t=>t.code==='B').id;fixture.todaC=todas.find(t=>t.code==='C').id;
  await owner`CREATE TABLE policy_test_resources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL,version integer NOT NULL DEFAULT 1,
    city_tenant_id uuid REFERENCES identity.city_tenants(id),toda_id uuid,owner_user_id uuid,maker_user_id uuid,assigned_user_id uuid,
    FOREIGN KEY(city_tenant_id,toda_id) REFERENCES identity.toda_organizations(city_tenant_id,id))`;
  await owner`CREATE TABLE policy_test_effects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),trace_id uuid NOT NULL)`;
  await owner`GRANT SELECT,UPDATE(version) ON policy_test_resources TO trissea_m2_authorization`;
  await owner`GRANT INSERT ON policy_test_effects TO trissea_m2_authorization`;
  fixture.passenger=await makeSubject('PASSENGER');
  fixture.driver=await makeSubject('DRIVER',{userState:'CONSENT_REQUIRED',sessionState:'CONSENT_REQUIRED',personaState:'PENDING'});
  fixture.manager=await makeSubject();fixture.managerGrant=await assign(fixture.manager,'TODA_MANAGER');
  const defaultModule=await Test.createTestingModule({imports:[AuthorizationModule],controllers:[ProbeController]}).compile();
  const defaultApp=defaultModule.createNestApplication(new FastifyAdapter({logger:false}),{logger:false});
  await defaultApp.init();await defaultApp.getHttpAdapter().getInstance().ready();
  assert.equal((await defaultApp.inject({method:'GET',url:`/policy-probe/accounts/${fixture.passenger.userId}`,headers:credentials(fixture.passenger)})).statusCode,401);
  await defaultApp.close();
  const module=await Test.createTestingModule({imports:[AuthorizationModule],controllers:[ProbeController]})
    .overrideProvider(AuthorizationDatabase).useValue(new PostgresAuthorizationDatabase(runtime))
    .overrideProvider(SessionProofVerifier).useValue(verifier).overrideProvider(AuthorizationResources).useValue(resources).compile();
  service=module.get(AuthorizationService);app=module.createNestApplication(new FastifyAdapter({logger:false}),{logger:false});
  await app.init();await app.getHttpAdapter().getInstance().ready();
  for(const subject of [fixture.passenger,fixture.driver]) {
    const response=await app.inject({method:'GET',url:`/policy-probe/accounts/${subject.userId}`,headers:credentials(subject)});
    assert.equal(response.statusCode,200);assert.equal(response.json().userId,subject.userId);
    assert.ok(!response.body.includes(subject.token));
  }
  assert.equal((await app.inject({method:'GET',url:`/policy-probe/todas/${fixture.todaA}`,headers:credentials(fixture.manager)})).statusCode,200);
  assert.equal((await app.inject({method:'GET',url:`/policy-probe/missing/${fixture.todaA}`,headers:credentials(fixture.manager)})).statusCode,403);
  note('Default module denies real test credentials; isolated Fastify DI proves positive passenger/consent-stage driver/TODA policy responses');
});

test('HTTP caller flags, roles, scope headers and another account cannot manufacture authority',async()=>{
  const headers={...credentials(fixture.manager),'x-city-tenant-id':fixture.otherCity,'x-toda-id':fixture.todaC,'x-admin':'true','x-roles':'PLATFORM_ADMIN','x-permissions':'driver.verify'};
  for(const id of [fixture.todaB,fixture.todaC,randomUUID()]) {
    const response=await app.inject({method:'GET',url:`/policy-probe/todas/${id}?admin=true&role=PLATFORM_ADMIN`,headers});
    assert.equal(response.statusCode,403);assert.equal(response.json().message,'Resource access denied');
  }
  const foreign=await app.inject({method:'GET',url:`/policy-probe/accounts/${fixture.passenger.userId}`,headers:credentials(fixture.driver)});
  assert.equal(foreign.statusCode,403);
  await denied(call(fixture.passenger,'TODA_MEMBERS_MANAGE',fixture.todaA),401);
  assert.equal((await app.inject({method:'GET',url:`/policy-probe/accounts/${fixture.passenger.userId}`,headers:{authorization:'Bearer unverified'}})).statusCode,401);
  const outage=await app.inject({method:'GET',url:`/policy-probe/accounts/${fixture.passenger.userId}`,headers:{authorization:'Bearer failing-proof-adapter'}});
  assert.equal(outage.statusCode,401);assert.ok(!outage.body.includes('private-provider-error'));
  note('Cross-account, cross-city/TODA, missing metadata, forged admin/roles/scope and unverified credential denials');
});

test('permissions and scope stay on one current grant; catalog deletion/revocation immediately changes next decision',async()=>{
  const mixed=await makeSubject();await assign(mixed,'TODA_MANAGER','TODA',fixture.todaB);await assign(mixed,'TODA_DISPATCHER');
  await denied(call(mixed,'TODA_MEMBERS_MANAGE',fixture.todaA));
  assert.equal((await call(mixed,'DISPATCH_READ_MASKED',fixture.todaA)).resourceId,fixture.todaA);
  await owner`DELETE FROM identity.role_permissions WHERE role_code='TODA_MANAGER' AND permission_code='toda.members.manage'`;
  try {await denied(call(fixture.manager,'TODA_MEMBERS_MANAGE',fixture.todaA));}
  finally {await owner`INSERT INTO identity.role_permissions VALUES('TODA_MANAGER','toda.members.manage')`;}
  assert.equal((await call(fixture.manager,'TODA_MEMBERS_MANAGE',fixture.todaA)).resourceId,fixture.todaA);
  const expired=await makeSubject();await assign(expired,'TODA_MANAGER','TODA',fixture.todaA,fixture.city,{startsSeconds:-120,expiresSeconds:-60});
  await denied(call(expired,'TODA_MEMBERS_MANAGE',fixture.todaA));
  const future=await makeSubject();await assign(future,'TODA_MANAGER','TODA',fixture.todaA,fixture.city,{startsSeconds:60});
  await denied(call(future,'TODA_MEMBERS_MANAGE',fixture.todaA));
  note('Real DB mixed-grant denial, positive independent dispatcher grant, current catalog removal and expired/not-yet-effective role denials');
});

test('current account/identity/session/mapping/membership/org and MFA state override previously valid proof',async()=>{
  for(const [label,mutate] of [
    ['session',s=>owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now() WHERE id=${s.sessionId}`],
    ['identity',s=>owner`UPDATE identity.auth_identities SET state='DISABLED' WHERE id=${s.identityId}`],
    ['account',s=>owner`UPDATE identity.app_users SET state='RESTRICTED' WHERE id=${s.userId}`],
    ['mapping',s=>owner`UPDATE identity.administrative_identity_mappings SET state='REVOKED' WHERE identity_id=${s.identityId}`],
  ]) {
    const subject=await makeSubject();await assign(subject,'TODA_MANAGER');
    assert.equal((await call(subject,'TODA_MEMBERS_MANAGE',fixture.todaA)).userId,subject.userId);
    await mutate(subject);await denied(call(subject,'TODA_MEMBERS_MANAGE',fixture.todaA),401);
    report.checkpoints.push(`Current ${label} revocation denied old credential`);
  }
  const member=await makeSubject();await assign(member,'TODA_MANAGER');
  await owner`UPDATE identity.city_memberships SET state='SUSPENDED' WHERE user_id=${member.userId}`;
  await denied(call(member,'TODA_MEMBERS_MANAGE',fixture.todaA));
  await owner`UPDATE identity.toda_organizations SET state='SUSPENDED' WHERE id=${fixture.todaA}`;
  try {await denied(call(fixture.manager,'TODA_MEMBERS_MANAGE',fixture.todaA));}
  finally {await owner`UPDATE identity.toda_organizations SET state='VERIFIED' WHERE id=${fixture.todaA}`;}
  removedFactors.add(fixture.manager.identityId);
  try {await denied(call(fixture.manager,'TODA_MEMBERS_MANAGE',fixture.todaA),401);}
  finally {removedFactors.delete(fixture.manager.identityId);}
  const preauth=await makeSubject('ADMIN',{sessionState:'PREAUTH',withMfa:false});await assign(preauth,'TODA_MANAGER');
  await denied(call(preauth,'TODA_MEMBERS_MANAGE',fixture.todaA),401);
  const stale=await makeSubject('ADMIN',{authAgeSeconds:301});await assign(stale,'TODA_MANAGER');
  await denied(call(stale,'TODA_MEMBERS_MANAGE',fixture.todaA));
  const idle=await makeSubject('ADMIN',{authAgeSeconds:1200,idleSeconds:901});await assign(idle,'TODA_MANAGER');
  await denied(call(idle,'TODA_MEMBERS_MANAGE',fixture.todaA),401);
  const expired=await makeSubject('ADMIN',{authAgeSeconds:1200,expiresSeconds:-1});await assign(expired,'TODA_MANAGER');
  await denied(call(expired,'TODA_MEMBERS_MANAGE',fixture.todaA),401);
  note('Stored revocations, suspended membership/org, missing/removed/stale MFA, preauth, idle and session expiry denied');
});

test('assigned-case, self-review, maker-checker and platform boundaries have real DB positive/negative cases',async()=>{
  const officer=await makeSubject();await assign(officer,'VERIFICATION_OFFICER');
  const valid=await caseResource('VERIFICATION_CASE',{ownerUserId:fixture.passenger.userId,assignedUserId:officer.userId});
  assert.equal((await call(officer,'DRIVER_VERIFY',valid)).resourceId,valid);
  for(const change of [{ownerUserId:officer.userId},{assignedUserId:fixture.manager.userId},{todaId:fixture.todaB}]) {
    const id=await caseResource('VERIFICATION_CASE',{ownerUserId:fixture.passenger.userId,assignedUserId:officer.userId,...change});
    await denied(call(officer,'DRIVER_VERIFY',id));
  }
  const support=await makeSubject();await assign(support,'SUPPORT_AGENT');
  const assigned=await caseResource('SUPPORT_CASE',{ownerUserId:fixture.passenger.userId,assignedUserId:support.userId});
  assert.equal((await call(support,'SUPPORT_READ_MASKED',assigned)).resourceId,assigned);
  await denied(call(support,'DRIVER_VERIFY',valid));
  const unassigned=await caseResource('SUPPORT_CASE',{assignedUserId:officer.userId});await denied(call(support,'SUPPORT_READ_MASKED',unassigned));
  const approver=await makeSubject();await assign(approver,'CITY_FARE_APPROVER','CITY');await assign(approver,'CITY_FARE_EDITOR','CITY');
  const authoredByOther=await caseResource('FARE_POLICY',{todaId:null,makerUserId:officer.userId});
  assert.equal((await call(approver,'FARE_APPROVE',authoredByOther)).resourceId,authoredByOther);
  const authoredBySelf=await caseResource('FARE_POLICY',{todaId:null,makerUserId:approver.userId});await denied(call(approver,'FARE_APPROVE',authoredBySelf));
  const platform=await makeSubject();await assign(platform,'PLATFORM_ADMIN','PLATFORM');
  const infrastructure=await caseResource('PLATFORM_CONFIG',{todaId:null});assert.equal((await call(platform,'PLATFORM_CONFIG_MANAGE',infrastructure)).resourceId,infrastructure);
  const cityConfig=await caseResource('CITY_CONFIG',{todaId:null});await denied(call(platform,'CITY_CONFIG_MANAGE',cityConfig));
  await denied(call(platform,'DRIVER_VERIFY',valid));
  note('Synthetic DB case assignment/self-review, dual-role maker-checker, case-bound support and explicit platform infrastructure-only authorization');
});

test('audit failure prevents protected work; handler failures roll back DB effects and redact raw errors',async()=>{
  let invoked=false;
  await owner`REVOKE INSERT ON identity.audit_events FROM trissea_m2_authorization`;
  try {await denied(call(fixture.manager,'TODA_MEMBERS_MANAGE',fixture.todaA,async()=>{invoked=true;return true;}),503);}
  finally {await owner`GRANT INSERT ON identity.audit_events TO trissea_m2_authorization`;}
  assert.equal(invoked,false);
  const [beforeCount]=await owner`SELECT count(*)::int AS n FROM policy_test_effects`;
  await assert.rejects(call(fixture.manager,'TODA_MEMBERS_MANAGE',fixture.todaA,async context=>{
    await context.tx.execute(sql`INSERT INTO policy_test_effects(trace_id) VALUES(${context.traceId}::uuid)`);
    throw new Error('synthetic-private-error-must-not-escape');
  }),error=>error.getStatus?.()===503&&!error.message.includes('synthetic-private-error'));
  assert.equal((await owner`SELECT count(*)::int AS n FROM policy_test_effects`)[0].n,beforeCount.n);
  const [audit]=await owner`SELECT actor_user_id,actor_session_id,city_tenant_id,toda_id,reason_code FROM identity.audit_events
    WHERE reason_code='TRANSACTION_ABORTED' ORDER BY created_at DESC LIMIT 1`;
  assert.equal(audit.actor_user_id,fixture.manager.userId);assert.equal(audit.actor_session_id,fixture.manager.sessionId);
  assert.equal(audit.city_tenant_id,fixture.city);assert.equal(audit.toda_id,fixture.todaA);
  const deniedDefault=new AuthorizationService(new PostgresAuthorizationDatabase(runtime),new DenySessionProofVerifier(),resources);
  await denied(deniedDefault.execute(credentials(fixture.manager),'TODA_MEMBERS_MANAGE',fixture.todaA,work),401);
  const closedPool=postgres(runtimeUrl,options);await closedPool.end();
  const unavailable=new AuthorizationService(new PostgresAuthorizationDatabase(closedPool),verifier,resources);
  await denied(unavailable.execute(credentials(fixture.manager),'TODA_MEMBERS_MANAGE',fixture.todaA,work),503);
  note('Audit-required before handler; transaction rollback with actor/session/scope audit; raw failure redacted; default proof adapter denies');
});

for(const target of ['grant','session']) test(`${target} revocation is serialized against in-flight work; next request is denied`,async()=>{
  const subject=await makeSubject();const grantId=await assign(subject,'TODA_MANAGER');
  const writer=postgres(ownerUrl,options);let release,entered;
  const gate=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{entered=resolve;});
  try {
    const [pid]=await writer`SELECT pg_backend_pid() AS pid`;
    const active=call(subject,'TODA_MEMBERS_MANAGE',fixture.todaA,async context=>{entered();await gate;return context.traceId;});
    await started;
    const revoking=(target==='grant'?writer`UPDATE identity.scoped_role_assignments SET revoked_at=now() WHERE id=${grantId}`
      :writer`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now() WHERE id=${subject.sessionId}`).then(()=>true);
    let blocked=false;
    for(let i=0;i<80;i++) {
      const [state]=await owner`SELECT cardinality(pg_blocking_pids(${pid.pid}))>0 AS blocked`;
      if(state.blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true);release();
    assert.ok(await active);await revoking;
    await denied(call(subject,'TODA_MEMBERS_MANAGE',fixture.todaA),target==='grant'?403:401);
    note(`Two connections: observed PostgreSQL lock wait for ${target} revocation; in-flight work commits before revocation; following request denied`);
  } finally {release();await writer.end();}
});

test('proof expiry during work rolls back effects; successful/error pooled contexts do not leak',async()=>{
  const subject=await makeSubject();await assign(subject,'TODA_MANAGER');
  proofs.set(subject.token,{...subject.proof,expiresAt:Date.now()+1500,adminMfa:{...subject.proof.adminMfa,currentUntil:Date.now()+1400}});
  const [beforeCount]=await owner`SELECT count(*)::int AS n FROM policy_test_effects`;
  let invoked=false;
  await denied(call(subject,'TODA_MEMBERS_MANAGE',fixture.todaA,async context=>{
    invoked=true;await context.tx.execute(sql`INSERT INTO policy_test_effects(trace_id) VALUES(${context.traceId}::uuid)`);
    await new Promise(resolve=>setTimeout(resolve,1600));return true;
  }),401);
  assert.equal(invoked,true);assert.equal((await owner`SELECT count(*)::int AS n FROM policy_test_effects`)[0].n,beforeCount.n);
  const people=[fixture.passenger,fixture.driver];
  const responses=await Promise.all(Array.from({length:12},(_,i)=>call(people[i%2],'ACCOUNT_READ_SELF',people[i%2].userId)));
  responses.forEach((row,i)=>assert.equal(row.userId,people[i%2].userId));
  assert.equal((await runtime`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,0);
  assert.equal((await runtime`SELECT count(*)::int AS n FROM identity.scoped_role_assignments`)[0].n,0);
  const [context]=await runtime`SELECT current_setting('trissea.user_id',true) AS user_context,current_setting('trissea.session_id',true) AS session_context`;
  assert.equal(context.user_context,'');assert.equal(context.session_context,'');
  note('Expired proof before commit rolls back effect and ALLOWED audit; 12 pooled subject contexts and rollback cleanup passed');
});

test('M2.2 rollback/reapply retains M1/M2.1 metadata, users, grants, audit and unrelated data',async()=>{
  await app.close();app=undefined;await runtime.end();runtime=undefined;
  const [beforeCounts]=await owner`SELECT (SELECT count(*) FROM identity.app_users)::int AS users,(SELECT count(*) FROM identity.audit_events)::int AS audits,
    (SELECT count(*) FROM identity.scoped_role_assignments)::int AS grants`;
  await runMigrations(owner,'down',{allowIdentity:true,report:note});
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.role_permissions`)[0].n,0);
  assert.deepEqual(await owner`SELECT id,checksum,applied_at::text AS applied_at FROM trissea_migrations ORDER BY id`,fixture.previousLedger);
  assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-policy-preservation');
  assert.equal((await owner`SELECT value FROM foundation_metadata WHERE key='milestone'`)[0].value,'M1');
  assert.equal((await owner`SELECT has_column_privilege('trissea_m2_authorization','identity.app_users','id','SELECT') AS granted`)[0].granted,false);
  await runMigrations(owner,'up',{allowIdentity:true,report:note});
  assert.deepEqual((await owner`SELECT (SELECT count(*) FROM identity.app_users)::int AS users,(SELECT count(*) FROM identity.audit_events)::int AS audits,
    (SELECT count(*) FROM identity.scoped_role_assignments)::int AS grants`)[0],beforeCounts);
  const [versions]=await owner`SELECT current_setting('server_version') AS postgres,postgis_lib_version() AS postgis,current_setting('TimeZone') AS timezone`;
  report.versions=versions;report.rollbackReapplyCompleted=true; // command exit/TAP, not this flag, determines suite success
  note('M2.2 rollback/reapply preserves M1/M2.1 ledger, users/grants/audit and unrelated sentinel; column privileges revoked; UTC/PostGIS verified');
});
