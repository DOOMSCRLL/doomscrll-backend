import { dirname, join } from "path"
import { fileURLToPath } from "url"

import AutoLoad, { AutoloadPluginOptions } from "@fastify/autoload"
import cors from "@fastify/cors"
import fastifyRateLimit from "@fastify/rate-limit"
import { FastifyPluginAsync, FastifyServerOptions, FastifyError } from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}
// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {}

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
	fastify.setValidatorCompiler(validatorCompiler)
	fastify.setSerializerCompiler(serializerCompiler)

	// rate is limited to; a max of 16 request per minute
	await fastify.register(fastifyRateLimit, {
		global: false,
		max: 16,
		timeWindow: "1 minute",
	})

	fastify.setErrorHandler((error: FastifyError, request, reply) => {
		let flattenedDetails: Record<string, any> | undefined = undefined

		if (error.validation && Array.isArray(error.validation)) {
			flattenedDetails = {}
			error.validation.forEach((issue: any) => {
				const path = issue.instancePath || (issue.path ? issue.path.join(".") : "unknown")
				if (flattenedDetails) {
					flattenedDetails[path] = issue.message
				}
			})
		} else if (error.validation) {
			flattenedDetails = { error: error.validation }
		}

		reply.status(error.statusCode || 500).send({
			success: false,
			error: {
				code: error.code || "INTERNAL_SERVER_ERROR",
				message: error.message || "Internal Server Error",
				details: flattenedDetails,
			},
		})
	})

	await fastify.register(cors, {
		origin: (origin, cb) => {
			// For mobile app requests, and server-to-server requests
			if (!origin) return cb(null, true)

			if (process.env.NODE_ENV === "development") {
				return cb(null, true)
			}

			const allowedOrigins = [
				"https://doomlit.doomscrll.com", // DOOMLIT reservation app
				"https://doomscrll.com", // Landing page
			]

			if (allowedOrigins.includes(origin)) {
				return cb(null, true)
			} else {
				console.log(`CORS error: request rejected for origin: ${origin}`)
				return cb(new Error("Request not allowed by CORS."), false)
			}
		},
		credentials: true,
	})

	// Do not touch the following lines

	// This loads all plugins defined in plugins
	// those should be support plugins that are reused
	// through your application
	void fastify.register(AutoLoad, {
		dir: join(__dirname, "plugins"),
		options: opts,
	})

	// This loads all plugins defined in routes
	// define your routes in one of these
	void fastify.register(AutoLoad, {
		dir: join(__dirname, "routes"),
		options: opts,
	})
}

export default app
export { app, options }
