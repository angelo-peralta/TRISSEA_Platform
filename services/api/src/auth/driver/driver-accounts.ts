import { ForbiddenException } from '@nestjs/common';
import { and,eq,sql } from 'drizzle-orm';
import * as b from '../../database/identity-schema';
import * as d from '../../database/driver-schema';
import { authAudit,authNow,type AuthTransaction } from '../passenger/passenger-database';
import { PassengerSettings,PassengerSecrets } from '../passenger/passenger-settings';
import { PassengerProfiles } from '../passenger/passenger-profiles';
import { hasPassengerConsent } from '../passenger/passenger-sessions';
import { PhoneAuthError,equalDigest,idempotency,objectInput,uuid } from '../passenger/primitives';
import { evaluateDriverEligibility,type DriverEligibilityFacts } from './driver-eligibility';
export class DriverAccounts {
 private verification?:{current(tx:AuthTransaction,userId:string,cityTenantId:string,todaId:string,relationshipId:string):Promise<boolean>};
 useVerificationEvidence(port:NonNullable<DriverAccounts['verification']>){this.verification=port;}
 constructor(readonly secrets:PassengerSecrets,readonly settings:PassengerSettings,readonly sharedProfiles:PassengerProfiles){}
 async me(tx:AuthTransaction,userId:string,sessionId:string){
  const [row]=await tx.select().from(d.driverProfiles).where(eq(d.driverProfiles.userId,userId));if(!row)throw new PhoneAuthError('AUTH_FAILED');
  return {userId,sessionId,clientPurpose:'DRIVER' as const,state:await hasPassengerConsent(tx,userId,this.settings,'DRIVER')?'ACTIVE' as const:'CONSENT_REQUIRED' as const,
   driverStatus:row.state,profileVersion:row.version,requiredNoticeVersion:this.settings.noticeVersion,requiredTermsVersion:this.settings.termsVersion,
   canGoOnline:false as const,operationalServicesEnabled:false as const,realDocumentsEnabled:false as const,environment:'LOCAL_SYNTHETIC' as const};
 }
 async consent(tx:AuthTransaction,userId:string,sessionId:string,body:unknown,key:unknown){
  await this.sharedProfiles.recordConsent(tx,userId,sessionId,body,key,'DRIVER');return this.me(tx,userId,sessionId);
 }
 private async lock(tx:AuthTransaction,userId:string,cityTenantId:string|null=null,todaId:string|null=null){
  await tx.execute(sql`SELECT set_config('trissea.city_tenant_id',${cityTenantId??''},true),set_config('trissea.toda_id',${todaId??''},true)`);
  await tx.execute(sql`SELECT identity.lock_authorization_context(${userId}::uuid,current_setting('trissea.session_id')::uuid,${cityTenantId}::uuid,${todaId}::uuid,NULL)`);
  await tx.execute(sql`SELECT identity.lock_driver_context(${userId}::uuid,${cityTenantId}::uuid,${todaId}::uuid)`);
 }
 private async profileForRequest(tx:AuthTransaction,userId:string){
  await this.lock(tx,userId);
  const [row]=await tx.select().from(d.driverProfiles).where(eq(d.driverProfiles.userId,userId));
  if(!row||!['PENDING','VERIFIED'].includes(row.state)||!await hasPassengerConsent(tx,userId,this.settings,'DRIVER'))throw new ForbiddenException('Driver intake unavailable');return row;
 }
 private async scope(tx:AuthTransaction,userId:string,cityTenantId:unknown,todaId:unknown){
  if(!uuid(cityTenantId)||!uuid(todaId))throw new PhoneAuthError('INVALID_REQUEST');
  await this.lock(tx,userId,cityTenantId,todaId);
  const [row]=await tx.select({intake:d.driverIntakeScopes,city:{id:b.cityTenants.id,state:b.cityTenants.state},toda:{id:b.todaOrganizations.id,state:b.todaOrganizations.state}}).from(d.driverIntakeScopes)
   .innerJoin(b.cityTenants,eq(b.cityTenants.id,d.driverIntakeScopes.cityTenantId))
   .innerJoin(b.todaOrganizations,and(eq(b.todaOrganizations.id,d.driverIntakeScopes.todaId),eq(b.todaOrganizations.cityTenantId,d.driverIntakeScopes.cityTenantId)))
   .where(and(eq(d.driverIntakeScopes.cityTenantId,cityTenantId),eq(d.driverIntakeScopes.todaId,todaId)));
  if(!row||row.intake.state!=='OPEN'||row.city.state!=='ACTIVE'||row.toda.state!=='VERIFIED')throw new ForbiddenException('Driver intake unavailable');return row;
 }
 async options(tx:AuthTransaction,userId:string){
  await this.profileForRequest(tx,userId);
  const rows=await tx.select({cityTenantId:d.driverIntakeScopes.cityTenantId,todaId:d.driverIntakeScopes.todaId,cityName:d.driverIntakeScopes.cityLabel,todaName:d.driverIntakeScopes.todaLabel}).from(d.driverIntakeScopes)
   .innerJoin(b.cityTenants,eq(b.cityTenants.id,d.driverIntakeScopes.cityTenantId))
   .innerJoin(b.todaOrganizations,and(eq(b.todaOrganizations.id,d.driverIntakeScopes.todaId),eq(b.todaOrganizations.cityTenantId,d.driverIntakeScopes.cityTenantId)))
   .where(and(eq(d.driverIntakeScopes.state,'OPEN'),eq(b.cityTenants.state,'ACTIVE'),eq(b.todaOrganizations.state,'VERIFIED'))).orderBy(d.driverIntakeScopes.cityTenantId,d.driverIntakeScopes.todaId).limit(50);
  return {scopes:rows,environment:'LOCAL_SYNTHETIC' as const};
 }
 private requestDigests(userId:string,operation:'AFFILIATION'|'VEHICLE',key:unknown,body:unknown){
  return {keyDigest:this.secrets.coordinate('driver-request-key',userId,operation,idempotency(key)),requestDigest:this.secrets.coordinate('driver-request-body',userId,operation,body)};
 }
 private async receipt(tx:AuthTransaction,userId:string,operation:'AFFILIATION'|'VEHICLE',digests:{keyDigest:string;requestDigest:string}){
  const [row]=await tx.select().from(d.driverRequestReceipts).where(and(eq(d.driverRequestReceipts.userId,userId),eq(d.driverRequestReceipts.operation,operation),eq(d.driverRequestReceipts.keyDigest,digests.keyDigest)));
  if(row&&!equalDigest(row.requestDigest,digests.requestDigest))throw new PhoneAuthError('CONFLICT');return row;
 }
 private affiliationDto(row:typeof d.driverTodaAffiliations.$inferSelect){return {id:row.id,cityTenantId:row.cityTenantId,todaId:row.todaId,state:row.state,version:row.version,validUntil:row.validUntil?.toISOString()??null};}
 private relationshipDto(row:typeof d.driverVehicleRelationships.$inferSelect){return {...this.affiliationDto(row),affiliationId:row.affiliationId,vehicleId:row.vehicleId};}
 async requestAffiliation(tx:AuthTransaction,userId:string,sessionId:string,raw:unknown,key:unknown){
  const input=objectInput(raw,['cityTenantId','todaId']);if(!uuid(input.cityTenantId)||!uuid(input.todaId))throw new PhoneAuthError('INVALID_REQUEST');
  const {cityTenantId,todaId}=input,digests=this.requestDigests(userId,'AFFILIATION',key,[cityTenantId,todaId]);
  const receipt=await this.receipt(tx,userId,'AFFILIATION',digests);
  if(receipt){const [row]=await tx.select().from(d.driverTodaAffiliations).where(and(eq(d.driverTodaAffiliations.id,receipt.resourceId),eq(d.driverTodaAffiliations.userId,userId)));if(!row)throw new PhoneAuthError('CONFLICT');return this.affiliationDto(row);}
  await this.profileForRequest(tx,userId);await this.scope(tx,userId,cityTenantId,todaId);
  await tx.execute(sql`INSERT INTO identity.driver_toda_affiliations(user_id,city_tenant_id,toda_id) VALUES(${userId}::uuid,${cityTenantId}::uuid,${todaId}::uuid) ON CONFLICT DO NOTHING`);
  const [row]=await tx.select().from(d.driverTodaAffiliations).where(and(eq(d.driverTodaAffiliations.userId,userId),eq(d.driverTodaAffiliations.cityTenantId,cityTenantId),eq(d.driverTodaAffiliations.todaId,todaId)));
  if(!row)throw new PhoneAuthError('CONFLICT');
  await tx.insert(d.driverRequestReceipts).values({userId,operation:'AFFILIATION',...digests,resourceId:row.id});await authAudit(tx,'driver.affiliation_requested',row.id,userId,sessionId);return this.affiliationDto(row);
 }
 async vehicles(tx:AuthTransaction,userId:string,cityTenantId:string,todaId:string){
  await this.profileForRequest(tx,userId);await this.scope(tx,userId,cityTenantId,todaId);
  const rows=await tx.select({id:d.driverSyntheticVehicles.id,referenceCode:d.driverSyntheticVehicles.referenceCode}).from(d.driverSyntheticVehicles)
   .where(and(eq(d.driverSyntheticVehicles.cityTenantId,cityTenantId),eq(d.driverSyntheticVehicles.todaId,todaId),sql`${d.driverSyntheticVehicles.state} IN ('PENDING','VERIFIED')`)).orderBy(d.driverSyntheticVehicles.id).limit(50);
  return {vehicles:rows,environment:'LOCAL_SYNTHETIC' as const};
 }
 async requestVehicle(tx:AuthTransaction,userId:string,sessionId:string,raw:unknown,key:unknown){
  const input=objectInput(raw,['affiliationId','vehicleId']);if(!uuid(input.affiliationId)||!uuid(input.vehicleId))throw new PhoneAuthError('INVALID_REQUEST');
  const {affiliationId,vehicleId}=input,digests=this.requestDigests(userId,'VEHICLE',key,[affiliationId,vehicleId]),receipt=await this.receipt(tx,userId,'VEHICLE',digests);
  if(receipt){const [row]=await tx.select().from(d.driverVehicleRelationships).where(and(eq(d.driverVehicleRelationships.id,receipt.resourceId),eq(d.driverVehicleRelationships.userId,userId)));if(!row)throw new PhoneAuthError('CONFLICT');return this.relationshipDto(row);}
  await this.profileForRequest(tx,userId);
  const [affiliation]=await tx.select().from(d.driverTodaAffiliations).where(and(eq(d.driverTodaAffiliations.id,affiliationId),eq(d.driverTodaAffiliations.userId,userId)));
  if(!affiliation||!['PENDING','VERIFIED'].includes(affiliation.state))throw new ForbiddenException('Driver intake unavailable');await this.scope(tx,userId,affiliation.cityTenantId,affiliation.todaId);
  const [vehicle]=await tx.select().from(d.driverSyntheticVehicles).where(and(eq(d.driverSyntheticVehicles.id,vehicleId),eq(d.driverSyntheticVehicles.cityTenantId,affiliation.cityTenantId),eq(d.driverSyntheticVehicles.todaId,affiliation.todaId)));
  if(!vehicle||!['PENDING','VERIFIED'].includes(vehicle.state))throw new ForbiddenException('Driver intake unavailable');
  await tx.execute(sql`INSERT INTO identity.driver_vehicle_relationships(user_id,city_tenant_id,toda_id,affiliation_id,vehicle_id) VALUES(${userId}::uuid,${affiliation.cityTenantId}::uuid,${affiliation.todaId}::uuid,${affiliationId}::uuid,${vehicleId}::uuid) ON CONFLICT DO NOTHING`);
  const [row]=await tx.select().from(d.driverVehicleRelationships).where(and(eq(d.driverVehicleRelationships.userId,userId),eq(d.driverVehicleRelationships.affiliationId,affiliationId),eq(d.driverVehicleRelationships.vehicleId,vehicleId)));
  if(!row)throw new PhoneAuthError('CONFLICT');await tx.insert(d.driverRequestReceipts).values({userId,operation:'VEHICLE',...digests,resourceId:row.id});await authAudit(tx,'driver.vehicle_relationship_requested',row.id,userId,sessionId);return this.relationshipDto(row);
 }
 async status(tx:AuthTransaction,userId:string){
  const affiliations=await tx.select().from(d.driverTodaAffiliations).where(eq(d.driverTodaAffiliations.userId,userId)).orderBy(d.driverTodaAffiliations.createdAt).limit(50);
  const relationships=await tx.select().from(d.driverVehicleRelationships).where(eq(d.driverVehicleRelationships.userId,userId)).orderBy(d.driverVehicleRelationships.createdAt).limit(50);
  return {affiliations:affiliations.map(row=>this.affiliationDto(row)),vehicleRelationships:relationships.map(row=>this.relationshipDto(row)),realDocumentsEnabled:false as const,environment:'LOCAL_SYNTHETIC' as const};
 }
 async eligibility(tx:AuthTransaction,userId:string,cityTenantId:string,todaId:string){
  if(!uuid(cityTenantId)||!uuid(todaId))throw new PhoneAuthError('INVALID_REQUEST');
  await this.lock(tx,userId,cityTenantId,todaId);
  const [profile]=await tx.select().from(d.driverProfiles).where(eq(d.driverProfiles.userId,userId));
  const [affiliation]=await tx.select().from(d.driverTodaAffiliations).where(and(eq(d.driverTodaAffiliations.userId,userId),eq(d.driverTodaAffiliations.cityTenantId,cityTenantId),eq(d.driverTodaAffiliations.todaId,todaId)));
  if(!affiliation)throw new ForbiddenException('Driver scope unavailable');
  const [intake]=await tx.select().from(d.driverIntakeScopes).where(and(eq(d.driverIntakeScopes.cityTenantId,cityTenantId),eq(d.driverIntakeScopes.todaId,todaId)));
  const [city]=await tx.select({id:b.cityTenants.id,state:b.cityTenants.state}).from(b.cityTenants).where(eq(b.cityTenants.id,cityTenantId));
  const [toda]=await tx.select({id:b.todaOrganizations.id,state:b.todaOrganizations.state}).from(b.todaOrganizations).where(and(eq(b.todaOrganizations.id,todaId),eq(b.todaOrganizations.cityTenantId,cityTenantId)));
  const [user]=await tx.select().from(b.appUsers).where(eq(b.appUsers.id,userId));
  const [persona]=await tx.select().from(b.userPersonas).where(and(eq(b.userPersonas.userId,userId),eq(b.userPersonas.purpose,'DRIVER')));
  const [membership]=await tx.select().from(b.cityMemberships).where(and(eq(b.cityMemberships.userId,userId),eq(b.cityMemberships.cityTenantId,cityTenantId)));
  const [assertion]=await tx.select().from(d.driverScopeAssertions).where(and(eq(d.driverScopeAssertions.userId,userId),eq(d.driverScopeAssertions.cityTenantId,cityTenantId),eq(d.driverScopeAssertions.todaId,todaId)));
  // Positive selection is bound to the asserted relationship; no combining grants/evidence from different vehicles.
  const [relationship]=assertion?await tx.select().from(d.driverVehicleRelationships).where(and(eq(d.driverVehicleRelationships.id,assertion.relationshipId),eq(d.driverVehicleRelationships.userId,userId),eq(d.driverVehicleRelationships.cityTenantId,cityTenantId),eq(d.driverVehicleRelationships.todaId,todaId))):[];
  const [vehicle]=relationship?await tx.select().from(d.driverSyntheticVehicles).where(and(eq(d.driverSyntheticVehicles.id,relationship.vehicleId),eq(d.driverSyntheticVehicles.cityTenantId,cityTenantId),eq(d.driverSyntheticVehicles.todaId,todaId))):[];
  const convert=<T extends {validUntil:Date|null}>(row:T)=>({...row,validUntil:row.validUntil?.getTime()??null});
  const facts:DriverEligibilityFacts={scope:{userId,cityTenantId,todaId},now:await authNow(tx),accountState:user?.state??'',personaState:persona?.state??null,consentComplete:await hasPassengerConsent(tx,userId,this.settings,'DRIVER'),
   profile:profile?convert(profile):null,cityState:city?.state??'',todaState:toda?.state??'',cityMembershipState:membership?.state??null,intake:intake??null,
   affiliation:convert(affiliation),relationship:relationship?convert(relationship):null,vehicle:vehicle?convert(vehicle):null,
   assertion:assertion?{...assertion,effectiveFrom:assertion.effectiveFrom.getTime(),expiresAt:assertion.expiresAt.getTime(),revokedAt:assertion.revokedAt?.getTime()??null}:null};
  const result=evaluateDriverEligibility(facts);
  if(this.verification&&(!relationship||!await this.verification.current(tx,userId,cityTenantId,todaId,relationship.id))){result.identityEligible=false;result.reasons.push('VERIFICATION_CASES_NOT_CURRENT');}
  return {cityTenantId,todaId,...result};
 }
}
