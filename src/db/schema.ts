import * as d from "drizzle-orm/pg-core"

export const profiles = d.pgTable("profiles", {
	id: d.uuid("id").primaryKey().defaultRandom(),
	email: d.varchar("email", { length: 255 }).notNull().unique(),
	username: d.varchar("username", { length: 256 }).notNull().unique(),
	createdAt: d.timestamp("created_at").defaultNow().notNull(),
})

export const otpCodes = d.pgTable("otp_codes", {
	id: d.serial("id").primaryKey(),
	email: d.varchar("email", { length: 255 }).notNull(),
	codeHash: d.text("code_hash").notNull(),
	expiresAt: d.timestamp("expires_at").notNull(),
})

export const sessions = d.pgTable("sessions", {
	id: d.varchar("id", { length: 255 }).primaryKey(),
	profileId: d.uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
	expiresAt: d.timestamp("expires_at").notNull(),
})
