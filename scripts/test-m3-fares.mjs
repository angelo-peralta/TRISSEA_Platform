import configuration from './environment.cjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {before,after,test} from 'node:test';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertLocalDatabase,assertDisposableIdentityDatabase} from './migration-policy.mjs';
const req=createRequire(new URL('../services/api/package.json',import.meta.url));req('reflect-metadata');
const {Test}=req('@nestjs/testing'),{FastifyAdapter}=req('@nestjs/platform-fastify');
const {FareHttpModule,FareResources}=req('./dist/src/fares/fare-http.module.js');
const {AdminRuntime,AdminCoreModule}=req('./dist/src/auth/admin/admin-runtime.js');
const {AdminSessions}=req('./dist/src/auth/admin/admin-sessions.js');
const {PassengerSecrets}=req('./dist/src/auth/passenger/passenger-settings.js');
const {AuthorizationService}=req('./dist/src/auth/policy/authorization.service.js');
const {PostgresAuthorizationDatabase}=req('./dist/src/auth/policy/authorization-database.js');
const {defaultDistance,defaultPrivate}=req('./dist/src/fares/fare-model.js');
const fareSchema=req('./dist/src/database/fare-schema.js');
const suffix=randomBytes(6).toString('hex'),database='trissea_m2_test_'+suffix,origin='http://127.0.0.1:5174';
const options={max:5,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC',statement_timeout:15000,lock_timeout:5000}};
const secrets=new PassengerSecrets('m3-test',...Array.from({length:5},()=>randomBytes(32))),proofs=new Map();
const verifier={verify:async input=>{const proof=proofs.get(input.cookie);return proof?{...proof,adminMfa:{...proof.adminMfa,currentUntil:Date.now()+4000}}:null;}};
const csv=await readFile(new URL('../data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv',import.meta.url),'utf8');
const report={database,syntheticOnly:true,checks:[]};let control,owner,runtime,app,authorization,city,otherCity,authority,editor,checker,selfChecker,imported,distance,privateHire,snapshot;
const note=value=>{report.checks.push(value);console.info(value);};
before(async()=>{
 const env=configuration.environmentFor('test'),url=new URL(env.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,env.NODE_ENV);assert.equal(url.pathname,'/m2_control');assert.equal(env.M2_DISPOSABLE_DATABASE,'true');
 control=postgres(url.href,options);await control.unsafe('CREATE DATABASE "'+database+'"');url.pathname='/'+database;assertDisposableIdentityDatabase(url.href,env.NODE_ENV,env.M2_DISPOSABLE_DATABASE);owner=postgres(url.href,options);
 await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
 await owner`CREATE TABLE unrelated_preservation(value text)`;await owner`INSERT INTO unrelated_preservation VALUES('m3-preserve')`;
 await runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:()=>{}});
});
after(async()=>{await app?.close();await Promise.allSettled([runtime?.end(),owner?.end(),control?.end()]);await mkdir(new URL('../.cache/m3/',import.meta.url),{recursive:true});await writeFile(new URL('../.cache/m3/results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');});
test('0009 fresh up, failed-commit rollback, repeated/concurrent up, down/reapply preserve M2 ledger and sentinel',async()=>{
 const ledger=await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`;
 await assert.rejects(runMigrations({begin:callback=>owner.begin(async tx=>{await callback(tx);await tx`SELECT 1/0`;})},'up',{allowIdentity:true,report:()=>{}}),e=>e.code==='22012');
 assert.equal((await owner`SELECT to_regnamespace('fare') AS n`)[0].n,null);
 await Promise.all([runMigrations(owner,'up',{allowIdentity:true,report:()=>{}}),runMigrations(owner,'up',{allowIdentity:true,report:()=>{}})]);
 await runMigrations(owner,'down',{allowIdentity:true,report:()=>{}});assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,ledger);
 await runMigrations(owner,'up',{allowIdentity:true,report:()=>{}});assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'m3-preserve');
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.role_permissions WHERE permission_code='fare.activate'`)[0].n,0);
 note('0009 migration transaction/repeat/concurrency/down/reapply; prior checksums and sentinel preserved; no fare.activate edge');
});
async function subject(roles=[],targetCity=city,age=0){
 const [u]=await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`,subjectId=randomUUID();
 const [i]=await owner`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at) VALUES(${u.id},'KEYCLOAK','https://synthetic.invalid',${secrets.identity.lookup(subjectId,'m3')},${secrets.identity.keyId},${secrets.identity.encrypt(subjectId,'m3')},now()) RETURNING id`;
 await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state) VALUES(${i.id},${u.id},${authority},${randomUUID()},'APPROVED')`;
 const [s]=await owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,mfa_verified_at,last_seen_at,expires_at) VALUES(${u.id},${i.id},'KEYCLOAK','ADMIN','ACTIVE',1,now()-(${age}*interval '1 second'),now()-(${age}*interval '1 second'),now(),now()+interval '1 hour') RETURNING id,authenticated_at,mfa_verified_at`;
 const cookie='fixture-'+randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('base64url');await owner`INSERT INTO identity.admin_browser_sessions(session_id,cookie_digest,csrf_digest,provider_ciphertext,factor_digest) VALUES(${s.id},${secrets.coordinate('cookie',cookie)},${secrets.coordinate('admin-csrf',csrf)},'v1.synthetic',${secrets.coordinate('factor',cookie)})`;
 await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${u.id},${targetCity},'ACTIVE')`;
 for(const role of roles)await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,role_code,scope_kind,granted_by,expires_at) VALUES(${u.id},${targetCity},${role},'CITY',${authority},now()+interval '1 hour')`;
 proofs.set(cookie,{userId:u.id,identityId:i.id,sessionId:s.id,purpose:'ADMIN',expiresAt:Date.now()+600000,adminMfa:{authenticatedAt:new Date(s.authenticated_at).getTime(),verifiedAt:new Date(s.mfa_verified_at).getTime(),currentUntil:Date.now()+4000}});
 return {userId:u.id,sessionId:s.id,cookie,csrf};
}
async function http(method,path,body,who=editor,status=200,headers={}){const response=await app.inject({method,url:'/v1/admin/fares/cities/'+city+'/'+path,headers:{...(who?{cookie:who.cookie,origin,'x-csrf-token':who.csrf}:{}),'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{payload:body})});assert.equal(response.statusCode,status,`${method} ${path}: ${response.statusCode}, wanted ${status}; ${response.statusCode>=500?'server error':response.body.slice(0,150)}`);return response.json();}
const saveBody=(kind,config,extra={})=>({familyId:null,expectedRevision:0,kind,name:'Synthetic '+kind,config,effectiveFrom:null,effectiveUntil:null,legalReference:null,...extra});
test('actual fare Nest module on non-owner role uses current M2 session, grants and real CSRF checks',async()=>{
 authority=(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id;
 const cities=await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('TUGUEGARAO','Synthetic Tuguegarao','ACTIVE'),('M3_OTHER','Synthetic other','ACTIVE') RETURNING id,code`;city=cities.find(c=>c.code==='TUGUEGARAO').id;otherCity=cities.find(c=>c.code==='M3_OTHER').id;
 const login='m3_fare_'+suffix,password=randomBytes(32).toString('hex');await control.unsafe('CREATE ROLE "'+login+'" LOGIN PASSWORD '+"'"+password+"'"+' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_admin_auth,trissea_m2_authorization');
 const url=new URL(configuration.environmentFor('test').M2_TEST_CONTROL_URL);url.pathname='/'+database;url.username=login;url.password=password;runtime=postgres(url.href,options);
 authorization=new AuthorizationService(new PostgresAuthorizationDatabase(runtime),verifier,new FareResources());
 const admin={connection:runtime,secrets,proofVerifier:verifier,sessions:new AdminSessions(null,{origin},secrets,null)};
 const module=await Test.createTestingModule({imports:[AdminCoreModule.register(),FareHttpModule]}).overrideProvider(AdminRuntime).useValue(admin).overrideProvider(AuthorizationService).useValue(authorization).compile();
 app=module.createNestApplication(new FastifyAdapter({logger:false,bodyLimit:16384}),{logger:false});app.setGlobalPrefix('v1');await app.init();await app.getHttpAdapter().getInstance().ready();
 editor=await subject(['CITY_FARE_EDITOR']);checker=await subject(['CITY_FARE_APPROVER']);selfChecker=await subject(['CITY_FARE_EDITOR','CITY_FARE_APPROVER']);
 await http('GET','editor/policies',undefined,null,401);await http('GET','editor/policies',undefined,checker,403);
 await http('POST','policies',saveBody('DISTANCE_PROPOSAL',defaultDistance),editor,403,{'x-csrf-token':'invalid'});
 await http('POST','policies',saveBody('DISTANCE_PROPOSAL',defaultDistance),editor,403,{origin:'https://wrong.invalid'});
 await http('GET','editor/policies',undefined,await subject(['CITY_FARE_EDITOR'],otherCity),403);
 await http('GET','reviewer/policies',undefined,await subject(['CITY_FARE_APPROVER'],city,301),403);
 assert.equal((await runtime`SELECT count(*)::int AS n FROM fare.policy_versions`)[0].n,0);
 await assert.rejects(runtime`UPDATE fare.policy_versions SET config='{}'`,e=>e.code==='42501');
 note('Non-owner Nest routes: anonymous/wrong role/cross-city/stale MFA/invalid CSRF/Origin denied; no pooled RLS context leak');
});
test('complete immutable matrix import, exact amounts, idempotency replay and changed-body conflict',async()=>{
 const body={csv,sourceLabel:'LGU Plaza reference',sourceReference:'data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv',provenance:'Owner confirms Tuguegarao LGU; Plaza origin, one-way, per passenger. Tariff effective date pending.',effectiveFrom:null,effectiveUntil:null,tariffReference:null},key=randomUUID();
 imported=await http('POST','imports',body,editor,200,{'idempotency-key':key});assert.equal(imported.rowCount,43);
 assert.deepEqual(await http('POST','imports',body,editor,200,{'idempotency-key':key}),imported);
 await http('POST','imports',{...body,sourceLabel:'Different'},editor,409,{'idempotency-key':key});
 const detail=await http('GET','editor/policies/'+imported.family.id);assert.equal(detail.versions[0].source.rows.length,43);assert.equal(detail.versions[0].source.rows.find(r=>r.destinationLabel==='Namabbalan Sur').regularCentavos,3300);
 await assert.rejects(owner`UPDATE fare.matrix_rows SET regular_centavos=1 WHERE import_id=${imported.importId}`,e=>e.code==='23514');
 await assert.rejects(owner`INSERT INTO fare.matrix_rows SELECT city_tenant_id,import_id,'Added',category,regular_centavos,discounted_centavos,regular_php,discounted_php,source_page,original_status,original_origin_scope,original_effective_from FROM fare.matrix_rows WHERE import_id=${imported.importId} LIMIT 1`,e=>e.code==='23514');
 note('43 exact original CSV rows imported; source hash/provenance retained; replay stable; changed body and history edits rejected');
});
test('version concurrency, maker-checker and approval never activates',async()=>{
 distance=await http('POST','policies',saveBody('DISTANCE_PROPOSAL',defaultDistance));privateHire=await http('POST','policies',saveBody('PRIVATE_HIRE_PROPOSAL',defaultPrivate));
 const change=saveBody('DISTANCE_PROPOSAL',{...defaultDistance,baseCentavos:2300},{familyId:distance.family.id,expectedRevision:1});
 const results=await Promise.all([app.inject({method:'POST',url:'/v1/admin/fares/cities/'+city+'/policies',headers:{cookie:editor.cookie,origin,'x-csrf-token':editor.csrf,'idempotency-key':randomUUID()},payload:change}),app.inject({method:'POST',url:'/v1/admin/fares/cities/'+city+'/policies',headers:{cookie:editor.cookie,origin,'x-csrf-token':editor.csrf,'idempotency-key':randomUUID()},payload:change})]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);distance=results.find(r=>r.statusCode===200).json();
 const own=await http('POST','policies',saveBody('DISTANCE_PROPOSAL',defaultDistance),selfChecker);await http('POST','versions/'+own.version.id+'/submit',{expectedLifecycleVersion:1},selfChecker);
 await http('POST','versions/'+own.version.id+'/reviews',{expectedLifecycleVersion:2,outcome:'APPROVE',reason:'Synthetic review'},selfChecker,409);
 await http('POST','versions/'+distance.version.id+'/submit',{expectedLifecycleVersion:1});
 const decisions=await Promise.all(['APPROVE','REJECT'].map(outcome=>app.inject({method:'POST',url:'/v1/admin/fares/cities/'+city+'/versions/'+distance.version.id+'/reviews',headers:{cookie:checker.cookie,origin,'x-csrf-token':checker.csrf,'idempotency-key':randomUUID()},payload:{expectedLifecycleVersion:2,outcome,reason:'Synthetic independent review'}})));assert.deepEqual(decisions.map(r=>r.statusCode).sort(),[200,409]);assert.equal(decisions.find(r=>r.statusCode===200).json().activationStatus,'CLOSED');
 assert.equal((await owner`SELECT count(*)::int AS n FROM fare.reviews WHERE policy_version_id=${distance.version.id}`)[0].n,1);
 await http('POST','activate',{},checker,404);note('Concurrent draft edits and opposing decisions have one winner; maker cannot check; approval remains CLOSED');
});
test('persisted simulations, historical snapshots and calibration preserve source versions',async()=>{
 const body={mode:'SIMULATION',service:'REGULAR',origin:'OFF_PLAZA',destinationLabel:null,fareClass:'REGULAR',roadDistanceMetres:7001,routeEvidence:'SYNTHETIC',routeReference:'ILLUSTRATIVE_NOT_MEASURED',passengerCount:1,capacity:5,referencePolicyVersionId:distance.version.id,privatePolicyVersionId:privateHire.version.id};
 snapshot=(await http('POST','editor/simulations',body)).snapshot;assert.equal(snapshot.result.totalCentavos,6400);assert.equal(snapshot.payable,false);
 const old=JSON.stringify(snapshot);await http('POST','policies',saveBody('PRIVATE_HIRE_PROPOSAL',{...defaultPrivate,bands:[{upToMetres:null,compensationBps:5000}]},{familyId:privateHire.family.id,expectedRevision:1}));
 assert.equal(JSON.stringify((await http('GET','editor/snapshots/'+snapshot.id)).snapshot),old);
 assert.equal((await http('POST','editor/simulations',{...body,mode:'PAYABLE'})).snapshot.result.method,'UNAVAILABLE');
 const matrixBody={...body,origin:'PLAZA',destinationLabel:'Namabbalan Sur',service:'PER_PASSENGER',referencePolicyVersionId:imported.version.id,privatePolicyVersionId:null,fareClass:'DISCOUNTED'};
 assert.equal((await http('POST','editor/simulations',matrixBody)).snapshot.result.totalCentavos,2700);
 const calibration=await http('POST','editor/calibration',{matrixPolicyVersionId:imported.version.id,distancePolicyVersionId:distance.version.id,measurements:[],candidateRatesCentavosPerKm:[100,200,300]});assert.equal(calibration.averageMeasuredRoadMetres,null);assert.equal(calibration.missingDestinations.length,42);
 await http('POST','editor/simulations',{...body,referencePolicyVersionId:randomUUID()},editor,404);
 note('Immutable synthetic snapshots; exact discounted matrix amount; payable denied; no fabricated calibration distances');
});
test('real database rejects invalid financial configuration and rolls back incomplete source batches',async()=>{
 for(const [kind,config]of [['DISTANCE_PROPOSAL',{...defaultDistance,rounding:null}],['DISTANCE_PROPOSAL',{...defaultDistance,baseCentavos:-1}],['PRIVATE_HIRE_PROPOSAL',{...defaultPrivate,capacityPolicyReference:null}],['PRIVATE_HIRE_PROPOSAL',{...defaultPrivate,bands:[{upToMetres:7000,compensationBps:1500},{upToMetres:3000,compensationBps:1000},{upToMetres:null,compensationBps:2500}]}]]){
  assert.notEqual((await owner`SELECT fare.valid_config(${kind},${owner.json(config)}) AS valid`)[0].valid,true);
 }
 const count=(await owner`SELECT count(*)::int AS n FROM fare.imports`)[0].n;
 await assert.rejects(authorization.execute({cookie:editor.cookie},'FARE_CITY_EDIT',city,async c=>{
  const [source]=await c.tx.insert(fareSchema.fareSources).values({cityTenantId:city,label:'Incomplete synthetic import',reference:'SYNTHETIC',provenance:'SYNTHETIC',makerUserId:editor.userId}).returning();
  await c.tx.insert(fareSchema.fareImports).values({cityTenantId:city,sourceId:source.id,sha256:imported.sha256,originalCsv:csv,originConfirmation:'OWNER_CONFIRMED_PLAZA_ONE_WAY_PER_PASSENGER',makerUserId:editor.userId});
 }),e=>e.getStatus?.()===503);assert.equal((await owner`SELECT count(*)::int AS n FROM fare.imports`)[0].n,count);
 const other=await subject(['CITY_FARE_EDITOR'],otherCity),response=await app.inject({method:'POST',url:'/v1/admin/fares/cities/'+otherCity+'/policies',headers:{cookie:other.cookie,origin,'x-csrf-token':other.csrf,'idempotency-key':randomUUID()},payload:saveBody('DISTANCE_PROPOSAL',defaultDistance)});assert.equal(response.statusCode,200);
 await http('GET','editor/policies/'+response.json().family.id,undefined,editor,404);await http('GET','editor/snapshots/'+snapshot.id,undefined,other,403);
 note('PostgreSQL rejects negative/null/overlapping policy values; deferred import completeness rollback; real other-city policy/snapshot IDOR denied');
});
test('admin browser edits proposals, imports matrix, compares prices, calibrates, reviews and handles outages', {timeout:120000},async()=>{
 const adminRequire=createRequire(new URL('../apps/admin/package.json',import.meta.url)),{createServer}=await import(pathToFileURL(adminRequire.resolve('vite')).href);
 let vite,browser;
 try{
  vite=await createServer({root:fileURLToPath(new URL('../apps/admin',import.meta.url)),configFile:fileURLToPath(new URL('../apps/admin/vite.config.ts',import.meta.url)),server:{port:0,strictPort:false,host:'127.0.0.1'},logLevel:'silent'});await vite.listen();
  const address=vite.httpServer.address(),url='http://127.0.0.1:'+address.port;browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.name));let unavailable=false,principal=editor;
  await page.route('**/v1/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path==='/v1/admin/auth/session'){await route.fulfill({json:{userId:principal.userId,sessionId:principal.sessionId,clientPurpose:'ADMIN',mfaVerified:true,csrfToken:principal.csrf,permissionsResolvedPerResource:true,operationalServicesEnabled:false}});return;}
   if(unavailable){await route.fulfill({status:503,json:{message:'Unavailable'}});return;}
   const headers={...request.headers(),cookie:principal.cookie,origin};delete headers.host;
   const response=await app.inject({method:request.method(),url:new URL(request.url()).pathname+new URL(request.url()).search,headers,...request.postData()?{payload:request.postData()}:{}});await route.fulfill({status:response.statusCode,contentType:'application/json',body:response.body});
  });
  const wait=message=>page.getByRole('status').filter({hasText:message}).waitFor({timeout:20000});
  await page.goto(url);await page.getByRole('button',{name:'Fare Management',exact:true}).click();await page.getByLabel('Assigned city identifier').fill(city);await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Current editor access verified');
  await page.getByRole('button',{name:'Distance Pricing',exact:true}).click();await page.getByLabel('Base regular fare (PHP)',{exact:true}).fill('30');await page.getByLabel('Policy name',{exact:true}).fill('Browser distance proposal');await page.getByRole('button',{name:'Save distance draft revision',exact:true}).click();await wait('Draft revision saved');
  await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Current editor access verified');await page.getByRole('button',{name:'Browser distance proposal · DISTANCE_PROPOSAL',exact:true}).click();await wait('Immutable policy history loaded');
  const browserDistance=(await owner`SELECT v.id FROM fare.policy_versions v JOIN fare.policy_families f ON f.id=v.family_id WHERE f.name='Browser distance proposal'`)[0].id;
  await page.getByRole('button',{name:'Policy Approval',exact:true}).click();await page.getByRole('button',{name:'Submit selected draft for review',exact:true}).click();await wait('Submitted for independent review');
  await page.getByLabel('Reference policy version',{exact:true}).fill(browserDistance);await page.getByLabel('Private policy version (Regular booking)',{exact:true}).fill(privateHire.version.id);await page.getByRole('button',{name:'Preview 1–5 passengers',exact:true}).click();await wait('Synthetic snapshots saved');assert.equal(await page.locator('table').filter({hasText:'Synthetic passenger charges'}).locator('tbody tr').count(),5);
  await page.getByRole('button',{name:'Private Tricycle Pricing',exact:true}).click();await page.getByLabel('Example simulation capacity (1–5)',{exact:true}).fill('4');await page.getByLabel('Unused-seat compensation (%)',{exact:true}).first().fill('12.5');await page.getByRole('button',{name:'Start a new policy family',exact:true}).click();await page.getByLabel('Policy name',{exact:true}).fill('Browser private proposal');await page.getByRole('button',{name:'Save private-hire draft revision',exact:true}).click();await wait('Draft revision saved');
  await page.getByRole('button',{name:'LGU Fare Matrix',exact:true}).click();await page.getByLabel('CSV content',{exact:true}).fill(csv);await page.getByRole('button',{name:'Validate and import CSV',exact:true}).click();await wait('43 rows validated and imported');await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Current editor access verified');await page.getByRole('button',{name:'Tuguegarao LGU Plaza matrix · LGU_MATRIX',exact:true}).click();await wait('Immutable policy history loaded');assert.equal(await page.locator('table').filter({hasText:'Original published regular'}).locator('tbody tr').count(),43);
  await page.getByRole('button',{name:'Matrix Calibration',exact:true}).click();await page.getByLabel('Matrix policy version',{exact:true}).fill(imported.version.id);await page.getByLabel('Distance policy version',{exact:true}).fill(distance.version.id);await page.getByRole('button',{name:'Compare candidate rates',exact:true}).click();await wait('Calibration complete');await page.getByText('Average measured road distance: not available.',{exact:false}).waitFor();
  await mkdir(new URL('../.cache/m3/browser',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.cache/m3/browser/calibration.png',import.meta.url)),fullPage:true});
  // The two target families sort first; extra families force a second real API page.
  const paginationDistance={...defaultDistance,baseCentavos:2800,includedMetres:4000,rateCentavosPerKm:350,incrementMetres:250,rounding:'CENTAVO_CEIL',reviewThresholdCentavos:15000,maximumCentavos:20000,discounted:{baseCentavos:1900,rateCentavosPerKm:175,assumption:'PAGINATION_SYNTHETIC_DISCOUNT'}};
  const paginationPrivate={...defaultPrivate,simulationCapacity:4,capacityPolicyReference:'PAGINATION_SYNTHETIC_CAPACITY',bands:[{upToMetres:2000,compensationBps:1250},{upToMetres:6000,compensationBps:2000},{upToMetres:null,compensationBps:3000}],rounding:'CENTAVO_CEIL',discountedCompensationBps:500,discountAssumption:'PAGINATION_SYNTHETIC_COMPENSATION'};
  const paginationTargets=[{id:'ffffffff-ffff-ffff-ffff-ffffffffffff',kind:'DISTANCE_PROPOSAL',name:'Pagination distance',config:paginationDistance},{id:'ffffffff-ffff-ffff-ffff-fffffffffffe',kind:'PRIVATE_HIRE_PROPOSAL',name:'Pagination private',config:paginationPrivate}];
  for(const target of [...paginationTargets,...Array.from({length:21},(_,index)=>({id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),kind:'DISTANCE_PROPOSAL',name:'Pagination extra '+index,config:defaultDistance}))]){
   await authorization.execute({cookie:editor.cookie},'FARE_CITY_EDIT',city,async c=>{
    const [family]=await c.tx.insert(fareSchema.fareFamilies).values({id:target.id,cityTenantId:city,makerUserId:editor.userId,kind:target.kind,name:target.name}).returning();
    await c.tx.insert(fareSchema.fareVersions).values({cityTenantId:city,familyId:family.id,kind:family.kind,revision:1,config:target.config});
   });
  }
  async function paginateDraft(){
   const selected=await page.getByLabel('Policy revision').inputValue();
   const response=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/editor/policies')&&new URL(r.url()).searchParams.has('after'));
   await page.getByRole('button',{name:'Load more fare policies',exact:true}).click();const loaded=await response;assert.equal(loaded.status(),200);assert.ok((await loaded.json()).items.length>0);await page.waitForFunction(()=>document.querySelectorAll('.fare-policy-list li').length>20);await wait('Current editor access verified');
   assert.equal(await page.getByLabel('Policy revision').inputValue(),selected);
  }
  for(const target of paginationTargets){
   await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Current editor access verified');
   assert.equal(await page.locator('.fare-policy-list li').count(),20);assert.equal(await page.getByRole('button',{name:'Load more fare policies',exact:true}).count(),1);
   await page.getByRole('button',{name:target.name+' · '+target.kind,exact:true}).click();await wait('Immutable policy history loaded');
   await page.getByRole('button',{name:'Distance Pricing',exact:true}).click();await page.getByLabel('Base regular fare (PHP)',{exact:true}).fill('37.5');
   await page.getByRole('button',{name:'Private Tricycle Pricing',exact:true}).click();await page.getByLabel('Unused-seat compensation (%)',{exact:true}).first().fill('17.5');
   await paginateDraft();
   assert.equal(await page.getByLabel('Unused-seat compensation (%)',{exact:true}).first().inputValue(),'17.5');
   await page.getByRole('button',{name:'Distance Pricing',exact:true}).click();assert.equal(await page.getByLabel('Base regular fare (PHP)',{exact:true}).inputValue(),'37.5');
   assert.equal(await page.getByLabel('Policy name',{exact:true}).inputValue(),target.name);
   if(target.kind==='PRIVATE_HIRE_PROPOSAL')await page.getByRole('button',{name:'Private Tricycle Pricing',exact:true}).click();
   const savedResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/policies'));
   await page.getByRole('button',{name:target.kind==='DISTANCE_PROPOSAL'?'Save distance draft revision':'Save private-hire draft revision',exact:true}).click();
   const saved=await savedResponse;assert.equal(saved.status(),200);const result=await saved.json();await wait('Draft revision saved');
   const expected=target.kind==='DISTANCE_PROPOSAL'?{...paginationDistance,baseCentavos:3750}:{...paginationPrivate,bands:paginationPrivate.bands.map((band,index)=>index===0?{...band,compensationBps:1750}:band)};
   assert.equal(result.family.id,target.id);assert.equal(result.version.revision,2);assert.deepEqual(result.version.config,expected);
   assert.deepEqual((await owner`SELECT config FROM fare.policy_versions WHERE id=${result.version.id}`)[0].config,expected);
  }
  note('Second policy-list page preserves both unsaved pricing drafts, selected revision and name; distance/private saves append exact edited configurations to their original families');
  principal=checker;await page.reload();await page.getByRole('button',{name:'Fare Management',exact:true}).click();await page.getByLabel('Assigned city identifier').fill(city);await page.getByLabel('Workspace').selectOption('reviewer');await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Current reviewer access verified');await page.getByRole('button',{name:'Browser distance proposal · DISTANCE_PROPOSAL',exact:true}).click();await wait('Immutable policy history loaded');await page.getByRole('button',{name:'Policy Approval',exact:true}).click();await page.getByLabel('Review reason',{exact:true}).fill('Independent synthetic browser review; activation remains closed.');await page.getByRole('button',{name:'Approve proposal only',exact:true}).click();await wait('Review recorded');
  unavailable=true;await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Fare service unavailable');unavailable=false;await page.getByLabel('Assigned city identifier').fill(otherCity);await page.getByRole('button',{name:'Load fare policies',exact:true}).click();await wait('Access denied');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.deepEqual(errors,[]);
  note('Chromium + actual Nest/PostgreSQL routes: editable distance/private drafts, 1–5 snapshots, all 43 matrix rows, missing-distance calibration, independent approval, outage and cross-city denial, narrow viewport');
 }finally{await browser?.close();await vite?.close();}
});
test('audit/outbox failure rolls back mutation, and revoked grant/session deny subsequent requests',async()=>{
 const before=(await owner`SELECT count(*)::int AS n FROM fare.policy_families`)[0].n;
 await owner`CREATE FUNCTION public.m3_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic failure'';END'`;await owner`CREATE TRIGGER m3_fail BEFORE INSERT ON identity.outbox_events FOR EACH ROW EXECUTE FUNCTION public.m3_fail_outbox()`;
 try{await http('POST','policies',saveBody('DISTANCE_PROPOSAL',defaultDistance),editor,503);}finally{await owner`DROP TRIGGER m3_fail ON identity.outbox_events`;await owner`DROP FUNCTION public.m3_fail_outbox()`;}
 assert.equal((await owner`SELECT count(*)::int AS n FROM fare.policy_families`)[0].n,before);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.audit_events a WHERE a.action LIKE 'fare.%' AND NOT EXISTS(SELECT FROM identity.outbox_events o WHERE o.audit_event_id=a.id)`)[0].n,0);
 const revoked=await subject(['CITY_FARE_EDITOR']);await owner`UPDATE identity.scoped_role_assignments SET revoked_at=now(),version=version+1 WHERE user_id=${revoked.userId}`;await http('GET','editor/policies',undefined,revoked,403);
 await owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now(),version=version+1 WHERE id=${editor.sessionId}`;await http('GET','editor/policies',undefined,editor,401);
 assert.equal((await owner`SELECT count(*)::int AS n FROM fare.calculations WHERE payable`)[0].n,0);note('Outbox failure rolls back fare write; every committed fare audit has outbox; revoked grants/session denied');
});
