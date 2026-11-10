import test from 'node:test';
import assert from 'node:assert/strict';
import {createFareClient,FareApiError} from '../src/fare-client';
const cityId='00000000-0000-4000-8000-000000000001';
test('fare client confines authenticated transport to same-origin BFF and validates permission/activation envelopes',async()=>{
 let calls=0;
 const client=createFareClient(async(input,init)=>{calls++;assert.equal(input,'/v1/admin/fares/cities/'+cityId+'/editor/policies');assert.equal(init?.credentials,'same-origin');assert.equal(init?.cache,'no-store');return Response.json({items:[],nextCursor:null,defaults:{distance:{baseCentavos:2200,includedMetres:3000,rateCentavosPerKm:200,incrementMetres:500,rounding:'CENTAVO_HALF_UP',reviewThresholdCentavos:10000,maximumCentavos:null,discounted:null},privateHire:{simulationCapacity:5,capacityPolicyReference:'SIMULATION_ONLY',bands:[{upToMetres:null,compensationBps:2500}],rounding:'CENTAVO_HALF_UP',discountedCompensationBps:null,discountAssumption:null}},activationStatus:'CLOSED',simulationOnly:true});});
 const response=await client.request('m3ListFarePolicies',{cityId});assert.equal(response.activationStatus,'CLOSED');assert.equal(calls,1);
 await assert.rejects(client.request('m3ListFarePolicies',{cityId:'../other'}),e=>e instanceof FareApiError&&e.status===400);assert.equal(calls,1);
});
test('fare transport rejects unsafe server snapshots and does not retry mutations automatically',async()=>{
 let calls=0;const client=createFareClient(async()=>{calls++;return Response.json({snapshot:{payable:true,result:{payable:true}}});});
 await assert.rejects(client.request('m3GetFareSnapshot',{cityId,snapshotId:cityId}),e=>e instanceof FareApiError&&e.status===502);assert.equal(calls,1);
 const unavailable=createFareClient(async()=>new Response('{}',{status:403}));await assert.rejects(unavailable.request('m3ListFareReviewPolicies',{cityId}),e=>e instanceof FareApiError&&e.status===403);
});
