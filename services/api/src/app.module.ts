import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { CompositeIdentityProvider,DenyIdentityProvider, IdentityProvider } from './auth/identity-provider';
import { HealthController } from './health.controller';
import { AuthorizationModule } from './auth/policy/authorization.module';
import { PassengerCoreModule,PassengerRuntime } from './auth/passenger/passenger-runtime';
import { PassengerHttpModule } from './auth/passenger/passenger-http.module';
import { DriverHttpModule } from './auth/driver/driver-http.module';
import { AdminRuntime,AdminCoreModule } from './auth/admin/admin-runtime';
import { AdminHttpModule } from './auth/admin/admin-http.module';
import {VerificationCoreModule} from './auth/verification/verification-runtime';
import {VerificationHttpModule} from './auth/verification/verification-http.module';
import {FareHttpModule} from './fares/fare-http.module';
const passengerEnabled=process.env.M2_PASSENGER_AUTH_ENABLED==='true';
if(process.env.M2_PASSENGER_AUTH_ENABLED!==undefined&&!['true','false'].includes(process.env.M2_PASSENGER_AUTH_ENABLED))throw new Error('Invalid passenger feature flag');
const driverEnabled=process.env.M2_DRIVER_AUTH_ENABLED==='true';
const adminEnabled=process.env.M2_ADMIN_AUTH_ENABLED==='true';
const verificationEnabled=process.env.M2_VERIFICATION_ENABLED==='true';
if((process.env.M2_VERIFICATION_ENABLED!==undefined&&!['true','false'].includes(process.env.M2_VERIFICATION_ENABLED))||(verificationEnabled&&(!passengerEnabled||!driverEnabled||!adminEnabled)))throw new Error('Invalid verification feature flag');
if(process.env.M2_ADMIN_AUTH_ENABLED!==undefined&&!['true','false'].includes(process.env.M2_ADMIN_AUTH_ENABLED))throw new Error('Invalid admin feature flag');
if((process.env.M2_DRIVER_AUTH_ENABLED!==undefined&&!['true','false'].includes(process.env.M2_DRIVER_AUTH_ENABLED))||(driverEnabled&&!passengerEnabled))throw new Error('Invalid driver feature flag');

@Module({
  imports: [...passengerEnabled?[PassengerCoreModule.register()]:[],...adminEnabled?[AdminCoreModule.register()]:[],...verificationEnabled?[VerificationCoreModule.register()]:[],AuthorizationModule,...passengerEnabled?[PassengerHttpModule]:[],...driverEnabled?[DriverHttpModule]:[],...adminEnabled?[AdminHttpModule,FareHttpModule]:[],...verificationEnabled?[VerificationHttpModule]:[]],
  controllers: [HealthController],
  providers: [
    { provide: IdentityProvider, useFactory:(runtime?:PassengerRuntime,admin?:AdminRuntime)=>new CompositeIdentityProvider(runtime?.identity??new DenyIdentityProvider(),admin?.identity),inject:[{token:PassengerRuntime,optional:true},{token:AdminRuntime,optional:true}] },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
