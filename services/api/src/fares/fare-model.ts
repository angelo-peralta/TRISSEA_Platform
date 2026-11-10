import {BadRequestException} from '@nestjs/common';

export type Rounding = 'CENTAVO_HALF_UP' | 'CENTAVO_CEIL';
export interface DistanceConfig {
  baseCentavos: number; includedMetres: number; rateCentavosPerKm: number; incrementMetres: number;
  rounding: Rounding; reviewThresholdCentavos: number; maximumCentavos: number | null;
  discounted: {baseCentavos: number; rateCentavosPerKm: number; assumption: string} | null;
}
export interface PrivateConfig {
  simulationCapacity: number; capacityPolicyReference: string;
  bands: Array<{upToMetres: number | null; compensationBps: number}>;
  rounding: Rounding; discountedCompensationBps: number | null; discountAssumption: string | null;
}
export interface MatrixConfig {importId: string}
export type FareConfig = DistanceConfig | PrivateConfig | MatrixConfig;
export type FamilyKind = 'LGU_MATRIX' | 'DISTANCE_PROPOSAL' | 'PRIVATE_HIRE_PROPOSAL';
export const defaultDistance: DistanceConfig = {baseCentavos:2200,includedMetres:3000,rateCentavosPerKm:200,incrementMetres:500,rounding:'CENTAVO_HALF_UP',reviewThresholdCentavos:10000,maximumCentavos:null,discounted:null};
export const defaultPrivate: PrivateConfig = {simulationCapacity:5,capacityPolicyReference:'SIMULATION_ONLY_UNVERIFIED',bands:[{upToMetres:3000,compensationBps:1000},{upToMetres:7000,compensationBps:1500},{upToMetres:null,compensationBps:2500}],rounding:'CENTAVO_HALF_UP',discountedCompensationBps:null,discountAssumption:null};
export function invalid(): never {throw new BadRequestException('Invalid fare input');}
export function object(raw: unknown, keys: readonly string[]): Record<string, unknown> {
  if(!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(k=>!keys.includes(k)))return invalid();
  return raw as Record<string,unknown>;
}
export function integer(value:unknown,min=0,max=100_000_000):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)return invalid();return value;}
export function label(value:unknown,max=200):string {if(typeof value!=='string'||!value.trim()||value.length>max||Array.from(value).some(c=>c.charCodeAt(0)<32))return invalid();return value;}
export function uuid(value:unknown):string {if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return invalid();return value.toLowerCase();}
function rounding(value:unknown):Rounding {if(value!=='CENTAVO_HALF_UP'&&value!=='CENTAVO_CEIL')return invalid();return value;}
export function configuration(kind:FamilyKind,raw:unknown):FareConfig {
  if(kind==='LGU_MATRIX'){const b=object(raw,['importId']);return {importId:uuid(b.importId)};}
  if(kind==='DISTANCE_PROPOSAL'){
    const b=object(raw,['baseCentavos','includedMetres','rateCentavosPerKm','incrementMetres','rounding','reviewThresholdCentavos','maximumCentavos','discounted']);
    const discounted=b.discounted===null?null:object(b.discounted,['baseCentavos','rateCentavosPerKm','assumption']);
    return {baseCentavos:integer(b.baseCentavos),includedMetres:integer(b.includedMetres),rateCentavosPerKm:integer(b.rateCentavosPerKm),incrementMetres:integer(b.incrementMetres,1),rounding:rounding(b.rounding),reviewThresholdCentavos:integer(b.reviewThresholdCentavos,1),maximumCentavos:b.maximumCentavos===null?null:integer(b.maximumCentavos),discounted:discounted?{baseCentavos:integer(discounted.baseCentavos),rateCentavosPerKm:integer(discounted.rateCentavosPerKm),assumption:label(discounted.assumption)}:null};
  }
  const b=object(raw,['simulationCapacity','capacityPolicyReference','bands','rounding','discountedCompensationBps','discountAssumption']);
  if(!Array.isArray(b.bands)||b.bands.length<1||b.bands.length>20)return invalid();
  let previous=0;
  const bands=b.bands.map((raw,index)=>{const band=object(raw,['upToMetres','compensationBps']),last=index=== (b.bands as unknown[]).length-1;
    if(last?band.upToMetres!==null:band.upToMetres===null)return invalid();
    const upToMetres=last?null:integer(band.upToMetres,previous+1);if(upToMetres!==null)previous=upToMetres;
    return {upToMetres,compensationBps:integer(band.compensationBps,0,10000)};
  });
  const discountedCompensationBps=b.discountedCompensationBps===null?null:integer(b.discountedCompensationBps,0,10000);
  const discountAssumption=b.discountAssumption===null?null:label(b.discountAssumption);
  if((discountedCompensationBps===null)!==(discountAssumption===null))return invalid();
  return {simulationCapacity:integer(b.simulationCapacity,1,5),capacityPolicyReference:label(b.capacityPolicyReference),bands,rounding:rounding(b.rounding),discountedCompensationBps,discountAssumption};
}
export function effectiveDates(from:unknown,to:unknown){
  const date=(v:unknown)=>{if(v===null)return null;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)return invalid();return v;};
  const effectiveFrom=date(from),effectiveUntil=date(to);if(effectiveUntil&&(!effectiveFrom||effectiveUntil<=effectiveFrom))return invalid();return {effectiveFrom,effectiveUntil};
}
