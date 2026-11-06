import {randomBytes,randomUUID} from 'node:crypto';
import {ForbiddenException} from '@nestjs/common';
import {and,eq,sql} from 'drizzle-orm';
import {parse,serialize} from 'cookie';
import * as b from '../../database/identity-schema';
import * as a from '../../database/admin-schema';
import {authAudit,authNow,type AuthTransaction} from '../passenger/passenger-database';
import {PassengerSecrets} from '../passenger/passenger-settings';
import {PhoneAuthError,equalDigest} from '../passenger/primitives';
import type {SessionProof} from '../policy/authorization-model';
import type {RequestCredentials} from '../policy/authorization.service';
import {AdminSettings} from './admin-settings';
import {AdminDatabase} from './admin-database';
import {KeycloakProvider} from './keycloak-provider';
const opaque=()=>randomBytes(48).toString('base64url');
export class AdminSessions{
 constructor(readonly database:AdminDatabase,readonly settings:AdminSettings,readonly secrets:PassengerSecrets,readonly provider:KeycloakProvider){}
 cookie(header:string|undefined,name=this.settings.cookieName):string|null{
  if(!header||header.length>8192||header.split(';').filter(part=>part.includes('=')&&part.slice(0,part.indexOf('=')).trim()===name).length!==1)return null;
  const value=parse(header)[name];return value&&/^[A-Za-z0-9_-]{64}$/.test(value)?value:null;
 }
 setCookie(name:string,value:string,maxAge:number,flow=false){return serialize(name,value,{maxAge,path:'/',httpOnly:true,secure:this.settings.secure,sameSite:flow?'lax':'strict'});}
 checkOrigin(origin:unknown,site?:unknown){if(origin!==this.settings.origin||(site!==undefined&&!['same-origin','same-site','none'].includes(String(site))))throw new ForbiddenException('Request origin denied');}
 async start(requestKey:string,clientProof:string,origin:unknown,cookie:string|undefined,site?:unknown,ip='127.0.0.1'){
  this.checkOrigin(origin,site);const id=randomUUID(),state=opaque(),nonce=opaque(),verifier=randomBytes(32).toString('base64url'),binding=opaque(),oldCookie=this.cookie(cookie);
  const saved=await this.database.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(71505001)`);const ipDigest=this.secrets.coordinate('admin-flow-ip',ip),requestDigest=this.secrets.coordinate('admin-flow-request',requestKey),proofDigest=this.secrets.coordinate('admin-flow-proof',clientProof,oldCookie);
   const now=await authNow(tx),[prior]=await tx.select().from(a.adminOidcFlows).where(eq(a.adminOidcFlows.requestDigest,requestDigest));
   if(prior){if(prior.usedAt||prior.expiresAt.getTime()<=now||!equalDigest(prior.proofDigest,proofDigest))throw new PhoneAuthError('CONFLICT');return {...JSON.parse(this.secrets.identity.decrypt(prior.secretCiphertext,`oidc:${prior.id}`)) as {state:string;nonce:string;verifier:string;binding:string},remaining:Math.floor((prior.expiresAt.getTime()-now)/1000)};}
   const [budget]=await tx.execute(sql`SELECT count(*)::int AS global,count(*) FILTER(WHERE ip_digest=${ipDigest} AND created_at>clock_timestamp()-interval '1 minute')::int AS ip FROM identity.admin_oidc_flows WHERE created_at>clock_timestamp()-interval '1 hour'`);
   if(Number(budget?.global)>=100||Number(budget?.ip)>=20)throw new PhoneAuthError('RATE_LIMITED');
   await tx.insert(a.adminOidcFlows).values({id,ipDigest,requestDigest,proofDigest,stateDigest:this.secrets.coordinate('oidc-state',state),bindingDigest:this.secrets.coordinate('oidc-browser',binding),secretCiphertext:this.secrets.identity.encrypt(JSON.stringify({state,nonce,verifier,binding,oldCookie}),`oidc:${id}`),createdAt:new Date(now),expiresAt:new Date(now+this.settings.flowSeconds*1000)});return {state,nonce,verifier,binding,remaining:this.settings.flowSeconds};});
  return {authorizationUrl:await this.provider.loginUrl(saved.state,saved.nonce,saved.verifier),cookie:this.setCookie(this.settings.flowCookieName,saved.binding,saved.remaining,true)};
 }
 async callback(url:URL,cookies:string|undefined){
  if(url.origin!==this.settings.origin||url.pathname!=='/v1/admin/auth/callback'||[...url.searchParams.keys()].some(k=>!['code','state','session_state','iss','error','error_description'].includes(k))||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length!==1)throw new PhoneAuthError('AUTH_FAILED');
  const state=url.searchParams.get('state'),binding=this.cookie(cookies,this.settings.flowCookieName);if(!state||!binding)throw new PhoneAuthError('AUTH_FAILED');
  // Consume before provider I/O: any replay/ambiguous exchange needs a fresh flow, never a retry bypass.
  const flow=await this.database.transaction(async tx=>{const [row]=await tx.select().from(a.adminOidcFlows).where(eq(a.adminOidcFlows.stateDigest,this.secrets.coordinate('oidc-state',state))).for('update');
   if(!row||row.usedAt||row.expiresAt.getTime()<=await authNow(tx)||!equalDigest(row.bindingDigest,this.secrets.coordinate('oidc-browser',binding)))throw new PhoneAuthError('AUTH_FAILED');
   await tx.update(a.adminOidcFlows).set({usedAt:new Date(await authNow(tx))}).where(eq(a.adminOidcFlows.id,row.id));return row;});
  const saved=JSON.parse(this.secrets.identity.decrypt(flow.secretCiphertext,`oidc:${flow.id}`)) as {nonce:string;verifier:string;oldCookie:string|null};
  const proof=await this.provider.exchange(url,state,saved.nonce,saved.verifier),factor=await this.provider.assurance(proof),sessionId=randomUUID(),cookie=opaque(),csrf=opaque();
  await this.database.transaction(async tx=>{
   const [identity]=await tx.select().from(b.authIdentities).where(and(eq(b.authIdentities.kind,'KEYCLOAK'),eq(b.authIdentities.issuer,this.settings.issuer),eq(b.authIdentities.keyId,this.secrets.keyId),eq(b.authIdentities.subjectDigest,this.secrets.identity.lookup(proof.subject,'KEYCLOAK'))));
   if(!identity||identity.state!=='ACTIVE'||this.secrets.identity.decrypt(identity.subjectCiphertext,'KEYCLOAK')!==proof.subject)throw new PhoneAuthError('AUTH_FAILED');
   await tx.execute(sql`SELECT set_config('trissea.user_id',${identity.userId},true),set_config('trissea.client_purpose','ADMIN',true)`);
   await tx.execute(sql`SELECT id FROM identity.app_users WHERE id=${identity.userId}::uuid FOR UPDATE`);
   await tx.execute(sql`SELECT identity.lock_admin_identity(${identity.userId}::uuid,${identity.id}::uuid)`);
   const [user]=await tx.select({id:b.appUsers.id,state:b.appUsers.state,authVersion:b.appUsers.authVersion}).from(b.appUsers).where(eq(b.appUsers.id,identity.userId));
   const [mapping]=await tx.select().from(b.administrativeIdentityMappings).where(and(eq(b.administrativeIdentityMappings.identityId,identity.id),eq(b.administrativeIdentityMappings.userId,identity.userId),eq(b.administrativeIdentityMappings.state,'APPROVED')));
   const now=await authNow(tx);if(!user||user.state!=='ACTIVE'||!mapping||proof.authenticatedAt>now||now-proof.authenticatedAt>this.settings.reauthSeconds*1000)throw new PhoneAuthError('AUTH_FAILED');
   if(saved.oldCookie){const [old]=await tx.select({id:b.appSessions.id,userId:b.appSessions.userId,state:b.appSessions.state}).from(a.adminBrowserSessions).innerJoin(b.appSessions,eq(b.appSessions.id,a.adminBrowserSessions.sessionId)).where(eq(a.adminBrowserSessions.cookieDigest,this.secrets.coordinate('admin-cookie',saved.oldCookie)));
    if(old&&old.userId!==user.id)throw new PhoneAuthError('AUTH_FAILED');
    if(old&&!['REVOKED','EXPIRED'].includes(old.state))await tx.update(b.appSessions).set({state:'REVOKED',revokedAt:new Date(now),version:sql`${b.appSessions.version}+1`}).where(eq(b.appSessions.id,old.id));}
   await tx.insert(b.appSessions).values({id:sessionId,userId:user.id,identityId:identity.id,identityKind:'KEYCLOAK',clientPurpose:'ADMIN',state:'ACTIVE',authVersion:user.authVersion,authenticatedAt:new Date(proof.authenticatedAt),mfaVerifiedAt:new Date(proof.authenticatedAt),lastSeenAt:new Date(now),expiresAt:new Date(Math.min(proof.expiresAt,now+this.settings.sessionSeconds*1000))});
   await tx.insert(a.adminBrowserSessions).values({sessionId,cookieDigest:this.secrets.coordinate('admin-cookie',cookie),csrfDigest:this.secrets.coordinate('admin-csrf',csrf),factorDigest:this.secrets.coordinate('admin-factor',proof.subject,factor),providerCiphertext:this.secrets.identity.encrypt(JSON.stringify({idToken:proof.idToken,csrf}),`admin-provider:${sessionId}`)});
   await authAudit(tx,'admin.authenticated',sessionId,user.id,sessionId);
  });
  return {cookie:this.setCookie(this.settings.cookieName,cookie,this.settings.sessionSeconds),clearFlow:this.setCookie(this.settings.flowCookieName,'',0,true)};
 }
 async verify(credentials:RequestCredentials):Promise<SessionProof|null>{
  try{
   if(credentials.authorization)return null;const value=this.cookie(credentials.cookie);if(!value)return null;
   const row=await this.database.transaction(async tx=>{const [row]=await tx.select({session:b.appSessions,browser:a.adminBrowserSessions}).from(a.adminBrowserSessions).innerJoin(b.appSessions,eq(b.appSessions.id,a.adminBrowserSessions.sessionId)).where(eq(a.adminBrowserSessions.cookieDigest,this.secrets.coordinate('admin-cookie',value)));return row;});
   if(!row||row.session.clientPurpose!=='ADMIN'||row.session.state!=='ACTIVE'||row.session.expiresAt.getTime()<=Date.now()||Date.now()-row.session.lastSeenAt.getTime()>=this.settings.idleSeconds*1000)return null;
   const saved=JSON.parse(this.secrets.identity.decrypt(row.browser.providerCiphertext,`admin-provider:${row.session.id}`)) as {idToken:string};
   const provider=await this.provider.validate(saved.idToken),checkedAt=Date.now(),factor=await this.provider.assurance(provider);
   if(!equalDigest(row.browser.factorDigest,this.secrets.coordinate('admin-factor',provider.subject,factor))||provider.authenticatedAt!==row.session.authenticatedAt.getTime())return null;
   const current=await this.database.transaction(async tx=>{await tx.execute(sql`SELECT set_config('trissea.user_id',${row.session.userId},true)`);await tx.execute(sql`SELECT id FROM identity.app_users WHERE id=${row.session.userId}::uuid FOR UPDATE`);
    const [subject]=await tx.select({state:b.appUsers.state,authVersion:b.appUsers.authVersion,identity:b.authIdentities.state,mapping:b.administrativeIdentityMappings.state,digest:b.authIdentities.subjectDigest}).from(b.appUsers)
     .innerJoin(b.authIdentities,and(eq(b.authIdentities.userId,b.appUsers.id),eq(b.authIdentities.id,row.session.identityId))).innerJoin(b.administrativeIdentityMappings,eq(b.administrativeIdentityMappings.identityId,b.authIdentities.id)).where(eq(b.appUsers.id,row.session.userId));
    if(!subject||subject.state!=='ACTIVE'||subject.identity!=='ACTIVE'||subject.mapping!=='APPROVED'||subject.authVersion!==row.session.authVersion||!equalDigest(subject.digest,this.secrets.identity.lookup(provider.subject,'KEYCLOAK')))return false;
    const touched=await tx.update(b.appSessions).set({lastSeenAt:new Date(await authNow(tx)),version:sql`${b.appSessions.version}+1`}).where(and(eq(b.appSessions.id,row.session.id),eq(b.appSessions.state,'ACTIVE'),sql`${b.appSessions.expiresAt}>clock_timestamp() AND ${b.appSessions.lastSeenAt}>clock_timestamp()-(${this.settings.idleSeconds}*interval '1 second')`)).returning({id:b.appSessions.id});return touched.length===1;});
   const expiresAt=Math.min(provider.expiresAt,row.session.expiresAt.getTime()),currentUntil=Math.min(expiresAt,checkedAt+5000);if(!current||currentUntil<=Date.now())return null;
   return {userId:row.session.userId,sessionId:row.session.id,identityId:row.session.identityId,purpose:'ADMIN',expiresAt,adminMfa:{authenticatedAt:provider.authenticatedAt,verifiedAt:row.session.mfaVerifiedAt!.getTime(),currentUntil}};
  }catch{return null;}
 }
 async session(tx:AuthTransaction,userId:string,sessionId:string){
  const [row]=await tx.select().from(a.adminBrowserSessions).where(eq(a.adminBrowserSessions.sessionId,sessionId));if(!row)throw new PhoneAuthError('AUTH_FAILED');
  const saved=JSON.parse(this.secrets.identity.decrypt(row.providerCiphertext,`admin-provider:${sessionId}`)) as {csrf:string};
  return {userId,sessionId,clientPurpose:'ADMIN' as const,mfaVerified:true as const,csrfToken:saved.csrf,permissionsResolvedPerResource:true as const,operationalServicesEnabled:false as const};
 }
 async assertCsrf(tx:AuthTransaction,sessionId:string,origin:unknown,csrf:unknown){
  this.checkOrigin(origin);const [row]=await tx.select({csrfDigest:a.adminBrowserSessions.csrfDigest}).from(a.adminBrowserSessions).where(eq(a.adminBrowserSessions.sessionId,sessionId));
  if(!row||typeof csrf!=='string'||!equalDigest(row.csrfDigest,this.secrets.coordinate('admin-csrf',csrf)))throw new ForbiddenException('Request CSRF denied');
 }
 async logout(tx:AuthTransaction,userId:string,sessionId:string,origin:unknown,csrf:unknown){
  await this.assertCsrf(tx,sessionId,origin,csrf);
  const now=await authNow(tx);await tx.update(b.appSessions).set({state:'REVOKED',revokedAt:new Date(now),version:sql`${b.appSessions.version}+1`}).where(eq(b.appSessions.id,sessionId));await authAudit(tx,'admin.logged_out',sessionId,userId,sessionId);
 }
}
