import {testDatabasePort,localKeycloakPort} from '../../development-endpoints';
import {readIdentityPolicy} from '../../database/identity-policy';
export class AdminSettings{
 readonly origin:string;readonly issuer:string;readonly callback:string;readonly secure:boolean;readonly clientId:string;readonly readerId:string;
 readonly clientSecret:string;readonly readerSecret:string;readonly idleSeconds:number;readonly reauthSeconds:number;
 readonly sessionSeconds=3600;readonly flowSeconds=300;
 constructor(env:Readonly<Record<string,string|undefined>>){
  const requireValue=(key:string)=>{const value=env[key];if(!value)throw new Error(`Invalid configuration: ${key}`);return value;};
  if(!['development','test','production'].includes(env.NODE_ENV??''))throw new Error('Invalid configuration: NODE_ENV');
  this.secure=env.NODE_ENV==='production';
  if(env.ADMIN_SECURITY_MODE!==(this.secure?'production':'local-synthetic'))throw new Error('Invalid configuration: ADMIN_SECURITY_MODE');
  const url=(key:string)=>{try{const value=new URL(requireValue(key));if(value.username||value.password||value.search||value.hash||(this.secure?(value.protocol!=='https:'||['localhost','127.0.0.1','[::1]'].includes(value.hostname)):(value.protocol!=='http:'||value.hostname!=='127.0.0.1')))throw new Error();return value;}catch{throw new Error(`Invalid configuration: ${key}`);}};
  const origin=url('ADMIN_ORIGIN'),issuer=url('KEYCLOAK_ISSUER');if(origin.pathname!=='/'||(!this.secure&&issuer.href!=='http://127.0.0.1:'+localKeycloakPort(env)+'/realms/trissea-local')||issuer.pathname.endsWith('/master'))throw new Error('Invalid configuration: ADMIN_ORIGIN/KEYCLOAK_ISSUER');
  this.origin=origin.origin;this.issuer=issuer.href;this.callback=this.origin+'/v1/admin/auth/callback';
  this.clientId=requireValue('KEYCLOAK_CLIENT_ID');this.readerId=requireValue('KEYCLOAK_ASSURANCE_CLIENT_ID');
  if(this.clientId!=='trissea-admin-bff'||this.readerId!=='trissea-assurance-reader')throw new Error('Invalid configuration: KEYCLOAK_CLIENT_ID');
  this.clientSecret=requireValue('KEYCLOAK_BFF_SECRET');this.readerSecret=requireValue('KEYCLOAK_ASSURANCE_SECRET');
  if([this.clientSecret,this.readerSecret].some(s=>s.length<32||/\s/.test(s))||this.clientSecret===this.readerSecret)throw new Error('Invalid configuration: Keycloak secrets');
  const bounded=(name:string,fallback:number,min:number,max:number)=>{const raw=env[name]??String(fallback),value=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`Invalid configuration: ${name}`);return value;};
  // Production remains startup-gated. Validate its cookie/URL contract without
  // pretending it is a development SMS environment to obtain admin limits.
  if(this.secure&&(env.SMS_PROVIDER==='mock'||['SMS_LIVE_ENABLED','RECOVERY_ENABLED','REAL_DOCUMENTS_ENABLED','OPERATIONAL_SERVICES_ENABLED'].some(name=>env[name]!==undefined&&env[name]!=='false')))throw new Error('Unapproved production capabilities');
  const policy=this.secure?{adminIdleSeconds:bounded('ADMIN_IDLE_SECONDS',900,60,900),adminReauthSeconds:bounded('ADMIN_REAUTH_SECONDS',300,30,300)}:readIdentityPolicy(env);
  this.idleSeconds=policy.adminIdleSeconds;this.reauthSeconds=policy.adminReauthSeconds;Object.freeze(this);
 }
 get cookieName(){return this.secure?'__Host-trissea-admin':'trissea_admin_local';}
 get flowCookieName(){return this.secure?'__Host-trissea-admin-flow':'trissea_admin_flow_local';}
}

export function adminDatabaseUrl(env:Readonly<Record<string,string|undefined>>):URL{
 try{
  const url=new URL(env.ADMIN_DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!==testDatabasePort(env)||!/^\/trissea_m2_test_[a-f0-9]{12}$/.test(url.pathname)||url.search||url.hash)throw new Error();
  if(env.M2_PASSENGER_AUTH_ENABLED==='true'){const mobile=new URL(env.M2_PASSENGER_DATABASE_URL??'');if(mobile.hostname!==url.hostname||mobile.port!==url.port||mobile.pathname!==url.pathname)throw new Error();}
  return url;
 }catch{throw new Error('Invalid configuration: ADMIN_DATABASE_URL');}
}
