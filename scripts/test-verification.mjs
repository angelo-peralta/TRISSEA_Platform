import configuration from './environment.cjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,after,test as nodeTest} from 'node:test';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertLocalDatabase,assertDisposableIdentityDatabase} from './migration-policy.mjs';
import {bootstrapClient} from './provision-keycloak-local.mjs';
import {chromium} from '@playwright/test';
import {Secret,TOTP} from 'otpauth';
const req=createRequire(new URL('../services/api/package.json',import.meta.url));req('reflect-metadata');
const controlEnv=configuration.environmentFor('test');
const suffix=randomBytes(6).toString('hex'),database=`trissea_m2_test_${suffix}`;
const options={max:5,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC',statement_timeout:15000,lock_timeout:5000}};
const report={executedAt:new Date().toISOString(),database,syntheticOnly:true,tests:[],checks:[],screenshots:[]};
const note=message=>{console.info(message);report.checks.push(message);};
const test=(name,work,timeout=90000)=>nodeTest(name,{timeout},async context=>{try{await work(context);report.tests.push({name,result:'PASSED'});}catch(error){report.tests.push({name,result:'FAILED'});throw error;}});
let control,owner,connection,app,mobileConnection,adminConnection,mobile,admin,runtime,otp,browser,providerApi,authority,city,todaA,todaB,otherCity,todaC;
const messages=new Map(),fixtures={};let phoneCounter=1;
const origin='http://127.0.0.1:5174';
const keycloakEnv=configuration.loadLocal();
before(async()=>{const url=new URL(controlEnv.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,controlEnv.NODE_ENV);assert.equal(url.pathname,'/m2_control');assert.equal(controlEnv.M2_DISPOSABLE_DATABASE,'true');control=postgres(url.href,{...options,connection:{...options.connection,statement_timeout:60000}});await control.unsafe(`CREATE DATABASE "${database}"`);url.pathname='/'+database;assertDisposableIdentityDatabase(url.href,controlEnv.NODE_ENV,'true');owner=postgres(url.href,options);
 await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO unrelated_preservation VALUES(1,'synthetic-verification-preservation')`;
});
after(async()=>{await browser?.close();await app?.close();await otp?.close();await Promise.allSettled([connection?.end(),mobileConnection?.end(),adminConnection?.end(),owner?.end(),control?.end()]);await mkdir(new URL('../.cache/m2-verification/',import.meta.url),{recursive:true});await writeFile(new URL('../.cache/m2-verification/results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');});
test('0007 incremental/fresh/repeated/failed commit/rollback/reapply preserves prior migrations and unrelated data',async()=>{
 await runMigrations(owner,'up',{through:'0006_admin_browser_auth',allowIdentity:true,report:()=>{}});
 const ledger=await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`;await owner`INSERT INTO identity.app_users DEFAULT VALUES`;
 const failed={begin:work=>owner.begin(async tx=>{await work(tx);await tx`SELECT 1/0`;})};await assert.rejects(runMigrations(failed,'up',{through:'0007_synthetic_verification',allowIdentity:true,report:()=>{}}));assert.equal((await owner`SELECT to_regclass('identity.verification_cases') AS t`)[0].t,null);
 await runMigrations(owner,'up',{through:'0007_synthetic_verification',allowIdentity:true,report:note});await runMigrations(owner,'up',{through:'0007_synthetic_verification',allowIdentity:true,report:()=>{}});await runMigrations(owner,'down',{allowIdentity:true,report:note});
 assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,ledger);assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,1);assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-verification-preservation');
 await Promise.all([runMigrations(owner,'up',{through:'0007_synthetic_verification',allowIdentity:true,report:note}),runMigrations(owner,'up',{through:'0007_synthetic_verification',allowIdentity:true,report:()=>{}})]);note('0007 fresh/no-op/concurrent apply/failed commit/down/reapply preserved 0001–0006 ledger, prior user and unrelated sentinel; no users/evidence/reviewers/grants seeded');
});

test('0008 projection-version migration preserves the prior ledger and restores 0007 on failed commit/down/reapply',async()=>{
 const ledger=await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,[original]=await owner`SELECT pg_get_functiondef('identity.verification_target(uuid)'::regprocedure) AS body`;
 const failed={begin:work=>owner.begin(async tx=>{await work(tx);await tx`SELECT 1/0`;})};
 await assert.rejects(runMigrations(failed,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:()=>{}}));
 assert.equal((await owner`SELECT to_regclass('identity.verification_projection_versions') AS t`)[0].t,null);
 assert.equal((await owner`SELECT pg_get_functiondef('identity.verification_target(uuid)'::regprocedure) AS body`)[0].body,original.body);
 await Promise.all([runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:note}),runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:()=>{}})]);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.verification_projection_versions`)[0].n,0);
 await runMigrations(owner,'down',{allowIdentity:true,report:note});
 assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,ledger);
 assert.equal((await owner`SELECT pg_get_functiondef('identity.verification_target(uuid)'::regprocedure) AS body`)[0].body,original.body);
 await runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:note});
 assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-verification-preservation');
 note('0008 failed transaction/concurrent no-op/down/reapply preserves 0001-0007 checksums, target function ownership/grants, synthetic user and sentinel; no target backfill');
});

test('combined actual Nest module starts with three least-privilege logins in one disposable application database',async context=>{
 const urls={};for(const [label,groups]of [['mobile','trissea_m2_auth,trissea_m2_authorization'],['admin','trissea_m2_admin_auth,trissea_m2_authorization'],['verification','trissea_m2_verification,trissea_m2_authorization']]){
  console.info('Setup: provisioning isolated',label,'login');
  const login=`m2_v_${label}_${suffix}`,password=randomBytes(32).toString('hex');await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE ${groups}`);await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);const url=new URL(controlEnv.M2_TEST_CONTROL_URL);url.pathname='/'+database;url.username=login;url.password=password;urls[label]=url.href;
 }
 mobileConnection=postgres(urls.mobile,options);adminConnection=postgres(urls.admin,options);connection=postgres(urls.verification,options);
 console.info('Setup: loading backend modules');const load=name=>req('./dist/src/auth/passenger/'+name+'.js'),{PassengerRuntime}=load('passenger-runtime'),{PassengerSecrets,PassengerSettings}=load('passenger-settings'),{PassengerTokens}=load('token-service'),{RedisOtpStore}=load('redis-otp'),{MockSmsGateway}=load('sms-gateway');
 console.info('Setup: dedicated database logins connected');
 const settings=new PassengerSettings({NODE_ENV:'test'}),secrets=new PassengerSecrets('verify-mobile',...Array.from({length:5},()=>randomBytes(32))),pair=generateKeyPairSync('ed25519'),privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'}),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
 const passengerTokens=await PassengerTokens.create('http://127.0.0.1:4104/v1','verification-passenger','verify-mobile',privateKey,publicKey),driverTokens=await PassengerTokens.create('http://127.0.0.1:4104/v1','verification-driver','verify-mobile',privateKey,publicKey,600,'DRIVER');
 otp=new RedisOtpStore(controlEnv.DEV_REDIS_URL,`verification-${suffix}`);await otp.connect();assert.equal(await otp.client.ping(),'PONG');
 mobile=new PassengerRuntime(mobileConnection,settings,secrets,otp,new MockSmsGateway('test',message=>messages.set(message.challengeId,message)),passengerTokens,driverTokens);
 const {AdminRuntime}=req('./dist/src/auth/admin/admin-runtime.js'),{AdminSettings}=req('./dist/src/auth/admin/admin-settings.js'),{KeycloakProvider}=req('./dist/src/auth/admin/keycloak-provider.js');
 console.info('Setup: real mobile OTP runtime ready');
 const adminSettings=new AdminSettings({...keycloakEnv,NODE_ENV:'test'}),provider=new KeycloakProvider(adminSettings);await provider.initialize();admin=new AdminRuntime(adminConnection,adminSettings,new PassengerSecrets('verify-admin',...Array.from({length:5},()=>randomBytes(32))),provider);console.info('Setup: real provider discovery ready');
 Object.assign(process.env,keycloakEnv,{NODE_ENV:'test',M2_PASSENGER_AUTH_ENABLED:'true',M2_DRIVER_AUTH_ENABLED:'true',M2_ADMIN_AUTH_ENABLED:'true',M2_VERIFICATION_ENABLED:'true',M2_PASSENGER_DATABASE_URL:urls.mobile,ADMIN_DATABASE_URL:urls.admin,M2_VERIFICATION_DATABASE_URL:urls.verification});
 const {Test}=req('@nestjs/testing'),{FastifyAdapter}=req('@nestjs/platform-fastify'),{AppModule}=req('./dist/src/app.module.js');
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PassengerRuntime).useValue(mobile).overrideProvider(AdminRuntime).useValue(admin).compile();console.info('Setup: root module compiled');app=module.createNestApplication(new FastifyAdapter({logger:false,bodyLimit:16384,trustProxy:false}),{logger:false});app.setGlobalPrefix('v1');await app.init();await app.getHttpAdapter().getInstance().ready();console.info('Setup: root API initialized');
 const {VerificationRuntime}=req('./dist/src/auth/verification/verification-runtime.js');runtime=app.get(VerificationRuntime);
 assert.ok(runtime.service);if(context.signal.aborted)throw new Error('Infrastructure setup deadline reached');browser=await chromium.launch({headless:true,timeout:60000,args:['--disable-gpu','--renderer-process-limit=1']});if(context.signal.aborted){await browser.close();throw new Error('Infrastructure setup deadline reached');}providerApi=await bootstrapClient(keycloakEnv);console.info('Setup: synthetic browser harness ready');
 authority=(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id;
 const cities=await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('SYNTHETIC_TUGUEGARAO','Synthetic Tuguegarao','ACTIVE'),('SYNTHETIC_OTHER','Synthetic other city','ACTIVE') RETURNING id,code`;city=cities.find(c=>c.code==='SYNTHETIC_TUGUEGARAO').id;otherCity=cities.find(c=>c.code==='SYNTHETIC_OTHER').id;
 const a=await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${city},'A','Synthetic A','VERIFIED'),(${city},'B','Synthetic B','VERIFIED'),(${otherCity},'C','Synthetic C','VERIFIED') RETURNING id,code`;todaA=a.find(t=>t.code==='A').id;todaB=a.find(t=>t.code==='B').id;todaC=a.find(t=>t.code==='C').id;
 for(const [c,t,label]of [[city,todaA,'A'],[city,todaB,'B'],[otherCity,todaC,'C']])await owner`INSERT INTO identity.driver_intake_scopes(city_tenant_id,toda_id,state,policy_reference,city_label,toda_label) VALUES(${c},${t},'OPEN',${randomUUID()},'SYNTHETIC_CITY',${'SYNTHETIC_TODA_'+label})`;
 await http('GET','/driver/me/verification/cases',undefined,null,401);await http('GET','/admin/verifications/todas/'+todaA+'/cases',undefined,null,401);
 note('Real AppModule: phone/driver/admin/verification cores; separate non-owner logins in SAME DB; real Redis PONG and Keycloak discovery; unauthenticated case/queue 401');
},180000);

async function http(method,path,body,credential,expected=200,extra={}){
 const headers={'idempotency-key':randomUUID(),...(credential?.token?{authorization:'Bearer '+credential.token}:{}),...(credential?.cookie?{cookie:credential.cookie,origin,...(credential.csrf?{'x-csrf-token':credential.csrf}:{})}:{}),...extra};
 const response=await app.inject({method,url:'/v1'+path,headers,...(body===undefined?{}:{payload:body}),remoteAddress:'127.0.0.1'});assert.equal(response.statusCode,expected,`${method} ${path} status ${response.statusCode}; expected ${expected}`);return expected===204?null:response.json();
}
async function driver(c=city,t=todaA){
 const binding={clientPurpose:'DRIVER',deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')},phone='+63998'+String(phoneCounter++).padStart(7,'0'),challenge=await http('POST','/auth/phone/challenges',{...binding,phone},null,202);
 const accepted=await http('POST','/auth/phone/challenges/'+challenge.challengeId+'/verify',{...binding,phone,code:messages.get(challenge.challengeId).code},null),credential={token:accepted.accessToken},profile=await http('GET','/driver/me',undefined,credential);
 await http('POST','/driver/me/consents',{noticeVersion:profile.requiredNoticeVersion,termsVersion:profile.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true},credential);
 const affiliation=await http('POST','/driver/toda-affiliation-requests',{cityTenantId:c,todaId:t},credential),[vehicle]=await owner`INSERT INTO identity.driver_synthetic_vehicles(city_tenant_id,toda_id,reference_code) VALUES(${c},${t},${'SYNTHETIC_'+randomBytes(6).toString('hex').toUpperCase()}) RETURNING id`,relationship=await http('POST','/driver/vehicle-relationships',{affiliationId:affiliation.id,vehicleId:vehicle.id},credential);
 return {...credential,userId:accepted.userId,sessionId:accepted.sessionId,relationshipId:relationship.id,affiliationId:affiliation.id,vehicleId:vehicle.id,city:c,toda:t};
}
async function staff(role='VERIFICATION_OFFICER',t=todaA,c=city,existingUser){
 const username='synthetic-v-'+randomUUID(),password=randomBytes(24).toString('base64url')+'!Aa1',secret=new Secret({size:20});
 await providerApi('/users','POST',{username,email:username+'@example.invalid',emailVerified:true,enabled:true,firstName:'Synthetic',lastName:'Verification',credentials:[{type:'password',value:password,temporary:false},{type:'otp',temporary:false,secretData:JSON.stringify({value:secret.base32}),credentialData:JSON.stringify({subType:'totp',digits:6,counter:0,period:30,algorithm:'HmacSHA1',secretEncoding:'BASE32'})}]});
 const [providerUser]=await providerApi('/users?username='+encodeURIComponent(username)+'&exact=true'),userId=existingUser??(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id;
 const [identity]=await owner`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at) VALUES(${userId},'KEYCLOAK',${admin.settings.issuer},${admin.secrets.identity.lookup(providerUser.id,'KEYCLOAK')},${admin.secrets.keyId},${admin.secrets.identity.encrypt(providerUser.id,'KEYCLOAK')},now()) RETURNING id`;
 await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state) VALUES(${identity.id},${userId},${authority},${randomUUID()},'APPROVED')`;
 await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${userId},${c},'ACTIVE') ON CONFLICT DO NOTHING`;
 const [grant]=await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,expires_at) VALUES(${userId},${c},${t},${role},'TODA',${authority},now()+interval '1 hour') RETURNING id`;
 const result={userId,grantId:grant.id,username,password,totp:new TOTP({secret,algorithm:'SHA1',digits:6,period:30})};await loginStaff(result);return result;
}
async function loginStaff(staff){
 const start=await app.inject({method:'POST',url:'/v1/admin/auth/login',headers:{origin,'idempotency-key':randomUUID()},payload:{clientProof:randomBytes(32).toString('base64url')}});assert.equal(start.statusCode,200);
 const flowCookies=start.headers['set-cookie'],flowCookie=(Array.isArray(flowCookies)?flowCookies:[flowCookies]).find(c=>String(c).startsWith(admin.settings.flowCookieName+'=')).split(';')[0],context=await browser.newContext(),page=await context.newPage();let callback,stage='password page';
 try{
  await page.goto(start.json().authorizationUrl);if(!report.screenshots.length){await mkdir(new URL('../evidence/m2/m2-6/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../evidence/m2/m2-6/reviewer-sign-in.png',import.meta.url)),fullPage:true});report.screenshots.push('reviewer-sign-in.png');}
  await page.locator('#username').fill(staff.username+'@example.invalid');await page.locator('#password').fill(staff.password);await page.locator('#kc-login').click();await page.locator('#otp').waitFor();stage='TOTP submission';
  if(report.screenshots.length===1){await page.screenshot({path:fileURLToPath(new URL('../evidence/m2/m2-6/reviewer-totp.png',import.meta.url)),fullPage:true,mask:[page.locator('input, #kc-username, #kc-attempted-username')]});report.screenshots.push('reviewer-totp.png');}
  await page.route(url=>url.port===new URL(keycloakEnv.KEYCLOAK_ISSUER).port&&url.pathname.includes('/login-actions/authenticate'),async route=>{const response=await route.fetch({maxRedirects:0}),location=response.headers().location;if(location&&new URL(location,route.request().url()).origin===origin){callback=new URL(location,route.request().url());await route.fulfill({status:200,body:'Synthetic verification callback captured; no credentials logged'});}else await route.fulfill({response});});
  const remaining=30000-Date.now()%30000;if(remaining<5000||staff.lastOtpStep===Math.floor(Date.now()/30000))await new Promise(resolve=>setTimeout(resolve,remaining+200));staff.lastOtpStep=Math.floor(Date.now()/30000);await page.locator('#otp').fill(staff.totp.generate());await page.locator('#kc-login').click();for(let i=0;i<100&&!callback;i++)await new Promise(resolve=>setTimeout(resolve,50));assert.ok(callback,'Real provider callback captured');
  stage='BFF callback';const accepted=await app.inject({method:'GET',url:callback.pathname+callback.search,headers:{cookie:flowCookie}});assert.equal(accepted.statusCode,303,'BFF callback accepted actual password/TOTP proof');const cookies=accepted.headers['set-cookie'];staff.cookie=(Array.isArray(cookies)?cookies:[cookies]).find(c=>String(c).startsWith(admin.settings.cookieName+'=')).split(';')[0];
  stage='application session';const session=await http('GET','/admin/auth/session',undefined,staff);staff.csrf=session.csrfToken;staff.sessionId=session.sessionId;staff.authenticatedAt=Date.now();
 }catch(error){throw new Error('Synthetic Keycloak/BFF step failed: '+stage+'; '+(typeof error.actual==='number'?'actual HTTP '+error.actual:'details redacted'));}finally{await context.close();}
}
async function evidence(d,kind,ttl=3600,capacity=kind==='VEHICLE'?2:null){const id=randomUUID();await owner.begin(async tx=>{await tx`INSERT INTO identity.verification_evidence_heads(id,user_id,city_tenant_id,toda_id,relationship_id,kind,current_version) VALUES(${id},${d.userId},${d.city},${d.toda},${d.relationshipId},${kind},1)`;await tx`INSERT INTO identity.verification_evidence_versions(evidence_id,evidence_version,digest,reference_code,seat_capacity,valid_until) VALUES(${id},1,${randomBytes(32).toString('hex')},'SYNTHETIC_V1',${capacity},clock_timestamp()+(${ttl}*interval '1 second'))`;});return {evidenceId:id,evidenceVersion:1};}
async function assign(caseId,reviewer){const [c]=await owner`SELECT * FROM identity.verification_cases WHERE id=${caseId}`,next=(c.assignment_version??0)+1;await owner.begin(async tx=>{await tx`INSERT INTO identity.verification_assignments(case_id,assignment_version,user_id,city_tenant_id,toda_id,relationship_id,kind,reviewer_user_id,assigned_by) VALUES(${c.id},${next},${c.user_id},${c.city_tenant_id},${c.toda_id},${c.relationship_id},${c.kind},${reviewer.userId},${authority})`;await tx`UPDATE identity.verification_cases SET assignment_version=${next},version=version+1 WHERE id=${c.id}`;});}
async function submitted(d,kind,reviewer){const e=await evidence(d,kind),opened=await http('POST','/driver/me/verification/cases',{relationshipId:d.relationshipId,kind},d),s=await http('POST','/driver/me/verification/cases/'+opened.id+'/submit',{expectedVersion:opened.version,...e},d);if(reviewer)await assign(s.id,reviewer);const detail=await http('GET','/driver/me/verification/cases/'+s.id,undefined,d);return {case:detail.case,evidence:e};}
const decision=(c,e,outcome='APPROVE')=>({expectedVersion:c.version,evidenceVersion:e.evidenceVersion,outcome,reasonCode:({APPROVE:'SYNTHETIC_ACCEPTED',REJECT:'SYNTHETIC_INCOMPLETE',REVOKE:'SYNTHETIC_WITHDRAWN',EXPIRE:'SYNTHETIC_EXPIRED'})[outcome]});
test('all Drizzle columns, PK/unique/FK/check/index definitions match PostgreSQL', async () => {await owner.begin(async owner=>{
  const {getTableConfig,PgDialect}=req('drizzle-orm/pg-core'),{is,SQL}=req('drizzle-orm');
  const tables=Object.values(req('./dist/src/database/verification-schema.js')).filter(x=>x && x[Symbol.for('drizzle:IsDrizzleTable')]);
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
});});

test('driver can submit synthetic cases; assigned real-TOTP reviewer approves scoped driver/vehicle and TODA manager reviews membership',async()=>{
 fixtures.drivers=new Map();fixtures.officer=await staff();fixtures.manager=await staff('TODA_MANAGER');const d=await driver();fixtures.drivers.set(d.userId,d);fixtures.driver=d;
 const list=await http('GET','/driver/me/verification/evidence',undefined,d);assert.deepEqual(list.items,[]);
 // Existing SUBMITTED cases must survive upgrading the function without rewritten snapshots.
 await runMigrations(owner,'down',{allowIdentity:true,report:()=>{}});
 const pending=[];for(const kind of ['DRIVER','VEHICLE','TODA_MEMBERSHIP'])pending.push(await submitted(d,kind,kind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer));
 const snapshots=await owner`SELECT s.* FROM identity.verification_submissions s JOIN identity.verification_cases c ON c.id=s.case_id WHERE c.user_id=${d.userId} ORDER BY s.case_id`;
 await runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:()=>{}});
 assert.deepEqual(await owner`SELECT s.* FROM identity.verification_submissions s JOIN identity.verification_cases c ON c.id=s.case_id WHERE c.user_id=${d.userId} ORDER BY s.case_id`,snapshots);
 for(const item of pending){const kind=item.case.kind,reviewer=kind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer,path=kind==='TODA_MEMBERSHIP'?'memberships':'cases';
  const result=await http('POST','/admin/verifications/'+path+'/'+item.case.id+'/decisions',decision(item.case,item.evidence),reviewer);assert.equal(result.state,'APPROVED');assert.equal(result.operationalServicesEnabled,false);
 }
 assert.equal((await owner`SELECT state FROM identity.driver_profiles WHERE user_id=${d.userId}`)[0].state,'VERIFIED');assert.equal((await owner`SELECT seat_capacity FROM identity.driver_synthetic_vehicles WHERE id=${d.vehicleId}`)[0].seat_capacity,2);
 const eligibility=await http('GET',`/driver/cities/${city}/todas/${todaA}/eligibility`,undefined,d);assert.equal(eligibility.identityEligible,false);assert.equal(eligibility.canGoOnline,false);assert.equal(eligibility.realDriverApproved,false);
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.driver_scope_assertions WHERE user_id=${d.userId}`)[0].n,0);assert.equal((await owner`SELECT count(*)::int AS n FROM identity.city_memberships WHERE user_id=${d.userId}`)[0].n,0);
 const events=await owner`SELECT a.action,o.event_type FROM identity.audit_events a JOIN identity.outbox_events o ON o.audit_event_id=a.id WHERE a.action='verification.approved'`;assert.equal(events.length,3);
 note('Actual mock driver OTP/consent/intake -> synthetic evidence submission -> real Keycloak password/TOTP officer and manager review; projected facts verified and capacity fixture-bound; no city membership/permit assertion/real operation; 3 atomic approval audit/outbox events');
});

async function revise(e,ttl=3600,capacity=null){const next=e.evidenceVersion+1;await owner.begin(async tx=>{await tx`INSERT INTO identity.verification_evidence_versions(evidence_id,evidence_version,digest,reference_code,seat_capacity,valid_until) VALUES(${e.evidenceId},${next},${randomBytes(32).toString('hex')},${'SYNTHETIC_V'+next},${capacity},clock_timestamp()+(${ttl}*interval '1 second'))`;await tx`UPDATE identity.verification_evidence_heads SET current_version=${next} WHERE id=${e.evidenceId}`;});return {...e,evidenceVersion:next};}
async function detail(d,id){return (await http('GET','/driver/me/verification/cases/'+id,undefined,d)).case;}
async function review(item,reviewer=fixtures.officer,outcome='APPROVE',status=200,headers={}){return http('POST','/admin/verifications/'+(item.case.kind==='TODA_MEMBERSHIP'?'memberships':'cases')+'/'+item.case.id+'/decisions',decision(item.case,item.evidence,outcome),reviewer,status,headers);}

test('current evidence is required even for an otherwise eligible synthetic fixture; online and dispatch remain disabled',async()=>{
 const d=fixtures.driver;await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${d.userId},${city},'ACTIVE')`;
 await owner`INSERT INTO identity.driver_scope_assertions(user_id,city_tenant_id,toda_id,relationship_id,profile_version,affiliation_version,vehicle_version,relationship_version,intake_version,permit_reference,policy_reference,policy_version,effective_from,expires_at)
 SELECT ${d.userId},${city},${todaA},r.id,p.version,a.version,v.version,r.version,i.version,${randomUUID()},i.policy_reference,i.version,now(),now()+interval '1 hour' FROM identity.driver_profiles p JOIN identity.driver_vehicle_relationships r ON r.user_id=p.user_id JOIN identity.driver_toda_affiliations a ON a.id=r.affiliation_id JOIN identity.driver_synthetic_vehicles v ON v.id=r.vehicle_id JOIN identity.driver_intake_scopes i ON i.city_tenant_id=r.city_tenant_id AND i.toda_id=r.toda_id WHERE r.id=${d.relationshipId}`;
 const path=`/driver/cities/${city}/todas/${todaA}/eligibility`,positive=await http('GET',path,undefined,d);assert.equal(positive.identityEligible,true);assert.equal(positive.canGoOnline,false);assert.equal(positive.realDriverApproved,false);
 const [row]=await owner`SELECT c.id,s.evidence_id,s.evidence_version FROM identity.verification_cases c JOIN identity.verification_submissions s ON s.case_id=c.id AND s.round=c.current_round WHERE c.user_id=${d.userId} AND c.kind='DRIVER'`;await revise({evidenceId:row.evidence_id,evidenceVersion:row.evidence_version});
 const stale=await detail(d,row.id);assert.equal(stale.state,'APPROVED');assert.equal(stale.effectiveState,'STALE');assert.equal(stale.evidenceCurrent,false);const denied=await http('GET',path,undefined,d);assert.equal(denied.identityEligible,false);assert.ok(denied.reasons.includes('VERIFICATION_CASES_NOT_CURRENT'));
 for(const [method,url]of [['POST','/driver/shifts'],['POST','/driver/locations'],['GET','/driver/offers']])await http(method,url,undefined,d,403);
 note('Explicit owner-only synthetic permit assertion proves positive identity eligibility with all operational flags false; replacing accepted evidence immediately denies eligibility and marks case STALE');
});

test('independently submitted sibling cases complete in every approval order and concurrently without revising evidence',async()=>{
 const kinds=['DRIVER','VEHICLE','TODA_MEMBERSHIP'],orders=[];for(const a of kinds)for(const b of kinds.filter(k=>k!==a))orders.push([a,b,kinds.find(k=>k!==a&&k!==b)]);
 for(const order of [...orders,null]){
  const d=await driver(),items=new Map();for(const kind of kinds)items.set(kind,await submitted(d,kind,kind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer));
  const before=await owner`SELECT s.* FROM identity.verification_submissions s JOIN identity.verification_cases c ON c.id=s.case_id WHERE c.user_id=${d.userId} ORDER BY s.case_id`;
  const approve=kind=>review(items.get(kind),kind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer);
  const results=order?await (async()=>{const out=[];for(const kind of order)out.push(await approve(kind));return out;})():await Promise.all(kinds.map(approve));
  assert.ok(results.every(r=>r.state==='APPROVED'&&r.round===1&&r.operationalServicesEnabled===false));
  assert.deepEqual(await owner`SELECT s.* FROM identity.verification_submissions s JOIN identity.verification_cases c ON c.id=s.case_id WHERE c.user_id=${d.userId} ORDER BY s.case_id`,before);
  const counts=await owner`SELECT projection_count FROM identity.verification_projection_versions WHERE profile_user_id=${d.userId} OR affiliation_id=${d.affiliationId} OR vehicle_id=${d.vehicleId} OR relationship_id=${d.relationshipId}`;
  assert.equal(counts.length,4);assert.ok(counts.every(r=>r.projection_count===1));
  const facts=await owner`SELECT p.version AS profile,a.version AS affiliation,v.version AS vehicle,r.version AS relationship FROM identity.driver_profiles p JOIN identity.driver_vehicle_relationships r ON r.user_id=p.user_id JOIN identity.driver_toda_affiliations a ON a.id=r.affiliation_id JOIN identity.driver_synthetic_vehicles v ON v.id=r.vehicle_id WHERE r.id=${d.relationshipId}`;
  assert.deepEqual({...facts[0]},{profile:2,affiliation:2,vehicle:2,relationship:2});
  const history=await owner`SELECT d.outcome FROM identity.verification_decisions d JOIN identity.verification_cases c ON c.id=d.case_id WHERE c.user_id=${d.userId}`;assert.equal(history.length,3);assert.ok(history.every(r=>r.outcome==='APPROVE'));
  const events=await owner`SELECT a.id FROM identity.audit_events a JOIN identity.outbox_events o ON o.audit_event_id=a.id JOIN identity.verification_cases c ON c.id=a.resource_id WHERE c.user_id=${d.userId} AND a.action='verification.approved'`;assert.equal(events.length,3);
 }
 note('All six sibling approval permutations and simultaneous reviews succeed on original round-1 evidence; general row versions still advance and each decision has one atomic audit/outbox');
});

test('projection credits cannot hide genuine target revisions or be forged by callers',async()=>{
 for(const target of ['profile','affiliation','vehicle','relationship']){
  const d=await driver(),pending=new Map();for(const kind of ['DRIVER','VEHICLE','TODA_MEMBERSHIP'])pending.set(kind,await submitted(d,kind,kind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer));
  // First project a different target, then mutate an evidence-relevant version.
  const approvedKind=target==='affiliation'?'DRIVER':'TODA_MEMBERSHIP';await review(pending.get(approvedKind),approvedKind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer);
  if(target==='profile')await owner`UPDATE identity.driver_profiles SET version=version+1 WHERE user_id=${d.userId}`;
  if(target==='affiliation')await owner`UPDATE identity.driver_toda_affiliations SET version=version+1 WHERE id=${d.affiliationId}`;
  if(target==='vehicle')await owner`UPDATE identity.driver_synthetic_vehicles SET version=version+1,seat_capacity=3 WHERE id=${d.vehicleId}`;
  if(target==='relationship')await owner`UPDATE identity.driver_vehicle_relationships SET version=version+1 WHERE id=${d.relationshipId}`;
  const kind=target==='affiliation'?'TODA_MEMBERSHIP':'VEHICLE',item=pending.get(kind);await review(item,kind==='TODA_MEMBERSHIP'?fixtures.manager:fixtures.officer,'APPROVE',409);
  assert.equal((await detail(d,item.case.id)).state,'SUBMITTED');assert.equal((await owner`SELECT count(*)::int AS n FROM identity.verification_decisions WHERE case_id=${item.case.id}`)[0].n,0);
 }
 await assert.rejects(owner`INSERT INTO identity.verification_projection_versions(profile_user_id) VALUES(${fixtures.driver.userId})`,e=>e.code==='23514');
 await assert.rejects(owner`UPDATE identity.verification_projection_versions SET projection_count=projection_count+1`,e=>e.code==='23514');
 await assert.rejects(connection`SELECT * FROM identity.verification_projection_versions`,e=>e.code==='42501');
 await assert.rejects(connection`UPDATE identity.verification_projection_versions SET projection_count=projection_count+1`,e=>e.code==='42501');
 note('All four genuine target version changes still reject approval, including cross-kind profile changes after a sibling projection; direct metadata insertion/update/read remains denied');
});

test('ownership, assignment, exact role/scope, CSRF and input boundaries deny unauthorized review',async()=>{
 const d=await driver(),foreign=await driver(city,todaB),item=await submitted(d,'DRIVER',fixtures.officer);fixtures.pending=item;fixtures.pendingDriver=d;
 await http('GET','/driver/me/verification/cases/'+item.case.id,undefined,foreign,403);await http('POST','/driver/me/verification/cases',{relationshipId:d.relationshipId,kind:'VEHICLE'},foreign,403);
 await review(item,fixtures.manager,'APPROVE',403);const unassigned=await submitted(foreign,'DRIVER');await review(unassigned,fixtures.officer,'APPROVE',403);await assign(unassigned.case.id,fixtures.officer);unassigned.case=await detail(foreign,unassigned.case.id);await review(unassigned,fixtures.officer,'APPROVE',403);
 await http('GET','/admin/verifications/todas/'+todaB+'/cases',undefined,fixtures.officer,403);await http('GET','/admin/verifications/todas/'+todaC+'/cases',undefined,fixtures.officer,403);const queue=await http('GET','/admin/verifications/todas/'+todaA+'/cases',undefined,fixtures.officer),queued=[...queue.items],cursors=new Set();let cursor=queue.nextCursor;
 while(cursor){assert.equal(cursors.has(cursor),false,'Queue cursor must advance');cursors.add(cursor);const page=await http('GET','/admin/verifications/todas/'+todaA+'/cases?after='+encodeURIComponent(cursor),undefined,fixtures.officer);queued.push(...page.items);cursor=page.nextCursor;}
 assert.ok(cursors.size>0,'Expanded sibling fixtures exercise multiple queue pages');assert.equal(new Set(queued.map(c=>c.id)).size,queued.length);assert.ok(queued.every(c=>c.todaId===todaA));assert.ok(queued.some(c=>c.id===item.case.id));assert.equal(queued.some(c=>c.id===unassigned.case.id),false);
 await review(item,fixtures.officer,'APPROVE',403,{'x-csrf-token':'invalid'});await review(item,fixtures.officer,'APPROVE',403,{origin:'https://attacker.invalid'});
 await http('POST','/admin/verifications/cases/'+item.case.id+'/decisions',{...decision(item.case,item.evidence),seatCapacity:99},fixtures.officer,400);
 await http('POST','/driver/me/verification/cases',{relationshipId:d.relationshipId,kind:'VEHICLE',status:'APPROVED'},d,400);
 await http('GET','/driver/me/verification/cases?cityTenantId='+otherCity,undefined,d,400);
 const wrongKind=await submitted(d,'TODA_MEMBERSHIP',fixtures.manager);await http('GET','/admin/verifications/cases/'+wrongKind.case.id,undefined,fixtures.manager,403);await http('GET','/admin/verifications/memberships/'+item.case.id,undefined,fixtures.officer,403);
 await owner`UPDATE identity.scoped_role_assignments SET revoked_at=now() WHERE id=${fixtures.officer.grantId}`;await review(item,fixtures.officer,'APPROVE',403);await owner`UPDATE identity.scoped_role_assignments SET revoked_at=NULL WHERE id=${fixtures.officer.grantId}`;
 await owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now(),version=version+1 WHERE id=${fixtures.officer.sessionId}`;await review(item,fixtures.officer,'APPROVE',401);await loginStaff(fixtures.officer);
 await assert.rejects(owner.begin(async tx=>{await tx`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${d.userId},${city},'ACTIVE')`;await tx`INSERT INTO identity.verification_assignments(case_id,assignment_version,user_id,city_tenant_id,toda_id,relationship_id,kind,reviewer_user_id,assigned_by) VALUES(${item.case.id},2,${d.userId},${city},${todaA},${d.relationshipId},'DRIVER',${d.userId},${authority})`;}),e=>e.code==='23514');
 note('Actual HTTP denies foreign driver/relationship, unassigned reviewer, wrong role/TODA/kind, revoked app session/grant, CSRF/Origin and mass assignment; real password/TOTP reauthentication restores a new session; DB denies self-assignment');
});

test('stale evidence/targets/policy are rejected; rejection and revised resubmission preserve immutable history',async()=>{
 const d=fixtures.pendingDriver,item=fixtures.pending;let next=await revise(item.evidence);await review(item,fixtures.officer,'APPROVE',409);let rejected=await review(item,fixtures.officer,'REJECT');assert.equal(rejected.state,'REJECTED');
 await http('POST','/driver/me/verification/cases/'+item.case.id+'/submit',{expectedVersion:rejected.version,...item.evidence},d,409);
 let current=await http('POST','/driver/me/verification/cases/'+item.case.id+'/submit',{expectedVersion:rejected.version,...next},d);item.case=current;item.evidence=next;
 await owner`UPDATE identity.driver_profiles SET version=version+1 WHERE user_id=${d.userId}`;await review(item,fixtures.officer,'APPROVE',409);rejected=await review(item,fixtures.officer,'REJECT');next=await revise(next);
 current=await http('POST','/driver/me/verification/cases/'+item.case.id+'/submit',{expectedVersion:rejected.version,...next},d);item.case=current;item.evidence=next;
 await owner`UPDATE identity.driver_intake_scopes SET version=version+1,policy_reference=${randomUUID()} WHERE city_tenant_id=${city} AND toda_id=${todaA}`;await review(item,fixtures.officer,'APPROVE',409);rejected=await review(item,fixtures.officer,'REJECT');next=await revise(next);
 current=await http('POST','/driver/me/verification/cases/'+item.case.id+'/submit',{expectedVersion:rejected.version,...next},d);item.case=current;item.evidence=next;const approved=await review(item);assert.equal(approved.state,'APPROVED');
 const history=await http('GET','/driver/me/verification/cases/'+item.case.id,undefined,d);assert.equal(history.submissions.length,4);assert.deepEqual(history.decisions.map(x=>x.outcome),['REJECT','REJECT','REJECT','APPROVE']);assert.equal(history.historyTruncated,false);
 for(const table of ['verification_evidence_versions','verification_submissions','verification_assignments','verification_decisions','verification_receipts'])await assert.rejects(owner.unsafe(`DELETE FROM identity.${table}`),e=>e.code==='23514');
 fixtures.reapply={...item,case:approved};note('Stale evidence, profile and intake-policy revisions each deny approval; explicit rejection permits revised resubmission; 4 immutable rounds retain all 4 decisions');
});

test('idempotent retries and concurrent decisions produce one projection and one audit/outbox; failed audit rolls back all state',async()=>{
 const d=await driver(),item=await submitted(d,'VEHICLE',fixtures.officer),key=randomUUID(),headers={'idempotency-key':key};const results=await Promise.all([review(item,fixtures.officer,'APPROVE',200,headers),review(item,fixtures.officer,'APPROVE',200,headers)]);assert.deepEqual(results[0],results[1]);
 await review(item,fixtures.officer,'REJECT',409,headers);assert.equal((await owner`SELECT count(*)::int AS n FROM identity.verification_decisions WHERE case_id=${item.case.id}`)[0].n,1);assert.equal((await owner`SELECT version FROM identity.driver_synthetic_vehicles WHERE id=${d.vehicleId}`)[0].version,2);
 const other=await submitted(d,'DRIVER',fixtures.officer);const responses=await Promise.all(Array.from({length:2},()=>app.inject({method:'POST',url:'/v1/admin/verifications/cases/'+other.case.id+'/decisions',headers:{cookie:fixtures.officer.cookie,origin,'x-csrf-token':fixtures.officer.csrf,'idempotency-key':randomUUID()},payload:decision(other.case,other.evidence)})));assert.deepEqual(responses.map(x=>x.statusCode).sort(),[200,409]);
 const fail=await submitted(d,'TODA_MEMBERSHIP',fixtures.manager);await owner.unsafe("CREATE FUNCTION public.fail_verification_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='verification.approved' THEN RAISE EXCEPTION 'synthetic audit outage';END IF;RETURN NEW;END $$");await owner.unsafe('CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON identity.audit_events FOR EACH ROW EXECUTE FUNCTION public.fail_verification_audit()');
 try{await review(fail,fixtures.manager,'APPROVE',503);assert.equal((await detail(d,fail.case.id)).state,'SUBMITTED');assert.equal((await owner`SELECT count(*)::int AS n FROM identity.verification_decisions WHERE case_id=${fail.case.id}`)[0].n,0);assert.equal((await owner`SELECT state FROM identity.driver_toda_affiliations WHERE id=${d.affiliationId}`)[0].state,'PENDING');assert.equal((await owner`SELECT count(*)::int AS n FROM identity.verification_projection_versions WHERE affiliation_id=${d.affiliationId}`)[0].n,0);}finally{await owner.unsafe('DROP TRIGGER synthetic_audit_failure ON identity.audit_events');await owner.unsafe('DROP FUNCTION public.fail_verification_audit()');}
 assert.equal((await review(fail,fixtures.manager)).state,'APPROVED');note('Concurrent same-key requests return identical original result; changed-body 409; distinct-key decisions have one winner; forced audit failure rolls back decision/projection/receipt/outbox then retry succeeds');
});

test('revocation, expiry and resubmission deny stale eligibility without overwriting later approvals',async()=>{
 const d=fixtures.pendingDriver,item=fixtures.reapply,revoked=await review(item,fixtures.officer,'REVOKE');assert.equal(revoked.state,'REVOKED');assert.equal((await owner`SELECT state FROM identity.driver_profiles WHERE user_id=${d.userId}`)[0].state,'REVOKED');
 const next=await revise(item.evidence,15),s=await http('POST','/driver/me/verification/cases/'+item.case.id+'/submit',{expectedVersion:revoked.version,...next},d),approved=await review({case:s,evidence:next});
 await review({case:approved,evidence:next},fixtures.officer,'EXPIRE',409);
 const [vehicle]=await owner`INSERT INTO identity.driver_synthetic_vehicles(city_tenant_id,toda_id,reference_code) VALUES(${city},${todaA},${'SYNTHETIC_'+randomBytes(6).toString('hex').toUpperCase()}) RETURNING id`,relationship=await http('POST','/driver/vehicle-relationships',{affiliationId:d.affiliationId,vehicleId:vehicle.id},d),later=await submitted({...d,relationshipId:relationship.id,vehicleId:vehicle.id},'DRIVER',fixtures.officer);await review(later);const [laterFact]=await owner`SELECT verification_reference FROM identity.driver_profiles WHERE user_id=${d.userId}`;
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,new Date(approved.validUntil).getTime()-Date.now()+100)));
 assert.equal((await detail(d,item.case.id)).effectiveState,'EXPIRED');const expired=await review({case:approved,evidence:next},fixtures.officer,'EXPIRE');assert.equal(expired.state,'EXPIRED');const [fact]=await owner`SELECT state,verification_reference FROM identity.driver_profiles WHERE user_id=${d.userId}`;assert.equal(fact.state,'VERIFIED');assert.equal(fact.verification_reference,laterFact.verification_reference);
 note('Explicit revocation invalidates projected facts; actual DB-clock expiry denies current approval before EXPIRE records history; revised reapplication appends rounds without rewriting prior decisions');
});

test('generated driver client validates actual verification HTTP contracts and optional cursor transport',async()=>{
 const {createDriverClient}=req('../../.cache/contract-tests/src/driver-client.js'),sdk=createDriverClient('http://127.0.0.1:4104/v1',async(url,init)=>{const u=new URL(url),r=await app.inject({method:init.method,url:u.pathname+u.search,headers:init.headers,payload:init.body});return new Response(r.statusCode===204?null:r.body,{status:r.statusCode,headers:r.headers});}),d=fixtures.driver;
 const choices=await sdk.request('listDriverSyntheticEvidence',{accessToken:d.token});assert.ok(choices.items.length>0);const cases=await sdk.request('listDriverVerificationCases',{accessToken:d.token});assert.ok(cases.items.length>0);const one=await sdk.request('getDriverVerificationCase',{accessToken:d.token,caseId:cases.items[0].id});assert.equal(one.case.source,'SYNTHETIC_ONLY');const page=await sdk.request('listDriverVerificationCases',{accessToken:d.token,after:cases.items.at(-1).id});assert.ok(page.items.every(c=>c.id>cases.items.at(-1).id));
 note('Generated stateless driver SDK validates real evidence/list/detail response schemas, false operational flags and optional query cursor; no fixture OTP/token endpoint exists');
});

test('SQL privileges, RLS and pooled contexts isolate users/scopes and prohibit direct approvals or evidence provisioning',async()=>{
 const d=fixtures.driver;await connection.begin(async tx=>{await tx`SELECT set_config('trissea.user_id',${d.userId},true),set_config('trissea.client_purpose','DRIVER',true)`;assert.ok((await tx`SELECT * FROM identity.verification_cases`).every(c=>c.user_id===d.userId));});assert.equal((await connection`SELECT count(*)::int AS n FROM identity.verification_cases`)[0].n,0);
 const [ownCase]=await owner`SELECT id FROM identity.verification_cases WHERE user_id=${d.userId} LIMIT 1`;assert.equal((await connection`SELECT identity.verification_locate(${ownCase.id}) AS resource`)[0].resource,null);
 for(const statement of ["UPDATE identity.driver_profiles SET state='VERIFIED'","UPDATE identity.verification_cases SET assignment_version=1","INSERT INTO identity.verification_evidence_heads DEFAULT VALUES","SELECT subject_ciphertext FROM identity.auth_identities","SELECT cookie_digest FROM identity.admin_browser_sessions","SET ROLE trissea_m2_verification_writer"] )await assert.rejects(connection.unsafe(statement),e=>e.code==='42501');
 const fns=await owner`SELECT p.proname,p.prosecdef,p.proconfig,r.rolname,r.rolsuper,r.rolcanlogin,r.rolbypassrls FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='identity' AND p.proname IN ('verification_locate','verification_target','check_verification_decision','project_verification_decision','driver_verification_current')`;assert.equal(fns.length,5);for(const f of fns){assert.equal(f.prosecdef,true);assert.equal(f.rolname,'trissea_m2_verification_writer');assert.equal(f.rolsuper||f.rolcanlogin||f.rolbypassrls,false);assert.ok(f.proconfig.includes('search_path=pg_catalog, pg_temp'));}
 await assert.rejects(owner`INSERT INTO identity.verification_cases(user_id,city_tenant_id,toda_id,relationship_id,kind) VALUES(${d.userId},${otherCity},${todaC},${d.relationshipId},'VEHICLE')`,e=>e.code==='23503');
 const persisted=JSON.stringify(await owner`SELECT to_jsonb(v) AS value FROM identity.verification_receipts v UNION ALL SELECT to_jsonb(c) FROM identity.verification_cases c UNION ALL SELECT to_jsonb(a) FROM identity.audit_events a`);for(const sensitive of [d.token,fixtures.officer.cookie,fixtures.officer.csrf,fixtures.officer.password,fixtures.officer.totp.secret.base32])assert.equal(persisted.includes(sensitive),false,'No plaintext credential in verification receipts/cases/audit');
 note('Non-owner runtime cannot directly approve/provision/assign/read auth ciphertext; RLS owner data and empty recycled pool context verified; composite FK denies cross-city relationship; hardened projection owner is NOLOGIN/NOSUPERUSER/NOBYPASSRLS');
});

test('populated 0007 rollback/reapply preserves prior driver facts, migration checksums and unrelated records',async()=>{
 const verificationBefore=await owner`SELECT to_jsonb(c) AS row FROM identity.verification_cases c ORDER BY id`,submissionsBefore=await owner`SELECT to_jsonb(s) AS row FROM identity.verification_submissions s ORDER BY case_id,round`;
 await runMigrations(owner,'down',{allowIdentity:true,report:note});
 assert.deepEqual(await owner`SELECT to_jsonb(c) AS row FROM identity.verification_cases c ORDER BY id`,verificationBefore);assert.deepEqual(await owner`SELECT to_jsonb(s) AS row FROM identity.verification_submissions s ORDER BY case_id,round`,submissionsBefore);
 const before=await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations WHERE id<>'0007_synthetic_verification' ORDER BY id`,profiles=await owner`SELECT user_id,state,version FROM identity.driver_profiles ORDER BY user_id`;
 await runMigrations(owner,'down',{allowIdentity:true,report:note});assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`,before);assert.deepEqual(await owner`SELECT user_id,state,version FROM identity.driver_profiles ORDER BY user_id`,profiles);assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-verification-preservation');await runMigrations(owner,'up',{through:'0007_synthetic_verification',allowIdentity:true,report:note});
 assert.equal((await owner`SELECT count(*)::int AS n FROM identity.verification_cases`)[0].n,0);await runMigrations(owner,'up',{through:'0008_verification_projection_versions',allowIdentity:true,report:note});note('Populated 0008 down preserves cases/submissions, then disposable rollback removes ONLY 0007 metadata, preserves earlier driver facts/ledger/sentinel; reapply empty-case guard keeps old projections ineligible');
});
