import { and, eq, sql as query } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import * as schema from './identity-schema';

export interface ResolvedIdentityScope {
  readonly userId: string;
  readonly cityTenantId: string;
  readonly todaId?: string;
}
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Storage boundary only. A future M2.2 policy must derive this context from DB
 * identity/grants, never request headers. No HTTP controller or guard binding here. */
export class ScopedIdentityStore {
  private readonly db;
  constructor(connection: Sql) { this.db = drizzle(connection, { schema }); }
  private async scoped<T>(scope: ResolvedIdentityScope, read: (db: Pick<PostgresJsDatabase<typeof schema>, 'select'>) => Promise<T>): Promise<T> {
    if (![scope.userId, scope.cityTenantId, ...(scope.todaId ? [scope.todaId] : [])].every(validId)) throw new Error('Invalid resolved identity scope');
    return this.db.transaction(async tx => {
      const [role] = await tx.execute(query`SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'trissea_m2_runtime','member') AS member
        FROM pg_roles WHERE rolname=current_user`);
      if (!role?.member || role.rolsuper || role.rolbypassrls) throw new Error('Least-privilege runtime connection required');
      await tx.execute(query`SELECT set_config('trissea.user_id',${scope.userId},true),
        set_config('trissea.city_tenant_id',${scope.cityTenantId},true),set_config('trissea.toda_id',${scope.todaId ?? ''},true)`);
      return read(tx);
    });
  }
  listOrganizations(scope: ResolvedIdentityScope) {
    return this.scoped(scope, async db => db.select({ id: schema.todaOrganizations.id, cityTenantId: schema.todaOrganizations.cityTenantId,
      code: schema.todaOrganizations.code, state: schema.todaOrganizations.state }).from(schema.todaOrganizations).where(and(
      eq(schema.todaOrganizations.cityTenantId, scope.cityTenantId),
      ...(scope.todaId ? [eq(schema.todaOrganizations.id, scope.todaId)] : []),
    )));
  }
  listOwnSessions(scope: ResolvedIdentityScope) {
    return this.scoped(scope, async db => db.select({ id: schema.appSessions.id, clientPurpose: schema.appSessions.clientPurpose,
      state: schema.appSessions.state, expiresAt: schema.appSessions.expiresAt }).from(schema.appSessions).where(eq(schema.appSessions.userId, scope.userId)));
  }
}

/** Privileged auth-storage connection: no role/grant/admin-mapping mutation access.
 * Not an authentication/authorization resolver. Guard stays DenyIdentityProvider. */
export class IdentityStore {
  private readonly db;
  constructor(connection: Sql) { this.db = drizzle(connection, { schema }); }
  async revokeOwnSession(userId: string, sessionId: string, expectedVersion: number): Promise<boolean> {
    if (![userId, sessionId].every(validId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('Invalid revocation command');
    const s = schema.appSessions;
    const rows = await this.db.update(s).set({ state: 'REVOKED', revokedAt: query`statement_timestamp()`, version: query`${s.version} + 1` })
      .where(and(eq(s.id, sessionId), eq(s.userId, userId), eq(s.version, expectedVersion), query`${s.state} NOT IN ('REVOKED','EXPIRED')`))
      .returning({ id: s.id });
    return rows.length === 1;
  }
  async restrictAccount(userId: string, expectedVersion: number): Promise<boolean> {
    if (!validId(userId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('Invalid restriction command');
    // DB trigger serializes restriction/session creation, revokes refresh and appends audit/outbox.
    const rows = await this.db.update(schema.appUsers).set({ state: 'RESTRICTED' }).where(and(
      eq(schema.appUsers.id, userId), eq(schema.appUsers.version, expectedVersion),
      query`${schema.appUsers.state} IN ('ACTIVE','CONSENT_REQUIRED')`,
    )).returning({ id: schema.appUsers.id });
    return rows.length === 1;
  }
  async hasCurrentMobileSession(sessionId: string, userId: string, purpose: 'PASSENGER' | 'DRIVER'): Promise<boolean> {
    if (![sessionId, userId].every(validId)) return false;
    const s = schema.appSessions, u = schema.appUsers, i = schema.authIdentities;
    const rows = await this.db.select({ id: s.id }).from(s).innerJoin(u, eq(s.userId, u.id)).innerJoin(i, eq(s.identityId, i.id))
      .where(and(eq(s.id, sessionId), eq(s.userId, userId), eq(s.clientPurpose, purpose),
        eq(i.state, 'ACTIVE'), eq(s.authVersion, u.authVersion), query`${s.expiresAt} > clock_timestamp()`,
        query`((${s.state} = 'ACTIVE' AND ${u.state} = 'ACTIVE') OR (${s.state} = 'CONSENT_REQUIRED' AND ${u.state} IN ('ACTIVE','CONSENT_REQUIRED')))`));
    return rows.length === 1;
  }
}
