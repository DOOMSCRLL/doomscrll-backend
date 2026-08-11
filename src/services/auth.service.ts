import PlunkModule from "@plunk/node"
import { and, eq, gt } from "drizzle-orm"
import crypto from "node:crypto"
import { db } from "../db/index.js"
import { otpCodes, profiles, sessions } from "../db/schema.js"

const Plunk = PlunkModule.default || PlunkModule

export class AuthService {
	static async requestOtp(email: string, isDev = false): Promise<void> {
		const plainOtp = crypto.randomInt(100000, 999999).toString()
		const hash = crypto.createHash("sha256").update(plainOtp).digest("hex")
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

		await db.insert(otpCodes).values({
			email,
			codeHash: hash,
			expiresAt,
		})

		if (isDev) {
			console.log(`\n****************`)
			console.log(`\tEMAIL OTP FOR ${email}: ${plainOtp}`)
			console.log(`****************\n`)
		} else {
			const plunkApiKey = process.env.PLUNK_API_KEY || ""
			const plunk = new Plunk(plunkApiKey, { baseUrl: "https://next-api.useplunk.com/v1/" })
			try {
				await plunk.emails.send({
					to: email,
					subject: "Your DOOMSCRLL login code",
					body: `<h1>Welcome to DOOMSCRLL</h1><p>Your secure sign-in code is: <strong>${plainOtp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
					from: "hello@doomscrll.com",
				})
			} catch (err) {
				const maskedKey = plunkApiKey ? `${plunkApiKey.substring(0, 7)}...` : "NONE"
				console.error(`Plunk email dispatch failed for ${email} using key [${maskedKey}]:`, err)
				throw err
			}
		}
	}

	static async verifyOtp(email: string, code: string): Promise<string | null> {
		const inputHash = crypto.createHash("sha256").update(code).digest("hex")

		const [validOtp] = await db
			.select()
			.from(otpCodes)
			.where(and(eq(otpCodes.email, email), eq(otpCodes.codeHash, inputHash), gt(otpCodes.expiresAt, new Date())))
			.limit(1)

		if (!validOtp) {
			return null
		}

		await db.delete(otpCodes).where(eq(otpCodes.id, validOtp.id))

		let [user] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1)

		if (!user) {
			const baseName = email
				.split("@")[0]
				.replace(/[^a-zA-Z0-9]/g, "")
				.toLowerCase()
			const randomSuffix = crypto.randomBytes(3).toString("hex")
			const generatedUserName = `${baseName}_${randomSuffix}`

			;[user] = await db.insert(profiles).values({ email: email, username: generatedUserName }).returning()
		}

		const sessionId = crypto.randomBytes(32).toString("hex")
		const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

		await db.insert(sessions).values({
			id: sessionId,
			profileId: user.id,
			expiresAt: sessionExpiry,
		})

		return sessionId
	}

	static async logout(sessionId: string): Promise<void> {
		if (sessionId) {
			await db.delete(sessions).where(eq(sessions.id, sessionId))
		}
	}
}
