import * as oidc from 'openid-client';
import {createRemoteJWKSet,jwtVerify,type JWTPayload,type JWTHeaderParameters} from 'jose';
import {AdminSettings} from './admin-settings';
import {browserFlow} from './realm-policy';
export interface AdminProviderProof {subject:string;providerSessionId:string;authenticatedAt:number;expiresAt:number;idToken:string}
/** Called only AFTER JOSE signature, issuer, audience and expiry verification. */
export function assertAdminClaims(p:JWTPayload,h:JWTHeaderParameters,settings:AdminSettings,nonce?:string,now=Date.now()):void{
 if(h.alg!=='RS256'||h.jku||h.jwk||h.x5u||p.iss!==settings.issuer||p.aud!==settings.clientId||(p.azp!==undefined&&p.azp!==settings.clientId)||typeof p.sub!=='string'||!p.sub||typeof p.sid!=='string'||!p.sid
   ||p.email_verified!==true||!Array.isArray(p.amr)||!p.amr.includes('pwd')||!p.amr.includes('otp')||!Number.isInteger(p.auth_time)||!Number.isInteger(p.iat)||!Number.isInteger(p.exp)
   ||Number(p.auth_time)*1000>now||Number(p.iat)*1000>now||Number(p.exp)*1000<=now||Number(p.auth_time)>Number(p.iat)||Number(p.exp)-Number(p.auth_time)>3605||(nonce!==undefined&&p.nonce!==nonce))throw new Error('Invalid provider assurance');
}
export class KeycloakProvider{
 private config:oidc.Configuration|undefined;private readonly jwks;
 private readerToken:{token:string;expiresAt:number}|undefined;
 constructor(readonly settings:AdminSettings){this.jwks=createRemoteJWKSet(new URL(settings.issuer+'/protocol/openid-connect/certs'),{timeoutDuration:2000,cooldownDuration:1000});}
 async initialize(){
  this.config=await oidc.discovery(new URL(this.settings.issuer),this.settings.clientId,this.settings.clientSecret,oidc.ClientSecretPost(this.settings.clientSecret),{execute:this.settings.secure?[oidc.enableNonRepudiationChecks]:[oidc.allowInsecureRequests,oidc.enableNonRepudiationChecks],timeout:3});
  const m=this.config.serverMetadata();for(const [key,suffix]of [['authorization_endpoint','/auth'],['token_endpoint','/token'],['jwks_uri','/certs']] as const)if(m[key]!==this.settings.issuer+'/protocol/openid-connect'+suffix)throw new Error('Unapproved OIDC endpoints');
 }
 async loginUrl(state:string,nonce:string,verifier:string){if(!this.config)throw new Error('OIDC unavailable');return oidc.buildAuthorizationUrl(this.config,{scope:'openid email profile',response_type:'code',redirect_uri:this.settings.callback,state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',prompt:'login',max_age:'0'}).href;}
 async exchange(callback:URL,state:string,nonce:string,verifier:string){
  if(!this.config)throw new Error('OIDC unavailable');const result=await oidc.authorizationCodeGrant(this.config,callback,{expectedState:state,expectedNonce:nonce,pkceCodeVerifier:verifier,idTokenExpected:true,maxAge:300});
  if(!result.id_token)throw new Error('OIDC proof missing');return this.validate(result.id_token,nonce);
 }
 async validate(idToken:string,nonce?:string):Promise<AdminProviderProof>{
  if(idToken.length>12000)throw new Error('Invalid provider proof');
  const {payload:p,protectedHeader:h}=await jwtVerify(idToken,this.jwks,{issuer:this.settings.issuer,audience:this.settings.clientId,algorithms:['RS256'],requiredClaims:['sub','sid','auth_time','iat','exp','email_verified','amr'],clockTolerance:0});
  assertAdminClaims(p,h,this.settings,nonce);
  return {subject:p.sub!,providerSessionId:p.sid as string,authenticatedAt:Number(p.auth_time)*1000,expiresAt:Number(p.exp)*1000,idToken};
 }
 private async json(path:string,token:string):Promise<unknown>{
  const response=await fetch(this.settings.issuer.replace('/realms/','/admin/realms/')+path,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw new Error('Assurance unavailable');const text=await response.text();if(text.length>512000)throw new Error('Assurance response too large');return JSON.parse(text) as unknown;
 }
 private async serviceToken(){
  if(this.readerToken&&this.readerToken.expiresAt>Date.now())return this.readerToken.token;
  const response=await fetch(this.settings.issuer+'/protocol/openid-connect/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(2500),body:new URLSearchParams({grant_type:'client_credentials',client_id:this.settings.readerId,client_secret:this.settings.readerSecret})});
  const body=await response.json() as {access_token?:unknown;expires_in?:unknown};if(!response.ok||typeof body.access_token!=='string'||typeof body.expires_in!=='number')throw new Error('Assurance unavailable');
  this.readerToken={token:body.access_token,expiresAt:Date.now()+Math.min(30,body.expires_in)*1000};return body.access_token;
 }
 async assurance(proof:AdminProviderProof):Promise<string>{
  const token=await this.serviceToken();
  const [realm,user,credentials,sessions,executions,actions]=await Promise.all([
   this.json('',token),this.json('/users/'+encodeURIComponent(proof.subject),token),this.json('/users/'+encodeURIComponent(proof.subject)+'/credentials',token),this.json('/users/'+encodeURIComponent(proof.subject)+'/sessions',token),this.json('/authentication/flows/'+browserFlow+'/executions',token),this.json('/authentication/required-actions',token),
  ]) as [Record<string,unknown>,Record<string,unknown>,Array<Record<string,unknown>>,Array<Record<string,unknown>>,Array<Record<string,unknown>>,Array<Record<string,unknown>>];
  if(realm.browserFlow!==browserFlow||realm.resetCredentialsFlow!=='trissea-deny-recovery'||realm.registrationAllowed!==false||realm.resetPasswordAllowed!==false||realm.rememberMe!==false||realm.otpPolicyType!=='totp'||realm.otpPolicyAlgorithm!=='HmacSHA1'||realm.otpPolicyDigits!==6||realm.otpPolicyPeriod!==30||realm.otpPolicyLookAheadWindow!==0||realm.otpPolicyCodeReusable!==false||user.id!==proof.subject||user.enabled!==true||user.emailVerified!==true||!Array.isArray(user.requiredActions)||user.requiredActions.length!==0
   ||!Array.isArray(sessions)||!sessions.some(s=>s.id===proof.providerSessionId)||!Array.isArray(credentials)||!Array.isArray(executions)||executions.length!==2||!Array.isArray(actions))throw new Error('Current MFA assurance unavailable');
  const expected=['auth-username-password-form','auth-otp-form'];
  for(const providerId of expected){const execution=executions.find(e=>e.providerId===providerId);if(!execution||execution.requirement!=='REQUIRED'||execution.authenticationFlow===true||typeof execution.authenticationConfig!=='string')throw new Error('Unapproved authentication execution');
   const config=await this.json('/authentication/config/'+execution.authenticationConfig,token) as {config?:Record<string,string>};if(config.config?.['default.reference.value']!==(providerId==='auth-otp-form'?'otp':'pwd')||config.config?.['default.reference.maxAge']!=='3600')throw new Error('Unapproved AMR configuration');}
  if(actions.some(a=>a.enabled===true&&a.alias!=='CONFIGURE_TOTP'))throw new Error('Recovery is not approved');
  const factors=credentials.filter(c=>c.type==='otp').map(c=>({id:c.id,type:c.type,createdDate:c.createdDate,credentialData:c.credentialData}));if(factors.length!==1||typeof factors[0]?.id!=='string'||typeof factors[0].credentialData!=='string')throw new Error('Current TOTP factor unavailable');
  const factor=JSON.parse(factors[0].credentialData) as Record<string,unknown>;if(factor.subType!=='totp'||factor.digits!==6||factor.period!==30||factor.algorithm!=='HmacSHA1')throw new Error('Unapproved OTP factor');
  return JSON.stringify(factors);
 }
}
