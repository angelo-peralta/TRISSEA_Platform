import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export * from './identity-schema';

/** M1 ledger/table preserved; M2 uses reviewed incremental migrations, never legacy SQL. */
export const foundationMetadata = pgTable('foundation_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
