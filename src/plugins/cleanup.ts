import { DeleteObjectsCommand } from "@aws-sdk/client-s3"
import fastifySchedule from "@fastify/schedule"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import fp from "fastify-plugin"
import { AsyncTask, CronJob, SimpleIntervalJob } from "toad-scheduler"

import { db } from "../db/index.js"
import { otpCodes, projects, sessions } from "../db/schema.js"
import { BUCKET_NAME, r2Client } from "../lib/r2.js"

export default fp(async (fastify) => {
	await fastify.register(fastifySchedule)

	const authArtifactCleanup = new AsyncTask(
		"clean-auth-artifacts",
		async () => {
			fastify.log.info("Running database cleanup job.")

			const now = new Date()
			try {
				const deletedOtps = await db.delete(otpCodes).where(lt(otpCodes.expiresAt, now)).returning({ id: otpCodes.id })

				const deletedSessions = await db
					.delete(sessions)
					.where(lt(sessions.expiresAt, now))
					.returning({ id: sessions.id })

				if (deletedOtps.length > 0) {
					fastify.log.info("Cleanup complete: Removed " + deletedOtps.length + " OTPs.")
				}
				if (deletedSessions.length > 0) {
					fastify.log.info("Cleanup complete: Removed " + deletedSessions.length + " expired sessions.")
				}
			} catch (error) {
				fastify.log.error({ error }, "Database cleanup failed.")
			}
		},
		(error) => {
			fastify.log.error({ error }, "Task execution failed.")
		},
	)

	const authArtifactCleanupJob = new SimpleIntervalJob({ hours: 1, runImmediately: false }, authArtifactCleanup)
	//const authArtifactCleanupJob = new SimpleIntervalJob({ seconds: 10, runImmediately: true }, claenupTask)
	fastify.scheduler.addSimpleIntervalJob(authArtifactCleanupJob)

	const expiredDraftCleanup = new AsyncTask(
		"clean-expired-drafts",
		async () => {
			try {
				const deletedDrafts = await db
					.delete(projects)
					.where(and(eq(projects.status, "draft"), sql`${projects.reservedAt} < NOW() - INTERVAL '15 minutes'`))
					.returning({ id: projects.referenceId })

				if (deletedDrafts.length > 0) {
					fastify.log.info(`Cleanup complete: Removed ${deletedDrafts.length} expired drafts.`)
				}
			} catch (error) {
				fastify.log.error({ error }, "Expired draft cleanup failed.")
			}
		},
		(error) => {
			fastify.log.error({ error }, "Expired draft cleanup task execution failed.")
		},
	)

	const expiredDraftCleanupJob = new SimpleIntervalJob({ minutes: 1, runImmediately: true }, expiredDraftCleanup)
	fastify.scheduler.addSimpleIntervalJob(expiredDraftCleanupJob)

	const dailyResetCleanup = new AsyncTask("clean-daily-reset", async () => {
		const todayUtc = new Date().toISOString().split("T")[0]

		try {
			const expiredProjects = await db
				.select({
					id: projects.id,
					coverImagePath: projects.coverImagePath,
					screenshotPaths: projects.screenshotPaths,
				})
				.from(projects)
				.where(lt(projects.showcaseDate, todayUtc))

			if (expiredProjects.length === 0) {
				fastify.log.info("Daily reset cleanup: No projects were deleted.")
				return
			}

			const keysToDelete: { Key: string }[] = []
			for (const p of expiredProjects) {
				if (p.coverImagePath) keysToDelete.push({ Key: p.coverImagePath })
				if (p.screenshotPaths && p.screenshotPaths.length > 0) {
					p.screenshotPaths.forEach((path) => keysToDelete.push({ Key: path }))
				}
			}

			if (keysToDelete.length > 0) {
				const chunkSize = 1000
				for (let i = 0; i < keysToDelete.length; i += chunkSize) {
					const chunk = keysToDelete.slice(i, i + chunkSize)
					await r2Client.send(
						new DeleteObjectsCommand({
							Bucket: BUCKET_NAME,
							Delete: { Objects: chunk, Quiet: true },
						}),
					)
				}
			}

			const expiredIds = expiredProjects.map((p) => p.id)
			await db.delete(projects).where(inArray(projects.id, expiredIds))

			fastify.log.info(
				`Daily reset cleanup completed. Deleted ${expiredProjects.length} projects, and ${keysToDelete.length} assets.`,
			)
		} catch (error) {
			fastify.log.error(error, "Daily reset cleanup failed:")
		}
	})

	const dailyResetCleanupJob = new CronJob({ cronExpression: "0 0 * * *", timezone: "UTC" }, dailyResetCleanup)
	fastify.scheduler.addCronJob(dailyResetCleanupJob)
	fastify.addHook("onClose", (instance, done) => {
		instance.scheduler.stop()
		done()
	})
})
