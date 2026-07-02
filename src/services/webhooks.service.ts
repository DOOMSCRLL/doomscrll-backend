import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { projectLedger, projects, receipts } from "../db/schema.js"

export class WebhooksService {
	static async processLemonSqueezyWebhook(rawBody: string, signature: string, secret: string) {
		const hmac = crypto.createHmac("sha256", secret)
		const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8")
		const signatureBuffer = Buffer.from(signature, "utf8")

		if (digest.length !== signatureBuffer.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
			return { error: "INVALID_SIGNATURE" as const }
		}

		let payload
		try {
			payload = JSON.parse(rawBody)
		} catch (error) {
			return { error: "MALFORMED_JSON" as const, message: String(error) }
		}

		const eventName = payload.meta.event_name
		if (eventName !== "order_created") {
			return { success: true as const, message: "Event ignored" }
		}

		const projectReferenceId = payload.meta.custom_data?.project_reference_id
		const priceCents = payload.data.attributes.total
		const transactionId = payload.data.id
		const receiptUrl = payload.data.attributes.urls.receipt

		if (!projectReferenceId) {
			return { error: "MISSING_REFERENCE_ID" as const }
		}

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

			await tx
				.update(projectLedger)
				.set({ lastShowcaseDate: data.project.showcaseDate })
				.where(eq(projectLedger.id, data.ledger.id))

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

		return { success: true as const, projectReferenceId }
	}
}
