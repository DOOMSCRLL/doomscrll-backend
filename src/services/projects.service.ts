import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { and, arrayContains, count, eq, gte, inArray, lte, ne, or, sql, SQL } from "drizzle-orm"
import { nanoid } from "nanoid"

import { DB_RULES } from "../config/index.js"
import { db } from "../db/index.js"
import { profiles, projectLedger, projects } from "../db/schema.js"
import { BUCKET_NAME, r2Client } from "../lib/r2.js"
import { publishContentSchema } from "../routes/projects/schemas.js"

export class ServiceError extends Error {
	code: string
	details?: any
	constructor(code: string, details?: any) {
		super(code)
		this.code = code
		this.details = details
	}
}

export class ProjectsService {
	static async reserveProject(payload: any, profileId: string) {
		const now = new Date()
		const utcHour = now.getUTCHours()
		const utcDate = now.toISOString().split("T")[0]

		const tomorrow = new Date(now)
		tomorrow.setUTCDate(now.getUTCDate() + 1)
		const utcTomorrow = tomorrow.toISOString().split("T")[0]

		if (payload.showcaseDate <= utcDate) {
			return { error: "INVALID_PAYLOAD" as const, message: "Cannot reserve a DOOMLIT for today or a past date." }
		}
		if (payload.showcaseDate === utcTomorrow && utcHour >= DB_RULES.hourUTCDeadzone) {
			return {
				error: "DEADZONE_ACTIVE" as const,
				message: "DOOMLIT reservations for the next day closes at 23:00. Deadzone is active",
			}
		}

		try {
			return await db.transaction(async (tx) => {
				const [slotCount] = await tx
					.select({ value: count() })
					.from(projects)
					.where(and(eq(projects.showcaseDate, payload.showcaseDate), ne(projects.status, "canceled")))

				if (slotCount.value >= DB_RULES.limitDailySlots) {
					throw new ServiceError("SLOT_UNAVAILABLE")
				}

				const [existingDrafts] = await tx
					.select({ value: count() })
					.from(projects)
					.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
					.where(and(eq(projectLedger.profileId, profileId), eq(projects.status, "draft")))

				if (Number(existingDrafts.value) > 0) {
					throw new ServiceError("DRAFT_LIMIT_REACHED")
				}

				let ledgerEntry = await tx.query.projectLedger.findFirst({
					where: eq(projectLedger.primaryUrl, payload.primaryUrl),
				})

				if (ledgerEntry) {
					if (ledgerEntry.lastShowcaseDate) {
						const lastDate = new Date(ledgerEntry.lastShowcaseDate)
						const targetDate = new Date(payload.showcaseDate)
						const daysDiff = (targetDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24)

						if (daysDiff < DB_RULES.durationProjectCooldown) {
							throw new ServiceError("COOLDOWN_ACTIVE", {
								availableAfter: new Date(lastDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
							})
						}
					} else {
						throw new ServiceError("INVALID_PAYLOAD", {
							message: "This URL is currently being reserved by another user.",
						})
					}
				} else {
					const [newLedger] = await tx
						.insert(projectLedger)
						.values({
							profileId,
							primaryUrl: payload.primaryUrl,
						})
						.returning()
					ledgerEntry = newLedger
				}

				const referenceId = `${DB_RULES.prefixProjectRefId}${nanoid(DB_RULES.lengthProjectRefId)}`
				const [newProject] = await tx
					.insert(projects)
					.values({
						referenceId,
						ledgerId: ledgerEntry.id,
						showcaseDate: payload.showcaseDate,
						name: payload.name,
						category: payload.category,
						primaryPlatform: payload.primaryPlatform,
						primaryUrl: payload.primaryUrl,
						status: "draft",
					})
					.returning()

				return { success: true as const, project: newProject }
			})
		} catch (error) {
			if (error instanceof ServiceError) {
				return { error: error.code as any, details: error.details }
			}
			throw error
		}
	}

	static async getUploadUrls(referenceId: string, screenshotCount: number, profileId: string) {
		const [projectData] = await db
			.select({ status: projects.status, ownerId: projectLedger.profileId })
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(eq(projects.referenceId, referenceId))

		if (!projectData || projectData.ownerId !== profileId) {
			return { error: "UNAUTHORIZED" as const }
		}
		if (projectData.status !== "incomplete" && projectData.status !== "ready") {
			return { error: "INVALID_STATE" as const }
		}

		const coverKey = `projects/${referenceId}/cover-${Date.now()}.webp`
		const coverCommand = new PutObjectCommand({
			Bucket: BUCKET_NAME,
			Key: coverKey,
			ContentType: "image/webp",
		})
		const coverUploadUrl = await getSignedUrl(r2Client, coverCommand, { expiresIn: 3600 })

		const screenshots = []
		for (let i = 0; i < screenshotCount; i++) {
			const shotKey = `projects/${referenceId}/screenshot-${i}-${Date.now()}.webp`
			const shotCommand = new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: shotKey,
				ContentType: "image/webp",
			})
			const uploadUrl = await getSignedUrl(r2Client, shotCommand, { expiresIn: 3600 })
			screenshots.push({ uploadUrl, path: shotKey })
		}

		return {
			success: true as const,
			data: {
				cover: { uploadUrl: coverUploadUrl, path: coverKey },
				screenshots: screenshots,
			},
		}
	}

	static async updateProject(referenceId: string, payload: any, profileId: string) {
		const [projectData] = await db
			.select({
				id: projects.id,
				status: projects.status,
				ownerId: projectLedger.profileId,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(eq(projects.referenceId, referenceId))

		if (!projectData || projectData.ownerId !== profileId) {
			return { error: "UNAUTHORIZED" as const }
		} else if (projectData.status !== "incomplete" && projectData.status !== "ready") {
			return { error: "INVALID_STATE" as const }
		}

		await db.update(projects).set(payload).where(eq(projects.id, projectData.id))
		return { success: true as const }
	}

	static async publishProject(referenceId: string, profileId: string) {
		return await db.transaction(async (tx) => {
			const [projectData] = await tx
				.select()
				.from(projects)
				.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
				.where(eq(projects.referenceId, referenceId))

			if (!projectData || projectData.project_ledger.profileId !== profileId) {
				tx.rollback()
				return { error: "UNAUTHORIZED" as const }
			} else if (projectData.projects.status !== "incomplete" && projectData.projects.status !== "ready") {
				tx.rollback()
				return { error: "INVALID_STATE" as const }
			}

			const p = projectData.projects
			const validation = publishContentSchema.safeParse({
				description: p.description,
				tags: p.tags,
				features: p.features,
				coverImagePath: p.coverImagePath,
				screenshotPaths: p.screenshotPaths,
				secondaryPlatforms: p.secondaryPlatforms,
				videoUrl: p.videoUrl,
			})

			if (!validation.success) {
				tx.rollback()
				return { error: "VALIDATION_FAILED" as const, issues: validation.error.flatten().fieldErrors }
			}

			await tx.update(projects).set({ status: "ready" }).where(eq(projects.id, p.id))
			await tx
				.update(projectLedger)
				.set({ lastShowcaseDate: p.showcaseDate })
				.where(eq(projectLedger.id, projectData.project_ledger.id))
			return { success: true as const }
		})
	}

	static async getProjectFeed(query: any) {
		const { page, batchSize, category, platform, tag } = query
		const offset = (page - 1) * batchSize
		const todayUtc = new Date().toISOString().split("T")[0]

		const conditions: SQL[] = [eq(projects.status, "ready"), eq(projects.showcaseDate, todayUtc)]

		if (category) conditions.push(eq(projects.category, category))
		if (tag) conditions.push(arrayContains(projects.tags, [tag]))
		if (platform) {
			conditions.push(
				or(
					eq(projects.primaryPlatform, platform),
					sql`${projects.secondaryPlatforms} @> ${JSON.stringify([{ platform }])}::jsonb`,
				) as SQL,
			)
		}

		// Simplified pagination: ordered directly by ID for consistent cursor paging.
		const orderByClause = projects.id

		const feed = await db
			.select({
				referenceId: projects.referenceId,
				name: projects.name,
				category: projects.category,
				tags: projects.tags,
				coverImagePath: projects.coverImagePath,
				creator: { username: profiles.username },
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.innerJoin(profiles, eq(projectLedger.profileId, profiles.id))
			.where(and(...conditions))
			.orderBy(orderByClause)
			.limit(batchSize)
			.offset(offset)

		return feed
	}

	static async getProjectPreviews(date: string, category: string) {
		const previews = await db
			.select({
				name: projects.name,
				category: projects.category,
				tags: projects.tags,
				authorUsername: profiles.username,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.innerJoin(profiles, eq(projectLedger.profileId, profiles.id))
			.where(and(eq(projects.showcaseDate, date), eq(projects.category, category), eq(projects.status, "ready")))

		return previews
	}

	static async getDraft(referenceId: string, profileId: string) {
		const [draft] = await db
			.select({
				referenceId: projects.referenceId,
				name: projects.name,
				status: projects.status,
				showcaseDate: projects.showcaseDate,
				reservedAt: projects.reservedAt,
				createdAt: projects.createdAt,
				authorHandle: profiles.username,
				category: projects.category,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.innerJoin(profiles, eq(projectLedger.profileId, profiles.id))
			.where(
				and(
					eq(projects.referenceId, referenceId),
					eq(projectLedger.profileId, profileId),
					eq(projects.status, "draft"),
				),
			)

		if (!draft) {
			return { error: "NOT_FOUND" }
		}

		if (draft.status === "draft" && Date.now() - new Date(draft.reservedAt!).getTime() > 15 * 60 * 1000) {
			return { error: "NOT_FOUND" }
		}

		return { success: true, data: draft }
	}

	static async getActiveDraftReference(profileId: string) {
		const [draft] = await db
			.select({ referenceId: projects.referenceId, reservedAt: projects.reservedAt })
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(and(eq(projectLedger.profileId, profileId), eq(projects.status, "draft")))
			.limit(1)

		if (!draft) {
			return { error: "NOT_FOUND" as const }
		}

		if (Date.now() - new Date(draft.reservedAt!).getTime() > 15 * 60 * 1000) {
			return { error: "NOT_FOUND" as const }
		}

		return { success: true as const, data: draft }
	}

	static async cancelProject(referenceId: string, profileId: string) {
		const [projectData] = await db
			.select({ id: projects.id, ledgerId: projects.ledgerId, status: projects.status })
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(and(eq(projects.referenceId, referenceId), eq(projectLedger.profileId, profileId)))

		if (!projectData) return { error: "NOT_FOUND" as const }

		if (projectData.status === "draft") {
			await db.delete(projectLedger).where(eq(projectLedger.id, projectData.ledgerId))
		} else if (projectData.status === "incomplete" || projectData.status === "ready") {
			await db.update(projects).set({ status: "canceled" }).where(eq(projects.id, projectData.id))
		} else {
			return { error: "INVALID_STATE" as const }
		}

		return { success: true as const }
	}

	static async getSingleProject(referenceId: string) {
		const todayUtc = new Date().toISOString().split("T")[0]

		const [project] = await db
			.select({
				referenceId: projects.referenceId,
				name: projects.name,
				category: projects.category,
				primaryPlatform: projects.primaryPlatform,
				primaryUrl: projects.primaryUrl,
				description: projects.description,
				tags: projects.tags,
				features: projects.features,
				coverImagePath: projects.coverImagePath,
				screenshotPaths: projects.screenshotPaths,
				secondaryPlatforms: projects.secondaryPlatforms,
				videoUrl: projects.videoUrl,
				creator: {
					username: profiles.username,
					description: profiles.description,
					url: profiles.url,
				},
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.innerJoin(profiles, eq(projectLedger.profileId, profiles.id))
			.where(
				and(eq(projects.referenceId, referenceId), eq(projects.status, "ready"), eq(projects.showcaseDate, todayUtc)),
			)

		return project || null
	}

	static getRules() {
		return {
			maxReservationsPerDay: DB_RULES.limitDailySlots,
			reservationWindowDays: DB_RULES.limitReservationWindow,
			cooldownPeriodDays: DB_RULES.durationProjectCooldown,
			draftExpirationMinutes: DB_RULES.durationPaymentTimeout,
			deadzoneWindow: {
				start: `${String(DB_RULES.hourUTCDeadzone).padStart(2, "0")}:00`,
				end: DB_RULES.timeUTCServerReset,
				timezone: "UTC",
			},
		}
	}

	static async getReservationCounts(year?: number, month?: number) {
		const now = new Date()
		const targetYear = year ?? now.getUTCFullYear()
		const targetMonth = month ?? now.getUTCMonth() + 1

		const startStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`
		const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
		const endStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

		const rawCounts = await db
			.select({
				date: projects.showcaseDate,
				activeCount: count(),
			})
			.from(projects)
			.where(
				and(
					inArray(projects.status, ["incomplete", "ready"]),
					gte(projects.showcaseDate, startStr),
					lte(projects.showcaseDate, endStr),
				),
			)
			.groupBy(projects.showcaseDate)

		const countMap: Record<string, number> = {}
		for (const row of rawCounts) {
			if (row.date) {
				countMap[row.date] = Number(row.activeCount)
			}
		}

		return {
			meta: {
				year: targetYear,
				month: targetMonth,
				maxReservationsPerDay: DB_RULES.limitDailySlots,
			},
			counts: countMap,
		}
	}
}
