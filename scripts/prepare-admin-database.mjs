import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertLocalDatabase,assertDisposableIdentityDatabase} from './migration-policy.mjs';
async function main(){
 if(process.env.NODE_ENV!=='development'||process.env.ADMIN_SECURITY_MODE!=='local-synthetic')throw new Error();
 const file=new URL('../.env.local',import.meta.url),contents=await readFile(file,'utf8'),existing=parseEnv(contents);
 if(existing.ADMIN_DATABASE_URL&&!process.argv.includes('--new-disposable')){console.info('Existing admin development database configuration preserved.');return;}
 const controlEnv=parseEnv(await readFile(new URL('../.env.m2-test',import.meta.url),'utf8')),url=new URL(controlEnv.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,controlEnv.NODE_ENV);
 if(url.pathname!=='/m2_control'||controlEnv.M2_DISPOSABLE_DATABASE!=='true')throw new Error();
 const suffix=randomBytes(6).toString('hex'),database=`trissea_m2_test_${suffix}`,login=`m2_admin_${suffix}`,password=randomBytes(32).toString('hex');let control,owner,previous;
 try{
  const options={max:1,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC'}};control=postgres(url.href,options);
  if(existing.ADMIN_DATABASE_URL){const prior=new URL(existing.ADMIN_DATABASE_URL);assertDisposableIdentityDatabase(prior.href,'development','true');if(prior.hostname!==url.hostname||prior.port!==url.port)throw new Error();const target=new URL(url);target.pathname=prior.pathname;previous=postgres(target.href,options);const [manifest]=await previous`SELECT value FROM m2_disposable_manifest WHERE key='identity-test'`,[users]=await previous`SELECT count(*)::int AS n FROM identity.app_users`;if(manifest?.value!==prior.pathname.slice(1)||users.n!==0)throw new Error('Existing development data must remain configured');await mkdir(new URL('../.cache/m2-keycloak/',import.meta.url),{recursive:true});await writeFile(new URL(`../.cache/m2-keycloak/prior-env-${suffix}.txt`,import.meta.url),contents,{flag:'wx',mode:0o600});}
  await control.unsafe(`CREATE DATABASE "${database}"`);url.pathname=`/${database}`;assertDisposableIdentityDatabase(url.href,'development','true');owner=postgres(url.href,options);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
  await runMigrations(owner,'up',{through:'0006_admin_browser_auth',allowIdentity:true,report:console.info});
  await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_admin_auth,trissea_m2_authorization`);await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);
  url.username=login;url.password=password;await writeFile(file,contents.replace(/^ADMIN_DATABASE_URL=.*\r?\n?/m,'')+`ADMIN_DATABASE_URL=${url.href}\n`,{mode:0o600});console.info('Prepared empty disposable admin database through 0006; generated non-owner login, no application administrator/grants seeded. Previous databases retained.');
 }finally{await Promise.allSettled([owner?.end(),control?.end(),previous?.end()]);}
}
await main().catch(()=>{console.error('Admin database preparation failed; existing databases were preserved.');process.exitCode=1;});
