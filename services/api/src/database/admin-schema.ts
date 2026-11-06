import {sql} from 'drizzle-orm';
import {uuid,text,timestamp,check,foreignKey,index} from 'drizzle-orm/pg-core';
import {identity,appSessions} from './identity-schema';
const time=(name:string)=>timestamp(name,{withTimezone:true});
export const adminOidcFlows=identity.table('admin_oidc_flows',{
 id:uuid('id').primaryKey().defaultRandom(),requestDigest:text('request_digest').notNull().unique(),proofDigest:text('proof_digest').notNull(),stateDigest:text('state_digest').notNull().unique(),bindingDigest:text('binding_digest').notNull(),secretCiphertext:text('secret_ciphertext').notNull(),ipDigest:text('ip_digest').notNull(),
 createdAt:time('created_at').notNull().defaultNow(),expiresAt:time('expires_at').notNull(),usedAt:time('used_at'),
},t=>[check('admin_flow_values',sql`${t.requestDigest} ~ '^[0-9a-f]{64}$' AND ${t.proofDigest} ~ '^[0-9a-f]{64}$' AND ${t.stateDigest} ~ '^[0-9a-f]{64}$' AND ${t.bindingDigest} ~ '^[0-9a-f]{64}$' AND ${t.ipDigest} ~ '^[0-9a-f]{64}$' AND ${t.secretCiphertext} LIKE 'v1.%' AND ${t.expiresAt}>${t.createdAt} AND ${t.expiresAt}<=${t.createdAt}+interval '5 minutes'`),index('admin_flow_expiry_idx').on(t.expiresAt),index('admin_flow_budget_idx').on(t.ipDigest,t.createdAt)]);
export const adminBrowserSessions=identity.table('admin_browser_sessions',{
 sessionId:uuid('session_id').primaryKey(),cookieDigest:text('cookie_digest').notNull().unique(),csrfDigest:text('csrf_digest').notNull(),providerCiphertext:text('provider_ciphertext').notNull(),factorDigest:text('factor_digest').notNull(),
 createdAt:time('created_at').notNull().defaultNow(),
},t=>[foreignKey({name:'admin_browser_session',columns:[t.sessionId],foreignColumns:[appSessions.id]}),check('admin_browser_values',sql`${t.cookieDigest} ~ '^[0-9a-f]{64}$' AND ${t.csrfDigest} ~ '^[0-9a-f]{64}$' AND ${t.factorDigest} ~ '^[0-9a-f]{64}$' AND ${t.providerCiphertext} LIKE 'v1.%'`)]);
