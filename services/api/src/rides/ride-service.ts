import {randomInt} from 'node:crypto';
import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {and,desc,eq,sql} from 'drizzle-orm';
import type {AuthorizedWork} from '../auth/policy/authorization.service';
import type {PolicyTransaction} from '../auth/policy/authorization-database';
import {PassengerSecrets} from '../auth/passenger/passenger-settings';
import {idempotency} from '../auth/passenger/primitives';
import {integer,object,uuid,invalid} from '../fares/fare-model';
import {calculateFare,type FareVersion} from '../fares/fare-engine';
import type {MatrixRow} from '../fares/fare-import';
import * as s from '../database/ride-schema';

type Context=AuthorizedWork;
interface Participant {user_id:string;purpose:'PASSENGER'|'DRIVER';city_tenant_id:string;toda_id:string;reference:string;available:boolean;capacity:number|null}
interface FareContext {scenario:{id:string;city_tenant_id:string;toda_id:string;reference:string;pickup:string;destination:string;origin:'PLAZA'|'OFF_PLAZA'|'POBLACION';destination_label:string|null;road_metres:number;capacity:number;version:number;quote_seconds:number};reference:FareVersion;privatePolicy:FareVersion;referenceRevision:number;privateRevision:number;rows:MatrixRow[]}
const terminal=['COMPLETED','CANCELLED','EXPIRED','FAILED','NO_DRIVER_AVAILABLE'];
export class RideService{
 constructor(readonly secrets:PassengerSecrets){}
 async scope(c:Context):Promise<Participant>{
  const [row]=await c.tx.execute(sql`SELECT simulation.context() AS context`);if(!row?.context)throw new ForbiddenException('Simulation enrollment required');const scope=row.context as unknown as Participant;
  // Extend M2's current-session locks to this server-selected synthetic city/TODA.
  await c.tx.execute(sql`SELECT set_config('trissea.city_tenant_id',${scope.city_tenant_id},true),set_config('trissea.toda_id',${scope.toda_id},true)`);
  await c.tx.execute(sql`SELECT identity.lock_authorization_context(${c.userId}::uuid,${c.sessionId}::uuid,${scope.city_tenant_id}::uuid,${scope.toda_id}::uuid,NULL::text)`);
  const [current]=await c.tx.execute(sql`SELECT simulation.allowed(${scope.city_tenant_id}::uuid,${scope.toda_id}::uuid,${scope.purpose}) AS allowed`);if(!current?.allowed)throw new ForbiddenException('Simulation scope unavailable');return scope;
 }
 private async mutation(c:Context,operation:string,key:unknown,body:unknown,work:()=>Promise<unknown>){
  const scope=await this.scope(c),keyDigest=this.secrets.coordinate('m4-key',operation,c.userId,scope.purpose,scope.city_tenant_id,scope.toda_id,idempotency(key)),bodyDigest=this.secrets.coordinate('m4-body',body);
  await c.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyDigest},411))`);
  const [prior]=await c.tx.select().from(s.simulatedKeys).where(and(eq(s.simulatedKeys.userId,c.userId),eq(s.simulatedKeys.operation,operation),eq(s.simulatedKeys.keyDigest,keyDigest)));
  if(prior){if(prior.bodyDigest!==bodyDigest)throw new ConflictException('IDEMPOTENCY_CONFLICT');return JSON.parse(this.secrets.identity.decrypt(String(prior.response.encrypted),'m4-response:'+keyDigest)) as Record<string,unknown>;}
  try{const response=JSON.parse(JSON.stringify(await work())) as Record<string,unknown>;await c.tx.insert(s.simulatedKeys).values({userId:c.userId,operation,keyDigest,bodyDigest,response:{encrypted:this.secrets.identity.encrypt(JSON.stringify(response),'m4-response:'+keyDigest)}});return response;}
  catch(error){const e=error as {code?:string;cause?:{code?:string}},code=e.code??e.cause?.code;if(['23505','23514','40P01'].includes(code??''))throw new ConflictException('SIMULATION_CONFLICT');if(['42501','P0002'].includes(code??''))throw new NotFoundException('Simulation resource unavailable');throw error;}
 }
 async scenarios(c:Context){const scope=await this.scope(c);return {items:await c.tx.select().from(s.simulatedScenarios).where(and(eq(s.simulatedScenarios.cityTenantId,scope.city_tenant_id),eq(s.simulatedScenarios.todaId,scope.toda_id))).orderBy(s.simulatedScenarios.id).limit(50),participantReference:scope.reference,available:scope.available,simulationOnly:true,operationalServicesEnabled:false};}
 async preview(c:Context,raw:unknown,key:unknown){const b=object(raw,['scenarioId','passengerCount','fareClass']),scenarioId=uuid(b.scenarioId),passengerCount=integer(b.passengerCount,1,5);if(!['REGULAR','DISCOUNTED'].includes(b.fareClass as string))return invalid();const fareClass=b.fareClass as 'REGULAR'|'DISCOUNTED';
  return this.mutation(c,'PREVIEW',key,{scenarioId,passengerCount,fareClass},async()=>{
   const [row]=await c.tx.execute(sql`SELECT simulation.fare_context(${scenarioId}::uuid) AS context`),f=row?.context as unknown as FareContext;if(!f)throw new NotFoundException();
   const scenario=f.scenario,result=calculateFare({mode:'SIMULATION',service:'REGULAR',origin:scenario.origin,destinationLabel:scenario.destination_label,fareClass,roadDistanceMetres:scenario.road_metres,routeEvidence:'SYNTHETIC',routeReference:scenario.reference,passengerCount,capacity:scenario.capacity,referencePolicyVersionId:f.reference.id,privatePolicyVersionId:f.privatePolicy.id},f.reference,f.privatePolicy,f.rows);
   if(result.method==='UNAVAILABLE')throw new ConflictException('FARE_UNAVAILABLE');
   const [clock]=await c.tx.execute(sql`SELECT clock_timestamp() AS now`),now=new Date(String(clock!.now)),expiresAt=new Date(now.getTime()+scenario.quote_seconds*1000);
   const snapshot={...result,pickup:scenario.pickup,destination:scenario.destination,scenarioReference:scenario.reference,quoteTimestamp:now.toISOString(),quoteExpiry:expiresAt.toISOString(),paymentMethod:'CASH_SIMULATION'};
   const [quote]=await c.tx.insert(s.simulatedQuotes).values({userId:c.userId,scenarioId,cityTenantId:scenario.city_tenant_id,todaId:scenario.toda_id,scenarioVersion:scenario.version,referencePolicyId:f.reference.id,privatePolicyId:f.privatePolicy.id,referenceRevision:f.referenceRevision,privateRevision:f.privateRevision,passengerCount,fareClass,snapshot,createdAt:now,expiresAt}).returning();return {quote,simulationOnly:true};
  });
 }
 async confirm(c:Context,raw:unknown,key:unknown){const b=object(raw,['quoteId']),quoteId=uuid(b.quoteId);return this.mutation(c,'CONFIRM',key,{quoteId},async()=>{const code=String(randomInt(0,1_000_000)).padStart(6,'0'),digest=this.secrets.coordinate('m4-pickup',quoteId,code),ciphertext=this.secrets.identity.encrypt(code,'m4-pickup:'+quoteId);const [row]=await c.tx.execute(sql`SELECT simulation.confirm(${quoteId}::uuid,${digest},${ciphertext}) AS id`);return this.snapshot(c,String(row!.id));});}
 async snapshot(c:Context,id:string):Promise<Record<string,unknown>>{await this.scope(c);const [ride]=await c.tx.select().from(s.simulatedRides).where(eq(s.simulatedRides.id,uuid(id)));if(!ride)throw new NotFoundException('Ride unavailable');
  // Driver-visible quote data is resolved through a purpose-bound definer, not passenger quote RLS.
  const [data]=await c.tx.execute(sql`SELECT simulation.snapshot(${ride.id}::uuid) AS snapshot`);if(!data?.snapshot)throw new NotFoundException('Ride unavailable');const value=data.snapshot as Record<string,unknown>;
  return {...value,pickupCode:ride.passengerId===c.userId&&!ride.pickupVerified&&!terminal.includes(ride.state)&&ride.pickupCiphertext?this.secrets.identity.decrypt(ride.pickupCiphertext,'m4-pickup:'+ride.quoteId):null,simulationOnly:true,operationalServicesEnabled:false};
 }
 async current(c:Context){await this.scope(c);const [row]=await c.tx.execute(sql`SELECT simulation.current_ride() AS id`);return {ride:row?.id?await this.snapshot(c,String(row.id)):null,simulationOnly:true};}
 async recent(c:Context,raw:unknown){const scope=await this.scope(c),b=object(raw,['after']),after=b.after===undefined?null:uuid(b.after),t=s.simulatedRides;
  const owned=scope.purpose==='PASSENGER'?eq(t.passengerId,c.userId):eq(t.driverId,c.userId);
  // Resolve the UUID cursor in PostgreSQL to preserve sub-millisecond timestamps.
  // An unknown or unowned cursor cannot anchor this account's history.
  const before=after?sql`(${t.createdAt},${t.id}) < (SELECT ${t.createdAt},${t.id} FROM ${t} WHERE ${and(eq(t.id,after),owned)})`:undefined;
  const rows=await c.tx.select({id:t.id,state:t.state,version:t.version,createdAt:t.createdAt}).from(t).where(and(owned,before)).orderBy(desc(t.createdAt),desc(t.id)).limit(21);return {items:rows.slice(0,20),nextCursor:rows.length>20?rows[19]!.id:null,simulationOnly:true};
 }
 async offers(c:Context){await this.scope(c);const rows=await c.tx.select().from(s.simulatedOffers).where(and(eq(s.simulatedOffers.driverId,c.userId),eq(s.simulatedOffers.state,'PENDING'))).orderBy(s.simulatedOffers.id).limit(20);return {items:await Promise.all(rows.map(async offer=>({offer,ride:await this.snapshot(c,offer.rideId)}))),simulationOnly:true};}
 async command(c:Context,id:unknown,action:string,raw:unknown,key:unknown){const rideId=uuid(id),b=object(raw,['expectedVersion','offerId','pickupCode']);const expectedVersion=integer(b.expectedVersion,1),offerId=b.offerId===undefined?null:uuid(b.offerId),code=b.pickupCode;
  if(code!==undefined&&(typeof code!=='string'||!/^\d{6}$/.test(code)))return invalid();
  if(!['ACCEPT','DECLINE','CANCEL','EN_ROUTE','ARRIVED','VERIFY_PICKUP','START','COMPLETE','CASH'].includes(action))return invalid();
  return this.mutation(c,action,key,{rideId,expectedVersion,offerId,proofDigest:code===undefined?null:this.secrets.coordinate('m4-input-proof',code)},async()=>{
   const [ride]=await c.tx.select().from(s.simulatedRides).where(eq(s.simulatedRides.id,rideId));if(!ride)throw new NotFoundException('Ride unavailable');
   const digest=code===undefined?null:this.secrets.coordinate('m4-pickup',ride.quoteId,code);
   const [result]=await c.tx.execute(sql`SELECT simulation.command(${rideId}::uuid,${expectedVersion},${action},${offerId}::uuid,${digest}) AS outcome`);
   return {outcome:String(result!.outcome),ride:action==='DECLINE'?null:await this.snapshot(c,rideId)};
  });
 }
 async availability(c:Context,raw:unknown,key:unknown){const b=object(raw,['available']);if(typeof b.available!=='boolean')return invalid();return this.mutation(c,'AVAILABILITY',key,b,async()=>{await c.tx.execute(sql`SELECT simulation.availability(${b.available}::boolean)`);return {available:b.available,simulationOnly:true,operationalServicesEnabled:false};});}
 async receipt(c:Context,id:string){const ride=await this.snapshot(c,id);if(!ride.receipt)throw new NotFoundException('Receipt unavailable');return {receipt:ride.receipt,simulationOnly:true};}
 async tick(tx:PolicyTransaction){await tx.execute(sql`SELECT simulation.tick()`);}
}
