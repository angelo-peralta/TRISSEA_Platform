import {Global,Logger,Module,type DynamicModule,type OnModuleInit,type OnModuleDestroy} from '@nestjs/common';
import postgres from 'postgres';
import {sql} from 'drizzle-orm';
import {PassengerRuntime} from '../auth/passenger/passenger-runtime';
import {PostgresAuthorizationDatabase,AuthorizationResources} from '../auth/policy/authorization-database';
import {AuthorizationService} from '../auth/policy/authorization.service';
import {readIdentityPolicy} from '../database/identity-policy';
import {testDatabasePort} from '../development-endpoints';
import {RideService} from './ride-service';
export function simulationUrl(env:Readonly<Record<string,string|undefined>>){
 readIdentityPolicy(env);if(env.M4_SIMULATION_ENABLED!=='true'||env.M2_AUTH_MODE!=='local-synthetic'||env.M2_PASSENGER_AUTH_ENABLED!=='true'||env.M2_DRIVER_AUTH_ENABLED!=='true')throw new Error('Invalid simulation boundary');
 try{const url=new URL(env.M4_DATABASE_URL??''),mobile=new URL(env.M2_PASSENGER_DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!==testDatabasePort(env)||!/^\/trissea_m2_test_[a-f0-9]{12}$/.test(url.pathname)||url.search||url.hash||url.hostname!==mobile.hostname||url.port!==mobile.port||url.pathname!==mobile.pathname)throw new Error();return url;}catch{throw new Error('Simulation requires one manifest-verified disposable application database');}
}
export class RideRuntime implements OnModuleInit,OnModuleDestroy{
 readonly service:RideService;readonly authorization:AuthorizationService;readonly database:PostgresAuthorizationDatabase;private timer:ReturnType<typeof setInterval>|undefined;private running=false;
 private readonly logger=new Logger(RideRuntime.name);private schedulingUnavailable=false;
 constructor(readonly connection:postgres.Sql,readonly mobile:PassengerRuntime){this.service=new RideService(mobile.secrets);this.database=new PostgresAuthorizationDatabase(connection);this.authorization=new AuthorizationService(this.database,mobile.proofVerifier,new AuthorizationResources());}
 onModuleInit(){this.timer=setInterval(()=>{if(this.running)return;this.running=true;void this.database.transaction(tx=>this.service.tick(tx)).then(()=>{this.schedulingUnavailable=false;}).catch(()=>{if(!this.schedulingUnavailable)this.logger.warn('Synthetic offer scheduling unavailable; durable state retained for retry');this.schedulingUnavailable=true;}).finally(()=>{this.running=false;});},1000);this.timer.unref();}
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.connection.end({timeout:5});}
 static async create(mobile:PassengerRuntime){const url=simulationUrl(process.env),connection=postgres(url.href,{max:5,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC'}});try{
  const [role]=await connection`SELECT pg_has_role(current_user,'trissea_m4_rides','member') AS runtime,pg_has_role(current_user,'trissea_m4_writer','member') AS writer,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  if(!role?.runtime||role.writer||role.rolsuper||role.rolbypassrls)throw new Error();
  const manifest=await connection`SELECT key,value FROM public.m2_disposable_manifest WHERE key IN ('identity-test','m4-ride-simulation')`;if(manifest.length!==2||manifest.some(m=>m.value!==url.pathname.slice(1)))throw new Error();
  const runtime=new RideRuntime(connection,mobile);await runtime.database.transaction(async tx=>{await tx.execute(sql`SELECT id FROM simulation.scenarios LIMIT 0`);});return runtime;
 }catch{await connection.end();throw new Error('Simulation startup rejected; operations remain disabled');}}
}
@Global() @Module({})
export class RideCoreModule{static register():DynamicModule{return {module:RideCoreModule,providers:[{provide:RideRuntime,useFactory:(mobile:PassengerRuntime)=>RideRuntime.create(mobile),inject:[PassengerRuntime]}],exports:[RideRuntime]};}}
