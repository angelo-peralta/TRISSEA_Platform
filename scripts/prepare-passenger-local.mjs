import { access,mkdir,writeFile } from 'node:fs/promises';
import { randomBytes,generateKeyPairSync } from 'node:crypto';
import postgres from 'postgres';
import { assertLocalDatabase,assertDisposableIdentityDatabase } from './migration-policy.mjs';
import { runMigrations } from './migration-runner.mjs';

async function main(){
 const envFile=new URL('../.env.m2-passenger',import.meta.url);
 try{await access(envFile);console.info('Existing ignored passenger environment preserved.');return;}catch(error){if(error.code!=='ENOENT')throw error;}
 const url=new URL(process.env.M2_TEST_CONTROL_URL);assertLocalDatabase(url.href,process.env.NODE_ENV);
 if(url.pathname!=='/m2_control'||url.search||process.env.M2_DISPOSABLE_DATABASE!=='true')throw new Error();
 const suffix=randomBytes(6).toString('hex'),database=`trissea_m2_test_${suffix}`,login=`m2_passenger_${suffix}`,password=randomBytes(32).toString('hex');
 let control,owner;
 try{
  const options={max:1,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC',statement_timeout:15000}};
  control=postgres(url.href,options);await control.unsafe(`CREATE DATABASE "${database}"`);
  url.pathname=`/${database}`;assertDisposableIdentityDatabase(url.href,process.env.NODE_ENV,'true');owner=postgres(url.href,options);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database})`;
  await runMigrations(owner,'up',{through:'0004_passenger_auth',allowIdentity:true,report:console.info});
  await control.unsafe(`CREATE ROLE "${login}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE trissea_m2_auth,trissea_m2_authorization`);
  await owner.unsafe(`GRANT SELECT ON m2_disposable_manifest TO "${login}"`);url.username=login;url.password=password;
  const pair=generateKeyPairSync('ed25519'),keys={keyId:`local-${suffix}`,jwtPrivateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}),jwtPublicKey:pair.publicKey.export({type:'spki',format:'pem'})};
  for(const name of ['encryptionKey','lookupKey','otpKey','coordinationKey','refreshKey'])keys[name]=randomBytes(32).toString('base64url');
  const directory=new URL('../.cache/m2-passenger/',import.meta.url);await mkdir(directory,{recursive:true});const keyFile=new URL(`keys-${suffix}.json`,directory);await writeFile(keyFile,JSON.stringify(keys),{flag:'wx',mode:0o600});
  const contents=`NODE_ENV=development\nM2_PASSENGER_AUTH_ENABLED=true\nM2_AUTH_MODE=local-synthetic\nSMS_PROVIDER=mock\nSMS_LIVE_ENABLED=false\nAPI_PORT=4100\nM2_PASSENGER_DATABASE_URL=${url.href}\nM2_PASSENGER_REDIS_URL=redis://127.0.0.1:16380\nM2_PASSENGER_REDIS_NAMESPACE=passenger-local-${suffix}\nM2_PASSENGER_KEYS_FILE=.cache/m2-passenger/keys-${suffix}.json\nPASSENGER_JWT_ISSUER=http://127.0.0.1:4100/v1\nPASSENGER_JWT_AUDIENCE=trissea-passenger-local\n`;
  await writeFile(envFile,contents,{flag:'wx',mode:0o600});
  console.info('Prepared new disposable passenger database and ignored local keys/configuration; no users seeded. Port 4100, mock SMS only.');
 }finally{await Promise.allSettled([owner?.end(),control?.end()]);}
}
await main().catch(()=>{console.error('Passenger preparation failed; existing databases and configuration were preserved. Check dedicated test infrastructure.');process.exitCode=1;});
