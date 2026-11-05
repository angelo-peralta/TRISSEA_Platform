import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import postgres from 'postgres';
import { runMigrations } from './migration-runner.mjs';
import { assertLocalDatabase, assertDisposableIdentityDatabase } from './migration-policy.mjs';

const requireApi = createRequire(new URL('../services/api/package.json', import.meta.url));
const { getTableConfig, PgDialect } = requireApi('drizzle-orm/pg-core');
const { is, SQL } = requireApi('drizzle-orm');
const schema = requireApi('./dist/src/database/identity-schema.js');
const { IdentityCrypto } = requireApi('./dist/src/database/identity-crypto.js');
const { IdentityStore, ScopedIdentityStore } = requireApi('./dist/src/database/identity-store.js');
const suffix = randomBytes(6).toString('hex');
const database = `trissea_m2_test_${suffix}`;
let owner, runtime, auth, control, runtimeUrl, authUrl, markerUrl;
const evidence = { database, executedAt: new Date().toISOString(), syntheticOnly: true, checkpoints: [] };
const note = message => { evidence.checkpoints.push(message); console.info(message); };
const crypto = new IdentityCrypto('test-v1', randomBytes(32), randomBytes(32));
const sqlOptions = { max: 1, onnotice: () => {}, connection: { timezone: 'UTC', statement_timeout: 15000, lock_timeout: 5000 }, connect_timeout: 5 };
const dbError = (promise, code) => assert.rejects(promise, error => error.code === code || error.cause?.code === code);
const fixture = {};

before(async () => {
  // No default URL: cannot accidentally fall back to M1, user or production data.
  const url = new URL(process.env.M2_TEST_CONTROL_URL);
  assertLocalDatabase(url.href, process.env.NODE_ENV);
  assert.equal(url.pathname, '/m2_control');
  assert.equal(url.search, '');
  assert.equal(process.env.M2_DISPOSABLE_DATABASE, 'true');
  control = postgres(url.href, sqlOptions);
  await control.unsafe(`CREATE DATABASE "${database}"`); // random controlled identifier, never DROP DATABASE
  url.pathname = `/${database}`;
  markerUrl = url.href;
  assertDisposableIdentityDatabase(markerUrl, process.env.NODE_ENV, process.env.M2_DISPOSABLE_DATABASE);
  owner = postgres(markerUrl, sqlOptions);
  await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;
  await owner`INSERT INTO m2_disposable_manifest VALUES ('identity-test',${database})`;
  await owner`CREATE TABLE unrelated_preservation(id integer PRIMARY KEY,value text NOT NULL)`;
  await owner`INSERT INTO unrelated_preservation VALUES (1,'synthetic-preservation-sentinel')`;
});

after(async () => {
  await Promise.allSettled([runtime?.end(), auth?.end(), owner?.end(), control?.end()]);
  await mkdir(new URL('../evidence/m2/m2-1/', import.meta.url), { recursive: true });
  await writeFile(new URL('../evidence/m2/m2-1/database-results.json', import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
});

test('migration gates reject non-disposable, remote, production and ambiguous targets', () => {
  for (const [url, env, optIn] of [
    ['postgres://x:x@127.0.0.1/trissea_dev','development','true'],
    ['postgres://x:x@remote.invalid/trissea_m2_test_aaaaaaaaaaaa','development','true'],
    ['postgres://x:x@localhost/trissea_m2_test_aaaaaaaaaaaa','production','true'],
    ['postgres://x:x@localhost/trissea_m2_test_aaaaaaaaaaaa','development','false'],
    ['postgres://x:x@localhost/trissea_m2_test_aaaaaaaaaaaa?host=remote.invalid','development','true'],
  ]) assert.throws(() => assertDisposableIdentityDatabase(url,env,optIn));
});

test('fresh, repeat and failed migrations preserve M1 ledger and unrelated data', async () => {
  await runMigrations(owner,'up',{through:'0001_foundation',report:note});
  const [m1] = await owner`SELECT * FROM trissea_migrations WHERE id='0001_foundation'`;
  await assert.rejects(runMigrations(owner,'up'), /isolated disposable/);
  assert.equal((await owner`SELECT to_regnamespace('identity') AS ns`)[0].ns, null);
  // Real DB failure after DDL/ledger writes, before commit: both must roll back.
  const failBeforeCommit = { begin: callback => owner.begin(async tx => {
    await callback(tx);
    await tx`SELECT 1/0`;
  }) };
  await assert.rejects(runMigrations(failBeforeCommit,'up',{allowIdentity:true,report:()=>{}}), error => error.code==='22012');
  assert.equal((await owner`SELECT to_regclass('identity.app_users') AS relation`)[0].relation,null);
  await runMigrations(owner,'up',{allowIdentity:true,report:note});
  await runMigrations(owner,'up',{allowIdentity:true,report:note});
  assert.equal((await owner`SELECT count(*)::int AS n FROM trissea_migrations`)[0].n,2);
  assert.deepEqual((await owner`SELECT * FROM trissea_migrations WHERE id='0001_foundation'`)[0],m1);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,0);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.scoped_role_assignments`)[0].n,0);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.role_permissions`)[0].n,0);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.roles`)[0].n,12);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.permissions`)[0].n,11);
  note('Fresh + no-op migration; M1 ledger retained; zero seeded accounts/grants/permission edges');
});

test('all Drizzle columns, PK/unique/FK/check/index definitions match PostgreSQL', async () => {
  const tables=Object.values(schema).filter(x=>x && x[Symbol.for('drizzle:IsDrizzleTable')]);
  const dialect=new PgDialect();
  for(const table of tables) {
    const cfg=getTableConfig(table);
    const [security]=await owner`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=${`identity.${cfg.name}`}::regclass`;
    assert.equal(security.relrowsecurity,cfg.enableRLS,`${cfg.name} RLS flag`);
    if(cfg.enableRLS) assert.equal(security.relforcerowsecurity,true);
    const columns=await owner`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='identity' AND table_name=${cfg.name} ORDER BY ordinal_position`;
    assert.equal(columns.length,cfg.columns.length,cfg.name);
    for(const [index,col] of cfg.columns.entries()) {
      const actual=columns[index];
      assert.equal(actual.column_name,col.name); assert.equal(actual.data_type,col.getSQLType());
      assert.equal(actual.is_nullable,col.notNull?'NO':'YES');
      if(col.default!==undefined) {
        const expected=is(col.default,SQL)?dialect.sqlToQuery(col.default).sql:String(col.default);
        assert.ok(actual.column_default?.includes(expected),`${cfg.name}.${col.name} default`);
      } else assert.equal(actual.column_default,null);
    }
    const constraints=await owner`SELECT conname,contype,conkey,confkey,confrelid::regclass::text AS target,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=${`identity.${cfg.name}`}::regclass`;
    const columnIndexes=xs=>xs.map(c=>cfg.columns.findIndex(x=>x.name===c.name)+1);
    for(const pk of cfg.primaryKeys) assert.ok(constraints.some(c=>c.contype==='p'&&JSON.stringify(c.conkey)===JSON.stringify(columnIndexes(pk.columns))));
    for(const col of cfg.columns.filter(c=>c.primary)) assert.ok(constraints.some(c=>c.contype==='p'&&c.conkey[0]===cfg.columns.indexOf(col)+1));
    for(const u of cfg.uniqueConstraints) {
      const actual=constraints.find(c=>c.conname===u.getName().slice(0,63));
      assert.equal(actual?.contype,'u'); assert.deepEqual(actual.conkey,columnIndexes(u.columns));
      assert.equal(actual.definition.includes('NULLS NOT DISTINCT'),Boolean(u.nullsNotDistinct));
    }
    for(const col of cfg.columns.filter(c=>c.isUnique)) assert.ok(constraints.some(c=>c.contype==='u'&&c.conkey[0]===cfg.columns.indexOf(col)+1));
    for(const fk of cfg.foreignKeys) {
      const ref=fk.reference(), target=getTableConfig(ref.foreignTable);
      const actual=constraints.find(c=>c.conname===fk.getName().slice(0,63));
      assert.equal(actual?.contype,'f'); assert.deepEqual(actual.conkey,columnIndexes(ref.columns));
      assert.equal(actual.target,`identity.${target.name}`);
      assert.deepEqual(actual.confkey,ref.foreignColumns.map(c=>target.columns.findIndex(x=>x.name===c.name)+1));
    }
    // Ask PostgreSQL to normalize the independent Drizzle expressions, then compare
    // actual stored SQL. Merely comparing constraint names would miss weakened checks.
    await owner.unsafe(`CREATE TEMP TABLE schema_check_probe (LIKE identity."${cfg.name}")`);
    try {
      for(const ck of cfg.checks) {
        const expression=dialect.sqlToQuery(ck.value).sql.replaceAll(`"identity"."${cfg.name}".`,'');
        await owner.unsafe(`ALTER TABLE schema_check_probe ADD CONSTRAINT "${ck.name}" CHECK (${expression})`);
        const [expected]=await owner`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='schema_check_probe'::regclass AND conname=${ck.name}`;
        assert.equal(constraints.find(c=>c.contype==='c'&&c.conname===ck.name)?.definition,expected.definition,`${cfg.name}.${ck.name}`);
      }
    } finally { await owner`DROP TABLE schema_check_probe`; }
    const indexes=await owner`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='identity' AND tablename=${cfg.name}`;
    for(const idx of cfg.indexes) {
      const actual=indexes.find(i=>i.indexname===idx.config.name);
      assert.ok(actual); for(const col of idx.config.columns) assert.ok(actual.indexdef.includes(col.name));
    }
  }
  note(`Drizzle/PostgreSQL consistency: ${tables.length} tables, columns/defaults/nullability and all declared constraints/indexes`);
});

async function makeUser(subject=randomUUID(),kind='PHONE_OTP') {
  return owner.begin(async tx=>{
    const [u]=await tx`INSERT INTO identity.app_users DEFAULT VALUES RETURNING id`;
    const [i]=await tx`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at)
      VALUES(${u.id},${kind},${kind==='PHONE_OTP'?'trissea:phone':'https://keycloak.invalid/realms/synthetic'},${crypto.lookup(subject,kind)},${crypto.keyId},${crypto.encrypt(subject,kind)},now()) RETURNING id`;
    return {userId:u.id,identityId:i.id};
  });
}
async function makeSession(user,purpose='PASSENGER',connection=owner) {
  const [s]=await connection`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,expires_at)
    VALUES(${user.userId},${user.identityId},'PHONE_OTP',${purpose},'CONSENT_REQUIRED',1,now(),now()+interval '1 hour') RETURNING id`;
  return s.id;
}

test('constraints reject wrong city/TODA, wrong identity/session, invalid lifecycles, self grants and plaintext digests', async () => {
  fixture.a=await makeUser(); fixture.b=await makeUser();
  const [city]=await owner`INSERT INTO identity.city_tenants(code,name) VALUES('TUGUEGARAO','Tuguegarao synthetic test') RETURNING id`;
  const [other]=await owner`INSERT INTO identity.city_tenants(code,name) VALUES('SYNTHETIC_OTHER','Synthetic other city') RETURNING id`;
  fixture.city=city.id;fixture.otherCity=other.id;
  const organizations=await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name) VALUES
    (${city.id},'TEST_A','Synthetic A'),(${city.id},'TEST_B','Synthetic B'),(${other.id},'TEST_C','Synthetic C') RETURNING id,code`;
  fixture.todaA=organizations.find(x=>x.code==='TEST_A').id;fixture.todaB=organizations.find(x=>x.code==='TEST_B').id;
  await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${fixture.a.userId},${city.id},'ACTIVE')`;
  await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,expires_at)
    VALUES(${fixture.a.userId},${city.id},${fixture.todaA},'TODA_MANAGER','TODA',${fixture.b.userId},now()+interval '1 hour')`;
  await dbError(owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,expires_at)
    VALUES(${fixture.a.userId},${city.id},${organizations.find(x=>x.code==='TEST_C').id},'TODA_MANAGER','TODA',${fixture.b.userId},now()+interval '1 hour')`,'23503');
  await dbError(owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,toda_id,role_code,scope_kind,granted_by,expires_at)
    VALUES(${fixture.a.userId},${city.id},NULL,'TODA_MANAGER','TODA',${fixture.b.userId},now()+interval '1 hour')`,'23514');
  await dbError(owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,role_code,scope_kind,granted_by,expires_at)
    VALUES(${fixture.a.userId},${city.id},'CITY_FARE_EDITOR','CITY',${fixture.a.userId},now()+interval '1 hour')`,'23514');
  await dbError(owner`INSERT INTO identity.app_users(state) VALUES('GUESS_APPROVED')`,'23514');
  await dbError(owner`UPDATE identity.auth_identities SET subject_digest='plaintext-phone' WHERE id=${fixture.a.identityId}`,'23514');
  await dbError(owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,expires_at)
    VALUES(${fixture.b.userId},${fixture.a.identityId},'PHONE_OTP','PASSENGER','ACTIVE',1,now(),now()+interval '1 hour')`,'23514');
  fixture.sessionA=await makeSession(fixture.a);fixture.sessionB=await makeSession(fixture.b);
  await dbError(owner`UPDATE identity.app_sessions SET client_purpose='DRIVER' WHERE id=${fixture.sessionA}`,'23514');
  note('Composite city/TODA and identity/session integrity, lifecycle and self-assignment denials passed');
});

test('real least-privilege LOGIN connections, RLS positive/negative scopes and pooled context isolation', async () => {
  const runtimeName=`m2_reader_${suffix}`, authName=`m2_auth_${suffix}`;
  for(const [name,group] of [[runtimeName,'trissea_m2_runtime'],[authName,'trissea_m2_auth']]) {
    const password=randomBytes(32).toString('hex');
    try {
      await control.unsafe(`CREATE ROLE "${name}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE ${group}`);
    } catch { throw new Error('Unable to provision isolated test login'); } // never print a password-bearing SQL error
    const url=new URL(markerUrl); url.username=name;url.password=password;
    if(group==='trissea_m2_runtime') runtimeUrl=url.href; else authUrl=url.href;
  }
  runtime=postgres(runtimeUrl,sqlOptions);auth=postgres(authUrl,sqlOptions);
  const store=new ScopedIdentityStore(runtime);
  const scope={userId:fixture.a.userId,cityTenantId:fixture.city,todaId:fixture.todaA};
  assert.deepEqual((await store.listOrganizations(scope)).map(x=>x.id),[fixture.todaA]);
  assert.equal((await store.listOwnSessions(scope)).length,1);
  assert.equal((await store.listOrganizations({...scope,cityTenantId:fixture.otherCity})).length,0);
  assert.equal((await runtime`SELECT count(*)::int AS n FROM identity.toda_organizations`)[0].n,0);
  assert.equal((await runtime`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,0);
  assert.equal((await runtime`SELECT current_setting('trissea.user_id',true) AS ctx`)[0].ctx,'');
  await runtime.begin(async tx=>{
    await tx`SELECT set_config('trissea.user_id',${fixture.a.userId},true)`;
    assert.deepEqual((await tx`SELECT id FROM identity.app_users`).map(x=>x.id),[fixture.a.userId]);
    assert.equal((await tx`SELECT id FROM identity.app_users WHERE id=${fixture.b.userId}`).length,0);
  });
  await assert.rejects(runtime.begin(async tx=>{
    await tx`SELECT set_config('trissea.user_id',${fixture.a.userId},true)`;
    throw new Error('synthetic rollback');
  }),/synthetic rollback/);
  assert.equal((await runtime`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,0);
  const results=await Promise.all(Array.from({length:12},(_,i)=>store.listOrganizations({...scope,todaId:i%2?fixture.todaA:fixture.todaB})));
  results.forEach((rows,i)=>assert.deepEqual(rows.map(x=>x.id),[i%2?fixture.todaA:fixture.todaB]));
  assert.equal((await runtime`SELECT count(*)::int AS n FROM identity.toda_organizations`)[0].n,0);
  await assert.rejects(new ScopedIdentityStore(owner).listOrganizations(scope),/Least-privilege/);
  await dbError(runtime`SELECT * FROM identity.auth_identities`,'42501');
  await dbError(runtime`SELECT auth_version FROM identity.app_sessions`,'42501');
  await dbError(runtime`UPDATE identity.app_users SET state='ACTIVE'`,'42501');
  await dbError(auth`INSERT INTO identity.scoped_role_assignments DEFAULT VALUES`,'42501');
  await dbError(auth`SELECT * FROM identity.administrative_identity_mappings`,'42501');
  note('Non-owner LOGIN role RLS; positive own scope, cross-city denial, 12 pooled alternating contexts and least-privilege denials');
});

test('account restriction atomically revokes sessions/refresh and audits once; stale updates fail', async () => {
  const store=new IdentityStore(auth);
  assert.equal(await store.hasCurrentMobileSession(fixture.sessionA,fixture.a.userId,'PASSENGER'),true);
  assert.equal(await store.hasCurrentMobileSession(fixture.sessionA,fixture.a.userId,'DRIVER'),false);
  assert.equal(await store.hasCurrentMobileSession(fixture.sessionA,fixture.b.userId,'PASSENGER'),false);
  await auth`INSERT INTO identity.refresh_credentials(session_id,generation,digest,key_id,expires_at)
    VALUES(${fixture.sessionA},0,${crypto.lookup(randomUUID(),'refresh')},${crypto.keyId},now()+interval '1 day')`;
  const results=await Promise.all([store.restrictAccount(fixture.a.userId,1),store.restrictAccount(fixture.a.userId,1)]);
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await store.hasCurrentMobileSession(fixture.sessionA,fixture.a.userId,'PASSENGER'),false);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.refresh_credentials WHERE session_id=${fixture.sessionA} AND revoked_at IS NOT NULL`)[0].n,1);
  assert.equal((await owner`SELECT auth_version FROM identity.app_users WHERE id=${fixture.a.userId}`)[0].auth_version,2);
  const events=await owner`SELECT id FROM identity.audit_events WHERE resource_id=${fixture.a.userId} AND action='account.restricted'`;
  assert.equal(events.length,1);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.outbox_events WHERE audit_event_id=${events[0].id}`)[0].n,1);
  await dbError(makeSession(fixture.a,'PASSENGER',auth),'23514');
  await dbError(owner`UPDATE identity.audit_events SET reason_code='ALTERED' WHERE id=${events[0].id}`,'23514');
  await dbError(owner`DELETE FROM identity.audit_events WHERE id=${events[0].id}`,'23514');
  await dbError(owner`UPDATE identity.outbox_events SET event_type='other.event' WHERE audit_event_id=${events[0].id}`,'23514');
  note('Concurrent restriction CAS: one winner; session/refresh revoked; audit/outbox atomic; immutable history');
});

test('own-session revocation rejects cross-account writes and cannot reactivate consumed credentials', async () => {
  const store=new IdentityStore(auth);
  await auth`INSERT INTO identity.refresh_credentials(session_id,generation,digest,key_id,expires_at)
    VALUES(${fixture.sessionB},0,${crypto.lookup(randomUUID(),'refresh')},${crypto.keyId},now()+interval '1 day')`;
  assert.equal(await store.revokeOwnSession(fixture.a.userId,fixture.sessionB,1),false);
  assert.equal(await store.hasCurrentMobileSession(fixture.sessionB,fixture.b.userId,'PASSENGER'),true);
  assert.equal(await store.revokeOwnSession(fixture.b.userId,fixture.sessionB,1),true);
  assert.equal(await store.revokeOwnSession(fixture.b.userId,fixture.sessionB,1),false);
  assert.equal(await store.hasCurrentMobileSession(fixture.sessionB,fixture.b.userId,'PASSENGER'),false);
  await dbError(auth`UPDATE identity.app_sessions SET state='CONSENT_REQUIRED',revoked_at=NULL WHERE id=${fixture.sessionB}`,'23514');
  await dbError(auth`UPDATE identity.refresh_credentials SET revoked_at=NULL WHERE session_id=${fixture.sessionB}`,'23514');
  await dbError(auth`UPDATE identity.app_users SET state='ACTIVE',restricted_at=NULL WHERE id=${fixture.a.userId}`,'23514');
  const [event]=await owner`SELECT id FROM identity.audit_events WHERE action='session.revoked' AND resource_id=${fixture.sessionB}`;
  assert.ok(event.id);
  assert.equal((await owner`SELECT count(*)::int AS n FROM identity.outbox_events WHERE audit_event_id=${event.id}`)[0].n,1);
  note('Owned session revocation audited atomically; wrong owner/stale version/reactivation/refresh reset/recovery shortcuts denied');
});

test('duplicate identity and OTP redemption races converge; failed transactions leave no partial user', async () => {
  const same=randomUUID();
  const connections=[owner,postgres(markerUrl,sqlOptions)];
  try {
    const before=(await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n;
    const results=await Promise.allSettled(connections.map(conn=>conn.begin(async tx=>{
      const [u]=await tx`INSERT INTO identity.app_users DEFAULT VALUES RETURNING id`;
      await tx`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at)
        VALUES(${u.id},'PHONE_OTP','trissea:phone',${crypto.lookup(same,'PHONE_OTP')},${crypto.keyId},${crypto.encrypt(same,'PHONE_OTP')},now())`;
    })));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_users`)[0].n,before+1);
    const [challenge]=await owner`INSERT INTO identity.otp_challenge_metadata(purpose,destination_digest,key_id,binding_digest,expires_at,resend_after)
      VALUES('PASSENGER',${crypto.lookup(same,'phone')},${crypto.keyId},${crypto.lookup(same,'binding')},now()+interval '5 minutes',now()+interval '60 seconds') RETURNING id`;
    const redeem=conn=>conn.begin(async tx=>{
      const sid=await makeSession(fixture.b,'PASSENGER',tx);
      await tx`INSERT INTO identity.otp_redemptions(challenge_id,purpose,user_id,session_id,receipt_digest)
        VALUES(${challenge.id},'PASSENGER',${fixture.b.userId},${sid},${crypto.lookup(challenge.id,'receipt')})`;
    });
    const redemption=await Promise.allSettled(connections.map(redeem));
    assert.equal(redemption.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await owner`SELECT count(*)::int AS n FROM identity.otp_redemptions WHERE challenge_id=${challenge.id}`)[0].n,1);
    assert.equal((await owner`SELECT count(*)::int AS n FROM identity.app_sessions WHERE user_id=${fixture.b.userId}`)[0].n,2);
    // Database is metadata only: no OTP, hash of OTP or raw phone column.
    const text=JSON.stringify(await owner`SELECT row_to_json(m) AS data FROM identity.otp_challenge_metadata m`);
    assert.ok(!text.includes('otp_code')); assert.ok(!text.includes('destination_ciphertext'));
    assert.ok(!text.includes(same));
    await dbError(owner`INSERT INTO identity.otp_redemptions(challenge_id,purpose,user_id,session_id,receipt_digest)
      VALUES(${randomUUID()},'DRIVER',${fixture.b.userId},${fixture.sessionB},${crypto.lookup(randomUUID(),'receipt')})`,'23503');
    note('Two independent DB connections: one identity/user and one accepted redemption; losing transactions fully rolled back');
  } finally { await connections[1].end(); }
});

test('restriction racing an in-flight session insert leaves no usable new session', async () => {
  const user=await makeUser(), other=postgres(markerUrl,sqlOptions);
  let unlock, entered;
  const gate=new Promise(resolve=>{unlock=resolve;});
  const started=new Promise(resolve=>{entered=resolve;});
  try {
    const creating=other.begin(async tx=>{const sid=await makeSession(user,'DRIVER',tx);entered();await gate;return sid;});
    await started;
    const restricting=new IdentityStore(auth).restrictAccount(user.userId,1);
    unlock();
    const [sid,changed]=await Promise.all([creating,restricting]);
    assert.equal(changed,true);
    assert.equal(await new IdentityStore(auth).hasCurrentMobileSession(sid,user.userId,'DRIVER'),false);
    note('Parent row lock serializes in-flight session creation with account restriction');
  } finally { unlock();await other.end(); }
});

test('versioned consent is append-only and admin MFA/mapping fail closed', async () => {
  const [consent]=await auth`INSERT INTO identity.account_consents(user_id,purpose,document_code,document_version,decision)
    VALUES(${fixture.b.userId},'PASSENGER','SYNTHETIC_NOTICE','test-v1','ACKNOWLEDGED') RETURNING id`;
  await dbError(owner`UPDATE identity.account_consents SET document_version='test-v2' WHERE id=${consent.id}`,'23514');
  const admin=await makeUser(randomUUID(),'KEYCLOAK');
  await dbError(owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,expires_at)
    VALUES(${admin.userId},${admin.identityId},'KEYCLOAK','ADMIN','ACTIVE',1,now(),now()+interval '1 hour')`,'23514');
  await dbError(owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference)
    VALUES(${admin.identityId},${admin.userId},${admin.userId},${randomUUID()})`,'23514');
  await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state)
    VALUES(${admin.identityId},${admin.userId},${fixture.b.userId},${randomUUID()},'APPROVED')`;
  await dbError(owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,expires_at)
    VALUES(${admin.userId},${admin.identityId},'KEYCLOAK','ADMIN','ACTIVE',1,now(),now()+interval '1 hour')`,'23514');
  const [adminSession]=await owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,mfa_verified_at,expires_at)
    VALUES(${admin.userId},${admin.identityId},'KEYCLOAK','ADMIN','ACTIVE',1,now(),now(),now()+interval '1 hour') RETURNING id`;
  assert.ok(adminSession.id); // synthetic storage invariant only; no provider authentication claimed
  note('Consent append-only; password-only/unmapped admin and self-approval denied (no OIDC flow claimed)');
});

test('rollback/reapply preserves sentinel, M1 table/checksum, UTC and PostGIS; unknown dependencies abort safely', async () => {
  await runtime.end();runtime=undefined;await auth.end();auth=undefined;
  const [m1]=await owner`SELECT * FROM trissea_migrations WHERE id='0001_foundation'`;
  await owner`CREATE VIEW unrelated_dependency AS SELECT id FROM identity.app_users`;
  await assert.rejects(runMigrations(owner,'down',{allowIdentity:true}),error=>error.code==='2BP01');
  assert.equal((await owner`SELECT count(*)::int AS n FROM trissea_migrations`)[0].n,2);
  assert.ok((await owner`SELECT to_regclass('identity.outbox_events') AS relation`)[0].relation);
  await owner`DROP VIEW unrelated_dependency`;
  await runMigrations(owner,'down',{allowIdentity:true,report:note});
  assert.equal((await owner`SELECT to_regnamespace('identity') AS ns`)[0].ns,null);
  assert.equal((await owner`SELECT value FROM unrelated_preservation`)[0].value,'synthetic-preservation-sentinel');
  assert.equal((await owner`SELECT value FROM foundation_metadata WHERE key='milestone'`)[0].value,'M1');
  assert.deepEqual((await owner`SELECT * FROM trissea_migrations WHERE id='0001_foundation'`)[0],m1);
  await runMigrations(owner,'up',{allowIdentity:true,report:note});
  assert.equal((await owner`SELECT current_setting('TimeZone') AS timezone`)[0].timezone,'UTC');
  const [versions]=await owner`SELECT current_setting('server_version') AS postgres,postgis_lib_version() AS postgis`;
  evidence.versions=versions;
  note('Rollback/reapply + failed rollback atomicity; M1 ledger/metadata and unrelated sentinel preserved; UTC/PostGIS passed');
  // Security-sensitive migrations must have explicit rollback without destructive CASCADE.
  const down=await readFile(new URL('../database/migrations/0002_identity_foundation.down.sql',import.meta.url),'utf8');
  assert.ok(!/^\s*DROP.*CASCADE/im.test(down));
  evidence.completed=true;
});
