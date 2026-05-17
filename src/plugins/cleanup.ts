import fastifySchedule from "@fastify/schedule"
import { and, eq, lt, sql } from "drizzle-orm"
import fp from "fastify-plugin"
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler"

import { otpCodes, projects, sessions } from "../db/schema.js"

export default fp(async (fastify) => {
	await fastify.register(fastifySchedule)

	const authArtifactCleanup = new AsyncTask(
		"clean-auth-artifacts",
		async () => {
			fastify.log.info("Running database cleanup job.")

			const now = new Date()
			try {
				const deletedOtps = await fastify.db
					.delete(otpCodes)
					.where(lt(otpCodes.expiresAt, now))
					.returning({ id: otpCodes.id })

				const deletedSessions = await fastify.db
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
				const deletedDrafts = await fastify.db
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
})
