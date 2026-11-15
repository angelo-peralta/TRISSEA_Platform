import {Body,Controller,Get,Headers,HttpCode,Module,Param,Post,Query,Req,Res,UnauthorizedException} from '@nestjs/common';
import type {ServerResponse} from 'node:http';
import {AuthorizationInterceptor,ProtectedPolicy,authorizedRequestContext} from '../auth/policy/authorization.interceptor';
import {AuthorizationService} from '../auth/policy/authorization.service';
import {RideRuntime} from './ride-runtime';
interface Request {headers:Record<string,string|undefined>;raw:{on:(event:string,work:()=>void)=>void}}
@Controller('simulation/passenger')
class PassengerRides{
 constructor(readonly runtime:RideRuntime){}
 @Get('scenarios') @ProtectedPolicy('SIMULATION_PASSENGER','@self') scenarios(@Req()r:object){return this.runtime.service.scenarios(authorizedRequestContext(r));}
 @Post('quotes') @HttpCode(200) @ProtectedPolicy('SIMULATION_PASSENGER','@self') quote(@Req()r:object,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.runtime.service.preview(authorizedRequestContext(r),b,key);}
 @Post('rides') @HttpCode(200) @ProtectedPolicy('SIMULATION_PASSENGER','@self') confirm(@Req()r:object,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.runtime.service.confirm(authorizedRequestContext(r),b,key);}
 @Get('current') @ProtectedPolicy('SIMULATION_PASSENGER','@self') current(@Req()r:object){return this.runtime.service.current(authorizedRequestContext(r));}
 @Get('rides') @ProtectedPolicy('SIMULATION_PASSENGER','@self') recent(@Req()r:object,@Query()q:unknown){return this.runtime.service.recent(authorizedRequestContext(r),q);}
 @Get('rides/:rideId') @ProtectedPolicy('SIMULATION_PASSENGER','@self') read(@Req()r:object,@Param('rideId')id:string){return this.runtime.service.snapshot(authorizedRequestContext(r),id);}
 @Get('rides/:rideId/receipt') @ProtectedPolicy('SIMULATION_PASSENGER','@self') receipt(@Req()r:object,@Param('rideId')id:string){return this.runtime.service.receipt(authorizedRequestContext(r),id);}
 @Post('rides/:rideId/cancel') @HttpCode(200) @ProtectedPolicy('SIMULATION_PASSENGER','@self') cancel(@Req()r:object,@Param('rideId')id:string,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.runtime.service.command(authorizedRequestContext(r),id,'CANCEL',b,key);}
}
@Controller('simulation/driver')
class DriverRides{
 constructor(readonly runtime:RideRuntime){}
 @Get('context') @ProtectedPolicy('SIMULATION_DRIVER','@self') context(@Req()r:object){return this.runtime.service.scenarios(authorizedRequestContext(r));}
 @Post('availability') @HttpCode(200) @ProtectedPolicy('SIMULATION_DRIVER','@self') availability(@Req()r:object,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.runtime.service.availability(authorizedRequestContext(r),b,key);}
 @Get('offers') @ProtectedPolicy('SIMULATION_DRIVER','@self') offers(@Req()r:object){return this.runtime.service.offers(authorizedRequestContext(r));}
 @Get('current') @ProtectedPolicy('SIMULATION_DRIVER','@self') current(@Req()r:object){return this.runtime.service.current(authorizedRequestContext(r));}
 @Get('rides') @ProtectedPolicy('SIMULATION_DRIVER','@self') recent(@Req()r:object,@Query()q:unknown){return this.runtime.service.recent(authorizedRequestContext(r),q);}
 @Get('rides/:rideId') @ProtectedPolicy('SIMULATION_DRIVER','@self') read(@Req()r:object,@Param('rideId')id:string){return this.runtime.service.snapshot(authorizedRequestContext(r),id);}
 @Get('rides/:rideId/receipt') @ProtectedPolicy('SIMULATION_DRIVER','@self') receipt(@Req()r:object,@Param('rideId')id:string){return this.runtime.service.receipt(authorizedRequestContext(r),id);}
 @Post('rides/:rideId/actions/:action') @HttpCode(200) @ProtectedPolicy('SIMULATION_DRIVER','@self') action(@Req()r:object,@Param('rideId')id:string,@Param('action')action:string,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.runtime.service.command(authorizedRequestContext(r),id,action,b,key);}
}
@Controller('simulation')
class RideEvents{
 constructor(readonly runtime:RideRuntime){}
 @Get('events') async events(@Req()r:Request,@Res()reply:{raw:ServerResponse;hijack:()=>void}){
  const credentials=r.headers.authorization?{authorization:r.headers.authorization}:{},proof=await this.runtime.mobile.proofVerifier.verify(credentials);if(!proof)throw new UnauthorizedException();const action=proof.purpose==='PASSENGER'?'SIMULATION_PASSENGER':'SIMULATION_DRIVER';
  const hints=()=>this.runtime.authorization.execute(credentials,action,'@self',async c=>{await this.runtime.service.scope(c);return this.runtime.service.recent(c,{});});
  const first=await hints();reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});let closed=false,running=false;
  const send=(data:unknown)=>reply.raw.write('event: ride.snapshot.v1\ndata: '+JSON.stringify(data)+'\n\n');send(first);
  const timer=setInterval(()=>{if(closed||running)return;running=true;void hints().then(data=>{if(!closed)send(data);}).catch(()=>{closed=true;clearInterval(timer);reply.raw.end();}).finally(()=>{running=false;});},2000);
  reply.raw.on('close',()=>{closed=true;clearInterval(timer);});
 }
}
@Module({controllers:[PassengerRides,DriverRides,RideEvents],providers:[AuthorizationInterceptor,{provide:AuthorizationService,useFactory:(r:RideRuntime)=>r.authorization,inject:[RideRuntime]}]})
export class RideHttpModule{}
