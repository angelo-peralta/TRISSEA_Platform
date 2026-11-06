import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { DenyIdentityProvider, IdentityProvider } from './auth/identity-provider';
import { HealthController } from './health.controller';
import { AuthorizationModule } from './auth/policy/authorization.module';
import { PassengerCoreModule,PassengerRuntime } from './auth/passenger/passenger-runtime';
import { PassengerHttpModule } from './auth/passenger/passenger-http.module';
import { DriverHttpModule } from './auth/driver/driver-http.module';
const passengerEnabled=process.env.M2_PASSENGER_AUTH_ENABLED==='true';
if(process.env.M2_PASSENGER_AUTH_ENABLED!==undefined&&!['true','false'].includes(process.env.M2_PASSENGER_AUTH_ENABLED))throw new Error('Invalid passenger feature flag');
const driverEnabled=process.env.M2_DRIVER_AUTH_ENABLED==='true';
if((process.env.M2_DRIVER_AUTH_ENABLED!==undefined&&!['true','false'].includes(process.env.M2_DRIVER_AUTH_ENABLED))||(driverEnabled&&!passengerEnabled))throw new Error('Invalid driver feature flag');

@Module({
  imports: [...passengerEnabled?[PassengerCoreModule.register()]:[],AuthorizationModule,...passengerEnabled?[PassengerHttpModule]:[],...driverEnabled?[DriverHttpModule]:[]],
  controllers: [HealthController],
  providers: [
    { provide: IdentityProvider, useFactory:(runtime?:PassengerRuntime)=>runtime?.identity??new DenyIdentityProvider(),inject:[{token:PassengerRuntime,optional:true}] },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
