import configuration from './environment.cjs';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {localRealm} from '../infra/keycloak/realm-policy.mjs';
const secret=()=>randomBytes(32).toString('base64url');
try{
 const current=configuration.loadLocal({optional:true}),names=['KEYCLOAK_DB_OWNER_PASSWORD','KEYCLOAK_DB_PASSWORD','KEYCLOAK_BOOTSTRAP_USER','KEYCLOAK_BOOTSTRAP_PASSWORD','KEYCLOAK_BFF_SECRET','KEYCLOAK_ASSURANCE_SECRET'];
 if(names.every(key=>current[key])){for(const file of ['keys.json','realm-import/trissea-local-realm.json'])await access(new URL('../.cache/m2-keycloak/'+file,import.meta.url));console.info('Existing Keycloak credentials and generated files preserved.');process.exit(0);}
 if(names.some(key=>current[key]))throw new Error('Partial credentials require owner review');
 const folder=new URL('../.cache/m2-keycloak/',import.meta.url);await mkdir(new URL('realm-import/',folder),{recursive:true});
 const values={KEYCLOAK_DB_OWNER_PASSWORD:secret(),KEYCLOAK_DB_PASSWORD:secret(),KEYCLOAK_BOOTSTRAP_USER:'bootstrap-'+randomBytes(6).toString('hex'),KEYCLOAK_BOOTSTRAP_PASSWORD:secret(),KEYCLOAK_BFF_SECRET:secret(),KEYCLOAK_ASSURANCE_SECRET:secret()};
 const keys={keyId:'admin-local-'+randomBytes(6).toString('hex'),encryptionKey:secret(),lookupKey:secret(),otpKey:secret(),coordinationKey:secret(),refreshKey:secret()};
 await writeFile(new URL('keys.json',folder),JSON.stringify(keys),{flag:'wx',mode:0o600});
 await writeFile(new URL('realm-import/trissea-local-realm.json',folder),JSON.stringify(localRealm({bffSecret:values.KEYCLOAK_BFF_SECRET,readerSecret:values.KEYCLOAK_ASSURANCE_SECRET}),null,2),{flag:'wx',mode:0o600});
 configuration.updateLocal({...values,ADMIN_KEYS_FILE:current.ADMIN_KEYS_FILE});console.info('Prepared ignored local Keycloak configuration with generated credentials; no TRISSEA administrator or grants provisioned.');
}catch{console.error('Local Keycloak preparation failed; existing configuration preserved.');process.exitCode=1;}
