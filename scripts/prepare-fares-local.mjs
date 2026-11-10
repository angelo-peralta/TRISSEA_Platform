import configuration from './environment.cjs';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertDisposableIdentityDatabase} from './migration-policy.mjs';

// Upgrade only the existing manifest-verified local administrator fixture. Never
// provision identities/grants, change credentials or connect to core/IdP data.
let owner;
try{
 const env=configuration.environmentFor('admin'),test=configuration.environmentFor('test');
 if(process.argv.length!==2||env.NODE_ENV!=='development'||env.ADMIN_SECURITY_MODE!=='local-synthetic')throw new Error();
 const target=new URL(env.ADMIN_DATABASE_URL),url=new URL(test.M2_TEST_CONTROL_URL);
 assertDisposableIdentityDatabase(target.href,'development',test.M2_DISPOSABLE_DATABASE);
 if(url.pathname!=='/m2_control'||url.hostname!==target.hostname||url.port!==target.port)throw new Error();
 url.pathname=target.pathname;owner=postgres(url.href,{max:1,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC'}});
 const [manifest]=await owner`SELECT value FROM public.m2_disposable_manifest WHERE key='identity-test'`;
 if(manifest?.value!==target.pathname.slice(1))throw new Error();
 await runMigrations(owner,'up',{through:'0009_fare_governance',allowIdentity:true});
 console.info('Existing disposable administrator fixture upgraded for M3; identities, grants, credentials and activation gates preserved.');
}catch{console.error('M3 fixture upgrade rejected. Check the canonical admin/test profiles and disposable manifest; no credentials printed.');process.exitCode=1;}
finally{await owner?.end({timeout:5});}
