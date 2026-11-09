import {localRealm,browserFlow} from '../infra/keycloak/realm-policy.mjs';
const realm='trissea-local';
function providerBase(env){const issuer=new URL(env.KEYCLOAK_ISSUER);if(env.NODE_ENV==='production'||issuer.protocol!=='http:'||issuer.hostname!=='127.0.0.1'||issuer.pathname!=='/realms/'+realm||issuer.port!==(env.DEV_KEYCLOAK_PORT??'18080')||!['18080','18081'].includes(issuer.port)||issuer.username||issuer.password||issuer.search||issuer.hash)throw new Error('Invalid local provider endpoint');return issuer.origin;}
export async function bootstrapClient(env){
 const base=providerBase(env);
 let credential;
 async function authorize(){
 if(credential&&credential.expiresAt>Date.now()+5000)return credential.token;
 const response=await fetch(base+'/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:env.KEYCLOAK_BOOTSTRAP_USER,password:env.KEYCLOAK_BOOTSTRAP_PASSWORD}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok||!result.access_token)throw new Error('Bootstrap unavailable');credential={token:result.access_token,expiresAt:Date.now()+result.expires_in*1000};return credential.token;
 }
 return async(path,method='GET',body)=>{const token=await authorize(),r=await fetch(base+'/admin/realms/'+realm+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Synthetic realm provisioning failed (${r.status})`);return r.status===204||r.status===201?null:r.json();};
}
export async function provision(env){
 const api=await bootstrapClient(env),current=await api('');
 if(current.realm!==realm||current.attributes?.['trissea.environment']!=='local-synthetic')throw new Error();
 const policy=localRealm({bffSecret:env.KEYCLOAK_BFF_SECRET,readerSecret:env.KEYCLOAK_ASSURANCE_SECRET});
 await api('','PUT',{...current,attributes:policy.attributes,registrationAllowed:false,resetPasswordAllowed:false,rememberMe:false,editUsernameAllowed:false,browserFlow,resetCredentialsFlow:'trissea-deny-recovery',otpPolicyCodeReusable:false});
 const executions=await api('/authentication/flows/'+browserFlow+'/executions');
 for(const execution of executions){const ref=execution.providerId==='auth-otp-form'?'otp':execution.providerId==='auth-username-password-form'?'pwd':null;if(!ref)throw new Error('Unexpected authentication execution');
  const config={alias:ref==='otp'?'trissea-totp-amr':'trissea-password-amr',config:{'default.reference.value':ref,'default.reference.maxAge':'3600'}};
  if(execution.authenticationConfig)await api('/authentication/config/'+execution.authenticationConfig,'PUT',config);else await api('/authentication/executions/'+execution.id+'/config','POST',config);
 }
 for(const action of await api('/authentication/required-actions'))if(action.alias!=='CONFIGURE_TOTP'&&action.enabled)await api('/authentication/required-actions/'+action.alias,'PUT',{...action,enabled:false,defaultAction:false});
 const clients=await api('/clients'),reader=clients.find(c=>c.clientId==='trissea-assurance-reader'),management=clients.find(c=>c.clientId==='realm-management');
 if(!reader||!management)throw new Error('Assurance client missing');const account=await api('/clients/'+reader.id+'/service-account-user');
 const bff=clients.find(c=>c.clientId==='trissea-admin-bff'),scopes=await api('/client-scopes');
 if(!bff)throw new Error('BFF client missing');
 for(const name of ['basic','profile','email']){const scope=scopes.find(s=>s.name===name);if(!scope)throw new Error('Required standard claim scope missing');await api('/clients/'+bff.id+'/default-client-scopes/'+scope.id,'PUT');}
 for(const name of ['roles','kc-admin-api']){const scope=scopes.find(s=>s.name===name);if(!scope)throw new Error('Reader standard API scope missing');await api('/clients/'+reader.id+'/default-client-scopes/'+scope.id,'PUT');}
 const roles=await api('/clients/'+management.id+'/roles');await api('/users/'+account.id+'/role-mappings/clients/'+management.id,'POST',roles.filter(r=>['view-users','query-users','view-realm'].includes(r.name)));
 // No default end-user account-management privileges; recovery remains explicitly disabled.
 for(const id of ['account','account-console','broker']){const c=clients.find(c=>c.clientId===id);if(c)await api('/clients/'+c.id,'PUT',{...c,enabled:false});}
 console.info('Configured isolated password/TOTP flow and read-only assurance service account; no TRISSEA user/role grants created.');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/provision-keycloak-local.mjs'))await provision(process.env).catch(()=>{console.error('Synthetic Keycloak provisioning failed; no recovery bypass or fallback applied.');process.exitCode=1;});
