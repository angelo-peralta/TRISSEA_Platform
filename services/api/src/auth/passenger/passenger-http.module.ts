import { Body,Catch,Controller,Get,Headers,HttpCode,HttpException,Injectable,Module,Param,Patch,Post,Req,type ArgumentsHost,type CallHandler,type ExceptionFilter,type ExecutionContext,type NestInterceptor } from '@nestjs/common';
import { APP_FILTER,APP_INTERCEPTOR } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { Public } from '../auth.guard';
import { AuthorizationModule } from '../policy/authorization.module';
import { ProtectedPolicy,authorizedRequestContext } from '../policy/authorization.interceptor';
import { PassengerRuntime } from './passenger-runtime';
import { PhoneAuthError,objectInput } from './primitives';
interface ApiRequest {ip:string;headers:Record<string,string|undefined>}
function anonymous(request:ApiRequest):void{if(request.headers.authorization||request.headers.cookie)throw new PhoneAuthError('AUTH_FAILED');}
@Controller('auth')
class PassengerAuthController {
  constructor(private readonly runtime:PassengerRuntime){}
  @Public() @Post('phone/challenges') @HttpCode(202)
  request(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){anonymous(request);return this.runtime.forPurpose(objectInput(body,['phone','clientPurpose','clientProof','deviceId']).clientPurpose).challenges.request(body,key,request.ip);}
  @Public() @Post('phone/challenges/:challengeId/verify') @HttpCode(200)
  verify(@Param('challengeId')id:string,@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){anonymous(request);return this.runtime.forPurpose(objectInput(body,['phone','code','clientPurpose','clientProof','deviceId']).clientPurpose).challenges.verify(id,body,key,request.ip);}
  @Public() @Get('phone/challenges/:challengeId')
  status(@Param('challengeId')id:string,@Headers('x-device-id')deviceId:unknown,@Headers('x-client-proof')proof:unknown,@Headers('x-client-purpose')purpose:unknown,@Req()request:ApiRequest){anonymous(request);return this.runtime.forPurpose(purpose??'PASSENGER').challenges.status(id,deviceId,proof,request.ip);}
  @Public() @Post('mobile/refresh') @HttpCode(200)
  async refresh(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){anonymous(request);await this.runtime.otp.limitVerification(this.runtime.secrets.coordinate('ip',request.ip));return this.runtime.forPurpose(objectInput(body,['clientPurpose','clientProof','deviceId','refreshToken']).clientPurpose).sessions.refresh(body,key);}
  @Get('sessions') @ProtectedPolicy('PASSENGER_READ_SELF','@self')
  sessions(@Req()request:ApiRequest){const ctx=authorizedRequestContext(request);return this.runtime.profiles.listSessions(ctx.tx,ctx.userId,ctx.sessionId);}
  @Post('sessions/:sessionId/revoke') @HttpCode(204) @ProtectedPolicy('PASSENGER_REVOKE_SELF','sessionId')
  async revoke(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){objectInput(body??{},[]);const ctx=authorizedRequestContext(request);await this.runtime.profiles.revoke(ctx.tx,ctx.userId,ctx.sessionId,ctx.resource.id,key);}
  @Post('logout') @HttpCode(204) @ProtectedPolicy('PASSENGER_REVOKE_SELF','@self')
  async logout(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){objectInput(body??{},[]);const ctx=authorizedRequestContext(request);await this.runtime.profiles.revoke(ctx.tx,ctx.userId,ctx.sessionId,ctx.sessionId,key);}
}
@Controller('me')
class PassengerMeController {
  constructor(private readonly runtime:PassengerRuntime){}
  @Get() @ProtectedPolicy('PASSENGER_READ_SELF','@self')
  read(@Req()request:ApiRequest){const ctx=authorizedRequestContext(request);return this.runtime.profiles.me(ctx.tx,ctx.userId,ctx.sessionId);}
  @Patch() @ProtectedPolicy('PASSENGER_UPDATE_SELF','@self')
  update(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){const ctx=authorizedRequestContext(request);return this.runtime.profiles.update(ctx.tx,ctx.userId,ctx.sessionId,body,key);}
  @Post('consents') @HttpCode(200) @ProtectedPolicy('PASSENGER_CONSENT_SELF','@self')
  consent(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:ApiRequest){const ctx=authorizedRequestContext(request);return this.runtime.profiles.consent(ctx.tx,ctx.userId,ctx.sessionId,body,key);}
}
@Catch()
class PassengerErrorFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost){
    const status=error instanceof HttpException?error.getStatus():503;
    const normalized=error instanceof PhoneAuthError?error:new PhoneAuthError(status===400?'INVALID_REQUEST':status===401||status===403?'AUTH_FAILED':status===409?'CONFLICT':status===429?'RATE_LIMITED':'UNAVAILABLE');
    const reply=host.switchToHttp().getResponse<{header:(name:string,value:string)=>void;code:(status:number)=>{send:(body:unknown)=>void}}>();
    reply.header('Cache-Control','no-store');reply.header('Pragma','no-cache');reply.header('X-Content-Type-Options','nosniff');
    if(status===429)reply.header('Retry-After','60'); // advisory minimum; rolling hour/day budgets can deny longer
    reply.code(status>=400&&status<500?status:503).send(normalized.getResponse());
  }
}
@Injectable()
class AuthNoStore implements NestInterceptor {
  intercept(context:ExecutionContext,next:CallHandler):Observable<unknown>{
    const reply=context.switchToHttp().getResponse<{header:(name:string,value:string)=>void}>();reply.header('Cache-Control','no-store');reply.header('Pragma','no-cache');reply.header('X-Content-Type-Options','nosniff');return next.handle();
  }
}
@Module({imports:[AuthorizationModule],controllers:[PassengerAuthController,PassengerMeController],providers:[{provide:APP_FILTER,useClass:PassengerErrorFilter},{provide:APP_INTERCEPTOR,useClass:AuthNoStore}]})
export class PassengerHttpModule {}
