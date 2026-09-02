CREATE TABLE `customer_return_items` (
	`id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` integer NOT NULL,
	`refund_amount` integer NOT NULL,
	FOREIGN KEY (`return_id`) REFERENCES `customer_returns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customer_return_items_return` ON `customer_return_items` (`return_id`);--> statement-breakpoint
CREATE TABLE `customer_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`return_number` text NOT NULL,
	`sale_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`customer_id` text,
	`total_refund` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`condition` text NOT NULL,
	`status` text DEFAULT 'COMPLETED' NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_returns_return_number_unique` ON `customer_returns` (`return_number`);--> statement-breakpoint
CREATE INDEX `idx_customer_returns_branch_date` ON `customer_returns` (`branch_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_returns_sale` ON `customer_returns` (`sale_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_branch_date` ON `expenses` (`branch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `receivable_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference_number` text NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receivable_payments_reference_number_unique` ON `receivable_payments` (`reference_number`);--> statement-breakpoint
CREATE INDEX `idx_receivable_payments_customer_date` ON `receivable_payments` (`customer_id`,`created_at`);