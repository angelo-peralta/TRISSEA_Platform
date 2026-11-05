import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { DenyIdentityProvider, IdentityProvider } from './auth/identity-provider';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: IdentityProvider, useClass: DenyIdentityProvider },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
