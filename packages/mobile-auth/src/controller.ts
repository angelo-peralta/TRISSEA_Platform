import type {Schemas} from '@trissea/contracts';
import type {Purpose} from './configuration';
import type {DeviceBinding,MobileTransport,Profile} from './transport';

export interface CredentialStore {read():Promise<string|null>;write(value:string):Promise<void>;clear():Promise<void>}
export interface AuthOptions {
 purpose:Purpose;apiUrl:string;store:CredentialStore;transport:MobileTransport;
 uuid:()=>string;proof:()=>Promise<string>;now?:()=>number;
}
interface Credentials extends DeviceBinding {
 version:1;purpose:Purpose;apiUrl:string;refreshToken:string|null;sessionId:string|null;
 pendingRefresh:{key:string;startedAt:number}|null;logoutKey:string|null;
}
export type AuthPhase='SIGNED_OUT'|'WORKING'|'CODE_REQUIRED'|'CONSENT_REQUIRED'|'AUTHENTICATED'|'OFFLINE'|'EXPIRED'|'SIGNOUT_PENDING'|'STORAGE_UNAVAILABLE'|'LOCKED';
export interface AuthSnapshot {
 phase:AuthPhase;busy:boolean;message:string|null;profile:Profile|null;
 challengeExpiresAt:string|null;resendAfter:string|null;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const status=(e:unknown)=>e&&typeof e==='object'&&'status'in e&&typeof e.status==='number'?e.status:0;
const message=(e:unknown)=>({400:'Check the information and try again.',401:'Verification or session expired. Sign in again.',403:'Access is unavailable for this account.',409:'The request changed. Check the current state and retry.',429:'Too many attempts. Wait before trying again.'}[status(e)]??'Connection unavailable. Check your network and retry.');
class StorageFailure extends Error {}
class ExpiredRetry extends Error {}
function readCredentials(raw:string,options:AuthOptions):Credentials {
 const c:unknown=JSON.parse(raw);
 if(!c||typeof c!=='object'||Array.isArray(c))throw new Error('Invalid credentials');
 const v=c as Record<string,unknown>,keys=['version','purpose','apiUrl','deviceId','clientProof','refreshToken','sessionId','pendingRefresh','logoutKey'];
 if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))||v.version!==1||v.purpose!==options.purpose||v.apiUrl!==options.apiUrl||!uuid(v.deviceId)||typeof v.clientProof!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(v.clientProof))throw new Error('Invalid credentials');
 if(v.refreshToken===null?v.sessionId!==null:typeof v.refreshToken!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(v.refreshToken)||!uuid(v.sessionId))throw new Error('Invalid credentials');
 if(v.logoutKey!==null&&!uuid(v.logoutKey))throw new Error('Invalid logout');
 if(v.pendingRefresh!==null){const p=v.pendingRefresh as Record<string,unknown>;if(!p||typeof p!=='object'||Object.keys(p).length!==2||!uuid(p.key)||!Number.isSafeInteger(p.startedAt)||Number(p.startedAt)<1)throw new Error('Invalid retry');}
 if(v.refreshToken===null&&(v.pendingRefresh!==null||v.logoutKey!==null))throw new Error('Invalid session');
 return v as unknown as Credentials;
}

/** Native adapters own persistence/randomness. Only sanitized snapshots reach UI.
 * Network mutations are serialized; visibility epochs prevent stale/background
 * responses from reopening authenticated screens. PostgreSQL remains authority. */
export class MobileSession {
 private credentials:Credentials|null|undefined;
 private access:{value:string;expiresAt:number}|null=null;
 private flow:{phone:string;challenge:Schemas['PhoneChallengeResponse'];verifyKey:string}|null=null;
 private pendingChallenge:{phone:string;key:string}|null=null;
 private active=true;
 private visibility=0;
 private logoutRequested=false;
 private tail:Promise<unknown>=Promise.resolve();
 private restoreFlight:{visibility:number;promise:Promise<void>}|null=null;
 private listeners=new Set<()=>void>();
 private state:AuthSnapshot={phase:'SIGNED_OUT',busy:false,message:null,profile:null,challengeExpiresAt:null,resendAfter:null};
 private readonly now:()=>number;
 constructor(private readonly options:AuthOptions){this.now=options.now??Date.now;}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 private publish(phase:AuthPhase,text:string|null=null,profile:Profile|null=null,busy=false){
  if(!this.active){phase='LOCKED';profile=null;busy=false;}
  if(this.logoutRequested&&phase!=='STORAGE_UNAVAILABLE'&&phase!=='SIGNED_OUT'&&phase!=='LOCKED'){phase='SIGNOUT_PENDING';profile=null;}
  this.state={phase,busy,message:text,profile,challengeExpiresAt:this.flow?.challenge.expiresAt??null,resendAfter:this.flow?.challenge.resendAfter??null};
  for(const listener of this.listeners)listener();
 }
 private enqueue(work:()=>Promise<void>):Promise<void>{const next=this.tail.then(work,work);this.tail=next.catch(()=>{});return next;}
 private async save(value:Credentials){try{await this.options.store.write(JSON.stringify(value));this.credentials=value;}catch{throw new StorageFailure();}}
 private async clear(){this.access=null;this.flow=null;this.pendingChallenge=null;try{await this.options.store.clear();this.credentials=null;}catch{throw new StorageFailure();}}
 private async load(){
  if(this.credentials!==undefined)return;
  let raw:string|null;
  try{raw=await this.options.store.read();}catch{await this.clear();return;}
  if(raw===null){this.credentials=null;return;}
  try{this.credentials=readCredentials(raw,this.options);}catch{await this.clear();}
  this.logoutRequested=this.logoutRequested||!!this.credentials?.logoutKey;
 }
 private async binding():Promise<Credentials>{
  await this.load();if(this.credentials)return this.credentials;
  const c:Credentials={version:1,purpose:this.options.purpose,apiUrl:this.options.apiUrl,deviceId:this.options.uuid(),clientProof:await this.options.proof(),refreshToken:null,sessionId:null,pendingRefresh:null,logoutKey:null};
  // Validate the native random adapter before trusting/persisting its output.
  readCredentials(JSON.stringify(c),this.options);await this.save(c);return c;
 }
 private async accept(result:Schemas['MobileAuthResult'],c:Credentials){
  if(result.clientPurpose!==this.options.purpose||(c.sessionId&&c.sessionId!==result.sessionId)||!uuid(result.sessionId)||! /^[A-Za-z0-9_-]{64}$/.test(result.refreshToken)||!Number.isFinite(Date.parse(result.accessTokenExpiresAt)))throw new Error('Invalid session response');
  const next={...c,refreshToken:result.refreshToken,sessionId:result.sessionId,pendingRefresh:null};
  try{await this.save(next);}catch(e){this.access=null;try{await this.options.transport.logout(result.accessToken,this.options.uuid());}catch{/* No successful revocation is claimed. Native storage stays blocked. */}throw e;}
  this.access={value:result.accessToken,expiresAt:Date.parse(result.accessTokenExpiresAt)};
 }
 private async token():Promise<string>{
  const c=await this.binding();
  if(!c.refreshToken)throw new ExpiredRetry();
  if(!c.pendingRefresh&&this.access&&this.access.expiresAt>this.now()+5000)return this.access.value;
  if(c.pendingRefresh&&(this.now()-c.pendingRefresh.startedAt>10000||this.now()<c.pendingRefresh.startedAt)){await this.clear();throw new ExpiredRetry();}
  const pending=c.pendingRefresh??{key:this.options.uuid(),startedAt:this.now()},next={...c,pendingRefresh:pending};
  await this.save(next);const result=await this.options.transport.refresh(c.refreshToken,c,pending.key);await this.accept(result,next);return this.access!.value;
 }
 private async profile(visibility:number){
  let token=await this.token(),p:Profile;
  try{p=await this.options.transport.profile(token);}catch(e){if(status(e)!==401)throw e;this.access=null;token=await this.token();p=await this.options.transport.profile(token);}
  if(p.clientPurpose!==this.options.purpose||p.sessionId!==this.credentials?.sessionId)throw new Error('Invalid profile');
  if(this.active&&visibility===this.visibility&&!this.logoutRequested)this.publish(p.state==='CONSENT_REQUIRED'?'CONSENT_REQUIRED':'AUTHENTICATED',null,p);
 }
 private async failure(e:unknown,phase:AuthPhase='OFFLINE'){
  if(e instanceof StorageFailure){this.access=null;this.credentials=undefined;this.publish('STORAGE_UNAVAILABLE','Secure storage is unavailable. Close the app and retry.');return;}
  if(e instanceof ExpiredRetry||status(e)===401){await this.clear();this.logoutRequested=false;this.publish('EXPIRED','Your session could not be restored safely. Sign in again.');return;}
  this.publish(phase,message(e));
 }
 private async guarded(work:()=>Promise<void>,phase:AuthPhase='OFFLINE'){try{await work();}catch(e){try{await this.failure(e,phase);}catch{this.publish('STORAGE_UNAVAILABLE','Secure storage is unavailable. Close the app and retry.');}}}
 setActive(active:boolean){this.active=active;this.visibility++;if(!active){this.publish('LOCKED');return Promise.resolve();}return this.restore();}
 restore():Promise<void>{
  if(this.restoreFlight?.visibility===this.visibility)return this.restoreFlight.promise;
  const visibility=this.visibility,promise=this.enqueue(()=>this.guarded(async()=>{this.publish('WORKING','Checking your session…',null,true);await this.load();if(this.credentials?.logoutKey){this.logoutRequested=true;await this.finishLogout();return;}if(!this.credentials?.refreshToken){this.publish('SIGNED_OUT');return;}await this.profile(visibility);}));
  this.restoreFlight={visibility,promise};void promise.finally(()=>{if(this.restoreFlight?.promise===promise)this.restoreFlight=null;});return promise;
 }
 requestCode(phone:string){return this.enqueue(()=>this.guarded(async()=>{
  await this.load();
  if(this.logoutRequested||this.credentials?.refreshToken)throw new Error('Existing session');
  if(!/^\+639\d{9}$/.test(phone)){this.publish('SIGNED_OUT','Enter a Philippine mobile number in +639 format.');return;}
  this.publish('WORKING','Requesting a code…',null,true);const binding=await this.binding();
  if(this.pendingChallenge?.phone!==phone)this.pendingChallenge={phone,key:this.options.uuid()};
  const challenge=await this.options.transport.request(phone,binding,this.pendingChallenge!.key);
  if(challenge.clientPurpose!==this.options.purpose)throw new Error('Invalid challenge');this.pendingChallenge=null;this.flow={phone,challenge,verifyKey:this.options.uuid()};this.publish('CODE_REQUIRED','A code was sent through the local mock SMS harness.');
 },'SIGNED_OUT'));}
 verifyCode(code:string){const visibility=this.visibility;return this.enqueue(()=>this.guarded(async()=>{
  const flow=this.flow;if(!flow){this.publish('SIGNED_OUT');return;}
  if(!/^\d{6}$/.test(code)){this.publish('CODE_REQUIRED','Enter the six-digit code.');return;}
  if(Date.parse(flow.challenge.expiresAt)<=this.now()){this.flow=null;this.publish('EXPIRED','The code expired. Request a new code.');return;}
  this.publish('WORKING','Verifying your code…',null,true);const binding=await this.binding();
  let result:Schemas['MobileAuthResult'];
  try{result=await this.options.transport.verify(flow.phone,code,flow.challenge.challengeId,binding,flow.verifyKey);}
  catch(e){if(status(e)===401||status(e)===400){flow.verifyKey=this.options.uuid();this.publish('CODE_REQUIRED','Code not accepted. Try again, or request a new code after the cooldown.');return;}throw e;}
  await this.accept(result,binding);this.flow=null;await this.profile(visibility);
 },'CODE_REQUIRED'));}
 changeNumber(){return this.enqueue(async()=>{if(!this.credentials?.refreshToken&&!this.logoutRequested){this.flow=null;this.pendingChallenge=null;this.publish('SIGNED_OUT');}});}
 consent(notice:boolean,terms:boolean){const visibility=this.visibility;return this.enqueue(()=>this.guarded(async()=>{
  const profile=this.state.profile;if(!profile||!notice||!terms){this.publish('CONSENT_REQUIRED','Acknowledge both synthetic test documents.',profile);return;}
  this.publish('WORKING','Recording your acknowledgement…',null,true);const token=await this.token();await this.options.transport.consent(token,profile.requiredNoticeVersion,profile.requiredTermsVersion,this.options.uuid());await this.profile(visibility);
 }));}
 private async finishLogout(){
  await this.load();
  const c=this.credentials;if(!c?.refreshToken){await this.clear();this.logoutRequested=false;this.publish('SIGNED_OUT');return;}
  const key=c.logoutKey??this.options.uuid();await this.save({...c,logoutKey:key});
  try{await this.options.transport.logout(await this.token(),key);}catch(e){if(status(e)!==401)throw e;this.access=null;try{await this.options.transport.logout(await this.token(),key);}catch(retry){if(status(retry)!==401)throw retry;}}
  await this.clear();this.logoutRequested=false;this.publish('SIGNED_OUT','Signed out.');
 }
 logout(){this.logoutRequested=true;this.publish('SIGNOUT_PENDING','Finishing server sign-out…',null,true);return this.enqueue(()=>this.guarded(()=>this.finishLogout(),'SIGNOUT_PENDING'));}
}
