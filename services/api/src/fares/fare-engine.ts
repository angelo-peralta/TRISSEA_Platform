import {type DistanceConfig,type PrivateConfig,type MatrixConfig,type FamilyKind,type Rounding,object,integer,label,uuid,invalid} from './fare-model';
import type {MatrixRow} from './fare-import';

export interface FareVersion {id:string;kind:FamilyKind;config:DistanceConfig|PrivateConfig|MatrixConfig;sourceVersion:string|null}
export interface FareInput {
  mode:'SIMULATION'|'PAYABLE'; service:'PER_PASSENGER'|'REGULAR'|'SPECIAL'|'SHARED'|'RESERVATION';
  origin:'PLAZA'|'OFF_PLAZA'|'POBLACION'|'UNKNOWN';destinationLabel:string|null;fareClass:'REGULAR'|'DISCOUNTED'|'MIXED';
  roadDistanceMetres:number|null;routeEvidence:'SYNTHETIC'|'PERMITTED_ROAD'|'UNVALIDATED';routeReference:string|null;
  passengerCount:number;capacity:number|null;referencePolicyVersionId:string;privatePolicyVersionId:string|null;
}
export function calculationInput(raw:unknown):FareInput{
  const b=object(raw,['mode','service','origin','destinationLabel','fareClass','roadDistanceMetres','routeEvidence','routeReference','passengerCount','capacity','referencePolicyVersionId','privatePolicyVersionId']);
  const choice=<T extends string>(v:unknown,values:readonly T[]):T=>{if(typeof v!=='string'||!values.includes(v as T))return invalid();return v as T;};
  return {mode:choice(b.mode,['SIMULATION','PAYABLE']),service:choice(b.service,['PER_PASSENGER','REGULAR','SPECIAL','SHARED','RESERVATION']),origin:choice(b.origin,['PLAZA','OFF_PLAZA','POBLACION','UNKNOWN']),destinationLabel:b.destinationLabel===null?null:label(b.destinationLabel,160),fareClass:choice(b.fareClass,['REGULAR','DISCOUNTED','MIXED']),roadDistanceMetres:b.roadDistanceMetres===null?null:integer(b.roadDistanceMetres,1,1_000_000),routeEvidence:choice(b.routeEvidence,['SYNTHETIC','PERMITTED_ROAD','UNVALIDATED']),routeReference:b.routeReference===null?null:label(b.routeReference),passengerCount:integer(b.passengerCount,1,100),capacity:b.capacity===null?null:integer(b.capacity,1,100),referencePolicyVersionId:uuid(b.referencePolicyVersionId),privatePolicyVersionId:b.privatePolicyVersionId===null?null:uuid(b.privatePolicyVersionId)};
}
export function roundRatio(numerator:bigint,denominator:bigint,rounding:Rounding){
  const n=rounding==='CENTAVO_CEIL'?(numerator+denominator-1n)/denominator:(numerator+denominator/2n)/denominator;
  if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))return invalid();return Number(n);
}
export function distanceFare(config:DistanceConfig,metres:number,discounted=false){
  const extra=Math.max(0,metres-config.includedMetres),billableExtraMetres=Math.ceil(extra/config.incrementMetres)*config.incrementMetres;
  const prices=discounted?config.discounted:config;if(!prices)return null;
  const uncappedCentavos=prices.baseCentavos+roundRatio(BigInt(billableExtraMetres)*BigInt(prices.rateCentavosPerKm),1000n,config.rounding);
  const referenceCentavos=config.maximumCentavos===null?uncappedCentavos:Math.min(uncappedCentavos,config.maximumCentavos);
  return {referenceCentavos,billableExtraMetres,uncappedCentavos,capApplied:referenceCentavos!==uncappedCentavos,rounding:config.rounding,reviewRequired:uncappedCentavos>=config.reviewThresholdCentavos};
}
/** All M3 outputs are administrative simulations. No request can open a payable capability. */
export function calculateFare(input:FareInput,reference:FareVersion,privatePolicy:FareVersion|null,rows:MatrixRow[]=[]){
  const details={input,referencePolicyVersionId:reference.id,privatePolicyVersionId:privatePolicy?.id??null,sourceVersion:reference.sourceVersion,routeDistanceMetres:input.roadDistanceMetres,routeEvidence:input.routeEvidence};
  const unavailable=(reason:string)=>({...details,method:'UNAVAILABLE' as const,reason,payable:false as const,simulationOnly:true as const,totalCentavos:null,referenceCentavos:null,reviewRequired:false,rounding:null});
  if(input.mode!=='SIMULATION')return unavailable('REAL_ACTIVATION_CLOSED');
  if(!['PER_PASSENGER','REGULAR'].includes(input.service))return unavailable('SERVICE_UNSUPPORTED');
  if(input.origin==='UNKNOWN'||input.fareClass==='MIXED')return unavailable('APPLICABILITY_UNSUPPORTED');
  if(reference.id!==input.referencePolicyVersionId||privatePolicy&&privatePolicy.id!==input.privatePolicyVersionId)return unavailable('POLICY_MISMATCH');
  let referenceCentavos:number,referenceMethod:'LGU_MATRIX'|'DISTANCE_PROPOSAL',rounding:Rounding='CENTAVO_HALF_UP',reviewRequired=false;
  let referenceDetails:unknown;
  if(input.origin==='PLAZA'||input.origin==='POBLACION'){
    if(reference.kind!=='LGU_MATRIX')return unavailable('EXACT_MATRIX_REQUIRED');
    const row=rows.find(r=>r.destinationLabel===input.destinationLabel&&r.category===(input.origin==='PLAZA'?'LISTED_AREA':'POBLACION'));
    if(!row)return unavailable('MATRIX_DESTINATION_UNSUPPORTED');
    referenceCentavos=input.fareClass==='DISCOUNTED'?row.discountedCentavos:row.regularCentavos;referenceMethod='LGU_MATRIX';referenceDetails=row;
  }else{
    if(reference.kind!=='DISTANCE_PROPOSAL')return unavailable('DISTANCE_POLICY_REQUIRED');
    if(!input.roadDistanceMetres||input.routeEvidence==='UNVALIDATED'||!input.routeReference)return unavailable('ROAD_DISTANCE_REQUIRED');
    const value=distanceFare(reference.config as DistanceConfig,input.roadDistanceMetres,input.fareClass==='DISCOUNTED');
    if(!value)return unavailable('DISCOUNT_RULE_UNAVAILABLE');
    ({referenceCentavos,rounding,reviewRequired}=value);referenceMethod='DISTANCE_PROPOSAL';referenceDetails=value;
  }
  if(input.service==='PER_PASSENGER'){
    if(input.privatePolicyVersionId!==null)return unavailable('PRIVATE_POLICY_NOT_APPLICABLE');
    return {...details,method:referenceMethod,referenceMethod,referenceDetails,rounding,referenceCentavos,totalCentavos:referenceCentavos*input.passengerCount,reviewRequired,payable:false as const,simulationOnly:true as const,reason:null};
  }
  if(!privatePolicy||privatePolicy.kind!=='PRIVATE_HIRE_PROPOSAL')return unavailable('PRIVATE_POLICY_REQUIRED');
  const config=privatePolicy.config as PrivateConfig;
  if(!input.capacity||input.capacity>5||input.capacity>config.simulationCapacity||input.passengerCount>input.capacity)return unavailable('CAPACITY_UNSUPPORTED');
  if(!input.roadDistanceMetres||input.routeEvidence==='UNVALIDATED'||!input.routeReference)return unavailable('ROAD_DISTANCE_REQUIRED');
  const band=config.bands.find(b=>b.upToMetres===null||input.roadDistanceMetres!<=b.upToMetres);
  if(!band)return unavailable('DISTANCE_BAND_UNAVAILABLE');
  const compensationBps=input.fareClass==='DISCOUNTED'?config.discountedCompensationBps:band.compensationBps;
  if(compensationBps===null)return unavailable('DISCOUNT_COMPENSATION_UNAPPROVED');
  const unusedSeats=input.capacity-input.passengerCount,occupiedCentavos=input.passengerCount*referenceCentavos;
  const compensationCentavos=roundRatio(BigInt(unusedSeats)*BigInt(referenceCentavos)*BigInt(compensationBps),10000n,config.rounding);
  return {...details,method:'PRIVATE_HIRE_PROPOSAL' as const,referenceMethod,referenceDetails,rounding:config.rounding,referenceCentavos,totalCentavos:occupiedCentavos+compensationCentavos,occupiedCentavos,unusedSeats,compensationBps,compensationCentavos,capacityPolicyReference:config.capacityPolicyReference,discountAssumption:input.fareClass==='DISCOUNTED'?config.discountAssumption:null,reviewRequired,payable:false as const,simulationOnly:true as const,reason:null};
}
