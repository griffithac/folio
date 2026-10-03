// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const classificationQuota = sqliteTable('classification_quota', {
  day: text('day').primaryKey(),
  used: integer('used').notNull().default(0),
});
export const sharedBooks = sqliteTable('shared_books', {
  id: text('id').primaryKey(),
  hash: text('hash').notNull().unique(),
  record: text('record').notNull(),
  pdfKey: text('pdf_key').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
