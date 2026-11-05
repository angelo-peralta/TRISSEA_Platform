import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { DenyIdentityProvider, IdentityProvider } from './auth/identity-provider';
import { HealthController } from './health.controller';
import { AuthorizationModule } from './auth/policy/authorization.module';

@Module({
  imports: [AuthorizationModule],
  controllers: [HealthController],
  providers: [
    { provide: IdentityProvider, useClass: DenyIdentityProvider },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
