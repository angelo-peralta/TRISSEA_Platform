import assert from 'node:assert/strict';
import { randomUUID,generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { evaluateDriverEligibility,type DriverEligibilityFacts } from '../src/auth/driver/driver-eligibility';
import { PassengerTokens } from '../src/auth/passenger/token-service';
function verified():DriverEligibilityFacts{
 const scope={userId:randomUUID(),cityTenantId:randomUUID(),todaId:randomUUID()},now=Date.now();
 const fact={state:'VERIFIED',version:1,validUntil:now+60_000,verificationReference:randomUUID(),source:'SYNTHETIC_ONLY'};
 const affiliation={...fact,...scope,id:randomUUID()},vehicle={...fact,id:randomUUID(),cityTenantId:scope.cityTenantId,todaId:scope.todaId,seatCapacity:1};
 const relationship={...fact,...scope,id:randomUUID(),affiliationId:affiliation.id,vehicleId:vehicle.id},policyReference=randomUUID();
 return {scope,now,accountState:'ACTIVE',personaState:'ACTIVE',consentComplete:true,profile:{...fact,userId:scope.userId},cityState:'ACTIVE',todaState:'VERIFIED',cityMembershipState:'ACTIVE',intake:{state:'OPEN',version:1,policyReference,source:'SYNTHETIC_ONLY'},affiliation,vehicle,relationship,
  assertion:{...scope,relationshipId:relationship.id,profileVersion:1,affiliationVersion:1,vehicleVersion:1,relationshipVersion:1,intakeVersion:1,policyVersion:1,permitReference:randomUUID(),policyReference,effectiveFrom:now-1000,expiresAt:now+60_000,revokedAt:null,source:'SYNTHETIC_ONLY'}};
}
test('a complete synthetic identity is positively eligible but all operational capabilities stay false',()=>{
 const result=evaluateDriverEligibility(verified());assert.equal(result.identityEligible,true);assert.deepEqual(result.reasons,[]);assert.equal(result.canGoOnline,false);assert.equal(result.operationalServicesEnabled,false);assert.equal(result.realDriverApproved,false);
});
const mutations:Record<string,(facts:DriverEligibilityFacts)=>void>={
 account:f=>{f.accountState='RESTRICTED';},persona:f=>{f.personaState='RESTRICTED';},consent:f=>{f.consentComplete=false;},profile:f=>{f.profile!.state='PENDING';},profileExpiry:f=>{f.profile!.validUntil=f.now;},
 city:f=>{f.cityState='SUSPENDED';},toda:f=>{f.todaState='REVOKED';},membership:f=>{f.cityMembershipState='PENDING';},intake:f=>{f.intake!.state='CLOSED';},affiliation:f=>{f.affiliation!.state='PENDING';},vehicle:f=>{f.vehicle!.state='PENDING';},capacity:f=>{f.vehicle!.seatCapacity=null;},relationship:f=>{f.relationship!.state='REVOKED';},
 permit:f=>{f.assertion=null;},assertionExpiry:f=>{f.assertion!.expiresAt=f.now;},future:f=>{f.assertion!.effectiveFrom=f.now+1;},revoked:f=>{f.assertion!.revokedAt=f.now;},staleProfile:f=>{f.profile!.version++;},staleVehicle:f=>{f.vehicle!.version++;},staleAffiliation:f=>{f.affiliation!.version++;},staleRelationship:f=>{f.relationship!.version++;},staleIntake:f=>{f.intake!.version++;},policy:f=>{f.assertion!.policyReference=randomUUID();},
 foreignCity:f=>{f.vehicle!.cityTenantId=randomUUID();},foreignToda:f=>{f.affiliation!.todaId=randomUUID();},foreignUser:f=>{f.assertion!.userId=randomUUID();},wrongRelationship:f=>{f.assertion!.relationshipId=randomUUID();},mixedVehicle:f=>{f.relationship!.vehicleId=randomUUID();},mixedAffiliation:f=>{f.relationship!.affiliationId=randomUUID();},realSource:f=>{f.profile!.source='REAL';},unknownTime:f=>{f.now=NaN;},
};
for(const [name,mutate] of Object.entries(mutations))test(`driver identity denies ${name}`,()=>{const facts=verified();mutate(facts);const result=evaluateDriverEligibility(facts);assert.equal(result.identityEligible,false);assert.equal(result.reasons.length>0,true);assert.equal(result.canGoOnline,false);});
test('one signing key still requires distinct passenger/driver audience and purpose',async()=>{
 const pair=generateKeyPairSync('ed25519'),privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicPem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
 const passenger=await PassengerTokens.create('http://localhost:4101/v1','passenger','purpose-test',privatePem,publicPem),driver=await PassengerTokens.create('http://localhost:4101/v1','driver','purpose-test',privatePem,publicPem,600,'DRIVER');
 const session={userId:randomUUID(),sessionId:randomUUID(),identityId:randomUUID(),expiresAt:Date.now()+3600_000},p=await passenger.issue(session),d=await driver.issue(session);
 assert.equal((await driver.verify(d))?.purpose,'DRIVER');assert.equal((await passenger.verify(p))?.purpose,'PASSENGER');assert.equal(await passenger.verify(d),null);assert.equal(await driver.verify(p),null);
});
