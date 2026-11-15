import configuration from './environment.cjs';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {runMigrations} from './migration-runner.mjs';
import {assertDisposableIdentityDatabase} from './migration-policy.mjs';
const req=createRequire(new URL('../services/api/package.json',import.meta.url));req('reflect-metadata');
export async function createRideFixture({listen=false}={}){
 const env=configuration.environmentFor('test'),url=new URL(env.M2_TEST_CONTROL_URL);if(url.pathname!=='/m2_control'||env.M2_DISPOSABLE_DATABASE!=='true')throw new Error('Disposable fixture required');
 const suffix=randomBytes(6).toString('hex'),database='trissea_m2_test_'+suffix,options={max:5,onnotice:()=>{},connect_timeout:5,connection:{timezone:'UTC'}};
 const control=postgres(url.href,options);await control.unsafe('CREATE DATABASE "'+database+'"');url.pathname='/'+database;assertDisposableIdentityDatabase(url.href,'development','true');const owner=postgres(url.href,options);
 await owner`CREATE TABLE m2_disposable_manifest(key text PRIMARY KEY,value text NOT NULL)`;await owner`INSERT INTO m2_disposable_manifest VALUES('identity-test',${database}),('m4-ride-simulation',${database})`;
 await runMigrations(owner,'up',{through:'0010_regular_simulation',allowIdentity:true,report:()=>{}});
 const urls={};for(const [name,groups]of [['mobile','trissea_m2_auth,trissea_m2_authorization'],['rides','trissea_m4_rides,trissea_m2_authorization']]){
  const login='m4_'+name+'_'+suffix,password=randomBytes(32).toString('hex');await control.unsafe('CREATE ROLE "'+login+'" LOGIN PASSWORD '+"'"+password+"'"+' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE IN ROLE '+groups);await owner.unsafe('GRANT SELECT ON m2_disposable_manifest TO "'+login+'"');const u=new URL(url);u.username=login;u.password=password;urls[name]=u.href;
 }
 const {PassengerRuntime}=req('./dist/src/auth/passenger/passenger-runtime.js'),{PassengerSecrets,PassengerSettings}=req('./dist/src/auth/passenger/passenger-settings.js'),{PassengerTokens}=req('./dist/src/auth/passenger/token-service.js'),{RedisOtpStore}=req('./dist/src/auth/passenger/redis-otp.js'),{MockSmsGateway}=req('./dist/src/auth/passenger/sms-gateway.js');
 const secrets=new PassengerSecrets('m4-fixture',...Array.from({length:5},()=>randomBytes(32))),pair=generateKeyPairSync('ed25519'),priv=pair.privateKey.export({type:'pkcs8',format:'pem'}),pub=pair.publicKey.export({type:'spki',format:'pem'}),issuer='http://127.0.0.1:4104/v1';
 const passengerTokens=await PassengerTokens.create(issuer,'m4-passenger','m4-fixture',priv,pub),driverTokens=await PassengerTokens.create(issuer,'m4-driver','m4-fixture',priv,pub,600,'DRIVER');
 const messages=new Map(),otp=new RedisOtpStore(env.DEV_REDIS_URL,'m4-'+suffix);await otp.connect();
 const mobile=new PassengerRuntime(postgres(urls.mobile,options),new PassengerSettings({NODE_ENV:'test'}),secrets,otp,new MockSmsGateway('test',m=>messages.set(m.challengeId,m)),passengerTokens,driverTokens);
 Object.assign(process.env,{NODE_ENV:'test',M2_AUTH_MODE:'local-synthetic',M2_PASSENGER_AUTH_ENABLED:'true',M2_DRIVER_AUTH_ENABLED:'true',M2_ADMIN_AUTH_ENABLED:'false',M2_VERIFICATION_ENABLED:'false',M4_SIMULATION_ENABLED:'true',M2_PASSENGER_DATABASE_URL:urls.mobile,M4_DATABASE_URL:urls.rides});
 const {Test}=req('@nestjs/testing'),{FastifyAdapter}=req('@nestjs/platform-fastify'),{AppModule}=req('./dist/src/app.module.js');
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PassengerRuntime).useValue(mobile).compile(),app=module.createNestApplication(new FastifyAdapter({logger:false,bodyLimit:16384}),{logger:false});app.setGlobalPrefix('v1');await app.init();await app.getHttpAdapter().getInstance().ready();if(listen)await app.listen(4104,'127.0.0.1');
 const {RideRuntime}=req('./dist/src/rides/ride-runtime.js'),runtime=app.get(RideRuntime);
 const authority=(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id;
 const city=(await owner`INSERT INTO identity.city_tenants(code,name,state) VALUES('M4_SYNTHETIC','Synthetic Tuguegarao simulation','ACTIVE') RETURNING id`)[0].id;
 const toda=(await owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${city},'M4_SYNTHETIC','Synthetic TODA','VERIFIED') RETURNING id`)[0].id;
 // Source import uses the real M3 service with an explicitly scoped synthetic maker.
 const admin=(await owner`INSERT INTO identity.app_users(state) VALUES('ACTIVE') RETURNING id`)[0].id,subject=randomUUID(),identity=(await owner`INSERT INTO identity.auth_identities(user_id,kind,issuer,subject_digest,key_id,subject_ciphertext,verified_at) VALUES(${admin},'KEYCLOAK','https://synthetic.invalid',${secrets.identity.lookup(subject,'KEYCLOAK')},${secrets.keyId},${secrets.identity.encrypt(subject,'KEYCLOAK')},now()) RETURNING id`)[0].id;
 await owner`INSERT INTO identity.administrative_identity_mappings(identity_id,user_id,approved_by,approval_reference,state) VALUES(${identity},${admin},${authority},${randomUUID()},'APPROVED')`;
 const adminSession=(await owner`INSERT INTO identity.app_sessions(user_id,identity_id,identity_kind,client_purpose,state,auth_version,authenticated_at,mfa_verified_at,last_seen_at,expires_at) VALUES(${admin},${identity},'KEYCLOAK','ADMIN','ACTIVE',1,now(),now(),now(),now()+interval '1 hour') RETURNING id`)[0].id;
 await owner`INSERT INTO identity.city_memberships(user_id,city_tenant_id,state) VALUES(${admin},${city},'ACTIVE')`;await owner`INSERT INTO identity.scoped_role_assignments(user_id,city_tenant_id,role_code,scope_kind,granted_by,expires_at) VALUES(${admin},${city},'CITY_FARE_EDITOR','CITY',${authority},now()+interval '1 hour')`;
 const {drizzle}=req('drizzle-orm/postgres-js'),{sql}=req('drizzle-orm'),db=drizzle(owner),{FareService}=req('./dist/src/fares/fare-service.js'),fareService=new FareService(secrets),{defaultDistance,defaultPrivate}=req('./dist/src/fares/fare-model.js');
 const asAdmin=work=>db.transaction(async tx=>{await tx.execute(sql`SELECT set_config('trissea.user_id',${admin},true),set_config('trissea.session_id',${adminSession},true),set_config('trissea.city_tenant_id',${city},true),set_config('trissea.client_purpose','ADMIN',true)`);return work({tx,userId:admin,sessionId:adminSession,resource:{cityTenantId:city},traceId:randomUUID(),grantId:null});});
 const matrix=await asAdmin(c=>fareService.import(c,{csv:awaitableCsv,sourceLabel:'M4 synthetic LGU reference',sourceReference:'data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv',provenance:'Owner-confirmed Plaza per-passenger reference; local simulation only',effectiveFrom:null,effectiveUntil:null,tariffReference:null},randomUUID()));
 const makePolicy=(kind,config,extra={})=>asAdmin(c=>fareService.save(c,{familyId:null,expectedRevision:0,kind,name:'M4 synthetic '+kind,config,effectiveFrom:null,effectiveUntil:null,legalReference:null,...extra},randomUUID()));
 const distance=await makePolicy('DISTANCE_PROPOSAL',defaultDistance),privateHire=await makePolicy('PRIVATE_HIRE_PROPOSAL',defaultPrivate);
 const scenarios=[];for(const [reference,origin,destinationLabel,ref,metres]of [['SYNTHETIC_PLAZA','PLAZA','Namabbalan Sur',matrix.version.id,8000],['SYNTHETIC_OFF_PLAZA','OFF_PLAZA',null,distance.version.id,5000]]){
  scenarios.push((await owner`INSERT INTO simulation.scenarios(city_tenant_id,toda_id,reference,pickup,destination,origin,destination_label,road_metres,capacity,reference_policy_id,private_policy_id,enabled) VALUES(${city},${toda},${reference},${origin==='PLAZA'?'Plaza (synthetic pickup)':'Synthetic pickup A'},${destinationLabel??'Synthetic destination B'},${origin},${destinationLabel},${metres},${defaultPrivate.simulationCapacity},${ref},${privateHire.version.id},true) RETURNING id`)[0].id);
 }
 let counter=0;
 async function http(method,path,body,who,headers={}){return app.inject({method,url:'/v1'+path,headers:{...(who?{authorization:'Bearer '+who.accessToken}:{}),'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{payload:body})});}
 async function login(purpose='PASSENGER',provision=true){
  const phone='+63998000'+String(++counter).padStart(4,'0'),binding={clientPurpose:purpose,deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')},challenge=await http('POST','/auth/phone/challenges',{...binding,phone});if(challenge.statusCode!==202)throw new Error('Mock challenge failed');const id=challenge.json().challengeId;
  const verified=await http('POST','/auth/phone/challenges/'+id+'/verify',{...binding,phone,code:messages.get(id).code});if(verified.statusCode!==200)throw new Error('Mock proof failed');const credentials=verified.json(),profile=await http('GET',purpose==='PASSENGER'?'/me':'/driver/me',undefined,credentials),p=profile.json();
  const consent=await http('POST',purpose==='PASSENGER'?'/me/consents':'/driver/me/consents',{noticeVersion:p.requiredNoticeVersion,termsVersion:p.requiredTermsVersion,noticeAcknowledged:true,termsAccepted:true},credentials);if(consent.statusCode!==200)throw new Error('Synthetic consent failed');
  if(provision)await owner`INSERT INTO simulation.participants(user_id,purpose,city_tenant_id,toda_id,reference,capacity,available,rank) VALUES(${p.userId},${purpose},${city},${toda},${'SYNTHETIC_'+purpose+'_'+counter},${purpose==='DRIVER'?defaultPrivate.simulationCapacity:null},${purpose==='DRIVER'},${counter})`;
  return {...credentials,userId:p.userId,binding,phone};
 }
 async function enroll(userId,purpose){
  if(!['PASSENGER','DRIVER'].includes(purpose))throw new Error('Invalid fixture purpose');
  const known=await owner`SELECT o.challenge_id FROM identity.otp_redemptions o JOIN identity.app_sessions s ON s.id=o.session_id WHERE s.user_id=${userId} AND s.client_purpose=${purpose}`;if(!known.some(r=>messages.has(r.challenge_id)))throw new Error('Explicit synthetic phone fixture required');
  await owner`INSERT INTO simulation.participants(user_id,purpose,city_tenant_id,toda_id,reference,capacity,available,rank) VALUES(${userId},${purpose},${city},${toda},${'SYNTHETIC_NATIVE_'+purpose},${purpose==='DRIVER'?defaultPrivate.simulationCapacity:null},${purpose==='DRIVER'},1) ON CONFLICT DO NOTHING`;
 }
 return {app,owner,control,mobile,runtime,city,toda,scenarios,matrix,distance,privateHire,login,http,enroll,asAdmin,makePolicy,urls,database,messages,close:async()=>{await app.close();await owner.end();await control.end();}};
}
const awaitableCsv=await readFile(new URL('../data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv',import.meta.url),'utf8');
