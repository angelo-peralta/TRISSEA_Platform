import configuration from './environment.cjs';
import { mkdir,writeFile } from 'node:fs/promises';
import { randomBytes,generateKeyPairSync } from 'node:crypto';
import postgres from 'postgres';
import { assertLocalDatabase,assertDisposableIdentityDatabase } from './migration-policy.mjs';
import { runMigrations } from './migration-runner.mjs';

async function main(){
 const driver=process.argv.includes('--driver');if(process.argv.slice(2).some(arg=>arg!=='--driver'))throw new Error();
 const mode=driver?'driver':'passenger',port=driver?4101:4100;
 const existing=configuration.loadLocal(),prefix=mode.toUpperCase()+'_LOCAL_';
 if(existing[prefix+'DATABASE_URL']){if(!existing[prefix+'KEYS_FILE']||!existing[prefix+'REDIS_NAMESPACE'])throw new Error();console.info('Existing canonical persona configuration preserved.');return;}
 const url=new URL(process.env.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,process.env.NODE_ENV);
 if(url.pathname!=='/m2_control'||url.search||process.env.M2_DISPOSABLE_DATABASE!=='true')throw new Error();
 const suffix=randomBytes(6).toString('hex'),database=`trissea_m2_test_${suffix}`,login=`m2_${mode}_${suffix}`,password=randomBytes(32).toString('hex');
 let control,owner;
 try{
  const options={max:1,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC',statement_timeout:15000}};
  control=postgres(url.href,options);await control.unsafe(`CREATE DATABASE "${database}"`);
  url.pathname=`/${database}`;assertDisposableIdentityDatabase(url.href,process.env.NODE_ENV,'true');owner=postgres(url.href,options);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
  await runMigrations(owner,'up',{through:driver?'0005_driver_identity':'0004_passenger_auth',allowIdentity:true,report:console.info});
  await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_auth,trissea_m2_authorization`);
  await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);url.username=login;url.password=password;
  const pair=generateKeyPairSync('ed25519'),keys={keyId:`local-${suffix}`,jwtPrivateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}),jwtPublicKey:pair.publicKey.export({type:'spki',format:'pem'})};
  for(const name of ['encryptionKey','lookupKey','otpKey','coordinationKey','refreshKey'])keys[name]=randomBytes(32).toString('base64url');
  const directory=new URL(`../.cache/m2-${mode}/`,import.meta.url);await mkdir(directory,{recursive:true});const keyFile=new URL(`keys-${suffix}.json`,directory);await writeFile(keyFile,JSON.stringify(keys),{flag:'wx',mode:0o600});
  configuration.updateLocal({[prefix+'AUTH_ENABLED']:'true',[prefix+'API_PORT']:String(port),[prefix+'DATABASE_URL']:url.href,[prefix+'REDIS_URL']:'redis://127.0.0.1:16380',[prefix+'REDIS_NAMESPACE']:mode+'-local-'+suffix,[prefix+'KEYS_FILE']:'.cache/m2-'+mode+'/keys-'+suffix+'.json',[prefix+'JWT_ISSUER']:'http://127.0.0.1:'+port+'/v1',[prefix+'JWT_AUDIENCE']:'trissea-passenger-local',[prefix+'DRIVER_JWT_AUDIENCE']:'trissea-driver-local'});
  console.info(`Prepared new disposable ${mode} database and canonical local configuration and ignored keys; no users seeded. Port ${port}, mock SMS only.`);
 }finally{await Promise.allSettled([owner?.end(),control?.end()]);}
}
await main().catch(()=>{console.error('Passenger preparation failed; existing databases and configuration were preserved. Check dedicated test infrastructure.');process.exitCode=1;});
