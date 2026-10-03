CREATE TABLE `shared_books` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`record` text NOT NULL,
	`pdf_key` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_books_hash_unique` ON `shared_books` (`hash`);