import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {MobileSession,type CredentialStore} from '../src/controller';
import {mobileConfiguration,type Purpose} from '../src/configuration';
import type {MobileTransport,Profile} from '../src/transport';
import {mobileTransport} from '../src/transport';
import type {Schemas} from '@trissea/contracts';

class Store implements CredentialStore {
 value:string|null=null;writes=0;failAt=0;unreadable=false;
 async read(){if(this.unreadable)throw new Error('native read failed');return this.value;}
 async write(value:string){if(++this.writes===this.failAt)throw new Error('native write failed');this.value=value;}
 async clear(){this.value=null;}
}
const error=(status:number)=>Object.assign(new Error('synthetic private diagnostic must not reach UI'),{status});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
function fixture(purpose:Purpose='PASSENGER'){
 const store=new Store(),sessionId=randomUUID(),userId=randomUUID(),calls:{operation:string;key?:string;token?:string}[]=[],receipts=new Map<string,Schemas['MobileAuthResult']>();
 let now=1800000000000,active=false,consented=false,currentRefresh='',lost=false;
 const result=():Schemas['MobileAuthResult']=>({accessToken:'synthetic-access-'+randomUUID(),accessTokenExpiresAt:new Date(now+600000).toISOString(),refreshToken:randomBytes(48).toString('base64url'),tokenType:'Bearer',userId,sessionId,clientPurpose:purpose});
 const profile=():Profile=>{const common={userId,sessionId,state:consented?'ACTIVE' as const:'CONSENT_REQUIRED' as const,profileVersion:1,requiredNoticeVersion:'local-synthetic-notice-v1',requiredTermsVersion:'local-synthetic-terms-v1',environment:'LOCAL_SYNTHETIC' as const};return purpose==='DRIVER'?{...common,clientPurpose:'DRIVER',driverStatus:'PENDING',canGoOnline:false,operationalServicesEnabled:false,realDocumentsEnabled:false}:{...common,clientPurpose:'PASSENGER',displayName:null,operationsEnabled:false};};
 const transport:MobileTransport={
  request:async(_phone,_binding,key)=>{calls.push({operation:'request',key});return {challengeId:randomUUID(),expiresAt:new Date(now+300000).toISOString(),resendAfter:new Date(now+60000).toISOString(),clientPurpose:purpose,deliveryMode:'MOCK'};},
  verify:async(_phone,code,_id,_binding,key)=>{calls.push({operation:'verify',key});if(code!=='000001')throw error(401);active=true;const r=result();currentRefresh=r.refreshToken;return r;},
  refresh:async(token,_binding,key)=>{calls.push({operation:'refresh',key,token});if(!active)throw error(401);if(receipts.has(key))return receipts.get(key)!;if(token!==currentRefresh){active=false;throw error(401);}const r=result();currentRefresh=r.refreshToken;receipts.set(key,r);if(lost){lost=false;throw new Error('network response lost');}return r;},
  profile:async()=>{calls.push({operation:'profile'});if(!active)throw error(401);return profile();},
  consent:async()=>{calls.push({operation:'consent'});consented=true;return profile();},
  logout:async()=>{calls.push({operation:'logout'});active=false;},
 };
 const create=()=>new MobileSession({purpose,apiUrl:'http://127.0.0.1:4104/v1',store,transport,uuid:randomUUID,proof:async()=>randomBytes(32).toString('base64url'),now:()=>now});
 return {store,transport,calls,create,advance:(n:number)=>{now+=n;},revoke:()=>{active=false;},loseRefresh:()=>{lost=true;},active:()=>active};
}
async function signIn(f:ReturnType<typeof fixture>,session=f.create()){await session.requestCode('+639980000001');await session.verifyCode('000001');return session;}

test('sign-in, explicit synthetic consent and server logout; persisted material excludes OTP, phone, JWT and profile',async()=>{
 const f=fixture(),s=f.create();await s.requestCode('invalid');assert.equal(f.calls.length,0);await signIn(f,s);assert.equal(s.getSnapshot().phase,'CONSENT_REQUIRED');
 const stored=f.store.value!;assert.equal(stored.includes('000001'),false);assert.equal(stored.includes('+639980000001'),false);assert.equal(stored.includes('synthetic-access-'),false);assert.equal(stored.includes('profile'),false);
 await s.consent(false,true);assert.equal(f.calls.filter(c=>c.operation==='consent').length,0);await s.consent(true,true);assert.equal(s.getSnapshot().phase,'AUTHENTICATED');await s.logout();assert.equal(f.active(),false);assert.equal(f.store.value,null);assert.equal(s.getSnapshot().phase,'SIGNED_OUT');
});
test('invalid code remains retryable, uses a new attempt key, and expired code never authenticates',async()=>{
 const f=fixture(),s=f.create();await s.requestCode('+639980000001');await s.verifyCode('111111');assert.equal(s.getSnapshot().phase,'CODE_REQUIRED');assert.equal(s.getSnapshot().profile,null);await s.verifyCode('000001');assert.equal(s.getSnapshot().phase,'CONSENT_REQUIRED');const keys=f.calls.filter(c=>c.operation==='verify').map(c=>c.key);assert.notEqual(keys[0],keys[1]);
 const expired=fixture(),e=expired.create();await e.requestCode('+639980000001');expired.advance(300001);await e.verifyCode('000001');assert.equal(e.getSnapshot().phase,'EXPIRED');assert.equal(expired.calls.some(c=>c.operation==='verify'),false);
});
test('cold restore checks the server and concurrent foreground restoration rotates only once',async()=>{
 const f=fixture();await signIn(f);const s=f.create();await Promise.all(Array.from({length:8},()=>s.restore()));assert.equal(f.calls.filter(c=>c.operation==='refresh').length,1);assert.equal(s.getSnapshot().phase,'CONSENT_REQUIRED');
 f.revoke();await s.restore();assert.equal(s.getSnapshot().phase,'EXPIRED');assert.equal(s.getSnapshot().profile,null);assert.equal(f.store.value,null);
});
test('refresh response loss persists the same request; process restart recovers one server rotation',async()=>{
 const f=fixture();await signIn(f);f.loseRefresh();const s=f.create();await s.restore();assert.equal(s.getSnapshot().phase,'OFFLINE');assert.ok(JSON.parse(f.store.value!).pendingRefresh);f.advance(1000);const restart=f.create();await restart.restore();assert.equal(restart.getSnapshot().phase,'CONSENT_REQUIRED');const calls=f.calls.filter(c=>c.operation==='refresh');assert.equal(calls.length,2);assert.equal(calls[0]!.key,calls[1]!.key);assert.equal(calls[0]!.token,calls[1]!.token);assert.equal(JSON.parse(f.store.value!).pendingRefresh,null);
});
test('uncertain old refresh is never replayed outside the bounded recovery window',async()=>{
 const f=fixture();await signIn(f);f.loseRefresh();await f.create().restore();f.advance(10001);const s=f.create();await s.restore();assert.equal(s.getSnapshot().phase,'EXPIRED');assert.equal(f.calls.filter(c=>c.operation==='refresh').length,1);assert.equal(f.store.value,null);
});
test('offline sign-out is persisted and retried on cold restore before any profile can reappear',async()=>{
 const f=fixture(),s=await signIn(f),logout=f.transport.logout;f.transport.logout=async()=>{throw new Error('offline');};await s.logout();assert.equal(s.getSnapshot().phase,'SIGNOUT_PENDING');assert.equal(s.getSnapshot().profile,null);assert.ok(JSON.parse(f.store.value!).logoutKey);f.transport.logout=logout;
 const phases:string[]=[],restart=f.create();restart.subscribe(()=>phases.push(restart.getSnapshot().phase));await restart.restore();assert.equal(restart.getSnapshot().phase,'SIGNED_OUT');assert.equal(phases.includes('AUTHENTICATED')||phases.includes('CONSENT_REQUIRED'),false);assert.equal(f.active(),false);
});
test('sign-out immediately after process restart loads and revokes existing credentials',async()=>{
 const f=fixture();await signIn(f);const restarted=f.create();await restarted.logout();assert.equal(f.active(),false);assert.equal(f.calls.filter(c=>c.operation==='logout').length,1);assert.equal(f.store.value,null);
});
test('logout during delayed OTP verification cannot be undone by the late success',async()=>{
 const f=fixture(),s=f.create(),gate=deferred<void>(),started=deferred<void>(),verify=f.transport.verify;f.transport.verify=async(...args)=>{started.resolve();await gate.promise;return verify(...args);};await s.requestCode('+639980000001');const verification=s.verifyCode('000001');await started.promise;const phases:string[]=[];s.subscribe(()=>phases.push(s.getSnapshot().phase));const logout=s.logout();gate.resolve();await Promise.all([verification,logout]);assert.equal(phases.includes('AUTHENTICATED')||phases.includes('CONSENT_REQUIRED'),false);assert.equal(s.getSnapshot().phase,'SIGNED_OUT');assert.equal(f.active(),false);
});
test('backgrounded profile responses never restore visibility; foreground must recheck revoked state',async()=>{
 const f=fixture(),s=await signIn(f),gate=deferred<void>(),started=deferred<void>(),profile=f.transport.profile;let delay=true;f.transport.profile=async token=>{if(delay){started.resolve();await gate.promise;return profile(token);}return profile(token);};const pending=s.restore();await started.promise;await s.setActive(false);gate.resolve();await pending;assert.equal(s.getSnapshot().phase,'LOCKED');assert.equal(s.getSnapshot().profile,null);f.revoke();delay=false;await s.setActive(true);assert.equal(s.getSnapshot().phase,'EXPIRED');
});
test('missing/unreadable/corrupt or other-purpose/API credentials cannot restore identity',async()=>{
 const f=fixture();await signIn(f);const raw=f.store.value!;for(const mutate of [(r:Record<string,unknown>)=>({...r,purpose:'DRIVER'}),(r:Record<string,unknown>)=>({...r,apiUrl:'http://localhost:4100/v1'}),(r:Record<string,unknown>)=>({...r,role:'PLATFORM_ADMIN'}),(r:Record<string,unknown>)=>({...r,refreshToken:'bad'})]){f.store.value=JSON.stringify(mutate(JSON.parse(raw)));const s=f.create();await s.restore();assert.equal(s.getSnapshot().phase,'SIGNED_OUT');assert.equal(f.store.value,null);}f.store.value=raw;f.store.unreadable=true;await f.create().restore();assert.equal(f.store.value,null);assert.equal(f.calls.some(c=>c.operation==='refresh'),false);
});
test('secure-store failures block network enrollment and compensate an unpersisted rotated credential',async()=>{
 const f=fixture();f.store.failAt=1;const s=f.create();await s.requestCode('+639980000001');assert.equal(s.getSnapshot().phase,'STORAGE_UNAVAILABLE');assert.equal(f.calls.length,0);
 const rotated=fixture();await signIn(rotated);rotated.store.failAt=rotated.store.writes+2;const r=rotated.create();await r.restore();assert.equal(r.getSnapshot().phase,'STORAGE_UNAVAILABLE');assert.equal(r.getSnapshot().profile,null);assert.equal(rotated.active(),false);assert.equal(rotated.calls.filter(c=>c.operation==='logout').length,1);
});
test('a lost request-code response retries the same request instead of sending a second mutation',async()=>{
 const f=fixture(),s=f.create(),request=f.transport.request;let lost=true;f.transport.request=async(...args)=>{const value=await request(...args);if(lost){lost=false;throw new Error('lost response');}return value;};await s.requestCode('+639980000001');assert.equal(s.getSnapshot().phase,'SIGNED_OUT');await s.requestCode('+639980000001');assert.equal(s.getSnapshot().phase,'CODE_REQUIRED');const keys=f.calls.filter(c=>c.operation==='request').map(c=>c.key);assert.equal(keys[0],keys[1]);
});
test('driver persona remains pending with all operational capabilities disabled',async()=>{
 const f=fixture('DRIVER'),s=await signIn(f);await s.consent(true,true);const p=s.getSnapshot().profile;assert.equal(p?.clientPurpose,'DRIVER');if(p?.clientPurpose==='DRIVER'){assert.equal(p.driverStatus,'PENDING');assert.equal(p.canGoOnline,false);assert.equal(p.operationalServicesEnabled,false);}else assert.fail('Driver profile required');
});
test('native identity configuration denies production, foreign endpoints and credential-bearing URLs',()=>{
 assert.deepEqual(mobileConfiguration(undefined,undefined,true),{enabled:false});assert.equal(mobileConfiguration('true','http://127.0.0.1:4104/v1',true).enabled,true);
 for(const [flag,url,dev]of [['true','http://127.0.0.1:4104/v1',false],['TRUE','http://127.0.0.1:4104/v1',true],['true','http://evil.invalid:4104/v1',true],['true','http://user:secret@127.0.0.1:4104/v1',true],['true','http://127.0.0.1:4104/v1?token=x',true],['true',undefined,true]] as const)assert.throws(()=>mobileConfiguration(flag,url,dev));
});

test('real generated transport projects only device/proof fields from a richer private credential record',async()=>{
 const binding={deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url'),refreshToken:'private-refresh-sentinel',logoutKey:randomUUID()},sent:string[]=[];
 const transport=mobileTransport('PASSENGER','http://127.0.0.1:4104/v1',async(_url,init)=>{const body=JSON.parse(String(init?.body));sent.push(...Object.keys(body));return new Response(JSON.stringify({challengeId:randomUUID(),expiresAt:new Date().toISOString(),resendAfter:new Date().toISOString(),clientPurpose:'PASSENGER',deliveryMode:'MOCK'}),{status:202});});
 await transport.request('+639980000001',binding,randomUUID());assert.deepEqual(sent.sort(),['clientProof','clientPurpose','deviceId','phone']);
});
