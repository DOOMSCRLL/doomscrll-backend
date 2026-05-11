import crypto from "crypto"

import Plunk from "@plunk/node"
import { and, eq, gt } from "drizzle-orm"
import { FastifyPluginAsync } from "fastify"
import { z } from "zod"

import { otpCodes, profiles, sessions } from "../../db/schema"

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

	const verifySchema = z.object({
		email: z.email("Invalid email format."),
		code: z.string().length(6, "Code must be exactly 6 digits."),
	})

	fastify.post("/verify", async (request, reply) => {
		const parsed = verifySchema.safeParse(request.body)
		if (!parsed.success) {
			return reply.code(400).send({ error: parsed.error.issues[0].message })
		}

		const { email, code } = parsed.data
		const inputHash = crypto.createHash("sha256").update(code).digest("hex")

		const [validOtp] = await fastify.db
			.select()
			.from(otpCodes)
			.where(and(eq(otpCodes.email, email), eq(otpCodes.codeHash, inputHash), gt(otpCodes.expiresAt, new Date())))
			.limit(1)

		if (!validOtp) {
			return reply.code(401).send({ error: "Invalid or expired code." })
		}

		await fastify.db.delete(otpCodes).where(eq(otpCodes.id, validOtp.id))

		let [user] = await fastify.db.select().from(profiles).where(eq(profiles.email, email)).limit(1)

		if (!user) {
			const baseName = email
				.split("@")[0]
				.replace(/[^a-zA-Z0-9]/g, "")
				.toLowerCase()
			const randomSuffix = crypto.randomBytes(3).toString("hex")
			const generatedUserName = `${baseName}_${randomSuffix}`

			;[user] = await fastify.db.insert(profiles).values({ email: email, username: generatedUserName }).returning()
		}

		const sessionId = crypto.randomBytes(32).toString("hex")
		const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

		await fastify.db.insert(sessions).values({
			id: sessionId,
			profileId: user.id,
			expiresAt: sessionExpiry,
		})

		reply.setCookie("session_id", sessionId, {
			path: "/",
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			expires: sessionExpiry,
		})

		return reply.send({ success: true, message: "Welcome to DOOMSCRLL." })
	})
}

export default authRoutes
