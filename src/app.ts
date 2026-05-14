import { dirname, join } from "path"
import { fileURLToPath } from "url"

import AutoLoad, { AutoloadPluginOptions } from "@fastify/autoload"
import cors from "@fastify/cors"
import fastifyRateLimit from "@fastify/rate-limit"
import { FastifyPluginAsync, FastifyServerOptions } from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}
// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {}

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
	fastify.setValidatorCompiler(validatorCompiler)
	fastify.setSerializerCompiler(serializerCompiler)

	await fastify.register(fastifyRateLimit, {
		global: false,
		max: 16,
		timeWindow: "1 minute",
	})

	await fastify.register(cors, {
		origin: (origin, cb) => {
			// For mobile app requests, and server-to-server requests
			if (!origin) return cb(null, true)

			const allowedOrigins = [
				"http://localhost:5173", // Svelte dev localhost
				"http://127.0.0.1:5173", // Svelte dev public IP
				"https://doomlit.doomscrll.com", // DOOMLIT reservation app
				"https://doomscrll.com", // Landing page
			]

			if (allowedOrigins.includes(origin)) return cb(null, true)
			else return cb(new Error("Request not allowed by CORS."), false)
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
