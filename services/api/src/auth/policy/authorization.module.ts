import { Module } from '@nestjs/common';
import { AuthorizationDatabase, AuthorizationResources, UnavailableAuthorizationDatabase } from './authorization-database';
import { AuthorizationService, DenySessionProofVerifier, SessionProofVerifier } from './authorization.service';
import { AuthorizationInterceptor } from './authorization.interceptor';
import { AuthorizationSettings } from './authorization-settings';
import { PassengerRuntime } from '../passenger/passenger-runtime';
import { PostgresAuthorizationDatabase } from './authorization-database';

@Module({
  providers: [AuthorizationService, AuthorizationResources, AuthorizationInterceptor,
    { provide: AuthorizationSettings, useFactory: () => new AuthorizationSettings() },
    { provide: AuthorizationDatabase, useFactory:(runtime?:PassengerRuntime)=>runtime?new PostgresAuthorizationDatabase(runtime.connection):new UnavailableAuthorizationDatabase(),inject:[{token:PassengerRuntime,optional:true}] },
    { provide: SessionProofVerifier, useFactory:(runtime?:PassengerRuntime)=>runtime?.proofVerifier??new DenySessionProofVerifier(),inject:[{token:PassengerRuntime,optional:true}] }],
  exports: [AuthorizationService, AuthorizationResources, AuthorizationDatabase, SessionProofVerifier, AuthorizationInterceptor],
})
export class AuthorizationModule {}
