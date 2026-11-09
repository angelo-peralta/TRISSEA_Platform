import {sql} from 'drizzle-orm';
import {uuid,text,integer,timestamp,primaryKey,unique,foreignKey,check,index,uniqueIndex} from 'drizzle-orm/pg-core';
import {identity,appUsers,appSessions,cityMemberships} from './identity-schema';
import {driverProfiles,driverTodaAffiliations,driverSyntheticVehicles,driverVehicleRelationships} from './driver-schema';
const time=(name:string)=>timestamp(name,{withTimezone:true});
const created=()=>time('created_at').notNull().defaultNow();
const source=()=>text('source').notNull().default('SYNTHETIC_ONLY');
const binding=()=>({userId:uuid('user_id').notNull(),cityTenantId:uuid('city_tenant_id').notNull(),todaId:uuid('toda_id').notNull(),relationshipId:uuid('relationship_id').notNull(),kind:text('kind').notNull()});
// Internal projection counts; runtime roles cannot read or maintain these rows.
export const verificationProjectionVersions=identity.table('verification_projection_versions',{
 id:uuid('id').primaryKey().defaultRandom(),profileUserId:uuid('profile_user_id'),affiliationId:uuid('affiliation_id'),vehicleId:uuid('vehicle_id'),relationshipId:uuid('relationship_id'),
 projectionCount:integer('projection_count').notNull().default(1),source:source(),createdAt:created(),
},t=>[foreignKey({name:'verification_projection_profile',columns:[t.profileUserId],foreignColumns:[driverProfiles.userId]}),
 foreignKey({name:'verification_projection_affiliation',columns:[t.affiliationId],foreignColumns:[driverTodaAffiliations.id]}),
 foreignKey({name:'verification_projection_vehicle',columns:[t.vehicleId],foreignColumns:[driverSyntheticVehicles.id]}),
 foreignKey({name:'verification_projection_relationship',columns:[t.relationshipId],foreignColumns:[driverVehicleRelationships.id]}),
 unique('verification_projection_profile_once').on(t.profileUserId),unique('verification_projection_affiliation_once').on(t.affiliationId),
 unique('verification_projection_vehicle_once').on(t.vehicleId),unique('verification_projection_relationship_once').on(t.relationshipId),
 check('verification_projection_values',sql`num_nonnulls(${t.profileUserId},${t.affiliationId},${t.vehicleId},${t.relationshipId})=1 AND ${t.projectionCount}>0 AND ${t.source}='SYNTHETIC_ONLY'`)]).enableRLS();
export const verificationEvidenceHeads=identity.table('verification_evidence_heads',{
 id:uuid('id').primaryKey().defaultRandom(),...binding(),currentVersion:integer('current_version').notNull(),source:source(),createdAt:created(),
},t=>[foreignKey({name:'verification_head_relationship',columns:[t.relationshipId,t.userId,t.cityTenantId,t.todaId],foreignColumns:[driverVehicleRelationships.id,driverVehicleRelationships.userId,driverVehicleRelationships.cityTenantId,driverVehicleRelationships.todaId]}),
 unique('verification_head_binding').on(t.id,t.userId,t.cityTenantId,t.todaId,t.relationshipId,t.kind),
 check('verification_head_values',sql`${t.kind} IN ('DRIVER','VEHICLE','TODA_MEMBERSHIP') AND ${t.currentVersion}>0 AND ${t.source}='SYNTHETIC_ONLY'`)]).enableRLS();
export const verificationEvidenceVersions=identity.table('verification_evidence_versions',{
 evidenceId:uuid('evidence_id').notNull(),evidenceVersion:integer('evidence_version').notNull(),digest:text('digest').notNull(),referenceCode:text('reference_code').notNull(),seatCapacity:integer('seat_capacity'),validUntil:time('valid_until').notNull(),source:source(),createdAt:created(),
},t=>[primaryKey({columns:[t.evidenceId,t.evidenceVersion]}),foreignKey({name:'verification_evidence_head',columns:[t.evidenceId],foreignColumns:[verificationEvidenceHeads.id]}),
 check('verification_evidence_values',sql`${t.evidenceVersion}>0 AND ${t.digest} ~ '^[0-9a-f]{64}$' AND ${t.referenceCode} ~ '^SYNTHETIC_[A-Z0-9_]{1,32}$' AND (${t.seatCapacity} IS NULL OR ${t.seatCapacity}>0) AND ${t.validUntil}>${t.createdAt} AND ${t.source}='SYNTHETIC_ONLY'`)]).enableRLS();
export const verificationCases=identity.table('verification_cases',{
 id:uuid('id').primaryKey().defaultRandom(),...binding(),state:text('state').notNull().default('DRAFT'),version:integer('version').notNull().default(1),currentRound:integer('current_round').notNull().default(0),assignmentVersion:integer('assignment_version'),lastDecisionId:uuid('last_decision_id'),validUntil:time('valid_until'),source:source(),createdAt:created(),
},t=>[foreignKey({name:'verification_case_relationship',columns:[t.relationshipId,t.userId,t.cityTenantId,t.todaId],foreignColumns:[driverVehicleRelationships.id,driverVehicleRelationships.userId,driverVehicleRelationships.cityTenantId,driverVehicleRelationships.todaId]}),
 unique('verification_case_once').on(t.userId,t.cityTenantId,t.todaId,t.relationshipId,t.kind),unique('verification_case_binding').on(t.id,t.userId,t.cityTenantId,t.todaId,t.relationshipId,t.kind),
 check('verification_case_values',sql`${t.kind} IN ('DRIVER','VEHICLE','TODA_MEMBERSHIP') AND ${t.state} IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','REVOKED','EXPIRED') AND ${t.version}>0 AND ${t.currentRound}>=0 AND (${t.assignmentVersion} IS NULL OR ${t.assignmentVersion}>0) AND (${t.state}<>'DRAFT' OR ${t.currentRound}=0) AND (${t.state}='DRAFT' OR ${t.currentRound}>0) AND (${t.state} NOT IN ('APPROVED','REVOKED','EXPIRED') OR (${t.lastDecisionId} IS NOT NULL AND ${t.validUntil} IS NOT NULL)) AND ${t.source}='SYNTHETIC_ONLY'`),
 index('verification_case_queue_idx').on(t.cityTenantId,t.todaId,t.kind,t.state,t.id)]).enableRLS();
export const verificationSubmissions=identity.table('verification_submissions',{
 caseId:uuid('case_id').notNull(),round:integer('round').notNull(),...binding(),evidenceId:uuid('evidence_id').notNull(),evidenceVersion:integer('evidence_version').notNull(),profileVersion:integer('profile_version').notNull(),affiliationVersion:integer('affiliation_version').notNull(),vehicleVersion:integer('vehicle_version').notNull(),relationshipVersion:integer('relationship_version').notNull(),intakeVersion:integer('intake_version').notNull(),policyReference:uuid('policy_reference').notNull(),source:source(),createdAt:created(),
},t=>[primaryKey({columns:[t.caseId,t.round]}),foreignKey({name:'verification_submission_case',columns:[t.caseId,t.userId,t.cityTenantId,t.todaId,t.relationshipId,t.kind],foreignColumns:[verificationCases.id,verificationCases.userId,verificationCases.cityTenantId,verificationCases.todaId,verificationCases.relationshipId,verificationCases.kind]}),
 foreignKey({name:'verification_submission_head',columns:[t.evidenceId,t.userId,t.cityTenantId,t.todaId,t.relationshipId,t.kind],foreignColumns:[verificationEvidenceHeads.id,verificationEvidenceHeads.userId,verificationEvidenceHeads.cityTenantId,verificationEvidenceHeads.todaId,verificationEvidenceHeads.relationshipId,verificationEvidenceHeads.kind]}),
 foreignKey({name:'verification_submission_evidence',columns:[t.evidenceId,t.evidenceVersion],foreignColumns:[verificationEvidenceVersions.evidenceId,verificationEvidenceVersions.evidenceVersion]}),
 check('verification_submission_values',sql`${t.round}>0 AND ${t.evidenceVersion}>0 AND ${t.profileVersion}>0 AND ${t.affiliationVersion}>0 AND ${t.vehicleVersion}>0 AND ${t.relationshipVersion}>0 AND ${t.intakeVersion}>0 AND ${t.source}='SYNTHETIC_ONLY'`)]).enableRLS();
export const verificationAssignments=identity.table('verification_assignments',{
 caseId:uuid('case_id').notNull(),assignmentVersion:integer('assignment_version').notNull(),...binding(),reviewerUserId:uuid('reviewer_user_id').notNull(),assignedBy:uuid('assigned_by').notNull(),source:source(),createdAt:created(),
},t=>[primaryKey({columns:[t.caseId,t.assignmentVersion]}),foreignKey({name:'verification_assignment_case',columns:[t.caseId,t.userId,t.cityTenantId,t.todaId,t.relationshipId,t.kind],foreignColumns:[verificationCases.id,verificationCases.userId,verificationCases.cityTenantId,verificationCases.todaId,verificationCases.relationshipId,verificationCases.kind]}),
 foreignKey({name:'verification_assignment_reviewer',columns:[t.reviewerUserId],foreignColumns:[appUsers.id]}),foreignKey({name:'verification_assignment_authority',columns:[t.assignedBy],foreignColumns:[appUsers.id]}),
 foreignKey({name:'verification_assignment_city',columns:[t.reviewerUserId,t.cityTenantId],foreignColumns:[cityMemberships.userId,cityMemberships.cityTenantId]}),
 check('verification_assignment_values',sql`${t.assignmentVersion}>0 AND ${t.reviewerUserId}<>${t.userId} AND ${t.assignedBy}<>${t.userId} AND ${t.assignedBy}<>${t.reviewerUserId} AND ${t.source}='SYNTHETIC_ONLY'`),index('verification_reviewer_queue_idx').on(t.reviewerUserId,t.caseId)]).enableRLS();
export const verificationDecisions=identity.table('verification_decisions',{
 id:uuid('id').primaryKey().defaultRandom(),caseId:uuid('case_id').notNull(),round:integer('round').notNull(),expectedVersion:integer('expected_version').notNull(),evidenceVersion:integer('evidence_version').notNull(),actorUserId:uuid('actor_user_id').notNull(),actorSessionId:uuid('actor_session_id').notNull(),outcome:text('outcome').notNull(),reasonCode:text('reason_code').notNull(),previousDecisionId:uuid('previous_decision_id'),validUntil:time('valid_until'),source:source(),createdAt:created(),
},t=>[foreignKey({name:'verification_decision_submission',columns:[t.caseId,t.round],foreignColumns:[verificationSubmissions.caseId,verificationSubmissions.round]}),
 foreignKey({name:'verification_decision_actor',columns:[t.actorSessionId,t.actorUserId],foreignColumns:[appSessions.id,appSessions.userId]}),
 check('verification_decision_values',sql`${t.round}>0 AND ${t.expectedVersion}>0 AND ${t.evidenceVersion}>0 AND ${t.outcome} IN ('APPROVE','REJECT','REVOKE','EXPIRE') AND ${t.reasonCode} IN ('SYNTHETIC_ACCEPTED','SYNTHETIC_INCOMPLETE','SYNTHETIC_MISMATCH','SYNTHETIC_WITHDRAWN','SYNTHETIC_EXPIRED') AND (${t.outcome} NOT IN ('APPROVE','REVOKE','EXPIRE') OR ${t.validUntil} IS NOT NULL) AND ${t.source}='SYNTHETIC_ONLY'`),
 uniqueIndex('verification_initial_decision_once').on(t.caseId,t.round).where(sql`${t.outcome} IN ('APPROVE','REJECT')`),uniqueIndex('verification_terminal_decision_once').on(t.caseId,t.round).where(sql`${t.outcome} IN ('REVOKE','EXPIRE')`)]).enableRLS();
export const verificationReceipts=identity.table('verification_receipts',{
 actorUserId:uuid('actor_user_id').notNull(),operation:text('operation').notNull(),keyDigest:text('key_digest').notNull(),requestDigest:text('request_digest').notNull(),caseId:uuid('case_id').notNull(),responseCiphertext:text('response_ciphertext').notNull(),createdAt:created(),
},t=>[primaryKey({columns:[t.actorUserId,t.operation,t.keyDigest]}),foreignKey({name:'verification_receipt_actor',columns:[t.actorUserId],foreignColumns:[appUsers.id]}),foreignKey({name:'verification_receipt_case',columns:[t.caseId],foreignColumns:[verificationCases.id]}),check('verification_receipt_values',sql`${t.operation} IN ('OPEN','SUBMIT','DECISION') AND ${t.keyDigest} ~ '^[0-9a-f]{64}$' AND ${t.requestDigest} ~ '^[0-9a-f]{64}$' AND ${t.responseCiphertext} LIKE 'v1.%'`)]).enableRLS();
