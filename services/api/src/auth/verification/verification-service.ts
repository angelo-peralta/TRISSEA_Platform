import {ForbiddenException} from '@nestjs/common';
import {and,eq,gt,desc,sql} from 'drizzle-orm';
import * as v from '../../database/verification-schema';
import {authAudit,authNow,type AuthTransaction} from '../passenger/passenger-database';
import {hasPassengerConsent} from '../passenger/passenger-sessions';
import {PassengerSecrets,PassengerSettings} from '../passenger/passenger-settings';
import {PhoneAuthError,equalDigest,idempotency} from '../passenger/primitives';
import {DriverVerificationStore} from '../driver/driver-verification-store';
import {openInput,submissionInput,decisionInput,cursorInput} from './verification-model';
type CaseRow=typeof v.verificationCases.$inferSelect;
type Operation='OPEN'|'SUBMIT'|'DECISION';
export class VerificationService {
 constructor(readonly driver:DriverVerificationStore,readonly secrets:PassengerSecrets,readonly settings:PassengerSettings){}
 async boundary<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(error){const e=error as {code?:string;cause?:{code?:string}},code=e.code??e.cause?.code;if(['23503','23505','23514'].includes(code??''))throw new PhoneAuthError('CONFLICT');if(code==='42501')throw new ForbiddenException('Verification unavailable');throw error;}}
 async summary(tx:AuthTransaction,row:CaseRow){const now=await authNow(tx),[head]=await tx.execute(sql`SELECT identity.verification_evidence_current(${row.id}::uuid) AS current`),evidenceCurrent=row.currentRound===0?null:head?.current===true;return {id:row.id,cityTenantId:row.cityTenantId,todaId:row.todaId,relationshipId:row.relationshipId,kind:row.kind,state:row.state,effectiveState:row.state==='APPROVED'?(row.validUntil!.getTime()<=now?'EXPIRED':evidenceCurrent?'APPROVED':'STALE'):row.state,evidenceCurrent,version:row.version,round:row.currentRound,assigned:row.assignmentVersion!==null,validUntil:row.validUntil?.toISOString()??null,source:'SYNTHETIC_ONLY' as const,realDocumentsEnabled:false as const,operationalServicesEnabled:false as const,realDriverApproved:false as const};}
 private async current(tx:AuthTransaction,id:string,membership?:boolean){const [row]=await tx.select().from(v.verificationCases).where(eq(v.verificationCases.id,id));if(!row||(membership!==undefined&&((row.kind==='TODA_MEMBERSHIP')!==membership)))throw new ForbiddenException('Verification unavailable');return row;}
 private async mutation(tx:AuthTransaction,actor:string,operation:Operation,key:unknown,body:unknown,work:()=>Promise<CaseRow>){
  const keyDigest=this.secrets.coordinate('verification-key',actor,operation,idempotency(key)),requestDigest=this.secrets.coordinate('verification-request',actor,operation,body),aad=`verification-receipt:${actor}:${operation}:${keyDigest}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyDigest},0))`);
  const [prior]=await tx.select().from(v.verificationReceipts).where(and(eq(v.verificationReceipts.actorUserId,actor),eq(v.verificationReceipts.operation,operation),eq(v.verificationReceipts.keyDigest,keyDigest)));
  if(prior){if(!equalDigest(prior.requestDigest,requestDigest))throw new PhoneAuthError('CONFLICT');return JSON.parse(this.secrets.identity.decrypt(prior.responseCiphertext,aad)) as Awaited<ReturnType<VerificationService['summary']>>;}
  const row=await work(),response=await this.summary(tx,row);
  await tx.insert(v.verificationReceipts).values({actorUserId:actor,operation,keyDigest,requestDigest,caseId:row.id,responseCiphertext:this.secrets.identity.encrypt(JSON.stringify(response),aad)});return response;
 }
 async open(tx:AuthTransaction,userId:string,sessionId:string,raw:unknown,key:unknown){const input=openInput(raw);
  if(!await hasPassengerConsent(tx,userId,this.settings,'DRIVER'))throw new ForbiddenException('Consent required');
  return this.boundary(()=>this.mutation(tx,userId,'OPEN',key,input,async()=>{const target=await this.driver.snapshot(tx,input.relationshipId);
   // Explicit columns preserve the restricted INSERT grant. ORM DEFAULT columns
   // would also require insert authority over server-owned lifecycle fields.
   const inserted=await tx.execute(sql`INSERT INTO identity.verification_cases(user_id,city_tenant_id,toda_id,relationship_id,kind) VALUES(${userId}::uuid,${target.cityTenantId}::uuid,${target.todaId}::uuid,${target.relationshipId}::uuid,${input.kind}) ON CONFLICT DO NOTHING RETURNING id`);
   const row=(await tx.select().from(v.verificationCases).where(and(eq(v.verificationCases.userId,userId),eq(v.verificationCases.relationshipId,input.relationshipId),eq(v.verificationCases.kind,input.kind))))[0];
   if(!row)throw new PhoneAuthError('CONFLICT');if(inserted.length)await authAudit(tx,'verification.opened',row.id,userId,sessionId);return row;
  }));
 }
 async submit(tx:AuthTransaction,userId:string,sessionId:string,id:string,raw:unknown,key:unknown){const input=submissionInput(raw);
  if(!await hasPassengerConsent(tx,userId,this.settings,'DRIVER'))throw new ForbiddenException('Consent required');
  return this.boundary(()=>this.mutation(tx,userId,'SUBMIT',key,{id,...input},async()=>{const row=await this.current(tx,id);if(row.userId!==userId||row.version!==input.expectedVersion||!['DRAFT','REJECTED','REVOKED','EXPIRED'].includes(row.state))throw new PhoneAuthError('CONFLICT');
   const target=await this.driver.snapshot(tx,row.relationshipId),[head]=await tx.select().from(v.verificationEvidenceHeads).where(eq(v.verificationEvidenceHeads.id,input.evidenceId));
   if(!head||head.userId!==userId||head.relationshipId!==row.relationshipId||head.kind!==row.kind||head.cityTenantId!==row.cityTenantId||head.todaId!==row.todaId)throw new ForbiddenException('Evidence unavailable');
   if(head.currentVersion!==input.evidenceVersion)throw new PhoneAuthError('CONFLICT');
   const round=row.currentRound+1;
   await tx.update(v.verificationCases).set({state:'SUBMITTED',version:row.version+1,currentRound:round,lastDecisionId:null,validUntil:null}).where(eq(v.verificationCases.id,id));
   await tx.insert(v.verificationSubmissions).values({caseId:id,round,...target,kind:row.kind,evidenceId:input.evidenceId,evidenceVersion:input.evidenceVersion});
   await authAudit(tx,'verification.submitted',id,userId,sessionId);return this.current(tx,id);
  }));
 }
 async decide(tx:AuthTransaction,userId:string,sessionId:string,id:string,membership:boolean,raw:unknown,key:unknown){const input=decisionInput(raw);
  return this.boundary(()=>this.mutation(tx,userId,'DECISION',key,{id,membership,...input},async()=>{const row=await this.current(tx,id,membership);
   if(row.version!==input.expectedVersion)throw new PhoneAuthError('CONFLICT');
   await tx.insert(v.verificationDecisions).values({caseId:id,round:row.currentRound,expectedVersion:input.expectedVersion,evidenceVersion:input.evidenceVersion,actorUserId:userId,actorSessionId:sessionId,outcome:input.outcome,reasonCode:input.reasonCode});
   // The guarded database projection creates the decision audit/outbox atomically.
   return this.current(tx,id,membership);
  }));
 }
 async evidence(tx:AuthTransaction,userId:string){const rows=await tx.select({evidenceId:v.verificationEvidenceHeads.id,evidenceVersion:v.verificationEvidenceHeads.currentVersion,relationshipId:v.verificationEvidenceHeads.relationshipId,kind:v.verificationEvidenceHeads.kind,referenceCode:v.verificationEvidenceVersions.referenceCode,validUntil:v.verificationEvidenceVersions.validUntil}).from(v.verificationEvidenceHeads).innerJoin(v.verificationEvidenceVersions,and(eq(v.verificationEvidenceVersions.evidenceId,v.verificationEvidenceHeads.id),eq(v.verificationEvidenceVersions.evidenceVersion,v.verificationEvidenceHeads.currentVersion))).where(eq(v.verificationEvidenceHeads.userId,userId)).orderBy(v.verificationEvidenceHeads.id).limit(50);return {items:rows.map(row=>({...row,validUntil:row.validUntil.toISOString()})),source:'SYNTHETIC_ONLY' as const};}
 async list(tx:AuthTransaction,userId:string,query:unknown,todaId?:string,membership=false){const after=cursorInput(query);
  const rows=await tx.select().from(v.verificationCases).where(and(todaId?and(eq(v.verificationCases.todaId,todaId),membership?eq(v.verificationCases.kind,'TODA_MEMBERSHIP'):sql`${v.verificationCases.kind} IN ('DRIVER','VEHICLE')`):eq(v.verificationCases.userId,userId),after?gt(v.verificationCases.id,after):undefined)).orderBy(v.verificationCases.id).limit(21);
  return {items:await Promise.all(rows.slice(0,20).map(row=>this.summary(tx,row))),nextCursor:rows.length>20?rows[19]!.id:null,source:'SYNTHETIC_ONLY' as const};
 }
 async detail(tx:AuthTransaction,id:string,membership?:boolean){const row=await this.current(tx,id,membership),submissions=await tx.select({round:v.verificationSubmissions.round,evidenceId:v.verificationSubmissions.evidenceId,evidenceVersion:v.verificationSubmissions.evidenceVersion,submittedAt:v.verificationSubmissions.createdAt}).from(v.verificationSubmissions).where(eq(v.verificationSubmissions.caseId,id)).orderBy(desc(v.verificationSubmissions.round)).limit(51);
  const decisions=await tx.select({id:v.verificationDecisions.id,round:v.verificationDecisions.round,outcome:v.verificationDecisions.outcome,reasonCode:v.verificationDecisions.reasonCode,evidenceVersion:v.verificationDecisions.evidenceVersion,decidedAt:v.verificationDecisions.createdAt,validUntil:v.verificationDecisions.validUntil}).from(v.verificationDecisions).where(eq(v.verificationDecisions.caseId,id)).orderBy(desc(v.verificationDecisions.createdAt),desc(v.verificationDecisions.id)).limit(101);
  const [evidence]=await tx.select({evidenceId:v.verificationEvidenceVersions.evidenceId,evidenceVersion:v.verificationEvidenceVersions.evidenceVersion,referenceCode:v.verificationEvidenceVersions.referenceCode,syntheticSeatCapacity:v.verificationEvidenceVersions.seatCapacity,validUntil:v.verificationEvidenceVersions.validUntil}).from(v.verificationSubmissions).innerJoin(v.verificationEvidenceVersions,and(eq(v.verificationEvidenceVersions.evidenceId,v.verificationSubmissions.evidenceId),eq(v.verificationEvidenceVersions.evidenceVersion,v.verificationSubmissions.evidenceVersion))).where(and(eq(v.verificationSubmissions.caseId,id),eq(v.verificationSubmissions.round,row.currentRound)));
  return {case:await this.summary(tx,row),evidence:evidence?{...evidence,validUntil:evidence.validUntil.toISOString()}:null,historyTruncated:submissions.length>50||decisions.length>100,submissions:submissions.slice(0,50).reverse().map(s=>({...s,submittedAt:s.submittedAt.toISOString()})),decisions:decisions.slice(0,100).reverse().map(d=>({...d,decidedAt:d.decidedAt.toISOString(),validUntil:d.validUntil?.toISOString()??null}))};
 }
}
