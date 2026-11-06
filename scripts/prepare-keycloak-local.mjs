import {access,mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {localRealm} from '../infra/keycloak/realm-policy.mjs';
const secret=()=>randomBytes(32).toString('base64url');
try{
 const env=new URL('../.env.local',import.meta.url);
 try{await access(env);console.info('Existing .env.local preserved; no credentials or realm files replaced.');process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
 const folder=new URL('../.cache/m2-keycloak/',import.meta.url);await mkdir(new URL('realm-import/',folder),{recursive:true});
 const values={KEYCLOAK_DB_OWNER_PASSWORD:secret(),KEYCLOAK_DB_PASSWORD:secret(),KEYCLOAK_BOOTSTRAP_USER:'bootstrap-'+randomBytes(6).toString('hex'),KEYCLOAK_BOOTSTRAP_PASSWORD:secret(),KEYCLOAK_BFF_SECRET:secret(),KEYCLOAK_ASSURANCE_SECRET:secret()};
 const keys={keyId:'admin-local-'+randomBytes(6).toString('hex'),encryptionKey:secret(),lookupKey:secret(),otpKey:secret(),coordinationKey:secret(),refreshKey:secret()};
 await writeFile(new URL('keys.json',folder),JSON.stringify(keys),{flag:'wx',mode:0o600});
 await writeFile(new URL('realm-import/trissea-local-realm.json',folder),JSON.stringify(localRealm({bffSecret:values.KEYCLOAK_BFF_SECRET,readerSecret:values.KEYCLOAK_ASSURANCE_SECRET}),null,2),{flag:'wx',mode:0o600});
 await writeFile(new URL('postgres-init.sql',folder),`CREATE ROLE keycloak_runtime LOGIN PASSWORD '${values.KEYCLOAK_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;\nALTER DATABASE keycloak_identity OWNER TO keycloak_runtime;\n\\connect keycloak_identity\nGRANT USAGE,CREATE ON SCHEMA public TO keycloak_runtime;\n`,{flag:'wx',mode:0o600});
 const text=Object.entries({NODE_ENV:'development',M2_ADMIN_AUTH_ENABLED:'true',M2_PASSENGER_AUTH_ENABLED:'false',M2_DRIVER_AUTH_ENABLED:'false',SMS_LIVE_ENABLED:'false',RECOVERY_ENABLED:'false',REAL_DOCUMENTS_ENABLED:'false',OPERATIONAL_SERVICES_ENABLED:'false',ADMIN_SECURITY_MODE:'local-synthetic',API_PORT:'4102',ADMIN_ORIGIN:'http://127.0.0.1:5174',ADMIN_API_PROXY_TARGET:'http://127.0.0.1:4102',KEYCLOAK_ISSUER:'http://127.0.0.1:18080/realms/trissea-local',KEYCLOAK_CLIENT_ID:'trissea-admin-bff',KEYCLOAK_ASSURANCE_CLIENT_ID:'trissea-assurance-reader',ADMIN_KEYS_FILE:'.cache/m2-keycloak/keys.json',...values}).map(([k,v])=>`${k}=${v}`).join('\n')+'\n';
 await writeFile(env,text,{flag:'wx',mode:0o600});console.info('Prepared ignored local Keycloak configuration with generated credentials; no TRISSEA administrator or grants provisioned.');
}catch{console.error('Local Keycloak preparation failed; existing configuration preserved.');process.exitCode=1;}
