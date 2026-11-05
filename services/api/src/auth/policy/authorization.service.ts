import { randomUUID } from 'node:crypto';
import { ForbiddenException, HttpException, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { auditEvents } from '../../database/identity-schema';
import { actionPolicies, decideAuthorization, type ActionKey, type DenialReason, type ResourceRecord, type SessionProof, type SubjectRecord } from './authorization-model';
import { AuthorizationDatabase, AuthorizationResources, databaseTime, loadGrants, loadSubject, setPolicyContext, withScopeStates, type PolicyTransaction } from './authorization-database';
import { AuthorizationSettings } from './authorization-settings';

export interface RequestCredentials { readonly authorization?: string; readonly cookie?: string; readonly origin?: string; readonly csrf?: string }
export abstract class SessionProofVerifier { abstract verify(credentials: RequestCredentials): Promise<SessionProof | null> }
@Injectable()
export class DenySessionProofVerifier extends SessionProofVerifier { async verify(): Promise<null> { return null; } }
export interface AuthorizedWork {
  readonly tx: PolicyTransaction; readonly userId: string; readonly sessionId: string;
  readonly resource: ResourceRecord; readonly traceId: string; readonly grantId: string | null;
}
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
class InterruptedPolicy extends Error {
  constructor(readonly reason: DenialReason) { super('Authorization expired before commit'); }
}
const httpDenial = (reason: DenialReason) => reason === 'INVALID_SESSION' || reason === 'MFA_REQUIRED'
  ? new UnauthorizedException('Authentication required') : new ForbiddenException('Resource access denied');

@Injectable()
export class AuthorizationService {
  constructor(private readonly database: AuthorizationDatabase, private readonly verifier: SessionProofVerifier, private readonly resources: AuthorizationResources,
    @Optional() private readonly settings: AuthorizationSettings = new AuthorizationSettings()) {}

  async execute<T>(credentials: RequestCredentials, actionKey: ActionKey, resourceId: string, work: (context: AuthorizedWork) => Promise<T>): Promise<T> {
    const action = Object.hasOwn(actionPolicies,actionKey) ? actionPolicies[actionKey] : undefined;
    if (!action || typeof resourceId !== 'string' || (!uuid(resourceId)&&!(resourceId==='@self'&&action.self))) throw new ForbiddenException('Resource access denied');
    let proof: SessionProof | null;
    try { proof = await this.verifier.verify(credentials); } catch { proof = null; }
    if (!proof || ![proof.userId,proof.sessionId,proof.identityId].every(id => typeof id === 'string' && uuid(id))
      || !['PASSENGER','DRIVER','ADMIN'].includes(proof.purpose) || !Number.isFinite(proof.expiresAt)) throw new UnauthorizedException('Authentication required');
    // Copy the trusted adapter result so mutable provider/cache objects cannot change the transaction binding.
    const binding: SessionProof = Object.freeze({ ...proof, ...(proof.adminMfa ? { adminMfa: Object.freeze({ ...proof.adminMfa }) } : {}) });
    const id = resourceId==='@self'?(action.resource==='SESSION'?binding.sessionId:binding.userId):resourceId.toLowerCase(), traceId = randomUUID();
    let attemptResource: ResourceRecord | null = null, attemptSubject: SubjectRecord | null = null;
    const audit = async (tx: PolicyTransaction, outcome: 'ALLOWED' | 'DENIED', reason: string) => {
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: attemptSubject?.userId ?? null, actorSessionId: attemptSubject?.sessionId ?? null,
        cityTenantId: attemptResource?.cityTenantId ?? null, todaId: attemptResource?.todaId ?? null,
        action: `authorization.${actionKey.toLowerCase()}`, resourceId: id, outcome, reasonCode: reason, traceId });
    };
    let result: { allowed: false; reason: DenialReason } | { allowed: true; value: T };
    try {
      result = await this.database.transaction(async tx => {
        await setPolicyContext(tx,binding,null,null);
        // Serialize own-account mutations before taking shared policy locks (avoids lock upgrades racing).
        if(action.selfMutation)await tx.execute(sql`SELECT id FROM identity.app_users WHERE id=${binding.userId}::uuid FOR UPDATE`);
        const located = await this.resources.load(tx,action.resource,id);
        await setPolicyContext(tx,binding,located?.cityTenantId ?? null,located?.todaId ?? null);
        await tx.execute(sql`SELECT identity.lock_authorization_context(${binding.userId}::uuid,${binding.sessionId}::uuid,
          ${located?.cityTenantId ?? null}::uuid,${located?.todaId ?? null}::uuid,${action.permission}::text)`);
        attemptResource = await withScopeStates(tx,await this.resources.load(tx,action.resource,id));
        attemptSubject = await loadSubject(tx,binding);
        const changed = located && attemptResource && (located.cityTenantId !== attemptResource.cityTenantId || located.todaId !== attemptResource.todaId || located.version !== attemptResource.version);
        const decision = changed ? { allowed: false as const, reason: 'INVALID_RESOURCE' as const }
          : decideAuthorization(binding,attemptSubject,attemptResource,await loadGrants(tx,binding,attemptResource),action,await databaseTime(tx),this.settings);
        if (!decision.allowed) { await audit(tx,'DENIED',decision.reason); return decision; }
        if (!attemptResource) throw new Error('Missing authorized resource');
        await audit(tx,'ALLOWED','POLICY_ALLOWED'); // failure must prevent the handler and response
        const value = await work({ tx, userId: binding.userId, sessionId: binding.sessionId, resource: Object.freeze({ ...attemptResource }), traceId, grantId: decision.grantId });
        let finalSubject=await loadSubject(tx,binding);
        // A successful own logout intentionally revokes the very session being checked.
        if(action.terminalSession&&attemptResource.id===binding.sessionId&&finalSubject?.sessionState==='REVOKED')finalSubject={...finalSubject,sessionState:attemptSubject?.sessionState??'ACTIVE'};
        const finalDecision = decideAuthorization(binding,finalSubject,await withScopeStates(tx,attemptResource),await loadGrants(tx,binding,attemptResource),action,await databaseTime(tx),this.settings);
        if (!finalDecision.allowed) throw new InterruptedPolicy(finalDecision.reason);
        return { allowed: true as const, value };
      });
    } catch (error) {
      // The original transaction rolled back. Record only safe identifiers/reasons in a new transaction.
      try {
        await this.database.transaction(async tx => {
          await setPolicyContext(tx,binding,null,null);
          attemptSubject = await loadSubject(tx,binding);
          await audit(tx,'DENIED',error instanceof InterruptedPolicy ? error.reason : 'TRANSACTION_ABORTED');
        });
      } catch { throw new ServiceUnavailableException('Authorization temporarily unavailable'); }
      if (error instanceof InterruptedPolicy) throw httpDenial(error.reason);
      if (error instanceof HttpException) throw error; // validated domain errors; public bootstrap filter redacts values
      throw new ServiceUnavailableException('Authorization temporarily unavailable');
    }
    if (!result.allowed) throw httpDenial(result.reason);
    return result.value;
  }
}
