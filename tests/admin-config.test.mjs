import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';
import {localRealm,browserFlow} from '../infra/keycloak/realm-policy.mjs';
test('all new admin/Keycloak configuration names are documented without populated secrets',async()=>{
 const files=['services/api/src/auth/admin/admin-settings.ts','services/api/src/auth/admin/admin-runtime.ts','infra/compose.m2-keycloak.yml','scripts/prepare-keycloak-local.mjs'];
 const consumed=(await Promise.all(files.map(file=>readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n');
 const local=await readFile(new URL('../.env.example',import.meta.url),'utf8'),production=await readFile(new URL('../.env.production.example',import.meta.url),'utf8');
 const names=new Set(consumed.match(/\b(?:ADMIN|KEYCLOAK)_[A-Z_]+\b/g));
 for(const name of names){assert.match(local,new RegExp('^'+name+'=','m'),name);if(!name.startsWith('KEYCLOAK_DB_')&&!name.startsWith('KEYCLOAK_BOOTSTRAP_')&&name!=='ADMIN_API_PROXY_TARGET')assert.match(production,new RegExp('^'+name+'=','m'),name);}
 for(const file of [local,production])for(const name of ['KEYCLOAK_BFF_SECRET','KEYCLOAK_ASSURANCE_SECRET'])assert.match(file,new RegExp('^'+name+'=$','m'));
 assert.match(production,/^M2_ADMIN_AUTH_ENABLED=false$/m);
});
test('process injection takes precedence over env files; new local commands load only .env.local',async()=>{
 const result=spawnSync(process.execPath,['--env-file=.env.example','-p','process.env.ADMIN_ORIGIN'],{env:{...process.env,ADMIN_ORIGIN:'http://127.0.0.1:5999'},encoding:'utf8',windowsHide:true});assert.equal(result.status,0);assert.equal(result.stdout.trim(),'http://127.0.0.1:5999');
 const {scripts}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 for(const name of ['keycloak:up','keycloak:provision','admin:prepare','dev:admin:api','dev:admin:identity'])assert.match(scripts[name],/--env-file(?:=| )\.env\.local\b/);
 assert.doesNotMatch(scripts['dev:api'],/\.env\.local/);
});
test('source realm enforces password plus TOTP, exact redirect and disabled recovery without embedding credentials',()=>{
 const realm=localRealm({bffSecret:'synthetic-test-bff',readerSecret:'synthetic-test-reader'}),flow=realm.authenticationFlows.find(f=>f.alias===browserFlow);
 assert.deepEqual(flow.authenticationExecutions.map(e=>[e.authenticator,e.requirement]),[['auth-username-password-form','REQUIRED'],['auth-otp-form','REQUIRED']]);
 assert.equal(realm.otpPolicyCodeReusable,false);assert.equal(realm.registrationAllowed,false);assert.equal(realm.resetPasswordAllowed,false);
 const client=realm.clients.find(c=>c.clientId==='trissea-admin-bff');assert.deepEqual(client.redirectUris,['http://127.0.0.1:5174/v1/admin/auth/callback']);assert.equal(client.attributes['pkce.code.challenge.method'],'S256');assert.equal(client.directAccessGrantsEnabled,false);
 assert.ok(client.defaultClientScopes.includes('basic'));assert.equal(realm.requiredActions.filter(a=>a.enabled).length,1);
});
test('five implemented admin contracts use cookie security; login/callback cannot imply registration or operations',async()=>{
 const doc=parse(await readFile(new URL('../contracts/openapi-mvp.yaml',import.meta.url),'utf8'));
 const operations=Object.entries(doc.paths).flatMap(([path,item])=>Object.values(item).filter(op=>op['x-implemented-in']==='M2.5-local-synthetic').map(op=>({path,op})));
 assert.equal(operations.length,5);for(const {path,op} of operations)assert.deepEqual(op.security,path.endsWith('/login')||path.endsWith('/callback')?[]:[{adminCookie:[]}]);
 assert.equal(doc.components.schemas.AdminSession.properties.operationalServicesEnabled.const,false);
 assert.equal(doc.components.securitySchemes.adminCookie.in,'cookie');
});
