// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.
import type { HealthResponse } from './generated/m1';

export function createHealthClient(baseUrl: string, fetcher: typeof fetch = fetch) {
  return {
    async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
      const response = await fetcher(baseUrl.replace(/\/$/, '') + "/health", { ...(signal ? { signal } : {}) });
      if (!response.ok) throw new Error('API health unavailable');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' ||
        !("status" in body) || body["status"] !== "ok" ||
        !("service" in body) || body["service"] !== "trissea-api" ||
        !("milestone" in body) || body["milestone"] !== "M1" ||
        !("bookingsEnabled" in body) || body["bookingsEnabled"] !== false) throw new Error('Unexpected API health response');
      return body as HealthResponse;
    },
  };
}
