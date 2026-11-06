import {Global,Module,type DynamicModule,type OnModuleDestroy} from '@nestjs/common';
import postgres from 'postgres';
import {sql} from 'drizzle-orm';
import {AuthorizationResources,PostgresAuthorizationDatabase,type PolicyTransaction} from '../policy/authorization-database';
import {AuthorizationService,SessionProofVerifier,type RequestCredentials} from '../policy/authorization.service';
import {AuthorizationSettings} from '../policy/authorization-settings';
import type {ResourceKind,ResourceRecord} from '../policy/authorization-model';
import {PassengerRuntime} from '../passenger/passenger-runtime';
import {AdminRuntime} from '../admin/admin-runtime';
import {DriverVerificationStore} from '../driver/driver-verification-store';
import {readIdentityPolicy} from '../../database/identity-policy';
import {VerificationService} from './verification-service';
export function verificationDatabaseUrl(env:Readonly<Record<string,string|undefined>>):URL{
 readIdentityPolicy(env);
 if(['M2_VERIFICATION_ENABLED','M2_PASSENGER_AUTH_ENABLED','M2_DRIVER_AUTH_ENABLED','M2_ADMIN_AUTH_ENABLED'].some(k=>env[k]!=='true'))throw new Error('Invalid verification activation');
 try{const url=new URL(env.M2_VERIFICATION_DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15433'||!/^\/trissea_m2_test_[a-f0-9]{12}$/.test(url.pathname)||url.search||url.hash)throw new Error();
  for(const key of ['M2_PASSENGER_DATABASE_URL','ADMIN_DATABASE_URL']){const other=new URL(env[key]??'');if(other.hostname!==url.hostname||other.port!==url.port||other.pathname!==url.pathname)throw new Error();}return url;
 }catch{throw new Error('Invalid M2_VERIFICATION_DATABASE_URL: one disposable application database required');}
}
export class VerificationResources extends AuthorizationResources{
 async load(tx:PolicyTransaction,kind:ResourceKind,id:string):Promise<ResourceRecord|null>{if(kind!=='VERIFICATION_CASE')return super.load(tx,kind,id);
  const [row]=await tx.execute(sql`SELECT identity.verification_locate(${id}::uuid) AS resource`);if(!row?.resource)return null;await tx.execute(sql`SELECT set_config('trissea.verification_case_id',${id},true)`);return row.resource as unknown as ResourceRecord;
 }
}
class VerificationProof extends SessionProofVerifier{
 constructor(readonly mobile:PassengerRuntime,readonly admin:AdminRuntime){super();}
 verify(input:RequestCredentials){if(input.cookie)return input.authorization?Promise.resolve(null):this.admin.proofVerifier.verify(input);return this.mobile.proofVerifier.verify(input);}
}
export class VerificationRuntime implements OnModuleDestroy{
 readonly service:VerificationService;readonly authorization:AuthorizationService;
 constructor(readonly connection:postgres.Sql,readonly mobile:PassengerRuntime,readonly admin:AdminRuntime){if(!mobile.driver)throw new Error('Driver core required');const driver=new DriverVerificationStore();this.service=new VerificationService(driver,mobile.secrets,mobile.settings);mobile.driver.accounts.useVerificationEvidence(driver);this.authorization=new AuthorizationService(new PostgresAuthorizationDatabase(connection),new VerificationProof(mobile,admin),new VerificationResources(),new AuthorizationSettings());}
 async onModuleDestroy(){await this.connection.end({timeout:5});}
 static async fromEnvironment(mobile:PassengerRuntime,admin:AdminRuntime){let connection:postgres.Sql|undefined;try{const url=verificationDatabaseUrl(process.env);connection=postgres(url.href,{max:5,connect_timeout:5,onnotice:()=>{},connection:{timezone:'UTC'}});
  const [role]=await connection`SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'trissea_m2_verification','member') AS member,pg_has_role(current_user,'trissea_m2_authorization','member') AS resolver,pg_has_role(current_user,'trissea_m2_verification_writer','member') AS writer,pg_has_role(current_user,'trissea_m2_auth','member') AS mobile_auth,pg_has_role(current_user,'trissea_m2_admin_auth','member') AS admin_auth FROM pg_roles WHERE rolname=current_user`;
  if(!role?.member||!role.resolver||role.rolsuper||role.rolbypassrls||role.writer||role.mobile_auth||role.admin_auth)throw new Error();
  const [manifest]=await connection`SELECT value FROM m2_disposable_manifest WHERE key='identity-test'`;if(manifest?.value!==url.pathname.slice(1))throw new Error();
  await new PostgresAuthorizationDatabase(connection).transaction(async()=>true);
  await connection`SELECT id FROM identity.verification_cases LIMIT 0`;return new VerificationRuntime(connection,mobile,admin);
 }catch{await connection?.end({timeout:5});throw new Error('Verification startup configuration invalid; feature remains disabled');}}
}
@Global() @Module({})
export class VerificationCoreModule{static register():DynamicModule{return {module:VerificationCoreModule,providers:[{provide:VerificationRuntime,useFactory:(mobile:PassengerRuntime,admin:AdminRuntime)=>VerificationRuntime.fromEnvironment(mobile,admin),inject:[PassengerRuntime,AdminRuntime]}],exports:[VerificationRuntime]};}}
