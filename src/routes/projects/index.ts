import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { and, count, eq, sql } from "drizzle-orm"
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

import { DB_RULES } from "../../config/index.js"
import { db } from "../../db/index.js"
import { projectLedger, projects } from "../../db/schema.js"
import { BUCKET_NAME, r2Client } from "../../lib/r2.js"
import { patchContentSchema, publishContentSchema, reserveProjectSchema } from "./schemas.js"

export const projectRoutes: FastifyPluginAsyncZod = async (fastify) => {
	fastify.post(
		"reserve",
		{
			schema: { body: reserveProjectSchema },
			preHandler: [fastify.authenticate],
		},
		async (request, reply) => {
			const payload = request.body
			const profileId = request.user.id

			const now = new Date()
			const utcHour = now.getUTCHours()
			const utcDate = now.toISOString().split("T")[0]

			const tomorrow = new Date(now)
			tomorrow.setUTCDate(now.getUTCDate() + 1)
			const utcTomorrow = tomorrow.toISOString().split("T")[0]

			if (payload.showcaseDate <= utcDate) {
				return reply.code(400).send({
					success: false,
					error: { code: "INVALID_PAYLOAD", message: "Cannot reserve a DOOMLIT for today or a past date." },
				})
			}
			if (payload.showcaseDate === utcTomorrow && utcHour >= DB_RULES.hourUTCDeadzone) {
				return reply.code(403).send({
					success: false,
					error: {
						code: "DEADZONE_ACTIVE",
						message: "DOOMLIT reservations for the next day closes at 23:00. Deadzone is active",
					},
				})
			}

			try {
				const result = await db.transaction(async (tx) => {
					const [slotCount] = await tx
						.select({ value: count() })
						.from(projects)
						.where(and(eq(projects.showcaseDate, payload.showcaseDate), sql`${projects.status} != 'failed'`))

					if (slotCount.value >= DB_RULES.limitDailySlots) {
						tx.rollback()
						return { error: "SLOT_UNAVAILABLE" as const }
					}

					let ledgerEntry = await tx.query.projectLedger.findFirst({
						where: eq(projectLedger.primaryUrl, payload.primaryUrl),
					})

					if (ledgerEntry && ledgerEntry.lastShowcaseDate) {
						const lastDate = new Date(ledgerEntry.lastShowcaseDate)
						const targetDate = new Date(payload.showcaseDate)
						const daysDiff = (targetDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24)

						if (daysDiff < DB_RULES.durationProjectCooldown) {
							tx.rollback()
							return {
								error: "COOLDOWN_ACTIVE" as const,
								details: {
									availableAfter: new Date(lastDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
								},
							}
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

					return { success: true, project: newProject }
				})

				if (result.error === "SLOT_UNAVAILABLE") {
					return reply.code(409).send({
						success: false,
						error: { code: "SLOT_UNAVAILABLE", message: "All DOOMLITs have been reserved for this date." },
					})
				} else if (result.error === "COOLDOWN_ACTIVE") {
					return reply.code(429).send({
						success: false,
						error: {
							code: "COOLDOWN_ACTIVE",
							message: "A project can not be re-showcased before 14 days since it's showcase date.",
							details: result.details,
						},
					})
				} else {
					return reply.code(200).send({
						success: true,
						data: {
							referenceId: result.project.referenceId,
							message:
								"DOOMLIT draft have been saved, and slot will be reserved for 15 minutes. If payment isn't completed by that period, project details will be removed.",
						},
					})
				}
			} catch (error) {
				request.log.error(error)
				return reply
					.code(500)
					.send({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to secure DOOMLIT reservation." } })
			}
		},
	)

	fastify.post(
		"/:referenceId/upload-urls",
		{
			schema: {
				params: z.object({ referenceId: z.string().length(12) }),
				body: z.object({ screenshotCount: z.number().int().min(0).max(DB_RULES.limitScreenshots) }),
			},
			preHandler: [fastify.authenticate],
		},
		async (request, reply) => {
			const { referenceId } = request.params
			const { screenshotCount } = request.body
			const profileId = request.user.id

			const [projectData] = await db
				.select({ status: projects.status, ownerId: projectLedger.profileId })
				.from(projects)
				.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
				.where(eq(projects.referenceId, referenceId))

			if (!projectData || projectData.ownerId !== profileId) {
				return reply.code(403).send({ success: false, error: "Unauthorized access" })
			}
			if (projectData.status !== "incomplete") {
				return reply.code(400).send({ success: false, error: "Project is not awaiting content." })
			}

			try {
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

				return reply.send({
					success: true,
					data: {
						cover: { uploadUrl: coverUploadUrl, path: coverKey },
						screenshots: screenshots,
					},
				})
			} catch (error) {
				request.log.error(error)
				return reply.code(500).send({ success: false, error: "Failed to generate upload URLs." })
			}
		},
	)

	fastify.patch(
		"/:referenceId",
		{
			schema: {
				params: z.object({
					referenceId: z.string().length(DB_RULES.lengthProjectRefId + DB_RULES.prefixProjectRefId.length),
				}),
				body: patchContentSchema,
			},
			preHandler: [fastify.authenticate],
		},
		async (request, reply) => {
			const { referenceId } = request.params
			const payload = request.body
			const profileId = request.user.id

			try {
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
					return reply.code(403).send({ success: false, error: "Unauthorized access" })
				} else if (projectData.status === "incomplete") {
					return reply.code(400).send({ success: false, error: "Project is not awaiting content." })
				}

				await db.update(projects).set(payload).where(eq(projects.id, projectData.id))
				return reply.code(200).send({ success: true, message: "Project details are updated." })
			} catch (error) {
				request.log.error(error)
				return reply.code(500).send({ success: false, error: "Failed to save project content." })
			}
		},
	)

	fastify.post(
		"/:referenceId/publish",
		{
			schema: {
				params: z.object({
					referenceId: z.string().length(DB_RULES.lengthProjectRefId + DB_RULES.prefixProjectRefId.length),
				}),
			},
			preHandler: [fastify.authenticate],
		},
		async (request, reply) => {
			const { referenceId } = request.params
			const profileId = request.user.id

			try {
				const result = await db.transaction(async (tx) => {
					const [projectData] = await tx
						.select()
						.from(projects)
						.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
						.where(eq(projects.referenceId, referenceId))

					if (!projectData || projectData.project_ledger.profileId !== profileId) {
						tx.rollback()
						return { error: "UNAUTHORIZED" as const }
					} else if (projectData.projects.status !== "incomplete") {
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
					return { success: true }
				})

				switch (result.error) {
					case "UNAUTHORIZED":
						return reply.code(403).send({ success: false, error: "Unauthorized access" })
					case "INVALID_STATE":
						return reply.code(400).send({ success: false, error: "Project is not awaiting content." })
					case "VALIDATION_FAILED":
						return reply.code(400).send({
							success: false,
							message: "Missing or invalid required fields.",
							errors: result.issues,
						})
					default:
						return reply.code(200).send({
							success: true,
							message: "Project is ready for showcase.",
						})
				}
			} catch (error) {
				request.log.error(error)
				return reply.code(500).send({ success: false, error: "Failed to publish project." })
			}
		},
	)
}
