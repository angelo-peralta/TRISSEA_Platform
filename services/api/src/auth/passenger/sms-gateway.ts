import { PhoneAuthError,normalizePhone } from './primitives';
export interface SmsMessage { readonly recipient:string;readonly code:string;readonly challengeId:string }
export type SmsOutcome='ACCEPTED'|'REJECTED'|'UNKNOWN';
export abstract class SmsGateway { abstract send(message:SmsMessage):Promise<SmsOutcome> }
export class MockSmsGateway extends SmsGateway {
  constructor(environment:string,private readonly capture?:(message:SmsMessage)=>void) { super();if(!['development','test'].includes(environment))throw new Error('Mock SMS is prohibited'); }
  async send(message:SmsMessage):Promise<SmsOutcome> {
    if(!/^\d{6}$/.test(message.code))throw new Error('Invalid server SMS template');
    normalizePhone(message.recipient);
    this.capture?.(Object.freeze({...message})); // Test-host memory/IPC only; never an HTTP endpoint/log.
    return 'ACCEPTED';
  }
}
interface LiveConfiguration { liveEnabled:boolean;approvalReference:string|null;endpoint:string;senderId:string;bearerToken:string }
export type SmsTransport=(url:string,init:RequestInit)=>Promise<Pick<Response,'status'|'json'>>;
/** Potential live adapter. Runtime factory never selects it while Gate A is closed.
 * No default network transport; contract tests supply a stub, never global fetch. */
export class PhilSmsGateway extends SmsGateway {
  constructor(private readonly config:LiveConfiguration,private readonly transport?:SmsTransport) { super(); }
  async send(message:SmsMessage):Promise<SmsOutcome> {
    const c=this.config;
    if(!c.liveEnabled||!c.approvalReference||!this.transport)throw new PhoneAuthError('UNAVAILABLE');
    if(c.endpoint!=='https://app.philsms.com/api/v3/sms/send'||!/^\w[\w -]{1,10}$/.test(c.senderId)||c.bearerToken.length<20||!/^\d{6}$/.test(message.code))throw new PhoneAuthError('UNAVAILABLE');
    const recipient=normalizePhone(message.recipient).slice(1);
    try {
      const response=await this.transport(c.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{Authorization:`Bearer ${c.bearerToken}`,'Content-Type':'application/json'},body:JSON.stringify({recipient,sender_id:c.senderId,type:'plain',message:`TRISSEA verification code: ${message.code}. Do not share it.`})});
      if(response.status>=400&&response.status<500)return 'REJECTED';
      if(response.status<200||response.status>=300)return 'UNKNOWN';
      const body:unknown=await response.json();
      return body&&typeof body==='object'&&'status' in body&&body.status==='success'?'ACCEPTED':'UNKNOWN';
    } catch { return 'UNKNOWN'; } // no immediate retry, fallback, raw error or delivery claim
  }
}
