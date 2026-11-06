import {sql} from 'drizzle-orm';
import type {AuthTransaction} from '../passenger/passenger-database';
/** Explicit driver-owned interface used by verification. Target locks and
 * projections are implemented by reviewed SQL functions, never direct API writes. */
export interface DriverVerificationSnapshot {
 userId:string;cityTenantId:string;todaId:string;relationshipId:string;
 profileVersion:number;affiliationVersion:number;vehicleVersion:number;relationshipVersion:number;intakeVersion:number;policyReference:string;
}
export class DriverVerificationStore {
 async current(tx:AuthTransaction,userId:string,cityTenantId:string,todaId:string,relationshipId:string):Promise<boolean>{
  const [row]=await tx.execute(sql`SELECT identity.driver_verification_current(${userId}::uuid,${cityTenantId}::uuid,${todaId}::uuid,${relationshipId}::uuid) AS current`);return row?.current===true;
 }
 async snapshot(tx:AuthTransaction,relationshipId:string):Promise<DriverVerificationSnapshot>{
  const [row]=await tx.execute(sql`SELECT identity.verification_target(${relationshipId}::uuid) AS facts`);
  if(!row?.facts)throw new Error('Verification target unavailable');return row.facts as unknown as DriverVerificationSnapshot;
 }
}
