import {Body,Controller,Get,Headers,HttpCode,Module,Post,Query,Req} from '@nestjs/common';
import {AuthorizationService} from '../policy/authorization.service';
import {AuthorizationInterceptor,ProtectedPolicy,authorizedRequestContext} from '../policy/authorization.interceptor';
import {VerificationRuntime} from './verification-runtime';
interface Request {headers:Record<string,string|undefined>}
@Controller('driver/me/verification')
class DriverVerificationController{
 constructor(readonly runtime:VerificationRuntime){}
 @Get('evidence') @ProtectedPolicy('DRIVER_INTAKE_READ_SELF','@self')
 evidence(@Req()request:object){const c=authorizedRequestContext(request);return this.runtime.service.evidence(c.tx,c.userId);}
 @Get('cases') @ProtectedPolicy('DRIVER_INTAKE_READ_SELF','@self')
 list(@Req()request:object,@Query()query:unknown){const c=authorizedRequestContext(request);return this.runtime.service.list(c.tx,c.userId,query);}
 @Post('cases') @HttpCode(200) @ProtectedPolicy('DRIVER_INTAKE_SELF','@self')
 open(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){const c=authorizedRequestContext(request);return this.runtime.service.open(c.tx,c.userId,c.sessionId,body,key);}
 @Get('cases/:caseId') @ProtectedPolicy('DRIVER_CASE_READ_SELF','caseId')
 detail(@Req()request:object){const c=authorizedRequestContext(request);return this.runtime.service.detail(c.tx,c.resource.id);}
 @Post('cases/:caseId/submit') @HttpCode(200) @ProtectedPolicy('DRIVER_CASE_SUBMIT_SELF','caseId')
 submit(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){const c=authorizedRequestContext(request);return this.runtime.service.submit(c.tx,c.userId,c.sessionId,c.resource.id,body,key);}
}
@Controller('admin/verifications')
class AdminVerificationController{
 constructor(readonly runtime:VerificationRuntime){}
 @Get('todas/:todaId/cases') @ProtectedPolicy('VERIFICATION_QUEUE_READ','todaId')
 queue(@Req()request:object,@Query()query:unknown){const c=authorizedRequestContext(request);return this.runtime.service.list(c.tx,c.userId,query,c.resource.id,false);}
 @Get('todas/:todaId/memberships') @ProtectedPolicy('MEMBERSHIP_QUEUE_READ','todaId')
 memberships(@Req()request:object,@Query()query:unknown){const c=authorizedRequestContext(request);return this.runtime.service.list(c.tx,c.userId,query,c.resource.id,true);}
 @Get('cases/:caseId') @ProtectedPolicy('DRIVER_VERIFY','caseId')
 detail(@Req()request:object){const c=authorizedRequestContext(request);return this.runtime.service.detail(c.tx,c.resource.id,false);}
 @Get('memberships/:caseId') @ProtectedPolicy('MEMBERSHIP_VERIFY','caseId')
 membership(@Req()request:object){const c=authorizedRequestContext(request);return this.runtime.service.detail(c.tx,c.resource.id,true);}
 @Post('cases/:caseId/decisions') @HttpCode(200) @ProtectedPolicy('DRIVER_VERIFY','caseId')
 async decide(@Req()request:Request,@Body()body:unknown,@Headers('idempotency-key')key:unknown){return this.decision(request,body,key,false);}
 @Post('memberships/:caseId/decisions') @HttpCode(200) @ProtectedPolicy('MEMBERSHIP_VERIFY','caseId')
 async decideMembership(@Req()request:Request,@Body()body:unknown,@Headers('idempotency-key')key:unknown){return this.decision(request,body,key,true);}
 private async decision(request:Request,body:unknown,key:unknown,membership:boolean){const c=authorizedRequestContext(request);await this.runtime.admin.sessions.assertCsrf(c.tx,c.sessionId,request.headers.origin,request.headers['x-csrf-token']);return this.runtime.service.decide(c.tx,c.userId,c.sessionId,c.resource.id,membership,body,key);}
}
@Module({controllers:[DriverVerificationController,AdminVerificationController],providers:[AuthorizationInterceptor,{provide:AuthorizationService,useFactory:(runtime:VerificationRuntime)=>runtime.authorization,inject:[VerificationRuntime]}]})
export class VerificationHttpModule{}
