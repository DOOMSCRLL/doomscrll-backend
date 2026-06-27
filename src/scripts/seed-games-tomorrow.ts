import "dotenv/config"
import { randomUUID } from "crypto"
import { db } from "../db/index.js"
import { profiles } from "../db/schemas/auth.js"
import { projectLedger, projects } from "../db/schemas/project.js"
import { DB_RULES } from "../config/index.js"

function generateRefId() {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	let result = DB_RULES.prefixProjectRefId
	for (let i = 0; i < DB_RULES.lengthProjectRefId; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

async function seedGamesTomorrow() {
	const now = new Date()

	const tomorrow = new Date(now)
	tomorrow.setDate(tomorrow.getDate() + 1)

	const nextDay = new Date(now)
	nextDay.setDate(nextDay.getDate() + 2)

	const targetDates = [tomorrow, nextDay]

	const allProfiles = await db.select({ id: profiles.id }).from(profiles)
	if (allProfiles.length === 0) {
		console.error("❌ No profiles found. Please run 'npm run db:seed' first to create users.")
		process.exit(1)
	}

	const totalLedgers = []
	const totalProjects = []

	const POOL_TAGS = [
		"#action",
		"#rpg",
		"#indie",
		"#multiplayer",
		"#strategy",
		"#open-source",
		"#tool",
		"#pixel-art",
		"#story-rich",
		"#co-op",
		"#puzzle",
		"#sandbox",
		"#adventure",
		"#casual",
		"#simulation",
		"#sports",
		"#racing",
		"#fighting",
		"#horror",
		"#survival",
	]

	for (const date of targetDates) {
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, "0")
		const day = String(date.getDate()).padStart(2, "0")
		const showcaseDateStr = `${year}-${month}-${day}`

		console.log(`🌱 Generating games for ${showcaseDateStr}`)

		const runId = Math.random().toString(36).substring(2, 6)
		const numProjects = 256 // Fixed 256 slots

		for (let i = 0; i < numProjects; i++) {
			const profile = allProfiles[Math.floor(Math.random() * allProfiles.length)]
			const ledgerId = randomUUID()
			const projectId = randomUUID()

			// ensure unique URL per project
			const primaryUrl = `https://mock-game-${runId}-${day}-${i}.com`

			const statuses = ["draft", "incomplete", "ready", "showcased", "canceled"] as const
			const status = statuses[Math.floor(Math.random() * statuses.length)]

			totalLedgers.push({
				id: ledgerId,
				profileId: profile.id,
				primaryUrl,
				lastShowcaseDate: showcaseDateStr,
			})

			const category = "Video Games"

			const numTags = Math.floor(Math.random() * 3) + 3 // 3 to 5 tags
			const projectTags = []
			const availableTags = [...POOL_TAGS]
			for (let t = 0; t < numTags; t++) {
				const tagIndex = Math.floor(Math.random() * availableTags.length)
				projectTags.push(availableTags[tagIndex])
				availableTags.splice(tagIndex, 1)
			}

			totalProjects.push({
				id: projectId,
				referenceId: generateRefId(),
				ledgerId,
				showcaseDate: showcaseDateStr,
				status,
				name: `Mock Game ${day}/${month} #${i}`,
				category,
				primaryPlatform: "Web",
				primaryUrl,
				description: "This is a mock game project generated for tomorrow/next day.",
				tags: projectTags,
			})
		}
	}

	console.log(`Prepared ${totalProjects.length} mock games in memory. Inserting...`)

	const CHUNK_SIZE = 2500
	try {
		for (let i = 0; i < totalLedgers.length; i += CHUNK_SIZE) {
			const chunk = totalLedgers.slice(i, i + CHUNK_SIZE)
			await db.insert(projectLedger).values(chunk)
			process.stdout.write(
				`\rInserted ledgers: ${Math.min(i + CHUNK_SIZE, totalLedgers.length)}/${totalLedgers.length}`,
			)
		}
		console.log("")

		for (let i = 0; i < totalProjects.length; i += CHUNK_SIZE) {
			const chunk = totalProjects.slice(i, i + CHUNK_SIZE)
			await db.insert(projects).values(chunk)
			process.stdout.write(
				`\rInserted projects: ${Math.min(i + CHUNK_SIZE, totalProjects.length)}/${totalProjects.length}`,
			)
		}
		console.log("\n✅ Games seeding complete.")
	} catch (e) {
		console.error("\n❌ Error during insertion:", e)
	}

	process.exit(0)
}

seedGamesTomorrow()
