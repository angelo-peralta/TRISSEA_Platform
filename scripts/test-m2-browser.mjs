import assert from 'node:assert/strict';
import {before,after,test as nodeTest} from 'node:test';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {Secret,TOTP} from 'otpauth';
import {acceptanceServer} from './m2-acceptance-client.mjs';
const req=createRequire(new URL('../package.json',import.meta.url)),{MobileSession}=req('./.cache/mobile-auth/mobile-auth/src/controller.js'),{mobileTransport}=req('./.cache/mobile-auth/mobile-auth/src/transport.js'),{createDriverClient}=req('./.cache/contract-tests/src/driver-client.js');
const origin='http://127.0.0.1:5174',base='http://127.0.0.1:4104/v1',directory=new URL('../.cache/m2-acceptance/browser/',import.meta.url);
const report={executedAt:new Date().toISOString(),environment:'LOCAL_SYNTHETIC',tests:[],screenshots:[],checks:[]};let host,vite,browser,driver,officer,manager,officerUi,managerUi,stage='setup',viteOutput='',pageErrors=0;const privateValues=[];
const test=(name,work)=>nodeTest(name,{timeout:120000},async()=>{try{await work();report.tests.push({name,result:'PASSED'});}catch(e){report.tests.push({name,result:'FAILED',stage});throw new Error('Browser acceptance failed at '+stage+'; type '+e.name+'; private details redacted');}});
before(async()=>{host=await acceptanceServer();report.database=host.ready.database;await mkdir(directory,{recursive:true});vite=spawn(process.execPath,[fileURLToPath(new URL('../apps/admin/node_modules/vite/bin/vite.js',import.meta.url))],{cwd:fileURLToPath(new URL('../apps/admin/',import.meta.url)),env:{...process.env,ADMIN_API_PROXY_TARGET:'http://127.0.0.1:4104'},stdio:['ignore','pipe','pipe'],windowsHide:true});vite.stdout.on('data',b=>{viteOutput+=b.toString();});vite.stderr.on('data',b=>{viteOutput+=b.toString();});for(let i=0;i<80;i++){try{if((await fetch(origin)).ok)break;}catch{/* bounded setup */}await new Promise(r=>setTimeout(r,250));}assert.equal((await fetch(origin)).status,200);browser=await chromium.launch({headless:true,args:['--disable-gpu','--renderer-process-limit=1']});});
after(async()=>{await browser?.close();vite?.kill();await host?.close();await writeFile(new URL('results.json',directory),JSON.stringify(report,null,2)+'\n');});
async function capture(page,name){await page.screenshot({path:fileURLToPath(new URL(name,directory)),fullPage:true,mask:[page.locator('input, #kc-username, #kc-attempted-username')]});report.screenshots.push(name);}
async function mobileDriver(){let stored=null,challenge,token;const phone='+639980000501',transport=mobileTransport('DRIVER',base),request=transport.request,verify=transport.verify;transport.request=async(...args)=>{challenge=await request(...args);return challenge;};transport.verify=async(...args)=>{const r=await verify(...args);token=r.accessToken;privateValues.push(r.accessToken,r.refreshToken);return r;};const s=new MobileSession({purpose:'DRIVER',apiUrl:base,store:{read:async()=>stored,write:async v=>{stored=v;},clear:async()=>{stored=null;}},transport,uuid:randomUUID,proof:async()=>randomBytes(32).toString('base64url')});await s.requestCode(phone);const code=await host.code(challenge.challengeId);privateValues.push(code);await s.verifyCode(code);await s.consent(true,true);assert.equal(s.getSnapshot().phase,'AUTHENTICATED');const p=s.getSnapshot().profile;await host.rpc('registerFixtureUser',{userId:p.userId});return {session:s,userId:p.userId,sdk:createDriverClient(base),token:()=>token};}
async function relationship(toda){const {city}=host.ready,affiliation=await driver.sdk.request('requestDriverAffiliation',{accessToken:driver.token(),idempotencyKey:randomUUID(),body:{cityTenantId:city,todaId:toda}}),vehicle=await host.rpc('vehicle',{todaId:toda});return driver.sdk.request('requestDriverVehicle',{accessToken:driver.token(),idempotencyKey:randomUUID(),body:{affiliationId:affiliation.id,vehicleId:vehicle.id}});}
async function submit(kind,reviewer,rel){const evidence=await host.rpc('evidence',{userId:driver.userId,relationshipId:rel.id,kind}),opened=await driver.sdk.request('openDriverVerificationCase',{accessToken:driver.token(),idempotencyKey:randomUUID(),body:{relationshipId:rel.id,kind}});await driver.sdk.request('submitDriverVerificationCase',{accessToken:driver.token(),caseId:opened.id,idempotencyKey:randomUUID(),body:{expectedVersion:opened.version,...evidence}});await host.rpc('assign',{caseId:opened.id,reviewerUserId:reviewer.userId});return driver.sdk.request('getDriverVerificationCase',{accessToken:driver.token(),caseId:opened.id});}
async function login(person){stage='real Keycloak password and TOTP';privateValues.push(person.password,person.totpSecret);const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',()=>pageErrors++);await page.goto(origin);await page.getByRole('button',{name:'Sign in with Keycloak',exact:true}).click();await page.locator('#username').fill(person.username+'@example.invalid');await page.locator('#password').fill(person.password);await page.locator('#kc-login').click();await page.locator('#otp').waitFor();const remaining=30000-Date.now()%30000;if(remaining<5000)await new Promise(r=>setTimeout(r,remaining+200));const code=new TOTP({secret:Secret.fromBase32(person.totpSecret),algorithm:'SHA1',digits:6,period:30}).generate();privateValues.push(code);await page.locator('#otp').fill(code);await page.locator('#kc-login').click();await page.waitForURL(url=>url.origin===origin);await page.getByRole('status').filter({hasText:'Administrator session active'}).waitFor();return {context,page};}
async function load(page,toda,membership=false){await page.getByLabel('Synthetic organization identifier',{exact:true}).fill(toda);await page.getByLabel('Review queue',{exact:true}).selectOption(membership?'membership':'driver');await page.getByRole('button',{name:'Load assigned cases',exact:true}).click();}
async function select(page,detail,toda=host.ready.todaA,membership=false){await load(page,toda,membership);await page.getByRole('button',{name:new RegExp(detail.case.id)}).click();await page.getByRole('region',{name:'Selected synthetic case'}).waitFor();}

test('real mobile driver to assigned browser reviewer, lost decision response and exact idempotent retry',async()=>{
 stage='driver authentication and submission';driver=await mobileDriver();officer=await host.rpc('staff',{role:'VERIFICATION_OFFICER',todaId:host.ready.todaA});manager=await host.rpc('staff',{role:'TODA_MANAGER',todaId:host.ready.todaA});const rel=await relationship(host.ready.todaA);driver.relationship=rel;const detail=await submit('DRIVER',officer,rel);officerUi=await login(officer);const {page}=officerUi;stage='assigned driver case inspection';await select(page,detail);await capture(page,'assigned-driver-desktop.png');
 stage='unknown decision outcome and same-key retry';const keys=[];let lose=true;await page.route('**/v1/admin/verifications/cases/*/decisions',async route=>{keys.push(route.request().headers()['idempotency-key']);if(lose){lose=false;await route.fetch();await route.abort('failed');}else await route.continue();});await page.getByRole('button',{name:'Approve synthetic evidence',exact:true}).click();await page.getByRole('status').filter({hasText:'Review service unavailable'}).waitFor();await page.getByRole('button',{name:'Retry original decision',exact:true}).click();await page.getByRole('status').filter({hasText:'Synthetic decision recorded by the server: APPROVED'}).waitFor();assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.deepEqual(await host.rpc('decisionCounts',{caseId:detail.case.id}),{decisions:1,approvals:1,outbox:1});await page.unroute('**/v1/admin/verifications/cases/*/decisions');
 report.checks.push('Real driver OTP/consent/case -> real password/TOTP -> assigned browser approval; dropped committed response retried with original key; one decision/audit/outbox');
});
test('vehicle and membership reviews use separate current authorities; pending driver never gains operating capabilities',async()=>{
 stage='vehicle review';const vehicle=await submit('VEHICLE',officer,driver.relationship),page=officerUi.page;await select(page,vehicle);await page.getByRole('button',{name:'Approve synthetic evidence',exact:true}).click();await page.getByRole('status').filter({hasText:'Synthetic decision recorded by the server: APPROVED'}).waitFor();
 stage='membership authority';const membership=await submit('TODA_MEMBERSHIP',manager,driver.relationship),ui=managerUi=await login(manager);await select(ui.page,membership,host.ready.todaA,true);await ui.page.getByRole('button',{name:'Approve synthetic evidence',exact:true}).click();await ui.page.getByRole('status').filter({hasText:'Synthetic decision recorded by the server: APPROVED'}).waitFor();await ui.page.setViewportSize({width:390,height:844});await capture(ui.page,'membership-mobile.png');const eligibility=await driver.sdk.request('getDriverEligibility',{accessToken:driver.token(),cityTenantId:host.ready.city,todaId:host.ready.todaA});assert.equal(eligibility.identityEligible,false);assert.equal(eligibility.canGoOnline,false);assert.equal(eligibility.realDriverApproved,false);assert.ok(eligibility.reasons.includes('PERMIT_POLICY_ASSERTION_MISSING'));report.checks.push('Officer driver/vehicle and manager membership approvals stay separate; no permit assertion or city membership manufactured; operation denied');
});
test('assigned review queues follow every cursor, retry a failed page and reset pagination with scope or visibility',async()=>{
 stage='three-page assigned queue fixtures';
 for(let i=0;i<42;i++){
  const rel=await relationship(host.ready.todaA);
  await submit('DRIVER',officer,rel);
  await submit('TODA_MEMBERSHIP',manager,rel);
 }
 for(const [ui,membership,total] of [[officerUi,false,44],[managerUi,true,43]]){
  stage=membership?'membership queue pagination':'driver and vehicle queue pagination';
  const {page}=ui,queue=page.getByRole('list',{name:'Assigned cases',exact:true}),more=page.getByRole('button',{name:'Load more assigned cases',exact:true});
  const path='/v1/admin/verifications/todas/'+host.ready.todaA+(membership?'/memberships':'/cases');
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.ok());
  await load(page,host.ready.todaA,membership);
  let data=await (await response).json();
  if(!membership){const visible=data.items.find(c=>c.kind==='DRIVER');assert.ok(visible);driver.visibleCaseId=visible.id;}
  await page.getByRole('status').filter({hasText:'Assigned cases loaded'}).waitFor();
  assert.equal(await queue.getByRole('button').count(),20);
  assert.equal(await more.count(),1,'A nonempty cursor must expose the next page');
  const ids=data.items.map(c=>c.id),cursors=[];
  if(!membership){
   const match='**'+path+'?after=*';let fail=true;
   await page.route(match,async route=>{if(fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:'{}'});}else await route.continue();});
   await more.click();
   await page.getByRole('status').filter({hasText:'More cases unavailable'}).waitFor();
   assert.equal(await queue.getByRole('button').count(),20);
   assert.equal(await more.isEnabled(),true);
   await page.unroute(match);
   await capture(page,'driver-queue-first-page.png');
  }
  while(data.nextCursor){
   const after=data.nextCursor;cursors.push(after);
   const response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.ok());
   await more.click();
   const next=await response;
   assert.equal(new URL(next.url()).searchParams.get('after'),after);
   data=await next.json();ids.push(...data.items.map(c=>c.id));
   await page.getByRole('status').filter({hasText:'Assigned cases loaded'}).waitFor();
   assert.equal(await queue.getByRole('button').count(),ids.length);
  }
  assert.equal(cursors.length,2);assert.equal(ids.length,total);assert.equal(new Set(ids).size,total);
  assert.equal(await more.count(),0);
  assert.equal(await queue.getByRole('button',{name:/APPROVED/}).count(),membership?1:2,'Completed cases remain in the paginated queue');
  await capture(page,membership?'membership-queue-paginated.png':'driver-queue-paginated.png');
  const later=data.items.find(c=>c.state==='SUBMITTED');assert.ok(later,'A submitted case on the last page must be actionable');
  await queue.getByRole('button',{name:new RegExp(later.id)}).click();
  await page.getByRole('region',{name:'Selected synthetic case'}).waitFor();
  await page.getByRole('button',{name:'Approve synthetic evidence',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Synthetic decision recorded by the server: APPROVED'}).waitFor();
  assert.equal(await queue.getByRole('button').count(),0);assert.equal(await more.count(),0);
  await load(page,host.ready.todaA,membership);
  await page.getByRole('status').filter({hasText:'Assigned cases loaded'}).waitFor();
  assert.equal(await queue.getByRole('button').count(),20);assert.equal(await more.count(),1);
  const match='**'+path+'?after=*';
  await page.route(match,route=>route.fulfill({status:403,contentType:'application/json',body:'{}'}));
  await more.click();
  await page.getByRole('status').filter({hasText:'Access denied'}).waitFor();
  assert.equal(await queue.getByRole('button').count(),0);assert.equal(await more.count(),0);
  await page.unroute(match);
  await load(page,host.ready.todaA,membership);
  await page.getByRole('status').filter({hasText:'Assigned cases loaded'}).waitFor();
  await page.getByLabel('Review queue',{exact:true}).selectOption(membership?'driver':'membership');
  assert.equal(await queue.getByRole('button').count(),0);assert.equal(await more.count(),0);
  await page.getByLabel('Review queue',{exact:true}).selectOption(membership?'membership':'driver');
  await load(page,host.ready.todaA,membership);
  await page.getByRole('status').filter({hasText:'Assigned cases loaded'}).waitFor();
  await page.getByLabel('Synthetic organization identifier',{exact:true}).fill(host.ready.todaB);
  assert.equal(await queue.getByRole('button').count(),0);assert.equal(await more.count(),0);
  await load(page,host.ready.todaA,membership);
  await page.getByRole('status').filter({hasText:'Assigned cases loaded'}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByRole('status').filter({hasText:'Review data hidden'}).waitFor();
  assert.equal(await queue.getByRole('button').count(),0);assert.equal(await more.count(),0);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 }
 await managerUi.context.close();
 report.checks.push('Real assigned driver/vehicle (44) and membership (43) cases across three pages: API cursors forwarded, no duplicates, completed cases retained, final-page approval, transient page retry and access/scope/visibility reset');
});
test('assigned wrong-TODA and restricted-role access, CSRF, stale state and revoked grants deny without retained evidence',async()=>{
 const {page,context}=officerUi;stage='wrong TODA even when assigned';const foreign=await submit('DRIVER',officer,await relationship(host.ready.todaB));await load(page,host.ready.todaB);await page.getByRole('status').filter({hasText:'Access denied'}).waitFor();assert.equal(await page.getByRole('region',{name:'Selected synthetic case'}).count(),0);const current=await context.request.get(origin+'/v1/admin/auth/session');assert.equal(current.status(),200);const session=await current.json();privateValues.push(session.csrfToken);
 const unauthorized=await context.request.post(origin+'/v1/admin/verifications/cases/'+foreign.case.id+'/decisions',{headers:{Origin:origin,'X-CSRF-Token':session.csrfToken,'Idempotency-Key':randomUUID()},data:{expectedVersion:foreign.case.version,evidenceVersion:1,outcome:'APPROVE',reasonCode:'SYNTHETIC_ACCEPTED'}});assert.equal(unauthorized.status(),403);
 stage='CSRF and mixed credential denial';const own=await driver.sdk.request('getDriverVerificationCase',{accessToken:driver.token(),caseId:driver.visibleCaseId});const denied=await context.request.post(origin+'/v1/admin/verifications/cases/'+own.case.id+'/decisions',{headers:{Origin:origin,'X-CSRF-Token':'invalid','Idempotency-Key':randomUUID()},data:{expectedVersion:own.case.version,evidenceVersion:1,outcome:'REVOKE',reasonCode:'SYNTHETIC_WITHDRAWN'}});assert.equal(denied.status(),403);assert.equal((await context.request.get(origin+'/v1/admin/auth/session',{headers:{authorization:'Bearer '+driver.token()}})).status(),401);
 stage='restricted role';const support=await host.rpc('staff',{role:'SUPPORT_AGENT',todaId:host.ready.todaA}),restricted=await login(support);await load(restricted.page,host.ready.todaA);await restricted.page.getByRole('status').filter({hasText:'Access denied'}).waitFor();await capture(restricted.page,'restricted-role.png');await restricted.context.close();
 stage='grant revocation clears old evidence';await select(page,own);await host.rpc('revokeStaffGrant',{userId:officer.userId,grantId:officer.grantId});await page.getByRole('button',{name:'Load assigned cases',exact:true}).click();await page.getByRole('status').filter({hasText:'Access denied'}).waitFor();assert.equal(await page.getByRole('region',{name:'Selected synthetic case'}).count(),0);await capture(page,'revoked-access.png');report.checks.push('Assigned wrong-TODA case and support role 403; invalid CSRF 403; mixed bearer/cookie 401; current grant removal empties evidence view');
});
test('browser credentials, keyboard, responsive layout and logs preserve privacy boundaries',async()=>{
 stage='browser storage and keyboard';const {page,context}=officerUi;assert.deepEqual(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)})),{local:[],session:[]});assert.equal((await page.evaluate(()=>document.cookie)).includes('trissea_admin_local'),false);const cookie=(await context.cookies()).find(c=>c.name==='trissea_admin_local');assert.ok(cookie);assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Strict');privateValues.push(cookie.value);
 await page.getByLabel('Synthetic organization identifier',{exact:true}).focus();assert.equal(await page.getByLabel('Synthetic organization identifier',{exact:true}).evaluate(e=>document.activeElement===e),true);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await capture(page,'verification-mobile-access-denied.png');assert.equal(pageErrors,0);for(const secret of privateValues){assert.equal(host.output().includes(secret),false,'Private auth material absent from server logs');if(secret.length>12)assert.equal(viteOutput.includes(secret),false,'Private auth material absent from Vite logs');}report.checks.push('No provider/mobile tokens in localStorage/sessionStorage or JS cookies; actual HttpOnly Strict cookie, keyboard focus, 390px no overflow and zero page exceptions');
});

test('lost browser logout response hides review data immediately and retries only the pending sign-out',async()=>{
 stage='browser lost logout response';const {page}=officerUi;let lose=true;const keys=[];await page.route('**/v1/admin/auth/logout',async route=>{keys.push(route.request().headers()['idempotency-key']);if(lose){lose=false;await route.fetch();await route.abort('failed');}else await route.continue();});await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('status').filter({hasText:'Sign-out was not confirmed'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Assigned synthetic verification',exact:true}).count(),0);await page.getByRole('button',{name:'Check session / Retry',exact:true}).click();await page.getByRole('status').filter({hasText:/Signed out|Session is not active/}).waitFor();assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(await page.getByRole('heading',{name:'Assigned synthetic verification',exact:true}).count(),0);await page.unroute('**/v1/admin/auth/logout');report.checks.push('Dropped committed logout response hides review immediately; pending sign-out retries with original key and cannot restore protected UI');
});
