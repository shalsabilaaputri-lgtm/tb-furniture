CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`attendance_date` text NOT NULL,
	`scheduled_start` text NOT NULL,
	`check_in_time` text,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attendance_employee_date` ON `attendance` (`employee_id`,`attendance_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_branch_date` ON `attendance` (`branch_id`,`attendance_date`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`name` text NOT NULL,
	`position` text DEFAULT 'Karyawan Toko' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`scheduled_start` text DEFAULT '08:00' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_employees_branch_active` ON `employees` (`branch_id`,`is_active`);