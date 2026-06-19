import { eq } from "drizzle-orm"
import sanitizeHtml from "sanitize-html"
import { db } from "../db/index.js"
import { profiles } from "../db/schema.js"

export class ProfileService {
	static async getProfileById(userId: string) {
		const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
		return profile || null
	}

	static async getPublicProfileByUsername(username: string) {
		const [publicProfile] = await db
			.select({
				username: profiles.username,
				description: profiles.description,
				url: profiles.url,
			})
			.from(profiles)
			.where(eq(profiles.username, username))
			.limit(1)

		return publicProfile || null
	}

	static async updateProfile(userId: string, updatesData: { username?: string; description?: string; url?: string }) {
		const updates: Partial<typeof profiles.$inferInsert> = {}

		if (updatesData.username !== undefined) updates.username = updatesData.username
		if (updatesData.url !== undefined) updates.url = updatesData.url
		if (updatesData.description !== undefined) {
			updates.description = sanitizeHtml(updatesData.description, {
				allowedTags: [],
				allowedAttributes: {},
			})
		}

		if (Object.keys(updates).length === 0) {
			return { error: "NO_CHANGES" as const }
		}

		try {
			const [updatedProfile] = await db.update(profiles).set(updates).where(eq(profiles.id, userId)).returning({
				username: profiles.username,
				description: profiles.description,
				url: profiles.url,
			})

			return { success: true as const, profile: updatedProfile }
		} catch (error: any) {
			if (error.code === "23505" && error.constraint === "profiles_username_unique") {
				return { error: "USERNAME_TAKEN" as const }
			}
			throw error
		}
	}

	static async deleteProfile(userId: string) {
		const deleted = await db.delete(profiles).where(eq(profiles.id, userId)).returning({ id: profiles.id })
		if (deleted.length === 0) {
			return { error: "NOT_FOUND" as const }
		}
		return { success: true as const }
	}
}
