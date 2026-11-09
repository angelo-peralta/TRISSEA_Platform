import { Body,Controller,ForbiddenException,Get,Headers,HttpCode,Module,Param,Post,Req } from '@nestjs/common';
import { AuthorizationModule } from '../policy/authorization.module';
import { ProtectedPolicy,authorizedRequestContext } from '../policy/authorization.interceptor';
import { PassengerRuntime } from '../passenger/passenger-runtime';
import { PhoneAuthError,objectInput } from '../passenger/primitives';
@Controller('driver')
class DriverController {
 constructor(private readonly runtime:PassengerRuntime){}
 private get accounts(){if(!this.runtime.driver)throw new PhoneAuthError('UNAVAILABLE');return this.runtime.driver.accounts;}
 @Get('me') @ProtectedPolicy('DRIVER_READ_SELF','@self')
 me(@Req()request:object){const c=authorizedRequestContext(request);return this.accounts.me(c.tx,c.userId,c.sessionId);}
 @Post('me/consents') @HttpCode(200) @ProtectedPolicy('DRIVER_CONSENT_SELF','@self')
 consent(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){const c=authorizedRequestContext(request);return this.accounts.consent(c.tx,c.userId,c.sessionId,body,key);}
 @Get('auth/sessions') @ProtectedPolicy('DRIVER_READ_SELF','@self')
 sessions(@Req()request:object){const c=authorizedRequestContext(request);return this.runtime.profiles.listSessions(c.tx,c.userId,c.sessionId,'DRIVER');}
 @Post('auth/sessions/:sessionId/revoke') @HttpCode(204) @ProtectedPolicy('DRIVER_REVOKE_SELF','sessionId')
 async revoke(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){objectInput(body??{},[]);const c=authorizedRequestContext(request);await this.runtime.profiles.revoke(c.tx,c.userId,c.sessionId,c.resource.id,key,'DRIVER');}
 @Post('auth/logout') @HttpCode(204) @ProtectedPolicy('DRIVER_REVOKE_SELF','@self')
 async logout(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){objectInput(body??{},[]);const c=authorizedRequestContext(request);await this.runtime.profiles.revoke(c.tx,c.userId,c.sessionId,c.sessionId,key,'DRIVER');}
 @Get('onboarding/options') @ProtectedPolicy('DRIVER_INTAKE_READ_SELF','@self')
 options(@Req()request:object){const c=authorizedRequestContext(request);return this.accounts.options(c.tx,c.userId);}
 @Get('cities/:cityTenantId/todas/:todaId/synthetic-vehicles') @ProtectedPolicy('DRIVER_INTAKE_READ_SELF','@self')
 vehicles(@Req()request:object,@Param('cityTenantId')city:string,@Param('todaId')toda:string){const c=authorizedRequestContext(request);return this.accounts.vehicles(c.tx,c.userId,city,toda);}
 @Post('toda-affiliation-requests') @HttpCode(200) @ProtectedPolicy('DRIVER_INTAKE_SELF','@self')
 affiliation(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){const c=authorizedRequestContext(request);return this.accounts.requestAffiliation(c.tx,c.userId,c.sessionId,body,key);}
 @Post('vehicle-relationships') @HttpCode(200) @ProtectedPolicy('DRIVER_INTAKE_SELF','@self')
 vehicle(@Req()request:object,@Body()body:unknown,@Headers('idempotency-key')key:unknown){const c=authorizedRequestContext(request);return this.accounts.requestVehicle(c.tx,c.userId,c.sessionId,body,key);}
 @Get('verification-status') @ProtectedPolicy('DRIVER_READ_SELF','@self')
 status(@Req()request:object){const c=authorizedRequestContext(request);return this.accounts.status(c.tx,c.userId);}
 @Get('cities/:cityTenantId/todas/:todaId/eligibility') @ProtectedPolicy('DRIVER_READ_SELF','@self')
 eligibility(@Req()request:object,@Param('cityTenantId')city:string,@Param('todaId')toda:string){const c=authorizedRequestContext(request);return this.accounts.eligibility(c.tx,c.userId,city,toda);}
 // Explicit server-side capability denials, including for synthetic identity-eligible fixtures.
 @Post('shifts') @HttpCode(403) @ProtectedPolicy('DRIVER_READ_SELF','@self')
 shifts(){throw new ForbiddenException('Operational services are disabled');}
 @Post('locations') @HttpCode(403) @ProtectedPolicy('DRIVER_READ_SELF','@self')
 locations(){throw new ForbiddenException('Location collection is disabled');}
 @Get('offers') @ProtectedPolicy('DRIVER_READ_SELF','@self')
 offers(){throw new ForbiddenException('Dispatch is disabled');}
}
@Module({imports:[AuthorizationModule],controllers:[DriverController]})
export class DriverHttpModule {}
