import crypto from "node:crypto"

import { eq } from "drizzle-orm"
import { FastifyPluginAsync } from "fastify"
import fastifyRawBody from "fastify-raw-body"

import { db } from "../../db/index.js"
import { projectLedger, projects, receipts } from "../../db/schema.js"

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
	await fastify.register(fastifyRawBody, {
		field: "rawBody",
		global: false,
		encoding: "utf8",
		runFirst: true,
	})

	fastify.post(
		"/lemonsqueezy",
		{
			config: { rawBody: true },
		},
		async (request, reply) => {
			const secret = process.env.LEMONSQUEEZY_WEBHOOK_API_KEY
			const signature = request.headers["x-signature"] as string

			if (!secret || !signature || !request.rawBody) return reply.code(400).send("Missing signature or raw body.")

			const hmac = crypto.createHmac("sha256", secret)
			const digest = Buffer.from(hmac.update(request.rawBody).digest("hex"), "utf8")
			const signatureBuffer = Buffer.from(signature, "utf8")

			if (!crypto.timingSafeEqual(digest, signatureBuffer)) {
				fastify.log.warn("Invalid Lemon Squeezy signature detected.")
				return reply.code(401).send("Invalid signature")
			}

			let payload
			try {
				payload = JSON.parse(request.rawBody.toString())
			} catch (error) {
				return reply.code(400).send("Malformed JSON body: " + error)
			}

			const eventName = payload.meta.event_name

			if (eventName !== "order_created") return reply.code(200).send("Event ignored")

			const projectReferenceId = payload.meta.custom_data?.project_reference_id
			const priceCents = payload.data.attributes.total
			const transactionId = payload.data.id
			const receiptUrl = payload.data.attributes.urls.receipt

			if (!projectReferenceId) {
				fastify.log.error("An order has been created without DOOMLIT reference ID.")
				return reply.code(400).send("Missing custom_data.project_reference_id")
			}

			try {
				await db.transaction(async (tx) => {
					const [data] = await tx
						.select({
							project: projects,
							ledger: projectLedger,
						})
						.from(projects)
						.innerJoin(projectLedger, eq(projects.ledgerId, projectLedger.id))
						.where(eq(projects.referenceId, projectReferenceId))

					if (!data) {
						tx.rollback()
						throw new Error(`Project ${projectReferenceId} not found.`)
					}
					if (data.project.status !== "draft") {
						tx.rollback()
						throw new Error(`Project ${projectReferenceId} already processed or it's state is invalid.`)
					}

					await tx.update(projects).set({ status: "incomplete" }).where(eq(projects.id, data.project.id))

					await tx.insert(receipts).values({
						profileId: data.ledger.profileId,
						ledgerId: data.ledger.id,
						projectReferenceId: data.project.referenceId,
						showcaseDate: data.project.showcaseDate,
						priceCents: priceCents,
						provider: "lemon_squeezy",
						providerTransactionId: transactionId,
						receiptUrl: receiptUrl,
						status: "succeeded",
					})
				})

				fastify.log.info(`Succesfullt processed payment for DOOMLIT ${projectReferenceId}`)
				return reply.code(200).send("OK")
			} catch (error) {
				fastify.log.error(error)
				return reply.code(500).send("Webhook processing failed.")
			}
		},
	)
}
