import { and, count, eq, sql } from "drizzle-orm"
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { nanoid } from "nanoid"

import { DB_RULES } from "../../config/index.js"
import { db } from "../../db/index.js"
import { projectLedger, projects } from "../../db/schema.js"
import { reserveProjectSchema } from "./schemas.js"

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
							status: "draft_reserved",
						})
						.returning()

					return { success: true, project: newProject }
				})

				if (result.error === "SLOT_UNAVAILABLE") {
					return reply
						.code(409)
						.send({
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
}
