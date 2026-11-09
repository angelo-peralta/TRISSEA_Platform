import { Module } from '@nestjs/common';
import { AuthorizationDatabase, AuthorizationResources, UnavailableAuthorizationDatabase } from './authorization-database';
import { AuthorizationService, DenySessionProofVerifier, SessionProofVerifier } from './authorization.service';
import { AuthorizationInterceptor } from './authorization.interceptor';
import { AuthorizationSettings } from './authorization-settings';
import { PassengerRuntime } from '../passenger/passenger-runtime';
import { PostgresAuthorizationDatabase } from './authorization-database';
import { RoutedAuthorizationDatabase } from './authorization-database';
import { AdminRuntime } from '../admin/admin-runtime';

class CompositeProof extends SessionProofVerifier{
 constructor(readonly mobile?:PassengerRuntime,readonly admin?:AdminRuntime){super();}
 async verify(input:import('./authorization.service').RequestCredentials){if(input.cookie)return input.authorization?null:await this.admin?.proofVerifier.verify(input)??null;return await this.mobile?.proofVerifier.verify(input)??null;}
}

@Module({
  providers: [AuthorizationService, AuthorizationResources, AuthorizationInterceptor,
    { provide: AuthorizationSettings, useFactory: () => new AuthorizationSettings() },
    { provide: AuthorizationDatabase, useFactory:(runtime?:PassengerRuntime,admin?:AdminRuntime)=>new RoutedAuthorizationDatabase(runtime?new PostgresAuthorizationDatabase(runtime.connection):new UnavailableAuthorizationDatabase(),admin?new PostgresAuthorizationDatabase(admin.connection):new UnavailableAuthorizationDatabase()),inject:[{token:PassengerRuntime,optional:true},{token:AdminRuntime,optional:true}] },
    { provide: SessionProofVerifier, useFactory:(runtime?:PassengerRuntime,admin?:AdminRuntime)=>runtime||admin?new CompositeProof(runtime,admin):new DenySessionProofVerifier(),inject:[{token:PassengerRuntime,optional:true},{token:AdminRuntime,optional:true}] }],
  exports: [AuthorizationService, AuthorizationResources, AuthorizationDatabase, SessionProofVerifier, AuthorizationInterceptor],
})
export class AuthorizationModule {}
