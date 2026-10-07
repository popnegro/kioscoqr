import { boolean, check, index, inet, numeric, pgTable, text, timestamp, uuid, uniqueIndex, char } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  googleReviewUrl: text("google_review_url"),
  whatsappNumber: text("whatsapp_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("tenants_slug_uidx").on(table.slug),
  check("tenants_status_chk", sql`status in ('ACTIVE','SUSPENDED')`),
]);

export const cashierStations = pgTable("cashier_stations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  publicCode: text("public_code").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("cashier_stations_public_code_uidx").on(table.publicCode),
  index("cashier_stations_tenant_idx").on(table.tenantId),
  check("cashier_stations_status_chk", sql`status in ('ACTIVE','DISABLED')`),
]);

export const cashiers = pgTable("cashiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("cashiers_tenant_idx").on(table.tenantId),
  check("cashiers_status_chk", sql`status in ('ACTIVE','DISABLED')`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  stationId: uuid("station_id").references(() => cashierStations.id).notNull(),
  cashierId: uuid("cashier_id").references(() => cashiers.id).notNull(),
  provider: text("provider").notNull(),
  providerPaymentId: text("provider_payment_id"),
  externalReference: text("external_reference").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).default("ARS").notNull(),
  status: text("status").default("CREATED").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("payments_external_reference_uidx").on(table.externalReference),
  index("payments_tenant_idx").on(table.tenantId),
  index("payments_station_idx").on(table.stationId),
  index("payments_provider_payment_idx").on(table.provider, table.providerPaymentId),
  index("payments_status_idx").on(table.status),
  check("payments_amount_chk", sql`amount > 0`),
  check("payments_status_chk", sql`status in ('CREATED','PENDING','PAID','CANCELLED','EXPIRED','COMPLETED')`),
]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  phone: text("phone"),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("customers_tenant_idx").on(table.tenantId),
  index("customers_tenant_phone_idx").on(table.tenantId, table.phone),
]);

export const marketingConsents = pgTable("marketing_consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }).notNull(),
  channel: text("channel").notNull(),
  consent: boolean("consent").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).defaultNow().notNull(),
  ip: inet("ip"),
  userAgent: text("user_agent"),
}, (table) => [
  index("marketing_consents_customer_idx").on(table.customerId),
  check("marketing_consents_channel_chk", sql`channel in ('WHATSAPP')`),
]);
