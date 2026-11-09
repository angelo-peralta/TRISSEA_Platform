import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPassengerClient,PassengerApiError } from '../src/passenger-client';
const body={phone:'+639990000001',clientPurpose:'PASSENGER' as const,deviceId:randomUUID(),clientProof:randomBytes(32).toString('base64url')};
test('stateless passenger transport validates contracts, forwards cancellation, omits cookies and never retries',async()=>{
 let calls=0;const controller=new AbortController();
 const client=createPassengerClient('http://127.0.0.1:4100/v1/',async(url,init)=>{
  calls++;assert.equal(url,'http://127.0.0.1:4100/v1/auth/phone/challenges');assert.equal(init?.credentials,'omit');assert.equal(init?.cache,'no-store');assert.equal(init?.signal,controller.signal);
  return new Response(JSON.stringify({challengeId:randomUUID(),expiresAt:new Date().toISOString(),resendAfter:new Date().toISOString(),clientPurpose:'PASSENGER',deliveryMode:'MOCK'}),{status:202});
 });
 const result=await client.request('requestPassengerOtp',{body,idempotencyKey:randomUUID(),signal:controller.signal});assert.equal(result.deliveryMode,'MOCK');assert.equal(calls,1);
 await assert.rejects(client.request('requestPassengerOtp',{body:{...body,clientProof:'bad'},idempotencyKey:randomUUID()}),error=>error instanceof PassengerApiError&&error.status===400);assert.equal(calls,1);
});
test('response contract rejects secret-bearing/false-success bodies; errors contain only safe status',async()=>{
 for(const value of [{code:'123456'},{challengeId:randomUUID(),expiresAt:'bad',resendAfter:'bad',clientPurpose:'PASSENGER',deliveryMode:'LIVE'}]){
  const client=createPassengerClient('http://127.0.0.1:4100/v1',async()=>new Response(JSON.stringify(value),{status:202}));
  await assert.rejects(client.request('requestPassengerOtp',{body,idempotencyKey:randomUUID()}),error=>error instanceof PassengerApiError&&error.status===502);
 }
 let calls=0;const denied=createPassengerClient('http://127.0.0.1:4100/v1',async()=>{calls++;return new Response('synthetic-private-marker',{status:503});});
 await assert.rejects(denied.request('getMe',{accessToken:'synthetic-token'}),error=>error instanceof PassengerApiError&&error.status===503&&!error.message.includes('synthetic-private-marker'));assert.equal(calls,1);
});
test('logout handles a genuine empty 204; path identifiers must be UUIDs',async()=>{
 let calls=0;const client=createPassengerClient('http://127.0.0.1:4100/v1',async()=>{calls++;return new Response(null,{status:204});});
 assert.equal(await client.request('logoutPassenger',{body:{},accessToken:'synthetic-token',idempotencyKey:randomUUID()}),undefined);
 await assert.rejects(client.request('revokePassengerSession',{sessionId:'../other',body:{},accessToken:'synthetic-token',idempotencyKey:randomUUID()}));assert.equal(calls,1);
});
