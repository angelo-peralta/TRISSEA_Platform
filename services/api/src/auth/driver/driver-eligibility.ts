export interface VerifiedDriverFact {
 state:string;version:number;validUntil:number|null;verificationReference:string|null;source:string;
}
export interface DriverScope { userId:string;cityTenantId:string;todaId:string }
export interface ScopedDriverFact extends VerifiedDriverFact,DriverScope {}
export interface DriverEligibilityFacts {
 scope:DriverScope;now:number;accountState:string;personaState:string|null;consentComplete:boolean;
 profile:(VerifiedDriverFact & {userId:string})|null;
 cityState:string;todaState:string;cityMembershipState:string|null;
 intake:{state:string;version:number;policyReference:string;source:string}|null;
 affiliation:(ScopedDriverFact & {id:string})|null;
 relationship:(ScopedDriverFact & {id:string;affiliationId:string;vehicleId:string})|null;
 vehicle:(VerifiedDriverFact & {id:string;cityTenantId:string;todaId:string;seatCapacity:number|null})|null;
 assertion:(DriverScope & {relationshipId:string;profileVersion:number;affiliationVersion:number;vehicleVersion:number;relationshipVersion:number;intakeVersion:number;permitReference:string;policyReference:string;policyVersion:number;effectiveFrom:number;expiresAt:number;revokedAt:number|null;source:string})|null;
}
export function evaluateDriverEligibility(f:DriverEligibilityFacts){
 const reasons:string[]=[],add=(condition:boolean,reason:string)=>{if(condition)reasons.push(reason);};
 const current=(fact:VerifiedDriverFact|null)=>!!fact&&fact.state==='VERIFIED'&&fact.source==='SYNTHETIC_ONLY'&&Number.isSafeInteger(fact.version)&&fact.version>0&&!!fact.verificationReference&&Number.isFinite(fact.validUntil)&&fact.validUntil!>f.now;
 const scoped=(value:{userId?:string;cityTenantId:string;todaId:string}|null)=>!!value&&value.cityTenantId===f.scope.cityTenantId&&value.todaId===f.scope.todaId&&(!('userId' in value)||value.userId===f.scope.userId);
 add(!Number.isFinite(f.now)||f.accountState!=='ACTIVE','ACCOUNT_UNAVAILABLE');
 add(!f.consentComplete,'CONSENT_REQUIRED');add(f.personaState!=='ACTIVE','DRIVER_PERSONA_UNAVAILABLE');
 add(!current(f.profile),'DRIVER_PROFILE_UNVERIFIED_OR_EXPIRED');add(f.cityState!=='ACTIVE','CITY_UNAVAILABLE');add(f.todaState!=='VERIFIED','TODA_UNAVAILABLE');
 add(f.cityMembershipState!=='ACTIVE','CITY_MEMBERSHIP_INACTIVE');
 add(!f.intake||f.intake.state!=='OPEN'||f.intake.source!=='SYNTHETIC_ONLY','INTAKE_CLOSED');
 add(!current(f.affiliation),'TODA_AFFILIATION_UNVERIFIED_OR_EXPIRED');
 add(!current(f.vehicle)||!Number.isSafeInteger(f.vehicle?.seatCapacity)||(f.vehicle?.seatCapacity??0)<1,'VEHICLE_UNVERIFIED_OR_EXPIRED');
 add(!current(f.relationship),'VEHICLE_RELATIONSHIP_UNVERIFIED_OR_EXPIRED');
 add(f.profile?.userId!==f.scope.userId||!scoped(f.affiliation)||!scoped(f.relationship)||!scoped(f.vehicle)||!scoped(f.assertion)||f.relationship?.affiliationId!==f.affiliation?.id||f.relationship?.vehicleId!==f.vehicle?.id,'SCOPE_MISMATCH');
 const a=f.assertion;
 add(!a||a.source!=='SYNTHETIC_ONLY'||!a.permitReference||!a.policyReference,'PERMIT_POLICY_ASSERTION_MISSING');
 if(a){
  add(a.revokedAt!==null,'SCOPE_ASSERTION_REVOKED');add(!Number.isFinite(a.effectiveFrom)||!Number.isFinite(a.expiresAt)||a.effectiveFrom>f.now||a.expiresAt<=f.now,'SCOPE_ASSERTION_EXPIRED_OR_FUTURE');
  add(a.profileVersion!==f.profile?.version||a.affiliationVersion!==f.affiliation?.version||a.vehicleVersion!==f.vehicle?.version||a.relationshipVersion!==f.relationship?.version||a.intakeVersion!==f.intake?.version
   ||a.policyVersion!==f.intake?.version||a.policyReference!==f.intake?.policyReference||a.relationshipId!==f.relationship?.id,'STALE_VERIFICATION');
 }
 return {identityEligible:reasons.length===0,canGoOnline:false as const,operationalServicesEnabled:false as const,realDriverApproved:false as const,eligibilityBasis:'SYNTHETIC_ONLY' as const,reasons};
}
