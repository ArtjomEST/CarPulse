CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`make` text,
	`model` text,
	`price_eur` integer,
	`year` integer,
	`mileage_km` integer,
	`fuel` text,
	`transmission` text,
	`location` text,
	`image_url` text,
	`raw_json` text,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listings_source_external_idx` ON `listings` (`source`,`external_id`);--> statement-breakpoint
CREATE INDEX `listings_last_seen_idx` ON `listings` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_message_id` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`match_id`) REFERENCES `radar_matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_match_channel_idx` ON `notification_deliveries` (`match_id`,`channel`);--> statement-breakpoint
CREATE TABLE `radar_filters` (
	`radar_id` integer PRIMARY KEY NOT NULL,
	`filter_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`radar_id`) REFERENCES `radars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `radar_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`radar_id` integer NOT NULL,
	`listing_id` integer NOT NULL,
	`matched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`notification_state` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`radar_id`) REFERENCES `radars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_matches_unique_idx` ON `radar_matches` (`radar_id`,`listing_id`);--> statement-breakpoint
CREATE INDEX `radar_matches_matched_at_idx` ON `radar_matches` (`matched_at`);--> statement-breakpoint
CREATE TABLE `source_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`new_listing_count` integer DEFAULT 0 NOT NULL,
	`new_match_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `source_runs_source_started_idx` ON `source_runs` (`source`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_listing_idx` ON `favorites` (`user_email`,`source`,`external_listing_id`);--> statement-breakpoint
CREATE INDEX `radars_user_email_idx` ON `radars` (`user_email`);