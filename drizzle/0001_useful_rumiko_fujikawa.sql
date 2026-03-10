DELETE FROM `cluster_members` WHERE rowid NOT IN (SELECT MIN(rowid) FROM `cluster_members` GROUP BY `cluster_id`, `observation_id`);--> statement-breakpoint
DELETE FROM `observation_relations` WHERE rowid NOT IN (SELECT MIN(rowid) FROM `observation_relations` GROUP BY `from_observation_id`, `to_observation_id`, `type`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cluster_members_pair` ON `cluster_members` (`cluster_id`,`observation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_observation_relations_triple` ON `observation_relations` (`from_observation_id`,`to_observation_id`,`type`);
