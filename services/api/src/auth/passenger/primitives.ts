import { createHmac,randomInt,timingSafeEqual } from 'node:crypto';
import { HttpException } from '@nestjs/common';
export type MobilePurpose='PASSENGER'|'DRIVER';
export type AuthErrorCode='INVALID_REQUEST'|'AUTH_FAILED'|'RATE_LIMITED'|'CONFLICT'|'UNAVAILABLE';
export class PhoneAuthError extends HttpException {
  constructor(readonly code:AuthErrorCode) { super({code,message:({INVALID_REQUEST:'Invalid request',AUTH_FAILED:'Authentication failed',RATE_LIMITED:'Try again later',CONFLICT:'Request conflicts with an earlier operation',UNAVAILABLE:'Authentication temporarily unavailable'} as const)[code]},({INVALID_REQUEST:400,AUTH_FAILED:401,RATE_LIMITED:429,CONFLICT:409,UNAVAILABLE:503} as const)[code]); }
}
export const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function normalizePhone(value:unknown):string {
  if(typeof value!=='string'||value.length>32)throw new PhoneAuthError('INVALID_REQUEST');
  let result=value.trim().replace(/[ ()-]/g,'');
  if(/^09\d{9}$/.test(result))result='+63'+result.slice(1);
  if(/^639\d{9}$/.test(result))result='+'+result;
  if(!/^\+639\d{9}$/.test(result))throw new PhoneAuthError('INVALID_REQUEST');
  return result;
}
export function formatOtp(value:number):string { if(!Number.isInteger(value)||value<0||value>=1_000_000)throw new Error('Invalid OTP range');return String(value).padStart(6,'0'); }
export function generateOtp():string { return formatOtp(randomInt(0,1_000_000)); }
export function digest(key:Buffer,purpose:string,...values:unknown[]):string { return createHmac('sha256',key).update(JSON.stringify([purpose,...values])).digest('hex'); }
export function equalDigest(a:string,b:string):boolean { return /^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex')); }
export function objectInput(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new PhoneAuthError('INVALID_REQUEST');
  return value as Record<string,unknown>;
}
export function clientBinding(input:Record<string,unknown>,purpose:MobilePurpose='PASSENGER'):{deviceId:string;clientProof:string} {
  if(input.clientPurpose!==purpose||!uuid(input.deviceId)||typeof input.clientProof!=='string'||!/^[A-Za-z0-9_-]{43,86}$/.test(input.clientProof))throw new PhoneAuthError('INVALID_REQUEST');
  return {deviceId:input.deviceId,clientProof:input.clientProof};
}
export function idempotency(value:unknown):string { if(typeof value!=='string'||!/^[A-Za-z0-9_-]{12,128}$/.test(value))throw new PhoneAuthError('INVALID_REQUEST');return value; }
