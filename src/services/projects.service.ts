import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { and, arrayContains, count, eq, gte, inArray, lte, ne, or, sql, SQL } from "drizzle-orm"
import { nanoid } from "nanoid"

import { DB_RULES } from "../config/index.js"
import { db } from "../db/index.js"
import { profiles, projectLedger, projects, receipts } from "../db/schema.js"
import { BUCKET_NAME, CDN_DOMAIN, r2Client } from "../lib/r2.js"
import { publishContentSchema } from "../routes/projects/schemas.js"
import { UrlSanitizer } from "../utils/url-sanitizer.js"

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
				const sanitizedUrl = UrlSanitizer.sanitize(payload.primaryUrl, payload.primaryPlatform)
				const exists = await UrlSanitizer.validateExists(sanitizedUrl, payload.primaryPlatform)

				if (!exists) {
					throw new ServiceError("INVALID_URL")
				}

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
					where: eq(projectLedger.primaryUrl, sanitizedUrl),
				})

				if (ledgerEntry) {
					const activeProject = await tx.query.projects.findFirst({
						where: and(eq(projects.ledgerId, ledgerEntry.id), ne(projects.status, "canceled")),
					})

					if (!activeProject) {
						await tx.delete(projectLedger).where(eq(projectLedger.id, ledgerEntry.id))
						ledgerEntry = undefined
					} else if (ledgerEntry.lastShowcaseDate) {
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
				}

				if (!ledgerEntry) {
					const [newLedger] = await tx
						.insert(projectLedger)
						.values({
							profileId,
							primaryUrl: sanitizedUrl,
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
						primaryUrl: sanitizedUrl,
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

	static async claimFreeProject(referenceId: string, profileId: string) {
		const freeLaunchEndDate = process.env.FREE_LAUNCH_END_DATE || "2026-08-31"
		const nowIso = new Date().toISOString().split("T")[0]

		if (nowIso > freeLaunchEndDate) {
			return { error: "OFFER_EXPIRED" as const, message: "Free launch week offer has expired. Payment is required." }
		}

		return await db.transaction(async (tx) => {
			const [data] = await tx
				.select({
					project: projects,
					ledger: projectLedger,
				})
				.from(projects)
				.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
				.where(and(eq(projects.referenceId, referenceId), eq(projectLedger.profileId, profileId)))

			if (!data) {
				return { error: "NOT_FOUND" as const, message: "Project reservation not found or unauthorized." }
			}

			if (data.project.status !== "draft") {
				return { error: "INVALID_STATE" as const, message: "Only draft DOOMLIT projects can claim free launch slots." }
			}

			await tx.update(projects).set({ status: "incomplete" }).where(eq(projects.id, data.project.id))

			await tx
				.update(projectLedger)
				.set({ lastShowcaseDate: data.project.showcaseDate })
				.where(eq(projectLedger.id, data.ledger.id))

			return { success: true as const, message: "Free launch slot claimed successfully!" }
		})
	}

	static async rescheduleProject(referenceId: string, newDate: string, profileId: string) {
		const now = new Date()
		const utcHour = now.getUTCHours()
		const utcDate = now.toISOString().split("T")[0]

		const tomorrow = new Date(now)
		tomorrow.setUTCDate(now.getUTCDate() + 1)
		const utcTomorrow = tomorrow.toISOString().split("T")[0]

		if (newDate <= utcDate) {
			return { error: "INVALID_PAYLOAD" as const, message: "Cannot reschedule to today or a past date." }
		}
		if (newDate === utcTomorrow && utcHour >= DB_RULES.hourUTCDeadzone) {
			return {
				error: "DEADZONE_ACTIVE" as const,
				message: "DOOMLIT reservations for the next day closes at 23:00. Deadzone is active",
			}
		}

		try {
			return await db.transaction(async (tx) => {
				const [projectData] = await tx
					.select()
					.from(projects)
					.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
					.where(eq(projects.referenceId, referenceId))

				if (!projectData || projectData.project_ledger.profileId !== profileId) {
					throw new ServiceError("UNAUTHORIZED")
				}
				if (projectData.projects.status !== "incomplete" && projectData.projects.status !== "ready") {
					throw new ServiceError("INVALID_STATE")
				}
				if (projectData.projects.showcaseDate === newDate) {
					throw new ServiceError("INVALID_PAYLOAD", { message: "The DOOMLIT is already scheduled for this date." })
				}

				const [slotCount] = await tx
					.select({ value: count() })
					.from(projects)
					.where(and(eq(projects.showcaseDate, newDate), ne(projects.status, "canceled")))

				if (slotCount.value >= DB_RULES.limitDailySlots) {
					throw new ServiceError("SLOT_UNAVAILABLE")
				}

				await tx.update(projects).set({ showcaseDate: newDate }).where(eq(projects.id, projectData.projects.id))
				await tx
					.update(projectLedger)
					.set({ lastShowcaseDate: newDate })
					.where(eq(projectLedger.id, projectData.project_ledger.id))

				return { success: true as const }
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
			screenshots.push({ uploadUrl, publicUrl: `${CDN_DOMAIN}/${shotKey}`, path: shotKey })
		}

		return {
			success: true as const,
			data: {
				cover: { uploadUrl: coverUploadUrl, publicUrl: `${CDN_DOMAIN}/${coverKey}`, path: coverKey },
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
				coverImagePath: projects.coverImagePath,
				screenshotPaths: projects.screenshotPaths,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(eq(projects.referenceId, referenceId))

		if (!projectData || projectData.ownerId !== profileId) {
			return { error: "UNAUTHORIZED" as const }
		} else if (projectData.status !== "incomplete" && projectData.status !== "ready") {
			return { error: "INVALID_STATE" as const }
		}

		const orphansToDelete: string[] = []

		if (
			payload.coverImagePath !== undefined &&
			projectData.coverImagePath &&
			payload.coverImagePath !== projectData.coverImagePath
		) {
			orphansToDelete.push(projectData.coverImagePath)
		}

		if (payload.screenshotPaths !== undefined && projectData.screenshotPaths) {
			const newScreenshots = new Set(payload.screenshotPaths || [])
			for (const oldShot of projectData.screenshotPaths) {
				if (!newScreenshots.has(oldShot)) {
					orphansToDelete.push(oldShot)
				}
			}
		}

		await db.update(projects).set(payload).where(eq(projects.id, projectData.id))

		if (orphansToDelete.length > 0) {
			Promise.allSettled(
				orphansToDelete.map((key) => r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))),
			).catch((err) => console.error("Failed to delete orphaned CDN images:", err))
		}

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
				return { error: "UNAUTHORIZED" as const }
			} else if (projectData.projects.status !== "incomplete" && projectData.projects.status !== "ready") {
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

		let queryCount: number | undefined = undefined
		if (tag || platform) {
			const countResult = await db
				.select({ count: sql<number>`count(*)` })
				.from(projects)
				.where(and(...conditions))
			queryCount = Number(countResult[0].count)
		}

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

		return { feed, queryCount }
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

		if (
			draft.status === "draft" &&
			draft.reservedAt &&
			Date.now() - new Date(draft.reservedAt).getTime() > 15 * 60 * 1000
		) {
			return { error: "NOT_FOUND" }
		}

		return { success: true, data: draft }
	}

	static async getConfirmedProjects(profileId: string) {
		const result = await db
			.select({
				referenceId: projects.referenceId,
				category: projects.category,
				name: projects.name,
				showcaseDate: projects.showcaseDate,
				status: projects.status,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(and(eq(projectLedger.profileId, profileId), inArray(projects.status, ["incomplete", "ready"])))

		return result
	}

	static async getFullProject(referenceId: string, profileId: string) {
		const [projectData] = await db
			.select({
				referenceId: projects.referenceId,
				showcaseDate: projects.showcaseDate,
				status: projects.status,
				reservedAt: projects.reservedAt,
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
				createdAt: projects.createdAt,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.where(and(eq(projects.referenceId, referenceId), eq(projectLedger.profileId, profileId)))

		if (!projectData) {
			return { error: "NOT_FOUND" as const }
		}

		return { success: true as const, data: projectData }
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

		if (draft.reservedAt && Date.now() - new Date(draft.reservedAt).getTime() > 15 * 60 * 1000) {
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

		if (projectData.status === "draft" || projectData.status === "incomplete" || projectData.status === "ready") {
			await db.delete(projects).where(eq(projects.id, projectData.id))
			await db.delete(projectLedger).where(eq(projectLedger.id, projectData.ledgerId))
		} else {
			return { error: "INVALID_STATE" as const }
		}

		return { success: true as const }
	}

	static async refundProject(referenceId: string, profileId: string) {
		const now = new Date()
		const utcHour = now.getUTCHours()
		const utcDate = now.toISOString().split("T")[0]

		const tomorrow = new Date(now)
		tomorrow.setUTCDate(now.getUTCDate() + 1)
		const utcTomorrow = tomorrow.toISOString().split("T")[0]

		const [projectData] = await db
			.select({
				id: projects.id,
				ledgerId: projects.ledgerId,
				status: projects.status,
				showcaseDate: projects.showcaseDate,
				coverImagePath: projects.coverImagePath,
				screenshotPaths: projects.screenshotPaths,
				receiptId: receipts.id,
				providerTransactionId: receipts.providerTransactionId,
				receiptStatus: receipts.status,
			})
			.from(projects)
			.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
			.leftJoin(receipts, eq(projects.referenceId, receipts.projectReferenceId))
			.where(and(eq(projects.referenceId, referenceId), eq(projectLedger.profileId, profileId)))
			.limit(1)

		if (!projectData) return { error: "NOT_FOUND" as const }
		if (projectData.status === "draft" || projectData.status === "canceled") {
			return { error: "INVALID_STATE" as const }
		}

		if (projectData.showcaseDate <= utcDate) {
			return {
				error: "INVALID_PAYLOAD" as const,
				message: "Cannot refund a project that is showcasing today or already showcased.",
			}
		}
		if (projectData.showcaseDate === utcTomorrow && utcHour >= DB_RULES.hourUTCDeadzone) {
			return {
				error: "DEADZONE_ACTIVE" as const,
				message: "DOOMLIT cancellations for the next day closes at 23:00. Deadzone is active",
			}
		}

		if (!projectData.providerTransactionId || projectData.receiptStatus !== "succeeded") {
			await db.transaction(async (tx) => {
				await tx.delete(projects).where(eq(projects.id, projectData.id))
				await tx.delete(projectLedger).where(eq(projectLedger.id, projectData.ledgerId))
			})

			const orphansToDelete: string[] = []
			if (projectData.coverImagePath) orphansToDelete.push(projectData.coverImagePath)
			if (projectData.screenshotPaths && projectData.screenshotPaths.length > 0)
				orphansToDelete.push(...projectData.screenshotPaths)

			if (orphansToDelete.length > 0) {
				Promise.allSettled(
					orphansToDelete.map((key) => r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))),
				).catch((err) => console.error("Failed to delete orphaned CDN images upon cancellation:", err))
			}

			return { success: true as const, message: "Reservation canceled successfully." }
		}

		await db.transaction(async (tx) => {
			if (projectData.receiptId) {
				await tx.update(receipts).set({ status: "refunded" }).where(eq(receipts.id, projectData.receiptId))
			}
			await tx.delete(projects).where(eq(projects.id, projectData.id))
			await tx.delete(projectLedger).where(eq(projectLedger.id, projectData.ledgerId))
		})

		const orphansToDelete: string[] = []
		if (projectData.coverImagePath) orphansToDelete.push(projectData.coverImagePath)
		if (projectData.screenshotPaths && projectData.screenshotPaths.length > 0)
			orphansToDelete.push(...projectData.screenshotPaths)

		if (orphansToDelete.length > 0) {
			Promise.allSettled(
				orphansToDelete.map((key) => r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))),
			).catch((err) => console.error("Failed to delete orphaned CDN images upon refund:", err))
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
		const freeLaunchEndDate = process.env.FREE_LAUNCH_END_DATE || "2026-08-31"
		const nowIso = new Date().toISOString().split("T")[0]

		return {
			maxReservationsPerDay: DB_RULES.limitDailySlots,
			cooldownPeriodDays: DB_RULES.durationProjectCooldown,
			draftExpirationMinutes: DB_RULES.durationPaymentTimeout,
			deadzoneWindow: {
				start: `${String(DB_RULES.hourUTCDeadzone).padStart(2, "0")}:00`,
				end: DB_RULES.timeUTCServerReset,
				timezone: "UTC",
			},
			maxTagCount: DB_RULES.limitTags,
			maxScreenshotCount: DB_RULES.limitScreenshots,
			maxImageFileSizeMB: DB_RULES.maxSizeUploadedImage,
			maxLengthProjectName: DB_RULES.maxLengthProjectTitle,
			maxLengthProjectDescription: DB_RULES.maxLengthProjectDescription,
			freeLaunchEndDate,
			isFreeLaunchActive: nowIso <= freeLaunchEndDate,
		}
	}

	static async getProjectsPerCategory(date: string) {
		const [total] = await db
			.select({ total: count() })
			.from(projects)
			.where(and(eq(projects.showcaseDate, date), eq(projects.status, "ready")))

		if (!total || Number(total.total) === 0) {
			return []
		}

		const rawCounts = await db
			.select({
				category: projects.category,
				count: count(),
			})
			.from(projects)
			.where(and(eq(projects.showcaseDate, date), eq(projects.status, "ready")))
			.groupBy(projects.category)

		return rawCounts
			.filter((row) => Number(row.count) > 0)
			.map((row) => ({
				category: row.category,
				count: Number(row.count),
			}))
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
