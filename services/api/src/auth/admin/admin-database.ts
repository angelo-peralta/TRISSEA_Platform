import {drizzle} from 'drizzle-orm/postgres-js';
import {sql} from 'drizzle-orm';
import type {Sql} from 'postgres';
import * as base from '../../database/identity-schema';
import * as admin from '../../database/admin-schema';
import type {AuthTransaction} from '../passenger/passenger-database';
export class AdminDatabase{
 private readonly db;
 constructor(connection:Sql){this.db=drizzle(connection,{schema:{...base,...admin}});}
 transaction<T>(work:(tx:AuthTransaction)=>Promise<T>):Promise<T>{return this.db.transaction(async tx=>{
  const [role]=await tx.execute(sql`SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'trissea_m2_admin_auth','member') AS member,pg_has_role(current_user,'trissea_m2_authorization','member') AS resolver,
   pg_has_role(current_user,'trissea_m2_policy_lock','member') AS locker,EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_driver_lock' AND pg_has_role(current_user,oid,'member')) AS driver_locker,
   EXISTS(SELECT FROM pg_roles WHERE rolname='trissea_m2_verification_writer' AND pg_has_role(current_user,oid,'member')) AS verification_writer,
   EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relkind='r' AND pg_has_role(current_user,c.relowner,'member')) AS owner FROM pg_roles WHERE rolname=current_user`);
  if(!role?.member||!role.resolver||role.rolsuper||role.rolbypassrls||role.locker||role.driver_locker||role.verification_writer||role.owner)throw new Error('Invalid admin runtime role');
  await tx.execute(sql`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`);return work(tx);
 },{isolationLevel:'read committed'});}
}
