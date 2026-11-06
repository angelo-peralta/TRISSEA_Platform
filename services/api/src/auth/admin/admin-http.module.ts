import {Body,Catch,Controller,Get,Headers,HttpCode,HttpException,Injectable,Module,Post,Req,Res,type ArgumentsHost,type ExceptionFilter,type ExecutionContext,type NestInterceptor,type CallHandler} from '@nestjs/common';
import {APP_FILTER,APP_INTERCEPTOR} from '@nestjs/core';
import type {Observable} from 'rxjs';
import {Public} from '../auth.guard';
import {AuthorizationModule} from '../policy/authorization.module';
import {ProtectedPolicy,authorizedRequestContext} from '../policy/authorization.interceptor';
import {PhoneAuthError,idempotency,objectInput} from '../passenger/primitives';
import {AdminRuntime} from './admin-runtime';
interface Request {url:string;ip:string;headers:Record<string,string|undefined>}
interface Reply {header:(name:string,value:string|string[])=>Reply;removeHeader:(name:string)=>void;code:(status:number)=>Reply;send:(body:unknown)=>void;redirect:(url:string,code?:number)=>void}
@Controller('admin/auth')
class AdminAuthController{
 constructor(readonly runtime:AdminRuntime){}
 @Public() @Post('login') @HttpCode(200)
 async start(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:Request,@Res({passthrough:true})reply:Reply){
  const input=objectInput(body,['clientProof']);const requestKey=idempotency(key);if(typeof input.clientProof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.clientProof))throw new PhoneAuthError('INVALID_REQUEST');if(request.headers.authorization)throw new PhoneAuthError('AUTH_FAILED');
  const result=await this.runtime.sessions.start(requestKey,input.clientProof,request.headers.origin,request.headers.cookie,request.headers['sec-fetch-site'],request.ip);reply.header('Set-Cookie',result.cookie);return {authorizationUrl:result.authorizationUrl};
 }
 @Public() @Get('callback')
 async callback(@Req()request:Request,@Res()reply:Reply){
  if(request.headers.authorization)throw new PhoneAuthError('AUTH_FAILED');
  const result=await this.runtime.sessions.callback(new URL(request.url,this.runtime.settings.origin),request.headers.cookie);
  reply.header('Set-Cookie',[result.cookie,result.clearFlow]);reply.header('Cache-Control','no-store');reply.header('Referrer-Policy','no-referrer');reply.redirect(this.runtime.settings.origin+'/?admin=authenticated',303);
 }
 @Get('session') @ProtectedPolicy('ADMIN_READ_SELF','@self')
 session(@Req()request:object){const c=authorizedRequestContext(request);return this.runtime.sessions.session(c.tx,c.userId,c.sessionId);}
 @Post('logout') @HttpCode(204) @ProtectedPolicy('ADMIN_LOGOUT_SELF','@self')
 async logout(@Body()body:unknown,@Headers('idempotency-key')key:unknown,@Req()request:Request,@Res({passthrough:true})reply:Reply){objectInput(body??{},[]);idempotency(key);const c=authorizedRequestContext(request);
  await this.runtime.sessions.logout(c.tx,c.userId,c.sessionId,request.headers.origin,request.headers['x-csrf-token']);reply.header('Set-Cookie',this.runtime.sessions.setCookie(this.runtime.settings.cookieName,'',0));}
}
@Controller('admin/access')
class AdminAccessController{
 @Get('todas/:todaId') @ProtectedPolicy('TODA_MEMBERS_MANAGE','todaId')
 access(@Req()request:object){const c=authorizedRequestContext(request);return {cityTenantId:c.resource.cityTenantId,todaId:c.resource.id,canManageMemberships:true as const,operationalServicesEnabled:false as const};}
}
@Catch()
class AdminErrorFilter implements ExceptionFilter{
 catch(error:unknown,host:ArgumentsHost){const status=error instanceof HttpException?error.getStatus():503,reply=host.switchToHttp().getResponse<Reply>();reply.removeHeader('Set-Cookie');reply.header('Cache-Control','no-store').header('Pragma','no-cache').header('Referrer-Policy','no-referrer');
  const safe=error instanceof PhoneAuthError?error.getResponse():{code:status===401||status===403?'AUTH_FAILED':status===400?'INVALID_REQUEST':'UNAVAILABLE',message:'Administrator request could not be completed'};
  if(status===429)reply.header('Retry-After','60');reply.code(status>=400&&status<500?status:503).send(safe);}
}
@Injectable()
class AdminHeaders implements NestInterceptor{
 intercept(context:ExecutionContext,next:CallHandler):Observable<unknown>{context.switchToHttp().getResponse<Reply>().header('Cache-Control','no-store').header('Pragma','no-cache').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff').header('X-Frame-Options','DENY');return next.handle();}
}
@Module({imports:[AuthorizationModule],controllers:[AdminAuthController,AdminAccessController],providers:[{provide:APP_FILTER,useClass:AdminErrorFilter},{provide:APP_INTERCEPTOR,useClass:AdminHeaders}]})
export class AdminHttpModule{}
