import {randomBytes} from 'node:crypto';
import configuration from './environment.cjs';
try{
 const env=configuration.loadLocal({optional:true});
 if(env.M1_DATABASE_URL||env.M1_POSTGRES_PASSWORD){if(!env.M1_DATABASE_URL||!env.M1_POSTGRES_PASSWORD)throw new Error();console.info('Existing canonical foundation configuration preserved.');}
 else{const password=randomBytes(32).toString('hex'),user=env.M1_POSTGRES_USER,db=env.M1_POSTGRES_DB;configuration.updateLocal({M1_POSTGRES_DB:db,M1_POSTGRES_USER:user,M1_POSTGRES_PORT:env.M1_POSTGRES_PORT,M1_REDIS_PORT:env.M1_REDIS_PORT,M1_REDIS_URL:env.M1_REDIS_URL,M1_API_PORT:env.M1_API_PORT,M1_POSTGRES_PASSWORD:password,M1_DATABASE_URL:'postgresql://'+encodeURIComponent(user)+':'+password+'@127.0.0.1:'+env.M1_POSTGRES_PORT+'/'+encodeURIComponent(db)});console.info('Prepared NEW local foundation credentials in .env.local; no existing database changed.');}
}catch{console.error('Foundation configuration rejected; existing credentials preserved.');process.exitCode=1;}
