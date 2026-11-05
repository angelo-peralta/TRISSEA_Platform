import { createClient } from '@redis/client';
import { randomUUID } from 'node:crypto';
import { PhoneAuthError } from './primitives';

const registerScript=`
local clock=redis.call('TIME'); local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
if redis.call('EXISTS',KEYS[1])==1 then return 0 end
if redis.call('EXISTS',KEYS[7])==1 then return -1 end
for i=3,6 do redis.call('ZREMRANGEBYSCORE',KEYS[i],'-inf',now-86400000) end
if redis.call('ZCOUNT',KEYS[3],now-3600000,'+inf')>=tonumber(ARGV[7]) or redis.call('ZCARD',KEYS[3])>=tonumber(ARGV[8])
 or redis.call('ZCOUNT',KEYS[4],now-3600000,'+inf')>=tonumber(ARGV[9])
 or redis.call('ZCOUNT',KEYS[5],now-3600000,'+inf')>=tonumber(ARGV[10]) or redis.call('ZCARD',KEYS[5])>=tonumber(ARGV[11])
 or redis.call('ZCARD',KEYS[6])>=tonumber(ARGV[12]) then return -1 end
for i=3,6 do redis.call('ZADD',KEYS[i],now,ARGV[1]);redis.call('PEXPIRE',KEYS[i],86400000) end
redis.call('HSET',KEYS[1],'hash',ARGV[2],'binding',ARGV[3],'destination',ARGV[4],'state','PENDING','attempts',0)
redis.call('PEXPIRE',KEYS[1],ARGV[5]);redis.call('SET',KEYS[2],ARGV[1],'PX',ARGV[5]);redis.call('SET',KEYS[7],'1','PX',ARGV[6]);return 1`;
const consumeScript=`
if redis.call('EXISTS',KEYS[1])==0 or redis.call('HGET',KEYS[1],'binding')~=ARGV[2] then return '' end
local state=redis.call('HGET',KEYS[1],'state')
if state=='CONSUMED' then
 if redis.call('HGET',KEYS[1],'request')==ARGV[4] then return redis.call('HGET',KEYS[1],'receipt') end
 return ''
end
if state~='PENDING' or redis.call('GET',KEYS[2])~=ARGV[1] or redis.call('HGET',KEYS[1],'hash')~=ARGV[3] then return '' end
local attempts=redis.call('HINCRBY',KEYS[1],'attempts',1)
if attempts>tonumber(ARGV[7]) then return '' end
if ARGV[5]~='1' then
 if attempts>=tonumber(ARGV[7]) then redis.call('HSET',KEYS[1],'state','LOCKED');redis.call('HDEL',KEYS[1],'hash') end
 return ''
end
redis.call('HSET',KEYS[1],'state','CONSUMED','request',ARGV[4],'receipt',ARGV[6]);redis.call('HDEL',KEYS[1],'hash');return ARGV[6]`;
const verifyRateScript=`
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now-60000)
if redis.call('ZCARD',KEYS[1])>=30 then return 0 end
redis.call('ZADD',KEYS[1],now,ARGV[1]);redis.call('PEXPIRE',KEYS[1],60000);return 1`;

export interface OtpLimits { otpTtlSeconds:number;otpResendSeconds:number;otpHourlyLimit:number;otpDailyLimit:number;otpMaxAttempts:number;ipHourlyLimit:number;deviceHourlyLimit:number;deviceDailyLimit:number;globalDailyLimit:number }
export class RedisOtpStore {
  readonly client;
  constructor(url:string,readonly namespace:string) {
    if(!/^[\w:-]{1,80}$/.test(namespace))throw new Error('Invalid Redis namespace');
    this.client=createClient({url,disableOfflineQueue:true,commandsQueueMaxLength:100,socket:{connectTimeout:2000,reconnectStrategy:false}});
    this.client.on('error',()=>{}); // errors are normalized at the API boundary, never logged with URLs
  }
  async connect():Promise<void> { await this.client.connect(); }
  async close():Promise<void> { if(this.client.isOpen)this.client.destroy(); }
  key(kind:string,id=''):string { return `${this.namespace}:{otp}:${kind}:${id}`; }
  async register(id:string,hash:string,binding:string,destination:string,ip:string,device:string,limits:OtpLimits):Promise<void> {
    const result=await this.client.withCommandOptions({timeout:2000}).eval(registerScript,{keys:[this.key('challenge',id),this.key('active',destination),this.key('dest',destination),this.key('ip',ip),this.key('device',device),this.key('budget'),this.key('cooldown',destination)],
      arguments:[id,hash,binding,destination,String(limits.otpTtlSeconds*1000),String(limits.otpResendSeconds*1000),String(limits.otpHourlyLimit),String(limits.otpDailyLimit),String(limits.ipHourlyLimit),String(limits.deviceHourlyLimit),String(limits.deviceDailyLimit),String(limits.globalDailyLimit)]});
    if(Number(result)!==1)throw new PhoneAuthError(Number(result)===-1?'RATE_LIMITED':'CONFLICT');
  }
  async inspect(id:string):Promise<Record<string,string>> { return this.client.withCommandOptions({timeout:2000}).hGetAll(this.key('challenge',id)); }
  async consume(id:string,destination:string,binding:string,expectedHash:string,request:string,correct:boolean,receipt:string,maxAttempts:number):Promise<string|null> {
    const result=await this.client.withCommandOptions({timeout:2000}).eval(consumeScript,{keys:[this.key('challenge',id),this.key('active',destination)],arguments:[id,binding,expectedHash,request,correct?'1':'0',receipt,String(maxAttempts)]});
    return typeof result==='string'&&/^[0-9a-f]{64}$/.test(result)?result:null;
  }
  async limitVerification(ipDigest:string):Promise<void> {
    const result=await this.client.withCommandOptions({timeout:2000}).eval(verifyRateScript,{keys:[this.key('verify-ip',ipDigest)],arguments:[randomUUID()]});
    if(Number(result)!==1)throw new PhoneAuthError('RATE_LIMITED');
  }
}
