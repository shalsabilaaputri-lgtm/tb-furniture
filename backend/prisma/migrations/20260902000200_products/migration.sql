CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "allow_decimal" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(100),
    "product_type" VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "image_url" VARCHAR(500),
    "category_id" UUID NOT NULL,
    "base_unit_id" UUID NOT NULL,
    "tax_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "conversion_to_base" DECIMAL(18,4) NOT NULL,
    "is_default_sale" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_barcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "product_unit_id" UUID,
    "barcode" VARCHAR(100) NOT NULL,
    "label" VARCHAR(100),
    CONSTRAINT "product_barcodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_unit_id" UUID NOT NULL,
    "min_quantity" DECIMAL(18,4) NOT NULL,
    "sell_price" DECIMAL(18,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_prices_positive_quantity" CHECK ("min_quantity" > 0),
    CONSTRAINT "product_prices_nonnegative_price" CHECK ("sell_price" >= 0),
    CONSTRAINT "product_prices_valid_dates" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from")
);

CREATE TABLE "product_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_costs_nonnegative_cost" CHECK ("unit_cost" >= 0)
);

CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");
CREATE INDEX "product_categories_parent_id_sort_order_idx" ON "product_categories"("parent_id", "sort_order");
CREATE INDEX "product_categories_name_idx" ON "product_categories"("name");
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_category_id_is_active_idx" ON "products"("category_id", "is_active");
CREATE INDEX "products_brand_is_active_idx" ON "products"("brand", "is_active");
CREATE INDEX "products_updated_at_idx" ON "products"("updated_at" DESC);
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "products_sku_trgm_idx" ON "products" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX "products_brand_trgm_idx" ON "products" USING GIN ("brand" gin_trgm_ops);
CREATE UNIQUE INDEX "product_units_product_id_unit_id_key" ON "product_units"("product_id", "unit_id");
CREATE INDEX "product_units_product_id_is_default_sale_idx" ON "product_units"("product_id", "is_default_sale");
CREATE UNIQUE INDEX "product_barcodes_barcode_key" ON "product_barcodes"("barcode");
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes"("product_id");
CREATE UNIQUE INDEX "product_prices_branch_id_product_unit_id_min_quantity_key" ON "product_prices"("branch_id", "product_unit_id", "min_quantity");
CREATE INDEX "product_prices_branch_id_product_id_is_active_idx" ON "product_prices"("branch_id", "product_id", "is_active");
CREATE INDEX "product_prices_product_unit_id_min_quantity_idx" ON "product_prices"("product_unit_id", "min_quantity" DESC);
CREATE UNIQUE INDEX "product_costs_branch_id_product_id_key" ON "product_costs"("branch_id", "product_id");
CREATE INDEX "product_costs_product_id_idx" ON "product_costs"("product_id");

ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_costs" ADD CONSTRAINT "product_costs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
