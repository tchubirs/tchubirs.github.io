CREATE TABLE `contexto_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`live_id` text DEFAULT '' NOT NULL,
	`range_key` text NOT NULL,
	`verdict_json` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_usd_micros` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contexto_dia_contadores` (
	`dia` text PRIMARY KEY NOT NULL,
	`chamadas` integer DEFAULT 0 NOT NULL,
	`estimated_usd_micros` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contexto_live_contadores` (
	`live_id` text PRIMARY KEY NOT NULL,
	`valor` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contexto_reservas` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`live_id` text DEFAULT '' NOT NULL,
	`range_key` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
