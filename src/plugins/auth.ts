import { eq } from "drizzle-orm"
import { FastifyReply, FastifyRequest } from "fastify"
import fp from "fastify-plugin"

import { profiles, sessions } from "../db/schema.js"

declare module "fastify" {
	interface FastifyInstance {
		authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
	}

	interface FastifyRequest {
		user: typeof profiles.$inferSelect
	}
}

export default fp(async (fastify) => {
	fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const sessionId = request.cookies.session_id
			if (!sessionId) return reply.code(401).send({ error: "Unauthorized: No session cookie found." })

			const [result] = await fastify.db
				.select({
					session: sessions,
					profile: profiles,
				})
				.from(sessions)
				.innerJoin(profiles, eq(sessions.profileId, profiles.id))
				.where(eq(sessions.id, sessionId))
				.limit(1)

			if (!result || result.session.expiresAt < new Date()) {
				reply.clearCookie("session_id", { path: "/" })
				return reply.code(401).send({ error: "Unauthorized: Session expired or invalid." })
			}

			request.user = result.profile
		} catch (err) {
			request.log.error(err)
			return reply.code(500).send({ error: "Internal server error during authentication." })
		}
	})
})
