import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import * as schema from '../../database/identity-schema';
import type { GrantRecord, ResourceKind, ResourceRecord, SessionProof, SubjectRecord } from './authorization-model';

export type PolicyTransaction = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];
export abstract class AuthorizationDatabase {
  abstract transaction<T>(work: (tx: PolicyTransaction) => Promise<T>,purpose?:'PASSENGER'|'DRIVER'|'ADMIN'): Promise<T>;
}

export class RoutedAuthorizationDatabase extends AuthorizationDatabase{
 constructor(readonly mobile:AuthorizationDatabase,readonly browser:AuthorizationDatabase){super();}
 transaction<T>(work:(tx:PolicyTransaction)=>Promise<T>,purpose?:'PASSENGER'|'DRIVER'|'ADMIN'){return (purpose==='ADMIN'?this.browser:this.mobile).transaction(work);}
}
@Injectable()
export class UnavailableAuthorizationDatabase extends AuthorizationDatabase {
  async transaction<T>(): Promise<T> { throw new Error('Authorization database is not configured'); }
}

export class PostgresAuthorizationDatabase extends AuthorizationDatabase {
  private readonly db;
  constructor(connection: Sql) { super(); this.db = drizzle(connection, { schema }); }
  transaction<T>(work: (tx: PolicyTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      const [role] = await tx.execute(sql`SELECT rolsuper,rolbypassrls,
        pg_has_role(current_user,'trissea_m2_authorization','member') AS resolver,
        pg_has_role(current_user,'trissea_m2_policy_lock','member') AS locker,
        EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_driver_lock' AND pg_has_role(current_user,oid,'member')) AS driver_locker,
        EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_verification_writer' AND pg_has_role(current_user,oid,'member')) AS verification_writer,
        EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='identity' AND c.relkind='r' AND pg_has_role(current_user,c.relowner,'member')) AS owns_tables
        FROM pg_roles WHERE rolname=current_user`);
      if (!role?.resolver || role.rolsuper || role.rolbypassrls || role.locker || role.driver_locker || role.verification_writer || role.owns_tables) throw new Error('Invalid authorization database role');
      await tx.execute(sql`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`);
      return work(tx);
    }, { isolationLevel: 'read committed' });
  }
}

export async function setPolicyContext(tx: PolicyTransaction, proof: SessionProof, cityTenantId: string | null, todaId: string | null): Promise<void> {
  await tx.execute(sql`SELECT set_config('trissea.user_id',${proof.userId},true),set_config('trissea.session_id',${proof.sessionId},true),
    set_config('trissea.city_tenant_id',${cityTenantId ?? ''},true),set_config('trissea.toda_id',${todaId ?? ''},true),set_config('trissea.client_purpose',${proof.purpose},true)`);
}
export async function databaseTime(tx: PolicyTransaction): Promise<number> {
  const [row] = await tx.execute(sql`SELECT extract(epoch from clock_timestamp())*1000 AS milliseconds`);
  return Number(row?.milliseconds);
}

export async function loadSubject(tx: PolicyTransaction, proof: SessionProof): Promise<SubjectRecord | null> {
  const s = schema.appSessions, u = schema.appUsers, i = schema.authIdentities, p = schema.userPersonas, m = schema.administrativeIdentityMappings;
  const [row] = await tx.select({ userId: u.id, sessionId: s.id, identityId: i.id, purpose: s.clientPurpose,
    identityKind: i.kind, identityState: i.state, userState: u.state, sessionState: s.state, authVersion: s.authVersion, userAuthVersion: u.authVersion,
    authenticatedAt: s.authenticatedAt, mfaVerifiedAt: s.mfaVerifiedAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt,
    personaState: p.state, adminMappingState: m.state }).from(s).innerJoin(u, eq(s.userId,u.id)).innerJoin(i,and(eq(i.id,s.identityId),eq(i.userId,u.id)))
    .leftJoin(p,and(eq(p.userId,u.id),eq(p.purpose,s.clientPurpose))).leftJoin(m,and(eq(m.identityId,i.id),eq(m.userId,u.id)))
    .where(and(eq(s.id,proof.sessionId),eq(u.id,proof.userId),eq(i.id,proof.identityId),eq(s.clientPurpose,proof.purpose)));
  return row ? { ...row, purpose: proof.purpose, authenticatedAt: row.authenticatedAt.getTime(), mfaVerifiedAt: row.mfaVerifiedAt?.getTime() ?? null,
    lastSeenAt: row.lastSeenAt.getTime(), expiresAt: row.expiresAt.getTime() } : null;
}

/** Domain adapters must load/lock authoritative resources in this same transaction.
 * Unsupported future resources deny. No generic request-body scope adapter exists. */
@Injectable()
export class AuthorizationResources {
  async load(tx: PolicyTransaction, kind: ResourceKind, id: string): Promise<ResourceRecord | null> {
    const common = { makerUserId: null, assignedUserId: null, cityTenantId: null, todaId: null };
    if (kind === 'ACCOUNT') {
      const [row] = await tx.select({ id: schema.appUsers.id, version: schema.appUsers.version }).from(schema.appUsers).where(eq(schema.appUsers.id,id));
      return row ? { ...common, ...row, kind, ownerUserId: row.id } : null;
    }
    if (kind === 'SESSION') {
      const [row] = await tx.select({ id: schema.appSessions.id, version: schema.appSessions.version, ownerUserId: schema.appSessions.userId }).from(schema.appSessions).where(eq(schema.appSessions.id,id));
      return row ? { ...common, ...row, kind } : null;
    }
    if (kind === 'TODA') {
      const [row] = await tx.select({ id: schema.todaOrganizations.id, version: schema.todaOrganizations.version, cityTenantId: schema.todaOrganizations.cityTenantId }).from(schema.todaOrganizations).where(eq(schema.todaOrganizations.id,id));
      return row ? { ...common, ...row, kind, ownerUserId: null, todaId: row.id } : null;
    }
    return null;
  }
}

export async function withScopeStates(tx: PolicyTransaction, resource: ResourceRecord | null): Promise<ResourceRecord | null> {
  if (!resource || !resource.cityTenantId) return resource;
  const [city] = await tx.select({ state: schema.cityTenants.state }).from(schema.cityTenants).where(eq(schema.cityTenants.id,resource.cityTenantId));
  const [toda] = resource.todaId ? await tx.select({ state: schema.todaOrganizations.state }).from(schema.todaOrganizations)
    .where(and(eq(schema.todaOrganizations.id,resource.todaId),eq(schema.todaOrganizations.cityTenantId,resource.cityTenantId))) : [];
  return { ...resource, cityState: city?.state ?? 'UNKNOWN', todaState: toda?.state ?? 'UNKNOWN' };
}

export async function loadGrants(tx: PolicyTransaction, proof: SessionProof, resource: ResourceRecord | null): Promise<GrantRecord[]> {
  if (!resource?.cityTenantId) return [];
  const g = schema.scopedRoleAssignments, p = schema.rolePermissions, m = schema.cityMemberships, c = schema.cityTenants, t = schema.todaOrganizations;
  const rows = await tx.select({ id: g.id, userId: g.userId, roleCode: g.roleCode, scopeKind: g.scopeKind, permission: p.permissionCode,
    cityTenantId: g.cityTenantId, todaId: g.todaId, startsAt: g.startsAt, expiresAt: g.expiresAt, revokedAt: g.revokedAt,
    membershipState: m.state, cityState: c.state, todaState: t.state }).from(g)
    .innerJoin(p,eq(p.roleCode,g.roleCode)).innerJoin(m,and(eq(m.userId,g.userId),eq(m.cityTenantId,g.cityTenantId)))
    .innerJoin(c,eq(c.id,g.cityTenantId)).leftJoin(t,and(eq(t.id,g.todaId),eq(t.cityTenantId,g.cityTenantId)))
    .where(and(eq(g.userId,proof.userId),eq(g.cityTenantId,resource.cityTenantId)));
  return rows.map(row => ({ ...row, startsAt: row.startsAt.getTime(), expiresAt: row.expiresAt.getTime(), revokedAt: row.revokedAt?.getTime() ?? null }));
}
