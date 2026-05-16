import * as d from "drizzle-orm/pg-core"

import { DB_RULES } from "../../config/index.js"
import { profiles } from "./auth.js"

export const projectLedger = d.pgTable("project_ledger", {
	id: d.uuid("id").primaryKey().defaultRandom(),
	profileId: d.uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
	primaryUrl: d.text("primary_url").unique().notNull(),
	lastShowcaseDate: d.date("last_showcase_date"),
	createdAt: d.timestamp("created_at").defaultNow().notNull(),
})

export const projects = d.pgTable("projects", {
	id: d.uuid().primaryKey().defaultRandom(),
	referenceId: d
		.varchar("reference_id", { length: DB_RULES.lengthProjectRefId + DB_RULES.prefixProjectRefId.length })
		.unique()
		.notNull(),
	ledgerId: d
		.uuid("ledger_id")
		.notNull()
		.references(() => projectLedger.id, { onDelete: "cascade" }),

	showcaseDate: d.date("showcase_date").notNull(),
	status: d.text("status").notNull().default("draft_reserved"),
	reservedAt: d.timestamp("reserved_at").defaultNow().notNull(),

	name: d.varchar("name", { length: DB_RULES.maxLengthProjectTitle }).notNull(),
	category: d.text("category").notNull(),
	primaryPlatform: d.text("primary_platform").notNull(),
	primaryUrl: d.text("primary_url").notNull(),

	description: d.varchar("description", { length: DB_RULES.maxLengthProjectDescription }),
	tags: d.text("tags").array(),
	secondaryPlatforms: d.jsonb("secondary_platforms").$type<{ platform: string; url: string }[]>(),

	coverImagePath: d.text("cover_image_path"),
	screenshotPaths: d.text("screenshot_paths").array(),
	videoUrl: d.text("video_url"),

	createdAt: d.timestamp("created_at").defaultNow().notNull(),
})

export const receipts = d.pgTable("receipts", {
	id: d.uuid("id").primaryKey().defaultRandom(),
	profileId: d.uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
	ledgerId: d.uuid("ledger_id").references(() => projectLedger.id, { onDelete: "set null" }),

	projectReferenceId: d
		.varchar("project_reference_id", { length: DB_RULES.lengthProjectRefId + DB_RULES.prefixProjectRefId.length })
		.notNull(),
	showcaseDate: d.date("showcase_date").notNull(),

	priceCents: d.integer("price").notNull(),
	provider: d.text("provider").notNull(),
	providerTransactionId: d.text("provider_transaction_id").notNull(),
	receiptUrl: d.text("receipt_url"),

	status: d.text("status").notNull(),
	createdAt: d.timestamp("created_at").defaultNow().notNull(),
})
