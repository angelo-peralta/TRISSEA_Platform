import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Operational tables are deliberately not migrated from the historical reference.
 * M2 will review city/TODA tenancy and record its ADR before adding those tables. */
export const foundationMetadata = pgTable('foundation_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
