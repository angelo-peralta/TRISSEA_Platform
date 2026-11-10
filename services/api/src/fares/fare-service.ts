import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {and,desc,eq,lt,sql} from 'drizzle-orm';
import * as f from '../database/fare-schema';
import type {AuthorizedWork} from '../auth/policy/authorization.service';
import type {PolicyTransaction} from '../auth/policy/authorization-database';
import {PassengerSecrets} from '../auth/passenger/passenger-settings';
import {idempotency} from '../auth/passenger/primitives';
import {configuration,defaultDistance,defaultPrivate,effectiveDates,integer,label,object,uuid,invalid,type FamilyKind,type DistanceConfig,type MatrixConfig} from './fare-model';
import {importMatrix} from './fare-import';
import {calculateFare,calculationInput,type FareVersion} from './fare-engine';
import {calibrate,calibrationInput} from './fare-calibration';

export class FareService {
  constructor(readonly secrets:PassengerSecrets){}
  private city(c:AuthorizedWork){if(!c.resource.cityTenantId)throw new ForbiddenException();return c.resource.cityTenantId;}
  private async mutation(c:AuthorizedWork,operation:string,key:unknown,input:unknown,work:()=>Promise<unknown>){
    const cityTenantId=this.city(c),keyDigest=this.secrets.coordinate('fare-key',c.userId,operation,idempotency(key)),requestDigest=this.secrets.coordinate('fare-request',cityTenantId,input);
    await c.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyDigest},901))`);
    const [prior]=await c.tx.select().from(f.fareReceipts).where(and(eq(f.fareReceipts.actorUserId,c.userId),eq(f.fareReceipts.operation,operation),eq(f.fareReceipts.keyDigest,keyDigest)));
    if(prior){if(prior.requestDigest!==requestDigest||prior.cityTenantId!==cityTenantId)throw new ConflictException('Idempotency conflict');return prior.response;}
    try{const response=JSON.parse(JSON.stringify(await work())) as Record<string,unknown>;await c.tx.insert(f.fareReceipts).values({cityTenantId,actorUserId:c.userId,operation,keyDigest,requestDigest,response});return response;}
    catch(error){const e=error as {code?:string;cause?:{code?:string}};if(['23503','23505','23514'].includes(e.code??e.cause?.code??''))throw new ConflictException('Fare revision or state conflict');throw error;}
  }
  async list(c:AuthorizedWork,raw:unknown){const q=object(raw,['after']),after=q.after===undefined?null:uuid(q.after),t=f.fareFamilies;
    const rows=await c.tx.select().from(t).where(and(eq(t.cityTenantId,this.city(c)),after?lt(t.id,after):undefined)).orderBy(desc(t.id)).limit(21);
    return {items:rows.slice(0,20),nextCursor:rows.length>20?rows[19]!.id:null,defaults:{distance:defaultDistance,privateHire:defaultPrivate},activationStatus:'CLOSED',simulationOnly:true};
  }
  async detail(c:AuthorizedWork,id:unknown,raw:unknown={}){
    const q=object(raw,['beforeRevision']),before=q.beforeRevision===undefined?null:integer(Number(q.beforeRevision),1),familyId=uuid(id),cityTenantId=this.city(c);
    const [family]=await c.tx.select().from(f.fareFamilies).where(and(eq(f.fareFamilies.id,familyId),eq(f.fareFamilies.cityTenantId,cityTenantId)));if(!family)throw new NotFoundException('Fare policy unavailable');
    const versions=await c.tx.select().from(f.fareVersions).where(and(eq(f.fareVersions.familyId,familyId),before?lt(f.fareVersions.revision,before):undefined)).orderBy(desc(f.fareVersions.revision)).limit(21);
    const items=[];for(const version of versions.slice(0,20)){
      const reviews=await c.tx.select().from(f.fareReviews).where(eq(f.fareReviews.policyVersionId,version.id));
      const source=version.kind==='LGU_MATRIX'?await this.matrix(c.tx,(version.config as MatrixConfig).importId):null;
      items.push({...version,reviews,source});
    }
    return {family,versions:items,nextBeforeRevision:versions.length>20?versions[19]!.revision:null,activationStatus:'CLOSED',legalRequirements:['Signed applicable tariff and effective dates','LGU/TRU approval of distance, private-hire and discount rules','Verified capacity, geography and legal routes','Separate fare.activate authorization'],simulationOnly:true};
  }
  private async matrix(tx:PolicyTransaction,id:string){const [batch]=await tx.select().from(f.fareImports).where(eq(f.fareImports.id,id));if(!batch)throw new NotFoundException('Fare source unavailable');const [source]=await tx.select().from(f.fareSources).where(eq(f.fareSources.id,batch.sourceId)),rows=await tx.select().from(f.fareMatrixRows).where(eq(f.fareMatrixRows.importId,id)).orderBy(f.fareMatrixRows.destinationLabel);const metadata={...batch,originalCsv:undefined};return {batch:metadata,provenance:source,rows};}
  async import(c:AuthorizedWork,raw:unknown,key:unknown){
    const b=object(raw,['csv','sourceLabel','sourceReference','provenance','effectiveFrom','effectiveUntil','tariffReference']),parsed=importMatrix(b.csv),dates=effectiveDates(b.effectiveFrom,b.effectiveUntil);
    const input={csv:b.csv as string,sourceLabel:label(b.sourceLabel),sourceReference:label(b.sourceReference,300),provenance:label(b.provenance,1000),...dates,tariffReference:b.tariffReference===null?null:label(b.tariffReference,300)};
    return this.mutation(c,'IMPORT',key,input,async()=>{
      const cityTenantId=this.city(c),makerUserId=c.userId,[source]=await c.tx.insert(f.fareSources).values({cityTenantId,makerUserId,label:input.sourceLabel,reference:input.sourceReference,provenance:input.provenance}).returning();
      const [batch]=await c.tx.insert(f.fareImports).values({cityTenantId,makerUserId,sourceId:source!.id,originalCsv:input.csv,sha256:parsed.sha256,originConfirmation:'OWNER_CONFIRMED_PLAZA_ONE_WAY_PER_PASSENGER',effectiveFrom:dates.effectiveFrom?new Date(dates.effectiveFrom):null,effectiveUntil:dates.effectiveUntil?new Date(dates.effectiveUntil):null,tariffReference:input.tariffReference}).returning();
      await c.tx.insert(f.fareMatrixRows).values(parsed.rows.map(row=>({...row,cityTenantId,importId:batch!.id})));
      const [family]=await c.tx.insert(f.fareFamilies).values({cityTenantId,makerUserId,kind:'LGU_MATRIX',name:input.sourceLabel}).returning();
      const [version]=await c.tx.insert(f.fareVersions).values({cityTenantId,familyId:family!.id,kind:'LGU_MATRIX',revision:1,config:{importId:batch!.id},effectiveFrom:batch!.effectiveFrom,effectiveUntil:batch!.effectiveUntil,legalReference:input.tariffReference}).returning();
      return {family,version,importId:batch!.id,sha256:parsed.sha256,rowCount:43,activationStatus:'CLOSED'};
    });
  }
  async save(c:AuthorizedWork,raw:unknown,key:unknown){
    const b=object(raw,['familyId','expectedRevision','kind','name','config','effectiveFrom','effectiveUntil','legalReference']);
    if(!['LGU_MATRIX','DISTANCE_PROPOSAL','PRIVATE_HIRE_PROPOSAL'].includes(b.kind as string))return invalid();
    const kind=b.kind as FamilyKind,input={familyId:b.familyId===null?null:uuid(b.familyId),expectedRevision:integer(b.expectedRevision),kind,name:label(b.name),config:configuration(kind,b.config),...effectiveDates(b.effectiveFrom,b.effectiveUntil),legalReference:b.legalReference===null?null:label(b.legalReference,300)};
    if(kind==='LGU_MATRIX'&&!input.familyId)throw new BadRequestException('Import a matrix source first');
    return this.mutation(c,'SAVE',key,input,async()=>{
      const cityTenantId=this.city(c);let family:typeof f.fareFamilies.$inferSelect;
      if(input.familyId){const [row]=await c.tx.select().from(f.fareFamilies).where(and(eq(f.fareFamilies.id,input.familyId),eq(f.fareFamilies.cityTenantId,cityTenantId)));if(!row||row.makerUserId!==c.userId||row.kind!==kind)throw new ForbiddenException('Fare maker required');family=row;}
      else{if(input.expectedRevision!==0)throw new ConflictException('Fare revision conflict');const [row]=await c.tx.insert(f.fareFamilies).values({cityTenantId,kind,name:input.name,makerUserId:c.userId}).returning();family=row!;}
      await c.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${family.id},903))`);
      const [prior]=await c.tx.select().from(f.fareVersions).where(eq(f.fareVersions.familyId,family.id)).orderBy(desc(f.fareVersions.revision)).limit(1);
      if((prior?.revision??0)!==input.expectedRevision||prior?.state==='SUBMITTED')throw new ConflictException('Fare revision conflict');
      const [version]=await c.tx.insert(f.fareVersions).values({cityTenantId,familyId:family.id,kind,revision:input.expectedRevision+1,previousVersionId:prior?.id??null,config:input.config,effectiveFrom:input.effectiveFrom?new Date(input.effectiveFrom):null,effectiveUntil:input.effectiveUntil?new Date(input.effectiveUntil):null,legalReference:input.legalReference}).returning();return {family,version};
    });
  }
  private async version(c:AuthorizedWork,id:string){const [v]=await c.tx.select().from(f.fareVersions).where(and(eq(f.fareVersions.id,id),eq(f.fareVersions.cityTenantId,this.city(c))));if(!v)throw new NotFoundException('Fare version unavailable');return v;}
  async submit(c:AuthorizedWork,id:unknown,raw:unknown,key:unknown){const b=object(raw,['expectedLifecycleVersion']),versionId=uuid(id),expected=integer(b.expectedLifecycleVersion,1);
    return this.mutation(c,'SUBMIT',key,{versionId,expected},async()=>{const v=await this.version(c,versionId);await c.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${v.familyId},903))`);const [version]=await c.tx.update(f.fareVersions).set({state:'SUBMITTED',lifecycleVersion:expected+1}).where(and(eq(f.fareVersions.id,versionId),eq(f.fareVersions.lifecycleVersion,expected),eq(f.fareVersions.state,'DRAFT'))).returning();if(!version)throw new ConflictException('Fare revision conflict');return {version};});
  }
  async review(c:AuthorizedWork,id:unknown,raw:unknown,key:unknown){const b=object(raw,['expectedLifecycleVersion','outcome','reason']),versionId=uuid(id);if(b.outcome!=='APPROVE'&&b.outcome!=='REJECT')return invalid();const input={versionId,expectedLifecycleVersion:integer(b.expectedLifecycleVersion,1),outcome:b.outcome,reason:label(b.reason,1000)};
    return this.mutation(c,'REVIEW',key,input,async()=>{await this.version(c,versionId);await c.tx.insert(f.fareReviews).values({cityTenantId:this.city(c),policyVersionId:versionId,expectedLifecycleVersion:input.expectedLifecycleVersion,outcome:input.outcome as 'APPROVE'|'REJECT',reason:input.reason,actorUserId:c.userId,actorSessionId:c.sessionId});return {version:await this.version(c,versionId),activationStatus:'CLOSED'};});
  }
  async simulate(c:AuthorizedWork,raw:unknown,key:unknown){const input=calculationInput(raw);
    return this.mutation(c,'SIMULATE',key,input,async()=>{const v=await this.version(c,input.referencePolicyVersionId),p=input.privatePolicyVersionId?await this.version(c,input.privatePolicyVersionId):null,source=v.kind==='LGU_MATRIX'?await this.matrix(c.tx,(v.config as MatrixConfig).importId):null;
      const ref:FareVersion={...v,sourceVersion:source?.batch.sha256??null},result=calculateFare(input,ref,p?{...p,sourceVersion:null}:null,source?.rows??[]);
      const [snapshot]=await c.tx.insert(f.fareCalculations).values({cityTenantId:this.city(c),referencePolicyVersionId:v.id,privatePolicyVersionId:p?.id??null,actorUserId:c.userId,actorSessionId:c.sessionId,input,result}).returning();return {snapshot};
    });
  }
  async snapshot(c:AuthorizedWork,id:unknown){const [snapshot]=await c.tx.select().from(f.fareCalculations).where(and(eq(f.fareCalculations.id,uuid(id)),eq(f.fareCalculations.cityTenantId,this.city(c))));if(!snapshot)throw new NotFoundException('Fare snapshot unavailable');return {snapshot};}
  async calibration(c:AuthorizedWork,raw:unknown){const b=object(raw,['matrixPolicyVersionId','distancePolicyVersionId','measurements','candidateRatesCentavosPerKm']),m=await this.version(c,uuid(b.matrixPolicyVersionId)),d=await this.version(c,uuid(b.distancePolicyVersionId));if(m.kind!=='LGU_MATRIX'||d.kind!=='DISTANCE_PROPOSAL')return invalid();const source=await this.matrix(c.tx,(m.config as MatrixConfig).importId);return {matrixPolicyVersionId:m.id,distancePolicyVersionId:d.id,sourceVersion:source.batch.sha256,...calibrate(source.rows,d.config as DistanceConfig,calibrationInput({measurements:b.measurements,candidateRatesCentavosPerKm:b.candidateRatesCentavosPerKm})),simulationOnly:true};}
}
