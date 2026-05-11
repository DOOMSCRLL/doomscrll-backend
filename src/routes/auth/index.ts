import crypto from "crypto"

import Plunk from "@plunk/node"
import { FastifyPluginAsync } from "fastify"
import { z } from "zod"

import { otpCodes } from "../../db/schema"

const plunk = new Plunk(process.env.PLUNK_API_KEY || "dev-key")

const authRoutes: FastifyPluginAsync = async (fastify) => {
	const requestSchema = z.object({
		email: z.email("Please provide a valid email address."),
	})

	fastify.post("/request", async (request, reply) => {
		const parsed = requestSchema.safeParse(request.body)
		if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message })

		const { email } = parsed.data

		const plainOtp = crypto.randomInt(100000, 999999).toString()
		const hash = crypto.createHash("sha256").update(plainOtp).digest("hex")

		const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

		await fastify.db.insert(otpCodes).values({
			email,
			codeHash: hash,
			expiresAt,
		})

		if (process.env.NODE_ENV === "development") {
			fastify.log.info(`\n****************`)
			fastify.log.info(`\tEMAIL OTP FOR ${email}: ${plainOtp}`)
			fastify.log.info(`****************\n`)
		} else {
			await plunk.emails.send({
				to: email,
				subject: "Your DOOMSCRLL login code",
				body: `<h1>Welcome to DOOMSCRLL</h1><p>Your secure sign-in code is: <strong>${plainOtp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
			})
		}

		return reply.send({
			success: true,
			message: "If the email is valid, a code was sent.",
		})
	})
}

export default authRoutes
