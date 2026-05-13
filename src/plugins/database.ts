import fp from "fastify-plugin"

import { db } from "../db/index.js"

declare module "fastify" {
	export interface FastifyInstance {
		db: typeof db
	}
}

export default fp(async (fastify) => {
	fastify.decorate("db", db)
	fastify.log.info("Database decorator attached to Fastify instance.")
})
