CREATE TABLE "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "google_review_url" text,
  "whatsapp_number" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenants_status_chk" CHECK (status in ('ACTIVE','SUSPENDED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_uidx" ON "tenants" ("slug");
--> statement-breakpoint
CREATE TABLE "cashier_stations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "public_code" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cashier_stations_status_chk" CHECK (status in ('ACTIVE','DISABLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_stations_public_code_uidx" ON "cashier_stations" ("public_code");
CREATE INDEX "cashier_stations_tenant_idx" ON "cashier_stations" ("tenant_id");
--> statement-breakpoint
CREATE TABLE "cashiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cashiers_status_chk" CHECK (status in ('ACTIVE','DISABLED'))
);
--> statement-breakpoint
CREATE INDEX "cashiers_tenant_idx" ON "cashiers" ("tenant_id");
--> statement-breakpoint
CREATE TABLE "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "station_id" uuid NOT NULL REFERENCES "cashier_stations"("id"),
  "cashier_id" uuid NOT NULL REFERENCES "cashiers"("id"),
  "provider" text NOT NULL,
  "provider_payment_id" text,
  "external_reference" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "currency" char(3) DEFAULT 'ARS' NOT NULL,
  "status" text DEFAULT 'CREATED' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "paid_at" timestamptz,
  "completed_at" timestamptz,
  CONSTRAINT "payments_amount_chk" CHECK (amount > 0),
  CONSTRAINT "payments_status_chk" CHECK (status in ('CREATED','PENDING','PAID','CANCELLED','EXPIRED','COMPLETED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_reference_uidx" ON "payments" ("external_reference");
CREATE INDEX "payments_tenant_idx" ON "payments" ("tenant_id");
CREATE INDEX "payments_station_idx" ON "payments" ("station_id");
CREATE INDEX "payments_provider_payment_idx" ON "payments" ("provider","provider_payment_id");
CREATE INDEX "payments_status_idx" ON "payments" ("status");
--> statement-breakpoint
CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "phone" text,
  "name" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customers_tenant_idx" ON "customers" ("tenant_id");
CREATE INDEX "customers_tenant_phone_idx" ON "customers" ("tenant_id","phone");
--> statement-breakpoint
CREATE TABLE "marketing_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "consent" boolean NOT NULL,
  "consent_at" timestamptz DEFAULT now() NOT NULL,
  "ip" inet,
  "user_agent" text,
  CONSTRAINT "marketing_consents_channel_chk" CHECK (channel in ('WHATSAPP'))
);
--> statement-breakpoint
CREATE INDEX "marketing_consents_customer_idx" ON "marketing_consents" ("customer_id");
