// Public workspace entry point. The relative import also lets the isolated Node
// acceptance build emit the real transport and contracts together without loaders.
import {createPassengerClient,createDriverClient,type Schemas} from '../../contracts/src/index';
import type {Purpose} from './configuration';
export type Profile=Schemas['PassengerProfile']|Schemas['DriverProfile'];
export interface DeviceBinding {deviceId:string;clientProof:string}
export interface MobileTransport {
 request(phone:string,binding:DeviceBinding,key:string):Promise<Schemas['PhoneChallengeResponse']>;
 verify(phone:string,code:string,challengeId:string,binding:DeviceBinding,key:string):Promise<Schemas['MobileAuthResult']>;
 refresh(refreshToken:string,binding:DeviceBinding,key:string):Promise<Schemas['MobileAuthResult']>;
 profile(accessToken:string):Promise<Profile>;
 consent(accessToken:string,noticeVersion:string,termsVersion:string,key:string):Promise<Profile>;
 logout(accessToken:string,key:string):Promise<unknown>;
}
export function mobileTransport(purpose:Purpose,url:string,fetcher:typeof fetch=fetch):MobileTransport{
 const device=(binding:DeviceBinding)=>({deviceId:binding.deviceId,clientProof:binding.clientProof});
 const bounded:typeof fetch=async(input,init)=>{const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),10000);try{const response=await fetcher(input,{...init,signal:controller.signal}),body=response.status===204?null:await response.text();if(body&&body.length>65536)throw new Error('Invalid response size');return new Response(body,{status:response.status,headers:response.headers});}finally{clearTimeout(deadline);}};
 const p=createPassengerClient(url,bounded),d=createDriverClient(url,bounded);
 return {
  request:(phone,binding,idempotencyKey)=>purpose==='DRIVER'?d.request('requestDriverOtp',{body:{phone,...device(binding),clientPurpose:'DRIVER'},idempotencyKey}):p.request('requestPassengerOtp',{body:{phone,...device(binding),clientPurpose:'PASSENGER'},idempotencyKey}),
  verify:(phone,code,challengeId,binding,idempotencyKey)=>purpose==='DRIVER'?d.request('verifyDriverOtp',{body:{phone,code,...device(binding),clientPurpose:'DRIVER'},challengeId,idempotencyKey}):p.request('verifyPassengerOtp',{body:{phone,code,...device(binding),clientPurpose:'PASSENGER'},challengeId,idempotencyKey}),
  refresh:(refreshToken,binding,idempotencyKey)=>purpose==='DRIVER'?d.request('refreshDriverSession',{body:{refreshToken,...device(binding),clientPurpose:'DRIVER'},idempotencyKey}):p.request('refreshPassengerSession',{body:{refreshToken,...device(binding),clientPurpose:'PASSENGER'},idempotencyKey}),
  profile:accessToken=>purpose==='DRIVER'?d.request('getDriverMe',{accessToken}):p.request('getMe',{accessToken}),
  consent:(accessToken,noticeVersion,termsVersion,idempotencyKey)=>{if(noticeVersion!=='local-synthetic-notice-v1'||termsVersion!=='local-synthetic-terms-v1')return Promise.reject(new Error('Unsupported consent version'));const body:Schemas['PassengerConsentRequest']={noticeVersion,termsVersion,noticeAcknowledged:true,termsAccepted:true};return purpose==='DRIVER'?d.request('recordDriverConsent',{accessToken,body,idempotencyKey}):p.request('recordPassengerConsent',{accessToken,body,idempotencyKey});},
  logout:(accessToken,idempotencyKey)=>purpose==='DRIVER'?d.request('logoutDriver',{accessToken,body:{},idempotencyKey}):p.request('logoutPassenger',{accessToken,body:{},idempotencyKey}),
 };
}
