import {readFile} from 'node:fs/promises';
import {Global,Module,type DynamicModule,type OnModuleDestroy} from '@nestjs/common';
import postgres from 'postgres';
import {sql} from 'drizzle-orm';
import {IdentityProvider} from '../identity-provider';
import {SessionProofVerifier,type RequestCredentials} from '../policy/authorization.service';
import {PassengerSecrets} from '../passenger/passenger-settings';
import {AdminDatabase} from './admin-database';
import {AdminSettings,adminDatabaseUrl} from './admin-settings';
import {KeycloakProvider} from './keycloak-provider';
import {AdminSessions} from './admin-sessions';
class AdminVerifier extends SessionProofVerifier{constructor(readonly sessions:AdminSessions){super();}verify(input:RequestCredentials){return this.sessions.verify(input);}}
class AdminIdentity extends IdentityProvider{
 constructor(readonly sessions:AdminSessions){super();}async verifyAccessToken(){return null;}
 async verifyRequest(input:RequestCredentials){const proof=await this.sessions.verify(input);return proof?{subject:proof.userId,mfa:true,grants:[]}:null;}
}
export class AdminRuntime implements OnModuleDestroy{
 readonly database:AdminDatabase;readonly sessions:AdminSessions;readonly proofVerifier:SessionProofVerifier;readonly identity:IdentityProvider;
 constructor(readonly connection:postgres.Sql,readonly settings:AdminSettings,readonly secrets:PassengerSecrets,readonly provider:KeycloakProvider){this.database=new AdminDatabase(connection);this.sessions=new AdminSessions(this.database,settings,secrets,provider);this.proofVerifier=new AdminVerifier(this.sessions);this.identity=new AdminIdentity(this.sessions);}
 async onModuleDestroy(){await this.connection.end({timeout:5});}
 static async fromEnvironment(){
  const e=process.env,settings=new AdminSettings(e);if(e.M2_ADMIN_AUTH_ENABLED!=='true'||settings.secure)throw new Error('Admin service is not approved for production activation');
  let connection:postgres.Sql|undefined;
  try{
   const url=adminDatabaseUrl(e);
   const keys=JSON.parse(await readFile(e.ADMIN_KEYS_FILE??'','utf8')) as Record<string,string>;
   const key=(name:string)=>{const value=keys[name];if(!value||!/^[A-Za-z0-9_-]{43}$/.test(value))throw new Error();return Buffer.from(value,'base64url');};
   const secrets=new PassengerSecrets(keys.keyId??'',key('encryptionKey'),key('lookupKey'),key('otpKey'),key('coordinationKey'),key('refreshKey'));
   connection=postgres(url.href,{max:5,connect_timeout:5,onnotice:()=>{},connection:{timezone:'UTC'}});const db=new AdminDatabase(connection);
   await db.transaction(async tx=>{const [row]=await tx.execute(sql`SELECT value FROM public.m2_disposable_manifest WHERE key='identity-test'`);if(row?.value!==url.pathname.slice(1))throw new Error();});
   const provider=new KeycloakProvider(settings);await provider.initialize();return new AdminRuntime(connection,settings,secrets,provider);
  }catch{await connection?.end({timeout:5});throw new Error('Admin startup configuration is invalid');}
 }
}
@Global() @Module({})
export class AdminCoreModule{static register():DynamicModule{return {module:AdminCoreModule,providers:[{provide:AdminRuntime,useFactory:()=>AdminRuntime.fromEnvironment()}],exports:[AdminRuntime]};}}
