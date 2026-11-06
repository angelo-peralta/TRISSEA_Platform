import { randomUUID } from 'node:crypto';
import { drizzle,type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { Sql } from 'postgres';
import * as base from '../../database/identity-schema';
import * as passenger from '../../database/passenger-schema';
export const passengerSchema={...base,...passenger};
export type PassengerTransaction=Parameters<Parameters<PostgresJsDatabase<typeof passengerSchema>['transaction']>[0]>[0];
export type AuthTransaction=Pick<PassengerTransaction,'select'|'insert'|'update'|'delete'|'execute'>;
export class PassengerDatabase {
  private readonly db;
  constructor(connection:Sql){this.db=drizzle(connection,{schema:passengerSchema});}
  transaction<T>(work:(tx:PassengerTransaction)=>Promise<T>):Promise<T>{
    return this.db.transaction(async tx=>{
      const [role]=await tx.execute(sql`SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'trissea_m2_auth','member') AS auth,
        pg_has_role(current_user,'trissea_m2_authorization','member') AS resolver,pg_has_role(current_user,'trissea_m2_policy_lock','member') AS locker,
        EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_driver_lock' AND pg_has_role(current_user,oid,'member')) AS driver_locker,
        EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_verification_writer' AND pg_has_role(current_user,oid,'member')) AS verification_writer,
        EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relkind='r' AND pg_has_role(current_user,c.relowner,'member')) AS owner
        FROM pg_roles WHERE rolname=current_user`);
      if(!role?.auth||!role.resolver||role.rolsuper||role.rolbypassrls||role.locker||role.driver_locker||role.verification_writer||role.owner)throw new Error('Invalid passenger runtime role');
      await tx.execute(sql`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`);
      return work(tx);
    },{isolationLevel:'read committed'});
  }
}
export async function passengerContext(tx:AuthTransaction,userId:string,purpose:'PASSENGER'|'DRIVER'='PASSENGER'):Promise<void>{await tx.execute(sql`SELECT set_config('trissea.user_id',${userId},true),set_config('trissea.client_purpose',${purpose},true)`);}
export async function authNow(tx:AuthTransaction):Promise<number>{const [row]=await tx.execute(sql`SELECT extract(epoch from clock_timestamp())*1000 AS milliseconds`);return Math.floor(Number(row?.milliseconds));}
export async function authAudit(tx:AuthTransaction,action:string,resourceId:string,userId:string|null=null,sessionId:string|null=null,reasonCode='AUTH_COMPLETED'):Promise<void>{
  const id=randomUUID();
  await tx.insert(base.auditEvents).values({id,action,resourceId,actorUserId:userId,actorSessionId:sessionId,outcome:reasonCode==='AUTH_COMPLETED'?'COMPLETED':'DENIED',reasonCode,traceId:randomUUID()});
  await tx.insert(base.outboxEvents).values({auditEventId:id,aggregateId:resourceId,eventType:action});
}
