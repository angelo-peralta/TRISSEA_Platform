import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
import {AdminSettings,adminDatabaseUrl} from '../src/auth/admin/admin-settings';
import {AdminRuntime} from '../src/auth/admin/admin-runtime';
import {AdminSessions} from '../src/auth/admin/admin-sessions';
import {AdminDatabase} from '../src/auth/admin/admin-database';
import {KeycloakProvider,assertAdminClaims} from '../src/auth/admin/keycloak-provider';
import {PassengerSecrets} from '../src/auth/passenger/passenger-settings';
import {CompositeIdentityProvider,DenyIdentityProvider} from '../src/auth/identity-provider';

const env={NODE_ENV:'test',ADMIN_SECURITY_MODE:'local-synthetic',ADMIN_ORIGIN:'http://127.0.0.1:5174',KEYCLOAK_ISSUER:'http://127.0.0.1:18080/realms/trissea-local',KEYCLOAK_CLIENT_ID:'trissea-admin-bff',KEYCLOAK_ASSURANCE_CLIENT_ID:'trissea-assurance-reader',KEYCLOAK_BFF_SECRET:'a'.repeat(43),KEYCLOAK_ASSURANCE_SECRET:'b'.repeat(43)};
test('admin configuration rejects unsafe origins/issuer/secrets, widened lifetimes and activation flags',()=>{
 const config=new AdminSettings(env);assert.equal(config.idleSeconds,900);assert.equal(config.reauthSeconds,300);
 for(const change of [{NODE_ENV:'staging'},{ADMIN_SECURITY_MODE:'production'},{ADMIN_ORIGIN:'http://evil.invalid:5174'},{ADMIN_ORIGIN:'http://127.0.0.1:5174/path'},{KEYCLOAK_ISSUER:'http://127.0.0.1:18080/realms/master'},{KEYCLOAK_BFF_SECRET:'change_me'},{KEYCLOAK_ASSURANCE_SECRET:env.KEYCLOAK_BFF_SECRET},{ADMIN_IDLE_SECONDS:'901'},{ADMIN_REAUTH_SECONDS:'301'},{RECOVERY_ENABLED:'true'},{SMS_LIVE_ENABLED:'true'},{REAL_DOCUMENTS_ENABLED:'true'},{OPERATIONAL_SERVICES_ENABLED:'true'}])assert.throws(()=>new AdminSettings({...env,...change}));
});
test('production settings require HTTPS, isolated cookies, bounded limits and closed capabilities',()=>{
 const production={...env,NODE_ENV:'production',ADMIN_SECURITY_MODE:'production',ADMIN_ORIGIN:'https://admin.example.invalid',KEYCLOAK_ISSUER:'https://id.example.invalid/realms/trissea'};
 const config=new AdminSettings(production);assert.equal(config.cookieName,'__Host-trissea-admin');assert.equal(config.secure,true);
 for(const change of [{ADMIN_ORIGIN:'http://admin.example.invalid'},{KEYCLOAK_ISSUER:'https://localhost/realms/trissea'},{KEYCLOAK_ISSUER:'https://id.example.invalid/realms/master'},{SMS_PROVIDER:'mock'},{SMS_LIVE_ENABLED:'true'},{RECOVERY_ENABLED:'true'},{ADMIN_IDLE_SECONDS:'0'},{ADMIN_REAUTH_SECONDS:'301'}])assert.throws(()=>new AdminSettings({...production,...change}));
});
test('admin DB accepts only disposable local DB; combined mobile/admin identity must use same database',()=>{
 const input={ADMIN_DATABASE_URL:'postgres://runtime:synthetic@127.0.0.1:15433/trissea_m2_test_123456abcdef'};
 assert.doesNotThrow(()=>adminDatabaseUrl(input));
 for(const url of ['postgres://runtime:synthetic@remote.invalid:15433/trissea_m2_test_123456abcdef','postgres://runtime:synthetic@127.0.0.1:15432/trissea_dev',input.ADMIN_DATABASE_URL+'?sslmode=disable'])assert.throws(()=>adminDatabaseUrl({ADMIN_DATABASE_URL:url}));
 assert.throws(()=>adminDatabaseUrl({...input,M2_PASSENGER_AUTH_ENABLED:'true',M2_PASSENGER_DATABASE_URL:input.ADMIN_DATABASE_URL.replace('123456abcdef','ffffffffffff')}));
 assert.doesNotThrow(()=>adminDatabaseUrl({...input,M2_PASSENGER_AUTH_ENABLED:'true',M2_PASSENGER_DATABASE_URL:input.ADMIN_DATABASE_URL.replace('runtime:','mobile:')}));
});
test('cookies reject duplicates/malformed credentials and enforce host-only, HttpOnly, SameSite and Secure',()=>{
 const keys=new PassengerSecrets('admin-test',randomBytes(32),randomBytes(32),randomBytes(32),randomBytes(32),randomBytes(32));
 const make=(settings:AdminSettings)=>new AdminSessions(null as unknown as AdminDatabase,settings,keys,null as unknown as KeycloakProvider);
 const sessions=make(new AdminSettings(env)),value=randomBytes(48).toString('base64url'),header=`trissea_admin_local=${value}`;
 assert.equal(sessions.cookie(header),value);assert.equal(sessions.cookie(header+'; '+header),null);assert.equal(sessions.cookie('trissea_admin_local=invalid'),null);
 assert.equal(sessions.cookie(`trissea_admin_local =${value}; ${header}`),null);assert.equal(sessions.cookie(`${header}; trissea_admin_local\t=${value}`),null);
 assert.throws(()=>sessions.checkOrigin('https://attacker.invalid'));assert.throws(()=>sessions.checkOrigin(env.ADMIN_ORIGIN,'cross-site'));assert.doesNotThrow(()=>sessions.checkOrigin(env.ADMIN_ORIGIN,'same-origin'));
 const local=sessions.setCookie('trissea_admin_local',value,3600);assert.match(local,/HttpOnly/);assert.match(local,/SameSite=Strict/);assert.doesNotMatch(local,/Domain=|Secure/);
 const prod=make(new AdminSettings({...env,NODE_ENV:'production',ADMIN_SECURITY_MODE:'production',ADMIN_ORIGIN:'https://admin.example.invalid',KEYCLOAK_ISSUER:'https://id.example.invalid/realms/trissea'}));
 assert.match(prod.setCookie(prod.settings.cookieName,value,3600),/Secure/);assert.match(sessions.setCookie('trissea_admin_flow_local',value,300,true),/SameSite=Lax/);
});
test('credential routing rejects mixed bearer/cookie and never substitutes mobile proof for admin cookie',async()=>{
 const provider=new CompositeIdentityProvider(new DenyIdentityProvider());
 assert.equal(await provider.verifyRequest({cookie:'synthetic',authorization:'Bearer synthetic'}),null);assert.equal(await provider.verifyRequest({cookie:'synthetic'}),null);assert.equal(await provider.verifyRequest({authorization:'Bearer synthetic'}),null);
});
test('verified ID-token claims require exact issuer/audience, fresh timestamps, nonce and password plus OTP AMR',()=>{
 const settings=new AdminSettings(env),now=Math.floor(Date.now()/1000),claims={iss:settings.issuer,aud:settings.clientId,sub:'synthetic-keycloak-subject',sid:'synthetic-provider-session',auth_time:now,iat:now,exp:now+3600,email_verified:true,amr:['pwd','otp'],nonce:'synthetic-nonce'};
 assert.doesNotThrow(()=>assertAdminClaims(claims,{alg:'RS256'},settings,'synthetic-nonce'));
 for(const change of [{iss:'https://attacker.invalid'},{aud:'mobile-driver'},{aud:[settings.clientId,'other']},{azp:'other'},{sub:''},{sid:''},{auth_time:undefined},{auth_time:now+1},{iat:now+60},{exp:now-1},{exp:now+3606},{email_verified:false},{amr:['pwd']},{amr:['otp']},{amr:[]},{nonce:'other'}])assert.throws(()=>assertAdminClaims({...claims,...change},{alg:'RS256'},settings,'synthetic-nonce'));
 for(const header of [{alg:'HS256'},{alg:'RS256',jku:'https://attacker.invalid'},{alg:'RS256',x5u:'https://attacker.invalid'},{alg:'RS256',jwk:{kty:'RSA'}}])assert.throws(()=>assertAdminClaims(claims,header,settings));
});
test('production administrator activation is rejected before any DB, key-file or provider access',async()=>{
 const input={...env,NODE_ENV:'production',ADMIN_SECURITY_MODE:'production',ADMIN_ORIGIN:'https://admin.example.invalid',KEYCLOAK_ISSUER:'https://id.example.invalid/realms/trissea',M2_ADMIN_AUTH_ENABLED:'true',SMS_PROVIDER:'philsms',SMS_LIVE_ENABLED:'false',RECOVERY_ENABLED:'false',REAL_DOCUMENTS_ENABLED:'false',OPERATIONAL_SERVICES_ENABLED:'false'};
 const previous=Object.fromEntries(Object.keys(input).map(key=>[key,process.env[key]]));
 try{Object.assign(process.env,input);await assert.rejects(AdminRuntime.fromEnvironment(),/not approved for production activation/);}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
