import type { AuthorizationLimits } from './authorization-settings';
export type ClientPurpose = 'PASSENGER' | 'DRIVER' | 'ADMIN';
export type ResourceKind = 'ACCOUNT' | 'SESSION' | 'TODA' | 'VERIFICATION_CASE' | 'FARE_POLICY' | 'SUPPORT_CASE' | 'PRIVACY_CASE' | 'CITY_CONFIG' | 'PLATFORM_CONFIG';
export const permissions = ['fare.draft', 'fare.approve', 'fare.activate', 'toda.members.manage', 'driver.verify', 'rides.assist', 'rides.read.masked', 'gps.read.live', 'privacy.dsr', 'incidents.escalate', 'config.manage'] as const;
export type Permission = typeof permissions[number];

/** Minted by a trusted credential adapter, never decoded from caller JSON/headers.
 * JWT/cookie proof implementations are M2.3/M2.5; the default verifier returns null. */
export interface SessionProof {
  readonly userId: string; readonly sessionId: string; readonly identityId: string;
  readonly purpose: ClientPurpose; readonly expiresAt: number;
  readonly adminMfa?: Readonly<{ authenticatedAt: number; verifiedAt: number; currentUntil: number }>;
}
export interface SubjectRecord {
  readonly userId: string; readonly sessionId: string; readonly identityId: string;
  readonly purpose: ClientPurpose; readonly identityKind: string; readonly identityState: string;
  readonly userState: string; readonly sessionState: string; readonly authVersion: number; readonly userAuthVersion: number;
  readonly authenticatedAt: number; readonly mfaVerifiedAt: number | null; readonly lastSeenAt: number; readonly expiresAt: number;
  readonly personaState: string | null; readonly adminMappingState: string | null;
}
export interface ResourceRecord {
  readonly id: string; readonly kind: ResourceKind; readonly version: number;
  readonly cityTenantId: string | null; readonly todaId: string | null;
  readonly cityState?: string; readonly todaState?: string;
  readonly ownerUserId: string | null; readonly makerUserId: string | null; readonly assignedUserId: string | null;
}
export interface GrantRecord {
  readonly id: string; readonly userId: string; readonly roleCode: string; readonly scopeKind: string;
  readonly permission: string; readonly cityTenantId: string; readonly todaId: string | null;
  readonly startsAt: number; readonly expiresAt: number; readonly revokedAt: number | null;
  readonly membershipState: string; readonly cityState: string; readonly todaState: string | null;
}
export interface ActionPolicy {
  readonly resource: ResourceKind; readonly permission: Permission | null;
  readonly roles: readonly string[]; readonly scopes: readonly string[];
  readonly self: boolean; readonly assigned: boolean; readonly noSelfApproval: boolean;
  readonly fresh: boolean; readonly requiredMaker: boolean;
}
const self = (resource: ResourceKind): ActionPolicy => ({ resource, permission: null, roles: [], scopes: [], self: true, assigned: false, noSelfApproval: false, fresh: false, requiredMaker: false });
const scoped = (resource: ResourceKind, permission: Permission, roles: readonly string[], scopes: readonly string[], extra: Partial<ActionPolicy> = {}): ActionPolicy =>
  ({ resource, permission, roles, scopes, self: false, assigned: false, noSelfApproval: false, fresh: false, requiredMaker: false, ...extra });

/** Action keys are server route metadata, not new role/permission identifiers or public operations. */
export const actionPolicies = Object.freeze({
  ACCOUNT_READ_SELF: self('ACCOUNT'), SESSION_READ_SELF: self('SESSION'),
  TODA_MEMBERS_MANAGE: scoped('TODA', 'toda.members.manage', ['TODA_MANAGER'], ['TODA'], { fresh: true }),
  DRIVER_VERIFY: scoped('VERIFICATION_CASE', 'driver.verify', ['VERIFICATION_OFFICER'], ['CITY', 'TODA'], { fresh: true, assigned: true, noSelfApproval: true }),
  FARE_DRAFT: scoped('FARE_POLICY', 'fare.draft', ['CITY_FARE_EDITOR'], ['CITY']),
  FARE_APPROVE: scoped('FARE_POLICY', 'fare.approve', ['CITY_FARE_APPROVER'], ['CITY'], { fresh: true, noSelfApproval: true, requiredMaker: true }),
  SUPPORT_READ_MASKED: scoped('SUPPORT_CASE', 'rides.read.masked', ['SUPPORT_AGENT'], ['CITY', 'TODA'], { assigned: true }),
  DISPATCH_READ_MASKED: scoped('TODA', 'rides.read.masked', ['TODA_DISPATCHER'], ['TODA']),
  INCIDENT_ESCALATE: scoped('SUPPORT_CASE', 'incidents.escalate', ['SUPPORT_AGENT'], ['CITY', 'TODA'], { assigned: true }),
  PRIVACY_DSR: scoped('PRIVACY_CASE', 'privacy.dsr', ['PRIVACY_OFFICER'], ['CITY'], { assigned: true, fresh: true }),
  CITY_CONFIG_MANAGE: scoped('CITY_CONFIG', 'config.manage', ['CITY_OPERATIONS_ADMIN'], ['CITY'], { fresh: true }),
  PLATFORM_CONFIG_MANAGE: scoped('PLATFORM_CONFIG', 'config.manage', ['PLATFORM_ADMIN'], ['PLATFORM'], { fresh: true }),
});
export type ActionKey = keyof typeof actionPolicies;
export type DenialReason = 'INVALID_SESSION' | 'INVALID_RESOURCE' | 'MFA_REQUIRED' | 'REAUTH_REQUIRED' | 'CONSENT_REQUIRED' | 'OWNERSHIP_REQUIRED' | 'ASSIGNMENT_REQUIRED' | 'SELF_APPROVAL' | 'NO_PERMISSION';
export type AuthorizationDecision = Readonly<{ allowed: true; grantId: string | null }> | Readonly<{ allowed: false; reason: DenialReason }>;

export function decideAuthorization(proof: SessionProof, s: SubjectRecord | null, resource: ResourceRecord | null, grants: readonly GrantRecord[], action: ActionPolicy, now: number,
  limits: AuthorizationLimits = { adminIdleMilliseconds: 900_000, adminReauthMilliseconds: 300_000 }): AuthorizationDecision {
  const deny = (reason: DenialReason): AuthorizationDecision => ({ allowed: false, reason });
  if (![limits.adminIdleMilliseconds,limits.adminReauthMilliseconds].every(Number.isSafeInteger)
    || limits.adminIdleMilliseconds <= 0 || limits.adminIdleMilliseconds > 900_000
    || limits.adminReauthMilliseconds <= 0 || limits.adminReauthMilliseconds > 300_000) return deny('INVALID_SESSION');
  if (!s || ![now,proof.expiresAt,s.authenticatedAt,s.lastSeenAt,s.expiresAt].every(Number.isFinite)
    || s.userId !== proof.userId || s.sessionId !== proof.sessionId || s.identityId !== proof.identityId || s.purpose !== proof.purpose
    || s.authVersion !== s.userAuthVersion || s.authVersion < 1 || s.identityState !== 'ACTIVE'
    || !['ACTIVE','CONSENT_REQUIRED'].includes(s.userState) || !['ACTIVE','CONSENT_REQUIRED'].includes(s.sessionState)
    || s.expiresAt <= now || proof.expiresAt <= now || s.authenticatedAt > now || s.lastSeenAt > now || s.lastSeenAt < s.authenticatedAt
    || (s.userState === 'CONSENT_REQUIRED' && s.sessionState !== 'CONSENT_REQUIRED')) return deny('INVALID_SESSION');
  if (s.purpose === 'ADMIN') {
    const m = proof.adminMfa;
    if (s.identityKind !== 'KEYCLOAK' || s.adminMappingState !== 'APPROVED' || s.mfaVerifiedAt === null
      || !m || ![m.authenticatedAt,m.verifiedAt,m.currentUntil,s.mfaVerifiedAt].every(Number.isFinite)
      || m.authenticatedAt !== s.authenticatedAt || m.verifiedAt !== s.mfaVerifiedAt || m.currentUntil <= now || m.currentUntil > proof.expiresAt
      || s.mfaVerifiedAt < s.authenticatedAt || s.mfaVerifiedAt > now || now-s.lastSeenAt >= limits.adminIdleMilliseconds) return deny('MFA_REQUIRED');
    if (action.fresh && (now-s.authenticatedAt >= limits.adminReauthMilliseconds || now-s.mfaVerifiedAt >= limits.adminReauthMilliseconds)) return deny('REAUTH_REQUIRED');
  } else if (s.identityKind !== 'PHONE_OTP' || !['PASSENGER','DRIVER'].includes(s.purpose)
    || !['PENDING','ACTIVE'].includes(s.personaState ?? '')) return deny('INVALID_SESSION');
  if (!resource || resource.kind !== action.resource || !Number.isSafeInteger(resource.version) || resource.version < 1
    || (resource.todaId !== null && resource.cityTenantId === null)) return deny('INVALID_RESOURCE');
  if (action.self) return resource.ownerUserId === s.userId ? { allowed: true, grantId: null } : deny('OWNERSHIP_REQUIRED');
  if (resource.cityState !== 'ACTIVE' || (resource.todaId !== null && resource.todaState !== 'VERIFIED')) return deny('INVALID_RESOURCE');
  if (s.userState !== 'ACTIVE' || s.sessionState !== 'ACTIVE') return deny('CONSENT_REQUIRED');
  if (s.purpose !== 'ADMIN') return deny('MFA_REQUIRED');
  if (action.assigned && resource.assignedUserId !== s.userId) return deny('ASSIGNMENT_REQUIRED');
  if (action.requiredMaker && !resource.makerUserId) return deny('INVALID_RESOURCE');
  if (action.noSelfApproval && (resource.ownerUserId === s.userId || resource.makerUserId === s.userId)) return deny('SELF_APPROVAL');
  if (action.noSelfApproval && resource.kind === 'VERIFICATION_CASE' && !resource.ownerUserId) return deny('INVALID_RESOURCE');
  const grant = grants.find(g => g.userId === s.userId && g.cityTenantId === resource.cityTenantId
    && g.permission === action.permission && action.roles.includes(g.roleCode) && action.scopes.includes(g.scopeKind)
    && g.membershipState === 'ACTIVE' && g.cityState === 'ACTIVE'
    && [g.startsAt,g.expiresAt].every(Number.isFinite) && g.startsAt <= now && g.expiresAt > now && g.revokedAt === null
    && ((g.scopeKind === 'TODA' && g.todaId !== null && g.todaId === resource.todaId && g.todaState === 'VERIFIED')
      || ((g.scopeKind === 'CITY' || g.scopeKind === 'PLATFORM') && g.todaId === null)));
  return grant ? { allowed: true, grantId: grant.id } : deny('NO_PERMISSION');
}
