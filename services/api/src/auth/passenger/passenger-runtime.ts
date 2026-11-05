import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { Global,Module,type DynamicModule,type OnModuleDestroy,type OnModuleInit } from '@nestjs/common';
import { IdentityProvider } from '../identity-provider';
import { SessionProofVerifier,type RequestCredentials } from '../policy/authorization.service';
import { PassengerDatabase } from './passenger-database';
import { PassengerSecrets,PassengerSettings } from './passenger-settings';
import { PassengerTokens } from './token-service';
import { RedisOtpStore } from './redis-otp';
import { MockSmsGateway,type SmsGateway } from './sms-gateway';
import { PassengerSessions } from './passenger-sessions';
import { PhoneChallenges } from './phone-challenges';
import { PassengerProfiles } from './passenger-profiles';

export class PassengerProofVerifier extends SessionProofVerifier {
  constructor(readonly tokens:PassengerTokens){super();}
  async verify(credentials:RequestCredentials){
    if(credentials.cookie)return null;
    const match=/^Bearer ([^\s]+)$/i.exec(credentials.authorization??'');
    return match?.[1]?this.tokens.verify(match[1]):null;
  }
}
class PassengerIdentity extends IdentityProvider {
  constructor(readonly runtime:PassengerRuntime){super();}
  async verifyAccessToken(token:string){
    const proof=await this.runtime.tokens.verify(token);
    return proof&&await this.runtime.sessions.isCurrent(proof)?{subject:proof.userId,mfa:false,grants:[]}:null;
  }
}
export class PassengerRuntime implements OnModuleInit,OnModuleDestroy {
  readonly database:PassengerDatabase;readonly sessions:PassengerSessions;readonly challenges:PhoneChallenges;readonly profiles:PassengerProfiles;
  readonly proofVerifier:PassengerProofVerifier;readonly identity:IdentityProvider;
  private janitor:ReturnType<typeof setInterval>|undefined;
  constructor(readonly connection:postgres.Sql,readonly settings:PassengerSettings,readonly secrets:PassengerSecrets,readonly otp:RedisOtpStore,readonly sms:SmsGateway,readonly tokens:PassengerTokens){
    this.database=new PassengerDatabase(connection);this.sessions=new PassengerSessions(this.database,secrets,settings,tokens);
    this.challenges=new PhoneChallenges(this.database,secrets,settings,otp,sms,this.sessions);this.profiles=new PassengerProfiles(secrets,settings);
    this.proofVerifier=new PassengerProofVerifier(tokens);this.identity=new PassengerIdentity(this);
  }
  onModuleInit(){this.janitor=setInterval(()=>{void this.sessions.purgeExpiredResults().catch(()=>{});},10_000);this.janitor.unref();}
  async onModuleDestroy(){if(this.janitor)clearInterval(this.janitor);await this.otp.close();await this.connection.end({timeout:5});}
  static async fromEnvironment():Promise<PassengerRuntime>{
    const env=process.env,settings=new PassengerSettings(env);
    if(env.M2_PASSENGER_AUTH_ENABLED!=='true'||env.M2_AUTH_MODE!=='local-synthetic'||!['development','test'].includes(env.NODE_ENV??''))throw new Error('Passenger authentication is not approved for this environment');
    let databaseUrl:URL,redisUrl:URL,issuer:URL;
    try {
      databaseUrl=new URL(env.M2_PASSENGER_DATABASE_URL??'');redisUrl=new URL(env.M2_PASSENGER_REDIS_URL??'');issuer=new URL(env.PASSENGER_JWT_ISSUER??'');
      if(!['postgres:','postgresql:'].includes(databaseUrl.protocol)||!/^\/trissea_m2_test_[a-f0-9]{12}$/.test(databaseUrl.pathname)||databaseUrl.search||databaseUrl.hash
        ||redisUrl.protocol!=='redis:'||redisUrl.port!=='16380'||redisUrl.search||redisUrl.hash||![databaseUrl,redisUrl,issuer].every(url=>['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error();
    }catch{throw new Error('Passenger runtime requires dedicated local infrastructure');}
    let runtime:PassengerRuntime|undefined,connection:postgres.Sql|undefined,otp:RedisOtpStore|undefined;
    try {
      const raw:unknown=JSON.parse(await readFile(env.M2_PASSENGER_KEYS_FILE??'','utf8'));
      if(!raw||typeof raw!=='object')throw new Error();
      const k=raw as Record<string,unknown>;
      if(typeof k.keyId!=='string'||typeof k.jwtPrivateKey!=='string'||typeof k.jwtPublicKey!=='string')throw new Error();
      const readKey=(name:string)=>{const value=k[name];if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw new Error();return Buffer.from(value,'base64url');};
      const secrets=new PassengerSecrets(k.keyId,readKey('encryptionKey'),readKey('lookupKey'),readKey('otpKey'),readKey('coordinationKey'),readKey('refreshKey'));
      const tokens=await PassengerTokens.create(issuer.href,env.PASSENGER_JWT_AUDIENCE??'trissea-passenger-local',k.keyId,k.jwtPrivateKey,k.jwtPublicKey,settings.policy.mobileJwtSeconds);
      connection=postgres(databaseUrl.href,{max:5,connect_timeout:5,onnotice:()=>{},connection:{timezone:'UTC'}});
      const db=new PassengerDatabase(connection);
      await db.transaction(async tx=>{const [row]=await tx.execute((await import('drizzle-orm')).sql`SELECT value FROM public.m2_disposable_manifest WHERE key='identity-test'`);
        if(row?.value!==databaseUrl.pathname.slice(1))throw new Error();});
      otp=new RedisOtpStore(redisUrl.href,env.M2_PASSENGER_REDIS_NAMESPACE??'m2-passenger-local');await otp.connect();
      runtime=new PassengerRuntime(connection,settings,secrets,otp,new MockSmsGateway(env.NODE_ENV??''),tokens);return runtime;
    }catch{
      await otp?.close();await connection?.end({timeout:5});throw new Error('Passenger authentication startup configuration is invalid');
    }
  }
}
@Global()
@Module({})
export class PassengerCoreModule {
  static register():DynamicModule{return {module:PassengerCoreModule,providers:[{provide:PassengerRuntime,useFactory:()=>PassengerRuntime.fromEnvironment()}],exports:[PassengerRuntime]};}
}
