import fastifySchedule from "@fastify/schedule"
import { lt } from "drizzle-orm"
import fp from "fastify-plugin"
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler"

import { otpCodes, sessions } from "../db/schema.js"

export default fp(async (fastify) => {
	await fastify.register(fastifySchedule)

	const claenupTask = new AsyncTask(
		"clean-database",
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

	const job = new SimpleIntervalJob({ hours: 1, runImmediately: false }, claenupTask)
	//const job = new SimpleIntervalJob({ seconds: 10, runImmediately: true }, claenupTask)
	fastify.scheduler.addSimpleIntervalJob(job)
})
