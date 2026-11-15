import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import {createRideFixture} from './m4-fixture.mjs';
import {runMigrations} from './migration-runner.mjs';
let f,p,d1,d2;
before(async()=>{f=await createRideFixture();p=await f.login();d1=await f.login('DRIVER');d2=await f.login('DRIVER');});
after(async()=>{await f?.close();});
async function call(method,path,body,who=p,status=200,headers={}){const response=await f.http(method,path,body,who,headers);assert.equal(response.statusCode,status,`${method} ${path}: ${response.statusCode} wanted ${status}`);return status===204?null:response.json();}
const passenger='/simulation/passenger',driver='/simulation/driver';
const preview=()=>call('POST',passenger+'/quotes',{scenarioId:f.scenarios[1],passengerCount:1,fareClass:'REGULAR'});
test('simulation is authenticated, enrolled and purpose-bound; all real operations remain denied',async()=>{
 await call('GET',passenger+'/scenarios',undefined,null,401);await call('GET',passenger+'/scenarios',undefined,d1,403);await call('GET',passenger+'/scenarios',undefined,await f.login('PASSENGER',false),403);
 for(const [method,path]of [['POST','/driver/shifts'],['POST','/driver/locations'],['GET','/driver/offers']])await call(method,path,{},d1,403);
 await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[1],passengerCount:1,fareClass:'REGULAR',totalCentavos:1},p,400);
 const plaza=(await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[0],passengerCount:1,fareClass:'REGULAR'})).quote;
 const [matrix]=await f.owner`SELECT regular_centavos FROM fare.matrix_rows WHERE import_id=${f.matrix.importId} AND destination_label='Namabbalan Sur'`;assert.equal(plaza.snapshot.referenceMethod,'LGU_MATRIX');assert.equal(plaza.snapshot.referenceCentavos,matrix.regular_centavos);assert.equal(plaza.snapshot.totalCentavos,matrix.regular_centavos*2);
 await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[1],passengerCount:1,fareClass:'DISCOUNTED'},p,409);
 await f.owner`UPDATE simulation.scenarios SET enabled=false WHERE id=${f.scenarios[0]}`;try{await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[0],passengerCount:1,fareClass:'REGULAR'},p,404);}finally{await f.owner`UPDATE simulation.scenarios SET enabled=true WHERE id=${f.scenarios[0]}`;}
 await call('POST','/rides',{},p,404);
 await assert.rejects(f.runtime.connection`UPDATE simulation.rides SET state='COMPLETED'`,e=>e.code==='42501');await assert.rejects(f.runtime.connection.unsafe('SET ROLE trissea_m4_writer'),e=>e.code==='42501');
 const {RideRuntime}=await import('../services/api/dist/src/rides/ride-runtime.js');await f.owner`UPDATE m2_disposable_manifest SET value='unapproved' WHERE key='m4-ride-simulation'`;
 try{await assert.rejects(RideRuntime.create(f.mobile),/startup rejected/);}finally{await f.owner`UPDATE m2_disposable_manifest SET value=${f.database} WHERE key='m4-ride-simulation'`;}
});
test('idempotent quote replay cannot cross a changed enrollment scope',async()=>{
 const who=await f.login(),body={scenarioId:f.scenarios[1],passengerCount:1,fareClass:'REGULAR'},key=randomUUID();const first=await call('POST',passenger+'/quotes',body,who,200,{'idempotency-key':key});
 const [other]=await f.owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${f.city},'M4_REPLAY_SCOPE','Synthetic replay scope','VERIFIED') RETURNING id`;
 await f.owner`UPDATE simulation.participants SET toda_id=${other.id} WHERE user_id=${who.userId}`;await call('POST',passenger+'/quotes',body,who,404,{'idempotency-key':key});
 await f.owner`UPDATE simulation.participants SET toda_id=${f.toda} WHERE user_id=${who.userId}`;assert.deepEqual(await call('POST',passenger+'/quotes',body,who,200,{'idempotency-key':key}),first);
});
test('immutable M3 quote -> single winning offer -> pickup -> trip -> simulated cash receipt',async()=>{
 const quote=(await preview()).quote;assert.equal(quote.snapshot.totalCentavos,4160);assert.equal(quote.snapshot.payable,false);
 const key=randomUUID(),ride=await call('POST',passenger+'/rides',{quoteId:quote.id},p,200,{'idempotency-key':key});assert.equal(ride.state,'OFFERED');assert.ok(ride.pickupCode);
 assert.deepEqual(await call('POST',passenger+'/rides',{quoteId:quote.id},p,200,{'idempotency-key':key}),ride);
 const responses=await f.owner`SELECT response FROM simulation.receipts_keys WHERE operation='CONFIRM' AND user_id=${p.userId}`;assert.ok(responses.every(r=>typeof r.response.encrypted==='string'&&!JSON.stringify(r.response).includes('pickupCode')));
 await call('POST',passenger+'/rides',{quoteId:(await preview()).quote.id},p,409);
 const offer=(await call('GET',driver+'/offers',undefined,d1)).items[0].offer;
 await call('POST',driver+'/rides/'+ride.id+'/actions/ACCEPT',{expectedVersion:ride.version,offerId:offer.id},d2,404);
 const accepted=await Promise.all(Array.from({length:2},()=>f.http('POST',driver+'/rides/'+ride.id+'/actions/ACCEPT',{expectedVersion:ride.version,offerId:offer.id},d1)));assert.deepEqual(accepted.map(r=>r.statusCode).sort(),[200,409]);
 let current=accepted.find(r=>r.statusCode===200).json().ride;assert.equal(current.pickupCode,null);
 const action=async(name,extra={})=>{const result=await call('POST',driver+'/rides/'+ride.id+'/actions/'+name,{expectedVersion:current.version,...extra},d1);current=result.ride;return result;};
 await call('POST',driver+'/rides/'+ride.id+'/actions/COMPLETE',{expectedVersion:current.version},d1,409);
 await action('EN_ROUTE');await action('ARRIVED');await call('POST',driver+'/rides/'+ride.id+'/actions/START',{expectedVersion:current.version},d1,409);
 const wrong=ride.pickupCode==='000000'?'000001':'000000';assert.equal((await action('VERIFY_PICKUP',{pickupCode:wrong})).outcome,'PICKUP_REJECTED');assert.equal(current.pickupAttemptsRemaining,4);
 await action('VERIFY_PICKUP',{pickupCode:ride.pickupCode});await action('START');await action('COMPLETE');assert.equal(current.state,'COMPLETED');assert.equal(current.receipt.cashState,'NOT_SIMULATED');assert.equal(current.fare.totalCentavos,4160);
 await action('CASH');assert.equal(current.receipt.cashState,'COLLECTION_SIMULATED');assert.equal(current.receipt.snapshot.physicallyReceived,false);assert.equal(current.receipt.snapshot.settled,false);
 const receipt=await call('GET',passenger+'/rides/'+ride.id+'/receipt');assert.equal(receipt.receipt.snapshot.fare.totalCentavos,4160);
 await assert.rejects(f.owner`UPDATE simulation.quotes SET snapshot='{}' WHERE id=${quote.id}`,e=>e.code==='23514');
});
test('cancellation and no-driver outcomes survive snapshot recovery',async()=>{
 const quote=(await preview()).quote,ride=await call('POST',passenger+'/rides',{quoteId:quote.id});const cancelled=await call('POST',passenger+'/rides/'+ride.id+'/cancel',{expectedVersion:ride.version});assert.equal(cancelled.ride.state,'CANCELLED');
 await call('POST',passenger+'/rides/'+ride.id+'/cancel',{expectedVersion:cancelled.ride.version},p,409);
 await f.owner`UPDATE simulation.participants SET available=false WHERE purpose='DRIVER'`;
 const none=await call('POST',passenger+'/rides',{quoteId:(await preview()).quote.id});assert.equal(none.state,'NO_DRIVER_AVAILABLE');assert.equal((await call('GET',passenger+'/rides/'+none.id)).state,'NO_DRIVER_AVAILABLE');
});
test('expired offers reassign deterministically; wrong scope, cancelled, stale and duplicate transitions deny',async()=>{
 await f.owner`UPDATE simulation.participants SET available=true WHERE purpose='DRIVER'`;
 const ride=await call('POST',passenger+'/rides',{quoteId:(await preview()).quote.id}),offer=(await call('GET',driver+'/offers',undefined,d1)).items[0].offer;
 await f.owner`UPDATE simulation.offers SET expires_at=clock_timestamp()-interval '1 millisecond',created_at=clock_timestamp()-interval '1 hour' WHERE id=${offer.id}`;
 await call('POST',driver+'/rides/'+ride.id+'/actions/ACCEPT',{expectedVersion:ride.version,offerId:offer.id},d1,409);
 await f.runtime.database.transaction(tx=>f.runtime.service.tick(tx));
 const second=(await call('GET',driver+'/offers',undefined,d2)).items[0];assert.equal(second.ride.id,ride.id);assert.notEqual(second.offer.id,offer.id);
 const other=await f.login('PASSENGER');await call('GET',passenger+'/rides/'+ride.id,undefined,other,404);
 const foreign=await f.login('DRIVER');const anotherToda=(await f.owner`INSERT INTO identity.toda_organizations(city_tenant_id,code,name,state) VALUES(${f.city},'M4_OTHER','Synthetic other TODA','VERIFIED') RETURNING id`)[0].id;await f.owner`UPDATE simulation.participants SET toda_id=${anotherToda} WHERE user_id=${foreign.userId}`;
 await call('GET',driver+'/rides/'+ride.id,undefined,foreign,404);
 const declined=await call('POST',driver+'/rides/'+ride.id+'/actions/DECLINE',{expectedVersion:second.ride.version,offerId:second.offer.id},d2);assert.equal(declined.outcome,'DECLINED');assert.equal(declined.ride,null);
 assert.equal((await call('GET',passenger+'/rides/'+ride.id)).state,'NO_DRIVER_AVAILABLE');
 await call('GET',driver+'/rides/'+ride.id,undefined,d1,404);await call('GET',driver+'/rides/'+ride.id,undefined,d2,404);
 await call('POST',driver+'/rides/'+ride.id+'/actions/ACCEPT',{expectedVersion:second.ride.version,offerId:second.offer.id},d2,404);
});
test('parallel passengers cannot duplicate bookings or reserve one driver twice; audit failure rolls back',async()=>{
 await f.owner`UPDATE simulation.participants SET available=false WHERE purpose='DRIVER'`;
 await f.owner`UPDATE simulation.participants SET available=true WHERE user_id=${d1.userId}`;
 const key=randomUUID(),q=(await preview()).quote;
 const raced=await Promise.all(Array.from({length:2},()=>f.http('POST',passenger+'/rides',{quoteId:q.id},p,{'idempotency-key':key})));assert.deepEqual(raced.map(r=>r.statusCode),[200,200]);assert.equal(raced[0].json().id,raced[1].json().id);
 const ride=raced[0].json(),other=await f.login(),q2=(await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[1],passengerCount:1,fareClass:'REGULAR'},other)).quote;
 const second=await call('POST',passenger+'/rides',{quoteId:q2.id},other);assert.notEqual(second.state,'OFFERED');
 const [count]=await f.owner`SELECT count(*)::int AS n FROM simulation.offers WHERE driver_id=${d1.userId} AND state='PENDING'`;assert.equal(count.n,1);
 await f.owner.unsafe("CREATE FUNCTION simulation.test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_OUTBOX_FAILURE';END $$; CREATE TRIGGER test_reject_outbox BEFORE INSERT ON identity.outbox_events FOR EACH ROW EXECUTE FUNCTION simulation.test_reject_outbox()");
 try{await call('POST',passenger+'/rides/'+ride.id+'/cancel',{expectedVersion:ride.version},p,503);assert.equal((await call('GET',passenger+'/rides/'+ride.id)).version,ride.version);assert.equal((await call('GET',driver+'/offers',undefined,d1)).items.length,1);}
 finally{await f.owner.unsafe('DROP TRIGGER test_reject_outbox ON identity.outbox_events; DROP FUNCTION simulation.test_reject_outbox()');}
 await call('POST',passenger+'/rides/'+ride.id+'/cancel',{expectedVersion:ride.version});
});
test('two different drivers racing on synthetic offers produce one winner and a stable conflict',async()=>{
 await f.owner`UPDATE simulation.participants SET available=true WHERE user_id IN (${d1.userId},${d2.userId})`;
 const ride=await call('POST',passenger+'/rides',{quoteId:(await preview()).quote.id}),offer=(await call('GET',driver+'/offers',undefined,d1)).items[0].offer;
 // Explicit fixture injects simultaneous offers to exercise the defensive winning constraint.
 const [second]=await f.owner`INSERT INTO simulation.offers(ride_id,driver_id,expires_at) VALUES(${ride.id},${d2.userId},clock_timestamp()+interval '30 seconds') RETURNING id`;
 const results=await Promise.all([d1,d2].map((who,i)=>f.http('POST',driver+'/rides/'+ride.id+'/actions/ACCEPT',{expectedVersion:ride.version,offerId:i===0?offer.id:second.id},who)));
 assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);const winner=results.findIndex(r=>r.statusCode===200),loser=[d1,d2][1-winner];await call('GET',driver+'/rides/'+ride.id,undefined,loser,404);
 const [counts]=await f.owner`SELECT count(*) FILTER(WHERE state='ACCEPTED')::int AS winners,count(*) FILTER(WHERE state='PENDING')::int AS pending FROM simulation.offers WHERE ride_id=${ride.id}`;assert.equal(counts.winners,1);assert.equal(counts.pending,0);
 const assigned=results[winner].json().ride;await call('POST',passenger+'/rides/'+ride.id+'/cancel',{expectedVersion:assigned.version});
});
test('recent rides use creation order and a scoped, precision-safe cursor for both personas',async()=>{
 const who=await f.login(),assigned=await f.login('DRIVER'),other=await f.login();
 const idFor=i=>'00000000-0000-4000-8000-'+(1000-i).toString(16).padStart(12,'0');
 const seed=async(i,passengerOwner=who,driverOwner=assigned,id=idFor(i))=>{
  const quote=(await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[1],passengerCount:1,fareClass:'REGULAR'},passengerOwner)).quote;
  // Explicit terminal fixtures: UUID order opposes creation order, and all
  // timestamps share a JavaScript millisecond. The page boundary splits a tie.
  await f.owner`INSERT INTO simulation.rides(id,quote_id,passenger_id,driver_id,city_tenant_id,toda_id,scenario_id,state,created_at,search_until)
   VALUES(${id},${quote.id},${passengerOwner.userId},${driverOwner.userId},${f.city},${f.toda},${f.scenarios[1]},'CANCELLED',
    '2026-11-15T00:00:00Z'::timestamptz+${i===4?5:i}*interval '1 microsecond',clock_timestamp())`;
  return id;
 };
 for(let i=0;i<25;i++)await seed(i);
 const expected=[...Array.from({length:19},(_,i)=>idFor(24-i)),idFor(4),idFor(5),idFor(3),idFor(2),idFor(1),idFor(0)];
 const foreign=await seed(30,other,d2,'ffffffff-ffff-4fff-8fff-ffffffffffff');
 for(const [path,viewer]of [[passenger,who],[driver,assigned]]){
  const first=await call('GET',path+'/rides',undefined,viewer);
  assert.deepEqual(first.items.map(r=>r.id),expected.slice(0,20));
  assert.deepEqual(first.items.slice(0,5).map(r=>r.id),expected.slice(0,5),'Mobile first-five history contains the newest rides');
  assert.equal(first.nextCursor,idFor(4));
  const next=await call('GET',path+'/rides?after='+first.nextCursor,undefined,viewer);
  assert.deepEqual(next.items.map(r=>r.id),expected.slice(20));assert.equal(next.nextCursor,null);
  assert.equal(new Set([...first.items,...next.items].map(r=>r.id)).size,25);
  assert.deepEqual((await call('GET',path+'/rides?after='+foreign,undefined,viewer)).items,[],'Another account cannot anchor this history');
  assert.deepEqual((await call('GET',path+'/rides?after='+randomUUID(),undefined,viewer)).items,[]);
  await call('GET',path+'/rides?after=invalid',undefined,viewer,400);
 }
 const inserted=await seed(25),fresh=await call('GET',passenger+'/rides',undefined,who);
 assert.equal(fresh.items[0].id,inserted);
 assert.deepEqual((await call('GET',passenger+'/rides?after='+idFor(4),undefined,who)).items.map(r=>r.id),expected.slice(20),'A newer insertion does not shift an existing cursor');
});

test('revoked sessions, suspended accounts and disabled enrollment cannot recover synthetic rides',async()=>{
 const revoked=await f.login(),suspended=await f.login(),disabled=await f.login();
 await f.owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=clock_timestamp(),version=version+1 WHERE user_id=${revoked.userId}`;await call('GET',passenger+'/current',undefined,revoked,401);
 await f.owner`UPDATE identity.app_users SET state='RESTRICTED',version=version+1 WHERE id=${suspended.userId}`;await call('GET',passenger+'/current',undefined,suspended,401);
 await f.owner`UPDATE simulation.participants SET state='DISABLED' WHERE user_id=${disabled.userId}`;await call('GET',passenger+'/current',undefined,disabled,403);
});
test('expired/stale previews cannot book; source change never rewrites a confirmed fare',async()=>{
 await f.owner`UPDATE simulation.scenarios SET quote_seconds=1 WHERE id=${f.scenarios[1]}`;const quote=(await preview()).quote;
 await new Promise(resolve=>setTimeout(resolve,1100));await f.owner`UPDATE simulation.scenarios SET quote_seconds=120 WHERE id=${f.scenarios[1]}`;
 await call('POST',passenger+'/rides',{quoteId:quote.id},p,409);
 const before=(await preview()).quote;await f.owner`UPDATE simulation.scenarios SET version=version+1 WHERE id=${f.scenarios[1]}`;await call('POST',passenger+'/rides',{quoteId:before.id},p,409);
 const fresh=(await preview()).quote,ride=await call('POST',passenger+'/rides',{quoteId:fresh.id});const price=ride.fare.totalCentavos;
 await f.owner`UPDATE simulation.scenarios SET road_metres=9000,version=version+1 WHERE id=${f.scenarios[1]}`;assert.equal((await call('GET',passenger+'/rides/'+ride.id)).fare.totalCentavos,price);
 await call('POST',passenger+'/rides/'+ride.id+'/cancel',{expectedVersion:ride.version});
 const {defaultDistance}=await import('../services/api/dist/src/fares/fare-model.js');
 await f.makePolicy('DISTANCE_PROPOSAL',{...defaultDistance,baseCentavos:9900},{familyId:f.distance.family.id,expectedRevision:1});
 await call('POST',passenger+'/quotes',{scenarioId:f.scenarios[1],passengerCount:1,fareClass:'REGULAR'},p,409);
});
test('realtime hints are own-account only and close on session revocation; GET remains authoritative',async()=>{
 const viewer=await f.login();await f.app.listen(0,'127.0.0.1');const url=await f.app.getUrl(),abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),10000);
 try{
  const unauth=await fetch(url+'/v1/simulation/events');assert.equal(unauth.status,401);
  const stream=await fetch(url+'/v1/simulation/events',{headers:{Authorization:'Bearer '+viewer.accessToken},signal:abort.signal});assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  const reader=stream.body.getReader(),first=new TextDecoder().decode((await reader.read()).value);assert.match(first,/event: ride.snapshot.v1/);const data=JSON.parse(first.split('data: ')[1]);assert.deepEqual(data.items,[]);assert.equal(data.simulationOnly,true);
  await f.owner`UPDATE identity.app_sessions SET state='REVOKED',revoked_at=clock_timestamp(),version=version+1 WHERE user_id=${viewer.userId}`;
  assert.equal((await reader.read()).done,true);await call('GET',passenger+'/current',undefined,viewer,401);
 }finally{clearTimeout(deadline);abort.abort();}
});
test('incremental migration is repeat-safe and rollback preserves M2/M3 history',async()=>{
 const before=await f.owner`SELECT id,checksum FROM trissea_migrations WHERE id<'0010' ORDER BY id`,rows=(await f.owner`SELECT count(*)::int AS n FROM fare.matrix_rows`)[0].n;
 const options={through:'0010_regular_simulation',allowIdentity:true,report:()=>{}};
 await runMigrations(f.owner,'up',options);await runMigrations(f.owner,'down',options);
 assert.equal((await f.owner`SELECT to_regnamespace('simulation') AS schema`)[0].schema,null);assert.equal((await f.owner`SELECT count(*)::int AS n FROM fare.matrix_rows`)[0].n,rows);
 await runMigrations(f.owner,'up',options);assert.deepEqual(await f.owner`SELECT id,checksum FROM trissea_migrations WHERE id<'0010' ORDER BY id`,before);
});
