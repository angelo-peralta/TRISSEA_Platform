import configuration from './environment.cjs';
import {randomBytes} from 'node:crypto';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertLocalDatabase,assertDisposableIdentityDatabase} from './migration-policy.mjs';
async function main(){
 if(process.argv.length!==2||process.env.NODE_ENV!=='development'||process.env.ADMIN_SECURITY_MODE!=='local-synthetic')throw new Error();
 const existing=configuration.loadLocal();
 if(existing.ADMIN_DATABASE_URL){console.info('Existing canonical admin configuration preserved.');return;}
 const controlEnv=configuration.environmentFor('test'),url=new URL(controlEnv.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,controlEnv.NODE_ENV);
 if(url.pathname!=='/m2_control'||controlEnv.M2_DISPOSABLE_DATABASE!=='true')throw new Error();
 const suffix=randomBytes(6).toString('hex'),database='trissea_m2_test_'+suffix,login='m2_admin_'+suffix,password=randomBytes(32).toString('hex');let control,owner;
 try{
  const options={max:1,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC'}};control=postgres(url.href,options);
  await control.unsafe('CREATE DATABASE "'+database+'"');url.pathname='/'+database;assertDisposableIdentityDatabase(url.href,'development','true');owner=postgres(url.href,options);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
  await runMigrations(owner,'up',{through:'0006_admin_browser_auth',allowIdentity:true,report:console.info});
  await control.unsafe('CREATE ROLE "'+login+'" LOGIN PASSWORD '+"'"+password+"'"+' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_admin_auth,trissea_m2_authorization');await owner.unsafe('GRANT SELECT ON m2_disposable_manifest TO "'+login+'"');
  url.username=login;url.password=password;configuration.updateLocal({ADMIN_DATABASE_URL:url.href});console.info('Prepared a NEW empty disposable admin fixture; no users or grants seeded.');
 }finally{await Promise.allSettled([owner?.end(),control?.end()]);}
}
await main().catch(()=>{console.error('Admin preparation failed; existing configuration and databases preserved.');process.exitCode=1;});
