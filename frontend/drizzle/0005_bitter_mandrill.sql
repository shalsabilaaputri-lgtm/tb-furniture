CREATE TABLE `stock_transfer_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` real NOT NULL,
	FOREIGN KEY (`transfer_id`) REFERENCES `stock_transfers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfer_items_quantity_positive" CHECK("stock_transfer_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_transfer_items_product` ON `stock_transfer_items` (`transfer_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_number` text NOT NULL,
	`source_branch_id` text NOT NULL,
	`source_warehouse_id` text NOT NULL,
	`destination_branch_id` text NOT NULL,
	`destination_warehouse_id` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`requested_by` text NOT NULL,
	`approved_by` text,
	`shipped_by` text,
	`received_by` text,
	`approved_at` text,
	`shipped_at` text,
	`received_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfers_different_branches" CHECK("stock_transfers"."source_branch_id" <> "stock_transfers"."destination_branch_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_transfers_transfer_number_unique` ON `stock_transfers` (`transfer_number`);--> statement-breakpoint
CREATE INDEX `idx_transfers_source_status` ON `stock_transfers` (`source_branch_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_transfers_destination_status` ON `stock_transfers` (`destination_branch_id`,`status`,`created_at`);