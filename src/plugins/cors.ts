import cors from "@fastify/cors"
import fp from "fastify-plugin"

export default fp(async (fastify) => {
	await fastify.register(cors, {
		origin: [
			"https://doomlit.doomscrll.com",
			"https://doomscrll.com",
			"http://localhost:5173", // FIXME: Delete on prod.
		],
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	})
})
