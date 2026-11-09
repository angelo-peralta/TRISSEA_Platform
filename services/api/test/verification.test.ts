import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {openInput,submissionInput,decisionInput,cursorInput,version} from '../src/auth/verification/verification-model';
import {verificationDatabaseUrl} from '../src/auth/verification/verification-runtime';

test('verification accepts only synthetic case selectors and bounded optimistic versions',()=>{
 const id=randomUUID();for(const kind of ['DRIVER','VEHICLE','TODA_MEMBERSHIP'])assert.equal(openInput({relationshipId:id,kind}).kind,kind);
 assert.deepEqual(submissionInput({expectedVersion:1,evidenceId:id,evidenceVersion:2}),{expectedVersion:1,evidenceId:id,evidenceVersion:2});
 for(const v of [0,-1,1.2,NaN,Infinity,'1',2147483647,null,undefined])assert.throws(()=>version(v));
 for(const body of [{relationshipId:id,kind:'PERMIT'},{relationshipId:id,kind:'DRIVER',userId:id},{relationshipId:id,kind:'DRIVER',document:'personal data'},{relationshipId:'invalid',kind:'VEHICLE'}])assert.throws(()=>openInput(body));
 assert.throws(()=>submissionInput({expectedVersion:1,evidenceId:id,evidenceVersion:1,reviewerId:id}));
});
test('review decisions cannot supply status, permits, capacity, expiry, actor or incompatible reasons',()=>{
 const reasons={APPROVE:'SYNTHETIC_ACCEPTED',REJECT:'SYNTHETIC_INCOMPLETE',REVOKE:'SYNTHETIC_WITHDRAWN',EXPIRE:'SYNTHETIC_EXPIRED'};
 for(const [outcome,reasonCode]of Object.entries(reasons))assert.equal(decisionInput({expectedVersion:2,evidenceVersion:1,outcome,reasonCode}).outcome,outcome);
 const valid={expectedVersion:2,evidenceVersion:1,outcome:'APPROVE',reasonCode:'SYNTHETIC_ACCEPTED'};
 for(const key of ['actorId','status','permitReference','seatCapacity','validUntil','roles'])assert.throws(()=>decisionInput({...valid,[key]:'untrusted'}));
 assert.throws(()=>decisionInput({...valid,reasonCode:'SYNTHETIC_WITHDRAWN'}));assert.throws(()=>decisionInput({...valid,outcome:'GRANT'}));
 assert.equal(cursorInput({after:randomUUID()})?.length,36);for(const query of [{limit:1000},{after:'invalid'},{cityTenantId:randomUUID()}])assert.throws(()=>cursorInput(query));
});
test('verification startup requires all cores, closed capabilities and one disposable application database',()=>{
 const url='postgres://runtime:synthetic@127.0.0.1:15433/trissea_m2_test_123456abcdef';
 const env={NODE_ENV:'test',M2_VERIFICATION_ENABLED:'true',M2_PASSENGER_AUTH_ENABLED:'true',M2_DRIVER_AUTH_ENABLED:'true',M2_ADMIN_AUTH_ENABLED:'true',M2_VERIFICATION_DATABASE_URL:url,M2_PASSENGER_DATABASE_URL:url,ADMIN_DATABASE_URL:url};
 assert.equal(verificationDatabaseUrl(env).pathname,'/trissea_m2_test_123456abcdef');
 for(const change of [{NODE_ENV:'production'},{M2_ADMIN_AUTH_ENABLED:'false'},{M2_DRIVER_AUTH_ENABLED:'TRUE'},{SMS_LIVE_ENABLED:'true'},{REAL_DOCUMENTS_ENABLED:'true'},{RECOVERY_ENABLED:'true'},{OPERATIONAL_SERVICES_ENABLED:'true'},{M2_VERIFICATION_DATABASE_URL:url+'?search_path=public'},{ADMIN_DATABASE_URL:url.replace('123456abcdef','ffffffffffff')},{M2_PASSENGER_DATABASE_URL:url.replace('127.0.0.1','remote.invalid')},{M2_VERIFICATION_DATABASE_URL:url.replace('15433','15432')}])assert.throws(()=>verificationDatabaseUrl({...env,...change}));
});
