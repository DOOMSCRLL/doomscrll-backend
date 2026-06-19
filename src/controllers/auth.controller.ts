import { FastifyRequest, FastifyReply } from "fastify"
import { AuthService } from "../services/auth.service.js"

export class AuthController {
	static async requestOtp(request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) {
		const { email } = request.body
		try {
			await AuthService.requestOtp(email, process.env.NODE_ENV === "development")
			return reply.send({
				success: true,
				message: "If the email is valid, a code was sent.",
			})
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Internal Server Error" })
		}
	}

	static async verifyOtp(request: FastifyRequest<{ Body: { email: string; code: string } }>, reply: FastifyReply) {
		const { email, code } = request.body
		try {
			const sessionId = await AuthService.verifyOtp(email, code)
			if (!sessionId) {
				return reply.code(401).send({ error: "Invalid or expired code." })
			}

			const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
			reply.setCookie("session_id", sessionId, {
				path: "/",
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
				expires: sessionExpiry,
			})

			const csrfToken = await reply.generateCsrf()
			return reply.send({ success: true, message: "Welcome to DOOMSCRLL.", csrfToken })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Internal Server Error" })
		}
	}

	static async logout(request: FastifyRequest, reply: FastifyReply) {
		const sessionId = request.cookies.session_id
		try {
			if (sessionId) {
				await AuthService.logout(sessionId)
			}
			reply.clearCookie("session_id", {
				path: "/",
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "lax",
			})
			return reply.send({ success: true, message: "Logged out successfully." })
		} catch (error) {
			request.log.error(error)
			return reply.code(500).send({ success: false, error: "Internal Server Error" })
		}
	}

	static async getCsrfToken(request: FastifyRequest, reply: FastifyReply) {
		const token = await reply.generateCsrf()
		return reply.send({ success: true, csrfToken: token })
	}
}
