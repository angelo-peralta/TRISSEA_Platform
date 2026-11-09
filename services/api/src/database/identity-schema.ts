import { sql } from 'drizzle-orm';
import { pgSchema, uuid, text, integer, timestamp, primaryKey, unique, index, check, foreignKey } from 'drizzle-orm/pg-core';

export const identity = pgSchema('identity');
const id = () => uuid('id').defaultRandom().primaryKey();
const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time('created_at').defaultNow().notNull();
const version = () => integer('version').default(1).notNull();

export const appUsers = identity.table('app_users', {
  id: id(), state: text('state').default('CONSENT_REQUIRED').notNull(), version: version(),
  authVersion: integer('auth_version').default(1).notNull(), createdAt: created(), restrictedAt: time('restricted_at'),
}, t => [check('users_state', sql`${t.state} IN ('CONSENT_REQUIRED','ACTIVE','RESTRICTED','CLOSED')`),
  check('users_versions', sql`${t.version} > 0 AND ${t.authVersion} > 0`),
  check('users_restriction', sql`(${t.state} IN ('RESTRICTED','CLOSED')) = (${t.restrictedAt} IS NOT NULL)`)]).enableRLS();

export const userPersonas = identity.table('user_personas', {
  userId: uuid('user_id').notNull().references(() => appUsers.id), purpose: text('purpose').notNull(),
  state: text('state').default('PENDING').notNull(), createdAt: created(),
}, t => [primaryKey({ columns: [t.userId, t.purpose] }),
  check('personas_purpose', sql`${t.purpose} IN ('PASSENGER','DRIVER')`),
  check('personas_state', sql`${t.state} IN ('PENDING','ACTIVE','RESTRICTED')`)]).enableRLS();

export const authIdentities = identity.table('auth_identities', {
  id: id(), userId: uuid('user_id').notNull().references(() => appUsers.id), kind: text('kind').notNull(),
  issuer: text('issuer').notNull(), subjectDigest: text('subject_digest').notNull(), keyId: text('key_id').notNull(),
  subjectCiphertext: text('subject_ciphertext').notNull(), verifiedAt: time('verified_at').notNull(),
  state: text('state').default('ACTIVE').notNull(), createdAt: created(),
}, t => [unique('identity_subject').on(t.issuer, t.keyId, t.subjectDigest), unique('identity_user_kind').on(t.id, t.userId, t.kind),
  check('identity_kind', sql`${t.kind} IN ('PHONE_OTP','KEYCLOAK')`),
  check('identity_state', sql`${t.state} IN ('ACTIVE','DISABLED')`),
  check('identity_digest', sql`${t.subjectDigest} ~ '^[0-9a-f]{64}$' AND ${t.keyId} ~ '^[A-Za-z0-9_-]{1,32}$'`),
  check('identity_envelope', sql`${t.subjectCiphertext} LIKE 'v1.' || ${t.keyId} || '.%' AND ${t.subjectCiphertext} ~ '^v1[.][A-Za-z0-9_-]{1,32}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$'`),
  index('identity_user_idx').on(t.userId)]);

export const cityTenants = identity.table('city_tenants', {
  id: id(), code: text('code').notNull().unique(), name: text('name').notNull(),
  timezone: text('timezone').default('Asia/Manila').notNull(), state: text('state').default('PENDING').notNull(), createdAt: created(),
}, t => [check('city_state', sql`${t.state} IN ('PENDING','ACTIVE','SUSPENDED')`)]).enableRLS();

export const todaOrganizations = identity.table('toda_organizations', {
  id: id(), cityTenantId: uuid('city_tenant_id').notNull().references(() => cityTenants.id), code: text('code').notNull(),
  name: text('name').notNull(), state: text('state').default('PENDING').notNull(), version: version(), createdAt: created(),
}, t => [unique('toda_city_id').on(t.cityTenantId, t.id), unique('toda_city_code').on(t.cityTenantId, t.code),
  check('toda_state', sql`${t.state} IN ('PENDING','VERIFIED','SUSPENDED','REVOKED')`), check('toda_version', sql`${t.version} > 0`)]).enableRLS();

export const cityMemberships = identity.table('city_memberships', {
  id: id(), userId: uuid('user_id').notNull().references(() => appUsers.id),
  cityTenantId: uuid('city_tenant_id').notNull().references(() => cityTenants.id), state: text('state').default('PENDING').notNull(),
  version: version(), createdAt: created(), revokedAt: time('revoked_at'),
}, t => [unique('membership_user_city').on(t.userId, t.cityTenantId),
  check('membership_state', sql`${t.state} IN ('PENDING','ACTIVE','SUSPENDED','REVOKED')`),
  check('membership_version', sql`${t.version} > 0`),
  check('membership_revoked', sql`(${t.state} = 'REVOKED') = (${t.revokedAt} IS NOT NULL)`)]).enableRLS();

export const roles = identity.table('roles', { code: text('code').primaryKey() });
export const permissions = identity.table('permissions', { code: text('code').primaryKey() });
export const roleScopes = identity.table('role_scopes', {
  roleCode: text('role_code').notNull().references(() => roles.code), scopeKind: text('scope_kind').notNull(),
}, t => [primaryKey({ columns: [t.roleCode, t.scopeKind] }), check('role_scope_kind', sql`${t.scopeKind} IN ('SELF','CITY','TODA','PLATFORM')`)]);
export const rolePermissions = identity.table('role_permissions', {
  roleCode: text('role_code').notNull().references(() => roles.code), permissionCode: text('permission_code').notNull().references(() => permissions.code),
}, t => [primaryKey({ columns: [t.roleCode, t.permissionCode] })]);

export const scopedRoleAssignments = identity.table('scoped_role_assignments', {
  id: id(), userId: uuid('user_id').notNull(), cityTenantId: uuid('city_tenant_id').notNull(), todaId: uuid('toda_id'),
  roleCode: text('role_code').notNull(), scopeKind: text('scope_kind').notNull(),
  grantedBy: uuid('granted_by').notNull().references(() => appUsers.id),
  startsAt: time('starts_at').defaultNow().notNull(), expiresAt: time('expires_at').notNull(), revokedAt: time('revoked_at'), version: version(),
}, t => [foreignKey({ name: 'grant_membership', columns: [t.userId, t.cityTenantId], foreignColumns: [cityMemberships.userId, cityMemberships.cityTenantId] }),
  foreignKey({ name: 'grant_toda_city', columns: [t.cityTenantId, t.todaId], foreignColumns: [todaOrganizations.cityTenantId, todaOrganizations.id] }),
  foreignKey({ name: 'grant_role_scope', columns: [t.roleCode, t.scopeKind], foreignColumns: [roleScopes.roleCode, roleScopes.scopeKind] }),
  check('grant_scope', sql`(${t.scopeKind} = 'TODA') = (${t.todaId} IS NOT NULL)`),
  check('grant_no_self', sql`${t.grantedBy} <> ${t.userId}`),
  check('grant_window', sql`${t.expiresAt} > ${t.startsAt} AND ${t.version} > 0`),
  unique('grant_tuple').on(t.userId, t.cityTenantId, t.todaId, t.roleCode, t.scopeKind).nullsNotDistinct(),
  index('grant_scope_idx').on(t.cityTenantId, t.todaId, t.userId)]).enableRLS();

export const appSessions = identity.table('app_sessions', {
  id: id(), userId: uuid('user_id').notNull().references(() => appUsers.id), identityId: uuid('identity_id').notNull(), identityKind: text('identity_kind').notNull(),
  clientPurpose: text('client_purpose').notNull(), state: text('state').default('PREAUTH').notNull(),
  authVersion: integer('auth_version').notNull(), version: version(), authenticatedAt: time('authenticated_at').notNull(),
  mfaVerifiedAt: time('mfa_verified_at'), lastSeenAt: time('last_seen_at').defaultNow().notNull(),
  expiresAt: time('expires_at').notNull(), revokedAt: time('revoked_at'), createdAt: created(),
}, t => [foreignKey({ name: 'session_identity_user', columns: [t.identityId, t.userId, t.identityKind], foreignColumns: [authIdentities.id, authIdentities.userId, authIdentities.kind] }),
  unique('session_user_id').on(t.id, t.userId), unique('session_purpose_id').on(t.id, t.clientPurpose),
  check('session_purpose', sql`(${t.clientPurpose} IN ('PASSENGER','DRIVER') AND ${t.identityKind} = 'PHONE_OTP') OR (${t.clientPurpose} = 'ADMIN' AND ${t.identityKind} = 'KEYCLOAK')`),
  check('session_state', sql`${t.state} IN ('PREAUTH','CONSENT_REQUIRED','ACTIVE','REVOKED','EXPIRED')`),
  check('session_admin_mfa', sql`${t.clientPurpose} <> 'ADMIN' OR ${t.state} <> 'ACTIVE' OR ${t.mfaVerifiedAt} IS NOT NULL`),
  check('session_window', sql`${t.expiresAt} > ${t.authenticatedAt} AND ${t.authVersion} > 0 AND ${t.version} > 0 AND (${t.mfaVerifiedAt} IS NULL OR (${t.mfaVerifiedAt} >= ${t.authenticatedAt} AND ${t.mfaVerifiedAt} <= ${t.lastSeenAt}))`),
  check('session_revoked', sql`(${t.state} = 'REVOKED') = (${t.revokedAt} IS NOT NULL)`), index('session_user_idx').on(t.userId, t.clientPurpose, t.state)]).enableRLS();

export const refreshCredentials = identity.table('refresh_credentials', {
  id: id(), sessionId: uuid('session_id').notNull().references(() => appSessions.id), generation: integer('generation').notNull(),
  digest: text('digest').notNull().unique(), keyId: text('key_id').notNull(),
  expiresAt: time('expires_at').notNull(), usedAt: time('used_at'), revokedAt: time('revoked_at'), createdAt: created(),
}, t => [unique('refresh_generation').on(t.sessionId, t.generation),
  check('refresh_values', sql`${t.generation} >= 0 AND ${t.digest} ~ '^[0-9a-f]{64}$' AND ${t.keyId} ~ '^[A-Za-z0-9_-]{1,32}$' AND ${t.expiresAt} > ${t.createdAt}`)]);

export const otpChallengeMetadata = identity.table('otp_challenge_metadata', {
  id: id(), purpose: text('purpose').notNull(), destinationDigest: text('destination_digest').notNull(), keyId: text('key_id').notNull(),
  bindingDigest: text('binding_digest').notNull(), state: text('state').default('PREPARED').notNull(),
  expiresAt: time('expires_at').notNull(), resendAfter: time('resend_after').notNull(), version: version(), createdAt: created(),
}, t => [unique('challenge_purpose_id').on(t.id, t.purpose),
  check('challenge_purpose', sql`${t.purpose} IN ('PASSENGER','DRIVER')`),
  check('challenge_state', sql`${t.state} IN ('PREPARED','SENDING','SENT','UNKNOWN','REDEEMED','FAILED','EXPIRED','SUPERSEDED')`),
  check('challenge_digests', sql`${t.destinationDigest} ~ '^[0-9a-f]{64}$' AND ${t.bindingDigest} ~ '^[0-9a-f]{64}$' AND ${t.keyId} ~ '^[A-Za-z0-9_-]{1,32}$'`),
  check('challenge_window', sql`${t.expiresAt} > ${t.createdAt} AND ${t.expiresAt} <= ${t.createdAt} + interval '5 minutes' AND ${t.resendAfter} >= ${t.createdAt} + interval '60 seconds' AND ${t.version} > 0`),
  index('challenge_destination_idx').on(t.keyId, t.destinationDigest, t.createdAt)]);

export const otpRedemptions = identity.table('otp_redemptions', {
  id: id(), challengeId: uuid('challenge_id').notNull().unique(), purpose: text('purpose').notNull(),
  userId: uuid('user_id').notNull().references(() => appUsers.id), sessionId: uuid('session_id').notNull().unique(),
  receiptDigest: text('receipt_digest').notNull().unique(), acceptedAt: time('accepted_at').defaultNow().notNull(),
}, t => [foreignKey({ name: 'redemption_challenge', columns: [t.challengeId, t.purpose], foreignColumns: [otpChallengeMetadata.id, otpChallengeMetadata.purpose] }),
  foreignKey({ name: 'redemption_session_user', columns: [t.sessionId, t.userId], foreignColumns: [appSessions.id, appSessions.userId] }),
  foreignKey({ name: 'redemption_session_purpose', columns: [t.sessionId, t.purpose], foreignColumns: [appSessions.id, appSessions.clientPurpose] }),
  check('redemption_digest', sql`${t.receiptDigest} ~ '^[0-9a-f]{64}$'`)]);

export const accountConsents = identity.table('account_consents', {
  id: id(), userId: uuid('user_id').notNull().references(() => appUsers.id), purpose: text('purpose').notNull(),
  documentCode: text('document_code').notNull(), documentVersion: text('document_version').notNull(),
  decision: text('decision').notNull(), recordedAt: time('recorded_at').defaultNow().notNull(),
}, t => [unique('consent_version_decision').on(t.userId, t.purpose, t.documentCode, t.documentVersion, t.decision),
  check('consent_purpose', sql`${t.purpose} IN ('PASSENGER','DRIVER')`),
  check('consent_decision', sql`${t.decision} IN ('ACKNOWLEDGED','ACCEPTED','WITHDRAWN')`)]).enableRLS();

export const administrativeIdentityMappings = identity.table('administrative_identity_mappings', {
  id: id(), identityId: uuid('identity_id').notNull().unique(), userId: uuid('user_id').notNull(),
  identityKind: text('identity_kind').default('KEYCLOAK').notNull(),
  approvedBy: uuid('approved_by').notNull().references(() => appUsers.id),
  approvalReference: uuid('approval_reference').notNull(), state: text('state').default('PENDING').notNull(), createdAt: created(),
}, t => [foreignKey({ name: 'admin_identity_user', columns: [t.identityId, t.userId, t.identityKind], foreignColumns: [authIdentities.id, authIdentities.userId, authIdentities.kind] }),
  check('admin_mapping_kind', sql`${t.identityKind} = 'KEYCLOAK'`),
  check('admin_mapping_state', sql`${t.state} IN ('PENDING','APPROVED','REVOKED')`),
  check('admin_mapping_no_self', sql`${t.approvedBy} <> ${t.userId}`)]);

export const auditEvents = identity.table('audit_events', {
  id: id(), actorUserId: uuid('actor_user_id').references(() => appUsers.id), actorSessionId: uuid('actor_session_id'),
  cityTenantId: uuid('city_tenant_id').references(() => cityTenants.id), todaId: uuid('toda_id'),
  action: text('action').notNull(), resourceId: uuid('resource_id').notNull(), outcome: text('outcome').notNull(),
  reasonCode: text('reason_code').notNull(), traceId: uuid('trace_id').notNull(), createdAt: created(),
}, t => [foreignKey({ name: 'audit_actor_session', columns: [t.actorSessionId, t.actorUserId], foreignColumns: [appSessions.id, appSessions.userId] }),
  foreignKey({ name: 'audit_toda_city', columns: [t.cityTenantId, t.todaId], foreignColumns: [todaOrganizations.cityTenantId, todaOrganizations.id] }),
  check('audit_scope', sql`${t.todaId} IS NULL OR ${t.cityTenantId} IS NOT NULL`),
  check('audit_actor', sql`${t.actorSessionId} IS NULL OR ${t.actorUserId} IS NOT NULL`),
  check('audit_codes', sql`${t.action} ~ '^[a-z][a-z0-9_.]{1,63}$' AND ${t.reasonCode} ~ '^[A-Z][A-Z0-9_]{1,63}$' AND ${t.outcome} IN ('ALLOWED','DENIED','COMPLETED')`),
  index('audit_scope_time_idx').on(t.cityTenantId, t.todaId, t.createdAt)]);

export const outboxEvents = identity.table('outbox_events', {
  id: id(), auditEventId: uuid('audit_event_id').notNull().unique().references(() => auditEvents.id),
  aggregateId: uuid('aggregate_id').notNull(), eventType: text('event_type').notNull(),
  eventVersion: integer('event_version').default(1).notNull(), state: text('state').default('PENDING').notNull(),
  attempts: integer('attempts').default(0).notNull(), availableAt: time('available_at').defaultNow().notNull(), createdAt: created(),
}, t => [check('outbox_state', sql`${t.state} IN ('PENDING','DELIVERED','DEAD_LETTER')`),
  check('outbox_values', sql`${t.attempts} >= 0 AND ${t.eventVersion} > 0 AND ${t.eventType} ~ '^[a-z][a-z0-9_.]{1,63}$'`),
  index('outbox_delivery_idx').on(t.state, t.availableAt)]);
