import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRideClient,RideApiError} from '../src/ride-client';
const id='00000000-0000-4000-8000-000000000001';
test('simulation client is purpose-bound, validates before sending, never retries a mutation',async()=>{
 let count=0;
 const c=createRideClient('http://127.0.0.1:4104/v1','PASSENGER',async(url,init)=>{
  count++;assert.equal(url,'http://127.0.0.1:4104/v1/simulation/passenger/quotes');assert.equal(init?.credentials,'omit');assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer synthetic');return new Response('{}',{status:409});
 });
 await assert.rejects(c.request('m4Offers',{accessToken:'synthetic'}),e=>e instanceof RideApiError&&e.status===403);
 await assert.rejects(c.request('m4Quote',{accessToken:'synthetic',idempotencyKey:id,body:{scenarioId:'../foreign',passengerCount:1,fareClass:'REGULAR'}}),e=>e instanceof RideApiError&&e.status===400);assert.equal(count,0);
 await assert.rejects(c.request('m4Quote',{accessToken:'synthetic',idempotencyKey:id,body:{scenarioId:id,passengerCount:1,fareClass:'REGULAR'}}),e=>e instanceof RideApiError&&e.status===409);assert.equal(count,1);
});
test('simulation client rejects operational server envelopes and accepts a declined offer without ride access',async()=>{
 const unsafe=createRideClient('http://127.0.0.1:4104/v1','PASSENGER',async()=>Response.json({items:[],participantReference:'SYNTHETIC',available:false,simulationOnly:true,operationalServicesEnabled:true}));
 await assert.rejects(unsafe.request('m4PASSENGERScenarios',{accessToken:'synthetic'}),e=>e instanceof RideApiError&&e.status===502);
 const driver=createRideClient('http://127.0.0.1:4104/v1','DRIVER',async()=>Response.json({outcome:'DECLINED',ride:null}));
 assert.equal((await driver.request('m4DriverAction',{accessToken:'synthetic',rideId:id,action:'DECLINE',idempotencyKey:id,body:{expectedVersion:3,offerId:id}})).ride,null);
});
