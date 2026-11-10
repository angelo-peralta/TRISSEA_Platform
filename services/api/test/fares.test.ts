import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {importMatrix} from '../src/fares/fare-import';
import {calibrate} from '../src/fares/fare-calibration';
import {calculateFare,calculationInput,distanceFare,type FareInput,type FareVersion} from '../src/fares/fare-engine';
import {configuration,defaultDistance,defaultPrivate,effectiveDates} from '../src/fares/fare-model';
const csv=readFileSync(resolve(__dirname,'../../../../data/fare-matrix/tuguegarao-fare-matrix-user-supplied.csv'),'utf8');
const matrix=importMatrix(csv),matrixVersion:FareVersion={id:'00000000-0000-4000-8000-000000000001',kind:'LGU_MATRIX',config:{importId:'00000000-0000-4000-8000-000000000004'},sourceVersion:matrix.sha256},distance:FareVersion={id:'00000000-0000-4000-8000-000000000002',kind:'DISTANCE_PROPOSAL',config:defaultDistance,sourceVersion:null},privatePolicy:FareVersion={id:'00000000-0000-4000-8000-000000000003',kind:'PRIVATE_HIRE_PROPOSAL',config:defaultPrivate,sourceVersion:null};
const input:FareInput={mode:'SIMULATION',service:'REGULAR',origin:'OFF_PLAZA',destinationLabel:null,fareClass:'REGULAR',roadDistanceMetres:7001,routeEvidence:'SYNTHETIC',routeReference:'EXAMPLE_NOT_MEASURED',passengerCount:1,capacity:5,referencePolicyVersionId:distance.id,privatePolicyVersionId:privatePolicy.id};
test('complete original source, exact amounts, labels, provenance and malformed imports',()=>{
  assert.equal(matrix.rows.length,43);assert.equal(matrix.rows[0]!.destinationLabel,'Namabbalan Sur');assert.equal(matrix.rows[0]!.regularCentavos,3300);assert.equal(matrix.rows[0]!.discountedCentavos,2700);assert.equal(matrix.rows.at(-1)!.regularCentavos,2200);
  for(const bad of [csv.replace('33.00','33.001'),csv.replace('33.00','-1.00'),csv.replace('27.00','99.00'),csv.replace('Dadda','Tagga'),csv.replace('UNKNOWN','PLAZA'),csv.split('\n').slice(0,-2).join('\n'),csv+'\n'])assert.throws(()=>importMatrix(bad));
  assert.equal(importMatrix(csv.replace('Namabbalan Sur','"Namabbalan Sur"')).rows[0]!.destinationLabel,'Namabbalan Sur');
});
test('distance ceiling and deterministic money at boundaries; no default maximum',()=>{
  for(const [metres,cents]of [[1,2200],[3000,2200],[3001,2300],[3500,2300],[3501,2400],[7000,3000],[7001,3100],[42000,10000],[100000,21600]] as Array<[number,number]>)assert.equal(distanceFare(defaultDistance,metres)!.referenceCentavos,cents);
  assert.equal(distanceFare({...defaultDistance,rateCentavosPerKm:1,incrementMetres:1},3500)!.referenceCentavos,2201);
  assert.equal(distanceFare({...defaultDistance,rateCentavosPerKm:1,incrementMetres:1,rounding:'CENTAVO_CEIL'},3001)!.referenceCentavos,2201);
  assert.equal(distanceFare(defaultDistance,42000)!.reviewRequired,true);
});
test('exact Plaza priority, discounts and no reverse-direction assumption',()=>{
  const base={...input,origin:'PLAZA' as const,destinationLabel:'Namabbalan Sur',service:'PER_PASSENGER' as const,referencePolicyVersionId:matrixVersion.id,privatePolicyVersionId:null};
  assert.equal(calculateFare(base,matrixVersion,null,matrix.rows).totalCentavos,3300);
  assert.equal(calculateFare({...base,fareClass:'DISCOUNTED'},matrixVersion,null,matrix.rows).totalCentavos,2700);
  assert.equal(calculateFare({...base,referencePolicyVersionId:distance.id},distance,null).reason,'EXACT_MATRIX_REQUIRED');
  assert.equal(calculateFare({...base,origin:'UNKNOWN'},matrixVersion,null,matrix.rows).method,'UNAVAILABLE');
});
test('exclusive formula once, example 30 + 4 * 30 * 25% = 60 and 1–5 passengers',()=>{
  const proposal={...distance,config:{...defaultDistance,baseCentavos:3000,rateCentavosPerKm:0}};
  for(let n=1;n<=5;n++)assert.equal(calculateFare({...input,passengerCount:n},proposal,privatePolicy).totalCentavos,n*3000+(5-n)*750);
  assert.equal(calculateFare({...input,roadDistanceMetres:3000},proposal,privatePolicy).totalCentavos,4200);
  assert.equal(calculateFare({...input,roadDistanceMetres:7000},proposal,privatePolicy).totalCentavos,4800);
  assert.equal(calculateFare(input,distance,privatePolicy).totalCentavos,6200);
});
test('unavailable real quotes, route, unsupported service/capacity/discount/mixed cases',()=>{
  for(const change of [{mode:'PAYABLE'},{roadDistanceMetres:null},{routeEvidence:'UNVALIDATED'},{routeReference:null},{capacity:null},{capacity:6},{passengerCount:6},{fareClass:'DISCOUNTED'},{fareClass:'MIXED'},{service:'SHARED'},{origin:'UNKNOWN'}])assert.equal(calculateFare({...input,...change} as FareInput,distance,privatePolicy).method,'UNAVAILABLE');
  assert.throws(()=>calculationInput({...input,passengerCount:0}));assert.throws(()=>calculationInput({...input,role:'CITY_FARE_EDITOR'}));
  assert.throws(()=>configuration('PRIVATE_HIRE_PROPOSAL',{...defaultPrivate,bands:[{upToMetres:7000,compensationBps:1000},{upToMetres:3000,compensationBps:1000},{upToMetres:null,compensationBps:2500}]}));
  assert.throws(()=>configuration('DISTANCE_PROPOSAL',{...defaultDistance,baseCentavos:-1}));assert.throws(()=>configuration('PRIVATE_HIRE_PROPOSAL',{...defaultPrivate,simulationCapacity:6}));
  assert.throws(()=>effectiveDates('2026-13-40T00:00:00.000Z',null));assert.throws(()=>effectiveDates(null,'2026-11-10T00:00:00.000Z'));assert.throws(()=>effectiveDates('2026-11-11T00:00:00.000Z','2026-11-10T00:00:00.000Z'));
});
test('explicit discounted and maximum assumptions do not change official matrix amounts',()=>{
 const discounted={...distance,config:{...defaultDistance,discounted:{baseCentavos:1800,rateCentavosPerKm:100,assumption:'ILLUSTRATIVE_ONLY'}}},privateDiscount={...privatePolicy,config:{...defaultPrivate,discountedCompensationBps:1000,discountAssumption:'ILLUSTRATIVE_ONLY_NO_STACKING'}};
 const result=calculateFare({...input,fareClass:'DISCOUNTED'},discounted,privateDiscount);assert.equal(result.referenceCentavos,2250);assert.equal(result.totalCentavos,3150);
 assert.equal(distanceFare({...defaultDistance,maximumCentavos:2500},10000)!.capApplied,true);assert.equal(distanceFare(defaultDistance,10000)!.referenceCentavos,3600);assert.equal(matrix.rows[0]!.discountedCentavos,2700);
});
test('calibration does not invent distances and excludes separate Poblacion row',()=>{
  const result=calibrate(matrix.rows,defaultDistance,{measurements:[],candidateRatesCentavosPerKm:[100,200,300]});assert.equal(result.listedDestinations,42);assert.equal(result.averageMeasuredRoadMetres,null);assert.equal(result.missingDestinations.length,42);assert.equal(result.candidates[0]!.meanAbsoluteErrorCentavos,null);
  const measured=calibrate(matrix.rows,defaultDistance,{measurements:[{destinationLabel:'Namabbalan Sur',roadDistanceMetres:10000,routeReference:'SYNTHETIC_ONLY'}],candidateRatesCentavosPerKm:[200]});assert.equal(measured.candidates[0]!.predictions[0]!.errorCentavos,300);assert.equal(matrix.rows[0]!.regularCentavos,3300);
});
