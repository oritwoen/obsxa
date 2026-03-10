CREATE TABLE `cluster_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cluster_id` integer NOT NULL,
	`observation_id` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clusters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `duplicate_candidate_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidate_id` integer NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `duplicate_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`primary_observation_id` integer NOT NULL,
	`duplicate_observation_id` integer NOT NULL,
	`reason` text NOT NULL,
	`score` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_duplicate_candidates_pair` ON `duplicate_candidates` (`primary_observation_id`,`duplicate_observation_id`);
--> statement-breakpoint
CREATE TABLE `observation_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`observation_id` integer NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observation_merges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`primary_observation_id` integer NOT NULL,
	`merged_observation_id` integer NOT NULL,
	`relation_id` integer,
	`confidence_strategy` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observation_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_observation_id` integer NOT NULL,
	`to_observation_id` integer NOT NULL,
	`type` text NOT NULL,
	`confidence` integer DEFAULT 100 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observation_status_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`observation_id` integer NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'pattern' NOT NULL,
	`source` text NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`confidence` integer DEFAULT 50 NOT NULL,
	`frequency` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`promoted_to` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`data` text,
	`context` text,
	`captured_at` integer,
	`source_ref` text,
	`collector` text,
	`input_hash` text,
	`evidence_strength` integer DEFAULT 50 NOT NULL,
	`novelty` integer DEFAULT 50 NOT NULL,
	`uncertainty` integer DEFAULT 50 NOT NULL,
	`reproducibility_hint` text,
	`triage_score` integer DEFAULT 50 NOT NULL,
	`dismissed_reason_code` text,
	`archived_reason_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
