import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { before, after, test as nodeTest } from 'node:test';
import postgres from 'postgres';
import { chromium } from '@playwright/test';
import { TOTP, Secret } from 'otpauth';
import { runMigrations } from './migration-runner.mjs';
import { assertLocalDatabase, assertDisposableIdentityDatabase } from './migration-policy.mjs';
import { bootstrapClient } from './provision-keycloak-local.mjs';

// All records are synthetic, scoped to a newly created disposable DB and isolated realm.
// Never print provider codes, callback URLs, passwords, TOTP seeds or credentials.
const req = createRequire(new URL('../services/api/package.json', import.meta.url));
req('reflect-metadata');
const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const controlEnv = parseEnv(await readFile(new URL('../.env.m2-test', import.meta.url), 'utf8'));
const suffix = randomBytes(6).toString('hex'), database = `trissea_m2_test_${suffix}`;
const settings = { max: 5, onnotice: () => {}, connect_timeout: 5, connection: { timezone: 'UTC', statement_timeout: 15000, lock_timeout: 5000 } };
const report = { executedAt: new Date().toISOString(), database, syntheticOnly: true, keycloak: '26.8.2', tests: [], checks: [], screenshots: [] };
const note = message => { report.checks.push(message); console.info(message); };
const test = (name, work) => nodeTest(name, { timeout: 120000 }, async context=>{try{await work(context);report.tests.push({name,result:'PASSED'});}catch(error){report.tests.push({name,result:'FAILED'});if(error.name==='TimeoutError')throw new Error('Browser timeout; protocol URL and credentials redacted');throw error;}});
let control, owner, runtimeConnection, app, browser, vite, providerApi, secrets, authority, city, todaA, todaB, runtime;
let viteOutput='';
const origin = 'http://127.0.0.1:5174', apiOrigin = 'http://127.0.0.1:4102';

before(async () => {
  const url = new URL(controlEnv.M2_TEST_CONTROL_URL);
  assertLocalDatabase(url.href, controlEnv.NODE_ENV);
  assert.equal(url.pathname, '/m2_control'); assert.equal(controlEnv.M2_DISPOSABLE_DATABASE, 'true');
  control = postgres(url.href, settings);
  await control.unsafe(`CREATE DATABASE "${database}"`); url.pathname = '/' + database;
  assertDisposableIdentityDatabase(url.href, controlEnv.NODE_ENV, controlEnv.M2_DISPOSABLE_DATABASE);
  owner = postgres(url.href, settings);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;
  await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
  await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;
  await owner`INSERT INTO unrelated_preservation VALUES(1,'synthetic-admin-preservation')`;
  await runMigrations(owner, 'up', { through: '0005_driver_identity', allowIdentity: true, report: () => {} });
  const keys = JSON.parse(await readFile(new URL('../' + env.ADMIN_KEYS_FILE, import.meta.url), 'utf8'));
  const { PassengerSecrets } = req('./dist/src/auth/passenger/passenger-settings.js');
  secrets = new PassengerSecrets(keys.keyId, ...['encryptionKey','lookupKey','otpKey','coordinationKey','refreshKey'].map(k => Buffer.from(keys[k], 'base64url')));
  providerApi = await bootstrapClient(env);
});

after(async () => {
  await browser?.close(); await app?.close(); vite?.kill();
  await Promise.allSettled([runtimeConnection?.end(), owner?.end(), control?.end()]);
  await mkdir(new URL('../.cache/m2-admin/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.cache/m2-admin/results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
});

test('0006 fresh/repeat/failed commit/rollback/reapply preserves M1-M2.4 and unrelated data', async () => {
  const ledger = await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`;
  await owner`INSERT INTO identity.app_users DEFAULT VALUES`;
  const failed = { begin: work => owner.begin(async tx => { await work(tx); await tx`SELECT 1/0`; }) };
  await assert.rejects(runMigrations(failed, 'up', { through: '0006_admin_browser_auth', allowIdentity: true, report: () => {} }));
  assert.equal((await owner`SELECT to_regclass('identity.admin_oidc_flows') AS t`)[0].t, null);
  await runMigrations(owner, 'up', { through: '0006_admin_browser_auth', allowIdentity: true, report: () => {} });
  await runMigrations(owner, 'up', { through: '0006_admin_browser_auth', allowIdentity: true, report: () => {} });
  await runMigrations(owner, 'down', { through: '0006_admin_browser_auth', allowIdentity: true, report: () => {} });
  assert.deepEqual(await owner`SELECT id,checksum,applied_at::text FROM trissea_migrations ORDER BY id`, ledger);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n, 1);
  assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value, 'synthetic-admin-preservation');
  assert.equal((await owner`SELECT has_column_privilege('trissea_m2_admin_auth','identity.app_users','version','UPDATE') AS allowed`)[0].allowed, false);
  await Promise.all([runMigrations(owner,'up',{through:'0006_admin_browser_auth',allowIdentity:true,report:()=>{}}),runMigrations(owner,'up',{through:'0006_admin_browser_auth',allowIdentity:true,report:()=>{}})]);
  assert.equal((await owner`SELECT count(*)::int AS n FROM trissea_migrations`)[0].n, 6);
  note('0006 transactional fresh/no-op/concurrent apply/failed commit/down/reapply; prior ledger, user and unrelated table preserved; column privileges revoked on down');
});

test('non-owner admin runtime and real Keycloak discovery start with no public staff provisioning', async () => {
  const login = `m2_admin_${suffix}`, password = randomBytes(32).toString('hex');
  await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_admin_auth,trissea_m2_authorization`);
  await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);
  const url = new URL(controlEnv.M2_TEST_CONTROL_URL); url.pathname = '/' + database; url.username = login; url.password = password;
  runtimeConnection = postgres(url.href, settings);
  await assert.rejects(runtimeConnection`UPDATE identity.administrative_identity_mappings SET state='APPROVED'`, e => e.code === '42501');
  await assert.rejects(runtimeConnection`UPDATE identity.scoped_role_assignments SET role_code='PLATFORM_ADMIN'`, e => e.code === '42501');
  await assert.rejects(runtimeConnection`SET ROLE trissea_m2_policy_lock`, e => e.code === '42501');
  Object.assign(process.env, env, { ADMIN_DATABASE_URL: url.href, M2_PASSENGER_AUTH_ENABLED: 'false', M2_DRIVER_AUTH_ENABLED: 'false' });
  const { createApp } = req('./dist/src/bootstrap.js');
  app = await createApp(); await app.listen(4102, '127.0.0.1');
  const { AdminRuntime } = req('./dist/src/auth/admin/admin-runtime.js'); runtime = app.get(AdminRuntime);
  assert.equal((await fetch(apiOrigin+'/v1/health')).status, 200);
  assert.equal((await fetch(apiOrigin+'/v1/admin/auth/session')).status, 401);
  const rows = await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`; authority = rows[0].id;
  city = (await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('SYNTHETIC_ADMIN','Synthetic admin city','ACTIVE') RETURNING id`)[0].id;
  const todas = await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${city},'A','Synthetic A','VERIFIED'),(${city},'B','Synthetic B','VERIFIED') RETURNING id,code`;
  todaA = todas.find(t=>t.code==='A').id; todaB = todas.find(t=>t.code==='B').id;
  vite = spawn(process.execPath, [new URL('../apps/admin/node_modules/vite/bin/vite.js', import.meta.url).pathname.replace(/^\/(.:)/, '$1')], { cwd: new URL('../apps/admin/', import.meta.url), env: { ...process.env, ADMIN_API_PROXY_TARGET: apiOrigin }, stdio: ['ignore','pipe','pipe'], windowsHide: true });
  vite.stdout.on('data',chunk=>{viteOutput+=chunk.toString();});vite.stderr.on('data',chunk=>{viteOutput+=chunk.toString();});
  for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{/* bounded local startup polling */}await new Promise(resolve=>setTimeout(resolve,200));}
  assert.equal((await fetch(origin)).status, 200);
  browser = await chromium.launch({ headless: true });
  note('Actual NestJS/Fastify server + non-owner DB + pinned Keycloak discovery + Vite proxy started; no cookie 401, no grant/mapping mutation privileges');
});

async function synthetic({ mapped = true, otp = true, verified = true } = {}) {
  const name = 'synthetic-' + randomUUID(), password = randomBytes(24).toString('base64url') + '!aA1', secret = new Secret({ size: 20 });
  const credentials = [{ type: 'password', value: password, temporary: false }];
  if(otp)credentials.push({type:'otp',temporary:false,secretData:JSON.stringify({value:secret.base32}),credentialData:JSON.stringify({subType:'totp',digits:6,counter:0,period:30,algorithm:'HmacSHA1',secretEncoding:'BASE32'})});
  await providerApi('/users','POST',{username:name,email:name+'@example.invalid',firstName:'Synthetic',lastName:'Acceptance',enabled:true,emailVerified:verified,credentials,requiredActions:[]});
  const users = await providerApi('/users?username='+encodeURIComponent(name)+'&exact=true'); assert.equal(users.length,1);
  const subject = users[0].id;
  const [user] = await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`;
  const [identity] = await owner`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at) VALUES(${user.id},'KEYCLOAK',${env.KEYCLOAK_ISSUER},${secrets.identity.lookup(subject,'KEYCLOAK')},${secrets.keyId},${secrets.identity.encrypt(subject,'KEYCLOAK')},now()) RETURNING id`;
  if(mapped)await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state) VALUES(${identity.id},${user.id},${authority},${randomUUID()},'APPROVED')`;
  return {name,password,subject,userId:user.id,identityId:identity.id,totp:new TOTP({secret,algorithm:'SHA1',digits:6,period:30})};
}
async function start(context, key=randomUUID(), proof=randomBytes(32).toString('base64url')) {
  // Browser cases share one real loopback IP. Respect the deployed 20/minute
  // budget; never weaken it, reset rows or change production policy for tests.
  for(;;){const [budget]=await owner`SELECT count(*)::int AS n,extract(epoch FROM (min(created_at)+interval '60 seconds'-clock_timestamp()))*1000 AS wait_ms FROM identity.admin_oidc_flows WHERE ip_digest=${secrets.coordinate('admin-flow-ip','127.0.0.1')} AND created_at>clock_timestamp()-interval '1 minute'`;
    if(budget.n<19)break;await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(200,Number(budget.wait_ms)+300))));}
  const response=await context.request.post(origin+'/v1/admin/auth/login',{headers:{Origin:origin,'Idempotency-Key':key},data:{clientProof:proof}});
  assert.equal(response.status(),200,'BFF start status'); return (await response.json()).authorizationUrl;
}
async function currentOtp(totp){const remaining=30000-Date.now()%30000;if(remaining<5000)await new Promise(resolve=>setTimeout(resolve,remaining+200));return totp.generate();}
async function login(person, {wrongPassword=false, wrongOtp=false,codeOverride,context:existingContext,evidence=false}={}) {
  try {
  const context=existingContext??await browser.newContext(),page=await context.newPage();
  await page.goto(await start(context));
  if(evidence){await mkdir(new URL('../.cache/m2-admin/screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.cache/m2-admin/screenshots/keycloak-sign-in.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});report.screenshots.push('keycloak-sign-in.png');}
  await page.locator('#username').fill(person.name+'@example.invalid');await page.locator('#password').fill(wrongPassword?'incorrect-synthetic-password':person.password);await page.locator('#kc-login').click();
  if(wrongPassword)return {context,page};
  await page.locator('#otp').waitFor({timeout:15000});
  if(evidence){await page.screenshot({path:new URL('../.cache/m2-admin/screenshots/keycloak-totp.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true,mask:[page.locator('input, #kc-username, #kc-attempted-username')]});report.screenshots.push('keycloak-totp.png');}
  const code=await currentOtp(person.totp);await page.locator('#otp').fill(codeOverride??(wrongOtp?String((Number(code)+1)%1000000).padStart(6,'0'):code));await page.locator('#kc-login').click();
  if(!wrongOtp&&!codeOverride)await page.waitForURL(url=>url.origin===origin,{timeout:20000});
  return {context,page,submittedCode:code};
  } catch { throw new Error('Synthetic browser login could not reach the expected authentication step (details redacted)'); }
}
async function own(context, expected=200){const response=await context.request.get(origin+'/v1/admin/auth/session');assert.equal(response.status(),expected,'Current application session status');return response;}
async function grant(person) {
  await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${person.userId},${city},'ACTIVE')`;
  return (await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,expires_at) VALUES(${person.userId},${city},${todaA},'TODA_MANAGER','TODA',${authority},now()+interval '1 hour') RETURNING id`)[0].id;
}

test('real password plus TOTP yields opaque BFF cookie, current scoped access and accessible browser UI', async () => {
  const person=await synthetic(),grantId=await grant(person),{context,page}=await login(person,{evidence:true});
  try{await page.waitForURL(origin+'/**',{timeout:20000});}catch{throw new Error('Valid TOTP did not reach the BFF callback (provider URL redacted)');}
  const response=await own(context),session=await response.json();
  assert.equal(session.mfaVerified,true);assert.equal(session.operationalServicesEnabled,false);assert.equal(session.userId,person.userId);
  const cookies=await context.cookies();const cookie=cookies.find(c=>c.name==='trissea_admin_local');
  assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,'/');assert.equal(cookie.secure,false);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  const persisted=JSON.stringify(await owner`SELECT row_to_json(t) AS row FROM identity.auth_identities t UNION ALL SELECT row_to_json(t) FROM identity.admin_oidc_flows t UNION ALL SELECT row_to_json(t) FROM identity.admin_browser_sessions t UNION ALL SELECT row_to_json(t) FROM identity.audit_events t UNION ALL SELECT row_to_json(t) FROM identity.outbox_events t`);
  const [stored]=await owner`SELECT provider_ciphertext FROM identity.admin_browser_sessions WHERE session_id=${session.sessionId}`;
  const provider=JSON.parse(secrets.identity.decrypt(stored.provider_ciphertext,`admin-provider:${session.sessionId}`));
  for(const sensitive of [person.name,person.password,person.totp.secret.base32,person.subject,cookie.value,session.csrfToken,provider.idToken])assert.equal(persisted.includes(sensitive),false,'No plaintext sensitive authentication material in persisted app/auth/audit rows');
  const {sql}=req('drizzle-orm');await runtime.database.transaction(async tx=>{await tx.execute(sql`SELECT set_config('trissea.user_id',${person.userId},true)`);});
  const [pooled]=await runtime.connection`SELECT current_setting('trissea.user_id',true) AS user_id`;assert.equal(pooled.user_id??'','');
  assert.equal((await context.request.get(origin+'/v1/admin/access/todas/'+todaA)).status(),200);
  assert.equal((await context.request.get(origin+'/v1/admin/access/todas/'+todaB)).status(),403);
  await page.getByRole('status').filter({hasText:'Administrator session active'}).waitFor();
  await mkdir(new URL('../.cache/m2-admin/screenshots/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('../.cache/m2-admin/screenshots/admin-desktop.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});report.screenshots.push('admin-desktop.png');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:new URL('../.cache/m2-admin/screenshots/admin-mobile.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});report.screenshots.push('admin-mobile.png');
  await owner`UPDATE identity.scoped_role_assignments SET revoked_at=now(),version=version+1 WHERE id=${grantId}`;
  assert.equal((await context.request.get(origin+'/v1/admin/access/todas/'+todaA)).status(),403);
  await own(context);await context.close();
  note('Real Keycloak password+TOTP signed AMR accepted; HttpOnly Strict host cookie, no web storage or plaintext private auth material in app/audit rows; pooled user context clears; positive TODA A, TODA B and revoked-grant denials; desktop/mobile screenshots');
});

test('replayed and expired TOTP deny; fresh password/TOTP reauthentication rotates app session',async()=>{
  const person=await synthetic();
  // Enter a fresh time window so the immediate replay genuinely tests reuse.
  if(Date.now()%30000>20000)await new Promise(resolve=>setTimeout(resolve,30200-Date.now()%30000));
  const first=await login(person),initial=await (await own(first.context)).json();
  const oldCookie=(await first.context.cookies()).find(c=>c.name==='trissea_admin_local');
  const second=await login(person,{context:first.context,codeOverride:first.submittedCode});
  assert.equal(new URL(second.page.url()).origin,'http://127.0.0.1:18080');
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_sessions WHERE user_id=${person.userId}`)[0].n,1);
  await new Promise(resolve=>setTimeout(resolve,30200-Date.now()%30000));
  await second.page.locator('#otp').fill(person.totp.generate({timestamp:Date.now()-60000}));await second.page.locator('#kc-login').click();
  assert.equal(new URL(second.page.url()).origin,'http://127.0.0.1:18080');
  await second.page.locator('#otp').fill(person.totp.generate());await second.page.locator('#kc-login').click();
  try{await second.page.waitForURL(url=>url.origin===origin,{timeout:20000});}catch{throw new Error('Fresh TOTP reauthentication callback missing (URL redacted)');}
  const rotated=await (await own(first.context)).json();assert.notEqual(rotated.sessionId,initial.sessionId);
  assert.equal((await owner`SELECT state FROM identity.app_sessions WHERE id=${initial.sessionId}`)[0].state,'REVOKED');
  assert.equal((await fetch(apiOrigin+'/v1/admin/auth/session',{headers:{Cookie:oldCookie.name+'='+oldCookie.value}})).status,401);
  await first.context.close();note('Real Keycloak TOTP reuse in same counter and expired counter denied; fresh mandatory password/TOTP reauthentication rotates cookie/session, revokes old session and old-cookie replay');
});

test('read-only provider identity service cannot mutate users, delete factors or delegate privileges; recovery stays disabled',async()=>{
  const person=await synthetic(),response=await fetch(env.KEYCLOAK_ISSUER+'/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:env.KEYCLOAK_ASSURANCE_CLIENT_ID,client_secret:env.KEYCLOAK_ASSURANCE_SECRET})}),token=await response.json();assert.equal(response.status,200);
  const base=env.KEYCLOAK_ISSUER.replace('/realms/','/admin/realms/'),headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/users/'+person.subject,{headers})).status,200);
  assert.equal((await fetch(base+'/users/'+person.subject,{method:'PUT',headers,body:JSON.stringify({enabled:false})})).status,403);
  const factor=(await providerApi('/users/'+person.subject+'/credentials')).find(c=>c.type==='otp');
  assert.equal((await fetch(base+'/users/'+person.subject+'/credentials/'+factor.id,{method:'DELETE',headers})).status,403);
  assert.equal((await fetch(base+'/users/'+person.subject+'/role-mappings/realm',{method:'POST',headers,body:'[]'})).status,403);
  const realm=await providerApi('');assert.equal(realm.resetPasswordAllowed,false);assert.equal(realm.registrationAllowed,false);assert.equal(realm.otpPolicyCodeReusable,false);
  const actions=await providerApi('/authentication/required-actions');assert.ok(actions.every(a=>a.alias==='CONFIGURE_TOTP'||a.enabled===false));
  const executions=await providerApi('/authentication/flows/trissea-deny-recovery/executions');assert.equal(executions.length,1);assert.equal(executions[0].providerId,'deny-access-authenticator');assert.equal(executions[0].requirement,'REQUIRED');
  const clients=await providerApi('/clients');assert.ok(clients.filter(c=>['account','account-console','broker'].includes(c.clientId)).every(c=>c.enabled===false));
  const context=await browser.newContext(),page=await context.newPage();await page.goto(await start(context));
  assert.equal(await page.locator('a[href*="reset-credentials"], a[href*="registration"]').count(),0);
  for(const path of ['/login-actions/reset-credentials?client_id=trissea-admin-bff','/login-actions/registration?client_id=trissea-admin-bff','/login-actions/action-token?key=synthetic-invalid-action-token','/account/']){
    const denied=await context.request.get(env.KEYCLOAK_ISSUER+path,{maxRedirects:5});
    if(path.startsWith('/login-actions/registration')&&denied.status()===200){const html=await denied.text();assert.equal(new URL(denied.url()).origin,'http://127.0.0.1:18080');assert.ok(html.includes('id="kc-form-login"'),'Disabled registration may restart normal sign-in');assert.equal(html.includes('id="kc-register-form"'),false);}
    else assert.ok(denied.status()>=400&&denied.status()<500,'Direct '+path.split('?')[0]+' denied after bounded redirects; status '+denied.status());
  }
  const recovery=new URL(await start(context));recovery.searchParams.set('kc_action','CONFIGURE_RECOVERY_AUTHN_CODES');await page.goto(recovery.href);
  if(await page.locator('#username').count()){await page.locator('#username').fill(person.name);await page.locator('#password').fill(person.password);await page.locator('#kc-login').click();if(await page.locator('#otp').count()){await page.locator('#otp').fill(await currentOtp(person.totp));await page.locator('#kc-login').click();}}
  assert.equal(await page.locator('#kc-recovery-codes-list, #kc-reset-password-form').count(),0);
  assert.equal((await context.cookies()).some(c=>c.name==='trissea_admin_local'),false);
  await context.close();
  note('Actual assurance-reader GET allowed; user update, factor deletion and role delegation all 403; registration, reset, recovery actions and account consoles disabled; deny-recovery flow enforced');
});

test('browser loading, failure/retry, keyboard, proxy health and unapproved fares remain functional',async()=>{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('unexpected script exception'));
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/v1/admin/auth/session',async route=>{await gate;await route.fulfill({status:503,contentType:'application/json',body:'{"code":"UNAVAILABLE"}'});});
  await page.goto(origin);await page.getByRole('status').filter({hasText:'Checking administrator session'}).waitFor();assert.equal(await page.getByRole('button',{name:'Sign in with Keycloak'}).isDisabled(),true);release();
  await page.getByRole('status').filter({hasText:'Identity service unavailable'}).waitFor();
  await page.screenshot({path:new URL('../.cache/m2-admin/screenshots/admin-error.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});report.screenshots.push('admin-error.png');
  await page.unroute('**/v1/admin/auth/session');await page.getByRole('button',{name:'Check session / Retry'}).click();await page.getByRole('status').filter({hasText:'Sign in with your approved'}).waitFor();
  await page.getByRole('button',{name:'Check API connection'}).click();await page.getByRole('status').filter({hasText:'API connected'}).waitFor();
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'));
  await page.getByRole('button',{name:'Fare Management',exact:true}).click();await page.getByText('Not yet approved',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Import and approval available in M3'}).isDisabled(),true);assert.deepEqual(errors,[]);
  await context.close();note('Playwright API failure/retry, keyboard button focus, Vite health proxy, unapproved fare reference and disabled editing passed; no page exceptions');
});

test('incorrect password, incorrect TOTP, missing enrollment, unmapped and unverified identities receive no app session',async()=>{
  for(const failure of ['password','otp','enrollment','mapping','email']){
    const person=await synthetic({otp:failure!=='enrollment',mapped:failure!=='mapping',verified:failure!=='email'});
    if(failure==='enrollment'||failure==='email'){
      const context=await browser.newContext(),page=await context.newPage();await page.goto(await start(context));
      await page.locator('#username').fill(person.name);await page.locator('#password').fill(person.password);await page.locator('#kc-login').click();
      assert.equal(new URL(page.url()).origin,'http://127.0.0.1:18080');assert.equal((await context.cookies()).some(c=>c.name==='trissea_admin_local'),false);await own(context,401);await context.close();
    }else{
      const {context}=await login(person,{wrongPassword:failure==='password',wrongOtp:failure==='otp'});
      assert.equal((await context.cookies()).some(c=>c.name==='trissea_admin_local'),false);await own(context,401);await context.close();
    }
    assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_sessions WHERE user_id=${person.userId}`)[0].n,0);
  }
  note('Real Keycloak wrong password, wrong TOTP and absent enrollment denied; verified proof without approved mapping and unverified email denied; zero application sessions');
});

test('anonymous login retries are proof-bound and exact-Origin checked',async()=>{
  const context=await browser.newContext(),key=randomUUID(),proof=randomBytes(32).toString('base64url');
  const [first,second]=await Promise.all([start(context,key,proof),start(context,key,proof)]);assert.equal(first,second);
  const changed=await context.request.post(origin+'/v1/admin/auth/login',{headers:{Origin:origin,'Idempotency-Key':key},data:{clientProof:randomBytes(32).toString('base64url')}});assert.equal(changed.status(),409);
  const foreign=await context.request.post(origin+'/v1/admin/auth/login',{headers:{Origin:'https://attacker.invalid','Idempotency-Key':randomUUID()},data:{clientProof:proof}});assert.equal(foreign.status(),403);
  const missing=await context.request.post(origin+'/v1/admin/auth/login',{headers:{'Idempotency-Key':randomUUID()},data:{clientProof:proof}});assert.equal(missing.status(),403);
  const injected=await context.request.post(origin+'/v1/admin/auth/login',{headers:{Origin:origin,'Idempotency-Key':randomUUID()},data:{clientProof:proof,roles:['PLATFORM_ADMIN']}});assert.equal(injected.status(),400);
  await context.close();note('Concurrent same-key/proof login retries return one flow; changed proof 409; absent/foreign Origin 403; role mass assignment 400');
});

test('state/browser binding, nonce, PKCE and consumed callback prevent protocol replay',async()=>{
  for(const defect of ['state','browser','nonce','pkce','replay']){
    const person=await synthetic(),context=await browser.newContext(),page=await context.newPage();let callbackUrl;
    const authorization=new URL(await start(context));if(defect==='nonce')authorization.searchParams.set('nonce',randomBytes(48).toString('base64url'));if(defect==='pkce')authorization.searchParams.set('code_challenge',randomBytes(32).toString('base64url'));
    await page.goto(authorization.href);await page.locator('#username').fill(person.name);await page.locator('#password').fill(person.password);await page.locator('#kc-login').click();
    // Playwright routes the initial request of a redirect chain. Hold the
    // provider's OTP response before it redirects to the real BFF callback.
    await page.route(url=>url.port==='18080'&&url.pathname.includes('/login-actions/authenticate'),async route=>{const response=await route.fetch({maxRedirects:0}),location=response.headers().location;
      if(location&&new URL(location,route.request().url()).origin===origin){callbackUrl=new URL(location,route.request().url()).href;await route.fulfill({status:200,contentType:'text/plain',body:'Synthetic callback held for protocol acceptance test'});}else await route.fulfill({response});});
    await page.locator('#otp').fill(await currentOtp(person.totp));await page.locator('#kc-login').click();
    for(let i=0;i<100&&!callbackUrl;i++)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(typeof callbackUrl,'string','Callback captured for '+defect+'; current path '+new URL(page.url()).pathname);const url=new URL(callbackUrl);
    if(defect==='state')url.searchParams.set('state',randomBytes(48).toString('base64url'));
    let client=context.request,other;if(defect==='browser'){other=await browser.newContext();client=other.request;}
    if(defect==='replay'){const responses=await Promise.all([client.get(url.href,{maxRedirects:0}),client.get(url.href,{maxRedirects:0})]);assert.deepEqual(responses.map(r=>r.status()).sort(),[303,401]);assert.equal((await context.request.get(url.href,{maxRedirects:0})).status(),401);await own(context);}
    else{const response=await client.get(url.href,{maxRedirects:0});assert.ok([401,503].includes(response.status()));assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_sessions WHERE user_id=${person.userId}`)[0].n,0);}
    await other?.close();await context.close();
  }
  note('Actual code flow: changed state, other browser, wrong nonce and wrong S256 verifier denied; concurrent callback admits exactly one (303/401); replay denied');
});

test('CSRF/Origin and credential mixing deny; successful logout revokes DB session and replay fails',async()=>{
  const person=await synthetic(),{context,page}=await login(person);await page.waitForLoadState();const session=await (await own(context)).json();
  for(const headers of [{Origin:origin},{Origin:origin,'X-CSRF-Token':'invalid'},{Origin:'https://attacker.invalid','X-CSRF-Token':session.csrfToken}]){
    const response=await context.request.post(origin+'/v1/admin/auth/logout',{headers:{'Idempotency-Key':randomUUID(),...headers},data:{}});assert.equal(response.status(),403);assert.equal(response.headers()['set-cookie'],undefined);await own(context);
  }
  assert.equal((await context.request.get(origin+'/v1/admin/auth/session',{headers:{Authorization:'Bearer synthetic'}})).status(),401);
  const cookie=(await context.cookies()).find(c=>c.name==='trissea_admin_local');
  const result=await context.request.post(origin+'/v1/admin/auth/logout',{headers:{Origin:origin,'X-CSRF-Token':session.csrfToken,'Idempotency-Key':randomUUID()},data:{}});assert.equal(result.status(),204);await own(context,401);
  assert.equal((await owner`SELECT state FROM identity.app_sessions WHERE id=${session.sessionId}`)[0].state,'REVOKED');
  assert.equal((await fetch(apiOrigin+'/v1/admin/auth/session',{headers:{Cookie:cookie.name+'='+cookie.value}})).status,401);
  assert.ok((await owner`SELECT id FROM identity.audit_events WHERE actor_user_id=${person.userId} AND action='admin.logged_out'`).length>0);
  await context.close();note('Missing/bad CSRF and foreign Origin 403 without clearing active cookie; bearer+cookie 401; correct logout 204, DB revoked, stolen-cookie replay 401 and audit committed');
});

test('current factor removal, provider suspension, internal restriction, mapping removal and app revocation deny immediately',async()=>{
  for(const change of ['factor','provider','account','mapping','session']){
    const person=await synthetic(),{context}=await login(person),session=await (await own(context)).json();
    if(change==='factor'){const factor=(await providerApi('/users/'+person.subject+'/credentials')).find(c=>c.type==='otp');await providerApi('/users/'+person.subject+'/credentials/'+factor.id,'DELETE');}
    if(change==='provider'){const user=await providerApi('/users/'+person.subject);await providerApi('/users/'+person.subject,'PUT',{...user,enabled:false});}
    if(change==='account')await owner`UPDATE identity.app_users SET state='RESTRICTED',restricted_at=now(),version=version+1 WHERE id=${person.userId}`;
    if(change==='mapping')await owner`UPDATE identity.administrative_identity_mappings SET state='REVOKED' WHERE user_id=${person.userId}`;
    if(change==='session')await owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now(),version=version+1 WHERE id=${session.sessionId}`;
    await own(context,401);await context.close();
  }
  note('Next protected request denies removed TOTP factor, suspended Keycloak user, restricted application account, revoked mapping and revoked application session');
});

test('absolute expiry and policy-clock idle/step-up expiry deny without extending MFA freshness',async()=>{
  const person=await synthetic(),{context}=await login(person);await grant(person);let session=await (await own(context)).json();
  await owner`UPDATE identity.app_sessions SET expires_at=clock_timestamp()+interval '1 second',version=version+1 WHERE id=${session.sessionId}`;await new Promise(resolve=>setTimeout(resolve,1200));
  await own(context,401);await context.close();
  const fresh=await synthetic(),signed=await login(fresh);await grant(fresh);session=await (await own(signed.context)).json();
  const proof=await runtime.sessions.verify({cookie:(await signed.context.cookies()).filter(c=>c.name==='trissea_admin_local').map(c=>c.name+'='+c.value).join(';')});assert.ok(proof);
  const {decideAuthorization,actionPolicies}=req('./dist/src/auth/policy/authorization-model.js');
  // Real current session proof is aged for the policy clock only, not by weakening configured settings.
  const {PostgresAuthorizationDatabase,loadSubject,setPolicyContext,AuthorizationResources,loadGrants,withScopeStates}=req('./dist/src/auth/policy/authorization-database.js');
  const decision=await new PostgresAuthorizationDatabase(runtime.connection).transaction(async tx=>{await setPolicyContext(tx,proof,city,todaA);const resource=await withScopeStates(tx,await new AuthorizationResources().load(tx,'TODA',todaA)),subject=await loadSubject(tx,proof),grants=await loadGrants(tx,proof,resource),limits={adminIdleMilliseconds:runtime.settings.idleSeconds*1000,adminReauthMilliseconds:runtime.settings.reauthSeconds*1000},currentProof={...proof,expiresAt:Date.now()+3600000,adminMfa:{...proof.adminMfa,currentUntil:Date.now()+3600000}};
    const idle=decideAuthorization(currentProof,subject,resource,grants,actionPolicies.ADMIN_READ_SELF,subject.lastSeenAt+901000,limits);assert.equal(idle.allowed,false);assert.equal(idle.reason,'MFA_REQUIRED');
    return decideAuthorization(currentProof,subject,resource,grants,actionPolicies.TODA_MEMBERS_MANAGE,proof.adminMfa.verifiedAt+301000,limits);});
  assert.equal(decision.allowed,false);assert.equal(decision.reason,'REAUTH_REQUIRED');await signed.context.close();
  note('Actual absolute expiry 401; policy clock using genuine provider proof denies idle >15 minutes and sensitive TODA action >5 minutes; no MFA timestamp extension');
});
test('provider/DB failures and revocation during provider I/O fail closed; rate exhaustion denies new flows',async()=>{
  const person=await synthetic(),{context}=await login(person),cookie=(await context.cookies()).filter(c=>c.name==='trissea_admin_local').map(c=>c.name+'='+c.value).join(';');await own(context);
  const original=runtime.provider.assurance.bind(runtime.provider);
  const docker=promisify(execFile),compose=['compose','--env-file','.env.local','-f','infra/compose.m2-keycloak.yml'];
  try{await docker('docker',[...compose,'pause','keycloak'],{windowsHide:true,timeout:15000});await own(context,401);}finally{await docker('docker',[...compose,'unpause','keycloak'],{windowsHide:true,timeout:15000});}
  await own(context);
  runtime.provider.assurance=async()=>{throw new Error('synthetic provider outage; must never escape');};await own(context,401);runtime.provider.assurance=original;await own(context);
  const transaction=runtime.database.transaction.bind(runtime.database);runtime.database.transaction=async()=>{throw new Error('synthetic DB outage; must never escape');};await own(context,401);runtime.database.transaction=transaction;await own(context);
  runtime.provider.assurance=async proof=>{const factor=await original(proof);await owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=now(),version=version+1 WHERE user_id=${person.userId} AND state='ACTIVE'`;return factor;};
  assert.equal(await runtime.sessions.verify({cookie}),null);runtime.provider.assurance=original;await own(context,401);
  // Exercise the exact persisted IP budget without making 20 user-facing login attempts.
  const digest=secrets.coordinate('admin-flow-ip','127.0.0.1');
  for(let i=0;i<20;i++)await owner`INSERT INTO identity.admin_oidc_flows(request_digest,proof_digest,state_digest,binding_digest,secret_ciphertext,ip_digest,expires_at) VALUES(${randomBytes(32).toString('hex')},${randomBytes(32).toString('hex')},${randomBytes(32).toString('hex')},${randomBytes(32).toString('hex')},'v1.synthetic-fixture',${digest},now()+interval '5 minutes')`;
  const limited=await context.request.post(origin+'/v1/admin/auth/login',{headers:{Origin:origin,'Idempotency-Key':randomUUID()},data:{clientProof:randomBytes(32).toString('base64url')}});assert.equal(limited.status(),429);assert.equal(limited.headers()['retry-after'],'60');
  await context.close();note('Actual isolated Keycloak pause causes 401 and unpause restores access; injected provider/DB failures 401 without detail; concurrent DB revocation during provider check denies; IP rate exhaustion 429 + Retry-After');
});


test('all Drizzle columns, PK/unique/FK/check/index definitions match PostgreSQL', async () => {
  const probe=await owner.reserve();try {
  const {getTableConfig,PgDialect}=req('drizzle-orm/pg-core'),{is,SQL}=req('drizzle-orm');
  const tables=Object.values(req('./dist/src/database/admin-schema.js')).filter(x=>x && x[Symbol.for('drizzle:IsDrizzleTable')]);
  const dialect=new PgDialect();
  for(const table of tables) {
    const cfg=getTableConfig(table);
    const [security]=await probe`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=${`identity.${cfg.name}`}::regclass`;
    assert.equal(security.relrowsecurity,cfg.enableRLS,`${cfg.name} RLS flag`);
    if(cfg.enableRLS) assert.equal(security.relforcerowsecurity,true);
    const columns=await probe`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='identity' AND table_name=${cfg.name} ORDER BY ordinal_position`;
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
    const constraints=await probe`SELECT conname,contype,conkey,confkey,confrelid::regclass::text AS target,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=${`identity.${cfg.name}`}::regclass`;
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
    await probe.unsafe(`CREATE TEMP TABLE schema_check_probe (LIKE identity."${cfg.name}")`);
    try {
      for(const ck of cfg.checks) {
        const expression=dialect.sqlToQuery(ck.value).sql.replaceAll(`"identity"."${cfg.name}".`,'');
        await probe.unsafe(`ALTER TABLE schema_check_probe ADD CONSTRAINT "${ck.name}" CHECK (${expression})`);
        const [expected]=await probe`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='schema_check_probe'::regclass AND conname=${ck.name}`;
        assert.equal(constraints.find(c=>c.contype==='c'&&c.conname===ck.name)?.definition,expected.definition,`${cfg.name}.${ck.name}`);
      }
    } finally { await probe`DROP TABLE schema_check_probe`; }
    const indexes=await probe`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='identity' AND tablename=${cfg.name}`;
    for(const idx of cfg.indexes) {
      const actual=indexes.find(i=>i.indexname===idx.config.name);
      assert.ok(actual); for(const col of idx.config.columns) assert.ok(actual.indexdef.includes(col.name));
    }
  }
  note(`Drizzle/PostgreSQL consistency: ${tables.length} tables, columns/defaults/nullability and all declared constraints/indexes`);
  } finally { probe.release(); }
});

test('actual Vite proxy failure redacts callback query and error stack from logs',async()=>{
  await app.close();app=undefined;
  const marker='synthetic-private-oidc-query-marker',response=await fetch(origin+'/v1/admin/auth/callback?code='+marker+'&state='+marker);
  assert.equal(response.status,502);
  for(let i=0;i<30&&!viteOutput.includes('Local API proxy unavailable');i++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(viteOutput.includes('Local API proxy unavailable'));assert.equal(viteOutput.includes(marker),false);
  note('Actual API-offline Vite proxy returns 502; logger emits sanitized diagnostic without callback query/code/state or error stack');
});
