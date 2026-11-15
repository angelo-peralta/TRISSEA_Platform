import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {RideSession} from '../src/rides';
import type {MobileSession,CredentialStore} from '../src/controller';
import type {Schemas} from '../../contracts/src/index';

function fixture(){
 const id=randomUUID(),userId=randomUUID(),date=new Date().toISOString();let saved:string|null=null,lost=false,ride:Schemas['M4Ride']|null=null,confirmed:Schemas['M4Ride']|null=null,failRead=false,failWrite=false,hold:Promise<void>|null=null,confirmCount=0;
 const calls:{method:string;path:string;key:string|null}[]=[];
 const auth:Pick<MobileSession,'getSnapshot'|'authorized'>={getSnapshot:()=>({phase:'AUTHENTICATED',busy:false,message:null,profile:{userId,sessionId:id,state:'ACTIVE',profileVersion:1,requiredNoticeVersion:'synthetic',requiredTermsVersion:'synthetic',environment:'LOCAL_SYNTHETIC',clientPurpose:'PASSENGER',displayName:null,operationsEnabled:false},challengeExpiresAt:null,resendAfter:null}),authorized:async work=>work('synthetic-token')};
 const fare:Schemas['M4Fare']={method:'PRIVATE_HIRE_PROPOSAL',referenceMethod:'DISTANCE_PROPOSAL',referenceCentavos:2600,totalCentavos:4160,occupiedCentavos:2600,unusedSeats:4,compensationBps:1500,compensationCentavos:1560,rounding:'CENTAVO_HALF_UP',referencePolicyVersionId:id,privatePolicyVersionId:id,sourceVersion:null,routeDistanceMetres:5000,routeEvidence:'SYNTHETIC',input:{passengerCount:1,capacity:5,fareClass:'REGULAR'},pickup:'Synthetic A',destination:'Synthetic B',quoteTimestamp:date,quoteExpiry:date,paymentMethod:'CASH_SIMULATION',payable:false,simulationOnly:true};
 const quote:Schemas['M4Quote']={id,userId,scenarioId:id,cityTenantId:id,todaId:id,scenarioVersion:1,referencePolicyId:id,privatePolicyId:id,referenceRevision:1,privateRevision:1,passengerCount:1,fareClass:'REGULAR',snapshot:fare,createdAt:date,expiresAt:date};
 const store:CredentialStore={read:async()=>{if(failRead){failRead=false;throw new Error('OS store unavailable');}return saved;},write:async value=>{if(failWrite)throw new Error('OS store unavailable');saved=value;},clear:async()=>{saved=null;}};
 let unavailable=false,stalled=false;
 const fetcher:typeof fetch=async(url,init)=>{
  const path=String(url).split('/v1')[1]!,method=init?.method??'GET';calls.push({path,method,key:(init?.headers as Record<string,string>)['Idempotency-Key']??null});
  if(stalled)return new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('Network deadline')),{once:true}));
  if(path.endsWith('/scenarios')){if(hold)await hold;return Response.json({items:[],participantReference:'SYNTHETIC_PASSENGER',available:false,simulationOnly:true,operationalServicesEnabled:false});}
  if(path.endsWith('/quotes'))return unavailable?Response.json({}, {status:404}):Response.json({quote,simulationOnly:true});
  if(path.endsWith('/current'))return Response.json({ride:ride&&['COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE'].includes(ride.state)?null:ride,simulationOnly:true});
  if(path.endsWith('/rides')&&method==='GET')return Response.json({items:[],nextCursor:null,simulationOnly:true});
  if(path.endsWith('/rides')&&method==='POST'){
   if(!ride){confirmCount++;ride={id,quoteId:id,state:'OFFERED',version:3,cityTenantId:id,todaId:id,createdAt:date,updatedAt:date,searchUntil:date,pickupVerified:false,pickupAttemptsRemaining:5,driverReference:null,vehicleDescription:null,fare,receipt:null,pickupCode:null,simulationOnly:true,operationalServicesEnabled:false};}
   confirmed??=ride;if(lost){lost=false;throw new Error('Response lost after database commit');}return Response.json(confirmed);
  }
  if(path.endsWith('/rides/'+id))return Response.json(ride);
  throw new Error('Unexpected request');
 };
 let snapshotHold:Promise<void>|null=null;
 const gatedFetcher:typeof fetch=async(url,init)=>{const response=fetcher(url,init);if(String(url).endsWith('/rides/'+id)&&snapshotHold)await snapshotHold;return response;};
 const create=()=>new RideSession(auth,'PASSENGER','http://127.0.0.1:4104/v1',store,randomUUID,gatedFetcher);
 return {id,userId,create,calls,store,saved:()=>saved,count:()=>confirmCount,lose:()=>{lost=true;},stall:(v:boolean)=>{stalled=v;},unavailable:(v:boolean)=>{unavailable=v;},failRead:()=>{failRead=true;},failWrite:(v:boolean)=>{failWrite=v;},hold:(p:Promise<void>|null)=>{hold=p;},holdSnapshot:(p:Promise<void>)=>{snapshotHold=p;},version:(version:number,state:Schemas['M4Ride']['state']='OFFERED')=>{ride={...ride!,version,state};}};
}
test('lost confirmation response persists original key; cold restart recovers exactly one booking',async()=>{
 const f=fixture(),session=f.create();await session.refresh();await session.preview(f.id,1,'REGULAR');f.lose();await session.confirm();assert.equal(session.getSnapshot().offline,true);assert.ok(f.saved());assert.equal(f.saved()!.includes('synthetic-token'),false);assert.equal(f.count(),1);
 const restarted=f.create();await restarted.refresh();assert.equal(restarted.getSnapshot().ride?.id,f.id);assert.equal(f.saved(),null);assert.equal(f.count(),1);
 const confirmations=f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/rides'));assert.equal(confirmations.length,2);assert.equal(confirmations[0]!.key,confirmations[1]!.key);
});
test('out-of-order snapshots never regress; terminal rides still refresh receipt versions',async()=>{
 const f=fixture(),s=f.create();await s.preview(f.id,1,'REGULAR');await s.confirm();f.version(9,'COMPLETED');await s.syncRide();f.version(4);await s.open(f.id);assert.equal(s.getSnapshot().ride?.version,9);f.version(10,'COMPLETED');await s.syncRide();assert.equal(s.getSnapshot().ride?.version,10);
});
test('a delayed confirmation replay is reconciled to a later terminal server snapshot on cold restore',async()=>{
 const f=fixture(),s=f.create();await s.preview(f.id,1,'REGULAR');f.lose();await s.confirm();f.version(8,'CANCELLED');const restarted=f.create();await restarted.refresh();assert.equal(restarted.getSnapshot().ride?.state,'CANCELLED');assert.equal(restarted.getSnapshot().ride?.version,8);assert.equal(f.count(),1);
});
test('an action during refresh waits for synchronization instead of being silently discarded',async()=>{
 const f=fixture(),s=f.create();let release!:()=>void;f.hold(new Promise<void>(r=>{release=r;}));const sync=s.refresh();await new Promise(r=>setTimeout(r,0));const action=s.preview(f.id,1,'REGULAR');release();await Promise.all([sync,action]);assert.ok(s.getSnapshot().quote);assert.equal(f.calls.filter(c=>c.path.endsWith('/quotes')).length,1);
});
test('overlapping realtime and polling hints share one snapshot synchronization',async()=>{
 const f=fixture(),s=f.create();await s.refresh();await s.preview(f.id,1,'REGULAR');await s.confirm();
 let release!:()=>void;f.holdSnapshot(new Promise<void>(r=>{release=r;}));
 const hints=Array.from({length:20},()=>s.syncRide());await new Promise(r=>setTimeout(r,0));
 const reads=f.calls.filter(c=>c.path.endsWith('/rides/'+f.id)).length;
 release();await Promise.all(hints);assert.equal(reads,1,'Repeated hints must not backlog the purpose-bound session request queue');
});
test('background recovery preserves an unavailable-route error until a new user attempt',async()=>{
 const f=fixture(),s=f.create();await s.refresh();f.unavailable(true);await s.preview(f.id,1,'REGULAR');
 const error=s.getSnapshot().message;assert.match(error,/This synthetic route or action is unavailable/);
 await s.syncRide();assert.equal(s.getSnapshot().message,error);
 await s.syncRide(true);assert.doesNotMatch(s.getSnapshot().message,/unavailable/);
 await s.preview(f.id,1,'REGULAR');assert.equal(s.getSnapshot().message,error);
 f.unavailable(false);await s.preview(f.id,1,'REGULAR');assert.ok(s.getSnapshot().quote);assert.doesNotMatch(s.getSnapshot().message,/unavailable/);
});
test('a late terminal snapshot cannot reopen a ride after returning home',async()=>{
 const f=fixture(),s=f.create();await s.refresh();await s.preview(f.id,1,'REGULAR');await s.confirm();f.version(9,'NO_DRIVER_AVAILABLE');await s.open(f.id);
 let release!:()=>void;f.holdSnapshot(new Promise<void>(r=>{release=r;}));const sync=s.syncRide();await new Promise(r=>setTimeout(r,0));
 s.home();assert.equal(s.getSnapshot().ride,null);release();await sync;assert.equal(s.getSnapshot().ride,null,'A completed background read must respect the later home action');
});
test('a stalled ride request reaches a deadline and releases synchronization for reconnect',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),s=f.create();f.stall(true);const pending=s.refresh();await new Promise<void>(r=>setImmediate(r));
 t.mock.timers.tick(10000);await pending;assert.equal(s.getSnapshot().offline,true);f.stall(false);await s.refresh();assert.equal(s.getSnapshot().loaded,true);assert.equal(s.getSnapshot().offline,false);
});
test('OS storage read failure retries pending recovery; a different account cannot replay it',async()=>{
 const f=fixture(),s=f.create();await s.preview(f.id,1,'REGULAR');f.lose();await s.confirm();f.failRead();const restart=f.create();await restart.refresh();assert.ok(f.saved());assert.equal(restart.getSnapshot().offline,true);await restart.refresh();assert.equal(restart.getSnapshot().ride?.id,f.id);assert.equal(f.saved(),null);
 const foreign=fixture();await foreign.store.write(JSON.stringify({userId:f.userId,operation:'m4Confirm',input:{body:{quoteId:f.id},idempotencyKey:randomUUID()}}));await foreign.create().refresh();assert.equal(foreign.saved(),null);assert.equal(foreign.count(),0);
});
test('secure journal write failures and corrupt journals prevent untracked mutations',async()=>{
 const f=fixture(),s=f.create();f.failWrite(true);await s.preview(f.id,1,'REGULAR');await s.retry();assert.equal(f.calls.length,0);f.failWrite(false);await s.retry();assert.ok(s.getSnapshot().quote);
 const corrupt=fixture(),blocked=corrupt.create();await corrupt.store.write('{corrupt');await blocked.refresh();await blocked.preview(corrupt.id,1,'REGULAR');assert.equal(corrupt.calls.length,0);assert.equal(corrupt.saved(),'{corrupt');
});
