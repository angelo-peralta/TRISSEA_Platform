import type {MatrixRow} from './fare-import';
import {distanceFare} from './fare-engine';
import {type DistanceConfig,integer,label,object,invalid} from './fare-model';

export function calibrationInput(raw:unknown){
  const b=object(raw,['measurements','candidateRatesCentavosPerKm']);
  if(!Array.isArray(b.measurements)||b.measurements.length>42||!Array.isArray(b.candidateRatesCentavosPerKm)||b.candidateRatesCentavosPerKm.length<1||b.candidateRatesCentavosPerKm.length>20)return invalid();
  const seen=new Set<string>();
  const measurements=b.measurements.map(raw=>{const m=object(raw,['destinationLabel','roadDistanceMetres','routeReference']);const destinationLabel=label(m.destinationLabel,160);if(seen.has(destinationLabel))return invalid();seen.add(destinationLabel);return {destinationLabel,roadDistanceMetres:integer(m.roadDistanceMetres,1,1_000_000),routeReference:label(m.routeReference)};});
  return {measurements,candidateRatesCentavosPerKm:b.candidateRatesCentavosPerKm.map(v=>integer(v))};
}
const average=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[mid]!:(sorted[mid-1]!+sorted[mid]!)/2):null;};
export function calibrate(rows:MatrixRow[],config:DistanceConfig,input:ReturnType<typeof calibrationInput>){
  const listed=rows.filter(r=>r.category==='LISTED_AREA');
  if(input.measurements.some(m=>!listed.some(r=>r.destinationLabel===m.destinationLabel)))return invalid();
  const fares=listed.map(r=>r.regularCentavos),discounted=listed.map(r=>r.discountedCentavos);
  return {listedDestinations:listed.length,measuredDestinations:input.measurements.length,missingDestinations:listed.filter(r=>!input.measurements.some(m=>m.destinationLabel===r.destinationLabel)).map(r=>r.destinationLabel),averageFareCentavos:average(fares),medianFareCentavos:median(fares),averageDiscountedCentavos:average(discounted),medianDiscountedCentavos:median(discounted),averageMeasuredRoadMetres:average(input.measurements.map(m=>m.roadDistanceMetres)),outlierDefinition:'Absolute percentage error >= 20%; diagnostic only',candidates:input.candidateRatesCentavosPerKm.map(rate=>{
    const predictions=input.measurements.map(m=>{const row=listed.find(r=>r.destinationLabel===m.destinationLabel)!;const predictedCentavos=distanceFare({...config,rateCentavosPerKm:rate},m.roadDistanceMetres)!.referenceCentavos,errorCentavos=predictedCentavos-row.regularCentavos,absoluteErrorCentavos=Math.abs(errorCentavos),percentageError=row.regularCentavos===0?null:100*errorCentavos/row.regularCentavos;return {...m,actualCentavos:row.regularCentavos,predictedCentavos,errorCentavos,absoluteErrorCentavos,percentageError,absolutePercentageError:percentageError===null?null:Math.abs(percentageError),effectiveCentavosPerKm:row.regularCentavos*1000/m.roadDistanceMetres,effectiveRateDifferenceCentavosPerKm:row.regularCentavos*1000/m.roadDistanceMetres-rate,outlier:percentageError!==null&&Math.abs(percentageError)>=20};});
    return {rateCentavosPerKm:rate,meanAbsoluteErrorCentavos:average(predictions.map(p=>p.absoluteErrorCentavos)),meanAbsolutePercentageError:average(predictions.flatMap(p=>p.absolutePercentageError===null?[]:[p.absolutePercentageError])),predictions};
  })};
}
