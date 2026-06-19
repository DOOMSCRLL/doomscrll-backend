import fastifyCsrf from "@fastify/csrf-protection"
import fp from "fastify-plugin"

export default fp(async (fastify) => {
	await fastify.register(fastifyCsrf, {
		sessionPlugin: "@fastify/cookie",
		cookieOpts: {
			signed: true,
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
		},
	})
})
