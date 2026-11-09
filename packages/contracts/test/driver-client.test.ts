import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDriverClient,DriverApiError } from '../src/driver-client';
import { createPassengerClient,PassengerApiError } from '../src/passenger-client';
const binding={clientPurpose:'DRIVER' as const,deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')};
test('driver challenge status automatically sends DRIVER purpose with secret binding in headers',async()=>{
 const challengeId=randomUUID(),sdk=createDriverClient('http://localhost:4101/v1',async(url,init)=>{
  assert.equal(url,`http://localhost:4101/v1/auth/phone/challenges/${challengeId}`);const headers=init!.headers as Record<string,string>;assert.equal(headers['X-Client-Purpose'],'DRIVER');assert.equal(headers['x-client-proof']??headers['X-Client-Proof'],binding.clientProof);assert.equal(init?.credentials,'omit');
  return new Response(JSON.stringify({challengeId,expiresAt:new Date().toISOString(),resendAfter:new Date().toISOString(),clientPurpose:'DRIVER',deliveryMode:'MOCK',state:'PENDING'}));
 });assert.equal((await sdk.request('getDriverChallengeStatus',{challengeId,deviceId:binding.deviceId,clientProof:binding.clientProof})).clientPurpose,'DRIVER');
});
test('stateless passenger and driver transports reject cross-purpose credential bodies before network',async()=>{
 let calls=0;const network:typeof fetch=async()=>{calls++;throw new Error('Unexpected transport');};
 const driver=createDriverClient('http://localhost:4101/v1',network),passenger=createPassengerClient('http://localhost:4101/v1',network),input={body:{...binding,refreshToken:randomBytes(48).toString('base64url')},idempotencyKey:randomUUID()};
 // Deliberately exercise an untyped JS caller as well as compile-time purpose separation.
 const invoke=driver.request as (name:string,input:unknown)=>Promise<unknown>;
 await assert.rejects(invoke('refreshDriverSession',{...input,body:{...input.body,clientPurpose:'PASSENGER'}}),e=>e instanceof DriverApiError&&e.status===400);
 const invokePassenger=passenger.request as (name:string,input:unknown)=>Promise<unknown>;
 await assert.rejects(invokePassenger('refreshPassengerSession',input),e=>e instanceof PassengerApiError&&e.status===400);assert.equal(calls,0);
});
test('driver transport rejects a validly shaped passenger challenge response and exposes no private response',async()=>{
 const sdk=createDriverClient('http://localhost:4101/v1',async()=>new Response(JSON.stringify({challengeId:randomUUID(),expiresAt:new Date().toISOString(),resendAfter:new Date().toISOString(),clientPurpose:'PASSENGER',deliveryMode:'MOCK'}),{status:202}));
 await assert.rejects(sdk.request('requestDriverOtp',{body:{...binding,phone:'+639990000001'},idempotencyKey:randomUUID()}),e=>e instanceof DriverApiError&&e.status===502);
});

test('verification list cursor is optional and travels in the query, with no implicit credentials or retries',async()=>{
 const after=randomUUID(),seen:string[]=[],sdk=createDriverClient('http://localhost:4104/v1',async(url,init)=>{seen.push(String(url));assert.equal((init?.headers as Record<string,string>).after,undefined);assert.equal(init?.credentials,'omit');return new Response(JSON.stringify({items:[],nextCursor:null,source:'SYNTHETIC_ONLY'}));});
 await sdk.request('listDriverVerificationCases',{accessToken:'synthetic-transport-only'});await sdk.request('listDriverVerificationCases',{accessToken:'synthetic-transport-only',after});
 assert.deepEqual(seen,['http://localhost:4104/v1/driver/me/verification/cases','http://localhost:4104/v1/driver/me/verification/cases?after='+after]);
});
