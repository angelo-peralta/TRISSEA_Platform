import { sql } from 'drizzle-orm';
import { uuid,text,timestamp,integer,primaryKey,check,index,foreignKey } from 'drizzle-orm/pg-core';
import { identity,appUsers,appSessions,otpChallengeMetadata } from './identity-schema';
const time=(name:string)=>timestamp(name,{withTimezone:true});
export const phoneRequestBindings=identity.table('phone_request_bindings',{
  challengeId:uuid('challenge_id').primaryKey(),
  requestKeyDigest:text('request_key_digest').notNull().unique(),requestDigest:text('request_digest').notNull(),
  ipDigest:text('ip_digest').notNull(),deviceDigest:text('device_digest').notNull(),keyId:text('key_id').notNull(),createdAt:time('created_at').defaultNow().notNull(),
},t=>[foreignKey({name:'phone_request_bindings_challenge_id_fkey',columns:[t.challengeId],foreignColumns:[otpChallengeMetadata.id]}),check('phone_request_digests',sql`${t.requestKeyDigest} ~ '^[0-9a-f]{64}$' AND ${t.requestDigest} ~ '^[0-9a-f]{64}$' AND ${t.ipDigest} ~ '^[0-9a-f]{64}$' AND ${t.deviceDigest} ~ '^[0-9a-f]{64}$'`),
  index('phone_ip_budget_idx').on(t.ipDigest,t.createdAt),index('phone_device_budget_idx').on(t.deviceDigest,t.createdAt)]);
export const mobileSessionBindings=identity.table('mobile_session_bindings',{
  sessionId:uuid('session_id').primaryKey(),userId:uuid('user_id').notNull(),purpose:text('purpose').notNull(),
  bindingDigest:text('binding_digest').notNull(),keyId:text('key_id').notNull(),expiresAt:time('expires_at').notNull(),createdAt:time('created_at').defaultNow().notNull(),
},t=>[foreignKey({name:'mobile_binding_session_user',columns:[t.sessionId,t.userId],foreignColumns:[appSessions.id,appSessions.userId]}),
  foreignKey({name:'mobile_binding_session_purpose',columns:[t.sessionId,t.purpose],foreignColumns:[appSessions.id,appSessions.clientPurpose]}),
  check('mobile_binding_values',sql`${t.purpose} IN ('PASSENGER','DRIVER') AND ${t.bindingDigest} ~ '^[0-9a-f]{64}$' AND ${t.expiresAt} > ${t.createdAt}`)]);
export const authOperationResults=identity.table('auth_operation_results',{
  scopeId:uuid('scope_id').notNull(),operation:text('operation').notNull(),idempotencyDigest:text('idempotency_digest').notNull(),
  requestDigest:text('request_digest').notNull(),bindingDigest:text('binding_digest').notNull(),resultCiphertext:text('result_ciphertext').notNull(),
  expiresAt:time('expires_at').notNull(),createdAt:time('created_at').defaultNow().notNull(),
},t=>[primaryKey({columns:[t.scopeId,t.operation,t.idempotencyDigest]}),
  check('auth_result_values',sql`${t.operation} IN ('VERIFY','REFRESH') AND ${t.idempotencyDigest} ~ '^[0-9a-f]{64}$' AND ${t.requestDigest} ~ '^[0-9a-f]{64}$' AND ${t.bindingDigest} ~ '^[0-9a-f]{64}$' AND ${t.resultCiphertext} LIKE 'v1.%'`),
  check('auth_result_window',sql`${t.expiresAt} > ${t.createdAt} AND ${t.expiresAt} <= ${t.createdAt}+interval '30 seconds'`),index('auth_result_expiry_idx').on(t.expiresAt)]);
export const passengerProfiles=identity.table('passenger_profiles',{
  userId:uuid('user_id').primaryKey(),displayNameCiphertext:text('display_name_ciphertext'),keyId:text('key_id'),mutationDigest:text('mutation_digest'),
  version:integer('version').default(1).notNull(),updatedAt:time('updated_at').defaultNow().notNull(),
},t=>[foreignKey({name:'passenger_profiles_user_id_fkey',columns:[t.userId],foreignColumns:[appUsers.id]}),check('passenger_profile_values',sql`${t.version}>0 AND (${t.mutationDigest} IS NULL OR ${t.mutationDigest} ~ '^[0-9a-f]{64}$') AND ((${t.displayNameCiphertext} IS NULL AND ${t.keyId} IS NULL) OR (${t.displayNameCiphertext} IS NOT NULL AND ${t.keyId} IS NOT NULL AND ${t.keyId} ~ '^[A-Za-z0-9_-]{1,32}$' AND ${t.displayNameCiphertext} LIKE 'v1.'||${t.keyId}||'.%' AND ${t.displayNameCiphertext} ~ '^v1[.][A-Za-z0-9_-]{1,32}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$'))`)]).enableRLS();
