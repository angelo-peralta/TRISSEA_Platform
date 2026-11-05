import { readIdentityPolicy } from '../../database/identity-policy';
import { IdentityCrypto } from '../../database/identity-crypto';
import { digest } from './primitives';
export class PassengerSettings {
  readonly policy;
  readonly sessionSeconds:number;
  readonly retrySeconds:number;
  readonly ipHourlyLimit:number;readonly deviceHourlyLimit:number;readonly deviceDailyLimit:number;readonly globalDailyLimit:number;
  readonly noticeVersion='local-synthetic-notice-v1';readonly termsVersion='local-synthetic-terms-v1';
  constructor(environment:Readonly<Record<string,string|undefined>>) {
    this.policy=readIdentityPolicy(environment);
    const bounded=(name:string,maximum:number)=>{const value=environment[name]??String(maximum);if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>maximum)throw new Error('Invalid passenger budget');return Number(value);};
    this.ipHourlyLimit=bounded('OTP_IP_HOURLY_LIMIT',20);this.deviceHourlyLimit=bounded('OTP_DEVICE_HOURLY_LIMIT',10);this.deviceDailyLimit=bounded('OTP_DEVICE_DAILY_LIMIT',20);this.globalDailyLimit=bounded('OTP_GLOBAL_DAILY_LIMIT',100);
    const session=environment.MOBILE_SESSION_SECONDS??'86400',retry=environment.AUTH_RETRY_SECONDS??'15';
    if(!/^\d+$/.test(session)||Number(session)<600||Number(session)>86400||!/^\d+$/.test(retry)||Number(retry)<1||Number(retry)>30)throw new Error('Invalid passenger policy');
    this.sessionSeconds=Number(session);this.retrySeconds=Number(retry);Object.freeze(this);
  }
  get limits(){return {...this.policy,ipHourlyLimit:this.ipHourlyLimit,deviceHourlyLimit:this.deviceHourlyLimit,deviceDailyLimit:this.deviceDailyLimit,globalDailyLimit:this.globalDailyLimit};}
}
export class PassengerSecrets {
  readonly identity:IdentityCrypto;
  private readonly otpKey:Buffer;private readonly coordinationKey:Buffer;private readonly refreshKey:Buffer;
  constructor(readonly keyId:string,encryptionKey:Buffer,lookupKey:Buffer,otpKey:Buffer,coordinationKey:Buffer,refreshKey:Buffer) {
    const keys=[encryptionKey,lookupKey,otpKey,coordinationKey,refreshKey];
    if(keys.some(key=>key.length!==32)||new Set(keys.map(key=>key.toString('hex'))).size!==keys.length)throw new Error('Invalid passenger key separation');
    this.identity=new IdentityCrypto(keyId,encryptionKey,lookupKey);this.otpKey=Buffer.from(otpKey);this.coordinationKey=Buffer.from(coordinationKey);this.refreshKey=Buffer.from(refreshKey);
  }
  coordinate(purpose:string,...values:unknown[]):string {return digest(this.coordinationKey,purpose,...values);}
  otp(...values:unknown[]):string {return digest(this.otpKey,'otp-v1',...values);}
  refresh(value:string):string {return digest(this.refreshKey,'refresh-v1',value);}
}
