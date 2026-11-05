import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionPolicies, decideAuthorization, type GrantRecord, type SessionProof, type SubjectRecord, type ResourceRecord } from '../src/auth/policy/authorization-model';
import { AuthorizationSettings } from '../src/auth/policy/authorization-settings';

const now = 1_800_000_000_000;
const proof: SessionProof = { userId: 'user-a', identityId: 'identity-a', sessionId: 'session-a', purpose: 'ADMIN', expiresAt: now + 60_000,
  adminMfa: { authenticatedAt: now - 60_000, verifiedAt: now - 60_000, currentUntil: now + 5_000 } };
const subject: SubjectRecord = { ...proof, identityKind: 'KEYCLOAK', identityState: 'ACTIVE', userState: 'ACTIVE', sessionState: 'ACTIVE', authVersion: 1, userAuthVersion: 1,
  authenticatedAt: now - 60_000, mfaVerifiedAt: now - 60_000, lastSeenAt: now, expiresAt: now + 600_000, personaState: null, adminMappingState: 'APPROVED' };
const resource: ResourceRecord = { id: 'toda-a', kind: 'TODA', version: 1, cityTenantId: 'city-a', todaId: 'toda-a', cityState: 'ACTIVE', todaState: 'VERIFIED', ownerUserId: null, makerUserId: null, assignedUserId: null };
const grant: GrantRecord = { id: 'grant-a', userId: 'user-a', roleCode: 'TODA_MANAGER', scopeKind: 'TODA', permission: 'toda.members.manage', cityTenantId: 'city-a', todaId: 'toda-a',
  startsAt: now - 1000, expiresAt: now + 60_000, revokedAt: null, membershipState: 'ACTIVE', cityState: 'ACTIVE', todaState: 'VERIFIED' };
const decide = (changes: Partial<SubjectRecord> = {}, grants: readonly GrantRecord[] = [grant], r: ResourceRecord = resource, p: SessionProof = proof) =>
  decideAuthorization(p, { ...subject, ...changes }, r, grants, actionPolicies.TODA_MEMBERS_MANAGE, now);

test('positive same-grant scope and independently authenticated own-account access', () => {
  assert.deepEqual(decide(), { allowed: true, grantId: 'grant-a' });
  const mobile: SessionProof = { userId: 'user-a', sessionId: 'session-a', identityId: 'identity-a', purpose: 'DRIVER', expiresAt: now + 60_000 };
  const pending: SubjectRecord = { ...subject, purpose: 'DRIVER', identityKind: 'PHONE_OTP', personaState: 'PENDING', userState: 'CONSENT_REQUIRED', sessionState: 'CONSENT_REQUIRED' };
  const own: ResourceRecord = { ...resource, kind: 'ACCOUNT', ownerUserId: 'user-a', cityTenantId: null, todaId: null };
  assert.equal(decideAuthorization(mobile,pending,own,[],actionPolicies.ACCOUNT_READ_SELF,now).allowed,true);
  assert.equal(decideAuthorization(mobile,pending,{...own,ownerUserId:'user-b'},[],actionPolicies.ACCOUNT_READ_SELF,now).allowed,false);
  assert.equal(decideAuthorization(mobile,pending,resource,[grant],actionPolicies.TODA_MEMBERS_MANAGE,now).allowed,false);
});

for (const [label,changes] of Object.entries<Partial<SubjectRecord>>({
  restricted: { userState: 'RESTRICTED' }, closed: { userState: 'CLOSED' }, preauth: { sessionState: 'PREAUTH' }, revoked: { sessionState: 'REVOKED' },
  expired: { expiresAt: now }, disabledIdentity: { identityState: 'DISABLED' }, staleVersion: { userAuthVersion: 2 },
  wrongUser: { userId: 'user-b' }, wrongIdentity: { identityId: 'identity-b' }, wrongSession: { sessionId: 'session-b' }, wrongPurpose: { purpose: 'PASSENGER' },
  missingMfa: { mfaVerifiedAt: null }, futureMfa: { mfaVerifiedAt: now+1000 }, idle: { lastSeenAt: now-900_000 }, mappingRemoved: { adminMappingState: 'REVOKED' },
  consent: { userState: 'CONSENT_REQUIRED', sessionState: 'CONSENT_REQUIRED' },
})) test(`current DB subject denial: ${label}`, () => assert.equal(decide(changes).allowed,false));

for (const [label,changes] of Object.entries<Partial<GrantRecord>>({
  wrongCity: { cityTenantId: 'city-b' }, wrongToda: { todaId: 'toda-b' }, wrongUser: { userId: 'user-b' }, wrongPermission: { permission: 'config.manage' },
  wrongRole: { roleCode: 'PLATFORM_ADMIN' }, startsLater: { startsAt: now+1 }, expired: { expiresAt: now }, revoked: { revokedAt: now },
  suspendedMembership: { membershipState: 'SUSPENDED' }, inactiveCity: { cityState: 'SUSPENDED' }, unverifiedToda: { todaState: 'PENDING' },
  cityEscalation: { scopeKind: 'CITY', todaId: null }, selfScope: { scopeKind: 'SELF', todaId: null },
})) test(`same-row grant denial: ${label}`, () => assert.equal(decide({},[{...grant,...changes}]).allowed,false));

test('scope and permission cannot be assembled from different grants; no platform PII bypass', () => {
  assert.equal(decide({},[{...grant,permission:'config.manage'},{...grant,id:'b',todaId:'toda-b'}]).allowed,false);
  assert.equal(decide({},[{...grant,roleCode:'PLATFORM_ADMIN',scopeKind:'PLATFORM',todaId:null}]).allowed,false);
  assert.equal(decide({},[grant],{...resource,todaId:null}).allowed,false);
});

test('admin proof freshness, exact session binding and current-factor assurance are mandatory', () => {
  for(const p of [{...proof,expiresAt:now}, {...proof,adminMfa:undefined}, {...proof,adminMfa:{...proof.adminMfa!,currentUntil:now}},
    {...proof,adminMfa:{...proof.adminMfa!,verifiedAt:now}}, {...proof,adminMfa:{...proof.adminMfa!,authenticatedAt:now}}]) {
    assert.equal(decideAuthorization(p as SessionProof,subject,resource,[grant],actionPolicies.TODA_MEMBERS_MANAGE,now).allowed,false);
  }
  const old={authenticatedAt:now-300_000,mfaVerifiedAt:now-300_000};
  const p={...proof,adminMfa:{authenticatedAt:old.authenticatedAt,verifiedAt:old.mfaVerifiedAt,currentUntil:now+5000}};
  assert.equal(decide(old,[grant],resource,p).allowed,false);
});

test('assigned verification and maker-checker policies have positive and self-approval cases', () => {
  const caseResource={...resource,kind:'VERIFICATION_CASE' as const,ownerUserId:'driver-b',assignedUserId:'user-a'};
  const officer={...grant,roleCode:'VERIFICATION_OFFICER',permission:'driver.verify'};
  assert.equal(decideAuthorization(proof,subject,caseResource,[officer],actionPolicies.DRIVER_VERIFY,now).allowed,true);
  assert.equal(decideAuthorization(proof,subject,{...caseResource,assignedUserId:'user-b'},[officer],actionPolicies.DRIVER_VERIFY,now).allowed,false);
  assert.equal(decideAuthorization(proof,subject,{...caseResource,ownerUserId:'user-a'},[officer],actionPolicies.DRIVER_VERIFY,now).allowed,false);
  const fare={...resource,kind:'FARE_POLICY' as const,todaId:null,makerUserId:'user-b'};
  const approver={...grant,roleCode:'CITY_FARE_APPROVER',permission:'fare.approve',scopeKind:'CITY',todaId:null};
  assert.equal(decideAuthorization(proof,subject,fare,[approver],actionPolicies.FARE_APPROVE,now).allowed,true);
  for(const makerUserId of ['user-a',null]) assert.equal(decideAuthorization(proof,subject,{...fare,makerUserId},[approver],actionPolicies.FARE_APPROVE,now).allowed,false);
});

test('canonical fare-editor, city/platform configuration, privacy and support policies allow only their scoped roles', () => {
  for(const [action,roleCode,scopeKind] of [
    ['FARE_DRAFT','CITY_FARE_EDITOR','CITY'],['CITY_CONFIG_MANAGE','CITY_OPERATIONS_ADMIN','CITY'],
    ['PLATFORM_CONFIG_MANAGE','PLATFORM_ADMIN','PLATFORM'],['PRIVACY_DSR','PRIVACY_OFFICER','CITY'],
    ['INCIDENT_ESCALATE','SUPPORT_AGENT','TODA'],['DISPATCH_READ_MASKED','TODA_DISPATCHER','TODA'],
  ] as const) {
    const policy=actionPolicies[action];
    const r={...resource,kind:policy.resource,todaId:scopeKind==='TODA'?resource.todaId:null,assignedUserId:'user-a',makerUserId:'user-b',ownerUserId:'user-b'};
    const g={...grant,roleCode,scopeKind,permission:policy.permission!,todaId:scopeKind==='TODA'?grant.todaId:null};
    assert.equal(decideAuthorization(proof,subject,r,[g],policy,now).allowed,true,action);
    assert.equal(decideAuthorization(proof,subject,r,[{...g,roleCode:'SECURITY_AUDITOR'}],policy,now).allowed,false,action);
  }
});

test('unsupported/invalid resource metadata and altered assurance times fail closed', () => {
  for(const r of [{...resource,version:0},{...resource,cityTenantId:null},{...resource,cityState:'SUSPENDED'},
    {...resource,todaState:'REVOKED'},{...resource,kind:'ACCOUNT' as const}]) assert.equal(decide({},[grant],r).allowed,false);
  assert.equal(decideAuthorization(proof,null,resource,[grant],actionPolicies.TODA_MEMBERS_MANAGE,now).allowed,false);
  assert.equal(decideAuthorization(proof,subject,null,[grant],actionPolicies.TODA_MEMBERS_MANAGE,now).allowed,false);
});

test('configured stricter time limits take effect and unsafe/production activation is rejected', () => {
  const settings=new AuthorizationSettings({NODE_ENV:'test',ADMIN_REAUTH_SECONDS:'30',ADMIN_IDLE_SECONDS:'60'});
  assert.equal(decideAuthorization(proof,subject,resource,[grant],actionPolicies.TODA_MEMBERS_MANAGE,now,settings).allowed,false);
  for(const environment of [{NODE_ENV:'production'},{NODE_ENV:'development',ADMIN_REAUTH_SECONDS:'301'},{NODE_ENV:'test',ADMIN_IDLE_SECONDS:'901'}])
    assert.throws(()=>new AuthorizationSettings(environment));
});
