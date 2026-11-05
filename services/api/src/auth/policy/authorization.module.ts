import { Module } from '@nestjs/common';
import { AuthorizationDatabase, AuthorizationResources, UnavailableAuthorizationDatabase } from './authorization-database';
import { AuthorizationService, DenySessionProofVerifier, SessionProofVerifier } from './authorization.service';
import { AuthorizationInterceptor } from './authorization.interceptor';
import { AuthorizationSettings } from './authorization-settings';

@Module({
  providers: [AuthorizationService, AuthorizationResources, AuthorizationInterceptor,
    { provide: AuthorizationSettings, useFactory: () => new AuthorizationSettings() },
    { provide: AuthorizationDatabase, useClass: UnavailableAuthorizationDatabase },
    { provide: SessionProofVerifier, useClass: DenySessionProofVerifier }],
  exports: [AuthorizationService, AuthorizationResources, AuthorizationDatabase, SessionProofVerifier, AuthorizationInterceptor],
})
export class AuthorizationModule {}
