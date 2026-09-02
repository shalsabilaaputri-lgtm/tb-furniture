ALTER TABLE `sales` ADD `delivery_distance` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `delivery_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `delivery_approval` text DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `customer_phone` text DEFAULT '' NOT NULL;