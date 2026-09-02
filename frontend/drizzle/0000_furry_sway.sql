CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`branch_id` text,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`reference_number` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_date` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'Ecer' NOT NULL,
	`credit_limit` integer DEFAULT 0 NOT NULL,
	`outstanding` integer DEFAULT 0 NOT NULL,
	`referral_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customers_name` ON `customers` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_customers_whatsapp` ON `customers` (`whatsapp`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`series` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`size` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT 'dus' NOT NULL,
	`pieces_per_box` real,
	`sqm_per_box` real,
	`purchase_price` integer DEFAULT 0 NOT NULL,
	`landed_cost` integer DEFAULT 0 NOT NULL,
	`selling_price` integer DEFAULT 0 NOT NULL,
	`wholesale_price` integer DEFAULT 0 NOT NULL,
	`project_price` integer DEFAULT 0 NOT NULL,
	`minimum_price` integer DEFAULT 0 NOT NULL,
	`minimum_stock` real DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_unique` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_products_name` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_products_brand_category` ON `products` (`brand`,`category`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`unit_price` integer NOT NULL,
	`cost_price` integer NOT NULL,
	`line_total` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sale_items_sale` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`branch_id` text NOT NULL,
	`customer_id` text,
	`subtotal` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`payment_method` text NOT NULL,
	`paid_amount` integer NOT NULL,
	`status` text DEFAULT 'PAID' NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoice_number_unique` ON `sales` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_sales_branch_date` ON `sales` (`branch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_number` text NOT NULL,
	`branch_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`product_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity` real NOT NULL,
	`stock_before` real NOT NULL,
	`stock_after` real NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_movements_product_date` ON `stock_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_movements_branch_date` ON `stock_movements` (`branch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`product_id` text NOT NULL,
	`batch` text DEFAULT 'REGULER' NOT NULL,
	`shade` text DEFAULT 'STD' NOT NULL,
	`physical_qty` real DEFAULT 0 NOT NULL,
	`reserved_qty` real DEFAULT 0 NOT NULL,
	`damaged_qty` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stocks_qty_valid" CHECK("stocks"."physical_qty" >= 0 AND "stocks"."reserved_qty" >= 0 AND "stocks"."damaged_qty" >= 0 AND "stocks"."physical_qty" >= "stocks"."reserved_qty")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_stocks_location_product_batch` ON `stocks` (`branch_id`,`warehouse_id`,`product_id`,`batch`,`shade`);--> statement-breakpoint
CREATE INDEX `idx_stocks_branch_product` ON `stocks` (`branch_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_warehouses_branch` ON `warehouses` (`branch_id`);