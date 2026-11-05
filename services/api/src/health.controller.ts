import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.guard';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    // Liveness only. Does not assert DB readiness or booking availability.
    return { status: 'ok', service: 'trissea-api', milestone: 'M1', bookingsEnabled: false } as const;
  }
}
