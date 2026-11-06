import { sql } from 'drizzle-orm';
import { uuid,text,integer,timestamp,primaryKey,unique,foreignKey,check,index } from 'drizzle-orm/pg-core';
import { identity,appUsers,todaOrganizations } from './identity-schema';
const time=(name:string)=>timestamp(name,{withTimezone:true});
const id=()=>uuid('id').primaryKey().defaultRandom();
const version=()=>integer('version').default(1).notNull();
const created=()=>time('created_at').defaultNow().notNull();
const source=()=>text('source').default('SYNTHETIC_ONLY').notNull();
export const driverProfiles=identity.table('driver_profiles',{
 userId:uuid('user_id').primaryKey(),state:text('state').default('PENDING').notNull(),version:version(),
 verificationReference:uuid('verification_reference'),validUntil:time('valid_until'),source:source(),createdAt:created(),
},t=>[foreignKey({name:'driver_profile_user',columns:[t.userId],foreignColumns:[appUsers.id]}),
 check('driver_profile_values',sql`${t.state} IN ('PENDING','VERIFIED','REJECTED','SUSPENDED','REVOKED','EXPIRED') AND ${t.version}>0 AND ${t.source}='SYNTHETIC_ONLY' AND (${t.state}<>'VERIFIED' OR (${t.verificationReference} IS NOT NULL AND ${t.validUntil} IS NOT NULL))`)]).enableRLS();
export const driverIntakeScopes=identity.table('driver_intake_scopes',{
 cityTenantId:uuid('city_tenant_id').notNull(),todaId:uuid('toda_id').notNull(),state:text('state').default('CLOSED').notNull(),
 policyReference:uuid('policy_reference').notNull(),version:version(),source:source(),createdAt:created(),
 cityLabel:text('city_label').notNull(),todaLabel:text('toda_label').notNull(),
},t=>[primaryKey({columns:[t.cityTenantId,t.todaId]}),foreignKey({name:'driver_intake_toda',columns:[t.cityTenantId,t.todaId],foreignColumns:[todaOrganizations.cityTenantId,todaOrganizations.id]}),
 check('driver_intake_values',sql`${t.state} IN ('OPEN','CLOSED') AND ${t.version}>0 AND ${t.source}='SYNTHETIC_ONLY' AND ${t.cityLabel} ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$' AND ${t.todaLabel} ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$'`)]).enableRLS();
export const driverTodaAffiliations=identity.table('driver_toda_affiliations',{
 id:id(),userId:uuid('user_id').notNull(),cityTenantId:uuid('city_tenant_id').notNull(),todaId:uuid('toda_id').notNull(),
 state:text('state').default('PENDING').notNull(),version:version(),verificationReference:uuid('verification_reference'),validUntil:time('valid_until'),source:source(),createdAt:created(),
},t=>[foreignKey({name:'driver_affiliation_profile',columns:[t.userId],foreignColumns:[driverProfiles.userId]}),
 foreignKey({name:'driver_affiliation_scope',columns:[t.cityTenantId,t.todaId],foreignColumns:[driverIntakeScopes.cityTenantId,driverIntakeScopes.todaId]}),
 unique('driver_affiliation_binding').on(t.id,t.userId,t.cityTenantId,t.todaId),unique('driver_affiliation_once').on(t.userId,t.cityTenantId,t.todaId),
 check('driver_affiliation_values',sql`${t.state} IN ('PENDING','VERIFIED','REJECTED','SUSPENDED','REVOKED','EXPIRED') AND ${t.version}>0 AND ${t.source}='SYNTHETIC_ONLY' AND (${t.state}<>'VERIFIED' OR (${t.verificationReference} IS NOT NULL AND ${t.validUntil} IS NOT NULL))`),
 index('driver_affiliation_queue_idx').on(t.cityTenantId,t.todaId,t.state)]).enableRLS();
export const driverSyntheticVehicles=identity.table('driver_synthetic_vehicles',{
 id:id(),cityTenantId:uuid('city_tenant_id').notNull(),todaId:uuid('toda_id').notNull(),referenceCode:text('reference_code').notNull(),
 state:text('state').default('PENDING').notNull(),seatCapacity:integer('seat_capacity'),version:version(),verificationReference:uuid('verification_reference'),validUntil:time('valid_until'),source:source(),createdAt:created(),
},t=>[foreignKey({name:'driver_vehicle_scope',columns:[t.cityTenantId,t.todaId],foreignColumns:[driverIntakeScopes.cityTenantId,driverIntakeScopes.todaId]}),
 unique('driver_vehicle_binding').on(t.id,t.cityTenantId,t.todaId),unique('driver_vehicle_reference').on(t.cityTenantId,t.todaId,t.referenceCode),
 check('driver_vehicle_values',sql`${t.state} IN ('PENDING','VERIFIED','SUSPENDED','REVOKED','EXPIRED') AND ${t.version}>0 AND ${t.source}='SYNTHETIC_ONLY' AND ${t.referenceCode} ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$' AND (${t.seatCapacity} IS NULL OR ${t.seatCapacity}>0) AND (${t.state}<>'VERIFIED' OR (${t.verificationReference} IS NOT NULL AND ${t.validUntil} IS NOT NULL AND ${t.seatCapacity} IS NOT NULL))`)]).enableRLS();
export const driverVehicleRelationships=identity.table('driver_vehicle_relationships',{
 id:id(),userId:uuid('user_id').notNull(),cityTenantId:uuid('city_tenant_id').notNull(),todaId:uuid('toda_id').notNull(),affiliationId:uuid('affiliation_id').notNull(),vehicleId:uuid('vehicle_id').notNull(),
 state:text('state').default('PENDING').notNull(),version:version(),verificationReference:uuid('verification_reference'),validUntil:time('valid_until'),source:source(),createdAt:created(),
},t=>[foreignKey({name:'driver_relationship_affiliation',columns:[t.affiliationId,t.userId,t.cityTenantId,t.todaId],foreignColumns:[driverTodaAffiliations.id,driverTodaAffiliations.userId,driverTodaAffiliations.cityTenantId,driverTodaAffiliations.todaId]}),
 foreignKey({name:'driver_relationship_vehicle',columns:[t.vehicleId,t.cityTenantId,t.todaId],foreignColumns:[driverSyntheticVehicles.id,driverSyntheticVehicles.cityTenantId,driverSyntheticVehicles.todaId]}),
 unique('driver_relationship_binding').on(t.id,t.userId,t.cityTenantId,t.todaId),unique('driver_relationship_once').on(t.userId,t.cityTenantId,t.todaId,t.vehicleId),
 check('driver_relationship_values',sql`${t.state} IN ('PENDING','VERIFIED','REJECTED','SUSPENDED','REVOKED','EXPIRED') AND ${t.version}>0 AND ${t.source}='SYNTHETIC_ONLY' AND (${t.state}<>'VERIFIED' OR (${t.verificationReference} IS NOT NULL AND ${t.validUntil} IS NOT NULL))`)]).enableRLS();
// Constrained test-only eligibility handoff; real evidence/case decisions are M2.6.
export const driverScopeAssertions=identity.table('driver_scope_assertions',{
 userId:uuid('user_id').notNull(),cityTenantId:uuid('city_tenant_id').notNull(),todaId:uuid('toda_id').notNull(),relationshipId:uuid('relationship_id').notNull(),
 profileVersion:integer('profile_version').notNull(),affiliationVersion:integer('affiliation_version').notNull(),vehicleVersion:integer('vehicle_version').notNull(),relationshipVersion:integer('relationship_version').notNull(),intakeVersion:integer('intake_version').notNull(),
 permitReference:uuid('permit_reference').notNull(),policyReference:uuid('policy_reference').notNull(),policyVersion:integer('policy_version').notNull(),
 effectiveFrom:time('effective_from').notNull(),expiresAt:time('expires_at').notNull(),revokedAt:time('revoked_at'),version:version(),source:source(),createdAt:created(),
},t=>[primaryKey({columns:[t.userId,t.cityTenantId,t.todaId]}),
 foreignKey({name:'driver_assertion_relationship',columns:[t.relationshipId,t.userId,t.cityTenantId,t.todaId],foreignColumns:[driverVehicleRelationships.id,driverVehicleRelationships.userId,driverVehicleRelationships.cityTenantId,driverVehicleRelationships.todaId]}),
 check('driver_assertion_values',sql`${t.profileVersion}>0 AND ${t.affiliationVersion}>0 AND ${t.vehicleVersion}>0 AND ${t.relationshipVersion}>0 AND ${t.intakeVersion}>0 AND ${t.policyVersion}>0 AND ${t.version}>0 AND ${t.source}='SYNTHETIC_ONLY' AND ${t.expiresAt}>${t.effectiveFrom} AND (${t.revokedAt} IS NULL OR ${t.revokedAt}>=${t.createdAt})`)]).enableRLS();
export const driverRequestReceipts=identity.table('driver_request_receipts',{
 userId:uuid('user_id').notNull(),operation:text('operation').notNull(),keyDigest:text('key_digest').notNull(),requestDigest:text('request_digest').notNull(),resourceId:uuid('resource_id').notNull(),createdAt:created(),
},t=>[primaryKey({columns:[t.userId,t.operation,t.keyDigest]}),foreignKey({name:'driver_receipt_user',columns:[t.userId],foreignColumns:[appUsers.id]}),
 check('driver_receipt_values',sql`${t.operation} IN ('AFFILIATION','VEHICLE') AND ${t.keyDigest} ~ '^[0-9a-f]{64}$' AND ${t.requestDigest} ~ '^[0-9a-f]{64}$'`)]).enableRLS();
